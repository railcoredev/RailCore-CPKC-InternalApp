/**
 * Human-readable labels for evidence IDs (fallback when meta.title is missing).
 * Used in document dropdowns and search result headers.
 */
const FALLBACK_LABELS = {
    gcor: 'GCOR',
    gcor_9th_edition_final_09022025: 'GCOR (9th Edition)',
    fra: 'FRA Regulations',
    hazmat: 'Hazmat',
    us_hmi_cpkc_7152024: 'CPKC Hazmat Instructions',
    stb: 'STB',
    timetable: 'Timetable',
    cpkc_us_eastern_region_timetable_no_1_final_6132024: 'US Eastern Region Timetable',
    cpkc_us_southern_region_timetable_no_1__final_6132024: 'US Southern Region Timetable',
    '2023gkcoi2': 'Greater KC Operating Instructions',
    ssi: 'SSI',
    cpkc_system_special_instructions_no_1_updated_632025: 'System Special Instructions',
    safety_manuals: 'Safety Manuals',
    cpkc_te_safety_rule_book_april_2023: 'TE Safety Rule Book',
    abth: 'Air Brake & Train Handling',
    air_brake_and_train_handling: 'Air Brake & Train Handling',
    cpkc_instructions_for_remote_control_operation: 'Remote Control Operation',
    efficiency_testing: 'Efficiency Testing',
    train_dispatching: 'Train Dispatching',
    general_order_a: 'General Order A',
    general_order_f: 'General Order F',
    system_bulletins: 'System Bulletins',
    gm_notices_us_east: 'GM Notices (US East)',
    '2024_emergency_response_guidebook': 'Emergency Response Guidebook',
    '2025_bensenville_notices': 'Bensenville Superintendent Notices',
    '2025_quad_cities_notices': 'Quad Cities Superintendent Notices',
    fra_cfr: 'FRA Regulations (49 CFR)',
};
/**
 * Display title for a document: meta.title, then fallback label, then raw id.
 */
export function getDocumentDisplayTitle(state, evidenceId) {
    const snapshot = state?.snapshots.get(evidenceId);
    const metaTitle = snapshot?.meta?.title?.trim();
    if (metaTitle)
        return metaTitle;
    const lower = evidenceId.toLowerCase();
    return FALLBACK_LABELS[lower] ?? FALLBACK_LABELS[evidenceId] ?? evidenceId;
}
//# sourceMappingURL=docLabels.js.map