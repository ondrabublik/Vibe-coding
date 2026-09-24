// UI glue: mesh / bathymetry setup, source parameters, time loop, rendering
// of fields, gauges and mouse interaction.
(function () {
  "use strict";
  const SW = window.SW;
  const $ = (id) => document.getElementById(id);
  const D2R = Math.PI / 180;
  const NONLINEAR_MAX_N = 256;
  const HEX_RENDER_MAX_CELLS = 700000; // above this, flat hexagons are sub-pixel anyway
  const GAUGE_COLORS = ["#ffd166", "#06d6a0", "#ef476f", "#8ecae6", "#c77dff", "#f4a261", "#90be6d", "#ffffff"];

  const st = {
    mesh: null, elev: null, ocean: null, H: null, sim: null,
    srcType: "eq", eta0Max: 1,
    running: false, simClock: 0, msPerStep: 0, displayMs: 0,
    gauges: [], gaugeSeq: 0,
    needsUpload: true, needsDraw: true, needsChart: true,
    hover: -1,
  };

  let renderer;
  try {
    renderer = SW.Renderer($("gl"));
  } catch (e) {
    document.body.innerHTML = `<p style="padding:20px">${e.message}</p>`;
    return;
  }
  const view = renderer.view;

  // ---- base map texture from ETOPO -----------------------------------------
  function buildBaseTexture() {
    const g = SW.Bathy.etopo();
    const w = g.nx, h = g.ny, z = g.z;
    const out = new Uint8Array(w * h * 4);
    const land = [[0, [92, 138, 78]], [300, [128, 160, 92]], [800, [176, 175, 118]], [1600, [182, 150, 106]], [3000, [148, 118, 96]], [4500, [220, 214, 208]], [6500, [250, 250, 250]]];
    const sea = [[0, [178, 216, 236]], [200, [132, 190, 226]], [1500, [70, 128, 190]], [4000, [34, 78, 150]], [7000, [16, 40, 96]], [11000, [8, 22, 60]]];
    function ramp(stops, v) {
      if (v <= stops[0][0]) return stops[0][1];
      for (let i = 1; i < stops.length; i++) {
        if (v <= stops[i][0]) {
          const t = (v - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]);
          const a = stops[i - 1][1], b = stops[i][1];
          return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
        }
      }
      return stops[stops.length - 1][1];
    }
    const cell = 27800; // m per 0.25 deg
    const L = [-0.55, 0.55, 0.63];
    for (let y = 0; y < h; y++) {
      const lat = (g.lat0 + y * g.step) * D2R;
      const dx = Math.max(cell * Math.cos(lat), 2000);
      const ym = Math.max(0, y - 1), yp = Math.min(h - 1, y + 1);
      for (let x = 0; x < w; x++) {
        const v = z[y * w + x];
        const xm = (x - 1 + w) % w, xp = (x + 1) % w;
        const ex = v < 0 ? 6 : 18; // vertical exaggeration
        const gx = (ex * (z[y * w + xp] - z[y * w + xm])) / (2 * dx);
        const gy = (ex * (z[yp * w + x] - z[ym * w + x])) / ((yp - ym) * cell);
        const nl = Math.hypot(gx, gy, 1);
        const shade = (-gx * L[0] - gy * L[1] + L[2]) / nl;
        const c = v >= 0 ? ramp(land, v) : ramp(sea, -v);
        const k = v >= 0 ? 0.45 + 0.75 * shade : 0.75 + 0.35 * shade;
        const o = 4 * (y * w + x);
        out[o] = Math.min(255, c[0] * k); out[o + 1] = Math.min(255, c[1] * k); out[o + 2] = Math.min(255, c[2] * k); out[o + 3] = 255;
      }
    }
    renderer.setBaseTexture(out, w, h);
  }

  async function loadCoastlines() {
    try {
      if (!window.topojson) return;
      const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/land-50m.json");
      const topo = await res.json();
      const m = window.topojson.mesh(topo, topo.objects.land);
      renderer.setCoastlines(m.coordinates);
      st.needsDraw = true;
    } catch (e) {
      console.warn("Pobřeží se nepodařilo načíst:", e);
    }
  }

  let flashTimer = 0;
  function flash(msg) {
    const el = $("flash");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.add("hidden"), 2500);
  }

  // ---- busy overlay ----------------------------------------------------------
  function busy(text, fn) {
    $("busyText").textContent = text;
    $("busy").classList.remove("hidden");
    setTimeout(() => {
      try { fn(); } catch (e) { console.error(e); alert(e.message); }
      $("busy").classList.add("hidden");
    }, 30);
  }

  // ---- mesh, bathymetry, simulation ---------------------------------------
  function buildMesh() {
    const n = +$("meshN").value;
    const iters = Math.max(0, Math.min(30, +$("lloyd").value || 0));
    busy(`Generuji síť (${(10 * n * n + 2).toLocaleString("cs-CZ")} buněk)…`, () => {
      setRunning(false);
      const t0 = performance.now();
      st.mesh = SW.buildMesh(n, iters);
      const t1 = performance.now();
      st.elev = SW.Bathy.cellElevation(st.mesh);
      const t2 = performance.now();
      renderer.setMesh(st.mesh);
      if (st.mesh.N > HEX_RENDER_MAX_CELLS && view.cellMode === "hex") {
        view.cellMode = "smooth";
        $("cellMode").value = "smooth";
      }
      computeOcean();
      const s = st.mesh.stats;
      const nOcean = st.ocean.reduce((a, b) => a + b, 0);
      $("meshInfo").textContent =
        `${st.mesh.N.toLocaleString("cs-CZ")} buněk: ${(st.mesh.N - 12).toLocaleString("cs-CZ")} šestiúhelníků + 12 pětiúhelníků\n` +
        `oceán: ${nOcean.toLocaleString("cs-CZ")} buněk, stěn ${st.mesh.E.toLocaleString("cs-CZ")}\n` +
        `vzdálenost středů ≈ ${(s.meanSpacing / 1000).toFixed(1)} km\n` +
        `max/min plocha šestiúhelníku: ${s.hexAreaRatio.toFixed(3)}\n` +
        `síť ${(t1 - t0).toFixed(0)} ms, batymetrie ${(t2 - t1).toFixed(0)} ms`;
      newSimulation();
    });
  }

  function computeOcean() {
    const minDepth = Math.max(1, +$("minDepth").value || 10);
    const m = st.mesh;
    st.ocean = SW.Bathy.oceanMask(m, st.elev, minDepth, 1e11);
    st.H = new Float64Array(m.N);
    for (let a = 0; a < m.N; a++) st.H[a] = st.ocean[a] ? Math.max(-st.elev[a], minDepth) : 0;
  }

  function model() { return document.querySelector('input[name="model"]:checked').value; }

  function newSimulation() {
    if (!st.mesh) return;
    // the nonlinear solver needs ~10x the memory and time: limit it to n <= 256
    const nlOk = st.mesh.n <= NONLINEAR_MAX_N;
    const nlRadio = document.querySelector('input[name="model"][value="nonlinear"]');
    nlRadio.disabled = !nlOk;
    if (!nlOk && model() === "nonlinear") {
      document.querySelector('input[name="model"][value="linear"]').checked = true;
      flash("Nelineární model je dostupný jen pro síť n ≤ 256 — přepnuto na lineární.");
    }
    $("coriolis").disabled = $("friction").disabled = model() === "linear";
    setRunning(false);
    st.sim = SW.Simulation(st.mesh, st.H, st.ocean, {
      model: model(),
      coriolis: $("coriolis").checked,
      manning: $("friction").checked ? 0.025 : 0,
      arrivalThreshold: (+$("arrThr").value || 1) / 100,
    });
    for (const g of st.gauges) attachGauge(g);
    applySource();
  }

  function attachGauge(g) {
    const la = g.lat * D2R, lo = g.lon * D2R;
    const cell = SW.findCell(st.mesh, Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la), 0);
    g.sg = st.sim.addGauge(cell, g.label);
  }

  // ---- sources ----------------------------------------------------------------
  const EQ = SW.Sources.EQ_PRESETS, IM = SW.Sources.IMPACT_PRESETS;
  function fillPresets() {
    $("eqPreset").innerHTML = EQ.map((p, i) => `<option value="${i}">${p.name}</option>`).join("") + '<option value="-1">vlastní</option>';
    $("imPreset").innerHTML = IM.map((p, i) => `<option value="${i}">${p.name}</option>`).join("") + '<option value="-1">vlastní</option>';
  }
  function setEqFields(p) {
    $("eqLat").value = p.lat; $("eqLon").value = p.lon; $("eqMw").value = p.Mw;
    $("eqStrike").value = p.strike; $("eqL").value = p.L; $("eqW").value = p.W; $("eqDip").value = p.dip;
  }
  function setImFields(p) {
    $("imLat").value = p.lat; $("imLon").value = p.lon; $("imD").value = p.diameter;
    $("imV").value = p.velocity; $("imRho").value = p.density;
  }
  function sourceLatLon() {
    return st.srcType === "eq" ? { lat: +$("eqLat").value, lon: +$("eqLon").value } : { lat: +$("imLat").value, lon: +$("imLon").value };
  }

  function applySource() {
    if (!st.sim) return;
    setRunning(false);
    let res;
    if (st.srcType === "eq") {
      res = SW.Sources.earthquake(st.mesh, st.ocean, {
        lat: +$("eqLat").value, lon: +$("eqLon").value, Mw: +$("eqMw").value,
        strike: +$("eqStrike").value, dip: Math.max(1, +$("eqDip").value),
        L: Math.max(1, +$("eqL").value), W: Math.max(1, +$("eqW").value),
      });
      const i = res.info;
      $("srcInfo").textContent =
        `M₀ = ${i.M0.toExponential(2)} N·m, skluz ${i.slip.toFixed(1)} m\n` +
        `zdvih dna max ${i.uplift.toFixed(2)} m, pokles ${i.subsidence.toFixed(2)} m`;
      if (i.uplift === 0 && i.subsidence === 0) $("srcInfo").textContent += "\n⚠ zlom leží celý na pevnině — žádná vlna";
    } else {
      res = SW.Sources.impact(st.mesh, st.ocean, st.H, {
        lat: +$("imLat").value, lon: +$("imLon").value, diameter: Math.max(1, +$("imD").value),
        velocity: Math.max(1, +$("imV").value), density: Math.max(100, +$("imRho").value),
      });
      const i = res.info;
      $("srcInfo").textContent =
        `energie ${fmtEnergy(i.energyMt)}\n` +
        `přechodný kráter ⌀ ${(i.cavityDiameter / 1000).toFixed(1)} km, hloubka ${(i.cavityDepth / 1000).toFixed(2)} km` +
        (i.localDepth > 0 ? ` (oceán ${Math.round(i.localDepth)} m)` : "") +
        (i.localDepth === 0 ? "\n⚠ místo dopadu je na pevnině — žádná vlna" : "") +
        (i.smoothed ? `\nrozlišeno na síti: poloměr ${(i.effRadius / 1000).toFixed(0)} km, hloubka ${i.effDepth.toFixed(0)} m` : "");
    }
    st.sim.setInitial(res.eta);
    let mx = 0;
    for (let a = 0; a < res.eta.length; a++) mx = Math.max(mx, Math.abs(res.eta[a]));
    st.eta0Max = mx || 1;
    st.simClock = 0;
    if ($("autoRange").checked) autoRange();
    markDirty();
  }

  function fmtEnergy(mt) {
    if (mt < 1) return `${(mt * 1000).toPrecision(3)} kt TNT`;
    if (mt < 1e4) return `${mt.toPrecision(3)} Mt TNT`;
    return `${mt.toExponential(2)} Mt TNT`;
  }

  // ---- display ------------------------------------------------------------------
  // Colour range is fixed from the initial condition (max |eta0|) or the
  // end time, so it does not jump while the simulation runs.
  function autoRange() {
    const r = view.field === 2
      ? Math.max(1, Math.ceil(+$("tEnd").value || 24))
      : niceNumber(Math.max(0.01, st.eta0Max * (view.field === 0 ? 0.5 : 0.7)));
    view.range = r;
    $("range").value = r;
  }
  function niceNumber(x) {
    const e = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / e;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * e;
  }

  function uploadField() {
    const sim = st.sim, ocean = st.ocean, N = st.mesh.N, f = view.field;
    renderer.setValues((d) => {
      const src = f === 0 ? sim.eta : f === 1 ? sim.maxEta : sim.arrival;
      for (let a = 0; a < N; a++) {
        if (!ocean[a]) { d[2 * a] = 0; d[2 * a + 1] = 0; continue; }
        const v = src[a];
        if (f === 2) {
          if (v < 0) { d[2 * a] = 0; d[2 * a + 1] = 0; }
          else { d[2 * a] = v / 3600; d[2 * a + 1] = 1; }
        } else { d[2 * a] = v; d[2 * a + 1] = 1; }
      }
    });
  }

  function updateLegend() {
    const cm = SW.Colormaps[view.field === 0 ? "diverging" : view.field === 1 ? "heat" : "time"];
    $("legendBar").style.background = `linear-gradient(to right, ${cm.map(([t, c]) => `rgb(${c.map((x) => Math.round(x * 255)).join(",")}) ${t * 100}%`).join(", ")})`;
    const r = view.range;
    let labels, title;
    if (view.field === 0) { labels = [`−${fmtM(r)}`, `−${fmtM(r / 4)}`, "0", `+${fmtM(r / 4)}`, `+${fmtM(r)}`]; title = "hladina η [m, odmocninová škála]"; }
    else if (view.field === 1) { labels = [fmtM(r / 316), fmtM(r / 18), fmtM(r)]; title = "maximální výška hladiny [m, log]"; }
    else { labels = ["0 h", `${(r / 2).toFixed(r % 2 ? 1 : 0)} h`, `${r} h`]; title = "čas příchodu (izochrony po 1 h)"; }
    $("legendLabels").innerHTML = labels.map((l) => `<span>${l}</span>`).join("");
    $("legendTitle").textContent = title;
  }
  function fmtM(v) {
    const a = Math.abs(v);
    if (a === 0) return "0";
    if (a >= 100) return v.toFixed(0);
    if (a >= 1) return v.toPrecision(3).replace(/\.?0+$/, "");
    if (a >= 0.01) return v.toFixed(2);
    return v.toPrecision(2);
  }

  function fmtTime(t) {
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.floor(t % 60);
    return `${h} h ${String(m).padStart(2, "0")} min ${String(s).padStart(2, "0")} s`;
  }
  function updateHud() {
    const sim = st.sim;
    if (!sim) return;
    let mx = 0;
    const eta = sim.eta;
    for (let a = 0; a < eta.length; a++) { const v = Math.abs(eta[a]); if (v > mx) mx = v; }
    const kind = sim.solver.kind === "linear" ? "lineární C-grid" : "nelineární Godunov";
    $("hud").innerHTML = `<div class="t">t = ${fmtTime(sim.t)}</div>` +
      `<div class="s">${kind} · Δt ${(sim.lastDt || sim.solver.proposeDt()).toFixed(1)} s · krok ${sim.steps}` +
      (st.msPerStep ? ` · ${st.msPerStep.toFixed(1)} ms/krok` : "") + ` · max|η| ${fmtM(mx)} m</div>`;
  }

  function markers() {
    const list = [];
    const s = sourceLatLon();
    list.push({ lat: s.lat, lon: s.lon, color: [1, 0.35, 0.2, 1], size: 13 });
    for (const g of st.gauges) {
      const c = g.color;
      list.push({ lat: g.lat, lon: g.lon, color: [parseInt(c.slice(1, 3), 16) / 255, parseInt(c.slice(3, 5), 16) / 255, parseInt(c.slice(5, 7), 16) / 255, 1], size: 11 });
    }
    return list;
  }

  // ---- gauges ---------------------------------------------------------------
  function addGauge(lat, lon) {
    const cell = SW.findCell(st.mesh, Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R), 0);
    if (!st.ocean[cell]) { flash("Mareograf lze umístit jen do oceánu."); return; }
    const id = ++st.gaugeSeq;
    const g = { id, lat, lon, label: `M${id}`, color: GAUGE_COLORS[(id - 1) % GAUGE_COLORS.length] };
    attachGauge(g);
    st.gauges.push(g);
    refreshGaugeList();
    markDirty();
  }
  function removeGauge(id) {
    const i = st.gauges.findIndex((g) => g.id === id);
    if (i < 0) return;
    const g = st.gauges[i];
    st.gauges.splice(i, 1);
    const j = st.sim.gauges.indexOf(g.sg);
    if (j >= 0) st.sim.gauges.splice(j, 1);
    refreshGaugeList();
    markDirty();
  }
  function refreshGaugeList() {
    $("gaugeList").innerHTML = st.gauges.map((g) =>
      `<li><span class="dot" style="background:${g.color}"></span><span class="gname">${g.label}: ${fmtLat(g.lat)}, ${fmtLon(g.lon)}` +
      ` · H = ${Math.round(st.H[g.sg.cell])} m</span><button data-id="${g.id}" title="Odebrat">×</button></li>`).join("");
    $("gaugeHint").classList.toggle("hidden", st.gauges.length > 0);
    $("chartBox").classList.toggle("hidden", st.gauges.length === 0);
  }
  $("gaugeList").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (b) removeGauge(+b.dataset.id);
  });
  function fmtLat(v) { return `${Math.abs(v).toFixed(1)}° ${v >= 0 ? "s. š." : "j. š."}`; }
  function fmtLon(v) { return `${Math.abs(v).toFixed(1)}° ${v >= 0 ? "v. d." : "z. d."}`; }

  function drawChart() {
    if (!st.gauges.length || !st.sim) return;
    const cv = $("chart");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(cv.clientWidth * dpr), Hh = Math.round(cv.clientHeight * dpr);
    if (cv.width !== W || cv.height !== Hh) { cv.width = W; cv.height = Hh; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = cv.clientWidth, h = cv.clientHeight;
    ctx.clearRect(0, 0, w, h);
    const pl = 44, pr = 10, pt = 10, pb = 22;
    const tMax = Math.max(3600, st.sim.t);
    let yMax = 0.01;
    for (const g of st.gauges) for (const v of g.sg.v) yMax = Math.max(yMax, Math.abs(v));
    yMax *= 1.1;
    const X = (t) => pl + ((w - pl - pr) * t) / tMax, Y = (v) => pt + ((h - pt - pb) * (1 - v / yMax)) / 2;
    ctx.strokeStyle = "#26324f"; ctx.fillStyle = "#8e9bb8"; ctx.font = "11px system-ui"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pl, Y(0)); ctx.lineTo(w - pr, Y(0)); ctx.stroke();
    const hStep = tMax > 12 * 3600 ? 3 : tMax > 4 * 3600 ? 1 : 0.5;
    ctx.textAlign = "center";
    for (let t = 0; t <= tMax / 3600 + 1e-9; t += hStep) {
      const x = X(t * 3600);
      ctx.beginPath(); ctx.moveTo(x, pt); ctx.lineTo(x, h - pb); ctx.stroke();
      ctx.fillText(`${t} h`, x, h - 6);
    }
    ctx.textAlign = "right";
    for (const v of [yMax / 1.1, 0, -yMax / 1.1]) ctx.fillText(`${fmtM(v)} m`, pl - 4, Y(v) + 4);
    for (const g of st.gauges) {
      const T = g.sg.t, V = g.sg.v;
      ctx.strokeStyle = g.color; ctx.lineWidth = 1.5;
      ctx.beginPath();
      const stride = Math.max(1, Math.floor(T.length / (w * 2)));
      for (let i = 0; i < T.length; i += stride) { const x = X(T[i]), y = Y(V[i]); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
    }
    ctx.textAlign = "left";
    let lx = pl + 6;
    for (const g of st.gauges) { ctx.fillStyle = g.color; ctx.fillText(g.label, lx, pt + 10); lx += 30; }
  }

  // ---- hover readout -------------------------------------------------------
  function readout(ll) {
    if (!ll || !st.mesh) { $("readout").textContent = ""; return; }
    const la = ll.lat * D2R, lo = ll.lon * D2R;
    const c = SW.findCell(st.mesh, Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la), st.hover >= 0 ? st.hover : 0);
    st.hover = c;
    let txt = `${fmtLat(ll.lat)}, ${fmtLon(ll.lon)}  · buňka ${c}\n`;
    if (st.ocean[c]) {
      const arr = st.sim.arrival[c];
      txt += `hloubka ${Math.round(st.H[c])} m, η = ${st.sim.eta[c].toFixed(3)} m\n`;
      txt += `max η ${st.sim.maxEta[c].toFixed(3)} m, příchod ${arr < 0 ? "—" : fmtTime(arr)}`;
    } else txt += `pevnina (${Math.round(st.elev[c])} m n. m.)`;
    $("readout").textContent = txt;
  }

  // ---- time loop ----------------------------------------------------------
  function setRunning(on) {
    st.running = on;
    if (on && st.sim) st.simClock = st.sim.t;
    const b = $("btnRun");
    b.textContent = on ? "❚❚ Pauza" : "▶ Spustit";
    b.classList.toggle("running", on);
  }
  function markDirty() { st.needsUpload = true; st.needsDraw = true; st.needsChart = true; }

  let last = performance.now();
  function frame(now) {
    const interval = Math.min(1000, now - last);
    const dtReal = Math.min(0.5, interval / 1000);
    last = now;
    const sim = st.sim;
    if (st.running && sim) {
      const tEnd = Math.max(1, +$("tEnd").value || 24) * 3600;
      const speed = +$("speed").value;
      st.simClock = Math.min(tEnd, st.simClock + speed * dtReal);
      const t0 = performance.now();
      let n = 0;
      // On big meshes (or when the browser throttles frames) a frame is long:
      // give the solver a share of the frame interval and at least as much
      // time as uploading and drawing the field takes.
      const budget = Math.min(600, Math.max(35, st.displayMs, 0.6 * interval));
      while (sim.t < st.simClock - 1e-6 && performance.now() - t0 < budget) {
        if (!sim.step(tEnd)) { setRunning(false); alert("Numerická nestabilita (NaN) — simulace zastavena."); break; }
        n++;
      }
      if (n) st.msPerStep = (performance.now() - t0) / n;
      if (sim.t < st.simClock - 1e-6) st.simClock = sim.t; // cannot keep up
      if (sim.t >= tEnd - 1e-6) setRunning(false);
      if (n) markDirty();
    }
    const d0 = performance.now();
    const drew = st.needsUpload || st.needsDraw;
    if (st.needsUpload && sim) {
      uploadField();
      updateHud();
      updateLegend();
      st.needsUpload = false;
      st.needsDraw = true;
    }
    if (st.needsChart) { drawChart(); st.needsChart = false; }
    if (st.needsDraw) { renderer.draw(markers()); st.needsDraw = false; }
    if (drew) st.displayMs = 0.8 * st.displayMs + 0.2 * (performance.now() - d0);
    requestAnimationFrame(frame);
  }

  // ---- mouse / touch ---------------------------------------------------------
  const cv = $("gl");
  let press = null;
  cv.addEventListener("pointerdown", (e) => {
    press = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, drag: false, shift: e.shiftKey };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    const r = cv.getBoundingClientRect();
    if (press) {
      const dx = e.clientX - press.lx, dy = e.clientY - press.ly;
      if (!press.drag && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 4) { press.drag = true; cv.classList.add("dragging"); }
      if (press.drag) {
        if (view.mode === "globe") {
          const k = 0.11 * (view.dist - 1) * (900 / Math.max(400, r.height));
          view.lon -= dx * k;
          view.lat = Math.max(-85, Math.min(85, view.lat + dy * k));
        } else {
          const ppd = Math.min(r.width / 360, r.height / 180) * view.mapZoom;
          view.mapLon -= dx / ppd;
          view.mapLat = Math.max(-90, Math.min(90, view.mapLat + dy / ppd));
        }
        press.lx = e.clientX; press.ly = e.clientY;
        st.needsDraw = true;
      }
    } else {
      readout(renderer.pick(e.clientX - r.left, e.clientY - r.top));
    }
  });
  cv.addEventListener("pointerup", (e) => {
    if (!press) return;
    const wasDrag = press.drag;
    const shift = press.shift || e.shiftKey;
    press = null;
    cv.classList.remove("dragging");
    if (wasDrag || !st.mesh) return;
    const r = cv.getBoundingClientRect();
    const ll = renderer.pick(e.clientX - r.left, e.clientY - r.top);
    if (!ll) return;
    if (shift) { addGauge(ll.lat, ll.lon); return; }
    if ($("clickPlace").checked) {
      const pfx = st.srcType === "eq" ? "eq" : "im";
      $(pfx + "Lat").value = ll.lat.toFixed(2);
      $(pfx + "Lon").value = ll.lon.toFixed(2);
      $(pfx + "Preset").value = "-1";
      applySource();
    }
  });
  cv.addEventListener("pointerleave", () => { if (!press) $("readout").textContent = ""; });
  function zoom(f) {
    if (view.mode === "globe") view.dist = Math.max(1.06, Math.min(8, 1 + (view.dist - 1) * f));
    else view.mapZoom = Math.max(1, Math.min(60, view.mapZoom / f));
    st.needsDraw = true;
  }
  cv.addEventListener("wheel", (e) => { e.preventDefault(); zoom(Math.exp(e.deltaY * 0.0012)); }, { passive: false });
  $("zoomIn").onclick = () => zoom(0.8);
  $("zoomOut").onclick = () => zoom(1.25);
  window.addEventListener("resize", () => { st.needsDraw = true; st.needsChart = true; });

  // ---- controls --------------------------------------------------------------
  $("btnRun").onclick = () => {
    if (!st.sim) return;
    const tEnd = Math.max(1, +$("tEnd").value || 24) * 3600;
    if (!st.running && st.sim.t >= tEnd - 1e-6) applySource();
    setRunning(!st.running);
  };
  $("btnStep").onclick = () => {
    if (!st.sim) return;
    setRunning(false);
    const t0 = performance.now();
    st.sim.step();
    st.msPerStep = performance.now() - t0;
    markDirty();
  };
  $("btnReset").onclick = () => applySource();
  $("btnMesh").onclick = buildMesh;
  $("minDepth").onchange = () => { if (st.mesh) { computeOcean(); newSimulation(); refreshGaugeList(); } };
  for (const r of document.querySelectorAll('input[name="model"]')) r.onchange = newSimulation;
  $("coriolis").onchange = newSimulation;
  $("friction").onchange = newSimulation;
  $("arrThr").onchange = () => { if (st.sim) st.sim.arrivalThreshold = (+$("arrThr").value || 1) / 100; };

  for (const b of document.querySelectorAll(".tab[data-src]")) {
    b.onclick = () => {
      for (const o of document.querySelectorAll(".tab[data-src]")) o.classList.toggle("active", o === b);
      st.srcType = b.dataset.src;
      $("srcEq").classList.toggle("hidden", st.srcType !== "eq");
      $("srcImpact").classList.toggle("hidden", st.srcType !== "impact");
      applySource();
    };
  }
  for (const b of document.querySelectorAll(".tab[data-view]")) {
    b.onclick = () => {
      for (const o of document.querySelectorAll(".tab[data-view]")) o.classList.toggle("active", o === b);
      const s = sourceLatLon();
      view.mode = b.dataset.view;
      if (view.mode === "map") { view.mapLon = s.lon; view.mapLat = 0; }
      else { view.lon = s.lon; view.lat = Math.max(-60, Math.min(60, s.lat)); }
      st.needsDraw = true;
    };
  }
  function lookAtSource() {
    const s = sourceLatLon();
    if (view.mode === "globe") { view.lon = s.lon; view.lat = Math.max(-60, Math.min(60, s.lat)); }
    else view.mapLon = s.lon;
  }
  $("eqPreset").onchange = () => {
    const i = +$("eqPreset").value;
    if (i >= 0) { setEqFields(EQ[i]); lookAtSource(); applySource(); }
  };
  $("imPreset").onchange = () => {
    const i = +$("imPreset").value;
    if (i >= 0) { setImFields(IM[i]); lookAtSource(); applySource(); }
  };
  for (const id of ["eqLat", "eqLon", "eqMw", "eqStrike", "eqL", "eqW", "eqDip"]) $(id).onchange = () => { $("eqPreset").value = "-1"; applySource(); };
  for (const id of ["imLat", "imLon", "imD", "imV", "imRho"]) $(id).onchange = () => { $("imPreset").value = "-1"; applySource(); };
  $("eqScale").onclick = () => {
    const s = SW.Sources.faultScaling(+$("eqMw").value);
    $("eqL").value = Math.round(s.L); $("eqW").value = Math.round(s.W);
    $("eqPreset").value = "-1";
    applySource();
  };

  $("field").onchange = () => {
    view.field = +$("field").value;
    $("range").step = view.field === 2 ? 1 : 0.05;
    $("range").previousSibling.textContent = view.field === 2 ? "Rozsah [h] " : "Rozsah barev [m] ";
    if ($("autoRange").checked) autoRange();
    markDirty();
  };
  $("range").onchange = () => { view.range = Math.max(1e-3, +$("range").value); $("autoRange").checked = false; markDirty(); };
  $("autoRange").onchange = () => { if ($("autoRange").checked) { autoRange(); markDirty(); } };
  $("tEnd").onchange = () => { if ($("autoRange").checked && view.field === 2) { autoRange(); markDirty(); } };
  $("cellMode").onchange = () => { view.cellMode = $("cellMode").value; st.needsDraw = true; };
  $("showMesh").onchange = () => { view.showMesh = $("showMesh").checked; st.needsDraw = true; };
  $("showCoast").onchange = () => { view.showCoast = $("showCoast").checked; st.needsDraw = true; };
  $("btnHelp").onclick = () => $("help").classList.remove("hidden");
  $("helpClose").onclick = () => $("help").classList.add("hidden");
  $("help").onclick = (e) => { if (e.target === $("help")) $("help").classList.add("hidden"); };
  $("togglePanel").onclick = () => $("panel").classList.toggle("open");
  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (e.code === "Space") { e.preventDefault(); $("btnRun").click(); }
    if (e.key === "Escape") $("help").classList.add("hidden");
  });

  // ---- start -------------------------------------------------------------------
  fillPresets();
  setEqFields(EQ[0]);
  setImFields(IM[2]);
  view.lon = 165; view.lat = 20;
  busy("Připravuji mapu…", () => {
    buildBaseTexture();
    st.needsDraw = true;
    buildMesh();
  });
  loadCoastlines();
  updateLegend();
  requestAnimationFrame(frame);
})();
