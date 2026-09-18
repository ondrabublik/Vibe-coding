const canvas = document.getElementById('simCanvas');
const caseSelect = document.getElementById('caseSelect');
const caseHint = document.getElementById('caseHint');
const btnPlay = document.getElementById('btnPlay');
const btnStep = document.getElementById('btnStep');
const btnReset = document.getElementById('btnReset');
const nuRange = document.getElementById('nuRange');
const nuVal = document.getElementById('nuVal');
const gravityRange = document.getElementById('gravityRange');
const gravityVal = document.getElementById('gravityVal');
const stepsRange = document.getElementById('stepsRange');
const stepsVal = document.getElementById('stepsVal');
const gridSelect = document.getElementById('gridSelect');
const gridVal = document.getElementById('gridVal');
const showVelocity = document.getElementById('showVelocity');
const showSurface = document.getElementById('showSurface');
const showContours = document.getElementById('showContours');
const contourRange = document.getElementById('contourRange');
const contourVal = document.getElementById('contourVal');
const statStep = document.getElementById('statStep');
const statMass = document.getElementById('statMass');
const statSpeed = document.getElementById('statSpeed');
const statFps = document.getElementById('statFps');
const toolFluid = document.getElementById('toolFluid');
const toolSolid = document.getElementById('toolSolid');
const toolErase = document.getElementById('toolErase');
const brushRange = document.getElementById('brushRange');
const brushVal = document.getElementById('brushVal');
const editorSection = document.getElementById('editorSection');
const btnClearDraw = document.getElementById('btnClearDraw');

let solver = new FreeSurfaceLBM(DEFAULTS.nx, DEFAULTS.ny, {
  nu: DEFAULTS.nu,
  gravity: DEFAULTS.gravity,
});
const renderer = new Renderer(canvas);
const editor = new DrawEditor();

let running = true;
let stepsPerFrame = DEFAULTS.stepsPerFrame;
let currentCase = 'damBreak';
let editMode = false;
let lastFpsTime = performance.now();
let frames = 0;

function populateGrids() {
  gridSelect.innerHTML = '';
  for (const g of GRID_PRESETS) {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.label;
    gridSelect.appendChild(opt);
  }
  const match = GRID_PRESETS.find((g) => g.nx === solver.nx && g.ny === solver.ny);
  gridSelect.value = match ? match.id : GRID_PRESETS[2].id;
  gridVal.textContent = `${solver.nx} × ${solver.ny}`;
}

function setGridResolution(presetId) {
  const preset = GRID_PRESETS.find((g) => g.id === presetId) ?? GRID_PRESETS[2];
  if (preset.nx === solver.nx && preset.ny === solver.ny) return;

  const nu = solver.nu;
  const gravity = solver.gravity;
  solver = new FreeSurfaceLBM(preset.nx, preset.ny, { nu, gravity });
  editor.clear();
  renderer.attachSolver(solver);
  gridVal.textContent = `${solver.nx} × ${solver.ny}`;
  resetSimulation();
  drawFrame();
}

function populateCases() {
  caseSelect.innerHTML = '';
  for (const id of CASE_ORDER) {
    const c = CASES[id];
    if (!c) continue;
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    caseSelect.appendChild(opt);
  }
  selectCase(currentCase, { skipReset: true });
}

function selectCase(caseId, { skipReset = false } = {}) {
  if (!CASES[caseId]) caseId = 'damBreak';
  currentCase = caseId;
  caseSelect.value = caseId;
  updateCaseHint();
  if (!skipReset) {
    if (currentCase !== 'user') editor.clear();
    resetSimulation();
    drawFrame();
  }
}

function updateCaseHint() {
  const c = CASES[currentCase];
  caseHint.textContent = c?.hint ?? '';
  editMode = currentCase === 'user';
  editor.enabled = editMode && !running;
  editorSection.style.display = editMode ? 'block' : 'none';
  canvas.style.cursor = editMode && !running ? 'crosshair' : 'default';
  updateToolButtons();
}

function updateToolButtons() {
  toolFluid.classList.toggle('active', editor.mode === 'fluid');
  toolSolid.classList.toggle('active', editor.mode === 'solid');
  toolErase.classList.toggle('active', editor.mode === 'erase');
}

function resetSimulation() {
  if (currentCase === 'user') {
    applyCase(solver, 'user', editor.getState());
  } else {
    editor.clear();
    applyCase(solver, currentCase);
  }
  statStep.textContent = '0';
}

