const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../docs/data_loader.js'), 'utf8');
const KEY = 'railcore_lineups_cache_v1';
const RAW = 'https://raw.githubusercontent.com/railcoredev/RailCore-CPKC-InternalApp/main/docs/data/lineups_snapshot.json';
const SITE = 'https://railcoredev.github.io/RailCore-CPKC-InternalApp/';
const NOW = Date.parse('2026-10-30T21:00:00Z');
const copy = value => JSON.parse(JSON.stringify(value));

function snapshot(minutes = 0) {
  const generated = Date.parse('2026-10-30T20:00:00Z') + minutes * 60000;
  const times = {train_lineup: new Date(generated - 360000).toISOString(),
    crew_boards: new Date(generated - 240000).toISOString()};
  return {
    meta: {feed: 'railcore_lineups', feed_version: 1,
      generated_at: new Date(generated).toISOString(), captured_at: times},
    train_lineup: {captured_at: times.train_lineup, train_count: 1,
      stations: [{location_code: '04690', trains: [{train_asgn: `TEST-${minutes}`}]}]},
    crew_boards: {captured_at: times.crew_boards, board_count: 1,
      boards: [{captured_at: times.crew_boards, rows: [{employee_name: 'TEST'}]}]},
    my_status: [{name: 'TEST', reentry: {rest_completed_at: '2026-10-30T13:09'},
      projection: {leg_id: `leg-${minutes}`}}],
    shared_crew_projection: {trains: [{leg_id: `leg-${minutes}`, seats: {AE_CO: {name: 'TEST'}}}]},
    train_history: [], bookoffs: [], alerts: []
  };
}

function harness({url = SITE, cached, fetcher, storageFails = false, fastTimers = false} = {}) {
  const storage = new Map(cached === undefined ? [] : [[KEY, typeof cached === 'string' ? cached : JSON.stringify(cached)]]);
  const requests = [], timers = [];
  let currentFetcher = fetcher || (() => { throw new Error('offline'); });
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const ctx = vm.createContext({Date: Clock, location: new URL(url), AbortController,
    setTimeout: (fn, ms) => { timers.push(ms); return setTimeout(fn, fastTimers ? 5 : ms); }, clearTimeout,
    console: {warn() {}, error() {}},
    fetch: async (address, options) => { requests.push({address, options}); return currentFetcher(address, options); },
    localStorage: {
      getItem: key => { if (storageFails) throw new Error('blocked'); return storage.get(key) || null; },
      setItem: (key, value) => { if (storageFails) throw new Error('quota'); storage.set(key, value); }
    }
  });
  vm.runInContext(source, ctx);
  return {load: () => ctx.loadLineupsSnapshot(), requests, storage, timers,
    setFetcher: fn => { currentFetcher = fn; }};
}
const response = data => ({ok: true, status: 200, json: async () => copy(data)});
const baseUrl = url => url.split('?')[0];

test('bypasses a delayed Pages deployment using the same public repository feed', async () => {
  const newer = snapshot(20), older = snapshot();
  const h = harness({fetcher: url => response(baseUrl(url) === RAW ? newer : older)});
  const result = await h.load();
  assert.deepEqual(copy(result.data), newer);
  assert.equal(result.fromCache, false);
  assert.equal(h.requests.length, 1, 'do not double download when the direct feed succeeds');
  assert.equal(baseUrl(h.requests[0].address), RAW);
  assert.match(h.requests[0].address, /\?t=\d+/);
  assert.equal(h.requests[0].options.credentials, 'omit');
  assert.equal(h.requests[0].options.cache, 'no-store');
  assert.equal(h.requests[0].options.referrerPolicy, 'no-referrer');
});

test('falls back to the deployed site on direct-feed failure', async () => {
  const h = harness({fetcher: url => baseUrl(url) === RAW ? Promise.reject(new Error('CORS/network')) : response(snapshot(10))});
  assert.deepEqual(copy((await h.load()).data), snapshot(10));
  assert.deepEqual(h.requests.map(x => baseUrl(x.address)), [RAW, 'data/lineups_snapshot.json']);
});

test('never rolls a newer saved snapshot back to either older network copy', async () => {
  const latest = snapshot(30);
  const h = harness({cached: latest, fetcher: () => response(snapshot())});
  const result = await h.load();
  assert.deepEqual(copy(result.data), latest);
  assert.equal(result.fromCache, true);
  assert.deepEqual(JSON.parse(h.storage.get(KEY)), latest);
});

