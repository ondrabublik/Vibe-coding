/**
 * Renderer: free surface is drawn from the fluid-fraction field ε via
 * bilinear sampling onto screen pixels (soft edge around ε ≈ 0.5),
 * with an optional marching-squares outline of the ε = 0.5 isosurface.
 */
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.imageData = null;
    this.scale = 4;
    this.showVelocity = true;
    this.showContours = true;
    this.showSurface = true;
    this.contourLevels = 8;
    this.epsField = null;
    this.solidField = null;
  }

  attachSolver(solver) {
    this.solver = solver;
    this.resize();
  }

  resize() {
    const { solver } = this;
    if (!solver) return;
    const maxW = Math.min(1100, window.innerWidth - 380);
    const maxH = Math.min(720, window.innerHeight - 120);
    this.scale = Math.max(2, Math.min(maxW / solver.nx, maxH / solver.ny));
    this.canvas.width = Math.round(solver.nx * this.scale);
    this.canvas.height = Math.round(solver.ny * this.scale);
    this.imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    this.epsField = new Float32Array(solver.n);
    this.solidField = new Uint8Array(solver.n);
  }

  hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r, g, b;
    switch (i % 6) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      default: r = v; g = p; b = q;
    }
    return [r * 255 | 0, g * 255 | 0, b * 255 | 0];
  }

  /** Build ε and solid masks; lightly blur ε for display only. */
  rebuildScalarFields() {
    const { solver, epsField, solidField } = this;
    const { nx, ny, n } = solver;
    const raw = new Float32Array(n);

    for (let id = 0; id < n; id++) {
      const t = solver.type[id];
      solidField[id] = t === CellType.SOLID ? 1 : 0;
      if (t === CellType.FLUID) raw[id] = 1;
      else if (t === CellType.INTERFACE) {
        raw[id] = Math.max(0, Math.min(1, solver.getEpsilon(id)));
      } else {
        raw[id] = 0;
      }
    }

    // 3×3 box blur (display only) — softens staircase on the free surface.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = solver.idx(i, j);
        if (solidField[id]) {
          epsField[id] = 0;
          continue;
        }
        let sum = 0;
        let w = 0;
        for (let dj = -1; dj <= 1; dj++) {
          for (let di = -1; di <= 1; di++) {
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
            const nid = solver.idx(ni, nj);
            if (solidField[nid]) continue;
            const ww = di === 0 && dj === 0 ? 2 : 1;
            sum += raw[nid] * ww;
            w += ww;
          }
        }
        epsField[id] = w > 0 ? sum / w : 0;
      }
    }
  }

  sampleField(field, x, y) {
    const { solver } = this;
    const nx = solver.nx;
    const ny = solver.ny;
    const x0 = Math.max(0, Math.min(nx - 1.001, x));
    const y0 = Math.max(0, Math.min(ny - 1.001, y));
    const i = Math.floor(x0);
    const j = Math.floor(y0);
    const tx = x0 - i;
    const ty = y0 - j;
    const i1 = Math.min(nx - 1, i + 1);
    const j1 = Math.min(ny - 1, j + 1);
    const f00 = field[solver.idx(i, j)];
    const f10 = field[solver.idx(i1, j)];
    const f01 = field[solver.idx(i, j1)];
    const f11 = field[solver.idx(i1, j1)];
    return f00 * (1 - tx) * (1 - ty)
      + f10 * tx * (1 - ty)
      + f01 * (1 - tx) * ty
      + f11 * tx * ty;
  }

  sampleSolid(x, y) {
    const { solver, solidField } = this;
    const i = Math.max(0, Math.min(solver.nx - 1, Math.round(x)));
    const j = Math.max(0, Math.min(solver.ny - 1, Math.round(y)));
    return solidField[solver.idx(i, j)];
  }

  sampleVelocity(x, y) {
    const { solver } = this;
    const nx = solver.nx;
    const ny = solver.ny;
    const x0 = Math.max(0, Math.min(nx - 1.001, x));
    const y0 = Math.max(0, Math.min(ny - 1.001, y));
    const i = Math.floor(x0);
    const j = Math.floor(y0);
    const tx = x0 - i;
    const ty = y0 - j;
    const i1 = Math.min(nx - 1, i + 1);
    const j1 = Math.min(ny - 1, j + 1);

    const vel = (ii, jj) => {
      const id = solver.idx(ii, jj);
      if (!solver.isFluidLike(id)) return [0, 0];
      return [solver.ux[id], solver.uy[id]];
    };

    const [u00, v00] = vel(i, j);
    const [u10, v10] = vel(i1, j);
    const [u01, v01] = vel(i, j1);
    const [u11, v11] = vel(i1, j1);
    const ux = u00 * (1 - tx) * (1 - ty) + u10 * tx * (1 - ty)
      + u01 * (1 - tx) * ty + u11 * tx * ty;
    const uy = v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty)
      + v01 * (1 - tx) * ty + v11 * tx * ty;
    return [ux, uy];
  }

  drawField(maxSpeed) {
    const { solver, imageData } = this;
    if (!solver || !imageData) return;

    this.rebuildScalarFields();

    const data = imageData.data;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const invS = 1 / this.scale;
    const vmax = Math.max(maxSpeed, 0.02);
    const gas = [8, 12, 22];
    const wall = [58, 72, 96];

    for (let py = 0; py < h; py++) {
      const ly = (py + 0.5) * invS - 0.5;
      for (let px = 0; px < w; px++) {
        const lx = (px + 0.5) * invS - 0.5;
        const p = (py * w + px) * 4;

        if (this.sampleSolid(lx, ly)) {
          data[p] = wall[0];
          data[p + 1] = wall[1];
          data[p + 2] = wall[2];
          data[p + 3] = 255;
          continue;
        }

        const eps = this.sampleField(this.epsField, lx, ly);
        // Smoothstep around the free-surface isosurface ε = 0.5.
        const edge = Math.max(0, Math.min(1, (eps - 0.15) / 0.7));
        const alpha = edge * edge * (3 - 2 * edge);

        let fr;
        let fg;
        let fb;
        if (this.showVelocity && alpha > 0.01) {
          const [ux, uy] = this.sampleVelocity(lx, ly);
          const speed = Math.hypot(ux, uy);
          const hue = 0.58 - 0.58 * Math.min(1, speed / vmax);
          [fr, fg, fb] = this.hsvToRgb(hue, 0.85, 0.95);
        } else {
          fr = 30;
          fg = 140 + eps * 40;
          fb = 190 + eps * 40;
        }

        data[p] = gas[0] + (fr - gas[0]) * alpha | 0;
        data[p + 1] = gas[1] + (fg - gas[1]) * alpha | 0;
        data[p + 2] = gas[2] + (fb - gas[2]) * alpha | 0;
        data[p + 3] = 255;
      }
    }

    this.ctx.putImageData(imageData, 0, 0);

    if (this.showSurface) this.drawFreeSurface();
    if (this.showContours) this.drawContours(vmax);
    if (this.showVelocity) this.drawVectors(vmax);
  }

  drawFreeSurface() {
    const { solver, ctx, scale, epsField } = this;
    const nx = solver.nx;
    const ny = solver.ny;
    const iso = 0.5;

    ctx.save();
    ctx.lineWidth = Math.max(1.25, scale * 0.22);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.85)';
    ctx.beginPath();

    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        if (this.solidField[solver.idx(i, j)]) continue;
        const v00 = epsField[solver.idx(i, j)];
        const v10 = epsField[solver.idx(i + 1, j)];
        const v01 = epsField[solver.idx(i, j + 1)];
        const v11 = epsField[solver.idx(i + 1, j + 1)];
        this.marchSquare(ctx, i * scale, j * scale, scale, v00, v10, v11, v01, iso);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  drawVectors(vmax) {
    const { solver, ctx, scale } = this;
    const step = Math.max(2, Math.floor(10 / Math.max(this.scale, 1)));
    const maxLen = this.scale * 0.9;
    const maxV = Math.max(vmax, 0.02);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;

    for (let j = step; j < solver.ny - step; j += step) {
      for (let i = step; i < solver.nx - step; i += step) {
        const id = solver.idx(i, j);
        if (!solver.isFluidLike(id)) continue;
        if (solver.getEpsilon(id) < 0.35) continue;

        const ux = solver.ux[id];
        const uy = solver.uy[id];
        const speed = Math.hypot(ux, uy);
        if (speed < 0.002) continue;

        const len = (speed / maxV) * maxLen;
        const x0 = (i + 0.5) * scale;
        const y0 = (j + 0.5) * scale;

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + (ux / speed) * len, y0 + (uy / speed) * len);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  sampleSpeed(i, j) {
    const { solver } = this;
    if (i < 0 || j < 0 || i >= solver.nx || j >= solver.ny) return 0;
    const id = solver.idx(i, j);
    if (solver.type[id] !== CellType.FLUID) return 0;
    return Math.hypot(solver.ux[id], solver.uy[id]);
  }

  drawContours(vmax) {
    const { solver, ctx, scale } = this;
    const nx = solver.nx;
    const ny = solver.ny;
    const levels = this.contourLevels;
    const maxV = Math.max(vmax, 0.02);

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';

    for (let lv = 1; lv <= levels; lv++) {
      const threshold = (lv / (levels + 1)) * maxV;
      ctx.beginPath();
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          // Contours only inside fully filled fluid cells.
          if (
            solver.type[solver.idx(i, j)] !== CellType.FLUID
            || solver.type[solver.idx(i + 1, j)] !== CellType.FLUID
            || solver.type[solver.idx(i, j + 1)] !== CellType.FLUID
            || solver.type[solver.idx(i + 1, j + 1)] !== CellType.FLUID
          ) {
            continue;
          }

          const v00 = this.sampleSpeed(i, j);
          const v10 = this.sampleSpeed(i + 1, j);
          const v01 = this.sampleSpeed(i, j + 1);
          const v11 = this.sampleSpeed(i + 1, j + 1);
          this.marchSquare(ctx, i * scale, j * scale, scale, v00, v10, v11, v01, threshold);
        }
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  marchSquare(ctx, x, y, s, v00, v10, v11, v01, iso) {
    let mask = 0;
    if (v00 >= iso) mask |= 1;
    if (v10 >= iso) mask |= 2;
    if (v11 >= iso) mask |= 4;
    if (v01 >= iso) mask |= 8;
    if (mask === 0 || mask === 15) return;

    const lerp = (a, b, va, vb) => {
      const t = Math.abs(iso - va) / (Math.abs(vb - va) + 1e-9);
      return a + t * (b - a);
    };

    const top = [lerp(x, x + s, v00, v10), y];
    const right = [x + s, lerp(y, y + s, v10, v11)];
    const bottom = [lerp(x, x + s, v01, v11), y + s];
    const left = [x, lerp(y, y + s, v00, v01)];

    const seg = (a, b) => {
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    };

    switch (mask) {
      case 1: case 14: seg(left, top); break;
      case 2: case 13: seg(top, right); break;
      case 3: case 12: seg(left, right); break;
      case 4: case 11: seg(right, bottom); break;
      case 5: seg(left, top); seg(right, bottom); break;
      case 6: case 9: seg(top, bottom); break;
      case 7: case 8: seg(left, bottom); break;
      case 10: seg(top, right); seg(left, bottom); break;
    }
  }

  drawEditorOverlay(editorMode, solids, fluids) {
    if (!solids && !fluids) return;
    const { ctx, scale } = this;

    ctx.save();
    ctx.globalAlpha = 0.45;

    if (solids) {
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#94a3b8';
      for (const key of solids) {
        const [i, j] = key.split(',').map(Number);
        ctx.fillRect(i * scale, j * scale, scale, scale);
      }
      ctx.globalAlpha = 0.45;
    }

    if (fluids) {
      ctx.fillStyle = '#22d3ee';
      for (const key of fluids) {
        const [i, j] = key.split(',').map(Number);
        ctx.fillRect(i * scale, j * scale, scale, scale);
      }
    }

    ctx.restore();
  }

  cellFromEvent(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (evt.clientX - rect.left) * (this.canvas.width / rect.width);
    const py = (evt.clientY - rect.top) * (this.canvas.height / rect.height);
    const i = Math.floor(px / this.scale);
    const j = Math.floor(py / this.scale);
    return { i, j };
  }
}
