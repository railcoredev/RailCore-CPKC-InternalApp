// data_loader.js
// Loads the CPKC snapshot for the worker app (CPKC-only).

// Live lineups feed (train lineups + crew boards), published by the CPKC
// Data Processor after every extraction sweep. Offline-first: the last good
// copy is kept in localStorage so the app ALWAYS renders data with its age —
// a failed fetch means "show cached + say how old", never an error screen.
// Subdivision cheat-sheet cards (facts, stations by MP, radio, speed…),
// compiled by the CPKC Subdivision CheatSheets program from reviewed sources.
async function loadSubdivisionReference() {
  try {
    const res = await fetch('data/subdivision_reference.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Reference HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('Subdivision reference unavailable:', err);
    return null;
  }
}

async function loadLineupsSnapshot() {
  const url = 'data/lineups_snapshot.json';
  const CACHE_KEY = 'railcore_lineups_cache_v1';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Lineups HTTP ' + res.status);
    const json = await res.json();
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(json)); } catch (_) {}
    return { data: json, fromCache: false };
  } catch (err) {
    console.warn('Lineups fetch failed, trying cached copy:', err);
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return { data: JSON.parse(cached), fromCache: true };
    } catch (_) {}
    return { data: null, fromCache: false };
  }
}

async function loadRailCoreSnapshot() {
  const url = 'data/railcore_snapshot.json';

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      console.warn('Snapshot fetch failed with status', res.status);
      throw new Error('Snapshot HTTP error');
    }
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Failed to load RailCore snapshot:', err);

    // Fallback minimal inline data so the app still works
    return {
      meta: {
        dataset: 'RailCore CPKC Worker Snapshot (Fallback)',
        version: '3.8.1-fallback',
        railroad: 'CPKC'
      },
      states: [
        { code: 'IA', name: 'Iowa' },
        { code: 'IL', name: 'Illinois' },
        { code: 'MO', name: 'Missouri' },
        { code: 'KS', name: 'Kansas' }
      ],
      subdivisions: [
        { id: 'cpkc_kc', name: 'Kansas City Sub', state_codes: ['MO', 'KS'] },
        { id: 'cpkc_ottumwa', name: 'Ottumwa Sub', state_codes: ['IA', 'IL'] },
        { id: 'cpkc_davenport', name: 'Davenport Sub', state_codes: ['IA', 'IL'] },
        { id: 'cpkc_chicago', name: 'Chicago Sub', state_codes: ['IL'] },
        { id: 'cpkc_elgin', name: 'Elgin Sub', state_codes: ['IL'] }
      ],
      crossings: [
        {
          id: 'kc_mp8_5_kansas_ave',
          subdivision_id: 'cpkc_kc',
          state_code: 'KS',
          mp: 8.5,
          road_common: 'KANSAS AVE',
          road_name: 'Kansas Ave',
          protection: 'GATES',
          dot_number: '079123A'
        },
        {
          id: 'kc_mp10_1_turley_rd',
          subdivision_id: 'cpkc_kc',
          state_code: 'KS',
          mp: 10.1,
          road_common: 'TURLEY RD',
          road_name: 'Turley Rd',
          protection: 'FLASHERS',
          dot_number: '079456B'
        },
        {
          id: 'kc_mp12_7_155th_st',
          subdivision_id: 'cpkc_kc',
          state_code: 'KS',
          mp: 12.7,
          road_common: '155TH ST',
          road_name: '155th St',
          protection: 'GATES',
          dot_number: '079789C'
        }
      ],
      sidings: [],
      yards: []
    };
  }
}
