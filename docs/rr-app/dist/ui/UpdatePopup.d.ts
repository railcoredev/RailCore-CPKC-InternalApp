/**
 * Update popup — APP_INTEGRATION_CONTRACT §6.
 * One popup, two buttons (Close / Update), honest wording. No auto-apply, no silent behavior.
 */
export type UpdateVariant = 'data' | 'app' | 'both';
export interface UpdatePopupOptions {
    variant: UpdateVariant;
    onClose: () => void;
    onUpdate: () => void;
}
/**
 * Show one update popup. Dynamic title by variant; two buttons only: Close, Update.
 * Close → dismiss only. Update → call onUpdate (data only; app update is store/PWA/native).
 */
export declare function showUpdatePopup(options: UpdatePopupOptions): void;
/**
 * Dismiss popup (Close button behavior).
 */
export declare function hideUpdatePopup(): void;
//# sourceMappingURL=UpdatePopup.d.ts.map