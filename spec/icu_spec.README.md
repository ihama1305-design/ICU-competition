# icu_spec.json: field guide

Units are metres and degrees. Blender works Z-up; the GLB is converted to Y-up on export.

| Section | What it controls |
|---|---|
| `source.sheet` | Which drawing PDF to read (`input/drawings/…`) |
| `source.calibration` | Grid bubble positions on the sheet and the 9 m grid spacing. This sets the scale and origin (grid 32 / E-3) |
| `source.plan_bounds_m` | The area of the sheet that is read |
| `plan.*` | Extraction settings: which CAD layers are walls, wall-fill radius, door-leaf size filters, maximum door gap, counter size limits, `room_keywords` (which of the drawing's texts are room labels, including the lifts `L45` to `L49` and the hose cabinets `FHC`), the south cut line (`cut_south_y`), facade inner faces and the building `outline`. `sink` recognises sink blocks: radius limits for the drain, bowl corners and tap base, the block's overall size, how far its tap and linework reach, and `rim_m`, the assumed rim width where only one outline is drawn |
| `building.*` | Heights: `ceiling_height` (assumed), `door_head` (from the `H=2410` tags), `window_sill`/`window_head` (from the `WA31` tag), counter, desk and ledge heights, skirting, handrails. `handrail_rooms` names the labels that count as corridor. Any other label cut off from them by a throat up to `handrail_throat_max` wide is a room and gets no rail; rails stop `handrail_door_clearance` short of its doorway. `facade.*` sets the upstand, glass offset, mullion and fin spacing |
| `materials.*` | Colour (sRGB hex), roughness and metallic for every surface. Floors get a vinyl speckle, the corridor ceiling a 600 mm grid, doors and handrails a wood grain |
| `kit.*` | Patient-room equipment in the bed-head frame: origin at the bed-head centre on the floor, +y toward the bed foot (corridor), x across the bed. `head_clearance` is the gap from the facade to the bed head. `room_overrides` gives a room its own bed head (world coordinates), kit positions and feature wall; each entry applies to the room containing its `label_at` |
| `lighting.*` | LED panel size, grid and wattage, sun elevation/azimuth, sky strength. `gap_fill` and `desk_fill` add assumed panels where the grid leaves floor dark or a desk chair dim. `site` is the configurator's sun path: latitude, the declination that puts the spec's sun on that path, and `north_offset_deg` |
| `cameras.*` | `hero_room_label` picks the room used for the interior shots. `room_entry` and `bedside` use the bed-head frame; `iso_entry`, `iso_room` and `iso_window` are world coordinates in isolation room W1. Also the observation-camera settings, corridor and aerial eye/look points, and per-camera `exposure` |
| `configurator.*` | The configurator's rooms, a design proposal: each room's `label_at`, its `cameras` (world `eye`, `look`, horizontal `hfov`), `anchors` for add-ons, `fixtures` (downlight points and slot lines for the lighting schemes), `via` points for moves through its door and, for W3, the side-on `layout`. W1's layout is its `kit.room_overrides` entry. `kit` changes a position for the configurator only. `walkable_add` adds polygons to the area the camera may stand in, for a view the walkable area otherwise goes around, like W1's bathroom |
| `render.*` | Cycles samples, resolution, denoise, view transform |
| `site.*` | The website's public URL, repo URL and publish folder (`dir`, the repo root) |

After changing anything, run `scripts/run_all.sh` (or `--preview`).
