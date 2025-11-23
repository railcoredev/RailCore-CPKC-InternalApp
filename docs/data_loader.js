/* ============================================================
   RAILCORE WORKER APP v3.7 — DATA LOADER
   - Reads remote config (data_source.json) to find active data repo
   - Loads crossings, sidings, yard track lengths
   - Builds state, subdivision, and yard lists
   - Falls back to local mock data if anything fails
   ============================================================ */

/*
  IMPORTANT: You will update the actual data paths later.
  For now, this is built to be SAFE and OFFLINE-FRIENDLY:

  - If remote fetch fails or returns no data:
      -> We fall back to hard-coded mock datasets (KC Sub etc.)
  - App will NEVER crash just because data isn’t there yet.
*/

const DEFAULT_DATA_BASE =
  "https://raw.githubusercontent.com/railcoredev/RailCore-DataHyperstore-Test/main";

/**
 * Try to discover the active data repo from a central config file.
 * This is the REDIRECT system you asked for earlier.
 *
 * Expected JSON at:
 *   <DATA_REPO>/config/data_source.json
 *
 * Example:
 * {
 *   "active_data_repo": "https://raw.githubusercontent.com/railcoredev/RailCore-DataHyperstore-Test/main"
 * }
 */
async function getActiveDataRepo() {
  const configUrl = `${DEFAULT_DATA_BASE}/config/data_source.json`;

  try {
    const resp = await fetch(configUrl);
    if (!resp.ok) throw new Error("Config not found");

    const cfg = await resp.json();
    if (cfg && cfg.active_data_repo) {
      console.log("Using active_data_repo from config:", cfg.active_data_repo);
      return cfg.active_data_repo;
    }
  } catch (err) {
    console.warn("Config fetch failed, falling back to default base:", err);
  }

  return DEFAULT_DATA_BASE;
}

/**
 * MASTER LOADER
 * Called from app.js → loadAllData()
 */
async function loadRailCoreDataMaster() {
  let base = DEFAULT_DATA_BASE;

  try {
    base = await getActiveDataRepo();
  } catch (err) {
    console.warn("Failed to resolve active data repo, using default:", err);
  }

  console.log("Data base URL:", base);

  // ------------------------------------------------------------
  // TODO: Update these paths once your FRA/CPKC files are final
  // ------------------------------------------------------------

  // For now: pretend crossings are split by state CSVs in this path:
  //   <base>/fra/crossings/states/IA.csv, IL.csv, etc.
  const STATES = ["IA", "IL", "MO", "KS", "NE", "MN", "WI"];

  // Placeholder single-file locations for sidings + yard track lengths
  const SIDINGS_URL = `${base}/cpkc/sidings_demo.csv`;
  const TRACK_LENGTHS_URL = `${base}/cpkc/yard_track_lengths_demo.csv`;

  let crossings = [];
  let sidings = [];
  let tracklengths = [];

  // 1) Try to load CROSSINGS by state
  for (const st of STATES) {
    const url = `${base}/fra/crossings/states/${st}.csv`; // EDIT THIS PATH LATER
    try {
      const text = await safeFetchText(url);
      if (!text) continue;

      const parsed = parseCSV(text); // parseCSV is defined in app.js
      crossings = crossings.concat(parsed);
      console.log(`Loaded crossings for state ${st}: ${parsed.length} rows`);
    } catch (err) {
      console.warn(`Failed to load crossings for ${st}:`, err);
    }
  }

  // 2) Try to load SIDINGS
  try {
    const text = await safeFetchText(SIDINGS_URL);
    if (text) {
      sidings = parseCSV(text);
      console.log("Loaded sidings:", sidings.length);
    }
  } catch (err) {
    console.warn("Failed to load sidings CSV:", err);
  }

  // 3) Try to load YARD TRACK LENGTHS
  try {
    const text = await safeFetchText(TRACK_LENGTHS_URL);
    if (text) {
      tracklengths = parseCSV(text);
      console.log("Loaded yard track lengths:", tracklengths.length);
    }
  } catch (err) {
    console.warn("Failed to load yard track lengths CSV:", err);
  }

  // ------------------------------------------------------------
  // FALLBACK TO MOCK DATA IF NEEDED
  // ------------------------------------------------------------
  if (crossings.length === 0 && sidings.length === 0 && tracklengths.length === 0) {
    console.warn("No remote data loaded — using built-in mock data.");
    const mock = getMockRailCoreData();
    return mock;
  }

  // Build STATES / SUBDIVISIONS / YARDS lists from whatever data we have
  const statesSet = new Set();
  const subSet = new Set();
  const yardSet = new Set();

  crossings.forEach(r => {
    if (r.STATE) statesSet.add(r.STATE);
    else if (r.state) statesSet.add(r.state);
    if (r.SUBDIVISION) subSet.add(r.SUBDIVISION);
    else if (r.Subdivision) subSet.add(r.Subdivision);
  });

  sidings.forEach(r => {
    if (r.STATE) statesSet.add(r.STATE);
    if (r.SUBDIVISION) subSet.add(r.SUBDIVISION);
  });

  tracklengths.forEach(r => {
    if (r.STATE) statesSet.add(r.STATE);
    if (r.YARD) yardSet.add(r.YARD);
    else if (r.Yard) yardSet.add(r.Yard);
  });

  const result = {
    crossings,
    sidings,
    tracklengths,
    states: Array.from(statesSet),
    subdivisions: Array.from(subSet),
    yards: Array.from(yardSet)
  };

  console.log("Data summary:", {
    crossings: result.crossings.length,
    sidings: result.sidings.length,
    tracklengths: result.tracklengths.length,
    states: result.states,
    subdivisions: result.subdivisions,
    yards: result.yards
  });

  // If something is missing, we can still patch with mock supplements
  if (result.crossings.length === 0 || result.subdivisions.length === 0) {
    console.warn("Crossings/subdivisions missing — supplementing with mock crossings.");
    const mock = getMockRailCoreData();
    result.crossings = mock.crossings;
    result.subdivisions = mock.subdivisions;
    result.states = mock.states;
  }

  if (result.tracklengths.length === 0 || result.yards.length === 0) {
    console.warn("Track lengths/yards missing — supplementing with mock yard data.");
    const mock = getMockRailCoreData();
    result.tracklengths = mock.tracklengths;
    result.yards = mock.yards;
  }

  return result;
}

