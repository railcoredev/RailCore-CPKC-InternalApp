// app.js — RailCore CPKC Worker App v3.8 (production)
// Handles UI wiring, tab switching, filtering, and downloads.

let RAILCORE_DATA = null;
let ACTIVE_TAB = "crossings";

document.addEventListener("DOMContentLoaded", async () => {
  try {
    RAILCORE_DATA = await loadRailCoreData();
    initDropdowns();
    initEvents();
    setActiveTab("crossings");
    renderPlaceholder();
  } catch (err) {
    console.error("Failed to load RailCore data:", err);
    const out = document.getElementById("outputText");
    if (out) {
      out.textContent = "Error loading data. Please try refreshing.";
    }
  }
});

function initDropdowns() {
  const stateSelect = document.getElementById("stateSelect");
  const subSelect = document.getElementById("subdivisionSelect");

  // Populate states
  RAILCORE_DATA.states.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = st.code;
    opt.textContent = st.name;
    stateSelect.appendChild(opt);
  });

  // Preselect KS + MO if available
  ["KS", "MO"].forEach((code) => {
    const match = Array.from(stateSelect.options).find((o) => o.value === code);
    if (match) match.selected = true;
  });

  refreshSubdivisionOptions();
}

function initEvents() {
  const stateSelect = document.getElementById("stateSelect");
  const subSelect = document.getElementById("subdivisionSelect");
  const yardSelect = document.getElementById("yardSelect");
  const applyBtn = document.getElementById("applyBtn");
  const printBtn = document.getElementById("printBtn");
  const downloadBtn = document.getElementById("downloadBtn");

  stateSelect.addEventListener("change", () => {
    refreshSubdivisionOptions();
    renderPlaceholder();
  });

  subSelect.addEventListener("change", () => {
    refreshYardOptions();
    renderPlaceholder();
  });

  yardSelect.addEventListener("change", () => {
    if (ACTIVE_TAB === "tracks") renderTrackLengths();
  });

  applyBtn.addEventListener("click", () => {
    renderCurrentTab();
  });

  printBtn.addEventListener("click", () => {
    window.print();
  });

  downloadBtn.addEventListener("click", () => {
    toggleDownloadOverlay(true);
  });

  // Tabs
  document.querySelectorAll(".tab").forEach((tabEl) => {
    tabEl.addEventListener("click", () => {
      const tabId = tabEl.getAttribute("data-tab");
      setActiveTab(tabId);
      renderCurrentTab();
    });
  });

  // Download overlay
  const overlay = document.getElementById("downloadOverlay");
  overlay.addEventListener("click", (evt) => {
    if (evt.target === overlay) {
      toggleDownloadOverlay(false);
      return;
    }
    const btn = evt.target.closest("button[data-format]");
    if (!btn) return;
    const fmt = btn.getAttribute("data-format");
    if (fmt === "cancel") {
      toggleDownloadOverlay(false);
      return;
    }
    downloadCurrent(fmt);
    toggleDownloadOverlay(false);
  });
}

function toggleDownloadOverlay(show) {
  const overlay = document.getElementById("downloadOverlay");
  if (!overlay) return;
  overlay.classList.toggle("hidden", !show);
}

function getSelectedStateCodes() {
  const stateSelect = document.getElementById("stateSelect");
  return Array.from(stateSelect.selectedOptions).map((o) => o.value);
}

function getSelectedSubdivisionCode() {
  const subSelect = document.getElementById("subdivisionSelect");
  return subSelect.value || null;
}

function refreshSubdivisionOptions() {
  const subSelect = document.getElementById("subdivisionSelect");
  const selectedStates = getSelectedStateCodes();

  subSelect.innerHTML = "";

  const subs = RAILCORE_DATA.subdivisions.filter((s) =>
    s.stateCodes.some((sc) => selectedStates.includes(sc))
  );

  subs.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s.code;
    opt.textContent = s.name;
    subSelect.appendChild(opt);
  });

  if (!subSelect.value && subs.length > 0) {
    subSelect.value = subs[0].code;
  }

  refreshYardOptions();
}

