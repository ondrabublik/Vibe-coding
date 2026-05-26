(function () {
  "use strict";

  const { parseNacaCode, computeNaca4, transformCurve, updateCodeThickness } =
    Naca4;
  const { buildClosedProfile, ensureCcw, offsetPolygonInward } = ClosedCurve;
  const { renderProfile } = CanvasView;
  const { buildDxf, downloadDxf, dxfFilename } = DxfExport;
  const { buildCsv, downloadCsv, csvFilename } = CsvExport;
  const { buildStep, downloadStep, stepFilename } = StepExport;

  const form = document.getElementById("profile-form");
  const codeInput = document.getElementById("naca-code");
  const thicknessInput = document.getElementById("thickness");
  const scaleInput = document.getElementById("scale-mm");
  const angleInput = document.getElementById("angle-deg");
  const pointCountInput = document.getElementById("point-count");
  const pointCountLabel = document.getElementById("point-count-label");
  const wallInput = document.getElementById("wall-mm");
  const lengthInput = document.getElementById("length-mm");
  const dxfBtn = document.getElementById("export-dxf");
  const csvBtn = document.getElementById("export-csv");
  const stepBtn = document.getElementById("export-step");
  const errorEl = document.getElementById("error");
  const warningEl = document.getElementById("warning");
  const canvas = document.getElementById("profile-canvas");

  let syncLock = false;
  let debounceTimer = null;

  function setMessage(el, msg) {
    if (msg) {
      el.textContent = msg;
      el.classList.add("visible");
    } else {
      el.textContent = "";
      el.classList.remove("visible");
    }
  }

  function readParams() {
    const code = codeInput.value.trim();
    const thicknessPercent = parseFloat(thicknessInput.value);
    const scaleMm = parseFloat(scaleInput.value);
    const angleDeg = parseFloat(angleInput.value) || 0;
    const pointCount = parseInt(pointCountInput.value, 10);
    const wallMm = parseFloat(wallInput.value);
    const lengthMm = parseFloat(lengthInput.value);

    const parsed = parseNacaCode(code);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    if (
      !Number.isFinite(thicknessPercent) ||
      thicknessPercent < 1 ||
      thicknessPercent > 99
    ) {
      return { ok: false, error: "Tloušťka profilu musí být 1–99 %." };
    }
    if (!Number.isFinite(scaleMm) || scaleMm < 1) {
      return { ok: false, error: "Délka profilu (chord) musí být alespoň 1 mm." };
    }

    return {
      ok: true,
      code: parsed.code,
      m: parsed.m,
      p: parsed.p,
      t: thicknessPercent / 100,
      thicknessPercent,
      scaleMm,
      angleDeg,
      pointCount,
      wallMm: Number.isFinite(wallMm) ? wallMm : 0,
      lengthMm: Number.isFinite(lengthMm) ? lengthMm : 0,
    };
  }

  function computeGeometry(params) {
    const { upper, lower } = computeNaca4({
      m: params.m,
      p: params.p,
      t: params.t,
      pointCount: params.pointCount,
    });
    const upperMm = transformCurve(upper, params.scaleMm, params.angleDeg);
    const lowerMm = transformCurve(lower, params.scaleMm, params.angleDeg);
    const closed = buildClosedProfile(upperMm, lowerMm);
    const outer = ensureCcw(closed);

    let inner = null;
    let innerError = null;
    if (params.wallMm > 0) {
      inner = offsetPolygonInward(outer, params.wallMm);
      if (!inner) {
        innerError =
          "Vnitřní křivku nelze vytvořit — tloušťka stěny je příliš velká pro tento profil.";
      }
    }
    return { outer, inner, innerError };
  }

  function updatePreview() {
    const params = readParams();
    if (!params.ok) {
      setMessage(errorEl, params.error);
      setMessage(warningEl, null);
      dxfBtn.disabled = true;
      csvBtn.disabled = true;
      stepBtn.disabled = true;
      return;
    }
    setMessage(errorEl, null);

    const geom = computeGeometry(params);

    if (geom.innerError) {
      setMessage(warningEl, geom.innerError);
      stepBtn.disabled = true;
    } else if (params.wallMm <= 0) {
      setMessage(warningEl, "Pro STEP export zadejte tloušťku stěny > 0 mm.");
      stepBtn.disabled = true;
    } else if (!(params.lengthMm > 0)) {
      setMessage(warningEl, "Pro STEP export zadejte délku extruze L > 0 mm.");
      stepBtn.disabled = true;
    } else {
      setMessage(warningEl, null);
      stepBtn.disabled = false;
    }
    dxfBtn.disabled = false;
    csvBtn.disabled = false;

    const label =
      "NACA " +
      params.code +
      "  ·  t=" +
      params.thicknessPercent +
      "%  ·  chord=" +
      params.scaleMm +
      " mm  ·  " +
      params.angleDeg +
      "°" +
      (params.wallMm > 0 ? "  ·  stěna " + params.wallMm + " mm" : "");
    renderProfile(canvas, geom.outer, geom.inner, { label });
  }

  function schedulePreview() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updatePreview, 100);
  }

  codeInput.addEventListener("input", () => {
    if (syncLock) return;
    const digits = codeInput.value.replace(/\D/g, "").slice(0, 4);
    codeInput.value = digits;
    if (digits.length === 4) {
      syncLock = true;
      thicknessInput.value = String(parseInt(digits.slice(2), 10));
      syncLock = false;
    }
    schedulePreview();
  });

  thicknessInput.addEventListener("input", () => {
    if (syncLock) return;
    const digits = codeInput.value.replace(/\D/g, "").slice(0, 4);
    if (digits.length >= 2) {
      syncLock = true;
      const pct = parseInt(thicknessInput.value, 10);
      if (Number.isFinite(pct)) {
        codeInput.value = updateCodeThickness(digits.padEnd(4, "0"), pct);
      }
      syncLock = false;
    }
    schedulePreview();
  });

  for (const el of [
    scaleInput,
    angleInput,
    pointCountInput,
    wallInput,
    lengthInput,
  ]) {
    el.addEventListener("input", schedulePreview);
  }

  pointCountInput.addEventListener("input", () => {
    pointCountLabel.textContent = pointCountInput.value + " bodů";
  });

  dxfBtn.addEventListener("click", () => {
    const params = readParams();
    if (!params.ok) {
      setMessage(errorEl, params.error);
      return;
    }
    const geom = computeGeometry(params);
    const dxf = buildDxf({ closedCurve: geom.outer });
    downloadDxf(dxf, dxfFilename(params.code, params.scaleMm));
  });

  csvBtn.addEventListener("click", () => {
    const params = readParams();
    if (!params.ok) {
      setMessage(errorEl, params.error);
      return;
    }
    const geom = computeGeometry(params);
    const csv = buildCsv({
      closedCurve: geom.outer,
      code: params.code,
      scaleMm: params.scaleMm,
      angleDeg: params.angleDeg,
    });
    downloadCsv(csv, csvFilename(params.code, params.scaleMm));
  });

  stepBtn.addEventListener("click", () => {
    const params = readParams();
    if (!params.ok) {
      setMessage(errorEl, params.error);
      return;
    }
    if (!(params.wallMm > 0) || !(params.lengthMm > 0)) {
      setMessage(errorEl, "STEP vyžaduje tloušťku stěny > 0 a délku L > 0.");
      return;
    }
    const geom = computeGeometry(params);
    if (!geom.inner) {
      setMessage(errorEl, geom.innerError || "Vnitřní křivka není validní.");
      return;
    }
    const step = buildStep({
      outerCurve: geom.outer,
      innerCurve: geom.inner,
      length: params.lengthMm,
      code: params.code,
    });
    downloadStep(
      step,
      stepFilename(params.code, params.scaleMm, params.lengthMm)
    );
  });

  window.addEventListener("resize", () => schedulePreview());
  form.addEventListener("submit", (e) => e.preventDefault());

  updatePreview();
})();
