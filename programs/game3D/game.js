import * as THREE from "three";
import { PointerLockControls } from "https://unpkg.com/three@0.146.0/examples/jsm/controls/PointerLockControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.146.0/examples/jsm/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "https://unpkg.com/three@0.146.0/examples/jsm/utils/SkeletonUtils.js";

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3b82f6);
scene.fog = new THREE.Fog(0x7cc2ff, 45, 150);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 1.8, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.domElement.tabIndex = 1;
document.body.appendChild(renderer.domElement);

const overlay = document.getElementById("overlay");
const startButton = document.getElementById("startButton");
const scoreElement = document.getElementById("score");
const hpElement = document.getElementById("hp");
const weaponElement = document.getElementById("weapon");
const ammoElement = document.getElementById("ammo");
const messageElement = document.getElementById("message");
const crosshairElement = document.getElementById("crosshair");
const sniperCrosshairElement = document.getElementById("sniperCrosshair");
const defaultFov = 75;
const sniperAimFov = 35;
let isSniperAiming = false;

const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());
let audioContext = null;

function ensureAudioContext() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    audioContext = new AudioCtx();
  }
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone({ frequency = 440, type = "sine", duration = 0.08, volume = 0.08, slideTo = null }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo !== null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playNoiseBurst({ duration = 0.05, volume = 0.04 }) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start();
}

function playShootSfx(weaponName) {
  if (weaponName === "sniper") {
    playTone({ frequency: 220, type: "square", duration: 0.1, volume: 0.12, slideTo: 80 });
    playNoiseBurst({ duration: 0.08, volume: 0.03 });
    return;
  }
  if (weaponName === "pistol") {
    playTone({ frequency: 420, type: "square", duration: 0.06, volume: 0.09, slideTo: 150 });
    playNoiseBurst({ duration: 0.04, volume: 0.02 });
    return;
  }
  playTone({ frequency: 780, type: "triangle", duration: 0.05, volume: 0.07, slideTo: 320 });
}

function playHitSfx() {
  playTone({ frequency: 300, type: "sawtooth", duration: 0.05, volume: 0.06, slideTo: 200 });
}

function playKillSfx() {
  playTone({ frequency: 260, type: "triangle", duration: 0.12, volume: 0.07, slideTo: 110 });
}

function playExplosionSfx() {
  playTone({ frequency: 140, type: "sawtooth", duration: 0.16, volume: 0.1, slideTo: 55 });
  playNoiseBurst({ duration: 0.1, volume: 0.08 });
}

function playJumpSfx() {
  playTone({ frequency: 180, type: "sine", duration: 0.08, volume: 0.05, slideTo: 260 });
}

function playDamageSfx() {
  playTone({ frequency: 130, type: "sawtooth", duration: 0.09, volume: 0.07, slideTo: 90 });
}

function requestPointerLock() {
  messageElement.textContent = "";
  ensureAudioContext();
  renderer.domElement.focus();
  if (renderer.domElement.requestPointerLock) {
    renderer.domElement.requestPointerLock();
  } else {
    controls.lock();
  }
}

startButton.addEventListener("click", () => {
  resetGame();
  requestPointerLock();
});
renderer.domElement.addEventListener("click", () => {
  if (!controls.isLocked) requestPointerLock();
});

controls.addEventListener("lock", () => overlay.classList.add("hidden"));
controls.addEventListener("unlock", () => {
  overlay.classList.remove("hidden");
  setSniperAim(false);
});

document.addEventListener("pointerlockerror", () => {
  messageElement.textContent = "Chrome zamknuti mysi odmitl. Spust hru pres http://localhost a klikni znovu.";
});

const ambientLight = new THREE.AmbientLight(0xdbeafe, 0.5);
scene.add(ambientLight);
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 22, 8);
dirLight.castShadow = true;
scene.add(dirLight);

const floorCanvas = document.createElement("canvas");
floorCanvas.width = 512;
floorCanvas.height = 512;
const floorCtx = floorCanvas.getContext("2d");
if (floorCtx) {
  const tileSize = 64;
  for (let y = 0; y < floorCanvas.height; y += tileSize) {
    for (let x = 0; x < floorCanvas.width; x += tileSize) {
      const even = ((x + y) / tileSize) % 2 === 0;
      floorCtx.fillStyle = even ? "#2f3236" : "#26292d";
      floorCtx.fillRect(x, y, tileSize, tileSize);
      floorCtx.strokeStyle = "#1b1e22";
      floorCtx.lineWidth = 2;
      floorCtx.strokeRect(x, y, tileSize, tileSize);
    }
  }
  for (let i = 0; i < 7000; i += 1) {
    const px = Math.floor(Math.random() * floorCanvas.width);
    const py = Math.floor(Math.random() * floorCanvas.height);
    const shade = 52 + Math.floor(Math.random() * 34);
    floorCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
    floorCtx.fillRect(px, py, 1, 1);
  }
  for (let i = 0; i < 120; i += 1) {
    const x = Math.floor(Math.random() * floorCanvas.width);
    const y = Math.floor(Math.random() * floorCanvas.height);
    const len = 8 + Math.floor(Math.random() * 24);
    floorCtx.strokeStyle = "rgba(18, 20, 24, 0.45)";
    floorCtx.lineWidth = 1;
    floorCtx.beginPath();
    floorCtx.moveTo(x, y);
    floorCtx.lineTo(x + len, y + Math.floor(Math.random() * 6) - 3);
    floorCtx.stroke();
  }
}
const floorTexture = new THREE.CanvasTexture(floorCanvas);
floorTexture.wrapS = THREE.RepeatWrapping;
floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(10, 10);
floorTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140),
  new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.97, metalness: 0.02 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

