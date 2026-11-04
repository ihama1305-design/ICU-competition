"""Export single rooms for the configurator: output/icu.blend -> assets/model/room_<label>.glb.gz + .json + AO maps.

Each room is cut out of the floor with its neighbours (ante room, toilet, a stub of corridor, its facade)
and gets surfaces of its own, named cfg_*, because the scene's walls, ceilings and glass are floor-wide meshes.
The furniture is placed from the room's layout in the spec and anchor_* empties mark where add-ons go.
This is a design proposal: output/icu.blend and the as-built model aren't changed.

  python scripts/07_export_room.py            every room in spec configurator.rooms
  python scripts/07_export_room.py W3         only these rooms
"""
import gzip
import json
import math
import os
import re
import sys

import bpy  # first: bpy makes bmesh importable
import bmesh  # noqa: I001
import numpy as np
import trimesh
from PIL import Image, ImageFilter
from shapely import affinity, wkt
from shapely.geometry import LineString, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
import planlib  # noqa: E402
from kit import T, frame_matrix, place, rot_z  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
K = spec["kit"]; B = spec["building"]; H = B["ceiling_height"]; F = B["facade"]
SITE = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))
MODEL = os.path.join(SITE, "assets", "model")
BLEND = os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend")
idx = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))
plan = json.load(open(os.path.join(ROOT, "build", "plan.json")))
GEO = idx["geometry"]
WALLS = wkt.loads(GEO["walls"])
INSIDE = wkt.loads(GEO["inside_glass"])
SPACES = [{"names": s["names"], "poly": wkt.loads(s["poly"])} for s in GEO["spaces"]]
HEADERS = [Polygon(h["poly"]).buffer(0) for h in plan["headers"]]
OUTLINE = Polygon(spec["plan"]["outline"]["points"])

# floor-wide solids, cut with a boolean; everything else in the scene is made of separate parts, kept or dropped whole
CUT_WIDE = re.compile(r"^(walls|wall_caps|slab|facade_upstand|facade_sill|facade_glass|facade_transom_.*)$")
CUT_TIGHT = re.compile(r"^(skirting|handrails|bumper|floor_vinyl|ceiling_rooms|ceiling_grid)$")
PARTS = re.compile(r"^(facade_mullions|facade_fins|facade_blinds|facade_blind_cassettes|door_frames|door_heads|door_leaves|"
                   r"front_glazing|observation_windows|curtains|ceiling_panels|joinery_.*|lobby_screen)$")
GLASS = ("cfg_facade_glass", "cfg_front_glass", "cfg_front_frost", "observation_windows", "ante_glazing", "lobby_screen", "cfg_blinds")


def to_tm(ob):
    me = ob.data
    me.calc_loop_triangles()
    M = np.array(ob.matrix_world)
    v = np.array([q.co for q in me.vertices], float)
    v = (np.c_[v, np.ones(len(v))] @ M.T)[:, :3]
    return trimesh.Trimesh(v, np.array([t.vertices for t in me.loop_triangles], int), process=False)


def set_tm(ob, tm):
    me = bpy.data.meshes.new(ob.name)
    me.from_pydata(tm.vertices.tolist(), [], tm.faces.tolist())
    me.update()
    for mat in ob.data.materials:
        me.materials.append(mat)
    ob.data = me
    ob.matrix_world = np.eye(4).tolist()


def remove(ob):
    bpy.data.objects.remove(ob, do_unlink=True)


def cut(ob, poly):
    """Keep the part of a solid inside the prism over poly; the cut faces are capped."""
    prism = trimesh.util.concatenate([trimesh.creation.extrude_polygon(g, H + 6.0) for g in getattr(poly, "geoms", [poly])])
    prism.apply_translation((0, 0, -3.0))
    try:
        tm = trimesh.boolean.intersection([to_tm(ob), prism], engine="manifold", check_volume=False)
    except Exception as err:
        raise SystemExit(f"07: could not cut {ob.name}: {err}")
    if len(tm.faces) == 0:
        remove(ob)
    else:
        set_tm(ob, tm)


