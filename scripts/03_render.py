"""Render the cameras in output/icu.blend with Cycles -> renders/<camera>.png

  python scripts/03_render.py                 all cameras at spec render settings
  python scripts/03_render.py --preview       quarter samples, half resolution
  python scripts/03_render.py cam_aerial ...  only these cameras
Top-down and aerial cameras hide the ceiling (cutaway); interior cameras keep it.
"""
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
R = spec["render"]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
preview = "--preview" in sys.argv

bpy.ops.wm.open_mainfile(filepath=os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend"))
sc = bpy.context.scene
sc.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
try:
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for d in prefs.devices:
        d.use = d.type != "CPU"
    sc.cycles.device = "GPU"
except Exception:
    sc.cycles.device = "CPU"
cy = sc.cycles
cy.samples = max(16, R["samples"] // (4 if preview else 1))
cy.use_denoising = R["denoise"]
cy.max_bounces = 8; cy.diffuse_bounces = 4; cy.glossy_bounces = 4; cy.transmission_bounces = 8
cy.sample_clamp_indirect = 8.0
cy.use_light_tree = True
sc.view_settings.view_transform = R["view_transform"]
try:
    sc.view_settings.look = R["look"]
except TypeError:
    pass
w, h = R["resolution"]
sc.render.resolution_x, sc.render.resolution_y = (w // 2, h // 2) if preview else (w, h)
sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = "PNG"

ceiling = bpy.data.collections["Ceiling"]
cams = [o for o in bpy.data.collections["Cameras"].objects if o.type == "CAMERA"]
cams = [c for c in cams if not args or c.name in args]
exposure = spec.get("cameras", {}).get("exposure", {})
os.makedirs(os.path.join(ROOT, "renders"), exist_ok=True)
for cam in sorted(cams, key=lambda c: c.name):
    cut = cam.name in ("cam_plan", "cam_aerial", "cam_aerial_close")
    ceiling.hide_render = cut
    for ob in bpy.data.collections["Lights"].objects:
        if ob.type == "LIGHT" and ob.data.type != "SUN":
            ob.hide_render = cut and cam.name == "cam_plan"
    sc.camera = cam
    sc.view_settings.exposure = exposure.get(cam.name, 0.0)
    if cam.name == "cam_plan":
        sc.render.resolution_x = sc.render.resolution_y = (900 if preview else 1800)
    else:
        sc.render.resolution_x, sc.render.resolution_y = (w // 2, h // 2) if preview else (w, h)
    out = os.path.join(ROOT, "renders", f"{cam.name[4:]}{'_preview' if preview else ''}.png")
    sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print("  renders/" + os.path.basename(out))
