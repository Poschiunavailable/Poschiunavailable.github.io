// Science layer (adopted from explore/science, STATUS D10) — four visual ideas, each tied
// to "travel between projects" (Docs/MOTION.md):
//   - atom:      electrons orbit the portrait in the hero; hover excites them
//   - orrery:    the projects as planets orbiting "now" — click one to warp to it
//   - particles: the tech stack as a Standard Model chart, built from
//                projects.json tags; a tile lights the projects that used it
//   - collapse:  the CV gate's year is in superposition until you scroll to it
// Every number shown is derived from projects.json — nothing is invented.
// Reduced motion: everything renders static; no animation loops start.

import { prefersReducedMotion } from './scripts.js';

const REDUCED = () => prefersReducedMotion();
const NOW = new Date();
const yearOf = s => Number(String(s || '').slice(0, 4)) || null;
const sorted = projects => [...projects].sort((a, b) => String(a.startDate).localeCompare(String(b.startDate)));

export function initScience(projects) {
    initAtom();
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

// ── Atom: orbits around the portrait ────────────────────────────────────────

function initAtom() {
    const host = document.querySelector('.hero .hero-image');
    if (!host) return;
    const atom = document.createElement('div');
    atom.className = 'atom';
    atom.setAttribute('aria-hidden', 'true');
    const TILTS = [0, 60, 120].map(d => d * Math.PI / 180);
    const ECC = 0.32;                                    // minor/major axis ratio
    const orbits = TILTS.map((tilt, i) => {
        const ring = document.createElement('span');
        ring.className = 'atom-ring';
        ring.style.setProperty('--tilt', `${tilt}rad`);
        const e = document.createElement('span');
        e.className = 'atom-electron';
        atom.append(ring, e);
        // Phase is integrated per frame (AGENTS.md: never derive it from time).
        return { tilt, ring, e, phase: i * 2.1, speed: (Math.PI * 2) / (5.2 + i * 1.3) };
    });
    host.appendChild(atom);

    let R = 0;
    const layout = () => {
        R = host.clientWidth * 0.86;
        orbits.forEach(o => { o.ring.style.width = `${R * 2}px`; o.ring.style.height = `${R * 2 * ECC}px`; });
        place();
    };
    const place = () => {
        for (const o of orbits) {
            const x = Math.cos(o.phase) * R, y = Math.sin(o.phase) * R * ECC;
            const X = x * Math.cos(o.tilt) - y * Math.sin(o.tilt);
            const Y = x * Math.sin(o.tilt) + y * Math.cos(o.tilt);
            o.e.style.transform = `translate(${X.toFixed(1)}px, ${Y.toFixed(1)}px)`;
            // Behind the portrait on the far half of the orbit.
            o.e.style.zIndex = Math.sin(o.phase) < 0 ? 0 : 2;
        }
    };
    new ResizeObserver(layout).observe(host);
    layout();
    if (REDUCED()) return;

    // Hover "excites" the atom: speed eases up to ×3.2 and back down.
    let excite = 0, target = 0;
    host.addEventListener('pointerenter', () => { target = 1; host.classList.add('is-excited'); });
    host.addEventListener('pointerleave', () => { target = 0; host.classList.remove('is-excited'); });
    loopWhileVisible(host, dt => {
        excite += (target - excite) * Math.min(1, dt * 4);
        const rate = 1 + excite * 2.2;
        for (const o of orbits) o.phase += o.speed * rate * dt;
        place();
    });
}

// ── Orrery: projects orbiting "now" ─────────────────────────────────────────

function initOrrery(projects) {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;
    const list = sorted(projects.filter(p => p.showInPortfolio)).reverse();   // newest innermost
    const wrap = document.createElement('div');
    wrap.className = 'orrery';
    wrap.setAttribute('role', 'group');
    wrap.setAttribute('aria-label', 'Projects as an orrery — choose a destination to warp to it in the CV');
    wrap.innerHTML = `<div class="orrery-sun"><span>now</span></div>
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
        btn.setAttribute('aria-label', `${p.title}, ${from}–${to} — warp to it in the CV`);
        btn.innerHTML = `<img alt="" decoding="async">
            <span class="orrery-label"><b>${p.title}</b><small>${from}–${to}</small></span>`;
        // Borrow the card's image once it has loaded: requesting the same file
        // in parallel downloaded every planet image twice (walk budget check).
        const planetImg = btn.querySelector('img');
        const cardImg = document.querySelector(`#item-${p.id} .portfolio-item-image-wrap img`);
        const borrow = () => { planetImg.src = cardImg.currentSrc || cardImg.src; planetImg.classList.add('is-ready'); };
        if (cardImg?.complete && cardImg.naturalWidth) borrow();
        else if (cardImg) cardImg.addEventListener('load', borrow, { once: true });
        else planetImg.src = p.image;
        btn.addEventListener('click', () => window.dispatchEvent(new CustomEvent('portfolio:selectProject', { detail: { id: p.id } })));
        wrap.appendChild(btn);
        // Spread the starting angles so the planets don't line up.
        return { p, btn, orbit, i, angle: (i * 2.399) % (Math.PI * 2), paused: false };
    });
    grid.parentNode.insertBefore(wrap, grid);

    let R = { min: 70, max: 300, cx: 0, cy: 0 };
    const layout = () => {
        const w = wrap.clientWidth, h = wrap.clientHeight;
        TILT = w < 600 ? 0.6 : 0.36;
        // Innermost orbit clears the sun plus a planet's radius.
        R = { min: Math.min(70, Math.max(56, w * 0.12)), max: Math.min(w / 2 - 34, (h / 2 - 36) / TILT), cx: w / 2, cy: h / 2 };
        planets.forEach(pl => {
            pl.r = planets.length > 1 ? R.min + (R.max - R.min) * pl.i / (planets.length - 1) : R.min;
            // Kepler's third law: period ∝ r^1.5 — the outer (older) worlds drift.
            pl.speed = (Math.PI * 2 / 22) * Math.pow(R.min / pl.r, 1.5);
            pl.orbit.style.width = `${pl.r * 2}px`;
            pl.orbit.style.height = `${pl.r * 2 * TILT}px`;
        });
        place();
    };
    const place = () => {
        for (const pl of planets) {
            const x = Math.cos(pl.angle) * pl.r, y = Math.sin(pl.angle) * pl.r * TILT;
            const depth = Math.sin(pl.angle);                       // -1 back … 1 front
            const s = 0.72 + 0.28 * (depth + 1) / 2;
            pl.btn.style.transform = `translate(${(R.cx + x).toFixed(1)}px, ${(R.cy + y).toFixed(1)}px) translate(-50%, -50%) scale(${s.toFixed(3)})`;
            pl.btn.style.zIndex = depth > 0 ? 3 : 1;                // passes in front of / behind the sun
            pl.btn.style.setProperty('--dim', ((1 - depth) * 0.22).toFixed(3));
        }
    };
    planets.forEach(pl => {
        const hold = on => { pl.paused = on; pl.btn.classList.toggle('is-held', on); };
        pl.btn.addEventListener('pointerenter', () => hold(true));
        pl.btn.addEventListener('pointerleave', () => hold(false));
        pl.btn.addEventListener('focus', () => hold(true));
        pl.btn.addEventListener('blur', () => hold(false));
    });
    new ResizeObserver(layout).observe(wrap);
    layout();
    if (REDUCED()) return;
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
    const block = document.createElement('div');
    block.className = 'particles';
    const tiles = PARTICLES.map(pt => {
        const used = projects.filter(p => (p.tags || []).some(t => pt.tags.includes(t)));
        if (!used.length) return '';
        const from = Math.min(...used.map(p => yearOf(p.startDate)));
        const ongoing = used.some(p => !p.endDate);
        const to = ongoing ? 'now' : Math.max(...used.map(p => yearOf(p.endDate)));
        const ids = used.map(p => p.id).join(' ');
        return `<button type="button" class="particle is-${pt.family}" data-projects="${ids}"
                    aria-label="${pt.name}: ${from}–${to}, ${used.length} project${used.length > 1 ? 's' : ''} — highlight them">
                    <span class="particle-years">${from}–${to}</span>
                    <span class="particle-count">×${used.length}</span>
                    <span class="particle-sym">${pt.sym}</span>
                    <span class="particle-name">${pt.name}</span>
                </button>`;
    });
    const groups = FAMILIES.map(f => {
        const items = PARTICLES.map((pt, i) => pt.family === f.key ? tiles[i] : '').join('');
        return `<div class="particle-family is-${f.key}"><p class="particle-family-name">${f.name}<small>${f.note}</small></p><div class="particle-row">${items}</div></div>`;
    }).join('');
    block.innerHTML = `<div class="section-head"><p class="section-eyebrow" aria-hidden="true">Particles</p>
        <h3 class="section-title particles-title">The standard model of my stack</h3></div>
        <div class="particle-chart">${groups}</div>
        <p class="particles-hint">Pick a particle to light up the projects it was part of.</p>`;
    host.appendChild(block);

    // Selecting a particle lights its projects in the portfolio.
    let active = null;
    block.addEventListener('click', e => {
        const tile = e.target.closest('.particle');
        if (!tile) return;
        const same = active === tile;
        block.querySelectorAll('.particle').forEach(t => t.setAttribute('aria-pressed', 'false'));
        document.querySelectorAll('#portfolioGrid .portfolio-item').forEach(c => c.classList.remove('is-lit', 'is-dim'));
        active = same ? null : tile;
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
            <path class="psi-fill" d=""/><path class="psi-line" d=""/>
            <line class="psi-axis" x1="0" y1="${H - 0.5}" x2="${W}" y2="${H - 0.5}"/>
        </svg>
        <div class="psi-axis-labels"><span>${y0}</span><span>now</span></div>
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
        let top = '', pts = [];
        for (let i = 0; i <= POINTS; i++) {
            const x = i / POINTS;
            const g = Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
            const fringe = 1 - u * 0.55 * (0.5 + 0.5 * Math.cos(x * 38 - phase));
            pts.push([x * W, H - 2 - g * fringe * (H - 6)]);
        }
        top = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
        line.setAttribute('d', top);
        fill.setAttribute('d', `${top}L${W} ${H}L0 ${H}Z`);
    };

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
