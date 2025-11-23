/* RailCore CPKC Worker App — v3.8
   FULL WORKING APP.JS REPLACEMENT
------------------------------------------------------------ */

let railData = null;
let activeTab = "crossings";   // default tab

document.addEventListener("DOMContentLoaded", async () => {
    railData = await loadRailCoreData();

    populateStates();
    populateSubdivision(); // Starts empty until state selected
    hookTabBar();
    hookApplyButton();
    hookDownloadButtons();

    switchTab("crossings");
});

/* -------------------------------
      UI POPULATION FUNCTIONS
-------------------------------- */

function populateStates() {
    const sel = document.getElementById("stateSelect");
    sel.innerHTML = "";
    railData.states.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.code;
        opt.textContent = s.name;
        sel.appendChild(opt);
    });
}

function populateSubdivision() {
    const sel = document.getElementById("subdivisionSelect");
    sel.innerHTML = "";

    railData.subdivisions.forEach(sd => {
        const opt = document.createElement("option");
        opt.value = sd.code;
        opt.textContent = sd.name;
        sel.appendChild(opt);
    });
}

/* -------------------------------
           TAB LOGIC
-------------------------------- */

function hookTabBar() {
    document.querySelectorAll(".tab").forEach(tab => {
        tab.addEventListener("click", () => {
            const name = tab.dataset.tab;
            switchTab(name);
        });
    });
}

function switchTab(name) {
    activeTab = name;

    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelector(`.tab[data-tab="${name}"]`)?.classList.add("active");

    const crossingsBox = document.getElementById("results-crossings");
    const sidingsBox   = document.getElementById("results-sidings");
    const tracksBox    = document.getElementById("results-tracklengths");

    crossingsBox.style.display = "none";
    sidingsBox.style.display   = "none";
    tracksBox.style.display    = "none";

    if (name === "crossings") crossingsBox.style.display = "block";
    if (name === "sidings")   sidingsBox.style.display   = "block";
    if (name === "tracklengths") tracksBox.style.display = "block";

    const yardRow = document.getElementById("yardRow");
    yardRow.style.display = (name === "tracklengths") ? "block" : "none";
}

/* -------------------------------
         APPLY BUTTON LOGIC
-------------------------------- */

function hookApplyButton() {
    document.getElementById("applyBtn").addEventListener("click", () => {
        if (activeTab === "crossings") renderCrossings();
        if (activeTab === "sidings")   renderSidings();
        if (activeTab === "tracklengths") renderTrackLengths();
    });
}

/* -------------------------------
         RENDER FUNCTIONS
-------------------------------- */

function renderCrossings() {
    const box = document.getElementById("results-crossings");
    box.innerText = `
CROSSINGS RESULT AREA
(Currently placeholder — waiting on pipeline data injection)
`;
}

function renderSidings() {
    const box = document.getElementById("results-sidings");
    box.innerText = `
SIDINGS RESULT AREA
(Currently placeholder — waiting on pipeline data injection)
`;
}

function renderTrackLengths() {
    const yard = document.getElementById("yardSelect").value;
    const box  = document.getElementById("results-tracklengths");

    box.innerText = `
TRACK LENGTH RESULT AREA
Selected Yard: ${yard || "(none)"}

(Currently placeholder — waiting on pipeline data injection)
`;
}

/* -------------------------------
        DOWNLOAD BUTTONS
-------------------------------- */

function hookDownloadButtons() {
    document.getElementById("downloadBtn").addEventListener("click", () => {
        let text = "";

        if (activeTab === "crossings")
            text = document.getElementById("results-crossings").innerText;

        if (activeTab === "sidings")
            text = document.getElementById("results-sidings").innerText;

        if (activeTab === "tracklengths")
            text = document.getElementById("results-tracklengths").innerText;

        const blob = new Blob([text], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `railcore_${activeTab}.txt`;
        a.click();
    });
}

/* -------------------------------
       DATA LOADER (STATIC)
-------------------------------- */

async function loadRailCoreData() {
    return {
        states: [
            { code: "KS", name: "Kansas" },
            { code: "MO", name: "Missouri" }
        ],
        subdivisions: [
            { code: "KC", name: "Kansas City Sub — CPKC" }
        ],
        yards: [
            { code: "KCY", name: "Kansas City Yard" }
        ]
    };
}