test('tries site fallback if raw is older than the saved snapshot', async () => {
  const h = harness({cached: snapshot(10), fetcher: url => response(baseUrl(url) === RAW ? snapshot() : snapshot(20))});
  assert.deepEqual(copy((await h.load()).data), snapshot(20));
});

for (const part of ['train_lineup', 'crew_boards']) {
  test(`rejects a newly generated feed whose ${part} capture went backwards`, async () => {
    const bad = snapshot(20);
    bad.meta.captured_at[part] = snapshot().meta.captured_at[part];
    bad[part].captured_at = bad.meta.captured_at[part];
    const h = harness({cached: snapshot(10), fetcher: () => response(bad)});
    assert.deepEqual(copy((await h.load()).data), snapshot(10));
  });
}

const invalidCases = {
  'wrong feed': d => { d.meta.feed = 'another_program'; },
  'unknown version': d => { d.meta.feed_version = 99; },
  'missing Me collection': d => { delete d.my_status; },
  'missing shared forecasts': d => { delete d.shared_crew_projection; },
  'malformed stations': d => { d.train_lineup.stations = {}; },
  'malformed station trains': d => { d.train_lineup.stations[0].trains = null; },
  'malformed board rows': d => { d.crew_boards.boards[0].rows = null; },
  'null personal row': d => { d.my_status = [null]; },
  'missing generation time': d => { delete d.meta.generated_at; },
  'unknown capture time': d => { d.meta.captured_at.crew_boards = null; },
  'timezone-free capture': d => { d.meta.captured_at.crew_boards = '2026-10-30T20:01:00'; },
  'future generation': d => { d.meta.generated_at = '2026-10-30T21:06:00Z'; },
  'capture after generation': d => { d.meta.captured_at.crew_boards = '2026-10-30T20:31:00Z'; }
};
for (const [label, corrupt] of Object.entries(invalidCases)) {
  test(`rejects ${label} without replacing last good data`, async () => {
    const bad = snapshot(20); corrupt(bad);
    const h = harness({cached: snapshot(), fetcher: () => response(bad)});
    const result = await h.load();
    assert.deepEqual(copy(result.data), snapshot());
    assert.equal(result.fromCache, true);
  });
}

test('same generation with conflicting contents cannot replace last good data', async () => {
  const changed = snapshot(); changed.my_status[0].reentry.rest_completed_at = '2026-10-30T15:00';
  const h = harness({cached: snapshot(), fetcher: () => response(changed)});
  assert.deepEqual(copy((await h.load()).data), snapshot());
});

test('same valid generation can be confirmed online without inventing freshness', async () => {
  const h = harness({cached: snapshot(), fetcher: () => response(snapshot())});
  const result = await h.load();
  assert.equal(result.fromCache, false);
  assert.deepEqual(copy(result.data), snapshot());
});

test('offline fallback retains source clocks and the complete consistent snapshot', async () => {
  const h = harness({cached: snapshot()});
  const result = await h.load();
  assert.deepEqual(copy(result.data), snapshot());
  assert.equal(result.fromCache, true);
  assert.equal(result.data.my_status[0].projection.leg_id, result.data.shared_crew_projection.trains[0].leg_id);
});

test('corrupt stored JSON and malformed network JSON produce no fabricated data', async () => {
  const h = harness({cached: '{broken', fetcher: () => ({ok: true, json: async () => { throw new Error('JSON'); }})});
  assert.equal((await h.load()).data, null);
});

test('memory fallback works when browser storage is blocked', async () => {
  const h = harness({storageFails: true, fetcher: () => response(snapshot(20))});
  await h.load(); h.setFetcher(() => { throw new Error('offline'); });
  const result = await h.load();
  assert.deepEqual(copy(result.data), snapshot(20));
  assert.equal(result.fromCache, true);
});

test('newer saved data from another tab wins over an in-flight older response', async () => {
  const h = harness({cached: snapshot()});
  h.setFetcher(() => { h.storage.set(KEY, JSON.stringify(snapshot(30))); return response(snapshot(10)); });
  assert.deepEqual(copy((await h.load()).data), snapshot(30));
});

test('overlapping foreground refreshes share one bounded request', async () => {
  let finish;
  const h = harness({fetcher: () => new Promise(resolve => { finish = resolve; })});
  const a = h.load(), b = h.load();
  assert.equal(h.requests.length, 1);
  finish(response(snapshot(20)));
  assert.deepEqual(copy((await a).data), snapshot(20));
  assert.deepEqual(copy((await b).data), snapshot(20));
});

