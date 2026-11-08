# Walk the SSMC ICU

A realistic, walkable 3D model of the existing ICU at Sheikh Shakhbout Medical City (Tower D, 4th floor, Part a), built for the SSMC ICU Interior Design Student Competition. The walls, doors, glazing and joinery are read straight from the vector CAD layers of the as-built record drawing. The 16 patient rooms are furnished with a typical ICU kit, and the scene is rendered with Blender Cycles.

**[Open the site](https://ihama1305-design.github.io/ICU-competition/)** · **[Walk through the model](https://ihama1305-design.github.io/ICU-competition/viewer/)** · **[Configure a room](https://ihama1305-design.github.io/ICU-competition/configurator/)** · **[See the ventilation plan](https://ihama1305-design.github.io/ICU-competition/ventilation/)** · **[Read the report](REPORT.md)**

The model and walkthrough show the floor as built, as a starting point for a redesign. The configurator is a design proposal built on top of it. All of it is independent student work, not made or endorsed by SSMC. Furnishings and finishes are assumed; [REPORT.md](REPORT.md) separates what is measured from what is assumed.

![Patient room](renders/room_entry.png)

## Walk through it

The [walkthrough](https://ihama1305-design.github.io/ICU-competition/viewer/) runs in the browser. Drag **Place person** onto any open floor spot and your view drops to their eye level.

- <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to walk, <kbd>Shift</kbd> to run, drag or arrow keys to look. Phones get on-screen arrows.
- <kbd>V</kbd> shows the person from behind.
- Walls, counters and the facade stop you. Doors and glass fronts let you through.
- The plan in the corner shows where you are. Click it to jump.
- Click anything to name it and see how sure the model is about it.

## Configure a room

The [configurator](https://ihama1305-design.github.io/ICU-competition/configurator/) lets you spec one room the way you'd spec a car. Everything on it is a proposal, not the room as built.

- **Rooms:** isolation room W1 with its ante room, or standard room W3.
- **Views:** Overview, Family zone, Entrance, From the bed, Head turned, Window and Dollhouse. Drag to look around, or press <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>+</kbd> <kbd>-</kbd>. There's also a cinematic tour that starts and ends at the Dollhouse.
- **Themes:** Calm Clinical, Desert Sanctuary, Paediatric Play and Family Suite. Anything can still be changed afterwards.
- **Options:** paint, feature walls, floors, a sky ceiling, four lighting schemes, smart glass, blinds, TV, console, toys, seating, an aquarium, a patio and palms.
- **Day and night:** the sun follows a real path at Abu Dhabi's latitude.
- **Share:** the link holds the exact room. The summary lists every choice with its clinical notes, and you can save an image.

- **Tune it in:** answer a few questions for an editable comfort and furnishing draft. The panel shows what changed and why, with before-and-after and undo. It never changes the room or recommends care, and answers stay out of links.

To add an option, edit [`scripts/site/configurator/options.json`](scripts/site/configurator/options.json). A new kind of effect also needs a handler in `main.js`. Never renumber a `code` there: share links depend on them.

## Adaptive Patient Interface System (APIS)

Open **Configure a room → Explore APIS**. APIS is an additive educational feature in the existing Three.js configurator, built around the existing W1 and W3 bed metadata. It does not modify the Blender files, exported room geometry, dimensions, room options, patient-profile answers or share-code format. The separate WASD walkthrough remains intact.

- Six selectable attachment examples: NG feeding tube, IV securement, respiratory interface, respiratory strap contact, ECG electrode and urinary catheter securement. Enable the bedside markers to click them in the room, or select an example by keyboard in APIS.
- Opening an attachment focuses the room camera and shows a rotatable 3D schematic. Compare conventional/proposed arrangements, explode the layers and select a layer to highlight its purpose. Closing APIS or pressing Escape restores the room view.
- The material library distinguishes soft silicone adhesive, silicone-contact multilayer foam, molded silicone elastomer and TPE. Foam's absorbent layer is polyurethane; the four materials are not interchangeable.
- The tubing tab compares illustrative line routes during bed movement and patient turning. It addresses clutter, snagging, tension, bends, displacement concerns and access during repositioning. It does not alter the modeled bed or calculate forces, flow, pressure or safety.
- Established material uses and clinical principles are distinguished from experimental APIS external guides. IV sterile dressings and ECG conductive contacts are retained; external guides are shown away from skin. Added padding may increase pressure or compromise fit. Benefits are conditional design intentions, not measured APIS outcomes.

Clinical references appear beside the examples: the [2025 International Guideline](https://www.internationalguideline.com/drpi), CDC guidance for [IV devices](https://www.cdc.gov/infection-control/hcp/intravascular-catheter-related-infections/summary-recommendations.html) and [urinary catheters](https://www.cdc.gov/infection-control/hcp/cauti/summary-of-recommendations.html), and manufacturer material information. The supplied feature brief ended mid-sentence; APIS conservatively preserves device fit, function, securement, inspection and device-specific instructions. These are schematic adult-scale examples, not pediatric device selection or clinical instructions.

Source files: `scripts/site/configurator/apis.js`, `apis-data.js` and `apis.css`, with small integration points in `main.js` and `configurator.template.html`. The existing `06_build_site.py` publishes them. The committed `configurator/` copies are kept in sync so the static site can run without rebuilding Blender. No new runtime package or backend is needed.

The inspected checkout contains patient bed views, general room views, clickable equipment, patient comfort profiles and profile before/after comparison. A dedicated emergency mode or a view explicitly named “clinical” was not present in this checkout; APIS does not remove or replace any existing control.

The focused browser check is `node scripts/11_check_apis.mjs` (install Playwright with `npm install --prefix build/apis-tools playwright`; uses installed Chrome/Edge when available). It serves the site under a repository subpath and writes review screenshots to `build/shots/`.

Verification performed: W1 and W3 attachment interactions, real bedside-marker clicks, layer comparisons/highlights/explosion, material and routing views, camera/ceiling restoration, all existing camera presets, themes, day/night, profile before/after and undo, summary, tour, share-code reload, mobile overflow and keyboard focus, plus original walkthrough movement and object picking. The final NG illustration received a focused rerun. Browser checks found no uncaught JavaScript errors or missing local assets. Source/published copies, JavaScript syntax and whitespace checks passed. The full Blender/Python pipeline was not rerun: this environment has no installed Python, and the required intermediate build inputs are absent. The room model was not rebuilt.

## Ventilation concept

The [ventilation plan](https://ihama1305-design.github.io/ICU-competition/ventilation/) shows supply, return and exhaust grilles for the floor, with the air-change and pressure basis for each kind of room. **It's concept work, not SSMC's mechanical design:** the drawings show no grilles, ducts or air data. The plan, the walkthrough and the configurator all read the same list, so they can't disagree.

## Renders

| | |
|---|---|
| ![Whole floor](renders/aerial.png) | ![West wing cutaway](renders/aerial_close.png) |
| The whole floor with the ceiling off | Close cutaway of the west wing |
| ![Bedside](renders/bedside.png) | ![Nurse station](renders/corridor.png) |
| At the bedside (screens show made-up waveforms) | The central nurse station from the corridor |
| ![Observation window](renders/observation.png) | ![Top view](renders/plan.png) |
| Into a patient room through an observation window | Top view |
| ![Isolation room](renders/iso_room.png) | ![Bed and window](renders/iso_window.png) |
| Isolation room W1 along its length | W1's bed, with the window beside the patient |

## Files

| File | What it is |
|---|---|
| [`downloads/icu.blend`](downloads/icu.blend) | Editable Blender 5.2 scene with collections Shell, Ceiling, Facade, Doors, Glazing, Joinery, Equipment, Lights, Cameras |
| [`downloads/icu.glb`](downloads/icu.glb) | The same model for other 3D tools (metres, Y-up, flat colours) |
| [`renders/`](renders/) | Full-size Cycles renders |
| [`REPORT.md`](REPORT.md) | How it was built, what is accurate and what is assumed |
| [`spec/icu_spec.json`](spec/icu_spec.json) | Every height, material, equipment position, light and camera ([field guide](spec/icu_spec.README.md)) |
| [`scripts/`](scripts/) | The pipeline, from drawing to website |
| `index.html`, `viewer/`, `configurator/`, `ventilation/`, `assets/` | The published website, served from the repo root. It is generated, so edit `scripts/site/` and rebuild instead |
| [`docs/`](docs/) | The configurator's brief and build plan |

## Rebuild

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
scripts/run_all.sh            # about 20 minutes on an M-series Mac, most of it testing; --preview for quick renders
```

The pipeline runs 01 extract plan, 02 Blender scene, 09 fixture check, 10 ventilation plan, 03 renders, 04 GLB and viewer, 05 viewer test, 07 configurator rooms, 06 website, then 08 configurator test. 07 has to come before 06, which publishes what it writes. 05 and 08 need a network connection, because Three.js comes from a CDN.

Change a number in `spec/icu_spec.json` and run `scripts/run_all.sh` again. A rebuild replaces `output/icu.blend`, so save your own Blender edits under another name.

## The drawings are not in this repo

`input/` is git-ignored, because the SSMC record drawings were shared with competition entrants and this repo is public. To rebuild, put the four PDFs from *SSMC ICU Design Competition - Reference Drawings v1.zip* in `input/drawings/`.
