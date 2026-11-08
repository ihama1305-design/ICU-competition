"""Export output/icu.blend -> output/icu.glb (Y-up, metres) and the self-contained viewer.

Procedural shaders don't survive glTF, so each material is flattened to its spec colour first
(the .blend keeps the full shaders). Screen images and glass transmission are kept.
"""
import base64
import gzip
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
# ICU_BLEND overrides the scene to export (a rebuild writes output/icu.blend)
bpy.ops.wm.open_mainfile(filepath=os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend"))

kit.flatten_materials()

for cname in ("Kit", "Lights", "Cameras", "Context"):
    c = bpy.data.collections.get(cname)
    if c:
        for ob in list(c.objects):
            bpy.data.objects.remove(ob, do_unlink=True)
VENTS_SHOWN = spec["ventilation"]["show_in_model"]
if not VENTS_SHOWN:  # the grilles are hidden for now (spec ventilation.show_in_model)
    for ob in [o for o in bpy.data.objects if o.name.startswith("vent_")]:
        bpy.data.objects.remove(ob, do_unlink=True)

glb = os.path.join(ROOT, "output", "icu.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True,
                          export_lights=False, export_cameras=False, export_extras=False)
print(f"  output/icu.glb {os.path.getsize(glb) / 1e6:.1f} MB")

# a gzipped copy for the website, so the walkthrough loads faster (the viewer unpacks it)
SITE = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))
web_glb = os.path.join(SITE, "assets", "model", "icu.glb.gz")
os.makedirs(os.path.dirname(web_glb), exist_ok=True)
with open(web_glb, "wb") as fh:
    fh.write(gzip.compress(open(glb, "rb").read(), 9, mtime=0))
print(f"  assets/model/icu.glb.gz {os.path.getsize(web_glb) / 1e6:.1f} MB")

# ------------------------------------------------------------------ viewer
import io  # noqa: E402

from PIL import Image  # noqa: E402

idx = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))
H = spec["building"]["ceiling_height"]
cams = spec["cameras"]
EYE = 1.6

# patient rooms, numbered by wing from north to south
objects = []
for r in planlib.label_rooms(idx["rooms"], spec):
    iso = any("ISOLATION" in n for n in r["names"])
    fx, fy = r["front"]; nx, ny = r["front_normal_in"]; hx, hy = r["head"]
    objects.append({
        "id": r["id"], "group": "Patient rooms", "confidence": "low", "match": f"^{r['id']}_",
        "label": f"Room {r['label']}" + (" · isolation" if iso else ""),
        "sub": f"{r['area_m2']:.1f} m² · {r['front_width']:.2f} m glazed front",
        "notes": (f"{'Isolation' if iso else 'ICU'} patient room, {r['area_m2']:.1f} m² measured to the glass line. Walls, front and "
                  "observation window come from the drawing. The bed, pendant, monitor, pumps, ventilator, chairs and curtain "
                  "are a typical ICU kit, not SSMC's inventory. "
                  + ("The layout is fitted to this room's shape, with the bed near the drawn bed circle."
                     if iso else "It's placed the same way in every standard room.")),
        "entry": {"eye": [fx + nx * 0.6, fy + ny * 0.6, EYE], "look": [hx, hy, 1.0]},
    })
