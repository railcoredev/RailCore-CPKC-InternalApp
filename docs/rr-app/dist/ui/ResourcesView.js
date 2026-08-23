/**
 * Resources / document lookup UI.
 * Search input + optional evidence filter; results from queryReference(); client-side filter only.
 * Highlights search terms in result cards and passes query to Document Viewer for find-in-page.
 */
import { getReferenceState } from '../reference/applyUpdate.js';
import { queryReference } from '../reference/query.js';
import { showDocumentViewer } from './DocumentViewer.js';
import { getDocumentDisplayTitle } from './docLabels.js';
const PLACEHOLDER = 'Type to search reference documents.';
const MAX_EXCERPT_LEN = 400;
const SEARCH_DEBOUNCE_MS = 300;
/** Simple debounce helper. */
function debounce(fn, ms) {
    let timer = null;
    return ((...args) => {
        if (timer)
            clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    });
}
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
/** Significant for search: length > 1 or contains a digit. Single letters (a, b) are not highlighted. */
function isSignificantWord(w) {
    return w.length > 1 || /\d/.test(w);
}
/** Wrap each significant query word in text with <mark> (case-insensitive). Single letters are not highlighted. */
function highlightQueryWords(escapedText, query) {
    const raw = (query ?? '').trim();
    if (!raw)
        return escapedText;
    const words = raw.split(/\s+/).filter(Boolean).filter(isSignificantWord);
    let out = escapedText;
    for (const w of words) {
        const re = new RegExp(escapeRegex(w), 'gi');
        out = out.replace(re, (match) => `<mark class="rr-search-hit">${match}</mark>`);
    }
    return out;
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Mount Resources view into container: search input, optional evidence selector, results list.
 * Data from getReferenceState() and queryReference(q) only; client-side filter by evidence_id.
 */
export function mountResourcesView(container) {
    const state = getReferenceState();
    const evidenceIds = state ? Array.from(state.snapshots.keys()) : [];
    const wrap = document.createElement('div');
    wrap.className = 'rr-resources';
    wrap.setAttribute('aria-label', 'Reference search');
    const searchRow = document.createElement('div');
    searchRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;margin-bottom:1rem;';
    const evidenceSelect = document.createElement('select');
    evidenceSelect.setAttribute('aria-label', 'Filter by document');
    evidenceSelect.className = 'rr-resources-doc-filter';
    evidenceSelect.style.cssText =
        'padding:0.5rem 0.875rem;min-height:44px;border-radius:8px;font-size:0.9375rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-subtle);appearance:auto;cursor:pointer;font-weight:500;';
    const allOpt = document.createElement('option');
    allOpt.value = '';
    allOpt.textContent = 'All documents';
    evidenceSelect.appendChild(allOpt);
    evidenceIds.forEach((id) => {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = getDocumentDisplayTitle(state, id);
        evidenceSelect.appendChild(opt);
    });
    searchRow.appendChild(evidenceSelect);
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.placeholder = PLACEHOLDER;
    searchInput.setAttribute('aria-label', 'Search reference documents');
    searchInput.setAttribute('spellcheck', 'true');
    searchInput.style.cssText =
        'flex:1;min-width:12rem;min-height:44px;padding:0.5rem 0.875rem;border-radius:8px;font-size:0.9375rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-subtle);';
    searchRow.appendChild(searchInput);
    const resultsEl = document.createElement('div');
    resultsEl.className = 'rr-resources-results';
    resultsEl.setAttribute('role', 'region');
    resultsEl.setAttribute('aria-live', 'polite');
    resultsEl.style.cssText = 'min-height:8rem;';
    function render() {
        const q = (searchInput.value ?? '').trim();
        const evidenceFilter = evidenceSelect.value || null;
        if (!q) {
            resultsEl.innerHTML = `<p style="margin:0;color:var(--link-color);font-size:1rem;">${escapeHtml(PLACEHOLDER)}</p>`;
            return;
        }
        const out = queryReference(q);
        let results = out.results;
        if (evidenceFilter) {
            results = results.filter((r) => r.evidence_id === evidenceFilter);
        }
        const notesHtml = out.notes.length > 0
            ? `<p class="rr-resources-notes" style="margin:0 0 0.5rem;color:var(--text-muted);font-size:0.9375rem;">${out.notes.map(escapeHtml).join(' ')}</p>`
            : '';
        if (results.length === 0) {
            resultsEl.innerHTML =
                notesHtml +
                    `<p style="margin:0;color:var(--text-secondary);font-size:1rem;">No reference found.</p>`;
            return;
        }
        const countText = results.length === 1 ? '1 match' : `${results.length} matches`;
        const countHtml = `<p style="margin:0 0 0.5rem;font-size:0.9375rem;color:var(--text-muted);">${escapeHtml(countText)}</p>`;
        const hitsHtml = results
            .slice(0, 100)
            .map((r) => buildResultCardHtml(r, q))
            .join('');
        resultsEl.innerHTML = notesHtml + countHtml + `<div class="rr-resources-list">${hitsHtml}</div>`;
    }
    resultsEl.addEventListener('click', (e) => {
        const target = e.target.closest('.rr-resources-hit');
        if (!target)
            return;
        const evidenceId = target.getAttribute('data-evidence-id');
        const sectionId = target.getAttribute('data-section-id') ?? '';
        const currentQuery = (searchInput.value ?? '').trim();
        if (evidenceId != null) {
            showDocumentViewer(evidenceId, sectionId, () => { }, { searchQuery: currentQuery || undefined });
        }
    });
    const debouncedRender = debounce(render, SEARCH_DEBOUNCE_MS);
    searchInput.addEventListener('input', debouncedRender);
    searchInput.addEventListener('search', render); // immediate on Enter/clear
    evidenceSelect.addEventListener('change', render);
    wrap.appendChild(searchRow);
    wrap.appendChild(resultsEl);
    container.appendChild(wrap);
    render();
}
function buildResultCardHtml(r, searchQuery) {
    const sectionId = r.location?.section_id ?? '';
    const evidenceId = r.evidence_id;
    const isTimetable = evidenceId.startsWith('timetable_');
    const titleHtml = r.location?.title
        ? highlightQueryWords(escapeHtml(r.location.title), searchQuery)
        : '';
    const sectionIdDisplay = sectionId
        ? ` <span class="rr-resources-section-id" style="color:var(--link-color);text-decoration:underline;cursor:pointer;">${escapeHtml(sectionId)}</span>`
        : '';
    const docTitle = getDocumentDisplayTitle(getReferenceState(), evidenceId);
    const rawExcerpt = r.excerpt || '';
    const excerptContent = isTimetable
        ? 'Open to view subdivision pages and images.'
        : rawExcerpt.slice(0, MAX_EXCERPT_LEN) + (rawExcerpt.length > MAX_EXCERPT_LEN ? '…' : '');
    const excerptHtml = isTimetable
        ? escapeHtml(excerptContent)
        : highlightQueryWords(escapeHtml(excerptContent), searchQuery);
    return `<article class="rr-resources-hit" data-evidence-id="${escapeHtml(evidenceId)}" data-section-id="${escapeHtml(sectionId)}" style="margin-bottom:1rem;padding:0.75rem;background:var(--bg-secondary);border-radius:6px;border-left:3px solid var(--railcore-steel);cursor:pointer;border:1px solid var(--border-subtle);">
    <header style="font-weight:600;font-size:1rem;color:var(--railcore-steel);margin-bottom:0.25rem;">${escapeHtml(docTitle)}${sectionIdDisplay}</header>
    ${titleHtml ? `<div style="font-size:0.9375rem;color:var(--text-primary);margin-bottom:0.25rem;">${titleHtml}</div>` : ''}
    <div style="font-size:0.9375rem;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word;line-height:1.5;">${excerptHtml}</div>
    <div style="margin-top:0.5rem;font-size:0.875rem;color:var(--link-color);">View in document →</div>
  </article>`;
}
//# sourceMappingURL=ResourcesView.js.map