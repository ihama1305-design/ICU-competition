"""Check fixtures on the walls against the drawing and what's around them. Exits non-zero on any failure.

Reads the built scene, so it tests what was placed and not what the spec asked for. This project has had many objects
standing in walls, so the geometry is measured from the meshes in output/icu.blend. Uses ICU_BLEND if set, like the other steps.

Extinguisher cabinets: each is where sheet A1104-a draws it; its plate covers the gap the sheet leaves in the wall, with both
ends on wall; the corridor in front is clear of walls, counters, doors, handrails and alcove equipment; the cabinet's body stays
in its void and out of any other room; the extinguisher is within the height limits in the spec; and every labelled room can
reach one. These are measurements of a concept, not a compliance finding.
"""
import json
import os
import sys

import bpy
import numpy as np
from scipy import sparse
from scipy.sparse.csgraph import dijkstra
from shapely import contains_xy, wkt
from shapely.geometry import LineString, MultiPoint, Point, Polygon
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
BLEND = os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend")
plan = json.load(open(os.path.join(ROOT, "build", "plan.json")))
GEO = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))["geometry"]
WALLS = wkt.loads(GEO["walls"])
INSIDE = wkt.loads(GEO["inside_glass"])
RAILS = wkt.loads(GEO["handrails"])
VOIDS = wkt.loads(GEO["fire_voids"])
SPACES = [{"names": s["names"], "poly": wkt.loads(s["poly"])} for s in GEO["spaces"]]
HEADERS = unary_union([Polygon(h["poly"]).buffer(0) for h in plan["headers"]])
COUNTERS = unary_union([Polygon(c["poly"]).buffer(0) for c in plan["counters"]])
FIRE = spec["fire"]
fail = []


def check(ok, msg):
    print(("  ok    " if ok else "  FAIL  ") + msg)
    if not ok:
        fail.append(msg)


bpy.ops.wm.open_mainfile(filepath=BLEND)


def world_points(ob):
    """An object's vertices in the scene, as an (n, 3) array."""
    M = np.array(ob.matrix_world)
    V = np.array([v.co for v in ob.data.vertices])
    return (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]


def footprint(ob):
    return MultiPoint(world_points(ob)[:, :2]).convex_hull


# ---------------------------------------------------------------- what the sheet draws
drawn = []
for d in planlib.drawings(spec):
    f = d.get("fill")
    if d["layer"] == "A-GENM" and f and d["type"] in ("f", "fs") and f[0] > 0.3 and f[1] < 0.2 and f[2] < 0.2:
        hull = MultiPoint(np.concatenate([planlib.page_to_world(spec, p) for _, p in d["items"]])).convex_hull
        drawn.append(hull)
strips = [h for h in drawn if h.area <= 0.05]
blocks = [h for h in drawn if h.area > 0.05]
cabs = FIRE["cabinets"]
check(len(blocks) == len(cabs) == len(strips), f"the spec has one cabinet for each drawn on the sheet ({len(cabs)} in the spec, {len(blocks)} drawn)")
c = FIRE["cabinet"]
for ob_id in cabs:
    p = Point(ob_id["face_at"])
    strip = min(strips, key=p.distance)
    block = min(blocks, key=p.distance)
    check(p.distance(strip) < 0.03, f"{ob_id['id']}: its face is on the drawn strip ({p.distance(strip) * 100:.1f} cm off)")
    long_side = max(np.linalg.norm(np.diff(np.array(strip.minimum_rotated_rectangle.exterior.coords), axis=0), axis=1))
    check(abs(long_side - c["face_width"]) < 0.02, f"{ob_id['id']}: its width is the drawn {long_side:.3f} m")

# ---------------------------------------------------------------- each cabinet in the scene
ALCOVE = unary_union([footprint(o) for o in bpy.data.objects if o.type == "MESH" and (o.name == "crash_cart" or o.name.startswith("stretcher_")) and o.users_collection[0].name != "Kit"])
e = FIRE["extinguisher"]
lim = FIRE["limits"]
check(e["top"] <= lim["extinguisher_top_max"], f"the extinguisher's top is at {e['top']:.2f} m, up to {lim['extinguisher_top_max']:.2f} m")
check(e["bottom"] >= lim["extinguisher_bottom_min"], f"the extinguisher's bottom is at {e['bottom']:.2f} m, at least {lim['extinguisher_bottom_min']:.2f} m")
check(c["bottom"] < e["bottom"] and e["top"] < c["top"], "the extinguisher fits inside its cabinet")

