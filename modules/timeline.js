// timeline.js

document.addEventListener('DOMContentLoaded', () => {
    fetch('projects.json')
        .then(response => response.json())
        .then(projects => {
            const timelineProjects = projects.filter(project => project.showInTimeline);
            setupTimelineElements(); // Moved before generateCVTimeline
            generateCVTimeline(timelineProjects);
            setupTimelineObserver();
            window.addEventListener('scroll', debounce(updateTimelineScroll, 20));
            window.addEventListener('resize', debounce(updateTimelineScroll, 50));
            updateTimelineScroll();
        })
        .catch(error => console.error('Error loading projects:', error));
});

/**
 * Debounce function to limit the rate at which a function can fire.
 * @param {Function} func - The function to debounce.
 * @param {number} wait - The delay in milliseconds.
 * @returns {Function}
 */
function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const timeData = {
    minYear: null,
    maxYear: null,
    totalMonths: null,
};

const timelineElements = {
    cvSection: null,
    currentTime: null,
    timeline: null,
    timelineMarkerLeft: null,
    projects: null, // Will be updated after DOM generation
};

function ensureMonthGutter() {
  let labelCol = document.getElementById('timeline-months');
  if (!labelCol) {
    labelCol = document.createElement('div');
    labelCol.id = 'timeline-months';
    // insert right after the #timeline node
    timelineElements.timeline.parentElement.insertBefore(labelCol, timelineElements.timeline.nextSibling);
  }
  return labelCol;
}

function monthIndexFromDate(date) {
  // months since minYear/Jan
  return (date.getFullYear() - timeData.minYear) * 12 + date.getMonth();
}

function scrollToMonthIndex(index) {
  const cvTop = timelineElements.cvSection.getBoundingClientRect().top + window.pageYOffset;
  const cvHeight = timelineElements.cvSection.offsetHeight;
  const total = Math.max(timeData.totalMonths - 1, 1);
  const pct = Math.min(Math.max(index / total, 0), 1);
  const target = cvTop + pct * cvHeight - window.innerHeight * 0.5; // center-ish
  window.scrollTo({ top: target, behavior: 'smooth' });
}

/**
 * Updates the projects NodeList after projects are added to the DOM.
 */
function setupTimelineElements() {
    timelineElements.cvSection = document.getElementById('cvSection');
    timelineElements.currentTime = document.getElementById('currentTime');
    timelineElements.timeline = document.getElementById('timeline');
    timelineElements.timelineMarkerLeft = document.getElementById('timeline-marker-left');
    timelineElements.projects = document.querySelectorAll('#projects .cv-project');
}

/**
 * Sets up the IntersectionObserver to handle fade-in and fade-out animations.
 */
function setupTimelineObserver() {
    if (!timelineElements.projects) return;

    const options = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1, // Trigger when 10% of the element is visible
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('fadeInTimelineProject');
                entry.target.classList.remove('fadeOutTimelineProject');
            } else {
                entry.target.classList.add('fadeOutTimelineProject');
                entry.target.classList.remove('fadeInTimelineProject');
            }
        });
    }, options);

    timelineElements.projects.forEach(project => observer.observe(project));
}

/**
 * Generates the CV Timeline based on the filtered projects.
 * @param {Array} projects - Array of project objects to include in the timeline.
 */
function generateCVTimeline(projects) {
    const projectsContainer = document.getElementById('projects');
    timeData.minYear = Infinity;
    timeData.maxYear = -Infinity;

    if (projects.length === 0) return;

    // Determine the range of years
    projects.forEach(project => {
        const [startYear, startMonth] = project.startDate.split('-').map(Number);
        const [endYear, endMonth] = project.endDate.split('-').map(Number);

        timeData.minYear = Math.min(timeData.minYear, startYear);
        timeData.maxYear = Math.max(timeData.maxYear, endYear);
    });

    // Calculate total months
    timeData.totalMonths = (timeData.maxYear - timeData.minYear + 1) * 12;

    // Generate month labels and subdivisions
    generateTimelineBar();

    // Generate project elements
    projects.forEach(project => {
        const article = document.createElement('article');
        article.className = 'cv-project';
        article.dataset.start = project.startDate;
        article.dataset.end = project.endDate;

        const marker = document.createElement('div');
        marker.className = 'timeline-marker';
        article.appendChild(marker);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'cv-project-content';

        const h3 = document.createElement('h3');
        h3.textContent = project.title;
        contentDiv.appendChild(h3);

        if (project.video) {
            const video = document.createElement('video');
            video.src = project.video;
            video.controls = true;
            video.className = 'timeline-video';
            contentDiv.appendChild(video);
        } else if (project.image) {
            const img = document.createElement('img');
            img.src = project.image;
            img.alt = `${project.title} Image`;
            img.className = 'timeline-image';
            contentDiv.appendChild(img);
        }

        const p = document.createElement('p');
        p.textContent = project.description;
        contentDiv.appendChild(p);

        article.appendChild(contentDiv);

        projectsContainer.appendChild(article);
    });

    // Update projects NodeList after adding to DOM
    timelineElements.projects = document.querySelectorAll('#projects .cv-project');
}

