// timeline.js — v5.3
// Fixes based on your console:
//  - 404 for /projects.json -> always load JSON relative to the HTML using document.baseURI
//  - getBoundingClientRect() on null -> robust lookup for the CV section + guards
//  - Keeps rAF + LERP smooth day wheel and exclusive active project

(function () {
    'use strict';

    const ROW_H = 42;
    const DATE_LABEL_FMT = { day: '2-digit', month: 'short', year: 'numeric' };
    const STICKY_TOP_VH = 12;
    const FADE_MS = 240;
    const SMOOTHNESS = 0.18;

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
        lastTs: 0
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
        ensureMonthSeparators();

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
        S.totalDays = daysBetween(S.minDate, S.maxDate) + 1;

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

    function ensureMonthSeparators() {
        const wheel = document.querySelector('#timewheel .wheel.day');
        if (!wheel) return null;

        let sepTrack = wheel.querySelector('.sep-track');
        if (!sepTrack) {
            sepTrack = document.createElement('div');
            sepTrack.className = 'sep-track';
            wheel.appendChild(sepTrack);

            // Our wheel repeats 01..31 three times for smooth looping.
            const totalRows = 31 * 3;
            for (let i = 0; i < totalRows; i++) {
                const day = (i % 31) + 1;
                if (day === 1) {
                    const line = document.createElement('div');
                    line.className = 'sep-line';
                    line.style.top = `${i * ROW_H}px`;
                    sepTrack.appendChild(line);
                }
            }
        }
        return sepTrack;
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

    function initFloats() {
        S.targetFloat = mapScrollToFloat();
        S.animFloat = S.targetFloat;
        updateForFloat(S.animFloat);
    }

    function startRAF() {
        if (S.rafId) cancelAnimationFrame(S.rafId);
        S.lastTs = performance.now();
        const tick = (ts) => {
            const dt = ts - S.lastTs; S.lastTs = ts;
            S.targetFloat = mapScrollToFloat();
            const alpha = 1 - Math.pow(1 - SMOOTHNESS, dt / 16.667);
            S.animFloat += (S.targetFloat - S.animFloat) * alpha;
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
        const baseDate = addDays(S.minDate, baseIndex);
        const domIndex = baseDate.getDate() - 1;
        const iFloat = domIndex + frac;
        const offset = (31 + iFloat) * -ROW_H;
        const track = S.els.timewheel.querySelector('.wheel.day .track');
        if (track) track.style.transform = `translate3d(0, ${offset}px, 0)`;
        const activeIdx = Math.round(iFloat) % 31;
        const digits = S.els.timewheel.querySelectorAll('.wheel.day .digit');
        digits.forEach((el, i) => el.classList.toggle('active', i % 31 === activeIdx));
    }

    function updateForFloat(dayFloat) {
        setWheelByFloat(dayFloat);
        const labelIndex = Math.round(dayFloat);
        const labelDate = addDays(S.minDate, labelIndex);
        if (S.els.label) { S.els.label.textContent = labelDate.toLocaleDateString(undefined, DATE_LABEL_FMT); }

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
