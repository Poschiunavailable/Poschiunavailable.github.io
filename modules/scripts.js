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
    const fullText = element.getAttribute("data-text");
    let currentCharacter = 0;

    function type() {
        if (currentCharacter < fullText.length) {
            element.textContent += fullText.charAt(currentCharacter);
            currentCharacter++;
            setTimeout(type, 70); // Adjust the typing speed as desired
        } else {
            element.classList.remove('typing');
            element.classList.add('typed'); // Add a 'typed' class when finished
            element.dispatchEvent(new Event('typed')); // Dispatch a custom event
        }
    }

    type(); // Start typing immediately
}

function handlePortfolioDetails() {
    const items = document.querySelectorAll('.portfolio-item');
    const details = document.querySelectorAll('.portfolio-detail');

    function openDetail(itemId) {
        const detailId = itemId.replace('item-', 'detail-');
        const detail = document.getElementById(detailId);
        if (detail) {
            detail.style.display = 'block';
            document.getElementById('portfolio').style.pointerEvents = 'none';
            document.body.style.overflow = 'hidden';
        }
    }

    function closeDetail(detailId) {
        document.getElementById(detailId).style.display = 'none';
        document.getElementById('portfolio').style.pointerEvents = 'auto';
        document.body.style.overflow = 'auto';
    }

    items.forEach(item => item.addEventListener('click', () => openDetail(item.id)));
    details.forEach(detail => detail.addEventListener('click', (event) => {
        if (event.target === detail) closeDetail(detail.id);
    }));
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
    let observer; // Declare observer outside the returned function

    return function () {
        const sectionTop = element.parentElement.getBoundingClientRect().top;
        const sectionBottom = element.parentElement.getBoundingClientRect().bottom;
        const screenHeight = window.innerHeight;

        if (sectionTop <= screenHeight && sectionBottom >= 0) {
            if (!animationPlayed) {
                animationPlayed = true;
                element.style.visibility = "visible";
                startTypingEffect(element);
            }

            // If an observer is already attached, disconnect it
            if (observer) {
                observer.disconnect();
            }

            // Create a new observer that will reset the animation when the element is no longer visible
            observer = new IntersectionObserver(
                ([entry]) => {
                    if (!entry.isIntersecting) {
                        element.textContent = "";
                        currentCharacter = 0;
                        animationPlayed = false; // Reset the animationPlayed flag
                    }
                    // Inside the IntersectionObserver callback
                    if (!entry.isIntersecting && sectionBottom <= 0) {
                        setTimeout(() => {
                            element.textContent = "";
                            currentCharacter = 0;
                            animationPlayed = false;
                        }, 500); // Add a slight delay (e.g., 500ms) before resetting
                    }
                },
                { threshold: 0.5 }
            );

            observer.observe(element);

        } else {
            element.style.visibility = "hidden";

            // Disconnect the observer if the element is not in view
            if (observer) {
                observer.disconnect();
            }
        }
    };
}

function handleTypingTargets() {
    const typingTargets = document.querySelectorAll(".typing-target");
    let currentTypingTargetIndex = 0;
    const observers = [];

    function processNextTypingTarget() {
        if (currentTypingTargetIndex < typingTargets.length) {
            const target = typingTargets[currentTypingTargetIndex];
            target.setAttribute("data-text", target.textContent);
            target.textContent = "";
            target.style.visibility = "hidden";

            if (observers[currentTypingTargetIndex]) {
                observers[currentTypingTargetIndex].disconnect();
            }

            observers[currentTypingTargetIndex] = new IntersectionObserver(([entry]) => {
                if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
                    if (!target.classList.contains('typing')) { // Check if already typing
                        target.style.visibility = "visible";
                        startTypingEffect(target);
                    }
                } else {
                    // Only reset if not currently typing
                    if (!target.classList.contains('typing')) {
                        target.textContent = "";
                        target.classList.remove('typed');
                    }
                }
            }, { threshold: 0.5 });

            observers[currentTypingTargetIndex].observe(target);

            target.addEventListener('typed', () => {
                currentTypingTargetIndex++;
                processNextTypingTarget();
            }, { once: true });
        }
    }

    processNextTypingTarget();
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

function getMonthFromScroll() {
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

window.addEventListener("DOMContentLoaded", () => {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            entry.target.classList.toggle("visible", entry.isIntersecting);
        });
    }, { threshold: 0.1 });

    document.querySelectorAll(".animate").forEach(element => {
        const randomDelay = Math.random() * 0.5;
        element.style.transitionDelay = `${randomDelay}s`;
        observer.observe(element);
    });

    handleTypingTargets();
    handlePortfolioItems();
    handlePortfolioDetails();
    handleVideoPlayers();
    setupVideo();
});