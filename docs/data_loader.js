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

// Quiet zones (GCOR 5.8.4), transcribed from the reviewed cheat-sheet cards.
// Used to stamp MP-ladder rows that fall inside a zone.
async function loadQuietZones() {
  try {
    const res = await fetch('data/quiet_zones.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Quiet zones HTTP ' + res.status);
    return await res.json();
  } catch (err) {
    console.warn('Quiet zones unavailable:', err);
    return null;
  }
}

const LINEUPS_CACHE_KEY = 'railcore_lineups_cache_v1';
let lastGoodLineups = null;
let lineupsRequest = null;

function lineupsSnapshotTimes(data) {
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const records = x => Array.isArray(x) && x.every(object);
  if (!object(data) || data.meta?.feed !== 'railcore_lineups' || data.meta.feed_version !== 1
      || !records(data.train_lineup?.stations)
      || !data.train_lineup.stations.every(s => records(s.trains))
      || !records(data.crew_boards?.boards)
      || !data.crew_boards.boards.every(b => records(b.rows))
      || !records(data.my_status) || !records(data.shared_crew_projection?.trains)
      || !records(data.train_history) || !records(data.bookoffs) || !records(data.alerts)) return null;
  // Only source timestamps, never a fetch/phone clock masquerading as capture.
  const timestamp = value => typeof value === 'string'
    && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? Date.parse(value) : NaN;
  const times = [data.meta.generated_at, data.meta.captured_at?.train_lineup,
    data.meta.captured_at?.crew_boards].map(timestamp);
  if (!times.every(Number.isFinite) || times[0] > Date.now() + 5 * 60000
      || times[1] > times[0] || times[2] > times[0]) return null;
  return times;
}

function rememberLineupsSnapshot(data) {
  const times = lineupsSnapshotTimes(data);
  if (!times) return false;
  if (lastGoodLineups) {
    const previous = lineupsSnapshotTimes(lastGoodLineups);
    if (previous && (times.some((t, i) => t < previous[i])
        || (times[0] === previous[0] && JSON.stringify(data) !== JSON.stringify(lastGoodLineups)))) return false;
  }
  lastGoodLineups = data;
  return true;
}

function restoreLineupsSnapshot() {
  try {
    const cached = localStorage.getItem(LINEUPS_CACHE_KEY);
    if (cached) rememberLineupsSnapshot(JSON.parse(cached));
  } catch (_) {} // Storage can be disabled/full; keep the in-memory good copy.
}

async function fetchLineupsSnapshot(url) {
  const controller = new AbortController();
  let timer;
  try {
    // Bound headers AND body, including a request that fails to honor abort.
    return await Promise.race([
      (async () => {
        const res = await fetch(url + '?t=' + Date.now(), {
          cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal
        });
        if (!res.ok) throw new Error('Lineups HTTP ' + res.status);
        return await res.json();
      })(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Lineups request timed out'));
          controller.abort();
        }, 8000);
      })
    ]);
  } finally { clearTimeout(timer); }
}

async function refreshLineupsSnapshot() {
  restoreLineupsSnapshot();
  const urls = ['data/lineups_snapshot.json'];
  // The public feed is already in this repository. Read it directly on the
  // production site so data need not wait for a Pages build/deployment. Keep
  // local previews and other installations on their own relative feed.
  if (typeof location !== 'undefined' && location.origin === 'https://railcoredev.github.io'
      && location.pathname.startsWith('/RailCore-CPKC-InternalApp/')) {
    urls.unshift('https://raw.githubusercontent.com/railcoredev/RailCore-CPKC-InternalApp/main/docs/data/lineups_snapshot.json');
  }
  for (const url of urls) {
    try {
      const data = await fetchLineupsSnapshot(url);
      restoreLineupsSnapshot(); // Another tab may have saved a newer capture.
      if (!rememberLineupsSnapshot(data)) throw new Error('Invalid or older lineup snapshot');
      try { localStorage.setItem(LINEUPS_CACHE_KEY, JSON.stringify(lastGoodLineups)); } catch (_) {}
      return { data: lastGoodLineups, fromCache: false };
    } catch (err) { console.warn('Lineups source unavailable:', url, err); }
  }
  return { data: lastGoodLineups, fromCache: !!lastGoodLineups };
}

function loadLineupsSnapshot() {
  // Visibility and the foreground timer can overlap. All views receive the
  // same whole snapshot; a late request must not roll Me or forecasts back.
  if (!lineupsRequest) {
    lineupsRequest = refreshLineupsSnapshot().finally(() => { lineupsRequest = null; });
  }
  return lineupsRequest;
}

async function loadRailCoreSnapshot() {
  const url = 'data/railcore_snapshot.json';

  try {
    const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
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
