# Room upgrade: one clinical base, four themes, a compact chair

Implementation note for review, written 18 to 19 November 2026. Branch `room/four-themes`, cut from `main` at `586f02c`. Nothing is pushed, merged or deployed.

The brief's snapshot was commit `f6d2af5`; `main` had moved on since (the existing floor came off the site, and the home page gained its story). This work is on current `main`, so the walkthrough and ventilation pages the brief lists are no longer in the tree.

## What was built

| Outcome asked for | What is in the room now |
|---|---|
| A visibly improved, coherent room | One clinical base under every theme; a ceiling border with rounded corners; desk and bedside cabinet in the wardrobe's finish; a flush track over the privacy curtain; the bulky recliner and its baked shadows gone |
| Four coordinated themes | Future ICU, Calm Clinical, Desert Sanctuary and Family Suite share the same objects in the same places and differ only in paint, feature wall, floor, upholstery, joinery finish and light |
| A compact, better-proportioned chair | One armchair, 66 × 64 × 92 cm, seat at 46 cm, drawn in code, the same in both rooms and all four themes |
| Clearer circulation, honest clearances | Six kinds of floor area, drawn from the layout check's own list, each with a pattern and a name in words; the scan covers the room's own seating |
| Stronger research explanations | Nine feature cards with Features, Benefits, and Evidence and limits tabs, each source named with its kind and what it doesn't show |

Two things followed from those five. A theme chosen while Clinical or Emergency is on now waits, with a note, and is applied when the mode ends. And both scripted presentations, Experience the ICU of the future and Transform the ICU, were rebuilt on the new room: they start from today's room (every default) and bring in the new finishes, the tray and cable channels, the screens, and the desk with the compact chair in place of the recliner.

## The pictures

All from the real application, drawn by headless Chromium on an Apple M5's own GPU (ANGLE Metal), at 1600 × 1000, High quality. Not software-rendered, not an emulated device, not retouched.

| Picture | What it shows |
|---|---|
| `w3-theme-future.jpg`, `w3-theme-calm.jpg`, `w3-theme-desert.jpg`, `w3-theme-family.jpg` | W3 in each theme, from one camera (the view across the room) at one time (Afternoon, 3:32 pm solar) |
| `w3-circulation.jpg` | W3 straight down with the ceiling off and Equipment labels on: the hatched keep-clear areas, the route and its arrow, the door's approach, the reach in front of the wardrobe and the desk, the chair in its bay, and each one's name |
| `w3-chair-detail.jpg` | The compact chair in its bay, Calm Clinical |
| `w3-seating-before-todays-chairs.jpg`, `w3-seating-after-compact-chair.jpg` | The same view with Family seating set to Recliner and chair, then to Compact chair. A comparison of two states of this student model, not of the hospital's room against a built one |
| `w3-chair-card-evidence.jpg` | The chair's card open on Evidence and limits |
| `w1-theme-calm.jpg` | W1, the isolation room, in Calm Clinical |

## The reference board's seven intentions

The four-panel board was looked at directly. It is a concept illustration with no dimensions, so nothing was moved or enlarged to match it.

| On the board | In the model | Where to see it, or what checked it |
|---|---|---|
| Optimized staff circulation | The floor areas under Equipment labels, Clinical and Emergency; the chair parked out of every area. Feature card: Clinical circulation | `w3-circulation.jpg`; check 15: every theme in both rooms, no modelled conflict found for the chair or any fitting |
| Infection-control materials and finishes | A coated chair with few seams, sealed arm caps and a clean-out gap; flat sealed prints in place of relief on the feature wall; flush joinery and curtain track. Proposals only: each card says a real product and infection-control review are needed | `w3-chair-detail.jpg`; the chair's card, Evidence and limits |
| Compact, adjustable family seating | The compact chair. **Compact, not adjustable:** it doesn't recline or move. Its upholstery colour follows the theme | `w3-chair-detail.jpg`; check 14 holds its size to an ordinary armchair's |
| Recessed privacy curtain track | A track set flush into the ceiling along the glazed front, shown with the curtain, which parks at the end of the opening | Privacy card, Features tab; check 15, Low quality |
| Adaptive lighting, circadian and procedure modes | Unchanged systems, now under every theme: the tray's line of light takes the lighting scheme's colour; Future ICU uses Circadian; the examination light keeps its own switch | The four theme pictures; Ceiling tray card |
| Acoustic comfort | Unchanged: the four optional fittings and Acoustic comfort mode. Its card gained the Research tabs. Not part of the shared base | Acoustic comfort mode card |
| Integrated, flush storage | The sliding wardrobe, with the desk and bedside cabinet now in the same finish; belongings kept apart from clinical supplies | The theme pictures; Built-in sliding wardrobe card |

## Decisions made without asking

