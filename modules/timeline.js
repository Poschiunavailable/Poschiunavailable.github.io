const timeData = {
    currentDate: null,
    currentMonth: null,
    currentYear: null,
    minYear: null,
    maxYear: null,
    minMonth: null,
    maxMonth: null,
}

const timelineElements = {
    cvSection: document.getElementById('cvSection'),
    projects: document.querySelectorAll('.cv-project'),
    currentTime: document.getElementById('currentTime'),
    timeline: document.getElementById('timeline'),
    timelineMarkerLeft: document.getElementById('timeline-marker-left'),
    timelineMarkerRight: document.getElementById('timeline-marker-right'),
}

function generateCVTimeline() {

    timeData.currentDate = new Date();
    timeData.currentMonth = timeData.currentDate.getMonth();
    timeData.currentYear = timeData.currentDate.getFullYear();

    timeData.minYear = timeData.currentYear;
    timeData.maxYear = timeData.currentYear;

    timeData.minMonth = timeData.currentMonth;
    timeData.maxMonth = timeData.currentMonth;

    timelineElements.projects.forEach(project => {
        let [startYear] = project.dataset.start.split('-').map(Number);
        let [endYear] = project.dataset.end.split('-').map(Number);

        timeData.minYear = Math.min(timeData.minYear, startYear, endYear);
        timeData.maxYear = Math.max(timeData.maxYear, startYear, endYear);

        timeData.minMonth = Math.min()
    });

    for (let year = timeData.maxYear; year >= timeData.minYear; year--) {
        let yearDiv = document.createElement('div');
        yearDiv.className = 'year';
        yearDiv.textContent = year;
        timelineElements.timeline.appendChild(yearDiv);

        for (let month = 11; month >= 0; month--) {
            let monthDiv = document.createElement('div');
            monthDiv.className = 'month';
            monthDiv.textContent = new Date(year, month).toLocaleString('default', { month: 'short' });
            timeline.appendChild(monthDiv);

            for (let subdivision = 4; subdivision >= 0; subdivision--) {
                let startMonth = month * 5 + subdivision; // Calculate start month for subdivisions
                let endMonth = startMonth + 1; // Calculate end month for subdivisions

                let subdivisionDiv = document.createElement('div');
                subdivisionDiv.className = "subdivision";
                monthDiv.appendChild(subdivisionDiv);
            }
        }
    }

    let cvSectionRect = timelineElements.cvSection.getBoundingClientRect();

    timelineElements.cvSection.style.setProperty('--timeline-height', cvSectionRect.height + 'px');

    console.log("cv height: " + cvSectionRect.height);

    window.addEventListener('scroll', () => {
        updateTimelineScroll();
    });
}

generateCVTimeline();

function updateTimelineScroll() {
    let scrollY = window.scrollY;
    // Calculate the position of the currentTime element within the limits of the timeline
    let timelineRect = timelineElements.timeline.getBoundingClientRect();
    let timelineTop = timelineRect.top;
    let timelineBottom = timelineRect.bottom;

    // Adjust the monthsScrolled calculation
    let monthsScrolled = Math.floor(scrollY / (24 /* Height of each month in px */));

    let newDate = new Date(timeData.currentYear, timeData.currentMonth - monthsScrolled);
    let newMonth = newDate.toLocaleString('default', { month: 'long' });
    let newYear = newDate.getFullYear();

    timelineElements.currentTime.textContent = `${newMonth} ${newYear}`;

    if (timelineTop <= window.innerHeight / 2 && timelineBottom >= window.innerHeight / 2) {
        timelineElements.currentTime.style.top = `50%`;
        timelineElements.timelineMarkerLeft.style.top = `50%`;
        timelineElements.timelineMarkerRight.style.top = `50%`;
    } else if (timelineTop > window.innerHeight / 2) {
        timelineElements.currentTime.style.top = `${timelineTop}px`;
        timelineElements.timelineMarkerLeft.style.top = `${timelineTop}px`;
        timelineElements.timelineMarkerRight.style.top = `${timelineTop}px`;
    } else {
        timelineElements.currentTime.style.top = `${timelineBottom - timelineElements.currentTime.clientHeight}px`;
        timelineElements.timelineMarkerLeft.style.top = `${timelineTop}px`;
        timelineElements.timelineMarkerRight.style.top = `${timelineTop}px`;
    }

    timelineElements.projects.forEach(project => {
        let [startYear, startMonth] = project.dataset.start.split('-').map(Number);
        let [endYear, endMonth] = project.dataset.end.split('-').map(Number);

        let startDate = new Date(startYear, startMonth - 1);
        let endDate = new Date(endYear, endMonth - 1);

        project.style.opacity = newDate >= startDate && newDate <= endDate ? '1' : '0';
    });
}

generateCVTimeline();
updateTimelineScroll();