function init() {
  renderer.attachSolver(solver);
  populateGrids();
  populateCases();
  resetSimulation();
  bindUi();
  drawFrame();
  requestAnimationFrame(loop);
}

function bindUi() {
  caseSelect.addEventListener('change', () => {
    const picked = caseSelect.value;
    if (picked === 'user') {
      running = false;
      btnPlay.textContent = 'Spustit';
      btnPlay.classList.remove('primary');
    }
    selectCase(picked);
  });

  gridSelect.addEventListener('change', () => {
    setGridResolution(gridSelect.value);
  });

  btnPlay.addEventListener('click', () => {
    running = !running;
    btnPlay.textContent = running ? 'Pauza' : 'Spustit';
    btnPlay.classList.toggle('primary', running);
    if (editMode) editor.enabled = !running;
    canvas.style.cursor = editMode && !running ? 'crosshair' : 'default';
  });

  btnStep.addEventListener('click', () => {
    runSteps(1);
    drawFrame();
  });

  btnReset.addEventListener('click', () => {
    resetSimulation();
    drawFrame();
  });

  nuRange.addEventListener('input', () => {
    const nu = parseFloat(nuRange.value);
    nuVal.textContent = nu.toFixed(3);
    solver.setViscosity(nu);
  });

  gravityRange.addEventListener('input', () => {
    const g = parseFloat(gravityRange.value);
    gravityVal.textContent = g.toExponential(2);
    solver.setGravity(g);
  });

  stepsRange.addEventListener('input', () => {
    stepsPerFrame = parseInt(stepsRange.value, 10);
    stepsVal.textContent = String(stepsPerFrame);
  });

  showVelocity.addEventListener('change', () => {
    renderer.showVelocity = showVelocity.checked;
  });

  showSurface.addEventListener('change', () => {
    renderer.showSurface = showSurface.checked;
  });

  showContours.addEventListener('change', () => {
    renderer.showContours = showContours.checked;
  });

  contourRange.addEventListener('input', () => {
    renderer.contourLevels = parseInt(contourRange.value, 10);
    contourVal.textContent = String(renderer.contourLevels);
  });

  toolFluid.addEventListener('click', () => { editor.setMode('fluid'); updateToolButtons(); });
  toolSolid.addEventListener('click', () => { editor.setMode('solid'); updateToolButtons(); });
  toolErase.addEventListener('click', () => { editor.setMode('erase'); updateToolButtons(); });

  brushRange.addEventListener('input', () => {
    editor.setBrush(parseInt(brushRange.value, 10));
    brushVal.textContent = String(editor.brush);
  });

  btnClearDraw.addEventListener('click', () => {
    editor.clear();
    resetSimulation();
    drawFrame();
  });

  canvas.addEventListener('mousedown', onPointer);
  canvas.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', () => editor.pointerUp());

  window.addEventListener('resize', () => {
    renderer.resize();
    drawFrame();
  });
}

function onPointer(evt) {
  if (!editMode || running) return;
  const { i, j } = renderer.cellFromEvent(evt);
  editor.pointerDown(i, j, solver);
  drawFrame();
}

function onPointerMove(evt) {
  if (!editMode || running) return;
  const { i, j } = renderer.cellFromEvent(evt);
  editor.pointerMove(i, j, solver);
  if (editor.active) drawFrame();
}

function runSteps(n) {
  for (let s = 0; s < n; s++) solver.step();
}

function drawFrame() {
  if (editMode && !running) {
    applyCase(solver, 'user', editor.getState());
    renderer.drawField(0);
    renderer.drawEditorOverlay(editor.mode, editor.solids, editor.fluids);
    statStep.textContent = '0';
    statMass.textContent = solver.totalMass().toFixed(1);
    statSpeed.textContent = '0.000';
    return;
  }

  const maxSpeed = solver.maxSpeed();
  renderer.drawField(maxSpeed);
  statStep.textContent = String(solver.stepCount);
  statMass.textContent = solver.totalMass().toFixed(1);
  statSpeed.textContent = maxSpeed.toFixed(4);
}

function loop(now) {
  if (running) {
    runSteps(stepsPerFrame);
    drawFrame();
  }

  frames++;
  if (now - lastFpsTime >= 1000) {
    statFps.textContent = String(frames);
    frames = 0;
    lastFpsTime = now;
  }

  requestAnimationFrame(loop);
}

init();
