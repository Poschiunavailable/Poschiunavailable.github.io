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

function closeDetail() {
    document.querySelectorAll('.portfolio-detail').forEach(function (detail) {
        detail.style.display = 'none';
    });
}


document.querySelectorAll('.portfolio-item').forEach(function (item) {
    item.addEventListener('click', function () {
        var id = this.id.replace('item', 'detail');  // convert 'itemX' to 'detailX'
        var detail = document.getElementById(id);
        // show the detail panel here
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

function handleVideoPlayers() {
    document.querySelectorAll('.video-js').forEach(function (videoElement) {
        videojs(videoElement.id);
    });
}

function handlePortfolioDetails() {
    document.querySelectorAll('.portfolio-item').forEach(function (item) {
        item.addEventListener('click', function () {
            let id = this.id.replace('item-', 'detail-');
            let detail = document.getElementById(id);
            // Show the detail panel
            detail.style.display = 'block';
        });
    });

    // Close the detail panel when the overlay is clicked
    document.querySelectorAll('.portfolio-detail').forEach(function (detailElement) {
        detailElement.addEventListener('click', function (event) {
            if (event.target == this) {
                closeDetail();
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
        let targetGradient = {
            color1: { r: 49, g: 255, b: 52, a: 0.4 },
            color2: { r: 100, g: 111, b: 154, a: 0.233 },
        };

        let currentGradient = {
            color1: { r: 49, g: 255, b: 52, a: 0.4 },
            color2: { r: 100, g: 111, b: 154, a: 0.233 },
        };
        const updateGradient = () => {
            currentGradient.color1 = lerpColor(currentGradient.color1, targetGradient.color1, 0.05);
            currentGradient.color1 = lerpColor(currentGradient.color2, targetGradient.color2, 0.05);

            item.style.backgroundImage = `linear-gradient(rgba(${currentGradient.color1.r}, ${currentGradient.color1.g}, ${currentGradient.color1.b}, ${currentGradient.color1.a}), rgba(${currentGradient.color2.r}, ${currentGradient.color2.g}, ${currentGradient.color2.b}, ${currentGradient.color2.a}))`;

            requestAnimationFrame(updateGradient);
        };

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
                    targetGradient.color1 = {
                        r: lerp(49, 200, rotateXDelta),
                        g: lerp(255, 255, rotateXDelta),
                        b: lerp(52, 200, rotateXDelta),
                        a: 1,
                    };
                    targetGradient.color2 = {
                        r: lerp(100, 210, rotateXDelta),
                        g: lerp(111, 200, rotateXDelta),
                        b: lerp(154, 255, rotateXDelta),
                        a: 1,
                    };
                } else {
                    targetGradient.color1 = { r: 49, g: 255, b: 52, a: 1 };
                    targetGradient.color2 = { r: 100, g: 111, b: 154, a: 1 };
                }
            }
        };

        item.addEventListener("mousemove", handleMove);

        requestAnimationFrame(updateGradient);

        item.addEventListener("mouseenter", () => {
            isHovered = true;
            targetGradient.color1.a = 1;
            targetGradient.color2.a = 1;
        });

        item.addEventListener("mouseleave", () => {
            isHovered = false;
            targetGradient.color1.a = 0.4;
            targetGradient.color2.a = 0.233;
        });

        item.addEventListener("mouseleave", () => {
            item.style.transform = "";
            item.style.backgroundImage = "linear-gradient(rgba(49, 255, 52, 0.4), rgba(72, 80, 112, 0.4))";
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
    animateElements.forEach((element) => {
        observer.observe(element);
    });


    handleTypingTargets();

    handlePortfolioItems();

    handlePortfolioDetails();

    handleVideoPlayers();
});

