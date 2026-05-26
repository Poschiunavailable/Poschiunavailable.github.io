export function initScripts() {
    setupVideo();
    handleTypingTargets();
    animateOnScroll();
    setupSmoothScrolling();
}

function setupSmoothScrolling() {
    document.querySelectorAll('[data-scroll-to]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('data-scroll-to');
            const targetSection = document.getElementById(targetId);
            const nav = document.querySelector('.navbar');
            const offset = nav ? nav.offsetHeight : 0;
            
            if (targetSection) {
                const targetY = targetSection.getBoundingClientRect().top + window.scrollY - offset;
                window.scrollTo({
                    top: targetY,
                    behavior: 'smooth',
                });
                history.pushState(null, '', `#${targetId}`);
            }
        });
    });
}

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

function setupVideo() {
    const video = document.getElementById('heroVideo');
    const overlay = document.getElementById('videoOverlay');
    if(!video || !overlay) return;

    function updateOverlayHeight() {
        overlay.style.setProperty('--video-height', video.clientHeight + 'px');
    }
    updateOverlayHeight();
    window.addEventListener('resize', updateOverlayHeight);
}

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