def islands(bm):
    """Faces grouped by connected part, with each part's centre."""
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        seen.add(f.index); stack, part = [f], []
        while stack:
            g = stack.pop(); part.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); stack.append(h)
        c = np.mean([np.array(v.co) for g in part for v in g.verts], axis=0)
        out.append((part, c))
    return out


def keep_parts(ob, test):
    """Delete the parts whose centre fails test(centre). Returns the centres kept."""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kept, drop = [], []
    for part, c in islands(bm):
        if test(c):
            kept.append(c)
        else:
            drop.extend(part)
    if drop:
        bmesh.ops.delete(bm, geom=drop, context="FACES")
    me = bpy.data.meshes.new(ob.name)
    bm.to_mesh(me); bm.free()
    for mat in ob.data.materials:
        me.materials.append(mat)
    ob.data = me
    if not me.polygons:
        remove(ob)
    return kept


def split_by_material(ob, test, names):
    """Move the parts passing test(centre) out of ob into new objects, one per material: names = {material: new object name}."""
    made = []
    for mat_name, new in names.items():
        bm = bmesh.new(); bm.from_mesh(ob.data)
        drop = []
        for part, c in islands(bm):
            for f in part:
                if not test(c) or ob.data.materials[f.material_index].name != mat_name:
                    drop.append(f)
        bmesh.ops.delete(bm, geom=drop, context="FACES")
        if not bm.faces:
            bm.free(); continue
        me = bpy.data.meshes.new(new); bm.to_mesh(me); bm.free()
        for mat in ob.data.materials:
            me.materials.append(mat)
        o2 = bpy.data.objects.new(new, me); ob.users_collection[0].objects.link(o2)
        made.append(o2)
    keep_parts(ob, lambda c: not test(c))
    return made


def uv_mesh(name, verts, faces, uvs, mat, coll):
    """A mesh whose vertices each carry one UV, on UV map 0."""
    me = bpy.data.meshes.new(name)
    me.from_pydata(np.asarray(verts, float).tolist(), [], [list(f) for f in faces])
    me.update()
    layer = me.uv_layers.new(name="UVMap")
    for lp in me.loops:
        layer.data[lp.index].uv = uvs[lp.vertex_index]
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me); coll.objects.link(ob)
    return ob


def paint_walls(room, windows, mat, coll):
    """Room-side faces of the walls as one ribbon, 3 mm proud. u runs along the wall, v up it. Skips openings; a door keeps the wall above its head."""
    ring = list(orient(room.buffer(-0.003, join_style="mitre").simplify(0.004)).exterior.coords)
    runs = []  # (start, end, height spans); adjacent runs on one edge share a corner
    for p, q in zip(ring[:-1], ring[1:]):
        edge = LineString([p, q])
        mid = edge.interpolate(0.5, normalized=True)
        if WALLS.distance(mid) > 0.05:
            door = any(h.distance(mid) < 0.05 for h in HEADERS)
            runs.append((p, q, [(B["door_head"], H)] if door else []))  # no wall here: a door, the facade or a cut
            continue
        cuts = sorted(edge.project(Point(c)) for w in windows if w.distance(edge) < 0.35 for c in w.coords)
        if not cuts:
            runs.append((p, q, [(0.0, H)]))
            continue
        # the wall either side of an observation window runs full height; across it, below the sill and above the head
        t0, t1 = cuts[0], cuts[-1]
        a0, a1 = edge.interpolate(t0).coords[0], edge.interpolate(t1).coords[0]
        runs += [(p, a0, [(0.0, H)]), (a0, a1, [(0.0, B["window_sill"]), (B["window_head"], H)]), (a1, q, [(0.0, H)])]
    total = sum(math.dist(p, q) for p, q, _ in runs)
    v, f, uv = [], [], []
    s = 0.0
    for p, q, spans in runs:
        L = math.dist(p, q)
        u0, u1 = s / total, (s + L) / total
        for z0, z1 in spans:
            n = len(v)
            # normal to the left of p -> q: into the room on a counter-clockwise ring
            v += [(q[0], q[1], z0), (p[0], p[1], z0), (p[0], p[1], z1), (q[0], q[1], z1)]
            uv += [(u1, z0 / H), (u0, z0 / H), (u0, z1 / H), (u1, z1 / H)]
            f.append((n, n + 1, n + 2, n + 3))
        s += L
    return uv_mesh("cfg_paint_walls", v, f, uv, mat, coll)


