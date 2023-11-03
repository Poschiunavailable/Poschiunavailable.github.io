function scrollToSection(event, sectionId) {
    event.preventDefault();
    const targetSection = document.getElementById(sectionId);
    const targetY = targetSection.getBoundingClientRect().top + window.pageYOffset;

    window.scrollTo({
        top: targetY,
        behavior: 'smooth',
    });
}

function startTypingEffect(element) {
    element.textContent = ""; // Clear the text content
    const fullText = element.getAttribute("data-text");
    const totalCharacters = fullText.length;
    let currentCharacter = 0;

    function type() {
        if (currentCharacter < totalCharacters) {
            element.textContent += fullText.charAt(currentCharacter);
            currentCharacter++;
            setTimeout(type, 70);
        }
    }

    type();
}

function closeDetail(detailId) {
    document.getElementById(detailId).style.display = 'none';
    // Enable interactions with the background content
    document.getElementById('portfolio').style.pointerEvents = 'auto';
    // Enable scrolling on the main page
    document.body.style.overflow = 'auto'; // or 'visible' depending on your preference
}

document.querySelectorAll('.portfolio-item').forEach(function (item) {
    item.addEventListener('click', function () {
        var id = this.id.replace('item', 'detail');
        detail = document.getElementById(id);
        if (detail) {
            // Show the detail panel
            detail.style.display = 'block';
        } else {
            console.error('Detail element not found:', id);
        }
    });
});

let currentlyPlayingEffectElement;

function createTypingEffect(element) {
    let animationPlayed = false;

    return function () {
        const sectionTop = element.parentElement.getBoundingClientRect().top;
        const sectionBottom = element.parentElement.getBoundingClientRect().bottom;
        const screenHeight = window.innerHeight;

        if (
            !animationPlayed &&
            sectionTop <= screenHeight &&
            sectionBottom >= 0
        ) {
            if (currentlyPlayingEffectElement != null
                && currentlyPlayingEffectElement != element) {
                currentlyPlayingEffectElement.style.animationPlayState = "paused";
                currentlyPlayingEffectElement.style.borderColor = "transparent";
            }
            currentlyPlayingEffectElement = element;
            element.style.visibility = "visible";
            element.style.animationPlayState = "running";
            startTypingEffect(element);
            animationPlayed = true;
        } else if (
            sectionTop >= screenHeight ||
            sectionBottom <= 0
        ) {
            if (currentlyPlayingEffectElement == element) {
                currentlyPlayingEffectElement.style.animationPlayState = "paused";
                currentlyPlayingEffectElement.style.borderColor = "transparent";
                currentlyPlayingEffectElement = null;
            }
            element.style.visibility = "hidden";
            animationPlayed = false;
        }
    };
}


function handleTypingTargets() {
    const typingTargets = document.querySelectorAll(".typing-target");
    const typingEffects = [];

    typingTargets.forEach((target) => {
        target.setAttribute("data-text", target.textContent);
        target.textContent = "";
        target.style.visibility = "hidden";
        typingEffects.push(createTypingEffect(target));
    });

    window.addEventListener("scroll", () => {
        typingEffects.forEach((effect) => effect());
    });

    typingEffects.forEach((effect) => effect());
}

const lerp = (start, end, delta) => start * (1 - delta) + end * delta;



const rotationStrength = 50;

function lerpColor(source, target, alpha) {
    let result = { r: 0, g: 0, b: 0, a: 0 };
    result.r = lerp(source.r, target.r, alpha);
    result.g = lerp(source.g, target.g, alpha);
    result.b = lerp(source.b, target.b, alpha);
    result.a = lerp(source.a, target.a, alpha);
    return result;
}

function playVideo(videoId) {
    const video = document.getElementById(videoId);
    const overlay = video.nextElementSibling;
    if (video.paused) {
        video.play();
        overlay.style.display = 'none';
    } else {
        video.pause();
        overlay.style.display = 'block';
    }
}

function toggleVideoSize(videoId) {
    const videoSection = document.getElementById(videoId).parentElement;
    const textSection = videoSection.parentElement.querySelector('.text-section');
    const arrow = videoSection.querySelector('.expand-arrow');

    if (videoSection.classList.contains('expanded')) {
        // Minimize the video player to its original size
        videoSection.classList.remove('expanded');
        textSection.classList.remove('minimized');
        arrow.textContent = '»'; // Change the arrow direction
    } else {
        // Expand the video player
        videoSection.classList.add('expanded');
        textSection.classList.add('minimized');
        arrow.textContent = '«'; // Change the arrow direction
    }
}

if (typeof videojs !== 'undefined') {
    function handleVideoPlayers() {
        document.querySelectorAll('.video-js').forEach(function (videoElement) {
            videojs(videoElement.id);
        });
    }
} else {
    console.error('Video.js library is not loaded.');
}

