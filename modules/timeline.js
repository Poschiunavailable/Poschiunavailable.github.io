// timeline.js — project-based virtual scroll

export function initTimeline(projects) {
    const timelineProjects = projects.filter(p => p.showInTimeline);
    if (!timelineProjects.length) return;

    const N = timelineProjects.length;

    // Scroll sensitivity
    const WHEEL_SENS       = 0.0035;
    const TOUCH_SENS       = 0.007;
    // Animation
    const LERP_RATE        = 0.11;
    const SNAP_IDLE_MS     = 700;
    const SNAP_STRENGTH    = 0.06;
    // Slide crossfade: each slide fades over the last FADE fraction of its 0→1 range
    // At integer boundaries, outgoing slide hits 0 exactly as incoming hits 1 — no overlap.
    const FADE             = 0.3;
    // Entry / exit
    const EXIT_OVER        = 0.55;
    const ENTER_RATIO      = 0.5;
    const REENTER_COOLDOWN = 700;

    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

    const S = {
        immersive:   false,
        virtualPos:  0,
        targetPos:   0,
        activeIdx:   -1,
        idleMs:      0,
        lastTs:      0,
        lastExitTs:  0,
        touchStartY: 0,
        rafId:       0,
        slides:      [],
        dots:        [],
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

        timelineProjects.forEach((project, i) => {
            const slide = document.createElement('div');
            slide.className = 'project-slide';
            slide.dataset.idx = i;

            const header = document.createElement('div');
            header.className = 'slide-header';
            header.innerHTML = `
                <h2 class="slide-title">${project.title}</h2>
                ${project.subtitle ? `<p class="slide-subtitle">${project.subtitle}</p>` : ''}
                <p class="slide-desc">${project.timelineDescription || project.description || ''}</p>
            `;
            slide.appendChild(header);

            const topicEls = [];
            (project.workTopics || []).forEach(topic => {
                const card = document.createElement('div');
                card.className = 'topic-card';
                const bullets = (topic.highlights || []).map(h => `<li>${h}</li>`).join('');
                const imgHtml = topic.image
                    ? `<div class="topic-image-wrap"><img src="${topic.image}" alt="${topic.title}" class="topic-image" loading="lazy"></div>`
                    : '';
                card.innerHTML = `
                    ${imgHtml}
                    <h3 class="topic-title">${topic.title}</h3>
                    <p class="topic-desc">${topic.description}</p>
                    ${bullets ? `<ul class="topic-highlights">${bullets}</ul>` : ''}
                `;
                slide.appendChild(card);
                topicEls.push(card);
            });

            els.stage.appendChild(slide);
            S.slides.push({ el: slide, topics: topicEls, project });
        });
    }

    function buildNavDots() {
        if (!els.navEl) return;
        els.navEl.innerHTML = '';
        S.dots = [];
        timelineProjects.forEach((project, i) => {
            const dot = document.createElement('button');
            dot.className = 'nav-dot';
            dot.setAttribute('aria-label', project.title);
            dot.title = project.title;
            dot.addEventListener('click', () => {
                S.targetPos = i;
                S.idleMs = 0;
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

        // Center the CV section in the viewport before locking scroll
        const rect = els.cvSection.getBoundingClientRect();
        const centerTarget = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
        window.scrollTo({ top: Math.max(0, centerTarget), behavior: 'auto' });

        S.immersive = true;
        document.body.classList.add('timeline-immersive');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';

        // Enter cleanly at the nearest project
        S.virtualPos = Math.max(0, Math.min(N - 1, Math.round(S.virtualPos)));
        S.targetPos  = S.virtualPos;
        S.idleMs     = 0;

        bindVirtualScroll();
        window.dispatchEvent(new CustomEvent('timeline:warpSpeed', { detail: { factor: 1.8 } }));
    }

    function exitImmersive(direction) {
        if (!S.immersive) return;
        S.immersive = false;

        // Reset slides first (still position:fixed while class is on body)
        S.slides.forEach(({ el, topics }) => {
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
            topics.forEach(t => t.classList.remove('topic-visible'));
        });

        // Calculate scroll destination while layout is still immersive (rect is accurate)
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
        S.idleMs = 0;
        checkBoundaryExit();
    }

    function checkBoundaryExit() {
        if (S.targetPos < -EXIT_OVER)          exitImmersive('top');
        else if (S.targetPos > N - 1 + EXIT_OVER) exitImmersive('bottom');
    }

    // ── Keyboard Navigation ────────────────────────────────────────────────────

    function installKeyboard() {
        window.addEventListener('keydown', e => {
            if (!S.immersive) return;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                S.targetPos = Math.min(N - 1, Math.round(S.virtualPos) + 1);
                S.idleMs = 0;
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                S.targetPos = Math.max(0, Math.round(S.virtualPos) - 1);
                S.idleMs = 0;
            } else if (e.key === 'Escape') {
                exitImmersive('top');
            }
        });
    }

    // ── Portfolio Card → Timeline ──────────────────────────────────────────────

    function listenPortfolioSelect() {
        window.addEventListener('portfolio:selectProject', e => {
            const id  = e.detail?.id;
            const idx = timelineProjects.findIndex(p => p.id === id);
            if (idx < 0) return;
            if (!S.immersive) enterImmersive();
            S.targetPos = idx;
            S.idleMs = 0;
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

                // Pull to nearest project after idle
                if (S.idleMs > SNAP_IDLE_MS) {
                    const nearest = Math.max(0, Math.min(N - 1, Math.round(S.virtualPos)));
                    S.targetPos += (nearest - S.targetPos) * SNAP_STRENGTH;
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
        const idx   = Math.max(0, Math.min(N - 1, pos));
        const floor = Math.floor(idx);
        const frac  = idx - floor;
        const p     = timelineProjects[floor];
        const [sy, sm] = p.startDate.split('-').map(Number);
        const [ey, em] = p.endDate.split('-').map(Number);
        const t0 = new Date(sy, sm - 1, 1).getTime();
        const t1 = new Date(ey, em - 1, 28).getTime();
        return new Date(t0 + (t1 - t0) * frac);
    }

    function render(pos) {
        const disp = Math.max(0, Math.min(N - 1, pos));

        // Time machine
        const date = getDateForPos(disp);
        if (els.tmYear)  els.tmYear.textContent  = date.getFullYear();
        if (els.tmMonth) els.tmMonth.textContent = MONTHS[date.getMonth()];
        if (els.tmFill) {
            const pct = N > 1 ? (disp / (N - 1)) * 100 : 100;
            els.tmFill.style.width = `${pct.toFixed(1)}%`;
        }

        // Slides
        // progress = disp - slideIndex
        //   < -FADE      : hidden (coming from below)
        //   -FADE → 0    : fading in
        //   0 → 1-FADE   : fully visible + topics can appear
        //   1-FADE → 1   : fading out
        //   >= 1         : hidden (gone above)
        // At integer boundaries: outgoing slide reaches opacity=0 exactly as incoming reaches opacity=1
        S.slides.forEach((slide, i) => {
            const progress = disp - i;
            let opacity, ty;

            if (progress < -FADE) {
                opacity = 0;  ty = 48;
            } else if (progress < 0) {
                opacity = (progress + FADE) / FADE;
                ty = (1 - opacity) * 48;
            } else if (progress < 1 - FADE) {
                opacity = 1;  ty = 0;
            } else if (progress < 1) {
                opacity = (1 - progress) / FADE;
                ty = (1 - opacity) * -24;
            } else {
                opacity = 0;  ty = -24;
            }

            slide.el.style.opacity   = opacity;
            slide.el.style.transform = `translate(-50%, calc(-50% + ${ty.toFixed(2)}px))`;
            slide.el.style.pointerEvents = opacity > 0.5 ? 'auto' : 'none';

            // Topics: only reveal while in the settled (not mid-fade) window
            const settled = progress >= 0 && progress < (1 - FADE);
            const n = slide.topics.length;
            slide.topics.forEach((topicEl, j) => {
                const threshold = n > 0 ? (j + 0.5) / (n + 0.5) : 0;
                topicEl.classList.toggle('topic-visible', settled && progress >= threshold);
            });
        });

        // Nav dots
        const newIdx = Math.max(0, Math.min(N - 1, Math.round(disp)));
        if (newIdx !== S.activeIdx) {
            S.activeIdx = newIdx;
            S.dots.forEach((dot, i) => dot.classList.toggle('active', i === newIdx));
        }
    }
}
