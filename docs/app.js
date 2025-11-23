// app.js
// RailCore CPKC Worker App v3.7
// Handles UI logic, tabs, Apply, and Download

let railCoreData = null;
let activeTab = 'crossings'; // 'crossings' | 'sidings' | 'tracks'

document.addEventListener('DOMContentLoaded', async () => {
  // Grab elements
  const stateSelect      = document.getElementById('stateSelect');
  const subdivisionSelect = document.getElementById('subdivisionSelect');
  const spacingInput     = document.getElementById('spacingInput');
  const bufferInput      = document.getElementById('bufferInput');
  const viewThreshold    = document.getElementById('viewThreshold');
  const viewAll          = document.getElementById('viewAll');

  const applyBtn         = document.getElementById('applyBtn');
  const printBtn         = document.getElementById('printBtn');
  const downloadBtn      = document.getElementById('downloadBtn');

  const tabButtons       = document.querySelectorAll('.tab');
  const crossingsOutput  = document.getElementById('crossingsOutput');
  const sidingsOutput    = document.getElementById('sidingsOutput');
  const tracksOutput     = document.getElementById('tracksOutput');
  const tracksText       = document.getElementById('tracksText');
  const yardSelect       = document.getElementById('yardSelect');

  const downloadModal    = document.getElementById('downloadModal');
  const downloadTxtBtn   = document.getElementById('downloadTxt');
  const downloadCsvBtn   = document.getElementById('downloadCsv');
  const downloadCancel   = document.getElementById('downloadCancel');

  // 1. Load snapshot data
  try {
    railCoreData = await loadRailCoreData();
    populateStates(stateSelect, railCoreData.states || []);
    populateSubdivisions(subdivisionSelect, railCoreData.subdivisions || []);
    populateYards(yardSelect, railCoreData.yards || []);
  } catch (err) {
    console.error('Error loading RailCore data:', err);
  }

  // When states change, filter subdivisions
  stateSelect.addEventListener('change', () => {
    filterSubdivisionsByState(
      stateSelect,
      subdivisionSelect,
      railCoreData && railCoreData.subdivisions ? railCoreData.subdivisions : []
    );
  });

  // 2. Tab switching
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (!tab || tab === activeTab) return;

      activeTab = tab;
      setActiveTab(tabButtons, tab);
      updateVisibleOutputs(tab, { crossingsOutput, sidingsOutput, tracksOutput });
    });
  });

  // 3. Apply button
  applyBtn.addEventListener('click', () => {
    const spacing = Number(spacingInput.value || 0);
    const buffer  = Number(bufferInput.value || 0);
    const viewMode = viewAll.checked ? 'all' : 'threshold';

    const selectedStates = getSelectedValues(stateSelect);
    const selectedSub    = subdivisionSelect.value || '';

    if (!railCoreData) {
      crossingsOutput.textContent = 'Data not loaded yet.';
      sidingsOutput.textContent   = 'Data not loaded yet.';
      tracksText.textContent      = 'Data not loaded yet.';
      return;
    }

    if (activeTab === 'crossings') {
      crossingsOutput.textContent = renderCrossingsPlaceholder(
        selectedStates,
        selectedSub,
        spacing,
        buffer,
        viewMode
      );
    } else if (activeTab === 'sidings') {
      sidingsOutput.textContent = renderSidingsPlaceholder(
        selectedStates,
        selectedSub,
        spacing,
        viewMode
      );
    } else if (activeTab === 'tracks') {
      const selectedYard = yardSelect.value || '';
      tracksText.textContent = renderTracksPlaceholder(
        selectedStates,
        selectedSub,
        selectedYard
      );
    }
  });

  // 4. Print button (uses browser print dialog)
  printBtn.addEventListener('click', () => {
    window.print();
  });

  // 5. Download: open simple format chooser (TXT / CSV)
  downloadBtn.addEventListener('click', () => {
    downloadModal.classList.remove('hidden');
  });

  downloadCancel.addEventListener('click', () => {
    downloadModal.classList.add('hidden');
  });

  downloadTxtBtn.addEventListener('click', () => {
    triggerDownload('txt');
  });

  downloadCsvBtn.addEventListener('click', () => {
    triggerDownload('csv');
  });

  function triggerDownload(format) {
    // Determine which output is currently active
    let text = '';
    let baseName = 'railcore-output';

    if (activeTab === 'crossings') {
      text = crossingsOutput.textContent || '';
      baseName = 'railcore-crossings';
    } else if (activeTab === 'sidings') {
      text = sidingsOutput.textContent || '';
      baseName = 'railcore-sidings';
    } else if (activeTab === 'tracks') {
      text = tracksText.textContent || '';
      baseName = 'railcore-tracklengths';
    }

    if (!text.trim()) {
      text = 'No results yet. Use Apply to generate output before downloading.';
    }

    const ext = format === 'csv' ? 'csv' : 'txt';
    const mime = format === 'csv' ? 'text/csv' : 'text/plain';
    const filename = `${baseName}.${ext}`;

    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    downloadModal.classList.add('hidden');
  }

  // 6. Register service worker (if available)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(err => {
      console.error('Service worker registration failed:', err);
    });
  }
});