These were judgement calls. Each is easy to reverse, and each is flagged here so it can be.

1. **A link with no code opens today's room, as before** (Hassan's decision, 19 November 2026). For a while on 18 November this build opened on Calm Clinical, so that a first visit saw the proposal; that is reversed. Today's room is every option at its default, the room Reset the room and Before / after also show, and old links are untouched. Since all four themes carry the shared clinical base, no theme is today's room: none is pressed at the start, and a theme button shows the proposal.
2. **The compact chair replaces both the recliner and the visitor chair** while it is chosen. The recliner stood 0.69 m² into a keep-clear area in this model. A chair for getting the patient out of bed is clinical equipment and isn't drawn; the card says so.
3. **The chair's bay is by the window**, on the far side of the bed from the door, where the board shows it. The model's existing Family zone view still looks at the alcove by the door, which is now empty of seating.
4. **Family Suite no longer adds the sofa-bed or the patio.** The brief asked for no automatic furniture swap, and in W3 the sofa-bed's place overlaps the IV pole in the layout check.
5. **A new dune-line print** was appended for Desert Sanctuary in place of the existing Dunes mural, which is a sunset picture. The brief suggested reusing `dunes`; the tone-on-tone print is closer to the board.
6. **No Parked / In use movement.** The brief made it optional and required the whole path to be checked. The chair is static, and no button pretends otherwise.
7. **The placeable Compact family chair** now uses the same geometry, in a fixed colour that doesn't follow the theme.

## Source assumptions

- **Chair size:** a student's design assumption, chosen inside the range of ordinary guest armchairs. No product was measured and no precedent for seating dimensions was in the repository.
- **Chair bays:** measured against each room model's walkable floor and the layout check's areas, in plan metres. W3 (6.9, 19.9), turned 10°; W1 (8.84, 28.98), square.
- **Floor areas:** this model's own, with no dimension taken from a standard. A strip either side of the bed and past its foot, a route 70 cm wide, 90 cm in front of a door, 60 cm in front of the wardrobe and the desk.
- **Sources:** only SSMC's visitor guidelines were read for this update (18 November 2026: two visitors at a time in intensive care, each over 12; overnight stays not mentioned; the page has no date of its own). Every other source's entry says it wasn't reread and keeps conservative wording. No clause, quotation or measurement was invented.
- **Competition rules:** the original FAQ wasn't reread. Everything here stays inside the existing room shell.

## What was verified

Run on the published copy in `configurator/`, served under `/ICU-competition/`, on one Apple M5 MacBook, in Chromium.

| Check | Result |
|---|---|
| `14_check_features.mjs` (Node) | Pass, 19 November 2026, with new assertions for the shared base (and that it names no starting theme, and the page puts none on), the chair's size and bay, the check finding the chair when it is moved onto the route and onto the desk, the floor-area kinds and the Research tabs |
| `12_check_pacs_state.mjs` (Node) | Pass, 19 November 2026, unchanged, run again after REPORT.md was edited |
| `11_check_apis.mjs`, `13_check_pacs.mjs` | Pass, 19 November 2026, unchanged: APIS and PACS still restore the room they were opened in, and 11's theme, share-code and tour tests pass on a page that starts on today's room |
| `15_check_room_upgrade.py` (new) | Pass, 19 November 2026: 102 checks, none failed, on the GPU, after its first section was restated for today's room (the 18 November run's 101 lines counted the closing summary, so it was 100 checks). The ten pictures were made again in the same run and came out as before. See REPORT.md for what it covers |
| `08_check_configurator.py`, first full run | 960 passed, 7 failed. All seven were expectations of the room as it was: two that Family Suite turns the patio on, two naming Desert Sanctuary's old paint and feature wall in old-link tests, two where the test that clicks every feature didn't put the new chair in the room, and one that a link with no code opens today's room. Each was restated for the new room; none showed a defect. The run also showed that the two presentations still built the old look, which was then fixed |
| `08_check_configurator.py`, second full run, 18–19 November, on the copy that opened on Calm Clinical | Pass: 969 checks, none failed, in about an hour in the software renderer |
| `08_check_configurator.py`, third full run, 19 November 2026, on the final published copy | Pass: 970 checks, none failed, in 57 minutes in the software renderer, with no other check running. Two tests were restated for a link with no code opening today's room (see Changed files); both pass: the page starts on every default with no theme pressed and the note saying today's room, and a link with no code has no fitting until Calm Clinical brings the base's five, with Reset the room taking them away again |
| `publish_configurator.py --check` | The published copy matches its sources |

Before any edit, 12 and 14 passed on this machine: the CRLF failures the brief mentions are a Windows matter and didn't occur here.

**Not tested:** Safari, Firefox, any real phone or tablet, any screen reader, and no person has used it. Touch and the 1024 × 768 screen were emulated. Frame time wasn't measured again.

