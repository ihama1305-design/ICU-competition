"""Read the record drawing's CAD layers and write build/plan.json (all world metres).

walls      polygons (with holes) from A-WALL / A-WALL-PATT / S-COLS, facade band removed
facade     inner-face polylines of the west/east curtain walls and the mullion positions
headers    door openings (thin gaps in walls next to a door symbol), with width and axis
leaves     door leaves (thin A-DOOR rectangles) as drawn: centre, axis, length
glazing    internal windows (A-GLAZ) as segments
counters   joinery outlines from A-EQPM (sinks, nurse station, observation desks)
basins     circular basins from A-EQPM, then sink blocks: bowl on P-SANR-FIXT, tap on A-EQPM
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
from shapely.geometry import LineString, MultiPoint, Point, Polygon, MultiPolygon, box
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


def fit_circle(w):
    """Least-squares circle through world points: centre x, centre y, radius."""
    A = np.c_[2 * w[:, 0], 2 * w[:, 1], np.ones(len(w))]
    (cx, cy, k), *_ = np.linalg.lstsq(A, (w ** 2).sum(1), rcond=None)
    return cx, cy, float(np.sqrt(k + cx * cx + cy * cy))


def bezier_arcs(layer):
    """Bezier arcs on a layer, which were sampled at 9 points, as (world points, centre x, centre y, radius)."""
    return [(w, *fit_circle(w)) for d in drs if d["layer"] == layer for _, pts in d["items"] if len(pts) == 9
            for w in [planlib.page_to_world(spec, pts)]]


def within(r, limits):
    return limits[0] < r < limits[1]


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
from shapely.prepared import prep  # noqa: E402

walls_p = prep(walls_u)
MAXSPAN = P["max_door_gap_m"]


def ray_hit(q, t):
    seg = LineString([q, q + t * MAXSPAN])
    hit = seg.intersection(walls_u)
    if hit.is_empty:
        return None
    return min(Point(q).distance(g) for g in getattr(hit, "geoms", [hit]))


def opening_from(base, t, n, s_values, min_span, max_span=MAXSPAN):
    rows = []
    for s in s_values:
        q = base + n * s
        if walls_p.contains(Point(q)):
            continue
        dp, dm = ray_hit(q, t), ray_hit(q, -t)
        if dp is None or dm is None or not (min_span <= dp + dm <= max_span):
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
    if res and res[2] < P["min_door_depth_m"]:
        continue  # the slot between a leaf stood open and the wall beside it, not a doorway: its swing finds the door
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


# ---------------------------------------------------------------- door swings
# A leaf can be drawn at any angle, hairline thin or clipped, but its arc always records the door:
# the arc's centre is the hinge and one of its two ends is where the leaf shuts.
def door_swings():
    """Swing arcs on A-DOOR as hinge, radius and the arc's two ends. A swing past a quarter turn is two beziers."""
    swings = []
    for w, cx, cy, r in bezier_arcs("A-DOOR"):
        hinge = np.array([cx, cy])
        if hinge[1] < y_cut or not within(r, P["leaf_length_m"]):
            continue
        sw = next((s for s in swings if np.linalg.norm(s["hinge"] - hinge) < 0.03 and abs(s["r"] - r) < 0.03), None)
        if sw is None:
            sw = {"hinge": hinge, "r": r, "ends": []}
            swings.append(sw)
        sw["ends"] += [w[0], w[-1]]
    for sw in swings:  # where two beziers meet is not an end of the swing
        sw["ends"] = [p for p in sw["ends"] if sum(np.linalg.norm(p - q) < 0.02 for q in sw["ends"]) == 1]
    return [sw for sw in swings if len(sw["ends"]) == 2]


def opening_towards(sw, end, max_span):
    """opening_from along the line from the hinge to this end of the arc, or None if that isn't a doorway a wall thick."""
    t = (end - sw["hinge"]) / np.linalg.norm(end - sw["hinge"])
    res = opening_from(sw["hinge"] + t * sw["r"] / 2, t, np.array([-t[1], t[0]]), np.arange(-0.4, 0.4001, 0.01), sw["r"] - 0.1, max_span)
    return res if res and P["min_door_depth_m"] <= res[2] <= 0.4 else None


def swing_opening(sw):
    """The doorway this swing's leaf shuts across, as (the arc end it shuts at, opening_from's result), or None."""
    # TODO(human)
    return None


def hung_on(lf, sw):
    """Is this leaf the one on this swing: one end at the hinge, as long as the arc's radius?"""
    a = np.radians(lf["angle_deg"]); half = np.array([np.cos(a), np.sin(a)]) * lf["length"] / 2
    return abs(lf["length"] - sw["r"]) < 0.1 and min(np.linalg.norm(np.array(lf["c"]) + s * half - sw["hinge"]) for s in (-1, 1)) < 0.08


