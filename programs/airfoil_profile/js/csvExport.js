(function (global) {
  "use strict";

  function num(n) {
    return Number(n).toFixed(6);
  }

  function buildCsv({ closedCurve, code, scaleMm, angleDeg }) {
    const lines = [];
    lines.push(
      "# NACA " +
        code +
        " | chord " +
        scaleMm +
        " mm | uhel " +
        angleDeg +
        " deg | uzavrena krivka (posledni bod = prvni)"
    );
    lines.push("X [mm];Y [mm]");
    for (let i = 0; i < closedCurve.length; i++) {
      lines.push(num(closedCurve[i].x) + ";" + num(closedCurve[i].y));
    }
    lines.push(num(closedCurve[0].x) + ";" + num(closedCurve[0].y));
    return lines.join("\r\n") + "\r\n";
  }

  function downloadCsv(content, filename) {
    const blob = new Blob(["\ufeff" + content], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvFilename(code, scaleMm) {
    const scale = Math.round(scaleMm);
    return "naca_" + code + "_" + scale + "mm.csv";
  }

  global.CsvExport = { buildCsv, downloadCsv, csvFilename };
})(typeof window !== "undefined" ? window : globalThis);