const walls = [];
const wallCanvas = document.createElement("canvas");
wallCanvas.width = 512;
wallCanvas.height = 512;
const wallCtx = wallCanvas.getContext("2d");
if (wallCtx) {
  wallCtx.fillStyle = "#6f3a2b";
  wallCtx.fillRect(0, 0, wallCanvas.width, wallCanvas.height);
  const brickW = 64;
  const brickH = 30;
  for (let row = 0; row < wallCanvas.height / brickH + 1; row += 1) {
    const y = row * brickH;
    const offset = row % 2 === 0 ? 0 : brickW / 2;
    for (let x = -offset; x < wallCanvas.width + brickW; x += brickW) {
      const red = 120 + Math.floor(Math.random() * 38);
      const green = 62 + Math.floor(Math.random() * 24);
      const blue = 44 + Math.floor(Math.random() * 18);
      wallCtx.fillStyle = `rgb(${red},${green},${blue})`;
      wallCtx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);

      wallCtx.strokeStyle = "rgba(65, 35, 26, 0.35)";
      wallCtx.lineWidth = 1;
      wallCtx.strokeRect(x + 2, y + 2, brickW - 4, brickH - 4);
    }
  }

  wallCtx.strokeStyle = "rgba(206, 196, 182, 0.45)";
  wallCtx.lineWidth = 2;
  for (let y = 0; y < wallCanvas.height; y += brickH) {
    wallCtx.beginPath();
    wallCtx.moveTo(0, y);
    wallCtx.lineTo(wallCanvas.width, y);
    wallCtx.stroke();
  }

  for (let i = 0; i < 5500; i += 1) {
    const px = Math.floor(Math.random() * wallCanvas.width);
    const py = Math.floor(Math.random() * wallCanvas.height);
    const shade = 90 + Math.floor(Math.random() * 45);
    wallCtx.fillStyle = `rgba(${shade},${Math.max(40, shade - 28)},${Math.max(25, shade - 42)},0.2)`;
    wallCtx.fillRect(px, py, 1, 1);
  }
}
const wallTexture = new THREE.CanvasTexture(wallCanvas);
wallTexture.wrapS = THREE.RepeatWrapping;
wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(3, 1.5);
wallTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

const wallMaterial = new THREE.MeshStandardMaterial({
  map: wallTexture,
  color: 0xffffff,
  roughness: 0.9,
  metalness: 0.02,
});

function createWall(x, z, width, depth, height = 3) {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wallMaterial);
  wall.position.set(x, height / 2, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  scene.add(wall);
  walls.push(wall);
}

createWall(0, -34, 68, 1);
createWall(0, 34, 68, 1);
createWall(-34, 0, 1, 68);
createWall(34, 0, 1, 68);
createWall(-12, -10, 20, 1);
createWall(8, 8, 1, 16);
createWall(18, -12, 12, 1);
createWall(-18, 14, 1, 12);

const fallbackPhotoFiles = ["IMG_20260404_160232.jpg"];

async function getPhotoFileList() {
  try {
    const response = await fetch("./assets/photos/");
    if (!response.ok) throw new Error("Photo directory listing unavailable.");
    const html = await response.text();
    const hrefMatches = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const files = hrefMatches
      .filter((href) => /\.(jpg|jpeg|png|webp)$/i.test(href))
      .map((href) => href.split("/").pop())
      .filter(Boolean);
    return [...new Set(files)];
  } catch {
    return fallbackPhotoFiles;
  }
}

const weaponConfigs = {
  pistol: { label: "PISTOL", damage: 34, cooldown: 0.22, magazineSize: 12, range: 70 },
  sniper: { label: "SNIPER", damage: 100, cooldown: 1.0, magazineSize: 5, range: 130 },
  karambit: { label: "KARAMBIT", damage: 55, cooldown: 0.38, magazineSize: Infinity, range: 2.2 },
};

