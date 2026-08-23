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
export * from './types.js';
export { loadMetadata, loadSnapshot, loadCanonicalIndex, loadDiff, loadAlerts, loadBundle, } from './loader.js';
export { checkForUpdates, setLastKnownBundle, getLastKnownBundle, } from './updateCheck.js';
export { applyDataUpdate, setReferenceState, getReferenceState, } from './applyUpdate.js';
export { queryReference } from './query.js';
//# sourceMappingURL=index.js.map