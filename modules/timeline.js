// timeline.js — v5.3
// Fixes based on your console:
//  - 404 for /projects.json -> always load JSON relative to the HTML using document.baseURI
//  - getBoundingClientRect() on null -> robust lookup for the CV section + guards
//  - Keeps rAF + LERP smooth day wheel and exclusive active project

(function () {
    'use strict';

    const ROW_H = 42;
    const MONTH_GAP = 22; // physical gap (px) between months
    const DATE_LABEL_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
    const YEAR_GAP = 44;  // larger gap (px) at year boundaries
    const STICKY_TOP_VH = 12;
    const FADE_MS = 240;
    const SMOOTHNESS = 0.18;
    const SNAP_SMOOTHNESS = 0.35;   // faster easing when snapping to a day
    const SNAP_IDLE_MS = 140;       // after this idle time, snap to nearest day

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
        lastScrollY: 0
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
        positionLabel();
        window.addEventListener('resize', positionLabel);

        try {
            const projects = await loadProjectsJSON();
            buildFromData(projects.filter(p => p.showInTimeline === true));
            initFloats();
            startRAF();
        } catch (e) {
            console.error('[timeline] Failed to load projects.json', e);
        }
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
            S.els.label.style.left = `${rect.right + 8}px`;

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

            S.targetFloat = mapScrollToFloat();

            // If idle for a short time, gently pull to the nearest full day
            let lerpSmooth = SMOOTHNESS;
            if (S.idleMs > SNAP_IDLE_MS) {
                S.targetFloat = clamp(Math.round(S.targetFloat), 0, S.totalDays - 1);
                lerpSmooth = SNAP_SMOOTHNESS;
            }

            const alpha = 1 - Math.pow(1 - lerpSmooth, dt / 16.667);
            S.animFloat += (S.targetFloat - S.animFloat) * alpha;

            // When snapping and close enough, land exactly on the integer to avoid asymptotic drift
            if (S.idleMs > SNAP_IDLE_MS && Math.abs(S.animFloat - S.targetFloat) < 0.001) {
                S.animFloat = S.targetFloat;
            }
            updateForFloat(S.animFloat);
            S.rafId = requestAnimationFrame(tick);
        };
        S.rafId = requestAnimationFrame(tick);
    }

    function mapScrollToFloat() {
        const cv = S.els.cv; if (!cv) return 0;
        const mid = window.innerHeight / 2;
        const rect = cv.getBoundingClientRect();
        const startY = window.scrollY + rect.top;
        const endY = startY + cv.scrollHeight; // robust against sticky
        const centerY = window.scrollY + mid;
        const pos = clamp(centerY - startY, 0, Math.max(1, endY - startY));
        const pct = pos / Math.max(1, endY - startY);
        return clamp((S.totalDays - 1) * pct, 0, S.totalDays - 1);
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
        setWheelByFloat(dayFloat);
        const labelIndex = clamp(Math.round(dayFloat), 0, S.totalDays - 1);
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
        }

        S.projects.forEach((p, i) => {
            const on = (i === S.activeIdx);
            p.el.style.pointerEvents = on ? 'auto' : 'none';
            const v = p.el.querySelector('video'); if (v) { try { on ? v.play() : v.pause(); } catch { } }
        });
    }
})();