/**
 * Safe fetch text helper — returns "" on any failure instead of throwing.
 */
async function safeFetchText(url) {
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      console.warn("Non-OK response for", url, resp.status);
      return "";
    }
    return await resp.text();
  } catch (err) {
    console.warn("Fetch failed for", url, err);
    return "";
  }
}

/**
 * Built-in mock dataset so the app always has something to show.
 * This is based on the examples you gave:
 * - KC Sub crossings: A→B→C pattern
 * - One siding
 * - One yard with a few tracks
 */
function getMockRailCoreData() {
  const crossings = [
    {
      STATE: "IA",
      SUBDIVISION: "Kansas City Sub – CPKC",
      MP: "8.5",
      COMMON_NAME: "KANSAS AVE",
      ROAD: "Kansas Ave",
      PROTECTION: "GATES",
      DOT: "079123A"
    },
    {
      STATE: "IA",
      SUBDIVISION: "Kansas City Sub – CPKC",
      MP: "10.1",
      COMMON_NAME: "TURLEY RD",
      ROAD: "Turley Rd",
      PROTECTION: "FLASHERS",
      DOT: "079456B"
    },
    {
      STATE: "IA",
      SUBDIVISION: "Kansas City Sub – CPKC",
      MP: "12.7",
      COMMON_NAME: "155TH ST",
      ROAD: "155th St",
      PROTECTION: "GATES",
      DOT: "079789C"
    },
    {
      STATE: "IA",
      SUBDIVISION: "Kansas City Sub – CPKC",
      MP: "15.3",
      COMMON_NAME: "OAK RIDGE RD",
      ROAD: "Oak Ridge Rd",
      PROTECTION: "CROSSBUCKS",
      DOT: "079999D"
    }
  ];

  const sidings = [
    {
      STATE: "IA",
      SUBDIVISION: "Kansas City Sub – CPKC",
      NAME: "HOLLIDAY SIDING",
      MP_START: "10.0",
      MP_END: "12.7"
    }
  ];

  const tracklengths = [
    {
      STATE: "IA",
      YARD: "KANSAS CITY YARD",
      TRACK: "101",
      LENGTH: "4200"
    },
    {
      STATE: "IA",
      YARD: "KANSAS CITY YARD",
      TRACK: "102",
      LENGTH: "6050"
    },
    {
      STATE: "IA",
      YARD: "KANSAS CITY YARD",
      TRACK: "103",
      LENGTH: "8900"
    }
  ];

  const states = ["IA"];
  const subdivisions = ["Kansas City Sub – CPKC"];
  const yards = ["KANSAS CITY YARD"];

  return {
    crossings,
    sidings,
    tracklengths,
    states,
    subdivisions,
    yards
  };
}
