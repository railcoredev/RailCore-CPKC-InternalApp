// data_loader.js
(function (global) {
  "use strict";

  const DATA_LOADER_VERSION = "1.0.0";

  const REMOTE_CONFIG_URL =
    "https://raw.githubusercontent.com/railcoredev/RailCore-DataHyperstore-Test/main/config/data_source.json";

  const LOCAL_CONFIG_FALLBACK = null;

  const CROSSINGS_STATE_PATH_TEMPLATE =
    "data_processed/crossings_by_state/{STATE}.csv";

  const LOCAL_STATE_FALLBACK_TEMPLATE = "local_data/crossings_{STATE}.csv";

  const COLUMN_MAP = {
    MP: ["MP", "MILEPOST", "MILE_POST", "MILE_POST_", "MP_MILES"],
    COMMON_NAME: ["COMMON_NAME", "XINGNAME", "CROSSING_NAME", "STATION", "LOCATION"],
    ROAD_NAME: ["STREET", "STREET_NAME", "ROAD", "ROAD_NAME", "HIGHWAY", "HWY"],
    PROTECTION: [
      "PROTECTION",
      "WARNING_DEVICES",
      "WARNING_DEVICE",
      "DEVICE_TYPE",
      "PROTECTION_TYPE"
    ],
    DOT: [
      "DOT",
      "DOT_NUMBER",
      "DOT_NUM",
      "CROSSING_ID",
      "CROSSING_NUMBER",
      "USDOTNUM"
    ],
    SUBDIV: ["SUBDIVISION", "SUBDIV", "SUBDIV_NAME", "LINE_SEGMENT"],
    STATE: ["STATE", "STATE_ABBR", "STATE_CODE"],
    RAILROAD: ["RR", "RAILROAD", "RR_SHORT", "RR_COMPANY"]
  };

  function log(...args) {
    console.log("[RailCoreDataLoader]", ...args);
  }

  function warn(...args) {
    console.warn("[RailCoreDataLoader]", ...args);
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return resp;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async function loadRemoteConfig() {
    try {
      const resp = await fetchWithTimeout(REMOTE_CONFIG_URL);
      if (!resp.ok) throw new Error("Remote config HTTP " + resp.status);
      const config = await resp.json();
      if (!config || typeof config.active_data_repo !== "string") {
        throw new Error("Config missing active_data_repo");
      }
      if (config.schema_version && config.schema_version !== 1) {
        warn("Config schema_version mismatch:", config.schema_version, "expected 1");
      }
      log("Loaded remote config:", config.active_data_repo);
      return config;
    } catch (err) {
      warn("Failed to load remote config:", err);
      return LOCAL_CONFIG_FALLBACK;
    }
  }

  async function getActiveDataRepoBase() {
    const config = await loadRemoteConfig();
    if (!config || !config.active_data_repo) {
      warn("No active_data_repo in config – remote data disabled.");
      return null;
    }
    let base = config.active_data_repo;
    if (!base.endsWith("/")) base += "/";
    return base;
  }

  function parseCsv(csvText) {
    const lines = csvText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];
    const headerLine = lines[0];
    const headers = parseCsvLine(headerLine);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const rowLine = lines[i];
      const fields = parseCsvLine(rowLine);
      if (fields.length === 1 && fields[0] === "") continue;
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        const value = fields[j] !== undefined ? fields[j] : "";
        row[key] = value;
      }
      rows.push(row);
    }
    return rows;
  }

  function parseCsvLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          result.push(current);
          current = "";
        } else {
          current += ch;
        }
      }
    }
    result.push(current);
    return result;
  }

  function findFirstMatchingKey(row, keyCandidates) {
    for (const candidate of keyCandidates) {
      if (Object.prototype.hasOwnProperty.call(row, candidate)) {
        return candidate;
      }
    }
    return null;
  }

  function getField(row, logicalKey) {
    const candidates = COLUMN_MAP[logicalKey];
    if (!candidates) return "";
    const key = findFirstMatchingKey(row, candidates);
    return key ? row[key] : "";
  }

  function parseMilepost(value) {
    if (value == null || value === "") return null;
    const num = parseFloat(String(value).replace(/[^\d.-]/g, ""));
    return isNaN(num) ? null : num;
  }

  async function loadStateCrossingsFromRepo(baseUrl, stateCode) {
    const path = CROSSINGS_STATE_PATH_TEMPLATE.replace("{STATE}", stateCode);
    const url = baseUrl + path;
    log("Loading remote crossings for state", stateCode, "from", url);
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) {
      throw new Error(
        "Remote crossings load failed for " +
          stateCode +
          " (HTTP " +
          resp.status +
          ")"
      );
    }
    const text = await resp.text();
    return parseCsv(text);
  }

  async function loadStateCrossingsFromLocal(stateCode) {
    const path = LOCAL_STATE_FALLBACK_TEMPLATE.replace("{STATE}", stateCode);
    log("Loading LOCAL fallback crossings for state", stateCode, "from", path);
    const resp = await fetch(path);
    if (!resp.ok) {
      throw new Error(
        "Local crossings fallback load failed for " +
          stateCode +
          " (HTTP " +
          resp.status +
          ")"
      );
    }
    const text = await resp.text();
    return parseCsv(text);
  }

  async function loadCrossingsForStates(stateCodes) {
    const base = await getActiveDataRepoBase();
    const allRows = [];
    for (const stateCode of stateCodes) {
      let rows = [];
      try {
        if (base) {
          rows = await loadStateCrossingsFromRepo(base, stateCode);
        } else {
          throw new Error("No active repo base – forcing local fallback");
        }
      } catch (err) {
        warn("Remote load failed for state", stateCode, ":", err);
        try {
          rows = await loadStateCrossingsFromLocal(stateCode);
        } catch (localErr) {
          warn("Local fallback also failed for state", stateCode, ":", localErr);
          continue;
        }
      }
      rows.forEach((r) => (r.__STATE = stateCode));
      allRows.push(...rows);
    }
    return allRows;
  }

  function normalizeCrossingRows(rows, targetSubdivision) {
    const result = [];
    for (const row of rows) {
      const mpRaw = getField(row, "MP");
      const mp = parseMilepost(mpRaw);
      if (mp == null) continue;
      const subdiv = String(getField(row, "SUBDIV") || "").trim();
      if (targetSubdivision && subdiv && subdiv !== targetSubdivision) {
        continue;
      }
      const commonName = String(getField(row, "COMMON_NAME") || "").trim();
      const roadName = String(getField(row, "ROAD_NAME") || "").trim();
      const protection = String(getField(row, "PROTECTION") || "").trim().toUpperCase();
      const dotNum = String(getField(row, "DOT") || "").trim();
      const state = row.__STATE || String(getField(row, "STATE") || "").trim();
      const railroad = String(getField(row, "RAILROAD") || "").trim();
      result.push({
        mp,
        mpText: mp.toFixed(1).replace(/\.0$/, ""),
        commonName: commonName || "(NO NAME)",
        roadName: roadName || "(NO ROAD)",
        protection: protection || "UNKNOWN",
        dotNumber: dotNum || "UNKNOWN",
        state,
        railroad,
        subdiv
      });
    }
    result.sort((a, b) => a.mp - b.mp);
    return result;
  }

  function buildGaps(crossings, spacingFt, bufferFt, mode) {
    const items = [];
    if (!Array.isArray(crossings) || crossings.length < 2) return items;
    const spacing = Number(spacingFt) || 0;
    const buffer = Number(bufferFt) || 0;
    for (let i = 0; i < crossings.length - 1; i++) {
      const curr = crossings[i];
      const next = crossings[i + 1];
      const rawFt = (next.mp - curr.mp) * 5280;
      const usableFt = Math.max(0, rawFt - 2 * buffer);
      const include =
        mode === "all" ? true : usableFt >= spacing;
      if (!include) continue;
      items.push({
        from: curr,
        to: next,
        rawFt,
        usableFt
      });
    }
    return items;
  }

  function formatGapItem(gap) {
    const c = gap.from;
    const usable = Math.round(gap.usableFt);
    const line1 =
      `MP ${c.mpText} — ` +
      `${c.commonName.toUpperCase()} — ` +
      `${c.roadName} — ` +
      `${c.protection} — ` +
      `DOT# ${c.dotNumber}`;
    const line2 = `↓ ${usable.toLocaleString("en-US")} ft`;
    return { line1, line2 };
  }

  function buildFormattedResults(gaps) {
    return gaps.map((g) => {
      const formatted = formatGapItem(g);
      return {
        line1: formatted.line1,
        line2: formatted.line2,
        from: g.from,
        to: g.to,
        usableFt: g.usableFt,
        rawFt: g.rawFt
      };
    });
  }

  async function loadCrossingGaps(options) {
    const {
      states,
      subdivision,
      spacingFt,
      bufferFt,
      mode
    } = options || {};
    if (!Array.isArray(states) || states.length === 0) {
      throw new Error("loadCrossingGaps requires at least one state");
    }
    const viewMode = mode === "all" ? "all" : "threshold";
    log("Data loader v" + DATA_LOADER_VERSION + " – loading with options:", {
      states,
      subdivision,
      spacingFt,
      bufferFt,
      mode: viewMode
    });
    const rawRows = await loadCrossingsForStates(states);
    const crossings = normalizeCrossingRows(rawRows, subdivision);
    const gaps = buildGaps(crossings, spacingFt, bufferFt, viewMode);
    const formatted = buildFormattedResults(gaps);
    return {
      formatted,
      gaps,
      crossings
    };
  }

  global.RailCoreData = {
    version: DATA_LOADER_VERSION,
    loadCrossingGaps
  };
})(window);
