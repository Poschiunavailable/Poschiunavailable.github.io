import * as THREE from 'three';

document.addEventListener('DOMContentLoaded', function () {

    // Create a Three.js scene and camera
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(120, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 0, 0);

    // Create a Three.js renderer and add it to the page
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);

    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const starCount = 5000;
    const starFieldRadius = 100;
    const starFieldMoveAreaPercentage = 0.5;

    // Create a BufferGeometry to store the star positions
    const geometry = new THREE.BufferGeometry();

    // Generate an array for the star positions
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    function getRandomPointInSphere(radius) {
        let point = new THREE.Vector3();
        do {
            point.set(
                THREE.MathUtils.randFloat(-1, 1), // x-coordinate in [-1, 1]
                THREE.MathUtils.randFloat(-1, 1), // y-coordinate in [-1, 1]
                THREE.MathUtils.randFloat(-1, 1)  // z-coordinate in [-1, 1]
            );
        } while (point.lengthSq() > 1); // reject points outside the unit sphere
        point.multiplyScalar(radius); // scale point to the desired radius
        return point;
    }

    for (let i = 0; i < starCount; i++) {
        let randomPoint = getRandomPointInSphere(starFieldRadius)
        const colorChance = Math.random();

        positions[i * 3] = randomPoint.x;
        positions[i * 3 + 1] = randomPoint.y;
        positions[i * 3 + 2] = randomPoint.z;

        if (colorChance > 0.9) {
            colors[i * 3] = THREE.MathUtils.randFloat(0, 1);
            colors[i * 3 + 1] = THREE.MathUtils.randFloat(0, 1);
            colors[i * 3 + 2] = THREE.MathUtils.randFloat(0, 1);
        } else {
            colors[i * 3] = 1;
            colors[i * 3 + 1] = 1;
            colors[i * 3 + 2] = 1;
        }
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const starsMaterial = new THREE.PointsMaterial({
        size: 0.05,
        depthWrite: false,
        vertexColors: true, // This is important to use the colors from the geometry
    });

    const mesh = new THREE.Points(geometry, starsMaterial);

    // Add the mesh to the scene
    scene.add(mesh);

    const statsElement = document.getElementById('stats');

    // Render the scene
    let clock = new THREE.Clock();
    let elapsedTime = 0;
    const swaySpeedX = 1;
    const swaySpeedY = 0.8;
    const swayDistance = 0.1;

    //#region Mouse Movement

    // Variables for storing target rotation
    let targetRotationX = 0;
    let targetRotationY = 0;

    // Constants for controlling the rotation speed
    const rotationSpeedX = 0.1;
    const rotationSpeedY = -0.1;

    window.addEventListener('mousemove', function (event) {
        // Update target rotation based on mouse position
        targetRotationX = ((event.clientX / window.innerWidth) * 2 - 1) * rotationSpeedX;
        targetRotationY = ((event.clientY / window.innerHeight) * 2 - 1) * rotationSpeedY;
    });

    window.addEventListener('deviceorientation', function (event) {
        // Update target rotation based on gyroscope data
        targetRotationY = event.beta / 90 * rotationSpeedY; // beta value controls rotation around x-axis
        targetRotationX = event.gamma / 90 * rotationSpeedX; // gamma value controls rotation around y-axis
    });

    function render() {
        requestAnimationFrame(render);

        let currentElapsedTime = clock.getElapsedTime();
        let deltaTime = currentElapsedTime - elapsedTime;
        // Get elapsed time
        elapsedTime = currentElapsedTime;

        // Calculate the sway
        const swayX = Math.sin(elapsedTime * swaySpeedX) * swayDistance;
        const swayY = Math.cos(elapsedTime * swaySpeedY) * swayDistance;

        // Update camera position
        camera.position.x = swayX
        camera.position.y = swayY

        // Interpolate camera rotation
        camera.rotation.x += (targetRotationY - camera.rotation.x) * 5 * deltaTime;
        camera.rotation.y += (targetRotationX - camera.rotation.y) * 5 * deltaTime;

        statsElement.textContent = " " + camera.position.z + " " + camera.position.x + " " + camera.position.y;

        // Call updateCameraPosition to handle scroll updates as well
        updateCameraPosition();

        renderer.render(scene, camera);
    }
    render();


    function updateCameraPosition() {
        const scrollPercentage = window.scrollY / (document.body.scrollHeight - window.innerHeight);
        const moveAreaLengthExtend = (starFieldRadius * starFieldMoveAreaPercentage) / 2;
        const zPosition = -moveAreaLengthExtend + moveAreaLengthExtend * 2 * scrollPercentage;
        camera.position.set(camera.position.x, camera.position.y, zPosition);
    }

    // Create an IntersectionObserver to update the Z position when scrolling
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(() => {
            updateCameraPosition();
        });
    }, {
        root: null,
        threshold: 0,
    });

    // Observe all sections to trigger updates when scrolling
    const sections = document.querySelectorAll('section');
    sections.forEach((section) => {
        observer.observe(section);
    });

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        // Update composer size
        composer.setSize(window.innerWidth, window.innerHeight);

        // Update bloom pass
        bloomPass.resolution.set(window.innerWidth, window.innerHeight);
    }




    window.addEventListener('scroll', updateCameraPosition);
    window.addEventListener('resize', onWindowResize);
});


