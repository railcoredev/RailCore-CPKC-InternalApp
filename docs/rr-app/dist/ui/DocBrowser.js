/**
 * Document browser: table-of-contents tree (left) and read panel (right).
 * Document dropdown; expandable chapter/subchapter tree; click a section to read its content.
 * Prefers the section variant with the longest text (full rule content) when the bundle has duplicate ids.
 */
import { getReferenceState } from '../reference/applyUpdate.js';
import { getDocumentDisplayTitle } from './docLabels.js';
function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
}
const BROWSE_PLACEHOLDER = 'Select a document to browse sections.';
/** For each section id, keep the section that has the longest text (full content over TOC). Preserves source_ref and table for display_title and table rendering. */
function buildBestSectionsById(snapshot) {
    const sections = snapshot.sections ?? [];
    const bestById = new Map();
    const orderSeen = [];
    for (const sec of sections) {
        const id = String(sec.id ?? '');
        if (!id)
            continue;
        const textLen = (sec.text ?? '').length;
        const existing = bestById.get(id);
        if (!existing || textLen > (existing.text ?? '').length) {
            bestById.set(id, {
                id: sec.id,
                title: sec.title,
                text: sec.text,
                order: sec.order,
                parent_id: sec.parent_id,
                source_ref: sec.source_ref,
                table: sec.table,
                image: sec.image,
                content_blocks: sec.content_blocks,
            });
        }
        if (!orderSeen.includes(id))
            orderSeen.push(id);
    }
    return { orderedIds: orderSeen, bestById };
}
/** Check if a label is just a page reference like "Page 1", "Page 10", etc. */
function isPageLabel(label) {
    if (!label)
        return false;
    return /^Page\s+\d+$/i.test(label.trim());
}
/** Section display title: prefer title if meaningful, then display_title, then label, then id. */
function sectionDisplayTitle(sec) {
    // Prefer actual title if it's meaningful (not empty, not just matching id)
    const title = (sec.title ?? '').trim();
    const id = (sec.id ?? '').trim();
    if (title && title !== id && !isPageLabel(title)) {
        return title.replace(/\s*[.\s]+\d+-\d+\s*$/, '').trim();
    }
    if (sec.source_ref?.display_title)
        return sec.source_ref.display_title;
    // Only use source_ref.label if title is empty or is just a page reference
    if (sec.source_ref?.label && !isPageLabel(sec.source_ref.label))
        return sec.source_ref.label;
    if (title)
        return title;
    return id;
}
/** Short label for TOC tree: one consistent format. CFR: §207.6 Title; others: title or id. */
const TOC_LABEL_MAX = 52;
function sectionTocLabel(sec, id) {
    const title = (sec.title ?? '').trim();
    const src = sec.source_ref;
    // CFR-style section id (e.g. 207_6, 218_99): show §207.6 Short title
    const cfrSectionMatch = /^(\d+)_(\d+)$/.exec((id ?? '').trim());
    if (cfrSectionMatch) {
        const shortTitle = title.replace(/^§+\s*[\d.]+\s*/i, '').trim() || title;
        const num = `${cfrSectionMatch[1]}.${cfrSectionMatch[2]}`;
        const line = `§${num} ${shortTitle}`;
        return line.length <= TOC_LABEL_MAX ? line : line.slice(0, TOC_LABEL_MAX - 1) + '…';
    }
    // Part/subpart (e.g. part207_subpart_1_...): show Part 207 — Title
    if ((id ?? '').startsWith('part') && (id ?? '').includes('_subpart_')) {
        const cleaned = title.replace(/\s*[.\s]+\d+-\d+\s*$/, '').trim() || title;
        return cleaned.length <= TOC_LABEL_MAX ? cleaned : cleaned.slice(0, TOC_LABEL_MAX - 1) + '…';
    }
    if (title && title !== id && !isPageLabel(title)) {
        const cleaned = title.replace(/\s*[.\s]+\d+-\d+\s*$/, '').replace(/^\d+\s+[A-Z][^|]*\|\s*/, '').trim() || title;
        return cleaned.length <= TOC_LABEL_MAX ? cleaned : cleaned.slice(0, TOC_LABEL_MAX - 1) + '…';
    }
    if (src?.label)
        return src.label.length <= TOC_LABEL_MAX ? src.label : src.label.slice(0, TOC_LABEL_MAX - 1) + '…';
    return (id ?? '').length <= TOC_LABEL_MAX ? (id ?? '') : (id ?? '').slice(0, TOC_LABEL_MAX - 1) + '…';
}
/** Parent id for tree: drop last dot-segment (e.g. "9.9.1" -> "9.9", "1.0" -> "1"). */
function parentId(id) {
    return id.split('.').slice(0, -1).join('.');
}
/**
 * Build file-tree style TOC for any document:
 * - Dot-separated ids (1.0, 1.1, 9.9.1) get synthetic parents (1, 9, 9.9) so chapters expand.
 * - Flat ids (e.g. timetable page ids) stay as a flat list of roots.
 * Top-level synthetic nodes get the first child's title when available (e.g. "1" → "General Responsibilities").
 */
