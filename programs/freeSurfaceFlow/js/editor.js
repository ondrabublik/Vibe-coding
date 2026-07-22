class DrawEditor {
  constructor() {
    this.mode = 'fluid';
    this.brush = 2;
    this.solids = new Set();
    this.fluids = new Set();
    this.active = false;
    this.enabled = false;
  }

  setMode(mode) {
    this.mode = mode;
  }

  setBrush(r) {
    this.brush = Math.max(1, Math.min(8, r));
  }

  clear() {
    this.solids.clear();
    this.fluids.clear();
  }

  applyCell(i, j, solver) {
    const { nx, ny } = solver;
    const square = this.mode === 'solid';
    for (let dj = -this.brush; dj <= this.brush; dj++) {
      for (let di = -this.brush; di <= this.brush; di++) {
        // Solid obstacles use a square brush; fluid/erase stay circular.
        if (!square && di * di + dj * dj > this.brush * this.brush + 0.5) continue;
        const ci = i + di;
        const cj = j + dj;
        if (ci <= 0 || cj <= 0 || ci >= nx - 1 || cj >= ny - 1) continue;
        const key = `${ci},${cj}`;

        if (this.mode === 'solid') {
          this.fluids.delete(key);
          this.solids.add(key);
        } else if (this.mode === 'fluid') {
          this.solids.delete(key);
          this.fluids.add(key);
        } else if (this.mode === 'erase') {
          this.solids.delete(key);
          this.fluids.delete(key);
        }
      }
    }
  }

  pointerDown(i, j, solver) {
    if (!this.enabled) return;
    this.active = true;
    this.applyCell(i, j, solver);
  }

  pointerMove(i, j, solver) {
    if (!this.enabled || !this.active) return;
    this.applyCell(i, j, solver);
  }

  pointerUp() {
    this.active = false;
  }

  getState() {
    return {
      solids: new Set(this.solids),
      fluids: new Set(this.fluids),
    };
  }
}