const weaponModelSources = {
  pistol: {
    url: "./assets/weapons/pistol.glb",
    // targetSize normalizes GLB models regardless of their original units
    targetSize: 0.7,
    position: new THREE.Vector3(0, -0.3, -0.3),
    rotation: new THREE.Euler(0, 0, 0),
  },
  sniper: {
    url: "./assets/weapons/sniper.glb",
    targetSize: 2,
    position: new THREE.Vector3(0, -0.1, -0.1),
    rotation: new THREE.Euler(0, - Math.PI / 2, 0),
  },
  karambit: {
    url: "./assets/weapons/karambit.glb",
    targetSize: 0.8,
    position: new THREE.Vector3(-0.1, -0.02, -0.2),
    rotation: new THREE.Euler(0.5, Math.PI * 1.3, 0),
  },
};

const weaponViewRoot = new THREE.Group();
weaponViewRoot.position.set(0.36, -0.33, -0.62);
camera.add(weaponViewRoot);
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();
const enemyModelPath = "./assets/enemy/jatti.glb";
//const enemyModelPath = "./assets/enemy/mr_man_walking.glb";  //original enemy model
let enemyModelTemplate = null;
let enemyAnimationClips = [];
let enemyModelMissing = false;

gltfLoader.load(
  enemyModelPath,
  (gltf) => {
    enemyModelTemplate = gltf.scene;
    enemyAnimationClips = gltf.animations ?? [];
  },
  undefined,
  () => {
    enemyModelMissing = true;
  }
);

async function createPhotoWalls() {
  const photoFiles = await getPhotoFileList();
  if (!photoFiles.length) return;

  const startZ = -22;
  const gap = 10;
  const baseHeight = 4.2;

  for (let i = 0; i < photoFiles.length; i += 1) {
    const texturePath = `./assets/photos/${photoFiles[i]}`;
    try {
      const imageAspect = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width || 1;
          const h = img.naturalHeight || img.height || 1;
          resolve(w / Math.max(1, h));
        };
        img.onerror = () => resolve(1);
        img.src = texturePath;
      });
      const texture = await textureLoader.loadAsync(texturePath);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const aspect = Math.max(0.35, imageAspect);
      const wallHeight = baseHeight;
      const wallWidth = Math.max(5.5, wallHeight * aspect * 1.6);
      const wallThickness = 0.35;
      const photoMaterial = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.92,
        metalness: 0.03,
      });
      const edgeMaterial = new THREE.MeshStandardMaterial({
        color: 0x707070,
        roughness: 0.95,
        metalness: 0.02,
      });
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(wallWidth, wallHeight, wallThickness),
        [
          edgeMaterial, // +X
          edgeMaterial, // -X
          edgeMaterial, // +Y
          edgeMaterial, // -Y
          photoMaterial, // +Z (front)
          photoMaterial, // -Z (back)
        ]
      );

      const isLeftSide = i % 2 === 0;
      const rowIndex = Math.floor(i / 2);
      const z = startZ + rowIndex * gap;
      // Place photo wall so its bottom edge starts on the floor.
      wall.position.set(isLeftSide ? -31.2 : 31.2, wallHeight / 2, z);
      wall.rotation.y = isLeftSide ? Math.PI / 2 : -Math.PI / 2;
      wall.castShadow = true;
      wall.receiveShadow = true;
      scene.add(wall);
    } catch {
      // Skip broken images, continue with others.
    }
  }
}

createPhotoWalls();

function createPistolView() {
  const group = new THREE.Group();
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.3 });
  const matGrip = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.2, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.11, 0.42), matDark);
  body.position.set(0.02, 0.04, -0.1);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.26), matDark);
  barrel.position.set(0.02, 0.04, -0.36);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.2, 0.11), matGrip);
  grip.position.set(0.01, -0.09, 0.02);
  group.add(body, barrel, grip);
  return group;
}

function createSniperView() {
  const group = new THREE.Group();
  const matMetal = new THREE.MeshStandardMaterial({ color: 0x9ca3af, metalness: 0.85, roughness: 0.25 });
  const matBody = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.4, roughness: 0.7 });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.9, 14), matMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0.02, 0.04, -0.45);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.58), matBody);
  body.position.set(0.02, 0.01, -0.14);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 14), matMetal);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0.02, 0.14, -0.18);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.24), matBody);
  stock.position.set(0.02, -0.04, 0.15);
  group.add(barrel, body, scope, stock);
  return group;
}

function createKarambitView() {
  const group = new THREE.Group();
  const matBlade = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0.95, roughness: 0.1 });
  const matHandle = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.35, roughness: 0.7 });
  const blade = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 14, 28, Math.PI * 1.2), matBlade);
  blade.rotation.z = -0.75;
  blade.position.set(0.05, 0.07, -0.25);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.15, 12), matHandle);
  handle.rotation.z = -0.35;
  handle.position.set(0.0, -0.01, -0.08);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 10, 22), matHandle);
  ring.position.set(-0.02, -0.07, -0.02);
  group.add(blade, handle, ring);
  return group;
}

