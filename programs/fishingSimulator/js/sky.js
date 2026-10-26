'use strict';
// Obloha: gradient, slunce s oparem, řídké cirrové mraky. Také generuje env mapu.
(function (FS) {
  const Sky = {};
  FS.Sky = Sky;
  Sky.sunDir = new THREE.Vector3(-0.42, 0.5, -0.76).normalize();

  const NOISE = `
    float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
      return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
    float fbm(vec2 p){ float s=0.0, a=0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<6;i++){ s+=a*vnoise(p); p=m*p; a*=0.5; } return s; }
  `;

  Sky.makeMaterial = function () {
    return new THREE.ShaderMaterial({
      uniforms: { sunDir: { value: Sky.sunDir }, time: FS.uniforms.uTime },
      vertexShader: `
        varying vec3 vDir;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vDir = wp.xyz - cameraPosition;
          gl_Position = projectionMatrix * viewMatrix * wp;
          gl_Position.z = gl_Position.w * 0.99999;
        }`,
      fragmentShader: `
        uniform vec3 sunDir; uniform float time;
        varying vec3 vDir;
        ${NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 zenith = vec3(0.045, 0.17, 0.58);
          vec3 horizon = vec3(0.46, 0.6, 0.8);
          float t = pow(max(h, 0.0), 0.42);
          vec3 col = mix(horizon, zenith, t);
          if (h < 0.0) col = mix(horizon, vec3(0.36, 0.42, 0.33), min(1.0, -h * 5.0));
          float sd = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.93, 0.78) * (pow(sd, 5.0) * 0.45 + pow(sd, 48.0) * 1.1);
          col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99935, 0.9997, sd) * 30.0;
          col = mix(col, vec3(1.0, 0.99, 0.96), pow(sd, 3.0) * 0.3);
          if (h > -0.02) {
            vec2 uv = d.xz / (max(h, 0.0) + 0.09);
            float c = cos(0.6), s = sin(0.6);
            vec2 p = mat2(c, -s, s, c) * uv;
            p += vec2(time * 0.006, time * 0.002);
            float n = fbm(p * vec2(0.55, 1.6));
            float w = fbm(vec2(p.x * 2.6, p.y * 0.45) + n * 1.4);
            float cov = smoothstep(0.56, 0.9, n * 0.62 + w * 0.56);
            float puff = smoothstep(0.66, 0.92, fbm(p * 0.9 + 11.0));
            cov = max(cov * 0.85, puff * 0.55);
            cov *= smoothstep(-0.01, 0.22, h);
            vec3 cloudCol = vec3(0.98, 0.99, 1.0) * (0.86 + 0.6 * pow(sd, 3.0));
            col = mix(col, cloudCol, cov * 0.88);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <encodings_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
  };

  Sky.create = function (scene) {
    const geo = new THREE.SphereGeometry(3000, 48, 24);
    const mesh = new THREE.Mesh(geo, Sky.makeMaterial());
    mesh.renderOrder = -10;
    mesh.frustumCulled = false;
    scene.add(mesh);
    Sky.mesh = mesh;
    return mesh;
  };

  Sky.update = function (camera) {
    if (Sky.mesh) Sky.mesh.position.copy(camera.position);
  };

  // Prostředí pro PBR odlesky – pro daný renderer
  Sky.envMap = function (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const s = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), Sky.makeMaterial());
    m.material.uniforms.time = { value: 10 };
    s.add(m);
    const rt = pmrem.fromScene(s, 0.02, 0.1, 500);
    pmrem.dispose();
    return rt.texture;
  };
})(window.FS);
