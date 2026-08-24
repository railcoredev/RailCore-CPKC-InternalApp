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
let QUIET_ZONES = null;      // GCOR 5.8.4 zones from loadQuietZones()

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
  search:    { title: "SEARCH",         blocks: ["searchBlock", "freshnessBar"] },
  bookoffs:  { title: "BOOKOFFS",       blocks: ["freshnessBar"] },
  reference: { title: "REF CARDS",      blocks: ["subdivisionBlock", "freshnessBar"] },
  crossings: { title: "CROSSINGS",      blocks: ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock", "freshnessBar"] },
  sidings:   { title: "SIDINGS",        blocks: ["subdivisionBlock", "freshnessBar"] },
  tracks:    { title: "TRACK LENGTHS",  blocks: ["yardBlock", "freshnessBar"] },
};

const ALL_BLOCKS = ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock",
                    "findBlock", "yardBlock", "stationBlock", "boardBlock",
                    "searchBlock", "refMenuBlock", "rsaBlock", "freshnessBar"];

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
  DOM.searchInput = document.getElementById("searchInput");
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
  DOM.searchInput.addEventListener("input", renderCurrentView);
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
  QUIET_ZONES = await loadQuietZones();

  populateStateSummary();
  populateSubdivisionSelect();
  populateYardSelectAll();
  populateStationSelect();
  populateBoardSelect();

  if (SNAPSHOT.subdivisions && SNAPSHOT.subdivisions.length > 0) {
    currentSubdivisionId = SNAPSHOT.subdivisions[0].id;
    DOM.subdivisionSelect.value = currentSubdivisionId;
  }
  applyHomeTerminalDefaults();

  updateHomeTiles();
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden) return;
    LINEUPS = await loadLineupsSnapshot();
    updateHomeTiles();
    renderCurrentView();
  });
  bindRsa();
  collectionBanner();
  pollHealth();
  setInterval(pollHealth, 60000);
  // Auto-refresh the board while the app is FOREGROUNDED (operator
  // 2026-08-22: a "6 out" notification was correct but the open app stayed
  // stale -- there was no poll, only reload-on-reopen). Mirrors the
  // visibilitychange reload on a 60s timer; the data_loader cache-bust keeps
  // each pull fresh past the GitHub Pages CDN.
  setInterval(async () => {
    if (document.hidden) return;
    LINEUPS = await loadLineupsSnapshot();
    updateHomeTiles();
    renderCurrentView();
  }, 60000);
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
  if (sectionId === "search") DOM.searchInput.focus();
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
    // The top tile IS the Me summary (operator 2026-08-19): name +
    // living status; tapping it opens the full card. Runaround alerts
    // ride along when present.
    const me = (d.my_status || [])[0];
    const title = document.getElementById("tileTitleMe");
    if (me && title) {
      title.textContent = me.name || "Me";
      const st = myStatusRows(me);
      const runarounds = visibleAlerts().filter((a) => a.type === "runaround_candidate").length;
      mt.textContent = "";
      mt.appendChild(kvRows(st.rows, BAND_COLORS[st.band]));
      if (runarounds) {
        const warn = el("div", null,
          `⚠ ${runarounds} possible runaround${runarounds === 1 ? "" : "s"}`);
        warn.style.color = "#ff6600";
        mt.appendChild(warn);
      }
    } else {
      const runarounds = visibleAlerts().filter((a) => a.type === "runaround_candidate").length;
      mt.textContent = runarounds
        ? `⚠ ${runarounds} possible runaround${runarounds === 1 ? "" : "s"} · find your train fast`
        : "Find where a train sits, fast";
    }
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

// Default every picker to WHERE THE LOGGED-ON MEMBER IS (operator
// 2026-08-19): the arrival station of their newest ticket -- tie up in
// Kansas City, the app opens on Kansas City; tie up at home (or sit on
// days off, whose last tie-up WAS home), it opens on the home terminal.
// Falls back to roster home_terminal, then Ottumwa. Switching afterwards
// is unchanged.
const TERMINAL_DEFAULTS = {
  OT: { station: "04664", sub: "cpkc_ottumwa", board: /OTT/i },
  DA: { station: "04640", sub: "cpkc_davenport", board: /DAV|NAHANT/i },
  KC: { station: "04690", sub: "cpkc_kc", board: /KC/i },
};
// Station code -> terminal, mirroring the processor's corridor map.
const STATION_TERMINAL = {
  "04664": "OT", "04649": "OT", "04689": "OT",
  "04690": "KC",
  "04640": "DA", "04617": "DA", "04541": "DA", "04540": "DA",
};