const weaponModels = {
  pistol: createPistolView(),
  sniper: createSniperView(),
  karambit: createKarambitView(),
};
Object.values(weaponModels).forEach((model) => {
  model.visible = false;
  weaponViewRoot.add(model);
});

function setupWeaponModelVisual(model, castShadows = false) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = castShadows;
      child.receiveShadow = false;
      child.frustumCulled = false;
      if (child.material && "metalness" in child.material) {
        child.material.metalness = Math.min(1, (child.material.metalness ?? 0.3) + 0.2);
      }
      if (child.material && "roughness" in child.material) {
        child.material.roughness = Math.max(0.05, (child.material.roughness ?? 0.6) - 0.1);
      }
    }
  });
}

function applyWeaponTransform(model, config) {
  model.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const maxAxis = Math.max(size.x, size.y, size.z, 0.0001);
  const normalizedScale = config.targetSize / maxAxis;
  const finalScale = config.fixedScale ?? normalizedScale;
  model.scale.setScalar(finalScale);

  model.updateMatrixWorld(true);
  model.position.copy(config.position);
  model.rotation.copy(config.rotation);
}

function loadRealisticWeaponModel(name) {
  const config = weaponModelSources[name];
  return new Promise((resolve) => {
    gltfLoader.load(
      config.url,
      (gltf) => {
        const realistic = gltf.scene;
        setupWeaponModelVisual(realistic, false);
        applyWeaponTransform(realistic, config);
        realistic.visible = false;
        weaponViewRoot.remove(weaponModels[name]);
        weaponModels[name] = realistic;
        weaponViewRoot.add(realistic);
        resolve(true);
      },
      undefined,
      () => {
        // Fallback keeps gameplay running when GLB files are missing.
        resolve(false);
      }
    );
  });
}

Promise.all([
  loadRealisticWeaponModel("pistol"),
  loadRealisticWeaponModel("sniper"),
  loadRealisticWeaponModel("karambit"),
]).then((loaded) => {
  if (!loaded.every(Boolean)) {
    messageElement.textContent =
      "Pro realisticke zbrane pridej GLB soubory do assets/weapons (pistol, sniper, karambit).";
  }
  setWeapon(currentWeapon);
});

let currentWeapon = "pistol";
const ammo = {
  pistol: Infinity,
  sniper: Infinity,
  karambit: Infinity,
};
let weaponKick = 0;
let karambitSwing = 0;

const move = { forward: false, backward: false, left: false, right: false };
const player = {
  hp: 100,
  score: 0,
  velocityY: 0,
  grounded: true,
  eyeHeight: 1.8,
  radius: 0.5,
};

const enemies = [];
const enemyHitMeshes = [];
const bullets = [];
const explosions = [];
const bulletGeometry = new THREE.SphereGeometry(0.045, 8, 8);
const bulletMaterial = new THREE.MeshStandardMaterial({
  color: 0xfbbf24,
  emissive: 0xf59e0b,
  emissiveIntensity: 0.8,
  metalness: 0.2,
  roughness: 0.3,
});
const sniperLaserGeometry = new THREE.CylinderGeometry(0.015, 0.015, 0.75, 10);
const sniperLaserMaterial = new THREE.MeshStandardMaterial({
  color: 0x60a5fa,
  emissive: 0x3b82f6,
  emissiveIntensity: 1.6,
  transparent: true,
  opacity: 0.9,
  metalness: 0.05,
  roughness: 0.15,
});
const explosionFlashGeometry = new THREE.SphereGeometry(0.25, 10, 10);
const explosionParticleGeometry = new THREE.SphereGeometry(0.06, 6, 6);

function createEnemyVisual() {
  if (!enemyModelTemplate) return null;
  const model = skeletonClone(enemyModelTemplate);
  let meshCount = 0;
  model.traverse((child) => {
    if (child.isMesh) meshCount += 1;
  });
  if (meshCount === 0) return null;

  model.rotation.y = -Math.PI / 2;
  model.scale.setScalar(1);
  model.position.set(0, 0, 0);
  model.updateMatrixWorld(true);

  const initialBounds = new THREE.Box3().setFromObject(model);
  const initialSize = new THREE.Vector3();
  initialBounds.getSize(initialSize);
  const sourceHeight = Math.max(initialSize.y, 0.0001);
  const targetHeight = 2.0;
  const normalizedScale = targetHeight / sourceHeight;
  model.scale.setScalar(normalizedScale);
  model.updateMatrixWorld(true);

  const scaledBounds = new THREE.Box3().setFromObject(model);
  // Align feet to the bottom of enemy hit capsule so model touches floor.
  const enemyCapsuleBottom = -1.15;
  const footContactOffset = -0.02;
  model.position.set(0, enemyCapsuleBottom - scaledBounds.min.y + footContactOffset, 0);
  model.updateMatrixWorld(true);

  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      // Animated skinned meshes can get incorrect bounds and flicker/disappear.
      child.frustumCulled = false;
    }
  });

  let mixer = null;
  let walkAction = null;
  if (enemyAnimationClips.length > 0) {
    mixer = new THREE.AnimationMixer(model);
    const walkClip =
      enemyAnimationClips.find((clip) => clip.name.toLowerCase() === "jatti") ??
      enemyAnimationClips.find((clip) => /walk|run|move/i.test(clip.name)) ??
      enemyAnimationClips[0];
    if (walkClip) {
      walkAction = mixer.clipAction(walkClip);
      walkAction.play();
      walkAction.timeScale = 1;
    }
  }

  return { model, mixer, walkAction };
}