/**
 * Generates the vertical track and the month label gutter.
 */
function generateTimelineBar() {
    const timeline = timelineElements.timeline;
    if (!timeline) { console.error('Timeline element not found'); return; }
  
    // Clear and prep
    timeline.innerHTML = '';
    const labelCol = ensureMonthGutter();
    labelCol.innerHTML = '';
  
    let currentYear = timeData.minYear;
    let currentMonth = 0;
    const endYear = timeData.maxYear;
    const endMonth = 11;
  
    let i = 0; // month index
    const total = timeData.totalMonths - 1;
    while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
      const pct = (i / total) * 100;

      // Marker on the timeline
      const monthMarker = document.createElement('div');
      monthMarker.className = 'timeline-month-marker';
      monthMarker.style.top = `${pct}%`;
      timeline.appendChild(monthMarker);

      for (let q = 1; q < 4; q++) {
        const subPct = ((i + q / 4) / total) * 100;
        const sub = document.createElement('div');
        sub.className = 'timeline-subdivision-marker';
        sub.style.top = `${subPct}%`;
        timeline.appendChild(sub);
      }

      // right-side label row
      const monthRow = document.createElement('div');
      monthRow.className = 'month';
      monthRow.dataset.index = String(i);
      monthRow.textContent = new Date(currentYear, currentMonth)
        .toLocaleString('default', { month: 'short' });

      // 4 tiny quarter dots (purely decorative here)
      for (let q = 0; q < 4; q++) {
        const dot = document.createElement('div');
        dot.className = 'subdivision';
        monthRow.appendChild(dot);
      }
      // click scroll
      monthRow.addEventListener('click', () => scrollToMonthIndex(i));
      labelCol.appendChild(monthRow);

      // advance month
      currentMonth += 1; i += 1;
      if (currentMonth > 11) { currentMonth = 0; currentYear += 1; }
    }
  
    // the track itself just needs height sync (you already do this)
    const cvRect = timelineElements.cvSection.getBoundingClientRect();
    timelineElements.cvSection.style.setProperty('--timeline-height', `${cvRect.height}px`);
}

/**
 * Updates the timeline based on the scroll position.
 */
function updateTimelineScroll() {
    const halfWindowHeight = window.innerHeight / 2;
    const cvSectionTop = timelineElements.cvSection.getBoundingClientRect().top + window.pageYOffset;
    const cvSectionHeight = timelineElements.cvSection.offsetHeight;
    const scrollPosition = window.scrollY + halfWindowHeight - cvSectionTop;
    const scrollPercentage = Math.min(Math.max(scrollPosition / cvSectionHeight, 0), 1);

    // Calculate current date based on scroll percentage
    const totalMonths = timeData.totalMonths - 1;
    const monthsScrolled = Math.floor(totalMonths * scrollPercentage);

    const newDate = new Date(timeData.minYear, monthsScrolled);

    const newMonth = newDate.toLocaleString('default', { month: 'long' });
    const newYear = newDate.getFullYear();

    timelineElements.currentTime.textContent = `${newMonth} ${newYear}`;

    // highlight the month label that corresponds to newDate
    const idx = monthIndexFromDate(newDate);
    document.querySelectorAll('#timeline-months .month').forEach((m, i) => {
        m.classList.toggle('active', i === idx);
    });

    // Update position of current time indicator
    const timelineRect = timelineElements.timeline.getBoundingClientRect();
    const indicatorPosition = timelineRect.top + scrollPercentage * timelineRect.height;
    updateTimelineElements(indicatorPosition);

    // Update project visibility based on current date
    timelineElements.projects.forEach(project => {
        const [startYear, startMonth] = project.dataset.start.split('-').map(Number);
        const [endYear, endMonth] = project.dataset.end.split('-').map(Number);

        const projectStartDate = new Date(startYear, startMonth - 1);
        const projectEndDate = new Date(endYear, endMonth - 1);

        if (newDate >= projectStartDate && newDate <= projectEndDate) {
            project.classList.add('active-project');
        } else {
            project.classList.remove('active-project');
        }
    });
}

/**
 * Updates the position of timeline elements (currentTime and markers).
 * @param {string} value - The value to set for the top position.
 */
function updateTimelineElements(value) {
    timelineElements.currentTime.style.top = `${value}px`;
    timelineElements.timelineMarkerLeft.style.top = `${value}px`;
}
