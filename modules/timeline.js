// timeline.js — slide-based virtual scroll with parallax.
// Each project becomes one hero slide + one slide per work topic.
// Every wheel click / arrow / swipe commits to the next slide. Inspired by
// mobile-product marketing pages (e.g. apple.com/iphone): one focused concept
// per viewport, layered parallax, no overflow scrollbars.

export function initTimeline(projects) {
    const timelineProjects = projects.filter(p => p.showInTimeline);
    if (!timelineProjects.length) return;

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
    const WHEEL_SENS       = 0.0035;
    const TOUCH_SENS       = 0.007;
    const LERP_RATE        = 0.11;
    const SNAP_IDLE_MS     = 900;
    const SNAP_COMMIT      = 0.25;   // Directional snap: ≥25% movement commits forward/back
    const SNAP_STRENGTH    = 0.06;
    const FADE             = 0.32;   // Crossfade fraction on each side of a slide boundary
    const EXIT_OVER        = 0.55;
    const ENTER_RATIO      = 0.5;
    const REENTER_COOLDOWN = 700;

    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    const S = {
        immersive:      false,
        virtualPos:     0,
        targetPos:      0,
        activeProjIdx:  -1,
        lastScrollDir:  0,
        idleMs:         0,
        lastTs:         0,
        lastExitTs:     0,
        touchStartY:    0,
        rafId:          0,
        slides:         [],
        dots:           [],
    };

    const els = {
        cvSection: document.getElementById('cvSection'),
        stage:     document.getElementById('projectStage'),
        tmYear:    document.getElementById('tmYear'),
        tmMonth:   document.getElementById('tmMonth'),
        tmFill:    document.getElementById('tmProgressFill'),
        navEl:     document.getElementById('cvProjectNav'),
    };

    if (!els.cvSection || !els.stage) {
        console.warn('[timeline] Required elements not found.');
        return;
    }

    buildSlides();
    buildNavDots();
    installEnterObserver();
    installKeyboard();
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

            els.stage.appendChild(el);
            S.slides.push({ el, data });
        });
    }

    function buildHeroSlide(el, project) {
        // Full-bleed background layer (parallax)
        const bg = document.createElement('div');
        bg.className = 'slide-bg';
        if (project.video) {
            const v = document.createElement('video');
            v.className = 'slide-bg-video';
            v.src = project.video;
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
        content.innerHTML = `
            <p class="slide-eyebrow">${formatProjectDates(project)}</p>
            <h2 class="slide-title">${project.title}</h2>
            ${project.subtitle ? `<p class="slide-subtitle">${project.subtitle}</p>` : ''}
            <p class="slide-desc">${project.timelineDescription || project.description || ''}</p>
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

    function formatProjectDates(p) {
        const fmt = s => {
            const [y, m] = s.split('-').map(Number);
            return `${MONTHS[m - 1]} ${y}`;
        };
        return `${fmt(p.startDate)} — ${fmt(p.endDate)}`;
    }

    function buildNavDots() {
        if (!els.navEl) return;
        els.navEl.innerHTML = '';
        S.dots = [];
        timelineProjects.forEach((project) => {
            const dot = document.createElement('button');
            dot.className = 'nav-dot';
            dot.setAttribute('aria-label', project.title);
            dot.title = project.title;
            dot.addEventListener('click', () => {
                const heroIdx = slideData.findIndex(s => s.type === 'hero' && s.project === project);
                if (heroIdx < 0) return;
                S.targetPos     = heroIdx;
                S.lastScrollDir = heroIdx > S.virtualPos ? 1 : -1;
                S.idleMs        = 0;
                if (!S.immersive) enterImmersive();
            });
            els.navEl.appendChild(dot);
            S.dots.push(dot);
        });
    }

    // ── Entry / Exit ───────────────────────────────────────────────────────────

    function installEnterObserver() {
        if (!('IntersectionObserver' in window)) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (!entry || S.immersive) return;
            if (performance.now() - S.lastExitTs < REENTER_COOLDOWN) return;
            const r  = entry.boundingClientRect;
            const vh = window.innerHeight;
            const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            if (vis / vh >= ENTER_RATIO) enterImmersive();
        }, { threshold: Array.from({ length: 21 }, (_, i) => i / 20) });
        observer.observe(els.cvSection);
    }

    function enterImmersive() {
        if (S.immersive) return;

        const rect = els.cvSection.getBoundingClientRect();
        const centerTarget = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
        window.scrollTo({ top: Math.max(0, centerTarget), behavior: 'auto' });

        S.immersive     = true;
        S.lastScrollDir = 0;
        document.body.classList.add('timeline-immersive');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        S.virtualPos = Math.max(0, Math.min(N - 1, Math.round(S.virtualPos)));
        S.targetPos  = S.virtualPos;
        S.idleMs     = 0;

        bindVirtualScroll();
        window.dispatchEvent(new CustomEvent('timeline:warpSpeed', { detail: { factor: 1.8 } }));
    }

    function exitImmersive(direction) {
        if (!S.immersive) return;
        S.immersive = false;

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
        window.dispatchEvent(new CustomEvent('timeline:warpSpeed', { detail: { factor: 1.0 } }));
    }

    // ── Virtual Scroll ─────────────────────────────────────────────────────────

    function bindVirtualScroll() {
        window.addEventListener('wheel',      onWheel,      { passive: false });
        window.addEventListener('touchstart', onTouchStart, { passive: false });
        window.addEventListener('touchmove',  onTouchMove,  { passive: false });
    }

    function unbindVirtualScroll() {
        window.removeEventListener('wheel',      onWheel,      { passive: false });
        window.removeEventListener('touchstart', onTouchStart, { passive: false });
        window.removeEventListener('touchmove',  onTouchMove,  { passive: false });
    }

    function onWheel(e) {
        if (!S.immersive) return;
        e.preventDefault();
        S.targetPos += e.deltaY * WHEEL_SENS;
        if (Math.abs(e.deltaY) > 1) S.lastScrollDir = Math.sign(e.deltaY);
        S.idleMs = 0;
        checkBoundaryExit();
    }

    function onTouchStart(e) {
        if (!S.immersive || !e.touches?.length) return;
        S.touchStartY = e.touches[0].clientY;
    }

    function onTouchMove(e) {
        if (!S.immersive || !e.touches?.length) return;
        e.preventDefault();
        const dy = S.touchStartY - e.touches[0].clientY;
        S.touchStartY = e.touches[0].clientY;
        S.targetPos += dy * TOUCH_SENS;
        if (Math.abs(dy) > 1) S.lastScrollDir = Math.sign(dy);
        S.idleMs = 0;
        checkBoundaryExit();
    }

    function checkBoundaryExit() {
        if (S.targetPos < -EXIT_OVER)              exitImmersive('top');
        else if (S.targetPos > N - 1 + EXIT_OVER)  exitImmersive('bottom');
    }

    // ── Keyboard ───────────────────────────────────────────────────────────────

    function installKeyboard() {
        window.addEventListener('keydown', e => {
            if (!S.immersive) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
                e.preventDefault();
                S.targetPos     = Math.min(N - 1, Math.round(S.virtualPos) + 1);
                S.lastScrollDir = 1;
                S.idleMs        = 0;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
                e.preventDefault();
                S.targetPos     = Math.max(0, Math.round(S.virtualPos) - 1);
                S.lastScrollDir = -1;
                S.idleMs        = 0;
            } else if (e.key === 'Home') {
                e.preventDefault();
                S.targetPos = 0; S.lastScrollDir = -1; S.idleMs = 0;
            } else if (e.key === 'End') {
                e.preventDefault();
                S.targetPos = N - 1; S.lastScrollDir = 1; S.idleMs = 0;
            } else if (e.key === 'Escape') {
                exitImmersive('top');
            }
        });
    }

    // ── Portfolio Card → Timeline ──────────────────────────────────────────────

    function listenPortfolioSelect() {
        window.addEventListener('portfolio:selectProject', e => {
            const id      = e.detail?.id;
            const heroIdx = slideData.findIndex(s => s.type === 'hero' && s.project.id === id);
            if (heroIdx < 0) return;
            if (!S.immersive) enterImmersive();
            S.targetPos     = heroIdx;
            S.lastScrollDir = heroIdx > Math.round(S.virtualPos) ? 1 : -1;
            S.idleMs        = 0;
        });
    }

    // ── RAF Loop ───────────────────────────────────────────────────────────────

    function startRAF() {
        const tick = (ts) => {
            const dt = ts - (S.lastTs || ts);
            S.lastTs = ts;

            if (S.immersive) {
                S.idleMs += dt;

                S.targetPos = Math.max(-EXIT_OVER, Math.min(N - 1 + EXIT_OVER, S.targetPos));

                if (S.idleMs > SNAP_IDLE_MS) {
                    const floor = Math.floor(S.virtualPos);
                    const frac  = S.virtualPos - floor;
                    let snapped;
                    if (S.lastScrollDir > 0 && frac >= SNAP_COMMIT)
                        snapped = floor + 1;
                    else if (S.lastScrollDir < 0 && frac <= 1 - SNAP_COMMIT)
                        snapped = floor;
                    else
                        snapped = Math.round(S.virtualPos);
                    const clamped = Math.max(0, Math.min(N - 1, snapped));
                    S.targetPos += (clamped - S.targetPos) * SNAP_STRENGTH;
                }

                const alpha = 1 - Math.pow(1 - LERP_RATE, dt / 16.667);
                S.virtualPos += (S.targetPos - S.virtualPos) * alpha;

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
        const [sy, sm] = project.startDate.split('-').map(Number);
        const [ey, em] = project.endDate.split('-').map(Number);
        const t0 = new Date(sy, sm - 1, 1).getTime();
        const t1 = new Date(ey, em - 1, 28).getTime();
        return new Date(t0 + (t1 - t0) * blendedFrac);
    }

    function render(pos) {
        const disp = Math.max(0, Math.min(N - 1, pos));

        // Time machine HUD
        const date = getDateForPos(disp);
        if (els.tmYear)  els.tmYear.textContent  = date.getFullYear();
        if (els.tmMonth) els.tmMonth.textContent = MONTHS[date.getMonth()];
        if (els.tmFill) {
            const pct = N > 1 ? (disp / (N - 1)) * 100 : 100;
            els.tmFill.style.width = `${pct.toFixed(1)}%`;
        }

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

            slide.el.style.opacity       = opacity;
            slide.el.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';
            // No transform on the slide itself — layers below move on their own

            // Background drifts slowly (depth feel) with a subtle in-scroll scale
            const bg = slide.el.querySelector('.slide-bg');
            if (bg) {
                const bgY   = ty * 0.3;
                const scale = 1.06 + Math.max(0, progress) * 0.04;
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

            // Video: play only when this slide is the focused one
            const vid = slide.el.querySelector('video');
            if (vid) {
                if (opacity > 0.5) vid.play().catch(() => {});
                else vid.pause();
            }

            // Highlight bullets: staggered reveal during the settled window
            const highlights = slide.el.querySelectorAll('.topic-highlights li');
            if (highlights.length) {
                const settled = progress >= 0 && progress < (1 - FADE);
                // Normalised position within settled window (0 → 1)
                const t = settled ? Math.min(1, Math.max(0, progress / (1 - FADE))) : (progress < 0 ? -1 : 2);
                highlights.forEach((li, j) => {
                    // Reveal across the first 60% of the settled window
                    const threshold = (j + 1) / (highlights.length + 1) * 0.6;
                    li.classList.toggle('highlight-visible', t >= threshold);
                });
            }
        });

        // Nav dots: highlight whichever PROJECT we're currently looking at
        const focusIdx    = Math.max(0, Math.min(N - 1, Math.round(disp)));
        const currentProj = slideData[focusIdx].project;
        const newProjIdx  = timelineProjects.indexOf(currentProj);
        if (newProjIdx !== S.activeProjIdx) {
            S.activeProjIdx = newProjIdx;
            S.dots.forEach((dot, i) => dot.classList.toggle('active', i === newProjIdx));
        }
    }
}
