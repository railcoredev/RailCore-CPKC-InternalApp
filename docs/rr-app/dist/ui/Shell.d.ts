/**
 * Shell layout and loading UX.
 * Creates app root, header, main, footer; splash overlay until bundle load.
 * Desktop/mobile via CSS container; single breakpoint for layout.
 */
export interface ShellElements {
    root: HTMLDivElement;
    header: HTMLElement;
    sidebar: HTMLElement;
    main: HTMLElement;
    footer: HTMLElement;
}
/**
 * Mount shell into container (default document.body).
 * Injects base layout styles and creates header, main, footer.
 */
export declare function mountShell(container?: HTMLElement): ShellElements;
/**
 * Get main content element (for mounting panels/views). Null if shell not mounted.
 */
export declare function getMain(): HTMLElement | null;
/**
 * Get header element. Null if shell not mounted.
 */
export declare function getHeader(): HTMLElement | null;
/**
 * Get footer element. Null if shell not mounted.
 */
export declare function getFooter(): HTMLElement | null;
/**
 * Get sidebar element (for updates / alerts). Null if shell not mounted.
 */
export declare function getSidebar(): HTMLElement | null;
/**
 * Show full-screen splash: "Loading...". Call before loadReferenceData().
 */
export declare function showSplash(): void;
/**
 * Hide splash (e.g. after loadReferenceData() resolves).
 */
export declare function hideSplash(): void;
//# sourceMappingURL=Shell.d.ts.map