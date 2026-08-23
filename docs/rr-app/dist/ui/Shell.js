/**
 * Shell layout and loading UX.
 * Creates app root, header, main, footer; splash overlay until bundle load.
 * Desktop/mobile via CSS container; single breakpoint for layout.
 */
const BREAKPOINT_MOBILE_PX = 768;
const SIDEBAR_WIDTH_PX = 220;
const RAILCORE_TOKENS = `
:root {
  --railcore-orange: #FF6600;
  --railcore-steel:  #445C72;
  --bg-primary:   #0E0F11;
  --bg-secondary: #16181C;
  --bg-tertiary:  #1E2127;
  --border-subtle: #2A2F38;
  --border-strong: #3A404B;
  --text-primary:   #E6E8EB;
  --text-secondary: #B0B6BF;
  --text-muted:     #7C8390;
  --focus-ring: #FF6600;
  --link-color: #6FA3D1;
  --hover-bg:   #22262E;
  --status-success: #3FA26A;
  --status-warning: #E0A030;
  --status-error:   #C94A4A;
  --status-info:    #6FA3D1;
}
`;
let rootEl = null;
let mainEl = null;
let headerEl = null;
let footerEl = null;
let sidebarEl = null;
let splashEl = null;
const baseStyles = `
  .rr-app-root { display: flex; flex-direction: column; min-height: 100vh; background: var(--bg-primary); }
  .rr-app-header { padding: 0.5rem 1rem; min-height: 2.5rem; border-bottom: 1px solid var(--border-subtle); background: var(--bg-primary); }
  .rr-app-body { display: flex; flex: 1; min-height: 0; }
  .rr-app-sidebar { width: ${SIDEBAR_WIDTH_PX}px; min-width: ${SIDEBAR_WIDTH_PX}px; padding: 0.75rem; border-right: 1px solid var(--border-subtle); background: var(--bg-secondary); flex-shrink: 0; }
  .rr-app-main { flex: 1; display: flex; flex-direction: column; min-height: 0; min-width: 0; padding: 1rem; overflow: auto; background: var(--bg-primary); }
  .rr-app-footer { padding: 0.5rem 1rem; min-height: 2rem; border-top: 1px solid var(--border-subtle); font-size: 0.75rem; color: var(--text-muted); background: var(--bg-primary); }
  @media (max-width: ${BREAKPOINT_MOBILE_PX - 1}px) {
    .rr-app-body { flex-direction: column; }
    .rr-app-sidebar { width: 100%; min-width: 0; border-right: none; border-bottom: 1px solid var(--border-subtle); }
  }
  @media (min-width: ${BREAKPOINT_MOBILE_PX}px) {
    .rr-app-main { max-width: 52rem; }
  }
  .rr-splash { position: fixed; inset: 0; background: var(--bg-primary); display: flex; align-items: center; justify-content: center; z-index: 9999; }
  .rr-splash-content { text-align: center; }
  .rr-splash-text { color: var(--text-muted); font-size: 0.9rem; }
`;
/**
 * Mount shell into container (default document.body).
 * Injects base layout styles and creates header, main, footer.
 */
export function mountShell(container) {
    const target = container ?? document.body;
    const tokensStyle = document.createElement('style');
    tokensStyle.textContent = RAILCORE_TOKENS;
    document.head.appendChild(tokensStyle);
    const style = document.createElement('style');
    style.textContent = baseStyles;
    document.head.appendChild(style);
    const root = document.createElement('div');
    root.className = 'rr-app-root';
    const header = document.createElement('header');
    header.className = 'rr-app-header';
    header.setAttribute('aria-label', 'App header');
    const body = document.createElement('div');
    body.className = 'rr-app-body';
    const sidebar = document.createElement('aside');
    sidebar.className = 'rr-app-sidebar';
    sidebar.setAttribute('aria-label', 'Updates and alerts');
    const main = document.createElement('main');
    main.className = 'rr-app-main';
    main.setAttribute('role', 'main');
    const footer = document.createElement('footer');
    footer.className = 'rr-app-footer';
    footer.setAttribute('aria-label', 'App footer');
    body.appendChild(sidebar);
    body.appendChild(main);
    root.appendChild(header);
    root.appendChild(body);
    root.appendChild(footer);
    target.appendChild(root);
    rootEl = root;
    headerEl = header;
    sidebarEl = sidebar;
    mainEl = main;
    footerEl = footer;
    return { root, header, sidebar, main, footer };
}
/**
 * Get main content element (for mounting panels/views). Null if shell not mounted.
 */
export function getMain() {
    return mainEl;
}
/**
 * Get header element. Null if shell not mounted.
 */
export function getHeader() {
    return headerEl;
}
/**
 * Get footer element. Null if shell not mounted.
 */
export function getFooter() {
    return footerEl;
}
/**
 * Get sidebar element (for updates / alerts). Null if shell not mounted.
 */
export function getSidebar() {
    return sidebarEl;
}
/**
 * Show full-screen splash: "Loading...". Call before loadReferenceData().
 */
export function showSplash() {
    if (splashEl)
        return;
    const el = document.createElement('div');
    el.className = 'rr-splash';
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Loading');
    el.innerHTML = `
    <div class="rr-splash-content">
      <div class="rr-splash-text">Loading…</div>
    </div>
  `;
    document.body.appendChild(el);
    splashEl = el;
}
/**
 * Hide splash (e.g. after loadReferenceData() resolves).
 */
export function hideSplash() {
    if (!splashEl?.parentNode)
        return;
    splashEl.parentNode.removeChild(splashEl);
    splashEl = null;
}
//# sourceMappingURL=Shell.js.map