function spawnEnemy(x, z) {
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.2, 5, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      roughness: 1,
      metalness: 0,
      depthWrite: false,
    })
  );
  body.position.set(x, 1.1, z);
  body.castShadow = false;
  body.receiveShadow = false;
  scene.add(body);

  const fallbackVisual = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.55, 1.2, 5, 8),
    new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5, metalness: 0.1 })
  );
  fallbackVisual.castShadow = true;
  fallbackVisual.receiveShadow = true;
  fallbackVisual.visible = enemyModelMissing;
  body.add(fallbackVisual);

  const enemy = {
    mesh: body,
    hp: 100,
    speed: 2 + Math.random() * 1.3,
    attackCooldown: 0,
    state: "wander",
    aggroRange: 14,
    attackRange: 1.9,
    radius: 0.52,
    wanderDirection: new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize(),
    wanderTimer: 0.9 + Math.random() * 1.6,
    visualMixer: null,
    walkAction: null,
  };

  if (enemyModelTemplate) {
    const enemyVisual = createEnemyVisual();
    if (enemyVisual) {
      body.add(enemyVisual.model);
      fallbackVisual.visible = false;
      enemy.visualMixer = enemyVisual.mixer;
      enemy.walkAction = enemyVisual.walkAction;
    } else {
      fallbackVisual.visible = true;
    }
  } else if (!enemyModelMissing) {
    gltfLoader.load(
      enemyModelPath,
      (gltf) => {
        if (!body.parent) return;
        enemyModelTemplate = gltf.scene;
        enemyAnimationClips = gltf.animations ?? [];
        const enemyVisual = createEnemyVisual();
        if (enemyVisual) {
          body.add(enemyVisual.model);
          fallbackVisual.visible = false;
          enemy.visualMixer = enemyVisual.mixer;
          enemy.walkAction = enemyVisual.walkAction;
        } else {
          fallbackVisual.visible = true;
        }
      },
      undefined,
      () => {
        enemyModelMissing = true;
        fallbackVisual.visible = true;
      }
    );
  }
  enemies.push(enemy);
  enemyHitMeshes.push(body);
}

const enemySpawnPoints = [
  [-20, -20],
  [-8, -24],
  [18, -20],
  [24, -8],
  [-22, 8],
  [16, 18],
  [-10, 22],
  [22, 24],
];
enemySpawnPoints.forEach(([x, z]) => spawnEnemy(x, z));

function setWeapon(next) {
  currentWeapon = next;
  const weapon = weaponConfigs[currentWeapon];
  if (currentWeapon !== "sniper") {
    setSniperAim(false);
  }
  weaponElement.textContent = weapon.label;
  ammoElement.textContent = "INF";
  const showScope = currentWeapon === "sniper" && isSniperAiming;
  crosshairElement.classList.toggle("hidden", showScope);
  sniperCrosshairElement.classList.toggle("hidden", !showScope);
  Object.entries(weaponModels).forEach(([name, model]) => {
    model.visible = name === currentWeapon;
  });
}

const weaponOrder = ["pistol", "sniper", "karambit"];

function cycleWeapon(direction) {
  const currentIndex = weaponOrder.indexOf(currentWeapon);
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = (safeIndex + direction + weaponOrder.length) % weaponOrder.length;
  setWeapon(weaponOrder[nextIndex]);
}

function setSniperAim(active) {
  isSniperAiming = active && currentWeapon === "sniper";
  camera.fov = isSniperAiming ? sniperAimFov : defaultFov;
  camera.updateProjectionMatrix();
  const showScope = currentWeapon === "sniper" && isSniperAiming;
  crosshairElement.classList.toggle("hidden", showScope);
  sniperCrosshairElement.classList.toggle("hidden", !showScope);
}

function resetGame() {
  for (const bullet of bullets) {
    scene.remove(bullet.mesh);
  }
  bullets.length = 0;

  for (const enemy of enemies) {
    scene.remove(enemy.mesh);
  }
  enemies.length = 0;
  enemyHitMeshes.length = 0;
  enemySpawnPoints.forEach(([x, z]) => spawnEnemy(x, z));

  player.hp = 100;
  player.score = 0;
  player.velocityY = 0;
  player.grounded = true;
  controls.getObject().position.set(0, player.eyeHeight, 20);

  move.forward = false;
  move.backward = false;
  move.left = false;
  move.right = false;

  lastShotTime = 0;
  weaponKick = 0;
  setSniperAim(false);
  setWeapon("pistol");
  scoreElement.textContent = String(player.score);
  hpElement.textContent = String(player.hp);
  messageElement.textContent = "";
}

