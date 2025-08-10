// scripts.js

// Smooth scroll to section
function scrollToSection(event, sectionId) {
    event.preventDefault();
    const targetSection = document.getElementById(sectionId);
    const nav = document.querySelector('.navbar');
    const offset = nav ? nav.offsetHeight : 0;
    const targetY = targetSection.getBoundingClientRect().top + window.scrollY - offset;

    window.scrollTo({
        top: targetY,
        behavior: 'smooth',
    });

    history.pushState(null, '', `#${sectionId}`);
}

// Typing effect for elements with the class 'typing-target'
function startTypingEffect(element) {
    const fullText = element.getAttribute('data-text');
    let currentCharacter = 0;

    function type() {
        if (currentCharacter < fullText.length) {
            element.textContent += fullText.charAt(currentCharacter);
            currentCharacter++;
            setTimeout(type, 70);
        } else {
            element.classList.remove('typing');
            element.classList.add('typed');
            element.style.borderRight = 'none';
        }
    }

    if (!element.classList.contains('typing') && !element.classList.contains('typed')) {
        element.classList.add('typing');
        element.style.borderRight = '2px solid var(--primary-color)';
        type();
    }
}

// Initialize typing effect on elements
function handleTypingTargets() {
    const typingTargets = document.querySelectorAll(".typing-target");

    typingTargets.forEach(target => {
        target.setAttribute("data-text", target.textContent.trim());
        target.textContent = "";
        target.style.visibility = "hidden";

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                target.style.visibility = "visible";
                startTypingEffect(target);
                observer.disconnect();
            }
        }, { threshold: 0.5 });

        observer.observe(target);
    });
}

// Setup hero video overlay height
function setupVideo() {
    const video = document.getElementById('heroVideo');
    const overlay = document.getElementById('videoOverlay');

    function updateOverlayHeight() {
        overlay.style.setProperty('--video-height', video.clientHeight + 'px');
    }

    updateOverlayHeight();

    // Update the height of the ::after pseudo-element when the window is resized
    window.addEventListener('resize', updateOverlayHeight);
}

// Animate elements on scroll
function animateOnScroll() {
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
}

// Initialize all scripts on DOMContentLoaded
window.addEventListener("DOMContentLoaded", () => {
    setupVideo();
    handleTypingTargets();
    animateOnScroll();
});

// Video.js handling (if used)
if (typeof videojs !== 'undefined') {
    function handleVideoPlayers() {
        document.querySelectorAll('.video-js').forEach(function (videoElement) {
            videojs(videoElement.id);
        });
    }
    handleVideoPlayers();
} else {
    console.warn('Video.js library is not loaded.');
}
