import { prefersReducedMotion } from './scripts.js';

export function initPortfolio(projects) {
    generatePortfolioItems(projects);
    handlePortfolioItems();
}

// ─── Card Generation ──────────────────────────────────────────────────────────

function generatePortfolioItems(projects) {
    const grid = document.getElementById('portfolioGrid');
    if (!grid) return;
    grid.innerHTML = '';

    projects.filter(p => p.showInPortfolio).forEach(project => {
        const tagsHtml = (project.tags || [])
            .map(t => `<span class="portfolio-tag">${t}</span>`)
            .join('');

        const item = document.createElement('div');
        item.className = 'portfolio-item';
        item.id = `item-${project.id}`;
        // Clickable, so it needs to behave like a control for keyboard and
        // screen-reader users too.
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-label', `${project.title} — view in CV timeline`);
        // Video is lazy in the strongest sense: no src at all until the card is
        // first hovered (see startCardVideo). The poster image carries the card
        // until then, so an un-hovered grid costs zero video bytes.
        const videoHtml = (project.cardVideo && !prefersReducedMotion() && !isDataSaver())
            ? `<video class="portfolio-item-video" muted loop playsinline preload="none"
                      data-src="${project.cardVideo}" aria-hidden="true" tabindex="-1"></video>`
            : '';

        item.innerHTML = `
            <div class="portfolio-item-image-wrap">
                <img src="${project.image}" alt="${project.title}" loading="lazy" decoding="async">
                ${videoHtml}
            </div>
            <div class="portfolio-item-body">
                <h3>${project.title}</h3>
                ${project.subtitle ? `<p class="portfolio-subtitle">${project.subtitle}</p>` : ''}
                <p class="portfolio-description">${project.description}</p>
                ${tagsHtml ? `<div class="portfolio-tags">${tagsHtml}</div>` : ''}
            </div>
            <div class="click-indicator">View in CV &#8594;</div>
        `;
        const activate = () => scrollToCVAndHighlight(project.id);
        item.addEventListener('click', activate);
        item.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
        });
        grid.appendChild(item);
    });

    // Observe newly added items for scroll-in animation
    observeItems(grid.querySelectorAll('.portfolio-item'));
}

function observeItems(elements) {
    if (prefersReducedMotion()) {
        elements.forEach(el => el.classList.add('visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            entry.target.classList.toggle('visible', entry.isIntersecting);
        });
    }, { threshold: 0.1 });

    elements.forEach(el => {
        el.classList.add('animate');
        el.style.transitionDelay = `${Math.random() * 0.25}s`;
        observer.observe(el);
    });
}

// ─── Click: Scroll to CV ──────────────────────────────────────────────────────

function scrollToCVAndHighlight(projectId) {
    // Timeline enters immersive and scrolls to the CV section itself
    window.dispatchEvent(new CustomEvent('portfolio:selectProject', { detail: { id: projectId } }));
}

// ─── Card Preview Video ───────────────────────────────────────────────────────

function isDataSaver() {
    const c = navigator.connection;
    return !!c?.saveData || /(^|-)2g$/.test(c?.effectiveType || '');
}

function startCardVideo(item) {
    const v = item.querySelector('.portfolio-item-video');
    if (!v) return;
    // Attach the source on first hover only.
    if (v.dataset.src) {
        v.src = v.dataset.src;
        delete v.dataset.src;
        v.preload = 'auto';
        v.load();
    }
    v.play().then(() => {
        item.classList.add('video-playing');
    }).catch(() => { /* autoplay refused — the still image stays */ });
}

function stopCardVideo(item) {
    const v = item.querySelector('.portfolio-item-video');
    if (!v) return;
    item.classList.remove('video-playing');
    if (!v.paused) v.pause();
    // Restart next hover rather than resuming mid-clip.
    try { v.currentTime = 0; } catch { /* not seekable yet */ }
}

// ─── 3D Hover Effect ──────────────────────────────────────────────────────────

// Monotonic stacking counter — the most recently hovered card is always on top.
let topZ = 10;

