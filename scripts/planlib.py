"""Read the AutoCAD record drawings (vector PDF with layers) into world coordinates.

World frame: metres, origin at grid 32 / grid E-3, +X east along the column grid (32 -> 37),
+Y north toward row A-3, +Z up. The grid is 9.000 m both ways, which fixes the scale from the
drawing itself (the sheets are not printed at their nominal 1:100).
"""
import json
import os
import pickle

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPEC = os.path.join(ROOT, "spec", "icu_spec.json")


def load_spec():
    with open(SPEC) as fh:
        return json.load(fh)


def sheet_path(spec):
    return os.path.join(ROOT, spec["source"]["sheet"])


def calibration(spec):
    """Grid bubble centres (unrotated page points) -> world metres, from the spec."""
    c = spec["source"]["calibration"]
    pt_per_m = c["grid_spacing_pt"] / c["grid_spacing_m"]
    return c["col_origin_pt"], c["row_origin_pt"], pt_per_m


def page_to_world(spec, pts):
    """Unrotated page points (x_u, y_u) -> world (x, y). Columns run along y_u, rows along x_u."""
    col0, row0, k = calibration(spec)
    pts = np.asarray(pts, float)
    return np.stack([(pts[..., 1] - col0) / k, (pts[..., 0] - row0) / k], -1)


def drawings(spec):
    cache = os.path.join(ROOT, "build", "cache", "drawings.pkl")
    src = sheet_path(spec)
    if os.path.exists(cache) and os.path.getmtime(cache) > os.path.getmtime(src):
        with open(cache, "rb") as fh:
            return pickle.load(fh)
    import pymupdf
    page = pymupdf.open(src)[0]
    out = []
    for d in page.get_drawings():
        items = []
        for it in d["items"]:
            if it[0] == "l":
                items.append(("l", [(it[1].x, it[1].y), (it[2].x, it[2].y)]))
            elif it[0] == "c":
                p = [(q.x, q.y) for q in it[1:5]]
                t = np.linspace(0, 1, 9)[:, None]
                a, b, c, e = (np.array(v) for v in p)
                curve = (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t ** 2 * c + t ** 3 * e
                items.append(("l", [tuple(v) for v in curve]))
            elif it[0] == "re":
                r = it[1]
                items.append(("l", [(r.x0, r.y0), (r.x1, r.y0), (r.x1, r.y1), (r.x0, r.y1), (r.x0, r.y0)]))
            elif it[0] == "qu":
                q = it[1]
                items.append(("l", [(q.ul.x, q.ul.y), (q.ur.x, q.ur.y), (q.lr.x, q.lr.y), (q.ll.x, q.ll.y), (q.ul.x, q.ul.y)]))
        out.append({"layer": d.get("layer") or "", "type": d["type"], "fill": d.get("fill"),
                    "color": d.get("color"), "width": d.get("width") or 0, "items": items})
    os.makedirs(os.path.dirname(cache), exist_ok=True)
    with open(cache, "wb") as fh:
        pickle.dump(out, fh)
    return out


class Raster:
    """World-aligned raster: pixel (col, row) <-> world (x, y); row 0 is the north edge."""

    def __init__(self, bounds, res):
        self.x0, self.y0, self.x1, self.y1 = bounds
        self.res = res
        self.w = int(round((self.x1 - self.x0) / res))
        self.h = int(round((self.y1 - self.y0) / res))

    def to_px(self, xy):
        xy = np.asarray(xy, float)
        return np.stack([(xy[..., 0] - self.x0) / self.res, (self.y1 - xy[..., 1]) / self.res], -1)

    def to_world(self, px):
        px = np.asarray(px, float)
        return np.stack([self.x0 + px[..., 0] * self.res, self.y1 - px[..., 1] * self.res], -1)

    def draw(self, spec, drs, layers, stroke_px=1, fill=True):
        img = Image.new("L", (self.w, self.h), 0)
        g = ImageDraw.Draw(img)
        for d in drs:
            if d["layer"] not in layers:
                continue
            polys = [self.to_px(page_to_world(spec, pts)) for _, pts in d["items"]]
            if fill and d["type"] in ("f", "fs") and polys:
                ring = np.concatenate(polys)
                if len(ring) >= 3:
                    g.polygon([tuple(p) for p in ring], fill=255)
            for p in polys:
                g.line([tuple(q) for q in p], fill=255, width=stroke_px)
        return np.array(img) > 0
