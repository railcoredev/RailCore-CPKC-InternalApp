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

## V5 REVISION 1 (operator design review of the renderings, 2026-08-18)

Reviewed https://claude.ai/code/artifact/b8f6ed2d-b428-46e4-999d-7d68c893f9ce
More revisions coming; sections not yet discussed proceed on Claude's design.
1. ✅ LOCKED: Home. 2. ✅ LOCKED: Train Lineups.
3. Reference time at page bottom in LOCAL time (Central for now) — UTC
   internal only, everything displayed is local.
4. NEW SCREEN: Train History — lineup-style table w/ crews, rows clickable
   for details, show on-duty + tie-up times where captured.
5. Me-card verbiage: use the RAILROAD'S codes (the mark-off board's own
   codes), and "Return <day time>" instead of "marked back".
6. Bookoff code legend captured from PSTS90 field help (operator screenshot):
   S=Sick P=Personal Leave U=Union Business N=Company Business
   V=Annual Vacation C=Up To Place — grounds laid_off + me-card vocabulary.
7. PL/SD daily allotments captured (Owen R. table): per-terminal daily
   slots — Ottumwa 1/day, Davenport 4/day, Savanna/Mason City/KC 2 Mon-Thu
   1 Fri-Sun, Marquette 2/day. BLET section below fold still wanted.
8. Files received: August days off + Ottumwa Engineer/Conductor AV 2026
   workbooks → extract into scheduled-off data (Time Off + availability).
9. Pay: "Trips" → "STARTS", counted PER HALF (half-month pay period);
   runaround claims count as neither starts nor trips — claims separate.
10. Weekly rows expand on tap → breakdown (starts, claims, meals, etc.).
11. Half totals: gray summary row under each half's weeks (H1/H2 = same
    split the metrics packs use).
12. Guarantee: keep reference line; future expandable guarantee section.
13. ✅ LOCKED: greyed-out marked-off members on boards (now with real codes).
14. Projection board: show BOTH seats — the AE/CO pairing under each
    projected engineer (pool turns already carry both; extraboard pairs
    first-out from the matching board).
15. Auto-update requirement: all views recompute per sweep on any input
    change (already the architecture; vacation/AV data closes the
    "who's off" gap).
16. Document uploads w/ auto-supersession: fresher doc replaces active
    copy, old kept (ties to source-library roadmap).

## V5 ONE-APP UI OVERHAUL (Aaron, 2026-08-18 evening — the big list)

Operator verdict: happy with progress + data, NOT happy with the look.
Directives, in his words: one app ("I just click on the app, I don't care
what it does after that"); columns and rows for ALL data so everything
lines up; sections are their own PAGE (no scrolling down to a panel);
tiles + dropdown menus; zoom + scroll every direction is fine; wants the
program's train-lineup view (inbound crews / outbound crews / time
remaining) replicated in the app for trains AND crews.

1. **One icon**: install the PWA from Chrome (Add to Home Screen) — it is
   already installable w/ OTA updates; retire the portal WebAPK icon.
   Standalone display mode = never looks like a browser.
2. **Page navigation**: tile tap REPLACES the screen with that section as
   its own page (no shared panel to scroll to). Back = home tile grid.
   Dropdown menus for in-page pickers stay.
3. **Tables everywhere**: real <table> rendering with sticky headers,
   horizontal scroll containers, pinch-zoom friendly:
   - Train lineups: DATE/TIME · TRAIN · STATUS · ORD · ENG INBOUND (crew +
     rest-remaining) · ENG OUTBOUND · TRN crew — mirroring the ui_v2
     program view the operator likes (inbound/outbound/time-remaining).
   - Crew boards: POS · TURN · CR · NAME · MTOD · MTPD (+ flags).
   - Pay: trips table (date/train/hours/paid/expected/Δ), weekly table.
   - Ref cards / cheat sheets: column-aligned tables per card section.
   - My Train: current + history as rows.
4. **Feed enrichment**: publish the inbound/outbound crew + rest-remaining
   fields the program view computes (they exist in the API; carry them in
   lineups_snapshot.json) so the app can render the same picture.
5. Keep: whole-page vertical scroll; wide tables scroll horizontally
   inside their own container; freshness/update info at the bottom.
6. After parity: portal modules (Documents, Infrastructure) fold in as
   tiles; portal retired (originals kept per standing rule).

**Projection board display spec (operator, 2026-08-18 evening):** a
crew-board-style table PLUS train ID and projected time columns — "a
projected lineup in addition to what we currently have." Renders two ways:
the full board view, and a one-line "YOUR NEXT: train X, projected ~HH:MM"
strip on the me-card / My Train. Ships only after silent-mode accuracy.

