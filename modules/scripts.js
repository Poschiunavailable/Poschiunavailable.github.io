export const prefersReducedMotion = () =>
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initScripts() {
    setupNavToggle();
    setupHeroVideo();
    animateOnScroll();
    setupSmoothScrolling();
}

// ─── Mobile Navigation ────────────────────────────────────────────────────────

function setupNavToggle() {
    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;

    const setOpen = (open) => {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        links.classList.toggle('open', open);
    };

    toggle.addEventListener('click', () => {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close after picking a destination, otherwise the drawer covers the page
    links.addEventListener('click', (e) => {
        if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
            setOpen(false);
            toggle.focus();
        }
    });

    // Clicking outside the navbar dismisses it
    document.addEventListener('click', (e) => {
        if (toggle.getAttribute('aria-expanded') !== 'true') return;
        if (!e.target.closest('.navbar')) setOpen(false);
    });

    // Leaving the mobile breakpoint must not strand the drawer open
    const mq = window.matchMedia('(max-width: 768px)');
    mq.addEventListener('change', (e) => { if (!e.matches) setOpen(false); });
}

// ─── Smooth Scrolling ─────────────────────────────────────────────────────────

function setupSmoothScrolling() {
    document.querySelectorAll('[data-scroll-to]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-scroll-to');
            const targetSection = document.getElementById(targetId);
            const nav = document.querySelector('.navbar');
            const offset = nav ? nav.offsetHeight : 0;

            if (targetSection) {
                const targetY = targetSection.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({
                    top: targetY,
                    behavior: prefersReducedMotion() ? 'auto' : 'smooth',
                });
                history.pushState(null, '', `#${targetId}`);
            }
        });
    });
}

// ─── Hero Video ───────────────────────────────────────────────────────────────

function setupHeroVideo() {
    const video = document.getElementById('heroVideo');
    if (!video) return;

    // The video is decorative. Don't spend a visitor's data on it if they've
    // asked for reduced motion or are on a metered/slow connection — the
    // poster frame carries the same look.
    const conn = navigator.connection;
    const saveData = !!conn?.saveData;
    const slow = /(^|-)2g$/.test(conn?.effectiveType || '');

    if (prefersReducedMotion() || saveData || slow) {
        video.removeAttribute('autoplay');
        video.pause();
        return;
    }

    // preload="none" in the markup keeps the video off the critical path;
    // start fetching only once the hero is actually on screen.
    const start = () => {
        video.preload = 'auto';
        video.load();
        video.play().catch(() => { /* autoplay refused — poster stays */ });
    };

    if (!('IntersectionObserver' in window)) return start();

    const observer = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return;
        start();
        observer.disconnect();
    }, { threshold: 0.1 });
    observer.observe(video);
}

// ─── Scroll Reveal ────────────────────────────────────────────────────────────

// Reveal when an element's edge comes 8% into the viewport — not at a ratio of
// its own height. A ratio threshold (0.1) never fired for the portfolio grid on
// phones: ~2,700px tall, so 10% was more than the screen had left to show, and
// the cards stayed invisible under their heading.
export const REVEAL_OPTIONS = { threshold: 0, rootMargin: '0px 0px -8% 0px' };

function animateOnScroll() {
    const reduced = prefersReducedMotion();
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            entry.target.classList.toggle("visible", entry.isIntersecting);
        });
    }, REVEAL_OPTIONS);

    document.querySelectorAll(".animate").forEach(element => {
        if (reduced) {
            element.classList.add('visible');
            return;
        }
        const randomDelay = Math.random() * 0.5;
        element.style.transitionDelay = `${randomDelay}s`;
        observer.observe(element);
    });
}

// ─── Contact ──────────────────────────────────────────────────────────────────
//
// There is deliberately no contact form and no published email address or phone
// number — contact runs through LinkedIn, so the page exposes nothing for
// address scrapers. If a form is ever wanted, GitHub Pages is static and would
// need an external endpoint (Formspree / Getform / Netlify Forms).
