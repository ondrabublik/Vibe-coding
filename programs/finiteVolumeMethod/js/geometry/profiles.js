(function (NS) {
  'use strict';

  const Profiles = NS.Profiles = {};
  const Nurbs = NS.Nurbs;

  Profiles.MID_START = 1.0;
  Profiles.MID_END   = 2.0;
  Profiles.GAMM_BUMP_HEIGHT = 0.1;

  const MID_START = Profiles.MID_START;
  const MID_END   = Profiles.MID_END;
  const GAMM_H    = Profiles.GAMM_BUMP_HEIGHT;

  function gammArcParams(gStart, gEnd, h) {
    const xc   = 0.5 * (gStart + gEnd);
    const half = 0.5 * (gEnd - gStart);
    const R    = (half * half + h * h) / (2.0 * h);
    return { gStart, gEnd, h, R, xc };
  }

  function evalGammArc(arc, x) {
    if (x < arc.gStart || x > arc.gEnd) return 0;
    const d = x - arc.xc;
    return Math.sqrt(Math.max(0, arc.R * arc.R - d * d)) - (arc.R - arc.h);
  }

  Profiles.evaluateWall = function (wallCurve, x) {
    if (wallCurve.gammArc) return evalGammArc(wallCurve.gammArc, x);
    return Nurbs.yAtX(wallCurve, x);
  };

  Profiles.makeWall = function (nPoints, yAtX, extra) {
    nPoints = Math.max(2, nPoints | 0);
    const points = [];
    for (let k = 0; k < nPoints; k++) {
      const x = MID_START + k * (MID_END - MID_START) / (nPoints - 1);
      points.push({ x, y: yAtX(x) });
    }
    const y0 = yAtX(MID_START);
    const y1 = yAtX(MID_END);
    points[0].x = MID_START;
    points[0].y = y0;
    points[nPoints - 1].x = MID_END;
    points[nPoints - 1].y = y1;
    return Object.assign({
      points,
      weights: points.map(() => 1),
      startTan: { x: MID_START + 0.1, y: y0 },
      endTan: { x: MID_END - 0.1, y: y1 },
      degree: Math.min(3, nPoints - 1),
    }, extra);
  };

  Profiles.resampleWall = function (wallCurve, nPoints, flatY) {
    const yAtX = (x) => {
      if (x < MID_START || x > MID_END) return flatY;
      return Profiles.evaluateWall(wallCurve, x);
    };
    const extra = wallCurve.gammArc ? { gammArc: wallCurve.gammArc } : null;
    return Profiles.makeWall(nPoints, yAtX, extra);
  };

  function wallY(wallCurve, x, flatY) {
    if (x < MID_START || x > MID_END) return flatY;
    return Profiles.evaluateWall(wallCurve, x);
  }

  function buildWallLUT(yFn, xMin, xMax, nSamples) {
    const arr = new Float64Array(nSamples);
    const dx = (xMax - xMin) / (nSamples - 1);
    const invDx = 1 / dx;
    for (let k = 0; k < nSamples; k++) {
      arr[k] = yFn(xMin + k * dx);
    }
    return { arr, xMin, xMax, invDx, n: nSamples };
  }

  function makeLUTLookup(lut) {
    const { arr, xMin, xMax, invDx, n } = lut;
    return function lookup(x) {
      if (x <= xMin) return arr[0];
      if (x >= xMax) return arr[n - 1];
      const t = (x - xMin) * invDx;
      const i = t | 0;
      const a = t - i;
      const i1 = i + 1 < n ? i + 1 : n - 1;
      return arr[i] + a * (arr[i1] - arr[i]);
    };
  }

  Profiles.gammBotWall = function (nPoints) {
    const arc = gammArcParams(MID_START, MID_END, GAMM_H);
    return Profiles.makeWall(nPoints || 5, (x) => evalGammArc(arc, x), { gammArc: arc });
  };

  Profiles.defaultWalls = function (nBot, nTop) {
    return {
      botWall: Profiles.gammBotWall(nBot),
      topWall: Profiles.makeWall(nTop || 3, () => 1.0),
    };
  };

  Profiles.flatWalls = function (nBot, nTop) {
    return {
      botWall: Profiles.makeWall(nBot || 3, () => 0.0),
      topWall: Profiles.makeWall(nTop || 3, () => 1.0),
    };
  };

  Profiles.fromMidSegment = function (botWall, topWall, params, flatBot, flatTop) {
    flatBot = flatBot ?? 0.0;
    flatTop = flatTop ?? 1.0;
    const xMin = params?.xMin ?? 0.0;
    const xMax = params?.xMax ?? 3.0;
    const nLUT = Math.max(1024, (params?.ni ?? 180) * 4);

    const ybotFn = (x) => wallY(botWall, x, flatBot);
    const ytopFn = (x) => wallY(topWall, x, flatTop);
    const botLUT = buildWallLUT(ybotFn, xMin, xMax, nLUT);
    const topLUT = buildWallLUT(ytopFn, xMin, xMax, nLUT);

    let yMin = flatBot;
    let yMax = flatTop;
    for (let k = 0; k < nLUT; k++) {
      if (botLUT.arr[k] < yMin) yMin = botLUT.arr[k];
      if (topLUT.arr[k] > yMax) yMax = topLUT.arr[k];
    }

    return {
      ybot: makeLUTLookup(botLUT),
      ytop: makeLUTLookup(topLUT),
      yMin,
      yMax,
    };
  };

  Profiles.build = function (params, geoState) {
    if (geoState && geoState.botWall && geoState.topWall) {
      return Profiles.fromMidSegment(geoState.botWall, geoState.topWall, params);
    }
    return Profiles.fromMidSegment(
      Profiles.gammBotWall(params?.botControlPoints),
      Profiles.makeWall(params?.topControlPoints || 3, () => 1.0),
      params,
    );
  };
})(window.FVM);
