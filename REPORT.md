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
| Ceiling panel layout | **Low** | Not on these sheets. A regular 2.4 m grid, plus nine panels where that grid leaves floor in the dark (`lighting.gap_fill` in the spec) and four over desk chairs it leaves dim (`lighting.desk_fill`). None of their positions come from the drawing |
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
  - U-shaped nurse station with a raised transaction ledge, 4 workstations and chairs, and a knee space under each workstation
  - Dictation desk with a workstation and chair
  - Corridor handrails, coved skirting, lay-in 600 mm ceiling grid in corridors and plain ceilings in patient rooms
  - Crash cart and stretcher alcoves
- **Lighting:**
  - 179 LED ceiling panels, each a real area light in the renders
  - Afternoon sun from the west-south-west, physical sky

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

### Performance

The initial download is about 2.3 MB. The page draws only when something changes, or while the TV or fish are in view. Measured on one fast laptop, an Apple M5 GPU, timing the draw and a pixel read so the figure is the GPU's work and not the display's refresh rate:

| Setup | Default, day | Heaviest of six tested |
|---|---|---|
| 1440 × 900 at 1x, full quality | 9 ms | 12 ms |
| 1440 × 900 at 2x, full quality (capped to about 3.6 megapixels) | 22 ms | 28 ms |
| 1440 × 900 at 2x, low-power mode | 13 ms | 15 ms |
| 390 × 844 at 3x, low-power mode, on this laptop's GPU | 8 ms | 8 ms |

**These are a best case, not a promise.** A typical integrated GPU will be several times slower, and no phone GPU was measured. So the page protects itself: if frames stay slower than about 30 a second while the view moves, it lowers the resolution step by step, then drops the bloom. Phones and small screens start in the low-power mode, with no bloom or glass transmission and fewer lights.

Each lighting scheme only turns on the lights it uses. With all 11 kept on at zero brightness, the 2x case took 43 ms. The price is a short recompile the first time a scheme is chosen, typically a fraction of a second.

### Checks

`scripts/08_check_configurator.py` tests the published site under `/<repo>/` in a software renderer. It covers load and download budget, all views and orbit limits, every route between views, every option in both rooms (it fails if an option leaves the picture unchanged), all themes by day and night, opaque glass hiding what's behind it, the wall switch, spec codes across 24 rooms, the summary, image download, tour, reduced motion, a phone layout, and accessibility with axe plus a keyboard walk through every control.

### Known limitations

- **The furniture is low-poly.** It comes from the as-built kit, and it looks blocky next to a car configurator's scanned models.
- **The toilet is empty.** In the dollhouse view its ceiling stays on for that reason.
- **Not tested on real phones or in Safari.** Touch was emulated in Chromium, and frame rates were only measured on one fast laptop.

## Rebuild and edit

- **Rebuild:** `scripts/run_all.sh` runs the full pipeline, including the configurator's rooms and test. Use `--preview` for quick renders.
- **Edit the model:** open `downloads/icu.blend`, or `output/icu.blend` after a rebuild. Each room's equipment is a set of linked copies, so editing one bed's mesh changes all 16.
- **Change numbers:** edit `spec/icu_spec.json`, such as `building.ceiling_height`, `building.window_head`, `kit.*` positions in the bed-head frame, or `cameras.*`.
- **Debug the plan reading:** `scripts/plan_debug.py` draws the extracted plan over the CAD layers to `build/sheets/plan_debug.png`.

## Known limitations

- Wall ends are slightly rounded where the raster closed small gaps (2–3 cm).
- The stair core in the north block is shown as an empty enclosure.
- Lift doors and toilet fittings are not modelled.
- Staff toilets, utility rooms and the core are walled and doored but unfurnished. Only sinks and counters from `A-EQPM` appear there.
- The `A-EQPM` outline for a service riser is built as a plain 0.90 m counter, because these sheets don't give its height.
- The nurse station's knee spaces aren't drawn. The sheets give only the station's outline, so each workstation gets an assumed opening 0.90 m wide and 0.55 m deep, 0.72 m high up to the underside of the top. The cabinet stays between the openings and behind them, under the transaction ledge.
- Glass, sky and procedural textures only look right in the Cycles renders. The GLB and viewer use flat colours.
- Heights other than the door head and windows are assumptions (see the table above).
