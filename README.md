# Walk the SSMC ICU

A realistic, walkable 3D model of the existing ICU at Sheikh Shakhbout Medical City (Tower D, 4th floor, Part a), built for the SSMC ICU Interior Design Student Competition. The walls, doors, glazing and joinery are read straight from the vector CAD layers of the as-built record drawing. The 16 patient rooms are furnished with a typical ICU kit, and the scene is rendered with Blender Cycles.

**[Open the site](https://ihama1305-design.github.io/ICU-competition/)** · **[Walk through the model](https://ihama1305-design.github.io/ICU-competition/viewer/)** · **[Configure a room](https://ihama1305-design.github.io/ICU-competition/configurator/)** · **[Read the report](REPORT.md)**

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
| `index.html`, `viewer/`, `configurator/`, `assets/` | The published website, served from the repo root. It is generated, so edit `scripts/site/` and rebuild instead |
| [`docs/`](docs/) | The configurator's brief and build plan |

## Rebuild

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
scripts/run_all.sh            # about 20 minutes on an M-series Mac, most of it testing; --preview for quick renders
```

The pipeline runs 01 extract plan, 02 Blender scene, 09 fixture check, 03 renders, 04 GLB and viewer, 05 viewer test, 07 configurator rooms, 06 website, then 08 configurator test. 07 has to come before 06, which publishes what it writes. 05 and 08 need a network connection, because Three.js comes from a CDN.

Change a number in `spec/icu_spec.json` and run `scripts/run_all.sh` again. A rebuild replaces `output/icu.blend`, so save your own Blender edits under another name.

## The drawings are not in this repo

`input/` is git-ignored, because the SSMC record drawings were shared with competition entrants and this repo is public. To rebuild, put the four PDFs from *SSMC ICU Design Competition - Reference Drawings v1.zip* in `input/drawings/`.
