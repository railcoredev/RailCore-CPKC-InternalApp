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
import { loadBundle } from './loader.js';
import { setLastKnownBundle } from './updateCheck.js';
let currentState = null;
/**
 * Get current reference state (read-only). Null if not yet loaded.
 */
export function getReferenceState() {
    return currentState;
}
/**
 * Apply data update: load full mobile bundle and refresh in-memory state.
 * Never partially update, never mutate existing files, never merge bundles.
 * Atomic filesystem replace (staging → cache) is the responsibility of the native layer when applicable;
 * this function loads from the given bundle root (remote URL or local path after replace) and sets state.
 */
export async function applyDataUpdate(bundleRootUrl, localCacheRoot) {
    const paths = { root: localCacheRoot, remoteBaseUrl: bundleRootUrl };
    const state = await loadBundle(paths);
    currentState = state;
    setLastKnownBundle(state.metadata.bundle_version, state.metadata.updated_at);
    return state;
}
/**
 * Replace in-memory state with a pre-loaded bundle (e.g. after atomic filesystem replace by native layer).
 * Never merge; full replace only.
 */
export function setReferenceState(state) {
    currentState = state;
    if (state) {
        setLastKnownBundle(state.metadata.bundle_version, state.metadata.updated_at);
    }
    else {
        setLastKnownBundle(null, null);
    }
}
//# sourceMappingURL=applyUpdate.js.map