setWeapon("pistol");
scoreElement.textContent = "0";
hpElement.textContent = String(player.hp);

function collidesWithWall(position) {
  const box = new THREE.Box3(
    new THREE.Vector3(position.x - player.radius, 0.2, position.z - player.radius),
    new THREE.Vector3(position.x + player.radius, 2.2, position.z + player.radius)
  );
  return walls.some((wall) => box.intersectsBox(new THREE.Box3().setFromObject(wall)));
}

function collidesWithWallForEnemy(position, radius = 0.52) {
  const enemyBox = new THREE.Box3(
    new THREE.Vector3(position.x - radius, 0.2, position.z - radius),
    new THREE.Vector3(position.x + radius, 2.2, position.z + radius)
  );
  return walls.some((wall) => enemyBox.intersectsBox(new THREE.Box3().setFromObject(wall)));
}

function moveEnemyWithWallCollision(enemy, direction, speed, delta) {
  if (direction.lengthSq() === 0) return false;
  const stepVector = direction.clone().normalize().multiplyScalar(speed * delta);
  const basePos = enemy.mesh.position;
  const nextX = basePos.clone().add(new THREE.Vector3(stepVector.x, 0, 0));
  const nextZ = basePos.clone().add(new THREE.Vector3(0, 0, stepVector.z));
  let moved = false;

  if (!collidesWithWallForEnemy(nextX, enemy.radius)) {
    enemy.mesh.position.x = nextX.x;
    moved = true;
  }
  if (!collidesWithWallForEnemy(nextZ, enemy.radius)) {
    enemy.mesh.position.z = nextZ.z;
    moved = true;
  }

  return moved;
}

document.addEventListener("keydown", (event) => {
  switch (event.code) {
    case "KeyW":
      move.forward = true;
      break;
    case "KeyS":
      move.backward = true;
      break;
    case "KeyA":
      move.left = true;
      break;
    case "KeyD":
      move.right = true;
      break;
    case "Space":
      if (player.grounded && controls.isLocked) {
        player.velocityY = 7.2;
        player.grounded = false;
        playJumpSfx();
      }
      break;
    case "Digit1":
      setWeapon("pistol");
      break;
    case "Digit2":
      setWeapon("sniper");
      break;
    case "Digit3":
      setWeapon("karambit");
      break;
    default:
      break;
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "KeyW") move.forward = false;
  if (event.code === "KeyS") move.backward = false;
  if (event.code === "KeyA") move.left = false;
  if (event.code === "KeyD") move.right = false;
});

let lastShotTime = 0;
let isPrimaryFireHeld = false;

function damageEnemy(enemy, damage) {
  enemy.hp -= damage;
  playHitSfx();
  enemy.mesh.material.emissive = new THREE.Color(0x7f1d1d);
  setTimeout(() => {
    if (enemy.mesh) enemy.mesh.material.emissive = new THREE.Color(0x000000);
  }, 80);
  if (enemy.hp <= 0) {
    playKillSfx();
    spawnEnemyExplosion(enemy.mesh.position);
    scene.remove(enemy.mesh);
    const index = enemies.indexOf(enemy);
    if (index >= 0) enemies.splice(index, 1);
    const hitIndex = enemyHitMeshes.indexOf(enemy.mesh);
    if (hitIndex >= 0) enemyHitMeshes.splice(hitIndex, 1);
    player.score += 1;
    scoreElement.textContent = String(player.score);
  }
}

