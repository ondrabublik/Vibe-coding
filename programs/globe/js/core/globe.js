// The 3D scene: Earth sphere, atmosphere, stars, camera controls and the
// hooks the layers use (surface texture, overlay objects, labels, picking).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LabelLayer } from './labels.js';
import { latLonToVector3, vector3ToLatLon } from './geo.js';

const DEFAULT_DISTANCE = 3.2;

// Lighting presets a surface can ask for. Intensities are multiplied by π
// because three.js (r155+) uses physically based light units.
const LIGHTING = {
  natural: { ambient: 0.22, sun: 1.05 }, // photo-like shading, darker limb
  soft: { ambient: 0.72, sun: 0.36 },    // maps – colours stay readable, slight 3D feel
  flat: { ambient: 1.0, sun: 0.0 },      // no shading at all
};

export class Globe {
  constructor(container, labelContainer) {
    this.container = container;
    this.frameCallbacks = new Set();
    this.clock = new THREE.Clock();

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.prepend(renderer.domElement);
    this.renderer = renderer;
    this.maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    this.maxTextureSize = renderer.capabilities.maxTextureSize;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 200);
    camera.position.set(0, 0.9, DEFAULT_DISTANCE).setLength(DEFAULT_DISTANCE);
    scene.add(camera);
    this.camera = camera;

    // Light rides with the camera (upper left), so the visible hemisphere is always lit.
    this.ambient = new THREE.AmbientLight(0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.position.set(-2, 1.5, 3);
    scene.add(this.ambient);
    camera.add(this.sun);
    camera.add(this.sun.target);
    this.sun.target.position.set(0, 0, -1);

    // --- Earth
    this.material = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 12, specular: 0x000000 });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), this.material);
    scene.add(this.earth);

    this.overlayRoot = new THREE.Group();
    scene.add(this.overlayRoot);

    this.atmosphere = createAtmosphere();
    scene.add(this.atmosphere);
    this.stars = createStars();
    scene.add(this.stars);

    // --- Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.03;
    controls.maxDistance = 12;
    controls.zoomSpeed = 0.9;
    controls.autoRotateSpeed = 0.4;
    controls.addEventListener('change', () => this.labels.markDirty());
    this.controls = controls;

    this.labels = new LabelLayer(labelContainer, camera);
    this.setLighting('natural');

    this.resize();
    window.addEventListener('resize', () => this.resize());
    renderer.setAnimationLoop(() => this.frame());
  }

  /** Shifts the image (in px) so the globe is centred in the area not covered by the panel. */
  setViewShift(x, y = 0) {
    this.viewShift = { x, y };
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // on portrait screens keep the horizontal field of view at least 40°
    this.camera.fov = w >= h ? 40 : 2 * Math.atan(Math.tan(20 * Math.PI / 180) * h / w) * 180 / Math.PI;
    const shift = this.viewShift;
    if (shift && (shift.x || shift.y)) this.camera.setViewOffset(w, h, -shift.x, -shift.y, w, h);
    else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.labels.markDirty();
  }

  frame() {
    const dt = this.clock.getDelta();
    const dist = this.camera.position.length();
    // rotate slower when close to the surface, zoom slower too
    this.controls.rotateSpeed = THREE.MathUtils.clamp((dist - 1) * 0.45, 0.02, 1);
    this.controls.zoomSpeed = THREE.MathUtils.clamp((dist - 1) * 0.6, 0.15, 1);
    this.controls.autoRotateSpeed = 0.4 * THREE.MathUtils.clamp(dist - 1, 0.05, 1.5);
    if (this.flight) this.stepFlight(dt);
    this.controls.update();
    const now = Date.now();
    for (const cb of this.frameCallbacks) cb(dt, now);
    this.renderer.render(this.scene, this.camera);
    this.labels.update(this.container.clientWidth, this.container.clientHeight);
  }

  /** Registers a per-frame callback, returns a function that removes it. */
  onFrame(cb) {
    this.frameCallbacks.add(cb);
    return () => this.frameCallbacks.delete(cb);
  }

  get cameraDistance() { return this.camera.position.length(); }

  // ---------------------------------------------------------------- surface

  /** Turns an image / canvas / texture into a configured texture. */
  toTexture(src, { srgb = true } = {}) {
    if (!src) return null;
    let tex = src;
    if (!(src instanceof THREE.Texture)) {
      tex = src instanceof HTMLCanvasElement ? new THREE.CanvasTexture(src) : new THREE.Texture(src);
      tex.needsUpdate = true;
    }
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = this.maxAnisotropy;
    return tex;
  }

  /**
   * Applies the result of a surface's build(): { map, bumpMap, bumpScale,
   * specularMap, specular, shininess, lighting }.
   */
  setSurface(s) {
    const m = this.material;
    for (const key of ['map', 'bumpMap', 'specularMap']) {
      if (m[key] && !m[key].userData.keep) m[key].dispose();
    }
    m.map = this.toTexture(s.map);
    m.bumpMap = this.toTexture(s.bumpMap, { srgb: false });
    m.bumpScale = s.bumpScale ?? 1;
    m.specularMap = this.toTexture(s.specularMap, { srgb: false });
    m.specular.set(s.specular ?? (s.specularMap ? 0x3a4550 : 0x000000));
    m.shininess = s.shininess ?? 12;
    m.needsUpdate = true;
    this.setLighting(s.lighting || 'soft');
  }

  setLighting(name) {
    const l = LIGHTING[name] || LIGHTING.soft;
    this.ambient.intensity = l.ambient * Math.PI;
    this.sun.intensity = l.sun * Math.PI;
  }

  // ---------------------------------------------------------------- picking & camera

  /** Lat/lon under the given client coordinates, or null when not over the Earth. */
  pick(clientX, clientY) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), hit)) return null;
    return vector3ToLatLon(hit);
  }

  /** Smoothly flies the camera above lat/lon. */
  flyTo(lat, lon, distance = Math.min(this.cameraDistance, 2.2)) {
    const from = this.camera.position.clone();
    const to = latLonToVector3(lat, lon, distance);
    this.flight = { from, to, t: 0, duration: 1.2 };
  }

  stepFlight(dt) {
    const f = this.flight;
    f.t = Math.min(1, f.t + dt / f.duration);
    const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    const dir = f.from.clone().normalize().lerp(f.to.clone().normalize(), e).normalize();
    const len = THREE.MathUtils.lerp(f.from.length(), f.to.length(), e);
    this.camera.position.copy(dir.multiplyScalar(len));
    if (f.t >= 1) this.flight = null;
  }

  resetView() {
    this.flight = { from: this.camera.position.clone(), to: new THREE.Vector3(0, 0.9, DEFAULT_DISTANCE).setLength(DEFAULT_DISTANCE), t: 0, duration: 1.2 };
  }

  screenshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}

