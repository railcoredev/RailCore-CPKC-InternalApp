/**
 * Browser view: URL bar + iframe for in-app web browsing.
 * Matches desktop RR Document Viewer Browser tab behavior.
 */
/**
 * Mount browser view into container: URL input, Go button, iframe.
 * Only http/https URLs are loaded; user input gets https:// prepended if no scheme.
 */
export function mountBrowserView(container) {
    container.innerHTML = '';
    container.setAttribute('aria-label', 'Browser');
    const wrap = document.createElement('div');
    wrap.className = 'rr-browser-view';
    wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';
    const toolbar = document.createElement('div');
    toolbar.style.cssText =
        'display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;flex-shrink:0;';
    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.placeholder = 'Enter URL (e.g. https://example.com)';
    urlInput.setAttribute('aria-label', 'URL');
    urlInput.style.cssText =
        'flex:1;min-width:0;padding:0.4rem 0.6rem;font-size:0.875rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-subtle);border-radius:4px;';
    const goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.textContent = 'Go';
    goBtn.style.cssText =
        'padding:0.4rem 0.75rem;font-size:0.875rem;background:var(--railcore-orange);color:var(--bg-primary);border:none;border-radius:4px;cursor:pointer;';
    goBtn.addEventListener('mouseenter', () => (goBtn.style.opacity = '0.9'));
    goBtn.addEventListener('mouseleave', () => (goBtn.style.opacity = '1'));
    const iframe = document.createElement('iframe');
    iframe.title = 'Browser content';
    iframe.src = 'about:blank';
    iframe.style.cssText =
        'flex:1;min-height:0;width:100%;border:1px solid var(--border-subtle);border-radius:4px;background:var(--bg-secondary);';
    function navigate() {
        const raw = (urlInput.value ?? '').trim();
        if (!raw)
            return;
        let url = raw;
        if (!/^https?:\/\//i.test(url))
            url = 'https://' + url;
        try {
            new URL(url);
        }
        catch {
            return;
        }
        iframe.src = url;
    }
    goBtn.addEventListener('click', navigate);
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter')
            navigate();
    });
    toolbar.appendChild(urlInput);
    toolbar.appendChild(goBtn);
    wrap.appendChild(toolbar);
    wrap.appendChild(iframe);
    container.appendChild(wrap);
}
//# sourceMappingURL=BrowserView.js.map