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

function updateTimelineElements(value) {
    timelineElements.currentTime.style.top = value;
    timelineElements.timelineMarkerLeft.style.top = value;
    timelineElements.timelineMarkerRight.style.top = value;
}

function updateTimelineScroll() {
    let scrollY = window.scrollY;
    let scrollYMax = scrollY + window.innerHeight;
    let scrollCenter = scrollY + scrollYMax / 2;
    const halfScreenSize = window.innerHeight / 2;
    // Calculate the position of the currentTime element within the limits of the timeline
    const timelineRect = timelineElements.timeline.getBoundingClientRect();
    const timelineTop = timelineRect.top;
    const timelineBottom = timelineRect.bottom;

    // Calculate the monthsScrolled
    let timeScrolledPercentage = (timelineBottom - halfScreenSize) / (Math.abs((timelineBottom - halfScreenSize)) + Math.abs((timelineTop - halfScreenSize)));
    const totalMonths = timeData.maxYear * 12 + timeData.maxMonth + timeData.minMonth;
    console.log(totalMonths);
    updateTimelineElements(`50%`);

    //handle window center is outside bounds of the timeline
    if (window.innerHeight / 2 <= timelineTop) {
        updateTimelineElements(`${timelineTop}px`);
        timeScrolledPercentage = 0;
    }
    else if (window.innerHeight / 2 >= timelineBottom) {
        updateTimelineElements(`${timelineBottom}px`);
        timeScrolledPercentage = 1;
    }
    let monthsScrolled = Math.floor(totalMonths * timeScrolledPercentage);
    console.log(timeScrolledPercentage + "   " + (timelineTop - halfScreenSize) + "   " + (timelineBottom - halfScreenSize));

    let newDate = new Date(timeData.currentYear, timeData.currentMonth - monthsScrolled);
    let newMonth = newDate.toLocaleString('default', { month: 'long' });
    let newYear = newDate.getFullYear();
    timelineElements.currentTime.textContent = `${newMonth} ${newYear}`;


    // Parallax effect for projects
    const parallaxFactor = 0.5; // Adjust for desired parallax intensity

    timelineElements.projects.forEach(project => {
        let [startYear, startMonth] = project.dataset.start.split('-').map(Number);
        let [endYear, endMonth] = project.dataset.end.split('-').map(Number);

        let startDate = new Date(startYear, startMonth - 1);
        let endDate = new Date(endYear, endMonth - 1);

        project.style.opacity = newDate >= startDate && newDate <= endDate ? '1' : '0';

        const projectRect = project.getBoundingClientRect();
        const projectCenterY = (projectRect.top + projectRect.bottom) / 2;
        const offsetFromCenter = projectCenterY - (window.innerHeight / 2);

        // Apply parallax offset (you might want to tweak this)
        project.style.transform = `translateY(${offsetFromCenter * parallaxFactor}px)`;
    });
}

generateCVTimeline();
updateTimelineScroll();