function spawnEnemyExplosion(position) {
  playExplosionSfx();
  const group = new THREE.Group();
  group.position.copy(position);
  scene.add(group);

  const flashMaterial = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0xff8c00,
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const flash = new THREE.Mesh(explosionFlashGeometry, flashMaterial);
  group.add(flash);

  const particles = [];
  const particleCount = 12;
  for (let i = 0; i < particleCount; i += 1) {
    const pMaterial = new THREE.MeshStandardMaterial({
      color: 0xff9f43,
      emissive: 0xff6b00,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    const particle = new THREE.Mesh(explosionParticleGeometry, pMaterial);
    const direction = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5)
      .normalize()
      .multiplyScalar(3 + Math.random() * 3.5);
    particle.userData.velocity = direction;
    particle.userData.life = 0.38 + Math.random() * 0.2;
    group.add(particle);
    particles.push(particle);
  }

  explosions.push({
    group,
    flash,
    particles,
    age: 0,
    duration: 0.55,
  });
}

function updateExplosions(delta) {
  for (let i = explosions.length - 1; i >= 0; i -= 1) {
    const explosion = explosions[i];
    explosion.age += delta;
    const t = Math.min(1, explosion.age / explosion.duration);

    const flashScale = 1 + t * 4.2;
    explosion.flash.scale.setScalar(flashScale);
    explosion.flash.material.opacity = Math.max(0, 0.9 * (1 - t));

    for (const particle of explosion.particles) {
      particle.position.addScaledVector(particle.userData.velocity, delta);
      particle.userData.velocity.multiplyScalar(0.93);
      particle.userData.velocity.y -= 4.2 * delta;
      particle.userData.life -= delta;
      particle.material.opacity = Math.max(0, particle.userData.life * 2.2);
    }

    if (explosion.age >= explosion.duration) {
      scene.remove(explosion.group);
      explosions.splice(i, 1);
    }
  }
}

function spawnBullet(weapon, weaponName) {
  const direction = new THREE.Vector3();
  camera.getWorldDirection(direction);
  const muzzlePos = controls
    .getObject()
    .position.clone()
    .add(direction.clone().multiplyScalar(0.9))
    .add(new THREE.Vector3(0, -0.1, 0));

  const isSniperLaser = weaponName === "sniper";
  const mesh = new THREE.Mesh(
    isSniperLaser ? sniperLaserGeometry : bulletGeometry,
    isSniperLaser ? sniperLaserMaterial.clone() : bulletMaterial.clone()
  );
  mesh.position.copy(muzzlePos);
  if (isSniperLaser) {
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
  }
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  bullets.push({
    mesh,
    direction,
    damage: weapon.damage,
    speed: weapon.label === "SNIPER" ? 95 : 70,
    traveled: 0,
    maxDistance: weapon.range,
    type: isSniperLaser ? "sniper-laser" : "bullet",
  });
}

function shoot(nowSeconds) {
  if (!controls.isLocked || player.hp <= 0) return;
  const weapon = weaponConfigs[currentWeapon];
  if (nowSeconds - lastShotTime < weapon.cooldown) return;
  lastShotTime = nowSeconds;

  if (currentWeapon === "karambit") {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const playerPos = controls.getObject().position;
    let target = null;
    let bestDist = weapon.range;
    for (const enemy of enemies) {
      const toEnemy = enemy.mesh.position.clone().sub(playerPos);
      const dist = toEnemy.length();
      if (dist > bestDist) continue;
      const facing = toEnemy.normalize().dot(forward);
      if (facing > 0.55) {
        bestDist = dist;
        target = enemy;
      }
    }
    if (target) damageEnemy(target, weapon.damage);
    playShootSfx(currentWeapon);
    weaponKick = 1;
    karambitSwing = 1;
    return;
  }

  ammoElement.textContent = "INF";
  playShootSfx(currentWeapon);
  weaponKick = 1;
  spawnBullet(weapon, currentWeapon);
}

renderer.domElement.addEventListener("mousedown", (event) => {
  if (event.button === 2) {
    if (currentWeapon === "sniper") {
      setSniperAim(true);
    }
    return;
  }
  if (event.button !== 0) return;
  isPrimaryFireHeld = true;
  shoot(performance.now() / 1000);
});

renderer.domElement.addEventListener("mouseup", (event) => {
  if (event.button === 0) {
    isPrimaryFireHeld = false;
  }
  if (event.button === 2) {
    setSniperAim(false);
  }
});

renderer.domElement.addEventListener("mouseleave", () => {
  isPrimaryFireHeld = false;
  setSniperAim(false);
});

renderer.domElement.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    if (event.deltaY === 0) return;
    cycleWeapon(event.deltaY > 0 ? 1 : -1);
  },
  { passive: false }
);

renderer.domElement.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

const clock = new THREE.Clock();

function updateMovement(delta) {
  if (!controls.isLocked || player.hp <= 0) return;

  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0;
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

  const moveVector = new THREE.Vector3();
  if (move.forward) moveVector.add(forward);
  if (move.backward) moveVector.sub(forward);
  if (move.right) moveVector.add(right);
  if (move.left) moveVector.sub(right);

  if (moveVector.lengthSq() > 0) {
    moveVector.normalize().multiplyScalar(8.2 * delta);
    const basePos = controls.getObject().position;
    const nextX = basePos.clone().add(new THREE.Vector3(moveVector.x, 0, 0));
    const nextZ = basePos.clone().add(new THREE.Vector3(0, 0, moveVector.z));
    if (!collidesWithWall(nextX)) controls.getObject().position.x = nextX.x;
    if (!collidesWithWall(nextZ)) controls.getObject().position.z = nextZ.z;
  }

  player.velocityY -= 18 * delta;
  controls.getObject().position.y += player.velocityY * delta;
  if (controls.getObject().position.y <= player.eyeHeight) {
    controls.getObject().position.y = player.eyeHeight;
    player.velocityY = 0;
    player.grounded = true;
  }
}