function handlePortfolioItems() {
    const ROTATION     = 25;   // max degrees of tilt
    const SCALE        = 1.35; // zoom on hover
    const EDGE_GUTTER  = 12;   // keep this much viewport margin when scaling

    // Pointer-only affordance. On touch there is no hover state and no
    // "leave" event to undo the tilt with, so the card used to stay stuck at
    // scale(1.35) after any scroll that grazed it. Devices without a fine
    // pointer simply don't get the effect.
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    if (!finePointer.matches) return;

    document.querySelectorAll('.portfolio-item').forEach(item => {
        let hovered = false;
        let resetTimer = null;
        let base = null;   // untransformed geometry, measured once per hover

        // getBoundingClientRect() reports the *transformed* box. Reading it
        // inside move() fed the card's own scale and translate back into the
        // next frame's calculation — a feedback loop that made narrow windows
        // flash between zoom levels. Measure with the transform cleared, cache
        // it, and drive everything from that.
        const measure = () => {
            const prev = item.style.transform;
            item.style.transform = 'none';
            const r = item.getBoundingClientRect();
            base = {
                w: r.width,
                h: r.height,
                docLeft: r.left + window.scrollX,
                docTop:  r.top  + window.scrollY,
            };
            item.style.transform = prev;
        };

        const enter = () => {
            hovered = true;
            clearTimeout(resetTimer);
            measure();
            // Disable the scroll-in transition while hovering so movement is 1:1
            item.style.transition = 'box-shadow 0.2s ease';
            item.style.boxShadow = '0 24px 48px rgba(0, 0, 0, 0.55)';
            // Always above every previously-hovered card. A fixed z-index tied
            // with the neighbour still spring-ing back, so DOM order decided and
            // the newly hovered card sat behind it for the whole 500ms reset.
            item.style.zIndex = String(++topZ);
        };

        const move = (clientX, clientY) => {
            if (!base) measure();

            const left = base.docLeft - window.scrollX;
            const top  = base.docTop  - window.scrollY;

            const relX = clientX - (left + base.w / 2);
            const relY = clientY - (top  + base.h / 2);
            const rotateY = ( relX / base.w) * ROTATION;
            const rotateX = (-relY / base.h) * ROTATION;

            // Never scale a card wider than the viewport can hold — on a narrow
            // window the card already spans the full column, and 1.35x put both
            // edges off-screen where no translate could rescue it.
            const maxScale = (window.innerWidth - EDGE_GUTTER * 2) / base.w;
            const scale = Math.max(1, Math.min(SCALE, maxScale));

            // Keep the scaled card inside the viewport.
            const extra = (base.w * scale - base.w) / 2;
            const right = window.innerWidth - (left + base.w);
            let tx = 0;
            if (left < extra)       tx =  extra - left;
            else if (right < extra) tx = -(extra - right);

            // translateX BEFORE scale, so tx stays in screen pixels; after
            // scale it was silently multiplied by the scale factor.
            item.style.transform =
                `perspective(1000px) translateX(${tx.toFixed(2)}px) scale(${scale.toFixed(4)}) ` +
                `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
        };

        const leave = () => {
            hovered = false;
            base = null;
            item.style.transition =
                'transform 0.45s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease';
            item.style.transform = '';
            item.style.boxShadow = '';
            stopCardVideo(item);
            // Clear inline overrides once the spring-back finishes
            resetTimer = setTimeout(() => {
                if (!hovered) {
                    item.style.transition = '';
                    item.style.zIndex = '';
                }
            }, 500);
        };

        // Mouse
        item.addEventListener('mouseenter', () => { enter(); startCardVideo(item); });
        item.addEventListener('mousemove',  e => move(e.clientX, e.clientY));
        item.addEventListener('mouseleave', leave);
        // A resize invalidates the cached geometry.
        window.addEventListener('resize', () => { if (hovered) measure(); });
        // Safety net: a card can lose its mouseleave (e.g. the element is
        // re-rendered, or the window loses focus mid-hover).
        item.addEventListener('blur', leave);
        window.addEventListener('blur', leave);

        // Press feedback on the click indicator
        const pressIn  = () => { const ind = item.querySelector('.click-indicator'); if (ind) ind.style.transform = 'translateX(-50%) scale(0.92)'; };
        const pressOut = () => { const ind = item.querySelector('.click-indicator'); if (ind) ind.style.transform = 'translateX(-50%) scale(1)'; };
        item.addEventListener('mousedown',  pressIn);
        item.addEventListener('mouseup',    pressOut);
    });
}
