(function (NS) {
  'use strict';

  const { createParticle, TYPE } = NS.Particles;

  function addBoundaryLayer(particles, x0, y0, nx, ny, spacing, params, mass) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        particles.push(
          createParticle({
            x: [x0 + ix * spacing, y0 + iy * spacing],
            v: [0, 0],
            mass,
            rho0: params.rho0,
            h: params.h,
            type: TYPE.BOUNDARY,
          })
        );
      }
    }
  }

  function createRingScene(params) {
    const particles = [];
    const spacing = params.spacing;
    const mass = NS.Mass.particleMass(params.rho0, params.h, spacing);
    const cx = params.ringCenter[0];
    const cy = params.ringCenter[1];
    const rIn = params.innerRadius;
    const rOut = params.outerRadius;

    for (let y = cy - rOut; y <= cy + rOut; y += spacing) {
      for (let x = cx - rOut; x <= cx + rOut; x += spacing) {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.hypot(dx, dy);
        if (r >= rIn && r <= rOut) {
          particles.push(
            createParticle({
              x: [x, y],
              v: [0, 0],
              mass,
              rho0: params.rho0,
              h: params.h,
              type: TYPE.SOLID,
            })
          );
        }
      }
    }

    const floorY = params.floorY;
    const floorHalf = params.floorWidth * 0.5;
    const floorCenterX = cx;
    const nx = Math.ceil(params.floorWidth / spacing) + 1;
    const ny = params.floorLayers;

    addBoundaryLayer(
      particles,
      floorCenterX - floorHalf,
      floorY,
      nx,
      ny,
      spacing,
      params,
      mass
    );

    const wallNy = Math.ceil((params.ringCenter[1] + rOut - floorY) / spacing) + 2;
    addBoundaryLayer(particles, floorCenterX - floorHalf - spacing, floorY, 2, wallNy, spacing, params, mass);
    addBoundaryLayer(
      particles,
      floorCenterX + floorHalf - spacing,
      floorY,
      2,
      wallNy,
      spacing,
      params,
      mass
    );

    normalizeSolidMass(particles, params);
    return particles;
  }

  function normalizeSolidMass(particles, params) {
    const solver = new NS.SolidSolver(params);
    solver.hash.build(particles);
    solver.computeDensity(particles);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.type === TYPE.SOLID && p.rho > 1e-6) {
        p.mass *= p.rho0 / p.rho;
      }
    }
  }

  NS.Scenes = NS.Scenes || {};
  NS.Scenes.createRingScene = createRingScene;
})(window.SPH);