function applyHomeTerminalDefaults() {
  const d = lineupsData();
  const me = d && d.my_status && d.my_status[0];
  const homeTerm = (me && me.home_terminal) || "OT";

  // Current location = newest ticket's arrival (dep for turnarounds
  // missing an arr). my_status tickets are newest-first.
  const t0 = me && me.tickets && me.tickets[0];
  const lastLoc = t0 && (t0.arr || t0.dep);
  const locTerm = (lastLoc && STATION_TERMINAL[lastLoc]) || homeTerm;
  const def = TERMINAL_DEFAULTS[locTerm] || TERMINAL_DEFAULTS.OT;

  // Station: prefer the exact tie-up station when the lineup covers it
  // (Bensenville etc. still win the station picker even when the
  // board/sub mapping doesn't know their terminal).
  const stationOpts = [...DOM.stationSelect.options].map((o) => o.value);
  if (lastLoc && stationOpts.includes(lastLoc)) {
    DOM.stationSelect.value = lastLoc;
  } else if (stationOpts.includes(def.station)) {
    DOM.stationSelect.value = def.station;
  }
  if (SNAPSHOT && (SNAPSHOT.subdivisions || []).some((s) => s.id === def.sub)) {
    currentSubdivisionId = def.sub;
    DOM.subdivisionSelect.value = def.sub;
  }
  const boards = d ? d.crew_boards.boards || [] : [];
  const bi = boards.findIndex((b) => def.board.test(b.label || b.screen_title || ""));
  if (bi >= 0) DOM.boardSelect.value = String(bi);
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
  } else if (currentSection === "search") {
    const r = renderSearchView();
    if (r === null) return;
    text = r;
  } else if (currentSection === "bookoffs") {
    const r = renderBookoffsView();
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

  // Operator 2026-08-19: label crews by DIRECTION, not craft. Inbound = the
  // crew bringing the train from the previous station (usually populated);
  // Outbound = the crew called to take it out of here (appears from the
  // moment they're called, ~2h before on-duty). Craft rides on each chip.
  const rows = (st.trains || []).map((t) => [
    t.date_time || "",
    t.train_asgn || "",
    t.status || "",
    t.ordered || "",
    t.rc || "",
    crewCell((t.eng_crew || []).concat(t.trn_crew || [])),
    crewCell((t.eng_planned_crew || []).concat(t.trn_planned_crew || [])),
    (t.eng_crew_pool ? `${t.eng_crew_district || ""}${t.eng_crew_pool}` : ""),
    t.information || "",
  ]);
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `${(st.name || st.location_code).toUpperCase()} — ${st.trains.length} trains`));
  box.appendChild(buildTable(
    ["Date/Time", "Train", "Status", "Ord", "RC", "Inbound Crew", "Outbound Crew", "Pool", "Info"],
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
  // The feed now carries 7 days (for the person search's LAST TRAIN); this
  // PAGE stays the 48h view it advertises.
  const cutoff = new Date(Date.now() - 48 * 36e5);
  const recent = d.train_history.filter((tr) => {
    const t = new Date((tr.date || "1970-01-01") + "T00:00:00");
    if (tr.on_duty && /^\d{4}$/.test(tr.on_duty)) {
      t.setHours(+tr.on_duty.slice(0, 2), +tr.on_duty.slice(2), 0, 0);
    } else {
      t.setHours(23, 59, 0, 0);        // date-only rows: keep the whole day
    }
    return t >= cutoff;
  });
  // Segregate by the DEPARTURE STATION CODE itself (operator 2026-08-23:
  // "route code" -- Muscatine 04649 is its OWN section, NOT folded into
  // Ottumwa 04664). One page, no dropdown; a section per departure point.
  const STATION_NAME = {
    "04664": "OTTUMWA", "04649": "MUSCATINE", "04689": "LIBERTY",
    "04690": "KANSAS CITY", "04640": "NAHANT", "04617": "MARQUETTE",
    "04541": "BENSENVILLE IMS", "04540": "BENSENVILLE",
  };
  const groups = {};
  recent.forEach((tr) => {
    const code = tr.depart || "?";
    (groups[code] = groups[code] || []).push(tr);
  });
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `RECENT TRAINS — last 48h · ${recent.length} trains · by departure point`));
  // Home first (Ottumwa), then the busiest sections.
  const rank = (c) => (c === "04664" ? -1e9 : -(groups[c] || []).length);
  Object.keys(groups).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)).forEach((code) => {
    const list = groups[code];
    box.appendChild(el("div", "table-title",
      `${STATION_NAME[code] || code} (${code})  ·  ${list.length} train${list.length === 1 ? "" : "s"}`));
    const rows = list.map((tr) => {
      const crew = el("span");
      (tr.members || []).forEach((m) =>
        crew.appendChild(el("span", "crew-chip", `${m.craft || ""} ${m.name || ""}`)));
      return [
        tr.date ? tr.date.slice(5) : "",
        tr.train || "",
        tr.on_duty || "—",
        tr.off_duty || "—",
        `${tr.depart || "?"}→${tr.arrive || "?"}`,
        crew,
        tr.pool || "",
      ];
    });
    box.appendChild(buildTable(
      ["Date", "Train", "On Duty", "Tie Up", "Route", "Crew", "Pool"], rows));
  });
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

