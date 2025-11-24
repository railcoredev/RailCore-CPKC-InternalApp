// app.js
// Main logic for RAILCORE CPKC Worker App v3.8.1

let snapshot = null;
let currentTab = 'crossings'; // 'crossings' | 'sidings' | 'tracks';

document.addEventListener('DOMContentLoaded', async () => {
  snapshot = await loadRailCoreSnapshot();
  initFilters(snapshot);
  initTabs();
  initButtons();
  renderCurrentTab(); // initial view
});

function initFilters(data) {
  const stateSel = document.getElementById('stateSelector');
  const subSel = document.getElementById('subdivisionSelector');

  // States
  (data.states || []).forEach(st => {
    const opt = document.createElement('option');
    opt.value = st.code;
    opt.textContent = `${st.code} — ${st.name}`;
    stateSel.appendChild(opt);
  });

  // Preselect all states by default
  for (let i = 0; i < stateSel.options.length; i++) {
    stateSel.options[i].selected = true;
  }

  // Subdivisions (CPKC-only snapshot)
  (data.subdivisions || []).forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub.id;
    opt.textContent = sub.name;
    subSel.appendChild(opt);
  });

  if (subSel.options.length > 0) {
    subSel.selectedIndex = 0;
  }
}

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.getAttribute('data-tab');
      setActiveTab(target);
    });
  });
}

function initButtons() {
  document.getElementById('applyBtn').addEventListener('click', () => {
    renderCurrentTab();
  });

  document.getElementById('printBtn').addEventListener('click', () => {
    // Print only when explicitly clicked (no auto-print on load)
    window.print();
  });

  // Download -> open modal
  document.getElementById('downloadBtn').addEventListener('click', openDownloadModal);

  document.getElementById('downloadCancelBtn').addEventListener('click', closeDownloadModal);
  document.getElementById('downloadConfirmBtn').addEventListener('click', performDownload);
}

function setActiveTab(tabName) {
  currentTab = tabName;

  // Update tab styles
  document.querySelectorAll('.tab').forEach(tab => {
    const t = tab.getAttribute('data-tab');
    tab.classList.toggle('active', t === tabName);
  });

  // Yard selector only visible on tracks tab
  const yardRow = document.getElementById('yardSelectorRow');
  if (tabName === 'tracks') {
    yardRow.classList.remove('hidden');
    populateYards();
  } else {
    yardRow.classList.add('hidden');
  }

  renderCurrentTab();
}

function renderCurrentTab() {
  if (!snapshot) return;

  if (currentTab === 'crossings') {
    renderCrossings();
  } else if (currentTab === 'sidings') {
    renderSidings();
  } else if (currentTab === 'tracks') {
    renderTrackLengths();
  }
}

function getSelectedStates() {
  const sel = document.getElementById('stateSelector');
  return Array.from(sel.selectedOptions).map(o => o.value);
}

function getSelectedSubdivisionId() {
  const sel = document.getElementById('subdivisionSelector');
  return sel.value || null;
}

/* CROSSINGS TAB: crossing-distance-crossing blocks with spacing filter */

function renderCrossings() {
  const out = document.getElementById('resultsOutput');
  const states = getSelectedStates();
  const subId = getSelectedSubdivisionId();
  const spacing = Number(document.getElementById('spacingInput').value) || 0;
  const viewMode = document.querySelector('input[name="viewMode"]:checked')?.value || 'threshold';

  const allCrossings = (snapshot.crossings || [])
    .filter(c => (!subId || c.subdivision_id === subId))
    .filter(c => states.length === 0 || states.includes(c.state_code));

  // sort by MP ascending
  allCrossings.sort((a, b) => a.mp - b.mp);

  if (allCrossings.length < 2) {
    out.textContent = 'No crossing pairs available for selection.';
    return;
  }

  let lines = [];

  for (let i = 0; i < allCrossings.length - 1; i++) {
    const a = allCrossings[i];
    const b = allCrossings[i + 1];

    const distFt = Math.round((b.mp - a.mp) * 5280); // MP -> feet
    const passesThreshold = distFt >= spacing;

    if (viewMode === 'threshold' && !passesThreshold) {
      // Skip pairs that are too close
      continue;
    }

    // A
    lines.push(formatCrossingLine(a));
    // Distance
    lines.push(`↓ ${distFt.toLocaleString()} ft`);
    // B
    lines.push(formatCrossingLine(b));
    // Blank line between blocks
    lines.push('');
  }

  if (lines.length === 0) {
    out.textContent = 'No crossing pairs meet the spacing threshold.';
  } else {
    out.textContent = lines.join('\n');
  }
}

