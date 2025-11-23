// data_loader.js
// Lightweight in-repo snapshot for RailCore CPKC Worker App v3.7
// Later this will be replaced by the FRA / Hyperstore pipeline.

async function loadRailCoreData() {
    // In the future this could fetch from JSON/CSV:
    // const res = await fetch('data/source.json');
    // return await res.json();

    // For now we return a static object that matches app.js expectations.
    return {
        states: [
            { code: "KS", name: "Kansas" },
            { code: "MO", name: "Missouri" }
        ],

        subdivisions: [
            {
                id: "KC_SUB",
                name: "Kansas City Sub – CPKC",
                stateCodes: ["KS", "MO"],
                emergency: "CPKC Emergency: 1-800-766-7912"
            }
        ],

        // ---------- CROSSINGS ----------
        // NOTE: mileposts approximate, just to demo spacing logic.
        crossings: [
            {
                id: "X1",
                subId: "KC_SUB",
                state: "KS",
                mp: 8.5,
                road: "KANSAS AVE",
                protection: "GATES",
                dot: "079123A"
            },
            {
                id: "X2",
                subId: "KC_SUB",
                state: "KS",
                mp: 10.1,
                road: "TURLEY RD",
                protection: "FLASHERS",
                dot: "079456B"
            },
            {
                id: "X3",
                subId: "KC_SUB",
                state: "KS",
                mp: 12.7,
                road: "155TH ST",
                protection: "GATES",
                dot: "079789C"
            },
            {
                id: "X4",
                subId: "KC_SUB",
                state: "KS",
                mp: 14.4,
                road: "HOLLIDAY RD",
                protection: "GATES",
                dot: "079852D"
            },
            {
                id: "X5",
                subId: "KC_SUB",
                state: "KS",
                mp: 17.2,
                road: "KILL CREEK RD",
                protection: "FLASHERS",
                dot: "079934E"
            },
            {
                id: "X6",
                subId: "KC_SUB",
                state: "KS",
                mp: 19.9,
                road: "CEDAR CREEK RD",
                protection: "GATES",
                dot: "079967F"
            }
        ],

        // ---------- SIDINGS ----------
        // Simple examples spanning some of the crossing territory.
        sidings: [
            {
                id: "S1",
                subId: "KC_SUB",
                name: "BONNER SPRINGS",
                start_mp: 8.0,
                end_mp: 12.0
            },
            {
                id: "S2",
                subId: "KC_SUB",
                name: "DE SOTO",
                start_mp: 12.0,
                end_mp: 18.5
            }
        ],

        // ---------- TRACK LENGTHS ----------
        tracklengths: [
            {
                yard: "KANSAS CITY YARD",
                subId: "KC_SUB",
                track: "1",
                start_mp: 5.0,
                end_mp: 5.4
            },
            {
                yard: "KANSAS CITY YARD",
                subId: "KC_SUB",
                track: "2",
                start_mp: 5.4,
                end_mp: 5.9
            },
            {
                yard: "KANSAS CITY YARD",
                subId: "KC_SUB",
                track: "3",
                start_mp: 5.9,
                end_mp: 6.3
            }
        ]
    };
}
