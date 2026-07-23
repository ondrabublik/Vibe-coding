(() => {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  const els = {
    modeHint: document.getElementById("modeHint"),
    forceMag: document.getElementById("forceMag"),
    forceAngle: document.getElementById("forceAngle"),
    volFrac: document.getElementById("volFrac"),
    volFracVal: document.getElementById("volFracVal"),
    meshSize: document.getElementById("meshSize"),
    meshVal: document.getElementById("meshVal"),
    maxIter: document.getElementById("maxIter"),
    iterVal: document.getElementById("iterVal"),
    rmin: document.getElementById("rmin"),
    rminVal: document.getElementById("rminVal"),
    btnOptimize: document.getElementById("btnOptimize"),
    btnStop: document.getElementById("btnStop"),
    btnReset: document.getElementById("btnReset"),
    presetSelect: document.getElementById("presetSelect"),
    presetHint: document.getElementById("presetHint"),
    statIter: document.getElementById("statIter"),
    statComp: document.getElementById("statComp"),
    statVol: document.getElementById("statVol"),
    statStatus: document.getElementById("statStatus"),
  };

  const MODE_HINTS = {
    support: "Klikněte na hranu čtverce a přidejte uchycení (pevný bod).",
    force: "Klikněte na hranu: přidá se síla podle velikosti a směru v panelu.",
    erase: "Klikněte poblíž uchycení nebo síly na hraně — smaže se.",
  };

  let mode = "support";
  let nelx = 40;
  let nely = 40;
  /** @type {{ix:number, iy:number}[]} */
  let supports = [];
  /** @type {{ix:number, iy:number, fx:number, fy:number}[]} */
  let loads = [];
  /** @type {Float64Array|null} */
  let density = null;
  let running = false;
  let stopFlag = false;

  const pad = 48;
  const ISO_VOLUME = 0.4;

  /** Threshold τ such that fraction of cells with ρ ≥ τ ≈ targetVol. */
  function volumeIsothreshold(x, targetVol) {
    const sorted = Array.from(x).sort((a, b) => b - a);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(targetVol * sorted.length) - 1));
    return sorted[idx];
  }

  /**
   * Marching-squares isocontour of element-centered densities.
   * Nodes are bilinearly sampled from neighboring elements.
   */
  function drawIsoContour(x0, y0, side, thresh) {
    const ew = side / nelx;
    const eh = side / nely;

    function sample(ix, iy) {
      // Node (ix, iy) in [0..nelx]×[0..nely]: average adjacent element densities
      let s = 0;
      let c = 0;
      for (const dx of [-1, 0]) {
        for (const dy of [-1, 0]) {
          const elx = ix + dx;
          const ely = iy + dy;
          if (elx >= 0 && elx < nelx && ely >= 0 && ely < nely) {
            s += density[ely + elx * nely];
            c++;
          }
        }
      }
      return c ? s / c : 0;
    }

    function lerp(a, b, va, vb) {
      if (Math.abs(vb - va) < 1e-12) return 0.5;
      return (thresh - va) / (vb - va);
    }

    function nodeXY(ix, iy) {
      return {
        x: x0 + ix * ew,
        y: y0 + (nely - iy) * eh,
      };
    }

    // Edge table: for each case 0..15, pairs of edge indices to connect
    // Edges: 0=bottom, 1=right, 2=top, 3=left
    const edges = [
      [],
      [[3, 0]],
      [[0, 1]],
      [[3, 1]],
      [[1, 2]],
      [[3, 0], [1, 2]],
      [[0, 2]],
      [[3, 2]],
      [[2, 3]],
      [[0, 2]],
      [[0, 1], [2, 3]],
      [[1, 2]],
      [[1, 3]],
      [[0, 1]],
      [[0, 3]],
      [],
    ];
    // Ambiguous cases 5 and 10 — use simple pairs (acceptable for viz)

    ctx.strokeStyle = "#3db8a0";
    ctx.lineWidth = 2.25;
    ctx.lineJoin = "round";
    ctx.beginPath();

    for (let elx = 0; elx < nelx; elx++) {
      for (let ely = 0; ely < nely; ely++) {
        const v0 = sample(elx, ely);         // SW
        const v1 = sample(elx + 1, ely);     // SE
        const v2 = sample(elx + 1, ely + 1); // NE
        const v3 = sample(elx, ely + 1);     // NW
        const code =
          (v0 >= thresh ? 1 : 0) |
          (v1 >= thresh ? 2 : 0) |
          (v2 >= thresh ? 4 : 0) |
          (v3 >= thresh ? 8 : 0);
        const segs = edges[code];
        if (!segs.length) continue;

        const pts = [
          () => {
            const t = lerp(0, 1, v0, v1);
            const a = nodeXY(elx, ely);
            const b = nodeXY(elx + 1, ely);
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          },
          () => {
            const t = lerp(0, 1, v1, v2);
            const a = nodeXY(elx + 1, ely);
            const b = nodeXY(elx + 1, ely + 1);
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          },
          () => {
            const t = lerp(0, 1, v3, v2);
            const a = nodeXY(elx, ely + 1);
            const b = nodeXY(elx + 1, ely + 1);
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          },
          () => {
            const t = lerp(0, 1, v0, v3);
            const a = nodeXY(elx, ely);
            const b = nodeXY(elx, ely + 1);
            return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
          },
        ];

        for (const [eA, eB] of segs) {
          const p = pts[eA]();
          const q = pts[eB]();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
        }
      }
    }
    ctx.stroke();
  }

  function domainRect() {
    const w = canvas.width;
    const h = canvas.height;
    const side = Math.min(w, h) - 2 * pad;
    const x0 = (w - side) / 2;
    const y0 = (h - side) / 2;
    return { x0, y0, side };
  }

  function nodeToCanvas(ix, iy) {
    const { x0, y0, side } = domainRect();
    return {
      x: x0 + (ix / nelx) * side,
      y: y0 + ((nely - iy) / nely) * side,
    };
  }

  function canvasToNode(px, py) {
    const { x0, y0, side } = domainRect();
    const u = (px - x0) / side;
    const v = (py - y0) / side;
    const fx = u * nelx;
    const fy = (1 - v) * nely;
    return { fx, fy };
  }

  function isOnBoundary(ix, iy) {
    return ix === 0 || ix === nelx || iy === 0 || iy === nely;
  }

  function snapToBoundaryNode(px, py) {
    const { fx, fy } = canvasToNode(px, py);
    const candidates = [];

    // Snap to nearest edge, then to nearest node on that edge
    const dLeft = Math.abs(fx);
    const dRight = Math.abs(fx - nelx);
    const dBottom = Math.abs(fy);
    const dTop = Math.abs(fy - nely);
    const minD = Math.min(dLeft, dRight, dBottom, dTop);
    const thresh = 0.55;

    if (minD > thresh) return null;

    if (minD === dLeft) {
      const iy = Math.round(Math.max(0, Math.min(nely, fy)));
      candidates.push({ ix: 0, iy });
    }
    if (minD === dRight) {
      const iy = Math.round(Math.max(0, Math.min(nely, fy)));
      candidates.push({ ix: nelx, iy });
    }
    if (minD === dBottom) {
      const ix = Math.round(Math.max(0, Math.min(nelx, fx)));
      candidates.push({ ix, iy: 0 });
    }
    if (minD === dTop) {
      const ix = Math.round(Math.max(0, Math.min(nelx, fx)));
      candidates.push({ ix, iy: nely });
    }

    // Prefer closest among candidates
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const p = nodeToCanvas(c.ix, c.iy);
      const d = (p.x - px) ** 2 + (p.y - py) ** 2;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    return best;
  }

  function supportKey(s) {
    return `${s.ix},${s.iy}`;
  }

  function loadKey(l) {
    return `${l.ix},${l.iy}`;
  }

  function addSupport(ix, iy) {
    if (!isOnBoundary(ix, iy)) return;
    const key = `${ix},${iy}`;
    if (supports.some((s) => supportKey(s) === key)) return;
    supports.push({ ix, iy });
    // Remove load at same node (mutually exclusive UX)
    loads = loads.filter((l) => loadKey(l) !== key);
  }

  function addLoad(ix, iy) {
    if (!isOnBoundary(ix, iy)) return;
    const mag = Math.max(0.01, Number(els.forceMag.value) || 1);
    const angDeg = Number(els.forceAngle.value) || 0;
    const ang = (angDeg * Math.PI) / 180;
    // Screen/math: 0° = +x (right), 90° = +y (up)
    const fx = mag * Math.cos(ang);
    const fy = mag * Math.sin(ang);
    const key = `${ix},${iy}`;
    loads = loads.filter((l) => loadKey(l) !== key);
    supports = supports.filter((s) => supportKey(s) !== key);
    loads.push({ ix, iy, fx, fy });
  }

  function eraseNear(px, py) {
    const node = snapToBoundaryNode(px, py);
    if (!node) return;
    const key = `${node.ix},${node.iy}`;
    supports = supports.filter((s) => supportKey(s) !== key);
    loads = loads.filter((l) => loadKey(l) !== key);
  }

  function clearResult() {
    density = null;
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const { x0, y0, side } = domainRect();
    const ew = side / nelx;
    const eh = side / nely;

    // Empty design domain background
    ctx.fillStyle = "#121820";
    ctx.fillRect(x0, y0, side, side);

    // Density field only after optimization has produced a result
    if (density) {
      for (let elx = 0; elx < nelx; elx++) {
        for (let ely = 0; ely < nely; ely++) {
          const e = ely + elx * nely;
          const d = density[e];
          if (d < 0.02) continue;
          const g = Math.round(20 + d * 210);
          ctx.fillStyle = `rgb(${g},${g + 4},${g + 8})`;
          const x = x0 + elx * ew;
          const y = y0 + (nely - 1 - ely) * eh;
          ctx.fillRect(x, y, ew + 0.5, eh + 0.5);
        }
      }
    }

    // Domain border
    ctx.strokeStyle = "#5a6a7c";
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y0, side, side);

    // Mesh grid (always visible before/during setup)
    ctx.strokeStyle = density ? "rgba(90,106,124,0.28)" : "rgba(120,140,160,0.55)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < nelx; i++) {
      const x = x0 + i * ew;
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + side);
    }
    for (let j = 1; j < nely; j++) {
      const y = y0 + j * eh;
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + side, y);
    }
    ctx.stroke();

    // Isocontour enclosing ~30% volume (highest-density material)
    if (density) {
      const thresh = volumeIsothreshold(density, ISO_VOLUME);
      drawIsoContour(x0, y0, side, thresh);
    }

    // Supports
    for (const s of supports) {
      const p = nodeToCanvas(s.ix, s.iy);
      ctx.fillStyle = "#5b9fd4";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      // Triangle marker (ground)
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 7);
      ctx.lineTo(p.x - 8, p.y + 18);
      ctx.lineTo(p.x + 8, p.y + 18);
      ctx.closePath();
      ctx.fill();
    }

    // Forces
    for (const l of loads) {
      const p = nodeToCanvas(l.ix, l.iy);
      const mag = Math.hypot(l.fx, l.fy) || 1;
      const len = 28 + Math.min(40, mag * 12);
      const ux = l.fx / mag;
      const uy = -l.fy / mag; // canvas y is down
      const x2 = p.x + ux * len;
      const y2 = p.y + uy * len;

      ctx.strokeStyle = "#e8a54b";
      ctx.fillStyle = "#e8a54b";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Arrow head
      const ah = 10;
      const ang = Math.atan2(uy, ux);
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - ah * Math.cos(ang - 0.4), y2 - ah * Math.sin(ang - 0.4));
      ctx.lineTo(x2 - ah * Math.cos(ang + 0.4), y2 - ah * Math.sin(ang + 0.4));
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function buildBCs() {
    const fixed = [];
    for (const s of supports) {
      const n = FEM.nodeIndex(nelx, nely, s.ix, s.iy);
      fixed.push(2 * n, 2 * n + 1);
    }
    const forces = [];
    for (const l of loads) {
      const n = FEM.nodeIndex(nelx, nely, l.ix, l.iy);
      if (Math.abs(l.fx) > 1e-12) forces.push({ dof: 2 * n, value: l.fx });
      if (Math.abs(l.fy) > 1e-12) forces.push({ dof: 2 * n + 1, value: l.fy });
    }
    return { fixed, forces };
  }

  async function runOptimize() {
    if (running) return;
    const { fixed, forces } = buildBCs();
    if (supports.length === 0) {
      els.statStatus.textContent = "Chybí uchycení";
      return;
    }
    if (loads.length === 0) {
      els.statStatus.textContent = "Chybí síla";
      return;
    }

    running = true;
    stopFlag = false;
    els.btnOptimize.disabled = true;
    els.btnStop.disabled = false;
    els.statStatus.textContent = "Běží…";

    const volfrac = Number(els.volFrac.value);
    const rmin = Number(els.rmin.value);
    const maxIter = Number(els.maxIter.value);

    let state;
    try {
      state = TopOpt.createState(nelx, nely, volfrac, rmin, fixed, forces);
    } catch (err) {
      els.statStatus.textContent = String(err.message || err);
      running = false;
      els.btnOptimize.disabled = false;
      els.btnStop.disabled = true;
      return;
    }

    try {
      for (let it = 1; it <= maxIter; it++) {
        if (stopFlag) {
          els.statStatus.textContent = "Zastaveno";
          break;
        }
        const t0 = performance.now();
        const metrics = TopOpt.iterate(state);
        density = state.x;
        const dt = performance.now() - t0;

        els.statIter.textContent = String(it);
        els.statComp.textContent = metrics.compliance.toFixed(3);
        els.statVol.textContent = (metrics.volume * 100).toFixed(1) + " %";
        els.statStatus.textContent = `Iterace ${it} (${dt.toFixed(0)} ms)`;
        draw();

        // Yield to UI
        await new Promise((r) => setTimeout(r, 0));

        if (metrics.change < 0.01 && it > 5) {
          els.statStatus.textContent = "Konvergence";
          break;
        }
        if (it === maxIter) els.statStatus.textContent = "Hotovo";
      }
    } catch (err) {
      console.error(err);
      els.statStatus.textContent = err.message || "Chyba";
    }

    running = false;
    els.btnOptimize.disabled = false;
    els.btnStop.disabled = true;
    draw();
  }

  function resetAll() {
    stopFlag = true;
    supports = [];
    loads = [];
    clearResult();
    markCustom();
    els.statIter.textContent = "—";
    els.statComp.textContent = "—";
    els.statVol.textContent = "—";
    els.statStatus.textContent = "Připraveno";
    draw();
  }

  const PRESETS = {
    cantilever: {
      hint: "Levá stěna uchycená, svislá síla uprostřed pravé hrany.",
      volfrac: 0.4,
      apply(nx, ny) {
        const s = [];
        for (let iy = 0; iy <= ny; iy++) s.push({ ix: 0, iy });
        return {
          supports: s,
          loads: [{ ix: nx, iy: Math.round(ny / 2), fx: 0, fy: -1 }],
          forceMag: 1,
          forceAngle: 270,
        };
      },
    },
    mbb: {
      hint: "Uchycení v dolních rozích, svislá síla uprostřed horní hrany (MBB).",
      volfrac: 0.5,
      apply(nx, ny) {
        const s = [
          { ix: 0, iy: 0 },
          { ix: 1, iy: 0 },
          { ix: nx - 1, iy: 0 },
          { ix: nx, iy: 0 },
        ];
        return {
          supports: s,
          loads: [{ ix: Math.round(nx / 2), iy: ny, fx: 0, fy: -1 }],
          forceMag: 1,
          forceAngle: 270,
        };
      },
    },
    corner: {
      hint: "Levá stěna uchycená, síla v pravém dolním rohu dolů.",
      volfrac: 0.35,
      apply(nx, ny) {
        const s = [];
        for (let iy = 0; iy <= ny; iy++) s.push({ ix: 0, iy });
        return {
          supports: s,
          loads: [{ ix: nx, iy: 0, fx: 0, fy: -1 }],
          forceMag: 1,
          forceAngle: 270,
        };
      },
    },
    twoload: {
      hint: "Levá stěna uchycená, dvě svislé síly na pravé hraně (nahoře a dole).",
      volfrac: 0.4,
      apply(nx, ny) {
        const s = [];
        for (let iy = 0; iy <= ny; iy++) s.push({ ix: 0, iy });
        return {
          supports: s,
          loads: [
            { ix: nx, iy: ny, fx: 0, fy: -1 },
            { ix: nx, iy: 0, fx: 0, fy: -1 },
          ],
          forceMag: 1,
          forceAngle: 270,
        };
      },
    },
    custom: {
      hint: "Vlastní úloha — označte uchycení a síly na hranách ručně.",
      apply() {
        return null;
      },
    },
  };

  function markCustom() {
    els.presetSelect.value = "custom";
    els.presetHint.textContent = PRESETS.custom.hint;
  }

  function loadPreset(id) {
    stopFlag = true;
    const preset = PRESETS[id];
    if (!preset) return;

    if (id === "custom") {
      els.presetHint.textContent = preset.hint;
      els.statStatus.textContent = "Vlastní úloha";
      draw();
      return;
    }

    const cfg = preset.apply(nelx, nely);
    supports = cfg.supports;
    loads = cfg.loads;
    els.forceMag.value = String(cfg.forceMag);
    els.forceAngle.value = String(cfg.forceAngle);
    if (preset.volfrac != null) {
      els.volFrac.value = String(preset.volfrac);
      els.volFracVal.textContent = Number(preset.volfrac).toFixed(2);
    }
    els.presetHint.textContent = preset.hint;
    clearResult();
    els.statStatus.textContent = "Příklad načten";
    draw();
  }

  function pointerPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    return {
      x: (evt.clientX - rect.left) * sx,
      y: (evt.clientY - rect.top) * sy,
    };
  }

  canvas.addEventListener("pointerdown", (evt) => {
    if (running) return;
    const { x, y } = pointerPos(evt);
    if (mode === "erase") {
      eraseNear(x, y);
      markCustom();
      clearResult();
      draw();
      return;
    }
    const node = snapToBoundaryNode(x, y);
    if (!node) return;
    if (mode === "support") addSupport(node.ix, node.iy);
    else if (mode === "force") addLoad(node.ix, node.iy);
    markCustom();
    clearResult();
    draw();
  });

  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      mode = btn.dataset.mode;
      els.modeHint.textContent = MODE_HINTS[mode];
    });
  });

  els.volFrac.addEventListener("input", () => {
    els.volFracVal.textContent = Number(els.volFrac.value).toFixed(2);
  });
  els.meshSize.addEventListener("input", () => {
    els.meshVal.textContent = els.meshSize.value;
  });
  els.meshSize.addEventListener("change", () => {
    if (running) return;
    nelx = nely = Number(els.meshSize.value);
    const id = els.presetSelect.value;
    if (id !== "custom" && PRESETS[id]) {
      loadPreset(id);
      return;
    }
    // Clamp BCs to new mesh
    supports = supports
      .map((s) => ({
        ix: Math.min(s.ix, nelx),
        iy: Math.min(s.iy, nely),
      }))
      .filter((s) => isOnBoundary(s.ix, s.iy));
    loads = loads
      .map((l) => ({
        ...l,
        ix: Math.min(l.ix, nelx),
        iy: Math.min(l.iy, nely),
      }))
      .filter((l) => isOnBoundary(l.ix, l.iy));
    // Deduplicate
    const sk = new Set();
    supports = supports.filter((s) => {
      const k = supportKey(s);
      if (sk.has(k)) return false;
      sk.add(k);
      return true;
    });
    clearResult();
    draw();
  });
  els.maxIter.addEventListener("input", () => {
    els.iterVal.textContent = els.maxIter.value;
  });
  els.rmin.addEventListener("input", () => {
    els.rminVal.textContent = Number(els.rmin.value).toFixed(1);
  });

  els.btnOptimize.addEventListener("click", runOptimize);
  els.btnStop.addEventListener("click", () => {
    stopFlag = true;
  });
  els.btnReset.addEventListener("click", resetAll);
  els.presetSelect.addEventListener("change", () => {
    if (running) {
      els.presetSelect.value = els.presetSelect.dataset.prev || "cantilever";
      return;
    }
    loadPreset(els.presetSelect.value);
    els.presetSelect.dataset.prev = els.presetSelect.value;
  });

  clearResult();
  loadPreset("cantilever");
  els.presetSelect.dataset.prev = "cantilever";
})();
