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

function lerp(start, end, amt) {
    return (1 - amt) * start + amt * end
}

const rotationStrength = 50;

function handlePortfolioItems() {
    // Get all the elements with the class "portfolio-item"
    const portfolioItems = document.querySelectorAll(".portfolio-item");

    // Loop through each item and add a "mousemove" event listener
    portfolioItems.forEach((item) => {
        const portfolioItems = document.querySelectorAll(".portfolio-item");

        portfolioItems.forEach((item) => {
            item.addEventListener("mousemove", (e) => {
                const rect = item.getBoundingClientRect();

                const relX = e.clientX - (rect.left + rect.width / 2);
                const relY = (rect.top + rect.height / 2) - e.clientY;

                let rotateY = 0;
                let rotateX = 0;

                rotateX = relY / rect.height * rotationStrength;
                rotateY = relX / rect.width * rotationStrength;

                item.style.transform = `perspective(1000px) scale(1.5) rotateY(${rotateY}deg) rotateX(${rotateX}deg)`;

                let rotateXDelta = (rotateX + rotationStrength / 2) / rotationStrength;

                console.log("rot x: " + rotateXDelta);
                let bgImage = `linear-gradient(rgba(49, 255, 52,${lerp(0.4, 1, rotateXDelta).toFixed(3)}), rgb(72, 80, 112,${lerp(0.4, 1, rotateXDelta).toFixed(3)}));`;
                console.log(bgImage);
                item.style.backgroundImage = bgImage;
            });

            item.addEventListener("mouseleave", () => {
                item.style.transform = "";
            });
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
});