function buildSectionTree(orderedIds, bestById) {
    const nodeMap = new Map();
    const realIds = new Set(orderedIds);
    for (const id of orderedIds) {
        const sec = bestById.get(id);
        const title = sec ? sectionTocLabel(sec, id) : id;
        nodeMap.set(id, { id, title, children: [] });
    }
    // Synthetic parents so "1.0", "1.1" sit under "1"; "9.9.1" under "9" and "9.9".
    for (const id of orderedIds) {
        let pid = parentId(id);
        while (pid) {
            if (!nodeMap.has(pid)) {
                nodeMap.set(pid, { id: pid, title: pid, children: [] });
            }
            pid = parentId(pid);
        }
    }
    for (const id of orderedIds) {
        const node = nodeMap.get(id);
        const sec = bestById.get(id);
        // Prefer explicit parent_id (e.g. CFR subpart → sections) so hierarchy matches document
        const pid = (sec?.parent_id && nodeMap.has(sec.parent_id)) ? sec.parent_id : parentId(id);
        if (pid && nodeMap.has(pid)) {
            nodeMap.get(pid).children.push(node);
        }
    }
    // Natural sort helper: extract numbers from IDs for proper numeric ordering
    const extractNumbers = (s) => {
        const matches = s.match(/\d+/g);
        return matches ? matches.map(Number) : [];
    };
    const naturalCompare = (a, b) => {
        const an = Number(a);
        const bn = Number(b);
        if (!Number.isNaN(an) && !Number.isNaN(bn))
            return an - bn;
        // Use section order if available
        const secA = bestById.get(a);
        const secB = bestById.get(b);
        if (secA?.order != null && secB?.order != null && secA.order !== secB.order) {
            return secA.order - secB.order;
        }
        // Natural sort: compare embedded numbers
        const numsA = extractNumbers(a);
        const numsB = extractNumbers(b);
        for (let i = 0; i < Math.min(numsA.length, numsB.length); i++) {
            if (numsA[i] !== numsB[i])
                return numsA[i] - numsB[i];
        }
        if (numsA.length !== numsB.length)
            return numsA.length - numsB.length;
        return String(a).localeCompare(String(b));
    };
    // Sort children of each node for proper display order
    for (const [, node] of nodeMap) {
        if (node.children.length > 1) {
            node.children.sort((a, b) => naturalCompare(a.id, b.id));
        }
    }
    // Give synthetic nodes (no real section) the first child's title so top-level shows "1 General Responsibilities" etc.
    for (const [id, node] of nodeMap) {
        if (!realIds.has(id) && node.children.length > 0) {
            node.title = node.children[0].title;
        }
    }
    // Roots = real sections with no parent in tree, plus synthetic nodes (e.g. "1" for "1.0"/"1.1") with no parent
    const rootIdsFromOrdered = orderedIds.filter((id) => {
        const sec = bestById.get(id);
        const pid = (sec?.parent_id && nodeMap.has(sec.parent_id)) ? sec.parent_id : parentId(id);
        return !pid || !nodeMap.has(pid);
    });
    const syntheticRoots = [...nodeMap.keys()].filter((id) => !realIds.has(id) && (!parentId(id) || !nodeMap.has(parentId(id))));
    const rootIds = [...new Set([...rootIdsFromOrdered, ...syntheticRoots])];
    rootIds.sort(naturalCompare);
    return rootIds.map((r) => nodeMap.get(r)).filter(Boolean);
}
/**
 * Mount document browser: document dropdown, table-of-contents tree (left), read panel (right).
 * If options.docSelect is provided, it is used and populated; no separate doc row is created.
 */
