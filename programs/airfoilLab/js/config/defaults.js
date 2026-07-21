(function (NS) {
  'use strict';

  NS.Defaults = {
    // Airfoil
    nacaType: '4',      // '4' | '5'
    nacaCode: '0012',
    alpha: 0.0,         // angle of attack [deg]

    // Physics
    gamma:   1.4,
    mach:    0.3,       // freestream Mach
    p0:      1.0,       // total pressure (non-dim)
    T0:      1.0,       // total temperature (non-dim)

    // Grid
    ni: 160,
    nj:  50,
    wakeLength:  0.5,
    farFieldX:   8.0,
    farFieldY:   6.0,
    wallStretch: 2.5,
    hypK: 5,
    hypLambda: 3,
    hypDnScale: 2.5,
    teCluster: 4.0,
    leCluster: 3.0,

    // View
    viewZoom: 1.2,

    // Solver
    cfl:      0.5,
    substeps: 3,
    paused:   false,
    fluxScheme:     'ausm',     // 'ausm' | 'roe'
    reconstruction: 'constant', // 'constant' | 'linear'
    limiter:        'minmod',   // 'minmod' | 'vanleer' | 'superbee'

    // Visualization
    vizField:    'mach',     // 'mach'|'pressure'|'density'|'velocity'|'u'|'v'
    vizMode:     'pcolor',   // 'pcolor'|'contour'|'both'
    colormap:    'jet',
    contourLevels: 15,
    autoRange:   true,
    vizMin:      0.0,
    vizMax:      1.0,
    showGrid:    false,
    smoothShading: false,
  };
})(window.AFL);
