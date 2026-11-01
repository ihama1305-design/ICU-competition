"""Read the record drawing's CAD layers and write build/plan.json (all world metres).

walls      polygons (with holes) from A-WALL / A-WALL-PATT / S-COLS, facade band removed
facade     inner-face polylines of the west/east curtain walls and the mullion positions
headers    door openings (thin gaps in walls next to a door symbol), with width and axis
leaves     door leaves (thin A-DOOR rectangles) as drawn: centre, axis, length
glazing    internal windows (A-GLAZ) as segments
counters   joinery outlines from A-EQPM (sinks, nurse station, observation desks)
floor      floor outline (building footprint inside the cut lines)
rooms      room names from the text layer with their label position and floor polygon
"""
import json
import os
import sys

import cv2
import numpy as np
import pymupdf
from scipy import ndimage as ndi
from shapely.geometry import LineString, Point, Polygon, MultiPolygon
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

spec = planlib.load_spec()
P = spec["plan"]
drs = planlib.drawings(spec)
R = planlib.Raster(spec["source"]["plan_bounds_m"], P["raster_m"])
px = lambda m: max(1, int(round(m / R.res)))  # noqa: E731


def disk(r_px):
    return cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r_px + 1, 2 * r_px + 1))


def polygons(mask, min_area, simplify):
    """Binary mask -> shapely polygons with holes, in world metres."""
    cs, hier = cv2.findContours(mask.astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    out = []
    if hier is None:
        return out
    hier = hier[0]
    for i, c in enumerate(cs):
        if hier[i][3] != -1:
            continue
        holes, j = [], hier[i][2]
        while j != -1:
            if len(cs[j]) >= 3:
                holes.append(R.to_world(cs[j][:, 0, :] + 0.5))
            j = hier[j][0]
        if len(c) < 3:
            continue
        poly = Polygon(R.to_world(c[:, 0, :] + 0.5), [h for h in holes if len(h) >= 3]).buffer(0)
        poly = poly.simplify(simplify)
        if poly.area >= min_area:
            out.extend(poly.geoms if isinstance(poly, MultiPolygon) else [poly])
    return out


def segments(layers, min_len=0.0):
    for d in drs:
        if d["layer"] not in layers:
            continue
        for _, pts in d["items"]:
            w = planlib.page_to_world(spec, pts)
            for a, b in zip(w, w[1:]):
                if np.hypot(*(b - a)) >= min_len:
                    yield d, a, b


# ---------------------------------------------------------------- facade lines
def facade_lines():
    """Inner faces of the curtain walls as polylines (from the spec, fitted to the drawing)."""
    out = {}
    for side, f in P["facade"].items():
        out[side] = [tuple(p) for p in f["inner_face"]]
    return out


FACADE = facade_lines()
y_cut = P["cut_south_y"]
def exterior_of(side):
    """Everything beyond a facade's inner face (outward side), minus a small inset band."""
    v = np.array(FACADE[side]); o = np.array(P["facade"][side]["outward"], float)
    far = v + o * 6.0
    inset = LineString(v).buffer(P["facade_band_m"], cap_style="flat")
    return unary_union([Polygon(np.concatenate([v, far[::-1]])).buffer(0), inset])


facade_band = unary_union([exterior_of(s) for s in FACADE])

# ---------------------------------------------------------------- walls
wall_layers = set(P["wall_layers"])
raw = R.draw(spec, drs, wall_layers, stroke_px=2)
bg = (~raw).astype(np.uint8)
# background where a disc of the max wall half-thickness cannot fit = inside a wall outline
opened = cv2.morphologyEx(bg, cv2.MORPH_OPEN, disk(px(P["wall_fill_radius_m"])))
walls = raw | ((bg > 0) & (opened == 0))
walls = cv2.morphologyEx(walls.astype(np.uint8), cv2.MORPH_OPEN, disk(1)) > 0

wall_polys = []
for poly in polygons(walls, P["min_wall_area_m2"], P["simplify_m"]):
    poly = poly.difference(facade_band)
    poly = poly.intersection(Polygon([(-100, y_cut), (100, y_cut), (100, 100), (-100, 100)]))
    for g in getattr(poly, "geoms", [poly]):
        if g.geom_type == "Polygon" and g.area >= P["min_wall_area_m2"]:
            wall_polys.append(g)
walls_u = unary_union(wall_polys)

# ---------------------------------------------------------------- door leaves and door symbols
leaves = []
door_px = R.draw(spec, drs, {"A-DOOR"}, stroke_px=2, fill=False)
for d in drs:
    if d["layer"] != "A-DOOR":
        continue
    pts = np.concatenate([planlib.page_to_world(spec, p) for _, p in d["items"]]) if d["items"] else None
    if pts is None or len(pts) < 4:
        continue
    (cx, cy), (w, h), a = cv2.minAreaRect(pts.astype(np.float32))
    L, T = max(w, h), min(w, h)
    if P["leaf_thickness_m"][0] <= T <= P["leaf_thickness_m"][1] and P["leaf_length_m"][0] <= L <= P["leaf_length_m"][1]:
        ang = a if w >= h else a + 90
        if cy < y_cut:
            continue
        leaves.append({"c": [round(cx, 3), round(cy, 3)], "angle_deg": round(ang % 180, 2),
                       "length": round(L, 3), "thickness": round(T, 3)})
# drop duplicates (leaf outline drawn twice)
uniq = []
for lf in leaves:
    if all(np.hypot(lf["c"][0] - u["c"][0], lf["c"][1] - u["c"][1]) > 0.05 for u in uniq):
        uniq.append(lf)
leaves = uniq

# ---------------------------------------------------------------- door openings (headers)
# Each drawn leaf finds its opening: rays along the wall line from the leaf (drawn closed, in
# the wall) or from its hinge (drawn open, square to the wall) run to the two jamb faces.
# Sampling across the wall thickness gives the header strip that spans the doorway.
from shapely.geometry import MultiPoint  # noqa: E402
from shapely.prepared import prep  # noqa: E402

walls_p = prep(walls_u)
MAXSPAN = P["max_door_gap_m"]


def ray_hit(q, t):
    seg = LineString([q, q + t * MAXSPAN])
    hit = seg.intersection(walls_u)
    if hit.is_empty:
        return None
    return min(Point(q).distance(g) for g in getattr(hit, "geoms", [hit]))


def opening_from(base, t, n, s_values, min_span):
    rows = []
    for s in s_values:
        q = base + n * s
        if walls_p.contains(Point(q)):
            continue
        dp, dm = ray_hit(q, t), ray_hit(q, -t)
        if dp is None or dm is None or not (min_span <= dp + dm <= MAXSPAN):
            rows.append(None)
            continue
        rows.append((s, q + t * dp, q - t * dm, dp + dm))
    # longest run of consecutive valid samples with a steady span = the wall band
    best, cur = [], []
    for r in rows + [None]:
        if r is not None and (not cur or abs(r[3] - cur[0][3]) < 0.06):
            cur.append(r)
        else:
            if len(cur) > len(best):
                best = cur
            cur = [r] if r is not None else []
    if len(best) < 3:
        return None
    hull = MultiPoint([p for r in best for p in (r[1], r[2])]).convex_hull
    return hull, float(np.median([r[3] for r in best])), best[-1][0] - best[0][0]


headers = []
for lf in leaves:
    a = np.radians(lf["angle_deg"]); u = np.array([np.cos(a), np.sin(a)]); nrm = np.array([-u[1], u[0]])
    c = np.array(lf["c"]); e1, e2 = c - u * lf["length"] / 2, c + u * lf["length"] / 2
    d1, d2 = walls_u.distance(Point(e1)), walls_u.distance(Point(e2))
    if min(d1, d2) > 0.15:
        continue
    found = None
    # drawn closed: the leaf lies on the wall line
    res = opening_from(c, u, nrm, np.arange(-0.3, 0.3001, 0.01), lf["length"] - 0.05)
    if res and res[2] <= 0.4:
        found = res
    else:
        # drawn open: the door line runs square to the leaf through the hinge
        h, tip = (e1, e2) if d1 <= d2 else (e2, e1)
        v = (tip - h) / np.linalg.norm(tip - h)
        res = opening_from(h, nrm, -v, np.arange(-0.06, 0.40, 0.01), lf["length"] - 0.1)
        if res and res[2] <= 0.4:
            found = res
    if found:
        poly, span, _ = found
        lf["opening_width"] = round(span, 3)
        headers.append(poly)

merged = unary_union([h.buffer(0.01) for h in headers]).buffer(-0.01)
header_list = []
for poly in getattr(merged, "geoms", [merged]):
    if poly.is_empty or poly.area < 0.02:
        continue
    rect = poly.minimum_rotated_rectangle
    xy = np.array(rect.exterior.coords)[:4]
    e = [np.hypot(*(xy[(i + 1) % 4] - xy[i])) for i in range(4)]
    i = int(np.argmax(e)); axis = (xy[(i + 1) % 4] - xy[i]) / e[i]
    header_list.append({"poly": [[round(v, 3) for v in p] for p in rect.exterior.coords],
                        "c": [round(rect.centroid.x, 3), round(rect.centroid.y, 3)],
                        "axis": [round(axis[0], 4), round(axis[1], 4)], "width": round(max(e), 3), "depth": round(min(e), 3)})
headers = header_list

# ---------------------------------------------------------------- internal glazing
glazing = []
for d, a, b in segments({"A-GLAZ"}, 0.3):
    m = (a + b) / 2
    if m[1] < y_cut:
        continue
    glazing.append({"a": [round(a[0], 3), round(a[1], 3)], "b": [round(b[0], 3), round(b[1], 3)]})
# merge the double lines of each pane into one centreline per window
wins = []
for g in sorted(glazing, key=lambda g: -np.hypot(g["b"][0] - g["a"][0], g["b"][1] - g["a"][1])):
    a, b = np.array(g["a"]), np.array(g["b"])
    ls = LineString([a, b])
    if any(ls.distance(LineString([w["a"], w["b"]])) < 0.15 and ls.centroid.distance(LineString([w["a"], w["b"]])) < 0.15 for w in wins):
        continue
    wins.append({"a": g["a"], "b": g["b"], "length": round(ls.length, 3)})
wins = [w for w in wins if w["length"] >= P["min_window_m"] and walls_u.distance(LineString([w["a"], w["b"]])) < 0.15]

# ---------------------------------------------------------------- joinery (A-EQPM)
eq = R.draw(spec, drs, {"A-EQPM"}, stroke_px=2, fill=False)
both = (walls | eq).astype(np.uint8)
lab, n = ndi.label(both == 0)
area = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1)) * R.res ** 2
dt = ndi.distance_transform_edt(both == 0) * R.res
mx = ndi.maximum(dt, lab, np.arange(1, n + 1))
touch = ndi.maximum(cv2.dilate(eq.astype(np.uint8), disk(2)), lab, np.arange(1, n + 1))
ok = np.zeros(n + 1, bool)
ok[1:] = (area < P["counter_max_area_m2"]) & (mx < P["counter_max_half_depth_m"]) & (touch > 0) & (area > 0.08)
counters = []
for poly in polygons(cv2.dilate((ok[lab]).astype(np.uint8), disk(1)) > 0, 0.08, 0.02):
    if poly.centroid.y < y_cut:
        continue
    # circles drawn inside sink counters = basins
    counters.append({"poly": [list(map(lambda v: round(v, 3), p)) for p in poly.exterior.coords]})

