/**
 * Full-screen "Please wait, app is updating…" overlay.
 * Show when user taps Update; hide on reload or when apply completes.
 */
let overlayEl = null;
/**
 * Show progress overlay. Call when user taps Update in the update popup.
 */
export function showUpdateProgressOverlay() {
    if (overlayEl)
        return;
    const style = document.createElement('style');
    style.textContent = '@keyframes rr-progress-spin{to{transform:rotate(360deg);}}';
    document.head.appendChild(style);
    const el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'App is updating');
    el.style.cssText =
        'position:fixed;inset:0;background:rgba(14,15,17,0.9);display:flex;align-items:center;justify-content:center;z-index:10001;';
    el.innerHTML = `
    <div style="text-align:center;">
      <div style="width:44px;height:44px;border:3px solid var(--border-subtle);border-top-color:var(--railcore-orange);border-radius:50%;margin:0 auto 1rem;animation:rr-progress-spin 0.9s linear infinite;"></div>
      <p style="margin:0;font-size:0.95rem;color:var(--text-primary);">Please wait, app is updating…</p>
    </div>
  `;
    document.body.appendChild(el);
    overlayEl = el;
}
/**
 * Hide progress overlay. Call after reload or when apply completes.
 */
export function hideUpdateProgressOverlay() {
    if (overlayEl?.parentNode)
        overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
}
//# sourceMappingURL=UpdateProgressOverlay.js.map