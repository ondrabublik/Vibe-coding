/** Pořadí v rozbalovacím menu; první = výchozí (dam break). */
const CASE_ORDER = ['damBreak', 'droplet', 'columnCollapse', 'user'];

const CASES = {
  damBreak: {
    id: 'damBreak',
    name: 'Dam break',
    hint: 'Sloupec vody vlevo se uvolní proti pravé stěně nádrže. Klasický benchmark volné hladiny.',
    setup(solver) {
      const { nx, ny } = solver;
      buildTank(solver);

      const colW = Math.floor(nx * 0.25);
      const colH = Math.floor(ny * 0.55);
      const baseY = ny - 3;
      for (let j = baseY - colH; j < baseY; j++) {
        for (let i = 2; i < 2 + colW; i++) {
          solver.setFluid(i, j, 1);
        }
      }
    },
  },

  droplet: {
    id: 'droplet',
    name: 'Padající kapka',
    hint: 'Kapka vody padá pod gravitací na dno uzavřené nádrže.',
    setup(solver) {
      const { nx, ny } = solver;
      buildTank(solver);

      const cx = Math.floor(nx * 0.5);
      const cy = Math.floor(ny * 0.28);
      const r = Math.floor(Math.min(nx, ny) * 0.12);
      const r2 = r * r;
      for (let j = cy - r; j <= cy + r; j++) {
        for (let i = cx - r; i <= cx + r; i++) {
          const d2 = (i - cx) ** 2 + (j - cy) ** 2;
          if (d2 <= r2) solver.setFluid(i, j, 1);
        }
      }
    },
  },

  columnCollapse: {
    id: 'columnCollapse',
    name: 'Kolaps sloupce',
    hint: 'Vysoký úzký sloupec tekutiny se zhroutí na šikmém dně.',
    setup(solver) {
      const { nx, ny } = solver;
      buildSlopedTank(solver);

      const colW = Math.floor(nx * 0.12);
      const colH = Math.floor(ny * 0.65);
      const baseY = ny - 3;
      for (let j = baseY - colH; j < baseY; j++) {
        for (let i = 3; i < 3 + colW; i++) {
          solver.setFluid(i, j, 1);
        }
      }
    },
  },

  user: {
    id: 'user',
    name: 'Vlastní úloha',
    hint: 'Nakreslete překážky a počáteční tekutinu, poté spusťte simulaci.',
    setup(solver) {
      buildTank(solver);
    },
  },
};

function buildTank(solver) {
  const { nx, ny } = solver;
  solver.resetFields();

  for (let i = 0; i < nx; i++) {
    solver.setSolid(i, 0, 1);
    solver.setSolid(i, ny - 1, 1);
  }
  for (let j = 0; j < ny; j++) {
    solver.setSolid(0, j, 1);
    solver.setSolid(nx - 1, j, 1);
  }
}

function buildSlopedTank(solver) {
  const { nx, ny } = solver;
  solver.resetFields();

  for (let i = 0; i < nx; i++) solver.setSolid(i, 0, 1);
  for (let j = 0; j < ny; j++) {
    solver.setSolid(0, j, 1);
    solver.setSolid(nx - 1, j, 1);
  }

  const slopeStart = Math.floor(nx * 0.35);
  for (let i = 0; i < nx; i++) {
    if (i < slopeStart) {
      solver.setSolid(i, ny - 1, 1);
    } else {
      const h = Math.floor(((i - slopeStart) / (nx - slopeStart)) * (ny * 0.35));
      for (let j = ny - 1 - h; j < ny; j++) {
        solver.setSolid(i, j, 1);
      }
    }
  }
}

function applyCase(solver, caseId, userState = null) {
  const def = CASES[caseId] ?? CASES.damBreak;
  def.setup(solver);

  if (caseId === 'user' && userState) {
    applyUserState(solver, userState);
  }

  solver.finalizeInterfaceLayer();

  for (let j = 0; j < solver.ny; j++) {
    for (let i = 0; i < solver.nx; i++) {
      const id = solver.idx(i, j);
      if (solver.type[id] === CellType.FLUID || solver.type[id] === CellType.INTERFACE) {
        solver.initEquilibrium(id, solver.rhoGas, 0, 0);
        if (solver.type[id] === CellType.INTERFACE) {
          solver.mass[id] = solver.rhoGas;
        }
      }
    }
  }
}

function applyUserState(solver, userState) {
  const { solids, fluids } = userState;
  if (solids) {
    for (const key of solids) {
      const [i, j] = key.split(',').map(Number);
      solver.setSolid(i, j, 1);
    }
  }
  if (fluids) {
    for (const key of fluids) {
      const [i, j] = key.split(',').map(Number);
      if (!solver.solidMask[solver.idx(i, j)]) {
        solver.setFluid(i, j, 1);
      }
    }
  }
}

function captureUserState(solver) {
  const solids = new Set();
  const fluids = new Set();
  for (let j = 0; j < solver.ny; j++) {
    for (let i = 0; i < solver.nx; i++) {
      const id = solver.idx(i, j);
      const key = `${i},${j}`;
      if (solver.solidMask[id]) solids.add(key);
      else if (solver.mass[id] > 0) fluids.add(key);
    }
  }
  return { solids, fluids };
}