function createAtmosphere() {
  const group = new THREE.Group();
  const vertexShader = /* glsl */`
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`;
  // outer glow around the limb
  const outer = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0x5aa8ff) } },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        // back faces: 0 at the outer edge of the shell, more negative towards the Earth
        float rim = dot(vNormal, vView);
        float i = pow(smoothstep(0.0, 0.42, -rim), 3.5);
        gl_FragColor = vec4(color * i * 0.9, 1.0);
      }`,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const outerMesh = new THREE.Mesh(new THREE.SphereGeometry(1.06, 96, 48), outer);
  outerMesh.renderOrder = -1;
  group.add(outerMesh);
  // thin haze over the edge of the disc
  const inner = new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(0x6fb6ff) } },
    vertexShader,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = 1.0 - max(dot(vNormal, vView), 0.0);
        gl_FragColor = vec4(color * pow(rim, 3.5) * 0.55, 1.0);
      }`,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
  });
  const innerMesh = new THREE.Mesh(new THREE.SphereGeometry(1.004, 96, 48), inner);
  innerMesh.renderOrder = 3;
  group.add(innerMesh);
  return group;
}

function createStars(count = 4000) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    v.randomDirection().multiplyScalar(80 + Math.random() * 20);
    positions.set([v.x, v.y, v.z], i * 3);
    const b = 0.35 + Math.random() ** 3 * 0.65;
    c.setHSL(0.55 + Math.random() * 0.2 - 0.1, 0.3 * Math.random(), b);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false });
  return new THREE.Points(geo, mat);
}
