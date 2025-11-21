// docs/app.js

// ------------------------------------------------------
//  MOCK DATA  (Kansas City Sub sample, local/offline)
//  Each item has distanceToNextFt = gap to the NEXT one.
// ------------------------------------------------------
const MOCK_KC_CROSSINGS = [
  {
    sub: "Kansas City Sub – CPKC",
    mp: 8.5,
    mainName: "KANSAS AVE",
    localName: "Kansas Ave",
    protection: "GATES",
    dot: "079123A",
    distanceToNextFt: 7920
  },
  {
    sub: "Kansas City Sub – CPKC",
    mp: 10.1,
    mainName: "TURLEY RD",
    localName: "Turley Rd",
    protection: "FLASHERS",
    dot: "079456B",
    distanceToNextFt: 13728
  },
  {
    sub: "Kansas City Sub – CPKC",
    mp: 12.7,
    mainName: "155TH ST",
    localName: "155th St",
    protection: "GATES",
    dot: "079789C",
    distanceToNextFt: 9024
  },
  {
    sub: "Kansas City Sub – CPKC",
    mp: 14.4,
    mainName: "HOLLIDAY RD",
    localName: "Holliday Rd",
    protection: "GATES",
    dot: "079999D",
    distanceToNextFt: 14784
  },
  {
    sub: "Kansas City Sub – CPKC",
    mp: 17.2,
    mainName: "KILL CREEK RD",
    localName: "Kill Creek Rd",
    protection: "FLASHERS",
    dot: "079888E",
    distanceToNextFt: 8712
  },
  {
    sub: "Kansas City Sub – CPKC",
    mp: 19.9,
    mainName: "CEDAR CREEK RD",
    localName: "Cedar Creek Rd",
    protection: "GATES",
    dot: "079777F",
    distanceToNextFt: null // last one – no next distance
  }
];

// ------------------------------------------------------
//  DOM HOOKS
// ------------------------------------------------------
const stateSelect = document.getElementById("stateSelect");
const subdivisionSelect = document.getElementById("subdivisionSelect");
const spacingInput = document.getElementById("spacingFt");
const bufferInput = document.getElementById("bufferFt");
const viewThresholdRadio = document.getElementById("viewThreshold");
const viewAllRadio = document.getElementById("viewAll");
const applyBtn = document.getElementById("applyBtn");
const printBtn = document.getElementById("printBtn");
const downloadBtn = document.getElementById("downloadBtn");
const resultsPanel = document.getElementById("resultsPanel");

// ------------------------------------------------------
//  INIT – simple state setup (no real state filter yet)
// ------------------------------------------------------
function init() {
  // For now just show KC Sub sample when page loads
  renderCrossingBlocks(MOCK_KC_CROSSINGS);
}

document.addEventListener("DOMContentLoaded", init);

// ------------------------------------------------------
//  FILTER + RENDER PIPELINE
// ------------------------------------------------------
function handleApplyClick() {
  // spacing + buffer combined as minimum allowed gap
  const spacingFt = Number(spacingInput.value) || 0;
  const bufferFt = Number(bufferInput.value) || 0;
  const minGapFt = spacingFt + bufferFt;

  const viewMode = viewAllRadio.checked ? "all" : "threshold";

  let crossings = [...MOCK_KC_CROSSINGS];

  // later: filter by state + subdivision + data_loader here

  // Build A→B blocks from sequential crossings
  const blocks = [];
  for (let i = 0; i < crossings.length - 1; i++) {
    const a = crossings[i];
    const b = crossings[i + 1];

    // distance A→B comes from a.distanceToNextFt (local/offline)
    const gapFt = typeof a.distanceToNextFt === "number"
      ? a.distanceToNextFt
      : null;

    if (gapFt == null) continue; // defensive

    if (viewMode === "all" || gapFt >= minGapFt) {
      blocks.push({ a, b, gapFt });
    }
  }

  renderBlocks(blocks);
}

applyBtn.addEventListener("click", handleApplyClick);

// ------------------------------------------------------
//  RENDER HELPERS
// ------------------------------------------------------
function renderCrossingBlocks(crossings) {
  // default render uses current spacing + viewMode
  const spacingFt = Number(spacingInput.value) || 0;
  const bufferFt = Number(bufferInput.value) || 0;
  const minGapFt = spacingFt + bufferFt;
  const viewMode = viewAllRadio.checked ? "all" : "threshold";

  const blocks = [];
  for (let i = 0; i < crossings.length - 1; i++) {
    const a = crossings[i];
    const b = crossings[i + 1];
    const gapFt = typeof a.distanceToNextFt === "number"
      ? a.distanceToNextFt
      : null;
    if (gapFt == null) continue;

    if (viewMode === "all" || gapFt >= minGapFt) {
      blocks.push({ a, b, gapFt });
    }
  }

  renderBlocks(blocks);
}

function renderBlocks(blocks) {
  resultsPanel.innerHTML = "";

  if (!blocks.length) {
    const empty = document.createElement("div");
    empty.className = "results-empty";
    empty.textContent = "No crossings meet the current spacing filter.";
    resultsPanel.appendChild(empty);
    return;
  }

  blocks.forEach((block, idx) => {
    const { a, b, gapFt } = block;

    // C (top)
    resultsPanel.appendChild(makeCrossingLine(a));

    // D (middle arrow line)
    const distLine = document.createElement("div");
    distLine.className = "result-line distance-line";
    distLine.textContent = `↓ ${gapFt.toLocaleString("en-US")} ft`;
    resultsPanel.appendChild(distLine);

    // C (bottom)
    resultsPanel.appendChild(makeCrossingLine(b));

    // Space between blocks (but not after very last)
    if (idx !== blocks.length - 1) {
      const spacer = document.createElement("div");
      spacer.className = "result-spacer";
      spacer.textContent = " "; // keeps block height in some renderers
      resultsPanel.appendChild(spacer);
    }
  });
}

function makeCrossingLine(x) {
  const line = document.createElement("div");
  line.className = "result-line crossing-line";

  // Example style: MP 8.5 — KANSAS AVE — Kansas Ave — GATES — DOT# 079123A
  line.textContent =
    `MP ${x.mp} — ${x.mainName} — ${x.localName} — ${x.protection} — DOT# ${x.dot}`;

  return line;
}

// ------------------------------------------------------
//  PRINT + DOWNLOAD
// ------------------------------------------------------
printBtn.addEventListener("click", () => {
  window.print();
});

downloadBtn.addEventListener("click", () => {
  const lines = [];
  const children = Array.from(resultsPanel.children);
  children.forEach((el) => {
    if (!el.classList.contains("result-line") &&
        !el.classList.contains("result-spacer")) return;
    const txt = el.textContent || "";
    lines.push(txt.trimEnd());
  });

  const blob = new Blob([lines.join("\n") + "\n"], {
    type: "text/plain;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "RailCore_CPKC_Crossings.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