basins = []
for d in drs:
    if d["layer"] != "A-EQPM":
        continue
    for _, pts in d["items"]:
        if len(pts) != 9:  # Bezier arcs were sampled at 9 points
            continue
        w = planlib.page_to_world(spec, pts)
        A = np.c_[2 * w[:, 0], 2 * w[:, 1], np.ones(len(w))]
        (cx, cy, k), *_ = np.linalg.lstsq(A, (w ** 2).sum(1), rcond=None)
        r = float(np.sqrt(k + cx * cx + cy * cy))
        if 0.12 < r < 0.3 and np.abs(np.hypot(w[:, 0] - cx, w[:, 1] - cy) - r).max() < 0.01 and cy > y_cut:
            if all(np.hypot(cx - q["c"][0], cy - q["c"][1]) > 0.08 for q in basins):
                basins.append({"c": [round(cx, 3), round(cy, 3)], "r": round(r, 3)})

# ---------------------------------------------------------------- floor and rooms
floor = Polygon(P["outline"]["points"])

page = pymupdf.open(planlib.sheet_path(spec))[0]
rooms = []
space = floor.difference(walls_u.buffer(0.005))
spaces = list(space.geoms) if hasattr(space, "geoms") else [space]
for b in page.get_text("dict")["blocks"]:
    for ln in b.get("lines", []):
        t = " ".join(s["text"] for s in ln["spans"]).strip()
        if not any(k in t.upper() for k in P["room_keywords"]):
            continue
        bb = ln["bbox"]
        c = planlib.page_to_world(spec, [((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2)])[0]
        if not floor.contains(Point(c)):
            continue
        poly = next((s for s in spaces if s.contains(Point(c))), None)
        rooms.append({"name": t, "label_at": [round(c[0], 3), round(c[1], 3)],
                      "area_m2": round(poly.area, 2) if poly is not None else None})

plan = {
    "frame": "metres; origin grid 32/E-3; +x east (grid 32->37), +y north (toward A-3)",
    "facade": FACADE,
    "floor": [list(map(lambda v: round(v, 3), p)) for p in floor.exterior.coords],
    "walls": [{"outer": [list(map(lambda v: round(v, 3), p)) for p in w.exterior.coords],
               "holes": [[list(map(lambda v: round(v, 3), p)) for p in h.coords] for h in w.interiors]} for w in wall_polys],
    "headers": headers, "leaves": leaves, "windows": wins, "counters": counters, "basins": basins, "rooms": rooms,
}
os.makedirs(os.path.join(planlib.ROOT, "build"), exist_ok=True)
with open(os.path.join(planlib.ROOT, "build", "plan.json"), "w") as fh:
    json.dump(plan, fh)
print(f"walls {len(wall_polys)} ({walls_u.area:.1f} m2), headers {len(headers)}, leaves {len(leaves)}, windows {len(wins)}, "
      f"counters {len(counters)}, basins {len(basins)}, rooms {len(rooms)}, floor {floor.area:.0f} m2")
