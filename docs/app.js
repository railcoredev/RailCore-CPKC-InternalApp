/* ============================================================
   RAILCORE WORKER APP v3.7 — MAIN UI LOGIC (UNIVERSAL BUILD)
   This version does NOT assume any fixed CSV column names.
   All field extraction uses "best guess" fallbacks.
   ============================================================ */

//
// GLOBAL STATE
//
let ACTIVE_TAB = "crossings"; // crossings | sidings | tracklengths
let DATA = {
    crossings: [],
    sidings: [],
    tracklengths: [],
    subdivisions: [],
    yards: [],
    states: []
};

//
// SMALL UTILITIES
//
const $ = (id) => document.getElementById(id);
const $$ = (sel) => document.querySelectorAll(sel);

// Convert CSV → array of objects
function parseCSV(csvText) {
    const lines = csvText.trim().split(/\r?\n/);
    const headers = lines.shift().split(",");

    return lines.map(line => {
        const cols = line.split(",");
        const row = {};
        headers.forEach((h, i) => { row[h.trim()] = cols[i] ?? ""; });
        return row;
    });
}

// Sort by numeric MP
function sortByMP(arr) {
    return arr.sort((a, b) =>
        (parseFloat(a.MP) || 0) - (parseFloat(b.MP) || 0)
    );
}

//
// INITIALIZATION
//
window.addEventListener("DOMContentLoaded", async () => {
    await loadAllData();

    populateStateSelector();
    populateSubdivisionSelector();
    populateYardSelector();

    setupTabs();
    setupButtons();
});

//
// LOAD ALL DATA
//
async function loadAllData() {
    try {
        DATA = await loadRailCoreDataMaster(); // provided in data_loader.js
    } catch (e) {
        console.warn("Fallback to empty data:", e);
    }
}

//
// POPULATE STATE SELECTOR
//
function populateStateSelector() {
    const stateSelect = $("stateSelect");
    stateSelect.innerHTML = "";

    DATA.states.forEach(st => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = st;
        stateSelect.appendChild(opt);
    });
}

//
// POPULATE SUBDIVISION SELECTOR
//
function populateSubdivisionSelector() {
    const subSelect = $("subdivisionSelect");
    subSelect.innerHTML = "";

    DATA.subdivisions.forEach(sub => {
        const opt = document.createElement("option");
        opt.value = sub;
        opt.textContent = sub;
        subSelect.appendChild(opt);
    });
}

//
// POPULATE YARD SELECTOR
//
function populateYardSelector() {
    const yardSelect = $("yardSelect");
    yardSelect.innerHTML = "";

    DATA.yards.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        yardSelect.appendChild(opt);
    });
}

//
// SETUP TAB LOGIC
//
function setupTabs() {
    $$(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            $$(".tab").forEach(t => t.classList.remove("active"));
            tab.classList.add("active");

            ACTIVE_TAB = tab.dataset.tab;

            $$(".tab-panel").forEach(p => p.classList.remove("active"));
            $("panel-" + ACTIVE_TAB).classList.add("active");
        });
    });
}

//
// SETUP BUTTONS (Apply, Print, Download)
//
function setupButtons() {
    $("applyBtn").addEventListener("click", applyFilters);
    $("printBtn").addEventListener("click", () => window.print());
    $("downloadBtn").addEventListener("click", showDownloadDialog);

    $("downloadCancelBtn").addEventListener("click", () => {
        $("downloadDialog").classList.add("hidden");
    });

    $$(".dialog-option").forEach(btn => {
        btn.addEventListener("click", () => downloadFile(btn.dataset.format));
    });
}

//
// APPLY BUTTON LOGIC
//
function applyFilters() {
    const spacing = parseFloat($("spacingInput").value) || 0;
    const buffer = parseFloat($("bufferInput").value) || 0;

    const selectedStates = Array.from($("stateSelect").selectedOptions)
        .map(o => o.value);

    const subdivision = $("subdivisionSelect").value;
    const viewMode = document.querySelector("input[name='viewMode']:checked").value;

    if (ACTIVE_TAB === "crossings") renderCrossings(selectedStates, subdivision, spacing, buffer, viewMode);
    if (ACTIVE_TAB === "sidings") renderSidings(subdivision);
    if (ACTIVE_TAB === "tracklengths") renderTrackLengths();
}

