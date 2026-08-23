/**
 * AUTHORITY BOUNDARY
 *
 * This module consumes rr-docs reference outputs.
 * It must never:
 * - Modify evidence
 * - Interpret rules
 * - Resolve conflicts
 * - Infer authority
 *
 * When in doubt:
 * DO LESS. PRESERVE MORE. ASK.
 */
const REQUIRED_METADATA = 'metadata.json';
const DIST_DIR = 'dist';
const CANONICAL_HISTORY_DIR = 'canonical_history';
const ALERTS_DIR = 'alerts';
/** Load metadata.json — fail loudly if missing or malformed. */
export async function loadMetadata(paths) {
    const url = paths.remoteBaseUrl
        ? `${paths.remoteBaseUrl}/${REQUIRED_METADATA}`
        : `${paths.root}/${REQUIRED_METADATA}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Reference: metadata not found or not readable: ${url}`);
    const raw = await res.json();
    if (!raw || typeof raw.bundle_version !== 'string' || !Array.isArray(raw.evidence_ids)) {
        throw new Error('Reference: metadata.json malformed — required: bundle_version (string), evidence_ids (array)');
    }
    return raw;
}
/** Load snapshot for one evidence (dist/<evidence_id>.json or dist/<id>.json). Contract: meta + sections[]. */
export async function loadSnapshot(paths, evidenceId, distFileName) {
    const file = distFileName ?? `${evidenceId}.json`;
    const url = paths.remoteBaseUrl
        ? `${paths.remoteBaseUrl}/${DIST_DIR}/${file}`
        : `${paths.root}/${DIST_DIR}/${file}`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Reference: snapshot not found: ${url}`);
    const raw = await res.json();
    if (!raw || !raw.meta || !Array.isArray(raw.sections)) {
        throw new Error(`Reference: snapshot malformed — required: meta, sections[]: ${url}`);
    }
    return raw;
}
/** Load canonical history index for one evidence. */
export async function loadCanonicalIndex(paths, evidenceId) {
    const url = paths.remoteBaseUrl
        ? `${paths.remoteBaseUrl}/${CANONICAL_HISTORY_DIR}/${evidenceId}/index.json`
        : `${paths.root}/${CANONICAL_HISTORY_DIR}/${evidenceId}/index.json`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error(`Reference: canonical index not found: ${url}`);
    const raw = await res.json();
    if (!raw)
        throw new Error(`Reference: canonical index malformed: ${url}`);
    return raw;
}
/** Load diff file (mechanical diff only). */
export async function loadDiff(paths, evidenceId, diffFile) {
    const url = paths.remoteBaseUrl
        ? `${paths.remoteBaseUrl}/${CANONICAL_HISTORY_DIR}/${evidenceId}/${diffFile}`
        : `${paths.root}/${CANONICAL_HISTORY_DIR}/${evidenceId}/${diffFile}`;
    const res = await fetch(url);
    if (!res.ok)
        return null;
    const raw = await res.json();
    return raw;
}
/** Load alerts. Contract: alerts/ with *.json or single alerts.json. */
export async function loadAlerts(paths) {
    const url = paths.remoteBaseUrl
        ? `${paths.remoteBaseUrl}/${ALERTS_DIR}/index.json`
        : `${paths.root}/${ALERTS_DIR}/index.json`;
    const res = await fetch(url);
    if (!res.ok) {
        const fallback = paths.remoteBaseUrl
            ? `${paths.remoteBaseUrl}/alerts.json`
            : `${paths.root}/alerts.json`;
        const r2 = await fetch(fallback);
        if (!r2.ok)
            return [];
        const data = await r2.json();
        return Array.isArray(data.alerts) ? data.alerts : [];
    }
    const data = await res.json();
    if (Array.isArray(data))
        return data;
    return Array.isArray(data.alerts) ? data.alerts : [];
}
/** Load full bundle into memory (read-only). Fails loudly if required files missing. */
export async function loadBundle(paths) {
    const metadata = await loadMetadata(paths);
    const snapshots = new Map();
    const indexes = new Map();
    for (const eid of metadata.evidence_ids) {
        try {
            snapshots.set(eid, await loadSnapshot(paths, eid));
        }
        catch (e) {
            throw new Error(`Reference: required snapshot missing for evidence ${eid}: ${e.message}`);
        }
        try {
            indexes.set(eid, await loadCanonicalIndex(paths, eid));
        }
        catch {
            indexes.set(eid, { revisions: [] });
        }
    }
    return {
        metadata,
        snapshots,
        indexes,
        lastUpdated: metadata.updated_at ?? metadata.bundle_version ?? '',
    };
}
//# sourceMappingURL=loader.js.map