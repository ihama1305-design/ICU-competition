"""Export output/icu.blend -> output/icu.glb (Y-up, metres) and the self-contained viewer.

Procedural shaders don't survive glTF, so each material is flattened to its spec colour first
(the .blend keeps the full shaders). Screen images and glass transmission are kept.
"""
import base64
import json
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, "output", "icu.blend"))

for m in bpy.data.materials:
    if not m.node_tree:
        continue
    nt = m.node_tree
    bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
    out = next((n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"), None)
    if not bsdf or not out:
        continue
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    for name in ("Base Color", "Normal"):
        for ln in list(bsdf.inputs[name].links):
            if ln.from_node.type != "TEX_IMAGE":
                nt.links.remove(ln)
    if "spec_color" in m.keys() and not bsdf.inputs["Base Color"].links:
        bsdf.inputs["Base Color"].default_value = kit.hex_lin(m["spec_color"])

for cname in ("Kit", "Lights", "Cameras", "Context"):
    c = bpy.data.collections.get(cname)
    if c:
        for ob in list(c.objects):
            bpy.data.objects.remove(ob, do_unlink=True)

glb = os.path.join(ROOT, "output", "icu.glb")
bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True,
                          export_lights=False, export_cameras=False, export_extras=False)
print(f"  output/icu.glb {os.path.getsize(glb) / 1e6:.1f} MB")

# ------------------------------------------------------------------ viewer
import io  # noqa: E402

from PIL import Image  # noqa: E402

idx = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))
H = spec["building"]["ceiling_height"]
cams = spec["cameras"]
EYE = 1.6

# patient rooms, numbered by wing from north to south
mid_x = sum(p[0] for p in spec["plan"]["outline"]["points"]) / len(spec["plan"]["outline"]["points"])
rooms = sorted(idx["rooms"], key=lambda r: (r["front"][0] > mid_x, -r["front"][1]))
objects, counters = [], {"W": 0, "E": 0}
for r in rooms:
    wing = "E" if r["front"][0] > mid_x else "W"
    counters[wing] += 1
    iso = any("ISOLATION" in n for n in r["names"])
    fx, fy = r["front"]; nx, ny = r["front_normal_in"]; hx, hy = r["head"]
    objects.append({
        "id": r["id"], "group": "Patient rooms", "confidence": "low", "match": f"^{r['id']}_",
        "label": f"Room {wing}{counters[wing]}" + (" · isolation" if iso else ""),
        "sub": f"{r['area_m2']:.1f} m² · {r['front_width']:.2f} m glazed front",
        "notes": (f"{'Isolation' if iso else 'ICU'} patient room, {r['area_m2']:.1f} m² measured to the glass line. Walls, front and "
                  "observation window come from the drawing. The bed, pendant, monitor, pumps, ventilator, chairs and curtain "
                  "are a typical ICU kit placed the same way in every room, not SSMC's inventory."),
        "entry": {"eye": [fx + nx * 0.6, fy + ny * 0.6, EYE], "look": [hx, hy, 1.0]},
    })
