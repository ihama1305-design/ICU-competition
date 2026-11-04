# icu_spec.json: field guide

Units are metres and degrees. Blender works Z-up; the GLB is converted to Y-up on export.

| Section | What it controls |
|---|---|
| `source.sheet` | Which drawing PDF to read (`input/drawings/…`) |
| `source.calibration` | Grid bubble positions on the sheet and the 9 m grid spacing. This sets the scale and origin (grid 32 / E-3) |
| `source.plan_bounds_m` | The area of the sheet that is read |
| `plan.*` | Extraction settings: which CAD layers are walls, wall-fill radius, door-leaf size filters, maximum door gap, counter size limits, the south cut line (`cut_south_y`), facade inner faces and the building `outline` |
| `building.*` | Heights: `ceiling_height` (assumed), `door_head` (from the `H=2410` tags), `window_sill`/`window_head` (from the `WA31` tag), counter, desk and ledge heights, skirting, handrails. `facade.*` sets the upstand, glass offset, mullion and fin spacing |
| `materials.*` | Colour (sRGB hex), roughness and metallic for every surface. Floors get a vinyl speckle, the corridor ceiling a 600 mm grid, doors and handrails a wood grain |
| `kit.*` | Patient-room equipment in the bed-head frame: origin at the bed-head centre on the floor, +y toward the bed foot (corridor), x across the bed. `head_clearance` is the gap from the facade to the bed head |
| `lighting.*` | LED panel size, grid and wattage, sun elevation/azimuth, sky strength |
| `cameras.*` | `hero_room_label` picks the room used for the interior shots. `room_entry` and `bedside` use the bed-head frame. Also the observation-camera settings, corridor and aerial eye/look points, and per-camera `exposure` |
| `render.*` | Cycles samples, resolution, denoise, view transform |
| `site.*` | The website's public URL, repo URL and publish folder (`dir`, the repo root) |

After changing anything, run `scripts/run_all.sh` (or `--preview`).
