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
import type { BundleMetadata, DocSnapshot, CanonicalIndex, CanonicalDiff, AlertRecord } from './types.js';
/** Expected structure (do not infer): mobile_cache/ with dist/, canonical_history/, alerts/, metadata.json */
export interface BundlePaths {
    /** Root of mobile bundle (e.g. file:// or path). */
    root: string;
    /** Optional: base URL for remote bundle (e.g. https://example.com/bundle). */
    remoteBaseUrl?: string;
}
/** Load metadata.json — fail loudly if missing or malformed. */
export declare function loadMetadata(paths: BundlePaths): Promise<BundleMetadata>;
/** Load snapshot for one evidence (dist/<evidence_id>.json or dist/<id>.json). Contract: meta + sections[]. */
export declare function loadSnapshot(paths: BundlePaths, evidenceId: string, distFileName?: string): Promise<DocSnapshot>;
/** Load canonical history index for one evidence. */
export declare function loadCanonicalIndex(paths: BundlePaths, evidenceId: string): Promise<CanonicalIndex>;
/** Load diff file (mechanical diff only). */
export declare function loadDiff(paths: BundlePaths, evidenceId: string, diffFile: string): Promise<CanonicalDiff | null>;
/** Load alerts. Contract: alerts/ with *.json or single alerts.json. */
export declare function loadAlerts(paths: BundlePaths): Promise<AlertRecord[]>;
/** Load full bundle into memory (read-only). Fails loudly if required files missing. */
export declare function loadBundle(paths: BundlePaths): Promise<{
    metadata: BundleMetadata;
    snapshots: Map<string, DocSnapshot>;
    indexes: Map<string, CanonicalIndex>;
    lastUpdated: string;
}>;
//# sourceMappingURL=loader.d.ts.map