// PERSON SEARCH (operator 2026-08-23): type a name, see their current status
// like a mini My Card -- on a train (which one), on a board (position, rest),
// or last tie-up. Sources: the published ROSTER (every employee, any home
// terminal -- the TILLIS fix), board rows (position/turn/MTOD verbatim) and
// train history members. Honest about what it doesn't know: rest is labeled
// (board) when from MTOD, (est +10h) when derived from a tie-up, and absent
// when neither exists. Appends person cards into `box`; returns match count.
function buildPersonResults(d, q, box) {
  const now = new Date();
  const mk = (dateStr, hhmm) => {
    if (!dateStr || !hhmm || !/^\d{4}$/.test(hhmm)) return null;
    const t = new Date(dateStr + "T00:00:00");
    t.setHours(+hhmm.slice(0, 2), +hhmm.slice(2), 0, 0);
    return t;
  };
  const keyOf = (name) => {
    const m = /^[A-Z-]+,\(?[A-Z]+\)?/.exec(String(name || "").toUpperCase());
    return m ? m[0].replace(/[()]/g, "") : String(name || "").toUpperCase();
  };
  const people = {};   // key -> {name, boards:[], onTrain, lastTrain}
  (d.crew_boards.boards || []).forEach((b) => {
    (b.rows || []).forEach((r) => {
      const nm = String(r.employee_name || "");
      if (!nm.toUpperCase().includes(q)) return;
      const p = (people[keyOf(nm)] = people[keyOf(nm)] || { name: nm, boards: [] });
      p.boards.push(r);
    });
  });
  (d.train_history || []).forEach((tr) => {
    (tr.members || []).forEach((m) => {
      const nm = String(m.name || "");
      if (!nm.toUpperCase().includes(q)) return;
      const p = (people[keyOf(nm)] = people[keyOf(nm)] || { name: nm, boards: [] });
      const on = mk(tr.date, m.on_duty || tr.on_duty);
      const off = (m.off_duty || tr.off_duty)
        ? mk(tr.date, m.off_duty || tr.off_duty) : null;
      const rec = { train: tr.train, craft: m.craft || "", on, off,
                    route: `${tr.depart || "?"}→${tr.arrive || "?"}` };
      if (off && off < on) off.setTime(off.getTime() + 864e5);   // past-midnight tie-up
      if (!off && on && (now - on) < 14 * 36e5) {
        if (!p.onTrain || on > p.onTrain.on) p.onTrain = rec;
      } else if (off && (!p.lastTrain || off > p.lastTrain.off)) {
        p.lastTrain = rec;
      }
    });
  });
  // ROSTER: the whole network, any home terminal. Fills in anyone the boards/
  // history don't show, and stamps craft + home on everyone it knows.
  (d.roster || []).forEach((r) => {
    const nm = String(r.name || "");
    if (!nm.toUpperCase().includes(q)) return;
    const p = (people[keyOf(nm)] = people[keyOf(nm)] || { name: nm, boards: [] });
    p.roster = r;
  });
  // BOOKOFFS: who is marked off right now and why (PSTS90 capture, decoded).
  // This is why someone is on NO board -- TILLIS: V = Off on Vacation.
  (d.bookoffs || []).forEach((b) => {
    const nm = String(b.name || "");
    if (!nm.toUpperCase().includes(q)) return;
    const p = (people[keyOf(nm)] = people[keyOf(nm)] || { name: nm, boards: [] });
    if (!p.bookoff) p.bookoff = b;
  });

  const keys = Object.keys(people);
  box.appendChild(el("div", "table-title",
    keys.length ? `PEOPLE — ${keys.length} match${keys.length === 1 ? "" : "es"}`
                : `PEOPLE — no one matching "${q}"`));
  const CAP = 30;                     // show them ALL (count must match the
  if (keys.length > CAP) {            // list); only trim absurd queries, and
    box.appendChild(el("div", "table-title",   // SAY so when trimming
      `showing first ${CAP} of ${keys.length} — keep typing to narrow`));
  }
  keys.sort().slice(0, CAP).forEach((k) => {
    const p = people[k];
    const rows = [];
    let band = null;
    if (p.onTrain) {
      band = "orange";
      rows.push(["STATUS", `ON A TRAIN — ${p.onTrain.train} (${p.onTrain.craft})`]);
      rows.push(["ON DUTY", `${fmtClock(p.onTrain.on)} ${localDay(p.onTrain.on)} · ${p.onTrain.route}`]);
    } else if (p.bookoff) {
      band = "blue";
      // CODE first, exactly as the bookoff screen lists it (operator
      // 2026-08-23); meaning in parens when the legend knows it.
      const what = (p.bookoff.code || "?")
        + (p.bookoff.label ? ` (${p.bookoff.label})` : "");
      rows.push(["STATUS", `BOOKED OFF — ${what}`
        + (p.bookoff.since ? ` since ${p.bookoff.since.slice(5)}` : "")]);
    }
    // Board rows (dedup by screen): position/turn verbatim; MTOD rest if shown.
    const seen = new Set();
    let bestPos = null, restedNow = null, restLine = null;
    p.boards.forEach((r) => {
      const t = r.screen_title || "";
      if (seen.has(t)) return; seen.add(t);
      const hours = String(r.turn_hours || "").trim().split(/\s+/);
      rows.push(["BOARD", `${t} — pos ${r.position || "?"}${r.turn_asgn ? ` · turn ${r.turn_asgn}` : ""}`]);
      const posN = parseInt(r.position, 10);
      if (posN && (bestPos === null || posN < bestPos)) bestPos = posN;
      if (!restLine && /^\d{4}$/.test(hours[0] || "")) {
        const rDt = new Date(now);
        rDt.setHours(+hours[0].slice(0, 2), +hours[0].slice(2), 0, 0);
        const rested = rDt <= now;
        restedNow = rested;
        restLine = rested ? `RESTED — since ${hours[0]} (board)`
                          : `resting — rested at ${hours[0]} (board)`;
      }
    });
    if (!restLine && !p.onTrain && !p.bookoff && p.lastTrain && p.lastTrain.off) {
      // (skipped when booked off -- a rest estimate on a marked-off member
      // reads as 'available', which is the opposite of the truth)
      const est = new Date(p.lastTrain.off.getTime() + 10 * 36e5);
      restedNow = est <= now;
      restLine = restedNow
        ? `RESTED — since ~${fmtClock(est)} (est: tie-up +10h)`
        : `resting — rested ~${fmtClock(est)} ${localDay(est)} (est: tie-up +10h)`;
    }
    if (restLine) rows.push(["REST", restLine]);
    if (p.lastTrain) {
      rows.push(["LAST TRAIN", `${p.lastTrain.train} — tied up ${fmtClock(p.lastTrain.off)} ${localDay(p.lastTrain.off)}`]);
    }
    if (p.roster) {
      rows.push(["ROSTER", `${p.roster.craft || "?"} · home ${p.roster.home_terminal || "?"}`]);
    }
    if (!rows.length) {
      rows.push(["STATUS", "on the roster — no board row or recent train in the feed"]);
    }
    if (!band) {                      // same readiness colors as My Card
      if (restedNow === false) band = "grey";
      else if (bestPos === 1) band = "red";
      else if (bestPos === 2 || bestPos === 3) band = "yellow";
      else if (restedNow === true) band = "green";
    }
    const title = el("div", "table-title", p.name);
    if (band) title.style.color = BAND_COLORS[band];
    box.appendChild(title);
    box.appendChild(kvRows(rows, band ? BAND_COLORS[band] : null));
  });
  return keys.length;
}