S = [  # (id, group, label, confidence, regex on object names, notes)
    ("curtains", "Patient rooms", "Privacy curtains", "low", "^curtains", "Ceiling-track curtain behind each glazed front, partly drawn."),
    ("feature", "Patient rooms", "Feature walls, TVs, bed rails", "low", "^room_feature_walls", "Wood-look wall panel with a TV and bed-protection rails. Assumed finish."),
    ("nurse_ws", "Staff areas", "Nurse station workstations", "low", "^nurse_", "Monitors and chairs inside the U-shaped nurse station."),
    ("obs_ws", "Staff areas", "Observation desks", "low", "^obs_", "One workstation per observation nook, facing the two observation windows."),
    ("joinery", "Staff areas", "Counters, desks, nurse station", "med", "^joinery", "Outlines from the drawing's A-EQPM layer. Counter 0.90 m, desks 0.75 m, transaction ledge 1.10 m (assumed heights)."),
    ("basins", "Staff areas", "Hand-wash basins", "med", "^basin", "Basin positions from the drawing. Fitting design assumed."),
    ("carts", "Staff areas", "Crash cart and stretchers", "low", "^crash_cart|^stretcher", "Placed in the alcoves named on the drawing."),
    ("doors", "Openings", "Doors", "high", "^door_leaves", "Door leaves at the positions and swings drawn on the record drawing. Head height 2.41 m (H=2410 tags)."),
    ("frames", "Openings", "Door frames", "high", "^door_frames|^door_heads", "Frames around every opening found from the drawn door leaves."),
    ("fronts", "Openings", "Glazed room fronts", "med", "^front_glazing", "2.2 m glazed front to each patient room: a swing leaf plus a sliding or fixed glass panel, with a frosted band."),
    ("obs_win", "Openings", "Observation windows", "med", "^observation_windows", "WA31 windows, sill 1.0 m and head 1.4 m as tagged on the drawing. Check against the window schedule."),
    ("glass", "Facade", "Curtain wall glass", "med", "^facade_glass", "Inner face line from the drawing; glass 0.42 m outside it."),
    ("mullions", "Facade", "Curtain wall frame", "med", "^facade_mullions|^facade_transom", "Mullion spacing about 1.1 m, approximate."),
    ("upstand", "Facade", "Upstand and sill (700 mm)", "med", "^facade_upstand|^facade_sill", "TOW +700 AFFL on the drawing."),
    ("blinds", "Facade", "Roller blinds", "low", "^facade_blind", "Assumed, pulled down to varied heights."),
    ("fins", "Facade", "External fins", "low", "^facade_fins", "Vertical fins outside the glass, spacing approximate."),
    ("walls", "Building", "Walls", "high", "^walls|^wall_caps", "From the A-WALL, A-WALL-PATT and S-COLS layers of record drawing A1104-a, scaled from the 9 m grid."),
    ("floor_rooms", "Building", "Patient room floor", "med", "^floor_rooms", "Sheet vinyl LIN36 per the drawing's finish tags. Colour assumed."),
    ("floor", "Building", "Corridor floor", "med", "^floor_vinyl", "Sheet vinyl LIN37/LIN02 per the finish tags. Colour assumed."),
    ("rails", "Building", "Handrails and wall protection", "med", "^handrails|^bumper|^skirting", "Corridor handrail at 0.9 m, bumper rail and coved skirting."),
    ("ceiling", "Building", "Ceilings and lights", "low", "^ceiling|exam_light", f"Ceiling at {H:.2f} m, which is not on these sheets (assumed). Lay-in grid in corridors, plain in patient rooms."),
    ("slab", "Building", "Floor slab", "low", "^slab", "Slab edge and overhang beyond the facade."),
]
for sid, grp, lab, conf, rx, notes in S:
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
    "collide": "^(walls|joinery_|facade_upstand|facade_sill)",
    "first": {"eye": [fx + nx * 0.6, fy + ny * 0.6, EYE], "look": [hx, hy, 1.0]},
    "orbit": {"eye": cams.get("aerial_eye", [44.0, -16.0, 34.0]), "look": cams.get("aerial_look", [22.5, 15.5, 0.0])},
    "top": {"center": [mini["cx"], mini["cy"]], "size": mini["S"]},
    "minimap": mini,
}
im = Image.open(os.path.join(ROOT, "renders", "plan.png")).convert("RGB").resize((440, 440), Image.LANCZOS)
buf = io.BytesIO(); im.save(buf, "JPEG", quality=82)
tpl = open(os.path.join(ROOT, "scripts", "viewer_template.html")).read()
page = (tpl.replace("__GLB_BASE64__", base64.b64encode(open(glb, "rb").read()).decode())
        .replace("__OBJECTS_JSON__", json.dumps(objects, ensure_ascii=False))
        .replace("__VIEW_JSON__", json.dumps(view))
        .replace("__MINIMAP_B64__", base64.b64encode(buf.getvalue()).decode()))
os.makedirs(os.path.join(ROOT, "output", "viewer"), exist_ok=True)
# publish.html is the bare page (the artifact host adds the document shell);
# index.html wraps it so it opens straight from disk
open(os.path.join(ROOT, "output", "viewer", "publish.html"), "w").write(page)
vp = os.path.join(ROOT, "output", "viewer", "index.html")
head, body = page.split("</style>", 1)
open(vp, "w").write('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
                    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                    + head + "</style>\n</head>\n<body>\n" + body + "\n</body>\n</html>\n")
print(f"  output/viewer/index.html {os.path.getsize(vp) / 1e6:.1f} MB ({len(objects)} list entries)")
