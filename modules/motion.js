// Motion: the juice layer — principles in Docs/MOTION.md.
//   - magnetic primary buttons (fine pointer only): the button leans towards
//     the pointer, like a destination with gravity;
//   - a star burst from the press point on buttons and cards: a press
//     launches travel.
// Nothing here runs under reduced motion; CSS keeps the non-motion feedback.

import { prefersReducedMotion } from './scripts.js';

export function initMotion() {
    if (prefersReducedMotion()) return;
    setupMagnetic();
    setupStarBurst();
}

// ── Magnetic buttons ───────────────────────────────────────────────────────

const MAGNET_MAX = 6;   // px the button may lean

function setupMagnetic() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.cta-button').forEach(btn => {
        // Measured once per hover, with no pull applied — reading the rect on
        // every move would include the button's own offset and feed back
        // (the same trap as the card tilt, see AGENTS.md).
        let rect = null;
        btn.addEventListener('pointerenter', () => {
            btn.style.setProperty('--mx', '0px');
            btn.style.setProperty('--my', '0px');
            rect = btn.getBoundingClientRect();
        });
        btn.addEventListener('pointermove', e => {
            if (!rect) return;
            const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
            const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
            const clamp = v => Math.max(-1, Math.min(1, v));
            btn.style.setProperty('--mx', `${(clamp(dx) * MAGNET_MAX).toFixed(2)}px`);
            btn.style.setProperty('--my', `${(clamp(dy) * MAGNET_MAX * 0.6).toFixed(2)}px`);
        });
        btn.addEventListener('pointerleave', () => {
            rect = null;
            btn.style.removeProperty('--mx');
            btn.style.removeProperty('--my');
        });
    });
}

// ── Star burst ─────────────────────────────────────────────────────────────

const BURST_COUNT = 8;

function fxLayer() {
    let layer = document.getElementById('fxLayer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'fxLayer';
        layer.setAttribute('aria-hidden', 'true');
        document.body.appendChild(layer);
    }
    return layer;
}

export function starBurst(x, y) {
    if (prefersReducedMotion()) return;
    const layer = fxLayer();
    for (let i = 0; i < BURST_COUNT; i++) {
        const star = document.createElement('span');
        star.className = 'fx-star' + (i % 3 === 0 ? ' is-white' : '');
        // Evenly spread with jitter, so it reads as a burst, not a blob.
        const angle = (i / BURST_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6;
        const dist = 28 + Math.random() * 30;
        star.style.left = `${x}px`;
        star.style.top = `${y}px`;
        star.style.setProperty('--dx', `${(Math.cos(angle) * dist).toFixed(1)}px`);
        star.style.setProperty('--dy', `${(Math.sin(angle) * dist).toFixed(1)}px`);
        star.style.setProperty('--rot', `${Math.round((Math.random() - 0.5) * 180)}deg`);
        star.style.setProperty('--s', (0.6 + Math.random() * 0.7).toFixed(2));
        layer.appendChild(star);
        star.addEventListener('animationend', () => star.remove(), { once: true });
    }
}

function setupStarBurst() {
    document.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const target = e.target.closest('.cta-button, .portfolio-item');
        if (target) starBurst(e.clientX, e.clientY);
    });
}
