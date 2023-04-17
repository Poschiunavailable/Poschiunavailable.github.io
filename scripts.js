function randomColor() {
    const colors = [
        '#FFFFFF', '#' + Math.floor(Math.random() * 16777215).toString(16)
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

function createStar(layer) {
    const star = document.createElement('div');
    star.classList.add('star');
    star.style.color = randomColor();
    star.style.left = `${Math.random() * 100}%`;
    star.style.top = `${Math.random() * 100}%`;
    layer.appendChild(star);
    return star;
}

function generateStars(layerId, count) {
    const layer = document.getElementById(layerId);
    const stars = [];
    for (let i = 0; i < count; i++) {
        stars.push(createStar(layer));
    }
    return { layer, stars };
}

function animateLayer(layer, speed) {
    layer.stars.forEach((star) => {
        const top = parseFloat(star.style.top);
        const newTop = top + speed * scrollDirection;

        if (newTop > 100) {
            star.style.top = '0%';
        } else if (newTop < 0) {
            star.style.top = '100%';
        } else {
            star.style.top = `${newTop}%`;
        }
    });
}

let scrollDirection = 1;
let lastScrollPos = window.pageYOffset;
function handleScroll() {
    const currentScrollPos = window.pageYOffset;
    scrollDirection = currentScrollPos > lastScrollPos ? 1 : -1;
    lastScrollPos = currentScrollPos;
    updateBackground();
}

function getStats() {
    return window.devicePixelRatio;
}

const statsElement = document.getElementById('stats');
  statsElement.textContent = getStats();

function updateBackground() {
    animateLayer(layer1, 0.4);
    animateLayer(layer2, 0.8);
    animateLayer(layer3, 1.2);
}

let layer1, layer2, layer3;

function initBackground() {
    layer1 = generateStars('layer1', 200);
    layer2 = generateStars('layer2', 150);
    layer3 = generateStars('layer3', 100);

    updateBackground();
}

window.addEventListener('load', () => {
    initBackground();
});

window.addEventListener('scroll', handleScroll);
