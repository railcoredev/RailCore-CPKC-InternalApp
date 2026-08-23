/**
 * AUTHORITY BOUNDARY
 *
 * This module consumes rr-docs reference outputs.
 * It must never:
 * - Modify evidence
 * - Interpret rules
 * - Resolve conflicts
 * - Infer authority
 *
 * When in doubt:
 * DO LESS. PRESERVE MORE. ASK.
 */
import { getReferenceState } from './applyUpdate.js';
/**
 * Query reference data: keyword search over sections.
 * Returns evidence_id, revision_id, section location, verbatim excerpts.
 * Exposes conflicts; never resolves. "Multiple references found" / "No reference found" when applicable.
 */
export function queryReference(query) {
    const state = getReferenceState();
    const results = [];
    const notes = [];
    if (!state) {
        return { query, results: [], notes: ['No reference found — bundle not loaded.'] };
    }
    const raw = (query ?? '').trim();
    if (!raw) {
        return { query, results: [], notes: [] };
    }
    // Match by words: every significant word must appear (id, title, text, part).
    // Normalize section numbers: "207.6" matches id "207_6"; "207_6" matches title "§207.6".
    const qLower = raw.toLowerCase();
    const qNorm = qLower.replace(/\./g, '_'); // 207.6 -> 207_6 for id match
    const words = qLower.split(/\s+/).filter(Boolean);
    const significantWords = words.filter((w) => w.length > 1 || /\d/.test(w));
    const usePhraseMatch = qLower.length > 1 || /\d/.test(qLower);
    for (const [evidenceId, snapshot] of state.snapshots) {
        const sections = snapshot.sections ?? [];
        for (let i = 0; i < sections.length; i++) {
            const sec = sections[i];
            const idStr = (sec.id ?? '').toLowerCase();
            const idWithDots = idStr.replace(/_/g, '.'); // 207_6 -> 207.6 for query "207.6"
            const title = (sec.title ?? '').toLowerCase();
            const text = (sec.text ?? '').toLowerCase();
            const part = (sec.part ?? '').toLowerCase();
            const combined = `${idStr} ${idWithDots} ${title} ${text} ${part}`;
            const phraseMatch = usePhraseMatch &&
                (combined.includes(qLower) || combined.includes(qNorm));
            const allWordsMatch = significantWords.length > 0 &&
                significantWords.every((w) => combined.includes(w) || combined.includes(w.replace(/\./g, '_')));
            if (!phraseMatch && !allWordsMatch)
                continue;
            const sectionId = sec.id ?? `_${i}`;
            results.push({
                evidence_id: evidenceId,
                revision_id: 'current',
                location: { section_id: sectionId, title: sec.title, part: sec.part },
                excerpt: sec.text ?? sec.title ?? '',
                change_type: null,
                citations: [{ file: `dist/${evidenceId}.json`, revision: 'current', path: sectionId }],
            });
        }
    }
    if (results.length > 1) {
        notes.push('Multiple references found.');
    }
    else if (results.length === 0) {
        notes.push('No reference found.');
    }
    return { query, results, notes };
}
//# sourceMappingURL=query.js.map