// --------- Helpers ---------

function populateStates(selectEl, states) {
  selectEl.innerHTML = '';
  if (!states || !states.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No Options';
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }
  states.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.code;
    opt.textContent = `${s.code} — ${s.name}`;
    selectEl.appendChild(opt);
  });
}

function populateSubdivisions(selectEl, subs) {
  selectEl.innerHTML = '';
  if (!subs || !subs.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No Options';
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }
  subs.forEach(sub => {
    const opt = document.createElement('option');
    opt.value = sub.code || sub.id || sub.name;
    opt.textContent = sub.name;
    selectEl.appendChild(opt);
  });
}

function filterSubdivisionsByState(stateSelect, subdivisionSelect, allSubs) {
  const stateCodes = getSelectedValues(stateSelect);
  if (!stateCodes.length) {
    populateSubdivisions(subdivisionSelect, allSubs);
    return;
  }

  const filtered = allSubs.filter(sub => {
    if (!sub.stateCodes || !sub.stateCodes.length) return true;
    return sub.stateCodes.some(sc => stateCodes.includes(sc));
  });

  populateSubdivisions(subdivisionSelect, filtered);
}

function populateYards(selectEl, yards) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  if (!yards || !yards.length) {
    const opt = document.createElement('option');
    opt.textContent = 'No Options';
    opt.disabled = true;
    selectEl.appendChild(opt);
    return;
  }
  yards.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y.id || y.code || y.name;
    opt.textContent = y.name;
    selectEl.appendChild(opt);
  });
}

function getSelectedValues(selectEl) {
  return Array.from(selectEl.selectedOptions || []).map(o => o.value);
}

function setActiveTab(tabButtons, tabName) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
}

function updateVisibleOutputs(tabName, blocks) {
  const { crossingsOutput, sidingsOutput, tracksOutput } = blocks;
  crossingsOutput.classList.add('hidden');
  sidingsOutput.classList.add('hidden');
  tracksOutput.classList.add('hidden');

  if (tabName === 'crossings') {
    crossingsOutput.classList.remove('hidden');
  } else if (tabName === 'sidings') {
    sidingsOutput.classList.remove('hidden');
  } else if (tabName === 'tracks') {
    tracksOutput.classList.remove('hidden');
  }
}

// Placeholder renderers (until we wire real data in)

function renderCrossingsPlaceholder(states, subdivision, spacing, buffer, viewMode) {
  const statesText = states.length ? states.join(', ') : 'All selected states';
  const subText    = subdivision || 'All selected subdivisions';
  const modeText   = viewMode === 'all' ? 'ALL crossings' : `crossing pairs >= ${spacing} ft`;
  const bufferText = buffer ? ` with ${buffer} ft buffer` : '';

  return [
    `CROSSINGS VIEW — PREVIEW`,
    `States: ${statesText}`,
    `Subdivision: ${subText}`,
    `Mode: ${modeText}${bufferText}`,
    ``,
    `Example block:`,
    `MP 8.5 — KANSAS AVE — Kansas Ave — GATES — DOT# 079123A`,
    `↓ 7,920 ft`,
    `MP 10.1 — TURLEY RD — Turley Rd — FLASHERS — DOT# 079456B`,
    ``,
    `MP 10.1 — TURLEY RD — Turley Rd — FLASHERS — DOT# 079456B`,
    `↓ 13,728 ft`,
    `MP 12.7 — 155TH ST — 155th St — GATES — DOT# 079789C`
  ].join('\n');
}

function renderSidingsPlaceholder(states, subdivision, spacing, viewMode) {
  const statesText = states.length ? states.join(', ') : 'All selected states';
  const subText    = subdivision || 'All selected subdivisions';
  return [
    `SIDINGS VIEW — PREVIEW`,
    `States: ${statesText}`,
    `Subdivision: ${subText}`,
    `Spacing filter: ${spacing} ft (${viewMode === 'all' ? 'All sidings' : 'Pairs >= spacing'})`,
    ``,
    `Siding name — MP start–end (total length)`,
    `  MP start`,
    `  ↓ distance to crossing (if any)`,
    `  Crossing`,
    `  ↓ distance to crossing (if second)`,
    `  Crossing`,
    `  ↓ distance to MP end`,
    `  MP end`
  ].join('\n');
}

function renderTracksPlaceholder(states, subdivision, yard) {
  const statesText = states.length ? states.join(', ') : 'All selected states';
  const subText    = subdivision || 'All selected subdivisions';
  const yardText   = yard || 'Selected yard';

  return [
    `TRACK LENGTH VIEW — PREVIEW`,
    `States: ${statesText}`,
    `Subdivision: ${subText}`,
    `Yard: ${yardText}`,
    ``,
    `This tab will list all tracks for the selected yard with length in feet.`,
    `Example:`,
    `  TRK 01 — 6,800 ft`,
    `  TRK 02 — 5,450 ft`,
    `  TRK 03 — 7,200 ft`
  ].join('\n');
}
