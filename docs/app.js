// app.js
// RailCore CPKC Worker App – UI logic
// Uses loadRailCoreSnapshot() from data_loader.js

let SNAPSHOT = null;

let currentSubdivisionId = null;
let currentTab = "crossings"; // 'crossings' | 'sidings' | 'tracks'
let viewMode = "threshold"; // 'threshold' | 'all'

const DOM = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  wireEvents();
  initApp();
});

function cacheDom() {
  DOM.stateSummary = document.getElementById("stateSummary");
  DOM.subdivisionSelect = document.getElementById("subdivisionSelect");
  DOM.spacingInput = document.getElementById("spacingInput");
  DOM.bufferInput = document.getElementById("bufferInput");
  DOM.applyButton = document.getElementById("applyButton");
  DOM.viewThreshold = document.getElementById("viewThreshold");
  DOM.viewAll = document.getElementById("viewAll");
  DOM.printButton = document.getElementById("printButton");
  DOM.downloadButton = document.getElementById("downloadButton");

  DOM.tabCrossings = document.getElementById("tabCrossings");
  DOM.tabSidings = document.getElementById("tabSidings");
  DOM.tabTracks = document.getElementById("tabTracks");

  DOM.yardBlock = document.getElementById("yardBlock");
  DOM.yardSelect = document.getElementById("yardSelect");
  DOM.resultsOutput = document.getElementById("resultsOutput");
}

function wireEvents() {
  DOM.applyButton.addEventListener("click", () => {
    renderCurrentView();
  });

  DOM.subdivisionSelect.addEventListener("change", () => {
    currentSubdivisionId = DOM.subdivisionSelect.value || null;
    renderCurrentView();
  });

  DOM.viewThreshold.addEventListener("change", () => {
    if (DOM.viewThreshold.checked) {
      viewMode = "threshold";
      renderCurrentView();
    }
  });

  DOM.viewAll.addEventListener("change", () => {
    if (DOM.viewAll.checked) {
      viewMode = "all";
      renderCurrentView();
    }
  });

  DOM.printButton.addEventListener("click", () => {
    window.print();
  });

  DOM.downloadButton.addEventListener("click", () => {
    downloadResults();
  });

  DOM.tabCrossings.addEventListener("click", () => setTab("crossings"));
  DOM.tabSidings.addEventListener("click", () => setTab("sidings"));
  DOM.tabTracks.addEventListener("click", () => setTab("tracks"));

  DOM.yardSelect.addEventListener("change", () => {
    if (currentTab === "tracks") {
      renderCurrentView();
    }
  });
}

async function initApp() {
  try {
    SNAPSHOT = await loadRailCoreSnapshot();
  } catch (err) {
    console.error("Failed to load snapshot", err);
    DOM.resultsOutput.textContent =
      "Error loading RailCore snapshot. Check your connection or JSON.";
    return;
  }

  populateStateSummary();
  populateSubdivisionSelect();
  populateYardSelectAll(); // yard dropdown shows all yards in snapshot (not filtered by sub)

  // Default subdivision = first one
  if (SNAPSHOT.subdivisions && SNAPSHOT.subdivisions.length > 0) {
    currentSubdivisionId = SNAPSHOT.subdivisions[0].id;
    DOM.subdivisionSelect.value = currentSubdivisionId;
  }

  renderCurrentView();
}

function populateStateSummary() {
  if (!SNAPSHOT || !SNAPSHOT.states) return;
  const uniqueCount = SNAPSHOT.states.length;
  DOM.stateSummary.textContent = `${uniqueCount} Item${uniqueCount === 1 ? "" : "s"}`;
}

function populateSubdivisionSelect() {
  const sel = DOM.subdivisionSelect;
  sel.innerHTML = "";

  if (!SNAPSHOT || !SNAPSHOT.subdivisions || !SNAPSHOT.subdivisions.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No subdivisions";
    sel.appendChild(opt);
    return;
  }

  SNAPSHOT.subdivisions.forEach((sub) => {
    const opt = document.createElement("option");
    opt.value = sub.id;
    opt.textContent = sub.name || sub.id;
    sel.appendChild(opt);
  });
}

// Yard dropdown shows ALL yards across the snapshot; user picks manually.
function populateYardSelectAll() {
  const sel = DOM.yardSelect;
  sel.innerHTML = "";

  if (!SNAPSHOT || !SNAPSHOT.yards || SNAPSHOT.yards.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No yards in snapshot";
    sel.appendChild(opt);
    return;
  }

  SNAPSHOT.yards.forEach((yard) => {
    const opt = document.createElement("option");
    opt.value = yard.id;
    opt.textContent = yard.name || yard.id;
    sel.appendChild(opt);
  });
}

function setTab(tabId) {
  currentTab = tabId;

  // Toggle tab button styles
  [DOM.tabCrossings, DOM.tabSidings, DOM.tabTracks].forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Toggle yard dropdown visibility
  if (tabId === "tracks") {
    DOM.yardBlock.classList.remove("hidden");
  } else {
    DOM.yardBlock.classList.add("hidden");
  }

  renderCurrentView();
}

function parseFeetValue(inputEl, fallback) {
  const raw = (inputEl.value || "").replace(/[^\d]/g, "");
  const num = parseInt(raw, 10);
  if (Number.isFinite(num) && num > 0) {
    inputEl.value = String(num);
    return num;
  }
  inputEl.value = String(fallback);
  return fallback;
}