def leaf_from_swing(sw, shut_at, thickness):
    """A leaf for a swing whose linework didn't pass as one: drawn hairline thin, or clipped along with its arc."""
    shut = (shut_at - sw["hinge"]) / np.linalg.norm(shut_at - sw["hinge"])
    other = next(e for e in sw["ends"] if e is not shut_at)
    v = (other - sw["hinge"]) / np.linalg.norm(other - sw["hinge"])
    if v @ shut > 0.7:  # a clipped arc stops short of the leaf: stand it square to the door, on the arc's side
        square = np.array([-shut[1], shut[0]])
        v = square if square @ v > 0 else -square
    c = sw["hinge"] + v * sw["r"] / 2
    return {"c": [round(c[0], 3), round(c[1], 3)], "angle_deg": round(np.degrees(np.arctan2(v[1], v[0])) % 180, 2),
            "length": round(sw["r"], 3), "thickness": thickness}


drawn_thickness = round(float(np.median([lf["thickness"] for lf in leaves])), 3)
swing_headers = []
for sw in door_swings():
    found = swing_opening(sw)
    if found is None:
        continue
    shut_at, (poly, span, _) = found
    mid = Point((sw["hinge"] + shut_at) / 2)
    is_new = not any(mid.distance(h) < 0.15 for h in headers + swing_headers)  # a door the leaves above already found keeps its header
    if is_new:
        swing_headers.append(poly)
    leaf = next((lf for lf in leaves if hung_on(lf, sw)), None)
    if leaf is None and is_new:
        leaf = leaf_from_swing(sw, shut_at, drawn_thickness)
        leaves.append(leaf)
    if leaf is not None:
        leaf.setdefault("opening_width", round(span, 3))

merged = unary_union([h.buffer(0.01) for h in headers]).buffer(-0.01)
header_list = []
# a swing's header stays its own: a door at right angles to the next would otherwise merge into one rectangle across both
for poly in [*getattr(merged, "geoms", [merged]), *swing_headers]:
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
# A-GLAZ pieces on a full-height glazed screen (plan.screens) are not observation windows
screens = [LineString([q["a"], q["b"]]) for q in P.get("screens", [])]
wins = [w for w in wins if all(sc.distance(LineString([w["a"], w["b"]])) > 0.1 for sc in screens)]

# ---------------------------------------------------------------- sink blocks
# Some sinks are CAD blocks rather than the circular basins below: a drain circle inside a bowl outline on P-SANR-FIXT,
# with the tap on A-EQPM. The bowl is a rounded rectangle, or an oval ring with a drawn rim around it.
SINK = P["sink"]


def drain_circles(arcs):
    """Full circles of drain size, as (x, y, r). A block draws one circle as several arcs, some in separate paths."""
    small = [a for a in arcs if within(a[3], SINK["drain_r_m"])]
    out = []
    for _, cx, cy, _r in small:
        if any(np.hypot(cx - q[0], cy - q[1]) < 0.005 for q in out):
            continue
        same = [a for a in small if np.hypot(a[1] - cx, a[2] - cy) < 0.005]
        pts = np.concatenate([a[0] for a in same])
        ang = np.sort(np.arctan2(pts[:, 1] - cy, pts[:, 0] - cx))
        if np.diff(np.r_[ang, ang[0] + 2 * np.pi]).max() < np.radians(60):  # no missing side
            out.append((cx, cy, min(a[3] for a in same)))
    return out


def polylines(layer, min_segments):
    """Paths on a layer drawn as a run of straight segments, as world point arrays."""
    return [np.concatenate(w) for d in drs if d["layer"] == layer and len(d["items"]) >= min_segments and all(len(p) == 2 for _, p in d["items"])
            for w in [[planlib.page_to_world(spec, p) for _, p in d["items"]]]]


def bowl_outline(x, y, corners, rings):
    """The convex outline drawn around a drain: four corner arcs of a rounded rectangle, or a ring of straight segments."""
    near = [a[0] for a in corners if np.hypot(a[1] - x, a[2] - y) < SINK["size_m"][1]]
    for pts in ([np.concatenate(near)] if len(near) == 4 else []) + rings:
        hull = MultiPoint(pts).convex_hull
        if not hull.contains(Point(x, y)):  # also rules out straight runs, whose hull is a line
            continue
        corner = np.array(hull.minimum_rotated_rectangle.exterior.coords)[:3]
        if all(within(side, SINK["size_m"]) for side in np.hypot(*np.diff(corner, axis=0).T)):
            return hull
    return None


def sink_blocks():
    """Every drawn sink block on the sheet: a drain inside a bowl outline, with a tap just outside it."""
    fixt = bezier_arcs("P-SANR-FIXT")
    eq_arcs = bezier_arcs("A-EQPM")
    corners = [a for a in fixt if within(a[3], SINK["corner_r_m"])]
    tap_arcs = [a for a in eq_arcs if within(a[3], SINK["tap_r_m"])]
    rings = polylines("P-SANR-FIXT", SINK["ring_min_segments"])
    eq_lines = polylines("A-EQPM", SINK["rim_min_segments"])
    out = []
    for x, y, drain_r in drain_circles(fixt):
        bowl = bowl_outline(x, y, corners, rings)
        if bowl is None or y < y_cut:
            continue
        taps = [a for a in tap_arcs if 0 < bowl.distance(Point(a[1], a[2])) < SINK["tap_reach_m"]]
        if not taps:
            continue
        # a rim drawn around the bowl, if there is one. With one outline, it's the fitting's edge and the rim width is assumed
        grown = box(*bowl.bounds).buffer(SINK["block_margin_m"], join_style="mitre")
        around = [p for p in eq_lines if grown.contains(MultiPoint(p))]
        hull = MultiPoint(np.concatenate(around)).convex_hull if around else bowl
        rim, bowl = (hull, bowl) if hull.contains(bowl.buffer(-0.005)) and hull.area > bowl.area else (bowl, bowl.buffer(-SINK["rim_m"]))
        out.append({"rim": rim, "bowl": bowl, "drain": (x, y), "drain_r": drain_r,
                    "tap": (float(np.mean([a[1] for a in taps])), float(np.mean([a[2] for a in taps]))), "tap_r": float(np.mean([a[3] for a in taps]))})
    return out


