// app.js
// RailCore CPKC Worker App – portal UI logic.
//
// One app, many sections: a home portal opens into sections that stay
// separate entities (reference data, live lineups, cheat-sheet cards) but
// share navigation, provenance labeling, and offline behavior.
// Data loaders live in data_loader.js.

let SNAPSHOT = null;         // reference snapshot (subs, crossings, sidings, yards)
let LINEUPS = null;          // live feed: { data, fromCache } from loadLineupsSnapshot()
let REFERENCE = null;        // cheat-sheet cards from loadSubdivisionReference()

let currentSection = null;   // null = home; else a SECTIONS key
let currentSubdivisionId = null;
let viewMode = "threshold"; // 'threshold' | 'all' (crossings)

const DOM = {};

// Which control blocks each section shows. Every data section carries the
// freshness bar: truthful data age beats a clean layout.
const SECTIONS = {
  notifications: { title: "NOTIFICATIONS", blocks: ["freshnessBar"] },
  refmenu:   { title: "REFERENCE",      blocks: ["refMenuBlock"] },
  pay:       { title: "PAY (PRIVATE)",  blocks: ["freshnessBar"] },
  rsa:       { title: "REMOTE RSA",     blocks: ["rsaBlock"] },
  mytrain:   { title: "MY TRAIN",       blocks: ["findBlock", "freshnessBar"] },
  lineups:   { title: "TRAIN LINEUPS",  blocks: ["stationBlock", "freshnessBar"] },
  history:   { title: "TRAIN HISTORY",  blocks: ["freshnessBar"] },
  boards:    { title: "CREW BOARDS",    blocks: ["boardBlock", "freshnessBar"] },
  reference: { title: "REF CARDS",      blocks: ["subdivisionBlock", "freshnessBar"] },
  crossings: { title: "CROSSINGS",      blocks: ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock", "freshnessBar"] },
  sidings:   { title: "SIDINGS",        blocks: ["subdivisionBlock", "freshnessBar"] },
  tracks:    { title: "TRACK LENGTHS",  blocks: ["yardBlock", "freshnessBar"] },
};

const ALL_BLOCKS = ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock",
                    "findBlock", "yardBlock", "stationBlock", "boardBlock",
                    "refMenuBlock", "rsaBlock", "freshnessBar"];

document.addEventListener("DOMContentLoaded", () => {
  cacheDom();
  wireEvents();
  initApp();
});

function cacheDom() {
  DOM.homePanel = document.getElementById("homePanel");
  DOM.sectionPanel = document.getElementById("sectionPanel");
  DOM.homeButton = document.getElementById("homeButton");
  DOM.sectionTitle = document.getElementById("sectionTitle");
  DOM.bellButton = document.getElementById("bellButton");
  DOM.bellBadge = document.getElementById("bellBadge");

  DOM.stateSummary = document.getElementById("stateSummary");
  DOM.subdivisionSelect = document.getElementById("subdivisionSelect");
  DOM.spacingInput = document.getElementById("spacingInput");
  DOM.bufferInput = document.getElementById("bufferInput");
  DOM.applyButton = document.getElementById("applyButton");
  DOM.viewThreshold = document.getElementById("viewThreshold");
  DOM.viewAll = document.getElementById("viewAll");
  DOM.printButton = document.getElementById("printButton");
  DOM.downloadButton = document.getElementById("downloadButton");
  DOM.trainFindInput = document.getElementById("trainFindInput");
  DOM.myNameInput = document.getElementById("myNameInput");

  DOM.yardSelect = document.getElementById("yardSelect");
  DOM.stationSelect = document.getElementById("stationSelect");
  DOM.boardSelect = document.getElementById("boardSelect");
  DOM.freshnessText = document.getElementById("freshnessText");
  DOM.alertsPanel = document.getElementById("alertsPanel");
  DOM.resultsOutput = document.getElementById("resultsOutput");

  ALL_BLOCKS.forEach((id) => { DOM[id] = document.getElementById(id); });
}

function wireEvents() {
  document.querySelectorAll(".tile[data-section]").forEach((tile) => {
    tile.addEventListener("click", () => openSection(tile.dataset.section));
  });
  DOM.homeButton.addEventListener("click", goHome);
  DOM.bellButton.addEventListener("click", () => openSection("notifications"));

  DOM.applyButton.addEventListener("click", renderCurrentView);

  DOM.subdivisionSelect.addEventListener("change", () => {
    currentSubdivisionId = DOM.subdivisionSelect.value || null;
    renderCurrentView();
  });

  DOM.viewThreshold.addEventListener("change", () => {
    if (DOM.viewThreshold.checked) { viewMode = "threshold"; renderCurrentView(); }
  });
  DOM.viewAll.addEventListener("change", () => {
    if (DOM.viewAll.checked) { viewMode = "all"; renderCurrentView(); }
  });

  DOM.printButton.addEventListener("click", () => window.print());
  DOM.downloadButton.addEventListener("click", downloadResults);

  DOM.yardSelect.addEventListener("change", renderCurrentView);
  DOM.stationSelect.addEventListener("change", renderCurrentView);
  DOM.boardSelect.addEventListener("change", renderCurrentView);
  DOM.trainFindInput.addEventListener("input", renderCurrentView);
  DOM.myNameInput.value = localStorage.getItem("railcore_my_name") || "";
  DOM.myNameInput.addEventListener("input", () => {
    try { localStorage.setItem("railcore_my_name", DOM.myNameInput.value.trim()); }
    catch (_) {}
    renderCurrentView();
  });
}

async function initApp() {
  // The three data families load independently: one failing must never
  // block the others.
  SNAPSHOT = await loadRailCoreSnapshot();
  LINEUPS = await loadLineupsSnapshot();
  REFERENCE = await loadSubdivisionReference();

  populateStateSummary();
  populateSubdivisionSelect();
  populateYardSelectAll();
  populateStationSelect();
  populateBoardSelect();

  if (SNAPSHOT.subdivisions && SNAPSHOT.subdivisions.length > 0) {
    currentSubdivisionId = SNAPSHOT.subdivisions[0].id;
    DOM.subdivisionSelect.value = currentSubdivisionId;
  }

  updateHomeTiles();
  bindRsa();
  collectionBanner();
  pollHealth();
  setInterval(pollHealth, 60000);
}

// ===================== NAVIGATION =====================

function openSection(sectionId) {
  if (!SECTIONS[sectionId]) return;
  currentSection = sectionId;
  showText();                 // table renderers opt back in per render
  window.scrollTo(0, 0);      // sections are their own page (V5)

  DOM.homePanel.classList.add("hidden");
  DOM.sectionPanel.classList.remove("hidden");
  DOM.sectionTitle.textContent = SECTIONS[sectionId].title;

  const show = new Set(SECTIONS[sectionId].blocks);
  ALL_BLOCKS.forEach((id) => DOM[id].classList.toggle("hidden", !show.has(id)));

  // Alert cards live in the Notifications section (bell in the header).
  DOM.alertsPanel.classList.toggle("hidden", sectionId !== "notifications");
  if (sectionId === "notifications") renderAlertCards();

  updateFreshnessBar();
  renderCurrentView();
  if (sectionId === "mytrain") DOM.trainFindInput.focus();
}

function goHome() {
  currentSection = null;
  window.scrollTo(0, 0);
  DOM.sectionPanel.classList.add("hidden");
  DOM.homePanel.classList.remove("hidden");
  updateHomeTiles();
}