function refreshYardOptions() {
  const subCode = getSelectedSubdivisionCode();
  const yardSelect = document.getElementById("yardSelect");
  yardSelect.innerHTML = "";

  const yards = RAILCORE_DATA.yards.filter(
    (y) => !subCode || y.subdivisionCode === subCode
  );

  yards.forEach((y) => {
    const opt = document.createElement("option");
    opt.value = y.code;
    opt.textContent = y.name;
    yardSelect.appendChild(opt);
  });

  if (!yardSelect.value && yards.length > 0) {
    yardSelect.value = yards[0].code;
  }
}

function setActiveTab(tabId) {
  ACTIVE_TAB = tabId;
  document.querySelectorAll(".tab").forEach((t) => {
    t.classList.toggle("active", t.getAttribute("data-tab") === tabId);
  });

  const yardPanel = document.getElementById("yardPanel");
  if (tabId === "tracks") {
    yardPanel.classList.remove("hidden");
  } else {
    yardPanel.classList.add("hidden");
  }
}

function renderPlaceholder() {
  const out = document.getElementById("outputText");
  if (!out) return;

  if (ACTIVE_TAB === "crossings") {
    out.textContent =
      "CROSSINGS VIEW\n\n" +
      "Output format (for each pair that meets spacing):\n\n" +
      "  CROSSING\n" +
      "  ↓ distance (ft)\n" +
      "  CROSSING\n" +
      "  [blank line]\n\n" +
      "Filtering is done locally in the app using SPACING (FT) and View Mode.";
  } else if (ACTIVE_TAB === "sidings") {
    out.textContent =
      "SIDINGS VIEW\n\n" +
      "For each siding in the subdivision:\n" +
      "  NAME — MP start–end — total length (ft)\n" +
      "  MP start, distances to crossing(s), crossing(s), distance to MP end, MP end.";
  } else if (ACTIVE_TAB === "tracks") {
    out.textContent =
      "TRACK LENGTHS VIEW\n\n" +
      "Select a yard to list tracks and lengths in feet.";
  }
}

function renderCurrentTab() {
  if (!RAILCORE_DATA) return;
  const subCode = getSelectedSubdivisionCode();
  if (!subCode) {
    renderPlaceholder();
    return;
  }

  if (ACTIVE_TAB === "crossings") {
    renderCrossings();
  } else if (ACTIVE_TAB === "sidings") {
    renderSidings();
  } else if (ACTIVE_TAB === "tracks") {
    renderTrackLengths();
  }
}

function renderCrossings() {
  const out = document.getElementById("outputText");
  const subCode = getSelectedSubdivisionCode();
  const spacingInput = document.getElementById("spacingInput");
  const viewMode =
    document.querySelector("input[name='viewMode']:checked")?.value ||
    "threshold";

  const spacingFt = parseInt(spacingInput.value || "0", 10) || 0;

  let list = RAILCORE_DATA.crossings.filter(
    (c) => c.subdivisionCode === subCode
  );

  list.sort((a, b) => a.mp - b.mp);

  const lines = [];

  for (let i = 0; i < list.length - 1; i++) {
    const a = list[i];
    const b = list[i + 1];

    let dFt = a.distanceToNextFt;
    if (typeof dFt !== "number") {
      dFt = Math.round((b.mp - a.mp) * 5280);
    }

    if (viewMode === "threshold" && dFt < spacingFt) {
      continue;
    }

    lines.push(formatCrossingLine(a));
    lines.push("↓ " + dFt.toLocaleString("en-US") + " ft");
    lines.push(formatCrossingLine(b));
    lines.push("");
  }

  if (lines.length === 0) {
    out.textContent =
      "No crossing pairs met the current SPACING (FT) threshold for this subdivision.\n\n" +
      "Try lowering SPACING (FT) or switching View Mode to 'All'.";
  } else {
    out.textContent = lines.join("\n");
  }
}

