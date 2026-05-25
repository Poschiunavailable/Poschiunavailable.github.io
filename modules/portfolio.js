export function initPortfolio(projects) {
    generatePortfolioItems(projects);
    generatePortfolioDetails(projects);
    handlePortfolioDetails();
    handlePortfolioItems();
}

function handlePortfolioItems() {
    const portfolioItems = document.querySelectorAll(".portfolio-item");
    const rotationStrength = 30;

    portfolioItems.forEach((item) => {
        item.style.position = "relative";
        const handleMove = (e) => {
            const rect = item.getBoundingClientRect();
            const relX = e.clientX - (rect.left + rect.width / 2);
            const relY = e.clientY - (rect.top + rect.height / 2);
            let rotateY = (relX / rect.width) * rotationStrength;
            let rotateX = (-relY / rect.height) * rotationStrength;
            item.style.transform = `perspective(1000px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;
        };
        item.addEventListener("mousemove", handleMove);
        item.addEventListener("mouseleave", () => {
            item.style.transform = "";
        });
    });
}

// Make these functions available to window scope only for inline HTML onClick handlers if you keep them, 
// BUT it is better to attach listeners in JS. 
// For this refactor, I will attach listeners dynamically to avoid window pollution.

function handlePortfolioDetails() {
    // Logic moved to generation functions for cleaner binding
    
    // ESC closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.portfolio-detail.active').forEach(detail => {
                closeDetail(detail.parentElement.id);
            });
        }
    });
}

function openDetail(itemId) {
    const detailId = itemId.replace('item-', 'detail-');
    const container = document.getElementById(detailId);
    if (container) {
        container.style.display = 'block';
        const detail = container.querySelector('.portfolio-detail');
        if(detail) detail.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeDetail(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
        section.querySelector('.portfolio-detail')?.classList.remove('active');
        section.style.display = 'none';
        
        // Stop video if playing
        const video = section.querySelector('video');
        if(video) video.pause();
        
        document.body.style.overflow = 'auto';
    }
}

function generatePortfolioItems(projects) {
    const portfolioGrid = document.getElementById('portfolioGrid');
    if (!portfolioGrid) return;
    
    portfolioGrid.innerHTML = ''; 

    projects.filter(p => p.showInPortfolio).forEach(project => {
        const item = document.createElement('div');
        item.className = 'portfolio-item animate';
        item.id = `item-${project.id}`;
        item.innerHTML = `
            <img src="${project.image}" alt="${project.title} Image">
            <h3>${project.title}</h3>
            <p>${project.description}</p>
            <div class="click-indicator">Click to show more</div>
        `;
        // Add listener directly
        item.addEventListener('click', () => openDetail(item.id));
        portfolioGrid.appendChild(item);
    });
}

function generatePortfolioDetails(projects) {
    const detailsContainer = document.getElementById('portfolioDetailsContainer');
    if(!detailsContainer) return;
    detailsContainer.innerHTML = '';

    projects.filter(p => p.showInPortfolio).forEach(project => {
        const section = document.createElement('section');
        section.id = `detail-${project.id}`;
        
        // Structure
        section.innerHTML = `
            <div class="portfolio-detail animate">
                <button class="close-button">×</button>
                <div class="detail-content">
                    <div class="project-detail-video-section">
                        <video id="video-${project.id}" preload="none" poster="${project.poster}">
                            <source src="${project.video}" type="video/mp4">
                        </video>
                        <div class="play-overlay">▶</div>
                        <div class="expand-arrow">»</div>
                    </div>
                    <div class="text-section">
                        ${generateProjectDetails(project.details)}
                    </div>
                </div>
            </div>
        `;

        // Event Listeners for this specific modal
        const closeBtn = section.querySelector('.close-button');
        closeBtn.addEventListener('click', () => closeDetail(section.id));

        const videoSection = section.querySelector('.project-detail-video-section');
        const video = section.querySelector('video');
        const playOverlay = section.querySelector('.play-overlay');
        const expandArrow = section.querySelector('.expand-arrow');

        // Video Play Toggle
        const togglePlay = () => {
             if (video.paused) { video.play(); playOverlay.style.display = 'none'; } 
             else { video.pause(); playOverlay.style.display = 'block'; }
        };
        playOverlay.addEventListener('click', togglePlay);
        video.addEventListener('click', togglePlay);

        // Expand Toggle
        expandArrow.addEventListener('click', (e) => {
            e.stopPropagation(); // prevent video play
            videoSection.classList.toggle('expanded');
            expandArrow.textContent = videoSection.classList.contains('expanded') ? '«' : '»';
        });

        // Click outside to close
        section.querySelector('.portfolio-detail').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeDetail(section.id);
        });

        detailsContainer.appendChild(section);
    });
}

function generateProjectDetails(details) {
    let html = '';
    for (const key in details) {
        html += `<details class="project-detail"><summary><span class="arrow">➔</span> ${details[key].summary}</summary><div>${generateDetailContent(details[key].content)}</div></details>`;
    }
    return html;
}

function generateDetailContent(content) {
    if (Array.isArray(content)) {
        return `<ul class="list-container">${content.map(item => {
            if (typeof item === 'object' && item.type === 'link') return `<li class="list-item"><a href="${item.href}" target="_blank">${item.text}</a></li>`;
            if (typeof item === 'object' && item.type === 'sub-list') return `<li class="list-item">${item.text}<ul class="sub-list">${item.items.map(sub => `<li class="sub-list-item">${sub}</li>`).join('')}</ul></li>`;
            return `<li class="list-item">${typeof item === 'string' ? item : item.text}</li>`;
        }).join('')}</ul>`;
    }
    return `<p>${content}</p>`;
}