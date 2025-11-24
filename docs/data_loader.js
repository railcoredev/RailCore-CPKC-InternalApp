// data_loader.js — RailCore CPKC Worker App v3.8
// Expanded stub data for KS/MO/IA/IL, with sample KC Sub crossings/sidings/yards/tracks.

async function loadRailCoreData() {
  // In future, this can fetch live FRA/Hyperstore JSON or CSV.
  // For now we return a static object that app.js uses.

  return {
    states: [
      { code: "KS", name: "Kansas" },
      { code: "MO", name: "Missouri" },
      { code: "IA", name: "Iowa" },
      { code: "IL", name: "Illinois" }
    ],

    subdivisions: [
      {
        code: "KC_SUB_CPKC",
        name: "Kansas City Sub — CPKC",
        stateCodes: ["KS", "MO"]
      },
      {
        code: "OTT_SUB_CPKC",
        name: "Ottumwa Sub — CPKC",
        stateCodes: ["IA", "IL"]
      },
      {
        code: "DAV_SUB_CPKC",
        name: "Davenport Sub — CPKC",
        stateCodes: ["IA", "IL"]
      },
      {
        code: "CHI_SUB_CPKC",
        name: "Chicago Sub — CPKC",
        stateCodes: ["IL"]
      }
    ],

    yards: [
      {
        code: "KCY",
        name: "Kansas City Yard",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS"
      },
      {
        code: "OTTY",
        name: "Ottumwa Yard",
        subdivisionCode: "OTT_SUB_CPKC",
        stateCode: "IA"
      },
      {
        code: "DVPY",
        name: "Davenport Yard",
        subdivisionCode: "DAV_SUB_CPKC",
        stateCode: "IA"
      },
      {
        code: "CHIY",
        name: "Chicago Yard",
        subdivisionCode: "CHI_SUB_CPKC",
        stateCode: "IL"
      }
    ],

    // Sample Kansas City Sub crossings
    crossings: [
      {
        id: "KCX1",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS",
        mp: 8.5,
        roadMain: "KANSAS AVE",
        roadDetail: "Kansas Ave",
        protection: "GATES",
        dot: "079123A",
        distanceToNextFt: 7920
      },
      {
        id: "KCX2",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS",
        mp: 10.1,
        roadMain: "TURLEY RD",
        roadDetail: "Turley Rd",
        protection: "FLASHERS",
        dot: "079456B",
        distanceToNextFt: 13728
      },
      {
        id: "KCX3",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS",
        mp: 12.7,
        roadMain: "155TH ST",
        roadDetail: "155th St",
        protection: "GATES",
        dot: "079789C",
        distanceToNextFt: 9024
      },
      {
        id: "KCX4",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS",
        mp: 14.4,
        roadMain: "HOLLIDAY RD",
        roadDetail: "Holliday Rd",
        protection: "GATES",
        dot: "079913D",
        distanceToNextFt: 14784
      },
      {
        id: "KCX5",
        subdivisionCode: "KC_SUB_CPKC",
        stateCode: "KS",
        mp: 17.2,
        roadMain: "KILL CREEK RD",
        roadDetail: "Kill Creek Rd",
        protection: "FLASHERS",
        dot: "079935E"
      }
    ],

    // Sample siding data for KC Sub; others are placeholder stubs
    sidings: [
      {
        subdivisionCode: "KC_SUB_CPKC",
        name: "EDGERTON",
        mpStart: 32.0,
        mpEnd: 34.5,
        lengthFt: 13200,
        sequence: [
          "MP 32.0 (start)",
          "  ...distance to first crossing (ft) — crossing name...",
          "  ...distance to second crossing (ft) — crossing name (if any)...",
          "MP 34.5 (end)"
        ]
      },
      {
        subdivisionCode: "KC_SUB_CPKC",
        name: "OLATHE",
        mpStart: 18.0,
        mpEnd: 20.2,
        lengthFt: 11616,
        sequence: [
          "MP 18.0 (start)",
          "  ...distance / crossing details to be filled in...",
          "MP 20.2 (end)"
        ]
      },
      // Placeholder sidings for other subs
      {
        subdivisionCode: "OTT_SUB_CPKC",
        name: "OTTUMWA SIDING A",
        mpStart: 100.0,
        mpEnd: 102.0,
        lengthFt: 10560,
        sequence: [
          "MP 100.0 (start)",
          "  ...placeholder sequence...",
          "MP 102.0 (end)"
        ]
      },
      {
        subdivisionCode: "DAV_SUB_CPKC",
        name: "DAVENPORT SIDING A",
        mpStart: 200.0,
        mpEnd: 202.4,
        lengthFt: 12672,
        sequence: [
          "MP 200.0 (start)",
          "  ...placeholder sequence...",
          "MP 202.4 (end)"
        ]
      }
    ],

    // Sample track length data keyed by yard
    trackLengths: [
      { yardCode: "KCY", trackName: "Receiving 1", lengthFt: 6500 },
      { yardCode: "KCY", trackName: "Receiving 2", lengthFt: 6400 },
      { yardCode: "KCY", trackName: "Departure 1", lengthFt: 7000 },
      { yardCode: "OTTY", trackName: "Track 1", lengthFt: 5200 },
      { yardCode: "DVPY", trackName: "Track 3", lengthFt: 5800 },
      { yardCode: "CHIY", trackName: "East Departure", lengthFt: 7200 }
    ]
  };
}
