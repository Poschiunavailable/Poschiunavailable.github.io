// src/modules/main.js
import { initScripts } from './scripts.js';
import { initPortfolio } from './portfolio.js';
import { initTimeline } from './timeline.js';
import { getProjects } from './dataManager.js';

document.addEventListener("DOMContentLoaded", async () => {
    // 1. Initialize generic UI scripts (scrolling, typing)
    initScripts();

    // 2. Fetch data once
    const projects = await getProjects();

    // 3. Initialize specific features with data
    if (projects.length > 0) {
        initPortfolio(projects);
        initTimeline(projects);
    }
});