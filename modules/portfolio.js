// portfolio.js

document.addEventListener('DOMContentLoaded', () => {
    fetch('projects.json')
        .then(response => response.json())
        .then(projects => {
            generatePortfolioItems(projects);
            generatePortfolioDetails(projects);
            handlePortfolioDetails(); // Initialize event listeners
            handlePortfolioItems();   // Attach rotation and hover effects
        })
        .catch(error => console.error('Error loading projects:', error));
});

function handlePortfolioItems() {
    const portfolioItems = document.querySelectorAll(".portfolio-item");
    const rotationStrength = 30;

    portfolioItems.forEach((item) => {
        item.style.position = "relative";

        const handleMove = (e) => {
            const rect = item.getBoundingClientRect();

            const clientX = e.clientX;
            const clientY = e.clientY;

            const relX = clientX - (rect.left + rect.width / 2);
            const relY = clientY - (rect.top + rect.height / 2);

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

function closeDetail(detailId) {
    const detail = document.getElementById(detailId);
    if (detail) {
        detail.querySelector('.portfolio-detail')?.classList.remove('active');
        detail.style.display = 'none';
        document.body.style.overflow = 'auto';
    } else {
        console.error('Detail element not found:', detailId);
    }
}

function handlePortfolioDetails() {
    const items = document.querySelectorAll('.portfolio-item');
    const details = document.querySelectorAll('.portfolio-detail');

    items.forEach(item => item.addEventListener('click', () => openDetail(item.id)));

    details.forEach(detail => {
        // click outside content
        detail.addEventListener('click', (e) => {
            if (e.target === detail) closeDetail(detail.parentElement.id);
        });
        // don't bubble clicks inside content
        detail.querySelector('.detail-content')?.addEventListener('click', (e) => e.stopPropagation());
    });

    // ESC closes
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('#portfolioDetailsContainer > section')
             .forEach(sec => closeDetail(sec.id));
        }
    });
}

function openDetail(itemId) {
    const detailId = itemId.replace('item-', 'detail-');
    const detail = document.getElementById(detailId);
    if (detail) {
        detail.style.display = 'block';
        detail.querySelector('.portfolio-detail')?.classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    } else {
        console.error('Detail element not found:', detailId);
    }
}

function generatePortfolioItems(projects) {
    const portfolioGrid = document.getElementById('portfolioGrid');

    if (!portfolioGrid) {
        console.error('portfolioGrid element not found.');
        return;
    }

    if (!projects || projects.length === 0) {
        console.warn('No projects to display.');
        portfolioGrid.innerHTML = '<p>No portfolio items available at this time.</p>';
        return;
    }

    projects
        .filter(project => project.showInPortfolio)
        .forEach(project => {
            const item = document.createElement('div');
            item.className = 'portfolio-item animate';
            item.id = `item-${project.id}`;

            item.innerHTML = `
                <img src="${project.image}" alt="${project.title} Image">
                <h3>${project.title}</h3>
                <p>${project.description}</p>
                <div class="click-indicator">Click to show more</div>
            `;

            portfolioGrid.appendChild(item);
        });
}


function generatePortfolioDetails(projects) {
    const detailsContainer = document.getElementById('portfolioDetailsContainer');

    projects
        .filter(project => project.showInPortfolio)
        .forEach(project => {
            const section = document.createElement('section');
            section.id = `detail-${project.id}`;
            section.innerHTML = `
                <div class="portfolio-detail animate">
                    <button class="close-button" onclick="closeDetail('detail-${project.id}')">×</button>
                    <div class="detail-content">
                        <div class="project-detail-video-section">
                            <video id="new-video-${project.id}" controls preload="none" poster="${project.poster}">
                                <source src="${project.video}" type="video/mp4">
                                Your browser does not support the video tag.
                            </video>
                            <div class="play-overlay" onclick="playVideo('new-video-${project.id}')">▶</div>
                            <div class="expand-arrow" onclick="toggleVideoSize('new-video-${project.id}')">»</div>
                        </div>
                        <div class="text-section">
                            ${generateProjectDetails(project.details)}
                        </div>
                    </div>
                </div>
            `;

            detailsContainer.appendChild(section);
        });
}

function generateProjectDetails(details) {
    let detailsHTML = '';

    for (const key in details) {
        const detail = details[key];
        detailsHTML += `
            <details class="project-detail">
                <summary><span class="arrow">➔</span> ${detail.summary}</summary>
                <div>
                    ${generateDetailContent(detail.content)}
                </div>
            </details>
        `;
    }

    return detailsHTML;
}

function generateDetailContent(content) {
    if (Array.isArray(content)) {
        return `<ul class="list-container">
            ${content.map(item => {
            if (typeof item === 'string') {
                return `<li class="list-item">${item}</li>`;
            } else if (typeof item === 'object') {
                // Handle object items, e.g., links
                if (item.type === 'link') {
                    return `<li class="list-item"><a href="${item.href}" target="_blank">${item.text}</a></li>`;
                } else if (item.type === 'sub-list') {
                    // Handle sub-lists
                    return `<li class="list-item">${item.text}${generateSubList(item.items)}</li>`;
                } else {
                    // Handle other object types as needed
                    return `<li class="list-item">${item.text}</li>`;
                }
            } else {
                return `<li class="list-item">${item}</li>`;
            }
        }).join('')}
        </ul>`;
    } else if (typeof content === 'object') {
        // Handle content being an object
        if (content.type === 'paragraph') {
            return `<p>${content.text}</p>`;
        } else if (content.type === 'link') {
            return `<a href="${content.href}" target="_blank">${content.text}</a>`;
        }
        // Add more types as needed
    } else {
        return `<p>${content}</p>`;
    }
}

function generateSubList(items) {
    return `<ul class="sub-list">
        ${items.map(item => `<li class="sub-list-item">${item}</li>`).join('')}
    </ul>`;
}

// Additional functions for video controls
function playVideo(videoId) {
    const video = document.getElementById(videoId);
    const playOverlay = video.parentElement.querySelector('.play-overlay');
    if (video.paused) {
        video.play();
        playOverlay.style.display = 'none';
    } else {
        video.pause();
        playOverlay.style.display = 'block';
    }
}

function toggleVideoSize(videoId) {
    const videoSection = document.getElementById(videoId).closest('.project-detail-video-section');
    const detailContent = videoSection.closest('.detail-content');
    const textSection = detailContent.querySelector('.text-section');
    const arrow = videoSection.querySelector('.expand-arrow');

    if (videoSection.classList.contains('expanded')) {
        // Minimize the video player to its original size
        videoSection.classList.remove('expanded');
        textSection.style.display = 'block';
        arrow.textContent = '»';
        document.body.style.overflow = 'auto';
    } else {
        // Expand the video player
        videoSection.classList.add('expanded');
        textSection.style.display = 'none';
        arrow.textContent = '«';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
    }
}