def flat_mesh(name, poly, z, up, mat, coll):
    """A polygon as a flat surface with UVs over its bounds."""
    vs, fs = trimesh.creation.triangulate_polygon(poly)
    x0, y0, x1, y1 = poly.bounds
    faces = []
    for t in fs:
        a, b, c = vs[t[0]], vs[t[1]], vs[t[2]]
        ccw = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0
        faces.append(tuple(t) if ccw == up else (t[0], t[2], t[1]))
    return uv_mesh(name, [(p[0], p[1], z) for p in vs], faces, [((p[0] - x0) / (x1 - x0), (p[1] - y0) / (y1 - y0)) for p in vs], mat, coll)


def wall_quad(name, Mw, x, y0, y1, z0, z1, mat, coll):
    """A rectangle on a wall in a frame whose +x points into the room. UVs read the right way round from the room."""
    pts = [(x, y0, z0), (x, y1, z0), (x, y1, z1), (x, y0, z1)]
    v = (np.c_[np.array(pts), np.ones(4)] @ Mw.T)[:, :3]
    return uv_mesh(name, v, [(0, 1, 2, 3)], [(0, 0), (1, 0), (1, 1), (0, 1)], mat, coll)


def anchor(name, at, face, coll):
    """An empty whose local +Y faces into the room."""
    ob = bpy.data.objects.new(f"anchor_{name}", None)
    ob.matrix_world = frame_matrix(at[:2], face, at[2]).tolist()
    coll.objects.link(ob)
    return ob


def ray_to_wall(p, d):
    hit = LineString([p, p + d * 6]).intersection(WALLS)
    if hit.is_empty:
        raise SystemExit(f"07: no wall within 6 m of {p} along {d}")
    return min(Point(p).distance(g) for g in getattr(hit, "geoms", [hit]))


def own_material(base, name):
    m = bpy.data.materials[base].copy()
    m.name = name
    return m


def setup_cycles():
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
    sc.cycles.samples = 96
    sc.cycles.use_denoising = False
    sc.world.light_settings.distance = 1.4


def bake_ao(ob, size):
    """Ambient occlusion over the object's UVs, as an array with row 0 at the top of the image."""
    w, h = size
    img = bpy.data.images.new(f"ao_{ob.name}", w, h, alpha=False, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    mat = ob.data.materials[0]
    node = mat.node_tree.nodes.new("ShaderNodeTexImage")
    node.image = img
    mat.node_tree.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="AO", margin=8, use_clear=True)
    px = np.array(img.pixels, dtype=np.float32).reshape(h, w, 4)[::-1, :, 0]
    mat.node_tree.nodes.remove(node)
    bpy.data.images.remove(img)
    return px


def save_ao(px, path):
    im = Image.fromarray((np.clip(px, 0, 1) * 255).astype(np.uint8), "L").filter(ImageFilter.GaussianBlur(1.0))
    im.convert("RGB").save(path, "WEBP", quality=82, method=6)