**Bug (program ui_v2 Crew Boards me-card):** underlabeled (the "with ..."
list is BOARDMATES but never says so) and serving stale Aug-5 personal
events with an empty board list; "Projection: pending rules" placeholder
correct by design. Redesign: explicit labels (YOU / Your board / Boardmates
/ Recent), fresh my-status query, projection strip when the engine earns it.

**Two surfaces, one truth (operator, corrected 2026-08-18 evening):**
the LAPTOP PROGRAM stays and gets DEEPER — more settings, the ability to
change things, run reports, manage capture — it is the control room. The
APP is the road view: everything needed away from the laptop, same truth,
same look where it matters (train-lineup view replicated in v4.6.0).
Accessible from both; presentation bugs are the only permitted difference,
and those get fixed. The old portal still folds into the app and retires.

## MASTER LIST (Aaron, 2026-08-18 — consolidated direction)

**A. Layout decision — the web app wins.** Operator: "not a huge fan of the
portal's layout; I like the web page layout better; incorporate everything
together." Architecture: MAIN SCREEN of tiles → some tiles open a SUB-MENU
→ pages; tiles that don't need a sub-menu go straight to their page.
1. Adopt this app (tile home) as THE one app; portal-only capabilities fold
   in as tiles/sub-menus: Documents (pinned bundle browse/search),
   Infrastructure packs, Operations pilot content.
2. Sub-menu tier: e.g. "Reference" tile → Ref Cards / Crossings / Sidings /
   Track Lengths; "Live Ops" tile → My Train / Lineups / Boards; direct
   tiles for My Train (primary), Remote RSA, Notifications.
3. Portal shell retires only after feature parity (originals kept until
   tested — standing rule).

**B-0. Iron Horse Timebook recon (2026-08-18, from the operator's phone —
com.ironhorse.timebook.timebook).** Its main menu is itself a tile grid
(validating the layout decision). Categories → our mapping:
| Iron Horse tile | Our equivalent | State |
|---|---|---|
| Add New Record | auto-captured timeslips (no manual entry needed!) | LIVE |
| Pay Totals | claims amount_cents rollups (pay engine) | data live, UI todo |
| Hour Totals | ticket on/off-duty hours | data live, UI todo |
| Stats | starts/OT/miles summaries | todo |
| Records | trip history (my_status) | LIVE in app |
| Weekly Pay | weekly rollup **vs GEB guarantee $1,732.21 check** | todo |
| Starts | start counts + FRA 6-start countdown | engine live, UI todo |
| Subs Qualified | personal_qualifications table | data live, UI todo |
| Work Notes | per-trip operator notes | new feature |
| Time Off | PL/vacation balances (needs scheduled_off parse fix) | blocked |
| Paychecks | paycheck vs claims reconciliation (catches denied-paid-elsewhere) | todo |
| ADO Matrix | ado_matrix_2026.json | ENCODED + prediction-integrated |
Below-fold tiles (captured 2026-08-18 pm): PTO Days -> PL/PTO balances
(needs scheduled_off parse); Jobs Held -> job_assignments_observations +
7-day-mark bid history; Wages -> pay_rules.json rate reference; Settings.
**Design principle (operator, 2026-08-18): we are NOT copying Iron Horse —
its categories are the taxonomy; OUR system pre-populates them from the
captures so it's not manual entry. Manual entry stays as a correction or
secondary column (some people like typing theirs in): captured value and
operator value are SEPARATE columns, never overwriting each other —
provenance visible, and a captured-vs-operator disagreement is itself a
signal (usually a claim).**

**B. Financial layer — NOT STARTED (operator raised 2026-08-18).**
Iron Horse-style categories + data collection into the app:
1. Study the Iron Horse app's category model (what railroaders track:
   trips, claims, guarantees, mileage/rate classes) — map to our data.
2. Pay rules as data (same rulebook architecture): basic day, RA ½-day,
   called-and-released, held-away meal, guarantee credit/forfeit — every
   rate cited to the agreement.
3. Per-trip earnings from captured timeslips (4×/day finance sweeps);
   trip → expected pay vs actual pay; discrepancy = claim candidate.
4. Claim OUTCOME lineage (existing to-do; WAIT APP → paid/denied/
   paid-on-another-line).
5. Monthly/yearly earnings rollups + charts (depends on the true-data
   baseline / coverage audit below).

**C. Standing queue (unchanged, in priority order):**
1. Vacation timed-slot navigation fix (currently DISABLED — it was killing
   sessions; scheduled_off parsing also dead).
2. Prediction engine: silent grading continues; master projection sheet
   (C11) is the v1 target.
3. Call-change detector (deferred by operator).
4. Full-history reprocess + coverage-gap audit → true-data baseline →
   monthly/yearly comparisons.
5. 7.1.F position bulletin capture; misc-claim screen scan (unblocks
   submit-claim prefill); OT sign-up list source.