// SEARCH section (operator 2026-08-23): ONE box on its own home tile --
// people AND trains, results sectioned separately below.
function renderSearchView() {
  const d = lineupsData();
  if (!d) { showText(); return "No data available yet."; }
  updateFreshnessBar();
  const q = ((DOM.searchInput && DOM.searchInput.value) || "").trim().toUpperCase();
  if (q.length < 2) {
    showText();
    return "Type at least 2 characters — a name (TILLIS, MARKO) or a train (181, 253-05).\n\n" +
           "People searches the whole roster (any home terminal), the boards and recent trains.\n" +
           "Trains searches every station's lineup and the last 7 days of train history.";
  }
  const box = el("div");
  buildPersonResults(d, q, box);

  // TRAINS — current lineup listings across every station...
  const trows = [];
  (d.train_lineup.stations || []).forEach((st) => {
    (st.trains || []).forEach((tr) => {
      if (!String(tr.train_asgn || "").toUpperCase().includes(q)) return;
      const crew = el("span");
      (tr.eng_crew || []).concat(tr.trn_crew || []).forEach((m) => {
        const chip = el("span", "crew-chip", `${m.craft || ""} ${m.name || ""}`);
        if (m.hos && m.hos.label) chip.appendChild(el("span", ` hos-${m.hos.band || "green"}`, ` ${m.hos.label}`));
        crew.appendChild(chip);
      });
      trows.push([(st.name || st.location_code), tr.date_time || "",
                  tr.train_asgn || "", tr.status || "", crew,
                  (tr.eng_crew_pool ? `${tr.eng_crew_district || ""}${tr.eng_crew_pool}` : "")]);
    });
  });
  // ...and recent history (as-run) matches.
  const hrows = [];
  (d.train_history || []).forEach((tr) => {
    if (!String(tr.train || "").toUpperCase().includes(q)) return;
    hrows.push([tr.date ? tr.date.slice(5) : "", tr.train || "",
                tr.on_duty || "—", tr.off_duty || "—",
                `${tr.depart || "?"}→${tr.arrive || "?"}`, tr.pool || ""]);
  });
  box.appendChild(el("div", "table-title",
    (trows.length + hrows.length)
      ? `TRAINS — ${trows.length} on the lineup · ${hrows.length} in the last 7 days`
      : `TRAINS — nothing matching "${q}"`));
  if (trows.length) {
    box.appendChild(buildTable(["Station", "Date/Time", "Train", "Status", "Crew", "Pool"], trows));
  }
  if (hrows.length) {
    box.appendChild(el("div", "table-title", "AS RUN (history)"));
    box.appendChild(buildTable(["Date", "Train", "On Duty", "Tie Up", "Route", "Pool"], hrows));
  }
  // RULES & DOCUMENTS: zero-payload hand-off to the doc viewer's own
  // full-bundle search (rr-app deep link pre-fills its Search tab). We do
  // NOT re-download the multi-MB bundle into this app just to search it.
  box.appendChild(el("div", "table-title", "RULES & DOCUMENTS"));
  const docLink = el("a", null,
    `Search the rulebooks, timetables, notices & orders for "${q}" →`);
  docLink.href = "rr-app/index.html#q=" + encodeURIComponent(q);
  docLink.style.cssText = "display:block;padding:6px 0;color:#ff6600;" +
    "text-decoration:none;font-weight:600";
  box.appendChild(docLink);
  showTable(box);
  return null;
}

