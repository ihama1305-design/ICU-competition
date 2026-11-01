# SSMC ICU: 3D mock-up of the existing ICU floor

A realistic 3D model of the Sheikh Shakhbout Medical City ICU (Tower D, 4th floor, Part a), built
for the SSMC ICU Interior Design Student Competition. The walls, doors, glazing and joinery are
read straight from the vector CAD layers of the as-built record drawing. The 16 patient rooms are
furnished with a typical ICU kit, and the scene is rendered with Blender Cycles.

![Patient room](renders/room_entry.png)
![West wing cutaway](renders/aerial_close.png)

| Output | What it is |
|---|---|
| `renders/*.png` | Cycles renders: whole-floor cutaway, close cutaway, patient room, bedside, view through the observation window, corridor and nurse station, top plan |
| `output/icu.blend` | Editable Blender scene with collections Shell, Ceiling, Facade, Doors, Glazing, Joinery, Equipment, Lights, Cameras |
| `output/icu.glb` | The same model for any 3D tool (Y-up, metres, flat colours) |
| `output/viewer/index.html` | Opens in a browser. Orbit, jump to a patient room or the nurse station, toggle the ceiling, click anything to name it |
| `REPORT.md` | How it was built, what is accurate and what is assumed |

Only `renders/` is committed. `output/` (the .blend, .glb and viewer, about 30 MB) is generated locally by `scripts/run_all.sh`.

## Rebuild

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
scripts/run_all.sh            # about 5 minutes on an M-series Mac; --preview for quick renders
```

Everything comes from `spec/icu_spec.json`: the sheet to read, grid calibration, ceiling height,
door and window heights, facade, materials, equipment positions, lights and cameras. Change a
number and run `scripts/run_all.sh` again.

## The drawings are not in this repo

`input/` is git-ignored. The SSMC record drawings were shared with competition entrants and this
repository is public. To rebuild, put the four PDFs from *SSMC ICU Design Competition - Reference
Drawings v1.zip* in `input/drawings/`.