S = [  # (id, group, label, confidence, regex on object names, notes)
    ("curtains", "Patient rooms", "Privacy curtains", "low", "^curtains", "Ceiling-track curtain behind each glazed front, partly drawn."),
    ("feature", "Patient rooms", "Feature walls, TVs, bed rails", "low", "^room_feature_walls", "Wood-look wall panel with a TV and bed-protection rails. Assumed finish."),
    ("nurse_ws", "Staff areas", "Nurse station workstations", "low", "^nurse_", "Monitors and chairs inside the U-shaped nurse station."),
    ("obs_ws", "Staff areas", "Observation desks", "low", "^obs_", "One workstation per observation nook, facing the two observation windows."),
    ("dictation_ws", "Staff areas", "Dictation desk", "low", "^dictation_", "One workstation at the drawn counter labelled Dictation."),
    ("joinery", "Staff areas", "Counters, desks, nurse station", "med", "^joinery", "Outlines from the drawing's A-EQPM layer. Counter 0.90 m, desks 0.75 m, transaction ledge 1.10 m (assumed heights). The knee spaces under the workstations are also assumed."),
    ("basins", "Staff areas", "Hand-wash basins", "med", "^basin", "Basin positions from the drawing. Fitting design assumed."),
    ("carts", "Staff areas", "Crash cart and stretchers", "low", "^crash_cart|^stretcher", "Placed in the alcoves named on the drawing."),
    ("doors", "Openings", "Doors", "high", "^door_leaves", "Door leaves at the positions and swings drawn on the record drawing. Head height 2.41 m (H=2410 tags)."),
    ("frames", "Openings", "Door frames", "high", "^door_frames|^door_heads", "Frames around every opening found from the drawn door leaves."),
    ("fronts", "Openings", "Glazed room fronts", "med", "^front_glazing", "2.2 m glazed front to each patient room: a swing leaf plus a sliding or fixed glass panel, with a frosted band."),
    ("obs_win", "Openings", "Observation windows", "med", "^observation_windows", "WA31 windows, sill 1.0 m and head 1.4 m as tagged on the drawing. Check against the window schedule."),
    ("screen", "Openings", "Lobby glazed screen", "med", "^lobby_screen", "WN35 on the drawing: glass from the floor to 2.8 m, 5.8 m long, with a door drawn open. Frame spacing approximate."),
    ("glass", "Facade", "Curtain wall glass", "med", "^facade_glass", "Inner face line from the drawing; glass 0.42 m outside it."),
    ("mullions", "Facade", "Curtain wall frame", "med", "^facade_mullions|^facade_transom", "Mullion spacing about 1.1 m, approximate."),
    ("upstand", "Facade", "Upstand and sill (700 mm)", "med", "^facade_upstand|^facade_sill", "TOW +700 AFFL on the drawing."),
    ("blinds", "Facade", "Roller blinds", "low", "^facade_blind", "Assumed, pulled down to varied heights."),
    ("fins", "Facade", "External fins", "low", "^facade_fins", "Vertical fins outside the glass, spacing approximate."),
    ("walls", "Building", "Walls", "high", "^walls|^wall_caps", "From the A-WALL, A-WALL-PATT and S-COLS layers of record drawing A1104-a, scaled from the 9 m grid."),
    ("floor_rooms", "Building", "Patient room floor", "med", "^floor_rooms", "Sheet vinyl LIN36 per the drawing's finish tags. Colour assumed."),
    ("floor", "Building", "Corridor floor", "med", "^floor_vinyl", "Sheet vinyl LIN37/LIN02 per the finish tags. Colour assumed."),
    ("rails", "Building", "Handrails and wall protection", "med", "^handrails|^bumper|^skirting", "Corridor handrail at 0.9 m, bumper rail and coved skirting."),
    ("fire", "Building", "Fire extinguisher cabinets", "med", "^fire_cabinet", "Four cabinets at the positions and widths drawn on record drawing A1104-a (A-GENM, labelled FIRE EXTINGUISHER CABINET). Mounting height, door, sign and the extinguisher itself are assumed. The sheet shows no heights or extinguisher type."),
    ("ceiling", "Building", "Ceilings and lights", "low", "^ceiling|exam_light", f"Ceiling at {H:.2f} m, which is not on these sheets (assumed). Lay-in grid in corridors, plain in patient rooms. The panel layout is assumed too."),
    ("vent_supply", "Ventilation concept", "Supply grilles", "low", "^vent_supply", "Concept, not SSMC's mechanical design. The drawings show no grilles, ducts or air data. Positions come from rules by room type, for the air changes in REPORT.md. See the ventilation plan on the site."),
    ("vent_return", "Ventilation concept", "Return grilles", "low", "^vent_return", "Concept, not SSMC's mechanical design. Positions are assumed. Patient rooms and staff areas return air here, and isolation suites have none, because all their air goes out as exhaust."),
    ("vent_exhaust", "Ventilation concept", "Exhaust grilles", "low", "^vent_exhaust", "Concept, not SSMC's mechanical design. Positions are assumed. In isolation rooms the exhaust is as near the bed head as the pendant allows, and toilets and soiled rooms exhaust too."),
    ("slab", "Building", "Floor slab", "low", "^slab", "Slab edge and overhang beyond the facade."),
]
for sid, grp, lab, conf, rx, notes in S:
    if sid.startswith("vent_") and not VENTS_SHOWN:
        continue
    objects.append({"id": sid, "group": grp, "label": lab, "confidence": conf, "match": rx, "notes": notes})

