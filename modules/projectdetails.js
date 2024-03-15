function applyStaggeredFade(listContainer) {
    if (!listContainer || !listContainer.querySelectorAll) return;  // Exit if container is invalid

    const listItems = listContainer.querySelectorAll('.list-item');
    listItems.forEach((item, index) => {
        item.classList.remove('animated'); // Remove the animation class
        item.style.animationDelay = `${index * 0.1}s`;
        void item.offsetWidth;  // Force reflow
        item.classList.add('animated'); // Add the animation class back
    });
}


window.addEventListener("DOMContentLoaded", function () {
    // Add event listeners to all your details elements
    const detailsElements = document.querySelectorAll('details');
    detailsElements.forEach(detail => {
        detail.addEventListener('toggle', function () {
            if (this.open) {
                const listContainer = this.querySelector('.list-container');
                applyStaggeredFade(listContainer);  // Call the function
            }
        });
    });
});