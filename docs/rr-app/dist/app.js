/**
 * App entry: wire reference layer + update popup + shell.
 * All queries read from reference/; update popup follows APP_INTEGRATION_CONTRACT §6.
 */
import { loadBundle, checkForUpdates, applyDataUpdate, queryReference, setReferenceState } from './reference/index.js';
import { showUpdatePopup, showUpdateProgressOverlay, mountShell, showSplash, hideSplash, getMain, getSidebar, mountResourcesView, mountDocBrowser, mountBrowserView, } from './ui/index.js';
const DEFAULT_BUNDLE_ROOT = '/mobile_cache';
let bundlePaths = { root: DEFAULT_BUNDLE_ROOT };
/**
 * Configure bundle paths (local cache root and optional remote base URL).
 */
export function setBundlePaths(root, remoteBaseUrl) {
    bundlePaths = { root, remoteBaseUrl };
}
/**
 * Load reference data from local bundle (offline-first). Sets in-memory state; no write to rr-docs.
 */
export async function loadReferenceData() {
    const state = await loadBundle(bundlePaths);
    setReferenceState(state);
}
/**
 * Run update check; if updates available, show one popup (data / app / both). No auto-apply.
 */
export async function runUpdateCheck() {
    const status = await checkForUpdates(bundlePaths, bundlePaths.remoteBaseUrl ? `${bundlePaths.remoteBaseUrl}/metadata.json` : undefined);
    if (status.data_update_available || status.app_update_available) {
        const variant = status.data_update_available && status.app_update_available
            ? 'both'
            : status.data_update_available
                ? 'data'
                : 'app';
        showUpdatePopup({
            variant,
            onClose: () => { },
            onUpdate: () => {
                showUpdateProgressOverlay();
                if (status.data_update_available && bundlePaths.remoteBaseUrl) {
                    applyDataUpdate(bundlePaths.remoteBaseUrl, bundlePaths.root)
                        .then(() => window.location.reload())
                        .catch(() => window.location.reload());
                }
                else {
                    window.location.reload();
                }
            },
        });
    }
    return status;
}
/**
 * Query reference data (read-only). Returns results + notes; "Multiple references found" / "No reference found" when applicable.
 */
export function query(q) {
    return queryReference(q);
}
/**
 * Initialize app: mount shell, show splash, load bundle, hide splash, mount Resources view (or error state), run update check.
 * Call from a browser host (e.g. index.html) with optional container (default document.body).
 */
