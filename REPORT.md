# How the ICU model was built

## Source

The model comes from sheet **A1104-a rev G**, *Fourth Floor Plan Part A, Tower D*, a project record
(as-built) drawing at 1:100. The other three sheets in the pack are the 5th floor (almost the same
plan) and Part b of both floors (MICU rooms, consult rooms, waiting area). They were checked but not
modelled.

The PDFs are AutoCAD exports that still carry their layers, so no tracing was needed:

| CAD layer | Used for |
|---|---|
| `A-WALL`, `A-WALL-PATT`, `S-COLS` | Wall and column outlines. Rasterised at 2 cm, solid-filled, then turned back into polygons |
| `A-DOOR` | Door leaves at their drawn positions. Each opening is found by casting rays from the leaf to both jambs |
| `A-GLAZ` | 16 observation window panes, plus the lobby's glazed screen (`WN35 0 - 2800`), which is modelled from its tag |
| `A-EQPM` | Joinery outlines: sink counters with basins, observation desks, the U-shaped nurse station |
| `P-SANR-FIXT` | The seven sinks on counters that are CAD blocks: bowl outline and drain here, tap on `A-EQPM`. Five are rounded rectangles and two are ovals with a rim on `A-EQPM`. Also the four oval sinks with nothing on `A-EQPM`: bowl, tap and the front edge of the vanity top are all here |
| `A-GENM` | The four dark red blocks that the `FIRE EXTINGUISHER CABINET` labels point to: position and width of the extinguisher cabinets |
| Text | Room names, which decide floor finish, ceiling type and which rooms get the patient kit |

**Scale** comes from the drawing itself. The structural grid (32–37, A-3 to E-3) is 9.000 m both ways
and measures 359.25 pt on the sheet, so the sheet is not printed at true 1:100. The origin is grid
32 / E-3, with +x east and +y north toward A-3.

## What's accurate and what's assumed

