import * as THREE from 'three';

// Side-on camera slightly from above, like the arcade original.
const CAM_Y = 4.8;
const CAM_Z = 11.5;
const LOOK_Y = 1.3;
const LOOK_Z = -0.6;

export class GameScene {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 500);

    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x5a4a30, 1.1);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffe0b0, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    this.camX = 0;
    this.shakeAmp = 0;
    this.shakeTime = 0;

    this.blobGeo = new THREE.CircleGeometry(1, 18);
    this.blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false });

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    // a hidden/zero-size window must not produce a NaN aspect ratio
    const w = window.innerWidth || 1280, h = window.innerHeight || 720;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.onResize?.(w, h);
  }

  // Half of the visible world width on the fighting plane (z≈0).
  halfWidth() {
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * CAM_Z;
    return Math.min(13, halfH * this.camera.aspect);
  }

  shake(amp, time) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeTime = Math.max(this.shakeTime, time);
  }

  update(dt) {
    let sx = 0, sy = 0;
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      sx = (Math.random() - 0.5) * this.shakeAmp;
      sy = (Math.random() - 0.5) * this.shakeAmp;
      if (this.shakeTime <= 0) this.shakeAmp = 0;
    }
    this.camera.position.set(this.camX + sx, CAM_Y + sy, CAM_Z);
    this.camera.lookAt(this.camX + sx * 0.5, LOOK_Y, LOOK_Z);
    this.sun.position.set(this.camX - 12, 24, 14);
    this.sun.target.position.set(this.camX, 0, -2);
  }

  makeBlobShadow(radius) {
    const m = new THREE.Mesh(this.blobGeo, this.blobMat);
    m.rotation.x = -Math.PI / 2;
    m.scale.setScalar(radius);
    m.position.y = 0.03;
    m.renderOrder = 1;
    this.scene.add(m);
    return m;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