const SPLASH_MAX_MS = 2500;
export async function initApp(container) {
    mountShell(container);
    showSplash();
    const splashTimeout = setTimeout(hideSplash, SPLASH_MAX_MS);
    let loadError = null;
    try {
        await loadReferenceData();
    }
    catch (e) {
        loadError = e instanceof Error ? e : new Error(String(e));
    }
    finally {
        clearTimeout(splashTimeout);
        hideSplash();
    }
    const main = getMain();
    const target = main ?? (container ?? document.body);
    if (loadError) {
        target.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.setAttribute('role', 'alert');
        wrap.style.cssText = 'padding:1.5rem;text-align:center;';
        wrap.innerHTML = `
      <p style="margin:0 0 0.5rem;color:var(--status-error);">Reference bundle could not be loaded.</p>
      <p style="margin:0 0 1rem;font-size:0.875rem;color:var(--text-secondary);">${escapeHtml(loadError.message)}</p>
      <button type="button" id="rr-retry-load" style="padding:0.4rem 0.75rem;border-radius:4px;font-size:0.875rem;cursor:pointer;background:var(--railcore-orange);color:#0E0F11;border:none;">Retry</button>
    `;
        target.appendChild(wrap);
        wrap.querySelector('#rr-retry-load')?.addEventListener('click', () => initApp(container));
    }
    else if (main) {
        const sidebar = getSidebar();
        if (sidebar) {
            sidebar.innerHTML = '';
            const updatesHeading = document.createElement('div');
            updatesHeading.style.cssText = 'font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);margin-bottom:0.5rem;';
            updatesHeading.textContent = 'Updates & alerts';
            sidebar.appendChild(updatesHeading);
            const updatesPlaceholder = document.createElement('p');
            updatesPlaceholder.style.cssText = 'font-size:0.9375rem;color:var(--text-muted);margin:0;line-height:1.4;';
            updatesPlaceholder.textContent = 'Update status and alerts will appear here when available.';
            sidebar.appendChild(updatesPlaceholder);
        }
        const tabRow = document.createElement('div');
        tabRow.style.cssText = 'display:flex;gap:0;margin-bottom:1rem;border-bottom:1px solid var(--border-subtle);';
        const tabStyleBase = 'padding:0.5rem 1rem;border:none;border-bottom:2px solid transparent;background:transparent;font-size:0.875rem;cursor:pointer;';
        const searchTab = document.createElement('button');
        searchTab.type = 'button';
        searchTab.textContent = 'Search';
        searchTab.setAttribute('aria-selected', 'true');
        searchTab.style.cssText = tabStyleBase + 'border-bottom-color:var(--railcore-orange);color:var(--railcore-orange);font-weight:600;';
        const browseTab = document.createElement('button');
        browseTab.type = 'button';
        browseTab.textContent = 'Browse';
        browseTab.setAttribute('aria-selected', 'false');
        browseTab.style.cssText = tabStyleBase + 'color:var(--text-muted);';
        const browserTab = document.createElement('button');
        browserTab.type = 'button';
        browserTab.textContent = 'Browser';
        browserTab.setAttribute('aria-selected', 'false');
        browserTab.style.cssText = tabStyleBase + 'color:var(--text-muted);';
        const searchPanel = document.createElement('div');
        searchPanel.style.cssText = 'min-height:12rem;';
        const browsePanel = document.createElement('div');
        browsePanel.style.cssText = 'min-height:12rem;display:none;';
        const browserPanel = document.createElement('div');
        browserPanel.style.cssText = 'min-height:20rem;display:none;flex:1;flex-direction:column;min-height:0;';
        mountResourcesView(searchPanel);
        mountDocBrowser(browsePanel);
        mountBrowserView(browserPanel);
        function setTab(active) {
            const isSearch = active === 'search';
            const isBrowse = active === 'browse';
            const isBrowser = active === 'browser';
            searchTab.setAttribute('aria-selected', String(isSearch));
            browseTab.setAttribute('aria-selected', String(isBrowse));
            browserTab.setAttribute('aria-selected', String(isBrowser));
            searchTab.style.borderBottomColor = isSearch ? 'var(--railcore-orange)' : 'transparent';
            searchTab.style.color = isSearch ? 'var(--railcore-orange)' : 'var(--text-muted)';
            searchTab.style.fontWeight = isSearch ? '600' : '400';
            browseTab.style.borderBottomColor = isBrowse ? 'var(--railcore-orange)' : 'transparent';
            browseTab.style.color = isBrowse ? 'var(--railcore-orange)' : 'var(--text-muted)';
            browseTab.style.fontWeight = isBrowse ? '600' : '400';
            browserTab.style.borderBottomColor = isBrowser ? 'var(--railcore-orange)' : 'transparent';
            browserTab.style.color = isBrowser ? 'var(--railcore-orange)' : 'var(--text-muted)';
            browserTab.style.fontWeight = isBrowser ? '600' : '400';
            searchPanel.style.display = isSearch ? '' : 'none';
            browsePanel.style.display = isBrowse ? '' : 'none';
            browserPanel.style.display = isBrowser ? 'flex' : 'none';
        }
        searchTab.addEventListener('click', () => setTab('search'));
        browseTab.addEventListener('click', () => setTab('browse'));
        browserTab.addEventListener('click', () => setTab('browser'));
        tabRow.appendChild(searchTab);
        tabRow.appendChild(browseTab);
        tabRow.appendChild(browserTab);
        main.appendChild(tabRow);
        main.appendChild(searchPanel);
        main.appendChild(browsePanel);
        main.appendChild(browserPanel);
    }
    await runUpdateCheck();
}
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
//# sourceMappingURL=app.js.map