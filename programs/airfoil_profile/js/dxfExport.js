(function (global) {
  "use strict";

  function fmt(n) {
    return Number(n).toFixed(6);
  }

  function lwPolylineClosed(layer, points) {
    const lines = [
      "0",
      "LWPOLYLINE",
      "8",
      layer,
      "90",
      String(points.length),
      "70",
      "1",
    ];
    for (let i = 0; i < points.length; i++) {
      lines.push("10", fmt(points[i].x), "20", fmt(points[i].y));
    }
    return lines.join("\n");
  }

  function buildDxf({ closedCurve }) {
    const parts = [
      "0",
      "SECTION",
      "2",
      "HEADER",
      "9",
      "$ACADVER",
      "1",
      "AC1009",
      "9",
      "$INSUNITS",
      "70",
      "4",
      "0",
      "ENDSEC",
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      lwPolylineClosed("PROFILE", closedCurve),
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ];
    return parts.join("\n") + "\n";
  }

  function downloadDxf(content, filename) {
    const blob = new Blob([content], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function dxfFilename(code, scaleMm) {
    const scale = Math.round(scaleMm);
    return "naca_" + code + "_" + scale + "mm.dxf";
  }

  global.DxfExport = { buildDxf, downloadDxf, dxfFilename };
})(typeof window !== "undefined" ? window : globalThis);
