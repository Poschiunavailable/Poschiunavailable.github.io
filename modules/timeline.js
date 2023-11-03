let currentDate;
let currentMonth;
let currentYear;

let minYear;
let maxYear;

let minMonth;
let maxMonth;


const cvSection = document.getElementById('cvSection');
const projects = document.querySelectorAll('.cv-project');
const currentTime = document.getElementById('currentTime');
const timeline = document.getElementById('timeline');
const timelineMarkerLeft = document.getElementById('timeline-marker-left');
const timelineMarkerRight = document.getElementById('timeline-marker-right');

function handleCVTimeline() {

    currentDate = new Date();
    currentMonth = currentDate.getMonth();
    currentYear = currentDate.getFullYear();

    minYear = currentYear;
    maxYear = currentYear;

    minMonth = currentMonth;
    maxMonth = currentMonth;

    projects.forEach(project => {
        let [startYear] = project.dataset.start.split('-').map(Number);
        let [endYear] = project.dataset.end.split('-').map(Number);
        //let [startMonth] = project.dataset.split('-')

        minYear = Math.min(minYear, startYear, endYear);
        maxYear = Math.max(maxYear, startYear, endYear);

        minMonth = Math.min()
    });

    for (let year = maxYear; year >= minYear; year--) {
        let yearDiv = document.createElement('div');
        yearDiv.className = 'year';
        yearDiv.textContent = year;
        timeline.appendChild(yearDiv);

        for (let month = 11; month >= 0; month--) {
            let monthDiv = document.createElement('div');
            monthDiv.className = 'month';
            monthDiv.textContent = new Date(year, month).toLocaleString('default', { month: 'short' });
            timeline.appendChild(monthDiv);
            for (let subdivision = 4; subdivision >= 0; subdivision--) {
                let subdivisionDiv = document.createElement('div');
                subdivisionDiv.className = "subdivision";
                timeline.appendChild(subdivisionDiv);
            }
        }
    }

    let cvSectionRect = cvSection.getBoundingClientRect();

    cvSection.style.setProperty('--timeline-height', cvSectionRect.height + 'px');

    console.log("cv height: " + cvSectionRect.height);

    window.addEventListener('scroll', () => {
        updateTimelineScroll();
    });
}

function updateTimelineScroll() {
    let scrollY = window.scrollY;
    // Calculate the position of the currentTime element within the limits of the timeline
    let timelineRect = timeline.getBoundingClientRect();
    let timelineTop = timelineRect.top;
    let timelineBottom = timelineRect.bottom;

    // Adjust the monthsScrolled calculation
    let monthsScrolled = Math.floor(scrollY / (24 /* Height of each month in px */));

    let newDate = new Date(currentYear, currentMonth - monthsScrolled);
    let newMonth = newDate.toLocaleString('default', { month: 'long' });
    let newYear = newDate.getFullYear();

    currentTime.textContent = `${newMonth} ${newYear}`;

    if (timelineTop <= window.innerHeight / 2 && timelineBottom >= window.innerHeight / 2) {
        currentTime.style.top = `50%`;
        timelineMarkerLeft.style.top = `50%`;
        timelineMarkerRight.style.top = `50%`;
    } else if (timelineTop > window.innerHeight / 2) {
        currentTime.style.top = `${timelineTop}px`;
        timelineMarkerLeft.style.top = `${timelineTop}px`;
        timelineMarkerRight.style.top = `${timelineTop}px`;
    } else {
        currentTime.style.top = `${timelineBottom - currentTime.clientHeight}px`;
        timelineMarkerLeft.style.top = `${timelineTop}px`;
        timelineMarkerRight.style.top = `${timelineTop}px`;
    }

    projects.forEach(project => {
        let [startYear, startMonth] = project.dataset.start.split('-').map(Number);
        let [endYear, endMonth] = project.dataset.end.split('-').map(Number);

        let startDate = new Date(startYear, startMonth - 1);
        let endDate = new Date(endYear, endMonth - 1);

        project.style.opacity = newDate >= startDate && newDate <= endDate ? '1' : '0';
    });
}

//window.addEventListener("DOMContentLoaded", function () {
handleCVTimeline();
updateTimelineScroll();
//});