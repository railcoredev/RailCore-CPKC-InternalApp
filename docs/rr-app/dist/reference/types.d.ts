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
/** Source ref (page/label or part/section). Phase D2: display_title primary header; doc_id for linking. CFR uses part/section. */
export interface SourceRef {
    page?: number;
    label: string;
    display_title?: string;
    doc_id?: string;
    part?: string;
    section?: string;
    [k: string]: unknown;
}
/** Section table (e.g. table_pdf timetables). rows are array of cell strings per row. */
export interface SectionTable {
    rows?: string[][];
    [k: string]: unknown;
}
/** rr-docs snapshot schema: meta + sections[] (verbatim evidence). Phase D: meta may include evidence_id, source_name, parser_type; sections may have order, parent_id, source_ref, table. */
export interface DocSnapshot {
    meta: {
        title: string;
        version: string;
        evidence_id?: string;
        source_name?: string;
        effective_date?: string | null;
        parser_type?: string;
        authoritative?: boolean;
        [k: string]: unknown;
    };
    sections: Array<{
        id?: string;
        title?: string;
        text?: string;
        part?: string;
        order?: number;
        parent_id?: string | null;
        source_ref?: SourceRef;
        /** table_pdf / timetables: structured table; render as fixed-width. */
        table?: SectionTable;
        /** table_pdf: raw line text fallback. */
        raw_text?: string;
        [k: string]: unknown;
    }>;
    /** form_artifact only: reference to original file; sections are empty. */
    artifact?: {
        filename: string;
        hash: string;
        pages: number;
        size?: number;
    };
}
/** mobile_cache/metadata.json (contract). */
export interface BundleMetadata {
    bundle_version: string;
    updated_at: string;
    evidence_ids: string[];
}
/** Canonical history index: ordered revisions. */
export interface CanonicalIndex {
    revisions?: Array<{
        revision_id: string;
        diff_file?: string;
    }>;
}
/** Mechanical diff: change presence only, no semantic meaning. */
export interface CanonicalDiff {
    changes?: Array<{
        section_id: string;
        type: 'added' | 'modified' | 'removed';
    }>;
}
/** Single alert (update notification). */
export interface AlertRecord {
    source_id?: string;
    evidence_id?: string;
    detected_at?: string;
    state?: string;
    [key: string]: unknown;
}
/** Update check result — pure status, no side effects. */
export interface UpdateStatus {
    data_update_available: boolean;
    app_update_available: boolean;
}
/** Query result item: evidence, revision, location, verbatim excerpt. Never resolved. */
export interface ReferenceResult {
    evidence_id: string;
    revision_id: string;
    location: {
        section_id?: string;
        title?: string;
        part?: string;
    };
    excerpt: string;
    change_type?: 'added' | 'modified' | 'removed' | null;
    /** Expose conflicts; do not resolve. */
    citations?: Array<{
        file: string;
        revision: string;
        path: string;
    }>;
}
/** Query response: point to references; "Multiple references found" / "No reference found" when applicable. */
export interface ReferenceQueryResult {
    query: string;
    results: ReferenceResult[];
    notes: string[];
}
//# sourceMappingURL=types.d.ts.map