## Limits that remain

- The home page's pictures and its links still show the room as it was before this upgrade.
- The room's other kit is still the low-poly as-built kit: bed, pendant, ventilator, pumps.
- In this model the ventilator, the over-bed table and the pendant still stand in keep-clear areas beside the bed. They were not moved.
- W1's bathroom fixtures, the patio and the ventilation grilles are as they were. None was touched.
- The repair of the old chairs' baked shadows is approximate: under the old recliner the wall's base is a little lighter than beside it.

## For the owner to review

The room models in `assets/model/` (`room_w1.*`, `room_w3.*`) are derived from the record drawings and are public on `main`. This work added no drawing and no new derivative of one: the new pictures show only the proposed room's interior. Whether those models may stay public is still the open question it was.

## Preview and publication

Preview locally, from the repository root:

```bash
python3 scripts/publish_configurator.py
```

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000/configurator/?room=W3`. It starts W3 on today's room, every option at its default, as the live site does; a theme button shows the proposal. If the page says a script could not be loaded, reload once: Python's simple server drops a connection now and then when a page asks for sixty files at once. GitHub Pages doesn't.

Presentation links for W3, one per theme, from the view across the room:

| Theme | Local | After publication |
|---|---|---|
| Future ICU | `http://localhost:8000/configurator/#c=11930a7404300000100020240000000350010000000111110011` | `https://ihama1305-design.github.io/ICU-competition/configurator/#c=11930a7404300000100020240000000350010000000111110011` |
| Calm Clinical | `http://localhost:8000/configurator/#c=1193008501200000000000250000000430010000000111110001` | `https://ihama1305-design.github.io/ICU-competition/configurator/#c=1193008501200000000000250000000430010000000111110001` |
| Desert Sanctuary | `http://localhost:8000/configurator/#c=11930b9601110000001000260000000010010000000111110001` | `https://ihama1305-design.github.io/ICU-competition/configurator/#c=11930b9601110000001000260000000010010000000111110001` |
| Family Suite | `http://localhost:8000/configurator/#c=11930ca101010000000210270000000540010000000111110001` | `https://ihama1305-design.github.io/ICU-competition/configurator/#c=11930ca101010000000210270000000540010000000111110001` |

These links work only once this branch is published: the live site doesn't have the new choices yet.

To check before publishing:

```bash
node scripts/14_check_features.mjs && node scripts/12_check_pacs_state.mjs
```

```bash
.venv/bin/python scripts/15_check_room_upgrade.py
```

Publication is a merge to `main`: GitHub Pages serves every committed file. `configurator/` is already in step with `scripts/site/`. Don't merge as a test.

## Changed files

New: `scripts/site/configurator/chair.js`, `chair-data.js`; `scripts/publish_configurator.py`; `scripts/15_check_room_upgrade.py`; `docs/room-upgrade/`.

Changed, under `scripts/site/configurator/` and copied to `configurator/`: `options.json` (themes, `themeBase`, `research`, appended choices), `features.json` (two new entries, nine research blocks), `main.js`, `addons.js`, `fittings.js`, `surfaces.js`, `clinical.js`, `layout.js`, `placed.js`, `highlight.js`, `demos.js`, `guide.js`, `intel-data.js`, `cleaning-data.js`, `configurator.css`; `scripts/site/configurator.template.html`.

Changed checks: `14_check_features.mjs` (three assertions restated for the shared base, new ones added, among them that the base names no starting theme and the page puts none on) and `08_check_configurator.py`. In 08, these were restated for the new room and nothing was removed: Suggest a room's four expectations where its seating rule now keeps the compact chair; the two patio tests, which now switch the patio on themselves; the two old-link tests, for Desert Sanctuary's new finishes, one of which now also asserts today's seating and no tray; the setup of the test that clicks every feature; both presentations' expected finishes; the themes section's first test, which expected the page to start on Calm Clinical when Calm Clinical was today's room and now expects today's room itself: every default, no theme pressed, and the note saying so; and the test of a link with no code, which now expects every default, no theme and no fitting, and gained assertions that Calm Clinical brings the base's five fittings and that Reset the room is today's room again with none.

`15_check_room_upgrade.py` was restated on 19 November for the same decision, and none of its assertions was removed or loosened: its first section now expects a link with no code to open W1 on today's room (every default, the recliner and the visitor chair, no compact chair, no theme pressed, the note saying today's room), then Calm Clinical to bring the compact chair with its button pressed, then Before / after and Reset the room to give every default. The sections that test the chair, the ceiling border or the fittings on a page opened with no link (the modes, both scans, the Research tabs, Low quality and the tablet-size screen) put Calm Clinical on first, and the modes section now also asserts the chair is in its bay before it starts.

Also: `REPORT.md`.