def block_linework(block):
    """Indices of the A-EQPM paths that belong to a sink block: all of their points lie in a box around its rim and tap."""
    extent = block["rim"].union(Point(block["tap"]).buffer(block["tap_r"]))
    zone = box(*extent.bounds).buffer(SINK["block_margin_m"], join_style="mitre")
    return {i for i, d in enumerate(drs) if d["layer"] == "A-EQPM" and d["items"]
            and zone.contains(MultiPoint(np.concatenate([planlib.page_to_world(spec, p) for _, p in d["items"]])))}


blocks = sink_blocks()

# ---------------------------------------------------------------- joinery (A-EQPM)
# A sink block's linework isn't the counter's outline. Left in, its tap cuts a slot in the counter and an oval rim can split one counter into three.
linework = set().union(*(block_linework(b) for b in blocks)) if blocks else set()
eq = R.draw(spec, [d for i, d in enumerate(drs) if i not in linework], {"A-EQPM"}, stroke_px=2, fill=False)
both = (walls | eq).astype(np.uint8)
lab, n = ndi.label(both == 0)
area = ndi.sum(np.ones_like(lab), lab, np.arange(1, n + 1)) * R.res ** 2
dt = ndi.distance_transform_edt(both == 0) * R.res
mx = ndi.maximum(dt, lab, np.arange(1, n + 1))
touch = ndi.maximum(cv2.dilate(eq.astype(np.uint8), disk(2)), lab, np.arange(1, n + 1))
ok = np.zeros(n + 1, bool)
ok[1:] = (area < P["counter_max_area_m2"]) & (mx < P["counter_max_half_depth_m"]) & (touch > 0) & (area > 0.08)
# a second shape drawn inside an outline, too big to be its sink, is a raised top: the nurse station's transaction ledge
big_shapes = [q for i in np.flatnonzero(ok) if area[i - 1] > P["counter_raised_min_area_m2"]
              for q in polygons(cv2.dilate((lab == i).astype(np.uint8), disk(1)) > 0, 0.08, 0.02)]
counters = []
for poly in polygons(cv2.dilate((ok[lab]).astype(np.uint8), disk(1)) > 0, 0.08, 0.02):
    if poly.centroid.y < y_cut:
        continue
    # circles drawn inside sink counters = basins
    cnt = {"poly": [list(map(lambda v: round(v, 3), p)) for p in poly.exterior.coords]}
    inside = [q for q in big_shapes if poly.contains(q.representative_point())]
    if len(inside) > 1:
        cnt["raised"] = [list(map(lambda v: round(v, 3), p)) for p in min(inside, key=lambda q: q.area).exterior.coords]
    counters.append(cnt)

basins = []
for w, cx, cy, r in bezier_arcs("A-EQPM"):
    if 0.12 < r < 0.3 and np.abs(np.hypot(w[:, 0] - cx, w[:, 1] - cy) - r).max() < 0.01 and cy > y_cut:
        if all(np.hypot(cx - q["c"][0], cy - q["c"][1]) > 0.08 for q in basins):
            basins.append({"c": [round(cx, 3), round(cy, 3)], "r": round(r, 3)})
n_circular = len(basins)

# sink blocks go after the circular basins, whose list positions name their objects. A block only counts on a counter.
counter_polys = [Polygon(c["poly"]) for c in counters]
ring = lambda g: [[round(v, 3) for v in p] for p in g.exterior.coords]  # noqa: E731
for b in blocks:
    if not any(q.buffer(SINK["on_counter_tolerance_m"]).contains(b["rim"]) for q in counter_polys):
        print(f"  sink block at ({b['drain'][0]:.2f}, {b['drain'][1]:.2f}) isn't on a counter: no basin")
        continue
    c = b["rim"].envelope.centroid
    basins.append({"c": [round(c.x, 3), round(c.y, 3)], "rim": ring(b["rim"]), "bowl": ring(b["bowl"]),
                   "drain": [round(v, 3) for v in b["drain"]], "drain_r": round(b["drain_r"], 3), "tap": [round(v, 3) for v in b["tap"]]})

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
      f"counters {len(counters)}, basins {len(basins)} ({n_circular} circular, {len(basins) - n_circular} sink blocks), rooms {len(rooms)}, floor {floor.area:.0f} m2")
