// Science layer (adopted from explore/science, STATUS D10) — three visual ideas, each tied
// to "travel between projects" (Docs/MOTION.md):
//   - orrery:    the projects as planets orbiting "now" — click one to warp to it
//   - particles: the tech stack as a Standard Model chart, built from
//                projects.json tags; a tile lights the projects that used it
//   - collapse:  the CV gate's year is in superposition until you scroll to it
// Every number shown is derived from projects.json — nothing is invented.
// Reduced motion: everything renders static; no animation loops start.

import { prefersReducedMotion } from './scripts.js';
import { linePath, areaPath, plot, sampleCareer, armDraw, drawIn, onFirstReveal } from './graph.js';

const REDUCED = () => prefersReducedMotion();
const NOW = new Date();
const yearOf = s => Number(String(s || '').slice(0, 4)) || null;
const monthMs = str => { const [y, m] = String(str || '').split('-').map(Number); return y ? new Date(y, (m || 1) - 1, 1).getTime() : NOW.getTime(); };
// A project's [start, end] in ms; ongoing = now.
const spanOf = p => [monthMs(p.startDate), p.endDate ? monthMs(p.endDate) : NOW.getTime()];
const sorted = projects => [...projects].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

export function initScience(projects) {
    initOrrery(projects);
    initParticles(projects);
    initCollapse(projects);
}

// Run `tick(dt)` every frame only while `el` is on screen and the tab visible.
function loopWhileVisible(el, tick) {
    let running = false, last = 0, raf = 0, inView = false;
    const frame = t => {
        const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
        last = t;
        tick(dt);
        raf = requestAnimationFrame(frame);
    };
    const update = () => {
        const want = inView && !document.hidden;
        if (want && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
        if (!want && running) { running = false; cancelAnimationFrame(raf); }
    };
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; update(); }, { rootMargin: '80px' }).observe(el);
    document.addEventListener('visibilitychange', update);
}

// ── Orrery: projects orbiting "now" ─────────────────────────────────────────
// Built from projects.json every load: one planet per showInPortfolio project,
// newest innermost, one moon per work topic. Nothing is hard-coded to six — the
// rings spread between the sun and the edge, and planets shrink to the ring
// spacing, so a seventh or fifteenth project just adds a world.

const PLANET_MAX = 60, PLANET_MAX_PHONE = 40, PLANET_MIN = 30;

