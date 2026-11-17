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

**No third-party assets.** Every finish, mural, palm, toy and fish is drawn in code from a seeded generator, and the TV picture is an original animation. There are no model, image or video files from anyone else and nothing to license. The site's fonts (IBM Plex) load from Google Fonts, and Three.js from a CDN. The one exception is on the home page, not in the configurator: the ten pictures at its top are the 3D room finished as photos with an AI image tool (see [The story at the top of the home page](#the-story-at-the-top-of-the-home-page-17-november-2026)).

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
| Acoustic comfort | Five UK ICUs were all louder than WHO's hospital guideline; one empty side room read 34.1 dBA with everything off and 43.5 dBA with a ventilator running | [Darbyshire and Young 2013](https://ccforum.biomedcentral.com/articles/10.1186/cc12870) | Observational study, five units. No fitting was tested |
| Patio on W1 | An outside door works against the pressure regime. No structural or fall-safety design has been done | None: reasoned from how isolation rooms work | Should go to infection control and structural review |

### Suggest a room

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
| Room modes | As set, Comfort, Privacy, Clinical and Emergency, laid over the configured room and eased in over about two seconds. After sunset (sun below −0.833° at the room's solar hour, about 5:59 pm to 6:01 am on the modelled date), Comfort and PACS change only the lighting, leave the blinds alone and say why | They change no choice or link, and As set puts back exactly what was there. Emergency is started by staff and doesn't touch devices or alarms |
| Task light | An examination light over the bed on its own switch, which modes never dim | Not a lux level or a lighting design |
| Equipment labels | Labels on the kit and on placed items, and hatched keep-clear areas beside the bed and at its foot, clipped to the open floor | Illustrative, without dimensions. Not a clearance or compliance check |
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
- This model uses no microphone, and nothing on the site listens. Check `12` fails if any page or module names a capture, speech-recognition or speech-synthesis API. Since 13 November one module, `sound.js`, may play sound, and only sound it makes in the page (see Acoustic comfort below). The cue itself stays silent. `08` counts microphone requests while the cue runs.

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
| See it in action | A short captioned demo on the cards that have one: circadian lighting through the day, Privacy mode on smart glass, the orientation screen from the pillow, the nature display, the wardrobe opened compartment by compartment and compared with the one it replaced, and the daylight sensor's rule | An overlay. It shows options without choosing them, so no choice, link or summary changes, and the room goes back exactly when it ends or is stopped. It never runs during Emergency mode, which ends it at once |

Eighteen entries are registered so far: adaptive circadian lighting, the privacy system, the patient orientation display, the nature and environmental display with its four parts (the TV scene, the sky ceiling, the digital aquarium and the biophilic panel), the built-in wardrobe with its six parts, the sound sensor, the comfort control and the daylight sensor. Only the wardrobe's compartments are new 3D.

**The wardrobe explains itself.** Its card has See how it works and four actions: Learn about this design, Open cabinet, View storage compartments and Compare with the old wardrobe. The doors slide over about a second, and one side opens at a time, as two doors on two tracks do: the left runs behind the right. Six parts have cards of their own while their door is open. Behind the left door are daily essentials on a shelf at eye level, a lockable box for valuables and a bag on the cabinet floor. Behind the right are clothes on the rail. The light inside and the doors have cards too. The compartments are small and inside the carcass, and the room as it loads looks the same.

**It saves no floor space, and the page says so.** The comparison outlines the freestanding wardrobe it replaced (PR #47), where it stood, and works out both floor areas from the two models' sizes:

| Room | Freestanding, before | Built-in, now |
|---|---|---|
| W1 | 1.00 × 0.64 m, 0.64 m² | 1.11 × 0.64 m, 0.71 m² |
| W3 | 1.36 × 0.64 m, 0.86 m² | 1.30 × 0.63 m, 0.81 m² |

The old one had sliding doors too. What the built-in one adds is height, easier cleaning and a tidier look: it reaches the ceiling, so there's no top for dust, and its end panels sit flush with its doors. So the brief's lines about preserving floor space and saving the space a door swings into were left out, and its name stays the one it already had. No inventory display or electronic lock is modelled: the valuables box has a keypad drawn on, and nothing locks.

`node scripts/14_check_features.mjs` checks the registry without a browser: every entry has its fields, links to objects that exist in both rooms, cites only sources `options.json` holds, makes no outcome claim, and names a demo or action that exists. Each demo is run against a stand-in for the page, so a step that names a missing option, time, mode or view fails there. Check `08` opens every card in both rooms by a real click and by keyboard, runs every demo, and proves the room and its link are back as they were.

### Acoustic comfort (13 November 2026)

**A picture of the room's sound.** Acoustic comfort mode is a button above the room, beside Explore features: it's not in the mode bar, which is full on a phone. Like Equipment labels it changes nothing in the room's design.

| Feature | What it does | What it isn't |
|---|---|---|
| Sources | Labels on six simulated sources (monitor tones, infusion pumps, the ventilator, equipment fans, the door closing, talk in the corridor), each with a level at 1 m. The two loudest at the pillow are marked | Not measured. The levels are made up, set near readings from one ICU side room |
| Sound map and quiet zone | The floor coloured from quiet to very loud, with words for each colour, and a ring round the head of the bed with the level at the pillow. The sound sensor shows the level where it is | The simplest distance rule: a source is 6 dB quieter each time the distance doubles, and sources add as energy. A real room reflects sound, so it's louder far from a source than this says |
| Without and with the fittings | Shows the room with every fitting off, then with every fitting on, and outlines the fittings | The difference is made up, and the screen says so. Nothing touches the patient's equipment: the panels absorb sound in the room, and damping mounts go on non-critical kit only |
| Acoustic fittings | Four option groups, off by default (codes 33 to 36): wipe-clean wall and ceiling panels, an acoustic partition (the glazed front in laminated acoustic glass, sealed round), a soft-close door and cabinets, and damping mounts on the TV. Shown while their demo, the mode or Explore features runs | Each card says a real one needs infection-control and manufacturer sign-off. None blocks access, the view in, a vent or cleaning |
| Notifications | Three kinds. Critical alarms: always sounding and always visible, out of the comfort system's control (an example can be shown, never sounded). Routine notifications: listed, with a line that a hospital might review some at the nurse station where the device and its policy allow, and that nothing here changes that. Environmental notices (too loud, a door left open, kit vibrating): the only ones this system raises, and staff acknowledge them | No alarm, threshold, volume or route is changed, even as a demo |
| Demo sound | Off until **Play demo sound** is pressed. The noisy room for about nine seconds, then the same room with the fittings, while the map follows and each source's label flashes as it's heard. **Play restful sound** plays a slow, low chord for a patient it suits. **Mute demo sound** is in view whenever it plays | Playback only, synthesized in the page by one module, `sound.js`: no audio files and no speech. The level is capped low, and no tone imitates an alarm: every note is a single soft one under 600 Hz, where monitor and pump alarms sit at 800 Hz to 3.15 kHz. It stops on Esc, when the tab is hidden, for Emergency mode, and whenever a notice or an alarm example appears. Nothing listens |

**Where the numbers come from.** Darbyshire and Young measured five UK ICUs for 24 hours (Crit Care 2013). Every unit was louder than WHO's hospital guideline, which they quote as 35 dBA on average and 40 dBA at most where patients are treated, and which they judged out of reach in an ICU. In one empty side room, with the meter where the patient's head would be, they read 34.1 dBA with everything off and 43.5 dBA with a ventilator running. This model's quiet room is 34 dBA and its ventilator 44 dBA at 1 m, from those readings, and talk in the corridor 55 dBA, the level their discussion gives for normal conversation. The monitor's tones, the pumps, the fans and the door are made up for the picture, and so is the fittings' effect. The WHO document itself couldn't be downloaded, so its values are cited as the paper quotes them.

### Patient states and the bedside screens (13 November 2026)

**The room follows the patient.** A Patient bar under the room modes sets the patient's state: Sedated, Awake or Recovering. Awake is the room as configured, so the room looks the same as it loads. The room modes stay as they were: Clinical and Emergency are the staff override and always win, and Emergency is the brief's fourth mode. A state changes no choice, link or summary, and a design change puts it back to Awake, as it puts a mode back to Standard.

| Feature | What it does | What it isn't |
|---|---|---|
| Patient states | Sedated: steady light by the time of day, a little lower, and nothing on the patient's screen; staff see the positioning reminder, line status and noise. Recovering: the orientation screen first, light by the time of day. Changes ease over about two and a half seconds; **See the transition** steps from sedated to awake to recovering | Staff set the state; the room never works it out from the patient. No alarm, device or clinical setting changes |
| Communication board | Seven large requests, in the brief's words. Three ways to choose: touch, a single switch while a highlight steps through them (it pauses after two rounds), and gaze, where a look held on a request chooses it. Each request goes on a nurse-side list with the room's time and stays until acknowledged. Recovering keeps four, larger | Simulated: the switch and gaze are a button and the pointer. It doesn't replace a certified nurse-call system, and nothing leaves the page |
| Comfort passport | A sample record of eight preferences, with the care team's settings listed apart, and a table of how each is used or held back in each state. Saved in this browser only, or the sample restored | A made-up patient with no name. Temperature is shown, never applied. Its own record: Suggest a room and PACS keep theirs |
| Family connection | Drawn photographs, a voice message (shown with its words, not played), a simulated video call, a personal scene on the TV, familiar music as demo sound, and a line on the orientation screen. For a sedated patient, only what staff allow. Staff's **Quiet now** turns all of it off, the TV, the aquarium screen and sound included | No photograph is uploaded and no camera or microphone is used. The music is an original tune made in the page, under 600 Hz like every demo sound |
| Orientation screen | Adds day or night, a line about where the patient is, visiting marked as confirmed by staff, a non-urgent plan, and a recovery note when recovering | Sample lines. Never a name, a diagnosis or care information |

They open from the Patient bar, the panel's Bedside screens buttons and the feature cards: the tablet arm's card opens the board, the window's the passport and the TV's family connection. None needs an item placed. On a phone the Patient bar keeps to one row, and the screens open from the panel.

### The bed: pressure and lines (14 November 2026)

**A staff panel for the bed.** The panel's **The bed** section, the bed's card and the staff view open it, in the options panel's place. Two tabs share one position: on the back with the backrest at 30° (as the figure lies), turned 30° onto either side, or sitting up at 45°. The bed and the patient figure in this model don't move, so a position is shown on the map and in the line list only. Like the room modes it changes no choice, link or summary, closing it puts the view back, and Emergency closes it.

| Feature | What it does | What it isn't |
|---|---|---|
| Pressure-awareness bed | A simulated sensor grid on the mattress, with the patient figure faint over it. Each cell is light, moderate or higher by relative load, from the usual teaching pictures of pressure points. A place under a higher load held past the sample positioning plan's 2 hours is ringed, and staff see **Positioning assessment due** until they dismiss it; the staff view shows the same reminder. The time in a position is set by hand: 15 min, 1 h 20 min or 2 h 10 min. **See the map shift** turns the patient through the four positions | Not a measurement: the map has no units, because nothing is measured. It predicts no injury and never moves a patient. The plan is a sample; the nursing team sets the real one. The page never counts time by itself |
| Line clips and tags | A clip on each of the five lines patient.js draws, with a tag in its colour: on the side rails' tops for the IV line, the feeding tube and the ECG leads, a holder at the head end for the respiratory circuit, and a guide on the bed frame for urinary drainage, never on a moving rail. **Lines** shows each line's slack in the chosen position (slack enough, less slack, or check this line), by its clip and in a list with the reason. Any move first asks staff to check every line, and moves nothing until a person confirms it. **See a bed move** shows the check, then the slack. An option under Bed (code 37, off by default) keeps the clips in the room | Slack comes from a fixed table, to show the idea: no tension, force or flow is worked out, and no line or device is monitored. The clips don't secure a line, and nothing here changes a real line, connector or device. APIS keeps its own tubing tab, unchanged |

### The Future ICU look (14 November 2026)

**A fourth theme, and five fittings.** From a reference picture of the room the team wants: a lit ceiling tray, flush white wall panels with screens, a clinician's desk, a bedside cabinet, soft white and warm timber. The picture is a reference for arrangement and mood only: nothing is traced from it or used as a texture. **Future ICU** is listed first and sets existing choices (wood-look feature wall, terrazzo floor, circadian light, blinds half down, the orientation screen on the TV) and turns on the five fittings. Each fitting is also an option under **Future ICU fittings**, codes 38 to 42, off by default, so the other themes, every old link and the home page's pictures are unchanged. It leaves the seating as it is: W3's sofa, as placed for Family Suite, stands on the IV pole, and the north wall has no clear 1.7 m for it.

| Feature | What it does | What it isn't |
|---|---|---|
| Ceiling tray | Square tiles in a shallow border over the bed, with a line of light round its inner edge that takes the room light's colour, and a row of small downlights on the window side. Its border keeps clear of the ceiling lights, the pendant and the wardrobe; with the printed sky on, the sky fits inside it | It adds no brightness in this model. A real one needs the ceiling's services, structure, access and infection-control requirements checked |
| Staff panel | One flush white panel with rounded corners on the wall behind the bed head, two wide screens and a line of light beneath, behind the pendant that still carries the monitor, pumps and outlets. For staff: a patient lying in bed can't see the wall behind their head, and the view from the bed doesn't show it | Its screens show a still: the shapes of the observations with no numbers, care tasks and equipment, marked simulated. It never stands in for the patient monitor |
| Patient wall | A flush white panel round the TV on the wall the patient faces, with a strip of screen over the TV and a line of light beneath. The TV and its damping mounts move 3.5 cm forward onto its face, so everything on the TV keeps working | The strip is a still: care team by role and the day's plan, made up and marked simulated |
| Clinician workstation | A rounded white top on a timber-and-white cabinet against the pier by the window, a screen and keyboard, a second screen on an arm and a lit rail. In W1 the visitor chair moves nearer the window while it's there, and back after | A still with made-up headings, no patient's name or diagnosis. It doesn't copy or change PACS |
| Bedside cabinet | A white top and timber front at the bed head on the window side, clear of the pendant, its outlets and the space round the bed | A design concept; clinical supplies are kept apart from it |

**Where they go.** Measured from the two room models (`fittings-data.js`). Both have the bed head on the north wall and the TV at its foot, so the fittings go the same way round in each, and no furniture is moved except W1's visitor chair. The reference picture's desk spot, between the patient wall and the door, would stand in the keep-clear area past the bed's foot, so the desk is by the window instead.

**Nothing in the way.** One function in `layout.js` checks a room: no two solid things overlap (each object is the boxes of its own parts), and nothing solid stands in the keep-clear areas Equipment labels draws, 0.9 m in front of a door, 0.6 m in front of the wardrobe, or a 70 cm walking route from the door to the bed. All of these are this model's own and illustrative: an empty result means no modelled conflict was found, not that a room is safe, and it isn't a compliance check. With the theme on, in both rooms, nothing new is in the way, and every registered feature in the room can be seen from at least one view. What it does find was there before: the bed, pendant, monitor and IV pole overlap by their boxes as the room model exports them, and the ventilator, recliner, overbed table and pendant stand partly in the keep-clear areas, as Equipment labels has always shown. The room safety scan will run the same function on a room as a visitor arranges it. Placed wall items can't hang over the staff panel, the patient wall or the workstation's screen.

**Across the room** is a new view, appended to the list, from the front of the room toward the window: the angle of the reference picture. The cinematic tour stops there too, before it ends at the Dollhouse.

**Its cost.** Timed with `scripts/perf_baseline.py` on one Apple M5 laptop at 1440 by 900, one draw, median: the room as it loads takes the same as before (13.7 ms in three alternating runs each), Future ICU by day 14.0 to 14.7 ms, and at night 15.9 ms against 16.4 ms for the circadian scheme alone before. The fittings are built the first time they're asked for, and their screens are drawn once.

### The smart clinical wall and the clinician workstation (15 November 2026)

**The screens start working.** The Future ICU fittings' screens showed stills; now they follow one switch, and the room.

| Feature | What it does | What it isn't |
|---|---|---|
| Smart clinical wall | One switch, under **Smart clinical wall** (code 43): **Clinical** puts made-up heart rate, oxygen saturation, blood pressure, breathing rate and temperature, care tasks and equipment on the staff panel at the bed head, and leaves the patient the time and date. **Patient** shows the orientation screen on the TV, the care team by role and the day's plan on the strip over it, and two buttons, *Ask for something* and *Family*, that open the communication board and family connection when clicked in the room. **Relaxation** puts a scene across the patient wall, the TV included. Otherwise the staff panel rests on a dark screen with the time, so visitors don't see observations | Every value is made up, fixed and marked simulated. The staff panel never stands in for the bedside monitor, which keeps running with its alarms unchanged |
| Transform my environment | One choice (code 44) sets the patient wall, the ceiling above the bed and the room's light together, from seven scenes drawn in code: forest, ocean, mountains, desert, garden, clear sky and night sky. The pictures fade and the light eases over four seconds; Off goes back the same way. Without the patient wall, the scene shows on the TV | Drawn scenes, not footage. It makes no claim about sleep, delirium or recovery, and living plants stay outside the glass |
| Clinician workstation | **Open the workstation**: a made-up patient's dashboard with no name or diagnosis, in **Nurse view** (care tasks first) or **Doctor view** (observations and the plan first). Choose a task and it shows what it needs and lights where that is in the room; **Done** ticks it off there and on the staff panel. Where supplies are kept, apart from the patient's own things. Four hands-free buttons stand in for spoken commands. In Emergency it shows where the emergency equipment is, lights it, and marks the clear route from the door to the bed on the floor. **Open PACS** opens PACS as it is | Nothing listens, and the station answers on its screen only: nothing about the patient is said aloud. The Emergency view is not a validated emergency protocol. It copies and changes nothing in PACS |

**In step with the room.** One rule, `wallFor()` in `wall-data.js`, decides what the wall shows, highest first: Emergency (the patient wall and every scene off, the staff panel to Clinical, the workstation's emergency view); the room mode staff chose (Clinical turns the wall to Clinical, Comfort to Relaxation); Quiet now (nothing on the patient's wall); then the switch and the scene chosen. A sedated patient gets no buttons. A scene's light sits under the patient's state and any mode, so they always come first. No mode changes a choice: leaving one puts the wall back as it was. Check 14 runs the rule over all 720 combinations of switch, mode, patient state, Quiet now and scene.

**Read from the pillow.** In Patient view the strip's letters are no smaller than the orientation screen's own lines, which were already shown to read from the bed, and from the bed's eye point they subtend at least 40 arcminutes in both rooms. Check 08 measures both on screen.

**Old links.** A link without codes 43 and 44 opens with the switch at Patient and no scene, which shows nothing without the fittings: the reference link opens the same room. The other themes leave both alone.

**Its cost.** Timed with `scripts/perf_baseline.py` on one Apple M5 laptop at 1440 by 900 at 2x, one draw, median, alternating with `main`: the room as it loads 13.0 to 13.1 ms against 12.8 to 13.0; Future ICU by day 13.2 to 14.4 ms against 13.1 to 13.2, and at night 14.6 to 14.9 against 14.4 to 14.6; with the forest scene on, 14.2 ms. The scene pictures are built the first time a scene is shown, the screens are drawn only when what they show changes, and a scene's fade and its light's easing end, so the page goes back to drawing only on change.

### Room modes that move everything together (15 November 2026)

**One table, five levels.** `modes.js` holds one row per mode saying, in words, what it does to each of nine systems (light, blinds, the glazed front, the wall screens, scenes, sound, the bedside screens, notices and overlays) and at which level of priority, highest first: clinical safety and emergency access; what staff have switched on; patient communication; patient comfort preferences; decoration and presentation. `decide()` settles a clash: the higher level wins, and a lower one never overrides it. The page's own order agrees: the light is a mode's, over the patient's state's, over a scene's, over the room as configured; the wall follows `wallFor()`, which reads each mode's row. Check 14 tests the table, the levels and the agreement with no browser, as check 12 tests PACS's rules.

| Feature | What it does | What it isn't |
|---|---|---|
| Family visit | Warm, ambient light; smart glass on the glazed front softened to a frost unless the passport says the patient would rather see out, so staff can still see in; family connection on the TV, with drawn placeholder photographs and a message, and the patient's chosen scene round it on the patient wall. Staff end it, and Emergency outranks it | The photographs and message are placeholders. A real front's privacy level and staff sight lines would be agreed with the care team |
| Cleaning | For a room between patients: the patient figure goes (and comes back on leaving), the light goes bright, the screens and scenes go off, and a checklist lights each step in turn: hands, the bed rails and controls, the overbed table, the monitor and pump screens, the ventilator, the pendant, the wall controls and handles, the chairs, and hands again | An order to show the idea, not a protocol. Finishing it says the checklist is finished, never that the room is clean or disinfected. No airflow is drawn in the room: it links to the ventilation plan |
| The notes | Every mode's note is one line that says what changed and ends "Medical alarms always stay on." | |
| The bar on a phone | Two rows of three, As set, Comfort, Privacy / Clinical, Family visit, Cleaning, with Emergency on its own row below, as chosen on 15 November from three layouts at 390 px | |
| The board | Eleven requests: the first seven, then I need water, I can't sleep, I need help communicating, and a request for privacy, which a nurse can act on from the list by turning on Privacy. Each shows in English and Arabic, right to left, with a line in both that a nurse confirms anything clinical in person. The Arabic is one block of data in `patient-states.js` | The Arabic was written for this demo and must be checked by a native reader |

### The presentation (15 November 2026)

| Feature | What it does | What it isn't |
|---|---|---|
| Two tours, one engine | `guide.js` takes a script. The nine steps that were the guided tour are **Room basics**, still at `?tour=guided` and on a smaller button. **Experience the ICU of the future** is the main button, the home page's first action, and `?tour=future` | |
| Experience the ICU of the future | One patient's story in eight steps, in the brief's order: entering the room; comfort (a forest scene and Comfort mode); asking for water on the board, the tour playing the patient; the pendant and the lines' clips, tags and slack; the wall turned to Clinical and a task at the workstation; Family visit moving everything together; before and after, the room arriving piece by piece within one step; and Iham's closing lines. Finish puts the room back exactly, the patient's request and the panels the steps opened included | Each step that plays a person says so. Every value on its screens is made up |
| Transform the ICU | A staged Before / after, beside it under View: today's room, then the Future ICU arriving one piece at a time in seven captions, and the visitor's own room back at the end. It runs as a demo, so it changes no choice or link | Today's room is a typical arrangement, not every ICU, and its equipment is a typical kit, not SSMC's inventory. Side by side was left out: two rooms drawn at once would double the page's drawing |
| The home page | Leads with the Future ICU, across the room toward the window, and its first action is the new tour. The link preview uses the same picture | |

### The digital twin (15 November 2026)

**The room's hidden state, readable.** `twin-data.js` holds one rule, `twinRead()`, which takes what the room is doing now and says in words what each system's state is, and how the room stands in five separate parts. `twin.js` draws it in a panel in the options' place; main.js reads the room again on the next frame after anything changes (a choice, a mode, the patient's state, a scene, the time, a request, a Cleaning tick) and once any easing has finished.

| Feature | What it does | What it isn't |
|---|---|---|
| Systems | The bed (the patient's state, the position and time the bed panel shows, its reminder, the line clips); the ceiling (the light, warm or cool and how bright, and where it comes from: the mode, the patient's state, a scene or the room as set; the tray, the sky or a scene; the two sensors); the walls (the smart clinical wall, the patient's screen, the glass, the comfort control's readout); storage (the wardrobe, the cabinet, the workstation's supply cupboards); equipment (the pendant, the monitor, the workstation's tasks); the floor (the layout check on what the visitor added, the room's own kit as modelled, and the route to the bed); and the mode in force, with its row of the mode table and the level each part acts at | Every value is one the room already has: the comfort control's readout is simulated, the noise is the acoustic model's illustrative level |
| Room health | Environmental comfort, equipment organisation, access clearance, communication readiness and the cleaning checklist, each read on its own, each saying "Nothing to look at", "Look at this", "Not running now" or "Finished", with the reason. An added item overlapping something is marked red, by name | No total, no score and no ranking: the parts are never added up. No vital signs: those are PACS's. The clear areas are this model's own, not hospital rules |

### Room intelligence and the room safety scan (15 November 2026)

| Feature | What it does | What it isn't |
|---|---|---|
| Ceiling sensors | Three flush discs, over the bed, inside the door and over the middle of the room, placed from each room's own points (`intel.js`). An option, code 45, off by default; Future ICU turns them on | They sense nothing here |
| Room intelligence | Activate it to see the floor each sensor would cover. Two buttons raise made-up events: the patient moving toward the bed's edge (the bed and the clear area on the patient's right lit), and something left in a clear area (a made-up box at the bed's foot). Each puts a notice in front of staff, above the room, and on the clinician workstation; it stays until a person acknowledges it, at either. Acknowledging takes the notice away, not what it pointed at. Reset takes the events away. The readings it lists are the room's own: the comfort control's, the acoustic model's and the daylight sensor's | Nothing watches or listens: no camera, no microphone, no sensor reading. Every event is a button. It changes no alarm or device, isn't AI, and is a concept for decision support, not a validated clinical device |
| Room safety scan | `layout.js`'s `checkLayout`, the check the Future ICU fittings passed, run on the visitor's own arrangement: every placed item against the keep-clear areas, the space in front of each door, the wardrobe's front and the route to the bed, and against everything solid. Green, amber or red, in words too. A result explains why, lights the item, and `suggestSpot` marks the nearest spot within a couple of metres where it would be clear. The visitor moves it, and the scan reads the room again | The areas are this model's own, set as data and illustrative: green is "no modelled conflict found", never "safe", and it isn't a compliance check against hospital rules |

The lines that said placed items aren't checked now say the scan checks them against this model's own clear areas, not hospital rules: on each placed item's card, under Place items, and in Room basics' step about placing items.

### Equipment and cables (15 November 2026)

| Feature | What it does | What it isn't |
|---|---|---|
| Ceiling pendant | Its own card: it carries the monitor, the pumps, shelves and outlets off the floor at the bed head | A visual model, not a specified product |
| Cable channels | Flush covers on the ceiling from the top of the pendant to the wall behind the bed head, then along the wall above the staff panel: one for power and data, a separate one for medical gas. A docking spot outlined on the floor where the ventilator stands, fed from the pendant. Code 46, off by default, on in Future ICU. Measured from each room's own pendant and kit (`cables.js`) | Illustrative routes, not an engineering design: the services, the ceiling and the gas would need their own review |
| The cable overlay | **Traditional**: power, data and gas cables loose on the floor from the wall to the ventilator, the bed and the pumps, and no channels. **Organised**: the same kinds routed through the channels and down the pendant, gas in its own channel, nothing on the floor, and the patient's lines outlined at the bed. Each kind has a label in the room as well as a colour. It's an overlay: it changes no choice or link | The patient's own lines aren't repeated: the bed's clips and tags show them, and a button opens APIS's Tubing & movement as it is. Nothing retracts, clamps or disconnects a line, and nothing moves by itself |

Check 14 tests that medical gas never shares a channel with power or data, that every kind has its own colour and label, that Traditional's cables are all on the floor and Organised's none, and that each route names points the room has.

### Light across 24 hours (15 November 2026)

**A plan for the day's light.** A button under Time of day opens a panel in the options panel's place, with a 24-hour timeline from 6 am to 6 am. It sits on top of what was here: the sun path, the circadian scheme (shown while the panel is open, not chosen), the blinds and Comfort mode's after-dark rule. The time slider still runs from 6 am to 10 pm; the timeline reaches the small hours.

| Feature | What it does | What it isn't |
|---|---|---|
| Light across 24 hours | Drag the hour, step it by keyboard, or jump to a phase: morning daylight (bright, cool white, blinds up), afternoon comfort (steady daylight white, blinds half down against glare), evening wind-down (warming and dimming, blinds coming down) and night sleep (warm and low, blinds down). Each change takes an hour or more. Quiet hours, 10 pm to 6 am, are marked. **Play the day** runs the 24 hours once, in 24 seconds (with reduced motion it steps through the phases), and stops | A plan, not a measurement: the light and blinds are given in words. Light alone isn't shown to prevent delirium; the card cites the pilot that saw less and the randomised trial that found no effect. Clinical and Emergency always win, and Emergency closes it. It changes no choice or link, and closing it puts the time back |

**Also fixed:** a feature card was placed by its size while its opening animation still had it scaled down, so a tall card could end a few pixels past the window. Cards are now placed by their laid-out size. The circadian card's new button showed it.

### The words (15 November 2026)

**Plainer words everywhere a visitor reads or hears them.** Iham's Word file rewrote the site's text in 285 before-and-after pairs: the home page, the configurator and its panels, PACS, APIS and the ventilation page. 141 went in as written. 70 went in with a guard the plain version dropped put back (made up, simulated, not connected, not a compliance check, alarms and devices not changed). 51 went in with a fact or a name corrected: four themes, not three; modelled sunlight, not real; one name per thing (theme, configurator, Standard room); the sound sensor sends a notice, not an alert. 13 were left as they were, because a name decision stands or the line isn't shown any more. The walkthrough's ten lines were left alone, and its legend still says confidence.

**Two names change, from the Word file:** Emergency-ready is now **Emergency**, and Compare with today's room is now **Before / after**. The checks that read a changed sentence read the new one; where a check guards the meaning (not a compliance check, alarms are not changed, Staff can end it), the words were kept.

### A cooler look, and the panel in step with it (16 November 2026)

**The Future ICU room reads cool by day.** Iham asked for the room to look less dated and nearer the reference picture. The arrangement was already the picture's, so this changes the mood. The theme now sets powder-blue walls, a new **Grey ash-look** feature wall and the slate floor. The circadian scheme is drawn white-balanced: its 4,800 K midday light used to come out orange, because the colour was measured against daylight, and now reads as the cool white its card says it is, with the evening still warm and dim. No stated number changes: every card, the digital twin and Light across 24 hours give the same kelvin as before. A slate floor sends grey light up at the ceiling instead of sand, and the ceiling tray's line of light has a soft halo on the tiles. The halo is drawn, and adds no light to the room.

**What stays as it was.** The other three themes, every option and every share link: a link holds its choices, so a Future ICU link made before today opens with the walls, timber and floor it was made with. Before / after, Transform the ICU and the tour's Before and after step build the new look a piece at a time. The home page's first picture and the link preview were taken again.

**The panel takes the room theme's colour.** The options panel and the bars over the room let a little more of the room show through, with a wider blur and a lit top edge. The accent follows the theme: blue for Future ICU, the site's teal for Calm Clinical and a custom room, clay for Desert Sanctuary and rose-brown for Family Suite. Text contrast was measured from pictures with the darkest and the brightest room behind the panel, light and dark, in all four themes: the lowest is 4.7 to 1, where the page before this change measured 4.75. A phone keeps the lighter blur it had, and a visitor who asks their device for less transparency gets solid panels.

**Not done, and why.** No potted plant: living plants stay out of patient-care areas, as the nature card says. No photographic render: the room keeps the site's drawn style. (A day later the home page gained ten photo-like pictures of the room, made from the 3D room itself: see the section on the story below. The room in the configurator still keeps its drawn style.) The picture's blue light at every hour was not copied, because warm, dim light in the evening is what this design argues for.

### When someone comes in (16 November 2026)

**A person walks in, and the room is ready for them.** Iham asked to see a nurse, a doctor or the patient walk into the room and the room respond. Three short demos under View do this for a nurse, a doctor and a family visitor. A walking patient was left out: a patient arrives in intensive care on a bed, and admission isn't built. A plain figure, drawn in code in the patient figure's style with no face and no name, walks the route from the door to the bedside that the layout check already uses, at a calm pace, and turns to face the bed. With reduced motion it is at the bedside at once.

**What the room does, and who decides.** The demo plays a badge tapped at the door, and its first caption says so. A badge only wakes screens that staff could open by hand: for a nurse the staff panel leaves standby and the clinician workstation opens in Nurse view, and for a doctor it opens in Doctor view. The light and the room's mode change only when a person chooses: the doctor chooses Clinical mode, a nurse turns on Family visit for the visitor, and each caption names who. For a family visitor the staff panel stays in standby, so nothing clinical is shown to them. Emergency comes first: no arrival demo starts over it.

**What it isn't.** Nothing recognises anyone: there is no camera, no face or voice recognition and no tracking, and the figure senses nothing. It is a demo, so it changes no choice, link or summary, and the room is back as it was when it ends or is stopped. A real one would need the hospital's access-control system and a privacy review.

| File | What it holds |
|---|---|
| `arrival-data.js` | The three people, the view an arrival is watched from in each room, and the walk's arithmetic along `layout.js`'s route. No Three.js, so check 14 reads it in Node |
| `arrival.js` | The figure and its walk |
| `demos.js` | `arrivalNurse`, `arrivalDoctor`, `arrivalFamily` |

### The staff panel's clock (16 November 2026)

**A fault put right.** The staff panel's standby clock, and the time on its Clinical screen, kept the old time when the time of day changed by the slider, the stops or Day and Night. They are redrawn now whenever the minute they show changes, as the TV's orientation screen already was. Found while taking pictures for the cooler look.

### The Future ICU room at 9 pm (16 November 2026)

**The evening no longer turns the room khaki.** At 9 pm the circadian light is 2,300 K, which has almost no blue in it, and the Future ICU walls and floor are mostly blue. Drawn plainly, that product is a dark yellow, and the room read olive. After dark an eye has no daylight to compare a lamp with and adapts part of the way to it, so the light that falls on the room is now drawn three tenths of the way to white, at the brightness it had. The light lines themselves keep their amber. Measured on the same picture of W1, the wall's colour saturation fell from 46% to 26% and the floor's from 43% to 27%, at about the same hue.

**What stays as it was.** Every stated kelvin and level, the afternoon picture (identical, pixel for pixel), the other light schemes at any hour, and so the other three themes. Sunset moves a little, because the adjustment grows as daylight goes. It is a drawing choice, as the white balance is: the pictures are not a lighting calculation, and no lux level should be read from them.

### The story at the top of the home page (17 November 2026)

**What it is.** The home page now opens with the proposed isolation room, W1, in ten pictures: the whole room, the glazed front from the corridor, the bed-head wall, the clinician's workstation, the patient board seen from the pillow, the recliner, the room in the morning, in the evening and at night, and the view back to the door. The first carries the page's headline and its three actions, and the last opens the same room in the configurator.

**The pictures are the 3D room, finished as photos with an AI image tool. They are concept pictures, not measured renders.** Each began as a capture of the configurator's own room (W1, Future ICU, with the bed shown empty) from one camera. That capture went to Blueprint Studio Asset Generator, whose reply names the model `gpt-image-2.5-sunburst-2026-09-08`, with a written instruction to keep the room's shape and every fitting in place and to give them real materials and light. The page says so beside the pictures. What the tool added is its own: the grain of the timber, the reflections on the floor, the fall of the light and the bedding are not specified anywhere in this proposal.

**What was checked, and what was made again.** Each picture was compared with its capture at full size. The first evening and night pictures came back square and reframed, so both were made again from the room's own captures at those hours. Two pictures came back with the patient board's small print rewritten into sentences this proposal never wrote, and one with the wrong year, so both were made again with only the board's large words kept and the small print drawn as grey lines. The bed-head and door pictures first showed coloured traces on the bedside monitor without the SIMULATED mark the configurator draws on its screens, and the door picture had a small mark on the board that wasn't a word. Both were made again from captures in which the monitor's and the ventilator's screens had first been painted dark and the board's small print painted as grey bars. The door picture took two tries: the first came back with a bracket between a wall unit and the ceiling arm that the room doesn't have.

**Known limits.** In the bed-head and door pictures the bedside monitor and the ventilator's screen are dark, where the configurator shows simulated traces under its SIMULATED mark. The staff panel reads 3:32 pm in the afternoon pictures, the hour they were captured at. No picture shows a person.

**How the page behaves.** Without scripts, on a phone, on a short window and for a visitor who asks for less motion, the ten pictures are one after another with their words, and a phone's first screen still shows the room and then the first action. On a wide, tall screen a script pins one stage to the window and each picture hands over to the next as the page scrolls: a fade, a slight zoom and a short wipe. Morning, evening and night are one camera, so those two hand-overs only fade. The comparison of the proposed room with the room today, and the three figures that sat beside it, moved to their own block straight after.

**Where things are.** The masters are `scripts/site/story/*.webp`. `06_build_site.py` writes their sizes into `assets/img` (a `STORY` line in `scripts/site/index.template.html`), and `home_from_published.py` rebuilds the page from those. The words, the styles and the script are in the template and `scripts/site/styles.css`. The image tool's terms give its user ownership of what it makes; nothing here is licensed from anyone else.

### Every feature and its status

One row per feature, from the same registry as the feature cards, plus the parts of the site that aren't cards and what isn't built. "What it isn't" is the start of each card's limits; the card has the rest, with its evidence.

**Status:** *Concept* is shown in the 3D room as a design; a real one would need engineering, infection-control and clinical review. *Simulated* runs on the site with made-up data or events; nothing real is connected, measured or sent. *Tool* does real work on this model: a tour, a check, a plan or a link. *Not built* is listed so nobody looks for it.

| Group | Feature | What it does | What it isn't | Status |
|---|---|---|---|---|
| Comfort | Privacy system | Privacy at the glazed front and the window when the patient needs it. Staff can end it at once. | Opaque glass hides the patient from the corridor, so staff decide when it's used. In an isolation room the door still needs its seal and pressure tests. | Concept |
| Comfort | Patient orientation display | The TV can show the weekday, the date, the time of day and whether it's day or night, with a few calm lines beside them: where the patient is, visiting confirmed by staff, and what's planned. Large enough to read from the bed. | It makes no claim about delirium or sleep. The lines are samples: a real screen would show only what staff have confirmed, and never patient details. | Simulated |
| Comfort | Nature and environmental display | Calm, natural things to look at from the bed: a scene on the TV, a sky on the ceiling, a digital aquarium and a printed leaf panel. | Emergency turns the screens off. Living plants and fish tanks stay out of patient-care areas, as CDC guidance advises. | Concept |
| Comfort | Patient states | The room follows the patient: sedated or unresponsive, awake, or recovering. A control above the room, beside the room modes. | Staff decide the state: the room never works it out from the patient. It changes no alarm, device or clinical setting, and it changes no choice or link. | Simulated |
| Comfort | Communication board | Large buttons for a patient who can't speak: I need help, I am in pain, I feel cold, I feel hot, I need repositioning, I want to contact my family, I need a nurse. | Simulated. It does not replace a certified nurse-call system: a real one is wired, tested and maintained to its own standard. | Simulated |
| Comfort | Personal comfort passport | A sample record of what a patient would like: light, temperature, music or quiet, a nature scene, family photographs, privacy, how they communicate, and entertainment. | A sample for a made-up patient, with no name. Temperature is shown, not applied: no approved limits were supplied. | Simulated |
| Comfort | Sound-level sensor | A closed door keeps a patient's voice in. This sensor concept gives that hearing back: it would recognise a groan or a call for help and put a notice in front of the nurse outside, who looks in through the glass before deciding to enter. | Simulated here, with no microphone. Patients on a breathing machine or sedated may not make sounds, and alarms can set it off. It doesn't replace the nurse call. | Simulated |
| Comfort | Room comfort control | A wall-mounted temperature and humidity control concept. It is not connected to room equipment or patient measurements. | No hospital-approved temperature limits were supplied, so nothing is set from here. Cleaning the air is the plant room's job. | Concept |
| Comfort | Acoustic comfort mode | A picture of the room's sound: where it comes from, where it's loudest, and what acoustic fittings would change. Simulated. | Not a measurement: no microphone is used, and nothing listens. Every level is illustrative, and the fittings' effect is made up. | Simulated |
| Comfort | Patient wall | The wall the patient faces, made into one calm surface round the TV. | Simulated: no real names, plans or times. Whether the strip can be read from the pillow depends on the patient's eyesight; Patient view shows the distance. | Simulated |
| Comfort | Transform my environment | Bringing the outside world into intensive care: the patient chooses a forest, the ocean, mountains, the desert, a garden, a clear sky or a night sky, and the room takes it on. | Drawn scenes, not footage, and a concept: it makes no claim about sleep, delirium or recovery. Living plants stay outside the glass. | Concept |
| Bed | Pressure-awareness bed | A sensor grid in the mattress shows where the patient's weight bears, so staff can see when a position has been held too long. Simulated. | Simulated: not a measurement. It predicts no injury, and it never moves a patient: staff assess and reposition by the patient's own positioning plan. | Simulated |
| Bed | Line clips and tags | A clip on each line's route round the patient, with a tag in its colour, and each line's slack shown before a move. Simulated. | Simulated: no tension, force or flow is worked out, and no line or device is monitored. The clips don't secure a line, and nothing here changes a real line, connector or device. | Simulated |
| Light | Adaptive circadian lighting | Room light that follows the day: cool and bright by day, warm and dim in the evening. | Light alone isn't shown to prevent delirium. Care comes first: Clinical and Emergency modes switch to full, neutral light. | Concept |
| Light | Light across 24 hours | A plan for the room's light and blinds over a whole day, in four phases: morning daylight, afternoon comfort, evening wind-down and night sleep. | A plan, not a measurement, and light alone isn't shown to prevent delirium. Clinical and Emergency are the staff override and always win. | Concept |
| Light | Daylight sensor | A small light sensor on the window sill. It tells Comfort mode and PACS whether daylight is coming in. | A concept: it isn't connected to anything, and it reads nothing here. | Concept |
| Light | Ceiling tray | A calm ceiling over the bed: square tiles in a shallow tray, with a soft line of light round its edge. | A design concept. In this model its light adds no brightness: the room's own lights do that. | Concept |
| Family | Family connection | Family close by on the bedside screens: photographs, a video call, a voice message, a personal scene, familiar music and a line on the orientation screen. | No photograph is uploaded, no camera or microphone is used, and nothing is sent. A real call would need the hospital's approved system. | Simulated |
| Family | Family visit | A mode for when family come: the room warms, privacy is as the patient asked, and family connection is on the wall they face. | Simulated: the photographs are drawn placeholders and the message is made up. Softened glass is a concept: a real front needs its privacy level and staff sight lines agreed with the care team. | Simulated |
| Storage | Built-in sliding wardrobe | Compact, organised storage for the patient's clothing, belongings and daily necessities, built in floor to ceiling against the back wall, clear of the entry route. | It takes about the same floor area as the freestanding wardrobe it replaced: what it adds is height, easier cleaning and a tidier look. A design concept: no inventory display or electronic lock is modelled. | Concept |
| Storage | Bedside cabinet | A place near the bed for the patient's own small things: glasses, a phone, a book. | A design concept. Clinical supplies are kept apart from it. | Concept |
| Clinical workflow | Staff panel | Information for the care team on the wall behind the bed head, where staff look and the patient can't. | Simulated: its values are made up and fixed, not readings, and it never stands in for the patient monitor, which stays on the pendant, working, with its alarms unchanged. A real one needs integration, infection-control and regulatory review. | Simulated |
| Clinical workflow | Clinician workstation | A desk for the care team in the room, by the window and out of the space round the bed. | Simulated: a made-up patient, made-up values and a scripted task list. Nothing listens: each hands-free button stands in for a spoken command. | Simulated |
| Clinical workflow | Smart clinical wall | One wall, more than one purpose: the staff panel and the patient wall show what each person needs now. Staff get observations, tasks and equipment; the patient gets the day, the time, the care team and the plan; at rest, a calm scene. | Simulated: every value is made up and fixed, and the staff panel never stands in for the bedside monitor, which keeps running with its alarms unchanged. Observations show only in Clinical, so visitors don't see them. | Simulated |
| Clinical workflow | Room modes | The room changes together: one choice of mode moves the light, the blinds, the glass, the wall screens, scenes, sound, the bedside screens, notices and overlays, in step. | A demonstration of the idea. No mode touches an alarm, a medical device or the bedside monitor. | Simulated |
| Clinical workflow | Cleaning | A mode for the room between patients: bright light, the bed empty, and the surfaces that are touched most marked one after another. | An order to show the idea, not a cleaning protocol: products, contact times and the order of work are the infection-control team's. Finishing the checklist says it's finished, and never that the room is clean or disinfected. | Simulated |
| Clinical workflow | Transform the ICU | Today's room, then the room of the future arriving a piece at a time: the difference is how the room works, not only how it looks. | Today's room is a typical arrangement, not every ICU, and the equipment is a typical ICU kit, not SSMC's inventory. A demo: it changes no choice or link. | Tool |
| Clinical workflow | Digital twin | A digital reflection of the room: its hidden state made visible, so the space, equipment, environment and work can be seen together. | A concept: it reads only this model, with its simulated and illustrative values, and monitors nothing. The five parts are never added into a score, and it shows no vital signs, which are PACS's. | Simulated |
| Clinical workflow | Room intelligence | A room that notices when help may be needed: it would help staff see a possible safety concern while keeping the room calm and uncluttered. | A concept for monitoring and decision support, not a validated clinical device. Nothing watches or listens: no camera, no microphone and no sensor reading; every event is a button. | Simulated |
| Clinical workflow | Room safety scan | Check a room digitally before it's built: the items a visitor places, against the space that care needs. | The areas are this model's own, set as data and illustrative: green means no modelled conflict found, never that a room is safe, and it isn't a compliance check against hospital rules. | Tool |
| Clinical workflow | When someone comes in | The room gets its screens ready for whoever comes in: a nurse, a doctor or a family visitor taps a badge at the door. | Simulated: the demo plays the badge, and a plain figure stands in for the person. Nothing recognises anyone: no camera, no face or voice recognition and no tracking. Only a person changes the light or the room's mode. | Simulated |
| Clinical workflow | Ceiling pendant | Ceiling services: the monitor, the pumps and the outlets hang from the ceiling at the bed head, so the floor round the bed stays clearer and the essentials are within reach. | A visual model of a pendant, not a specified product. Its position, load, services and the ceiling's structure would need engineering, infection-control and clinical review. | Concept |
| Clinical workflow | Cables and channels | Less clutter, better access and safer movement: the cables and lines round the bed shown by kind, loose and then organised. | Illustrative routes, not an engineering or clinical design. Nothing retracts, clamps or disconnects a line, and nothing moves by itself. | Concept |
| The site | Configurator | Rooms W1 and W3 on their measured shape: four themes, every finish, light and fitting as an option, the time of day, ten views, a share link that holds the exact room, a summary and an image. | A design proposal, not a construction or procurement drawing. Furniture and finishes are assumed. | Tool |
| The site | Experience the ICU of the future | One patient's story in eight captioned steps, about two minutes, from the main button and the home page. | A tour of this proposal: the patient is played by the tour, and every value is made up. | Tool |
| The site | Room basics | The first guided tour, nine captioned steps, about a minute and a half, at `?tour=guided`. | A tour of the room's basics, not of the Future ICU. | Tool |
| The site | Before / after | Every option at its default, with none of the placed items, at the same view and time. Press again for the room as designed. | Today's room is a typical arrangement, not every ICU. | Tool |
| The site | Patient view | The room from the pillow, turning only as far as a head can. | Eyesight differs: it shows what is in view, not what a patient can read. | Tool |
| The site | Equipment labels | Names each piece of equipment and shades the space to keep clear for care round the bed. | A sketch for discussion, not a compliance check. The areas carry no dimensions. | Tool |
| The site | Place items | Drag a tablet arm, privacy screen, hand rub, bins, sharps box, biophilic panel or family chair onto the room. | A visitor's sketch: the room safety scan checks it against this model's own clear areas, not hospital rules. | Tool |
| The site | Suggest a room | A few questions about the patient give an editable comfort and furnishing draft, with what changed and why, and undo. | A design suggestion: it never recommends care, and the answers stay out of links. | Tool |
| Clinical systems | PACS, the Physiological Adaptive Comfort System | Simulated vital signs and the patient's preferences lead to a suggestion, such as softer light. A nurse approves it before the room changes. | Not connected to a monitor: every reading is made up and scripted. It never controls an alarm or a device, and infers no diagnosis. | Simulated |
| Clinical systems | APIS, the Adaptive Patient Interface System | An idea for a gentler way to attach tubes, wires and sensors: what touches the skin, how each is held, where it runs, and its limits. | An idea, not a device: the approved device and its own instructions come first, and no force, flow or pressure is worked out. | Concept |
| The floor today | Walkthrough | The fourth-floor ICU as built, from the record drawing, to walk through. Click anything to see what it is and how sure we are about it. | Furnishings and finishes are assumed. Not for medical or construction use. | Tool |
| The floor today | Ventilation plan | Supply, return and exhaust for the floor, the pressure steps from corridor to entry room to bedroom, and a clean-air table. | Concept work, not SSMC's mechanical design: the values are assumed, from Dubai Health Authority guidance. | Concept |
| Not built | Ceiling lift | A track hoist over the bed for moving a patient, from Iham's list. | Not built: there wasn't time before the 16 November freeze. | Not built |
| Not built | Admission and room readiness | A board that follows a room from the last patient's discharge to the next one's arrival. Cleaning mode's checklist would be its first stage. | Not built: there wasn't time before the 16 November freeze. | Not built |
| Not built | Unit board | A board ranking the unit's patients by their vital signs. | Not built, by decision: this site ranks no one and gives no single score. REPORT.md says why. | Not built |

### How the room stays in step

Every system in the room listens to one table, in [`modes.js`](scripts/site/configurator/modes.js), rather than to each other. For each room mode it says, in words, what the mode does to the light, the blinds, the glazed front, the wall screens, the scenes, sound, the bedside screens, notices and overlays, and at which of five levels:

1. Clinical safety and emergency access
2. What staff have switched on
3. Patient communication
4. Patient comfort preferences
5. Decoration and presentation

| | Comfort | Privacy | Clinical | Family visit | Cleaning | Emergency |
|---|---|---|---|---|---|---|
| **Light** | Warm and dim (2) | as set | Full and neutral, with the task light (2) | Warm ambient (2) | Bright, for cleaning (2) | Full, with the task light (1) |
| **Blinds** | Lowered by day; after sunset as set (2) | Halfway down (2) | as set | as set | as set | as set |
| **Glazed front** | as set | Smart glass opaque (2) | as set | Softened, as the patient asked; staff can still see in (4) | Clear (2) | Clear (1) |
| **Wall screens** | Relaxation: a scene (2) | as set | Clinical: the staff panel's made-up observations (2) | Family connection on the patient wall (3) | Off: no patient (2) | Patient wall off; staff panel clinical (1) |
| **Scenes** | as set | as set | as set | as set | Off (2) | Off (1) |
| **Sound** | as set | as set | as set | as set | Demo sound stops (2) | Demo sound stops (1) |
| **Bedside screens** | as set | as set | as set | Family connection offered (3) | Closed: no patient (2) | Panels in the options' place close (1) |
| **Notices** | as set | as set | as set | as set | as set | Critical alarms as they always are (1) |
| **Overlays** | as set | as set | Equipment labels and keep-clear areas (2) | as set | High-touch surfaces in turn, hand-hygiene points, equipment to clean, and a checklist (2) | Equipment labels and keep-clear areas (1) |

When two things claim the same system, the higher level wins, and a lower level never overrides a higher one. That's why Clinical and Emergency always win over a scene, a patient's state, Light across 24 hours or a theme. Leaving a mode puts the room back as it was set: no mode changes a choice or a link. Medical alarms are in no row: no mode can touch them. Check 14 tests the table, its levels and the rule.

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

`scripts/08_check_configurator.py` tests the published site under `/<repo>/` in a software renderer. It covers load and download budget, all views and orbit limits, every route between views, a frame timed before the click that started a move or a glass fade, every option in both rooms (it fails if an option leaves the picture unchanged), all themes by day and night, opaque glass hiding what's behind it, the wall switch, spec codes across 24 rooms, the summary, image download, tour, Suggest a room's rules for every combination of answers, the vocal-distress cue in both rooms, the clean-air rows on the plan and on the comfort control's card, every feature card by click and by keyboard with every demo put back, the patient states with the board's three inputs, the passport saved and restored, family connection and Quiet now, the bed's pressure map in every position with the line check before a move and each line's slack, the Future ICU theme and its five fittings in both rooms with the layout check and every registered object seen from a view, the smart clinical wall through every room mode, patient state and Quiet now with its scenes, the strip read from the pillow and its buttons clicked in the room, the clinician workstation's views, a task to Done, the hands-free buttons, its Emergency view and PACS, every room mode's one-line note, Family visit's softened glass and family screen, Cleaning's checklist step by step and what finishing it says, the board's Arabic and privacy request, the bar at 390 px, Experience the ICU of the future step by step and back, Room basics and both tour links, Transform the ICU from today's room to the visitor's own, the digital twin's seven systems and five parts as the mode, the patient's state and Cleaning change, room intelligence's events, notices and reset, the room safety scan from a flagged item to its clear spot, the cable overlay Traditional and Organised with every kind labelled, Light across 24 hours through its four phases with the blinds following, quiet hours and the staff override, Explore features on High, Low and a phone, reduced motion, a phone layout, and accessibility with axe plus a keyboard walk through every control.

### What was tested, and what wasn't

**How it was tested.** Every check is automated, and every one ran in Chromium, on one Apple M5 MacBook. The browser checks drive Chromium with Playwright 1.64.1.

| Check | What it covers | How |
|---|---|---|
| `08_check_configurator.py` | The configurator: load and download budget, every view and route, every option in both rooms (it fails if an option leaves the picture unchanged), themes, old links opening the same room, every feature card by click and by keyboard, every demo, both tours, every mode and panel, the layout check, and no page errors. Accessibility with axe-core 4.10.2 on the panels | Chromium's software renderer, at 1366 × 820 and, with touch emulated, at 390 px wide. 919 checks passed, none failed, on the final commit |
| `11_check_apis.mjs`, `13_check_pacs.mjs` | APIS and PACS in both rooms: their panels, the room's response, Escape, and restoring the room | Chromium, with screenshots for review |
| `12_check_pacs_state.mjs` | PACS's approval rules, the vocal-distress cue's rules, and both tours' steps and words | Node, no browser |
| `14_check_features.mjs` | The feature registry, the mode table and its levels, the light's order, and the words: no outcome claim on a card or a demo's caption, no AI claimed for room intelligence, and no reading where nothing is measured (the pressure map, the lines, the wall's stills and the light plan) | Node, no browser |
| `05_check_viewer.py` | The walkthrough of the floor as built | Chromium |
| `perf_baseline.py` | Frame time, by the method in the Performance section | Measures; passes or fails nothing |

Since 14 November, every change to how the room looks was also approved by Hassan from before-and-after pictures before it was merged.

**What wasn't tested.**
- **Safari and Firefox:** never. Everything ran in Chromium.
- **Real phones and tablets:** never. Phone layouts and touch were emulated in Chromium at 390 px; the walkthrough's joystick and dragging items by touch most need a real device. [`docs/real-device-checklist.md`](docs/real-device-checklist.md) is the list to work through.
- **Other GPUs:** frame times were measured only on the M5. The software renderer shows the page is correct, not that it's fast on a slow machine.
- **Screen readers:** axe checks the markup, and every panel is tested by keyboard, but no test with a screen reader is recorded.
- **The Arabic** on the communication board was written for this demo and hasn't been checked by a native reader.
- **People:** no patient, nurse or clinician has used it, and nothing here is clinically validated. It isn't a medical device.

### Known limitations

- **The furniture is low-poly.** It comes from the as-built kit, and it looks blocky next to a car configurator's scanned models.
- **The toilet is empty.** In the dollhouse view its ceiling stays on for that reason.
- **W1's bathroom fixtures aren't in W1's toilet.** The fixtures and the Bathroom view stand in a solid wall block in the corner of the ante room, around (17.98, 27.46), and the view works only because walls aren't drawn from behind. Moving them was left for later. The record drawing puts the toilet's WC in its north-east corner, the basin in the south-west alcove and a shower in the south-east alcove.
- **Not tested in Safari, Firefox or on real phones.** See [What was tested, and what wasn't](#what-was-tested-and-what-wasnt).

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