export function mountDocBrowser(container, options) {
    const state = getReferenceState();
    const evidenceIds = state ? Array.from(state.snapshots.keys()) : [];
    const wrap = document.createElement('div');
    wrap.className = 'rr-doc-browser';
    wrap.setAttribute('aria-label', 'Browse documents');
    wrap.style.cssText = 'display:flex;flex-direction:column;min-height:0;flex:1;';
    let docSelect;
    if (options?.docSelect) {
        docSelect = options.docSelect;
        docSelect.innerHTML = '';
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = BROWSE_PLACEHOLDER;
        docSelect.appendChild(placeholderOpt);
        evidenceIds.forEach((id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = getDocumentDisplayTitle(state, id);
            docSelect.appendChild(opt);
        });
    }
    else {
        const docRow = document.createElement('div');
        docRow.className = 'rr-doc-toolbar';
        docRow.style.cssText = 'margin-bottom:1rem;display:flex;flex-wrap:wrap;align-items:center;gap:0.75rem;';
        docSelect = document.createElement('select');
        docSelect.setAttribute('aria-label', 'Select document');
        docSelect.className = 'rr-doc-select';
        docSelect.style.cssText =
            'padding:0.5rem 0.875rem;min-height:44px;border-radius:8px;font-size:0.9375rem;background:var(--bg-tertiary);color:var(--text-primary);border:1px solid var(--border-subtle);width:100%;max-width:22rem;appearance:auto;cursor:pointer;font-weight:500;';
        const placeholderOpt = document.createElement('option');
        placeholderOpt.value = '';
        placeholderOpt.textContent = BROWSE_PLACEHOLDER;
        docSelect.appendChild(placeholderOpt);
        evidenceIds.forEach((id) => {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = getDocumentDisplayTitle(state, id);
            docSelect.appendChild(opt);
        });
        docRow.appendChild(docSelect);
        wrap.appendChild(docRow);
    }
    const browseLayout = document.createElement('div');
    browseLayout.className = 'rr-doc-browse-layout';
    // columns live in the stylesheet, NOT inline -- an inline
    // grid-template-columns beat the phone media query and squeezed the
    // rules text into a 15-character sliver (operator, 2026-08-30)
    browseLayout.style.cssText =
        'display:grid;gap:1rem;min-height:0;flex:1;align-items:stretch;overflow:hidden;';
    browseLayout.setAttribute('aria-label', 'Sections and reader');
    const layoutStyle = document.createElement('style');
    layoutStyle.textContent = `
    .rr-doc-browse-layout { grid-template-columns: minmax(200px,1fr) minmax(0,2fr); }
    @media (max-width: 640px) {
      .rr-doc-browse-layout { grid-template-columns: 1fr; }
      .rr-doc-toc-column { min-height: 0; max-height: 14rem; overflow-y: auto; }
      .rr-doc-reader { min-height: 20rem; }
    }
    .rr-doc-reader { overflow-y: auto; }
    .rr-doc-reader [data-section-id] { min-height: 0; }
    .rr-doc-reader .rr-doc-section-header {
      position: sticky; top: 0; z-index: 1;
      background: var(--bg-secondary);
      padding-bottom: 0.75rem; margin-bottom: 1rem;
      border-bottom: 1px solid var(--border-subtle);
      box-shadow: 0 1px 0 var(--border-subtle);
    }
  `;
    wrap.appendChild(layoutStyle);
    const tocColumnWrap = document.createElement('div');
    tocColumnWrap.className = 'rr-doc-toc-column';
    tocColumnWrap.style.cssText = 'display:flex;flex-direction:column;min-width:0;overflow:hidden;';
    const tocHeading = document.createElement('h3');
    tocHeading.style.cssText = 'margin:0 0 0.5rem;font-size:0.875rem;font-weight:600;color:var(--text-secondary);';
    tocHeading.textContent = 'Contents';
    const sectionListEl = document.createElement('div');
    sectionListEl.className = 'rr-doc-sections rr-doc-tree';
    sectionListEl.setAttribute('role', 'tree');
    sectionListEl.setAttribute('aria-label', 'Table of contents');
    sectionListEl.style.cssText =
        'flex:1;min-height:0;overflow-y:auto;background:var(--bg-secondary);border-radius:6px;padding:0.6rem;border:1px solid var(--border-subtle);';
    const treeStyle = document.createElement('style');
    treeStyle.textContent = `
    .rr-doc-tree .rr-doc-tree-row { display:flex;align-items:center;gap:0.25rem;min-height:2rem; }
    .rr-doc-tree .rr-doc-tree-item { flex:1;min-width:0;display:block;padding:0.35rem 0.5rem;margin:0;border-radius:4px;cursor:pointer;border:none;background:transparent;color:var(--text-secondary);font-size:0.8125rem;font-weight:400;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
    .rr-doc-tree .rr-doc-tree-item:hover { background:var(--hover-bg);color:var(--text-primary); }
    .rr-doc-tree .rr-doc-tree-item[aria-current="true"] { background:var(--hover-bg);color:var(--link-color);font-weight:500; }
    .rr-doc-tree .rr-doc-tree-toggle { flex-shrink:0;width:1.25rem;height:1.25rem;padding:0;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:0.65rem;line-height:1;display:flex;align-items:center;justify-content:center; }
    .rr-doc-tree .rr-doc-tree-toggle:hover { color:var(--text-primary); }
    .rr-doc-tree .rr-doc-tree-children { margin-left:0.75rem;border-left:1px solid var(--border-subtle);padding-left:0.35rem; }
    .rr-doc-tree .rr-doc-tree-children[hidden] { display:none; }
  `;
    wrap.appendChild(treeStyle);
    const readPanelEl = document.createElement('div');
    readPanelEl.className = 'rr-doc-reader';
    readPanelEl.setAttribute('role', 'article');
    readPanelEl.setAttribute('aria-label', 'Section content');
    readPanelEl.style.cssText =
        'padding:1rem;background:var(--bg-secondary);border-radius:6px;min-height:0;flex:1;overflow-y:auto;white-space:pre-wrap;word-break:break-word;font-size:1rem;color:var(--text-primary);line-height:1.6;';
    tocColumnWrap.appendChild(tocHeading);
    tocColumnWrap.appendChild(sectionListEl);
    browseLayout.appendChild(tocColumnWrap);
    browseLayout.appendChild(readPanelEl);
    wrap.appendChild(browseLayout);
    let selectedButton = null;
    function renderSectionBody(sec) {
        // Prefer content_blocks: timetables show images first, text in collapsible "Show searchable text"
        const blocks = sec.content_blocks;
        if (blocks?.length) {
            const hasImageBlocks = blocks.some((b) => b.type === 'image');
            let html = '';
            let textBlocksHtml = '';
            for (const block of blocks) {
                if (block.type === 'image') {
                    const dataUri = `data:image/${block.format};base64,${block.data}`;
                    const pageLabel = block.page != null ? ` (Page ${block.page})` : '';
                    html += `<div class="rr-content-block rr-content-block-image" style="margin-bottom:1rem;">
            ${block.page != null ? `<div style="font-size:0.75rem;color:var(--text-muted);margin-bottom:0.25rem;">Page ${block.page}</div>` : ''}
            <img src="${dataUri}" alt="${escapeHtml(sectionDisplayTitle(sec))}${pageLabel}"
              style="max-width:100%;height:auto;border:1px solid var(--border-subtle);border-radius:4px;background:white;" />
          </div>`;
                }
                else {
                    const text = (block.text ?? '').trim();
                    if (text) {
                        const blockHtml = `<div class="rr-content-block rr-content-block-text" style="margin-bottom:1rem;color:var(--text-primary);font-size:0.9375rem;line-height:1.6;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
                        if (hasImageBlocks) {
                            textBlocksHtml += blockHtml;
                        }
                        else {
                            html += blockHtml;
                        }
                    }
                }
            }
            if (hasImageBlocks && textBlocksHtml) {
                html += `<details class="rr-doc-timetable-text" style="margin-top:1rem;"><summary style="cursor:pointer;color:var(--text-secondary);font-size:0.9375rem;">Show searchable text</summary><div style="margin-top:0.5rem;">${textBlocksHtml}</div></details>`;
            }
            return html;
        }
        // Fallback: single image (legacy)
        const image = sec.image;
        if (image?.data) {
            const dataUri = `data:image/${image.format};base64,${image.data}`;
            let html = `<div style="margin-bottom:1rem;">
        <img src="${dataUri}" alt="${escapeHtml(sectionDisplayTitle(sec))} table"
          style="max-width:100%;height:auto;border:1px solid var(--border-subtle);border-radius:4px;background:white;" />
      </div>`;
            const text = (sec.text ?? '').trim();
            if (text) {
                html += `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border-subtle);color:var(--text-primary);font-size:0.9375rem;line-height:1.6;white-space:pre-wrap;">${escapeHtml(text)}</div>`;
            }
            return html;
        }
        const rows = sec.table?.rows;
        if (rows?.length) {
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
            return `<div style="overflow-x:auto;"><pre style="font-family:ui-monospace,monospace;white-space:pre;margin:0;font-size:0.9375rem;">${escapeHtml(lines.join('\n'))}</pre></div>`;
        }
        const text = (sec.text ?? '').trim();
        if (text) {
            return `<div style="color:var(--text-primary);font-size:1rem;line-height:1.6;">${escapeHtml(text)}</div>`;
        }
        const fallbackTitle = sectionDisplayTitle(sec);
        return `<p style="color:var(--text-primary);font-size:1rem;margin:0 0 0.5rem;font-weight:600;">${escapeHtml(fallbackTitle)}</p><p style="color:var(--text-muted);font-size:0.9375rem;margin:0;">This section has no additional text in the reference bundle. See the full document for details.</p>`;
    }
    /** Build full HTML for one section (header + body + optional child list). Used for full-document lineup. */
    function buildSectionHtml(sec, orderedIds, bestById) {
        const primaryTitle = sectionDisplayTitle(sec);
        const subLabel = sec.source_ref?.label && sec.source_ref.display_title ? sec.source_ref.label : '';
        let bodyContent = renderSectionBody(sec);
        const textTrim = (sec.text ?? '').trim();
        const hasNoContent = !textTrim && !(sec.table?.rows?.length);
        const childIds = orderedIds.filter((id) => bestById.get(id)?.parent_id === sec.id);
        const minimalContent = textTrim.length < 100 && childIds.length > 0;
        const showChildList = hasNoContent || minimalContent;
        if (showChildList && childIds.length > 0) {
            const subItems = childIds
                .slice(0, 50)
                .map((id) => {
                const s = bestById.get(id);
                const label = s ? sectionDisplayTitle(s) : id;
                return `<li style="margin:0.25rem 0;"><button type="button" class="rr-doc-subsection-link" data-section-id="${escapeHtml(id)}" style="padding:0;border:none;background:transparent;color:var(--link-color);font-size:0.9375rem;cursor:pointer;text-align:left;text-decoration:underline;">${escapeHtml(label.length > 60 ? label.slice(0, 60) + '…' : label)}</button></li>`;
            })
                .join('');
            const heading = minimalContent ? 'Sections in this subpart' : 'Subsections in this chapter';
            bodyContent += `<div class="rr-doc-subsections" style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--border-subtle);"><p style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600;color:var(--text-secondary);">${escapeHtml(heading)}</p><p style="margin:0 0 0.5rem;font-size:0.8125rem;color:var(--text-muted);">Select a section below for full text.</p><ul style="margin:0;padding-left:1.25rem;list-style:disc;">${subItems}</ul></div>`;
        }
        else if (hasNoContent) {
            const parent = parentId(String(sec.id ?? ''));
            const siblingIds = parent
                ? orderedIds.filter((id) => parentId(id) === parent && id !== sec.id).slice(0, 20)
                : [];
            if (siblingIds.length > 0) {
                const subItems = siblingIds
                    .map((id) => {
                    const s = bestById.get(id);
                    const label = s ? sectionDisplayTitle(s) : id;
                    return `<li style="margin:0.25rem 0;"><button type="button" class="rr-doc-subsection-link" data-section-id="${escapeHtml(id)}" style="padding:0;border:none;background:transparent;color:var(--link-color);font-size:0.9375rem;cursor:pointer;text-align:left;text-decoration:underline;">${escapeHtml(id)} ${escapeHtml(label.length > 55 ? label.slice(0, 55) + '…' : label)}</button></li>`;
                })
                    .join('');
                bodyContent += `<div class="rr-doc-subsections" style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid var(--border-subtle);"><p style="margin:0 0 0.5rem;font-size:0.875rem;font-weight:600;color:var(--text-secondary);">Subsections in this chapter</p><ul style="margin:0;padding-left:1.25rem;list-style:disc;">${subItems}</ul></div>`;
            }
        }
        return `
      <header class="rr-doc-section-header">
        <div style="font-weight:600;font-size:1rem;color:var(--railcore-steel);">${escapeHtml(String(sec.id ?? ''))}</div>
        <div style="font-size:1.0625rem;color:var(--text-primary);margin-top:0.25rem;">${escapeHtml(primaryTitle)}</div>
        ${subLabel ? `<div style="font-size:0.875em;color:var(--text-muted);margin-top:0.15rem;">${escapeHtml(subLabel)}</div>` : ''}
      </header>
      ${bodyContent}
    `;
    }
    function showSection(evidenceId, sectionId) {
        if (selectedButton) {
            selectedButton.style.background = 'transparent';
            selectedButton.style.color = 'var(--text-secondary)';
            selectedButton.setAttribute('aria-current', 'false');
        }
        const buttons = sectionListEl.querySelectorAll('button[data-section-id]');
        const btn = Array.from(buttons).find((b) => b.getAttribute('data-section-id') === sectionId);
        if (btn) {
            selectedButton = btn;
            selectedButton.style.background = 'var(--hover-bg)';
            selectedButton.style.color = 'var(--link-color)';
            selectedButton.setAttribute('aria-current', 'true');
        }
        const targetEl = readPanelEl.querySelector(`[data-section-id="${CSS.escape(sectionId)}"]`);
        if (targetEl) {
            targetEl.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
    }
    readPanelEl.addEventListener('click', (e) => {
        const t = e.target.closest('button[data-section-id]');
        if (!t)
            return;
        e.preventDefault();
        const id = t.getAttribute('data-section-id');
        if (id && docSelect.value)
            showSection(docSelect.value, id);
    });
    function renderSections() {
        const evidenceId = docSelect.value || null;
        sectionListEl.innerHTML = '';
        selectedButton = null;
        readPanelEl.innerHTML =
            '<p style="margin:0;color:var(--text-muted);font-size:1rem;">Select a document, then choose a section from the table of contents.</p>';
        if (!evidenceId || !state) {
            sectionListEl.innerHTML = '<p style="margin:0;color:var(--text-muted);font-size:0.875rem;">Select a document above to see contents.</p>';
            return;
        }
        const snapshot = state.snapshots.get(evidenceId);
        if (!snapshot?.sections?.length) {
            sectionListEl.innerHTML = '<p style="margin:0;color:var(--text-muted);font-size:0.9375rem;">No sections in this document.</p>';
            return;
        }
        const docId = evidenceId;
        const { orderedIds, bestById } = buildBestSectionsById(snapshot);
        // Right panel: full document (subdivision lineup) so TOC click can scroll to section
        readPanelEl.innerHTML = '';
        for (const sid of orderedIds) {
            const sec = bestById.get(sid);
            if (!sec)
                continue;
            const sectionEl = document.createElement('section');
            sectionEl.setAttribute('data-section-id', sid);
            sectionEl.style.cssText = 'margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border-subtle);';
            sectionEl.innerHTML = buildSectionHtml(sec, orderedIds, bestById);
            readPanelEl.appendChild(sectionEl);
        }
        const roots = buildSectionTree(orderedIds, bestById);
        const expandMap = new Map();
        function appendNode(node) {
            const hasChildren = node.children.length > 0;
            const row = document.createElement('div');
            row.className = 'rr-doc-tree-row';
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.className = 'rr-doc-tree-toggle';
            toggle.setAttribute('aria-label', hasChildren ? 'Collapse section' : '');
            toggle.textContent = hasChildren ? '▼' : ' ';
            if (!hasChildren)
                toggle.style.visibility = 'hidden';
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'rr-doc-tree-item';
            item.setAttribute('data-section-id', node.id);
            item.setAttribute('title', node.title);
            item.setAttribute('aria-label', `Read: ${node.title}`);
            item.textContent = node.title;
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                showSection(docId, node.id);
            });
            row.appendChild(toggle);
            row.appendChild(item);
            sectionListEl.appendChild(row);
            if (hasChildren) {
                const childrenWrap = document.createElement('div');
                childrenWrap.className = 'rr-doc-tree-children';
                childrenWrap.setAttribute('role', 'group');
                for (const child of node.children) {
                    appendNode(child);
                }
                while (sectionListEl.lastElementChild && sectionListEl.lastElementChild !== row) {
                    const el = sectionListEl.lastElementChild;
                    sectionListEl.removeChild(el);
                    childrenWrap.insertBefore(el, childrenWrap.firstChild);
                }
                sectionListEl.appendChild(childrenWrap);
                expandMap.set(node.id, { childrenWrap, toggle });
                let expanded = false;
                childrenWrap.hidden = true;
                toggle.textContent = '▶';
                toggle.setAttribute('aria-label', 'Expand section');
                toggle.style.visibility = 'visible';
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    expanded = !expanded;
                    childrenWrap.hidden = !expanded;
                    toggle.textContent = expanded ? '▼' : '▶';
                    toggle.setAttribute('aria-label', expanded ? 'Collapse section' : 'Expand section');
                });
            }
        }
        for (const root of roots) {
            appendNode(root);
        }
    }
    docSelect.addEventListener('change', renderSections);
    container.appendChild(wrap);
    renderSections();
}
//# sourceMappingURL=DocBrowser.js.map