/**
 * App entry: wire reference layer + update popup + shell.
 * All queries read from reference/; update popup follows APP_INTEGRATION_CONTRACT §6.
 */
/**
 * Configure bundle paths (local cache root and optional remote base URL).
 */
export declare function setBundlePaths(root: string, remoteBaseUrl?: string): void;
/**
 * Load reference data from local bundle (offline-first). Sets in-memory state; no write to rr-docs.
 */
export declare function loadReferenceData(): Promise<void>;
/**
 * Run update check; if updates available, show one popup (data / app / both). No auto-apply.
 */
export declare function runUpdateCheck(): Promise<{
    data_update_available: boolean;
    app_update_available: boolean;
}>;
/**
 * Query reference data (read-only). Returns results + notes; "Multiple references found" / "No reference found" when applicable.
 */
export declare function query(q: string): import("./reference/types.js").ReferenceQueryResult;
export declare function initApp(container?: HTMLElement): Promise<void>;
//# sourceMappingURL=app.d.ts.map