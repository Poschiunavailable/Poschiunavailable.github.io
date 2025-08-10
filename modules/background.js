import * as THREE from 'three';

document.addEventListener('DOMContentLoaded', () => {
  // Scene / Camera / Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  document.getElementById('canvas-container').appendChild(renderer.domElement);

  // Stars
  const isSmall = window.innerWidth < 768;
  const starCount = isSmall ? 2500 : 5000;
  const starFieldRadius = 100;
  const starFieldMoveAreaPercentage = 0.5;

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(starCount * 3);
  const colors = new Float32Array(starCount * 3);

  function getRandomPointInSphere(radius) {
    const p = new THREE.Vector3();
    do {
      p.set(THREE.MathUtils.randFloat(-1, 1), THREE.MathUtils.randFloat(-1, 1), THREE.MathUtils.randFloat(-1, 1));
    } while (p.lengthSq() > 1);
    return p.multiplyScalar(radius);
  }

  for (let i = 0; i < starCount; i++) {
    const p = getRandomPointInSphere(starFieldRadius);
    positions[i * 3 + 0] = p.x;
    positions[i * 3 + 1] = p.y;
    positions[i * 3 + 2] = p.z;

    if (Math.random() > 0.9) {
      colors[i * 3 + 0] = THREE.MathUtils.randFloat(0, 1);
      colors[i * 3 + 1] = THREE.MathUtils.randFloat(0, 1);
      colors[i * 3 + 2] = THREE.MathUtils.randFloat(0, 1);
    } else {
      colors[i * 3 + 0] = 1;
      colors[i * 3 + 1] = 1;
      colors[i * 3 + 2] = 1;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const starsMaterial = new THREE.PointsMaterial({ size: 0.05, depthWrite: false, vertexColors: true });
  const mesh = new THREE.Points(geometry, starsMaterial);
  scene.add(mesh);

  // Camera sway + input
  const clock = new THREE.Clock();
  let elapsedTime = 0;
  const swaySpeedX = 0.48, swaySpeedY = 0.67, swayDistance = 1;

  let targetRotationX = 0, targetRotationY = 0;
  const rotationSpeedX = 0.1, rotationSpeedY = -0.1;

  let isMouseMoving = false;

  // Keep stable references so we can remove them later
  const onMouseMove = (e) => {
    isMouseMoving = true;
    targetRotationX = ((e.clientX / window.innerWidth) * 2 - 1) * rotationSpeedX;
    targetRotationY = ((e.clientY / window.innerHeight) * 2 - 1) * rotationSpeedY;
  };
  window.addEventListener('mousemove', onMouseMove);

  let betaRotation = 0;
  let gammaRotation = 0;

  // devicemotion uses rotationRate.{alpha,beta,gamma}
  const onDeviceMotion = (event) => {
    if (!event.rotationRate) return;
    isMouseMoving = true;
    betaRotation += (event.rotationRate.beta || 0);
    gammaRotation += (event.rotationRate.gamma || 0);
    targetRotationY = (gammaRotation / 360) * rotationSpeedY;
    targetRotationX = (betaRotation / 360) * rotationSpeedX;
  };

  // deviceorientation uses .{alpha,beta,gamma} directly
  const onDeviceOrientation = (event) => {
    isMouseMoving = true;
    const beta = event.beta || 0;   // x-axis tilt
    const gamma = event.gamma || 0; // y-axis tilt
    targetRotationY = (gamma / 90) * rotationSpeedY;
    targetRotationX = (beta / 90) * rotationSpeedX;
  };

  async function trySetupMotionInput() {
    let attached = false;
    try {
      // iOS permission gate (best-effort)
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        try { await DeviceMotionEvent.requestPermission(); } catch {}
      }
      window.addEventListener('devicemotion', onDeviceMotion, true);
      attached = true;
    } catch {}

    try {
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
      attached = true;
    } catch {}

    // Generic Sensor API (if available)
    try {
      const permission = await navigator.permissions?.query?.({ name: 'gyroscope' });
      if (permission && (permission.state === 'granted' || permission.state === 'prompt')) {
        const gyro = new Gyroscope({ frequency: 30 });
        gyro.addEventListener('reading', (e) => {
          isMouseMoving = true;
          betaRotation += gyro.y || 0;
          gammaRotation += gyro.x || 0;
          targetRotationY = (gammaRotation / 360) * rotationSpeedY;
          targetRotationX = (betaRotation / 360) * rotationSpeedX;
        });
        gyro.start();
        attached = true;
      }
    } catch {}

    if (!attached) {
      // Mouse only – that’s fine
    }
  }
  trySetupMotionInput();

  function updateCameraPosition() {
    const scrollPercentage = window.scrollY / (document.body.scrollHeight - window.innerHeight || 1);
    const moveAreaLengthExtend = (starFieldRadius * starFieldMoveAreaPercentage) / 2;
    const zPosition = -moveAreaLengthExtend + moveAreaLengthExtend * 2 * scrollPercentage;
    camera.position.z = zPosition;
  }

  function render() {
    requestAnimationFrame(render);

    const currentElapsed = clock.getElapsedTime();
    const dt = currentElapsed - elapsedTime;
    elapsedTime = currentElapsed;

    // sway
    camera.position.x = Math.sin(elapsedTime * swaySpeedX) * swayDistance;
    camera.position.y = Math.cos(elapsedTime * swaySpeedY) * swayDistance;

    // smooth rotation
    camera.rotation.x += (targetRotationY - camera.rotation.x) * 5 * dt;
    camera.rotation.y += (targetRotationX - camera.rotation.y) * 5 * dt;

    updateCameraPosition();
    renderer.render(scene, camera);
  }
  render();

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  };
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', updateCameraPosition);

  // Reduce work when tab is hidden
  document.addEventListener('visibilitychange', () => {
    renderer.setAnimationLoop(document.hidden ? null : render);
  });

  window.addEventListener('beforeunload', () => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', updateCameraPosition);
    window.removeEventListener('devicemotion', onDeviceMotion, true);
    window.removeEventListener('deviceorientation', onDeviceOrientation, true);
  });
});