check(len(getattr(VOIDS, "geoms", [VOIDS])) == len(cabs), f"each cabinet's plate shuts off a void behind it ({VOIDS.area:.2f} m2 in all)")
check(RAILS.intersection(VOIDS).area < 1e-4, "no handrail stands in those voids")

rows = []
for fc in cabs:
    name = fc["id"]
    ob = bpy.data.objects.get(f"fire_cabinet_{name}")
    check(ob is not None, f"{name}: the cabinet is in the scene")
    if ob is None:
        continue
    pts = world_points(ob)
    at, n = np.array(fc["face_at"]), np.array(fc["normal"])
    t = np.array([n[1], -n[0]])
    local = np.c_[(pts[:, :2] - at) @ t, (pts[:, :2] - at) @ n, pts[:, 2]]
    front = local[:, 1].max()
    check(0 < front < 0.06, f"{name}: its front stands {front * 100:.1f} cm off the drawn face, flush enough not to catch a passer-by")
    h = c["face_width"] / 2

    # the plate closes the wall's gap: the wall comes back within reach of both ends, and the panel starts behind the wall face
    ends = [at + t * s * h - n * 0.05 for s in (-1, 1)]
    off = [WALLS.distance(Point(q)) for q in ends]
    check(max(off) < 0.03, f"{name}: both ends of the plate reach the wall ({max(off) * 100:.1f} cm at most)")
    gap = LineString([at - t * h - n * 0.05, at + t * h - n * 0.05]).difference(WALLS)
    check(gap.length > 0.2, f"{name}: the sheet's gap in the wall is there for it to close ({gap.length:.2f} m)")

    # the cabinet stands in the open: nothing in front of it
    reach = FIRE["stand_clear"]
    stand = Polygon([at - t * h + n * front, at + t * h + n * front, at + t * h + n * (front + reach), at - t * h + n * (front + reach)])
    for what, geom, limit in (("walls", WALLS, 0.0), ("counters", COUNTERS, 0.0), ("door openings", HEADERS, 0.0), ("handrails", RAILS, 0.0), ("alcove equipment", ALCOVE, 0.0)):
        check(geom.intersection(stand).area <= limit, f"{name}: {reach:.2f} m in front of it is clear of {what}")
    leaf_near = []
    for leaf in plan["leaves"]:
        swing = Point(leaf["c"]).buffer(leaf["length"])  # the leaf's middle plus its length covers any swing
        if swing.intersects(stand):
            leaf_near.append(leaf["c"])
    check(not leaf_near, f"{name}: no door leaf swings across the space in front of it {leaf_near[:2]}")
    rail_gap = RAILS.distance(LineString([at - t * h, at + t * h]))
    check(rail_gap >= FIRE["rail_clearance"] - 0.02, f"{name}: the nearest handrail stops {rail_gap:.2f} m from it")

    # the body stays in its void: no other room reaches it, and it isn't buried in the wall
    body = Polygon([at - t * c["body_width"] / 2, at + t * c["body_width"] / 2, at + t * c["body_width"] / 2 - n * c["body_depth"], at - t * c["body_width"] / 2 - n * c["body_depth"]])
    here = next((s for s in SPACES if s["poly"].contains(Point(at + n * 0.3))), None)
    others = [s["names"] for s in SPACES if s is not here and s["poly"].intersection(body).area > 0.002]
    check(not others, f"{name}: its body doesn't reach another room {others[:2]}")
    buried = body.intersection(WALLS).area / body.area
    check(buried < 0.2, f"{name}: its body is {buried * 100:.0f}% in the wall, so it isn't buried")

    # corridor left beside it
    probe = LineString([at + n * front, at + n * 8])
    obst = unary_union([WALLS, COUNTERS])
    hit = probe.intersection(obst)
    width = 8.0 if hit.is_empty else Point(at + n * front).distance(hit)
    rows.append((name, width, min(HEADERS.distance(Point(at)), 99.0)))
    print(f"        {name}: clear floor straight ahead {width:.2f} m; nearest door opening {rows[-1][2]:.2f} m")

