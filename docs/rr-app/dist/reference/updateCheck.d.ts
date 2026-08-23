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
import type { UpdateStatus } from './types.js';
import type { BundlePaths } from './loader.js';
/**
 * Set last-known bundle info (e.g. after load or apply). Consumer only; no ingestion.
 */
export declare function setLastKnownBundle(version: string | null, updatedAt: string | null): void;
/**
 * Get last-known bundle version (for comparison).
 */
export declare function getLastKnownBundle(): {
    version: string | null;
    updatedAt: string | null;
};
/**
 * Check for updates by fetching remote metadata and comparing.
 * Returns pure status only. No ingestion, no revision creation, no background updates.
 */
export declare function checkForUpdates(localPaths: BundlePaths, remoteMetadataUrl?: string): Promise<UpdateStatus>;
//# sourceMappingURL=updateCheck.d.ts.map