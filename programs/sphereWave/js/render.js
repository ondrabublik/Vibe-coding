// WebGL2 renderer: textured globe / equirectangular map, the wave field on
// the hexagonal cells (flat hexagons or smooth interpolation), mesh edges,
// coastlines and markers.
(function () {
  "use strict";
  const SW = (window.SW = window.SW || {});
  const TEXW = 2048;
  const D2R = Math.PI / 180;

  // ---- small matrix helpers (column-major) -------------------------------
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, c, u) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([
      xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1,
    ]);
  }
  function mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
        o[i * 4 + j] = s;
      }
    return o;
  }
  function invert(m) {
    const inv = new Float64Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    for (let i = 0; i < 16; i++) inv[i] /= det;
    return inv;
  }

  // ---- colour maps (shared by shader and legend) -------------------------
  // Piecewise-linear tables; the GLSL lookup functions are generated from
  // them so the legend always matches the rendering.
  function turbo(t) { // Google Turbo, polynomial approximation
    return [
      0.13572138 + t * (4.6153926 + t * (-42.66032258 + t * (132.13108234 + t * (-152.94239396 + t * 59.28637943)))),
      0.09140261 + t * (2.19418839 + t * (4.84296658 + t * (-14.18503333 + t * (4.27729857 + t * 2.82956604)))),
      0.1066733 + t * (12.64194608 + t * (-60.58204836 + t * (110.36276771 + t * (-89.90310912 + t * 27.34824973)))),
    ].map((x) => Math.max(0, Math.min(1, x)));
  }
  const JS_COLORMAPS = {
    // cmocean "balance"-like: deep blue - light - deep red
    diverging: [
      [0.0, [0.09, 0.07, 0.28]], [0.12, [0.13, 0.25, 0.62]], [0.28, [0.20, 0.52, 0.86]], [0.42, [0.62, 0.80, 0.94]],
      [0.5, [0.95, 0.95, 0.95]],
      [0.58, [0.97, 0.76, 0.66]], [0.72, [0.90, 0.42, 0.30]], [0.88, [0.70, 0.11, 0.15]], [1.0, [0.36, 0.03, 0.10]],
    ],
    // inferno
    heat: [
      [0.0, [0.10, 0.04, 0.26]], [0.14, [0.26, 0.04, 0.41]], [0.29, [0.42, 0.09, 0.43]], [0.43, [0.58, 0.15, 0.40]],
      [0.57, [0.74, 0.22, 0.33]], [0.71, [0.87, 0.32, 0.23]], [0.86, [0.97, 0.55, 0.04]], [1.0, [0.99, 0.95, 0.60]],
    ],
    // reversed Turbo: early arrival red, late blue
    time: Array.from({ length: 11 }, (_, i) => [i / 10, turbo(0.93 - 0.84 * (i / 10))]),
  };
  function glslRamp(name, stops) {
    let src = `vec3 ${name}(float t) {
 t = clamp(t, 0.0, 1.0);
`;
    for (let i = 1; i < stops.length; i++) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      const v = (c) => `vec3(${c.map((x) => x.toFixed(4)).join(",")})`;
      src += ` if (t <= ${t1.toFixed(4)}) return mix(${v(c0)}, ${v(c1)}, (t - ${t0.toFixed(4)}) / ${(t1 - t0).toFixed(4)});
`;
    }
    return src + ` return vec3(${stops[stops.length - 1][1].join(",")});
}
`;
  }
  const GLSL_COLORMAPS =
    glslRamp("cmDiverging", JS_COLORMAPS.diverging) + glslRamp("cmHeat", JS_COLORMAPS.heat) + glslRamp("cmTime", JS_COLORMAPS.time);

  const PROJ = `
    uniform int uMap;
    uniform mat4 uMVP;
    uniform vec4 uMapXf;
    uniform float uOffset;
    uniform float uLift;
    in vec3 aPos;
    in vec2 aLL;
    vec4 project() {
      if (uMap == 1) return vec4((aLL.x + uOffset - uMapXf.x) * uMapXf.z, (aLL.y - uMapXf.y) * uMapXf.w, 0.0, 1.0);
      return uMVP * vec4(aPos * uLift, 1.0);
    }`;

  const BASE_VS = `#version 300 es
    ${PROJ}
    out vec3 vP; out vec2 vLL;
    void main() { vP = aPos; vLL = aLL; gl_Position = project(); }`;
  const BASE_FS = `#version 300 es
    precision highp float;
    uniform sampler2D uTex; uniform highp int uMap; uniform vec3 uLight;
    in vec3 vP; in vec2 vLL; out vec4 o;
    void main() {
      vec2 ll; float shade = 1.0;
      if (uMap == 1) ll = vLL;
      else {
        vec3 p = normalize(vP);
        ll = vec2(degrees(atan(p.y, p.x)), degrees(asin(clamp(p.z, -1.0, 1.0))));
        shade = 0.55 + 0.45 * max(dot(p, uLight), 0.0);
      }
      vec3 c = texture(uTex, vec2((ll.x + 180.0) / 360.0, (ll.y + 90.0) / 180.0)).rgb;
      o = vec4(c * shade, 1.0);
    }`;

  const WAVE_VS = `#version 300 es
    ${PROJ}
    precision highp float;
    uniform highp sampler2D uVal;
    in float aId;
    out vec2 vS; flat out vec2 vF;
    void main() {
      gl_Position = project();
      vec2 d = vec2(0.0);
      if (aId >= 0.0) { int i = int(aId + 0.5); d = texelFetch(uVal, ivec2(i % ${TEXW}, i / ${TEXW}), 0).rg; }
      vS = d; vF = d;
    }`;
  const WAVE_FS = `#version 300 es
    precision highp float;
    ${GLSL_COLORMAPS}
    uniform int uHex, uField; uniform float uRange, uOpacity;
    in vec2 vS; flat in vec2 vF; out vec4 o;
    void main() {
      vec2 d = uHex == 1 ? vF : vS;
      if (d.y < 0.5) discard;
      float v = d.x; vec3 c; float a;
      if (uField == 0) {
        // square-root scale: far-field waves stay visible with a fixed range
        float r = clamp(abs(v) / uRange, 0.0, 1.0);
        float t = sign(v) * sqrt(r);
        c = cmDiverging(0.5 + 0.5 * t);
        a = smoothstep(0.08, 0.45, abs(t)) * 0.95;
      } else if (uField == 1) {
        float t = clamp(log(max(v, 1e-9) / uRange) / log(10.0) / 2.5 + 1.0, 0.0, 1.0);
        c = cmHeat(t);
        a = smoothstep(0.0, 0.15, t) * 0.92;
      } else {
        c = cmTime(v / uRange);
        float w = fwidth(v);
        float f = fract(v);
        float line = 1.0 - smoothstep(0.0, 1.2 * w, min(f, 1.0 - f));
        if (uHex == 0) c *= 1.0 - 0.5 * line;
        a = 0.85;
      }
      o = vec4(c, a * uOpacity);
    }`;

  const LINE_VS = `#version 300 es
    ${PROJ}
    uniform float uPointSize;
    void main() { gl_Position = project(); gl_PointSize = uPointSize; }`;
  const LINE_FS = `#version 300 es
    precision highp float;
    uniform vec4 uColor; uniform int uRound; out vec4 o;
    void main() {
      if (uRound == 1) {
        vec2 q = gl_PointCoord * 2.0 - 1.0; float r = dot(q, q);
        if (r > 1.0) discard;
        o = r > 0.45 ? vec4(0.05, 0.05, 0.05, 1.0) : uColor;
        return;
      }
      o = uColor;
    }`;

  function compile(gl, vs, fs) {
    function sh(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos");
    gl.bindAttribLocation(p, 1, "aLL");
    gl.bindAttribLocation(p, 2, "aId");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u };
  }

  // Convert 3D geometry to lon/lat (degrees) for the map view. Triangles and
  // segments crossing the antimeridian are rebuilt with shifted duplicate
  // vertices; the map is drawn at offsets -360/0/+360 so both halves show.
  function mapify(pos3, ids, idx, isLine) {
    const V = ids.length;
    const lon = new Float32Array(V), lat = new Float32Array(V);
    for (let i = 0; i < V; i++) {
      const x = pos3[3 * i], y = pos3[3 * i + 1], z = pos3[3 * i + 2];
      lon[i] = Math.atan2(y, x) / D2R;
      lat[i] = Math.asin(Math.max(-1, Math.min(1, z / Math.hypot(x, y, z)))) / D2R;
    }
    const extraLL = [], extraId = [];
    const dup = new Int32Array(V).fill(-1);
    const out = new Uint32Array(idx.length);
    let no = 0;
    const per = isLine ? 2 : 3;
    const tmp = [0, 0, 0];
    for (let t = 0; t < idx.length; t += per) {
      let lo = 1e9, hi = -1e9;
      for (let k = 0; k < per; k++) { const L = lon[idx[t + k]]; if (L < lo) lo = L; if (L > hi) hi = L; }
      if (hi - lo <= 180) { for (let k = 0; k < per; k++) out[no++] = idx[t + k]; continue; }
      if (isLine) continue;
      let lo2 = 1e9, hi2 = -1e9;
      for (let k = 0; k < per; k++) {
        const v = idx[t + k];
        let L = lon[v];
        if (L < 0) {
          L += 360;
          if (dup[v] < 0) { dup[v] = V + extraId.length; extraLL.push(L, lat[v]); extraId.push(ids[v]); }
          tmp[k] = dup[v];
        } else tmp[k] = v;
        if (L < lo2) lo2 = L; if (L > hi2) hi2 = L;
      }
      if (hi2 - lo2 > 180) continue; // triangle around a pole
      for (let k = 0; k < per; k++) out[no++] = tmp[k];
    }
    const nv = V + extraId.length;
    const ll = new Float32Array(2 * nv), id = new Float32Array(nv);
    for (let i = 0; i < V; i++) { ll[2 * i] = lon[i]; ll[2 * i + 1] = lat[i]; id[i] = ids[i]; }
    ll.set(extraLL, 2 * V);
    id.set(extraId, V);
    return { ll, id, idx: out.slice(0, no) };
  }

  function Renderer(canvas) {
    const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error("WebGL2 není v tomto prohlížeči dostupné.");
    const progBase = compile(gl, BASE_VS, BASE_FS);
    const progWave = compile(gl, WAVE_VS, WAVE_FS);
    const progLine = compile(gl, LINE_VS, LINE_FS);

    const view = {
      mode: "globe", lon: 140, lat: 20, dist: 4.4,
      mapLon: 0, mapLat: 0, mapZoom: 1, // zoom 1 = whole world fits
      cellMode: "hex", field: 0, range: 1, showMesh: false, showCoast: true, opacity: 1,
    };

    // ---- buffers helpers --------------------------------------------------
    // attrs: [location, Float32Array | shared WebGLBuffer, size]; buffers
    // created here are owned by the VAO and freed by freeVao()
    function vao(attrs, index) {
      const v = gl.createVertexArray();
      const own = [];
      gl.bindVertexArray(v);
      for (const [loc, data, size] of attrs) {
        let b = data;
        if (!(data instanceof WebGLBuffer)) {
          b = gl.createBuffer();
          own.push(b);
          gl.bindBuffer(gl.ARRAY_BUFFER, b);
          gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        } else gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      let count = 0;
      if (index) {
        const ib = gl.createBuffer();
        own.push(ib);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
        count = index.length;
      }
      gl.bindVertexArray(null);
      return { v, count, own };
    }
    function freeVao(o) {
      gl.deleteVertexArray(o.v);
      for (const b of o.own) gl.deleteBuffer(b);
    }
    function arrayBuffer(data) {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return b;
    }

    // ---- base map ---------------------------------------------------------
    let baseTex = null;
    function setBaseTexture(rgba, w, h) {
      baseTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, baseTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    const sphere = (() => {
      const nl = 180, nb = 90, P = [], I = [];
      for (let j = 0; j <= nb; j++) {
        const la = -Math.PI / 2 + (Math.PI * j) / nb;
        for (let i = 0; i <= nl; i++) {
          const lo = -Math.PI + (2 * Math.PI * i) / nl;
          P.push(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
        }
      }
      for (let j = 0; j < nb; j++)
        for (let i = 0; i < nl; i++) {
          const a = j * (nl + 1) + i, b = a + 1, c = a + nl + 1, d = c + 1;
          I.push(a, b, d, a, d, c);
        }
      return vao([[0, new Float32Array(P), 3]], new Uint32Array(I));
    })();
    const quad = vao([[1, new Float32Array([-180, -90, 180, -90, 180, 90, -180, 90]), 2]], new Uint32Array([0, 1, 2, 0, 2, 3]));

    // ---- mesh geometry ------------------------------------------------------
    let geo = null;
    let valTex = null, valData = null;
    function setMesh(mesh) {
      const N = mesh.N, T = mesh.T;
      const V = N + T;
      const pos = new Float32Array(3 * V), ids = new Float32Array(V);
      for (let a = 0; a < 3 * N; a++) pos[a] = mesh.pos[a];
      for (let a = 0; a < N; a++) ids[a] = a;
      pos.set(mesh.corners, 3 * N);
      ids.fill(-1, N);
      // index lists are rebuilt on demand instead of kept (large meshes)
      const indices = {
        smooth: () => mesh.tri,
        hex: () => {
          const hex = new Uint32Array(3 * mesh.cellStart[N]);
          let q = 0;
          for (let a = 0; a < N; a++) {
            const s = mesh.cellStart[a], d = mesh.cellStart[a + 1] - s;
            for (let k = 0; k < d; k++) {
              hex[q++] = N + mesh.cellTri[s + k];
              hex[q++] = N + mesh.cellTri[s + ((k + 1) % d)];
              hex[q++] = a; // provoking (last) vertex carries the cell id
            }
          }
          return hex;
        },
        wire: () => {
          const wire = new Uint32Array(2 * mesh.E);
          for (let e = 0; e < mesh.E; e++) { wire[2 * e] = N + mesh.eT1[e]; wire[2 * e + 1] = N + mesh.eT2[e]; }
          return wire;
        },
      };

      if (geo) disposeGeo();
      geo = { N, pos, ids, indices, posBuf: arrayBuffer(pos), idBuf: arrayBuffer(ids), globe: {}, map: {} };
      const H = Math.ceil(N / TEXW);
      valData = new Float32Array(2 * TEXW * H);
      if (valTex) gl.deleteTexture(valTex);
      valTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, valTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, TEXW, H, 0, gl.RG, gl.FLOAT, valData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    function disposeGeo() {
      for (const side of [geo.globe, geo.map]) for (const k in side) freeVao(side[k]);
      gl.deleteBuffer(geo.posBuf);
      gl.deleteBuffer(geo.idBuf);
    }
    // lazily build the VAO for (view mode, index kind)
    function geoVao(kind) {
      const side = view.mode === "map" ? geo.map : geo.globe;
      if (side[kind]) return side[kind];
      if (view.mode === "map") {
        const m = mapify(geo.pos, geo.ids, geo.indices[kind](), kind === "wire");
        side[kind] = vao([[1, m.ll, 2], [2, m.id, 1]], m.idx);
      } else {
        side[kind] = vao([[0, geo.posBuf, 3], [2, geo.idBuf, 1]], geo.indices[kind]());
      }
      return side[kind];
    }
    function setValues(fill) {
      // fill(data) writes (value, mask) pairs for every cell
      fill(valData);
      gl.bindTexture(gl.TEXTURE_2D, valTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEXW, valData.length / 2 / TEXW, gl.RG, gl.FLOAT, valData);
    }

    // ---- coastlines -------------------------------------------------------
    let coast = null;
    function setCoastlines(lines) {
      // lines: array of [[lon,lat],...]
      const P = [], LL = [], I = [], IM = [];
      let v = 0;
      for (const line of lines) {
        for (let i = 0; i < line.length; i++) {
          const lo = line[i][0] * D2R, la = line[i][1] * D2R;
          P.push(Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la));
          LL.push(line[i][0], line[i][1]);
          if (i > 0) {
            I.push(v - 1, v);
            if (Math.abs(line[i][0] - line[i - 1][0]) < 180) IM.push(v - 1, v);
          }
          v++;
        }
      }
      coast = {
        globe: vao([[0, new Float32Array(P), 3]], new Uint32Array(I)),
        map: vao([[1, new Float32Array(LL), 2]], new Uint32Array(IM)),
      };
    }

    // ---- markers ------------------------------------------------------------
    const markerBuf = { pos: gl.createBuffer(), ll: gl.createBuffer() };
    const markerVao = gl.createVertexArray();
    gl.bindVertexArray(markerVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerBuf.pos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, markerBuf.ll);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ---- camera -----------------------------------------------------------
    let mvp = null;
    function sizeCanvas() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    }
    function globeMatrix() {
      const la = view.lat * D2R, lo = view.lon * D2R, d = view.dist;
      const eye = [d * Math.cos(la) * Math.cos(lo), d * Math.cos(la) * Math.sin(lo), d * Math.sin(la)];
      const aspect = canvas.width / canvas.height;
      // keep at least 30 deg of view across the narrower screen side
      const fovy = aspect < 1 ? 2 * Math.atan(Math.tan(15 * D2R) / aspect) : 30 * D2R;
      const P = perspective(fovy, aspect, Math.max(0.01, d - 1.05), d + 1.2);
      const Vm = lookAt(eye, [0, 0, 0], [0, 0, 1]);
      return { m: mul(P, Vm), eye };
    }
    function mapXf() {
      // pixels per degree so that zoom 1 shows the whole world
      const ppd = Math.min(canvas.width / 360, canvas.height / 180) * view.mapZoom;
      return [view.mapLon, view.mapLat, (2 * ppd) / canvas.width, (2 * ppd) / canvas.height];
    }

    function setCommon(prog, lift) {
      gl.useProgram(prog.p);
      gl.uniform1i(prog.u.uMap, view.mode === "map" ? 1 : 0);
      if (mvp) gl.uniformMatrix4fv(prog.u.uMVP, false, mvp);
      if (prog.u.uMapXf) gl.uniform4fv(prog.u.uMapXf, mapXf());
      if (prog.u.uLift) gl.uniform1f(prog.u.uLift, lift);
    }
    function offsets() {
      if (view.mode !== "map") return [0];
      return [-360, 0, 360];
    }
    function drawIndexed(prog, obj, prim) {
      gl.bindVertexArray(obj.v);
      for (const off of offsets()) {
        if (prog.u.uOffset) gl.uniform1f(prog.u.uOffset, off);
        gl.drawElements(prim, obj.count, gl.UNSIGNED_INT, 0);
      }
    }

    function draw(markers) {
      sizeCanvas();
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0.02, 0.03, 0.06, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const isMap = view.mode === "map";
      let light = [0, 0, 1];
      if (!isMap) {
        const g = globeMatrix();
        mvp = g.m;
        const l = Math.hypot(...g.eye);
        // light from the viewer, slightly from the upper left
        light = [g.eye[0] / l, g.eye[1] / l, g.eye[2] / l + 0.35];
        const ll = Math.hypot(...light); light = light.map((x) => x / ll);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
      } else {
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
      }
      gl.vertexAttrib3f(0, 0, 0, 0);
      gl.vertexAttrib2f(1, 0, 0);
      gl.vertexAttrib1f(2, -1);

      // base map
      if (baseTex) {
        setCommon(progBase, 1.0);
        gl.uniform3fv(progBase.u.uLight, light);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, baseTex);
        gl.uniform1i(progBase.u.uTex, 0);
        drawIndexed(progBase, isMap ? quad : sphere, gl.TRIANGLES);
      }
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      if (!isMap) gl.depthMask(false);

      if (geo) {
        setCommon(progWave, 1.002);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, valTex);
        gl.uniform1i(progWave.u.uVal, 1);
        gl.uniform1i(progWave.u.uHex, view.cellMode === "hex" ? 1 : 0);
        gl.uniform1i(progWave.u.uField, view.field);
        gl.uniform1f(progWave.u.uRange, view.range);
        gl.uniform1f(progWave.u.uOpacity, view.opacity);
        drawIndexed(progWave, geoVao(view.cellMode), gl.TRIANGLES);

        if (view.showMesh) {
          setCommon(progLine, 1.003);
          gl.uniform4f(progLine.u.uColor, 1, 1, 1, 0.22);
          gl.uniform1i(progLine.u.uRound, 0);
          drawIndexed(progLine, geoVao("wire"), gl.LINES);
        }
      }
      if (coast && view.showCoast) {
        setCommon(progLine, 1.004);
        gl.uniform4f(progLine.u.uColor, 0.1, 0.1, 0.1, 0.75);
        gl.uniform1i(progLine.u.uRound, 0);
        drawIndexed(progLine, isMap ? coast.map : coast.globe, gl.LINES);
      }
      if (markers && markers.length) {
        setCommon(progLine, 1.005);
        gl.uniform1i(progLine.u.uRound, 1);
        const dpr = canvas.width / Math.max(1, canvas.clientWidth);
        gl.bindVertexArray(markerVao);
        for (const m of markers) {
          const lo = m.lon * D2R, la = m.lat * D2R;
          gl.bindBuffer(gl.ARRAY_BUFFER, markerBuf.pos);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)]), gl.DYNAMIC_DRAW);
          gl.bindBuffer(gl.ARRAY_BUFFER, markerBuf.ll);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([m.lon, m.lat]), gl.DYNAMIC_DRAW);
          gl.uniform4fv(progLine.u.uColor, m.color);
          gl.uniform1f(progLine.u.uPointSize, (m.size || 12) * dpr);
          for (const off of offsets()) {
            gl.uniform1f(progLine.u.uOffset, off);
            gl.drawArrays(gl.POINTS, 0, 1);
          }
        }
      }
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    // screen (CSS px) -> {lat, lon} in degrees, or null
    function pick(px, py) {
      const dpr = canvas.width / Math.max(1, canvas.clientWidth);
      const x = (2 * px * dpr) / canvas.width - 1, y = 1 - (2 * py * dpr) / canvas.height;
      if (view.mode === "map") {
        const [cx, cy, sx, sy] = mapXf();
        let lon = x / sx + cx;
        const lat = y / sy + cy;
        if (lat < -90 || lat > 90) return null;
        lon = ((((lon + 180) % 360) + 360) % 360) - 180;
        return { lat, lon };
      }
      const inv = invert(globeMatrix().m);
      function unproj(z) {
        const v = [x, y, z, 1], o = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) o[i] += inv[k * 4 + i] * v[k];
        return [o[0] / o[3], o[1] / o[3], o[2] / o[3]];
      }
      const p0 = unproj(-1), p1 = unproj(1);
      const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
      const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
      const b = 2 * (p0[0] * d[0] + p0[1] * d[1] + p0[2] * d[2]);
      const c = p0[0] * p0[0] + p0[1] * p0[1] + p0[2] * p0[2] - 1;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const q = [p0[0] + t * d[0], p0[1] + t * d[1], p0[2] + t * d[2]];
      return { lat: Math.asin(Math.max(-1, Math.min(1, q[2]))) / D2R, lon: Math.atan2(q[1], q[0]) / D2R };
    }

    return { gl, view, setBaseTexture, setMesh, setValues, setCoastlines, draw, pick, TEXW };
  }

  SW.Renderer = Renderer;
  SW.Colormaps = JS_COLORMAPS;
})();
