# Walk the SSMC ICU

A realistic, walkable 3D model of the existing ICU at Sheikh Shakhbout Medical City (Tower D, 4th floor, Part a), built for the SSMC ICU Interior Design Student Competition. The walls, doors, glazing and joinery are read straight from the vector CAD layers of the as-built record drawing. The 16 patient rooms are furnished with a typical ICU kit, and the scene is rendered with Blender Cycles.

**[Open the site](https://ihama1305-design.github.io/ICU-competition/)** · **[Walk through the model](https://ihama1305-design.github.io/ICU-competition/viewer/)** · **[Read the report](REPORT.md)**

This shows the floor as built, as a starting point for a redesign. It's independent student work, not made or endorsed by SSMC. Furnishings and finishes are assumed; [REPORT.md](REPORT.md) separates what is measured from what is assumed.

![Patient room](renders/room_entry.png)

## Walk through it

The [walkthrough](https://ihama1305-design.github.io/ICU-competition/viewer/) runs in the browser. Drag **Place person** onto any open floor spot and your view drops to their eye level.

- <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to walk, <kbd>Shift</kbd> to run, drag or arrow keys to look. Phones get on-screen arrows.
- <kbd>V</kbd> shows the person from behind.
- Walls, counters and the facade stop you. Doors and glass fronts let you through.
- The plan in the corner shows where you are. Click it to jump.
- Click anything to name it and see how sure the model is about it.

## Renders

| | |
|---|---|
| ![Whole floor](renders/aerial.png) | ![West wing cutaway](renders/aerial_close.png) |
| The whole floor with the ceiling off | Close cutaway of the west wing |
| ![Bedside](renders/bedside.png) | ![Nurse station](renders/corridor.png) |
| At the bedside (screens show made-up waveforms) | The central nurse station from the corridor |
| ![Observation window](renders/observation.png) | ![Top view](renders/plan.png) |
| Into a patient room through an observation window | Top view |

## Files

| File | What it is |
|---|---|
| [`docs/downloads/icu.blend`](docs/downloads/icu.blend) | Editable Blender 5.2 scene with collections Shell, Ceiling, Facade, Doors, Glazing, Joinery, Equipment, Lights, Cameras |
| [`docs/downloads/icu.glb`](docs/downloads/icu.glb) | The same model for other 3D tools (metres, Y-up, flat colours) |
| [`renders/`](renders/) | Full-size Cycles renders |
| [`REPORT.md`](REPORT.md) | How it was built, what is accurate and what is assumed |
| [`spec/icu_spec.json`](spec/icu_spec.json) | Every height, material, equipment position, light and camera ([field guide](spec/icu_spec.README.md)) |
| [`scripts/`](scripts/) | The pipeline, from drawing to website |
| [`docs/`](docs/) | The published website. It is generated, so edit `scripts/site/` and rebuild instead |

## Rebuild

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
scripts/run_all.sh            # about 5 minutes on an M-series Mac; --preview for quick renders
```

Change a number in `spec/icu_spec.json` and run `scripts/run_all.sh` again. A rebuild replaces `output/icu.blend`, so save your own Blender edits under another name.

## The drawings are not in this repo

`input/` is git-ignored, because the SSMC record drawings were shared with competition entrants and this repo is public. To rebuild, put the four PDFs from *SSMC ICU Design Competition - Reference Drawings v1.zip* in `input/drawings/`.