function updateHomeTiles() {
  const d = lineupsData();
  const tl = document.getElementById("tileSubLineups");
  const cb = document.getElementById("tileSubBoards");
  const mt = document.getElementById("tileSubMytrain");
  if (d) {
    const cap = (d.meta.captured_at || {});
    const age = formatAge(cap.train_lineup);
    const cacheNote = LINEUPS.fromCache ? " · offline" : "";
    tl.textContent = `${d.train_lineup.train_count} trains · ${age || "?"}${cacheNote}`;
    cb.textContent = `${d.crew_boards.board_count} boards · ${formatAge(cap.crew_boards) || "?"}${cacheNote}`;
    const runarounds = visibleAlerts().filter((a) => a.type === "runaround_candidate").length;
    mt.textContent = runarounds
      ? `⚠ ${runarounds} possible runaround${runarounds === 1 ? "" : "s"} · find your train fast`
      : "Find where a train sits, fast";
    updateBellBadge();
  } else {
    tl.textContent = "no data yet";
    cb.textContent = "no data yet";
  }
  const cr = document.getElementById("tileSubCrossings");
  if (SNAPSHOT && SNAPSHOT.crossings) {
    cr.textContent = `${SNAPSHOT.crossings.length} FRA crossings`;
  }
  const rf = document.getElementById("tileSubReference");
  if (REFERENCE && REFERENCE.subdivisions) {
    rf.textContent = `${REFERENCE.subdivisions.length} subdivision cards`;
  }
  collectionBanner();
  const sd = document.getElementById("tileSubSidings");
  if (SNAPSHOT && SNAPSHOT.sidings) {
    sd.textContent = `${SNAPSHOT.sidings.length} controlled sidings`;
  }
}

// ===================== POPULATE CONTROLS =====================

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

function populateStationSelect() {
  const sel = DOM.stationSelect;
  sel.innerHTML = "";
  const d = lineupsData();
  const stations = d ? d.train_lineup.stations || [] : [];
  if (!stations.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No lineup data";
    sel.appendChild(opt);
    return;
  }
  stations.forEach((st) => {
    const opt = document.createElement("option");
    opt.value = st.location_code;
    opt.textContent = `${st.name || st.location_code} (${st.location_code})`;
    sel.appendChild(opt);
  });
}

function populateBoardSelect() {
  const sel = DOM.boardSelect;
  sel.innerHTML = "";
  const d = lineupsData();
  const boards = d ? d.crew_boards.boards || [] : [];
  if (!boards.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No board data";
    sel.appendChild(opt);
    return;
  }
  boards.forEach((b, i) => {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = b.label || b.screen_title || `Board ${i + 1}`;
    sel.appendChild(opt);
  });
}

// ===================== RENDER DISPATCH =====================

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
  if (!currentSection) return;

  let text = "";
  if (currentSection === "crossings") {
    text = renderCrossingsView(parseFeetValue(DOM.spacingInput, 5500));
  } else if (currentSection === "sidings") {
    text = renderSidingsView();
  } else if (currentSection === "tracks") {
    text = renderTrackLengthsView();
  } else if (currentSection === "lineups") {
    const r = renderLineupsTable();
    if (r === null) return;
    text = r;
  } else if (currentSection === "history") {
    const r = renderHistoryTable();
    if (r === null) return;
    text = r;
  } else if (currentSection === "boards") {
    const r = renderBoardsTable();
    if (r === null) return;
    text = r;
  } else if (currentSection === "reference") {
    const r = renderReferenceTable();
    if (r === null) return;
    text = r;
  } else if (currentSection === "mytrain") {
    const r = renderMyTrainTable();
    if (r === null) return;
    text = r;
  } else if (currentSection === "pay") {
    renderPayView();   // async: fetches the PRIVATE feed, writes output itself
    return;
  } else if (currentSection === "refmenu" || currentSection === "rsa" ||
             currentSection === "notifications") {
    // menu/control sections own their panel; no results text below
    DOM.resultsOutput.textContent = "";
    return;
  }

  if (!text.trim()) {
    text = "No matching data for the selected settings.";
  }
  DOM.resultsOutput.textContent = text;
}

// ===================== REFERENCE SECTIONS (crossings / sidings / tracks) =====================

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
    if (useThreshold && feet < spacingFt) continue;
    lines.push(formatCrossingLine(a));
    lines.push(`↓ ${feet.toLocaleString()} ft`);
    lines.push(formatCrossingLine(b));
    lines.push("");
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
  if (dot) parts.push("—", dot);
  return parts.join(" ");
}