function handlePortfolioDetails() {
    document.querySelectorAll('.portfolio-item').forEach(function (item) {
        item.addEventListener('click', function () {
            let id = this.id.replace('item-', 'detail-');
            let detail = document.getElementById(id);
            // Check if the detail element exists
            if (detail) {
                // Show the detail panel
                detail.style.display = 'block';
                // Disable interactions with the background content
                document.getElementById('portfolio').style.pointerEvents = 'none';
                // Disable scrolling on the main page
                document.body.style.overflow = 'hidden';
            } else {
                console.error('Detail element not found:', id);
            }
        });
    });

    // Close the detail panel when the overlay is clicked
    document.querySelectorAll('.portfolio-detail').forEach(function (detailElement) {
        detailElement.addEventListener('click', function (event) {
            if (event.target == this) {
                closeDetail(this.id);
            }
        });
    });
}

function handlePortfolioItems() {
    const portfolioItems = document.querySelectorAll(".portfolio-item");
    const rotationStrength = 30;
    const clickIndicator = document.createElement("div");

    portfolioItems.forEach((item) => {
        item.style.position = "relative";
        item.appendChild(clickIndicator.cloneNode(true));

        let isHovered = false;

        const handleMove = (e, isTouch = false) => {
            const rect = item.getBoundingClientRect();

            const clientX = isTouch ? e.touches[0].clientX : e.clientX;
            const clientY = isTouch ? e.touches[0].clientY : e.clientY;

            const relX = clientX - (rect.left + rect.width / 2);
            const relY = (rect.top + rect.height / 2) - clientY;

            let rotateY = 0;
            let rotateX = 0;

            rotateX = relY / rect.height * rotationStrength;
            rotateY = relX / rect.width * rotationStrength;

            // Calculate the available space
            const availableSpaceLeft = rect.left;
            const availableSpaceRight = window.innerWidth - (rect.left + rect.width);

            // Calculate the scale based on the available space
            const scale = Math.min(1.5, window.innerWidth / rect.width);

            // Calculate the displacement
            const maxDisplacement = (rect.width * scale - rect.width) / 2;
            let translateX = 0;
            if (availableSpaceLeft < maxDisplacement) {
                translateX = maxDisplacement - availableSpaceLeft;
            } else if (availableSpaceRight < maxDisplacement) {
                translateX = availableSpaceRight - maxDisplacement;
            }

            item.style.transform = `perspective(1000px) scale(${scale}) translateX(${translateX}px) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

            let rotateXDelta = (rotateX + rotationStrength / 2) / rotationStrength;

            //background shine effect when tilting upwards
            let bgImage = ``;
            if (isHovered) {
                if (rotateXDelta > 0.75) {
                    rotateXDelta = (rotateXDelta - 0.75) * 4;
                }
            }
        };

        item.addEventListener("mousemove", handleMove);

        item.addEventListener("mouseenter", () => {
            isHovered = true;
        });

        item.addEventListener("mouseleave", () => {
            isHovered = false;
        });

        item.addEventListener("mouseleave", () => {
            item.style.transform = "";
            item.querySelector("div").style.opacity = "0";
        });

        item.addEventListener("mousedown", () => {
            item.querySelector("div").style.transform = "translateX(-50%) scale(0.9)";
        });

        item.addEventListener("mouseup", () => {
            item.querySelector("div").style.transform = "translateX(-50%) scale(1)";
        });

        item.addEventListener("touchstart", () => {
            item.querySelector("div").style.transform = "translateX(-50%) scale(0.9)";
        });

        item.addEventListener("touchend", () => {
            item.querySelector("div").style.transform = "translateX(-50%) scale(1)";

        });
    });
}

function getMontFromScroll() {
    const MonthSizeInPx = 5;
    const YearSizeInPx = 10;

}

function setupVideo() {
    var video = document.getElementById('heroVideo');
    var overlay = document.getElementById('videoOverlay');

    // Set the height of the ::after pseudo-element to be the same as the height of the video
    overlay.style.setProperty('--video-height', video.clientHeight + 'px');
    console.log(video.clientHeight);

    // Update the height of the ::after pseudo-element when the window is resized
    window.addEventListener('resize', function () {
        overlay.style.setProperty('--video-height', video.clientHeight + 'px');
    });
}

window.addEventListener("DOMContentLoaded", function () {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add("visible");
            } else {
                entry.target.classList.remove("visible");
            }
        });
    }, {
        threshold: 0.1
    });

    const animateElements = document.querySelectorAll(".animate");

    // Assign a random delay to each element
    animateElements.forEach((element) => {
        const randomDelay = Math.random() * 0.5; // Random delay between 0 and 2 seconds
        element.style.transitionDelay = `${randomDelay}s`;
    });

    animateElements.forEach((element) => {
        observer.observe(element);
    });


    handleTypingTargets();

    handlePortfolioItems();

    handlePortfolioDetails();

    handleVideoPlayers();

    setupVideo();
});