function initOrrery(projects) {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;
    const list = sorted(projects.filter(p => p.showInPortfolio)).reverse();   // newest innermost
    if (!list.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'orrery';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Projects as an orrery — choose a destination to warp to it in the CV');
    wrap.innerHTML = `<div class="orrery-sun"><span class="orrery-corona"></span><span class="orrery-sun-core">now</span></div>
        <p class="orrery-hint" aria-hidden="true">Older work orbits farther out — pick a planet to travel there</p>`;
    // View inclination: flatter on wide screens; on a phone the orbits are so
    // narrow that a flat ellipse turns into a line, so look from higher up.
    let TILT = 0.36;
    const planets = list.map((p, i) => {
        const orbit = document.createElement('div');
        orbit.className = 'orrery-ring';
        wrap.appendChild(orbit);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'orrery-planet';
        const from = yearOf(p.startDate), to = yearOf(p.endDate) || 'now';
        const moons = (p.workTopics || []).length;
        btn.setAttribute('aria-label', `${p.title}, ${from}–${to} — warp to it in the CV`);
        btn.innerHTML = `<span class="orrery-body"><img alt="" decoding="async"><span class="orrery-shade"></span></span>
            ${moons ? `<span class="orrery-moons" style="--moon-period:${(5 + i * 1.7).toFixed(1)}s">${
                Array.from({ length: moons }, (_, k) => `<i style="--a:${(360 / moons * k).toFixed(0)}deg"></i>`).join('')}</span>` : ''}
            <span class="orrery-label"><b>${p.title}</b><small>${from}–${to}${moons ? ` · ${moons} topic${moons > 1 ? 's' : ''}` : ''}</small></span>`;
        // Borrow the card's image once it has loaded: requesting the same file
        // in parallel downloaded every planet image twice (walk budget check).
        const planetImg = btn.querySelector('img');
        const cardImg = document.querySelector(`#item-${p.id} .portfolio-item-image-wrap img`);
        const borrow = () => { planetImg.src = cardImg.currentSrc || cardImg.src; planetImg.classList.add('is-ready'); };
        if (cardImg?.complete && cardImg.naturalWidth) borrow();
        else if (cardImg) cardImg.addEventListener('load', borrow, { once: true });
        else { planetImg.src = p.image; planetImg.classList.add('is-ready'); }
        // Launch: the planet swells towards you as the warp starts.
        btn.addEventListener('click', () => {
            if (!REDUCED()) {
                btn.classList.remove('is-launching'); void btn.offsetWidth;
                btn.classList.add('is-launching');
                setTimeout(() => btn.classList.remove('is-launching'), 700);
            }
            window.dispatchEvent(new CustomEvent('portfolio:selectProject', { detail: { id: p.id } }));
        });
        wrap.appendChild(btn);
        return { p, btn, orbit, shade: btn.querySelector('.orrery-shade'), i, angle: (i * 2.399) % (Math.PI * 2), paused: false };
    });
    grid.parentNode.insertBefore(wrap, grid);

    let R = { min: 70, max: 300, cx: 0, cy: 0 };
    const layout = () => {
        const w = wrap.clientWidth, h = wrap.clientHeight, phone = w < 600;
        TILT = phone ? 0.6 : 0.36;
        const n = planets.length;
        // Innermost orbit clears the sun plus a planet's radius.
        R = { min: Math.min(70, Math.max(56, w * 0.12)), cx: w / 2, cy: h / 2 };
        R.max = Math.max(R.min, Math.min(w / 2 - 34, (h / 2 - 36) / TILT));
        const gap = n > 1 ? (R.max - R.min) / (n - 1) : PLANET_MAX;
        // Planets shrink to the ring spacing once there are many of them.
        const size = Math.round(Math.max(PLANET_MIN, Math.min(phone ? PLANET_MAX_PHONE : PLANET_MAX, gap * 2)));
        wrap.style.setProperty('--planet', `${size}px`);
        planets.forEach(pl => {
            pl.r = n > 1 ? R.min + gap * pl.i : R.min;
            // Kepler's third law: period ∝ r^1.5 — the outer (older) worlds drift.
            pl.speed = (Math.PI * 2 / 22) * Math.pow(R.min / pl.r, 1.5);
            pl.orbit.style.width = `${pl.r * 2}px`;
            pl.orbit.style.height = `${pl.r * 2 * TILT}px`;
        });
        place();
    };
    const place = () => {
        for (const pl of planets) {
            const c = Math.cos(pl.angle), sn = Math.sin(pl.angle);
            const x = c * pl.r, y = sn * pl.r * TILT;
            const depth = sn;                                       // -1 back … 1 front
            const s = 0.72 + 0.28 * (depth + 1) / 2;
            pl.btn.style.transform = `translate(${(R.cx + x).toFixed(1)}px, ${(R.cy + y).toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
            // Passes in front of / behind the sun; a held planet (and its label)
            // rises above everything.
            pl.btn.style.zIndex = pl.paused ? 10 : depth > 0 ? 3 : 1;
            pl.btn.style.setProperty('--dim', ((1 - depth) * 0.22).toFixed(3));
            // Day side faces the sun: rotate the terminator towards it.
            pl.shade.style.transform = `rotate(${Math.atan2(-y, -x).toFixed(3)}rad)`;
        }
    };
    planets.forEach(pl => {
        const hold = on => {
            pl.paused = on;
            pl.btn.style.zIndex = on ? 10 : '';
            pl.btn.classList.toggle('is-held', on);
            pl.orbit.classList.toggle('is-held', on);
            wrap.classList.toggle('has-held', planets.some(q => q.paused));
        };
        pl.btn.addEventListener('pointerenter', () => hold(true));
        pl.btn.addEventListener('pointerleave', () => hold(false));
        pl.btn.addEventListener('focus', () => hold(true));
        pl.btn.addEventListener('blur', () => hold(false));
    });
    new ResizeObserver(layout).observe(wrap);
    layout();
    if (REDUCED()) return;
    new IntersectionObserver(([e]) => wrap.classList.toggle('is-idle', !e.isIntersecting)).observe(wrap);
    loopWhileVisible(wrap, dt => {
        for (const pl of planets) if (!pl.paused) pl.angle += pl.speed * dt;
        place();
    });
}

// ── Particles: the stack as a Standard Model chart ─────────────────────────

const FAMILIES = [
    { key: 'higgs', name: 'Scalar boson', note: 'gives everything its mass' },
    { key: 'quark', name: 'Quarks', note: 'languages & low-level APIs' },
    { key: 'lepton', name: 'Leptons', note: 'engines & frameworks' },
    { key: 'boson', name: 'Gauge bosons', note: 'platforms & tooling' },
];
const PARTICLES = [
    { sym: 'C++', name: 'C++', family: 'higgs', tags: ['C++17', 'C++20'] },
    { sym: 'C#', name: 'C#', family: 'quark', tags: ['C#'] },
    { sym: 'Vk', name: 'Vulkan', family: 'quark', tags: ['Vulkan'] },
    { sym: 'Win', name: 'Windows API', family: 'quark', tags: ['Windows API'] },
    { sym: 'UE', name: 'Unreal Engine', family: 'lepton', tags: ['Unreal Engine', 'Unreal Engine 4', 'Unreal Engine 5'] },
    { sym: 'Un', name: 'Unity', family: 'lepton', tags: ['Unity'] },
    { sym: 'PF', name: 'Photon Fusion', family: 'lepton', tags: ['Photon Fusion'] },
    { sym: 'St', name: 'Steam Online Subsystem', family: 'lepton', tags: ['Steam Online Subsystem'] },
    { sym: 'Lx', name: 'Linux', family: 'boson', tags: ['Linux'] },
    { sym: 'CM', name: 'CMake', family: 'boson', tags: ['CMake'] },
    { sym: 'Az', name: 'Azure DevOps', family: 'boson', tags: ['Azure DevOps'] },
];

function initParticles(projects) {
    const host = document.querySelector('#about .container');
    if (!host) return;
    // Sparklines share the ψ curve's career axis: first start year → end of this year.
    const first = sorted(projects.filter(p => p.showInTimeline))[0] || sorted(projects)[0];
    const axis0 = new Date(yearOf(first?.startDate) || 2015, 0, 1).getTime(), axis1 = new Date(NOW.getFullYear() + 1, 0, 1).getTime();
    const SW = 92, SH = 12;
    const sparkFor = used => {
        const pts = plot(sampleCareer(used.map(spanOf), axis0, axis1, 48), SW, SH, 1.5);
        return `<svg class="particle-spark" viewBox="0 0 ${SW} ${SH}" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path class="graph-fill" d="${areaPath(pts, SH)}"/><path class="graph-line" d="${linePath(pts)}"/></svg>`;
    };
    const block = document.createElement('div');
    block.className = 'particles';
    const tiles = PARTICLES.map(pt => {
        const used = projects.filter(p => (p.tags || []).some(t => pt.tags.includes(t)));
        if (!used.length) return '';
        const from = Math.min(...used.map(p => yearOf(p.startDate)));
        const ongoing = used.some(p => !p.endDate);
        const to = ongoing ? 'now' : Math.max(...used.map(p => yearOf(p.endDate)));
        const ids = used.map(p => p.id).join(' ');
        return `<button type="button" class="particle is-${pt.family}" data-family="${pt.family}" data-projects="${ids}" aria-pressed="false"
                    aria-label="${pt.name}: ${from}–${to}, ${used.length} project${used.length > 1 ? 's' : ''} — highlight them">
                    <span class="particle-years">${from}–${to}</span>
                    <span class="particle-count">×${used.length}</span>
                    <span class="particle-sym">${pt.sym}</span>
                    ${sparkFor(used)}
                    <span class="particle-name">${pt.name}</span>
                </button>`;
    });
    const groups = FAMILIES.map(f => {
        const items = PARTICLES.map((pt, i) => pt.family === f.key ? tiles[i] : '').join('');
        return `<div class="particle-family is-${f.key}"><p class="particle-family-name">${f.name}<small>${f.note}</small></p><div class="particle-row">${items}</div></div>`;
    }).join('');
    block.innerHTML = `<div class="section-head"><p class="section-eyebrow" aria-hidden="true">Particles</p>
        <h3 class="section-title particles-title">The standard model of my stack</h3></div>
        <div class="particle-chart">${groups}<svg class="feynman" aria-hidden="true"><defs>
            <marker id="feynArrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 1 L9 5 L0 9 z" fill="context-stroke"/></marker></defs></svg></div>
        <p class="particles-hint">Every tool is a ripple in its own field. Pick one to light up its projects —
            the lines show what it was used together with.</p>`;
    host.appendChild(block);
    // Sparklines plot themselves in, tile by tile, the first time the chart is seen.
    const sparks = [...block.querySelectorAll('.particle-spark .graph-line, .particle-spark .graph-fill')];
    armDraw(...sparks);
    onFirstReveal(block.querySelector('.particle-chart'), () => {
        block.querySelectorAll('.particle').forEach((t, i) => t.querySelectorAll('.graph-line, .graph-fill').forEach(n => drawIn(n, i * 40)));
    }, 0.15);
    const field = initField(block);
    const feynman = initFeynman(block, field);

    // Selecting a particle lights its projects in the portfolio.
    let active = null;
    block.addEventListener('click', e => {
        const tile = e.target.closest('.particle');
        if (!tile) return;
        const same = active === tile;
        block.querySelectorAll('.particle').forEach(t => t.setAttribute('aria-pressed', 'false'));
        document.querySelectorAll('#portfolioGrid .portfolio-item').forEach(c => c.classList.remove('is-lit', 'is-dim'));
        active = same ? null : tile;
        feynman.select(active);
        if (!active) return;
        active.setAttribute('aria-pressed', 'true');
        const ids = new Set(active.dataset.projects.split(' '));
        document.querySelectorAll('#portfolioGrid .portfolio-item').forEach(c => {
            const lit = ids.has(c.id.replace(/^item-/, ''));
            c.classList.toggle('is-lit', lit);
            c.classList.toggle('is-dim', !lit);
        });
    });
}

// ── Feynman lines: which tools were used together ──────────────────────────
// Two particles "interact" when they share a project. Lines follow Feynman
// diagram convention by what mediates them: a wavy photon line when a gauge
// boson (platform/tooling) is involved, a dashed scalar line for the Higgs
// (C++), a straight fermion line with an arrow otherwise.

const FAMILY_COLOUR = { quark: '--sm-quark', lepton: '--sm-lepton', boson: '--sm-boson', higgs: '--sm-higgs' };

function initFeynman(block, field) {
    const chart = block.querySelector('.particle-chart');
    const svg = chart.querySelector('.feynman');
    const tiles = [...chart.querySelectorAll('.particle')];
    const sets = new Map(tiles.map(t => [t, new Set(t.dataset.projects.split(' '))]));
    const partnersOf = t => tiles.filter(o => o !== t && [...sets.get(t)].some(id => sets.get(o).has(id)));
    const centre = t => [t.offsetLeft + t.offsetWidth / 2, t.offsetTop + t.offsetHeight / 2];
    const NS = 'http://www.w3.org/2000/svg';

    const pathFor = ([x1, y1], [x2, y2], kind) => {
        if (kind !== 'photon') {
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            return `M${x1} ${y1} L${mx} ${my} L${x2} ${y2}`;        // mid vertex carries the arrow
        }
        const len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(3, Math.round(len / 16));
        const ux = (x2 - x1) / len, uy = (y2 - y1) / len, A = 4;
        let d = `M${x1} ${y1}`;
        for (let k = 1; k <= n * 12; k++) {
            const t = k / (n * 12), off = Math.sin(t * n * Math.PI * 2) * A;
            d += ` L${(x1 + ux * len * t - uy * off).toFixed(1)} ${(y1 + uy * len * t + ux * off).toFixed(1)}`;
        }
        return d;
    };

    let shown = null, selected = null;
    const show = tile => {
        if (tile === shown) return;
        shown = tile;
        svg.querySelectorAll('.feyn-line, .feyn-vertex').forEach(n => n.remove());
        tiles.forEach(t => t.classList.remove('is-partner', 'is-source'));
        if (!tile) return;
        svg.setAttribute('width', chart.clientWidth);
        svg.setAttribute('height', chart.clientHeight);
        const a = centre(tile);
        tile.classList.add('is-source');
        partnersOf(tile).forEach((o, k) => {
            const fams = [tile.dataset.family, o.dataset.family];
            const kind = fams.includes('boson') ? 'photon' : fams.includes('higgs') ? 'scalar' : 'fermion';
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', pathFor(a, centre(o), kind));
            path.setAttribute('pathLength', '1');
            path.setAttribute('class', `feyn-line is-${kind}`);
            path.style.setProperty('--c', `var(${FAMILY_COLOUR[o.dataset.family]})`);
            path.style.animationDelay = `${k * 40}ms`;
            if (kind === 'fermion') path.setAttribute('marker-mid', 'url(#feynArrow)');
            svg.appendChild(path);
            o.classList.add('is-partner');
            // The interaction travels: each partner's field answers a beat later.
            if (field) setTimeout(() => field.exciteAt(o, 0.45), 140 + k * 50);
        });
        const v = document.createElementNS(NS, 'circle');
        v.setAttribute('cx', a[0]); v.setAttribute('cy', a[1]); v.setAttribute('r', 5);
        v.setAttribute('class', 'feyn-vertex');
        v.style.setProperty('--c', `var(${FAMILY_COLOUR[tile.dataset.family]})`);
        svg.appendChild(v);
        if (field) field.exciteAt(tile, 0.9);
    };
    const restore = () => show(selected);
    tiles.forEach(t => {
        t.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(t); });
        t.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') restore(); });
        t.addEventListener('focus', () => show(t));
        t.addEventListener('blur', restore);
    });
    new ResizeObserver(() => { const s = shown; shown = null; show(s); }).observe(chart);
    return { select: t => { selected = t; shown = null; show(t); } };
}

// ── Quantum field: the lattice the particles are ripples in ────────────────
// A damped 2-D wave equation on a coarse lattice (one cell per 18 px), drawn
// as dots on a canvas behind the chart. Hovering a particle excites its field
// at the tile; the pointer leaves a faint wake; empty space fizzes with
// virtual pairs — a + and a − bump that appear together and cancel out.
// Cost control: simulate and draw at 30 Hz, only while on screen, and sleep
// entirely once the field is calm (the next fluctuation wakes it).

const FIELD_FAMS = ['quark', 'lepton', 'boson', 'higgs'];

function initField(block) {
    const canvas = document.createElement('canvas');
    canvas.className = 'qfield';
    canvas.setAttribute('aria-hidden', 'true');
    block.prepend(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const SP = 18, C2 = 0.2, DAMP = 0.97, STEP = 1 / 60, FRAME = 1 / 30, CALM = 0.008;
    let w = 0, h = 0, cols = 0, rows = 0, u, prev, next, fam, colours = [];
    let running = false, inView = false, raf = 0, last = 0, acc = 0, sinceDraw = 0, fizz = 0;

    const resize = () => {
        w = block.clientWidth; h = block.clientHeight;
        const dpr = Math.min(1.5, window.devicePixelRatio || 1);
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
        canvas.style.width = `${w}px`; canvas.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cols = Math.ceil(w / SP) + 1; rows = Math.ceil(h / SP) + 1;
        u = new Float32Array(cols * rows); prev = new Float32Array(cols * rows);
        next = new Float32Array(cols * rows); fam = new Uint8Array(cols * rows);
        const cs = getComputedStyle(block);
        colours = ['rgba(129, 168, 209, ALPHA)', ...FIELD_FAMS.map(f => {
            const hex = cs.getPropertyValue(`--sm-${f}`).trim() || '#ffffff';
            const n = parseInt(hex.slice(1), 16);
            return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ALPHA)`;
        })];
        draw();
    };

    const step = () => {
        let peak = 0;
        for (let y = 1; y < rows - 1; y++) {
            for (let x = 1, k = y * cols + 1; x < cols - 1; x++, k++) {
                const lap = u[k - 1] + u[k + 1] + u[k - cols] + u[k + cols] - 4 * u[k];
                const n = (2 * u[k] - prev[k] + C2 * lap) * DAMP;
                next[k] = n;
                const a = n < 0 ? -n : n;
                if (a > peak) peak = a;
            }
        }
        const t = prev; prev = u; u = next; next = t;
        return peak;
    };

    // 5 colours × 4 brightness buckets, one path each: a handful of fills per frame.
    const draw = () => {
        ctx.clearRect(0, 0, w, h);
        const buckets = Array.from({ length: 20 }, () => []);
        for (let k = 0, n = cols * rows; k < n; k++) {
            const a = u[k] < 0 ? -u[k] : u[k];
            const b = a < 0.02 ? 0 : a < 0.08 ? 1 : a < 0.25 ? 2 : 3;
            buckets[(b ? fam[k] : 0) * 4 + b].push(k);
        }
        const ALPHA = [0.16, 0.32, 0.55, 0.85], SIZE = [1.3, 1.7, 2.2, 2.8];
        for (let i = 0; i < 20; i++) {
            const list = buckets[i];
            if (!list.length) continue;
            const b = i % 4, s = SIZE[b];
            ctx.fillStyle = colours[(i / 4) | 0].replace('ALPHA', ALPHA[b]);
            ctx.beginPath();
            for (const k of list) {
                const x = (k % cols) * SP, y = ((k / cols) | 0) * SP - u[k] * 7;
                ctx.rect(x - s / 2, y - s / 2, s, s);
            }
            ctx.fill();
        }
    };

    const frame = t => {
        const dt = last ? Math.min(0.1, (t - last) / 1000) : 0;
        last = t;
        acc += dt; sinceDraw += dt;
        let peak = 1;
        while (acc >= STEP) { peak = step(); acc -= STEP; }
        if (sinceDraw >= FRAME) { sinceDraw = 0; draw(); }
        if (peak < CALM) { running = false; draw(); return; }      // sleep until excited
        raf = requestAnimationFrame(frame);
    };
    const wake = () => {
        if (running || !inView || document.hidden || REDUCED()) return;
        running = true; last = 0; acc = 0;
        raf = requestAnimationFrame(frame);
    };

    const excite = (px, py, amp, family = 0, radius = 1.4) => {
        if (REDUCED() || !cols) return;
        const cx = px / SP, cy = py / SP, R = Math.ceil(radius * 3);
        for (let y = Math.max(1, Math.floor(cy - R)); y <= Math.min(rows - 2, Math.ceil(cy + R)); y++) {
            for (let x = Math.max(1, Math.floor(cx - R)); x <= Math.min(cols - 2, Math.ceil(cx + R)); x++) {
                const g = amp * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * radius * radius));
                const k = y * cols + x;
                u[k] += g; prev[k] += g * 0.6;                 // a little outward velocity
                if (Math.abs(g) > 0.04 && family) fam[k] = family;
            }
        }
        wake();
    };
    const famIndex = t => FIELD_FAMS.indexOf(t.dataset.family) + 1;
    const exciteAt = (tile, amp) => {
        const br = block.getBoundingClientRect(), r = tile.getBoundingClientRect();
        excite(r.left + r.width / 2 - br.left, r.top + r.height / 2 - br.top, amp, famIndex(tile), 1.8);
    };

    // Virtual pairs: a + and − bump side by side, every few seconds.
    const fluctuate = () => {
        clearTimeout(fizz);
        if (REDUCED()) return;
        fizz = setTimeout(fluctuate, 2600 + Math.random() * 2400);
        if (!inView || document.hidden) return;
        const x = SP * 2 + Math.random() * (w - SP * 4), y = SP * 2 + Math.random() * (h - SP * 4);
        const f = 1 + Math.floor(Math.random() * 4), dx = (Math.random() < 0.5 ? -1 : 1) * SP * 1.5;
        excite(x, y, 0.28, f, 1);
        excite(x + dx, y, -0.28, f, 1);
    };

    // The pointer leaves a faint wake (fine pointers only; on touch the
    // particles' own taps excite the field).
    if (window.matchMedia('(pointer: fine)').matches) {
        let lx = -1e3, ly = -1e3, lt = 0;
        block.addEventListener('pointermove', e => {
            const now = performance.now();
            const br = block.getBoundingClientRect(), x = e.clientX - br.left, y = e.clientY - br.top;
            if (now - lt < 45 || Math.hypot(x - lx, y - ly) < 10) return;
            lt = now; lx = x; ly = y;
            excite(x, y, 0.14, 0, 1.1);
        });
    }

    new ResizeObserver(resize).observe(block);
    new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) wake(); }).observe(block);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
    resize();
    fluctuate();
    return { exciteAt };
}

