// timeline.js — v5.3
// Fixes based on your console:
//  - 404 for /projects.json -> always load JSON relative to the HTML using document.baseURI
//  - getBoundingClientRect() on null -> robust lookup for the CV section + guards
//  - Keeps rAF + LERP smooth day wheel and exclusive active project

(function () {
    'use strict';

    const ROW_H = 12; // per‑day row height (reduced for faster travel)
    const MONTH_GAP = 30; // adjusted with smaller row height
    const DATE_LABEL_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
    const YEAR_GAP = 40;  // adjusted with smaller row height
    const STICKY_TOP_VH = 12;
    const FADE_MS = 240;
    const SMOOTHNESS = 0.18;
    const SNAP_SMOOTHNESS = 0.35;   // faster easing when snapping to a day
    const SNAP_IDLE_MS = 140;       // after this idle time, snap to nearest day
    const SCROLL_SLOWDOWN = 1.6;    // >1 increases scroll distance for same date range
    const ENTER_THRESHOLD_VH = 0.28; // when CV center near viewport center, enter immersive
    const EXIT_OVERSCROLL_DAYS = 1.0; // overscroll beyond range before exiting immersive
    const WHEEL_PX_PER_DAY = 90;    // wheel/trackpad: smaller = faster
    const TOUCH_PX_PER_DAY = 28;    // touch drag: smaller = faster
    const REENTER_GUARD_VH = 0.3;  // smaller band to unlock re‑entry after exit
    const ENTER_RATIO = 0.5;        // section must cover 50% of viewport to auto-enter
    const EXIT_MARGIN_PX = 180;     // margin outside entry band after exit
    const REENTER_COOLDOWN_MS = 500; // grace period before re-entering

    const S = {
        minDate: new Date(8640000000000000),
        maxDate: new Date(-8640000000000000),
        totalDays: 0,
        els: { cv: null, projects: null, timewheel: null, label: null },
        projects: [],
        activeIdx: -1,
        animFloat: 0,
        targetFloat: 0,
        rafId: 0,
        lastTs: 0,
        sepLabels: [],
        sepItems: [],
        monthStartIdxs: [],
        yearStartIdxs: [],
        dayOffsets: [],      // cumulative top offsets (px) for each day index
        dayElems: [],        // references to .digit elements (one per day)
        trackEl: null,       // the .track element inside day wheel
        trackHeightPx: 0,
        idleMs: 0,
        lastScrollY: 0,
        dragging: false,
        spacerEl: null,
        immersive: false,
        virtualFloat: 0,
        stageEl: null,
        snapTo: null,
        snapFrom: 0,
        snapT: 0,
        lastExitTs: 0,
        enterObserver: null,
        afterSpacer: null,
        reentryLockDir: null,
        reentryUnlockY: 0
    };

    const pad2 = n => String(n).padStart(2, '0');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const ymToDate = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, (m || 1) - 1, 1); };
    const endOfMonth = (y, m) => new Date(y, m, 0);
    const daysBetween = (a, b) => Math.floor((b - a) / 86400000);
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        wireEls();
        if (!S.els.cv) {
            console.error('[timeline] #cvSection not found. Falling back to .cv-section.');
            S.els.cv = document.querySelector('.cv-section');
        }
        if (!S.els.cv) {
            console.error('[timeline] No CV section found; aborting timeline init.');
            return;
        }

        ensureDayWheel();
        enableDragScroll();
        positionLabel();
        window.addEventListener('resize', positionLabel);
        installEnterObserver();
        window.addEventListener('mousemove', handleHoverCursor, { passive: true });

        try {
            const projects = await loadProjectsJSON();
            buildFromData(projects.filter(p => p.showInTimeline === true));
            ensureScrollSlowdown();
            initFloats();
            startRAF();
            // observer will handle entering immersive automatically
        } catch (e) {
            console.error('[timeline] Failed to load projects.json', e);
        }
    }

    function ensureScrollSlowdown() {
        const cv = S.els.cv; if (!cv) return;
        let spacer = document.getElementById('cvScrollSpacer');
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.id = 'cvScrollSpacer';
            cv.appendChild(spacer);
        }
        S.spacerEl = spacer;
        const baseHeight = cv.scrollHeight - (spacer.offsetHeight || 0);
        const extra = Math.max(0, Math.round(baseHeight * (SCROLL_SLOWDOWN - 1)));
        spacer.style.height = extra + 'px';
        window.addEventListener('resize', () => {
            const base = cv.scrollHeight - (spacer.offsetHeight || 0);
            spacer.style.height = Math.max(0, Math.round(base * (SCROLL_SLOWDOWN - 1))) + 'px';
        });
    }

    function wireEls() {
        S.els.cv = document.getElementById('cvSection');
        S.els.projects = document.getElementById('projects');
        S.els.timewheel = document.getElementById('timewheel');
        S.els.label = document.getElementById('currentTime');
    }

    async function loadProjectsJSON() {
        // Always resolve relative to the HTML document, not the server root or script folder
        const url = new URL('projects.json', document.baseURI).href;
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        return await res.json();
    }

    function buildFromData(projects) {
        projects.forEach(p => {
            const s = ymToDate(p.startDate);
            const [ey, em] = p.endDate.split('-').map(Number);
            const e = endOfMonth(ey, em);
            if (s < S.minDate) S.minDate = s;
            if (e > S.maxDate) S.maxDate = e;
        });
        // Allow a small headroom before first and after last project so the marker/label can continue
        // to move beyond the project range without snapping to top/bottom abruptly.
        S.scrollMin = addDays(S.minDate, -7);
        S.scrollMax = addDays(S.maxDate, 7);
        S.totalDays = daysBetween(S.scrollMin, S.scrollMax) + 1;

        // Build the day track using real calendar days and physical gaps
        precomputeGaps();
        buildDayTrack();

        if (!S.els.projects) { console.warn('[timeline] #projects not found'); return; }
        S.els.projects.innerHTML = '';
        projects.forEach(p => {
            const a = document.createElement('article'); a.className = 'cv-project';
            a.dataset.start = p.startDate; a.dataset.end = p.endDate;
            const head = document.createElement('header'); head.className = 'project-header';
            const h = document.createElement('h3'); h.textContent = p.title || p.id || 'Project'; head.appendChild(h);
            const when = document.createElement('div'); when.className = 'project-dates'; when.textContent = `${p.startDate} – ${p.endDate}`; head.appendChild(when);
            a.appendChild(head);
            if (p.video) { const v = document.createElement('video'); v.className = 'project-video'; v.src = p.video; v.muted = true; v.loop = true; v.playsInline = true; if (p.poster) v.poster = p.poster; a.appendChild(v); }
            if (p.timelineDescription || p.description) { const b = document.createElement('p'); b.className = 'project-desc'; b.textContent = p.timelineDescription || p.description; a.appendChild(b); }
            S.els.projects.appendChild(a);
            const sDate = ymToDate(p.startDate);
            const [ey, em] = p.endDate.split('-').map(Number);
            const eDate = endOfMonth(ey, em);
            S.projects.push({ el: a, s: sDate, e: eDate });
        });
    }

    function precomputeGaps() {
        S.monthStartIdxs = [];
        S.yearStartIdxs = [];
        for (let i = 0; i < S.totalDays; i++) {
            const d = addDays(S.scrollMin, i);
            if (d.getDate() === 1) {
                S.monthStartIdxs.push(i);
                if (d.getMonth() === 0) S.yearStartIdxs.push(i);
            }
        }
    }

    function enableDragScroll() {
        const el = S.els.timewheel; if (!el) return;
        let dragging = false;
        let startY = 0;
        let startScroll = 0;
        let startVirtual = 0;

        const onMouseMove = (e) => {
            if (!dragging) return;
            const dy = e.clientY - startY;
            if (S.immersive) {
                S.virtualFloat = startVirtual - dy / TOUCH_PX_PER_DAY;
                S.targetFloat = S.virtualFloat;
                if (S.virtualFloat < -EXIT_OVERSCROLL_DAYS) exitImmersive('top');
                if (S.virtualFloat > (S.totalDays - 1) + EXIT_OVERSCROLL_DAYS) exitImmersive('bottom');
            } else {
                window.scrollTo({ top: startScroll - dy, behavior: 'auto' });
            }
            e.preventDefault();
        };
        const onMouseUp = () => {
            if (!dragging) return;
            dragging = false;
            S.dragging = false;
            el.classList.remove('dragging');
            document.removeEventListener('mousemove', onMouseMove, true);
            document.removeEventListener('mouseup', onMouseUp, true);
            document.body.style.userSelect = '';
            // reset body cursor if we set it
            if (document.body.style.cursor === 'grabbing') document.body.style.cursor = '';
            // Trigger fast snap to nearest day on release
            S.snapFrom = S.animFloat;
            S.snapTo = clamp(Math.round(S.targetFloat), 0, S.totalDays - 1);
            S.snapT = 0;
        };

        // Start drag only if mousedown occurs within the timewheel's bounding box
        document.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // left button only
            const r = el.getBoundingClientRect();
            const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
            if (!inside) return;
            dragging = true;
            S.dragging = true;
            startY = e.clientY;
            startScroll = window.scrollY;
            startVirtual = S.virtualFloat;
            el.classList.add('dragging');
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMouseMove, true);
            document.addEventListener('mouseup', onMouseUp, true);
            e.preventDefault();
        }, { passive: false });

        window.addEventListener('blur', onMouseUp);
    }

    function handleHoverCursor(e) {
        const el = S.els.timewheel; if (!el || S.dragging) return;
        const r = el.getBoundingClientRect();
        const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
        if (inside) {
            document.body.style.cursor = 'grab';
        } else if (document.body.style.cursor === 'grab') {
            document.body.style.cursor = '';
        }
    }

    function installEnterObserver() {
        if (!('IntersectionObserver' in window)) return;
        if (S.enterObserver) { S.enterObserver.disconnect(); }
        const cv = S.els.cv; if (!cv) return;
        S.enterObserver = new IntersectionObserver(([entry]) => {
            if (!entry) return;
            if (S.immersive) return;
            const now = performance.now();
            if (now - S.lastExitTs < REENTER_COOLDOWN_MS) return;
            const r = entry.boundingClientRect;
            const vh = window.innerHeight || document.documentElement.clientHeight;
            const vis = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
            const coverRatio = vis / vh; // portion of viewport covered
            if (S.reentryLockDir) {
                const { top, bottom } = getCVPageBounds();
                const bandTop = top + vh * REENTER_GUARD_VH;
                const bandBottom = bottom - vh * REENTER_GUARD_VH;
                const viewCenter = window.scrollY + vh * 0.5;
                let unlock = false;
                if (S.reentryLockDir === 'down') unlock = (viewCenter >= bandTop);
                if (S.reentryLockDir === 'up') unlock = (viewCenter <= bandBottom);
                if (!unlock) return; else S.reentryLockDir = null;
            }
            if (coverRatio >= ENTER_RATIO) enterImmersive();
        }, { threshold: Array.from({length: 11}, (_,i)=>i/10) });
        S.enterObserver.observe(cv);
    }

    function enterImmersive() {
        if (S.immersive) return;
        S.immersive = true;
        document.body.classList.add('timeline-immersive','timeline-immersive-enter');
        // Anchor the page so the CV center aligns with the viewport center
        const { top: cvTop, bottom: cvBottom } = getCVPageBounds();
        const anchor = (cvTop + cvBottom) * 0.5 - window.innerHeight * 0.5;
        window.scrollTo({ top: Math.max(0, Math.round(anchor)), behavior: 'auto' });
        const enterFloat = pageScrollToFloat();
        // Reset to boundary: if we're nearer the top half, snap to start; else snap to end
        const half = (S.totalDays - 1) * 0.5;
        const atStart = enterFloat <= half;
        S.virtualFloat = atStart ? 0 : (S.totalDays - 1);
        S.targetFloat = S.virtualFloat;
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        bindVirtualScroll();
        ensureStage();
        setTimeout(() => document.body.classList.remove('timeline-immersive-enter'), 320);
    }

    function exitImmersive(direction) {
        if (!S.immersive) return;
        S.immersive = false;
        document.body.classList.remove('timeline-immersive');
        unbindVirtualScroll();
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        const { top: cvTop, bottom: cvBottom } = getCVPageBounds();
        const vh = window.innerHeight;
        // Jump outside the entry band so we don't immediately re-enter
        const above = Math.max(0, Math.round(cvTop - vh * ENTER_THRESHOLD_VH - EXIT_MARGIN_PX));
        let below = Math.round(cvBottom - (1 - ENTER_THRESHOLD_VH) * vh + EXIT_MARGIN_PX);
        // Ensure we have enough room below; add a temporary spacer if not
        ensureAfterSpacer(below);
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
        below = Math.min(maxScroll, Math.max(0, below));
        const dest = direction === 'top' ? above : below;
        window.scrollTo({ top: dest, behavior: 'auto' });
        if (S.stageEl) S.stageEl.style.display = 'none';
        S.lastExitTs = performance.now();
        // Set re-entry gate: require scrolling back across the band in the opposite direction
        S.reentryLockDir = direction === 'top' ? 'down' : 'up';
    }

    function bindVirtualScroll() {
        window.addEventListener('wheel', onWheelVirtual, { passive: false });
        window.addEventListener('touchstart', onTouchStart, { passive: false });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
    }
    function unbindVirtualScroll() {
        window.removeEventListener('wheel', onWheelVirtual, { passive: false });
        window.removeEventListener('touchstart', onTouchStart, { passive: false });
        window.removeEventListener('touchmove', onTouchMove, { passive: false });
    }

    function onWheelVirtual(e) {
        if (!S.immersive) return;
        e.preventDefault();
        const d = e.deltaY; // positive when scrolling down
        const atTop = S.virtualFloat <= 0 + 1e-3;
        const atBottom = S.virtualFloat >= (S.totalDays - 1) - 1e-3;
        if (d < 0 && atTop) { exitImmersive('top'); return; }
        if (d > 0 && atBottom) { exitImmersive('bottom'); return; }
        S.virtualFloat += d / WHEEL_PX_PER_DAY;
        S.targetFloat = S.virtualFloat;
        if (S.virtualFloat < -EXIT_OVERSCROLL_DAYS) exitImmersive('top');
        if (S.virtualFloat > (S.totalDays - 1) + EXIT_OVERSCROLL_DAYS) exitImmersive('bottom');
    }

    let touchStartY = 0;
    function onTouchStart(e) {
        if (!S.immersive) return;
        if (e.touches && e.touches.length) touchStartY = e.touches[0].clientY;
    }
    function onTouchMove(e) {
        if (!S.immersive) return;
        if (!(e.touches && e.touches.length)) return;
        e.preventDefault();
        const y = e.touches[0].clientY;
        const dy = y - touchStartY;
        touchStartY = y;
        const atTop = S.virtualFloat <= 0 + 1e-3;
        const atBottom = S.virtualFloat >= (S.totalDays - 1) - 1e-3;
        // If dragging down (dy>0) and atTop -> exit top; if dragging up (dy<0) and atBottom -> exit bottom
        if (dy > 0 && atTop) { exitImmersive('top'); return; }
        if (dy < 0 && atBottom) { exitImmersive('bottom'); return; }
        S.virtualFloat -= dy / TOUCH_PX_PER_DAY; // drag up advances days
        S.targetFloat = S.virtualFloat;
        if (S.virtualFloat < -EXIT_OVERSCROLL_DAYS) exitImmersive('top');
        if (S.virtualFloat > (S.totalDays - 1) + EXIT_OVERSCROLL_DAYS) exitImmersive('bottom');
    }

    function ensureStage() {
        if (!S.stageEl) {
            const stage = document.createElement('div');
            stage.id = 'timelineStage';
            document.body.appendChild(stage);
            S.stageEl = stage;
        }
        S.stageEl.style.display = 'block';
        renderStageForActive();
    }

    function getCVPageBounds() {
        const cv = S.els.cv; const r = cv.getBoundingClientRect();
        const top = window.scrollY + r.top;
        const bottom = top + r.height;
        return { top, bottom };
    }

    function ensureAfterSpacer(targetBottomScrollTop) {
        // Ensure the document has enough height to scroll to 'targetBottomScrollTop'
        const vh = window.innerHeight;
        const maxScroll = Math.max(0, document.documentElement.scrollHeight - vh);
        if (targetBottomScrollTop <= maxScroll) return; // already enough room
        const needed = targetBottomScrollTop - maxScroll + EXIT_MARGIN_PX;
        let spacer = S.afterSpacer || document.getElementById('cvAfterSpacer');
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.id = 'cvAfterSpacer';
            spacer.style.width = '1px';
            spacer.style.height = '0px';
            spacer.style.pointerEvents = 'none';
            // Insert after the CV section
            const parent = S.els.cv && S.els.cv.parentElement ? S.els.cv.parentElement : document.body;
            parent.appendChild(spacer);
        }
        spacer.style.height = Math.max(needed, EXIT_MARGIN_PX) + 'px';
        S.afterSpacer = spacer;
    }

    function renderStageForActive() {
        if (!S.stageEl) return;
        const idx = S.activeIdx;
        S.stageEl.innerHTML = '';
        if (idx == null || idx < 0 || idx >= S.projects.length) return;
        const clone = S.projects[idx].el.cloneNode(true);
        clone.classList.add('stage-card');
        S.stageEl.appendChild(clone);
    }

    // Backdrop overlay removed in favor of background color fade

    function buildDayTrack() {
        const monthsAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const tw = S.els.timewheel; if (!tw) return;
        let dayWheel = tw.querySelector('.wheel.day');
        if (!dayWheel) { dayWheel = document.createElement('div'); dayWheel.className = 'wheel day'; tw.prepend(dayWheel); }
        let track = dayWheel.querySelector('.track');
        if (!track) { track = document.createElement('div'); track.className = 'track'; dayWheel.appendChild(track); }
        track.innerHTML = '';

        S.trackEl = track;
        S.dayOffsets = [];
        S.dayElems = [];
        let y = 0;
        for (let i = 0; i < S.totalDays; i++) {
            const d = addDays(S.scrollMin, i);
            // Insert a gap before the first day of each month (except very first day)
            if (i > 0 && d.getDate() === 1) {
                const gap = document.createElement('div');
                const isYear = d.getMonth() === 0;
                gap.className = 'gap ' + (isYear ? 'year' : 'month');
                const line = document.createElement('div'); line.className = 'gap-line'; gap.appendChild(line);
                const label = document.createElement('div'); label.className = 'gap-label'; label.textContent = monthsAbbr[d.getMonth()]; gap.appendChild(label);
                if (isYear) { const yEl = document.createElement('div'); yEl.className = 'gap-year'; yEl.textContent = d.getFullYear(); gap.appendChild(yEl); }
                gap.style.height = (isYear ? YEAR_GAP : MONTH_GAP) + 'px';
                track.appendChild(gap);
                y += isYear ? YEAR_GAP : MONTH_GAP;
            }
            const el = document.createElement('div');
            el.className = 'digit';
            el.textContent = pad2(d.getDate());
            track.appendChild(el);
            S.dayElems.push(el);
            S.dayOffsets.push(y);
            y += ROW_H;
        }
        S.trackHeightPx = y;
    }

    function ensureDayWheel() {
        const tw = S.els.timewheel; if (!tw) return;
        let dayWheel = tw.querySelector('.wheel.day');
        if (!dayWheel) { dayWheel = document.createElement('div'); dayWheel.className = 'wheel day'; tw.prepend(dayWheel); }
        if (!dayWheel.querySelector('.track')) {
            const track = document.createElement('div'); track.className = 'track';
            const vals = Array.from({ length: 31 }, (_, i) => pad2(i + 1));
            const loop = vals.concat(vals, vals);
            loop.forEach(v => { const d = document.createElement('div'); d.className = 'digit'; d.textContent = v; track.appendChild(d); });
            dayWheel.appendChild(track);
        }
        if (!tw.querySelector('.wheel-center-marker')) { const c = document.createElement('div'); c.className = 'wheel-center-marker'; tw.appendChild(c); }
    }

    function positionLabel() {
        if (!S.els.timewheel) return;
        const rect = S.els.timewheel.getBoundingClientRect();

        // Position the date label (#currentTime) horizontally to the right of the wheel
        if (S.els.label) {
            S.els.label.style.left = `${rect.center}px`;

            // Align the label's vertical center with the wheel's center marker
            const marker = S.els.timewheel.querySelector('.wheel-center-marker');
            if (marker) {
                const m = marker.getBoundingClientRect();
                const markerCenterY = m.top + m.height / 2;
                S.els.label.style.top = `${markerCenterY}px`;
                S.els.label.style.transform = 'translateY(-50%)';
            }
        }

        // If the link line exists, align it with the same Y as the center marker
        const linkEl = document.getElementById('tw-link');
        if (linkEl) {
            const marker = S.els.timewheel.querySelector('.wheel-center-marker');
            if (marker) {
                const m = marker.getBoundingClientRect();
                const markerCenterY = m.top + m.height / 2;
                linkEl.style.top = `${markerCenterY}px`;
                linkEl.style.transform = 'translateY(-50%)';
            }
            // Keep its left starting point aligned with the wheel's right edge
            linkEl.style.left = `${rect.right}px`;
        }
    }

    function initFloats() {
        S.targetFloat = mapScrollToFloat();
        S.animFloat = S.targetFloat;
        updateForFloat(S.animFloat);
    }

    function startRAF() {
        if (S.rafId) cancelAnimationFrame(S.rafId);
        S.lastTs = performance.now();
        S.lastScrollY = window.scrollY;
        const tick = (ts) => {
            const dt = ts - S.lastTs; S.lastTs = ts;
            const prevScrollY = S.lastScrollY;
            S.lastScrollY = window.scrollY;
            if (Math.abs(S.lastScrollY - prevScrollY) < 0.25) {
                S.idleMs += dt;
            } else {
                S.idleMs = 0;
            }

            // Freeze timeline until immersive view is active
            S.targetFloat = S.immersive ? mapScrollToFloat() : S.animFloat;

            // If idle and not interacting, pull to nearest day
            let lerpSmooth = SMOOTHNESS;
            if (!S.dragging && !S.immersive && S.snapTo == null && S.idleMs > SNAP_IDLE_MS) {
                S.targetFloat = clamp(Math.round(S.targetFloat), 0, S.totalDays - 1);
                lerpSmooth = SNAP_SMOOTHNESS;
            }

            if (S.dragging || S.immersive) {
                // 1:1 tracking during drag
                S.animFloat = S.targetFloat;
            } else if (S.snapTo != null) {
                // Quick, responsive snap after release
                S.snapT += dt / 180; // 180ms duration
                const t = Math.min(1, S.snapT);
                const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
                const k = easeOutCubic(t);
                S.animFloat = S.snapFrom + (S.snapTo - S.snapFrom) * k;
                if (t >= 1) { S.animFloat = S.snapTo; S.snapTo = null; }
            } else {
                const alpha = 1 - Math.pow(1 - lerpSmooth, dt / 16.667);
                S.animFloat += (S.targetFloat - S.animFloat) * alpha;
            }

            // Land exactly if close after idle pull
            if (!S.dragging && !S.immersive && S.snapTo == null && S.idleMs > SNAP_IDLE_MS && Math.abs(S.animFloat - S.targetFloat) < 0.001) {
                S.animFloat = S.targetFloat;
            }
            updateForFloat(S.animFloat);
            S.rafId = requestAnimationFrame(tick);
        };
        S.rafId = requestAnimationFrame(tick);
    }

    function pageScrollToFloat() {
        const cv = S.els.cv; if (!cv) return 0;
        const mid = window.innerHeight / 2;
        const rect = cv.getBoundingClientRect();
        const startY = window.scrollY + rect.top;
        const endY = startY + cv.scrollHeight;
        const centerY = window.scrollY + mid;
        const pos = clamp(centerY - startY, 0, Math.max(1, endY - startY));
        const pct = pos / Math.max(1, endY - startY);
        return clamp((S.totalDays - 1) * pct, 0, S.totalDays - 1);
    }

    function mapScrollToFloat() {
        if (S.immersive) {
            return clamp(S.virtualFloat, -EXIT_OVERSCROLL_DAYS, (S.totalDays - 1) + EXIT_OVERSCROLL_DAYS);
        }
        return pageScrollToFloat();
    }

    function setWheelByFloat(dayFloat) {
        if (!S.els.timewheel) return;
        const baseIndex = Math.floor(dayFloat);
        const frac = dayFloat - baseIndex;
        // Interpolate between the current day top and the next day's top (this naturally includes gaps)
        const i0 = clamp(baseIndex, 0, S.totalDays - 1);
        const i1 = clamp(baseIndex + 1, 0, S.totalDays - 1);
        const top0 = S.dayOffsets[i0] || 0;
        const top1 = S.dayOffsets[i1] || top0 + ROW_H;
        const dayTop = top0 + (top1 - top0) * frac;

        // Align the selected day row to the vertical center of the wheel marker
        const dayWheel = S.els.timewheel.querySelector('.wheel.day');
        const wheelH = dayWheel ? dayWheel.clientHeight : 0;
        const desiredCenter = wheelH / 2;
        const offset = desiredCenter - (dayTop + ROW_H / 2);
        const track = S.trackEl || S.els.timewheel.querySelector('.wheel.day .track');
        if (track) track.style.transform = `translate3d(0, ${offset}px, 0)`;

        const activeIdx = clamp(Math.round(dayFloat), 0, S.totalDays - 1);
        for (let i = 0; i < S.dayElems.length; i++) {
            S.dayElems[i].classList.toggle('active', i === activeIdx);
        }
    }

    function updateForFloat(dayFloat) {
        // Clamp for display so overscroll (used only for exit detection) never distorts the wheel
        const disp = clamp(dayFloat, 0, S.totalDays - 1);
        setWheelByFloat(disp);
        const labelIndex = clamp(Math.round(disp), 0, S.totalDays - 1);
        const labelDate = addDays(S.scrollMin, labelIndex);
        if (S.els.label) {
            S.els.label.textContent = labelDate.toLocaleDateString(undefined, DATE_LABEL_FMT);
        }
        positionLabel();

        let idx = -1;
        for (let i = 0; i < S.projects.length; i++) {
            const p = S.projects[i]; if (labelDate >= p.s && labelDate <= p.e) { idx = i; break; }
        }
        if (idx !== S.activeIdx) {
            const prev = S.activeIdx >= 0 ? S.projects[S.activeIdx].el : null;
            const next = idx >= 0 ? S.projects[idx].el : null;
            if (prev) { prev.classList.remove('active-project'); prev.classList.add('fading-out'); setTimeout(() => prev.classList.remove('fading-out'), FADE_MS); }
            if (next) { next.classList.add('active-project'); next.style.setProperty('--sticky-top', STICKY_TOP_VH + 'vh'); }
            S.activeIdx = idx;
            if (S.immersive) renderStageForActive();
        }

        S.projects.forEach((p, i) => {
            const on = (i === S.activeIdx);
            p.el.style.pointerEvents = on ? 'auto' : 'none';
            const v = p.el.querySelector('video'); if (v) { try { on ? v.play() : v.pause(); } catch { } }
        });
    }
})();
