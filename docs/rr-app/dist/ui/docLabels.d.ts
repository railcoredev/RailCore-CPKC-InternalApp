/**
 * Human-readable labels for evidence IDs (fallback when meta.title is missing).
 * Used in document dropdowns and search result headers.
 */
import type { ReferenceState } from '../reference/applyUpdate.js';
/**
 * Display title for a document: meta.title, then fallback label, then raw id.
 */
export declare function getDocumentDisplayTitle(state: ReferenceState | null, evidenceId: string): string;
//# sourceMappingURL=docLabels.d.ts.map