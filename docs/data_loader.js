// data_loader.js
// Loads the CPKC snapshot for the worker app (CPKC-only).

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