function getCurrentSubdivision() {
  if (!SNAPSHOT || !SNAPSHOT.subdivisions) return null;
  return SNAPSHOT.subdivisions.find((s) => s.id === currentSubdivisionId) || null;
}

function getCrossingsForCurrentSubdivision() {
  if (!SNAPSHOT || !SNAPSHOT.crossings) return [];
  if (!currentSubdivisionId) return SNAPSHOT.crossings.slice();
  return SNAPSHOT.crossings
    .filter((c) => c.subdivision_id === currentSubdivisionId)
    .slice()
    .sort((a, b) => a.mp - b.mp);
}

function getSidingsForCurrentSubdivision() {
  if (!SNAPSHOT || !SNAPSHOT.sidings) return [];
  if (!currentSubdivisionId) return SNAPSHOT.sidings.slice();
  return SNAPSHOT.sidings
    .filter((s) => s.subdivision_id === currentSubdivisionId)
    .slice()
    .sort((a, b) => a.mp_start - b.mp_start);
}

function getCurrentYard() {
  if (!SNAPSHOT || !SNAPSHOT.yards || SNAPSHOT.yards.length === 0) return null;
  const id = DOM.yardSelect.value;
  return SNAPSHOT.yards.find((y) => y.id === id) || SNAPSHOT.yards[0];
}

function renderCurrentView() {
  if (!SNAPSHOT) return;

  const spacingFt = parseFeetValue(DOM.spacingInput, 5500);
  // bufferFt is not used yet, but keep it parsed for future logic
  const bufferFt = parseFeetValue(DOM.bufferInput, 400);
  void bufferFt; // avoid linter warning

  let text = "";

  if (currentTab === "crossings") {
    text = renderCrossingsView(spacingFt);
  } else if (currentTab === "sidings") {
    text = renderSidingsView();
  } else {
    text = renderTrackLengthsView();
  }

  if (!text.trim()) {
    text = "No matching data for the selected subdivision / settings.";
  }

  DOM.resultsOutput.textContent = text;
}

function renderCrossingsView(spacingFt) {
  const crossings = getCrossingsForCurrentSubdivision();
  if (!crossings.length) {
    return "No crossings in this subdivision for the current snapshot.";
  }

  const lines = [];
  const useThreshold = viewMode === "threshold";

  for (let i = 0; i < crossings.length - 1; i++) {
    const a = crossings[i];
    const b = crossings[i + 1];

    const mpDist = Math.abs(b.mp - a.mp);
    const feet = Math.round(mpDist * 5280);

    if (useThreshold && feet < spacingFt) {
      continue;
    }

    lines.push(formatCrossingLine(a));
    lines.push(`↓ ${feet.toLocaleString()} ft`);
    lines.push(formatCrossingLine(b));
    lines.push(""); // blank line between pairs
  }

  if (!lines.length && useThreshold) {
    return (
      "No crossing pairs meet the spacing threshold.\n\n" +
      `Threshold: ${spacingFt.toLocaleString()} ft`
    );
  }

  return lines.join("\n");
}

function formatCrossingLine(c) {
  const mpStr = `MP ${c.mp}`;
  const common = (c.road_common || "").toUpperCase();
  const road = c.road_name || "";
  const prot = (c.protection || "").toUpperCase();
  const dot = c.dot_number ? `DOT# ${c.dot_number}` : "";

  const parts = [mpStr, "—", common, "—", road, "—", prot];
  if (dot) {
    parts.push("—", dot);
  }
  return parts.join(" ");
}

function renderSidingsView() {
  const sub = getCurrentSubdivision();
  const sidings = getSidingsForCurrentSubdivision();

  const lines = [];

  lines.push("Sidings view will show:");
  lines.push("");
  lines.push("Siding Name");
  lines.push("MP Start – MP End — Total Distance (ft)");
  lines.push("");
  if (!sidings.length) {
    lines.push("No sidings in this subdivision for the current snapshot.");
    return lines.join("\n");
  }

  sidings.forEach((s) => {
    const totalFeet = Math.round(Math.abs(s.mp_end - s.mp_start) * 5280);
    lines.push(`${s.name || "Unnamed Siding"}`);
    lines.push(
      `MP ${s.mp_start} – MP ${s.mp_end} — ${totalFeet.toLocaleString()} ft`
    );
    lines.push("");
  });

  if (sub) {
    lines.unshift(`Subdivision: ${sub.name || sub.id}`);
    lines.unshift("");
  }

  return lines.join("\n");
}

function renderTrackLengthsView() {
  const yard = getCurrentYard();
  const lines = [];

  if (!yard) {
    lines.push("No yards defined in this snapshot.");
    return lines.join("\n");
  }

  lines.push(`Yard: ${yard.name || yard.id}`);
  lines.push("");

  if (!yard.tracks || yard.tracks.length === 0) {
    lines.push("Track lengths view will show:");
    lines.push("");
    lines.push("Track ID — Description — Length (ft)");
    lines.push("For the selected yard only.");
    return lines.join("\n");
  }

  lines.push("Track ID — Description — Length (ft)");
  lines.push("");

  yard.tracks.forEach((t) => {
    const id = t.id || "";
    const desc = t.name || t.description || "";
    const len = t.length_ft != null ? t.length_ft : "";
    lines.push(`${id} — ${desc} — ${len.toLocaleString()} ft`);
  });

  return lines.join("\n");
}

function downloadResults() {
  const text = DOM.resultsOutput.textContent || "";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "railcore_cpkc_worker_results.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
