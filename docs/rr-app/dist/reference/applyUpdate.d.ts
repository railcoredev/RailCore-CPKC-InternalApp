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
/** In-memory reference state (replaced atomically after apply). */
export type ReferenceState = Awaited<ReturnType<typeof loadBundle>>;
/**
 * Get current reference state (read-only). Null if not yet loaded.
 */
export declare function getReferenceState(): ReferenceState | null;
/**
 * Apply data update: load full mobile bundle and refresh in-memory state.
 * Never partially update, never mutate existing files, never merge bundles.
 * Atomic filesystem replace (staging → cache) is the responsibility of the native layer when applicable;
 * this function loads from the given bundle root (remote URL or local path after replace) and sets state.
 */
export declare function applyDataUpdate(bundleRootUrl: string, localCacheRoot: string): Promise<ReferenceState>;
/**
 * Replace in-memory state with a pre-loaded bundle (e.g. after atomic filesystem replace by native layer).
 * Never merge; full replace only.
 */
export declare function setReferenceState(state: ReferenceState | null): void;
//# sourceMappingURL=applyUpdate.d.ts.map