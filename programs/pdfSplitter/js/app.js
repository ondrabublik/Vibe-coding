const { PDFDocument } = PDFLib;

const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const infoSection = document.getElementById("info-section");
const infoGrid = document.getElementById("info-grid");
const splitSection = document.getElementById("split-section");
const rangesContainer = document.getElementById("ranges");
const rangeTemplate = document.getElementById("range-template");
const addRangeBtn = document.getElementById("add-range-btn");
const splitBtn = document.getElementById("split-btn");
const statusEl = document.getElementById("status");

let currentFile = null;
let pdfDoc = null;
let pageCount = 0;

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status${type ? ` ${type}` : ""}`;
}

function showFileInfo(file, pages, metadata) {
  const baseName = file.name.replace(/\.pdf$/i, "");

  const rows = [
    ["Název souboru", file.name],
    ["Velikost", formatBytes(file.size)],
    ["Typ", file.type || "application/pdf"],
    ["Počet stran", String(pages)],
    ["Poslední úprava", new Date(file.lastModified).toLocaleString("cs-CZ")],
  ];

  if (metadata.title) rows.push(["Titul", metadata.title]);
  if (metadata.author) rows.push(["Autor", metadata.author]);
  if (metadata.subject) rows.push(["Předmět", metadata.subject]);
  if (metadata.creator) rows.push(["Vytvořil", metadata.creator]);

  infoGrid.innerHTML = rows
    .map(([label, value]) => `<dt>${label}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");

  infoSection.classList.remove("hidden");
  splitSection.classList.remove("hidden");

  rangesContainer.innerHTML = "";
  addRangeRow(1, pages, `${baseName}_strany-1-${pages}`);
  setStatus("");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function addRangeRow(from = 1, to = 1, name = "") {
  const clone = rangeTemplate.content.cloneNode(true);
  const row = clone.querySelector(".range-row");
  const fromInput = row.querySelector(".range-from");
  const toInput = row.querySelector(".range-to");
  const nameInput = row.querySelector(".range-name");

  fromInput.max = pageCount;
  toInput.max = pageCount;
  fromInput.value = from;
  toInput.value = to;
  nameInput.value = name;

  fromInput.addEventListener("input", () => validateRangeRow(row));
  toInput.addEventListener("input", () => validateRangeRow(row));

  row.querySelector(".btn-remove").addEventListener("click", () => {
    if (rangesContainer.children.length > 1) {
      row.remove();
    }
  });

  rangesContainer.appendChild(row);
}

function validateRangeRow(row) {
  const from = parseInt(row.querySelector(".range-from").value, 10);
  const to = parseInt(row.querySelector(".range-to").value, 10);
  const fromInput = row.querySelector(".range-from");
  const toInput = row.querySelector(".range-to");

  const invalid =
    Number.isNaN(from) ||
    Number.isNaN(to) ||
    from < 1 ||
    to > pageCount ||
    from > to;

  fromInput.classList.toggle("invalid", invalid || from < 1 || from > pageCount);
  toInput.classList.toggle("invalid", invalid || to < 1 || to > pageCount);

  return !invalid;
}

function getRanges() {
  const rows = [...rangesContainer.querySelectorAll(".range-row")];
  const ranges = [];

  for (const row of rows) {
    if (!validateRangeRow(row)) {
      throw new Error("Zkontrolujte rozsahy stran – musí být v intervalu 1 až " + pageCount + " a „od“ ≤ „do“.");
    }

    const from = parseInt(row.querySelector(".range-from").value, 10);
    const to = parseInt(row.querySelector(".range-to").value, 10);
    const customName = row.querySelector(".range-name").value.trim();

    ranges.push({ from, to, name: customName });
  }

  return ranges;
}

function defaultOutputName(from, to) {
  const base = currentFile.name.replace(/\.pdf$/i, "");
  return `${base}_strany-${from}-${to}.pdf`;
}

async function loadPdf(file) {
  const buffer = await file.arrayBuffer();
  pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  pageCount = pdfDoc.getPageCount();

  const metadata = {
    title: pdfDoc.getTitle() || null,
    author: pdfDoc.getAuthor() || null,
    subject: pdfDoc.getSubject() || null,
    creator: pdfDoc.getCreator() || null,
  };

  currentFile = file;
  showFileInfo(file, pageCount, metadata);
}

async function handleFile(file) {
  if (!file || file.type !== "application/pdf") {
    setStatus("Vyberte platný PDF soubor.", "error");
    return;
  }

  try {
    setStatus("Načítám PDF…");
    await loadPdf(file);
    setStatus("");
  } catch (err) {
    console.error(err);
    setStatus("Soubor se nepodařilo načíst. Je poškozený nebo chráněný heslem?", "error");
    resetState();
  }
}

function resetState() {
  currentFile = null;
  pdfDoc = null;
  pageCount = 0;
  infoSection.classList.add("hidden");
  splitSection.classList.add("hidden");
  rangesContainer.innerHTML = "";
}

async function splitPdf() {
  if (!pdfDoc || !currentFile) return;

  let ranges;
  try {
    ranges = getRanges();
  } catch (err) {
    setStatus(err.message, "error");
    return;
  }

  splitBtn.disabled = true;
  setStatus("Rozděluji PDF…");

  try {
    for (const { from, to, name } of ranges) {
      const newPdf = await PDFDocument.create();
      const pageIndices = [];
      for (let i = from - 1; i <= to - 1; i++) {
        pageIndices.push(i);
      }

      const copiedPages = await newPdf.copyPages(pdfDoc, pageIndices);
      copiedPages.forEach((page) => newPdf.addPage(page));

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const fileName = name ? (name.endsWith(".pdf") ? name : `${name}.pdf`) : defaultOutputName(from, to);

      downloadBlob(blob, fileName);
    }

    setStatus(`Hotovo – staženo ${ranges.length} ${ranges.length === 1 ? "soubor" : ranges.length < 5 ? "soubory" : "souborů"}.`, "success");
  } catch (err) {
    console.error(err);
    setStatus("Při rozdělování došlo k chybě.", "error");
  } finally {
    splitBtn.disabled = false;
  }
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

addRangeBtn.addEventListener("click", () => {
  const base = currentFile ? currentFile.name.replace(/\.pdf$/i, "") : "vystup";
  addRangeRow(1, pageCount || 1, `${base}_cast`);
});

splitBtn.addEventListener("click", splitPdf);