function updateEnemies(delta) {
  if (player.hp <= 0) return;
  const playerPos = controls.getObject().position;
  for (const enemy of enemies) {
    const toPlayer = playerPos.clone().sub(enemy.mesh.position);
    const distance = toPlayer.length();
    const shouldAggro = distance <= enemy.aggroRange;
    enemy.state = shouldAggro ? "chase" : "wander";
    let isMoving = false;

    if (enemy.state === "chase") {
      if (distance > enemy.attackRange) {
        isMoving = moveEnemyWithWallCollision(enemy, toPlayer, enemy.speed, delta);
      }
      enemy.mesh.lookAt(playerPos.x, enemy.mesh.position.y, playerPos.z);
    } else {
      enemy.wanderTimer -= delta;
      if (enemy.wanderTimer <= 0) {
        enemy.wanderDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
        enemy.wanderTimer = 0.9 + Math.random() * 1.8;
      }
      isMoving = moveEnemyWithWallCollision(enemy, enemy.wanderDirection, enemy.speed * 0.55, delta);
      if (!isMoving) {
        enemy.wanderDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
      }
      const lookTarget = enemy.mesh.position.clone().add(enemy.wanderDirection);
      enemy.mesh.lookAt(lookTarget.x, enemy.mesh.position.y, lookTarget.z);
    }

    if (enemy.walkAction) {
      enemy.walkAction.timeScale = isMoving ? 1 : 0;
    }
    if (enemy.visualMixer) {
      enemy.visualMixer.update(delta);
    }

    enemy.attackCooldown -= delta;
    if (enemy.state === "chase" && distance < enemy.attackRange && enemy.attackCooldown <= 0) {
      enemy.attackCooldown = 0.8;
      player.hp = Math.max(0, player.hp - 8);
      playDamageSfx();
      hpElement.textContent = String(player.hp);
      if (player.hp <= 0) {
        messageElement.textContent = "Prohral jsi. Klikni na Start pro restart stranky.";
        controls.unlock();
      }
    }
  }
  if (enemies.length === 0 && player.hp > 0) {
    messageElement.textContent = "Vyhra! Vsechny cile eliminovany.";
  }
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const bullet = bullets[i];
    const step = bullet.speed * delta;
    bullet.mesh.position.addScaledVector(bullet.direction, step);
    bullet.traveled += step;

    if (bullet.type === "sniper-laser") {
      bullet.mesh.material.emissiveIntensity = 1.3 + Math.random() * 0.8;
      bullet.mesh.material.opacity = 0.65 + Math.random() * 0.25;
    } else {
      bullet.mesh.material.emissiveIntensity = 0.6 + Math.random() * 0.6;
    }

    const hitEnemyMesh = enemyHitMeshes.find((mesh) => mesh.position.distanceTo(bullet.mesh.position) < 0.8);
    if (hitEnemyMesh) {
      const enemy = enemies.find((item) => item.mesh === hitEnemyMesh);
      if (enemy) damageEnemy(enemy, bullet.damage);
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
      continue;
    }

    const bulletBox = new THREE.Box3().setFromCenterAndSize(
      bullet.mesh.position,
      new THREE.Vector3(0.08, 0.08, 0.08)
    );
    const wallHit = walls.some((wall) => bulletBox.intersectsBox(new THREE.Box3().setFromObject(wall)));
    if (wallHit || bullet.traveled > bullet.maxDistance) {
      scene.remove(bullet.mesh);
      bullets.splice(i, 1);
    }
  }
}

function updateWeaponView(delta, elapsed) {
  if (!controls.isLocked || player.hp <= 0) {
    weaponViewRoot.visible = false;
    return;
  }
  weaponViewRoot.visible = true;
  weaponKick = Math.max(0, weaponKick - delta * 5.6);
  karambitSwing = Math.max(0, karambitSwing - delta * 6.5);
  const bob = Math.sin(elapsed * 6.5) * 0.008;
  const swingProgress = 1 - karambitSwing;
  const swingArc = currentWeapon === "karambit" ? Math.sin(swingProgress * Math.PI) : 0;
  const swingYaw = currentWeapon === "karambit" ? (2.2 - swingProgress * 4.4) * swingArc : 0;
  const swingX = currentWeapon === "karambit" ? -swingArc * 0.36 : 0;
  const swingY = currentWeapon === "karambit" ? -swingArc * 0.12 : 0;
  weaponViewRoot.position.x = 0.36 + bob * 0.5 + swingX;
  weaponViewRoot.position.y = -0.33 + bob - weaponKick * 0.03 + swingY;
  weaponViewRoot.position.z = -0.62 + weaponKick * 0.06;
  weaponViewRoot.rotation.y = -0.2 - weaponKick * 0.15 + swingYaw;
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.elapsedTime;
  if (isPrimaryFireHeld) {
    shoot(performance.now() / 1000);
  }
  updateMovement(delta);
  updateEnemies(delta);
  updateBullets(delta);
  updateExplosions(delta);
  updateWeaponView(delta, elapsed);
  renderer.render(scene, camera);
}

animate();

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