hero = next(r for r in idx["rooms"] if r["id"] == idx["hero"])
pts = spec["plan"]["outline"]["points"]
bx0, bx1 = min(p[0] for p in pts), max(p[0] for p in pts)
by0, by1 = spec["plan"]["cut_south_y"], max(p[1] for p in pts)
mini = {"cx": (bx0 + bx1) / 2, "cy": (by0 + by1) / 2, "S": max(bx1 - bx0, by1 - by0) + 2}  # same as cam_plan
fx, fy = hero["front"]; nx, ny = hero["front_normal_in"]; hx, hy = hero["head"]
view = {
    "status": f"{len(idx['rooms'])} furnished patient rooms · ceiling {H:.2f} m (assumed) · walls, doors and glazing from record drawing A1104-a",
    "eye": EYE, "ceiling": H, "radius": 0.28,
    # rays that stop a walker. The middle one meets a desk top's edge: where knee space is open below it, the other two pass under and over the top
    "walk_heights": [0.3, spec["building"]["desk_height"] - 0.015, 1.0],
    "collide": "^(walls|joinery_|facade_upstand|facade_sill|fire_cabinet)",
    "first": {"eye": [fx + nx * 0.6, fy + ny * 0.6, EYE], "look": [hx, hy, 1.0]},
    "orbit": {"eye": cams.get("aerial_eye", [44.0, -16.0, 34.0]), "look": cams.get("aerial_look", [22.5, 15.5, 0.0])},
    "top": {"center": [mini["cx"], mini["cy"]], "size": mini["S"]},
    "minimap": mini,
}
im = Image.open(os.path.join(ROOT, "renders", "plan.png")).convert("RGB").resize((440, 440), Image.LANCZOS)
buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
tpl = open(os.path.join(ROOT, "scripts", "viewer_template.html")).read()
common = (tpl.replace("__OBJECTS_JSON__", json.dumps(objects, ensure_ascii=False))
          .replace("__VIEW_JSON__", json.dumps(view))
          .replace("__MINIMAP_B64__", base64.b64encode(buf.getvalue()).decode()))


def document(page, extra_head=""):
    head, body = page.split("</style>", 1)
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            + extra_head + head + "</style>\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")


# embedded model: output/viewer/index.html opens straight from disk, publish.html is the bare
# page for the artifact host (which adds the document shell)
page = common.replace("__GLB_BASE64__", base64.b64encode(open(glb, "rb").read()).decode()).replace("__GLB_URL__", "")
os.makedirs(os.path.join(ROOT, "output", "viewer"), exist_ok=True)
open(os.path.join(ROOT, "output", "viewer", "publish.html"), "w").write(page)
vp = os.path.join(ROOT, "output", "viewer", "index.html")
open(vp, "w").write(document(page))
print(f"  output/viewer/index.html {os.path.getsize(vp) / 1e6:.1f} MB ({len(objects)} list entries)")

# website: fetches the compressed model and links back to the overview
site = (common.replace("__GLB_BASE64__", "").replace("__GLB_URL__", "../assets/model/icu.glb.gz")
        .replace("<!--HOME_LINK-->", '<a class="v" href="../">Overview</a>'))
sp = os.path.join(SITE, "viewer", "index.html")
os.makedirs(os.path.dirname(sp), exist_ok=True)
open(sp, "w").write(document(site, '<meta name="robots" content="noindex">\n'
                                   '<meta name="description" content="Walk through a 3D model of the SSMC 4th-floor ICU in your browser.">\n'
                                   '<link rel="icon" href="../favicon.svg" type="image/svg+xml">\n'))
print(f"  viewer/index.html {os.path.getsize(sp) / 1e6:.2f} MB")
