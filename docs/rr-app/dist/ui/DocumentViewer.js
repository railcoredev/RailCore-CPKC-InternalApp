/**
 * Document viewer overlay: show a document starting at a section, with scroll and Back.
 * Optional search-query highlighting and Next/Previous match (like Ctrl+F).
 * Phase D2: uses source_ref.display_title for headers; renders section.table as fixed-width.
 */
import { getReferenceState } from '../reference/applyUpdate.js';
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
/** Section display title: prefer source_ref.display_title, then source_ref.label, then title/id. */
function sectionDisplayTitle(sec) {
    if (sec.source_ref?.display_title)
        return sec.source_ref.display_title;
    if (sec.source_ref?.label)
        return sec.source_ref.label;
    return (sec.title ?? sec.id ?? '').replace(/\s*[.\s]+\d+-\d+\s*$/, '').trim();
}
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** Significant for search: length > 1 or contains a digit. Single letters are not highlighted. */
function isSignificantWord(w) {
    return w.length > 1 || /\d/.test(w);
}
/** Wrap each significant query word in escaped text with <mark>. Single letters are not highlighted. */
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
/**
 * Show overlay with document content starting at the given section.
 * If options.searchQuery is set, highlights matches and shows Next/Previous.
 */
export function showDocumentViewer(evidenceId, sectionId, onBack, options) {
    const state = getReferenceState();
    const snapshot = state?.snapshots.get(evidenceId);
    if (!snapshot?.sections?.length) {
        onBack();
        return;
    }
    const searchQuery = options?.searchQuery?.trim() ?? '';
    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Document viewer');
    overlay.style.cssText =
        'position:fixed;inset:0;background:var(--bg-primary);z-index:9998;display:flex;flex-direction:column;';
    const header = document.createElement('div');
    header.style.cssText =
        'flex-shrink:0;padding:0.5rem 1rem;border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;gap:0.75rem;background:var(--bg-secondary);';
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.textContent = '← Back to results';
    backBtn.setAttribute('aria-label', 'Back to search results');
    backBtn.style.cssText =
        'padding:0.5rem 1rem;border-radius:6px;font-size:1rem;cursor:pointer;background:var(--bg-tertiary);color:var(--link-color);border:1px solid var(--border-subtle);';
    backBtn.addEventListener('click', () => {
        if (overlay.parentNode)
            overlay.parentNode.removeChild(overlay);
        onBack();
    });
    header.appendChild(backBtn);
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-size:1rem;color:var(--text-primary);';
    titleEl.textContent = snapshot.meta?.title ?? evidenceId;
    header.appendChild(titleEl);
    let findBar = null;
    if (searchQuery) {
        findBar = document.createElement('div');
        findBar.style.cssText =
            'display:flex;align-items:center;gap:0.5rem;margin-left:auto;font-size:0.875rem;color:var(--text-secondary);';
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.textContent = 'Previous';
        prevBtn.setAttribute('aria-label', 'Previous match');
        prevBtn.style.cssText =
            'padding:0.25rem 0.5rem;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;font-size:0.875rem;';
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.textContent = 'Next';
        nextBtn.setAttribute('aria-label', 'Next match');
        nextBtn.style.cssText =
            'padding:0.25rem 0.5rem;border-radius:4px;border:1px solid var(--border-subtle);background:var(--bg-tertiary);color:var(--text-primary);cursor:pointer;font-size:0.875rem;';
        findBar.appendChild(prevBtn);
        findBar.appendChild(nextBtn);
        header.appendChild(findBar);
    }
    const scrollArea = document.createElement('div');
    scrollArea.style.cssText =
        'flex:1;overflow-y:auto;padding:1rem;min-height:0;background:var(--bg-primary);';
    const hitStyle = document.createElement('style');
    hitStyle.textContent = '.rr-search-hit{background:var(--status-warning);color:var(--bg-primary);border-radius:2px;padding:0 2px;}';
    overlay.appendChild(hitStyle);
    const rawSections = snapshot.sections;
    const bestById = new Map();
    const orderSeen = [];
    for (const sec of rawSections) {
        const sid = String(sec.id ?? '');
        if (!sid)
            continue;
        const textLen = (sec.text ?? '').length;
        const existing = bestById.get(sid);
        if (!existing || textLen > (existing.text ?? '').length) {
            bestById.set(sid, {
                id: sec.id,
                title: sec.title,
                text: sec.text,
                source_ref: sec.source_ref,
                table: sec.table,
                image: sec.image,
                content_blocks: sec.content_blocks,
            });
        }
        if (!orderSeen.includes(sid))
            orderSeen.push(sid);
    }
    const sectionsToRender = orderSeen.map((sid) => bestById.get(sid)).filter(Boolean);
    sectionsToRender.forEach((sec) => {
        const sid = String(sec.id ?? '');
        const sectionEl = document.createElement('section');
        sectionEl.setAttribute('data-section-id', sid);
        sectionEl.style.cssText =
            'margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border-subtle);';
        const headerHtml = sec.id
            ? `<div style="font-weight:600;font-size:1rem;color:var(--railcore-steel);margin-bottom:0.25rem;">${escapeHtml(sid)}</div>`
            : '';
        const primaryTitle = sectionDisplayTitle(sec);
        const titleRaw = escapeHtml(primaryTitle);
        const titleHtml = titleRaw
            ? `<div style="font-size:1.0625rem;color:var(--text-primary);margin-bottom:0.5rem;">${searchQuery ? highlightQueryWords(titleRaw, searchQuery) : titleRaw}</div>`
            : '';
        // Prefer content_blocks: page-ordered layout matching source
        const blocks = sec.content_blocks;
        const image = sec.image;
        const rows = sec.table?.rows;
        let bodyHtml;
        if (blocks?.length) {
            const hasImageBlocks = blocks.some((b) => b.type === 'image');
            const isTimetableFromSearch = hasImageBlocks && searchQuery;
            bodyHtml = '';
            let textBlocksHtml = '';
            for (const block of blocks) {
                if (block.type === 'image') {
                    const dataUri = `data:image/${block.format};base64,${block.data}`;
                    bodyHtml += `<div style="margin-bottom:1rem;">
            <img src="${dataUri}" alt="${escapeHtml(primaryTitle)}" style="max-width:100%;height:auto;border:1px solid var(--border-subtle);border-radius:4px;background:white;" />
          </div>`;
                }
                else {
                    const text = (block.text ?? '').trim();
                    if (text) {
                        const textRaw = escapeHtml(text);
                        const blockHtml = `<div style="margin-bottom:1rem;font-size:0.9375rem;line-height:1.6;white-space:pre-wrap;">${searchQuery ? highlightQueryWords(textRaw, searchQuery) : textRaw}</div>`;
                        if (isTimetableFromSearch) {
                            textBlocksHtml += blockHtml;
                        }
                        else {
                            bodyHtml += blockHtml;
                        }
                    }
                }
            }
            if (isTimetableFromSearch && textBlocksHtml) {
                bodyHtml += `<details style="margin-top:1rem;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.9375rem;">Show searchable text</summary><div style="margin-top:0.5rem;">${textBlocksHtml}</div></details>`;
            }
        }
        else if (image?.data) {
            const dataUri = `data:image/${image.format};base64,${image.data}`;
            bodyHtml = `<div style="margin-bottom:1rem;">
        <img src="${dataUri}" alt="${escapeHtml(primaryTitle)} table" style="max-width:100%;height:auto;border:1px solid var(--border-subtle);border-radius:4px;background:white;" />
      </div>`;
            if (searchQuery && sec.text) {
                const textRaw = escapeHtml(sec.text);
                bodyHtml += `<details style="margin-top:1rem;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.9375rem;">Show searchable text</summary><div style="font-size:0.875rem;white-space:pre-wrap;margin-top:0.5rem;padding:0.5rem;">${highlightQueryWords(textRaw, searchQuery)}</div></details>`;
            }
        }
        else if (rows?.length) {
            // Fallback to structured table rendering
            const colCount = rows[0]?.length ?? 0;
            const widths = [];
            for (let c = 0; c < colCount; c++) {
                let w = 0;
                rows.forEach((row) => {
                    const cell = row[c] != null ? String(row[c]) : '';
                    if (cell.length > w)
                        w = cell.length;
                });
                widths.push(w);
            }
            const lines = rows.map((row) => row.map((cell, c) => {
                const s = cell != null ? String(cell) : '';
                const pad = (widths[c] ?? 0) - s.length;
                return s + (pad > 0 ? ' '.repeat(pad) : '');
            }).join('  '));
            bodyHtml = `<div style="overflow-x:auto;"><pre style="font-family:ui-monospace,monospace;white-space:pre;margin:0;font-size:0.9375rem;">${escapeHtml(lines.join('\n'))}</pre></div>`;
        }
        else {
            // Regular text content
            const textRaw = sec.text ? escapeHtml(sec.text) : '';
            bodyHtml = textRaw
                ? `<div style="font-size:1rem;color:var(--text-primary);white-space:pre-wrap;word-break:break-word;line-height:1.6;">${searchQuery ? highlightQueryWords(textRaw, searchQuery) : textRaw}</div>`
                : '<p style="color:var(--text-muted);font-size:0.9375rem;margin:0;">This section has no additional text.</p>';
        }
        sectionEl.innerHTML = headerHtml + titleHtml + bodyHtml;
        scrollArea.appendChild(sectionEl);
    });
    overlay.appendChild(header);
    overlay.appendChild(scrollArea);
    document.body.appendChild(overlay);
    const allHits = searchQuery ? scrollArea.querySelectorAll('.rr-search-hit') : [];
    let currentHitIndex = -1;
    function scrollToHit(index) {
        const hits = scrollArea.querySelectorAll('.rr-search-hit');
        if (hits.length === 0)
            return;
        const i = ((index % hits.length) + hits.length) % hits.length;
        hits[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
        currentHitIndex = i;
    }
    if (findBar) {
        const prevBtn = findBar.querySelector('button');
        const nextBtn = findBar.querySelector('button:last-of-type');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => scrollToHit(currentHitIndex - 1));
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => scrollToHit(currentHitIndex + 1));
        }
    }
    const allSections = scrollArea.querySelectorAll('[data-section-id]');
    let targetEl = null;
    for (const el of allSections) {
        if (el.getAttribute('data-section-id') === sectionId) {
            targetEl = el;
            break;
        }
    }
    // Always scroll to the section the user clicked (e.g. 4th result), not to the first highlight in the doc.
    if (targetEl) {
        targetEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    // Set currentHitIndex to the first highlight inside the clicked section, so Next/Previous start from there.
    if (searchQuery && allHits.length > 0) {
        if (targetEl) {
            const hitIndexInSection = Array.from(allHits).findIndex((hit) => targetEl.contains(hit));
            currentHitIndex = hitIndexInSection >= 0 ? hitIndexInSection : 0;
        }
        else {
            currentHitIndex = 0;
        }
    }
}
//# sourceMappingURL=DocumentViewer.js.map