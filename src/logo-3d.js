import * as THREE from 'three';
import { createGeometry, shape } from './logo-shape.js';
import { convexHull } from './logo-math.js';
import { createPhysics, STEP } from './logo-physics.js';
import { createLogoMaterial, addLogoLighting } from './logo-material.js';

const slot = document.querySelector('.logo-slot');
const fallback = slot.querySelector('img');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
} catch {
  fallback.hidden = false;
}
if (renderer) {
  fetch(LOGO_MESH_URL).then(response => {
    if (!response.ok) throw new Error('Logo mesh could not be loaded');
    return response.arrayBuffer();
  }).then(buffer => initialize(renderer, buffer)).catch(error => {
    renderer.domElement.remove();
    renderer.dispose();
    fallback.hidden = false;
    console.warn('Using the static logo:', error);
  });
}

function initialize(renderer, buffer) {
  const canvas = renderer.domElement;
  canvas.className = 'logo-scene';
  canvas.setAttribute('aria-hidden', 'true');
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.6;
  document.body.append(canvas);

  const handle = document.createElement('button');
  handle.className = 'logo-handle';
  handle.type = 'button';
  handle.setAttribute('aria-label', 'Drag the 3D logo. Arrow keys push it. Escape resets it.');
  handle.setAttribute('aria-describedby', 'logo-help');
  document.body.append(handle);
  const resetButton = document.querySelector('.logo-reset');
  const help = document.querySelector('#logo-help');
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.z = 10;
  const geometry = createGeometry(buffer);
  addLogoLighting(renderer, scene);
  const material = createLogoMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const physics = createPhysics(8, 6);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const projected = new THREE.Vector3();
  let pixelsPerUnit = 300;
  let width = 0, height = 0, activePointer = null, grabDepth = 0;
  let touched = false, frame = 0, lastTime = 0, accumulator = 0;
  let home = { x: 0, y: 0 };
  let returning = null;

  function syncMesh() {
    mesh.position.copy(physics.body.position);
    mesh.quaternion.copy(physics.body.quaternion);
    mesh.updateMatrixWorld(true);
  }

  function updateHandle() {
    // A clipped hit region follows the projected solid, so the full-screen
    // drawing canvas never blocks navigation or scrolling elsewhere on the page.
    const points = physics.vertices.map(v => {
      projected.set(v.x, v.y, v.z).applyMatrix4(mesh.matrixWorld).project(camera);
      return { x: (projected.x + 1) * width / 2, y: (1 - projected.y) * height / 2 };
    });
    const hull = convexHull(points);
    const left = Math.min(...points.map(p => p.x));
    const top = Math.min(...points.map(p => p.y));
    const w = Math.max(...points.map(p => p.x)) - left;
    const h = Math.max(...points.map(p => p.y)) - top;
    help.style.left = `${Math.max(60, Math.min(width - 60, left + w / 2))}px`;
    help.style.top = `${Math.max(8, Math.min(height - 40, top >= 48 ? top - 40 : top + h + 12))}px`;
    handle.style.left = `${left}px`;
    handle.style.top = `${top}px`;
    handle.style.width = `${w}px`;
    handle.style.height = `${h}px`;
    handle.style.clipPath = `polygon(${hull.map(p => `${(p.x - left) / w * 100}% ${(p.y - top) / h * 100}%`).join(',')})`;
  }

  function draw() {
    syncMesh();
    updateHandle();
    renderer.render(scene, camera);
  }

  function resize() {
    release();
    const previousScale = pixelsPerUnit;
    width = document.documentElement.clientWidth;
    height = window.innerHeight;
    const rect = slot.getBoundingClientRect();
    // The model's outline is approximately one world unit wide.
    pixelsPerUnit = Math.min(rect.width, height / 2.5);
    camera.left = -width / pixelsPerUnit / 2;
    camera.right = -camera.left;
    camera.top = height / pixelsPerUnit / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    home = {
      x: (rect.left + rect.width / 2 - width / 2) / pixelsPerUnit,
      y: (height / 2 - rect.top - rect.height / 2) / pixelsPerUnit,
    };
    physics.body.position.x *= previousScale / pixelsPerUnit;
    physics.body.position.y *= previousScale / pixelsPerUnit;
    physics.resize(width / pixelsPerUnit, height / pixelsPerUnit);
    if (!touched) reset();
    else { physics.body.wakeUp(); wake(); draw(); }
  }

  function tick(time) {
    frame = 0;
    if (document.hidden) return;
    const elapsed = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : STEP;
    lastTime = time;
    if (returning) {
      returning.elapsed += elapsed;
      const t = Math.min(returning.elapsed / 0.65, 1);
      const eased = t * t * (3 - 2 * t);
      physics.body.position.copy(returning.fromPosition.clone().lerp(returning.toPosition, eased));
      physics.body.quaternion.copy(returning.fromRotation.clone().slerp(returning.toRotation, eased));
      physics.body.aabbNeedsUpdate = true;
      if (t === 1) reset();
      else { draw(); frame = requestAnimationFrame(tick); }
      return;
    }
    accumulator += elapsed;
    while (accumulator >= STEP) {
      physics.step();
      accumulator -= STEP;
    }
    draw();
    if (physics.dragging || physics.body.sleepState !== 2) frame = requestAnimationFrame(tick);
    else { lastTime = 0; accumulator = 0; }
  }

  function wake() {
    if (!frame && !document.hidden) {
      lastTime = 0;
      frame = requestAnimationFrame(tick);
    }
  }

  function stopAnimation() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastTime = 0;
    accumulator = 0;
  }

  function reset(smooth = false) {
    const fromPosition = new THREE.Vector3().copy(physics.body.position);
    const fromRotation = new THREE.Quaternion().copy(physics.body.quaternion);
    returning = null;
    release();
    touched = false;
    physics.reset(home.x, home.y);
    // Align the original image rectangle, not the silhouette bounding box.
    // This preserves the image's transparent margins and its exact projection.
    physics.body.position.x += shape.center.x - 0.5;
    physics.body.position.y += shape.center.y + 686 / 656 / 2;
    physics.contain();
    resetButton.hidden = true;
    stopAnimation();
    if (smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      returning = {
        fromPosition, fromRotation,
        toPosition: new THREE.Vector3().copy(physics.body.position),
        toRotation: new THREE.Quaternion().copy(physics.body.quaternion),
        elapsed: 0,
      };
      physics.body.position.copy(fromPosition);
      physics.body.quaternion.copy(fromRotation);
      physics.body.aabbNeedsUpdate = true;
      wake();
    }
    draw();
  }

  function release() {
    if (activePointer === null) return;
    const id = activePointer;
    activePointer = null;
    physics.release();
    handle.classList.remove('is-dragging');
    if (handle.hasPointerCapture(id)) handle.releasePointerCapture(id);
    wake();
  }

  function markTouched() {
    returning = null;
    physics.body.updateInertiaWorld(true);
    touched = true;
    resetButton.hidden = false;
  }

  handle.addEventListener('pointerdown', event => {
    if (activePointer !== null || !event.isPrimary || event.button !== 0) return;
    pointer.set(event.clientX / width * 2 - 1, 1 - event.clientY / height * 2);
    syncMesh();
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObject(mesh)[0];
    if (!hit) return;
    event.preventDefault();
    handle.classList.add('pointer-focused');
    handle.focus({ preventScroll: true });
    markTouched();
    activePointer = event.pointerId;
    grabDepth = hit.point.z;
    physics.grab(hit.point);
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('is-dragging');
    wake();
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== activePointer) return;
    physics.move({ x: (event.clientX - width / 2) / pixelsPerUnit, y: (height / 2 - event.clientY) / pixelsPerUnit, z: grabDepth });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, event => {
      if (event.pointerId === activePointer) release();
    });
  }
  handle.addEventListener('dblclick', () => reset(true));
  handle.addEventListener('blur', () => handle.classList.remove('pointer-focused'));
  handle.addEventListener('keydown', event => {
    handle.classList.remove('pointer-focused');
    const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (directions[event.key]) {
      event.preventDefault();
      markTouched();
      physics.body.wakeUp();
      const [x, y] = directions[event.key];
      physics.body.velocity.x += x * 0.8;
      physics.body.velocity.y += y * 0.8;
      wake();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      reset(true);
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') reset(true); });
  resetButton.addEventListener('click', () => { reset(true); handle.classList.remove('pointer-focused'); handle.focus({ preventScroll: true }); });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => {
    release();
    stopAnimation();
    if (!document.hidden && (returning || physics.body.sleepState !== 2)) wake();
  });
  window.addEventListener('resize', resize);
  window.addEventListener('scroll', () => { if (!touched) resize(); }, { passive: true });
  canvas.addEventListener('webglcontextlost', event => {
    event.preventDefault();
    release();
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.hidden = handle.hidden = resetButton.hidden = help.hidden = true;
    canvas.classList.remove('is-ready');
    fallback.hidden = false;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    canvas.hidden = handle.hidden = help.hidden = false;
    fallback.hidden = true;
    reset();
    canvas.classList.add('is-ready');
  });
  resize();
  fallback.hidden = true;
  canvas.classList.add('is-ready');
  help.hidden = false;
  document.fonts.ready.then(() => { if (!touched) resize(); });
}
