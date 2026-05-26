(function (global) {
  "use strict";

  function fmt(n) {
    if (n === 0 || Object.is(n, -0)) return "0.";
    let s = Number(n).toPrecision(12);
    if (s.indexOf("E") >= 0 || s.indexOf("e") >= 0) {
      return s.replace(/e/i, "E");
    }
    if (s.indexOf(".") < 0) s += ".";
    return s;
  }

  function StepBuilder() {
    this.lines = [];
    this.counter = 0;
  }

  StepBuilder.prototype.add = function (def) {
    this.counter += 1;
    const id = "#" + this.counter;
    this.lines.push(id + " = " + def + ";");
    return id;
  };

  StepBuilder.prototype.point = function (x, y, z) {
    return this.add(
      "CARTESIAN_POINT('',(" + fmt(x) + "," + fmt(y) + "," + fmt(z) + "))"
    );
  };

  StepBuilder.prototype.direction = function (x, y, z) {
    return this.add(
      "DIRECTION('',(" + fmt(x) + "," + fmt(y) + "," + fmt(z) + "))"
    );
  };

  StepBuilder.prototype.vector = function (dirId, length) {
    return this.add("VECTOR(''," + dirId + "," + fmt(length) + ")");
  };

  StepBuilder.prototype.vertex = function (pointId) {
    return this.add("VERTEX_POINT(''," + pointId + ")");
  };

  StepBuilder.prototype.line = function (pointId, dirId) {
    const vec = this.vector(dirId, 1);
    return this.add("LINE(''," + pointId + "," + vec + ")");
  };

  StepBuilder.prototype.edgeCurve = function (v1, v2, curveId) {
    return this.add(
      "EDGE_CURVE(''," + v1 + "," + v2 + "," + curveId + ",.T.)"
    );
  };

  StepBuilder.prototype.orientedEdge = function (edgeId, sameSense) {
    return this.add(
      "ORIENTED_EDGE('',*,*," + edgeId + "," + (sameSense ? ".T." : ".F.") + ")"
    );
  };

  StepBuilder.prototype.edgeLoop = function (orientedEdges) {
    return this.add("EDGE_LOOP('',(" + orientedEdges.join(",") + "))");
  };

  StepBuilder.prototype.faceOuterBound = function (loopId) {
    return this.add("FACE_OUTER_BOUND(''," + loopId + ",.T.)");
  };

  StepBuilder.prototype.faceBound = function (loopId) {
    return this.add("FACE_BOUND(''," + loopId + ",.T.)");
  };

  StepBuilder.prototype.axisPlacement = function (originId, axisDirId, refDirId) {
    return this.add(
      "AXIS2_PLACEMENT_3D(''," + originId + "," + axisDirId + "," + refDirId + ")"
    );
  };

  StepBuilder.prototype.plane = function (axisId) {
    return this.add("PLANE(''," + axisId + ")");
  };

  StepBuilder.prototype.advancedFace = function (boundIds, surfaceId) {
    return this.add(
      "ADVANCED_FACE('',(" + boundIds.join(",") + ")," + surfaceId + ",.T.)"
    );
  };

  StepBuilder.prototype.closedShell = function (faceIds) {
    return this.add("CLOSED_SHELL('',(" + faceIds.join(",") + "))");
  };

  StepBuilder.prototype.manifoldSolidBrep = function (name, shellId) {
    return this.add("MANIFOLD_SOLID_BREP('" + name + "'," + shellId + ")");
  };

  function ensureCcw(points) {
    let a = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      a += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return a < 0 ? points.slice().reverse() : points.slice();
  }

  function buildRing(sb, pts, z) {
    const points = [];
    const vertices = [];
    for (let i = 0; i < pts.length; i++) {
      const pid = sb.point(pts[i].x, pts[i].y, z);
      points.push({ id: pid, x: pts[i].x, y: pts[i].y, z });
      vertices.push(sb.vertex(pid));
    }
    return { points, vertices };
  }

  function buildLoopEdges(sb, ring) {
    const n = ring.points.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = ring.points[i];
      const b = ring.points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 1e-12) {
        edges.push(null);
        continue;
      }
      const dir = sb.direction(dx / len, dy / len, dz / len);
      const line = sb.line(a.id, dir);
      edges.push(sb.edgeCurve(ring.vertices[i], ring.vertices[j], line));
    }
    return edges;
  }

  function buildVerticalEdges(sb, bottomRing, topRing) {
    const n = bottomRing.points.length;
    const upDir = sb.direction(0, 0, 1);
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = bottomRing.points[i];
      const line = sb.line(a.id, upDir);
      edges.push(
        sb.edgeCurve(bottomRing.vertices[i], topRing.vertices[i], line)
      );
    }
    return edges;
  }

  function buildStep(opts) {
    const outerInput = opts.outerCurve;
    const innerInput = opts.innerCurve;
    const L = opts.length;
    const code = opts.code || "NACA";
    const name = "NACA_" + code;

    const outerCurve = ensureCcw(outerInput);
    const innerCurve = ensureCcw(innerInput);

    const sb = new StepBuilder();

    const appCtx = sb.add("APPLICATION_CONTEXT('automotive design')");
    sb.add(
      "APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000," +
        appCtx +
        ")"
    );

    const lenUnit = sb.add(
      "( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )"
    );
    const angleUnit = sb.add(
      "( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )"
    );
    const solidAngleUnit = sb.add(
      "( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )"
    );
    const uncertainty = sb.add(
      "UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001)," +
        lenUnit +
        ",'distance_accuracy_value','')"
    );
    const geomCtx = sb.add(
      "( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((" +
        uncertainty +
        ")) GLOBAL_UNIT_ASSIGNED_CONTEXT((" +
        lenUnit +
        "," +
        angleUnit +
        "," +
        solidAngleUnit +
        ")) REPRESENTATION_CONTEXT('','3D') )"
    );

    const prodCtx = sb.add(
      "PRODUCT_CONTEXT(''," + appCtx + ",'mechanical')"
    );
    const prodDefCtx = sb.add(
      "PRODUCT_DEFINITION_CONTEXT('part definition'," + appCtx + ",'design')"
    );
    const product = sb.add(
      "PRODUCT('" + name + "','" + name + "','',(" + prodCtx + "))"
    );
    sb.add(
      "PRODUCT_RELATED_PRODUCT_CATEGORY('part','',(" + product + "))"
    );
    const pdf = sb.add(
      "PRODUCT_DEFINITION_FORMATION('','UNKNOWN'," + product + ")"
    );
    const pd = sb.add(
      "PRODUCT_DEFINITION('design',''," + pdf + "," + prodDefCtx + ")"
    );
    const pds = sb.add("PRODUCT_DEFINITION_SHAPE('',''," + pd + ")");

    const outerBot = buildRing(sb, outerCurve, 0);
    const outerTop = buildRing(sb, outerCurve, L);
    const innerBot = buildRing(sb, innerCurve, 0);
    const innerTop = buildRing(sb, innerCurve, L);

    const outerBotEdges = buildLoopEdges(sb, outerBot);
    const outerTopEdges = buildLoopEdges(sb, outerTop);
    const innerBotEdges = buildLoopEdges(sb, innerBot);
    const innerTopEdges = buildLoopEdges(sb, innerTop);

    const outerVertEdges = buildVerticalEdges(sb, outerBot, outerTop);
    const innerVertEdges = buildVerticalEdges(sb, innerBot, innerTop);

    const allFaces = [];

    const Nout = outerCurve.length;
    for (let i = 0; i < Nout; i++) {
      if (!outerBotEdges[i] || !outerTopEdges[i]) continue;
      const j = (i + 1) % Nout;
      const a = outerBot.points[i];
      const b = outerBot.points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const elen = Math.hypot(dx, dy);
      if (elen < 1e-12) continue;
      const tx = dx / elen;
      const ty = dy / elen;
      const normalDir = sb.direction(ty, -tx, 0);
      const refDir = sb.direction(tx, ty, 0);
      const axis = sb.axisPlacement(a.id, normalDir, refDir);
      const plane = sb.plane(axis);

      const oe1 = sb.orientedEdge(outerBotEdges[i], true);
      const oe2 = sb.orientedEdge(outerVertEdges[j], true);
      const oe3 = sb.orientedEdge(outerTopEdges[i], false);
      const oe4 = sb.orientedEdge(outerVertEdges[i], false);
      const loop = sb.edgeLoop([oe1, oe2, oe3, oe4]);
      const bound = sb.faceOuterBound(loop);
      allFaces.push(sb.advancedFace([bound], plane));
    }

    const Nin = innerCurve.length;
    for (let i = 0; i < Nin; i++) {
      if (!innerBotEdges[i] || !innerTopEdges[i]) continue;
      const j = (i + 1) % Nin;
      const a = innerBot.points[i];
      const b = innerBot.points[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const elen = Math.hypot(dx, dy);
      if (elen < 1e-12) continue;
      const tx = dx / elen;
      const ty = dy / elen;
      const normalDir = sb.direction(-ty, tx, 0);
      const refDir = sb.direction(-tx, -ty, 0);
      const axis = sb.axisPlacement(b.id, normalDir, refDir);
      const plane = sb.plane(axis);

      const oe1 = sb.orientedEdge(innerBotEdges[i], false);
      const oe2 = sb.orientedEdge(innerVertEdges[i], true);
      const oe3 = sb.orientedEdge(innerTopEdges[i], true);
      const oe4 = sb.orientedEdge(innerVertEdges[j], false);
      const loop = sb.edgeLoop([oe1, oe2, oe3, oe4]);
      const bound = sb.faceOuterBound(loop);
      allFaces.push(sb.advancedFace([bound], plane));
    }

    const bottomOuterOe = [];
    for (let i = outerBotEdges.length - 1; i >= 0; i--) {
      if (outerBotEdges[i])
        bottomOuterOe.push(sb.orientedEdge(outerBotEdges[i], false));
    }
    const bottomOuterLoop = sb.edgeLoop(bottomOuterOe);
    const bottomOuterBound = sb.faceOuterBound(bottomOuterLoop);

    const bottomInnerOe = [];
    for (let i = 0; i < innerBotEdges.length; i++) {
      if (innerBotEdges[i])
        bottomInnerOe.push(sb.orientedEdge(innerBotEdges[i], true));
    }
    const bottomInnerLoop = sb.edgeLoop(bottomInnerOe);
    const bottomInnerBound = sb.faceBound(bottomInnerLoop);

    const bottomOrigin = sb.point(0, 0, 0);
    const bottomNormal = sb.direction(0, 0, -1);
    const bottomRefDir = sb.direction(1, 0, 0);
    const bottomAxis = sb.axisPlacement(bottomOrigin, bottomNormal, bottomRefDir);
    const bottomPlane = sb.plane(bottomAxis);
    allFaces.push(
      sb.advancedFace([bottomOuterBound, bottomInnerBound], bottomPlane)
    );

    const topOuterOe = [];
    for (let i = 0; i < outerTopEdges.length; i++) {
      if (outerTopEdges[i])
        topOuterOe.push(sb.orientedEdge(outerTopEdges[i], true));
    }
    const topOuterLoop = sb.edgeLoop(topOuterOe);
    const topOuterBound = sb.faceOuterBound(topOuterLoop);

    const topInnerOe = [];
    for (let i = innerTopEdges.length - 1; i >= 0; i--) {
      if (innerTopEdges[i])
        topInnerOe.push(sb.orientedEdge(innerTopEdges[i], false));
    }
    const topInnerLoop = sb.edgeLoop(topInnerOe);
    const topInnerBound = sb.faceBound(topInnerLoop);

    const topOrigin = sb.point(0, 0, L);
    const topNormal = sb.direction(0, 0, 1);
    const topRefDir = sb.direction(1, 0, 0);
    const topAxis = sb.axisPlacement(topOrigin, topNormal, topRefDir);
    const topPlane = sb.plane(topAxis);
    allFaces.push(sb.advancedFace([topOuterBound, topInnerBound], topPlane));

    const shell = sb.closedShell(allFaces);
    const solid = sb.manifoldSolidBrep(name, shell);

    const shapeRep = sb.add(
      "ADVANCED_BREP_SHAPE_REPRESENTATION('',(" + solid + ")," + geomCtx + ")"
    );
    sb.add("SHAPE_DEFINITION_REPRESENTATION(" + pds + "," + shapeRep + ")");

    const ts = new Date().toISOString().replace(/\.\d+Z$/, "");
    const header =
      "ISO-10303-21;\n" +
      "HEADER;\n" +
      "FILE_DESCRIPTION(('NACA " +
      code +
      " extruded profile, hollow'),'2;1');\n" +
      "FILE_NAME('" +
      name +
      ".step','" +
      ts +
      "',('NACA app'),(''),'JS','','');\n" +
      "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\n" +
      "ENDSEC;\n";

    return (
      header +
      "DATA;\n" +
      sb.lines.join("\n") +
      "\nENDSEC;\n" +
      "END-ISO-10303-21;\n"
    );
  }

  function downloadStep(content, filename) {
    const blob = new Blob([content], { type: "application/step" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function stepFilename(code, scaleMm, lengthMm) {
    const scale = Math.round(scaleMm);
    const L = Math.round(lengthMm);
    return "naca_" + code + "_" + scale + "mm_L" + L + "mm.step";
  }

  global.StepExport = { buildStep, downloadStep, stepFilename };
})(typeof window !== "undefined" ? window : globalThis);
