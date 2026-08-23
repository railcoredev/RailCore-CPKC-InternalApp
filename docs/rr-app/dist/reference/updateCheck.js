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
/** Last known bundle version/timestamp (in-memory only; no write to rr-docs). */
let lastKnownBundleVersion = null;
let lastKnownUpdatedAt = null;
/**
 * Set last-known bundle info (e.g. after load or apply). Consumer only; no ingestion.
 */
export function setLastKnownBundle(version, updatedAt) {
    lastKnownBundleVersion = version;
    lastKnownUpdatedAt = updatedAt;
}
/**
 * Get last-known bundle version (for comparison).
 */
export function getLastKnownBundle() {
    return { version: lastKnownBundleVersion, updatedAt: lastKnownUpdatedAt };
}
/**
 * Check for updates by fetching remote metadata and comparing.
 * Returns pure status only. No ingestion, no revision creation, no background updates.
 */
export async function checkForUpdates(localPaths, remoteMetadataUrl) {
    const dataUpdate = await checkDataUpdate(localPaths, remoteMetadataUrl);
    const appUpdate = checkAppUpdateStub();
    return { data_update_available: dataUpdate, app_update_available: appUpdate };
}
async function checkDataUpdate(localPaths, remoteMetadataUrl) {
    const url = remoteMetadataUrl ?? (localPaths.remoteBaseUrl ? `${localPaths.remoteBaseUrl}/metadata.json` : null);
    if (!url)
        return false;
    try {
        const res = await fetch(url);
        if (!res.ok)
            return false;
        const meta = await res.json();
        const remoteVersion = meta?.bundle_version ?? meta?.updated_at ?? '';
        const remoteUpdated = meta?.updated_at ?? remoteVersion;
        if (lastKnownBundleVersion !== null && remoteVersion !== lastKnownBundleVersion)
            return true;
        if (lastKnownUpdatedAt !== null && remoteUpdated !== lastKnownUpdatedAt)
            return true;
        return false;
    }
    catch {
        return false;
    }
}
/** Stub: app update (store/PWA/native). No logic here. */
function checkAppUpdateStub() {
    return false;
}
//# sourceMappingURL=updateCheck.js.map