// BOOKOFFS page (operator 2026-08-23): one page, everyone currently booked
// off, sectioned by terminal (from the ASSIGNMENT prefix -- the row's
// subdistrict is only the inquiry screen), with dates and decoded codes.
function renderBookoffsView() {
  const d = lineupsData();
  if (!d) { showText(); return "No data available yet."; }
  updateFreshnessBar();
  const list = d.bookoffs || [];
  if (!list.length) {
    showText();
    return "No current bookoffs in the feed (or the bookoff capture hasn't run in the last 36h).";
  }
  const TERM_NAME = { OT: "OTTUMWA", DA: "DAVENPORT", KC: "KANSAS CITY" };
  const groups = {};
  list.forEach((b) => {
    const t = b.terminal || "?";
    (groups[t] = groups[t] || []).push(b);
  });
  const carried = list.filter((b) => b.carryover).length;
  const box = el("div");
  box.appendChild(el("div", "table-title",
    `BOOKED OFF — ${list.length} members · by terminal`
    + (carried ? ` · ${carried} carried† from older captures` : "")));
  const order = ["OT", "DA", "KC"];
  const rank = (t) => (order.indexOf(t) < 0 ? 99 : order.indexOf(t));
  Object.keys(groups).sort((a, b) => rank(a) - rank(b)).forEach((term) => {
    const rows = groups[term]
      .slice()
      .sort((a, b) => (a.since < b.since ? 1 : -1) || a.name.localeCompare(b.name))
      .map((b) => [
        b.name || "",
        // the CODE as the bookoff screen lists it, meaning in parens when known
        (b.code || "?") + (b.label ? ` (${b.label})` : ""),
        (b.since ? b.since.slice(5) : "—") + (b.carryover ? " †" : ""),
        b.assignment || "",
      ]);
    box.appendChild(el("div", "table-title",
      `${TERM_NAME[term] || term}  ·  ${rows.length} booked off`));
    box.appendChild(buildTable(["Name", "Code", "Since", "Turn"], rows));
  });
  if (carried) {
    const fn = el("div", null,
      "† from an older capture (the bookoff screen only lists each day's "
      + "entries) — no return to work observed since; drops off once they "
      + "work a ticket or stand on a board again.");
    fn.style.cssText = "color:#8b93a7;font-size:.82em;padding:8px 0";
    box.appendChild(fn);
  }
  showTable(box);
  return null;
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
    // The '*' on a board row is a QUALIFICATION marker (under a year in
    // craft), NOT unavailability -- operator taught this twice (NEER
    // 2026-08-19; reaffirmed 2026-08-20 on his own fresh mark-back row).
    // Show it verbatim; never dim, never say "marked off" because of it.
    const starred = /\*\w{0,2}\s+\d{3,4}\s+\d{3}/.test(raw);
    const hours = String(r.turn_hours || "").trim().split(/\s+/);
    const nameEl = el("span", null, r.employee_name || "");
    const isMe = myName && String(r.employee_name || "").toUpperCase().startsWith(myName.slice(0, 12));
    if (isMe) nameEl.textContent += "  ◀ you";
    // ON <train>: screen truth cross-referenced by the feed -- another
    // board in the SAME sweep literally printed "ON <train>" for this
    // member (e.g. the OB turn-order screen while the position board
    // still lists their turn standing). Absence of the badge claims
    // nothing (only some screens carry it). Operator 2026-08-20:
    // Stonehouse on the SW board AND on 180-20 -- both true; say so.
    // Appended AFTER the "◀ you" textContent write (textContent wipes
    // child nodes -- the v4.4.0 CSS lesson's DOM cousin).
    if (r.on_train) {
      nameEl.appendChild(el("span", "on-train-chip", ` ON ${r.on_train}`));
    }
    const tr = [
      r.position || "", r.turn_asgn || "", (starred ? "*" : "") + (r.craft_code || ""),
      nameEl, hours[0] || "—", hours[1] || "—",
      r.status_code || "",
    ];
    tr._cls = (isMe ? "row-me" : "");
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
    const onTrain = r.on_train ? `  ON ${r.on_train}` : "";
    lines.push(`${pos}  ${turn} ${cr} ${nm}${hours ? " " + hours : ""}${stc ? "  " + stc : ""}${away}${onTrain}`);
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

// Me card v2 (operator 2026-08-19): everything visible on arrival -- no
// second tap. Identity inline; CURRENT STATUS and PREDICTED clearly
// separated; label/value rows, not paragraphs.
//
// REST comes from the BOARD when available (MTOD = rested at, MTPD =
// previous duty length -- the mainframe already did the math, tow-in
// included). Client-side 10h + past-12 tow-in calculation is the
// FALLBACK for members not on a captured board.

function localDay(dt) {
  return `${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")}`;
}
function fmtClock(dt) {
  return `${String(dt.getHours()).padStart(2, "0")}${String(dt.getMinutes()).padStart(2, "0")}`;
}

function myRestInfo(t0) {
  // Fallback math: rested 10h after tie-up + (tour length beyond 12h).
  const mk = (hhmm, date) => {
    if (!date || !hhmm) return null;
    const dt = new Date(`${date}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00`);
    return isNaN(dt) ? null : dt;
  };
  const onDt = mk(t0.on_duty, t0.date);
  let offDt = mk(t0.off_duty, t0.date);
  if (onDt && offDt && offDt < onDt) offDt = new Date(offDt.getTime() + 864e5);
  if (!offDt) return { onDt, offDt: null };
  let extraMin = 0;
  if (onDt) extraMin = Math.max(0, Math.round((offDt - onDt) / 6e4 - 720));
  const restEnd = new Date(offDt.getTime() + (600 + extraMin) * 6e4);
  return { onDt, offDt, restEnd, extraMin };
}

function myStatusRows(me) {
  const now = new Date();
  const t0 = me.tickets && me.tickets[0];
  const av = me.availability || {};
  const homeSt = (TERMINAL_DEFAULTS[me.home_terminal || "OT"] || {}).station;
  const rows = [];
  let band = "green", label = "AT HOME — on the board";

  const r = t0 ? myRestInfo(t0) : {};
  if (r.onDt && r.onDt > now) {
    band = "orange"; label = `CALLED — ${t0.train}`;
    rows.push(["STATUS", "CALLED"], ["TRAIN", `${t0.train} (${t0.craft || ""})`],
              ["ON DUTY", `${t0.on_duty} ${localDay(r.onDt)}`]);
    return { rows, band, label };
  }
  if (r.onDt && !r.offDt && (now - r.onDt) < 14 * 36e5) {
    band = "orange"; label = `ON A TRAIN — ${t0.train}`;
    rows.push(["STATUS", "ON A TRAIN"], ["TRAIN", `${t0.train} (${t0.craft || ""})`],
              ["ON DUTY", `${t0.on_duty} ${localDay(r.onDt)}`],
              ["ROUTE", `${t0.dep || "?"} → ${t0.arr || "?"}`]);
    return { rows, band, label };
  }
  if (av.state === "rest_day") {
    return { rows: [["STATUS", "DAYS OFF — ADO rest day"]], band: "blue", label: "DAYS OFF (ADO)" };
  }
  if (av.state === "booked_off") {
    return { rows: [["STATUS", "BOOKED OFF"]], band: "blue", label: "BOOKED OFF" };
  }
  if (av.state === "annual_vacation") {
    return { rows: [["STATUS", "ANNUAL VACATION"]], band: "blue", label: "ANNUAL VACATION" };
  }

  const away = t0 && t0.arr && homeSt && t0.arr !== homeSt;
  // Re-entry (feed-computed from operator rules): a member inside their
  // ADO days off is NOT on the board -- say so, and count down.
  const re = me.reentry;
  const reDt = re && re.at ? new Date(re.at) : null;
  let where = away ? `AT HOTEL — ${t0.arr}` : "AT HOME";
  let restedNow = null;   // true=rested, false=resting (Aaron's readiness colors)
  if (reDt && reDt > now && re.into_rest_days) {
    where = "DAYS OFF (ADO)";
    band = "blue";
  }
  rows.push(["STATUS", where]);
  if (reDt) {
    if (reDt > now) {
      const mins = Math.round((reDt - now) / 6e4);
      const cd = `in ${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
      rows.push(["BACK ON BOARD", `${fmtClock(reDt)} ${localDay(reDt)} — ${cd}`]);
      if (label.startsWith("AT HOME")) label = `${where} — back ${fmtClock(reDt)} ${localDay(reDt)}`;
      else label = `${where} — back ${fmtClock(reDt)} ${localDay(reDt)}`;
    } else {
      rows.push(["ON BOARD SINCE", `${fmtClock(reDt)} ${localDay(reDt)}`]);
    }
  }
  const bp = me.board_position;
  if (bp && bp.ordinal) {
    const ord = ["", "1st out", "2nd out", "3rd out"][bp.ordinal] || `${bp.ordinal}th out`;
    // marker rides verbatim from the captured board row (one source --
    // the card must never tell a different story than the board view)
    const mark = bp.marker && bp.marker !== bp.craft ? ` · board shows ${bp.marker}` : "";
    rows.push(["BOARD POSITION", `${ord} of ${bp.of} (${bp.board || ""})${mark}`]);
    if (bp.ordinal === 1) { label = `1st OUT — ${bp.board || "board"}`; }
  }
  if (t0 && r.offDt) {
    rows.push(["TIED UP", `${t0.off_duty} ${localDay(r.offDt)} (${t0.train})`]);
  }

  // REST: board first, calculation second.
  const br = me.board_rest;
  if (br && br.rested_at) {
    const cap = br.captured_at ? new Date(br.captured_at) : now;
    let restDt = new Date(cap);
    restDt.setHours(+br.rested_at.slice(0, 2), +br.rested_at.slice(2), 0, 0);
    // MTOD has no date: it is the NEXT occurrence after tie-up (or the
    // one nearest the board capture when no tie-up anchors it).
    if (r.offDt) {
      restDt = new Date(r.offDt);
      restDt.setHours(+br.rested_at.slice(0, 2), +br.rested_at.slice(2), 0, 0);
      while (restDt < r.offDt) restDt = new Date(restDt.getTime() + 864e5);
    }
    if (now >= restDt) {
      rows.push(["REST", `RESTED — since ${br.rested_at} (board)`]);
      restedNow = true;
      if (band !== "blue") label = `${where} — rested`;
    } else {
      rows.push(["REST", `resting — rested at ${br.rested_at} ${localDay(restDt)} (board)`]);
      restedNow = false; label = `${where} — rested at ${br.rested_at}`;
    }
    if (br.prev_duty) {
      const pd = `${+br.prev_duty.slice(0, 2)}h ${br.prev_duty.slice(2)}m`;
      const tow = +br.prev_duty.slice(0, 2) * 60 + +br.prev_duty.slice(2) - 720;
      rows.push(["PREV DUTY", pd + (tow > 0 ?
        ` — ${Math.floor(tow / 60)}h ${String(tow % 60).padStart(2, "0")}m past 12 added to rest` : "")]);
    }
  } else if (t0 && r.offDt && r.restEnd) {
    if (now >= r.restEnd) {
      rows.push(["REST", `RESTED — since ${fmtClock(r.restEnd)} ${localDay(r.restEnd)}`]);
      restedNow = true;
      if (band !== "blue") label = `${where} — rested`;
    } else {
      rows.push(["REST", `resting — rested at ${fmtClock(r.restEnd)} ${localDay(r.restEnd)}`]);
      restedNow = false; label = `${where} — rested at ${fmtClock(r.restEnd)}`;
    }
    if (r.extraMin > 0) {
      rows.push(["TOW-IN", `${Math.floor(r.extraMin / 60)}h ${String(r.extraMin % 60).padStart(2, "0")}m past 12 added to rest`]);
    }
  }

  // Readiness headline + color (operator 2026-08-23). The STATUS line reads
  // e.g. "AT HOME — 4th out, rested"; the color MEANS readiness:
  //   red    = 1st out (rested) -> you're NEXT
  //   yellow = 2nd/3rd out      -> about to go to work
  //   green  = available (rested, on board) but further out
  //   grey   = resting          -> on the board but not callable yet
  //   blue   = scheduled off (days off / booked off / vacation)
  const ordName = bp && bp.ordinal
    ? (["", "1st out", "2nd out", "3rd out"][bp.ordinal] || `${bp.ordinal}th out`) : "";
  if (rows[0] && rows[0][0] === "STATUS" && !String(rows[0][1]).startsWith("DAYS OFF")) {
    rows[0][1] = where
      + (ordName ? ` — ${ordName}` : "")
      + (restedNow === null ? "" : (restedNow ? ", rested" : ", resting"));
  }
  if (band !== "blue") {                 // blue = scheduled off, leave it
    if (restedNow === false) band = "grey";              // resting -> not callable
    else if (bp && bp.ordinal === 1) band = "red";       // 1st out -> you're next
    else if (bp && (bp.ordinal === 2 || bp.ordinal === 3)) band = "yellow";
    else band = "green";                                 // available, further out
  }
  return { rows, band, label };
}

function myCurrentStatus(me) {
  const s = myStatusRows(me);
  return { label: s.label, band: s.band };
}

const BAND_COLORS = { orange: "#ff6600", green: "#3ddc84",
                      yellow: "#ffcf40", blue: "#6aa9ff",
                      red: "#ff3b30", grey: "#8b93a7" };

function kvRows(pairs, color) {
  const wrap = el("div");
  pairs.forEach(([k, v], i) => {
    const row = el("div");
    row.style.cssText = "display:flex;gap:14px;padding:3px 0;align-items:baseline";
    const kd = el("span", null, k);
    kd.style.cssText = "color:#8b93a7;min-width:92px;font-size:.82em;letter-spacing:.06em";
    const vd = el("span", null, v);
    if (i === 0 && color) vd.style.color = color;
    row.appendChild(kd); row.appendChild(vd);
    wrap.appendChild(row);
  });
  return wrap;
}

function renderMyTrainTable() {
  const d = lineupsData();
  if (!d) { showText(); return "No lineup data available yet."; }
  const q = (DOM.trainFindInput.value || "").trim().toUpperCase();
  const box = el("div");

  const me = (d.my_status || [])[0];
  if (me) {
    const head = el("div", "table-title");
    head.style.cssText = "font-size:1.05em";
    head.textContent = `${me.name || ""}   ·   #${me.employee_number || "—"}   ·   ${me.assignment || "—"}`;
    box.appendChild(head);

    const st = myStatusRows(me);
    box.appendChild(el("div", "table-title", "CURRENT STATUS"));
    box.appendChild(kvRows(st.rows, BAND_COLORS[st.band]));

    box.appendChild(el("div", "table-title", "PREDICTED"));
    const pred = el("div", null,
      "Grading silently against real calls — your projection (back on the " +
      "board, position, lined-up train) appears here once it proves out.");
    pred.style.cssText = "color:#8b93a7;padding:2px 0 6px";
    box.appendChild(pred);

    if (me.tickets && me.tickets.length) {
      const hrows = me.tickets.slice(0, 14).map((tk) => [
        tk.date || "", tk.train || "", tk.craft || "",
        tk.on_duty || "—", tk.off_duty || "—",
        `${tk.dep || "?"}→${tk.arr || "?"}`,
        tk.pool ? `${tk.pool}${tk.turn ? "/" + tk.turn : ""}` : "",
      ]);
      box.appendChild(el("div", "table-title", "MY TRAINS — captured tickets"));
      box.appendChild(buildTable(
        ["Date", "Train", "Seat", "On", "Off", "Route", "Pool"], hrows));
    }

    const fin = el("div", "table-title", "PAY — loading…");
    box.appendChild(fin);
    loadPersonalFeed().then((p) => {
      if (!p || !p.weeks) { fin.textContent = "PAY — set your token in Remote RSA to see totals."; return; }
      const halves = {};
      p.weeks.forEach((w) => {
        const dt = new Date(w.week_of + "T00:00:00Z");
        const half = `${w.week_of.slice(0, 7)}-${dt.getUTCDate() <= 15 ? "H1" : "H2"}`;
        halves[half] = halves[half] || { earned: 0, starts: 0 };
        halves[half].earned += w.earned; halves[half].starts += w.trips;
      });
      const keys = Object.keys(halves).sort().reverse();
      const cur = keys[0], last = keys[1];
      fin.textContent = "PAY — " +
        (cur ? `this half (${cur}): $${halves[cur].earned.toFixed(2)} · ${halves[cur].starts} starts` : "") +
        (last ? `  |  last half (${last}): $${halves[last].earned.toFixed(2)} · ${halves[last].starts} starts` : "");
    }).catch(() => { fin.textContent = "PAY — unavailable."; });
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
      // Quiet-zone stamp (GCOR 5.8.4, operator 2026-08-19): every ladder
      // line whose MP falls inside a zone says so. Card-spanned zones match
      // by range; card-listed zones match only their named crossing MPs
      // (crossings BETWEEN listed MPs are not necessarily in the zone).
      const qzones = (QUIET_ZONES && QUIET_ZONES.zones &&
                      QUIET_ZONES.zones[card.id]) || [];
      const qzLabel = (mp) => {
        for (const z of qzones) {
          const inZone = z.mps
            ? z.mps.some((m) => Math.abs(m - mp) <= 0.05)
            : (mp >= z.mp_start && mp <= z.mp_end);
          if (inZone) return z.hours ? `QUIET ZONE ${z.hours}` : "QUIET ZONE";
        }
        return "";
      };
      const sts = card.station.rows
        .filter((r) => r.mp !== undefined && r.mp !== null && String(r.mp) !== "")
        .map((r) => ({ mp: Number(r.mp), kind: "station", r }));
      const ladder = xs.concat(sts).sort((a2, b2) => a2.mp - b2.mp);
      let prevX = null;
      const rows = ladder.map((it) => {
        const qz = qzLabel(it.mp);
        if (it.kind === "station") {
          const row = [String(it.r.mp), it.r.loc || "", "", "STATION", qz,
                       it.r.notes || ""];
          row._cls = "row-me";
          return row;
        }
        const gap = prevX === null ? "" :
          Math.round((it.mp - prevX) * 5280).toLocaleString() + " ft";
        prevX = it.mp;
        const row = [String(it.c.mp),
          `${it.c.road_common || it.c.road_name || ""}${it.c.city ? " · " + it.c.city : ""}`,
          gap, "crossing", [it.c.protection || "", qz].filter(Boolean).join(" · "),
          it.c.dot_number || ""];
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
      o.paid != null ? "$" + o.paid.toFixed(2) : "—",
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
      if (o.paid != null) line += ` $${o.paid.toFixed(2)}`;
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

async function sendRsaCode(c) {
  // ONE send path -- the Remote RSA screen and the floating box both use it.
  const t = (localStorage.getItem("railcore_rsa_token") || "").trim();
  const r = (localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve").trim();
  if (!t || !r) return "Set token + repo on the Remote RSA screen first.";
  if (!c) return "Enter the code.";
  try {
    const path = `rsa/code-${Date.now()}.json`;
    const body = { message: "rsa approve",
                   content: btoa(JSON.stringify({ code: c, created_at: new Date().toISOString() })) };
    const resp = await fetch(`https://api.github.com/repos/${r}/contents/${path}`, {
      method: "PUT",
      headers: { "Authorization": `Bearer ${t}`, "Accept": "application/vnd.github+json",
                 "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return resp.ok
      ? "✓ Sent. The laptop picks it up within ~10s. Code expires in 90s."
      : `Failed (${resp.status}): check token/repo.`;
  } catch (e) {
    return "Network error: " + e.message;
  }
}

// FLOATING RSA BOX (operator 2026-08-20): when the laptop is waiting at
// the login, the entry field sits ON TOP of every page -- title, code
// field, send. Appears with the need, leaves when the login moves on.
function updateRsaFloat() {
  const ls = window.LOGIN_STATUS;
  const need = ls && ["rsa_wait", "code_rejected", "session_expired"].includes(ls.stage);
  let box = document.getElementById("rsaFloat");
  if (!need) { if (box) box.remove(); return; }
  if (box) return;                     // already showing
  box = document.createElement("div");
  box.id = "rsaFloat";
  box.style.cssText =
    "position:fixed;left:12px;right:12px;bottom:18px;z-index:9999;" +
    "background:#10151f;border:2px solid #ff6600;border-radius:14px;" +
    "padding:14px;box-shadow:0 6px 24px rgba(0,0,0,.6)";
  const title = document.createElement("div");
  title.textContent = "🔑 RSA CODE — laptop is waiting";
  title.style.cssText = "color:#ff6600;font-weight:700;margin-bottom:8px;letter-spacing:.03em";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:8px";
  const inp = document.createElement("input");
  inp.type = "text"; inp.inputMode = "numeric"; inp.autocomplete = "one-time-code";
  inp.placeholder = "6-8 digits";
  // min-width:0 lets the input shrink inside flex -- without it the
  // browser's intrinsic input width shoves the button out of the card
  inp.style.cssText = "flex:1;min-width:0;box-sizing:border-box;padding:12px;" +
                      "border-radius:10px;border:1px solid #39415a;" +
                      "background:#0a0e16;color:#fff;font-size:1.1em";
  const btn = document.createElement("button");
  btn.textContent = "Send";
  btn.style.cssText = "flex-shrink:0;box-sizing:border-box;padding:12px 20px;" +
                      "border-radius:10px;border:none;" +
                      "background:#ff6600;color:#fff;font-weight:700;font-size:1em";
  const res = document.createElement("div");
  res.style.cssText = "color:#8b93a7;margin-top:8px;font-size:.85em";
  res.textContent = (ls && ls.message) || "";
  btn.addEventListener("click", async () => {
    res.textContent = "Sending…";
    const msg = await sendRsaCode(inp.value.trim());
    res.textContent = msg;
    if (msg.startsWith("✓")) inp.value = "";
  });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") btn.click(); });
  row.appendChild(inp); row.appendChild(btn);
  box.appendChild(title); box.appendChild(row); box.appendChild(res);
  document.body.appendChild(box);
}

async function pollRsaStatus() {
  // Live laptop feedback: the login advancer posts its stage to
  // status/login_status.json in the approve repo on every stage change
  // ("ready for code" -> "code received" -> "LOGIN SUCCESSFUL"). Shown
  // here so the operator knows exactly when to send and whether it took.
  const el = document.getElementById("rsaLive");
  const block = document.getElementById("rsaBlock");
  const visible = el && block && !block.classList.contains("hidden");
  const t = (localStorage.getItem("railcore_rsa_token") || "").trim();
  const r = (localStorage.getItem("railcore_rsa_repo") || "railcoredev/railcore-approve").trim();
  if (!t) { if (visible) el.textContent = "Set the token below to see live laptop status."; return; }
  try {
    const resp = await fetch(`https://api.github.com/repos/${r}/contents/status/login_status.json`, {
      headers: { "Authorization": `Bearer ${t}`, "Accept": "application/vnd.github+json" },
      cache: "no-store",
    });
    if (!resp.ok) { if (visible) el.textContent = "No laptop status posted yet."; return; }
    const j = await resp.json();
    const s = JSON.parse(atob(j.content));
    // ONE SOURCE (operator 2026-08-20, caught live: tile said "running"
    // while the laptop sat at the RSA prompt): the advancer's own posted
    // stage drives the HOME TILE too, not just this screen.
    window.LOGIN_STATUS = s;
    collectionBanner();
    updateRsaFloat();
    if (!visible) return;
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

  // Notification levels (operator 2026-08-20): the phone owns the dial.
  // Saved locally AND published to the private repo; the laptop reads it
  // before every send.
  const nSys = document.getElementById("notifLevelSystem");
  const nPer = document.getElementById("notifLevelPersonal");
  const nRes = document.getElementById("notifPrefResult");
  nSys.value = localStorage.getItem("railcore_notif_system") || "2";
  nPer.value = localStorage.getItem("railcore_notif_personal") || "2";
  async function saveNotifPrefs() {
    localStorage.setItem("railcore_notif_system", nSys.value);
    localStorage.setItem("railcore_notif_personal", nPer.value);
    const t2 = tok.value.trim(), r2 = repo.value.trim();
    if (!t2 || !r2) { nRes.textContent = "Saved on phone. Set token to sync to laptop."; return; }
    try {
      const path = "settings/notify_prefs.json";
      const headers = { "Authorization": `Bearer ${t2}`,
                        "Accept": "application/vnd.github+json" };
      let sha;
      const cur = await fetch(`https://api.github.com/repos/${r2}/contents/${path}`, { headers, cache: "no-store" });
      if (cur.ok) sha = (await cur.json()).sha;
      const body = { message: "notify prefs",
                     content: btoa(JSON.stringify({ system: +nSys.value, personal: +nPer.value,
                                                    updated_at: new Date().toISOString() })) };
      if (sha) body.sha = sha;
      const resp = await fetch(`https://api.github.com/repos/${r2}/contents/${path}`, {
        method: "PUT", headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(body) });
      nRes.textContent = resp.ok ? "✓ Levels synced to the laptop." : `Sync failed (${resp.status}).`;
    } catch (e) { nRes.textContent = "Sync error: " + e.message; }
  }
  nSys.addEventListener("change", saveNotifPrefs);
  nPer.addEventListener("change", saveNotifPrefs);
  send.addEventListener("click", async () => {
    const msg = await sendRsaCode(code.value.trim());
    result.textContent = msg;
    if (msg.startsWith("✓")) code.value = "";
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
  const ls = window.LOGIN_STATUS;
  const st = d && d.meta ? d.meta.collection_state : "";
  const waitingStages = ["web_form", "rsa_wait", "session_expired", "cma_link",
                         "cma_link_wait", "cma_tile", "green_signon", "code_rejected"];
  if (ls && waitingStages.includes(ls.stage)) {
    // the laptop itself says it is mid-login -- that beats any feed snapshot
    sub.textContent = ls.stage === "rsa_wait"
      ? "⚠ RSA NEEDED — laptop is at the prompt. Tap to send."
      : `⏳ Logging in (${ls.stage.replace(/_/g, " ")}) — tap to watch.`;
  } else if (ageMin != null && ageMin > 20) {
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
