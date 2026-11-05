"""Build the ICU floor as a Blender scene -> output/icu.blend (also build/scene_index.json).

Geometry comes from build/plan.json (the drawing); heights, materials, the equipment kit, lights
and cameras come from spec/icu_spec.json. Nothing dimensional is hard-coded here except small
detailing inside scripts/kit.py.
"""
import json
import math
import os
import sys

import bpy
import numpy as np
import trimesh
from mathutils import Matrix, Vector
from shapely.geometry import LineString, MultiPoint, MultiPolygon, Point, Polygon
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import planlib  # noqa: E402
from kit import T, frame_matrix, place, rot_z  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
plan = json.load(open(os.path.join(ROOT, "build", "plan.json")))
B = spec["building"]; F = B["facade"]; K = spec["kit"]; LT = spec["lighting"]
H = B["ceiling_height"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"


def coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


C = {n: coll(n) for n in ("Shell", "Ceiling", "Facade", "Doors", "Glazing", "Joinery", "Equipment", "Lights", "Context", "Cameras")}
KITC = coll("Kit")  # source meshes for linked copies, excluded from render
KITC.hide_render = True
KITC.hide_viewport = True

kit.make_textures()
kit.make_materials(spec)
MATS = kit.MATS


def mesh_obj(name, verts, faces, mat, collection, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(verts).tolist(), [], np.asarray(faces).tolist())
    me.update()
    me.materials.append(MATS[mat])
    if smooth:
        me.shade_smooth()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def extrude(polys, z0, z1):
    parts = []
    for p in polys:
        for g in getattr(p, "geoms", [p]):
            if g.geom_type == "Polygon" and g.area > 1e-5:
                m = trimesh.creation.extrude_polygon(g, z1 - z0)
                m.apply_translation((0, 0, z0))
                parts.append(m)
    return trimesh.util.concatenate(parts) if parts else None


def tm_obj(name, tm, mat, collection):
    return mesh_obj(name, tm.vertices, tm.faces, mat, collection)


# ------------------------------------------------------------------ plan geometry
walls = [Polygon(w["outer"], w["holes"]).buffer(0) for w in plan["walls"]]
walls_u = unary_union(walls)
headers = [Polygon(h["poly"]) for h in plan["headers"]]
outline = Polygon(spec["plan"]["outline"]["points"])


def facade_segments():
    """(a, b, outward unit normal) for every straight piece of both curtain walls."""
    out = []
    for side, pts in plan["facade"].items():
        o_hint = np.array(spec["plan"]["facade"][side]["outward"], float)
        pts = [np.array(p, float) for p in pts]
        for a, b in zip(pts, pts[1:]):
            t = (b - a) / np.linalg.norm(b - a)
            n = np.array([t[1], -t[0]])
            if n @ o_hint < 0:
                n = -n
            out.append((a, b, n))
    return out


FSEG = facade_segments()


def band(a, b, n, d0, d1, ext=0.0):
    t = (b - a) / np.linalg.norm(b - a)
    a2, b2 = a - t * ext, b + t * ext
    return Polygon([a2 + n * d0, b2 + n * d0, b2 + n * d1, a2 + n * d1])


# partitions run past the upstand to the curtain-wall mullions (the drawing stops them at the
# upstand's inner face): sweep each wall end near a facade out to the glass line
ext = []
for a, b, n in FSEG:
    zone = band(a, b, n, -0.35, 0.02, ext=0.5)
    for w in walls:
        part = w.intersection(zone)
        if part.is_empty or part.area < 1e-4:
            continue
        moved = Polygon(np.array(part.convex_hull.exterior.coords) + n * (F["glass_offset"] + 0.05))
        ext.append(unary_union([part.convex_hull, moved]).convex_hull.intersection(band(a, b, n, -0.35, F["glass_offset"], ext=0.5)))
walls = [g for g in unary_union(walls + ext).geoms] if ext else walls
walls_u = unary_union(walls)

inside_glass = unary_union([outline] + [band(a, b, n, 0, F["glass_offset"]) for a, b, n in FSEG]).intersection(
    Polygon([(-50, spec["plan"]["cut_south_y"]), (100, spec["plan"]["cut_south_y"]), (100, 100), (-50, 100)]))
slab = unary_union([outline] + [band(a, b, n, 0, F["slab_overhang"]) for a, b, n in FSEG]).intersection(
    Polygon([(-50, spec["plan"]["cut_south_y"]), (100, spec["plan"]["cut_south_y"]), (100, 100), (-50, 100)]))

# spaces (rooms) = floor minus walls and door headers; named from the drawing's labels
blocked = unary_union([walls_u] + headers)
space_u = inside_glass.difference(blocked)
spaces = []
for g in getattr(space_u, "geoms", [space_u]):
    if g.area < 0.3:
        continue
    names = [r["name"] for r in plan["rooms"] if g.contains(Point(r["label_at"]))]
    labels = [r["label_at"] for r in plan["rooms"] if g.contains(Point(r["label_at"]))]
    spaces.append({"poly": g, "names": names, "labels": labels})


def space_at(p):
    return next((s for s in spaces if s["poly"].contains(Point(p))), None)


def is_patient(s):
    return any(n in K["rooms"] for n in s["names"])


# ------------------------------------------------------------------ shell: slab, floors, walls
tm = extrude([slab], -spec["building"]["slab_thickness"], -0.004)
tm_obj("slab", tm, "slab_edge", C["Shell"])
tm_obj("floor_vinyl", extrude([inside_glass], -0.004, 0.0), "floor_corridor", C["Shell"])
room_floor = [s["poly"] for s in spaces if is_patient(s)]
tm_obj("floor_rooms", extrude(room_floor, 0.0, 0.003), "floor_room", C["Shell"])

wall_tm = extrude(walls, 0.0, H)
head_tm = extrude(headers, B["door_head"], H)
cut = []
for w in plan["windows"]:
    a, b = np.array(w["a"]), np.array(w["b"]); t = (b - a) / np.linalg.norm(b - a); n = np.array([-t[1], t[0]])
    poly = Polygon([a + n * 0.35, b + n * 0.35, b - n * 0.35, a - n * 0.35])
    c = trimesh.creation.extrude_polygon(poly, B["window_head"] - B["window_sill"])
    c.apply_translation((0, 0, B["window_sill"]))
    cut.append(c)
solid = trimesh.boolean.union([wall_tm, head_tm], engine="manifold", check_volume=False)
if cut:
    solid = trimesh.boolean.difference([solid, trimesh.util.concatenate(cut)], engine="manifold", check_volume=False)
tm_obj("walls", solid, "wall", C["Shell"])

# skirting: a thin ring on every wall face, stopping at doorways and the facade
ring = walls_u.buffer(B["skirting_thickness"], join_style="mitre").difference(walls_u)
ring = ring.difference(unary_union([h.buffer(0.03) for h in headers])).intersection(outline.buffer(-0.05))
tm_obj("skirting", extrude([ring], 0.0, B["skirting_height"]), "skirting", C["Shell"])

# corridor handrails
rail_spaces = [s["poly"] for s in spaces if any(any(k in n for k in B["handrail_rooms"]) for n in s["names"])]
rails = []
for sp in rail_spaces:
    r = sp.buffer(-0.04).difference(sp.buffer(-0.04 - B["handrail_depth"]))
    r = r.difference(unary_union([h.buffer(0.35) for h in headers]))
    r = r.difference(unary_union([Polygon(c["poly"]).buffer(0.3) for c in plan["counters"]]))
    for g in getattr(r, "geoms", [r]):
        if g.area > 0.03:
            rails.append(g)
if rails:
    hr = B["handrail_height"]
    tm_obj("handrails", extrude(rails, hr - 0.05, hr + 0.05), "handrail", C["Shell"])
    tm_obj("bumper", extrude([g.buffer(-0.015) for g in rails], 0.28, 0.34), "skirting", C["Shell"])

tm_obj("wall_caps", extrude(walls + headers, H, H + 0.004), "section_cap", C["Shell"])

# ------------------------------------------------------------------ ceilings
ceil_rooms = [s["poly"] for s in spaces if is_patient(s)]
ceil_other = [s["poly"] for s in spaces if not is_patient(s)]
fac_strip = inside_glass.difference(outline)
tm_obj("ceiling_rooms", extrude(ceil_rooms + [fac_strip], H, H + 0.02), "ceiling_plain", C["Ceiling"])
tm_obj("ceiling_grid", extrude(ceil_other, H, H + 0.02), "ceiling", C["Ceiling"])

# ------------------------------------------------------------------ facade
fac_up, fac_glass, fac_mull, fac_fins, blinds = [], [], [], [], []
yc = spec["plan"]["cut_south_y"]
for a, b, n in FSEG:
    L = np.linalg.norm(b - a); t = (b - a) / L
    fac_up.append(band(a, b, n, 0.0, F["upstand_depth"]))
    fac_glass.append(band(a, b, n, F["glass_offset"] - 0.006, F["glass_offset"] + 0.006))
    k = max(1, int(round(L / F["mullion_spacing"])))
    mw, md = F["mullion_size"]
    for i in range(k + 1):
        p = a + t * (L * i / k)
        if p[1] < yc - 0.01:
            continue
        c = p + n * F["glass_offset"]
        fac_mull.append(Polygon([c + t * mw / 2 - n * md / 2, c + t * mw / 2 + n * md / 2, c - t * mw / 2 + n * md / 2, c - t * mw / 2 - n * md / 2]))
        if i < k:
            # roller blind per bay, pulled down to a varied height
            q0, q1 = a + t * (L * i / k + 0.04), a + t * (L * (i + 1) / k - 0.04)
            drop = 0.45 + 0.9 * ((i * 7919 + int(a[1] * 13)) % 11) / 10.0
            blinds.append((q0, q1, n, drop))
    m = int(L / F["fin_spacing"])
    for i in range(m + 1):
        p = a + t * (L * i / max(m, 1))
        if p[1] < yc:
            continue
        c = p + n * (F["fin_offset"] + F["fin_depth"] / 2)
        ft = F["fin_thickness"]
        fac_fins.append(Polygon([c + t * ft / 2 - n * F["fin_depth"] / 2, c + t * ft / 2 + n * F["fin_depth"] / 2,
                                 c - t * ft / 2 + n * F["fin_depth"] / 2, c - t * ft / 2 - n * F["fin_depth"] / 2]))
clip_s = Polygon([(-50, yc), (100, yc), (100, 100), (-50, 100)])
tm_obj("facade_upstand", extrude([p.intersection(clip_s) for p in fac_up], 0.0, F["upstand_height"]), "upstand", C["Facade"])
tm_obj("facade_sill", extrude([p.buffer(0.02, join_style="mitre").intersection(clip_s) for p in fac_up], F["upstand_height"], F["upstand_height"] + 0.025), "counter_top", C["Facade"])
tm_obj("facade_glass", extrude([p.intersection(clip_s) for p in fac_glass], 0.0, H + 0.3), "glass", C["Facade"])
tm_obj("facade_mullions", extrude(fac_mull, -0.1, H + 0.3), "facade_metal", C["Facade"])
for zz in (F["upstand_height"], H - 0.02):
    tm_obj(f"facade_transom_{zz:.2f}", extrude([p.intersection(clip_s) for p in fac_glass], zz - 0.03, zz + 0.03), "facade_metal", C["Facade"])
tm_obj("facade_fins", extrude(fac_fins, -0.3, H + 0.6), "facade_metal", C["Facade"])
bl = []
for q0, q1, n, drop in blinds:
    d = F["glass_offset"] - 0.07
    bl.append((band(q0, q1, n, d - 0.004, d + 0.004), H - drop))
bt = trimesh.util.concatenate([extrude([p], z, H - 0.06) for p, z in bl])
tm_obj("facade_blinds", bt, "blind", C["Facade"])
cas = [band(q0, q1, n, F["glass_offset"] - 0.12, F["glass_offset"] - 0.02) for q0, q1, n, _ in blinds]
tm_obj("facade_blind_cassettes", extrude(cas, H - 0.08, H), "plastic_white", C["Facade"])

# ------------------------------------------------------------------ doors and frames
front_headers = []
frames = []
for h, hp in zip(plan["headers"], headers):
    ax = np.array(h["axis"]); c = np.array(h["c"]); w, d = h["width"], h["depth"]
    nrm = np.array([-ax[1], ax[0]])
    for s in (-1, 1):
        p = c + ax * s * (w / 2 - 0.025)
        frames.append(Polygon([p + ax * 0.025 + nrm * (d / 2 + 0.012), p - ax * 0.025 + nrm * (d / 2 + 0.012),
                               p - ax * 0.025 - nrm * (d / 2 + 0.012), p + ax * 0.025 - nrm * (d / 2 + 0.012)]))
    if w >= K["front_door_min_width"] and w < 3.0:
        front_headers.append(h)
tm_obj("door_frames", extrude(frames, 0.0, B["door_head"]), "frame_metal", C["Doors"])
tm_obj("door_heads", extrude([hp.buffer(0.012, join_style="mitre") for hp in headers], B["door_head"] - 0.05, B["door_head"]), "frame_metal", C["Doors"])

wood = kit.Builder(); glassb = kit.Builder()
for lf in plan["leaves"]:
    a = math.radians(lf["angle_deg"]); u = np.array([math.cos(a), math.sin(a)]); c = np.array(lf["c"])
    L = lf["length"]; e1, e2 = c - u * L / 2, c + u * L / 2
    hinge, tip = (e1, e2) if walls_u.distance(Point(e1)) <= walls_u.distance(Point(e2)) else (e2, e1)
    ht = B["door_head"] - 0.06
    is_front = lf.get("opening_width", 0) >= K["front_door_min_width"]
    rz = math.atan2(u[1], u[0])
    if is_front:
        glassb.box((c[0], c[1], 0.02 + ht / 2), (L - 0.08, 0.012, ht - 0.08), "glass", rz=rz)
        for s in (-1, 1):
            q = c + u * s * (L / 2 - 0.03)
            glassb.box((q[0], q[1], 0.02 + ht / 2), (0.06, 0.05, ht), "frame_metal", rz=rz)
        for zz in (0.06, ht - 0.02, 1.05):
            glassb.box((c[0], c[1], zz), (L, 0.05, 0.08 if zz != 1.05 else 0.04), "frame_metal", rz=rz)
        glassb.box((c[0], c[1], 1.35), (L - 0.1, 0.016, 0.3), "glass_frost", rz=rz)
    else:
        wood.box((c[0], c[1], 0.01 + ht / 2), (L, lf["thickness"], ht), "door_wood", rz=rz)
        kp = c - u * 0.0
        wood.box((kp[0], kp[1], 0.14), (L - 0.04, lf["thickness"] + 0.004, 0.25), "steel", rz=rz)
        q = tip - u * 0.08
        nrm = np.array([-u[1], u[0]])
        for s in (-1, 1):
            p = q + nrm * s * (lf["thickness"] / 2 + 0.03)
            wood.cyl((q[0] + nrm[0] * s * lf["thickness"] / 2, q[1] + nrm[1] * s * lf["thickness"] / 2, 1.0), (p[0], p[1], 1.0), 0.01, "steel", 10)
            p2 = p - u * 0.12
            wood.cyl((p[0], p[1], 1.0), (p2[0], p2[1], 1.0), 0.011, "steel", 10)
wood.obj("door_leaves", C["Doors"], bevel=0.004)

# fixed/sliding glass panel filling the rest of each patient-room front
for h in front_headers:
    ax = np.array(h["axis"]); c = np.array(h["c"]); w = h["width"]; nrm = np.array([-ax[1], ax[0]])
    lfs = [lf for lf in plan["leaves"] if Point(lf["c"]).distance(Polygon(h["poly"])) < 0.12]
    span0, span1 = -w / 2 + 0.05, w / 2 - 0.05
    covered = []
    for lf in lfs:
        lc = (np.array(lf["c"]) - c) @ ax
        covered.append((lc - lf["length"] / 2, lc + lf["length"] / 2))
    gaps, cur = [], span0
    for s0, s1 in sorted(covered):
        if s0 - cur > 0.25:
            gaps.append((cur, s0))
        cur = max(cur, s1)
    if span1 - cur > 0.25:
        gaps.append((cur, span1))
    ht = B["door_head"] - 0.06
    for g0, g1 in gaps:
        mid = c + ax * (g0 + g1) / 2 + nrm * 0.0
        L = g1 - g0 + 0.06
        rz = math.atan2(ax[1], ax[0])
        glassb.box((mid[0], mid[1], 0.02 + ht / 2), (L - 0.08, 0.012, ht - 0.08), "glass", rz=rz)
        for s in (-1, 1):
            q = mid + ax * s * (L / 2 - 0.03)
            glassb.box((q[0], q[1], 0.02 + ht / 2), (0.06, 0.05, ht), "frame_metal", rz=rz)
        for zz in (0.06, ht - 0.02, 1.05):
            glassb.box((mid[0], mid[1], zz), (L, 0.05, 0.08 if zz != 1.05 else 0.04), "frame_metal", rz=rz)
        glassb.box((mid[0], mid[1], 1.35), (L - 0.1, 0.016, 0.3), "glass_frost", rz=rz)
if glassb.v:
    glassb.obj("front_glazing", C["Doors"], bevel=0.0)

# observation windows
win = kit.Builder()
for w in plan["windows"]:
    a, b = np.array(w["a"]), np.array(w["b"]); L = np.linalg.norm(b - a); t = (b - a) / L; c = (a + b) / 2
    nrm = np.array([-t[1], t[0]])
    hit = walls_u.intersection(LineString([c - nrm * 0.4, c + nrm * 0.4]))
    d = max(0.1, min(0.3, hit.length if not hit.is_empty else 0.12))
    rz = math.atan2(t[1], t[0]); z0, z1 = B["window_sill"], B["window_head"]
    win.box((c[0], c[1], (z0 + z1) / 2), (L, 0.012, z1 - z0), "glass", rz=rz)
    for zz in (z0 + 0.02, z1 - 0.02):
        win.box((c[0], c[1], zz), (L, d + 0.02, 0.04), "frame_metal", rz=rz)
    for s in (-1, 1):
        q = c + t * s * (L / 2 - 0.02)
        win.box((q[0], q[1], (z0 + z1) / 2), (0.04, d + 0.02, z1 - z0), "frame_metal", rz=rz)
if win.v:
    win.obj("observation_windows", C["Glazing"], bevel=0.0)

# full-height glazed screens tagged on the drawing, with their door leaf as drawn
scr = kit.Builder()
for q in spec["plan"].get("screens", []):
    y = q["a"][1]; z0, z1 = q["z0"], q["z1"]
    for x0, x1 in q["panes_x"]:
        scr.box(((x0 + x1) / 2, y, (z0 + z1) / 2), (x1 - x0, 0.012, z1 - z0), "glass")
        n_m = max(1, round((x1 - x0) / q["mullion_spacing"]))
        for i in range(n_m + 1):
            scr.box((x0 + (x1 - x0) * i / n_m, y, (z0 + z1) / 2), (0.05, 0.07, z1 - z0), "frame_metal")
    scr.box(((q["a"][0] + q["b"][0]) / 2, y, (z1 - 0.05 + H) / 2), (q["b"][0] - q["a"][0], 0.08, H - z1 + 0.05), "frame_metal")
    d = q["door"]; a_ = math.radians(d["angle_deg"]); ux, uy = math.cos(a_), math.sin(a_)
    cx_, cy_ = d["hinge"][0] + ux * d["length"] / 2, d["hinge"][1] + uy * d["length"] / 2
    ht = z1 - 0.1
    scr.box((cx_, cy_, ht / 2 + 0.01), (d["length"] - 0.08, 0.012, ht - 0.08), "glass", rz=a_)
    for s_ in (-1, 1):
        scr.box((cx_ + ux * s_ * (d["length"] / 2 - 0.03), cy_ + uy * s_ * (d["length"] / 2 - 0.03), ht / 2 + 0.01), (0.06, 0.05, ht), "frame_metal", rz=a_)
    for zz in (0.06, ht - 0.02):
        scr.box((cx_, cy_, zz), (d["length"], 0.05, 0.08), "frame_metal", rz=a_)
if scr.v:
    scr.obj("lobby_screen", C["Glazing"], bevel=0.0)

# ------------------------------------------------------------------ joinery
basin_src = kit.basin_tap(spec, KITC)
counters = []
for cnt in plan["counters"]:
    p = Polygon(cnt["poly"]).buffer(0)
    sp = space_at(p.representative_point())
    name = " ".join(sp["names"]) if sp else ""
    kind = "desk" if "OBSERV" in name else ("nurse" if p.area > 3.0 else "counter")
    counters.append((p, kind, sp))
cab, tops, plinth, ledge = [], [], [], []
for p, kind, sp in counters:
    top_z = B["desk_height"] if kind in ("desk", "nurse") else B["counter_height"]
    if kind == "desk":
        tops.append((p, top_z - 0.03, top_z))
        cab.append((p.buffer(-0.02).difference(p.buffer(-0.06)), 0.1, top_z - 0.03))  # modesty panels/legs
    else:
        tops.append((p.buffer(0.015, join_style="mitre"), top_z - 0.03, top_z))
        cab.append((p.buffer(-0.01), 0.1, top_z - 0.03))
        plinth.append((p.buffer(-0.06), 0.0, 0.1))
    if kind == "nurse":
        well = p.convex_hull.difference(p).buffer(-0.05)
        rim = p.difference(p.buffer(-0.24)).difference(well.buffer(0.3))
        ledge.append((rim, top_z, B["transaction_height"] - 0.03))
        tops.append((rim.buffer(0.015, join_style="mitre"), B["transaction_height"] - 0.03, B["transaction_height"]))
for name, items, mat in (("joinery_cabinets", cab, "cabinet"), ("joinery_tops", tops, "counter_top"),
                         ("joinery_plinth", plinth, "skirting"), ("joinery_ledge", ledge, "panel_wood")):
    ms = [extrude([pp], z0, z1) for pp, z0, z1 in items]
    ms = [m for m in ms if m is not None]
    if ms:
        tm_obj(name, trimesh.util.concatenate(ms), mat, C["Joinery"])
for i, bs in enumerate(plan["basins"]):
    cnt = next((p for p, kind, _ in counters if p.buffer(0.05).contains(Point(bs["c"]))), None)
    if cnt is None:
        continue
    # tap at the back edge: the counter edge nearest a wall
    pnear = np.array(walls_u.boundary.interpolate(walls_u.boundary.project(Point(bs["c"]))).coords[0])
    back = pnear - np.array(bs["c"]); back = back / (np.linalg.norm(back) + 1e-9)
    M = frame_matrix(bs["c"], -back, B["counter_height"] + 0.001)
    place(basin_src, f"basin_{i:02d}", M, C["Joinery"])

# ------------------------------------------------------------------ patient-room kit
bed = kit.icu_bed(spec, KITC)
pend = kit.pendant(spec, KITC, H)
vent = kit.ventilator(spec, KITC); iv = kit.iv_pole(spec, KITC)
recl = kit.recliner(spec, KITC); vchair = kit.visitor_chair(spec, KITC); table = kit.overbed_table(spec, KITC)
exam = kit.exam_light(spec, KITC, H); bins = kit.bins(spec, KITC); disp = kit.dispenser(spec, KITC)
ochair = kit.office_chair(spec, KITC); wst = kit.workstation(spec, KITC)
cart = kit.crash_cart(spec, KITC); stretch = kit.stretcher(spec, KITC)

unmatched = [o["_room"] for o in K["room_overrides"] if not any(is_patient(s) and s["poly"].contains(Point(o["label_at"])) for s in spaces)]
if unmatched:
    raise SystemExit(f"kit.room_overrides: label_at isn't inside a patient room: {unmatched}")
rooms_index = []
curtain = kit.Builder()
feat = kit.Builder()
for si, s in enumerate(spaces):
    if not is_patient(s):
        continue
    S = s["poly"]
    hs = [h for h in plan["headers"] if Polygon(h["poly"]).distance(S) < 0.12]
    if not hs:
        continue
    h = max(hs, key=lambda h: h["width"])
    f = np.array(h["c"]); ax = np.array(h["axis"]); nrm = np.array([-ax[1], ax[0]])
    if not S.contains(Point(f + nrm * 0.6)):
        nrm = -nrm
    c = np.array(S.centroid.coords[0])
    seg = S.intersection(LineString([c - nrm * 30, c + nrm * 30]))
    pts = np.array([q for g in getattr(seg, "geoms", [seg]) for q in g.coords])
    far = pts[np.argmax(pts @ nrm)]
    head = far - nrm * K["head_clearance"]
    footdir = -nrm
    x_axis = np.array([footdir[1], -footdir[0]])
    mid_line = S.intersection(LineString([head + footdir * 1.1 - x_axis * 20, head + footdir * 1.1 + x_axis * 20]))
    mp = np.array([q for g in getattr(mid_line, "geoms", [mid_line]) for q in g.coords])
    lat = (mp @ x_axis).min(), (mp @ x_axis).max()
    head = head + x_axis * ((lat[0] + lat[1]) / 2 - (head + footdir * 1.1) @ x_axis)
    # rooms the generic layout doesn't fit carry their own bed head and kit positions in the spec
    ov = next((o for o in K["room_overrides"] if S.contains(Point(o["label_at"]))), {})
    if "head" in ov:
        head = np.array(ov["head"], dtype=float)
    Kr = {**K, **ov}
    M = frame_matrix(head, footdir)
    tag = f"room{si:02d}"
    for src in [bed] + pend:
        place(src, f"{tag}_{src.name[4:]}", M, C["Equipment"])
    place(vent, f"{tag}_ventilator", M @ T(*Kr["ventilator"]) @ rot_z(180), C["Equipment"])
    place(iv, f"{tag}_iv_pole", M @ T(*Kr["iv_pole"]), C["Equipment"])
    rx_, ry_, rr_ = Kr["recliner"]; place(recl, f"{tag}_recliner", M @ T(rx_, ry_) @ rot_z(rr_), C["Equipment"])
    vx_, vy_, vr_ = Kr["visitor_chair"]; place(vchair, f"{tag}_visitor_chair", M @ T(vx_, vy_) @ rot_z(vr_), C["Equipment"])
    place(table, f"{tag}_overbed_table", M @ T(*Kr["overbed_table"]) @ rot_z(180), C["Equipment"])
    place(exam, f"{tag}_exam_light", M @ T(0, 1.1), C["Ceiling"])
    # privacy curtain on a ceiling track just inside the glazed front
    cw = K["curtain"]; w = h["width"]
    o = f + nrm * cw["offset_from_front"]
    curtain.box((o[0], o[1], H - 0.03), (w + 0.2, 0.03, 0.03), "steel", rz=math.atan2(ax[1], ax[0]))
    open_w = w * cw["open_fraction"]
    n_p = max(4, int(open_w / 0.11))
    side = ax if ((o + ax * w / 2) - head) @ ax > 0 else -ax
    start = o + side * (w / 2 + 0.05)
    verts = []
    for i in range(n_p + 1):
        p = start - side * (open_w * i / n_p) + nrm * (0.05 * (1 if i % 2 else -1))
        verts.append(p)
    for i in range(n_p):
        p0, p1 = verts[i], verts[i + 1]
        q = [(p0[0], p0[1], cw["bottom"]), (p1[0], p1[1], cw["bottom"]), (p1[0], p1[1], cw["top"]), (p0[0], p0[1], cw["top"])]
        curtain.add(q, [[0, 1, 2, 3]], "curtain")
        q2 = [(p0[0], p0[1], cw["top"]), (p1[0], p1[1], cw["top"]), (p1[0], p1[1], H - 0.04), (p0[0], p0[1], H - 0.04)]
        curtain.add(q2, [[0, 1, 2, 3]], "blind")
    # wood-look panel with a TV and bed-protection rails: on the side walls, or the foot wall where the override asks for it
    fo = ov.get("feature_wall", {})
    fw = {**K["feature_wall"], **fo, "tv": {**K["feature_wall"]["tv"], **fo.get("tv", {})}}
    bc = head + footdir * 1.1
    z0, z1 = fw["bumper_z"]
    bumper_len = fw.get("bumper_length", fw["length"] + 0.6)

    def to_wall(d):
        """Distance from the bed centre to the first wall along d, or None if there's none within 6 m."""
        hit = LineString([bc, bc + d * 6]).intersection(walls_u)
        return None if hit.is_empty else min(Point(bc).distance(g_) for g_ in getattr(hit, "geoms", [hit]))

    def tv_panel(Mw, tv_y):
        """Panel and TV on a wall; Mw's +x points from the wall into the room."""
        feat.boxz(0.004, 0, 0.0, fw["height"], 0.012, fw["length"], "panel_wood", Mw)
        tvw, tvd, tvh = fw["tv"]["size"]
        feat.boxz(0.012 + tvd / 2, tv_y, fw["tv"]["bottom"], fw["tv"]["bottom"] + tvh, tvd, tvw, "dark_plastic", Mw)
        feat.boxz(0.012 + tvd + 0.001, tv_y, fw["tv"]["bottom"] + 0.02, fw["tv"]["bottom"] + tvh - 0.02, 0.002, tvw - 0.04, "screen_dark", Mw)

    if fw.get("on") == "foot":
        d_foot = to_wall(footdir)
        if d_foot is None:
            raise SystemExit(f"kit.room_overrides: no foot wall within 6 m of the bed in {s['names']}")
        Mw = frame_matrix(bc + footdir * (d_foot - 0.004), x_axis)  # local +x is -footdir, into the room
        tv_panel(Mw, 0.0)
        feat.boxz(0.03, 0, z0, z1, 0.05, bumper_len, "bumper", Mw)
    else:
        for sgn in (-1, 1):
            dmin = to_wall(x_axis * sgn)
            if dmin is None:
                continue
            Mw = frame_matrix(bc + x_axis * sgn * (dmin - 0.004), footdir)
            if sgn == -1:
                tv_panel(Mw, 0.3)
            feat.boxz(-sgn * 0.03, 0, z0, z1, 0.05, bumper_len, "bumper", Mw)
    # bins by the sink side of the front, dispensers on the wall next to the door
    rooms_index.append({"id": tag, "names": s["names"], "label_at": s["labels"][0], "head": head.round(3).tolist(), "foot_dir": footdir.round(4).tolist(),
                        "front": f.round(3).tolist(), "front_normal_in": nrm.round(4).tolist(), "front_axis": ax.round(4).tolist(),
                        "front_width": h["width"], "area_m2": round(S.area, 2)})
if feat.v:
    feat.obj("room_feature_walls", C["Equipment"], bevel=0.006)
if curtain.v:
    cobj = curtain.obj("curtains", C["Equipment"], bevel=0.0)
    for poly in cobj.data.polygons:
        poly.use_smooth = True
    sol = cobj.modifiers.new("solidify", "SOLIDIFY"); sol.thickness = 0.004
    kit.apply_mods(cobj)


def desk_seat(p):
    """Where someone sits at a drawn desk: the middle of its front edge, and the way they face, square to that edge.

    Worked out from the desk alone. The corridor and the nooks are one space in the plan, so the space's centre
    is near the middle of the floor and says nothing about which way a desk faces.
    """
    c = np.array(p.centroid.coords[0])
    well = p.convex_hull.difference(p)
    if well.area > 0.25 * p.area:  # a desk wrapped around a well, like a nook's chevron, is sat at from the well
        well = max(getattr(well, "geoms", [well]), key=lambda g: g.area)
        start = np.array(well.centroid.coords[0])
        d = c - start
    else:  # a straight counter is sat at from the side away from the wall behind it
        d = np.array(walls_u.boundary.interpolate(walls_u.boundary.project(Point(c))).coords[0]) - c
        start = c - d / np.linalg.norm(d) * 2
    d = d / np.linalg.norm(d)
    hit = p.exterior.intersection(LineString([start, start + d * 6]))
    near = min((np.array(g.coords[0]) for g in getattr(hit, "geoms", [hit])), key=lambda q: np.linalg.norm(q - start))
    xy = np.array(p.exterior.coords)
    i = min(range(len(xy) - 1), key=lambda k: LineString(xy[k:k + 2]).distance(Point(near)))
    e = xy[i + 1] - xy[i]
    n = np.array([e[1], -e[0]]) / np.linalg.norm(e)
    return (xy[i] + xy[i + 1]) / 2, n if n @ d > 0 else -n


def plan_footprint(ob, M):
    """Outline on the plan of a kit object placed with matrix M."""
    xy = np.array([v.co[:2] for v in ob.data.vertices])
    return MultiPoint(xy @ M[:2, :2].T + M[:2, 3]).convex_hull


# nurse station, observation desks, alcoves
joinery = unary_union([c[0] for c in counters])
for ci, (p, kind, sp) in enumerate(counters):
    if kind == "nurse":
        well = p.convex_hull.difference(p)
        wc = np.array(well.centroid.coords[0]); v = np.array(p.centroid.coords[0]) - wc; v /= np.linalg.norm(v)
        ux = np.array([v[1], -v[0]])
        ext = well.intersection(LineString([wc - ux * 10, wc + ux * 10]))
        span = ext.length if not ext.is_empty else 2.0
        for k_ in np.linspace(-0.35, 0.35, 4) * span:
            seat = wc + ux * k_
            pt = seat.copy()
            for _ in range(80):
                if p.contains(Point(pt)):
                    break
                pt = pt + v * 0.03
            mon = pt + v * 0.25
            place(wst, f"nurse_ws_{ci}_{k_:+.1f}", frame_matrix(mon, v, B["desk_height"]), C["Equipment"])
            place(ochair, f"nurse_chair_{ci}_{k_:+.1f}", frame_matrix(pt - v * 0.55, v), C["Equipment"])
    elif kind == "desk":
        front, d = desk_seat(p)
        M_ws = frame_matrix(front + d * 0.32, d, B["desk_height"])  # keyboard just inside the front edge
        M_chair = frame_matrix(front - d * 0.45, d)
        foot_ws, foot_chair = plan_footprint(wst, M_ws), plan_footprint(ochair, M_chair)
        if foot_ws.intersection(p).area < 0.9 * foot_ws.area:
            continue  # a sliver of a counter: a workstation doesn't fit on it
        if foot_ws.intersects(walls_u) or foot_chair.intersects(walls_u) or foot_chair.intersects(joinery):
            raise SystemExit(f"desk items at {front.round(2).tolist()} cross a wall or counter")
        place(wst, f"obs_ws_{ci}", M_ws, C["Equipment"])
        place(ochair, f"obs_chair_{ci}", M_chair, C["Equipment"])
for r in plan["rooms"]:
    sp = space_at(r["label_at"])
    if sp is None:
        continue
    rect = sp["poly"].minimum_rotated_rectangle
    xy = np.array(rect.exterior.coords)[:4]
    e = [xy[(i + 1) % 4] - xy[i] for i in range(4)]
    long = max(e, key=np.linalg.norm); long = long / np.linalg.norm(long)
    c = np.array(sp["poly"].centroid.coords[0])
    if "CRASH CART" in r["name"]:
        place(cart, "crash_cart", frame_matrix(c, long), C["Equipment"])
    elif "STRETCHER" in r["name"]:
        place(stretch, f"stretcher_{int(c[0])}", frame_matrix(c, long), C["Equipment"])

# ------------------------------------------------------------------ lights
L_ = LT["panel_size"]; g = LT["panel_grid"]
xs = np.arange(math.floor(outline.bounds[0]), outline.bounds[2], g)
ys = np.arange(math.floor(outline.bounds[1]), outline.bounds[3], g)
panel = kit.Builder()
n_l = 0
for s in spaces:
    inner = s["poly"].buffer(-LT["wall_clearance"])
    if inner.is_empty or s["poly"].area < 2.0:
        continue
    cand = [(x + g / 2, y + g / 2) for x in xs for y in ys if inner.contains(Point(x + g / 2, y + g / 2))]
    if not cand:
        rp = inner.representative_point(); cand = [(rp.x, rp.y)]
    for (x, y) in cand:
        panel.box((x, y, H - 0.006), (L_, L_, 0.012), "led_panel")
        ld = bpy.data.lights.new(f"panel_{n_l}", "AREA"); ld.shape = "SQUARE"; ld.size = L_
        ld.energy = LT["panel_watts"]; ld.color = LT["panel_kelvin_rgb"]
        lo = bpy.data.objects.new(f"panel_{n_l}", ld); lo.location = (x, y, H - 0.02)
        C["Lights"].objects.link(lo); n_l += 1
pobj = panel.obj("ceiling_panels", C["Ceiling"], bevel=0.0)
pobj.visible_diffuse = False; pobj.visible_shadow = False
for r in rooms_index:
    hx, hy = np.array(r["head"]) + np.array(r["foot_dir"]) * 1.1
    ld = bpy.data.lights.new(f"exam_{r['id']}", "AREA"); ld.shape = "DISK"; ld.size = 0.5
    ld.energy = LT["panel_watts"] * 1.5; ld.color = LT["panel_kelvin_rgb"]
    lo = bpy.data.objects.new(f"exam_{r['id']}", ld); lo.location = (hx, hy, H - 0.06); C["Lights"].objects.link(lo)
for ob in C["Ceiling"].objects:
    if "exam_light" in ob.name:
        ob.visible_diffuse = False; ob.visible_shadow = False

sun = spec["lighting"]["sun"]
sd = bpy.data.lights.new("sun", "SUN"); sd.energy = sun["strength"]; sd.angle = math.radians(0.53)
so = bpy.data.objects.new("sun", sd); C["Lights"].objects.link(so)
el, az = math.radians(sun["elevation_deg"]), math.radians(sun["azimuth_deg"])
to_sun = Vector((math.cos(el) * math.sin(az), math.cos(el) * math.cos(az), math.sin(el)))
so.rotation_euler = to_sun.to_track_quat("Z", "Y").to_euler()

world = bpy.data.worlds.new("sky"); scene.world = world
nt = world.node_tree
sky = nt.nodes.new("ShaderNodeTexSky")
for k_, v in (("sky_type", "MULTIPLE_SCATTERING"), ("sun_disc", False), ("sun_elevation", el), ("sun_rotation", az),
              ("altitude", 30.0)):
    if hasattr(sky, k_):
        try:
            setattr(sky, k_, v)
        except Exception:  # older sky types
            pass
bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
bg.inputs["Strength"].default_value = LT["sky_strength"]
nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
out = nt.nodes.get("World Output") or nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(bg.outputs[0], out.inputs["Surface"])

# context: ground far below so windows look out onto something
gm = kit._principled("ground", "#C9B99A", 0.95)[0]; MATS["ground"] = gm
gb = kit.Builder(); gb.box((22, 18, -18.05), (400, 400, 0.1), "ground"); gb.obj("ground", C["Context"])

# ------------------------------------------------------------------ cameras
def add_cam(name, loc, look, lens=20.0, ortho=None):
    cd = bpy.data.cameras.new(name)
    if ortho:
        cd.type = "ORTHO"; cd.ortho_scale = ortho
    else:
        cd.lens = lens
    cd.clip_start = 0.05; cd.clip_end = 500
    co = bpy.data.objects.new(name, cd); C["Cameras"].objects.link(co)
    co.location = loc
    d = Vector(look) - Vector(loc)
    co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return co


cams = spec.get("cameras", {})
# hero room: the patient room whose label is nearest the spec's choice
target = np.array(cams.get("hero_room_label", [10.63, 21.01]))
hero = min(rooms_index, key=lambda r: np.linalg.norm(np.array(r["label_at"]) - target))
hd, fd, fr, nin, fax = (np.array(hero[k]) for k in ("head", "foot_dir", "front", "front_normal_in", "front_axis"))
bedc = hd + fd * 1.1
eye = cams.get("eye_height", 1.55)
xa = np.array([fd[1], -fd[0]])
side = 1 if ((fr - bedc) @ xa) > 0 else -1
def L2W(x, y):
    """Hero-room local (x across, y toward the foot) -> world 2D."""
    return hd + xa * x + fd * y


for name, (ex, ey, ez), (lx, ly, lz), lens in (
        ("cam_room_entry", cams["room_entry"]["eye"], cams["room_entry"]["look"], cams["room_entry"]["lens"]),
        ("cam_bedside", cams["bedside"]["eye"], cams["bedside"]["look"], cams["bedside"]["lens"])):
    add_cam(name, (*L2W(ex, ey), ez), (*L2W(lx, ly), lz), lens=lens)
cx, cy = cams.get("corridor_eye", [22.3, 27.0]); tx, ty = cams.get("corridor_look", [22.2, 20.0])
add_cam("cam_corridor", (cx, cy, eye), (tx, ty, 1.2), lens=18)
add_cam("cam_aerial", tuple(cams.get("aerial_eye", [44.0, -16.0, 34.0])), tuple(cams.get("aerial_look", [22.5, 15.5, 0.0])), lens=30)
# from the observation nook, through its window into the hero room
hero_poly = next(s["poly"] for s in spaces if s["poly"].contains(Point(hero["label_at"])))
oc = cams["observation"]
wbest = min(plan["windows"], key=lambda w: hero_poly.distance(LineString([w["a"], w["b"]])))
wa, wb = np.array(wbest["a"]), np.array(wbest["b"]); wm = (wa + wb) / 2
wt = (wb - wa) / np.linalg.norm(wb - wa); wn = np.array([-wt[1], wt[0]])
if hero_poly.contains(Point(wm + wn * 0.4)):
    wn = -wn
add_cam("cam_observation", (*(wm + wn * oc["back_from_glass"]), oc["eye"]), (*bedc, oc["look_z"]), lens=oc["lens"])
add_cam("cam_aerial_close", tuple(cams["aerial_close"]["eye"]), tuple(cams["aerial_close"]["look"]), lens=cams["aerial_close"]["lens"])
for name in ("iso_entry", "iso_room", "iso_window"):  # isolation room W1, in world coordinates
    add_cam(f"cam_{name}", tuple(cams[name]["eye"]), tuple(cams[name]["look"]), lens=cams[name]["lens"])
bx = outline.bounds
add_cam("cam_plan", ((bx[0] + bx[2]) / 2, (spec["plan"]["cut_south_y"] + bx[3]) / 2, 60.0),
        ((bx[0] + bx[2]) / 2, (spec["plan"]["cut_south_y"] + bx[3]) / 2, 0.0), ortho=max(bx[2] - bx[0], bx[3] - spec["plan"]["cut_south_y"]) + 2)
scene.camera = bpy.data.objects["cam_room_entry"]

# ------------------------------------------------------------------ save
for ob in list(KITC.objects):
    ob.hide_render = True
os.makedirs(os.path.join(ROOT, "output"), exist_ok=True)
bpy.ops.file.pack_all()
# ICU_BLEND writes the scene elsewhere (a plain rebuild replaces output/icu.blend)
bpy.ops.wm.save_as_mainfile(filepath=os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend"), compress=True)
planlib.label_rooms(rooms_index, spec)
# the 2D plan as built, for steps that work on one room (07)
geometry = {"walls": walls_u.wkt, "inside_glass": inside_glass.wkt,
            "spaces": [{"names": s["names"], "labels": s["labels"], "poly": s["poly"].wkt} for s in spaces]}
json.dump({"rooms": rooms_index, "hero": hero["id"], "lights": n_l, "spaces": len(spaces), "geometry": geometry},
          open(os.path.join(ROOT, "build", "scene_index.json"), "w"), indent=1)
tri = sum(len(o.data.polygons) for o in scene.objects if o.type == "MESH" and o.users_collection[0] != KITC)
print(f"scene: {len(rooms_index)} patient rooms furnished, {n_l} ceiling lights, {len(spaces)} spaces, "
      f"{len([o for o in scene.objects if o.type == 'MESH'])} mesh objects, ~{tri} faces -> {bpy.data.filepath}")
