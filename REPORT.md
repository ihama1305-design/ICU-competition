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
| Ceiling height 2.85 m | **Low** | Not on these sheets. One number in the spec |
| Finishes and colours (LIN36/LIN37 vinyl, wall paint) | Low | Finish codes are on the plan. The colours are assumed |
| Furniture and equipment | Low | A typical ICU kit placed the same way in every standard room and fitted to the shape of the two isolation rooms (`kit.room_overrides` in the spec). It is **not** an inventory of SSMC's equipment |
| Bed orientation: head toward the window, foot toward the glazed front | Low | The plan's bed-zone circle sits in the middle of the room. Bed facing the door is a common ICU layout, but it's an assumption. In the isolation rooms W1 and E1 the door is well to one side, so the bed sits side-on with its foot toward a party wall and the window beside it. Its centre is inside the drawn bed circle (W1: circle centre 11.50, 29.99, 2.69 m across; bed centre 11.20, 29.16) rather than on it, which leaves room behind the bed head and centres the TV on the flat foot wall |

## What's in the model

- **Floor area:** about 1,430 m² inside the facade. The cut at y = −4.7 m follows the wall line where Part b continues.
- **Patient rooms:** 16, of which 2 are isolation rooms with an ante room and toilet. Areas run from 30.3 to 38.5 m², median 34.9 m², measured to the glass line.
- **Equipment in each patient room:**
  - ICU bed with the backrest raised 30°, split rails and bedding
  - Twin-arm ceiling pendant with gas outlets, shelves, a patient monitor and three infusion pumps
  - Ventilator with breathing circuit, IV pole, recliner, visitor chair and overbed table
  - Examination light, privacy curtain on a track behind the glass front
  - Wood-look feature wall with a TV, bed-protection rails, and roller blinds on the facade
- **Rest of the floor:**
  - 8 observation nooks with desks and workstations
  - U-shaped nurse station with a raised transaction ledge, 4 workstations and chairs
  - Dictation desk with a workstation and chair
  - Corridor handrails, coved skirting, lay-in 600 mm ceiling grid in corridors and plain ceilings in patient rooms
  - Crash cart and stretcher alcoves
- **Lighting:**
  - 166 LED ceiling panels, each a real area light in the renders
  - Afternoon sun from the west-south-west, physical sky

## Observations relevant to the competition

These are read from the drawing and visible in the renders:

1. **Observation windows are 0.4 m-tall slots** at 1.0–1.4 m (`renders/observation.png`). From the nook, a nurse sees a strip across the bed rather than the patient's face and the whole room. If the tag is right, this limits observation. Confirm it against the window schedule.
2. **Each patient room front is fully glazed** and 2.2 m wide. Privacy depends on the curtain, and daylight can borrow through the front.
3. **Rooms run 7.2–9.0 m from the glazed front to the facade** (median 8.6 m). The slanted facade and the stepped corridor give the rooms slightly different shapes, from 30.3 to 38.5 m².
4. **There is one central nurse station plus 8 observation nooks,** one nook for each pair of rooms. Each nook has a window into both of its rooms.

## Rebuild and edit

- **Rebuild:** `scripts/run_all.sh` runs the full pipeline. Use `--preview` for quick renders.
- **Edit the model:** open `downloads/icu.blend`, or `output/icu.blend` after a rebuild. Each room's equipment is a set of linked copies, so editing one bed's mesh changes all 16.
- **Change numbers:** edit `spec/icu_spec.json`, such as `building.ceiling_height`, `building.window_head`, `kit.*` positions in the bed-head frame, or `cameras.*`.
- **Debug the plan reading:** `scripts/plan_debug.py` draws the extracted plan over the CAD layers to `build/sheets/plan_debug.png`.

## Known limitations

- Wall ends are slightly rounded where the raster closed small gaps (2–3 cm).
- The stair core in the north block is shown as an empty enclosure.
- Lift doors and toilet fittings are not modelled.
- Staff toilets, utility rooms and the core are walled and doored but unfurnished. Only sinks and counters from `A-EQPM` appear there.
- The `A-EQPM` outline labelled `MED. GAS RISER` is built as a plain 0.90 m counter, because these sheets don't give its height.
- Glass, sky and procedural textures only look right in the Cycles renders. The GLB and viewer use flat colours.
- Heights other than the door head and windows are assumptions (see the table above).
