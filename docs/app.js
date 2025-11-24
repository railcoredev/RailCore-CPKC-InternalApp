// app.js
// RailCore CPKC Worker App v3.8 – UI + logic

// ---------- STATE ----------

const appState = {
    data: null,
    activeTab: 'crossings' // 'crossings' | 'sidings' | 'tracks'
};

// ---------- INIT ----------

document.addEventListener('DOMContentLoaded', async () => {
    // Load lightweight snapshot data
    appState.data = await loadRailCoreData();

    wireFilters();
    populateStates();
    populateSubdivisions();
    populateYards();

    wireTabs();
    wireButtons();
    registerServiceWorker();
});

// ---------- FILTERS & DATA POPULATION ----------

function wireFilters() {
    const stateSelect = document.getElementById('stateSelect');
    const subdivSelect = document.getElementById('subdivisionSelect');

    stateSelect.addEventListener('change', () => {
        populateSubdivisions();
    });
}

function populateStates() {
    const stateSelect = document.getElementById('stateSelect');
    stateSelect.innerHTML = '';

    if (!appState.data || !appState.data.states) return;

    appState.data.states.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.code;
        opt.textContent = s.name;
        stateSelect.appendChild(opt);
    });
}

function populateSubdivisions() {
    const subdivSelect = document.getElementById('subdivisionSelect');
    subdivSelect.innerHTML = '';

    if (!appState.data || !appState.data.subdivisions) return;

    appState.data.subdivisions.forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub.code;
        opt.textContent = sub.name;
        subdivSelect.appendChild(opt);
    });
}

function populateYards() {
    const yardSelect = document.getElementById('yardSelect');
    yardSelect.innerHTML = '';

    if (!appState.data || !appState.data.yards) {
        // simple default
        ['Kansas City Yard', 'Default Yard'].forEach(y => {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            yardSelect.appendChild(opt);
        });
        return;
    }

    appState.data.yards.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y.code || y.name;
        opt.textContent = y.name;
        yardSelect.appendChild(opt);
    });
}

// ---------- TABS ----------

function wireTabs() {
    const tabCross = document.getElementById('tabCrossings');
    const tabSidings = document.getElementById('tabSidings');
    const tabTracks = document.getElementById('tabTracks');

    tabCross.addEventListener('click', () => setActiveTab('crossings'));
    tabSidings.addEventListener('click', () => setActiveTab('sidings'));
    tabTracks.addEventListener('click', () => setActiveTab('tracks'));
}

function setActiveTab(tabKey) {
    appState.activeTab = tabKey;

    // toggle active class
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (tabKey === 'crossings') document.getElementById('tabCrossings').classList.add('active');
    if (tabKey === 'sidings') document.getElementById('tabSidings').classList.add('active');
    if (tabKey === 'tracks') document.getElementById('tabTracks').classList.add('active');

    // yard row only on Track Lengths tab
    const yardRow = document.getElementById('yardRow');
    if (tabKey === 'tracks') yardRow.classList.remove('hidden');
    else yardRow.classList.add('hidden');

    // change placeholder text
    const output = document.getElementById('outputText');
    if (tabKey === 'crossings') {
        output.textContent = 'Select state, subdivision, and spacing, then tap Apply.\n\nCrossings view will list crossing–distance–crossing blocks.';
    } else if (tabKey === 'sidings') {
        output.textContent =
            'Select state, subdivision, and spacing, then tap Apply.\n\n' +
            'Sidings view will show:\n' +
            '  • Siding name and MP start–end with total length at top\n' +
            '  • Within each siding: MP start, distance to crossing(s) in feet,\n' +
            '    crossing(s), distance to end, MP end.';
    } else {
        output.textContent =
            'Select state, subdivision, spacing, and yard, then tap Apply.\n\n' +
            'Track length view will list tracks for the selected yard.';
    }
}

// ---------- BUTTONS (Apply / Print / Download) ----------

function wireButtons() {
    document.getElementById('applyBtn').addEventListener('click', onApply);
    document.getElementById('printBtn').addEventListener('click', () => window.print());
    wireDownloadDialog();
}

