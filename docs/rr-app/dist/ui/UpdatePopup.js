/**
 * Update popup — APP_INTEGRATION_CONTRACT §6.
 * One popup, two buttons (Close / Update), honest wording. No auto-apply, no silent behavior.
 */
const TITLES = {
    data: 'New data update available',
    app: 'New app update available',
    both: 'New updates available',
};
let overlay = null;
/**
 * Show one update popup. Dynamic title by variant; two buttons only: Close, Update.
 * Close → dismiss only. Update → call onUpdate (data only; app update is store/PWA/native).
 */
export function showUpdatePopup(options) {
    if (overlay)
        return;
    const { variant, onClose, onUpdate } = options;
    const title = TITLES[variant];
    overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'update-popup-title');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(14,15,17,0.75);display:flex;align-items:center;justify-content:center;z-index:1000;';
    const inner = document.createElement('div');
    inner.style.cssText = 'background:var(--bg-secondary);padding:1.25rem;border-radius:8px;max-width:360px;border:1px solid var(--railcore-steel);';
    const titleEl = document.createElement('h3');
    titleEl.id = 'update-popup-title';
    titleEl.className = 'update-popup-title';
    titleEl.textContent = title;
    titleEl.style.cssText = 'margin:0 0 0.5rem;font-size:1rem;color:var(--text-primary);';
    inner.appendChild(titleEl);
    const bodyEl = document.createElement('p');
    bodyEl.textContent = 'An update is available.';
    bodyEl.style.cssText = 'margin:0 0 1rem;font-size:0.875rem;color:var(--text-secondary);';
    inner.appendChild(bodyEl);
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:0.5rem;justify-content:flex-end;';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'padding:0.4rem 0.75rem;border-radius:4px;font-size:0.875rem;cursor:pointer;background:transparent;color:var(--text-primary);border:1px solid var(--border-subtle);';
    closeBtn.addEventListener('click', () => {
        hideUpdatePopup();
        onClose();
    });
    buttons.appendChild(closeBtn);
    const updateBtn = document.createElement('button');
    updateBtn.type = 'button';
    updateBtn.textContent = 'Update';
    updateBtn.style.cssText = 'padding:0.4rem 0.75rem;border-radius:4px;font-size:0.875rem;cursor:pointer;background:var(--railcore-orange);color:#0E0F11;border:none;';
    updateBtn.addEventListener('click', () => {
        hideUpdatePopup();
        onUpdate();
    });
    buttons.appendChild(updateBtn);
    inner.appendChild(buttons);
    overlay.appendChild(inner);
    document.body.appendChild(overlay);
}
/**
 * Dismiss popup (Close button behavior).
 */
export function hideUpdatePopup() {
    if (overlay?.parentNode)
        overlay.parentNode.removeChild(overlay);
    overlay = null;
}
//# sourceMappingURL=UpdatePopup.js.map