function renderSidingsView() {
  const sub = getCurrentSubdivision();
  const sidings = getSidingsForCurrentSubdivision();
  const lines = [];
  if (sub) {
    lines.push(`Subdivision: ${sub.name || sub.id}`);
    lines.push("");
  }
  if (!sidings.length) {
    lines.push("No sidings in this subdivision for the current snapshot.");
    return lines.join("\n");
  }
  sidings.forEach((s) => {
    const totalFeet = s.length_ft != null
      ? s.length_ft
      : Math.round(Math.abs(s.mp_end - s.mp_start) * 5280);
    lines.push(`${s.name || "Unnamed Siding"}`);
    lines.push(`MP ${s.mp_start} – MP ${s.mp_end} — ${totalFeet.toLocaleString()} ft`);
    lines.push("");
  });
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
    lines.push("No track lengths recorded for this yard yet.");
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

// ===================== LIVE LINEUPS / BOARDS =====================
// Data: docs/data/lineups_snapshot.json, published by the CPKC Data
// Processor after each extraction sweep (program -> git repo -> app).

function lineupsData() {
  return LINEUPS && LINEUPS.data ? LINEUPS.data : null;
}

function formatAge(isoTs) {
  if (!isoTs) return "";
  const then = new Date(isoTs);
  if (isNaN(then.getTime())) return "";
  const mins = Math.round((Date.now() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ${mins % 60}m ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function updateFreshnessBar() {
  if (currentSection === "reference") {
    const gen = REFERENCE && REFERENCE.meta ? REFERENCE.meta.generated_at : "";
    DOM.freshnessText.textContent = REFERENCE
      ? `Reviewed card data · published ${gen ? gen.slice(0, 10) : "?"} · verify before use`
      : "Reference cards not available.";
    return;
  }
  if (currentSection === "crossings" || currentSection === "sidings"
      || currentSection === "tracks") {
    const gen = SNAPSHOT && SNAPSHOT.meta ? SNAPSHOT.meta.generated_at : "";
    DOM.freshnessText.textContent = gen
      ? `Reference snapshot · published ${gen.slice(0, 10)} · verify before use`
      : "Bundled reference data.";
    return;
  }
  const d = lineupsData();
  if (!d) {
    DOM.freshnessText.textContent = "No lineup data yet — will load when published.";
    return;
  }
  const key = currentSection === "boards" ? "crew_boards" : "train_lineup";
  const capturedAt = (d.meta.captured_at || {})[key] || "";
  // Operator rule: everything DISPLAYED is local time (Central for now).
  const when = capturedAt ? localTime(capturedAt) : "unknown";
  const age = formatAge(capturedAt);
  const cacheNote = LINEUPS.fromCache ? " · offline copy" : "";
  DOM.freshnessText.textContent =
    `Data as of ${when}${age ? ` (${age})` : ""}${cacheNote}` +
    ` · reference time ${localTime(new Date().toISOString())}`;
}

function crewNames(list) {
  return (list || [])
    .map((m) => (m && m.name ? m.name : ""))
    .filter(Boolean)
    .join(" ");
}

function formatTrainLines(t, lines) {
  const rc = t.rc ? "  RC" : "";
  lines.push(`${t.date_time}  ${t.train_asgn}${rc}  ${t.status || ""}`.trimEnd());
  const eng = `ENG ${t.eng_crew_pool || "?"}×${t.eng_crew_count || "0"}`;
  const trn = `TRN ${t.trn_crew_pool || "?"}×${t.trn_crew_count || "0"}`;
  lines.push(`  ${eng} · ${trn}`);
  const names = crewNames(t.eng_crew) + " " + crewNames(t.trn_crew);
  if (names.trim()) lines.push(`  Crew: ${names.trim()}`);
  if (t.information) lines.push(`  ${t.information}`);
  lines.push("");
}

// ===== V5 TABLE FRAMEWORK =====
// Columns-and-rows directive (operator 2026-08-18): real tables, sticky
// headers, horizontal scroll in-container. Renderers that build tables
// write into #tableOutput; text renderers keep using the <pre>.

function showTable(node) {
  const to = document.getElementById("tableOutput");
  to.innerHTML = "";
  to.appendChild(node);
  to.classList.remove("hidden");
  DOM.resultsOutput.classList.add("hidden");
}

function showText() {
  const to = document.getElementById("tableOutput");
  to.classList.add("hidden");
  DOM.resultsOutput.classList.remove("hidden");
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

// Local-time display (operator: everything shown is LOCAL — Central for
// now; UTC stays internal). ISO or feed timestamps -> "MM/DD HH:MM CT".
function localTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  const s = d.toLocaleString("en-US", { timeZone: "America/Chicago",
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hour12: false });
  return s.replace(",", "") + " CT";
}

function buildTable(headers, rows) {
  // rows: array of arrays; cells are strings or DOM nodes
  const wrap = el("div", "scroll-x");
  const table = el("table", "rc-table");
  const thead = el("thead");
  const hr = el("tr");
  headers.forEach((h) => hr.appendChild(el("th", null, h)));
  thead.appendChild(hr);
  table.appendChild(thead);
  const tbody = el("tbody");
  rows.forEach((r) => {
    const tr = el("tr");
    r.forEach((cell) => {
      const td = el("td");
      if (cell instanceof Node) td.appendChild(cell);
      else td.textContent = cell == null ? "" : String(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function crewCell(members) {
  // [{craft,name,hos:{band,label},on_in,tags}] -> chips with colored time
  const box = el("span");
  (members || []).forEach((m) => {
    const chip = el("span", "crew-chip");
    chip.appendChild(el("span", null, `${m.craft || ""} ${m.name || ""}`));
    if (m.hos && m.hos.label) {
      chip.appendChild(el("span", ` hos-${m.hos.band || "green"}`, ` ${m.hos.label}`));
    } else if (m.on_in) {
      chip.appendChild(el("span", " hos-green", ` on in ${m.on_in}`));
    }
    if (m.tags && m.tags.length) {
      chip.appendChild(el("span", " tag-dim", ` ${m.tags.join(",")}`));
    }
    box.appendChild(chip);
  });
  return box;
}

function renderLineupsTable() {
  const d = lineupsData();
  if (!d) { showText(); return "No lineup data available yet."; }
  updateFreshnessBar();
  const code = DOM.stationSelect.value;
  const st = (d.train_lineup.stations || []).find((s) => s.location_code === code)
    || (d.train_lineup.stations || [])[0];
  if (!st) { showText(); return "No stations in the current lineup snapshot."; }

  const rows = (st.trains || []).map((t) => [
    t.date_time || "",
    t.train_asgn || "",
    t.status || "",
    t.ordered || "",
    t.rc || "",
    crewCell(t.eng_crew),
    crewCell(t.trn_crew),
    (t.eng_crew_pool ? `${t.eng_crew_district || ""}${t.eng_crew_pool}` : (t.eng_planned_crew || "")),
    t.information || "",
  ]);
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `${(st.name || st.location_code).toUpperCase()} — ${st.trains.length} trains`));
  box.appendChild(buildTable(
    ["Date/Time", "Train", "Status", "Ord", "RC", "Eng Crew", "Trn Crew", "Pool", "Info"],
    rows));
  showTable(box);
  return null;   // table mode: nothing for the <pre>
}

function renderHistoryTable() {
  const d = lineupsData();
  if (!d || !d.train_history || !d.train_history.length) {
    showText();
    return "Train history appears after the next processor restart publishes the enriched feed.";
  }
  updateFreshnessBar();
  const rows = [];
  d.train_history.forEach((tr, i) => {
    const crew = el("span");
    (tr.members || []).forEach((m) => {
      const chip = el("span", "crew-chip", `${m.craft || ""} ${m.name || ""}`);
      crew.appendChild(chip);
    });
    const rowEl = [
      tr.date ? tr.date.slice(5) : "",
      tr.train || "",
      tr.on_duty || "—",
      tr.off_duty || "—",
      `${tr.depart || "?"}→${tr.arrive || "?"}`,
      crew,
      tr.pool || "",
    ];
    rows.push(rowEl);
  });
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `RECENT TRAINS — last 48h · ${d.train_history.length} trains · on/off duty times as captured`));
  box.appendChild(buildTable(
    ["Date", "Train", "On Duty", "Tie Up", "Route", "Crew", "Pool"], rows));
  showTable(box);
  return null;
}

function renderLineupsView() {
  const d = lineupsData();
  if (!d) return "No lineup data available yet.\n\nThe feed appears here once the Data Processor publishes it.";
  updateFreshnessBar();

  const code = DOM.stationSelect.value;
  const st = (d.train_lineup.stations || []).find((s) => s.location_code === code)
    || (d.train_lineup.stations || [])[0];
  if (!st) return "No stations in the current lineup snapshot.";

  const lines = [];
  lines.push(`${(st.name || st.location_code).toUpperCase()} — ${st.trains.length} trains`);
  lines.push("");
  st.trains.forEach((t) => formatTrainLines(t, lines));
  return lines.join("\n");
}

function renderBoardsTable() {
  const d = lineupsData();
  if (!d) { showText(); return "No crew board data available yet."; }
  updateFreshnessBar();
  const idx = parseInt(DOM.boardSelect.value, 10) || 0;
  const b = (d.crew_boards.boards || [])[idx];
  if (!b) { showText(); return "No boards in the current snapshot."; }
  const myName = (localStorage.getItem("railcore_my_name") || "").trim().toUpperCase();
  const rows = [];
  (b.rows || []).forEach((r) => {
    const raw = String(r.raw_line || "");
    const starred = /\*\w{0,2}\s+\d{3,4}\s+\d{3}/.test(raw);
    const hours = String(r.turn_hours || "").trim().split(/\s+/);
    const nameEl = el("span", null, r.employee_name || "");
    const isMe = myName && String(r.employee_name || "").toUpperCase().startsWith(myName.slice(0, 12));
    if (isMe) nameEl.textContent += "  ◀ you";
    const tr = [
      r.position || "", r.turn_asgn || "", (starred ? "*" : "") + (r.craft_code || ""),
      nameEl, hours[0] || "—", hours[1] || "—",
      r.status_code || (starred ? "marked off" : ""),
    ];
    tr._cls = (starred ? "row-off " : "") + (isMe ? "row-me" : "");
    rows.push(tr);
  });
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `${b.screen_title || b.label} · position order = calling order`));
  const wrap = buildTable(["Pos", "Turn", "CR", "Name", "MTOD", "MTPD", "Status"], rows);
  // row classes (greyed marked-off, highlighted me — operator locked-in)
  const trs = wrap.querySelectorAll("tbody tr");
  rows.forEach((r, i) => { if (r._cls) trs[i].className = r._cls.trim(); });
  box.appendChild(wrap);
  showTable(box);
  return null;
}

function renderBoardsView() {
  const d = lineupsData();
  if (!d) return "No crew board data available yet.\n\nThe feed appears here once the Data Processor publishes it.";
  updateFreshnessBar();

  const idx = parseInt(DOM.boardSelect.value, 10) || 0;
  const b = (d.crew_boards.boards || [])[idx];
  if (!b) return "No boards in the current snapshot.";

  const lines = [];
  lines.push(`${b.label || b.screen_title}  [${b.subdistrict || ""}]`);
  lines.push("");
  if (!b.rows || !b.rows.length) {
    lines.push("(no one on this board in the last sweep)");
    return lines.join("\n");
  }
  lines.push("POS  TURN   CR  NAME                     MTOD MTPD");
  b.rows.forEach((r) => {
    const pos = String(r.position || "").padStart(3);
    const turn = String(r.turn_asgn || "").padEnd(6);
    const cr = String(r.craft_code || "").padEnd(3);
    const nm = String(r.employee_name || "").padEnd(24);
    const hours = String(r.turn_hours || "").trim(); // verbatim from the board
    const stc = String(r.status_code || "");
    const away = r.home_away ? "  AWAY" : "";
    lines.push(`${pos}  ${turn} ${cr} ${nm}${hours ? " " + hours : ""}${stc ? "  " + stc : ""}${away}`);
  });
  return lines.join("\n");
}

// ===================== MY TRAIN (quick find) =====================
// Search every station's lineup for a symbol fragment: two taps from app
// open to "where does my train sit".

// ===================== ALERT CARDS =====================
// Feed alerts are already claim-reconciled server-side: when the Data
// Processor sees a matching RA claim in the captured timeslips, the flag
// retires and vanishes from the feed automatically. localStorage holds the
// user's own immediate marks (claimed/dismissed) for alerts still in feed.

const ALERT_STATE_KEY = "railcore_alert_state_v1";

function alertState() {
  try { return JSON.parse(localStorage.getItem(ALERT_STATE_KEY) || "{}"); }
  catch (_) { return {}; }
}

function setAlertState(id, state) {
  const s = alertState();
  s[id] = state;
  try { localStorage.setItem(ALERT_STATE_KEY, JSON.stringify(s)); } catch (_) {}
  renderAlertCards();
  updateHomeTiles();
}

function visibleAlerts() {
  const d = lineupsData();
  const handled = alertState();
  return (d && d.alerts ? d.alerts : []).filter((a) => !handled[a.id]);
}

function updateBellBadge() {
  const n = visibleAlerts().length;
  DOM.bellBadge.textContent = String(n);
  DOM.bellBadge.classList.toggle("hidden", n === 0);
}

function renderAlertCards() {
  const panel = DOM.alertsPanel;
  panel.innerHTML = "";
  const alerts = visibleAlerts();
  updateBellBadge();
  if (!alerts.length) {
    const empty = document.createElement("div");
    empty.className = "notif-group-title";
    empty.textContent = "No notifications. All clear.";
    panel.appendChild(empty);
    return;
  }

  const runarounds = alerts.filter((a) => a.type === "runaround_candidate");
  const quiet = alerts.filter((a) => a.type !== "runaround_candidate");

  if (runarounds.length) {
    const h = document.createElement("div");
    h.className = "notif-group-title";
    h.textContent = "Possible runarounds";
    panel.appendChild(h);
    runarounds.forEach((a) => panel.appendChild(buildAlertCard(a, false)));
  }
  if (quiet.length) {
    const h = document.createElement("div");
    h.className = "notif-group-title";
    h.textContent = `Train watch — hidden-late-train flags (${quiet.length})`;
    panel.appendChild(h);
    quiet.forEach((a) => panel.appendChild(buildAlertCard(a, true)));
  }
}

function buildAlertCard(a, isQuiet) {
    const card = document.createElement("div");
    card.className = isQuiet ? "alert-card quiet" : "alert-card";

    const head = document.createElement("div");
    head.className = "alert-head";
    const title = document.createElement("div");
    title.className = "alert-title";
    title.textContent = a.type === "runaround_candidate"
      ? `⚠ Possible runaround — ${a.train}`
      : `⚠ ${a.train}: ${a.note || a.type}`;
    const when = document.createElement("div");
    when.className = "alert-when";
    when.textContent = (a.when || "").replace("T", " ");
    head.appendChild(title);
    head.appendChild(when);

    const body = document.createElement("div");
    body.className = "alert-body hidden";
    if (a.type === "runaround_candidate") {
      const lines = [
        `Went to: ${a.went_to || "?"} (${a.their_turn || "?"})`,
        a.planned_pool ? `Train's planned pool: ${a.planned_pool}` : "",
        a.call_by ? `Call would have been made by ${a.call_by}` : "",
        a.remedy ? `If upheld: ${a.remedy}` : "",
      ].filter(Boolean);
      body.innerHTML = lines.map((l) => `<div>${l}</div>`).join("");
      if (a.verify && a.verify.length) {
        body.innerHTML += `<div class="rule-cite">Check before claiming: ${a.verify.join("; ")}</div>`;
      }
      if (a.rule) {
        body.innerHTML += `<div class="rule-cite">${a.rule}</div>`;
      }
    } else {
      body.textContent = a.note || "";
    }

    const actions = document.createElement("div");
    actions.className = "alert-actions hidden";
    if (a.type === "runaround_candidate") {
      const btnClaimed = document.createElement("button");
      btnClaimed.className = "btn btn-primary btn-small";
      btnClaimed.textContent = "I filed a claim";
      btnClaimed.addEventListener("click", (e) => {
        e.stopPropagation();
        setAlertState(a.id, "claimed");
      });
      actions.appendChild(btnClaimed);
    }
    if (a.type === "upstream_unlisting" && a.station) {
      // Deep link: jump to the Lineups screen at the flagged station.
      const btnView = document.createElement("button");
      btnView.className = "btn btn-primary btn-small";
      btnView.textContent = "View lineup";
      btnView.addEventListener("click", (e) => {
        e.stopPropagation();
        openSection("lineups");
        DOM.stationSelect.value = a.station;
        renderCurrentView();
      });
      actions.appendChild(btnView);
    }
    const btnDismiss = document.createElement("button");
    btnDismiss.className = "btn btn-secondary btn-small";
    btnDismiss.textContent = "Dismiss";
    btnDismiss.addEventListener("click", (e) => {
      e.stopPropagation();
      setAlertState(a.id, "dismissed");
    });
    actions.appendChild(btnDismiss);

    head.addEventListener("click", () => {
      body.classList.toggle("hidden");
      actions.classList.toggle("hidden");
    });

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(actions);
    return card;
}

// Personal picture: CURRENT status first (latest ticket + HOS clock, board
// position, crew-list appearances), HISTORY separate below (operator
// request 2026-08-17). Name is a local, device-only setting.
function hosLine(t) {
  // 12h federal window from on-duty; only meaningful while not tied up.
  try {
    const on = new Date(`${t.date}T${t.on_duty.slice(0,2)}:${t.on_duty.slice(2)}:00`);
    const mins = Math.round((Date.now() - on.getTime()) / 60000);
    if (mins < 0 || mins > 24 * 60) return "";
    const left = 12 * 60 - mins;
    const h = Math.floor(Math.abs(left) / 60), m = Math.abs(left) % 60;
    return left >= 0
      ? `  On duty ${Math.floor(mins/60)}h ${mins%60}m — HOS remaining ${h}h ${String(m).padStart(2,"0")}m`
      : `  On duty ${Math.floor(mins/60)}h ${mins%60}m — PAST 12h by ${h}h ${String(m).padStart(2,"0")}m`;
  } catch (_) { return ""; }
}

function renderMyStatus(d) {
  const me = (localStorage.getItem("railcore_my_name") || "").trim().toUpperCase();
  if (!me || me.length < 3) {
    return "Set MY NAME above (once) to see your current status here.\n\n";
  }
  const lines = [`— YOU (${me}) — CURRENT —`];
  let found = false;

  const mine = (d.my_status || []).find((s) =>
    (s.name || "").toUpperCase().startsWith(me) || me.startsWith((s.name || "").toUpperCase()));
  const tickets = mine ? mine.tickets || [] : [];

  // CURRENT = a ticket that is live NOW (operator 2026-08-17): called but
  // not yet on duty (future on-duty), or on duty with no tie-up recorded,
  // within a 16h envelope. A tie-up or an old on-duty = HISTORY.
  function ticketOnMs(t) {
    try {
      return new Date(`${t.date}T${t.on_duty.slice(0,2)}:${t.on_duty.slice(2)}:00`).getTime();
    } catch (_) { return NaN; }
  }
  function isActive(t) {
    if (t.off_duty) return false;
    const on = ticketOnMs(t);
    if (isNaN(on)) return false;
    const hrs = (Date.now() - on) / 36e5;
    return hrs < 16; // future call (negative) or an open tour
  }
  const current = tickets.find(isActive);
  const past = tickets.filter((t) => t !== current);

  if (current) {
    const on = ticketOnMs(current);
    const future = on > Date.now();
    lines.push((future ? "Called for: " : "ON DUTY: ") +
      `${current.train} (${current.craft}, turn ${current.turn}/${current.pool})`);
    lines.push(`  ${current.date} on-duty ${current.on_duty}` +
      (future ? ` — in ${Math.round((on - Date.now())/36e5 * 10)/10}h` : ""));
    if (current.dep || current.arr) lines.push(`  Leg: ${current.dep || "?"} → ${current.arr || "?"}`);
    if (!future) { const h = hosLine(current); if (h) lines.push(h); }
  } else {
    lines.push("No active call in captured data" +
      (tickets.length ? ` (latest ticket ${tickets[0].date})` : "") + ".");
  }

  (d.crew_boards.boards || []).forEach((b) => {
    (b.rows || []).forEach((r) => {
      if ((r.employee_name || "").toUpperCase().startsWith(me)) {
        found = true;
        lines.push(`Board: ${b.label || b.screen_title} — POS ${r.position}` +
          `, turn ${r.turn_asgn}${r.home_away ? " (AWAY)" : ""}`);
      }
    });
  });
  (d.train_lineup.stations || []).forEach((st) => {
    (st.trains || []).forEach((t) => {
      const crew = (t.eng_crew || []).concat(t.trn_crew || []);
      if (crew.some((m) => (m.name || "").toUpperCase().startsWith(me))) {
        found = true;
        lines.push(`On lineup: ${t.train_asgn} at ${st.name || st.location_code}` +
          ` — ${t.date_time} ${t.status || ""}`);
      }
    });
  });
  if (!found && !tickets.length) {
    lines.push("Not currently on any captured board or crew list.");
  }

  if (past.length) {
    lines.push("");
    lines.push("— HISTORY —");
    // First history entry keeps the full detail (operator preference).
    const h0 = past[0];
    lines.push(`${h0.train} (${h0.craft}, turn ${h0.turn}/${h0.pool})`);
    lines.push(`  ${h0.date} on-duty ${h0.on_duty}` +
      (h0.off_duty ? ` — tied up ${h0.off_duty}` : ""));
    if (h0.dep || h0.arr) lines.push(`  Leg: ${h0.dep || "?"} → ${h0.arr || "?"}`);
    past.slice(1, 11).forEach((t) => {
      lines.push(`${t.date}  ${t.on_duty}  ${t.train}  (${t.craft} ${t.turn}/${t.pool})` +
        (t.off_duty ? `  tied up ${t.off_duty}` : ""));
    });
  }

  lines.push("");
  lines.push("────────────────────");
  lines.push("");
  return lines.join("\n");
}

function renderMyTrainTable() {
  const d = lineupsData();
  if (!d) { showText(); return "No lineup data available yet."; }
  const q = (DOM.trainFindInput.value || "").trim().toUpperCase();
  const box = el("div");

  // RIGHT NOW card (operator: current = where I am right now)
  const me = (d.my_status || [])[0];
  if (me && me.tickets && me.tickets.length) {
    const cur = me.tickets[0];
    box.appendChild(el("div", "table-title",
      `RIGHT NOW — ${me.name || ""}: last ticket ${cur.train || ""} ` +
      `(${cur.craft || ""}) on ${cur.date || ""}, ` +
      `${cur.on_duty || "?"} → ${cur.off_duty || "on duty / not tied up"}`));
    const hrows = me.tickets.slice(0, 14).map((tk) => [
      tk.date || "", tk.train || "", tk.craft || "",
      tk.on_duty || "—", tk.off_duty || "—",
      `${tk.dep || "?"}→${tk.arr || "?"}`,
      tk.pool ? `${tk.pool}${tk.turn ? "/" + tk.turn : ""}` : "",
    ]);
    box.appendChild(el("div", "table-title", "YOUR HISTORY — captured tickets"));
    box.appendChild(buildTable(
      ["Date", "Train", "Seat", "On", "Off", "Route", "Pool"], hrows));
  }

  if (q.length >= 2) {
    const rows = [];
    (d.train_lineup.stations || []).forEach((st) => {
      (st.trains || []).forEach((tr) => {
        if (!String(tr.train_asgn || "").toUpperCase().includes(q)) return;
        const crew = el("span");
        (tr.eng_crew || []).concat(tr.trn_crew || []).forEach((m) => {
          const chip = el("span", "crew-chip", `${m.craft || ""} ${m.name || ""}`);
          if (m.hos && m.hos.label) chip.appendChild(el("span", ` hos-${m.hos.band || "green"}`, ` ${m.hos.label}`));
          crew.appendChild(chip);
        });
        rows.push([(st.name || st.location_code), tr.date_time || "",
                   tr.train_asgn || "", tr.status || "", crew,
                   (tr.eng_crew_pool ? `${tr.eng_crew_district || ""}${tr.eng_crew_pool}` : "")]);
      });
    });
    box.appendChild(el("div", "table-title",
      `"${q}" — ${rows.length} listing${rows.length === 1 ? "" : "s"} across the corridor`));
    if (rows.length) {
      box.appendChild(buildTable(["Station", "Date/Time", "Train", "Status", "Crew", "Pool"], rows));
    }
  } else {
    box.appendChild(el("div", "table-title",
      "Type at least 2 characters of a train symbol to search every station."));
  }
  showTable(box);
  return null;
}

function renderMyTrainView() {
  const d = lineupsData();
  if (!d) return "No lineup data available yet.";

  const personal = renderMyStatus(d);
  const q = (DOM.trainFindInput.value || "").trim().toUpperCase();
  const stations = d.train_lineup.stations || [];

  if (q.length < 2) {
    // Show the symbols on the board right now as tappable hints.
    const symbols = new Set();
    stations.forEach((st) => st.trains.forEach((t) => {
      const base = String(t.train_asgn || "").split("-")[0];
      if (base) symbols.add(base);
    }));
    return personal + "Type at least 2 characters of a train symbol.\n\n" +
      `On the board right now (${symbols.size} symbols):\n` +
      [...symbols].sort().join("  ");
  }

  const lines = [];
  let hits = 0;
  stations.forEach((st) => {
    const matches = st.trains.filter((t) =>
      String(t.train_asgn || "").toUpperCase().includes(q));
    if (!matches.length) return;
    lines.push(`═══ ${(st.name || st.location_code).toUpperCase()} ═══`);
    matches.forEach((t) => { hits += 1; formatTrainLines(t, lines); });
  });

  if (!hits) return `No train matching "${q}" on any station's lineup.`;
  lines.unshift("");
  lines.unshift(`"${q}" — ${hits} listing${hits === 1 ? "" : "s"} across the corridor`);
  return lines.join("\n");
}

// ===================== SUBDIVISION REFERENCE (cheat-sheet cards) =====================
// Data: docs/data/subdivision_reference.json, compiled by the CPKC
// Subdivision CheatSheets program from reviewed, source-cited card data.

function renderReferenceTable() {
  if (!REFERENCE || !REFERENCE.subdivisions) {
    showText(); return "Reference cards not available yet.";
  }
  const card = REFERENCE.subdivisions.find((c) => c.id === currentSubdivisionId)
    || REFERENCE.subdivisions[0];
  if (!card) { showText(); return "No card for this subdivision."; }
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `${card.name || card.id}${card.effective ? " · effective " + card.effective : ""}`));

  if (card.facts && card.facts.length) {
    box.appendChild(buildTable(["Item", "Value"],
      card.facts.map((f) => [f.label || "", f.value || ""])));
  }
  if (card.directionNote) {
    box.appendChild(el("div", "table-title", card.directionNote));
  }
  if (card.station && card.station.rows) {
    box.appendChild(el("div", "table-title",
      card.station.title || "STATIONS BY MILEPOST"));
    // Radio dial-up columns (operator 2026-08-19): remote switch request
    // codes (GCOR 8.19.1), rendered only where the card carries them
    // (Chicago Sub today; other subs stay four-column).
    const hasSw = card.station.rows.some((r) => r.swN || r.swR || r.swQ);
    if (hasSw) {
      box.appendChild(buildTable(
        ["MP", "MOP", "Location", "Sw Nml", "Sw Rev", "Sw Qry", "Notes"],
        card.station.rows.map((r) => [r.mp || "", r.mop || "",
          (r.sub ? "   " : "") + (r.loc || ""),
          r.swN || "", r.swR || "", r.swQ || "", r.notes || ""])));
      if (card.station.caption) {
        box.appendChild(el("div", "table-title", card.station.caption));
      }
    } else {
      box.appendChild(buildTable(["MP", "MOP", "Location", "Notes"],
        card.station.rows.map((r) => [r.mp || "", r.mop || "",
          (r.sub ? "   " : "") + (r.loc || ""), r.notes || ""])));
    }

    // MILEPOST LADDER (operator 2026-08-18): stations + public crossings
    // interleaved in MP order; crossing rows dimmed, with the distance
    // since the PREVIOUS crossing so spacing reads in line order.
    const xs = ((SNAPSHOT && SNAPSHOT.crossings) || [])
      .filter((c) => c.subdivision_id === card.id)
      .map((c) => ({ mp: Number(c.mp), kind: "crossing", c }));
    if (xs.length) {
      const sts = card.station.rows
        .filter((r) => r.mp !== undefined && r.mp !== null && String(r.mp) !== "")
        .map((r) => ({ mp: Number(r.mp), kind: "station", r }));
      const ladder = xs.concat(sts).sort((a2, b2) => a2.mp - b2.mp);
      let prevX = null;
      const rows = ladder.map((it) => {
        if (it.kind === "station") {
          const row = [String(it.r.mp), it.r.loc || "", "", "STATION",
                       "", it.r.notes || ""];
          row._cls = "row-me";
          return row;
        }
        const gap = prevX === null ? "" :
          Math.round((it.mp - prevX) * 5280).toLocaleString() + " ft";
        prevX = it.mp;
        const row = [String(it.c.mp),
          `${it.c.road_common || it.c.road_name || ""}${it.c.city ? " · " + it.c.city : ""}`,
          gap, "crossing", it.c.protection || "", it.c.dot_number || ""];
        row._cls = "row-off";
        return row;
      });
      box.appendChild(el("div", "table-title",
        `MILEPOST LADDER — stations + ${xs.length} public crossings in line order · ` +
        `FRA mileposts shown verbatim: branch/spur crossings may interleave, and a ` +
        `gap that spans a branch boundary is not a real distance`));
      const lt = buildTable(["MP", "Feature", "Gap since prev xing", "Type", "Protection", "DOT# / Notes"], rows);
      rows.forEach((r, i) => { if (r._cls) lt.querySelectorAll("tbody tr")[i].className = r._cls; });
      box.appendChild(lt);
    }
  }
  (card.back || []).forEach((sec) => {
    if (!sec.title) return;
    box.appendChild(el("div", "table-title", sec.title));
    if (sec.type === "table" && sec.rows && sec.rows.length) {
      const width = Math.max(...sec.rows.map((r) => r.length));
      const headers = Array.from({length: width}, (_, i) => sec.headers && sec.headers[i] ? sec.headers[i] : " ");
      box.appendChild(buildTable(headers, sec.rows));
    } else if (sec.items) {
      box.appendChild(buildTable(["", "Item"],
        sec.items.map((it) => [it.lead || "", it.text || ""])));
    }
  });
  box.appendChild(el("div", "table-title",
    "Reviewed card data · verify before use"));
  showTable(box);
  return null;
}

function renderReferenceView() {
  if (!REFERENCE || !REFERENCE.subdivisions) {
    return "Reference cards not available yet.";
  }
  const card = REFERENCE.subdivisions.find((c) => c.id === currentSubdivisionId)
    || REFERENCE.subdivisions[0];
  if (!card) return "No card for this subdivision.";

  const lines = [];
  lines.push(card.name || card.id);
  if (card.effective) lines.push(`Effective: ${card.effective}`);
  lines.push("");

  (card.facts || []).forEach((f) => lines.push(`${f.label}: ${f.value}`));
  if (card.directionNote) {
    lines.push("");
    lines.push(card.directionNote);
  }

  if (card.station && card.station.rows) {
    lines.push("");
    lines.push(`── ${card.station.title || "STATIONS BY MILEPOST"} ──`);
    card.station.rows.forEach((r) => {
      const mp = String(r.mp || "").padStart(6);
      const mop = String(r.mop || "").padEnd(4);
      const loc = String(r.loc || "");
      const pre = r.sub ? "   " : "";
      let line = `${mp}  ${mop} ${pre}${loc}`;
      if (r.notes) line += ` — ${r.notes}`;
      lines.push(line);
    });
  }

  (card.back || []).forEach((sec) => {
    if (!sec.title) return;
    lines.push("");
    lines.push(`── ${sec.title} ──`);
    if (sec.type === "table" && sec.rows) {
      sec.rows.forEach((row) => {
        lines.push(row.filter((cell) => String(cell).trim() !== "").join("  ·  "));
      });
    } else if (sec.items) {
      sec.items.forEach((it) => {
        const lead = it.lead ? `${it.lead} ` : "";
        lines.push(`${lead}${it.text || ""}`.trim());
      });
    }
  });

  if (card.footer) {
    lines.push("");
    lines.push(card.footer);
  }
  return lines.join("\n");
}

// ===================== PAY (PRIVATE FEED) =====================
// Personal/financial data NEVER rides the public Pages feed. The processor
// publishes personal_feed.json into the operator's PRIVATE approve repo;
// this section reads it with the same device-stored token as Remote RSA.
// Iron Horse taxonomy, our data: everything pre-populated from captures;
// expected pay from the cited rules (27/28 validated to the penny).

let PERSONAL = null;

async function loadPersonalFeed() {
  const t = (localStorage.getItem("railcore_rsa_token") || "").trim();
  const r = (localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve").trim();
  if (!t) return { error: "Set your token in the Remote RSA screen first — pay data is private and needs it." };
  try {
    const resp = await fetch(`https://api.github.com/repos/${r}/contents/personal/personal_feed.json`, {
      headers: { "Authorization": `Bearer ${t}`, "Accept": "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!resp.ok) return { error: `No personal feed yet (HTTP ${resp.status}).` };
    const j = await resp.json();
    PERSONAL = JSON.parse(atob(j.content.replace(/\s/g, "")));
    return PERSONAL;
  } catch (e) {
    return { error: "Fetch failed: " + e.message };
  }
}

function renderPayView() {
  showText();
  DOM.resultsOutput.textContent = "Loading private pay feed…";
  loadPersonalFeed().then((d) => {
    if (currentSection !== "pay") return;
    if (d.error) { showText(); DOM.resultsOutput.textContent = d.error; return; }
    // TABLES first (operator: mockup layout preferred), text detail last.
    const box = el("div");
    box.appendChild(el("div", "table-title",
      `PRIVATE — ${d.meta.member} · FRA starts: ${d.fra_starts.streak} consecutive (6 = off the board)`));

    // Weekly table + gray half totals
    const halves = {};
    const wrows = (d.weekly || []).map((w) => {
      const dt = new Date(w.week_of);
      const half = `${w.week_of.slice(0, 7)}-${dt.getUTCDate() <= 15 ? "H1" : "H2"}`;
      halves[half] = halves[half] || { earned: 0, starts: 0 };
      halves[half].earned += w.earned; halves[half].starts += w.trips;
      return [w.week_of, "$" + w.earned.toFixed(2), w.trips,
              "$" + d.guarantee_reference.EN_weekly_geb + " ref",
              w.claims_pending ? w.claims_pending + " pending" : "—"];
    });
    Object.keys(halves).sort().reverse().forEach((h) => {
      const r = [h + " TOTAL", "$" + halves[h].earned.toFixed(2),
                 halves[h].starts, "", ""];
      r._cls = "row-off";
      wrows.push(r);
    });
    box.appendChild(el("div", "table-title", "WEEKLY — bid weeks Sat→Fri"));
    const wt = buildTable(["Week of", "Earned", "Starts", "Guarantee", "Claims"], wrows);
    wrows.forEach((r, i) => { if (r._cls) wt.querySelectorAll("tbody tr")[i].className = r._cls; });
    box.appendChild(wt);

    // Starts table
    const srows = (d.trips || []).map((tr) => {
      const r = [tr.date, tr.train, tr.craft || "",
        tr.hours != null ? tr.hours.toFixed(2) : "—",
        tr.paid != null ? "$" + tr.paid.toFixed(2) : "—",
        tr.expected != null ? "$" + tr.expected.toFixed(2) : "—",
        (tr.delta != null && Math.abs(tr.delta) > 0.05)
          ? (tr.delta > 0 ? "+" : "") + "$" + tr.delta.toFixed(2) + " ⚠" : "✓",
        tr.status || ""];
      return r;
    });
    box.appendChild(el("div", "table-title", "STARTS — work tours only, paid vs expected"));
    box.appendChild(buildTable(["Date", "Train", "Seat", "Hrs", "Paid", "Expected", "Δ", "Status"], srows));

    // Claims / other lines table
    const orows = (d.other_lines || []).map((o) => [
      o.date, o.msc || "?", o.train,
      o.paid != null ? (o.amt_type === "H" ? o.paid.toFixed(2) + "h" : "$" + o.paid.toFixed(2)) : "—",
      o.status || ""]);
    box.appendChild(el("div", "table-title", "CLAIMS · MEALS · HELD-AWAY (never counted as starts)"));
    box.appendChild(buildTable(["Date", "Code", "Assignment", "Amount", "Status"], orows));
    box.appendChild(el("div", "table-title",
      `Feed generated ${localTime(d.meta.generated_at)} · expected pay from cited rules`));
    showTable(box);
  });
  return;
  // (legacy text path below retained for reference; unreachable)
  loadPersonalFeed().then((d) => {
    if (currentSection !== "pay") return;
    if (d.error) { DOM.resultsOutput.textContent = d.error; return; }
    const L = [];
    L.push(`PRIVATE — ${d.meta.member}`);
    L.push(`Feed generated ${String(d.meta.generated_at).slice(0, 16).replace("T", " ")}`);
    L.push("");
    L.push(`FRA STARTS: ${d.fra_starts.streak} consecutive (6 = auto off the board)`);
    L.push("");
    L.push("WEEKLY (bid weeks, Sat→Fri)");
    L.push(`  EN GEB guarantee reference: $${d.guarantee_reference.EN_weekly_geb}`);
    // Halves: H1 = 1st–15th, H2 = 16th–end (same split as the pay periods).
    const halves = {};
    (d.weekly || []).forEach((w) => {
      L.push(`  wk of ${w.week_of}: $${w.earned.toFixed(2)} · ${w.trips} starts` +
        (w.claims_pending ? ` · ${w.claims_pending} claim(s) pending` : ""));
      const dt = new Date(w.week_of);
      const half = `${w.week_of.slice(0, 7)}-${dt.getUTCDate() <= 15 ? "H1" : "H2"}`;
      halves[half] = halves[half] || { earned: 0, starts: 0 };
      halves[half].earned += w.earned; halves[half].starts += w.trips;
    });
    Object.keys(halves).sort().reverse().forEach((h) => {
      L.push(`    — ${h} total: $${halves[h].earned.toFixed(2)} · ${halves[h].starts} starts`);
    });
    L.push("");
    L.push("STARTS (work tours only — claims never count as starts)");
    (d.trips || []).forEach((tr) => {
      let line = `  ${tr.date} ${tr.train} ${tr.craft || ""}`;
      if (tr.hours != null) line += ` ${tr.hours.toFixed(2)}h`;
      if (tr.paid != null) line += ` paid $${tr.paid.toFixed(2)}`;
      if (tr.expected != null) line += ` exp $${tr.expected.toFixed(2)}`;
      if (tr.delta != null && Math.abs(tr.delta) > 0.05) {
        line += `  Δ ${tr.delta > 0 ? "+" : ""}$${tr.delta.toFixed(2)} ⚠`;
      }
      if (tr.status) line += `  [${tr.status}]`;
      L.push(line);
    });
    L.push("");
    L.push("OTHER LINES (claims, meals, held-away)");
    (d.other_lines || []).forEach((o) => {
      let line = `  ${o.date} ${o.msc || "?"} ${o.train}`;
      if (o.paid != null) line += o.amt_type === "H" ? ` ${o.paid.toFixed(2)}h` : ` $${o.paid.toFixed(2)}`;
      if (o.status) line += `  [${o.status}]`;
      L.push(line);
    });
    DOM.resultsOutput.textContent = L.join("\n");
  });
}

// ===================== REMOTE RSA APPROVE =====================
// The operator types the RSA code HERE; it lands as a one-shot file in a
// PRIVATE repo the operator owns, and the laptop's login advancer (parked
// at rsa_wait) consumes it within ~10s and types it into the login page.
// The human still provides the factor; only the keyboard moved. Token is
// device-local; the code expires server-side after 90 seconds.

async function pollRsaStatus() {
  // Live laptop feedback: the login advancer posts its stage to
  // status/login_status.json in the approve repo on every stage change
  // ("ready for code" -> "code received" -> "LOGIN SUCCESSFUL"). Shown
  // here so the operator knows exactly when to send and whether it took.
  const el = document.getElementById("rsaLive");
  const block = document.getElementById("rsaBlock");
  if (!el || !block || block.classList.contains("hidden")) return;
  const t = (localStorage.getItem("railcore_rsa_token") || "").trim();
  const r = (localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve").trim();
  if (!t) { el.textContent = "Set the token below to see live laptop status."; return; }
  try {
    const resp = await fetch(`https://api.github.com/repos/${r}/contents/status/login_status.json`, {
      headers: { "Authorization": `Bearer ${t}`, "Accept": "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!resp.ok) { el.textContent = "No laptop status posted yet."; return; }
    const j = await resp.json();
    const s = JSON.parse(atob(j.content));
    const age = Math.max(0, Math.round((Date.now() - new Date(s.at).getTime()) / 1000));
    const ageTxt = age < 120 ? `${age}s ago` : age < 5400 ? `${Math.round(age / 60)}m ago`
               : `${(age / 3600).toFixed(1)}h ago`;
    const icon = s.stage === "login_successful" ? "✅"
             : s.stage === "rsa_wait" ? "🟢"
             : s.stage === "code_rejected" ? "⚠️" : "⏳";
    el.textContent = `${icon} ${s.message} (${ageTxt})`;
  } catch (e) {
    el.textContent = "Status check failed: " + e.message;
  }
}

function bindRsa() {
  const tok = document.getElementById("rsaToken");
  const repo = document.getElementById("rsaRepo");
  const code = document.getElementById("rsaCode");
  const send = document.getElementById("rsaSend");
  const result = document.getElementById("rsaResult");
  if (!send) return;
  pollRsaStatus();
  setInterval(pollRsaStatus, 8000);
  tok.value = localStorage.getItem("railcore_rsa_token") || "";
  repo.value = localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve";
  tok.addEventListener("input", () => localStorage.setItem("railcore_rsa_token", tok.value.trim()));
  repo.addEventListener("input", () => localStorage.setItem("railcore_rsa_repo", repo.value.trim()));
  send.addEventListener("click", async () => {
    const t = tok.value.trim(), r = repo.value.trim(), c = code.value.trim();
    if (!t || !r || !c) { result.textContent = "Need token, repo, and code."; return; }
    result.textContent = "Sending…";
    try {
      const path = `rsa/code-${Date.now()}.json`;
      const body = {
        message: "rsa approve",
        content: btoa(JSON.stringify({
          code: c, created_at: new Date().toISOString() })),
      };
      const resp = await fetch(`https://api.github.com/repos/${r}/contents/${path}`, {
        method: "PUT",
        headers: {
          "Authorization": `Bearer ${t}`,
          "Accept": "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        result.textContent = "✓ Sent. The laptop picks it up within ~10s and logs in. Code expires in 90s.";
        code.value = "";
      } else {
        result.textContent = `Failed (${resp.status}): check token/repo.`;
      }
    } catch (e) {
      result.textContent = "Network error: " + e.message;
    }
  });
}

// ===== DEAD-MAN HEALTH (operator 2026-08-19) =====
// Two independent signals so a death is never silent:
//  (a) token-free: the public feed's own age -- if the newest capture is
//      older than STALE during active hours, collection has likely stopped.
//  (b) authoritative: the watchdog's health.json in the private approve
//      repo (needs the stored token) -- distinguishes 'process died' from
//      'laptop off' and reports auto-restart.
const HEALTH_STALE_MIN = 20;

function pollHealth() {
  const strip = document.getElementById("healthStrip");
  if (!strip) return;

  function paint(cls, text) {
    strip.className = "health-strip " + cls;
    strip.textContent = text;
    strip.classList.toggle("hidden", cls === "ok");
  }

  // (a) token-free staleness from the feed we already have
  const d = lineupsData();
  let feedAgeMin = null;
  if (d && d.meta && d.meta.captured_at) {
    const times = Object.values(d.meta.captured_at).filter(Boolean)
      .map((x) => new Date(x).getTime()).filter((n) => !isNaN(n));
    if (times.length) feedAgeMin = Math.round((Date.now() - Math.max(...times)) / 60000);
  }

  // (b) authoritative watchdog verdict if we have a token
  const tok = (localStorage.getItem("railcore_rsa_token") || "").trim();
  const repo = (localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve").trim();
  const applyFeed = () => {
    if (feedAgeMin != null && feedAgeMin > HEALTH_STALE_MIN) {
      paint("stale", `⚠ Data ${feedAgeMin}m old — collection may be down`);
    } else {
      paint("ok", "");
    }
  };
  if (!tok) { applyFeed(); return; }

  fetch(`https://api.github.com/repos/${repo}/contents/status/health.json`, {
    headers: { "Authorization": `Bearer ${tok}`, "Accept": "application/vnd.github+json" },
    cache: "no-store",
  }).then((r) => r.ok ? r.json() : null).then((j) => {
    if (!j) { applyFeed(); return; }
    const h = JSON.parse(atob(j.content.replace(/\s/g, "")));
    const checkedAgeMin = Math.round((Date.now() - new Date(h.checked_at).getTime()) / 60000);
    if (checkedAgeMin > 5) {
      // watchdog itself is silent -> fall back to feed age, note it
      applyFeed();
      if (feedAgeMin == null || feedAgeMin <= HEALTH_STALE_MIN) {
        paint("stale", `⚠ Watchdog silent ${checkedAgeMin}m — status uncertain`);
      }
      return;
    }
    if (h.status === "down") paint("down", `🔴 ${h.message}`);
    else if (h.status === "stale") paint("stale", `⚠ ${h.message}`);
    else if (h.status === "parked") paint("parked", "Nightly outage — sweeps paused");
    else paint("ok", "");
  }).catch(applyFeed);
}

function collectionBanner() {
  // Home tile doubles as the collection-state banner. NEVER trust stale
  // meta (operator caught 'running' while the laptop sat at the RSA
  // prompt, 2026-08-19): if the feed itself is old, the state claim
  // inside it is old too -- say so instead of repeating it.
  const d = lineupsData();
  const sub = document.getElementById("tileSubRsa");
  if (!sub) return;
  let ageMin = null;
  if (d && d.meta && d.meta.generated_at) {
    const t0 = new Date(d.meta.generated_at).getTime();
    if (!isNaN(t0)) ageMin = Math.round((Date.now() - t0) / 60000);
  }
  const st = d && d.meta ? d.meta.collection_state : "";
  if (ageMin != null && ageMin > 20) {
    sub.textContent = `⚠ Status uncertain — feed ${ageMin}m old. Tap to check / approve.`;
  } else if (st === "awaiting_login") {
    sub.textContent = "⚠ COLLECTION PAUSED — RSA needed. Tap to approve.";
  } else if (st === "active") {
    sub.textContent = "Collection running — nothing needed.";
  } else {
    sub.textContent = "Approve login from anywhere";
  }
}

// ===================== SHARED ACTIONS =====================

function downloadResults() {
  const text = DOM.resultsOutput.textContent || "";
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const section = currentSection || "home";
  a.download = `railcore_${section}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