| Item | Confidence | Basis |
|---|---|---|
| Wall layout, room shapes, door positions | High | Vector CAD geometry, ±2–3 cm from rasterising |
| Patient room fronts: 2.2 m glazed opening, about 1.0 m swing leaf plus a sliding/fixed glass panel | High for widths, medium for leaf type | Drawn widths. The leaf drawn in the wall plane reads as a breakaway glass door |
| Door head height 2.41 m | High | `H=2410` tags |
| Observation windows: sill 1.0 m, head 1.4 m | Medium | `WA31 1000-1400` tag read with the sheet legend (X = sill, Y = underside of lintel). `WN35 0 - 2800` on the same sheet uses the same format. Check against the window schedule (A5102/A5105) |
| Facade: 700 mm upstand, curtain wall, external fins | Medium | `TOW +700 AFFL` and the facade lines. Mullion and fin spacing are approximate |
| Fire extinguisher cabinets: position and width | High | Drawn outlines on `A-GENM`, with labelled leaders pointing to them. 09 checks the spec against the sheet |
| Fire extinguisher cabinets: height, door, sign and the extinguisher itself | Low | Not on the sheets. See [Fire extinguisher cabinets](#fire-extinguisher-cabinets) |
| Ventilation grilles, air changes and pressures | Low | **Concept, not SSMC's design.** The sheets show none of it. See [Ventilation concept](#ventilation-concept) |
| Ceiling height 2.85 m | **Low** | Not on these sheets. One number in the spec |
| Ceiling panel layout | **Low** | Not on these sheets. A regular 2.4 m grid, plus nine panels where that grid leaves floor in the dark (`lighting.gap_fill` in the spec) and four over desk chairs it leaves dim (`lighting.desk_fill`). None of their positions come from the drawing |
| Finishes and colours (LIN36/LIN37 vinyl, wall paint) | Low | Finish codes are on the plan. The colours are assumed |
| Furniture and equipment | Low | A typical ICU kit placed the same way in every standard room and fitted to the shape of the two isolation rooms (`kit.room_overrides` in the spec). It is **not** an inventory of SSMC's equipment |
| Bed orientation: head toward the window, foot toward the glazed front | Low | The plan's bed-zone circle sits in the middle of the room. Bed facing the door is a common ICU layout, but it's an assumption. In the isolation rooms W1 and E1 the door is well to one side, so the bed sits side-on with its foot toward a party wall and the window beside it. Its centre is inside the drawn bed circle (W1: circle centre 11.50, 29.99, 2.69 m across; bed centre 11.20, 29.16) rather than on it, which leaves room behind the bed head and centres the TV on the flat foot wall |

## What's in the model

- **Floor area:** about 1,430 m² inside the facade. The cut at y = −4.7 m follows the wall line where Part b continues.
- **Patient rooms:** 16, of which 2 are isolation rooms with an ante room and toilet. Areas run from 30.3 to 38.5 m², median 34.9 m², measured to the glass line.
- **Equipment in each patient room:**
  - ICU bed with the backrest raised 30°, split rails and bedding
  - Twin-arm ceiling pendant with gas outlets, shelves, a patient monitor and three infusion pumps. The monitor, pump and ventilator screens show made-up readings, each with an amber SIMULATED band
  - Ventilator with breathing circuit, IV pole, recliner, visitor chair and overbed table
  - Examination light, privacy curtain on a track behind the glass front
  - Wood-look feature wall with a TV, bed-protection rails, and roller blinds on the facade
- **Rest of the floor:**
  - 8 observation nooks with desks, workstations and knee spaces
  - U-shaped nurse station with a raised transaction ledge, 4 workstations and chairs, and a knee space under each workstation
  - Dictation desk with a workstation, chair and knee space
  - Corridor handrails, coved skirting, lay-in 600 mm ceiling grid in corridors and plain ceilings in patient rooms
  - Crash cart and stretcher alcoves
  - Four recessed fire extinguisher cabinets, where the drawing has them
  - A concept set of ventilation grilles on the ceilings, not from the drawing
- **Lighting:**
  - 179 LED ceiling panels, each a real area light in the renders
  - Afternoon sun from the west-south-west, physical sky

### Fire extinguisher cabinets

**Where they are is measured.** Sheet A1104-a draws four cabinets on `A-GENM`, each with a leader from a `FIRE EXTINGUISHER CABINET` label. Each is a block 0.35 m wide and 0.26 m deep, with a 0.43 m face on the corridor side. The face positions in `fire.cabinets` match the sheet to the nearest millimetre, and `scripts/09_check_fixtures.py` checks that on every build. Nothing was chosen.

**How high they are and what they look like is assumed,** because the sheets show neither. The sheet gives no height, door, sign or extinguisher type.

| Assumed | Value | Limit used | Source of the limit |
|---|---|---|---|
| Top of the extinguisher | 1.40 m | No more than 1.5 m | UAE code as reported by [DMCC's bulletin](https://dmcc.ae/blog/health-and-safety-information-bulletin-01-fire-extinguishers). NFPA 10 as reported by [this guide](https://fireinspected.pages.dev/nfpa-10-guide/location-requirements/): 5 ft (1.52 m) for a unit up to 40 lb |
| Bottom of the extinguisher | 0.80 m | At least 0.30 m | DMCC's bulletin. The same NFPA 10 guide gives 4 in (10 cm) |
| Walking distance | See below | 22.9 m (75 ft), reference only | [NFPA 10 as reported by this guide](https://servicedfireequipment.com/nfpa-10-placement-spacing-guide/), for Class A hazards |

**These sources are secondhand.** NFPA 10 and the UAE Fire and Life Safety Code weren't read directly: NFPA's text is paywalled, and the Dubai Civil Defence page refused the connection. Hospital rules may be stricter. **None of this is a compliance finding.** It's a measurement of a student model, and it needs checking against the code the authority has adopted.

**Walking distance, measured on the model.** From the free floor to the nearest cabinet, walking round walls and counters on a 10 cm grid:

| | |
|---|---|
| Median | 9.9 m |
| Furthest patient room label | 21.5 m |
| Longest anywhere | 27.3 m, at the south cut line (15.0, -4.7) |
| Labels past 22.9 m | 4 of 65: three lift shafts, `L45` to `L47`, and `STORAGE EQUIP` at 24.8 m |

This only counts the four cabinets on this sheet, so it overstates some distances. The floor continues past the cut line into Part b, whose sheet shows four more cabinets. Two `FHC` hose closets are on this sheet too, and what they hold isn't shown.

**How they sit in the model.** The sheet's walls stop either side of each cabinet, with a small void behind, so each cabinet comes with a wall panel from floor to ceiling that closes the gap. Before this, the corridor looked through a slot into the void, and the rail code treated the void as corridor and ran rail inside it. That rail is gone, and corridor rail now stops 0.15 m short of each cabinet so it can't block the door. 09 also checks that the space in front of each cabinet is clear of walls, counters, door openings, handrails, alcove equipment and the door swings drawn on the sheet.

The configurator's removed safety work, described under [Configurator redesign summary](#configurator-redesign-summary-november-2026), mentions a corridor hose cabinet with an extinguisher. That isn't active, and it isn't related to these.

### Ventilation concept

**This is concept work, not SSMC's mechanical design.** All four sheets were searched: they have no mechanical layers and no grilles, ducts or air data. The only related marks are two `VENTILATION SHAFT` labels and a `RISER` on this sheet, shown as such on the plan. It hasn't been reviewed by a mechanical engineer or infection control, and it isn't a compliance finding.

The [plan](https://ihama1305-design.github.io/ICU-competition/ventilation/) has the full table of air changes, pressures and grille counts by room type.

**One source.** `scripts/ventlib.py` places grilles by rule from each room's type, using `ventilation` in the spec, with overrides there. `02` writes them to `build/vents.json`. The Blender scene, the configurator's rooms and the 2D plan all read that, so they can't disagree, and `09` compares the meshes with the list. The plan is drawn from the derived plan geometry and never from the sheet.

| Assumption | Basis |
|---|---|
| ICU room: 6 air changes, 2 outdoor, no set pressure | ASHRAE 170-2008 Table 7.1. HFG Part E (2026) repeats it |
| Isolation room: 12 air changes, 2 outdoor, negative, no return air | The same two sources |
| Isolation ante room and toilet: 10 air changes, all exhausted | ASHRAE 170-2008 Table 7.1 |
| Pressures: room −10 Pa, ante room −5 Pa, toilet −15 Pa | Dubai DHA Part D, used as an assumption. HFG Part E recommends 10 Pa for the room |
| Exhaust near the bed head, supply by the door | HFG Part E: "over the patient head or at low level near the head" |
| Nurse station, offices and staff rooms: 6 air changes | **Assumed.** No row in the table read, and HFG Part E sends them to ASHRAE 62.1, which wasn't read |
| Supply filters in two stages: MERV 8 or better, then MERV 14 or better after the cooling coil | HFG Part E (2026), Filtration |
| Isolation exhaust through a HEPA filter, then outdoors, with none recirculated | HFG Part E (Class N). DHA Part D, Table 5 |
| UV-C on the cooling coil, and in the isolation exhaust duct as an extra | HFG Part E, which calls it an additional measure and "not a mandatory requirement". DHA Part D. CDC 2003 treats UV as supplemental |
| ICU room return air passes the filters again. HEPA grade, lamp output, filter changes, where the plant goes | **Assumed** |
| Grille positions, sizes and capacities, corridor spacing, clearances | **Assumed** |

**What wasn't read.** Abu Dhabi's Department of Health governs this hospital, and its guidance wasn't found. ASHRAE 170 was read in its 2008 edition, and the current 170-2025 is paywalled, so its values may differ. The copy read is Table 7.1 and its notes only, so it gave no filter grades. HFG Part E's Annexure A-3, which lists filtration by room, isn't in the file read. Of CDC's 2003 guidelines, only the air and cleaning recommendations were read. The FGI Guidelines weren't read directly. Sources are linked on the plan page.

**Isolation rooms.** Exhaust grilles sit 0.4 to 0.5 m from the bed head, as near as the pendant allows, and supply is about 4.3 m away by the door. A low-level exhaust is the guidance's alternative, and it isn't modelled. Air would need to go directly outdoors on its own system with pressure monitoring and an alarm, and none of that is designed or shown. No duct mains are drawn.

**Clean-air layer.** Added on 10 November 2026: filters and UV-C in the air handling plant, as a second table on the plan page and on the card of the configurator's wall comfort control. It adds no grille and no object to any room, and nothing in it needs anyone to enter one. UV-C is an extra that replaces neither the filters nor the air changes. An upper-room UV fitting is the guidance's alternative and isn't modelled. **Fogging, ozone and ionisers aren't proposed:** CDC's 2003 guidelines say not to fog disinfectant in patient-care areas, and HFG Part E doesn't encourage electronic or photocatalytic cleaners, because of ozone. No plant, duct or filter housing is designed. The rows are `ventilation.clean_air` in the spec, `options.json` carries a copy for the card, and check `12` fails if the two differ.

**Hidden for now.** Since 8 November 2026, `ventilation.show_in_model` in the spec is false. `02` still builds the grilles but hides them, `04` leaves them out of the walkthrough, the renders don't show them, and the configurator's `ventilation` group is hidden (its share-link code is kept). Set it to true to bring them back.

**In the 3D model** the grilles are flush with the ceiling, in the Ceiling collection, so they go with the ceiling in cutaways and the dollhouse. `09` measures them from the meshes against light panels, exam lights, pendants, curtain tracks and walls, and against W3's different bed layout and the lighting fixtures in the configurator.

**W1 and W3 have one set of grilles.** `07` leaves the floor's grilles out of the configurator's rooms and passes on their positions, and the existing `ventilation` option draws them. No option code changed.

## Observations relevant to the competition

These are read from the drawing and visible in the renders:

1. **Observation windows are 0.4 m-tall slots** at 1.0–1.4 m (`renders/observation.png`). From the nook, a nurse sees a strip across the bed rather than the patient's face and the whole room. If the tag is right, this limits observation. Confirm it against the window schedule.
2. **Each patient room front is fully glazed** and 2.2 m wide. Privacy depends on the curtain, and daylight can borrow through the front.
3. **Rooms run 7.2–9.0 m from the glazed front to the facade** (median 8.6 m). The slanted facade and the stepped corridor give the rooms slightly different shapes, from 30.3 to 38.5 m².
4. **There is one central nurse station plus 8 observation nooks,** one nook for each pair of rooms. Each nook has a window into both of its rooms.

## The room configurator

The configurator (`/configurator/`) is a **design proposal**, not a record of the room. It's built on the model above but doesn't change it: the as-built scene, renders, walkthrough and downloads don't include any of its options.

### How it's built

`scripts/07_export_room.py` cuts W1 and W3 out of the floor with their neighbours (ante room, toilet, a stub of corridor, the facade) and gives each room surfaces of its own, because the scene's walls, ceilings and glass are single floor-wide meshes. It also opens three facade bays as pieces the page can hide, for the patio, lined up with the real mullions. Each room comes to about 0.25 MB.

The page uses Three.js with no bundler, and its choices come from one data file, `scripts/site/configurator/options.json`.

**No third-party assets.** Every finish, mural, palm, toy and fish is drawn in code from a seeded generator, and the TV picture is an original animation. There are no model, image or video files from anyone else and nothing to license. The site's fonts (IBM Plex) load from Google Fonts, and Three.js from a CDN.

### What differs from the as-built model

| Item | In the configurator | Why |
|---|---|---|
| W3's bed | Turned side-on, head at (10.31, 21.05) | So the window is beside the patient, as in W1. As modelled it's behind them |
| Ventilator | Behind the patient's head | So it doesn't stand between the patient and the window |
| Ceiling panels | The one over the bed is removed | It overlapped the exam light |
| Nook desk and chair | Left out | The nook isn't part of the room |
| Patio | New: a balcony over three bays | A concept. Nothing like it is on the drawing |
| Glazed front | Shown as a sliding door when smart glass is chosen | The drawing reads as a swing leaf plus a panel |

### Assumptions

- **Sun path:** latitude 24.45° N, at a declination of −2.5° (mid-March or late September). That's the date whose path passes through the renders' sun (azimuth 250°, elevation 32°), at about 15:32 solar time. **No direct sun enters W1 or W3 before about 12:30**, because of the way the facade faces in the model.
- **North:** +y is treated as north, as in the renders. True north isn't on these sheets, and the key plan suggests the tower is drawn rotated. `lighting.site.north_offset_deg` in the spec can correct it with one number.
- **Palms without a patio:** crowns at window height imply trees about 18–24 m tall, depending on the unverified ground level. That's near the top of a date palm's range. It reads fine, but it's an artistic choice.
- **Patio door:** three bays give about 3.3 m, so one sliding leaf leaves about 1.6 m clear. The modelled bed is 1.0 m wide. The 1.4 m minimum used for that judgement is my own assumption.
- **Light:** real-time lights don't bounce. Cove glow is drawn as gradients and bright strips, and the walls, floor and ceiling carry baked ambient occlusion. It reads well, but it isn't a lighting calculation and shouldn't be used to judge lux levels.

### Clinical notes and their sources

Notes flag concerns and don't block any choice. Each was checked against its source in the last build phase.

| Note | Says | Source | Strength |
|---|---|---|---|
| Smart glass | Replaced fabric curtains on sliding doors, reported as improving infection control and cleaning | [Healthcare Design, Memorial Sloan Kettering ICU](https://healthcaredesignmagazine.com/news/memorial-sloan-kettering-cancer-center-intensive-care-unit-new-york-ny/1683/) | Project report, not a trial |
| Smart glass | Sold for ICU sliding doors | [Stanley Access](https://stanleyaccess.com/node/2536), [ASSA ABLOY](https://assaabloyentrance.com/nz/en/documents/health/NZ-SL-Hygienic-ICU-BROCHURE.pdf) | Manufacturers |
| Smart glass | Curtain edges are high-touch surfaces | [CDC environmental services](https://www.cdc.gov/infection-control/hcp/environmental-control/environmental-services.html) | Guidance |
| Isolation door | Needs a bottom seal, and testing against positive and negative pressure | [Stanley Access](https://stanleyaccess.com/node/2536) | Manufacturer |
| Circadian lighting | Less delirium in redesigned rooms with dynamic lighting: 46% against 76%, 74 patients, p = 0.017 | [Spies et al. 2024](https://pubmed.ncbi.nlm.nih.gov/38112493/) | Observational pilot. The rooms changed in other ways too |
| Circadian lighting | Bright dynamic light alone didn't reduce delirium: 38% against 33%, 734 patients, p = 0.16 | [Simons et al. 2016](https://pubmed.ncbi.nlm.nih.gov/26895652/) | Randomised trial, stopped early for futility |
| Sealed tank | Avoid fish tanks in patient-care areas, and restrict fish from isolation areas. So the themes use the digital screen | [CDC 2003 guidelines](https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5210a1.htm) | Guidance, Category IB and II |
| Palms and planting | No fresh flowers or potted plants in patient-care areas for immunosuppressed patients. So planting stays outside the glass | [CDC 2003 guidelines](https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5210a1.htm) | Guidance, Category II |
| Patio on W1 | An outside door works against the pressure regime. No structural or fall-safety design has been done | None: reasoned from how isolation rooms work | Should go to infection control and structural review |

### Tune it in

A short survey that turns answers into an editable comfort and furnishing draft. **It doesn't choose a clinical room or recommend care.** It never changes the room, and its rules are design assumptions, not clinical guidance.

The rules are data, in the `profile` block of `options.json`, and `profile.js` resolves them with no 3D involved:

1. Answers pick one of the three themes.
2. Rules adjust it, highest tier first. An access rule beats a comfort rule: with wheelchair access and visiting family, the sofa-bed is left out, and the panel says so.
3. Each rule uses `sets`, the same map as a theme, so the result reaches the share code and can be compared and undone.

| Rule | When | Basis |
|---|---|---|
| The patio stays off | Always | Assumed. It's a choice with its own pressure, structure and fall-safety notes |
| Sofa-bed left out | Walking aid, wheelchair or assistance | Assumed. Less stands on the floor, but **the route through the room hasn't been measured** |
| Sofa-bed | Children visit, or a familiar visitor nearby | Assumed |
| Cove light, 3000 K, TV off, no aquarium | Quieter, lower-stimulation room | Assumed |
| Night light | Consistent routine and clear cues | Assumed |
| Warmer wardrobe finish | Stay over two weeks, or longer-stay patient | Assumed |

Sex, care frequency and the three free-text boxes change nothing, and the form says so. Answers aren't stored or put in links. A link holds only the room, though a room can still hint at an answer, such as a sofa-bed suggesting visitors.

**Adult ICU only.** On 8 November 2026 the Paediatric Play theme, the toy shelf, soft toys, play mat and gaming console were taken out, along with the survey's "Child or teen" answer. The groups are hidden rather than deleted, because share links are positional. An older link that set one still opens, without it, and says what it left out.

### Adaptive ICU features (8 November 2026)

These were added on top of the configurator in one day. Each was checked before it went live, and each keeps to the same rules. Patient readings are simulated and say so. Comfort features never touch alarms or medical devices. Nothing claims clinical validation or compliance. The room's design and its share link change only when the visitor changes them.

| Feature | What it does | What it isn't |
|---|---|---|
| Patient view | The camera moves to the pillow and only turns, about 100° each way and up to the ceiling, then returns to the view before | Not a measurement of sightlines. The eye is where the bed view's is |
| Room modes | Standard, Comfort, Privacy, Clinical and Emergency-ready, laid over the configured room and eased in over about two seconds. After sunset (sun below −0.833° at the room's solar hour, about 5:59 pm to 6:01 am on the modelled date), Comfort and PACS change only the lighting, leave the blinds alone and say why | They change no choice or link, and Standard puts back exactly what was there. Emergency-ready is started by staff and doesn't touch devices or alarms |
| Task light | An examination light over the bed on its own switch, which modes never dim | Not a lux level or a lighting design |
| Clinical view | Labels on the kit and on placed items, and hatched keep-clear areas beside the bed and at its foot, clipped to the open floor | Illustrative, without dimensions. Not a clearance or compliance check |
| Placed items | A bedside tablet arm, privacy screen, hand-rub dispenser, waste bins, sharps box, family chair and a biophilic wall panel (a wipe-clean printed leaf scene; living plants stay outside the glass because CDC guidance keeps potted plants and fresh flowers away from immunosuppressed patients), dragged from the panel onto the floor or a wall wherever the visitor likes | Nothing checks staff access, clearances or infection-control positions, and each card says so |
| Orientation screen | The TV can show the weekday and date and the room's own time of day, darker at night | It shows no patient details and makes no claim about delirium or sleep |
| Before and after | Today's room (every default, no placed items) against the visitor's, at the same view and time | The visitor's design and link are untouched while it shows |
| Saved rooms | Named rooms kept in this browser as share codes; Reset puts every choice back | Never sent anywhere. The form asks for no patient names |
| Guided tour | Nine captioned steps with Previous, Pause, Next, Restart and Exit; Exit and Finish restore the room exactly, and Restart does too before playing from the start. After Finish the card says so and offers what to do next | Not a substitute for exploring: dragging the room pauses it |
| SIMULATED screens | The monitor, ventilator and pump screens carry an amber SIMULATED band in their textures | |
| 3D fallback | A browser without WebGL 2 or import maps is told why and pointed to the pictures | |

The walkthrough gained a joystick and a single slim toolbar row on phones. That row scrolled sideways and hid half its controls, so it is now two rows with every control on screen, and a line over the model says how to move. It now draws only when something changes, and it uses a lighter graphics tier on phones and small screens. The figures before and after are in `docs/adaptive-icu-baseline.md`.

PACS (the Physiological Adaptive Comfort System), APIS (the Adaptive Patient Interface System) and the patient figure were built by a teammate. The README describes them, and their own checks (`scripts/11`, `12` and `13`) run alongside `08`.

### Remote care for the isolation room (10 November 2026)

**Fewer unnecessary entries, never fewer checks.** Every entry to an isolation room costs a set of protective clothing and opens the door of a negative-pressure room. So W1 should help staff see, hear and know from outside it. These are concepts and they keep the rules above: the data is simulated, nothing listens, records or stores, no alarm or medical device changes, and a nurse decides.

| | What the room does | Where it is | What it isn't |
|---|---|---|---|
| See | The glazed front, with smart glass or a curtain for privacy | In the room since the first version | Not a measured sightline |
| Hear | A vocal-distress cue. The wall sound sensor would recognise a groan or a call for help; its light changes and a notice asks the nurse to look in through the glass | Configurator: Comfort systems, and the sensor's card | Not a microphone: two buttons play the sounds. Not an alarm, and not an instruction to go in |
| Clean | Filters and UV-C in the air handling plant, out of sight | The [ventilation plan](https://ihama1305-design.github.io/ICU-competition/ventilation/#clean-air)'s clean-air table, and the wall comfort control's card | Not SSMC's design. Nothing is fogged, ionised or released into the room |
| Know | A unit board that ranks patients by their vitals | Not built | |

**The cue.** A closed isolation door keeps the air in, and the patient's voice with it. The sensor gives staff that hearing back without opening the door. A simulated sound changes the sensor's light, with a glow on the wall around it, and puts up a notice marked SIMULATED. The notice names the room and what was heard, asks for a look through the glass, and says "You decide whether to go in". It stays until someone presses Acknowledge and never fades by itself. Leaving the room, hiding the sensor or opening PACS takes it down. A short rule, `cueFor` in `vocal.js`, decides how urgent each sound is: a call for help asks for a look now, a groan for a look when the nurse can, and a third groan within a minute for a look now. A notice asking for a look now is never downgraded by a later groan. The rule is a judgement between false alerts and a missed patient, not a tested threshold.

**Its limits,** which the sensor's card and the option's note both state:

- Ventilated or sedated patients may make no sound, so quiet is never a sign that all is well.
- Alarms, visitors and a television cause false alerts, so the nurse looks before acting.
- In a real room, sounds would be classified on the device and never recorded, stored or sent.
- This model uses no microphone. Check `12` fails if any page or module names an audio or speech API, and `08` counts microphone requests while the cue runs.

**No evidence is claimed for the cue.** No study of sound-based distress detection in intensive care was read for it. It's a design idea about what a closed door takes away, not something shown to work, and it would need clinical and privacy review before anyone built it.

**Clean air** is described under [Ventilation concept](#ventilation-concept): what was read for each row, and what is assumed.

**Know isn't built.** The third idea was a board at the nurse station that ranks patients by their vitals, so staff know who to look at first. An order that looks authoritative and is wrong could delay care, so even a simulated board needs clinical input first. PACS already shows one patient's simulated readings without ranking anyone, and that is as far as this entry goes.

### Feature cards (13 November 2026)

**A card for every feature.** A visitor, or a judge, can click a feature in the room or choose it from the panel and read what it is in under a minute. The cards are data, in `features.json`, one entry per feature and one per part of a feature. They extend the object card the room already had: there is still only one popup.

| Feature | What it does | What it isn't |
|---|---|---|
| Feature cards | Each card says what the feature is, then How it works (opened on request), its benefit, how it differs for an awake and a sedated patient where that applies, its limits and an evidence line. Esc or the close button puts the card away and gives focus back to whatever opened it. A card never covers the room-mode bar or a notice | Not a clinical claim. Each evidence line either says "Expected, not shown." or cites a source already in `options.json`, with its strength |
| Features list | The same cards from the panel, grouped by kind, so nobody has to click in 3D | |
| Explore features | A button above the room marks every feature in view, with a soft outline and a filter by kind. On a desktop, the feature under the pointer is outlined | Changes nothing in the room. The outline is drawn the same way on High and Low |
| See it in action | A short captioned demo on the cards that have one: circadian lighting through the day, Privacy mode on smart glass, the orientation screen from the pillow, the nature display, the wardrobe opened compartment by compartment and compared with the one it replaced, and the daylight sensor's rule | An overlay. It shows options without choosing them, so no choice, link or summary changes, and the room goes back exactly when it ends or is stopped. It never runs during Emergency-ready, which ends it at once |

Eighteen entries are registered so far: adaptive circadian lighting, the privacy system, the patient orientation display, the nature and environmental display with its four parts (the TV scene, the sky ceiling, the digital aquarium and the biophilic panel), the built-in wardrobe with its six parts, the sound sensor, the comfort control and the daylight sensor. Only the wardrobe's compartments are new 3D.

**The wardrobe explains itself.** Its card has See how it works and four actions: Learn about this design, Open cabinet, View storage compartments and Compare with the old wardrobe. The doors slide over about a second, and one side opens at a time, as two doors on two tracks do: the left runs behind the right. Six parts have cards of their own while their door is open. Behind the left door are daily essentials on a shelf at eye level, a lockable box for valuables and a bag on the cabinet floor. Behind the right are clothes on the rail. The light inside and the doors have cards too. The compartments are small and inside the carcass, and the room as it loads looks the same.

**It saves no floor space, and the page says so.** The comparison outlines the freestanding wardrobe it replaced (PR #47), where it stood, and works out both floor areas from the two models' sizes:

| Room | Freestanding, before | Built-in, now |
|---|---|---|
| W1 | 1.00 × 0.64 m, 0.64 m² | 1.11 × 0.64 m, 0.71 m² |
| W3 | 1.36 × 0.64 m, 0.86 m² | 1.30 × 0.63 m, 0.81 m² |

The old one had sliding doors too. What the built-in one adds is height, easier cleaning and a tidier look: it reaches the ceiling, so there's no top for dust, and its end panels sit flush with its doors. So the brief's lines about preserving floor space and saving the space a door swings into were left out, and its name stays the one it already had. No inventory display or electronic lock is modelled: the valuables box has a keypad drawn on, and nothing locks.

`node scripts/14_check_features.mjs` checks the registry without a browser: every entry has its fields, links to objects that exist in both rooms, cites only sources `options.json` holds, makes no outcome claim, and names a demo or action that exists. Each demo is run against a stand-in for the page, so a step that names a missing option, time, mode or view fails there. Check `08` opens every card in both rooms by a real click and by keyboard, runs every demo, and proves the room and its link are back as they were.

### Performance

The initial download is about 2.3 MB. The page draws only when something changes, or while the TV or fish are in view. Measured on one fast laptop, an Apple M5 GPU, on 10 November 2026. Each figure is one whole frame as the page draws it while the view turns, timed from outside the page, with a one-pixel read after it so the time includes the GPU finishing and not the display's refresh rate:

| Setup | Default, day | Heaviest of nine states |
|---|---|---|
| 1440 × 900 at 1x, full quality (High) | 12 ms | 12 ms |
| 1440 × 900 at 2x, full quality (capped to about 3.6 megapixels) | 14 ms | 15 ms |
| 1440 × 900 at 2x, low-power mode (Low) | 13 ms | 13 ms |
| 390 × 844 at 3x, low-power mode, on this laptop's GPU | 10 ms | 10 ms |

- **The nine states:** the room as it loads; each of the five lighting schemes at night; the Desert Sanctuary and Family Suite themes by day; and the TV and digital aquarium both playing. They differ by less than the 1 ms that the same row moves between two runs.
- **About 7.5 ms of every figure is the pixel read's own wait, not drawing.** A frame at phone size on Low has almost nothing to draw and still waits that long, and four times the pixels adds 0.6 ms. On High at 2x the drawing adds about 4.4 ms. The page's own work each frame is 1.4 to 3.4 ms.
- **Every setup held 60 frames a second** while the view turned.
- **Until 10 November this table read 9, 22, 13 and 8 ms,** and 12, 28, 15 and 8 at the heaviest of six states that weren't recorded. Those came from the page's own timer. It draws once itself while the page draws once more in the same frame, so on High at 2x it reads 21 to 22 ms where a whole frame takes 14. On the lighter setups it read a little under a whole frame, because it leaves out the page's own work. `docs/adaptive-icu-baseline.md` has the working.
- **Since 10 November the page picks High or Low itself:** it times a few frames after loading (Auto), remembers the answer, and the visitor can overrule it with the Quality control.

**These are a best case, not a promise.** A typical integrated GPU will be several times slower, and no phone GPU was measured. So the page protects itself: if frames stay slower than about 30 a second while the view moves, it lowers the resolution step by step, then drops the bloom. Phones and small screens start in the low-power mode, with no bloom or glass transmission and fewer lights.

Each lighting scheme only turns on the lights it uses. With all 11 kept on at zero brightness, the 2x case took 43 ms against 22 ms, on the page's own timer. The price is a short recompile the first time a scheme is chosen, typically a fraction of a second.

### Checks

`scripts/08_check_configurator.py` tests the published site under `/<repo>/` in a software renderer. It covers load and download budget, all views and orbit limits, every route between views, a frame timed before the click that started a move or a glass fade, every option in both rooms (it fails if an option leaves the picture unchanged), all themes by day and night, opaque glass hiding what's behind it, the wall switch, spec codes across 24 rooms, the summary, image download, tour, Tune it in's rules for every combination of answers, the vocal-distress cue in both rooms, the clean-air rows on the plan and on the comfort control's card, every feature card by click and by keyboard with every demo put back, Explore features on High, Low and a phone, reduced motion, a phone layout, and accessibility with axe plus a keyboard walk through every control.

### Known limitations

- **The furniture is low-poly.** It comes from the as-built kit, and it looks blocky next to a car configurator's scanned models.
- **The toilet is empty.** In the dollhouse view its ceiling stays on for that reason.
- **W1's bathroom fixtures aren't in W1's toilet.** The fixtures and the Bathroom view stand in a solid wall block in the corner of the ante room, around (17.98, 27.46), and the view works only because walls aren't drawn from behind. Moving them was left for later. The record drawing puts the toilet's WC in its north-east corner, the basin in the south-west alcove and a shower in the south-east alcove.
- **Not tested on real phones or in Safari.** Touch was emulated in Chromium, and frame rates were only measured on one fast laptop. The walkthrough's joystick, dragging items onto the room by touch and the phone layouts most need a real device.

## Rebuild and edit

- **Rebuild:** `scripts/run_all.sh` runs the full pipeline, including the configurator's rooms and test. Use `--preview` for quick renders.
- **Edit the model:** open `downloads/icu.blend`, or `output/icu.blend` after a rebuild. Each room's equipment is a set of linked copies, so editing one bed's mesh changes all 16.
- **Change numbers:** edit `spec/icu_spec.json`, such as `building.ceiling_height`, `building.window_head`, `kit.*` positions in the bed-head frame, or `cameras.*`.
- **Debug the plan reading:** `scripts/plan_debug.py` draws the extracted plan over the CAD layers to `build/sheets/plan_debug.png`.

## Known limitations

- Wall ends are slightly rounded where the raster closed small gaps (2–3 cm).
- The stair core in the north block is shown as an empty enclosure.
- Lift doors and toilet fittings other than basins are not modelled.
- The four vanity tops near two `TOILET` and two `ANTE` labels are only partly drawn. Each runs from its drawn front edge back to the extracted walls, so its back corners follow those walls' chamfers. They're built as 0.90 m counters with a cabinet, because these sheets don't give their height or what's under them. The basins have the same tap as the other sink blocks, without the separate handles and side controls drawn beside them. The east toilet's block draws no drain, so its drain is assumed to be 95 mm from the bowl's centre, as on the west toilet's matching block.
- Staff toilets, utility rooms and the core are walled and doored but unfurnished. Only counters, vanity tops and the sinks drawn on them appear there.
- The `A-EQPM` outline for a service riser is built as a plain 0.90 m counter, because these sheets don't give its height.
- Knee spaces aren't drawn. The sheets give only the outlines of the nurse station and the desks, so each workstation gets an assumed opening 0.90 m wide and 0.55 m deep, 0.72 m high up to the underside of the top.
  - At the nurse station, the cabinet stays between the openings and behind them, under the transaction ledge.
  - At the dictation and observation desks, a panelled pedestal stands on each side of the opening, and the wall closes it at the back. The panels run to the floor, with no plinth or toe recess.
  - At the observation desks that wall is a V, so the opening is smaller than assumed. It is 0.42–0.44 m deep across the full 0.90 m, and reaches 0.55 m only across the middle 0.44–0.51 m.
- Glass, sky and procedural textures only look right in the Cycles renders. The GLB and viewer use flat colours.
- Heights other than the door head and windows are assumptions (see the table above).

## Configurator redesign summary (November 2026)

This records the requested redesign work together in one place. These changes apply to the W1 and W3 room configurator proposal, not the as-built floor model.

**Current rendering status:** On 6 November 2026, the room rendering was restored to the configurator version from before the latest bed-layout and safety additions. The details below record that later proposal and its checks; those additions are not active in the restored scene. The original full-model snapshot in `backups/initial-model/` remains unchanged.

### Patient fit and room controls

- Added a patient-fit questionnaire covering patient type, stay length, sex, children, behaviour, mobility, medication frequency, sensory preferences and related needs. Answers choose a visual starting design; the user can continue to edit the room manually. The result is a design suggestion and does not assign a real room or replace clinical decisions.
- Added per-object identification popups and more furniture choices, including a sliding wardrobe with shelves and clothing, visitor seating and a movable over-bed table.
- Added item finish choices with colour, surface texture and design variations. Category panels collapse and animate so the remaining options stay readable.
- Added a W1 bathroom interior in its existing bathroom shell, with a toilet, basin, mirror, grab rails, soap and assistance-call concept.

### Clinical layout and circulation

- Repositioned the ICU bed as the main reference point, with its head aligned to a dedicated service wall. Monitor, gas and power points, pump supports, ventilator support and cable routing are grouped into a headwall and overhead boom.
- Moved visitor seating to the perimeter family zone. A separate play zone sits at the far end of the room, away from the entrance. Both the recliner-and-chair layout and the optional sofa layout were checked against the transfer path.
- Added shallow integrated storage, a wall-mounted documentation desk, sanitizer and a handwash sink near the entrance. The sink is an accessibility concept and needs dimensional review.
- Added separate floor markings for each bed-side strip and the bed-foot strip, each 1.2 m wide, plus a visual 1.8 m transfer route from the doorway to the bed foot. In the exported room geometry, the bed measures about 2.213 by 1.071 m. The modeled foot clearance to the nearest floor edge is about 1.445 m in W1 and 1.245 m in W3. The W3 margin is tight and needs site verification.
- Modeled front-opening widths are 1.85 m for W1 and 2.225 m for W3. These are proposal geometry measurements, not approved clear-opening dimensions after hardware and finishes.
- The over-bed table is hidden by default so it cannot sit in the W3 transfer lane. It can be shown as movable furniture, with a reminder to clear it before transfer.

### Comfort, appearance and safety

- Added low-profile supply grilles and wall comfort controls, varied material texture scale, blinds, daylight and night lighting modes, and clearer ceiling and cable details. The room remains stylized rather than photorealistic.
- Added visible smoke detection, a sprinkler head, manual alarm point, exit sign, bedside call control, and a corridor fire-hose/standpipe cabinet with extinguisher and riser symbols. External fire hydrants belong on the building site fire-service plan.
- Added a sound-level sensor and an HVAC comfort-control concept. Neither connects to a microphone, patient vitals, pain assessment or staff alert system; they do not record speech or identify a patient. Since 10 November 2026 the sensor has a simulated vocal-distress cue and the control's card lists a clean-air concept: see [Remote care for the isolation room](#remote-care-for-the-isolation-room-10-november-2026). Both statements still hold.
- Kept rendering on demand and limited animation to elements in view to avoid unnecessary redraws.

### Backup and review limits

- The original model snapshot is preserved in [`backups/initial-model/`](backups/initial-model/README.md), including the editable Blender file, exported GLB files and original specification.
- Safety fixtures, patient-fit suggestions, sink reach, service connections and clearances are visual proposals. They are not code approval, clinical engineering, infection-control, accessibility or fire-engineering sign-off. Confirm final dimensions and equipment locations with the project team and authorities before construction.
- The 1.2 m strips and transfer route were checked against the exported W1/W3 floor polygons and furniture bounds. Chairs and the sofa option clear the route in the current layout; the optional over-bed table needs to be moved away when transfers take place.
