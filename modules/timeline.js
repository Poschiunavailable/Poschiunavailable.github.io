const timeData = {
    currentMonth: null,
    currentYear: null,
    minYear: null,
    maxYear: null,
    minMonth: null,
    maxMonth: null,
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

function generateCVTimeline() {
    timeData.minYear = Infinity;
    timeData.maxYear = -Infinity;

    timeData.minMonth = 12;
    timeData.maxMonth = 1;

    timelineElements.projects.forEach(project => {
        //parse project data into array with year [0] and month [1]
        let startDate = project.dataset.start.split('-').map(Number);
        let endDate = project.dataset.end.split('-').map(Number);

        //define min and max year
        timeData.minYear = Math.min(timeData.minYear, startDate[0], endDate[0]);
        timeData.maxYear = Math.max(timeData.maxYear, startDate[0], endDate[0]);

        //define min month and max month
        if (startDate[0] === timeData.minYear) {
            timeData.minMonth = Math.min(timeData.minMonth, startDate[1]);
        }
        if (endDate[0] === timeData.minYear) {
            timeData.minMonth = Math.min(timeData.minMonth, endDate[1]);
        }
        if (startDate[0] === timeData.maxYear) {
            timeData.maxMonth = Math.max(timeData.maxMonth, startDate[1]);
        }
        if (endDate[0] === timeData.maxYear) {
            timeData.maxMonth = Math.max(timeData.maxMonth, endDate[1]);
        }
    });

    timeData.currentMonth = timeData.minMonth;
    timeData.currentYear = timeData.minYear;

    timeData.totalMonths = ((timeData.maxYear - timeData.minYear) - 1) * 12 + timeData.maxMonth - 1 + (12 - timeData.minMonth);

    console.log(timeData.totalMonths);

    for (let month = timeData.totalMonths; month >= 0; month--) {
        let monthDiv = document.createElement('div');
        monthDiv.className = 'month';

        let yearInsert = timeData.minYear + 1 + Math.floor((month - (timeData.maxMonth - 1)) / 12);
        let monthInsert = (month + 2) % 12;

        monthDiv.textContent = new Date(yearInsert, monthInsert).toLocaleString('default', { month: 'short' });
        timeline.appendChild(monthDiv);

        for (let subdivision = 4; subdivision >= 0; subdivision--) {
            let subdivisionDiv = document.createElement('div');
            subdivisionDiv.className = "subdivision";
            monthDiv.appendChild(subdivisionDiv);
        }
    }

    /*
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
    */

    let cvSectionRect = timelineElements.cvSection.getBoundingClientRect();

    timelineElements.cvSection.style.setProperty('--timeline-height', cvSectionRect.height + 'px');

    console.log("cv height: " + cvSectionRect.height);

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
    const timelineTop = timelineRect.top;
    const timelineBottom = timelineRect.bottom;

    // Calculate the monthsScrolled
    let timeScrolledPercentage = 1 - ((timelineBottom - halfScreenSize) / (Math.abs((timelineBottom - halfScreenSize)) + Math.abs((timelineTop - halfScreenSize))));

    updateTimelineElements(`50%`);

    //handle window center is outside bounds of the timeline
    if (window.innerHeight / 2 <= timelineTop) {
        updateTimelineElements(`${timelineTop}px`);
        timeScrolledPercentage = 0;
    }
    else if (window.innerHeight / 2 >= timelineBottom) {
        updateTimelineElements(`${timelineBottom}px`);
        timeScrolledPercentage = 0.99;
    }

    let monthsScrolled = Math.floor((timeData.totalMonths + 1) * timeScrolledPercentage);

    //console.log(timeScrolledPercentage + "   " + (timelineTop - halfScreenSize) + "   " + (timelineBottom - halfScreenSize) + "   " + monthsScrolled);

    let newDate = new Date(timeData.maxYear, timeData.maxMonth - monthsScrolled);
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