## To-do (Aaron, 2026-08-18)
- **Full-history reprocess + coverage audit → true-data baseline**: reprocess
  every snapshot ever captured through the current (better) parsers, then
  audit the timeline for capture gaps — exactly when data was and wasn't
  flowing, per screen type. Output: a coverage map (day × screen-type),
  gap register with causes where known (RSA parks, the Aug 5–17 outage,
  keystroke wedges), and a clean regenerated metrics layer. That becomes the
  "true data" baseline that gets logged and committed properly (replacing
  the uncommitted known-suspect Feb regenerations), and the foundation for
  monthly + yearly comparisons, charting, and trend tracking. Operator: not
  now — queued.
- **Call-change detector**: when a captured call for a watched member changes
  between sweeps (train symbol, craft seat, on-duty time, annulment), push an
  alert through the existing flag→app pipeline — "your 781 is now an 859-088,
  on duty 18:30, CO seat." Ground truth for the need: 2026-08-17 the operator's
  781 call was swapped to 859-088 while collection was parked; the system only
  caught it in the after-the-fact history sweep. Deferred by the operator in
  favor of higher-impact work (he hears changes from the caller anyway).

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

## RailCore Portal (phone app) — user-experience audit 2026-08-17
Walked on the operator's phone via ADB, every tab, as a user.
**Discovery: there are TWO RailCore apps.** The phone runs the Portal shell
("One Portal. Pinned releases." — Documents/Infrastructure/Operations Pilot,
hash-pinned bundles, T3 lineup/board deliberately BLOCKED pending live
data). The lineups/boards/alerts built today live in the OTHER app (this
repo's PWA). Merge decision needed: the Portal's pin/governance shell is
the right home; today's live feed is exactly the T3 data it's waiting for.

| # | Area | Finding | Severity |
|---|------|---------|----------|
| P1 ✅ | Home chips | "app update up to date" next to "fresh stale" reads as a contradiction — operator read stale data as failed app updates. Split APP vs DATA freshness visually (already solved in this repo's PWA). | High |
| P2 | Doc reader | PDF page furniture interleaved (page nos, edition footers), huge blank gaps, hard line-breaks mid-sentence. Section text needs reflow + furniture stripping at bundle build time. | High |
| P3 | Doc reader | No sticky current-section heading; TOC tap lands mid-stream of one continuous doc; scrolling drifts into other sections with no orientation. Operator's top complaint. | High |
| P4 ✅ | Navigation | Top tab bar scrolls away — deep in a doc there is no way out but scrolling to top. Make nav sticky (portal) — note this repo's PWA deliberately scrolls whole-page per operator preference, but IT has short pages; the portal has 100-page docs. | High |
| P5 ✅ | Navigation | System back EXITS the app from deep in a document instead of going up (doc → TOC → tab). Needs history integration. | High |
| P6 ✅ | Infrastructure tab | Styling completely broken: unstyled serif, near-invisible headings, raw label/number list. CSS not loading in the bundle. Crossings sub-tab did not visibly change content. | Critical |
| P7 | Operations tab | Same broken styling. Pool summary STALE since 08-02 (feed died with the E6 freeze / pipeline stop). Honest TTL chips — good bones. | High |
| P8 | Content gap | Document catalog lacks today's sources: union agreements (calling rules!), GM notices, CheatSheets ref cards. C:\CPKC Sources is the pipeline. | Med |
| P9 | Good | Version pins per document (gcor_9th@0.2.0 · current), railroad filter, pack/category filters, offline shell, privacy tiers (T1/T2 aggregates, no names) — keep all of this. | — |

**Portal v0.7.4 (af3d609, 2026-08-17): P1/P4/P5/P6 FIXED and verified on the
operator's phone** (deployed via localhost-over-USB + the app's own update
flow; force-stop needed to activate the waiting worker — the shell's
check-for-updates has a race where a still-installing worker misses the
skipWaiting message; noted for a future shell fix). P2/P3 (document reader
reflow + sticky section headings) remain — next portal work package.

**THE MERGE (Portal v0.8.0, 2026-08-17 evening): BUILT, awaiting operator
test.** modules/liveops in railcore-portal = My Train + Lineups + Boards +
Ref Cards + alerts, header bell with live badge, fed by this repo's
GitHub feed (works anywhere, no USB). Verified in browser: feed 9m fresh,
full names, bell->alerts from any panel, ref cards. THIS standalone app
stays deployed unchanged until the operator tests and approves the merge;
then it becomes the feed-hosting repo only. To deploy the merged portal to
the phone: serve railcore-portal on 8080 + adb reverse + app menu 'Check
for updates' (x2 or force-stop once — known SW race).

## Decisions log
- 2026-08-17: One app = RailCore-CPKC-InternalApp; feeds live in this repo's
  docs/data/; GitHub Pages = free middleman for single-user phase.
- 2026-08-17: names_mode=initials until private hosting exists.
- 2026-08-17: DataHyperstore-Test repo stays frozen (E6); do not publish
  new data there.
