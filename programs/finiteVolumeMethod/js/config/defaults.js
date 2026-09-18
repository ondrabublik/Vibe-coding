(function (NS) {
  'use strict';

  NS.Defaults = {
    // Grid (3-segment channel: ni ≈ 60/segment is a good starting point)
    ni: 180,
    nj: 60,

    // Physics
    gamma: 1.4,

    // Inlet conditions
    inletMach: 0.5,
    inletP0: 1.0,
    inletT0: 1.0,
    inletMode: 'subsonic',   // 'subsonic' | 'supersonic'

    // Outlet conditions
    outletMode: 'subsonic',  // 'subsonic' | 'supersonic'
    outletPback: 0.843,       // back pressure (subsonic)

    // Domain — 3-segment channel: flat [0,1] | arc [1,2] | flat [2,3]
    xMin: 0.0,
    xMax: 3.0,
    yMin: 0.0,
    yMax: 1.0,

    // Viewport geometry — control points on middle segment [1, 2]
    botControlPoints: 5,
    topControlPoints: 3,

    // Solver
    fluxScheme: 'roe',       // 'roe' | 'vanLeer' | 'ausm'
    rkOrder: 3,              // 1 | 2 | 3 | 4
    cfl: 0.8,
    substeps: 5,
    paused: false,

    // Visualization
    vizField: 'mach',        // 'mach' | 'pressure' | 'density' | 'velocity' | 'u' | 'v'
    vizMode: 'pcolor',       // 'pcolor' | 'contour' | 'both'
    colormap: 'jet',         // 'jet' | 'turbo' | 'viridis' | 'coolwarm' | 'grayscale'
    contourLevels: 15,
    autoRange: true,
    vizMin: 0.0,
    vizMax: 1.0,
    showGrid: false,
    showWallNormals: false,
    smoothShading: false,    // bilinear interpolation between cell values (like shading interp)
  };
})(window.FVM);