function onApply() {
    const stateSelect = document.getElementById('stateSelect');
    const subdivSelect = document.getElementById('subdivisionSelect');
    const spacing = Number(document.getElementById('spacingInput').value || 0);
    const buffer = Number(document.getElementById('bufferInput').value || 0);
    const yard = document.getElementById('yardSelect').value;
    const viewMode = document.querySelector('input[name="viewMode"]:checked').value;

    const selectedStates = Array.from(stateSelect.selectedOptions).map(o => o.textContent);
    const stateText = selectedStates.length ? selectedStates.join(', ') : 'All loaded states';
    const subdivText = subdivSelect.selectedOptions[0]?.textContent || 'All subdivisions';

    const output = document.getElementById('outputText');

    if (appState.activeTab === 'crossings') {
        output.textContent =
            `STATE(S): ${stateText}\n` +
            `SUBDIVISION: ${subdivText}\n` +
            `SPACING: ${spacing.toLocaleString()} ft   BUFFER: ${buffer.toLocaleString()} ft\n` +
            `VIEW MODE: ${viewMode === 'threshold' ? '>= Threshold' : 'All crossings'}\n\n` +
            'CROSSINGS (sample format):\n\n' +
            'MP  8.5 — KANSAS AVE — Kansas Ave — GATES — DOT# 079123A\n' +
            '  ↓ 7,920 ft\n' +
            'MP 10.1 — TURLEY RD — Turley Rd — FLASHERS — DOT# 079456B\n\n' +
            'MP 10.1 — TURLEY RD — Turley Rd — FLASHERS — DOT# 079456B\n' +
            '  ↓ 13,728 ft\n' +
            'MP 12.7 — 155TH ST — 155th St — GATES — DOT# 079789C\n\n' +
            '(Real distances will come from the data set; this is the permanent block pattern.)';
    } else if (appState.activeTab === 'sidings') {
        output.textContent =
            `STATE(S): ${stateText}\n` +
            `SUBDIVISION: ${subdivText}\n` +
            `SPACING: ${spacing.toLocaleString()} ft   BUFFER: ${buffer.toLocaleString()} ft\n` +
            `VIEW MODE: ${viewMode === 'threshold' ? '>= Threshold' : 'All sidings'}\n\n` +
            'SIDINGS (sample format):\n\n' +
            'Siding: OLATHE\n' +
            '  MP 14.0 – MP 16.5 (Total 2.5 mi)\n' +
            '    MP 14.0\n' +
            '      ↓ 1,200 ft\n' +
            '      Crossing: 151ST ST\n' +
            '      ↓ 3,000 ft\n' +
            '      Crossing: 159TH ST\n' +
            '      ↓ 4,000 ft\n' +
            '    MP 16.5\n\n' +
            '(Real values will be filled from the subdivision data.)';
    } else {
        output.textContent =
            `STATE(S): ${stateText}\n` +
            `SUBDIVISION: ${subdivText}\n` +
            `YARD: ${yard}\n\n` +
            'TRACK LENGTHS (sample format):\n\n' +
            `Yard: ${yard}\n` +
            '  Receiving 1 — 6,500 ft\n' +
            '  Receiving 2 — 6,400 ft\n' +
            '  Departure 1 — 7,000 ft\n\n' +
            '(Final version will list every track with live lengths from the yard table.)';
    }
}

// ---------- DOWNLOAD (Save As dialog) ----------

function wireDownloadDialog() {
    const modal = document.getElementById('downloadModal');
    const openBtn = document.getElementById('downloadBtn');
    const cancelBtn = document.getElementById('downloadCancel');
    const saveBtn = document.getElementById('downloadSave');
    const fileNameInput = document.getElementById('downloadFileName');
    const fileTypeSelect = document.getElementById('downloadFileType');

    openBtn.addEventListener('click', () => {
        // Default file name based on active tab & subdivision
        const subdivText = document.getElementById('subdivisionSelect').selectedOptions[0]?.textContent || 'All';
        let base = 'railcore_';
        if (appState.activeTab === 'crossings') base += 'crossings';
        else if (appState.activeTab === 'sidings') base += 'sidings';
        else base += 'tracks';

        base += '_' + subdivText.replace(/\s+/g, '_').toLowerCase();
        fileNameInput.value = base;
        fileTypeSelect.value = 'txt';

        modal.classList.remove('hidden');
    });

    cancelBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    saveBtn.addEventListener('click', () => {
        const format = fileTypeSelect.value;
        let name = (fileNameInput.value || 'railcore_export').trim();

        // ensure extension
        if (!name.toLowerCase().endsWith('.' + format)) {
            name += '.' + format;
        }

        exportCurrentView(format, name);
        modal.classList.add('hidden');
    });
}

function exportCurrentView(format, filename) {
    const text = document.getElementById('outputText').innerText || '';
    let mime = 'text/plain';

    if (format === 'csv') mime = 'text/csv';
    else if (format === 'pdf') mime = 'application/pdf';
    else if (format === 'png') mime = 'image/png';

    // NOTE: For now we export plain text for all formats.
    // PDF/PNG are simple text exports with the requested extension.
    triggerDownload(text, mime, filename);
}

function triggerDownload(content, mimeType, filename) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ---------- SERVICE WORKER ----------

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker
            .register('./service-worker.js')
            .catch(err => console.warn('SW registration failed', err));
    }
}
