// timeline.js — slide-based virtual scroll with parallax.
// Each project becomes one hero slide + one slide per work topic.
// Every wheel click / arrow / swipe commits to the next slide. Inspired by
// mobile-product marketing pages (e.g. apple.com/iphone): one focused concept
// per viewport, layered parallax, no overflow scrollbars.

import { prefersReducedMotion } from './scripts.js';

export function initTimeline(projects) {
    // Chronological order matters: this is a "time machine" with a monotonic
    // progress bar. Following raw projects.json order previously produced
    // 2018 → 2021 → 2016 → 2017 → 2022. ISO "YYYY-MM" sorts lexically.
    const timelineProjects = projects
        .filter(p => p.showInTimeline)
        .sort((a, b) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
    if (!timelineProjects.length) return;

    const REDUCED = prefersReducedMotion();

    // ── Flatten into slide list ────────────────────────────────────────────────
    // Each project → 1 hero + N topic slides.
    // dateFrac (0..1) drives the time-machine date across the project's span.
    const slideData = [];
    timelineProjects.forEach(project => {
        const projectSlides = [];
        projectSlides.push({ type: 'hero', project });
        (project.workTopics || []).forEach((topic, ti) => {
            projectSlides.push({ type: 'topic', project, topic, topicIdx: ti });
        });
        const count = projectSlides.length;
        projectSlides.forEach((s, li) => {
            s.localIdx        = li;
            s.slidesInProject = count;
            s.dateFrac        = count > 1 ? li / (count - 1) : 0;
        });
        slideData.push(...projectSlides);
    });
    const N = slideData.length;

    // Tunables
    const TOUCH_SENS              = 0.0055;
    const LERP_RATE               = 0.18;  // ~95% catch-up in ~280ms — snappy but readable
    const WHEEL_SESSION_GAP_MS    = 90;    // Events closer than this = same physical input
    const WHEEL_COOLDOWN_MS       = 320;   // Min interval between committed steps
    const WHEEL_MIN_DELTA         = 4;     // Filter noise events smaller than this
    const TOUCH_RELEASE_BIAS      = 0.18;  // Directional commit threshold on touch release
    const FADE                    = 0.32;  // Crossfade fraction on each side of a slide boundary
    const EXIT_OVER               = 0.55;
    const REVEAL_START_MS         = 120;   // Wait after slide arrival before first bullet
    const REVEAL_STAGGER_MS       = 130;   // Stagger between consecutive bullets

    // Warp jump (portfolio card → timeline)
    const WARP_IMMERSIVE          = 1.6;   // Cruising warp while in the timeline
    const WARP_JUMP               = 9;     // Lightspeed burst during the jump
    const FLY_FADE_MS             = 320;   // Page fade-out before we switch
    const FLY_WARP_MS             = 430;   // Time spent at lightspeed
    const ARRIVE_MS               = 640;   // Bloom + settle on landing

    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    // Overall span covered by the timeline, used to drive the progress bar.
    const msOf = (s, fallback) => {
        const [y, m] = String(s || '').split('-').map(Number);
        return y ? new Date(y, (m || 1) - 1, 1).getTime() : fallback;
    };
    // An ongoing role has no endDate — it runs to today.
    const NOW_MS = Date.now();
    const endMsOf = p => msOf(p.endDate, NOW_MS);
    const TIMELINE_START = Math.min(...timelineProjects.map(p => msOf(p.startDate, Infinity)));
    const TIMELINE_END   = Math.max(...timelineProjects.map(endMsOf));

    const S = {
        immersive:        false,
        virtualPos:       0,
        targetPos:        0,
        activeProjIdx:    -1,
        focusSlideIdx:    -1,
        focusArrivedTs:   0,
        lastScrollDir:    0,
        lastTs:           0,
        lastExitTs:       0,
        lastWheelStepTs:  0,
        lastWheelEventTs: 0,
        touchActive:      false,
        flying:           false,   // a warp jump is in progress
        returnFocus:      null,    // element to refocus when leaving the timeline
        arriveTimer:      0,
        touchStartY:      0,
        touchStartPos:    0,
        rafId:            0,
        slides:           [],
        dots:             [],
    };

    const els = {
        cvSection: document.getElementById('cvSection'),
        stage:     document.getElementById('projectStage'),
        tmYear:    document.getElementById('tmYear'),
        tmMonth:   document.getElementById('tmMonth'),
        tmFill:    document.getElementById('tmProgressFill'),
        navEl:     document.getElementById('cvProjectNav'),
        announce:  document.getElementById('cvAnnounce'),
        enterBtn:  document.getElementById('cvEnter'),
    };

    if (!els.cvSection || !els.stage) {
        console.warn('[timeline] Required elements not found.');
        return;
    }

    buildSlides();
    buildNavDots();
    installEnterTriggers();
    installKeyboard();
    installExitButton();
    listenPortfolioSelect();
    startRAF();

    // ── Build DOM ──────────────────────────────────────────────────────────────

    function buildSlides() {
        els.stage.innerHTML = '';
        S.slides = [];

        slideData.forEach((data, i) => {
            const el = document.createElement('div');
            el.className = `project-slide slide-${data.type}`;
            el.dataset.idx = i;

            if (data.type === 'hero') buildHeroSlide(el, data.project);
            else                      buildTopicSlide(el, data.project, data.topic);

            // Screen readers: each slide is a labelled group; only the focused
            // one is reachable (render() lifts `inert` from it). Without this,
            // Tab walked into the links of all 15 invisible slides.
            data.label = data.type === 'hero'
                ? data.project.title
                : `${data.project.title} — ${data.topic.title}`;
            el.setAttribute('role', 'group');
            el.setAttribute('aria-roledescription', 'slide');
            el.setAttribute('aria-label', `${i + 1} of ${slideData.length}: ${data.label}`);
            el.inert = true;

            els.stage.appendChild(el);
            S.slides.push({ el, data });
        });
    }

    function buildHeroSlide(el, project) {
        // Full-bleed background layer (parallax)
        const bg = document.createElement('div');
        bg.className = 'slide-bg';
        if (project.video && !REDUCED && !isDataSaver()) {
            const v = document.createElement('video');
            v.className = 'slide-bg-video';
            // Deliberately NOT setting .src here — assigning it up front made
            // every slide fetch the video on page load (6 elements → 12
            // requests for the same file). ensureVideoLoaded() attaches the
            // source only when a slide is actually approached.
            v.dataset.src = project.video;
            v.preload = 'none';
            v.muted = true; v.loop = true; v.playsInline = true;
            if (project.poster || project.image) v.poster = project.poster || project.image;
            bg.appendChild(v);
        } else if (project.image) {
            const img = document.createElement('div');
            img.className = 'slide-bg-image';
            img.style.backgroundImage = `url('${project.image}')`;
            bg.appendChild(img);
        }
        el.appendChild(bg);

        // Darkening gradient overlay so text stays legible
        const overlay = document.createElement('div');
        overlay.className = 'slide-overlay';
        el.appendChild(overlay);

        // Foreground content (parallax — moves faster than bg)
        const content = document.createElement('div');
        content.className = 'slide-content slide-content-hero';
        const linksHtml = (project.links || [])
            .map(l => `<a class="slide-link" href="${l.href}" target="_blank" rel="noopener noreferrer">${l.text} &#8599;</a>`)
            .join('');
        // `details` is a free-form key/value map — render whatever keys the
        // project defines, in author order, as a compact fact list.
        const factsHtml = Object.entries(project.details || {})
            .map(([k, v]) => `<div class="slide-fact"><dt>${k}</dt><dd>${v}</dd></div>`)
            .join('');
        content.innerHTML = `
            <p class="slide-eyebrow">${formatProjectDates(project)}</p>
            <h2 class="slide-title">${project.title}</h2>
            ${project.subtitle ? `<p class="slide-subtitle">${project.subtitle}</p>` : ''}
            <p class="slide-desc">${project.timelineDescription || project.description || ''}</p>
            ${factsHtml ? `<dl class="slide-facts">${factsHtml}</dl>` : ''}
            ${linksHtml ? `<div class="slide-links">${linksHtml}</div>` : ''}
        `;
        el.appendChild(content);
    }

    function buildTopicSlide(el, project, topic) {
        const content = document.createElement('div');
        content.className = 'slide-content slide-content-topic';
        const imgHtml = topic.image
            ? `<div class="topic-image-section"><img src="${topic.image}" alt="${topic.title}" class="topic-image" loading="lazy"></div>`
            : '<div class="topic-image-section topic-image-empty"></div>';
        const bullets = (topic.highlights || []).map(h => `<li>${h}</li>`).join('');
        content.innerHTML = `
            ${imgHtml}
            <div class="topic-text-section">
                <p class="topic-eyebrow">${project.title}</p>
                <h3 class="topic-title">${topic.title}</h3>
                <p class="topic-desc">${topic.description}</p>
                ${bullets ? `<ul class="topic-highlights">${bullets}</ul>` : ''}
            </div>
        `;
        el.appendChild(content);
    }

    function isDataSaver() {
        const c = navigator.connection;
        return !!c?.saveData || /(^|-)2g$/.test(c?.effectiveType || '');
    }

    // Attach the real source the first time a slide comes into play, so the
    // video is fetched on demand rather than all at once on page load.
    function ensureVideoLoaded(video) {
        if (!video || !video.dataset.src) return;
        video.src = video.dataset.src;
        delete video.dataset.src;
        video.preload = 'auto';
        video.load();
    }

    // Tolerates missing/partial dates rather than throwing on `.split` of
    // undefined; an absent endDate reads as an ongoing role.
    function fmtMonth(s) {
        if (typeof s !== 'string') return null;
        const [y, m] = s.split('-').map(Number);
        if (!y) return null;
        return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : `${y}`;
    }

    function formatProjectDates(p) {
        const start = fmtMonth(p.startDate);
        const end = fmtMonth(p.endDate);
        if (!start && !end) return '';
        if (!start) return end;
        return `${start} — ${end || 'PRESENT'}`;
    }

    function buildNavDots() {
        if (!els.navEl) return;
        els.navEl.innerHTML = '';
        S.dots = [];
        timelineProjects.forEach((project) => {
            const dot = document.createElement('button');
            dot.className = 'nav-dot';
            dot.type = 'button';
            dot.setAttribute('aria-label', project.title);
            // data-label, not title: `title` would raise the browser's native
            // tooltip on top of the styled ::after one.
            dot.dataset.label = project.title;
            dot.addEventListener('click', () => {
                const heroIdx = slideData.findIndex(s => s.type === 'hero' && s.project === project);
                if (heroIdx < 0) return;
                S.targetPos     = heroIdx;
                S.lastScrollDir = heroIdx > S.virtualPos ? 1 : -1;
                if (!S.immersive) enterImmersive();
            });
            els.navEl.appendChild(dot);
            S.dots.push(dot);
        });
    }

    // ── Entry / Exit ───────────────────────────────────────────────────────────

    // Entry is EXPLICIT only.
    //
    // This used to be an IntersectionObserver that flipped into immersive mode
    // as soon as the CV section covered half the viewport. That meant anyone
    // scrolling down the page got their scrolling taken away without asking for
    // it — the single most hostile thing the site did. Now it takes a deliberate
    // action: the section's own button, the CV nav link, or a portfolio card.
    function installEnterTriggers() {
        const enterBtn = document.getElementById('cvEnter');
        if (enterBtn) enterBtn.addEventListener('click', () => flyToProject(0));

        // The CV nav link is itself an explicit request for the timeline.
        document.querySelectorAll('[data-scroll-to="cv"]').forEach(a => {
            a.addEventListener('click', () => {
                // Let the smooth-scroll in scripts.js start first so exiting
                // later returns to a sensible place.
                setTimeout(() => { if (!S.immersive) flyToProject(0); }, 120);
            });
        });
    }

    function enterImmersive({ silent = false } = {}) {
        if (S.immersive) return;

        const rect = els.cvSection.getBoundingClientRect();
        const centerTarget = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
        window.scrollTo({ top: Math.max(0, centerTarget), behavior: 'auto' });

        S.immersive     = true;
        S.lastScrollDir = 0;
        // Keyboard and screen-reader users land inside the timeline, and go
        // back to whatever opened it on exit (button, nav link, card, dot).
        S.returnFocus = document.activeElement !== document.body ? document.activeElement : null;
        S.focusSlideIdx = -1;   // re-announce and un-inert on the next render
        document.body.classList.add('timeline-immersive');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        S.virtualPos = Math.max(0, Math.min(N - 1, Math.round(S.virtualPos)));
        S.targetPos  = S.virtualPos;

        bindVirtualScroll();
        els.stage.focus({ preventScroll: true });
        // `silent` during a warp jump — flyToProject() owns the warp level
        // there and must not have it overwritten mid-burst.
        if (!REDUCED && !silent) setWarp(WARP_IMMERSIVE);
    }

    function exitImmersive(direction) {
        if (!S.immersive) return;
        S.immersive = false;
        // A jump could still be mid-flight (e.g. Escape during the burst) —
        // clear its classes so the page isn't left faded out or mid-bloom.
        S.flying = false;
        clearTimeout(S.arriveTimer);
        document.body.classList.remove('timeline-warping', 'timeline-arriving');

        S.slides.forEach(({ el }) => {
            el.style.opacity       = '0';
            el.style.pointerEvents = 'none';
            const v = el.querySelector('video');
            if (v) v.pause();
            el.querySelectorAll('.topic-highlights li').forEach(li => li.classList.remove('highlight-visible'));
        });

        let scrollDest = 0;
        if (els.cvSection) {
            const rect    = els.cvSection.getBoundingClientRect();
            const pageTop = window.scrollY + rect.top;
            scrollDest = direction === 'top'
                ? Math.max(0, pageTop - window.innerHeight - 80)
                : pageTop + els.cvSection.offsetHeight + 80;
        }

        document.body.classList.remove('timeline-immersive');
        unbindVirtualScroll();
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        window.scrollTo({ top: scrollDest, behavior: 'auto' });

        S.lastExitTs = performance.now();
        setWarp(1.0);

        S.slides.forEach(({ el }) => { el.inert = true; });
        if (els.announce) els.announce.textContent = '';
        restoreFocus();
    }

    // The page sections come back from visibility:hidden through a CSS
    // transition, so the opener only becomes focusable a frame or two later.
    // If it still can't take focus (gone, or a link in the closed mobile
    // menu), the section's own button can.
    function restoreFocus() {
        const t = S.returnFocus;
        S.returnFocus = null;
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (S.immersive) return;            // re-entered in the meantime
            if (t?.isConnected) t.focus({ preventScroll: true });
            if (document.activeElement !== t) els.enterBtn?.focus({ preventScroll: true });
        }));
    }

    // ── Virtual Scroll ─────────────────────────────────────────────────────────

    function bindVirtualScroll() {
        window.addEventListener('wheel',       onWheel,      { passive: false });
        window.addEventListener('touchstart',  onTouchStart, { passive: false });
        window.addEventListener('touchmove',   onTouchMove,  { passive: false });
        window.addEventListener('touchend',    onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);
    }

    function unbindVirtualScroll() {
        window.removeEventListener('wheel',       onWheel,      { passive: false });
        window.removeEventListener('touchstart',  onTouchStart, { passive: false });
        window.removeEventListener('touchmove',   onTouchMove,  { passive: false });
        window.removeEventListener('touchend',    onTouchEnd);
        window.removeEventListener('touchcancel', onTouchEnd);
    }

    // Wheel: each gesture commits ONE discrete slide step.
    //
    // Two defences against multi-step skips per physical click:
    //   1. Session gap — Chrome/Edge often decompose a single wheel click into
    //      multiple smaller events spanning 100–300ms (smooth-scroll); we only
    //      commit on the first event of a burst and ignore the rest.
    //   2. Hard cooldown — even if a "new session" sneaks past, a min interval
    //      between commits caps the rate.
    // Target is always an integer — no fractional drift after release.
    function onWheel(e) {
        if (!S.immersive) return;
        e.preventDefault();
        if (S.flying) return;   // don't let input fight a warp jump
        if (Math.abs(e.deltaY) < WHEEL_MIN_DELTA) return;

        const now = performance.now();
        const gapSinceLastEvent = now - S.lastWheelEventTs;
        S.lastWheelEventTs = now;

        // Continuous input (smooth-scroll fragments, inertia) — already counted
        if (gapSinceLastEvent < WHEEL_SESSION_GAP_MS) return;
        // Hard floor between distinct commits
        if (now - S.lastWheelStepTs < WHEEL_COOLDOWN_MS)  return;

        const dir = Math.sign(e.deltaY);
        // Step from the LOGICAL position (current target), not visual position —
        // chained clicks during the lerp animation cleanly stack.
        S.targetPos       = Math.round(S.targetPos) + dir;
        S.lastScrollDir   = dir;
        S.lastWheelStepTs = now;
        checkBoundaryExit();
    }

    // Touch: continuous drag follows the finger, snap on release.
    function onTouchStart(e) {
        if (!S.immersive || S.flying || !e.touches?.length) return;
        S.touchStartY   = e.touches[0].clientY;
        S.touchStartPos = S.virtualPos;
        S.touchActive   = true;
    }

    function onTouchMove(e) {
        if (!S.immersive || !S.touchActive || !e.touches?.length) return;
        e.preventDefault();
        const dy = S.touchStartY - e.touches[0].clientY;
        S.targetPos = S.touchStartPos + dy * TOUCH_SENS;
        if (Math.abs(dy) > 5) S.lastScrollDir = Math.sign(dy);
        checkBoundaryExit();
    }

    function onTouchEnd() {
        if (!S.touchActive) return;
        S.touchActive = false;

        // Directional snap: if you've dragged past the bias threshold in a
        // direction, commit to the next slide that way. Otherwise round.
        const floor = Math.floor(S.virtualPos);
        const frac  = S.virtualPos - floor;
        let snapped;
        if (S.lastScrollDir > 0 && frac >= TOUCH_RELEASE_BIAS)
            snapped = floor + 1;
        else if (S.lastScrollDir < 0 && frac <= 1 - TOUCH_RELEASE_BIAS)
            snapped = floor;
        else
            snapped = Math.round(S.virtualPos);
        S.targetPos = Math.max(0, Math.min(N - 1, snapped));
    }

    function checkBoundaryExit() {
        if (S.targetPos < -EXIT_OVER)              exitImmersive('top');
        else if (S.targetPos > N - 1 + EXIT_OVER)  exitImmersive('bottom');
    }

    // ── Keyboard ───────────────────────────────────────────────────────────────

    function installKeyboard() {
        window.addEventListener('keydown', e => {
            if (!S.immersive) return;
            // Escape must still work mid-jump; everything else waits.
            if (S.flying && e.key !== 'Escape') return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
                e.preventDefault();
                S.targetPos     = Math.min(N - 1, Math.round(S.targetPos) + 1);
                S.lastScrollDir = 1;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                S.targetPos     = Math.max(0, Math.round(S.targetPos) - 1);
                S.lastScrollDir = -1;
            } else if (e.key === 'Home') {
                e.preventDefault();
                S.targetPos = 0; S.lastScrollDir = -1;
            } else if (e.key === 'End') {
                e.preventDefault();
                S.targetPos = N - 1; S.lastScrollDir = 1;
            } else if (e.key === 'Escape') {
                exitImmersive('top');
            }
        });
    }

    // ── Exit affordance ────────────────────────────────────────────────────────
    // Immersive mode hides the header and locks scroll. Escape handles desktop,
    // but touch users previously had no way out except swiping every slide.

    function installExitButton() {
        const btn = document.getElementById('cvExit');
        if (!btn) return;
        btn.addEventListener('click', () => exitImmersive('top'));
    }

    // ── Portfolio Card → Timeline ──────────────────────────────────────────────

    function listenPortfolioSelect() {
        window.addEventListener('portfolio:selectProject', e => {
            const idx = targetSlideFor(e.detail?.id);
            if (idx < 0) {
                console.warn(`[timeline] No timeline slide for project "${e.detail?.id}" — give it showInTimeline or a timelineTarget.`);
                return;
            }
            flyToProject(idx);
        });
    }

    // A project with its own timeline entry lands on its hero slide. One
    // without (a card-only project) names where its story is told instead:
    // "timelineTarget": { "project": "<id>", "topic": "<workTopics title>" }
    // — topic optional, defaulting to that project's hero slide.
    function targetSlideFor(id) {
        const own = slideData.findIndex(s => s.type === 'hero' && s.project.id === id);
        if (own >= 0) return own;
        const t = projects.find(p => p.id === id)?.timelineTarget;
        if (!t) return -1;
        return slideData.findIndex(s => s.project.id === t.project
            && (t.topic ? s.type === 'topic' && s.topic.title === t.topic : s.type === 'hero'));
    }

    // Warp jump: fade the page out around the starfield, push the field to
    // lightspeed, land on the chosen project, fade it in. The travel is
    // expressed by the starfield rather than by scrolling through every
    // intervening slide.
    function flyToProject(heroIdx) {
        if (S.flying) return;

        // Reduced motion: no warp, no fade — just arrive.
        if (REDUCED) {
            if (!S.immersive) enterImmersive({ silent: true });
            S.virtualPos = S.targetPos = heroIdx;
            S.lastScrollDir = 1;
            render(S.virtualPos);
            return;
        }

        S.flying = true;
        document.body.classList.add('timeline-warping');
        setWarp(WARP_JUMP, 7);

        // 1. Page fades out; starfield accelerates.
        setTimeout(() => {
            if (!S.immersive) enterImmersive({ silent: true });
            // Jump straight to the target — the warp *is* the travel, so there
            // is no lerp across the intervening slides.
            S.virtualPos    = heroIdx;
            S.targetPos     = heroIdx;
            S.lastScrollDir = 1;
            S.focusSlideIdx = -1;            // re-arm the highlight reveal
            render(S.virtualPos);
        }, FLY_FADE_MS);

        // 2. Arrive: drop out of warp, bloom, and settle the stage in.
        setTimeout(() => {
            document.body.classList.remove('timeline-warping');
            document.body.classList.add('timeline-arriving');
            setWarp(WARP_IMMERSIVE, 3.5);
            S.focusArrivedTs = performance.now();  // stagger bullets from now
            S.flying = false;

            clearTimeout(S.arriveTimer);
            S.arriveTimer = setTimeout(
                () => document.body.classList.remove('timeline-arriving'),
                ARRIVE_MS,
            );
        }, FLY_FADE_MS + FLY_WARP_MS);
    }

    function setWarp(factor, response) {
        window.dispatchEvent(new CustomEvent('timeline:warpSpeed', {
            detail: response ? { factor, response } : { factor },
        }));
    }

    // ── RAF Loop ───────────────────────────────────────────────────────────────

    function startRAF() {
        const tick = (ts) => {
            const dt = ts - (S.lastTs || ts);
            S.lastTs = ts;

            if (S.immersive) {
                S.targetPos = Math.max(-EXIT_OVER, Math.min(N - 1 + EXIT_OVER, S.targetPos));

                const alpha = 1 - Math.pow(1 - LERP_RATE, dt / 16.667);
                S.virtualPos += (S.targetPos - S.virtualPos) * alpha;

                // Snap exactly when close enough — prevents asymptotic creep
                // that would re-trigger topic-reveal thresholds frame to frame.
                if (Math.abs(S.targetPos - S.virtualPos) < 0.0015) {
                    S.virtualPos = S.targetPos;
                }

                render(S.virtualPos);
            }

            S.rafId = requestAnimationFrame(tick);
        };
        S.rafId = requestAnimationFrame(tick);
    }

    // ── Render ─────────────────────────────────────────────────────────────────

    function getDateForPos(pos) {
        const clamped = Math.max(0, Math.min(N - 1, pos));
        const i       = Math.floor(clamped);
        const next    = Math.min(N - 1, i + 1);
        const frac    = clamped - i;
        const a       = slideData[i];
        const b       = slideData[next];
        const project = a.project;
        const aFrac   = a.dateFrac;
        // If next slide is a different project, stay at end of this one during transition
        const bFrac   = b.project === a.project ? b.dateFrac : 1;
        const blendedFrac = aFrac + (bFrac - aFrac) * frac;
        const t0 = msOf(project.startDate, NOW_MS);
        // Ongoing roles (no endDate) interpolate up to today rather than
        // throwing on a split of undefined.
        const t1 = endMsOf(project);
        return new Date(t0 + (t1 - t0) * blendedFrac);
    }

    function render(pos) {
        const disp = Math.max(0, Math.min(N - 1, pos));

        // Time machine HUD
        const date = getDateForPos(disp);
        if (els.tmYear)  els.tmYear.textContent  = date.getFullYear();
        if (els.tmMonth) els.tmMonth.textContent = MONTHS[date.getMonth()];
        if (els.tmFill) {
            // Fill by elapsed time, not slide index — projects have unequal
            // spans, and a bar under a date readout should track the date.
            const span = TIMELINE_END - TIMELINE_START;
            const pct = span > 0
                ? ((date.getTime() - TIMELINE_START) / span) * 100
                : (N > 1 ? (disp / (N - 1)) * 100 : 100);
            els.tmFill.style.width = `${Math.max(0, Math.min(100, pct)).toFixed(1)}%`;
        }

        // Track which slide is currently focused (the closest integer) and
        // when we arrived at it — used for time-based bullet reveals below.
        const focusIdx = Math.max(0, Math.min(N - 1, Math.round(disp)));
        const nowMs    = performance.now();
        if (focusIdx !== S.focusSlideIdx) {
            S.focusSlideIdx  = focusIdx;
            S.slides.forEach((sl, j) => { sl.el.inert = !S.immersive || j !== focusIdx; });
            if (S.immersive && els.announce) {
                els.announce.textContent = `Slide ${focusIdx + 1} of ${N}: ${slideData[focusIdx].label}`;
            }
            S.focusArrivedTs = nowMs;
        }
        const focusElapsedMs = nowMs - S.focusArrivedTs;

        // Slides with layered parallax. The slide element itself stays put;
        // each inner layer moves at its own rate so transforms don't compound.
        // Viewport speeds — bg: 0.3x ty, content: 1.0x ty, image: 0.7x ty.
        S.slides.forEach((slide, i) => {
            const progress = pos - i;
            let opacity, ty;

            if (progress < -FADE) {
                opacity = 0;  ty = 70;
            } else if (progress < 0) {
                opacity = (progress + FADE) / FADE;
                ty = (1 - opacity) * 70;
            } else if (progress < 1 - FADE) {
                opacity = 1;  ty = 0;
            } else if (progress < 1) {
                opacity = (1 - progress) / FADE;
                ty = (1 - opacity) * -50;
            } else {
                opacity = 0;  ty = -50;
            }

            // Reduced motion: keep the crossfade (it conveys the change of
            // slide) but drop every translation — parallax is the part that
            // triggers vestibular discomfort.
            if (REDUCED) ty = 0;

            slide.el.style.opacity       = opacity;
            slide.el.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
            // No transform on the slide itself — layers below move on their own

            // Background drifts slowly (depth feel) with a subtle in-scroll scale
            const bg = slide.el.querySelector('.slide-bg');
            if (bg) {
                const bgY   = ty * 0.3;
                const scale = REDUCED ? 1.06 : 1.06 + Math.max(0, progress) * 0.04;
                bg.style.transform = `translateY(${bgY.toFixed(2)}px) scale(${scale.toFixed(3)})`;
            }

            // Main content does the primary slide-in motion
            const content = slide.el.querySelector('.slide-content');
            if (content) {
                content.style.transform = `translateY(${ty.toFixed(2)}px)`;
            }

            // Topic image lags slightly behind the text for layered feel.
            // Image is a child of content — its translate reverses some of content's.
            // Net image viewport motion: ty + (-0.3 * ty) = 0.7 * ty
            const topicImg = slide.el.querySelector('.topic-image-section');
            if (topicImg) {
                topicImg.style.transform = `translateY(${(-ty * 0.3).toFixed(2)}px)`;
            }

            // Video: play only when this slide is the focused one.
            // Guard on state — this runs every frame, and calling play()
            // unconditionally allocated a promise per frame per video.
            const vid = slide.el.querySelector('video');
            if (vid) {
                const shouldPlay = opacity > 0.5;
                // Preload one slide ahead so approaching a slide isn't a
                // cold start, but never all of them at once.
                if (Math.abs(i - S.focusSlideIdx) <= 1) ensureVideoLoaded(vid);
                if (shouldPlay && vid.paused) vid.play().catch(() => {});
                else if (!shouldPlay && !vid.paused) vid.pause();
            }

            // Highlight bullets: time-based staggered reveal after arrival.
            // The old scroll-progress reveal never fired in discrete-step mode
            // because `progress` stays at 0 while a slide is the focused one.
            // Now they cascade in after the slide settles, and only reset
            // once the slide is fully invisible (so they fade with it).
            const highlights = slide.el.querySelectorAll('.topic-highlights li');
            if (highlights.length) {
                if (i === S.focusSlideIdx) {
                    highlights.forEach((li, j) => {
                        // Reduced motion: no stagger, everything is simply there
                        const triggerMs = REDUCED ? 0 : REVEAL_START_MS + j * REVEAL_STAGGER_MS;
                        if (focusElapsedMs >= triggerMs) li.classList.add('highlight-visible');
                    });
                } else if (opacity < 0.05) {
                    highlights.forEach(li => li.classList.remove('highlight-visible'));
                }
            }
        });

        // Nav dots: highlight whichever PROJECT we're currently looking at
        const currentProj = slideData[focusIdx].project;
        const newProjIdx  = timelineProjects.indexOf(currentProj);
        if (newProjIdx !== S.activeProjIdx) {
            S.activeProjIdx = newProjIdx;
            S.dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === newProjIdx);
                if (i === newProjIdx) dot.setAttribute('aria-current', 'step');
                else dot.removeAttribute('aria-current');
            });
        }
    }
}
