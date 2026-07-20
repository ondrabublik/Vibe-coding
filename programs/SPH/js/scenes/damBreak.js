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

  function createDamBreakScene(params) {
    const particles = [];
    const spacing = params.spacing;
    const mass = NS.Mass.particleMass(params.rho0, params.h, spacing);
    const ox = params.tankOrigin[0];
    const oy = params.tankOrigin[1];
    const tw = params.tankWidth;
    const th = params.tankHeight;
    const layers = params.boundaryLayers;

    const nxBottom = Math.ceil(tw / spacing) + 1;
    addBoundaryLayer(particles, ox, oy, nxBottom, layers, spacing, params, mass);

    const nxLeft = layers;
    const nyLeft = Math.ceil(th / spacing) + 1;
    addBoundaryLayer(particles, ox - (layers - 1) * spacing, oy, nxLeft, nyLeft, spacing, params, mass);

    const nxRight = layers;
    addBoundaryLayer(
      particles,
      ox + tw - spacing,
      oy,
      nxRight,
      nyLeft,
      spacing,
      params,
      mass
    );

    const cx = params.columnX;
    const cy = params.columnY;
    const cw = params.columnWidth;
    const ch = params.columnHeight;

    for (let y = cy; y <= cy + ch; y += spacing) {
      for (let x = cx; x <= cx + cw; x += spacing) {
        if (x >= ox + spacing && x <= ox + tw - spacing && y >= oy + spacing && y <= oy + th - spacing) {
          particles.push(
            createParticle({
              x: [x, y],
              v: [0, 0],
              mass,
              rho0: params.rho0,
              h: params.h,
              type: TYPE.FLUID,
            })
          );
        }
      }
    }

    return particles;
  }

  NS.Scenes = NS.Scenes || {};
  NS.Scenes.createDamBreakScene = createDamBreakScene;
})(window.SPH);
