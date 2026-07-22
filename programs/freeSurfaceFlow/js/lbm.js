/** Thürey free-surface LBM (D2Q9, BGK) — TechRep 05-4. */
class FreeSurfaceLBM {
  constructor(nx, ny, params = {}) {
    this.nx = nx;
    this.ny = ny;
    this.n = nx * ny;
    this.nu = params.nu ?? 0.02;
    this.gravity = params.gravity ?? 4e-5;
    this.tau = 3 * this.nu + 0.5;
    this.omega = 1 / this.tau;
    this.rhoGas = 1.0;
    this.kappa = 1e-3;
    this.stepCount = 0;

    this.f = new Float32Array(9 * this.n);
    this.fOld = new Float32Array(9 * this.n);
    this.mass = new Float32Array(this.n);
    this.rho = new Float32Array(this.n);
    this.ux = new Float32Array(this.n);
    this.uy = new Float32Array(this.n);
    this.type = new Uint8Array(this.n);
    this.solidMask = new Uint8Array(this.n);
    this.massDelta = new Float32Array(this.n);
  }

  setViscosity(nu) {
    this.nu = nu;
    this.tau = 3 * nu + 0.5;
    this.omega = 1 / this.tau;
  }

  setGravity(g) {
    this.gravity = g;
  }

  idx(i, j) {
    return j * this.nx + i;
  }

  inBounds(i, j) {
    return i >= 0 && i < this.nx && j >= 0 && j < this.ny;
  }

  isFluidLike(id) {
    const t = this.type[id];
    return t === CellType.FLUID || t === CellType.INTERFACE;
  }

  resetFields() {
    this.f.fill(0);
    this.fOld.fill(0);
    this.mass.fill(0);
    this.rho.fill(this.rhoGas);
    this.ux.fill(0);
    this.uy.fill(0);
    this.type.fill(CellType.GAS);
    this.solidMask.fill(0);
    this.massDelta.fill(0);
    this.stepCount = 0;
  }

  setSolid(i, j, value = 1) {
    const id = this.idx(i, j);
    this.solidMask[id] = value ? 1 : 0;
    if (value) {
      this.type[id] = CellType.SOLID;
      this.mass[id] = 0;
      for (let k = 0; k < 9; k++) this.f[k * this.n + id] = 0;
    }
  }

  setFluid(i, j, fraction = MASS_FULL) {
    const id = this.idx(i, j);
    if (this.solidMask[id]) return;
    const m = Math.max(MASS_EPS, Math.min(MASS_FULL, fraction));
    this.mass[id] = m;
    this.type[id] = m >= MASS_FULL - MASS_EPS ? CellType.FLUID : CellType.INTERFACE;
    this.initEquilibrium(id, this.rhoGas, 0, 0);
    this.mass[id] = m;
  }

  initEquilibrium(id, rho, ux, uy) {
    for (let k = 0; k < 9; k++) {
      this.f[k * this.n + id] = this.eq(k, rho, ux, uy);
    }
    this.rho[id] = rho;
    this.ux[id] = ux;
    this.uy[id] = uy;
  }

  eq(k, rho, ux, uy) {
    const cu = 3 * (CX[k] * ux + CY[k] * uy);
    const uu = 1.5 * (ux * ux + uy * uy);
    return rho * W[k] * (1 + cu + 0.5 * cu * cu - uu);
  }

  getEpsilon(id) {
    const t = this.type[id];
    if (t === CellType.FLUID) return 1;
    if (t === CellType.INTERFACE) return this.mass[id] / Math.max(this.rho[id], MASS_EPS);
    return 0;
  }

  computeMacroFromF(id, fArr) {
    let r = 0;
    let jx = 0;
    let jy = 0;
    for (let k = 0; k < 9; k++) {
      const fk = fArr[k * this.n + id];
      r += fk;
      jx += CX[k] * fk;
      jy += CY[k] * fk;
    }
    if (r < MASS_EPS) return { rho: this.rhoGas, ux: 0, uy: 0 };
    return { rho: r, ux: jx / r, uy: jy / r };
  }

  computeMacro(id) {
    const m = this.computeMacroFromF(id, this.f);
    this.rho[id] = m.rho;
    this.ux[id] = m.ux;
    this.uy[id] = m.uy;
    return m;
  }

  /** Eq. 9: reconstruct DF f_k arriving from empty / gas side. */
  reconstructFromGas(id, k, fArr) {
    const { ux, uy } = this.computeMacroFromF(id, fArr);
    const opp = OPP[k];
    return this.eq(opp, this.rhoGas, ux, uy)
      + this.eq(k, this.rhoGas, ux, uy)
      - fArr[opp * this.n + id];
  }

