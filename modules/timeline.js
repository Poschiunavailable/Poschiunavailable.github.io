const timeData = {
    currentMonth: null,
    currentYear: null,
    minYear: null,
    maxYear: null,
    startMonth: null,
    endMonth: null,
    totalMonths: null,
}

const timelineElements = {
    cvSection: document.getElementById('cvSection'),
    projects: document.querySelectorAll('.cv-project'),
    currentTime: document.getElementById('currentTime'),
    timeline: document.getElementById('timeline'),
    timelineMarkerLeft: document.getElementById('timeline-marker-left'),
    timelineMarkerRight: document.getElementById('timeline-marker-right'),
}

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fadeInTimeLineProject');
            entry.target.classList.remove('fadeOutTimeLineProject');
        } else {
            entry.target.classList.add('fadeOutTimeLineProject');
            entry.target.classList.remove('fadeInTimeLineProject');
        }
    });
});

document.querySelectorAll('.cv-project').forEach(project => {
    observer.observe(project);
});

function generateCVTimeline() {
    timeData.minYear = Infinity;
    timeData.maxYear = -Infinity;

    timeData.startMonth = timelineElements.projects[0].dataset.start.split('-').map(Number)[1];
    timeData.endMonth = timelineElements.projects[timelineElements.projects.length - 1].dataset.end.split('-').map(Number)[1];

    timelineElements.projects.forEach(project => {
        //parse project data into array with year [0] and month [1]
        let startDate = project.dataset.start.split('-').map(Number);
        let endDate = project.dataset.end.split('-').map(Number);

        //define min and max year
        timeData.minYear = Math.min(timeData.minYear, startDate[0]);
        timeData.maxYear = Math.max(timeData.maxYear, endDate[0]);
    });

    timeData.currentMonth = timeData.startMonth;
    timeData.currentYear = timeData.minYear;

    timeData.totalMonths = (timeData.maxYear - timeData.minYear + 1) * 12 - timeData.startMonth - (12 - timeData.endMonth);

    // Start from the maximum year and month
    let currentYear = timeData.maxYear;
    let currentMonth = timeData.endMonth;

    // Loop until reaching the minimum year and month
    while (currentYear > timeData.minYear || (currentYear === timeData.minYear && currentMonth >= timeData.startMonth)) {

        let monthDiv = document.createElement('div');
        monthDiv.className = 'month';
        monthDiv.textContent = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'short' });
        timeline.appendChild(monthDiv);

        for (let subdivision = 4; subdivision >= 0; subdivision--) {
            let subdivisionDiv = document.createElement('div');
            subdivisionDiv.className = "subdivision";
            monthDiv.appendChild(subdivisionDiv);
        }

        monthDiv.textContent = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'short' });
        timeline.appendChild(monthDiv);

        // Move to the previous month
        currentMonth -= 1;

        // If the month is 0, move to the previous year and set month to December
        if (currentMonth === 0) {
            currentYear -= 1;
            currentMonth = 12;
        }


    }

    let cvSectionRect = timelineElements.cvSection.getBoundingClientRect();

    timelineElements.cvSection.style.setProperty('--timeline-height', cvSectionRect.height + 'px');

    window.addEventListener('scroll', () => {
        updateTimelineScroll();
    });
}

function updateTimelineElements(value) {
    timelineElements.currentTime.style.top = value;
    timelineElements.timelineMarkerLeft.style.top = value;
    timelineElements.timelineMarkerRight.style.top = value;
}

function updateTimelineScroll() {
    const halfScreenSize = window.innerHeight / 2;
    const timelineRect = timelineElements.timeline.getBoundingClientRect();
    const timelineTop = timelineRect.top - halfScreenSize;
    const timelineBottom = timelineRect.bottom - halfScreenSize;

    // Calculate the monthsScrolled
    let timeScrolledPercentage = 1 - (timelineBottom / (timelineBottom + (-1 * (timelineTop))));
    timeScrolledPercentage = Math.min(Math.max(timeScrolledPercentage, 0), 1);

    //handle window center is outside bounds of the timeline
    if (timeScrolledPercentage == 0) {
        updateTimelineElements(`${timelineRect.top}px`);
    }
    else if (timeScrolledPercentage == 1) {
        updateTimelineElements(`${timelineRect.bottom}px`);
    }
    else {
        updateTimelineElements(`50%`);
    }

    //add one month to total months to adjust for size of last month
    let monthsScrolled = Math.floor((timeData.totalMonths + 1) * timeScrolledPercentage);

    let newDate = new Date(timeData.maxYear, timeData.endMonth - Math.min(monthsScrolled, timeData.totalMonths));

    //get readable month and year string
    let newMonth = newDate.toLocaleString('default', { month: 'long' });
    let newYear = newDate.getFullYear();

    //set current month text
    timelineElements.currentTime.textContent = `${newMonth} ${newYear}`;


    timelineElements.projects.forEach(project => {
        let [startYear, startMonth] = project.dataset.start.split('-').map(Number);
        let [endYear, endMonth] = project.dataset.end.split('-').map(Number);

        let startDate = new Date(startYear, startMonth);
        let endDate = new Date(endYear, endMonth);

        project.style.opacity = newDate >= startDate && newDate <= endDate ? '0.7' : '0';
        project.style.opacity = timeScrolledPercentage == 0 || timeScrolledPercentage == 1 ? '0' : project.style.opacity;

        const projectRect = project.getBoundingClientRect();
        const projectCenterY = (projectRect.top + projectRect.bottom) / 2;
        const offsetFromCenter = projectCenterY - (window.innerHeight / 2);

        // Apply parallax offset (you might want to tweak this)
        //project.style.transform = `translateY(${offsetFromCenter * parallaxFactor}px)`;

        if (window.innerWidth >= 1024) {
            const video = project.querySelector('video');
            const description = project.querySelector('p');
            if (video) {
                video.style.display = 'block';
            }
            if (description) {
                description.style.display = 'block';
            }
        }
    });
}

generateCVTimeline();
updateTimelineScroll();