function formatCrossingLine(c) {
  const mpText = Number.isInteger(c.mp) ? c.mp.toString() : c.mp.toFixed(1);
  return (
    "MP " +
    mpText +
    " — " +
    c.roadMain +
    " — " +
    c.roadDetail +
    " — " +
    c.protection +
    " — DOT# " +
    c.dot
  );
}

function renderSidings() {
  const out = document.getElementById("outputText");
  const subCode = getSelectedSubdivisionCode();

  const sidings = RAILCORE_DATA.sidings.filter(
    (s) => s.subdivisionCode === subCode
  );

  if (sidings.length === 0) {
    out.textContent =
      "No sidings defined yet for this subdivision.\n\n" +
      "Once siding data is added to data_loader.js, this view will show " +
      "siding name, MP start–end, total length, and internal distances to crossings.";
    return;
  }

  const lines = [];
  sidings.forEach((s) => {
    const mpLenFt =
      typeof s.lengthFt === "number"
        ? s.lengthFt
        : Math.round((s.mpEnd - s.mpStart) * 5280);

    const mpStartText = Number.isInteger(s.mpStart)
      ? s.mpStart.toString()
      : s.mpStart.toFixed(1);
    const mpEndText = Number.isInteger(s.mpEnd)
      ? s.mpEnd.toString()
      : s.mpEnd.toFixed(1);

    lines.push(
      s.name +
        " — MP " +
        mpStartText +
        "–" +
        mpEndText +
        " — " +
        mpLenFt.toLocaleString("en-US") +
        " ft total"
    );

    if (Array.isArray(s.sequence) && s.sequence.length > 0) {
      s.sequence.forEach((seg) => {
        lines.push("  " + seg);
      });
    } else {
      lines.push("  (Sequence details to be filled in later.)");
    }

    lines.push("");
  });

  out.textContent = lines.join("\n");
}

function renderTrackLengths() {
  const out = document.getElementById("outputText");
  const subCode = getSelectedSubdivisionCode();
  const yardSelect = document.getElementById("yardSelect");
  const yardCode = yardSelect.value || null;

  const yards = RAILCORE_DATA.yards.filter(
    (y) =>
      (!subCode || y.subdivisionCode === subCode) &&
      (!yardCode || y.code === yardCode)
  );

  if (yards.length === 0) {
    out.textContent =
      "No yards defined for this subdivision in data_loader.js.\n\n" +
      "Once track-length data is added, this view will show tracks " +
      "and lengths (ft) for the selected yard.";
    return;
  }

  const yard = yards[0];
  const tracks = RAILCORE_DATA.trackLengths.filter(
    (t) => t.yardCode === yard.code
  );

  const lines = [];
  lines.push("Yard: " + yard.name);
  lines.push("");

  if (tracks.length === 0) {
    lines.push("  (No tracks defined yet for this yard.)");
  } else {
    tracks.forEach((t) => {
      lines.push(
        "  " +
          t.trackName +
          " — " +
          t.lengthFt.toLocaleString("en-US") +
          " ft"
      );
    });
  }

  out.textContent = lines.join("\n");
}

function downloadCurrent(format) {
  const out = document.getElementById("outputText");
  if (!out) return;
  const text = out.textContent || "";
  if (!text.trim()) return;

  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const baseName = "railcore_worker_" + ACTIVE_TAB + "_" + yyyy + mm + dd;

  let mime = "text/plain";
  let ext = format.toLowerCase();

  if (format === "csv") {
    mime = "text/csv";
  } else if (format === "pdf") {
    // Placeholder for future PDF generation
    mime = "application/pdf";
  } else if (format === "png") {
    // Placeholder for future PNG export
    mime = "image/png";
  }

  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = baseName + "." + ext;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
