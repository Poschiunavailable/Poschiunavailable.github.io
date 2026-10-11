// Shared line-graph helpers (no dependencies). One language for every small
// graph on the site: the ψ readout (science.js), the time-machine HUD career
// curve (timeline.js) and the particle-tile sparklines (science.js). Styling is
// in styles/graph.css (.graph-line, .graph-fill, .graph-axis, ...).
// Graphs are static SVG; nothing here starts an animation loop.

import { prefersReducedMotion } from './scripts.js';

const r1 = n => (Math.round(n * 10) / 10).toString();

// "M x y L x y ..." from [[x, y], ...], 1-decimal rounding.
export function linePath(points) {
    return points.map(([x, y], i) => `${i ? 'L' : 'M'}${r1(x)} ${r1(y)}`).join('');
}

// The same line closed down to `baseline` (a y value): a fill under the curve.
export function areaPath(points, baseline) {
    if (!points.length) return '';
    const last = points[points.length - 1][0], first = points[0][0];
    return `${linePath(points)}L${r1(last)} ${r1(baseline)}L${r1(first)} ${r1(baseline)}Z`;
}

// Values 0…1 -> [x, y] points inside a W×H box, `pad` kept clear top/bottom.
export function plot(values, W, H, pad = 2) {
    const n = values.length - 1 || 1;
    return values.map((v, i) => [(i / n) * W, H - pad - v * (H - pad * 2)]);
}

// One smooth hump per span (raised cosine across start→end, height 1), joined
// with MAX over a low floor, so every chapter is its own hill and a gap is just
// a trough. spans: [[startMs, endMs], ...]; returns n values in floor…1.
// A span shorter than MIN_FRAC of the axis is widened (about its centre) so a
// short chapter still shows as a hill rather than vanishing between samples.
export function sampleCareer(spans, start, end, n, floor = 0.12) {
    const total = end - start, MIN_FRAC = 0.035;
    const out = new Array(n).fill(floor);
    if (!(total > 0) || n < 2) return out;
    for (const [a0, b0] of spans) {
        let a = a0, b = b0;
        if (!(b > a)) b = a;
        const mid = (a + b) / 2, half = Math.max((b - a) / 2, MIN_FRAC * total / 2);
        a = mid - half; b = mid + half;
        for (let i = 0; i < n; i++) {
            const t = start + total * (i / (n - 1));
            if (t < a || t > b) continue;
            const h = 0.5 - 0.5 * Math.cos(2 * Math.PI * ((t - a) / (b - a)));
            if (h > out[i]) out[i] = h;
        }
    }
    return out;
}

// Draw-in: the line plots itself once. Call armDraw() when building (hides the
// line, no flash) and drawIn() when the graph is first revealed. Both are no-ops
// under prefers-reduced-motion (the CSS has the same guard).
export function armDraw(...paths) {
    if (prefersReducedMotion()) return;
    for (const p of paths) { if (!p) continue; p.setAttribute('pathLength', '1'); p.classList.add('graph-armed'); }
}

export function drawIn(path, delayMs = 0) {
    if (!path || prefersReducedMotion()) return;
    path.setAttribute('pathLength', '1');
    path.style.animationDelay = `${Math.round(delayMs)}ms`;
    path.classList.remove('graph-armed');
    path.classList.add('graph-draw');
    path.addEventListener('animationend', () => {
        path.classList.remove('graph-draw');
        path.style.animationDelay = '';
    }, { once: true });
}

// Run `fn` once, the first time `el` is on screen.
export function onFirstReveal(el, fn, threshold = 0.25) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    const io = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        fn();
    }, { threshold });
    io.observe(el);
}
