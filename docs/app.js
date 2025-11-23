// GLOBAL STATE
let STATE_DATA = {};
let SUB_DATA = {};
let CROSSINGS = [];
let SIDINGS = [];
let TRACKS = [];

// =====================
// INITIAL LOAD
// =====================
window.addEventListener("DOMContentLoaded", async () => {
    await loadData();
    setupUI();
});

// =====================
// LOAD DATA (from data_loader.js)
// =====================
async function loadData() {
    const data = await loadRailCoreData();
    STATE_DATA = data.states;
    SUB_DATA = data.subdivisions;
    CROSSINGS = data.crossings;
    SIDINGS = data.sidings;
    TRACKS = data.tracklengths;
}

// =====================
// SETUP UI
// =====================
function setupUI() {

    document.getElementById("applyBtn").addEventListener("click", applyFilters);
    document.getElementById("printBtn").addEventListener("click", () => window.print());
    document.getElementById("downloadBtn").addEventListener("click", showDownloadMenu);

    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    populateStateSelect();
    populateSubdivisionSelect();
}

// =====================
// TAB SWITCHING
// =====================
let CURRENT_TAB = "crossings";

function switchTab(tab) {
    CURRENT_TAB = tab;

    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${tab}"]`).classList.add("active");

    applyFilters();
}

// =====================
// FILTER + RENDER
// =====================
function applyFilters() {

    const threshold = parseInt(document.getElementById("spacingInput").value);
    const viewMode = document.querySelector("input[name='viewMode']:checked").value;

    if (CURRENT_TAB === "crossings") {
        renderCrossings(threshold, viewMode);
    }

    if (CURRENT_TAB === "sidings") {
        renderSidings();
    }

    if (CURRENT_TAB === "tracklengths") {
        renderTrackLengths();
    }
}

// =====================
// CROSSINGS (A→B blocks)
// =====================
function renderCrossings(threshold, viewMode) {

    let html = "";
    const filtered = CROSSINGS.sort((a, b) => a.mp - b.mp);

    for (let i = 0; i < filtered.length - 1; i++) {

        const A = filtered[i];
        const B = filtered[i + 1];
        const dist = Math.round((B.mp - A.mp) * 5280);

        if (viewMode === "threshold" && dist < threshold) {
            continue;
        }

        html += `MP ${A.mp.toFixed(1)} — ${A.road}\n`;
        html += `↓ ${dist.toLocaleString()} ft\n`;
        html += `MP ${B.mp.toFixed(1)} — ${B.road}\n\n`;
    }

    document.getElementById("output").innerText = html;
}

// =====================
// SIDINGS FORMAT
// =====================
function renderSidings() {

    let html = "";
    const sidings = SIDINGS.sort((a, b) => a.start_mp - b.start_mp);

    sidings.forEach(s => {

        const lengthFt = Math.round((s.end_mp - s.start_mp) * 5280);

        html += `${s.name}\n`;
        html += `MP ${s.start_mp.toFixed(1)} – MP ${s.end_mp.toFixed(1)} — ${lengthFt.toLocaleString()} ft\n\n`;

        let lastMP = s.start_mp;

        CROSSINGS.filter(c => c.mp >= s.start_mp && c.mp <= s.end_mp)
            .sort((a, b) => a.mp - b.mp)
            .forEach(c => {
                const dist = Math.round((c.mp - lastMP) * 5280);
                html += `MP ${lastMP.toFixed(1)}\n↓ ${dist.toLocaleString()} ft\n${c.road}\n\n`;
                lastMP = c.mp;
            });

        const finalDist = Math.round((s.end_mp - lastMP) * 5280);
        html += `MP ${lastMP.toFixed(1)}\n↓ ${finalDist.toLocaleString()} ft\nMP ${s.end_mp.toFixed(1)}\n\n`;
    });

    document.getElementById("output").innerText = html;
}

// =====================
// TRACK LENGTHS TAB
// =====================
function renderTrackLengths() {

    let html = "";

    TRACKS.forEach(t => {
        html += `${t.yard} — Track ${t.track}\n`;
        html += `MP ${t.start_mp.toFixed(1)} – MP ${t.end_mp.toFixed(1)}\n`;
        html += `${Math.round((t.end_mp - t.start_mp) * 5280).toLocaleString()} ft\n\n`;
    });

    document.getElementById("output").innerText = html;
}

// =====================
// DOWNLOAD MENU
// =====================
function showDownloadMenu() {

    const text = document.getElementById("output").innerText;

    const filename = `RailCore_${CURRENT_TAB}_${Date.now()}`;

    downloadTXT(filename + ".txt", text);
}

// =====================
// FILE DOWNLOAD
// =====================
function downloadTXT(filename, text) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
}