def export_room(label, cfg):
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    kit.MATS.update({m.name: m for m in bpy.data.materials})
    kit.flatten_materials()
    room_i = next(r for r in idx["rooms"] if r["label"] == label)
    room = next(s["poly"] for s in SPACES if s["poly"].contains(Point(cfg["label_at"])))
    layout = cfg.get("layout") or next(o for o in K["room_overrides"] if room.contains(Point(o["label_at"])))
    head = np.array(layout["head"], float)
    foot = np.array(layout.get("foot_dir", room_i["foot_dir"]), float)
    x_axis = np.array([foot[1], -foot[0]])
    iso = any("ISOLATION" in n for n in room_i["names"])

    # ---------------------------------------------------------------- what's kept
    near = [s["poly"] for s in SPACES if s["names"] in (["ANTE"], ["TOILET"]) and 0 < s["poly"].distance(room) < 0.7]
    base = unary_union([room] + near)
    corridor = next(s["poly"] for s in SPACES if "CORRIDOR" in s["names"])
    stub = corridor.intersection(base.buffer(2.2)) if corridor.distance(base) < 0.7 else Polygon()
    stub = max(getattr(stub, "geoms", [stub]), key=lambda g: g.area) if not stub.is_empty else stub
    included = unary_union([base, stub]).buffer(0)
    # the facade alongside the room, out past its fins
    line = plan["facade"]["west" if label[0] == "W" else "east"]
    a, b = min(zip(np.array(line[:-1]), np.array(line[1:])), key=lambda seg: LineString(seg).distance(room))
    t = (b - a) / np.linalg.norm(b - a); n = np.array([t[1], -t[0]])
    if OUTLINE.contains(Point(*((a + b) / 2 + n * 0.5))):
        n = -n
    strip = room.intersection(LineString([a, b]).buffer(0.7, cap_style="flat"))
    ext = unary_union([strip, affinity.translate(strip, *(n * 1.7))]).convex_hull
    wide = unary_union([included.buffer(0.2, join_style="mitre"), ext])
    tight = unary_union([included.buffer(0.03), ext])
    def in_wide(c): return wide.contains(Point(c[0], c[1]))

    for cname in ("Lights", "Cameras", "Context"):
        for ob in list(bpy.data.collections[cname].objects):
            remove(ob)
    kit_src = {o.name: o for o in bpy.data.collections["Kit"].objects}
    bed_c = head + foot * 1.1
    panels = []
    for ob in list(bpy.context.scene.objects):
        if ob.type != "MESH" or ob.name in kit_src:
            continue
        nm = ob.name
        if re.match(r"room\d\d_", nm) or nm in ("room_feature_walls", "floor_rooms"):
            remove(ob)
        elif CUT_WIDE.match(nm):
            cut(ob, wide)
        elif CUT_TIGHT.match(nm):
            cut(ob, tight)
        elif nm == "ceiling_panels":
            # the configurator's own bed is under an exam light: no panel in its way
            kept = keep_parts(ob, lambda c: included.contains(Point(c[0], c[1])) and max(abs(c[0] - bed_c[0]), abs(c[1] - bed_c[1])) > 0.85)
            panels = [[round(float(c[0]), 3), round(float(c[1]), 3)] for c in kept if room.contains(Point(c[0], c[1]))]
        elif PARTS.match(nm):
            keep_parts(ob, in_wide)
        elif not in_wide(np.array(ob.matrix_world)[:2, 3]):  # placed copies: nurse station, nook desks, basins
            remove(ob)

    # ---------------------------------------------------------------- this room's own surfaces
    shell = bpy.data.collections["Shell"]; ceil = bpy.data.collections["Ceiling"]; equip = bpy.data.collections["Equipment"]
    windows = [LineString([w["a"], w["b"]]) for w in plan["windows"]]
    walls_ob = paint_walls(room, windows, own_material("wall", "cfg_paint"), shell)
    floor_ob = flat_mesh("cfg_floor", room, 0.0035, True, own_material("floor_room", "cfg_floor"), shell)
    ceil_ob = flat_mesh("cfg_ceiling", room, H - 0.001, False, own_material("ceiling_plain", "cfg_ceiling"), ceil)
    toilets = [p for p in near if p in [s["poly"] for s in SPACES if s["names"] == ["TOILET"]]]
    for i, p in enumerate(toilets):
        flat_mesh(f"cfg_ceiling_toilet_{i}", p, H - 0.001, False, own_material("ceiling_plain", f"cfg_ceiling_toilet_{i}"), ceil)
    # caps where the corridor stub stops, so it doesn't open onto the sky
    caps = kit.Builder()
    for g in getattr(included, "geoms", [included]):
        ring = list(orient(g).exterior.coords)
        for p, q in zip(ring[:-1], ring[1:]):
            mid = Point((p[0] + q[0]) / 2, (p[1] + q[1]) / 2)
            if WALLS.distance(mid) > 0.05 and INSIDE.boundary.distance(mid) > 0.05 and not any(h.distance(mid) < 0.05 for h in HEADERS):
                caps.add([(q[0], q[1], 0), (p[0], p[1], 0), (p[0], p[1], H), (q[0], q[1], H)], [[0, 1, 2, 3]], "wall")
    if caps.v:
        caps.obj("cfg_cut_caps", shell, bevel=0.0)

    for old, new in (("facade_glass", "cfg_facade_glass"), ("facade_blinds", "cfg_blinds"), ("curtains", "cfg_curtain")):
        if old in bpy.data.objects:
            bpy.data.objects[old].name = new
    # the glazed front this room's patient sits behind, apart from any other glass nearby
    f = np.array(room_i["front"]); ax = np.array(room_i["front_axis"]); w = room_i["front_width"]
    def at_front(c):
        d = np.array(c[:2]) - f
        return abs(d @ ax) < w / 2 + 0.25 and abs(d @ np.array([-ax[1], ax[0]])) < 0.3
    if "front_glazing" in bpy.data.objects:
        split_by_material(bpy.data.objects["front_glazing"], at_front, {"glass": "cfg_front_glass", "glass_frost": "cfg_front_frost", "frame_metal": "cfg_front_frame"})
        if "front_glazing" in bpy.data.objects:
            bpy.data.objects["front_glazing"].name = "ante_glazing"

    # ---------------------------------------------------------------- furniture, from the layout
    Kr = {**K, **layout}
    M = frame_matrix(head, foot)
    for src in ("bed", "pendant", "monitor", "pumps"):
        place(kit_src[f"kit_{src}"], f"cfg_kit_{src}", M, equip)
    place(kit_src["kit_ventilator"], "cfg_kit_ventilator", M @ T(*Kr["ventilator"]) @ rot_z(180), equip)
    place(kit_src["kit_iv_pole"], "cfg_kit_iv_pole", M @ T(*Kr["iv_pole"]), equip)
    rx, ry, rr = Kr["recliner"]; place(kit_src["kit_recliner"], "cfg_kit_recliner", M @ T(rx, ry) @ rot_z(rr), equip)
    vx, vy, vr = Kr["visitor_chair"]; place(kit_src["kit_visitor_chair"], "cfg_kit_visitor_chair", M @ T(vx, vy) @ rot_z(vr), equip)
    place(kit_src["kit_overbed_table"], "cfg_kit_overbed_table", M @ T(*Kr["overbed_table"]) @ rot_z(180), equip)
    place(kit_src["kit_exam_light"], "cfg_kit_exam_light", M @ T(0, 1.1), ceil)

    fw = {**K["feature_wall"], **layout["feature_wall"], "tv": {**K["feature_wall"]["tv"], **layout["feature_wall"].get("tv", {})}}
    wp = bed_c + foot * (ray_to_wall(bed_c, foot) - 0.004)
    Mw = frame_matrix(wp, x_axis)
    L = fw["length"]; tvw, tvd, tvh = fw["tv"]["size"]; tvz = fw["tv"]["bottom"]
    wall_quad("cfg_feature_wall", Mw, 0.012, -L / 2, L / 2, 0.0, fw["height"], own_material("panel_wood", "cfg_feature_wall"), equip)
    wall_quad("cfg_tv_screen", Mw, 0.012 + tvd + 0.001, -tvw / 2 + 0.02, tvw / 2 - 0.02, tvz + 0.02, tvz + tvh - 0.02, own_material("screen_dark", "cfg_tv_screen"), equip)
    tv = kit.Builder(); tv.boxz(0.012 + tvd / 2, 0, tvz, tvz + tvh, tvd, tvw, "dark_plastic", Mw); tv.obj("cfg_tv", equip, bevel=0.0)
    z0, z1 = fw["bumper_z"]
    bump = kit.Builder(); bump.boxz(0.03, 0, z0, z1, 0.05, fw["bumper_length"], "bumper", Mw); bump.obj("cfg_bumper", equip, bevel=0.0)

    # ---------------------------------------------------------------- anchors for add-ons
    anchor("tv", (*wp, tvz + tvh / 2), -foot, equip)
    for name, a_ in cfg["anchors"].items():
        anchor(name, a_["at"], a_["face"], equip)
    glass_line = strip.intersection(LineString([a + n * F["glass_offset"], b + n * F["glass_offset"]]).buffer(0.1))
    gc = np.array(glass_line.centroid.coords[0])
    anchor("patio", (*gc, 0.0), n, equip)
    for i, sgn in enumerate((-1, 1)):
        anchor(f"palm_{i + 1}", (*(gc + n * 3.2 + t * sgn * 1.4), -18.0), -n, equip)

    for ob in list(bpy.data.collections["Kit"].objects):
        remove(ob)

    # ---------------------------------------------------------------- ambient occlusion on the shell
    setup_cycles()
    hidden = [o for o in bpy.context.scene.objects if o.name in GLASS]
    for o in hidden:
        o.hide_render = True
    x0, y0, x1, y1 = room.bounds
    stem = f"room_{label.lower()}"
    ao_files = {}
    for ob, size, key in ((walls_ob, (2048, 128), "walls"), (floor_ob, (1024, round(1024 * (y1 - y0) / (x1 - x0) / 2) * 2), "floor"),
                          (ceil_ob, (512, round(512 * (y1 - y0) / (x1 - x0) / 2) * 2), "ceiling")):
        fn = f"{stem}_ao_{key}.webp"
        save_ao(bake_ao(ob, size), os.path.join(MODEL, fn))
        ao_files[key] = fn
    for o in hidden:
        o.hide_render = False

    # ---------------------------------------------------------------- write
    glb = os.path.join(ROOT, "output", f"{stem}.glb")
    bpy.ops.export_scene.gltf(filepath=glb, export_format="GLB", export_apply=True, export_yup=True,
                              export_lights=False, export_cameras=False, export_extras=False)
    gz = os.path.join(MODEL, f"{stem}.glb.gz")
    with open(gz, "wb") as fh:
        fh.write(gzip.compress(open(glb, "rb").read(), 9, mtime=0))

    door = max((h for h in HEADERS if h.distance(room) < 0.25 and Point(f).distance(h) < 0.5), key=lambda h: h.area)
    walk = unary_union([room, door] + [p for p in near if p not in toilets] + ([stub] if not any(s["names"] == ["ANTE"] for s in SPACES if s["poly"] in near) else []))
    walk = walk.buffer(0.03).buffer(-0.25, join_style="mitre").intersection(OUTLINE.buffer(-0.25))
    walk = max(getattr(walk, "geoms", [walk]), key=lambda g: g.area).simplify(0.03)
    outside = [k for k, c in cfg["cameras"].items() if k != "dollhouse" and not walk.contains(Point(c["eye"][:2]))]
    if outside:
        raise SystemExit(f"07: {label} camera eyes aren't inside the walkable area: {outside}")
    sidecar = {
        "label": label, "isolation": iso, "ceiling": H, "room": [round(v, 3) for v in room.bounds],
        "walkable": [[round(x, 3), round(y, 3)] for x, y in walk.exterior.coords[:-1]],
        "cameras": cfg["cameras"], "via": cfg["via"], "panels": panels,
        "bed": {"head": head.round(3).tolist(), "foot": foot.round(4).tolist(), "eye": (head + foot * 0.74).round(3).tolist() + [1.3]},
        "facade": {"at": gc.round(3).tolist(), "normal": n.round(4).tolist()},
        "ao": ao_files, "glb": f"{stem}.glb.gz",
    }
    json.dump(sidecar, open(os.path.join(MODEL, f"{stem}.json"), "w"), indent=1)
    size = sum(os.path.getsize(os.path.join(MODEL, fn)) for fn in [f"{stem}.glb.gz", f"{stem}.json"] + list(ao_files.values()))
    print(f"  assets/model/{stem}.* {size / 1e6:.2f} MB, {len(panels)} panels, walkable {walk.area:.1f} m2")


os.makedirs(MODEL, exist_ok=True)
want = sys.argv[1:] or list(spec["configurator"]["rooms"])
for lab in want:
    export_room(lab, spec["configurator"]["rooms"][lab])
