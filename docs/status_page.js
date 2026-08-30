/**
 * Executive Overview (first screen)
 *
 * Data-first overview with additive math and clear metric semantics.
 */
window.StatusDashboard = (function() {
    'use strict';

    const API_BASE = '/api/report-packs';
    const DEFAULT_TERMINALS = ['OT', 'KC', 'DA'];
    const DETAIL_PANE_STORAGE_KEY = 'cpkc_exec_detail_pane_state_v1';
    const OVERVIEW_WINDOW_STORAGE_KEY = 'cpkc_overview_window_context_v1';
    const NAV_CONTEXT_STORAGE_KEY = 'cpkc_nav_context_v1';
    let appContainer = null;
    let allPacks = [];
    let selectedPacks = [];
    let selectedRangeLabel = '';
    let uiPlace = null;   // scroll/panel state across re-renders

    // the app scrolls an inner container, not the window (body height ==
    // viewport) -- every window.scrollTo was a no-op. Find the real one.
    function getScroller() {
        let el = appContainer;
        while (el && el !== document.body) {
            const s = getComputedStyle(el);
            if (el.scrollHeight > el.clientHeight + 4 &&
                (s.overflowY === 'auto' || s.overflowY === 'scroll' ||
                 s.overflow === 'auto' || s.overflow === 'scroll')) {
                return el;
            }
            el = el.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    }

    // DISPLAY picker for the Terminal Breakdown (operator 2026-08-26):
    // independent of the aggregation filter -- report shows the terminals
    // he wants while Davenport stays one checkbox away for reference.
    let state = {
        terminals: (function () {
            try {
                const raw = localStorage.getItem('exec-show-terms');
                if (raw) { return JSON.parse(raw); }
            } catch (e) {}
            return ['OT', 'KC', 'DA'];
        })(),
        mode: 'current_half',
        month: '',
        customStart: '',
        customEnd: '',
        showMonthlyHalves: false,
        detailPaneOpen: true,
        detailView: 'pool'
    };

    function loadDetailPaneState() {
        try {
            const raw = localStorage.getItem(DETAIL_PANE_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (typeof parsed.detailPaneOpen === 'boolean') {
                state.detailPaneOpen = parsed.detailPaneOpen;
            }
            if (typeof parsed.detailView === 'string' && parsed.detailView) {
                state.detailView = parsed.detailView;
            }
        } catch (error) {
            console.warn('Unable to load detail pane state', error);
        }
    }

    function saveDetailPaneState() {
        try {
            localStorage.setItem(DETAIL_PANE_STORAGE_KEY, JSON.stringify({
                detailPaneOpen: state.detailPaneOpen,
                detailView: state.detailView
            }));
        } catch (error) {
            console.warn('Unable to save detail pane state', error);
        }
    }

    function saveOverviewWindowState(windowMeta) {
        try {
            localStorage.setItem(OVERVIEW_WINDOW_STORAGE_KEY, JSON.stringify({
                start_date: windowMeta.startDate || '',
                end_date: windowMeta.endDate || '',
                range_label: windowMeta.rangeLabel || '',
                source: windowMeta.sourceLabel || '',
                mode: state.mode || '',
            }));
        } catch (error) {
            console.warn('Unable to save overview window state', error);
        }
    }

    let PACK = null;
    async function loadPack() {
        if (PACK) return PACK;
        const r = await fetch('data/status_pack.json', { cache: 'no-cache' });
        PACK = await r.json();
        return PACK;
    }
    async function fetchJson(url) {
        try {
            const pk = await loadPack();
            if (url.indexOf('/api/report-packs/list') >= 0) return pk.list;
            let m = url.match(/\/api\/report-packs\/([^/]+)\/([^/]+)\/([^/]+)\/(summary|pool-summary|trains)$/);
            if (m) {
                const w = pk.windows[`${m[1]}/${m[2]}/${m[3]}`] || {};
                if (m[4] === 'summary') return w.summary || null;
                if (m[4] === 'pool-summary') return w.pool_summary || null;
                return { trains: [] };
            }
            m = url.match(/\/api\/pool-times\?wins=(.+)$/);
            if (m) {
                const wins = decodeURIComponent(m[1]).split(',').sort().join(',');
                return pk.pool_times[wins] || null;
            }
            m = url.match(/\/api\/detail\/location-trains\?(.+)$/);
            if (m) {
                const q = new URLSearchParams(m[1]);
                const k = `${q.get('terminal')}|${q.get('start_date')}|${q.get('end_date')}`;
                return pk.location_trains[k] || null;
            }
            if (url.indexOf('/api/detail/train-layer') >= 0) return null;
            console.warn('status pack: no packed data for', url);
            return null;
        } catch (error) {
            console.error(`Error resolving ${url}:`, error);
            return null;
        }
    }

    async function fetchAllPacks() {
        const data = await fetchJson(`${API_BASE}/list`);
        return (data && data.packs) ? data.packs : [];
    }

    function toNumber(value, fallback = 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : fallback;
    }

    function parseBool(value) {
        return String(value || '').trim().toLowerCase() === 'true';
    }

    function monthLabel(yyyyMm) {
        if (!yyyyMm || !yyyyMm.includes('-')) return yyyyMm || '';
        const [year, month] = yyyyMm.split('-');
        const d = new Date(Number(year), Number(month) - 1, 1);
        return d.toLocaleString('default', { month: 'long', year: 'numeric' });
    }

    function getCurrentMonthHalf() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const half = now.getDate() <= 15 ? 'H1' : 'H2';
        return { month: `${year}-${month}`, half };
    }

    function previousHalf(month, half) {
        const [y, m] = month.split('-').map(Number);
        if (half === 'H2') return { month, half: 'H1' };
        const date = new Date(y, m - 2, 1);
        const pm = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return { month: pm, half: 'H2' };
    }

    function packKey(pack) {
        return `${pack.month}|${pack.half}`;
    }

    function getAvailableMonths(packs) {
        return [...new Set((packs || []).map((p) => p.month))]
            .sort()
            .reverse();
    }

    function getMostRecentHalfKey(packs) {
        const keys = getSortedHalfKeysDesc(packs);
        return keys[0] || '';
    }

    function getSortedHalfKeysDesc(packs) {
        const keys = [...new Set((packs || []).map((p) => packKey(p)))];
        keys.sort((a, b) => {
            const [am, ah] = a.split('|');
            const [bm, bh] = b.split('|');
            if (am !== bm) return am < bm ? 1 : -1;
            if (ah === bh) return 0;
            return ah === 'H2' ? -1 : 1;
        });
        return keys;
    }

    function getReferenceMonthHalf(packs) {
        const latest = getMostRecentHalfKey(packs);
        if (!latest) {
            const current = getCurrentMonthHalf();
            return current;
        }
        const [month, half] = latest.split('|');
        return { month, half };
    }

    function derivePackDateRange(pack) {
        const rw = pack.reporting_window || {};
        if (rw.start_date && rw.end_date) {
            return { start: rw.start_date, end: rw.end_date };
        }
        if (!pack.month) return { start: '', end: '' };
        const [year, month] = pack.month.split('-').map(Number);
        if (pack.half === 'H1') return { start: `${pack.month}-01`, end: `${pack.month}-15` };
        const endDay = new Date(year, month, 0).getDate();
        return { start: `${pack.month}-16`, end: `${pack.month}-${String(endDay).padStart(2, '0')}` };
    }

    function rangesOverlap(aStart, aEnd, bStart, bEnd) {
        if (!aStart || !aEnd || !bStart || !bEnd) return false;
        return aStart <= bEnd && bStart <= aEnd;
    }

    function getSelectedPacksForState(packs) {
        if (!packs.length) return { rows: [], label: 'No data' };
        if (state.mode === 'month') {
            const month = state.month || getAvailableMonths(packs)[0];
            return {
                rows: packs.filter((p) => p.month === month),
                label: `${monthLabel(month)} (H1+H2)`
            };
        }

        if (state.mode === 'custom') {
            if (!state.customStart || !state.customEnd) {
                return { rows: [], label: 'Custom range (choose start and end date)' };
            }
            const rows = packs.filter((p) => {
                const dr = derivePackDateRange(p);
                return rangesOverlap(dr.start, dr.end, state.customStart, state.customEnd);
            });
            return {
                rows,
                label: `${state.customStart} to ${state.customEnd} (custom)`
            };
        }

        const reference = getReferenceMonthHalf(packs);
        const target = state.mode === 'last_half' ? previousHalf(reference.month, reference.half) : reference;
        let key = `${target.month}|${target.half}`;
        const keys = getSortedHalfKeysDesc(packs);
        if (!keys.includes(key)) {
            if (state.mode === 'last_half' && keys.length > 1) {
                key = keys[1];
            } else {
                key = keys[0] || '';
            }
        }
        if (!key) return { rows: [], label: 'No data' };
        const [month, half] = key.split('|');
        return {
            rows: packs.filter((p) => packKey(p) === key),
            label: `${monthLabel(month)} (${half})`
        };
    }

    function getRowsForWindowMode(packs, mode) {
        if (!packs.length) return { rows: [], label: 'No data' };
        const now = new Date();
        const reference = getReferenceMonthHalf(packs);

        if (mode === 'current_half' || mode === 'last_half') {
            const target = mode === 'last_half'
                ? previousHalf(reference.month, reference.half)
                : reference;
            let key = `${target.month}|${target.half}`;
            const keys = getSortedHalfKeysDesc(packs);
            if (!keys.includes(key)) {
                if (mode === 'last_half' && keys.length > 1) {
                    key = keys[1];
                } else {
                    key = keys[0] || '';
                }
            }
            if (!key) return { rows: [], label: 'No data' };
            const [month, half] = key.split('|');
            return {
                rows: packs.filter((p) => packKey(p) === key),
                label: `${monthLabel(month)} (${half})`
            };
        }

        if (mode === 'last_month') {
            const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const rows = packs.filter((p) => p.month === month);
            if (rows.length) return { rows, label: `${monthLabel(month)} (H1+H2)` };
            const fallbackMonth = getAvailableMonths(packs)[0];
            return {
                rows: packs.filter((p) => p.month === fallbackMonth),
                label: `${monthLabel(fallbackMonth)} (fallback month)`
            };
        }

        if (mode === 'current_month') {
            const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const rows = packs.filter((p) => p.month === month);
            return { rows, label: `${monthLabel(month)} (H1+H2)` };
        }

        if (mode === 'prev_month') {
            const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const rows = packs.filter((p) => p.month === month);
            return { rows, label: `${monthLabel(month)} (H1+H2)` };
        }

        if (mode === 'prior_ytd') {
            const year = String(now.getFullYear() - 1);
            const rows = packs.filter((p) => {
                if (!String(p.month || '').startsWith(`${year}-`)) return false;
                const mm = parseInt(String(p.month).split('-')[1], 10);
                return mm <= now.getMonth() + 1;
            });
            return { rows, label: `${year} YTD (same span)` };
        }

        if (mode === 'ytd') {
            const year = String(now.getFullYear());
            const rows = packs.filter((p) => String(p.month || '').startsWith(`${year}-`));
            if (rows.length) {
                // say which months are MISSING instead of silently
                // shrinking the year (2026-03 has no packs; operator's
                // YTD question 2026-08-26)
                const have = new Set(rows.map((p) => p.month));
                const missing = [];
                for (let m = 1; m <= now.getMonth() + 1; m++) {
                    const mm = `${year}-${String(m).padStart(2, '0')}`;
                    if (!have.has(mm)) missing.push(mm);
                }
                const miss = missing.length
                    ? ` — MISSING ${missing.join(', ')} (no data packs)` : '';
                return { rows, label: `${year} Year-to-Date${miss}` };
            }
            const fallbackMonth = getAvailableMonths(packs)[0];
            const fallbackYear = String((fallbackMonth || '').split('-')[0] || '');
            return {
                rows: packs.filter((p) => String(p.month || '').startsWith(`${fallbackYear}-`)),
                label: `${fallbackYear} Year-to-Date (fallback)`
            };
        }

        return { rows: [], label: 'No data' };
    }

    function ensureTerminalRecord(map, terminal) {
        if (!map[terminal]) {
            map[terminal] = {
                terminal,
                trains: 0,
                    starts: 0,
                recrewEvents: new Set(),
                splitEvents: new Set(),
                turnSets: 0,
                crewSlots: 0,
                pools: {}
            };
        }
        return map[terminal];
    }

    function ensurePoolRecord(termRec, pool) {
        if (!termRec.pools[pool]) {
            termRec.pools[pool] = {
                pool,
                    trains: 0,
                starts: 0,
                turnSets: 0,
                crewSlots: 0
            };
        }
        return termRec.pools[pool];
    }

    function poolCategory(poolName) {
        const pool = String(poolName || '').toUpperCase().trim();
        const compact = pool.replace(/\s+/g, '');
        if (['SW', 'OB', 'KA', 'DA'].includes(pool)) return 'POOL';
        if (pool === 'EW') return 'EW';
        if (pool === 'YD' || pool === 'YARD' || pool.includes('YARD')) return 'YD';
        if (pool === 'LOCAL' || pool.includes('LOCAL')) return 'LOCAL';
        // Common local assignment/job patterns (e.g., K07, K91-18, KU83, KD70, Q91X).
        if (/^[A-Z]{1,3}\d{2,3}[A-Z0-9-]*$/.test(compact)) return 'LOCAL';
        // Additional safety net for KC/DA local-style symbols with punctuation/spaces.
        if (/^[KQ][A-Z0-9-]{2,}$/.test(compact) && /\d/.test(compact)) return 'LOCAL';
        if (/^LO[A-Z0-9-]*$/.test(compact)) return 'LOCAL';
        return 'OTHER';
    }

    function aggregatePackPoolTurns(poolRows) {
        const byPool = {};
        (poolRows || []).forEach((row) => {
            const pool = (row.pool_family_candidate || 'UNKNOWN').toUpperCase();
            const turns = toNumber(row.scheduled_turns, 0);
            if (!turns) return;
            // endpoint now serves turns (max craft) + crew_slots (craft
            // sum) separately -- the old += doubled turns (audit
            // 2026-08-26)
            const slots = toNumber(row.crew_slots, turns * 2);
            if (!byPool[pool]) byPool[pool] = { turnSets: 0, crewSlots: 0 };
            byPool[pool].crewSlots = Math.max(byPool[pool].crewSlots, slots);
            byPool[pool].turnSets = Math.max(byPool[pool].turnSets, turns);
        });
        return byPool;
    }

    async function buildOverviewData(packsForWindow) {
        // ONE terminal control (operator 2026-08-26): the Window Filters
        // checkboxes decide what the WHOLE page counts and shows.
        packsForWindow = packsForWindow.filter(
            (p) => state.terminals.indexOf(p.terminal) >= 0);
        const terminalMap = {};
        const halfMap = {};
        const globalRecrew = new Set();
        const globalSplit = new Set();

        const results = await Promise.all(
            packsForWindow.map(async (pack) => {
                const base = `${API_BASE}/${pack.terminal}/${pack.month}/${pack.half}`;
                const [summary, poolSummary, trains] = await Promise.all([
                    fetchJson(`${base}/summary`),
                    fetchJson(`${base}/pool-summary`),
                    fetchJson(`${base}/trains`)
                ]);
                return { pack, summary, poolSummary, trains };
            })
        );

        results.forEach(({ pack, summary, poolSummary, trains }) => {
            if (!summary || summary.error) return;
            const terminal = pack.terminal;
            const termRec = ensureTerminalRecord(terminalMap, terminal);
            const facts = summary.facts || {};
            const startsByPool = (facts.starts_by_pool && facts.starts_by_pool.values) || {};
            const trainsByPool = (facts.trains_by_pool && facts.trains_by_pool.values) || {};

            Object.entries(startsByPool).forEach(([pool, starts]) => {
                const poolRec = ensurePoolRecord(termRec, pool);
                poolRec.starts += toNumber(starts, 0);
            });
            Object.entries(trainsByPool).forEach(([pool, trainCount]) => {
                const poolRec = ensurePoolRecord(termRec, pool);
                poolRec.trains += toNumber(trainCount, 0);
            });

            // TRUE splits from the counting engine (legacy split_flag is
            // retired; page showed 0 while engine had 4 -- audit 2026-08-26)
            ((poolSummary && poolSummary.pools) || []).forEach((row) => {
                if (typeof row.true_splits === 'number') {
                    termRec.trueSplits =
                        (termRec.trueSplits || 0) + row.true_splits;
                    termRec.hasTrueSplits = true;
                }
                const pl = row.pool_family_candidate;
                if (pl) {
                    const poolRec = ensurePoolRecord(termRec, pl);
                    poolRec.splits = (poolRec.splits || 0) +
                        (row.true_splits || 0);
                    poolRec.recrew = (poolRec.recrew || 0) +
                        (row.recrew || 0);
                    if (typeof row.trains_covering === 'number') {
                        poolRec.covering = (poolRec.covering || 0) +
                            row.trains_covering;
                    }
                    if (row.turns_weeks) poolRec.turnsWeeks = row.turns_weeks;
                    if (row.turns_by_craft) {
                        poolRec.turnsByCraft = poolRec.turnsByCraft || {};
                        Object.entries(row.turns_by_craft).forEach(([cr, n]) => {
                            poolRec.turnsByCraft[cr] = Math.max(poolRec.turnsByCraft[cr] || 0, n);
                        });
                    }
                }
            });
            const turnsByPool = aggregatePackPoolTurns((poolSummary && poolSummary.pools) || []);
            Object.entries(turnsByPool).forEach(([pool, turnData]) => {
                const poolRec = ensurePoolRecord(termRec, pool);
                // Use max across packs in same period selection to avoid double counting static slots.
                poolRec.turnSets = Math.max(poolRec.turnSets, turnData.turnSets);
                poolRec.crewSlots = Math.max(poolRec.crewSlots, turnData.crewSlots);
            });

            // RECREW from summary.recrewed_trains = canonical count with
            // terminal attribution (register scan double-counted trains
            // crossing terminals; audit 2026-08-26)
            const packRecrew = toNumber(summary.recrewed_trains, 0);
            termRec.recrewCanonical =
                (termRec.recrewCanonical || 0) + packRecrew;
            const halfRecrew = { size: packRecrew };
            const halfSplit = { size: 0 };

            // Track pack-level row for optional monthly half split display.
            const halfKey = `${terminal}|${pack.month || ''}|${pack.half || ''}`;
            const startsTotal = Object.values(startsByPool).reduce((s, v) => s + toNumber(v, 0), 0);
            const trainsTotal = Object.values(trainsByPool).reduce((s, v) => s + toNumber(v, 0), 0);
            const turnsTotal = Object.values(turnsByPool).reduce((s, v) => s + toNumber(v.turnSets, 0), 0);
            const slotsTotal = Object.values(turnsByPool).reduce((s, v) => s + toNumber(v.crewSlots, 0), 0);
            if (!halfMap[halfKey]) {
                halfMap[halfKey] = {
                    terminal,
                    month: pack.month || '',
                    half: pack.half || '',
                    trains: 0,
                    starts: 0,
                    recrew: 0,
                    split: 0,
                    turnSets: 0,
                    crewSlots: 0
                };
            }
            halfMap[halfKey].trains += trainsTotal;
            halfMap[halfKey].starts += startsTotal;
            halfMap[halfKey].turnSets = Math.max(halfMap[halfKey].turnSets, turnsTotal);
            halfMap[halfKey].crewSlots = Math.max(halfMap[halfKey].crewSlots, slotsTotal);
            halfMap[halfKey].recrew += halfRecrew.size;
            halfMap[halfKey].split += halfSplit.size;
        });

        const terminals = state.terminals.map((t) => ensureTerminalRecord(terminalMap, t));
        terminals.forEach((termRec) => {
            const poolRows = Object.values(termRec.pools);
            termRec.starts = poolRows.reduce((s, r) => s + r.starts, 0);
            termRec.trains = poolRows.reduce((s, r) => s + r.trains, 0);
            termRec.turnSets = poolRows.reduce((s, r) => s + r.turnSets, 0);
            termRec.crewSlots = poolRows.reduce((s, r) => s + r.crewSlots, 0);
            termRec.recrew = termRec.recrewCanonical || 0;
            termRec.split = termRec.hasTrueSplits
                ? termRec.trueSplits : termRec.splitEvents.size;
            termRec.coverage = { assigned: 0, ew: 0, other: 0 };
            const categoryRows = {
                EW: { starts: 0, trains: 0 },
                YD: { starts: 0, trains: 0 },
                LOCAL: { starts: 0, trains: 0 },
                OTHER: { starts: 0, trains: 0 }
            };
            poolRows.forEach((r) => {
                const cat = poolCategory(r.pool);
                if (cat === 'POOL') {
                    termRec.coverage.assigned += r.trains;
                    return;
                }
                if (cat === 'EW') {
                    termRec.coverage.ew += r.trains;
                } else {
                    termRec.coverage.other += r.trains;
                }
                if (categoryRows[cat]) {
                    categoryRows[cat].starts += r.starts;
                    categoryRows[cat].trains += r.trains;
                } else {
                    categoryRows.OTHER.starts += r.starts;
                    categoryRows.OTHER.trains += r.trains;
                }
            });
            termRec.categoryRows = categoryRows;
            // Pool-scoped numerators for the per-turn ratios (operator
            // 2026-08-29 'something seems off': EW/yard/local starts were
            // divided by POOL turns -- 62 EW starts inflated OT H2
            // Starts/Turn from 20.8 to 25.9. Turns only exist for pools,
            // so only pool trains/starts belong on top.)
            termRec.poolOnlyStarts = poolRows.reduce((s, r) =>
                s + (poolCategory(r.pool) === 'POOL' ? r.starts : 0), 0);
            termRec.poolOnlyTrains = termRec.coverage.assigned;
            // craft-split turns (operator 2026-08-30: the phantom temp
            // turn hid on the AE side -- EN vs AE must be visible)
            termRec.turnsByCraft = {};
            poolRows.forEach((r) => {
                if (poolCategory(r.pool) === 'POOL' && r.turnsByCraft) {
                    Object.entries(r.turnsByCraft).forEach(([cr, n]) => {
                        termRec.turnsByCraft[cr] = (termRec.turnsByCraft[cr] || 0) + n;
                    });
                }
            });
            termRec.poolRows = poolRows
                .sort((a, b) => b.trains - a.trains)
                .map((r) => ({
                    ...r,
                    trainsPerTurn: r.turnSets > 0 ? (r.trains / r.turnSets) : null,
                    startsPerTurn: r.crewSlots > 0 ? (r.starts / r.crewSlots) : null
                }));
        });

        const totals = {
            trains: terminals.reduce((s, t) => s + t.trains, 0),
            starts: terminals.reduce((s, t) => s + t.starts, 0),
            poolOnlyTrains: terminals.reduce((s, t) => s + (t.poolOnlyTrains || 0), 0),
            poolOnlyStarts: terminals.reduce((s, t) => s + (t.poolOnlyStarts || 0), 0),
            turnSets: terminals.reduce((s, t) => s + t.turnSets, 0),
            crewSlots: terminals.reduce((s, t) => s + t.crewSlots, 0),
            recrew: terminals.reduce((s, t) => s + (t.recrew || 0), 0),
            split: terminals.some((t) => t.hasTrueSplits)
                ? terminals.reduce((s, t) => s + (t.split || 0), 0)
                : globalSplit.size,
            coverage: {
                assigned: terminals.reduce((s, t) => s + (t.coverage.assigned || 0), 0),
                ew: terminals.reduce((s, t) => s + (t.coverage.ew || 0), 0),
                other: terminals.reduce((s, t) => s + (t.coverage.other || 0), 0)
            }
        };

        const terminalHalfRows = Object.values(halfMap).sort((a, b) => {
            if (a.terminal !== b.terminal) return a.terminal.localeCompare(b.terminal);
            if (a.half === b.half) return 0;
            return a.half === 'H1' ? -1 : 1;
        });

        return { terminals, totals, terminalHalfRows };
    }

    function fmtInt(value) {
        return toNumber(value, 0).toLocaleString();
    }

    function fmtRatio(value) {
        if (value === null || value === undefined || Number.isNaN(value)) return '—';
        return Number(value).toFixed(2);
    }

    function escapeHtml(text) {
        return String(text || '')
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function yesNo(value) {
        return value ? 'Yes' : 'No';
    }

    async function buildTerminalAssignmentBreakdown(startDate, endDate) {
        if (!startDate || !endDate) return {};
        const terminals = [...state.terminals];
        const breakdownByTerminal = {};
        const fetches = terminals.map(async (terminal) => {
            try {
                const qs = new URLSearchParams({
                    terminal,
                    start_date: startDate,
                    end_date: endDate
                });
                const payload = await fetchJson(`/api/detail/location-trains?${qs.toString()}`);
                const termObj = (payload?.terminals || []).find((t) => t.terminal === terminal);
                if (!termObj) {
                    breakdownByTerminal[terminal] = {};
                    return;
                }
                const byCategory = {};
                const byPool = {};
                (termObj.pools || []).forEach((poolRow) => {
                    const poolKey = String(poolRow.pool || 'UNKNOWN').toUpperCase();
                    if (!byPool[poolKey]) byPool[poolKey] = {};
                    (poolRow.train_rows || []).forEach((trainRow) => {
                        const assignment = String(trainRow.train_symbol || '').trim() || 'UNKNOWN';
                        const sourceCategory = poolCategory(poolRow.pool);
                        const assignmentCategory = poolCategory(assignment);
                        const category = (sourceCategory === 'OTHER' && assignmentCategory !== 'OTHER')
                            ? assignmentCategory
                            : sourceCategory;
                        if (!byCategory[category]) byCategory[category] = {};
                        const eventKey = [
                            String(trainRow.service_date || ''),
                            String(trainRow.on_duty_ts_first || ''),
                            String(poolRow.pool || ''),
                            assignment,
                        ].join('|');
                        if (!byCategory[category][assignment]) {
                            byCategory[category][assignment] = {
                                assignment,
                                trains: 0,
                                starts: 0,
                                executionsMap: {},
                            };
                        }
                        byCategory[category][assignment].trains += 1;
                        byCategory[category][assignment].starts += toNumber(trainRow.starts, 0);
                        byCategory[category][assignment].executionsMap[eventKey] = {
                            train_symbol: assignment,
                            service_date: trainRow.service_date || '',
                            on_duty_ts_first: trainRow.on_duty_ts_first || '',
                            operational_pool_yard: poolRow.pool || '',
                            starts: toNumber(trainRow.starts, 0),
                            crew_count: toNumber(trainRow.employee_count, 0),
                            recrew_flag: Boolean(trainRow.recrew_flag),
                            split_flag: Boolean(trainRow.split_flag),
                        };
                        if (!byPool[poolKey][assignment]) {
                            byPool[poolKey][assignment] = {
                                assignment,
                                trains: 0,
                                starts: 0,
                                executionsMap: {},
                            };
                        }
                        byPool[poolKey][assignment].trains += 1;
                        byPool[poolKey][assignment].starts += toNumber(trainRow.starts, 0);
                        byPool[poolKey][assignment].executionsMap[eventKey] = {
                            train_symbol: assignment,
                            service_date: trainRow.service_date || '',
                            on_duty_ts_first: trainRow.on_duty_ts_first || '',
                            operational_pool_yard: poolRow.pool || '',
                            starts: toNumber(trainRow.starts, 0),
                            crew_count: toNumber(trainRow.employee_count, 0),
                            recrew_flag: Boolean(trainRow.recrew_flag),
                            split_flag: Boolean(trainRow.split_flag),
                        };
                    });
                });
                breakdownByTerminal[terminal] = {
                    byCategory: Object.fromEntries(Object.entries(byCategory).map(([category, rec]) => [
                        category,
                        Object.values(rec)
                            .map((row) => ({
                                assignment: row.assignment,
                                trains: row.trains,
                                starts: row.starts,
                                executions: Object.values(row.executionsMap || {}).sort((a, b) => {
                                    const aDate = `${a.service_date || ''}|${a.on_duty_ts_first || ''}`;
                                    const bDate = `${b.service_date || ''}|${b.on_duty_ts_first || ''}`;
                                    return aDate < bDate ? 1 : -1;
                                }),
                            }))
                            .sort((a, b) => {
                                if (b.trains !== a.trains) return b.trains - a.trains;
                                if (b.starts !== a.starts) return b.starts - a.starts;
                                return a.assignment.localeCompare(b.assignment);
                            })
                    ])),
                    byPool: Object.fromEntries(Object.entries(byPool).map(([pool, rec]) => [
                        pool,
                        Object.values(rec)
                            .map((row) => ({
                                assignment: row.assignment,
                                trains: row.trains,
                                starts: row.starts,
                                executions: Object.values(row.executionsMap || {}).sort((a, b) => {
                                    const aDate = `${a.service_date || ''}|${a.on_duty_ts_first || ''}`;
                                    const bDate = `${b.service_date || ''}|${b.on_duty_ts_first || ''}`;
                                    return aDate < bDate ? 1 : -1;
                                }),
                            }))
                            .sort((a, b) => {
                                if (b.trains !== a.trains) return b.trains - a.trains;
                                if (b.starts !== a.starts) return b.starts - a.starts;
                                return a.assignment.localeCompare(b.assignment);
                            })
                    ])),
                };
            } catch (error) {
                console.warn(`Assignment breakdown fetch failed for ${terminal}`, error);
                breakdownByTerminal[terminal] = { byCategory: {}, byPool: {} };
            }
        });
        await Promise.all(fetches);
        return breakdownByTerminal;
    }

    function getLatestPackForContext(terminal) {
        const rows = (selectedPacks || []).filter((p) => !terminal || p.terminal === terminal);
        if (!rows.length) return null;
        const sorted = [...rows].sort((a, b) => {
            if (a.month !== b.month) return a.month < b.month ? 1 : -1;
            if (a.half === b.half) return 0;
            return a.half === 'H2' ? -1 : 1;
        });
        return sorted[0] || null;
    }

    function emitNavigationContext(target, context) {
        const payload = { target, context };
        window.__cpkc_nav_context = payload;
        try {
            localStorage.setItem(NAV_CONTEXT_STORAGE_KEY, JSON.stringify({
                ...payload,
                created_at: new Date().toISOString(),
            }));
        } catch (_) {}
        document.dispatchEvent(new CustomEvent('cpkc:navigate-context', {
            detail: {
                target,
                context: {
                    ...context,
                    mode: state.mode
                }
            }
        }));
    }

    function renderHeaderControls(monthOptions) {
        return `
            <details class="exec-controls exec-controls-bottom">
                <summary>Window Filters</summary>
                <div class="exec-mode-group exec-term-checks">
                    ${[['OT', 'Ottumwa'], ['KC', 'Kansas City'], ['DA', 'Davenport']].map(([code, label]) => `
                        <label class="exec-mode-btn ${state.terminals.indexOf(code) >= 0 ? 'active' : ''}">
                            <input type="checkbox" data-term-check="${code}" ${state.terminals.indexOf(code) >= 0 ? 'checked' : ''}/>
                            ${label}
                        </label>`).join('')}
                </div>
                <div class="exec-mode-group">
                    <button class="exec-mode-btn ${state.mode === 'current_half' ? 'active' : ''}" data-mode="current_half">Current Half</button>
                    <button class="exec-mode-btn ${state.mode === 'last_half' ? 'active' : ''}" data-mode="last_half">Last Half</button>
                    <button class="exec-mode-btn ${state.mode === 'month' ? 'active' : ''}" data-mode="month">Month</button>
                    <button class="exec-mode-btn ${state.mode === 'custom' ? 'active' : ''}" data-mode="custom">Custom Range</button>
                </div>
                <div class="exec-control-row">
                    <label class="exec-control">
                        Month
                        <select id="exec-month-select" ${state.mode === 'month' ? '' : 'disabled'}>
                            ${monthOptions.map((m) => `<option value="${m}" ${state.month === m ? 'selected' : ''}>${m}</option>`).join('')}
                        </select>
                    </label>
                    <label class="exec-control">
                        Start
                        <input id="exec-start-date" type="date" value="${state.customStart || ''}" ${state.mode === 'custom' ? '' : 'disabled'} />
                    </label>
                    <label class="exec-control">
                        End
                        <input id="exec-end-date" type="date" value="${state.customEnd || ''}" ${state.mode === 'custom' ? '' : 'disabled'} />
                    </label>
                    <label class="exec-control exec-check">
                        <span>Monthly split</span>
                        <div class="exec-check-inline">
                            <input id="exec-monthly-halves" type="checkbox" ${state.showMonthlyHalves ? 'checked' : ''} ${state.mode === 'month' ? '' : 'disabled'} />
                            <span>Show Monthly Halves</span>
                        </div>
                    </label>
                    <button class="action-btn" id="exec-apply-window">Apply</button>
                </div>
            </details>
        `;
    }

    function renderKpiStrip(totals) {
        return `
            <div class="exec-kpi-strip">
                <div class="exec-kpi metric-link" data-target="analytics-reports">
                    <div class="kpi-link-hint">View detail</div>
                    <div class="kpi-label">Trains Ran</div>
                    <div class="kpi-value">${fmtInt(totals.trains)}</div>
                        </div>
                <div class="exec-kpi metric-link" data-target="analytics-reports">
                    <div class="kpi-link-hint">View detail</div>
                    <div class="kpi-label">Starts</div>
                    <div class="kpi-value">${fmtInt(totals.starts)}</div>
                    </div>
                <div class="exec-kpi metric-link" data-target="analytics-reports" data-report-id="recrew-frequency" data-terminal="ALL">
                    <div class="kpi-link-hint">View detail</div>
                    <div class="kpi-label">Recrewed Trains</div>
                    <div class="kpi-value">${fmtInt(totals.recrew)}</div>
                    <div class="kpi-sub">subset, non-additive</div>
                        </div>
                <div class="exec-kpi metric-link" data-target="analytics-reports" data-report-id="train-family" data-terminal="ALL">
                    <div class="kpi-link-hint">View detail</div>
                    <div class="kpi-label">Split-Crew Trains</div>
                    <div class="kpi-value">${fmtInt(totals.split)}</div>
                    <div class="kpi-sub">subset, non-additive</div>
                    </div>
                <div class="exec-kpi metric-link" data-target="pool-reports">
                    <div class="kpi-link-hint">Open report pack</div>
                    <div class="kpi-label">Pool Turns</div>
                    <div class="kpi-value">${fmtInt(totals.turnSets)}</div>
                    <div class="kpi-sub">primary turns metric</div>
                        </div>
                <div class="exec-kpi metric-link" data-target="pool-reports">
                    <div class="kpi-link-hint">Open report pack</div>
                    <div class="kpi-label">Crew Slots Assigned</div>
                    <div class="kpi-value">${fmtInt(totals.crewSlots)}</div>
                    <div class="kpi-sub">EN+AE slots</div>
                    </div>
                </div>
        `;
    }

    const POOL_ROAD_TERM = { SW: 'OT', OB: 'OT', KA: 'KC', DA: 'DA' };

    // pools as COLUMNS (operator 2026-08-26): per-card mini table,
    // Cycle/Home/Rested rows down, one column per road pool in scope.
    // per-half pool-turn documentation (operator 2026-08-26: "should
    // document how many pool turns for each half"). <=6 halves listed;
    // longer windows summarized min-max, never silently lumped.
    function turnsByHalfLine(c, termFilter) {
        const rows = (c.halfRows || []).filter((r) =>
            termFilter ? r.terminal === termFilter
                       : state.terminals.indexOf(r.terminal) >= 0);
        const byHalf = {};
        rows.forEach((r) => {
            const k = `${r.month || ''} ${r.half || ''}`.trim() || r.half;
            byHalf[k] = (byHalf[k] || 0) + toNumber(r.turnSets, 0);
        });
        const ks = Object.keys(byHalf).sort();
        if (!ks.length) return '';
        if (ks.length <= 6) {
            return ks.map((k) => `${k}: ${fmtInt(byHalf[k])}`).join(' · ');
        }
        const vals = ks.map((k) => byHalf[k]);
        return `${ks.length} halves, ${fmtInt(Math.min(...vals))}–${fmtInt(Math.max(...vals))} turns assigned`;
    }

    function poolTimeTable(c, termFilter) {
        // ONE table per card (operator 2026-08-26): counts join the left
        // column; pools stay as columns. poolRows (window overview) give
        // trains/starts/recrew/split; times give cycle/home/rested +
        // assigned individuals.
        const times = c.times || {};
        const termRecs = c.terminals || [];
        const poolRowFor = (pool, term) => {
            const tr = termRecs.find((t) => t.terminal === term);
            return ((tr && tr.poolRows) || []).find(
                (pr) => String(pr.pool).toUpperCase() === pool) || {};
        };
        const roadOrder = ['SW', 'OB', 'KA', 'DA'];
        const boardOrder = ['EW', 'YD', 'LOCAL', 'LO'];
        const cols = [];
        const termsInScope = termFilter ? [termFilter] : state.terminals;
        roadOrder.forEach((pool) => {
            const term = POOL_ROAD_TERM[pool];
            if (termsInScope.indexOf(term) < 0) return;
            const key = `${pool}@${term}`;
            if (times[key] || poolRowFor(pool, term).pool) {
                cols.push({ key, pool, term, label: pool });
            }
        });
        termsInScope.forEach((term) => {
            boardOrder.forEach((pool) => {
                const tk = pool === 'LOCAL' ? 'LO' : pool;
                const key = `${tk}@${term}`;
                if ((times[key] || poolRowFor(pool, term).pool) &&
                    !cols.some((cc) => cc.key === key && cc.term === term)) {
                    cols.push({ key, pool, term,
                        label: termFilter ? pool : `${pool} ${term}` });
                }
            });
        });
        if (!cols.length) return '';
        // TOTAL column (operator 2026-08-26: "totals should be in
        // another column"): sums for counts; n-weighted means for times.
        const sumBy = (fn) => cols.reduce((a, col) => {
            const v = fn(times[col.key] || {}, poolRowFor(col.pool, col.term));
            return v == null ? a : a + v;
        }, 0);
        const wMean = (vk) => {
            let w = 0, n = 0;
            cols.forEach((col) => {
                const s = times[col.key] || {};
                if (s[vk] != null && s.n) { w += s[vk] * s.n; n += s.n; }
            });
            return n ? w / n : null;
        };
        // TOTAL Assigned = DISTINCT individuals (a member on several
        // boards counts ONCE -- operator 2026-08-26); other counts sum
        // (disjoint events), times stay n-weighted means.
        const tw = c.termWorkers || {};
        const distinctWorkers = termFilter
            ? (tw[termFilter] != null ? tw[termFilter] : sumBy((s) => s.workers))
            : state.terminals.reduce((a, t) =>
                a + (tw[t] || 0), 0) || sumBy((s) => s.workers);
        const totals = {
            trains: sumBy((s, pr) => pr.trains),
            starts: sumBy((s, pr) => pr.starts),
            recrew: sumBy((s, pr) => pr.recrew),
            splits: sumBy((s, pr) => pr.splits),
            workers: distinctWorkers,
            tstarts: sumBy((s) => s.starts),
            cycle: wMean('cycle_h'), home: wMean('home_h'),
            rested: wMean('rested_h'),
        };
        const row = (label, fn, tot) => `<tr><td>${label}</td>${cols.map(
            (col) => `<td>${fn(times[col.key] || {},
                              poolRowFor(col.pool, col.term))}</td>`
            ).join('')}<td class="exec-times-total">${tot}</td></tr>`;
        return `
            <table class="exec-times-table">
                <thead><tr><th></th>${cols.map(
                    (col) => `<th>${col.label}</th>`).join('')}<th class="exec-times-total">TOTAL</th></tr></thead>
                <tbody>
                    ${row('Pool Turns', (s, pr) => pr.turnSets ? fmtInt(pr.turnSets) : '—', fmtInt(sumBy((s, pr) => pr.turnSets)))}
                    ${row('Trains', (s, pr) => pr.trains != null ? fmtInt(pr.trains) : '—', fmtInt(totals.trains))}
                    ${row('Starts', (s, pr) => pr.starts != null ? fmtInt(pr.starts) : '—', fmtInt(totals.starts))}
                    ${row('Recrew', (s, pr) => pr.recrew != null ? fmtInt(pr.recrew) : '—', fmtInt(totals.recrew))}
                    ${row('Split', (s, pr) => pr.splits != null ? fmtInt(pr.splits) : '—', fmtInt(totals.splits))}
                    ${row('Assigned', (s) => s.workers != null ? fmtInt(s.workers) : '—', fmtInt(totals.workers))}
                    ${row('Starts/Ea', (s) => (s.workers && s.starts != null) ? (s.starts / s.workers).toFixed(1) : '—', totals.workers ? (totals.tstarts / totals.workers).toFixed(1) : '—')}
                    ${row('Cycle', (s) => fmtHours(s.cycle_h), fmtHours(totals.cycle))}
                    ${row('Home', (s) => fmtHours(s.home_h), fmtHours(totals.home))}
                    ${row('Rested', (s) => fmtHours(s.rested_h), fmtHours(totals.rested))}
                </tbody>
            </table>
            <div class="doclib-hitcount">Assigned: road pools = WEEKLY ASSIGNMENT (marks) — who held the turns that window (pre-2026-08-22 windows use the worked-the-turn proxy, labeled). Starts/Ea = the POOL'S OWN starts by its assigned people ÷ all assigned (average; idle assigned count). EW/YD/LOCAL = everyone who worked the board. TOTAL Assigned = distinct individuals, counted once.</div>
            ${cols.map((col) => {
                const tw = poolRowFor(col.pool, col.term).turnsWeeks;
                if (!tw) return '';
                const parts = Object.entries(tw).map(
                    ([wk, n]) => `${wk}: ${n}`).join(', ');
                return `<div class="doclib-hitcount">note: ${col.label} pool turns changed mid-half (${parts})</div>`;
            }).join('')}`;
    }

    function fmtHours(v) {
        if (v === null || v === undefined || Number.isNaN(v)) return '—';
        return Number(v).toFixed(1) + 'h';
    }

    // honest delta per window (operator 2026-08-26): current half is the
    // baseline (no self-delta; someday vs last year same half); last month
    // compares to the month before it; YTD compares to prior-year span.
    function deltaLineFor(c, all, pick) {
        const fmtDelta = (n) => {
            const v = toNumber(n, 0);
            return `${v > 0 ? '+' : ''}${fmtInt(v)}`;
        };
        const find = (id) => all.find((x) => x.id === id);
        let base = null, label = '';
        if (c.id === 'current_half') {
            return '<span class="exec-compare-delta">baseline window</span>';
        }
        if (c.id === 'last_half') {
            base = find('current_half'); label = 'vs Current Half';
        } else if (c.id === 'last_month') {
            base = find('current_month');
            label = base ? `vs Current Month (${base.label})` : '';
        } else if (c.id === 'ytd') {
            base = find('prior_ytd');
            if (!base || base.noData) {
                return '<span class="exec-compare-delta">vs prior year: no data (history starts Sep 2025)</span>';
            }
            label = `vs ${base.label}`;
        }
        if (!base || base.noData) {
            return '<span class="exec-compare-delta">no comparison data</span>';
        }
        const bt = pick(base);
        const ct = pick(c);
        return `<span class="exec-compare-delta">Delta ${label} (Trains / Starts): <strong>${fmtDelta(ct.trains - bt.trains)} / ${fmtDelta(ct.starts - bt.starts)}</strong></span>`;
    }

    function renderComparisonPanel(comparisons) {
        if (!comparisons || !comparisons.length) return '';
        return `
                <div class="dashboard-section">
                <h3>Window Comparison</h3>
                <div class="section-range">Quick benchmark across standard windows | times = road pools, median-based</div>
                <div class="exec-compare-grid">
                    ${comparisons.filter((c) => !c.hidden).map((c) => `
                        <button class="exec-compare-card ${state.mode === c.id ? 'active' : ''}" data-compare-mode="${c.id}" title="Set main window to ${c.title}">
                            <div class="exec-compare-title">${c.title}</div>
                            <div class="exec-compare-range">${c.label}</div>
                            <div class="exec-compare-metrics exec-compare-2col">
                                <span>Trains: <strong>${fmtInt(c.totals.trains)}</strong></span>
                                <span>Starts: <strong>${fmtInt(c.totals.starts)}</strong></span>
                                <span>Pool Turns: <strong>${fmtInt(c.totals.turnSets)}</strong></span>
                                <span>Recrew: <strong>${fmtInt(c.totals.recrew)}</strong></span>
                                <span>Split: <strong>${fmtInt(c.totals.split)}</strong></span>
                                ${poolTimeTable(c, null)}
                                ${deltaLineFor(c, comparisons, (x) => ({ trains: toNumber(x.totals.trains, 0), starts: toNumber(x.totals.starts, 0) }))}
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function getWindowMeta(packsForWindow) {
        if (!packsForWindow || !packsForWindow.length) {
            return {
                scopeLabel: 'All Terminals',
                rangeLabel: 'No window selected',
                sourceLabel: 'No source',
                startDate: '',
                endDate: '',
            };
        }
        const ranges = packsForWindow.map((p) => derivePackDateRange(p)).filter((r) => r.start && r.end);
        const start = ranges.length ? ranges.map((r) => r.start).sort()[0] : '';
        const end = ranges.length ? ranges.map((r) => r.end).sort().slice(-1)[0] : '';
        const scopeTerminals = [...new Set(packsForWindow.map((p) => p.terminal))].sort();
        const sources = [...new Set(packsForWindow.map((p) => p.source || 'report_pack'))];
        return {
            scopeLabel: `All Terminals (${scopeTerminals.join(', ')})`,
            rangeLabel: start && end ? `${start} to ${end}` : selectedRangeLabel,
            sourceLabel: sources.length === 1 ? sources[0] : sources.join(', '),
            startDate: start,
            endDate: end,
        };
    }

    function renderTerminalTable(terminals, totals, terminalHalfRows, rangeLabel) {
        const halvesByTerminal = {};
        (terminalHalfRows || []).forEach((row) => {
            if (!halvesByTerminal[row.terminal]) halvesByTerminal[row.terminal] = [];
            halvesByTerminal[row.terminal].push(row);
        });
        const rows = terminals.map((t) => `
            <tr>
                <td class="metric-link exec-master-link" data-detail-view="pool" data-terminal="${t.terminal}">${t.terminal}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="workload-balance">${fmtInt(t.trains)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="pool-utilization">${fmtInt(t.coverage.assigned)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="ew-coverage">${fmtInt(t.coverage.ew)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="pool-utilization">${fmtInt(t.coverage.other)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="workload-balance">${fmtInt(t.starts)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="recrew-frequency">${fmtInt(t.recrew)}</td>
                <td class="metric-link" data-target="analytics-reports" data-terminal="${t.terminal}" data-report-id="train-family">${fmtInt(t.split)}</td>
                <td class="metric-link" data-target="pool-reports" data-terminal="${t.terminal}">${fmtInt(t.turnSets)}${(t.turnsByCraft && t.turnsByCraft.EN != null && t.turnsByCraft.AE != null) ? `<div class="kpi-sub">EN ${fmtInt(t.turnsByCraft.EN)} · AE ${fmtInt(t.turnsByCraft.AE)}</div>` : ''}</td>
                <td class="metric-link" data-target="pool-reports" data-terminal="${t.terminal}">${fmtInt(t.crewSlots)}</td>
                <td>${fmtRatio(t.turnSets > 0 ? t.poolOnlyTrains / t.turnSets : null)}</td>
                <td>${t.startsEaWeekly != null
                    ? fmtRatio(t.startsEaWeekly) + (t.weeklyPartial ? '†' : '')
                    : fmtRatio(t.crewSlots > 0 ? t.poolOnlyStarts / t.crewSlots : null)}</td>
            </tr>
            ${(state.mode === 'month' && state.showMonthlyHalves ? (halvesByTerminal[t.terminal] || []).map((h) => `
                <tr class="half-subrow">
                    <td>${t.terminal} ${h.half}</td>
                    <td>${fmtInt(h.trains)}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                    <td>${fmtInt(h.starts)}</td>
                    <td>${fmtInt(h.recrew)}</td>
                    <td>${fmtInt(h.split)}</td>
                    <td>${fmtInt(h.turnSets)}</td>
                    <td>${fmtInt(h.crewSlots)}</td>
                    <td>${fmtRatio(h.turnSets > 0 ? h.trains / h.turnSets : null)}</td>
                    <td>${fmtRatio(h.turnSets > 0 ? h.starts / h.turnSets : null)}</td>
                </tr>
            `).join('') : '')}
        `).join('');
        return `
            <div class="dashboard-section">
                <h3>Terminal Breakdown</h3>
                <div class="section-range">${rangeLabel}</div>
                    <table class="status-table">
                        <thead>
                            <tr>
                                <th>Terminal</th>
                                <th>Trains</th>
                            <th>Assigned Pool</th>
                            <th>EW Cover</th>
                            <th>Other Cover</th>
                            <th>Starts</th>
                            <th>Recrew</th>
                            <th>Split</th>
                                <th>Pool Turns</th>
                            <th>Crew Slots</th>
                            <th>Trains/Turn</th>
                            <th>Starts/Ea</th>
                            </tr>
                        </thead>
                        <tbody>
                        ${rows}
                        <tr class="total-row">
                            <td><strong class="metric-link exec-master-link" data-detail-view="pool" data-terminal="ALL">TOTAL</strong></td>
                            <td><strong>${fmtInt(totals.trains)}</strong></td>
                            <td><strong>${fmtInt(totals.coverage.assigned)}</strong></td>
                            <td><strong>${fmtInt(totals.coverage.ew)}</strong></td>
                            <td><strong>${fmtInt(totals.coverage.other)}</strong></td>
                            <td><strong>${fmtInt(totals.starts)}</strong></td>
                            <td><strong>${fmtInt(totals.recrew)}</strong></td>
                            <td><strong>${fmtInt(totals.split)}</strong></td>
                            <td><strong>${fmtInt(totals.turnSets)}</strong></td>
                            <td><strong>${fmtInt(totals.crewSlots)}</strong></td>
                            <td><strong>${fmtRatio(totals.turnSets > 0 ? totals.poolOnlyTrains / totals.turnSets : null)}</strong></td>
                            <td><strong>${totals.startsEaWeekly != null
                                ? fmtRatio(totals.startsEaWeekly) + (totals.weeklyPartial ? '†' : '')
                                : fmtRatio(totals.crewSlots > 0 ? totals.poolOnlyStarts / totals.crewSlots : null)}</strong></td>
                                </tr>
                    </tbody>
                </table>
                <div class="table-note">Trains/Turn = assigned-pool trains over pool turns. Starts/Ea = WEEKLY: each week's pool starts over that week's assigned individuals (weekly marks, both crafts), summed across the window -- a 9-turn week and a 10-turn week each count with their own people (operator ruling 2026-08-29). † = marks don't cover the full window (collection began 2026-08-22); windows with no marks fall back to pool starts over scheduled seats. EW/yard/local work stays out of both ratios.</div>
            </div>
        `;
    }

    function renderTerminalWindowComparisons(terminalCode, comparisons) {
        if (!comparisons || !comparisons.length) return '';
        const byWindow = comparisons.map((c) => {
            const termTotals = (c.terminals || []).find((t) => t.terminal === terminalCode);
            return {
                id: c.id,
                title: c.title,
                label: c.label,
                hidden: c.hidden,
                noData: c.noData,
                times: c.times || {},
                termWorkers: c.termWorkers || {},
                terminals: c.terminals || [],
                halfRows: c.halfRows || [],
                totals: termTotals || { trains: 0, starts: 0, turnSets: 0, recrew: 0, split: 0 },
            };
        });
        return `
            <div class="section-range" style="margin: 8px 0 6px 0;">${terminalCode} window comparison | times = road pools, median-based</div>
            <div class="exec-compare-grid">
                ${byWindow.filter((c) => !c.hidden).map((c) => `
                    <div class="exec-compare-card ${state.mode === c.id ? 'active' : ''}">
                        <div class="exec-compare-title">${c.title}</div>
                        <div class="exec-compare-range">${c.label}</div>
                        <div class="exec-compare-metrics">
                            <span>Pool Turns assigned (${terminalCode}, all pools) — <strong>${turnsByHalfLine(c, terminalCode) || fmtInt(c.totals.turnSets)}</strong></span>
                            ${poolTimeTable(c, terminalCode)}
                            ${deltaLineFor(c, byWindow, (x) => ({ trains: toNumber(x.totals.trains, 0), starts: toNumber(x.totals.starts, 0) }))}
                        </div>
                    </div>
                            `).join('')}
            </div>
        `;
    }

    function renderTrainCrewDetail(detail) {
        if (!detail || !detail.crew_rows || !detail.crew_rows.length) {
            return '<div class="placeholder">PSTS17B per-train drill-down lives in the status app (not packed for the phone).</div>';
        }
        const rows = detail.crew_rows || [];
        const first = rows[0] || {};
        const t = detail.screen_template || {};
        const assignment = t.assignment || detail.train_symbol || '';
        const ofTime = t.of_time || first.assignment_datetime || detail.service_date || '';
        const depTime = t.dep || first.on_duty_time || first.on_duty_ts || '';
        const arrTime = t.arr || first.off_duty_time || '';
        const recrew = detail.recrew_flag ? 'Yes' : 'No';
        const related = Number(detail.related_event_count || 0);
        const inferRawCrewMeta = (row) => {
            const personKeys = [
                row.employee_name_raw,
                String(row.employee_id || '').replace(/^NAME:/i, ''),
            ]
                .map((v) => String(v || '').toUpperCase().replace(/\s+/g, ''))
                .filter(Boolean);

            const crewLines = Array.isArray(t.crew_lines) ? t.crew_lines : [];
            for (const line of crewLines) {
                const upper = String(line || '').toUpperCase();
                const compact = upper.replace(/\s+/g, '');
                const personMatch = personKeys.some((key) => compact.includes(key));
                if (!personMatch) continue;
                const pairMatch = upper.match(/\b([A-Z0-9]{2,6})\s+([A-Z0-9]{2,6})\s+\d{3,4}\s+\d{3,4}\b/);
                if (pairMatch) {
                    return { turnAsgn: pairMatch[1], asgn: pairMatch[2] };
                }
                const asgnMatch = upper.match(/\b([A-Z0-9]{2,6})\s+\d{3,4}\b/);
                if (asgnMatch) {
                    return { turnAsgn: row.turn_asgn || '', asgn: asgnMatch[1] };
                }
            }
            return { turnAsgn: row.turn_asgn || '', asgn: '' };
        };

        return `
            <div class="psts17b-screen">
                <div class="psts17b-title">CREW INFORMATION - PSTS17B</div>
                <div class="psts17b-meta">
                    <span><strong>DIST:</strong> ${t.dist || first.subdistrict || ''}</span>
                    <span><strong>SUB-DIST:</strong> ${t.sub_dist || first.subdistrict || ''}</span>
                    <span><strong>POOL/YARD:</strong> ${t.pool_yard || first.operational_pool_yard || first.pool || ''}</span>
                </div>
                <div class="psts17b-meta">
                    <span><strong>ASSIGNMENT:</strong> ${assignment}</span>
                    <span><strong>OF:</strong> ${ofTime}</span>
                    <span><strong>DEP:</strong> ${depTime}</span>
                    <span><strong>ARR:</strong> ${arrTime}</span>
                </div>
                <div class="psts17b-meta">
                    <span><strong>DEPART STN:</strong> ${t.depart_stn || ''}</span>
                    <span><strong>ARR STN:</strong> ${t.arr_stn || ''}</span>
                    <span><strong>INT STN:</strong> ${t.int_stn || ''}</span>
                    <span><strong>ROUTE:</strong> ${t.route || ''}</span>
                </div>
                <div class="psts17b-meta">
                    <span><strong>PROFILE:</strong> ${t.profile || ''}</span>
                    <span><strong>COND-ONLY:</strong> ${t.cond_only || ''}</span>
                    <span><strong>SOURCE:</strong> ${detail.detail_source || 'canonical'}</span>
                </div>
                <div class="psts17b-meta">
                    <span><strong>RECREW:</strong> ${recrew}</span>
                    <span><strong>RELATED CREW EVENTS:</strong> ${related}</span>
                </div>
                <div class="psts17b-sep"></div>
                <div class="psts17b-subhead">FUNC / NAME / TURN-ASGN / JOB / DUTY / POOL ATTRIBUTION</div>
                <table class="status-table compact psts17b-table">
                    <thead>
                        <tr>
                            <th>FUNC</th>
                            <th>NAME</th>
                            <th>EMP ID</th>
                            <th>ASGN</th>
                            <th>TURN/ASGN</th>
                            <th>JOB CODE</th>
                            <th>ON DUTY</th>
                            <th>OFF DUTY</th>
                            <th>SEARCH POOL</th>
                            <th>CREW POOL</th>
                            </tr>
                    </thead>
                    <tbody>
                        ${rows.map((row) => {
                            const meta = inferRawCrewMeta(row);
                            return `
                            <tr>
                                <td>${row.func_code || ''}</td>
                                <td>${row.employee_name_raw || ''}</td>
                                <td>${row.employee_id || ''}</td>
                                <td>${meta.asgn || ''}</td>
                                <td>${meta.turnAsgn || row.turn_asgn || ''}</td>
                                <td>${row.job_code || ''}</td>
                                <td>${row.on_duty_time || row.on_duty_ts || ''}</td>
                                <td>${row.off_duty_time || ''}</td>
                                <td>${row.search_pool || ''}</td>
                                <td>${row.crew_pool || row.pool || ''}</td>
                            </tr>
                        `;
                        }).join('')}
                        </tbody>
                    </table>
                ${(t.crew_lines && t.crew_lines.length) ? `
                    <div class="psts17b-crew-lines-title">RAW CREW LINES (from captured 17B)</div>
                    <pre class="psts17b-crew-lines">${escapeHtml(t.crew_lines.join('\n'))}</pre>
                ` : ''}
                <div class="psts17b-footer">
                    ${escapeHtml(t.footer_keys || first.footer_note || first.comments || 'ENT=NXT-REC F1=HELP F3=EXIT')}
                    </div>
                </div>
            `;
    }

    async function loadTrainLayerDetail(terminal, trainSymbol, serviceDate, onDutyTs, pool) {
        const qs = new URLSearchParams({
            terminal: terminal || 'ALL',
            train_symbol: trainSymbol || '',
            service_date: serviceDate || '',
        });
        if (onDutyTs) qs.set('event_ts', onDutyTs);
        if (pool) qs.set('event_pool', pool);
        return fetchJson(`/api/detail/train-layer?${qs.toString()}`);
    }

    function renderExecutionDrilldown(job, terminal, fallbackPool) {
        const executions = Array.isArray(job?.executions) ? job.executions : [];
        if (!executions.length) {
            return `<div class="placeholder" style="margin-top:8px;">No train executions in this assignment group.</div>`;
        }
        return `
            <div class="pool-tree-wrap">
                ${executions.map((ex) => `
                    <details class="pool-tree-terminal exec-train-node" style="margin: 6px 0 0 0;"
                        data-terminal="${escapeHtml(terminal)}"
                        data-train-symbol="${escapeHtml(ex.train_symbol || '')}"
                        data-service-date="${escapeHtml(ex.service_date || '')}"
                        data-on-duty-ts="${escapeHtml(ex.on_duty_ts_first || '')}"
                        data-pool="${escapeHtml(ex.operational_pool_yard || fallbackPool || '')}">
                        <summary>
                            Train ${escapeHtml(ex.train_symbol || '')}
                            • Date ${escapeHtml(ex.service_date || '')}
                            • Yard ${escapeHtml(ex.operational_pool_yard || fallbackPool || '')}
                            • Crew ${fmtInt(ex.crew_count || 0)}
                            • Starts ${fmtInt(ex.starts || 0)}
                            • Recrew ${yesNo(ex.recrew_flag)}
                            • Split ${yesNo(ex.split_flag)}
                        </summary>
                        <div class="exec-train-detail-body">
                            <div class="loading">Expand detected, loading PSTS17B detail...</div>
                        </div>
                    </details>
                `).join('')}
                </div>
            `;
        }
        
    function renderPoolTree(terminals, rangeLabel, comparisons, assignmentBreakdownByTerminal) {
        return `
            <div class="dashboard-section">
                <h3>Terminal to Pool Breakdown</h3>
                <div class="section-range">${rangeLabel}</div>
                <div class="pool-tree-wrap">
                    ${terminals.map((t) => `
                        <details class="pool-tree-terminal" open>
                            <summary>${t.terminal} — Trains ${fmtInt(t.trains)}, Starts ${fmtInt(t.starts)}, Pool Turns ${fmtInt(t.turnSets)}</summary>
                            ${renderTerminalWindowComparisons(t.terminal, comparisons)}
                            <div class="pool-tree-wrap">
                                ${(() => {
                                    const terminalMap = (assignmentBreakdownByTerminal && assignmentBreakdownByTerminal[t.terminal]) || { byCategory: {}, byPool: {} };
                                    // yard/local/EW are NOT pools (operator
                                    // 2026-08-26): they appear ONCE below as
                                    // category rows, never duplicated as
                                    // zero-train "pools".
                                    const categoryOrder = ['EW', 'YD', 'LOCAL', 'OTHER'];
                                    const poolBlocks = (t.poolRows || []).filter((p) => poolCategory(p.pool) === 'POOL').map((p) => {
                                        const poolJobs = terminalMap.byPool?.[String(p.pool || '').toUpperCase()] || [];
                                        return `
                                            <details class="pool-tree-terminal" style="margin: 8px 0 0 16px;">
                                                <summary>${p.pool} — Trains ${fmtInt(p.trains)}${p.coveredByEw ? '*' : ''}, Starts ${fmtInt(p.starts)}, Pool Turns ${fmtInt(p.turnSets)}${(p.turnsByCraft && p.turnsByCraft.EN != null) ? ` (EN ${fmtInt(p.turnsByCraft.EN)} · AE ${fmtInt(p.turnsByCraft.AE || 0)})` : ''}${p.startsEaWeekly != null ? ` | Starts/Ea (weekly): ${fmtRatio(p.startsEaWeekly)}${p.weeklyPartial ? '†' : ''}${(p.startsEaByCraft && p.startsEaByCraft.EN != null) ? ` — EN ${fmtRatio(p.startsEaByCraft.EN)} · AE ${fmtRatio(p.startsEaByCraft.AE)}` : ''}` : (p.crewSlots > 0 ? ` | Starts/Ea (seats): ${fmtRatio(p.starts / p.crewSlots)}` : '')} | Recrew: ${fmtInt(p.recrew || 0)}</summary>
                                                ${(p.weeklyRows && p.weeklyRows.length) ? `
                                                <table class="status-table compact" style="margin:6px 0;">
                                                    <thead><tr><th>Week of</th><th>Assigned</th><th>Starts (EN · AE)</th><th>Starts/Ea (EN · AE)</th></tr></thead>
                                                    <tbody>
                                                    ${p.weeklyRows.map((w) => `
                                                        <tr><td>${w.week_of}</td><td>${fmtInt(w.assigned)}${(w.by_craft && (w.by_craft.EN != null || w.by_craft.AE != null)) ? ` (EN ${fmtInt(w.by_craft.EN || 0)} · AE ${fmtInt(w.by_craft.AE || 0)})` : ''}</td><td>${fmtInt(w.starts)}${(w.starts_by_craft && (w.starts_by_craft.EN != null || w.starts_by_craft.AE != null)) ? ` (${fmtInt(w.starts_by_craft.EN || 0)} · ${fmtInt(w.starts_by_craft.AE || 0)})` : ''}</td><td>${fmtRatio(w.ratio)}${(w.ratio_by_craft && (w.ratio_by_craft.EN != null || w.ratio_by_craft.AE != null)) ? ` (${fmtRatio(w.ratio_by_craft.EN)} · ${fmtRatio(w.ratio_by_craft.AE)})` : ''}</td></tr>`).join('')}
                                                    <tr class="total-row"><td><strong>window</strong></td><td></td><td><strong>${fmtInt(p.weeklyRows.reduce((s, w) => s + w.starts, 0))}</strong></td><td><strong>${fmtRatio(p.startsEaWeekly)}${p.weeklyPartial ? '†' : ''}</strong></td></tr>
                                                    </tbody>
                                                </table>` : ''}
                                                ${p.coveredByEw ? `<div class="doclib-hitcount">* ${fmtInt(p.coveredByEw)} of these trains were covered by the extra board — credit stays with ${p.pool}</div>` : ''}
                                                <table class="status-table compact" style="margin-top:8px;">
                                                    <thead>
                                                        <tr>
                                                            <th>Pool</th>
                                                            <th>Trains</th>
                                                            <th>Starts</th>
                                                            <th>Starts/Train</th>
                                                            <th>Pool Turns</th>
                                                            <th>Crew Slots</th>
                                                            <th>Trains/Turn</th>
                                                            <th>Starts/Ea</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td>${p.pool}</td>
                                                            <td>${fmtInt(p.trains)}</td>
                                                            <td>${fmtInt(p.starts)}</td>
                                                            <td>${fmtRatio(p.trains > 0 ? p.starts / p.trains : null)}</td>
                                                            <td>${fmtInt(p.turnSets)}</td>
                                                            <td>${fmtInt(p.crewSlots)}</td>
                                                            <td>${fmtRatio(p.trainsPerTurn)}</td>
                                                            <td>${fmtRatio(p.startsPerTurn)}</td>
                                                        </tr>
                                                        ${poolJobs.length ? poolJobs.map((job) => `
                                                            <tr class="category-subrow">
                                                                <td>${job.assignment}</td>
                                                                <td>${fmtInt(job.trains)}</td>
                                                                <td>${fmtInt(job.starts)}</td>
                                                                <td>${fmtRatio(job.trains > 0 ? job.starts / job.trains : null)}</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                            </tr>
                                                            <tr class="category-subrow">
                                                                <td colspan="8">
                                                                    <details>
                                                                        <summary>${job.assignment} executions</summary>
                                                                        ${renderExecutionDrilldown(job, t.terminal, p.pool)}
                                                                    </details>
                                                                </td>
                                                            </tr>
                                                        `).join('') : `
                                                            <tr class="category-subrow">
                                                                <td colspan="8">No assignment rows found in this window.</td>
                                                            </tr>
                                                        `}
                                                    </tbody>
                                                </table>
                                            </details>
                                        `;
                                    }).join('');

                                    const categoryBlocks = categoryOrder.map((cat) => {
                                        const row = t.categoryRows && t.categoryRows[cat] ? t.categoryRows[cat] : { starts: 0, trains: 0 };
                                        const jobs = terminalMap.byCategory?.[cat] || [];
                                        if (!row.starts && !row.trains && !jobs.length) {
                                            return '';   // nothing to say — no empty ghost rows
                                        }
                                        const ewPr = cat === 'EW'
                                            ? (t.poolRows || []).find((pr) => poolCategory(pr.pool) === 'EW') || {}
                                            : null;
                                        return `
                                            <details class="pool-tree-terminal" style="margin: 8px 0 0 16px;">
                                                <summary>${cat === 'EW'
                                                    ? `${t.terminal} EW — Extra trains: ${fmtInt((ewPr && ewPr.trains) || 0)}, Covering pool trains: ${fmtInt((ewPr && ewPr.covering) || 0)} (pool keeps that credit), Starts ${fmtInt(row.starts)} | Recrew: ${fmtInt((ewPr && ewPr.recrew) || 0)}`
                                                    : `${t.terminal} ${cat} — Trains ${fmtInt(row.trains)}, Starts ${fmtInt(row.starts)}`}</summary>
                                                <table class="status-table compact" style="margin-top:8px;">
                                                    <thead>
                                                        <tr>
                                                            <th>Pool</th>
                                                            <th>Trains</th>
                                                            <th>Starts</th>
                                                            <th>Starts/Train</th>
                                                            <th>Pool Turns</th>
                                                            <th>Crew Slots</th>
                                                            <th>Trains/Turn</th>
                                                            <th>Starts/Ea</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        <tr>
                                                            <td>${t.terminal} ${cat}</td>
                                                            <td>${fmtInt(row.trains)}</td>
                                                            <td>${fmtInt(row.starts)}</td>
                                                            <td>${fmtRatio(row.trains > 0 ? row.starts / row.trains : null)}</td>
                                                            <td>—</td>
                                                            <td>—</td>
                                                            <td>—</td>
                                                            <td>—</td>
                                                        </tr>
                                                        ${jobs.length ? jobs.map((job) => `
                                                            <tr class="category-subrow">
                                                                <td>${job.assignment}</td>
                                                                <td>${fmtInt(job.trains)}</td>
                                                                <td>${fmtInt(job.starts)}</td>
                                                                <td>${fmtRatio(job.trains > 0 ? job.starts / job.trains : null)}</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                                <td>—</td>
                                                            </tr>
                                                            <tr class="category-subrow">
                                                                <td colspan="8">
                                                                    <details>
                                                                        <summary>${job.assignment} executions</summary>
                                                                        ${renderExecutionDrilldown(job, t.terminal, cat)}
                                                                    </details>
                                                                </td>
                                                            </tr>
                                                        `).join('') : `
                                                            <tr class="category-subrow">
                                                                <td colspan="8">No assignment rows found in this window.</td>
                                                            </tr>
                                                        `}
                                                    </tbody>
                                                </table>
                                            </details>
                                        `;
                                    }).join('');

                                    return `${poolBlocks}${categoryBlocks}`;
                                })()}
                            </div>
                        </details>
                        `).join('')}
                </div>
                <div class="table-note">
                    Recrew and split are train attributes (subset, non-additive). Starts include recrew labor starts.
                    </div>
                </div>
            `;
    }

    function renderReconciliation(terminals, totals, rangeLabel) {
        const terminalTrainSum = terminals.reduce((sum, t) => sum + t.trains, 0);
        const terminalStartSum = terminals.reduce((sum, t) => sum + t.starts, 0);
        const coverageTrainSum = toNumber(totals.coverage.assigned) + toNumber(totals.coverage.ew) + toNumber(totals.coverage.other);
        const trainOk = terminalTrainSum === totals.trains;
        const startOk = terminalStartSum === totals.starts;
        const coverageOk = coverageTrainSum === totals.trains;
        return `
            <div class="dashboard-section">
                <h3>Reconciliation</h3>
                <div class="section-range">${rangeLabel}</div>
                <div class="exec-recon">
                    <div class="${trainOk ? 'recon-pass' : 'recon-fail'}">${trainOk ? '✔' : '✖'} Terminal trains sum = enterprise trains</div>
                    <div class="${startOk ? 'recon-pass' : 'recon-fail'}">${startOk ? '✔' : '✖'} Terminal starts sum = enterprise starts</div>
                    <div class="${coverageOk ? 'recon-pass' : 'recon-fail'}">${coverageOk ? '✔' : '✖'} Assigned + EW + Other = enterprise trains</div>
                </div>
            </div>
        `;
    }

    function renderDetailPane(terminals, totals, terminalHalfRows, comparisons, assignmentBreakdownByTerminal) {
        const active = state.detailView || 'pool';
        let body = '';
        if (active === 'comparison') {
            body = renderComparisonPanel(comparisons);
        } else if (active === 'recon') {
            body = renderReconciliation(terminals, totals, selectedRangeLabel);
        } else {
            body = renderPoolTree(terminals, selectedRangeLabel, comparisons, assignmentBreakdownByTerminal);
        }

        return `
            <div class="dashboard-section exec-detail-pane ${state.detailPaneOpen ? 'open' : 'closed'}">
                <div class="exec-detail-header">
                    <div class="exec-detail-title">Detail Pane</div>
                    <div class="exec-detail-actions">
                        <button class="exec-detail-btn ${active === 'pool' ? 'active' : ''}" data-detail-view="pool">Pool Breakdown</button>
                        <button class="exec-detail-btn ${active === 'comparison' ? 'active' : ''}" data-detail-view="comparison">Window Comparison</button>
                        <button class="exec-detail-btn ${active === 'recon' ? 'active' : ''}" data-detail-view="recon">Reconciliation</button>
                        <button class="exec-detail-toggle" id="exec-detail-toggle">${state.detailPaneOpen ? 'Collapse' : 'Expand'}</button>
                </div>
                </div>
                ${state.detailPaneOpen ? `<div class="exec-detail-body">${body}</div>` : ''}
            </div>
        `;
    }

    function navigateToSection(section) {
        const btn = document.querySelector(`.nav-tab[data-section="${section}"]`);
        if (btn) btn.click();
    }

    function bindMetricLinks(container) {
        container.querySelectorAll('.metric-link').forEach((el) => {
            el.addEventListener('click', () => {
                const target = el.dataset.target || 'analytics-reports';
                const terminal = el.dataset.terminal || 'ALL';
                const pool = el.dataset.pool || '';
                const reportId = el.dataset.reportId || '';
                const chosenPack = getLatestPackForContext(terminal === 'ALL' ? '' : terminal);
                const halfForContext = state.mode === 'month' ? 'ALL' : (chosenPack ? chosenPack.half : '');
                emitNavigationContext(target, {
                    terminal,
                    pool,
                    reportId,
                    month: chosenPack ? chosenPack.month : '',
                    half: halfForContext
                });
                navigateToSection(target);
            });
        });
    }

    function bindTrainDetailExpanders(container) {
        container.querySelectorAll('.exec-train-node').forEach((node) => {
            node.addEventListener('toggle', async () => {
                if (!node.open) return;
                const body = node.querySelector('.exec-train-detail-body');
                if (!body) return;
                if (node.dataset.loaded === 'true') return;
                body.innerHTML = '<div class="loading">Loading PSTS17B detail...</div>';
                try {
                    const detail = await loadTrainLayerDetail(
                        node.dataset.terminal || 'ALL',
                        node.dataset.trainSymbol || '',
                        node.dataset.serviceDate || '',
                        node.dataset.onDutyTs || '',
                        node.dataset.pool || '',
                    );
                    body.innerHTML = renderTrainCrewDetail(detail);
                    node.dataset.loaded = 'true';
                } catch (error) {
                    body.innerHTML = `<div class="placeholder">Failed to load detail: ${escapeHtml(error.message || 'Unknown error')}</div>`;
                }
            });
        });
    }

    function bindControls(container) {
        container.querySelectorAll('[data-term-check]').forEach((cb) => {
            cb.addEventListener('change', () => {
                const list = Array.from(
                    container.querySelectorAll('[data-term-check]'))
                    .filter((x) => x.checked)
                    .map((x) => x.dataset.termCheck);
                state.terminals = list.length ? list : ['OT', 'KC', 'DA'];
                try {
                    localStorage.setItem('exec-show-terms',
                        JSON.stringify(state.terminals));
                } catch (e) {}
                refresh();
            });
        });
        container.querySelectorAll('.exec-mode-btn[data-mode]').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.mode = btn.dataset.mode;
                refresh();
            });
        });
        const applyBtn = container.querySelector('#exec-apply-window');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const monthSelect = container.querySelector('#exec-month-select');
                const startInput = container.querySelector('#exec-start-date');
                const endInput = container.querySelector('#exec-end-date');
                const monthlyHalves = container.querySelector('#exec-monthly-halves');
                if (monthSelect) state.month = monthSelect.value;
                if (startInput) state.customStart = startInput.value;
                if (endInput) state.customEnd = endInput.value;
                if (monthlyHalves) state.showMonthlyHalves = monthlyHalves.checked;
                refresh();
            });
        }

        container.querySelectorAll('.exec-detail-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                state.detailView = btn.dataset.detailView || 'pool';
                state.detailPaneOpen = true;
                saveDetailPaneState();
                refresh();
            });
        });
        container.querySelectorAll('.exec-master-link').forEach((link) => {
            link.addEventListener('click', () => {
                state.detailView = link.dataset.detailView || 'pool';
                state.detailPaneOpen = true;
                saveDetailPaneState();

                const selected = getSelectedPacksForState(allPacks, state);
                const selectedRows = selected.rows || [];
                const windowMeta = getWindowMeta(selectedRows);
                const payload = {
                    target: 'pool-reports',
                    context: {
                    terminal: link.dataset.terminal || 'ALL',
                    month: selectedRows[0]?.month || '',
                    half: selectedRows[0]?.half || '',
                    startDate: windowMeta.startDate || '',
                    endDate: windowMeta.endDate || '',
                    source: windowMeta.sourceLabel || 'metrics_live',
                    fromSection: 'executive_overview',
                    detailView: state.detailView
                    }
                };
                window.__cpkc_nav_context = payload;
                try {
                    localStorage.setItem(NAV_CONTEXT_STORAGE_KEY, JSON.stringify({
                        ...payload,
                        created_at: new Date().toISOString(),
                    }));
                } catch (_) {}
                window.dispatchEvent(new CustomEvent('cpkc:navigate-context', { detail: payload }));
                refresh();
            });
        });
        const toggleBtn = container.querySelector('#exec-detail-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', () => {
                state.detailPaneOpen = !state.detailPaneOpen;
                saveDetailPaneState();
                refresh();
            });
        }
        container.querySelectorAll('[data-compare-mode]').forEach((card) => {
            card.addEventListener('click', () => {
                const mode = card.dataset.compareMode || '';
                if (!mode) return;
                state.mode = mode;
                if (mode !== 'month') state.showMonthlyHalves = false;
                refresh();
            });
        });
    }

    function renderEmpty(message) {
        appContainer.innerHTML = `<div class="status-dashboard"><div class="no-data">${message}</div></div>`;
    }

    function renderDashboard(terminals, totals, terminalHalfRows, comparisons, assignmentBreakdownByTerminal) {
        const months = getAvailableMonths(allPacks);
        const windowMeta = getWindowMeta(selectedPacks);
        saveOverviewWindowState(windowMeta);
        const html = `
            <div class="status-dashboard exec-overview">
                <div class="dashboard-header">
                    <h2>Executive Operations Overview</h2>
                    <div class="header-date">${selectedRangeLabel}</div>
                </div>
                <div class="section-range">
                    Scope: ${windowMeta.scopeLabel} | Date Range: ${windowMeta.rangeLabel} | Source: ${windowMeta.sourceLabel}
                </div>
                ${renderHeaderControls(months)}
                ${renderKpiStrip(totals)}
                ${renderTerminalTable(terminals, totals, terminalHalfRows, selectedRangeLabel)}
                ${renderDetailPane(terminals, totals, terminalHalfRows, comparisons, assignmentBreakdownByTerminal)}
            </div>
        `;
        appContainer.innerHTML = html;
        bindControls(appContainer);
        bindMetricLinks(appContainer);
        bindTrainDetailExpanders(appContainer);
        const place = uiPlace;
        if (place) {
            appContainer.querySelectorAll('details > summary')
                .forEach((s) => {
                    if (place.open.indexOf(s.textContent.trim()) >= 0) {
                        s.parentElement.open = true;
                    }
                });
        }
        const restorePlace = () => {
            if (!place) return;
            try {
                const scroller = getScroller();
                const newAnchor =
                    appContainer.querySelector('.exec-controls');
                if (place.anchorTop !== null && newAnchor) {
                    const delta = newAnchor.getBoundingClientRect().top -
                        place.anchorTop;
                    scroller.scrollTop = scroller.scrollTop + delta;
                } else {
                    scroller.scrollTop = place.scrollTop;
                }
            } catch (e) { /* never let restore break the render */ }
        };
        restorePlace();
        // once more after layout fully settles (fonts/tables can shift)
        requestAnimationFrame(restorePlace);

        if (window.PrintExport) {
            window.PrintExport.createPrintExportButtons({
                containerId: null,
                printElement: appContainer.querySelector('.exec-overview') || 'window',
                exportData: Array.from(appContainer.querySelectorAll('.status-table')),
                exportFilename: `executive_overview_${new Date().toISOString().split('T')[0]}`,
                title: 'CPKC Executive Operations Overview',
                dateRange: selectedRangeLabel,
                terminal: 'All Terminals',
                filters: state.mode
            });
            const buttons = appContainer.querySelector('.print-export-buttons');
            if (buttons) {
                const header = appContainer.querySelector('.dashboard-header');
                if (header) header.appendChild(buttons);
            }
        }
    }

    async function refresh() {
        if (!appContainer) return;
        // KEEP MY PLACE: capture BEFORE the loading swap so the render
        // pass (renderDashboard, same values passed along) can restore.
        const scroller = getScroller();
        uiPlace = {
            anchorTop: (() => {
                const a = appContainer.querySelector('.exec-controls');
                return a ? a.getBoundingClientRect().top : null;
            })(),
            scrollTop: scroller.scrollTop,
            open: Array.from(appContainer.querySelectorAll(
                'details[open] > summary'))
                .map((s) => s.textContent.trim()),
        };
        appContainer.innerHTML = '<div class="loading">Loading executive overview...</div>';
        allPacks = await fetchAllPacks();
        const selected = getSelectedPacksForState(allPacks);
        selectedPacks = selected.rows;
        selectedRangeLabel = selected.label;
        if (!selectedPacks.length) {
            renderEmpty('No report packs match the selected window.');
            return;
        }
        const selectedWindowMeta = getWindowMeta(selectedPacks);
        const mainWins = Array.from(new Set(
            selectedPacks.map((p) => `${p.month}|${p.half}`)));
        const [data, comparisons, assignmentBreakdownByTerminal, mainTimes] = await Promise.all([
            buildOverviewData(selectedPacks),
            (async () => {
                const windows = [
                    { id: 'current_half', title: 'Current Half' },
                    { id: 'last_half', title: 'Last Half' },
                    { id: 'last_month', title: 'Last Month' },
                    { id: 'ytd', title: 'Year-to-Date' },
                    // hidden baselines for honest deltas (operator
                    // 2026-08-26): last month compares to the month
                    // BEFORE it; YTD compares to last year's same span
                    { id: 'current_month', title: 'Current Month', hidden: true },
                    { id: 'prev_month', title: 'Prior Month', hidden: true },
                    { id: 'prior_ytd', title: 'Prior-Year YTD', hidden: true }
                ];
                const compareData = await Promise.all(windows.map(async (w) => {
                    const selectedForWindow = getRowsForWindowMode(allPacks, w.id);
                    if (!selectedForWindow.rows.length) {
                        return {
                            ...w,
                            label: selectedForWindow.label,
                            noData: true,
                            months: [],
                            totals: { trains: 0, starts: 0, turnSets: 0, recrew: 0, split: 0 },
                            terminals: [],
                        };
                    }
                    const overview = await buildOverviewData(selectedForWindow.rows);
                    return {
                        ...w,
                        label: selectedForWindow.label,
                        halfRows: overview.terminalHalfRows || [],
                        months: Array.from(new Set(
                            selectedForWindow.rows.map((p) => p.month))),
                        halves: Array.from(new Set(
                            selectedForWindow.rows.map(
                                (p) => `${p.month}|${p.half}`))),
                        totals: overview.totals,
                        terminals: overview.terminals || [],
                    };
                }));
                // cycle/home/rested per window (member_chains via cached
                // endpoint); terminal rollup = road pools, n-weighted
                const ROAD_TERM = { SW: 'OT', OB: 'OT', KA: 'KC', DA: 'DA' };
                await Promise.all(compareData.map(async (c) => {
                    if (c.hidden || !c.halves || !c.halves.length) return;
                    try {
                        const r = await fetchJson('/api/pool-times?wins=' +
                            encodeURIComponent(c.halves.join(',')));
                        c.times = (r && r.pools) || {};
                        c.termWorkers = (r && r.terminal_workers) || {};
                        c.turnsNow = (r && r.turns_now) || {};
                    } catch (e) { /* stats stay absent, cards show em-dash */ }
                }));
                return compareData;
            })(),
            buildTerminalAssignmentBreakdown(selectedWindowMeta.startDate, selectedWindowMeta.endDate),
            fetchJson('/api/pool-times?wins=' + encodeURIComponent(mainWins.join(',')))
                .catch(() => null),
        ]);
        // WEEKLY Starts/Ea (operator ruling 2026-08-29: assignments change
        // weekly -- SW's 9-turn weeks and 10-turn weeks each count with
        // their own people; window value = SUM of weekly starts-per-
        // assigned). Attach per pool row and roll terminals up by week.
        const mtPools = (mainTimes && mainTimes.pools) || {};
        const totByWeek = {};
        let totPartial = false, totAny = false;
        (data.terminals || []).forEach((t) => {
            const byWeek = {};
            let partial = false, any = false;
            (t.poolRows || []).forEach((r) => {
                const cell = mtPools[`${r.pool}@${t.terminal}`];
                if (cell && cell.weekly && cell.weekly.length) {
                    r.startsEaWeekly = cell.starts_ea_weekly;
                    r.startsEaByCraft = cell.starts_ea_by_craft;
                    r.weeklyRows = cell.weekly;
                    r.weeklyPartial = cell.weekly_partial;
                    if (poolCategory(r.pool) === 'POOL') {
                        any = true;
                        partial = partial || cell.weekly_partial;
                        cell.weekly.forEach((w) => {
                            const b = byWeek[w.week_of] = byWeek[w.week_of] || { a: 0, s: 0 };
                            b.a += w.assigned; b.s += w.starts;
                            const tb = totByWeek[w.week_of] = totByWeek[w.week_of] || { a: 0, s: 0 };
                            tb.a += w.assigned; tb.s += w.starts;
                        });
                    }
                }
            });
            if (any) {
                t.startsEaWeekly = Math.round(Object.values(byWeek)
                    .reduce((s, w) => s + (w.a ? w.s / w.a : 0), 0) * 100) / 100;
                t.weeklyPartial = partial;
                totAny = true; totPartial = totPartial || partial;
            }
        });
        if (totAny) {
            data.totals.startsEaWeekly = Math.round(Object.values(totByWeek)
                .reduce((s, w) => s + (w.a ? w.s / w.a : 0), 0) * 100) / 100;
            data.totals.weeklyPartial = totPartial;
        }
        window.__cpkc_comparisons = comparisons;
        renderDashboard(data.terminals, data.totals, data.terminalHalfRows || [], comparisons, assignmentBreakdownByTerminal);
    }

    async function init(containerId) {
        appContainer = document.getElementById(containerId);
        if (!appContainer) {
            console.error('Status Dashboard container not found:', containerId);
            return;
        }
        allPacks = await fetchAllPacks();
        const months = getAvailableMonths(allPacks);
        state.month = months[0] || '';
        const latestKey = getMostRecentHalfKey(allPacks);
        const latestPack = allPacks.find((p) => packKey(p) === latestKey);
        const latestRange = latestPack ? derivePackDateRange(latestPack) : { start: '', end: '' };
        state.customStart = latestRange.start;
        state.customEnd = latestRange.end;
        loadDetailPaneState();
        await refresh();
    }

    return { init };
})();