// ── Collapse: the CV gate's date in superposition ──────────────────────────
// timeline.js measures how close the gate is to the centre and broadcasts it
// as `timeline:gate` {charge}; charge 1 is the moment the jump launches. Until
// then the date is uncertain: |ψ|² over the career is a wide, rippling packet
// and the readout flickers between outcomes. As charge rises the packet
// narrows onto the first start date and the readout settles — then collapses.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function initCollapse(projects) {
    const intro = document.getElementById('cvIntro');
    if (!intro) return;
    const first = sorted(projects.filter(p => p.showInTimeline))[0];
    const [fy, fm] = String(first?.startDate || '2015-01').split('-').map(Number);
    const y0 = fy, y1 = NOW.getFullYear();
    const readout = document.createElement('div');
    readout.className = 'psi';
    readout.setAttribute('aria-hidden', 'true');
    const W = 240, H = 44;
    readout.innerHTML = `<svg class="psi-density" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
            <path class="graph-fill psi-fill" d=""/><path class="graph-line psi-line" d=""/>
            <line class="graph-axis" x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}"/>
        </svg>
        <div class="psi-axis-labels graph-label"><span>${y0}</span><span>now</span></div>
        <div class="psi-row"><span class="psi-label">ψ(t)</span><span class="psi-value"><span class="psi-month">${MONTHS[fm - 1]}</span> <span class="psi-year">${fy}</span></span></div>`;
    intro.prepend(readout);
    const fill = readout.querySelector('.psi-fill'), line = readout.querySelector('.psi-line');
    const yearEl = readout.querySelector('.psi-year'), monthEl = readout.querySelector('.psi-month');

    // Where the first start date sits on the career axis (0…1).
    const span = (y1 + 1) - y0;
    const target = ((fy - y0) + (fm - 1) / 12) / span;
    const POINTS = 72;
    let phase = 0;
    const draw = u => {
        // Centre drifts from mid-career onto the start date; width shrinks with
        // u; interference fringes ripple through the packet while uncertain.
        const mu = target + (0.5 - target) * u;
        const sigma = 0.012 + u * 0.32;
        const pts = [];
        for (let i = 0; i <= POINTS; i++) {
            const x = i / POINTS;
            const g = Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
            const fringe = 1 - u * 0.55 * (0.5 + 0.5 * Math.cos(x * 38 - phase));
            pts.push([x * W, H - 2 - g * fringe * (H - 6)]);
        }
        line.setAttribute('d', linePath(pts));
        fill.setAttribute('d', areaPath(pts, H));
    };

    // The curve plots itself in the first time the readout scrolls into view.
    armDraw(line, fill);
    onFirstReveal(readout, () => { drawIn(line); drawIn(fill); });

    let u = 1, collapsed = false;
    const settle = () => {
        collapsed = true;
        yearEl.textContent = y0; monthEl.textContent = MONTHS[fm - 1];
        readout.style.setProperty('--u', '0');
        readout.classList.remove('is-collapsed'); void readout.offsetWidth;
        readout.classList.add('is-collapsed');
        draw(0);
    };
    if (REDUCED()) { settle(); return; }
    window.addEventListener('timeline:gate', e => { u = 1 - e.detail.charge; });

    let acc = 0;
    draw(1);
    loopWhileVisible(readout, dt => {
        readout.style.setProperty('--u', u.toFixed(3));
        if (u <= 0.001) { if (!collapsed) settle(); return; }
        if (collapsed) { collapsed = false; readout.classList.remove('is-collapsed'); }
        phase += dt * (1.5 + u * 4);              // integrated (AGENTS.md)
        draw(u);
        // The more uncertain, the faster the readout flickers through history.
        acc += dt;
        if (acc > 0.04 + (1 - u) * 0.22) {
            acc = 0;
            // Sample an outcome from the packet's neighbourhood, not uniformly.
            // Never before the first start date: that outcome doesn't exist.
            const x = Math.max(target, Math.min(0.999, target + (0.5 - target) * u + (Math.random() - 0.5) * (0.05 + u * 1.1)));
            const t = x * span;
            yearEl.textContent = y0 + Math.floor(t);
            monthEl.textContent = MONTHS[Math.floor((t % 1) * 12)];
        }
    });
}
