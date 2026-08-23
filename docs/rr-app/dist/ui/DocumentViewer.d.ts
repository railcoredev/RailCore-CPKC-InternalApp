/**
 * Document viewer overlay: show a document starting at a section, with scroll and Back.
 * Optional search-query highlighting and Next/Previous match (like Ctrl+F).
 * Phase D2: uses source_ref.display_title for headers; renders section.table as fixed-width.
 */
export interface DocumentViewerOptions {
    searchQuery?: string;
}
/**
 * Show overlay with document content starting at the given section.
 * If options.searchQuery is set, highlights matches and shows Next/Previous.
 */
export declare function showDocumentViewer(evidenceId: string, sectionId: string, onBack: () => void, options?: DocumentViewerOptions): void;
//# sourceMappingURL=DocumentViewer.d.ts.map