  /** Eq. 10: interface normal (points toward gas). */
  computeNormal(i, j) {
    const epsC = this.getEpsilon(this.idx(i, j));
    const epsL = this.inBounds(i - 1, j) ? this.getEpsilon(this.idx(i - 1, j)) : epsC;
    const epsR = this.inBounds(i + 1, j) ? this.getEpsilon(this.idx(i + 1, j)) : epsC;
    const epsD = this.inBounds(i, j - 1) ? this.getEpsilon(this.idx(i, j - 1)) : epsC;
    const epsU = this.inBounds(i, j + 1) ? this.getEpsilon(this.idx(i, j + 1)) : epsC;
    let nx = 0.5 * (epsL - epsR);
    let ny = 0.5 * (epsD - epsU);
    const len = Math.hypot(nx, ny);
    if (len < 1e-8) return { nx: 0, ny: 1 };
    return { nx: nx / len, ny: ny / len };
  }

  finalizeInterfaceLayer() {
    const { nx, ny } = this;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = this.idx(i, j);
        if (this.type[id] !== CellType.FLUID) continue;
        if (this.hasGasNeighbor(i, j)) {
          this.type[id] = CellType.INTERFACE;
          this.mass[id] = MASS_FULL;
        }
      }
    }
  }

  hasGasNeighbor(i, j) {
    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) return true;
      if (this.type[this.idx(ni, nj)] === CellType.GAS) return true;
    }
    return false;
  }

  hasFluidNeighbor(i, j) {
    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) continue;
      if (this.type[this.idx(ni, nj)] === CellType.FLUID) return true;
    }
    return false;
  }

  hasEmptyNeighbor(i, j) {
    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) return true;
      if (this.type[this.idx(ni, nj)] === CellType.GAS) return true;
    }
    return false;
  }

  neighborFluidStats(i, j) {
    let rhoSum = 0;
    let uxSum = 0;
    let uySum = 0;
    let count = 0;
    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) continue;
      const nid = this.idx(ni, nj);
      const t = this.type[nid];
      if (t !== CellType.FLUID && t !== CellType.INTERFACE) continue;
      rhoSum += this.rho[nid];
      uxSum += this.ux[nid];
      uySum += this.uy[nid];
      count++;
    }
    if (count === 0) {
      return { rho: this.rhoGas, ux: 0, uy: 0 };
    }
    return { rho: rhoSum / count, ux: uxSum / count, uy: uySum / count };
  }

  /**
   * Stream DFs, reconstruct free-surface BC, then mass exchange (Eq. 6–8).
   * Mass exchange is intentionally separate from the stream source lookup —
   * coupling them previously skipped flux on gas-facing directions.
   */
  streamAndMass() {
    const { nx, ny, n } = this;
    this.fOld.set(this.f);
    this.massDelta.fill(0);

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = this.idx(i, j);
        const t = this.type[id];
        if (t === CellType.SOLID || t === CellType.GAS) continue;

        const isInterface = t === CellType.INTERFACE;
        const { nx: nnx, ny: nny } = isInterface ? this.computeNormal(i, j) : { nx: 0, ny: 0 };

        // --- stream + free-surface reconstruction ---
        for (let k = 0; k < 9; k++) {
          const srcI = i - CX[k];
          const srcJ = j - CY[k];
          const opp = OPP[k];

          let fromEmpty = !this.inBounds(srcI, srcJ);
          if (!fromEmpty) {
            const srcType = this.type[this.idx(srcI, srcJ)];
            if (srcType === CellType.SOLID) {
              this.f[k * n + id] = this.fOld[opp * n + id];
              continue;
            }
            if (srcType === CellType.GAS) {
              fromEmpty = true;
            } else {
              this.f[k * n + id] = this.fOld[k * n + this.idx(srcI, srcJ)];
            }
          }

          if (fromEmpty) {
            if (isInterface) {
              this.f[k * n + id] = this.reconstructFromGas(id, k, this.fOld);
            } else {
              // Fluid should not touch gas; bounce as safeguard.
              this.f[k * n + id] = this.fOld[opp * n + id];
            }
          }
        }

        // Reconstruct DFs arriving from the gas side of the interface (n · e_ĩ > 0).
        if (isInterface) {
          for (let k = 1; k < 9; k++) {
            const opp = OPP[k];
            if (nnx * CX[opp] + nny * CY[opp] > 0) {
              this.f[k * n + id] = this.reconstructFromGas(id, k, this.fOld);
            }
          }
        }

        // --- mass exchange with fluid / interface neighbors (Eq. 6–7) ---
        if (!isInterface) continue;

        const epsSelf = this.getEpsilon(id);

        for (let k = 1; k < 9; k++) {
          const nbrI = i + CX[k];
          const nbrJ = j + CY[k];
          if (!this.inBounds(nbrI, nbrJ)) continue;

          const nbrId = this.idx(nbrI, nbrJ);
          const nbrType = this.type[nbrId];
          if (nbrType !== CellType.FLUID && nbrType !== CellType.INTERFACE) continue;

          const opp = OPP[k];
          const fi = this.fOld[k * n + id];
          const fIn = this.fOld[opp * n + nbrId];
          let exchange = fIn - fi;

          if (nbrType === CellType.INTERFACE) {
            exchange *= 0.5 * (epsSelf + this.getEpsilon(nbrId));
          }

          this.massDelta[id] += exchange;
        }
      }
    }
  }

  collide() {
    const { n, omega, tau, gravity } = this;
    const oneMinus = 1 - omega;
    // +j is screen-down (canvas / image coords), so gravity accelerates uy > 0.
    const fy = gravity;

    for (let id = 0; id < n; id++) {
      const t = this.type[id];
      if (t !== CellType.FLUID && t !== CellType.INTERFACE) continue;

      const macro = this.computeMacro(id);
      let rho = macro.rho;
      let ux = macro.ux;
      let uy = macro.uy;

      if (!Number.isFinite(rho) || rho < MASS_EPS) {
        rho = this.rhoGas;
        ux = 0;
        uy = 0;
      }

      uy += tau * fy / rho;

      // Keep within weakly-compressible LBM regime.
      const speed2 = ux * ux + uy * uy;
      if (speed2 > 0.09) {
        const s = Math.sqrt(speed2);
        ux *= 0.3 / s;
        uy *= 0.3 / s;
      }

      for (let k = 0; k < 9; k++) {
        const feq = this.eq(k, rho, ux, uy);
        let next = oneMinus * this.f[k * n + id] + omega * feq;
        if (!Number.isFinite(next) || next < 0) next = feq;
        this.f[k * n + id] = next;
      }

      this.ux[id] = ux;
      this.uy[id] = uy;
      this.rho[id] = rho;

      if (t === CellType.FLUID) {
        this.mass[id] = rho;
      }
    }
  }

  updateInterfaceMass() {
    for (let id = 0; id < this.n; id++) {
      if (this.type[id] !== CellType.INTERFACE) continue;
      this.mass[id] += this.massDelta[id];
    }
  }

  /**
   * Flag reinitialization (TechRep §4.3):
   * 1) promote gas neighbors of filled cells → interface
   * 2) promote fluid neighbors of emptied cells → interface
   * 3) convert filled → fluid, emptied → gas
   * 4) redistribute excess mass to interface neighbors
   */
  reinitializeFlags() {
    const { nx, ny, n } = this;
    const toFill = [];
    const toEmpty = [];
    const emptySet = new Set();

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = this.idx(i, j);
        if (this.type[id] !== CellType.INTERFACE) continue;

        const rho = Math.max(this.rho[id], MASS_EPS);
        const m = this.mass[id];
        const hasFluid = this.hasFluidNeighbor(i, j);
        const hasEmpty = this.hasEmptyNeighbor(i, j);

        let filled = m > (1 + this.kappa) * rho;
        let emptied = m < -this.kappa * rho;

        // Residual interface artifacts (TechRep §4.4).
        // Enclosed → fill; leftover spray with little mass → empty.
        // Heavier orphans are left for cleanupArtifacts (local mass return).
        if (!filled && !emptied) {
          if (!hasEmpty && m > 0.9 * rho) filled = true;
          if (!hasFluid && m < 0.1 * rho) emptied = true;
        }

        if (filled) toFill.push({ i, j, id, excess: m - rho });
        else if (emptied) {
          toEmpty.push({ i, j, id, excess: m });
          emptySet.add(id);
        }
      }
    }

    // Prepare neighborhood of filled cells: gas → new interface;
    // emptied neighbors needed as the new interface layer stay interface.
    for (const cell of toFill) {
      emptySet.delete(cell.id);
      for (let k = 1; k < 9; k++) {
        const ni = cell.i + CX[k];
        const nj = cell.j + CY[k];
        if (!this.inBounds(ni, nj)) continue;
        const nid = this.idx(ni, nj);
        if (emptySet.has(nid)) {
          emptySet.delete(nid);
          continue;
        }
        if (this.type[nid] !== CellType.GAS) continue;

        const avg = this.neighborFluidStats(ni, nj);
        this.type[nid] = CellType.INTERFACE;
        this.mass[nid] = 0;
        this.initEquilibrium(nid, avg.rho, avg.ux, avg.uy);
        this.mass[nid] = 0;
      }
    }

    // Convert filled cells to fluid.
    for (const cell of toFill) {
      this.type[cell.id] = CellType.FLUID;
      this.mass[cell.id] = this.rho[cell.id];
    }

    // Prepare neighborhood of emptied cells: fluid → interface.
    for (const cell of toEmpty) {
      if (!emptySet.has(cell.id)) continue;
      for (let k = 1; k < 9; k++) {
        const ni = cell.i + CX[k];
        const nj = cell.j + CY[k];
        if (!this.inBounds(ni, nj)) continue;
        const nid = this.idx(ni, nj);
        if (this.type[nid] !== CellType.FLUID) continue;
        this.type[nid] = CellType.INTERFACE;
        this.mass[nid] = this.rho[nid];
      }
    }

    // Convert emptied cells to gas.
    for (const cell of toEmpty) {
      if (!emptySet.has(cell.id)) continue;
      this.type[cell.id] = CellType.GAS;
      this.mass[cell.id] = 0;
      for (let k = 0; k < 9; k++) this.f[k * n + cell.id] = 0;
    }

    // Redistribute excess mass (Eq. 12–13).
    for (const cell of toFill) {
      this.distributeExcess(cell.i, cell.j, cell.excess, true);
    }
    for (const cell of toEmpty) {
      if (!emptySet.has(cell.id)) continue;
      // mex for emptied cells is m (negative); distribute mex itself.
      this.distributeExcess(cell.i, cell.j, cell.excess, false);
    }

    // Sync fluid mass to density; clear gas mass.
    for (let id = 0; id < n; id++) {
      const t = this.type[id];
      if (t === CellType.GAS) this.mass[id] = 0;
      else if (t === CellType.FLUID) this.mass[id] = this.rho[id];
    }

    this.cleanupArtifacts();
  }

  /**
   * Remove leftover interface fragments and tiny floating blobs (TechRep §4.4+).
   * Each doomed cell's mass is redistributed locally — never pooled into one sink,
   * which previously acted like a spurious mass source far from the artifact.
   */
  cleanupArtifacts() {
    const { nx, ny, n } = this;
    const minSize = DEFAULTS.minFluidComponent ?? 5;
    const doomed = [];

    // Orphan interface: no fluid neighbor → leftover spray / hangers.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const id = this.idx(i, j);
        if (this.type[id] !== CellType.INTERFACE) continue;
        if (!this.hasFluidNeighbor(i, j)) doomed.push(id);
      }
    }

    // Tiny connected components of fluid + interface.
    const label = new Int32Array(n);
    label.fill(-1);
    const sizes = [];
    const stack = [];
    let comp = 0;

    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const start = this.idx(i, j);
        if (!this.isFluidLike(start) || label[start] >= 0) continue;

        let size = 0;
        label[start] = comp;
        stack.length = 0;
        stack.push(start);
        while (stack.length) {
          const id = stack.pop();
          size++;
          const ci = id % nx;
          const cj = (id / nx) | 0;
          for (let k = 1; k < 9; k++) {
            const ni = ci + CX[k];
            const nj = cj + CY[k];
            if (!this.inBounds(ni, nj)) continue;
            const nid = this.idx(ni, nj);
            if (label[nid] >= 0 || !this.isFluidLike(nid)) continue;
            label[nid] = comp;
            stack.push(nid);
          }
        }
        sizes[comp] = size;
        comp++;
      }
    }

    for (let id = 0; id < n; id++) {
      const c = label[id];
      if (c < 0) continue;
      if (sizes[c] < minSize) doomed.push(id);
    }

    if (doomed.length === 0) return;

    const unique = new Set(doomed);
    const parcels = [];
    for (const id of unique) {
      const m = this.mass[id];
      if (Math.abs(m) > MASS_EPS) {
        parcels.push({ i: id % nx, j: (id / nx) | 0, m });
      }
      this.type[id] = CellType.GAS;
      this.mass[id] = 0;
      this.rho[id] = this.rhoGas;
      this.ux[id] = 0;
      this.uy[id] = 0;
      for (let k = 0; k < 9; k++) this.f[k * n + id] = 0;
    }

    for (const { i, j, m } of parcels) {
      this.depositMassNear(i, j, m);
    }

    // Fluid cells that now touch gas must become interface.
    this.finalizeInterfaceLayer();
  }

  /**
   * Deposit mass onto surviving fluid/interface cells near (i,j).
   * Prefers immediate neighbors; otherwise inverse-distance among the
   * closest cells in a local window (never a single global sink).
   */
  depositMassNear(i, j, amount) {
    if (Math.abs(amount) < MASS_EPS) return;

    const recipients = [];
    let wSum = 0;

    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) continue;
      const nid = this.idx(ni, nj);
      if (!this.isFluidLike(nid)) continue;
      recipients.push({ nid, w: 1 });
      wSum += 1;
    }

    if (wSum <= MASS_EPS) {
      const { nx, ny } = this;
      const R = 8;
      const top = []; // keep up to 4 nearest {nid,d}, sorted by d

      const consider = (nid, d) => {
        if (top.length < 4) {
          top.push({ nid, d });
          top.sort((a, b) => a.d - b.d);
          return;
        }
        if (d >= top[3].d) return;
        top[3] = { nid, d };
        top.sort((a, b) => a.d - b.d);
      };

      for (let nj = Math.max(0, j - R); nj <= Math.min(ny - 1, j + R); nj++) {
        for (let ni = Math.max(0, i - R); ni <= Math.min(nx - 1, i + R); ni++) {
          const nid = this.idx(ni, nj);
          if (!this.isFluidLike(nid)) continue;
          consider(nid, (ni - i) * (ni - i) + (nj - j) * (nj - j));
        }
      }

      // Far-away spray: return this cell's mass to its own nearest survivors
      // (never pool every artifact into one global sink).
      if (top.length === 0) {
        for (let nid = 0; nid < this.n; nid++) {
          if (!this.isFluidLike(nid)) continue;
          const ni = nid % nx;
          const nj = (nid / nx) | 0;
          consider(nid, (ni - i) * (ni - i) + (nj - j) * (nj - j));
        }
      }

      for (const { nid, d } of top) {
        const w = 1 / Math.max(d, 1);
        recipients.push({ nid, w });
        wSum += w;
      }
    }

    if (wSum <= MASS_EPS) return;

    for (const { nid, w } of recipients) {
      if (this.type[nid] === CellType.FLUID) {
        this.type[nid] = CellType.INTERFACE;
      }
      this.mass[nid] += amount * (w / wSum);
    }
  }

  distributeExcess(i, j, amount, isFill) {
    if (Math.abs(amount) < MASS_EPS) return;

    const { nx: nnx, ny: nny } = this.computeNormal(i, j);
    const weights = [];
    let wSum = 0;

    for (let k = 1; k < 9; k++) {
      const ni = i + CX[k];
      const nj = j + CY[k];
      if (!this.inBounds(ni, nj)) continue;
      const nid = this.idx(ni, nj);
      if (this.type[nid] !== CellType.INTERFACE) continue;

      const dot = nnx * CX[k] + nny * CY[k];
      const w = isFill ? (dot > 0 ? dot : 0) : (dot < 0 ? -dot : 0);
      if (w > 0) {
        weights.push({ nid, w });
        wSum += w;
      }
    }

    // Fallback: equal share among all interface neighbors.
    if (wSum <= MASS_EPS) {
      weights.length = 0;
      wSum = 0;
      for (let k = 1; k < 9; k++) {
        const ni = i + CX[k];
        const nj = j + CY[k];
        if (!this.inBounds(ni, nj)) continue;
        const nid = this.idx(ni, nj);
        if (this.type[nid] !== CellType.INTERFACE) continue;
        weights.push({ nid, w: 1 });
        wSum += 1;
      }
    }

    if (wSum > MASS_EPS) {
      for (const { nid, w } of weights) {
        this.mass[nid] += amount * (w / wSum);
      }
      return;
    }

    // Isolated emptied/filled cell: keep mass nearby instead of dropping it.
    this.depositMassNear(i, j, amount);
  }

  step() {
    this.streamAndMass();
    this.updateInterfaceMass();
    this.collide();
    this.reinitializeFlags();
    this.stepCount++;
  }

  totalMass() {
    let sum = 0;
    for (let id = 0; id < this.n; id++) {
      if (this.type[id] === CellType.FLUID || this.type[id] === CellType.INTERFACE) {
        sum += this.mass[id];
      }
    }
    return sum;
  }

  maxSpeed() {
    let max = 0;
    for (let id = 0; id < this.n; id++) {
      if (!this.isFluidLike(id)) continue;
      const s = Math.hypot(this.ux[id], this.uy[id]);
      if (Number.isFinite(s) && s > max) max = s;
    }
    return max;
  }
}