//
// CROSSINGS OUTPUT (3-LINE BLOCK LOGIC)
//
function renderCrossings(states, subdivision, spacing, buffer, viewMode) {
    const panel = $("results-crossings");
    panel.innerHTML = "";

    // Filter relevant rows
    let rows = DATA.crossings.filter(r => {
        const rState = r.STATE || r.state || "";
        const rSub = r.SUBDIVISION || r.Subdivision || r.sub || "";

        return (states.length === 0 || states.includes(rState)) &&
               (subdivision === "" || rSub === subdivision);
    });

    // Sort by MP
    rows = sortByMP(rows);

    // Build A→B blocks
    for (let i = 0; i < rows.length - 1; i++) {
        const A = rows[i];
        const B = rows[i + 1];

        const mpA = parseFloat(A.MP) || 0;
        const mpB = parseFloat(B.MP) || 0;
        const dFeet = Math.round(Math.abs(mpB - mpA) * 5280);

        // Threshold filter
        if (viewMode === "threshold" && dFeet < spacing) continue;

        const block = document.createElement("div");
        block.className = "result-block";

        block.innerHTML = `
            <div class="result-crossing">${formatCrossingLine(A)}</div>
            <div class="result-distance">↓ ${dFeet.toLocaleString()} ft</div>
            <div class="result-crossing">${formatCrossingLine(B)}</div>
        `;

        panel.appendChild(block);
    }
}

//
// FORMAT CROSSING LINE
//
function formatCrossingLine(row) {
    const mp = row.MP || row.milepost || "?";
    const name = row.COMMON_NAME || row.NAME || row.Crossing || "UNKNOWN";
    const road = row.ROAD || row.Road || "";
    const prot = row.PROTECTION || row.Device || "";
    const dot = row.DOT || row.DOTID || row.DOT_Number || "---------";

    return `MP ${mp} — ${name} — ${road} — ${prot} — DOT#${dot}`;
}

//
// SIDINGS PANEL
//
function renderSidings(subdivision) {
    const panel = $("results-sidings");
    panel.innerHTML = "";

    const rows = DATA.sidings.filter(r => {
        const rSub = r.SUBDIVISION || r.Subdivision || "";
        return subdivision === "" || rSub === subdivision;
    });

    rows.forEach(r => {
        const start = parseFloat(r.MP_START || r.StartMP || 0);
        const end = parseFloat(r.MP_END || r.EndMP || 0);
        const totalFt = Math.round(Math.abs(end - start) * 5280);

        const block = document.createElement("div");
        block.className = "result-block";

        block.innerHTML = `
            <div class="siding-header">${r.NAME || r.Siding || "UNKNOWN SIDING"}</div>
            <div class="siding-range">MP ${start} – MP ${end} (Total ${totalFt.toLocaleString()} ft)</div>
        `;

        panel.appendChild(block);
    });
}

//
// TRACK LENGTHS PANEL (YARD TRACKS ONLY)
//
function renderTrackLengths() {
    const yard = $("yardSelect").value;
    const panel = $("results-tracklengths");
    panel.innerHTML = "";

    const rows = DATA.tracklengths.filter(r =>
        r.YARD === yard || r.Yard === yard
    );

    rows.forEach(r => {
        const rowElem = document.createElement("div");
        rowElem.className = "track-row";

        rowElem.innerHTML = `
            <span>${r.TRACK || r.Track || r.Name}</span>
            <span>${r.LENGTH || r.Length || "0"} ft</span>
        `;

        panel.appendChild(rowElem);
    });
}

//
// DOWNLOAD DIALOG
//
function showDownloadDialog() {
    $("downloadDialog").classList.remove("hidden");
}

//
// DOWNLOAD HANDLER
//
function downloadFile(format) {
    $("downloadDialog").classList.add("hidden");

    const text = getCurrentTabText();
    const filename = `RailCore_${ACTIVE_TAB}_${Date.now()}`;

    if (format === "txt") return downloadTXT(filename + ".txt", text);
    if (format === "csv") return downloadCSV(filename + ".csv", text);
    if (format === "pdf") return downloadPDF(filename + ".pdf");
    if (format === "png") return downloadPNG(filename + ".png");
}

//
// BUILD TEXT OUTPUT FOR CURRENT TAB
//
function getCurrentTabText() {
    return document.querySelector(`#results-${ACTIVE_TAB}`).innerText;
}

//
// DOWNLOAD TXT
//
function downloadTXT(name, text) {
    const blob = new Blob([text], { type: "text/plain" });
    downloadBlob(blob, name);
}

//
// DOWNLOAD CSV (simple: each line preserved)
//
function downloadCSV(name, text) {
    const csv = text.replace(/\t/g, ",");
    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(blob, name);
}

//
// DOWNLOAD PDF
//
async function downloadPDF(name) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: "pt", format: "letter" });

    const panel = document.querySelector(`#results-${ACTIVE_TAB}`);

    await pdf.html(panel, { x: 20, y: 20 });
    pdf.save(name);
}

//
// DOWNLOAD PNG
//
async function downloadPNG(name) {
    const panel = document.querySelector(`#results-${ACTIVE_TAB}`);
    const canvas = await html2canvas(panel);
    canvas.toBlob(blob => downloadBlob(blob, name));
}

//
// GENERIC BLOB DOWNLOADER
//
function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}
