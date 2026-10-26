'use strict';
// Vodní hladina s planárním odrazem, vlnkami, kruhy na vodě; částice šplouchanců.
(function (FS) {
  const U = FS.U;
  const Water = {};
  FS.Water = Water;
  FS.FX = {};

  // Podvodní zákal pro materiály pod hladinou
  FS.applyMurk = function (mat, extra, key) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMurkColor = FS.uniforms.uMurkColor;
      sh.uniforms.uMurkK = FS.uniforms.uMurkK;
      sh.vertexShader = 'varying float vMurkY;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        #ifdef USE_INSTANCING
          vMurkY = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).y;
        #else
          vMurkY = (modelMatrix * vec4(transformed, 1.0)).y;
        #endif`);
      sh.fragmentShader = 'uniform vec3 uMurkColor; uniform float uMurkK; varying float vMurkY;\n' + sh.fragmentShader.replace('#include <tonemapping_fragment>', `
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uMurkColor, (1.0 - exp(-max(-vMurkY, 0.0) * uMurkK)) * 0.97);
        #include <tonemapping_fragment>`);
      if (extra) extra(sh);
    };
    mat.customProgramCacheKey = () => 'murk-' + (key || 'base');
    return mat;
  };

  const MAX_RIPPLES = 12;
  // rozlišení odrazu vůči obrazovce (na mobilu a TV menší)
  const RT_SCALE = () => (FS.Device.low ? 0.28 : 0.4);

  Water.create = function (scene, renderer) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    const rt = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(size.x * RT_SCALE())), Math.max(2, Math.floor(size.y * RT_SCALE())), {
      // starší televize neumí kreslit do half-float textury
      type: FS.Device.tv ? THREE.UnsignedByteType : THREE.HalfFloatType,
    });
    Water.rt = rt;
    const geo = new THREE.PlaneGeometry(84, 52, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-12, 0, -22);
    const ripples = [];
    for (let i = 0; i < MAX_RIPPLES; i++) ripples.push(new THREE.Vector4(0, 0, -100, 0));
    Water.ripples = ripples;
    Water.rippleIdx = 0;
    const uniforms = {
      tReflect: { value: rt.texture },
      tNormal: { value: FS.Tex.waterNormal() },
      textureMatrix: { value: new THREE.Matrix4() },
      time: FS.uniforms.uTime,
      sunDir: { value: FS.Sky.sunDir },
      sunColor: { value: new THREE.Color(1.0, 0.93, 0.8) },
      bodyColor: { value: new THREE.Color(0.035, 0.05, 0.026) },
      ripples: { value: ripples },
      glare: FS.uniforms.uGlare,
      clarity: FS.uniforms.uClarity,
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: true,
      vertexShader: `
        uniform mat4 textureMatrix;
        varying vec4 vRefl; varying vec3 vWorld;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vRefl = textureMatrix * wp;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D tReflect, tNormal; uniform float time, glare, clarity;
        uniform vec3 sunDir, sunColor, bodyColor;
        uniform vec4 ripples[${MAX_RIPPLES}];
        varying vec4 vRefl; varying vec3 vWorld;
        void main(){
          vec2 uv = vWorld.xz;
          vec3 n1 = texture2D(tNormal, uv * 0.045 + time * vec2(0.010, 0.006)).rgb * 2.0 - 1.0;
          vec3 n2 = texture2D(tNormal, uv * 0.11 - time * vec2(0.008, -0.013)).rgb * 2.0 - 1.0;
          vec3 n3 = texture2D(tNormal, uv * 0.42 + time * vec2(-0.03, 0.021)).rgb * 2.0 - 1.0;
          vec2 slope = n1.xy * 0.55 + n2.xy * 0.45 + n3.xy * 0.22;
          float rip = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = ripples[i];
            float age = time - r.z;
            if (age < 0.0 || age > 6.0) continue;
            vec2 d = uv - r.xy;
            float dist = length(d);
            float front = age * (0.55 + r.w * 0.25);
            float x = dist - front;
            float env = exp(-x * x * 18.0) * exp(-age * 0.75) * r.w;
            float w = cos(x * 38.0) * env;
            slope += normalize(d + 1e-4) * w * 0.9;
            rip += abs(w);
          }
          vec3 N = normalize(vec3(slope.x * 0.35, 1.0, slope.y * 0.35));
          vec3 V = normalize(cameraPosition - vWorld);
          float ndv = max(dot(N, V), 0.0);
          float fres = 0.025 + 0.975 * pow(1.0 - ndv, 5.0);
          vec4 rc = vRefl;
          rc.xy += slope * 0.022 * rc.w;
          vec3 refl = texture2DProj(tReflect, rc).rgb;
          vec3 H = normalize(sunDir + V);
          float spec = pow(max(dot(N, H), 0.0), 380.0) * 9.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.18;
          spec *= glare;
          float diff = 0.55 + 0.45 * max(dot(N, sunDir), 0.0);
          vec3 body = bodyColor * diff * (1.0 + rip * 0.4);
          float reflAmt = mix(fres, 0.08 + 0.92 * fres, 0.6) * glare;
          vec3 col = mix(body, refl, clamp(reflAmt, 0.0, 1.0)) + sunColor * spec;
          float alpha = clamp(mix(0.42 / clarity, 1.0, reflAmt) + spec * 0.3, 0.0, 1.0);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 5;
    scene.add(mesh);
    Water.mesh = mesh;
    Water.material = mat;
    Water.virtualCamera = new THREE.PerspectiveCamera();
    Water.virtualCamera.layers.set(0);
    return mesh;
  };

  Water.resize = function (renderer) {
    const size = new THREE.Vector2();
    renderer.getDrawingBufferSize(size);
    Water.rt.setSize(Math.max(2, Math.floor(size.x * RT_SCALE())), Math.max(2, Math.floor(size.y * RT_SCALE())));
  };

  const _n = new THREE.Vector3(0, 1, 0), _view = new THREE.Vector3(), _target = new THREE.Vector3(), _look = new THREE.Vector3();
  const _rot = new THREE.Matrix4(), _plane = new THREE.Plane(), _clip = new THREE.Vector4(), _q = new THREE.Vector4();
  const _cam = new THREE.Vector3();
  Water.renderReflection = function (renderer, scene, camera) {
    const vc = Water.virtualCamera;
    _cam.setFromMatrixPosition(camera.matrixWorld);
    if (_cam.y < 0.02) return;
    _view.set(_cam.x, -_cam.y, _cam.z);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_cam);
    _target.set(_look.x, -_look.y, _look.z);
    vc.position.copy(_view);
    vc.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_n);
    vc.lookAt(_target);
    vc.far = camera.far; vc.near = camera.near;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);
    const tm = Water.material.uniforms.textureMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix);
    tm.multiply(vc.matrixWorldInverse);
    // šikmá ořezová rovina
    _plane.setFromNormalAndCoplanarPoint(_n, new THREE.Vector3(0, 0, 0));
    _plane.applyMatrix4(vc.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const pm = vc.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + pm.elements[8]) / pm.elements[0];
    _q.y = (Math.sign(_clip.y) + pm.elements[9]) / pm.elements[5];
    _q.z = -1.0;
    _q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    _clip.multiplyScalar(2.0 / _clip.dot(_q));
    pm.elements[2] = _clip.x; pm.elements[6] = _clip.y; pm.elements[10] = _clip.z + 1.0 - 0.003; pm.elements[14] = _clip.w;

    Water.mesh.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(Water.rt);
    renderer.clear();
    renderer.render(scene, vc);
    renderer.setRenderTarget(prevRT);
    renderer.shadowMap.autoUpdate = prevShadow;
    Water.mesh.visible = true;
  };

  Water.addRipple = function (x, z, amp = 1) {
    const r = Water.ripples[Water.rippleIdx];
    r.set(x, z, FS.uniforms.uTime.value, amp);
    Water.rippleIdx = (Water.rippleIdx + 1) % MAX_RIPPLES;
  };

  // vlnění hladiny pro splávek (přibližně odpovídá normálám)
  Water.surfaceY = function (x, z, t) {
    return Math.sin(x * 1.3 + t * 1.7) * 0.006 + Math.sin(z * 1.7 - t * 1.3 + 1.0) * 0.005 + Math.sin((x + z) * 3.1 + t * 2.9) * 0.003;
  };

  // ---------- částice ----------
  const MAXP = 600;
  FS.FX.init = function (scene) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(MAXP * 3), alpha = new Float32Array(MAXP), size = new Float32Array(MAXP), color = new Float32Array(MAXP * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
    geo.setAttribute('psize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(color, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: FS.Tex.dot() }, scale: { value: 600 } },
      vertexShader: `
        attribute float alpha; attribute float psize; attribute vec3 pcolor;
        uniform float scale; varying float vA; varying vec3 vC;
        void main(){ vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = psize * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        uniform sampler2D map; varying float vA; varying vec3 vC;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA);
          #include <encodings_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = 8;
    scene.add(pts);
    FS.FX.points = pts;
    FS.FX.parts = [];
    for (let i = 0; i < MAXP; i++) FS.FX.parts.push({ life: 0 });
  };
  FS.FX.splash = function (x, z, strength = 1, color) {
    const n = Math.floor(14 + strength * 40);
    let k = 0;
    for (const p of FS.FX.parts) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2, s = Math.random() * 1.4 * strength + 0.3;
      p.x = x + Math.cos(a) * 0.05; p.y = 0.02; p.z = z + Math.sin(a) * 0.05;
      p.vx = Math.cos(a) * s * 0.7; p.vz = Math.sin(a) * s * 0.7; p.vy = 1.2 + Math.random() * 2.6 * Math.sqrt(strength);
      p.life = p.max = 0.6 + Math.random() * 0.6;
      p.size = 0.025 + Math.random() * 0.045 * Math.sqrt(strength);
      p.col = color || [0.85, 0.9, 0.92];
      p.g = 9.8; p.under = false;
      if (++k >= n) break;
    }
  };
  FS.FX.cloud = function (x, z, color) {
    let k = 0;
    for (const p of FS.FX.parts) {
      if (p.life > 0) continue;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.8;
      p.x = x + Math.cos(a) * r; p.y = -0.05; p.z = z + Math.sin(a) * r;
      p.vx = Math.cos(a) * 0.1; p.vz = Math.sin(a) * 0.1; p.vy = -0.05 - Math.random() * 0.1;
      p.life = p.max = 4 + Math.random() * 4;
      p.size = 0.08 + Math.random() * 0.1;
      p.col = color; p.g = 0; p.under = true;
      if (++k >= 60) break;
    }
  };
  FS.FX.update = function (dt) {
    if (!FS.FX.points) return;
    const g = FS.FX.points.geometry;
    const pos = g.attributes.position.array, al = g.attributes.alpha.array, sz = g.attributes.psize.array, cl = g.attributes.pcolor.array;
    FS.FX.parts.forEach((p, i) => {
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (!p.under && p.y < 0 && p.vy < 0) { p.life = 0; if (Math.random() < 0.1) Water.addRipple(p.x, p.z, 0.15); }
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        al[i] = Math.max(0, p.life / p.max) * (p.under ? 0.35 : 0.85);
        sz[i] = p.size;
        cl[i * 3] = p.col[0]; cl[i * 3 + 1] = p.col[1]; cl[i * 3 + 2] = p.col[2];
      } else { al[i] = 0; }
    });
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
    g.attributes.psize.needsUpdate = true; g.attributes.pcolor.needsUpdate = true;
  };
})(window.FS);
