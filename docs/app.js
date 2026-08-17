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
  mytrain:   { title: "MY TRAIN",       blocks: ["findBlock", "freshnessBar"] },
  lineups:   { title: "TRAIN LINEUPS",  blocks: ["stationBlock", "freshnessBar"] },
  boards:    { title: "CREW BOARDS",    blocks: ["boardBlock", "freshnessBar"] },
  reference: { title: "REF CARDS",      blocks: ["subdivisionBlock", "freshnessBar"] },
  crossings: { title: "CROSSINGS",      blocks: ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock", "freshnessBar"] },
  sidings:   { title: "SIDINGS",        blocks: ["subdivisionBlock", "freshnessBar"] },
  tracks:    { title: "TRACK LENGTHS",  blocks: ["yardBlock", "freshnessBar"] },
};

const ALL_BLOCKS = ["stateBlock", "subdivisionBlock", "spacingBlock", "viewBlock",
                    "findBlock", "yardBlock", "stationBlock", "boardBlock", "freshnessBar"];

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
}

// ===================== NAVIGATION =====================

function openSection(sectionId) {
  if (!SECTIONS[sectionId]) return;
  currentSection = sectionId;

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
    text = renderLineupsView();
  } else if (currentSection === "boards") {
    text = renderBoardsView();
  } else if (currentSection === "reference") {
    text = renderReferenceView();
  } else if (currentSection === "mytrain") {
    text = renderMyTrainView();
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
  const when = capturedAt ? capturedAt.slice(0, 16).replace("T", " ") : "unknown";
  const age = formatAge(capturedAt);
  const cacheNote = LINEUPS.fromCache ? " · offline copy" : "";
  DOM.freshnessText.textContent =
    `Data as of ${when} UTC${age ? ` (${age})` : ""}${cacheNote}`;
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
  lines.push("POS  TURN   CR  NAME    ST");
  b.rows.forEach((r) => {
    const pos = String(r.position || "").padStart(3);
    const turn = String(r.turn_asgn || "").padEnd(6);
    const cr = String(r.craft_code || "").padEnd(3);
    const nm = String(r.employee_name || "").padEnd(7);
    const stc = String(r.status_code || "");
    const away = r.home_away ? "  AWAY" : "";
    lines.push(`${pos}  ${turn} ${cr} ${nm} ${stc}${away}`);
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

function renderMyTrainView() {
  const d = lineupsData();
  if (!d) return "No lineup data available yet.";

  const q = (DOM.trainFindInput.value || "").trim().toUpperCase();
  const stations = d.train_lineup.stations || [];

  if (q.length < 2) {
    // Show the symbols on the board right now as tappable hints.
    const symbols = new Set();
    stations.forEach((st) => st.trains.forEach((t) => {
      const base = String(t.train_asgn || "").split("-")[0];
      if (base) symbols.add(base);
    }));
    return "Type at least 2 characters of a train symbol.\n\n" +
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