function formatCrossingLine(c) {
  const mpStr = (c.mp ?? '').toString();
  const roadCommon = c.road_common || '';
  const roadName = c.road_name || '';
  const protection = c.protection || '';
  const dot = c.dot_number || '';
  return `MP ${mpStr} — ${roadCommon} — ${roadName} — ${protection} — DOT# ${dot}`;
}

/* SIDINGS TAB: simple list placeholder wired to snapshot */

function renderSidings() {
  const out = document.getElementById('resultsOutput');
  const subId = getSelectedSubdivisionId();

  const sidings = (snapshot.sidings || []).filter(s => !subId || s.subdivision_id === subId);

  if (!sidings.length) {
    out.textContent = 'No sidings listed for this subdivision (yet).';
    return;
  }

  const lines = [];

  sidings.forEach(s => {
    const lenFt = (s.mp_end - s.mp_start) * 5280;
    lines.push(`${s.name}`);
    lines.push(`MP ${s.mp_start} – MP ${s.mp_end}  (${Math.round(lenFt).toLocaleString()} ft)`);
    lines.push(''); // blank line between sidings
  });

  out.textContent = lines.join('\n');
}

/* TRACK LENGTHS TAB: yard selector + track list */

function populateYards() {
  const yardSel = document.getElementById('yardSelector');
  yardSel.innerHTML = ''; // reset

  const yards = snapshot.yards || [];
  yards.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y.id;
    opt.textContent = y.name;
    yardSel.appendChild(opt);
  });

  if (yardSel.options.length > 0 && yardSel.selectedIndex === -1) {
    yardSel.selectedIndex = 0;
  }

  yardSel.addEventListener('change', renderTrackLengths);
}

function renderTrackLengths() {
  const out = document.getElementById('resultsOutput');
  const yardSel = document.getElementById('yardSelector');
  const yardId = yardSel.value;

  const yards = snapshot.yards || [];
  const yard = yards.find(y => y.id === yardId);

  if (!yard) {
    out.textContent = 'No yard selected or yard has no track details yet.';
    return;
  }

  const lines = [];
  lines.push(`${yard.name}`);
  lines.push(''); // blank

  (yard.tracks || []).forEach(t => {
    const len = t.length_ft != null ? `${t.length_ft.toLocaleString()} ft` : '';
    lines.push(`${t.name}  —  ${len}`);
  });

  out.textContent = lines.join('\n');
}

/* DOWNLOAD "SAVE AS" MODAL */

function openDownloadModal() {
  const modal = document.getElementById('downloadModal');
  const filenameInput = document.getElementById('downloadFilename');
  const typeSel = document.getElementById('downloadFiletype');

  // Pre-fill filename based on tab
  filenameInput.value = `railcore_${currentTab}_results`;

  // Default to .txt
  typeSel.value = 'txt';

  modal.classList.remove('hidden');
}

function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  modal.classList.add('hidden');
}

function performDownload() {
  const filenameBase = document.getElementById('downloadFilename').value || 'railcore_results';
  const type = document.getElementById('downloadFiletype').value;
  const text = document.getElementById('resultsOutput').textContent || '';

  let mime = 'text/plain';
  let ext = '.txt';

  if (type === 'csv') {
    mime = 'text/csv';
    ext = '.csv';
  } else if (type === 'json') {
    mime = 'application/json';
    ext = '.json';
  }

  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenameBase}${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  closeDownloadModal();
}
