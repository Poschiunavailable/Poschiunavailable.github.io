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
        item.innerHTML = `
            <div class="portfolio-item-image-wrap">
                <img src="${project.image}" alt="${project.title}">
            </div>
            <div class="portfolio-item-body">
                <h3>${project.title}</h3>
                ${project.subtitle ? `<p class="portfolio-subtitle">${project.subtitle}</p>` : ''}
                <p class="portfolio-description">${project.description}</p>
                ${tagsHtml ? `<div class="portfolio-tags">${tagsHtml}</div>` : ''}
            </div>
            <div class="click-indicator">View in CV &#8594;</div>
        `;
        item.addEventListener('click', () => scrollToCVAndHighlight(project.id));
        grid.appendChild(item);
    });

    // Observe newly added items for scroll-in animation
    observeItems(grid.querySelectorAll('.portfolio-item'));
}

function observeItems(elements) {
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
    const cvSection = document.getElementById('cv');
    const nav = document.querySelector('.navbar');
    const offset = nav ? nav.offsetHeight : 0;
    if (cvSection) {
        const targetY = cvSection.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: targetY, behavior: 'smooth' });
    }
    // Timeline can listen for this to snap to the relevant project
    window.dispatchEvent(new CustomEvent('portfolio:selectProject', { detail: { id: projectId } }));
}

// ─── 3D Hover Effect ──────────────────────────────────────────────────────────

function handlePortfolioItems() {
    const ROTATION = 25;   // max degrees of tilt
    const SCALE    = 1.35; // zoom on hover

    document.querySelectorAll('.portfolio-item').forEach(item => {
        let hovered = false;
        let resetTimer = null;

        const enter = () => {
            hovered = true;
            clearTimeout(resetTimer);
            // Disable the scroll-in transition while hovering so movement is 1:1
            item.style.transition = 'box-shadow 0.2s ease';
            item.style.boxShadow = '0 24px 48px rgba(0, 0, 0, 0.55)';
            item.style.zIndex = '10';
        };

        const move = (clientX, clientY) => {
            const rect = item.getBoundingClientRect();
            const relX = clientX - (rect.left + rect.width  / 2);
            const relY = clientY - (rect.top  + rect.height / 2);
            const rotateY = ( relX / rect.width)  * ROTATION;
            const rotateX = (-relY / rect.height) * ROTATION;

            // Prevent the scaled card from clipping off the viewport edges
            const extra = (rect.width * SCALE - rect.width) / 2;
            let tx = 0;
            if (rect.left < extra)                         tx =  extra - rect.left;
            else if (window.innerWidth - rect.right < extra) tx = -(extra - (window.innerWidth - rect.right));

            item.style.transform =
                `perspective(1000px) scale(${SCALE}) translateX(${tx}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
        };

        const leave = () => {
            hovered = false;
            item.style.transition =
                'transform 0.45s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.3s ease';
            item.style.transform = '';
            item.style.boxShadow = '';
            // Clear inline overrides once the spring-back finishes
            resetTimer = setTimeout(() => {
                if (!hovered) {
                    item.style.transition = '';
                    item.style.zIndex = '';
                }
            }, 500);
        };

        // Mouse
        item.addEventListener('mouseenter', enter);
        item.addEventListener('mousemove',  e => move(e.clientX, e.clientY));
        item.addEventListener('mouseleave', leave);

        // Press feedback on the click indicator
        const pressIn  = () => { const ind = item.querySelector('.click-indicator'); if (ind) ind.style.transform = 'translateX(-50%) scale(0.92)'; };
        const pressOut = () => { const ind = item.querySelector('.click-indicator'); if (ind) ind.style.transform = 'translateX(-50%) scale(1)'; };
        item.addEventListener('mousedown',  pressIn);
        item.addEventListener('mouseup',    pressOut);
        item.addEventListener('touchstart', pressIn,  { passive: true });
        item.addEventListener('touchend',   pressOut, { passive: true });

        // Touch tilt
        item.addEventListener('touchmove', e => {
            if (e.touches.length) move(e.touches[0].clientX, e.touches[0].clientY);
        }, { passive: true });
    });
}
