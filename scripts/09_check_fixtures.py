"""Check fixtures on the walls against the drawing and what's around them. Exits non-zero on any failure.

Reads the built scene, so it tests what was placed and not what the spec asked for. This project has had many objects
standing in walls, so the geometry is measured from the meshes in output/icu.blend. Uses ICU_BLEND if set, like the other steps.

Extinguisher cabinets: each is where sheet A1104-a draws it; its plate covers the gap the sheet leaves in the wall, with both
ends on wall; the corridor in front is clear of walls, counters, doors, handrails and alcove equipment; the cabinet's body stays
in its void and out of any other room; the extinguisher is within the height limits in the spec; and every labelled room can
reach one. Ventilation grilles: the meshes match build/vents.json, which the 2D plan draws from; each is on the ceiling of a room, clear of walls,
light panels, exam lights, pendants, curtain tracks and the configurator's own fixtures and layout; and each kind of room has the
grilles its type calls for, with an isolation room's exhaust nearest the bed head. These are measurements of a concept, not a compliance finding.
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

# ---------------------------------------------------------------- ventilation grilles, as built
V = spec["ventilation"]
H = spec["building"]["ceiling_height"]
vent_data = json.load(open(os.path.join(ROOT, "build", "vents.json")))
vents, zones = vent_data["vents"], vent_data["zones"]
rooms = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))["rooms"]
planlib.label_rooms(rooms, spec)
check(len({v["id"] for v in vents}) == len(vents) > 0, f"{len(vents)} grilles, each with its own id")

# the meshes hold exactly the listed grilles: a plate's four corners at its place on the ceiling
t = V["plate_thickness"]
missing, extra = [], 0
for kind in ("supply", "return", "exhaust"):
    ob = bpy.data.objects.get(f"vent_{kind}")
    here = [v for v in vents if v["kind"] == kind]
    if ob is None:
        missing += [v["id"] for v in here]
        continue
    check(ob.users_collection[0].name == "Ceiling", f"{kind} grilles are in the Ceiling collection, so they go with the ceiling in cutaways")
    pts_ = world_points(ob)
    low = pts_[np.abs(pts_[:, 2] - (H - t)) < 1e-4][:, :2]
    plates = len(low) // 4
    if plates != len(here):
        extra += 1
    for v in here:
        x, y = v["at"]; w, d = v["size"]
        for c_ in ((x - w / 2, y - d / 2), (x + w / 2, y - d / 2), (x + w / 2, y + d / 2), (x - w / 2, y + d / 2)):
            if np.min(np.hypot(low[:, 0] - c_[0], low[:, 1] - c_[1])) > 0.002:
                missing.append(v["id"])
                break
    top = pts_[:, 2].max()
    if abs(top - H) > 1e-4:
        missing.append(f"{kind} top at {top:.3f}")
check(not missing and not extra, f"the 3D grilles are exactly the plan's list {missing[:4]}")

# what's really on the ceiling, read from the meshes
items = []
cp = bpy.data.objects["ceiling_panels"]
M_ = np.array(cp.matrix_world)
for poly in cp.data.polygons:
    vs = np.array([cp.data.vertices[i].co for i in poly.vertices])
    if abs(poly.normal.z) > 0.9 and poly.area > 0.1:
        items.append(("light panel", MultiPoint(vs[:, :2]).convex_hull))
near_ceiling = lambda ob: MultiPoint(world_points(ob)[world_points(ob)[:, 2] > H - 0.2][:, :2]).convex_hull  # noqa: E731
placed = [o for o in bpy.data.objects if o.type == "MESH" and o.name.startswith("room") and o.users_collection[0].name != "Kit"]
for o in placed:
    if o.name.endswith("_exam_light"):
        items.append(("exam light", near_ceiling(o)))
    elif world_points(o)[:, 2].max() > H - 0.2:
        items.append(("pendant", near_ceiling(o)))
cur = bpy.data.objects["curtains"]
cur_pts = world_points(cur)
cur_top = cur_pts[cur_pts[:, 2] > H - 0.05]
for r in rooms:
    close = cur_top[np.hypot(cur_top[:, 0] - r["front"][0], cur_top[:, 1] - r["front"][1]) < r["front_width"] / 2 + 0.6]
    if len(close) >= 3:
        items.append(("curtain track", MultiPoint(close[:, :2]).convex_hull))
counts_ = {}
for k_, _g in items:
    counts_[k_] = counts_.get(k_, 0) + 1
print(f"        on the ceiling, from the meshes: {counts_}")
check(counts_.get("exam light", 0) == len(rooms) and counts_.get("curtain track", 0) == len(rooms) and counts_.get("pendant", 0) >= len(rooms), "the check sees each room's exam light, pendant and curtain track")
# a room the configurator lays out differently has them somewhere else there, and shares these grilles
for label_, cfg in spec["configurator"]["rooms"].items():
    for q in cfg["fixtures"]["downlights"]:
        items.append((f"{label_} downlight", Point(q).buffer(0.1)))
    for q in cfg["fixtures"]["slots"]:
        items.append((f"{label_} slot light", LineString([q[:2], q[2:]]).buffer(0.05)))
    lay = cfg.get("layout")
    if lay:
        bed = np.array(lay["head"]) + np.array(lay["foot_dir"]) * 1.1
        items.append((f"{label_} exam light", Point(bed).buffer(0.32)))
        hub = next(o for o in placed if o.name.endswith("_pendant"))
        V_ = np.array([v.co for v in hub.data.vertices])
        V_ = V_[V_[:, 2] > H - 0.2][:, :2]
        fy = np.array(lay["foot_dir"], float); fx = np.array([fy[1], -fy[0]])
        items.append((f"{label_} pendant", MultiPoint(np.array(lay["head"]) + V_[:, :1] * fx + V_[:, 1:] * fy).convex_hull))

space_u = unary_union([s_["poly"] for s_ in SPACES])
tight, off_ceiling = [], []
gap_min = 9.0
for v in vents:
    x, y = v["at"]; w, d = v["size"]
    rect = Polygon([(x - w / 2, y - d / 2), (x + w / 2, y - d / 2), (x + w / 2, y + d / 2), (x - w / 2, y + d / 2)])
    if not space_u.contains(rect) or rect.intersects(WALLS):
        off_ceiling.append(v["id"])
    for what, g_ in items:
        gap = rect.distance(g_)
        gap_min = min(gap_min, gap)
        if gap < V["clearance"]["ceiling_items"] - 0.02:
            tight.append(f"{v['id']} {gap * 100:.0f} cm from a {what}")
check(not off_ceiling, f"every grille is on a ceiling, clear of the walls {off_ceiling[:4]}")
check(not tight, f"every grille clears what's on the ceiling, by {gap_min * 100:.0f} cm at the least {tight[:4]}")
apart = min((Point(a["at"]).distance(Point(b["at"])) for i, a in enumerate(vents) for b in vents[i + 1:]), default=9)
check(apart > 0.4, f"no two grilles overlap (closest centres {apart:.2f} m)")

# each kind of room has what its type calls for
of = lambda z, k: [v for v in vents if v["zone"] == z and v["kind"] == k]  # noqa: E731
bad = []
for r in rooms:
    lab = r["label"]
    iso = any("ISOLATION" in n for n in r["names"])
    if iso:
        if not of(lab, "supply") or not of(lab, "exhaust") or of(lab, "return"):
            bad.append(f"{lab}: an isolation room needs supply and exhaust and no return")
        head = np.array(r["head"]) + np.array(r["foot_dir"]) * 0.1
        dist = lambda v: float(np.hypot(*(np.array(v["at"]) - head)))  # noqa: E731
        ex = min(dist(v) for v in of(lab, "exhaust"))
        su = min(dist(v) for v in of(lab, "supply"))
        print(f"        {lab}: exhaust {ex:.2f} m from the bed head, supply {su:.2f} m; {len(of(lab, 'supply'))} supply, {len(of(lab, 'exhaust'))} exhaust")
        if ex > V["exhaust_from_head_max"] or ex >= su:
            bad.append(f"{lab}: exhaust is {ex:.2f} m from the head and the nearest supply {su:.2f} m")
        for part, want in ((f"{lab}_ante", ("supply", "exhaust")), (f"{lab}_toilet", ("exhaust",))):
            if any(not of(part, k) for k in want) or of(part, "return"):
                bad.append(f"{part}: needs {want}, has {[v['kind'] for v in vents if v['zone'] == part]}")
    elif not of(lab, "supply") or not of(lab, "return") or of(lab, "exhaust"):
        bad.append(f"{lab}: a patient room needs supply and return")
check(not bad, f"patient rooms and isolation suites have the right grilles {bad[:3]}")
for z in zones:
    if z["type"] in ("toilet", "soiled") and any(v["kind"] != "exhaust" for v in vents if v["zone"] == z["id"]):
        bad.append(f"{z['id']} should only exhaust")
check(not bad, f"toilets and soiled rooms only exhaust {bad[:3]}")
names = {z["id"].rstrip("_0123456789") for z in zones}
for want in ("nurse_st", "corridor"):
    check(any(n.startswith(want) for n in names), f"{want} has grilles")
unserved = []
for r in plan["rooms"]:
    rule = next((t_ for t_ in V["room_types"] if any(r["name"] == m or (m.endswith("*") and r["name"].startswith(m[:-1])) for m in t_["match"])), None)
    if rule is None:
        unserved.append(r["name"])
check(not unserved, f"every label on the plan has a room type {sorted(set(unserved))[:6]}")

if fail:
    print(f"fixture check FAILED, {len(fail)} problem(s):")
    for m in fail:
        print("  -", m)
    sys.exit(1)
print("  fixture check: ok (extinguisher cabinets against the sheet, walls, counters, doors, handrails, alcoves, height limits, walking distance; ventilation grilles against the plan's list, the ceiling's fixtures and each room's type)")