for (const phase of ['headers', 'body']) {
  test(`timeout bounds stalled ${phase} and a late result cannot overwrite fallback`, {timeout: 1000}, async () => {
    let finish;
    const h = harness({fastTimers: true, fetcher: url => {
      if (baseUrl(url) !== RAW) return response(snapshot(20));
      const pending = new Promise(resolve => { finish = resolve; });
      return phase === 'headers' ? pending : {ok: true, json: () => pending};
    }});
    const result = await h.load();
    assert.deepEqual(copy(result.data), snapshot(20));
    assert(h.requests[0].options.signal.aborted);
    assert(h.timers.every(ms => ms === 8000));
    finish(phase === 'headers' ? response(snapshot(10)) : snapshot(10));
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(JSON.parse(h.storage.get(KEY)), snapshot(20));
  });
}

for (const url of ['http://localhost:8000/', 'https://railcoredev.github.io/unrelated/', 'https://example.com/RailCore-CPKC-InternalApp/']) {
  test(`keeps nonproduction installation local: ${url}`, async () => {
    const h = harness({url, fetcher: () => response(snapshot())});
    await h.load();
    assert.deepEqual(h.requests.map(x => baseUrl(x.address)), ['data/lineups_snapshot.json']);
  });
}

test('preserves explicit partial-board uncertainty instead of changing source data', async () => {
  const partial = snapshot(20);
  partial.crew_boards.boards.push({status: 'unknown', stale: true, captured_at: null, rows: []});
  const h = harness({fetcher: () => response(partial)});
  assert.deepEqual(copy((await h.load()).data), partial);
});

test('HTTP failure cannot replace the saved snapshot with an error body', async () => {
  const h = harness({cached: snapshot(), fetcher: () => ({ok: false, status: 503,
    json: async () => { throw new Error('must not parse an HTTP error'); }})});
  assert.deepEqual(copy((await h.load()).data), snapshot());
});

test('both sources stalled still return saved data within two request deadlines', {timeout: 1000}, async () => {
  const h = harness({cached: snapshot(), fastTimers: true, fetcher: () => new Promise(() => {})});
  const result = await h.load();
  assert.equal(result.fromCache, true);
  assert.deepEqual(copy(result.data), snapshot());
  assert.deepEqual(h.timers, [8000, 8000]);
});

test('saved-copy presentation uses capture age, not generation or fetch time', async () => {
  const data = snapshot(); data.meta.generated_at = new Date(NOW).toISOString();
  const loaded = await harness({cached: data}).load();
  const app = fs.readFileSync(path.join(__dirname, '../docs/app.js'), 'utf8');
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  const ctx = vm.createContext({Date: Clock, Intl, LINEUPS: loaded,
    currentSection: 'boards', DOM: {freshnessText: {}}, REFERENCE: null, SNAPSHOT: null});
  for (const name of ['lineupsData', 'formatAge', 'localTime', 'updateFreshnessBar']) {
    const start = app.indexOf(`function ${name}(`), end = app.indexOf('\nfunction ', start + 1);
    vm.runInContext(app.slice(start, end), ctx);
  }
  ctx.updateFreshnessBar();
  assert.match(ctx.DOM.freshnessText.textContent, /OUT OF DATE/);
  assert.match(ctx.DOM.freshnessText.textContent, /1h 4m ago/);
  assert.match(ctx.DOM.freshnessText.textContent, /saved copy/);
  assert.doesNotMatch(ctx.DOM.freshnessText.textContent, /offline/);
});

test('release updates the cached loader and still bypasses the worker for public raw data', () => {
  const html = fs.readFileSync(path.join(__dirname, '../docs/index.html'), 'utf8');
  const sw = fs.readFileSync(path.join(__dirname, '../docs/service-worker.js'), 'utf8');
  assert.match(html, /data_loader\.js\?v=4175/);
  assert.match(html, /app\.js\?v=4175/);
  assert.match(sw, /railcore-cpkc-worker-v4175/);
  const handlers = {};
  const self = {location: new URL(SITE), addEventListener: (name, fn) => { handlers[name] = fn; }};
  vm.runInNewContext(sw, {self, URL});
  handlers.fetch({request: {url: RAW}, respondWith() { assert.fail('raw feed must not be intercepted'); }});
});
