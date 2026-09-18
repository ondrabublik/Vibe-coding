(() => {
  "use strict";

  const DISPLAY = 512;
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const offscreen = document.createElement("canvas");
  const offCtx = offscreen.getContext("2d", { alpha: false });

  let N = 256;
  let U = new Float32Array(N * N);
  let V = new Float32Array(N * N);
  let Un = new Float32Array(N * N);
  let Vn = new Float32Array(N * N);
  let imageData = ctx.createImageData(DISPLAY, DISPLAY);
  let pixels = imageData.data;
  let gridImageData = offCtx.createImageData(N, N);
  let gridPixels = gridImageData.data;

  const params = {
    Du: 1.0,
    Dv: 0.5,
    f: 0.0367,
    k: 0.0649,
  };

  let stepsPerFrame = 16;
  let brushSize = 8;
  let tool = "paint";
  let running = true;
  let frame = 0;
  let drawing = false;
  let paletteName = "jet";
  let smooth = true;
  let applyingPreset = false;

  const PRESETS = {
    mitosis: { Du: 1.0, Dv: 0.5, f: 0.0367, k: 0.0649 },
    coral: { Du: 1.0, Dv: 0.5, f: 0.0545, k: 0.062 },
    spots: { Du: 1.0, Dv: 0.5, f: 0.035, k: 0.065 },
    worms: { Du: 1.0, Dv: 0.5, f: 0.078, k: 0.061 },
    maze: { Du: 1.0, Dv: 0.5, f: 0.029, k: 0.057 },
    holes: { Du: 1.0, Dv: 0.5, f: 0.039, k: 0.058 },
    fingerprint: { Du: 1.0, Dv: 0.5, f: 0.037, k: 0.06 },
    waves: { Du: 1.0, Dv: 0.5, f: 0.014, k: 0.045 },
  };

  const PALETTES = {
    jet: [
      [0, 0, 127],
      [0, 0, 255],
      [0, 255, 255],
      [255, 255, 0],
      [255, 0, 0],
      [127, 0, 0],
    ],
    ink: [
      [232, 228, 220],
      [180, 170, 155],
      [90, 85, 78],
      [35, 38, 42],
      [18, 20, 22],
    ],
    thermal: [
      [10, 10, 30],
      [80, 20, 120],
      [220, 40, 80],
      [255, 160, 40],
      [255, 250, 200],
    ],
    ocean: [
      [8, 20, 35],
      [20, 70, 100],
      [40, 140, 150],
      [180, 220, 180],
      [240, 250, 230],
    ],
    ember: [
      [15, 8, 5],
      [80, 20, 10],
      [180, 50, 15],
      [240, 140, 30],
      [255, 230, 160],
    ],
    mono: [
      [250, 248, 242],
      [190, 188, 180],
      [110, 108, 100],
      [45, 44, 40],
      [12, 12, 11],
    ],
  };

  function setupDisplay() {
    canvas.width = DISPLAY;
    canvas.height = DISPLAY;
    imageData = ctx.createImageData(DISPLAY, DISPLAY);
    pixels = imageData.data;
    canvas.classList.toggle("smooth", smooth);
  }

  function resizeGrid(newN) {
    N = newN;
    U = new Float32Array(N * N);
    V = new Float32Array(N * N);
    Un = new Float32Array(N * N);
    Vn = new Float32Array(N * N);
    offscreen.width = N;
    offscreen.height = N;
    gridImageData = offCtx.createImageData(N, N);
    gridPixels = gridImageData.data;
    seedRandom();
    frame = 0;
  }

  function idx(x, y) {
    return ((y + N) % N) * N + ((x + N) % N);
  }

  function fillUniform() {
    U.fill(1);
    V.fill(0);
  }

  function seedCenter() {
    fillUniform();
    const cx = (N / 2) | 0;
    const cy = (N / 2) | 0;
    const r = Math.max(4, ((N * 20) / 256) | 0);
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
          const i = idx(x, y);
          U[i] = 0.5;
          V[i] = 0.25;
        }
      }
    }
  }

  function seedRandom() {
    fillUniform();
    const count = Math.max(8, ((N * 40) / 256) | 0);
    for (let n = 0; n < count; n++) {
      const cx = (Math.random() * N) | 0;
      const cy = (Math.random() * N) | 0;
      const r = Math.max(2, 3 + ((Math.random() * ((N * 8) / 256)) | 0));
      for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) {
            const i = idx(x, y);
            U[i] = 0.5;
            V[i] = 0.25 + Math.random() * 0.25;
          }
        }
      }
    }
  }

  function paintAt(px, py, erase) {
    const r = brushSize;
    const r2 = r * r;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const i = idx(px + dx, py + dy);
        if (erase) {
          U[i] = 1;
          V[i] = 0;
        } else {
          U[i] = 0.5;
          V[i] = 0.25;
        }
      }
    }
  }

  function laplace(arr, x, y) {
    const c = arr[idx(x, y)];
    const n =
      arr[idx(x - 1, y)] +
      arr[idx(x + 1, y)] +
      arr[idx(x, y - 1)] +
      arr[idx(x, y + 1)];
    const d =
      arr[idx(x - 1, y - 1)] +
      arr[idx(x + 1, y - 1)] +
      arr[idx(x - 1, y + 1)] +
      arr[idx(x + 1, y + 1)];
    return n * 0.2 + d * 0.05 - c;
  }

  function step() {
    const { Du, Dv, f, k } = params;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const u = U[i];
        const v = V[i];
        const uvv = u * v * v;
        Un[i] = u + Du * laplace(U, x, y) - uvv + f * (1 - u);
        Vn[i] = v + Dv * laplace(V, x, y) + uvv - (f + k) * v;
      }
    }
    const tmpU = U;
    const tmpV = V;
    U = Un;
    V = Vn;
    Un = tmpU;
    Vn = tmpV;
  }

  function lerpColor(stops, t) {
    t = Math.max(0, Math.min(1, t));
    const n = stops.length - 1;
    const x = t * n;
    const i = Math.min(n - 1, x | 0);
    const f = x - i;
    const a = stops[i];
    const b = stops[i + 1];
    return [
      (a[0] + (b[0] - a[0]) * f) | 0,
      (a[1] + (b[1] - a[1]) * f) | 0,
      (a[2] + (b[2] - a[2]) * f) | 0,
    ];
  }

  function sampleV(fx, fy) {
    let x0 = Math.floor(fx);
    let y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;
    x0 = ((x0 % N) + N) % N;
    y0 = ((y0 % N) + N) % N;
    const x1 = (x0 + 1) % N;
    const y1 = (y0 + 1) % N;
    const v00 = V[y0 * N + x0];
    const v10 = V[y0 * N + x1];
    const v01 = V[y1 * N + x0];
    const v11 = V[y1 * N + x1];
    const a = v00 + (v10 - v00) * tx;
    const b = v01 + (v11 - v01) * tx;
    return a + (b - a) * ty;
  }

  function renderFlat() {
    const stops = PALETTES[paletteName];
    for (let i = 0; i < N * N; i++) {
      const t = Math.max(0, Math.min(1, V[i] * 2.2));
      const [r, g, b] = lerpColor(stops, t);
      const p = i * 4;
      gridPixels[p] = r;
      gridPixels[p + 1] = g;
      gridPixels[p + 2] = b;
      gridPixels[p + 3] = 255;
    }
    offCtx.putImageData(gridImageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(offscreen, 0, 0, DISPLAY, DISPLAY);
  }

  function renderSmooth() {
    const stops = PALETTES[paletteName];
    const scale = N / DISPLAY;
    for (let py = 0; py < DISPLAY; py++) {
      const fy = (py + 0.5) * scale - 0.5;
      for (let px = 0; px < DISPLAY; px++) {
        const fx = (px + 0.5) * scale - 0.5;
        const t = Math.max(0, Math.min(1, sampleV(fx, fy) * 2.2));
        const [r, g, b] = lerpColor(stops, t);
        const p = (py * DISPLAY + px) * 4;
        pixels[p] = r;
        pixels[p + 1] = g;
        pixels[p + 2] = b;
        pixels[p + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function render() {
    if (smooth) renderSmooth();
    else renderFlat();
  }

  function canvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (((e.clientX - rect.left) / rect.width) * N) | 0;
    const y = (((e.clientY - rect.top) / rect.height) * N) | 0;
    return [
      Math.max(0, Math.min(N - 1, x)),
      Math.max(0, Math.min(N - 1, y)),
    ];
  }

  function loop() {
    if (running) {
      for (let s = 0; s < stepsPerFrame; s++) step();
      frame += stepsPerFrame;
    }
    render();
    document.getElementById("frameInfo").textContent = frame.toLocaleString("cs-CZ");
    requestAnimationFrame(loop);
  }

  function syncSlidersFromParams() {
    applyingPreset = true;
    document.getElementById("du").value = params.Du;
    document.getElementById("dv").value = params.Dv;
    document.getElementById("feed").value = params.f;
    document.getElementById("kill").value = params.k;
    document.getElementById("duVal").textContent = params.Du.toFixed(2);
    document.getElementById("dvVal").textContent = params.Dv.toFixed(2);
    document.getElementById("fVal").textContent = params.f.toFixed(4);
    document.getElementById("kVal").textContent = params.k.toFixed(4);
    applyingPreset = false;
  }

  function markCustom() {
    if (!applyingPreset) {
      document.getElementById("preset").value = "custom";
    }
  }

  function bind() {
    const du = document.getElementById("du");
    const dv = document.getElementById("dv");
    const feed = document.getElementById("feed");
    const kill = document.getElementById("kill");
    const speed = document.getElementById("speed");
    const brush = document.getElementById("brush");
    const grid = document.getElementById("grid");
    const smoothEl = document.getElementById("smooth");

    du.addEventListener("input", () => {
      params.Du = +du.value;
      document.getElementById("duVal").textContent = params.Du.toFixed(2);
      markCustom();
    });
    dv.addEventListener("input", () => {
      params.Dv = +dv.value;
      document.getElementById("dvVal").textContent = params.Dv.toFixed(2);
      markCustom();
    });
    feed.addEventListener("input", () => {
      params.f = +feed.value;
      document.getElementById("fVal").textContent = params.f.toFixed(4);
      markCustom();
    });
    kill.addEventListener("input", () => {
      params.k = +kill.value;
      document.getElementById("kVal").textContent = params.k.toFixed(4);
      markCustom();
    });
    speed.addEventListener("input", () => {
      stepsPerFrame = +speed.value;
      document.getElementById("speedVal").textContent = String(stepsPerFrame);
    });
    brush.addEventListener("input", () => {
      brushSize = +brush.value;
      document.getElementById("brushVal").textContent = String(brushSize);
    });
    grid.addEventListener("input", () => {
      const newN = +grid.value;
      document.getElementById("gridVal").textContent = String(newN);
      resizeGrid(newN);
    });
    smoothEl.addEventListener("change", () => {
      smooth = smoothEl.checked;
      canvas.classList.toggle("smooth", smooth);
    });

    document.getElementById("preset").addEventListener("change", (e) => {
      const key = e.target.value;
      if (key === "custom" || !PRESETS[key]) return;
      Object.assign(params, PRESETS[key]);
      syncSlidersFromParams();
      seedRandom();
      frame = 0;
    });

    document.getElementById("palette").addEventListener("change", (e) => {
      paletteName = e.target.value;
    });

    document.getElementById("toolPaint").addEventListener("click", () => {
      tool = "paint";
      document.getElementById("toolPaint").classList.add("active");
      document.getElementById("toolErase").classList.remove("active");
    });
    document.getElementById("toolErase").addEventListener("click", () => {
      tool = "erase";
      document.getElementById("toolErase").classList.add("active");
      document.getElementById("toolPaint").classList.remove("active");
    });

    document.getElementById("seedCenter").addEventListener("click", () => {
      seedCenter();
      frame = 0;
    });
    document.getElementById("seedRandom").addEventListener("click", () => {
      seedRandom();
      frame = 0;
    });
    document.getElementById("seedClear").addEventListener("click", () => {
      fillUniform();
      frame = 0;
    });

    const playPause = document.getElementById("playPause");
    playPause.addEventListener("click", () => {
      running = !running;
      playPause.textContent = running ? "Pauza" : "Spustit";
      document.getElementById("statusText").textContent = running ? "běží" : "pauza";
    });

    document.getElementById("reset").addEventListener("click", () => {
      const key = document.getElementById("preset").value;
      if (PRESETS[key]) Object.assign(params, PRESETS[key]);
      syncSlidersFromParams();
      seedRandom();
      frame = 0;
      running = true;
      playPause.textContent = "Pauza";
      document.getElementById("statusText").textContent = "běží";
    });

    const startDraw = (e) => {
      drawing = true;
      const [x, y] = canvasCoords(e);
      paintAt(x, y, tool === "erase");
    };
    const moveDraw = (e) => {
      if (!drawing) return;
      const [x, y] = canvasCoords(e);
      paintAt(x, y, tool === "erase");
    };
    const endDraw = () => {
      drawing = false;
    };

    canvas.addEventListener("pointerdown", (e) => {
      canvas.setPointerCapture(e.pointerId);
      startDraw(e);
    });
    canvas.addEventListener("pointermove", moveDraw);
    canvas.addEventListener("pointerup", endDraw);
    canvas.addEventListener("pointercancel", endDraw);
  }

  setupDisplay();
  offscreen.width = N;
  offscreen.height = N;
  Object.assign(params, PRESETS.mitosis);
  syncSlidersFromParams();
  seedRandom();
  bind();
  loop();
})();
