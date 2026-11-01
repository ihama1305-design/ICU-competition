"""Draw build/plan.json over the drawing's wall layers -> build/sheets/plan_debug.png (survey aid)."""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

spec = planlib.load_spec()
plan = json.load(open(os.path.join(planlib.ROOT, "build", "plan.json")))
b = spec["source"]["plan_bounds_m"]
crop = [float(v) for v in sys.argv[1:5]] if len(sys.argv) >= 5 else b
res = float(sys.argv[5]) if len(sys.argv) >= 6 else 0.04
R = planlib.Raster(crop, res)
base = R.draw(spec, planlib.drawings(spec), {"A-WALL", "A-WALL-PATT", "A-DOOR", "A-GLAZ", "A-EQPM"}, fill=False)
img = Image.fromarray(np.where(base, 205, 255).astype(np.uint8)).convert("RGB")
g = ImageDraw.Draw(img, "RGBA")
P = lambda pts: [tuple(p) for p in R.to_px(np.array(pts))]  # noqa: E731
g.polygon(P(plan["floor"]), fill=(255, 230, 150, 70), outline=(200, 140, 0))
for w in plan["walls"]:
    g.polygon(P(w["outer"]), fill=(40, 40, 40, 200))
    for h in w["holes"]:
        g.polygon(P(h), fill=(255, 255, 255, 255))
for h in plan["headers"]:
    g.polygon(P(h["poly"]), fill=(255, 0, 0, 170))
for lf in plan["leaves"]:
    a = np.radians(lf["angle_deg"]); d = np.array([np.cos(a), np.sin(a)]) * lf["length"] / 2
    c = np.array(lf["c"]); g.line(P([c - d, c + d]), fill=(0, 160, 0), width=3)
for w in plan["windows"]:
    g.line(P([w["a"], w["b"]]), fill=(0, 90, 255), width=4)
for c in plan["counters"]:
    g.polygon(P(c["poly"]), fill=(240, 130, 0, 160))
for side in plan["facade"].values():
    g.line(P(side), fill=(0, 200, 200), width=3)
for r in plan["rooms"]:
    x, y = R.to_px(np.array(r["label_at"]))
    g.text((x - 30, y), r["name"][:18], fill=(150, 0, 150))
out = os.path.join(planlib.ROOT, "build", "sheets", "plan_debug.png")
img.save(out)
print(out, img.size)
