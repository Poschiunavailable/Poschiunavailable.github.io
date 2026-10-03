import * as THREE from 'three';

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  if (!container) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  // No WebGL (disabled, blocklisted GPU, old device): fall back to the static
  // star tile instead of a blank background. Probe with a plain canvas first —
  // three.js logs an error before it throws, so try/catch alone isn't silent.
  const useStaticStars = () => container.classList.add('starfield-static');
  if (!hasWebGL()) { useStaticStars(); return; }

  // Scene / Camera / Renderer
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 0, 0);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
  } catch {
    useStaticStars();
    return;
  }
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);

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

  // ── Motion-blur trails ──────────────────────────────────────────────────────
  // A per-star line segment trailing behind its point. Only built/updated while
  // warping, so normal browsing pays nothing for it. The tail vertex is coloured
  // near-black so each streak fades out along its length — cheaper and sharper
  // than a real accumulation buffer, and directional, which a CSS blur is not.
  const trailGeometry = new THREE.BufferGeometry();
  const trailPositions = new Float32Array(starCount * 2 * 3);
  const trailColors = new Float32Array(starCount * 2 * 3);
  for (let i = 0; i < starCount; i++) {
    const head = i * 6, tail = i * 6 + 3;
    for (let c = 0; c < 3; c++) {
      trailColors[head + c] = colors[i * 3 + c];
      trailColors[tail + c] = colors[i * 3 + c] * 0.06;   // fades to nothing
    }
  }
  trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeometry.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  const trailMaterial = new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0, depthWrite: false,
  });
  const trailMesh = new THREE.LineSegments(trailGeometry, trailMaterial);
  trailMesh.visible = false;
  scene.add(trailMesh);

  // Motion blur is one rule, not a warp special case: a streak is simply how
  // far a star travels relative to the camera during one "shutter" interval.
  // Feed it a signed relative velocity and it works for anything that moves the
  // starfield — the warp jump, or just the user scrolling the page.
  const EXPOSURE   = 0.055;  // seconds of shutter; trail = relVelocity * EXPOSURE
  const TRAIL_MIN  = 0.06;   // shorter than this, don't draw trails at all
  const TRAIL_FULL = 5;      // trail length at which streaks reach full opacity
  const TRAIL_MAX  = 60;     // sanity cap

  function updateTrails(relVelocity) {
    // Trail extends opposite the direction of travel.
    const signed = -relVelocity * EXPOSURE;
    const len = Math.abs(signed);

    if (len < TRAIL_MIN) { trailMesh.visible = false; return; }

    const dz = Math.sign(signed) * Math.min(len, TRAIL_MAX);
    trailMesh.visible = true;
    trailMaterial.opacity = Math.min(0.9, len / TRAIL_FULL);

    const pos = geometry.attributes.position.array;
    for (let i = 0; i < starCount; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const o = i * 6;
      trailPositions[o]     = x; trailPositions[o + 1] = y; trailPositions[o + 2] = z;
      trailPositions[o + 3] = x; trailPositions[o + 4] = y; trailPositions[o + 5] = z + dz;
    }
    trailGeometry.attributes.position.needsUpdate = true;
  }

  // Camera sway + input
  const clock = new THREE.Clock();
  let elapsedTime = 0;
  const swaySpeedX = 0.48, swaySpeedY = 0.67, swayDistance = 1;
  // Accumulated sway phase — see renderFrame() for why this can't be derived
  // from elapsedTime.
  let swayPhaseX = 0, swayPhaseY = 0;
  let warpFactor = 1.0;
  let warpTarget = 1.0;
  // How fast warpFactor chases warpTarget. The jump-to-project burst wants to
  // arrive fast, so callers can ask for a snappier response.
  const WARP_RESPONSE_DEFAULT = 2.5;
  let WARP_RESPONSE = WARP_RESPONSE_DEFAULT;
  window.addEventListener('timeline:warpSpeed', e => {
    warpTarget = e.detail?.factor ?? 1.0;
    WARP_RESPONSE = e.detail?.response ?? WARP_RESPONSE_DEFAULT;
  });

  let targetRotationX = 0, targetRotationY = 0;
  const rotationSpeedX = 0.1, rotationSpeedY = -0.1;

  const onMouseMove = (e) => {
    targetRotationX = ((e.clientX / window.innerWidth) * 2 - 1) * rotationSpeedX;
    targetRotationY = ((e.clientY / window.innerHeight) * 2 - 1) * rotationSpeedY;
  };

  // Absolute device tilt. Only ONE motion source is attached — the previous
  // version wired up devicemotion, deviceorientation and the Generic Sensor
  // API simultaneously, and all three wrote to the same two target variables,
  // fighting each other. deviceorientation gives absolute angles directly, so
  // it needs no drift-prone integration of angular velocity.
  const onDeviceOrientation = (event) => {
    const beta = event.beta || 0;   // front/back tilt
    const gamma = event.gamma || 0; // left/right tilt
    targetRotationY = (gamma / 90) * rotationSpeedY;
    targetRotationX = (beta / 90) * rotationSpeedX;
  };

  function scrollDrivenZ() {
    const scrollPercentage = window.scrollY / (document.body.scrollHeight - window.innerHeight || 1);
    const moveAreaLengthExtend = (starFieldRadius * starFieldMoveAreaPercentage) / 2;
    return -moveAreaLengthExtend + moveAreaLengthExtend * 2 * scrollPercentage;
  }

  function renderFrame() {
    const currentElapsed = clock.getElapsedTime();
    // Clamp dt: returning to a backgrounded tab produces a huge delta that
    // would fling every star across the field in one step.
    const dt = Math.min(0.1, currentElapsed - elapsedTime);
    elapsedTime = currentElapsed;

    warpFactor += (warpTarget - warpFactor) * Math.min(1, dt * WARP_RESPONSE);
    // Snap when close enough. The lerp is asymptotic, so without this warpFactor
    // sits at 1.0001-ish forever and the trail mesh keeps drawing an invisible
    // streak every frame long after the jump has ended.
    if (Math.abs(warpTarget - warpFactor) < 0.002) warpFactor = warpTarget;

    // Sway phase is INTEGRATED, never computed as elapsedTime * rate.
    // Multiplying elapsed time by warpFactor scaled the sine's phase rather
    // than its frequency: when warp decayed 1.8 -> 1.0 after two minutes on
    // the page, the phase snapped by ~46 radians (about seven oscillations)
    // inside one second, which is the violent shake this used to produce.
    // Integrating makes warpFactor change the *rate* only — always continuous,
    // and independent of how long the tab has been open.
    swayPhaseX += dt * swaySpeedX * warpFactor;
    swayPhaseY += dt * swaySpeedY * warpFactor;
    camera.position.x = Math.sin(swayPhaseX) * swayDistance;
    camera.position.y = Math.cos(swayPhaseY) * swayDistance;

    camera.rotation.x += (targetRotationY - camera.rotation.x) * 5 * dt;
    camera.rotation.y += (targetRotationX - camera.rotation.y) * 5 * dt;

    // Warp blend ramps 0 -> 1 over the first bit of warp instead of flipping
    // at a hard `warpFactor > 1.05` threshold, which used to pop camera.z
    // between 0 and its scroll-driven value in a single frame.
    const warpBlend = Math.min(1, Math.max(0, (warpFactor - 1) / 0.6));

    // Hyperspace: stream star particles toward the camera in Z
    const streamSpeed = (warpFactor - 1.0) * 30;
    if (streamSpeed > 0.001) {
      const pos = geometry.attributes.position.array;
      const span = starFieldRadius * 2;
      for (let i = 0; i < starCount; i++) {
        let z = pos[i * 3 + 2] + streamSpeed * dt;
        if (z > starFieldRadius) z -= span;
        pos[i * 3 + 2] = z;
      }
      geometry.attributes.position.needsUpdate = true;
    }

    // Ease the camera toward 0 as warp takes over, rather than snapping.
    const prevZ = camera.position.z;
    camera.position.z = scrollDrivenZ() * (1 - warpBlend);
    const cameraZVelocity = dt > 0 ? (camera.position.z - prevZ) / dt : 0;

    // How fast the stars are moving *relative to the camera* — the only input
    // the blur needs. Warp streaming pushes them one way; scrolling the page
    // flies the camera the other. Either produces streaks, so scrolling fast
    // now blurs the field anywhere on the site, not just in the timeline.
    updateTrails(streamSpeed - cameraZVelocity);

    renderer.render(scene, camera);
  }

  // ── Loop control ────────────────────────────────────────────────────────────
  // Exactly one driver: three.js's setAnimationLoop. renderFrame() must NOT
  // schedule its own requestAnimationFrame — when it did, setAnimationLoop(null)
  // could never actually stop anything, so the "pause when hidden" below was
  // silently a no-op.

  let running = false;

  function startLoop() {
    if (running || reducedMotion.matches) return;
    running = true;
    clock.getDelta();               // discard time accumulated while stopped
    elapsedTime = clock.getElapsedTime();
    renderer.setAnimationLoop(renderFrame);
  }

  function stopLoop() {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  }

  function applyMotionPreference() {
    if (reducedMotion.matches) {
      stopLoop();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('deviceorientation', onDeviceOrientation, true);
      // Static starfield: still drawn, just never animated.
      camera.position.set(0, 0, 0);
      camera.rotation.set(0, 0, 0);
      renderer.render(scene, camera);
    } else {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
      startLoop();
    }
  }

  applyMotionPreference();
  reducedMotion.addEventListener('change', applyMotionPreference);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopLoop();
    else startLoop();
  });

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    if (!running) renderer.render(scene, camera);
  };
  window.addEventListener('resize', onResize);
  // No scroll listener needed — renderFrame() reads window.scrollY each frame.

  // Free the GL context if the page is actually discarded. Deliberately NOT
  // `beforeunload`, which disqualifies the page from the back/forward cache.
  window.addEventListener('pagehide', (e) => {
    if (e.persisted) { stopLoop(); return; }   // bfcache: may come back
    stopLoop();
    geometry.dispose();
    starsMaterial.dispose();
    trailGeometry.dispose();
    trailMaterial.dispose();
    renderer.dispose();
  });
  window.addEventListener('pageshow', () => { if (!document.hidden) startLoop(); });
});

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    // Free the probe's context right away; three.js creates its own.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return !!gl;
  } catch {
    return false;
  }
}
