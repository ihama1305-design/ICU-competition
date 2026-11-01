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
idx = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))
hero = next(r for r in idx["rooms"] if r["id"] == idx["hero"])


def yup(p):
    return [p[0], p[2], -p[1]]


H = spec["building"]["ceiling_height"]
hx, hy = hero["head"]; fx, fy = hero["foot_dir"]; nx, ny = hero["front_normal_in"]; frx, fry = hero["front"]
places = {
    "Whole floor": {"eye": yup([44, -16, 34]), "look": yup([22.5, 15.5, 0])},
    "Patient room": {"eye": yup([frx + nx * 0.6, fry + ny * 0.6, 1.6]), "look": yup([hx, hy, 1.0])},
    "Nurse station": {"eye": yup(spec["cameras"].get("corridor_eye", [22.3, 27.0]) + [1.6]),
                      "look": yup(spec["cameras"].get("corridor_look", [22.2, 20.0]) + [1.1])},
    "Top view": {"eye": yup([22.5, 19, 70]), "look": yup([22.5, 19.01, 0])},
}
tpl = open(os.path.join(ROOT, "scripts", "viewer_template.html")).read()
html = (tpl.replace("__GLB_BASE64__", base64.b64encode(open(glb, "rb").read()).decode())
        .replace("__PLACES_JSON__", json.dumps(places))
        .replace("__META_JSON__", json.dumps({"name": spec["meta"]["name"], "status": spec["meta"]["status"],
                                              "ceiling": H, "rooms": len(idx["rooms"])})))
os.makedirs(os.path.join(ROOT, "output", "viewer"), exist_ok=True)
vp = os.path.join(ROOT, "output", "viewer", "index.html")
open(vp, "w").write(html)
print(f"  output/viewer/index.html {os.path.getsize(vp) / 1e6:.1f} MB")