# ---------------------------------------------------------------- how far anyone is from one
RES = 0.1
x0, y0, x1, y1 = INSIDE.bounds
xs, ys = np.arange(x0, x1, RES) + RES / 2, np.arange(y0, y1, RES) + RES / 2
gx, gy = np.meshgrid(xs, ys)
free = contains_xy(INSIDE.difference(unary_union([WALLS, COUNTERS])), gx, gy)
ids = -np.ones(free.shape, int)
ids[free] = np.arange(free.sum())
rows_, cols_, data_ = [], [], []
for dy, dx, cost in ((0, 1, RES), (1, 0, RES), (1, 1, RES * 2 ** 0.5), (1, -1, RES * 2 ** 0.5)):
    h_, w_ = free.shape
    a = free[max(0, -dy):h_ - max(0, dy), max(0, -dx):w_ - max(0, dx)]
    b = free[max(0, dy):h_ - max(0, -dy), max(0, dx):w_ - max(0, -dx)]
    ia = ids[max(0, -dy):h_ - max(0, dy), max(0, -dx):w_ - max(0, dx)]
    ib = ids[max(0, dy):h_ - max(0, -dy), max(0, dx):w_ - max(0, -dx)]
    both = a & b
    rows_.append(ia[both]); cols_.append(ib[both]); data_.append(np.full(both.sum(), cost))
graph = sparse.csr_matrix((np.concatenate(data_), (np.concatenate(rows_), np.concatenate(cols_))), shape=(free.sum(), free.sum()))


def nearest_cell(p):
    d = (gx - p[0]) ** 2 + (gy - p[1]) ** 2
    d[~free] = 1e9
    return ids[np.unravel_index(d.argmin(), d.shape)]


sources = [nearest_cell(np.array(fc["face_at"]) + np.array(fc["normal"]) * 0.3) for fc in cabs]
dist = dijkstra(graph, directed=False, indices=sources, min_only=True)
field = np.full(free.shape, np.nan)
field[free] = dist
reached = np.isfinite(field[free])
check(reached.mean() > 0.97, f"{reached.mean() * 100:.1f}% of the free floor can walk to a cabinet (the rest is shut in on the plan, like voids and shafts)")
labelled = []
for r in plan["rooms"]:
    i = nearest_cell(r["label_at"])
    v = float(dist[i])
    labelled.append((v, r["name"], r["label_at"]))
labelled.sort(key=lambda t: -t[0] if np.isfinite(t[0]) else -1e9)
finite = field[np.isfinite(field)]
worst = np.unravel_index(np.nanargmax(field), field.shape)
print(f"        walking distance to the nearest cabinet: median {np.median(finite):.1f} m, longest {finite.max():.1f} m at ({gx[worst]:.1f}, {gy[worst]:.1f}); reference {lim['travel_max']:.1f} m")
over = [t for t in labelled if np.isfinite(t[0]) and t[0] > lim["travel_max"]]
print(f"        labels past the reference distance: {len(over)} of {len(labelled)}")
for v, nm, at in labelled[:10]:
    print(f"          {v:5.1f} m  {nm} at ({at[0]:.1f}, {at[1]:.1f})")
# the floor runs on past the cut line and the sheet's other parts have cabinets of their own, so a long walk here is reported, not failed
unreachable = [nm for v, nm, _ in labelled if not np.isfinite(v)]
check(len(unreachable) == 0 or all(nm in ("RISER", "ELEC", "FHC") or nm.startswith("L4") for nm in unreachable), f"every occupied room can walk to a cabinet {sorted(set(unreachable))[:6]}")

if fail:
    print(f"fixture check FAILED, {len(fail)} problem(s):")
    for m in fail:
        print("  -", m)
    sys.exit(1)
print("  fixture check: ok (extinguisher cabinets against the sheet, walls, counters, doors, handrails, alcoves, height limits, walking distance)")
