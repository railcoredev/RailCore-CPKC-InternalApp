/**
 * Document browser: table-of-contents tree (left) and read panel (right).
 * Document dropdown; expandable chapter/subchapter tree; click a section to read its content.
 * Prefers the section variant with the longest text (full rule content) when the bundle has duplicate ids.
 */
export interface DocBrowserOptions {
    /** When provided, use this select instead of creating one (unified toolbar). */
    docSelect?: HTMLSelectElement;
}
/**
 * Mount document browser: document dropdown, table-of-contents tree (left), read panel (right).
 * If options.docSelect is provided, it is used and populated; no separate doc row is created.
 */
export declare function mountDocBrowser(container: HTMLElement, options?: DocBrowserOptions): void;
//# sourceMappingURL=DocBrowser.d.ts.map