# RailCore App — Issues & Improvements Log

Living log for the one-app effort. Truthful data first; navigation/UX second;
everything else after. Update this instead of scattering notes.
(Started 2026-08-17 by Claude, per Aaron's request.)

## Principles (Aaron, 2026-08-17)
- ONE app: a portal front door; sections stay separate entities but meshed.
- Truthful data outranks UX; UX outranks everything else.
- Every data view must show its age/provenance ("verify before use" for
  reference material; capture age for live data).
- Sources will feed multiple consumers (Document Inspector, ref cards, future
  rules Q&A) — organize sources once, consume many times.

## Known issues / risks
| # | Area | Issue | Status |
|---|------|-------|--------|
| 1 | Lineups feed | Data frozen at 2026-08-05 — scheduler stopped; needs relaunch + RSA. Feed auto-updates every ~5 min once running. | OPEN (operator) |
| 2 | Crossings | FRA records keep branch/spur MPs verbatim (CheatSheets no-inference policy), so spacing pairs across branches show nonsense gaps (e.g. 838,147 ft). Fix = group by branch in DISPLAY only. | OPEN |
| 3 | Card generator | The DOCX card generator (render_card.js) in the CheatSheets program is UNTESTED by the operator. The app consumes the card JSON directly, so app correctness does not depend on it — but "print the cheat sheet" from the generator is unverified. | OPEN |
| 4 | Yards | Track Lengths still shows placeholder Bensenville data (2 tracks). Real yard-track data needs a source. | OPEN |
| 5 | Names | Crew names published as initials (public Pages). Full names need private hosting (token/API). | BY DESIGN for now |
| 6 | Ref cards | Only 5 subs + Elgin index have cards; catalog recognizes 59 subdivisions. Elgin index card not yet reachable in the app UI. | OPEN |
| 7 | Processor | Collection watchdog missing: scheduler death is silent (died 08-05, unnoticed 12 days). Dead-man alert recommended. | OPEN |
| 9 | Processor | Timed slots get marked done-for-the-day even when they FAIL and capture nothing (08-17: five empty slot runs all marked done). Should only mark done on success. | OPEN |
| 8 | Backup | snapshots/ + railops.db (the unregenerable truth) have no automated offsite backup. | OPEN (high value) |

## Open questions for the operator (rules the program will NOT guess)
- Runaround calling rules: the detector flags CANDIDATES only. Today's set:
  the two claimed events (180-16 @ 0815 → SW04, 781-14 @ 0900 → MU08) plus
  three same-pattern afternoon events (280-16 @ 1145 → SW03, 253-15 @ 1201
  → SW05, 261-18 @ 1300 → MU03). Are the afternoon ones also runarounds?
  If not, what distinguishes them (pool protects its own trains? extraboard
  only fills vacancies? rest rules?) — each answer becomes an encoded rule
  and makes the detector smarter. This is also the seed of the rules-Q&A
  engine: the governing agreement text should back every rule.

## Fixed
- 2026-08-17 (pm): **History-sweep gap after outages** (operator caught it):
  start date was always now-minus-lookback with no check of when history
  last actually ran, and the last-run anchor was never read back from the
  state file on restart — the 12-day outage left Aug 6–14 unrequested.
  Fixed: gap-aware anchoring (extends the window back to the last successful
  sweep, capped at 14 days, one-day overlap; dedup makes overlap free) +
  anchor persisted across restarts. Backfill of Aug 4–17 run via the new
  mechanism itself.
- 2026-08-17 (pm): **District-prompt recovery typed into the wrong fields.**
  Operator video caught it: on the E083 invalid-dist variant of the PSTS02
  DISTRICT/SUB-DISTRICT prompt the cursor parks in SELECTION, not DISTRICT,
  so recovery's "8I/OT" landed in the wrong boxes ~50 straight times. The
  wedge killed the history sweep and left FIVE overdue timed slots
  (seniority, truth audit, finance x2, vacation) capturing NOTHING — empty
  run dirs, no error to the operator ("proceeds without extracting"). Fix:
  Home keystroke (keylog-verified mapping) forces the cursor to DISTRICT
  before typing (navigator.py answer_district_prompt). Video → frames →
  cross-check-against-parsed-data workflow found it; keep using that.
- 2026-08-17: SW v38 install silently failed (CORE_ASSETS listed 4 missing
  files) → app updates never applied. Fixed in v3.9.0.
- 2026-08-17: railcore_snapshot.json was invalid JSON (JS comments) → app ran
  on inline fallback data for months. Fixed; now generated from reviewed data.
- 2026-08-17: mojibake (UTF-8-as-cp1252) in card strings repaired at export.

## Claims lifecycle roadmap (Aaron, 2026-08-17 evening)
1. ✅ Alert cards: tap for details, "I filed a claim"/"Dismiss", auto-retire
   when the captured timeslips show a matching RA claim.
2. Claim OUTCOME tracking from the finance page: WAIT APP → APP-TRND
   (paid) or denied — with the wrinkle that a DENIED claim is sometimes
   PAID ON ANOTHER LINE (match by date/amount across lines before calling
   anything unpaid). Needs a claim-lineage model over
   personal_timeslip_claims.
3. Submit-claim button that prefills the miscellaneous-claim entry screen —
   BLOCKED until that screen is scanned/mapped (not yet captured).

## Roadmap (Aaron's direction, 2026-08-17)
1. ✅ Portal home + sections (v4.0.0): My Train quick-find, Lineups, Boards,
   Ref Cards, Crossings, Sidings, Track Lengths.
2. Resume live data (scheduler + RSA) → 5-min freshness end to end.
3. Reliability trio: offsite backup of truth stores; dead-man alert to phone;
   RSA remote-approve flow for 24/7 operation.
4. Reports & printing: generate/print reports from the processor; print
   cheat-sheet cards (validate the card generator first — see issue #3).
5. Source library organization: one place for source documents, versioned,
   eventually auto-downloaded and freshness-checked; document supersession
   rules (which order/timetable/GO overrides which) formalized — the
   CheatSheets compiler already models timetable-vs-F/A-order precedence;
   extend that, don't reinvent.
6. Documents section in the app: browse/reference source documents.
7. Rules Q&A with citations (rules, regulations, union agreements): answers
   must quote and link the governing text — same honesty bar as everything
   else. Needs the source library (5) first.
8. Multi-user / private hosting: authenticated API (the E6 FRA
   data-platform pattern), full names, per-user personal data.

## Decisions log
- 2026-08-17: One app = RailCore-CPKC-InternalApp; feeds live in this repo's
  docs/data/; GitHub Pages = free middleman for single-user phase.
- 2026-08-17: names_mode=initials until private hosting exists.
- 2026-08-17: DataHyperstore-Test repo stays frozen (E6); do not publish
  new data there.
