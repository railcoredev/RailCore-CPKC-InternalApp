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
import type { ReferenceQueryResult } from './types.js';
/**
 * Query reference data: keyword search over sections.
 * Returns evidence_id, revision_id, section location, verbatim excerpts.
 * Exposes conflicts; never resolves. "Multiple references found" / "No reference found" when applicable.
 */
export declare function queryReference(query: string): ReferenceQueryResult;
//# sourceMappingURL=query.d.ts.map