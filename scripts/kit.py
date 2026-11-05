"""Blender helpers: materials, a mesh builder, and the ICU equipment kit.

Every kit item is built at the origin in its own local frame and returned as one mesh object
(several material slots). The scene script places linked copies, so all 16 rooms share meshes.
Patient-room frame (spec kit._frame): origin = bed-head centre on the floor, +Y toward the foot.
"""
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEX = os.path.join(ROOT, "build", "textures")


# ------------------------------------------------------------------ colour + materials
def hex_lin(h, a=1.0):
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c) + (a,)


MATS = {}


def _principled(name, color, rough=0.5, metal=0.0, **kw):
    m = bpy.data.materials.new(name)
    if bpy.app.version < (5, 0, 0):
        m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = hex_lin(color)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    for k, v in kw.items():
        bsdf.inputs[k].default_value = v
    m.diffuse_color = hex_lin(color)
    m["spec_color"] = color
    return m, nt, bsdf


def _coords(nt, kind="Object"):
    tc = nt.nodes.new("ShaderNodeTexCoord")
    return tc.outputs[kind]


def _speckle(nt, bsdf, color, amount, scale=60.0, bump=0.04):
    """Sheet-vinyl speckle: two noise scales tint the base colour; faint bump."""
    co = _coords(nt)
    n1 = nt.nodes.new("ShaderNodeTexNoise"); n1.inputs["Scale"].default_value = scale; n1.inputs["Detail"].default_value = 6
    nt.links.new(co, n1.inputs["Vector"])
    n2 = nt.nodes.new("ShaderNodeTexNoise"); n2.inputs["Scale"].default_value = 1.2; n2.inputs["Detail"].default_value = 2
    nt.links.new(co, n2.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "OVERLAY"
    mix.inputs["Factor"].default_value = amount * 3
    mix.inputs[6].default_value = hex_lin(color)
    nt.links.new(n1.outputs["Fac"], mix.inputs[7])
    mix2 = nt.nodes.new("ShaderNodeMix"); mix2.data_type = "RGBA"; mix2.blend_type = "OVERLAY"
    mix2.inputs["Factor"].default_value = amount * 1.5
    nt.links.new(mix.outputs[2], mix2.inputs[6]); nt.links.new(n2.outputs["Fac"], mix2.inputs[7])
    nt.links.new(mix2.outputs[2], bsdf.inputs["Base Color"])
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = bump
    nt.links.new(n1.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def _grid(nt, bsdf, color, tile, line_hex="#D9DBDC"):
    """Lay-in ceiling: brick texture with no offset = square grid in world metres."""
    co = _coords(nt, "Object")
    br = nt.nodes.new("ShaderNodeTexBrick")
    br.offset = 0.0
    br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = tile
    br.inputs["Row Height"].default_value = tile
    br.inputs["Mortar Size"].default_value = 0.012
    br.inputs["Mortar Smooth"].default_value = 0.2
    br.inputs["Color1"].default_value = hex_lin(color)
    br.inputs["Color2"].default_value = hex_lin(color)
    br.inputs["Mortar"].default_value = hex_lin(line_hex)
    nt.links.new(co, br.inputs["Vector"])
    nt.links.new(br.outputs["Color"], bsdf.inputs["Base Color"])
    n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 300
    nt.links.new(co, n.inputs["Vector"])
    b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = 0.08
    mx = nt.nodes.new("ShaderNodeMath"); mx.operation = "ADD"
    nt.links.new(n.outputs["Fac"], mx.inputs[0]); nt.links.new(br.outputs["Fac"], mx.inputs[1])
    nt.links.new(mx.outputs[0], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])


def _wood(nt, bsdf, color):
    co = _coords(nt)
    mp = nt.nodes.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1.0, 1.0, 0.06)
    nt.links.new(co, mp.inputs["Vector"])
    w = nt.nodes.new("ShaderNodeTexWave"); w.wave_type = "RINGS"; w.inputs["Scale"].default_value = 3.0
    w.inputs["Distortion"].default_value = 6; w.inputs["Detail"].default_value = 3
    nt.links.new(mp.outputs[0], w.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = hex_lin(color)
    c2 = [min(1.0, v * 0.78) for v in hex_lin(color)[:3]] + [1.0]
    ramp.color_ramp.elements[1].color = c2
    nt.links.new(w.outputs["Fac"], ramp.inputs["Fac"]); nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])


def _glass(m, nt, bsdf, frosted=False):
    """Clear glass that still lets sunlight through for shadow rays (Cycles light path trick)."""
    bsdf.inputs["Transmission Weight"].default_value = 1.0
    bsdf.inputs["IOR"].default_value = 1.5
    out = nt.nodes.get("Material Output")
    lp = nt.nodes.new("ShaderNodeLightPath")
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Shadow Ray"], mix.inputs["Fac"])
    nt.links.new(bsdf.outputs[0], mix.inputs[1]); nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    if frosted:
        bsdf.inputs["Roughness"].default_value = 0.35


def _image_emit(nt, bsdf, path, strength):
    img = bpy.data.images.load(path, check_existing=True)
    tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = strength


def make_materials(spec):
    M = spec["materials"]
    for name, d in M.items():
        m, nt, bsdf = _principled(name, d["color"], d.get("roughness", 0.5), d.get("metallic", 0.0))
        if name.startswith("floor"):
            _speckle(nt, bsdf, d["color"], d.get("speckle", 0.05))
        elif name == "ceiling":
            _grid(nt, bsdf, d["color"], d["tile"])
        elif name in ("door_wood", "handrail"):
            _wood(nt, bsdf, d["color"])
        elif name in ("wall", "wall_feature", "upstand"):
            n = nt.nodes.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = 180
            nt.links.new(_coords(nt), n.inputs["Vector"])
            b = nt.nodes.new("ShaderNodeBump"); b.inputs["Strength"].default_value = 0.03
            nt.links.new(n.outputs["Fac"], b.inputs["Height"]); nt.links.new(b.outputs["Normal"], bsdf.inputs["Normal"])
        elif name == "glass":
            _glass(m, nt, bsdf)
        elif name == "glass_frost":
            _glass(m, nt, bsdf, frosted=True)
        elif name in ("curtain", "blind", "sheet", "blanket", "upholstery"):
            bsdf.inputs["Sheen Weight"].default_value = 0.4
        MATS[name] = m
    # extra materials that are not plain colours
    m, nt, bsdf = _principled("ceiling_plain", M["ceiling"]["color"], 0.95)
    MATS["ceiling_plain"] = m
    m, nt, bsdf = _principled("led_panel", "#FFFFFF", 0.4)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.95, 0.88, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 6.0
    MATS["led_panel"] = m
    m, nt, bsdf = _principled("bag", "#E8F0F2", 0.1, **{"Transmission Weight": 0.8, "Alpha": 0.8})
    MATS["bag"] = m
    for key, path, s in (("screen_monitor", "monitor.png", 2.5), ("screen_ui", "workstation.png", 1.6),
                         ("screen_vent", "ventilator.png", 2.0), ("screen_pump", "pump.png", 1.5)):
        m, nt, bsdf = _principled(key, "#000000", 0.15)
        _image_emit(nt, bsdf, os.path.join(TEX, path), s)
        MATS[key] = m
    for key, hexc in (("outlet_green", "#2E9B57"), ("outlet_yellow", "#E3B521"), ("outlet_blue", "#2F6DB5"),
                      ("bin_yellow", "#E9C02A"), ("bin_black", "#26292C"), ("cart_red", "#B5322E"), ("accent_teal", "#2C8C8C")):
        MATS[key] = _principled(key, hexc, 0.4)[0]
    return MATS


# ------------------------------------------------------------------ screen textures
def make_textures():
    """Draw the monitor / ventilator / workstation screens once (synthetic, no real data)."""
    from PIL import Image, ImageDraw
    os.makedirs(TEX, exist_ok=True)

    def wave(g, box, kind, col, w=3):
        x0, y0, x1, y1 = box
        pts = []
        for i in range(x1 - x0):
            t = i / 90.0
            ph = t % 1.0
            if kind == "ecg":
                v = 0.0
                if 0.10 < ph < 0.16: v = 0.15 * math.sin((ph - 0.10) / 0.06 * math.pi)
                if 0.20 < ph < 0.22: v = -0.15
                if 0.22 < ph < 0.25: v = 1.0 - abs(ph - 0.235) * 60
                if 0.25 < ph < 0.27: v = -0.25
                if 0.36 < ph < 0.48: v = 0.25 * math.sin((ph - 0.36) / 0.12 * math.pi)
            elif kind == "pleth":
                v = max(0, math.sin(ph * math.pi * 2)) ** 1.5 * 0.9 + 0.1 * math.sin(ph * 6 * math.pi)
            elif kind == "resp":
                v = 0.5 * math.sin(t * 1.4)
            else:
                v = 0.8 if (ph % 1) < 0.4 else 0.1
            pts.append((x0 + i, (y0 + y1) / 2 - v * (y1 - y0) * 0.42))
        g.line(pts, fill=col, width=w)

    W, H = 640, 480
    im = Image.new("RGB", (W, H), (6, 10, 14)); g = ImageDraw.Draw(im)
    rows = [("ecg", (60, 230, 90)), ("pleth", (60, 210, 230)), ("art", (235, 70, 70)), ("resp", (240, 230, 90))]
    for k, (kind, col) in enumerate(rows):
        y = 20 + k * 110
        wave(g, (10, y, 450, y + 95), kind, col)
        g.line([(10, y + 100), (450, y + 100)], fill=(30, 40, 50))
        g.rectangle([470, y, 630, y + 95], outline=(30, 40, 50))
        g.text((480, y + 8), ["HR", "SpO2", "ART", "RR"][k], fill=col)
        g.text((520, y + 35), ["78", "97", "118/72", "16"][k], fill=col, font_size=40)
    im.save(os.path.join(TEX, "monitor.png"))

    im = Image.new("RGB", (512, 384), (14, 22, 30)); g = ImageDraw.Draw(im)
    g.rectangle([0, 0, 512, 40], fill=(28, 72, 98)); g.text((14, 10), "VC-AC   PEEP 5   FiO2 40%", fill=(220, 235, 240), font_size=18)
    wave(g, (10, 60, 380, 190), "pleth", (240, 200, 70)); wave(g, (10, 200, 380, 330), "resp", (90, 200, 240))
    for k, (lab, val) in enumerate((("Ppeak", "22"), ("VTe", "450"), ("RR", "14"), ("MV", "6.3"))):
        g.text((400, 60 + k * 75), lab, fill=(150, 170, 180), font_size=16); g.text((400, 80 + k * 75), val, fill=(240, 240, 240), font_size=30)
    im.save(os.path.join(TEX, "ventilator.png"))

    im = Image.new("RGB", (256, 128), (20, 40, 30)); g = ImageDraw.Draw(im)
    g.text((10, 10), "12.5 mL/h", fill=(150, 240, 160), font_size=34); g.text((10, 70), "VTBI 250", fill=(150, 200, 160), font_size=22)
    im.save(os.path.join(TEX, "pump.png"))

    im = Image.new("RGB", (640, 400), (236, 241, 245)); g = ImageDraw.Draw(im)
    g.rectangle([0, 0, 640, 36], fill=(31, 84, 140)); g.rectangle([0, 36, 140, 400], fill=(220, 228, 236))
    for k in range(8):
        g.rectangle([156, 52 + k * 42, 624, 86 + k * 42], fill=(255, 255, 255), outline=(205, 214, 222))
        g.rectangle([166, 62 + k * 42, 166 + 60 + (k * 37) % 180, 76 + k * 42], fill=(120, 150, 180))
        g.ellipse([590, 60 + k * 42, 606, 76 + k * 42], fill=[(60, 170, 90), (230, 180, 40), (210, 60, 60)][k % 3])
    im.save(os.path.join(TEX, "workstation.png"))


# ------------------------------------------------------------------ placing and exporting
def place(src, name, M, collection):
    """A linked copy of a kit object."""
    ob = bpy.data.objects.new(name, src.data)
    ob.matrix_world = Matrix(np.asarray(M).tolist())
    collection.objects.link(ob)
    return ob


def frame_matrix(origin, ydir, z=0.0):
    """Local frame: +Y along ydir (2D), Z up, origin on the floor."""
    y = np.array([ydir[0], ydir[1], 0.0]); y /= np.linalg.norm(y)
    x = np.array([y[1], -y[0], 0.0])
    M = np.eye(4); M[:3, 0] = x; M[:3, 1] = y; M[:3, 2] = (0, 0, 1); M[:3, 3] = (origin[0], origin[1], z)
    return M


def rot_z(deg):
    return np.array(Matrix.Rotation(math.radians(deg), 4, "Z"))


def T(x, y, z=0.0):
    return np.array(Matrix.Translation((x, y, z)))


def flatten_materials():
    """Procedural shaders don't survive glTF: reduce each material to its spec colour. Screen images and glass transmission stay."""
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
            bsdf.inputs["Base Color"].default_value = hex_lin(m["spec_color"])


# ------------------------------------------------------------------ mesh builder
class Builder:
    """Accumulate parts (verts/faces/material) and emit one mesh object."""

    def __init__(self):
        self.v, self.f, self.fm, self.mats, self.smooth = [], [], [], [], []

    def _m(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def add(self, verts, faces, mat, M=None, smooth=False):
        base = len(self.v)
        V = np.asarray(verts, float)
        if M is not None:
            M = np.asarray(M, float)
            V = (np.c_[V, np.ones(len(V))] @ M.T)[:, :3]
        self.v.extend(V.tolist())
        mi = self._m(mat)
        for f in faces:
            self.f.append([base + i for i in f]); self.fm.append(mi); self.smooth.append(smooth)
        return self

    def box(self, c, size, mat, M=None, rz=0.0):
        """Box centred at c (x, y, z-centre) with size (sx, sy, sz); rz about its own centre."""
        sx, sy, sz = (s / 2 for s in size)
        v = np.array([[x, y, z] for z in (-sz, sz) for y in (-sy, sy) for x in (-sx, sx)])
        if rz:
            ca, sa = math.cos(rz), math.sin(rz)
            v = v @ np.array([[ca, sa, 0], [-sa, ca, 0], [0, 0, 1]])
        v = v + np.asarray(c, float)
        f = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]]
        return self.add(v, f, mat, M)

    def boxz(self, x, y, z0, z1, sx, sy, mat, M=None, rz=0.0):
        return self.box((x, y, (z0 + z1) / 2), (sx, sy, z1 - z0), mat, M, rz)

    def cyl(self, p0, p1, r, mat, n=20, M=None, r1=None, smooth=True, caps=True):
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        ax = p1 - p0; L = np.linalg.norm(ax); ax = ax / L
        a = np.array([1, 0, 0]) if abs(ax[0]) < 0.9 else np.array([0, 1, 0])
        u = np.cross(ax, a); u /= np.linalg.norm(u); w = np.cross(ax, u)
        r1 = r if r1 is None else r1
        ang = np.linspace(0, 2 * np.pi, n, endpoint=False)
        ring0 = [p0 + r * (math.cos(t) * u + math.sin(t) * w) for t in ang]
        ring1 = [p1 + r1 * (math.cos(t) * u + math.sin(t) * w) for t in ang]
        v = ring0 + ring1
        f = [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        if caps:
            f += [list(range(n))[::-1], list(range(n, 2 * n))]
        return self.add(v, f, mat, M, smooth)

    def sphere(self, c, r, mat, n=12, M=None, scale=(1, 1, 1)):
        v, f = [], []
        for i in range(n + 1):
            th = math.pi * i / n
            for j in range(2 * n):
                ph = math.pi * j / n
                v.append([c[0] + r * scale[0] * math.sin(th) * math.cos(ph), c[1] + r * scale[1] * math.sin(th) * math.sin(ph),
                          c[2] + r * scale[2] * math.cos(th)])
        for i in range(n):
            for j in range(2 * n):
                a, b = i * 2 * n + j, i * 2 * n + (j + 1) % (2 * n)
                f.append([a, b, b + 2 * n, a + 2 * n])
        return self.add(v, f, mat, M, True)

    def tube(self, pts, r, mat, n=12, M=None):
        pts = [np.asarray(p, float) for p in pts]
        for a, b in zip(pts, pts[1:]):
            self.cyl(a, b, r, mat, n, M, caps=False)
        for p in pts[1:-1]:
            self.sphere(p, r, mat, 6, M)
        self.sphere(pts[0], r, mat, 6, M); self.sphere(pts[-1], r, mat, 6, M)
        return self

    def prism(self, poly, z0, z1, mat, M=None):
        """Extrude a simple 2D polygon (counter-clockwise) between z0 and z1."""
        P = [tuple(p) for p in poly]
        if len(P) > 2 and P[0] == P[-1]:
            P = P[:-1]
        n = len(P)
        area = sum(P[i][0] * P[(i + 1) % n][1] - P[(i + 1) % n][0] * P[i][1] for i in range(n))
        if area < 0:
            P = P[::-1]
        v = [(x, y, z0) for x, y in P] + [(x, y, z1) for x, y in P]
        f = [list(range(n))[::-1], list(range(n, 2 * n))] + [[i, (i + 1) % n, n + (i + 1) % n, n + i] for i in range(n)]
        return self.add(v, f, mat, M)

    def obj(self, name, coll=None, bevel=0.0, segments=2, smooth_angle=35, mods=True):
        me = bpy.data.meshes.new(name)
        me.from_pydata(self.v, [], self.f)
        me.update()
        for i, mi in enumerate(self.fm):
            me.polygons[i].material_index = mi
        for mname in self.mats:
            me.materials.append(MATS[mname])
        ob = bpy.data.objects.new(name, me)
        (coll or bpy.context.scene.collection).objects.link(ob)
        me.shade_smooth()
        if hasattr(me, "set_sharp_from_angle"):
            me.set_sharp_from_angle(angle=math.radians(smooth_angle))
        for p, s in zip(me.polygons, self.smooth):
            if s:
                p.use_smooth = True
        if bevel > 0 and mods:
            md = ob.modifiers.new("bevel", "BEVEL")
            md.width = bevel; md.segments = segments; md.limit_method = "ANGLE"
            md.angle_limit = math.radians(40); md.harden_normals = False
            apply_mods(ob)
        return ob


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    if old.users == 0:
        bpy.data.meshes.remove(old)
    return ob


def rx(deg):
    return np.array(Matrix.Rotation(math.radians(deg), 4, "X"))


def rz(deg):
    return np.array(Matrix.Rotation(math.radians(deg), 4, "Z"))


def tr(x, y, z):
    return np.array(Matrix.Translation((x, y, z)))


# ------------------------------------------------------------------ equipment
def caster(b, x, y, M=None, r=0.05):
    b.boxz(x, y, r * 2, r * 2 + 0.05, 0.03, 0.04, "steel", M)
    b.cyl((x - 0.022, y, r), (x + 0.022, y, r), r, "dark_plastic", 16, M)


def icu_bed(spec, coll):
    k = spec["kit"]["bed"]
    L, W, top = k["length"], k["width"], k["mattress_top"]
    back = k["backrest_deg"]
    b = Builder()
    # chassis, columns, castors
    b.boxz(0, L / 2, 0.16, 0.29, 0.78, 1.55, "plastic_grey")
    for y in (0.35, L - 0.35):
        for x in (-0.33, 0.33):
            caster(b, x, y, r=0.065)
    for y in (0.6, L - 0.6):
        b.boxz(0, y, 0.29, 0.44, 0.16, 0.16, "plastic_white")
    b.boxz(0, L / 2, 0.44, 0.50, W - 0.06, L - 0.28, "steel")
    hinge = 0.85
    mt = top - 0.5  # mattress thickness
    # leg section mattress + sheet + blanket
    b.boxz(0, (hinge + L - 0.12) / 2, 0.50, top, W - 0.1, L - 0.12 - hinge, "mattress")
    b.boxz(0, (hinge + L - 0.12) / 2, top - 0.01, top + 0.012, W - 0.08, L - 0.10 - hinge, "sheet")
    # backrest section, rotated up about the hinge line
    Mb = tr(0, hinge, 0.50) @ rx(-back)
    b.boxz(0, -(hinge - 0.12) / 2, 0.0, mt, W - 0.1, hinge - 0.12, "mattress", Mb)
    b.boxz(0, -(hinge - 0.12) / 2, mt - 0.01, mt + 0.012, W - 0.08, hinge - 0.10, "sheet", Mb)
    b.boxz(0, -0.42, mt + 0.01, mt + 0.13, 0.58, 0.36, "sheet", Mb)  # pillow
    # blanket folded over the foot half with side drops
    y0, y1 = hinge + 0.25, L - 0.14
    b.boxz(0, (y0 + y1) / 2, top + 0.012, top + 0.04, W - 0.02, y1 - y0, "blanket")
    for sx in (-1, 1):
        b.boxz(sx * (W / 2 - 0.005), (y0 + y1) / 2, top - 0.17, top + 0.04, 0.02, y1 - y0, "blanket")
    b.boxz(0, y0 + 0.12, top + 0.04, top + 0.08, W - 0.04, 0.22, "blanket")  # fold
    # head and foot boards
    b.boxz(0, 0.03, 0.46, 1.02, W, 0.06, "plastic_white")
    b.boxz(0, 0.0, 0.58, 0.92, W - 0.2, 0.02, "accent_teal")
    b.boxz(0, L - 0.03, 0.46, 0.92, W, 0.06, "plastic_white")
    b.boxz(0, L - 0.005, 0.70, 0.86, 0.36, 0.015, "dark_plastic")
    # split side rails: head rails follow the backrest, foot rails stay flat
    for sx in (-1, 1):
        x = sx * (W / 2 + 0.01)
        b.boxz(x, -0.45, mt - 0.02, mt + 0.30, 0.035, 0.62, "plastic_white", Mb)
        b.boxz(x * 1.02, -0.45, mt + 0.20, mt + 0.25, 0.03, 0.5, "plastic_grey", Mb)
        b.boxz(x, 1.55, top - 0.05, top + 0.28, 0.035, 0.80, "plastic_white")
        b.boxz(x * 1.02, 1.55, top + 0.18, top + 0.23, 0.03, 0.66, "plastic_grey")
    return b.obj("kit_bed", coll, bevel=0.012, segments=3)


def pendant(spec, coll, ceiling):
    k = spec["kit"]["pendant"]
    b = Builder()
    sx, sy, sh = k["column_size"]; z0 = k["column_bottom"]; z1 = z0 + sh
    mount = (0.0, -0.45)
    b.cyl((mount[0], mount[1], ceiling - 0.14), (mount[0], mount[1], ceiling), 0.2, "plastic_white", 32)
    za = ceiling - 0.42
    b.cyl((mount[0], mount[1], za), (mount[0], mount[1], ceiling - 0.14), 0.08, "plastic_white", 24)
    for cx, cy in k["column_offsets"]:
        # arm from the hub to above the column, then a drop tube
        d = np.array([cx - mount[0], cy - mount[1]]); L = np.linalg.norm(d); ang = math.atan2(d[1], d[0])
        b.box(((mount[0] + cx) / 2, (mount[1] + cy) / 2, za), (L, 0.13, 0.11), "plastic_white", rz=ang)
        b.cyl((cx, cy, z1), (cx, cy, za), 0.045, "plastic_white", 20)
        b.cyl((cx, cy, za - 0.06), (cx, cy, za + 0.06), 0.09, "plastic_white", 24)
        # supply column with gas outlets and shelves
        b.boxz(cx, cy, z0, z1, sx, sy, "plastic_white")
        side = 1 if cx > 0 else -1
        for i, m in enumerate(("outlet_green", "outlet_yellow", "outlet_blue", "plastic_white")):
            zz = z0 + 0.22 + i * 0.12
            b.cyl((cx - side * (sx / 2), cy, zz), (cx - side * (sx / 2 + 0.03), cy, zz), 0.025, m, 16)
        for zz in (z0 + 0.15, z0 + 0.62):
            b.boxz(cx, cy + 0.05, zz, zz + 0.025, sx + 0.18, sy + 0.2, "steel")
        b.boxz(cx, cy + sy / 2 + 0.01, z0 + 0.02, z1 - 0.02, sx - 0.06, 0.012, "plastic_grey")
    ob = b.obj("kit_pendant", coll, bevel=0.01, segments=3)
    # monitor on the left column, turned toward the bed
    m = Builder()
    cx, cy = k["column_offsets"][0]
    Mm = tr(cx + 0.05, cy + 0.25, z1 + 0.08) @ rz(-28)
    m.cyl((0, -0.12, -0.05), (0, -0.12, 0.08), 0.02, "steel", 12, Mm)
    m.boxz(0, 0, -0.05, 0.30, 0.46, 0.07, "dark_plastic", Mm)
    m.boxz(0, 0.036, -0.03, 0.28, 0.42, 0.004, "screen_monitor", Mm)
    mon = m.obj("kit_monitor", coll, bevel=0.008, segments=2)
    _uv_front(mon, "screen_monitor")
    # infusion pumps on the right column
    p = Builder()
    cx, cy = k["column_offsets"][1]
    for i in range(3):
        zz = z0 + 0.72 + i * 0.13
        p.boxz(cx - 0.02, cy + 0.2, zz, zz + 0.11, 0.2, 0.14, "plastic_white")
        p.boxz(cx - 0.06, cy + 0.271, zz + 0.05, zz + 0.095, 0.09, 0.004, "screen_pump")
    p.cyl((cx - 0.02, cy + 0.13, z0 + 0.6), (cx - 0.02, cy + 0.13, z1 + 0.5), 0.012, "steel", 10)
    for dx in (-0.06, 0.06):
        p.box((cx - 0.02 + dx, cy + 0.13, z1 + 0.38), (0.1, 0.03, 0.18), "bag")
    pumps = p.obj("kit_pumps", coll, bevel=0.008)
    _uv_front(pumps, "screen_pump")
    return [ob, mon, pumps]


def _uv_front(ob, mat_name):
    """Planar UVs for screen faces so the image textures fill each screen."""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new()
    uv = me.uv_layers.active.data
    mi = [i for i, m in enumerate(me.materials) if m and m.name == mat_name]
    for poly in me.polygons:
        if poly.material_index not in mi:
            continue
        co = np.array([me.vertices[me.loops[li].vertex_index].co for li in poly.loop_indices])
        n = np.array(poly.normal)
        up = np.array([0, 0, 1.0]); u = np.cross(up, n)
        if np.linalg.norm(u) < 1e-6:
            u = np.array([1.0, 0, 0])
        u /= np.linalg.norm(u); v = np.cross(n, u)
        U, V = co @ u, co @ v
        for li, a, c in zip(poly.loop_indices, U, V):
            uv[li].uv = ((a - U.min()) / max(1e-6, np.ptp(U)), (c - V.min()) / max(1e-6, np.ptp(V)))


def ventilator(spec, coll):
    b = Builder()
    b.boxz(0, 0, 0.12, 0.17, 0.52, 0.56, "plastic_grey")
    for x in (-0.22, 0.22):
        for y in (-0.24, 0.24):
            caster(b, x, y, r=0.05)
    b.boxz(0, 0.05, 0.17, 0.92, 0.09, 0.09, "plastic_white")
    b.boxz(0, 0.0, 0.40, 0.62, 0.36, 0.30, "plastic_grey")  # humidifier/compressor
    b.boxz(0, 0.0, 0.92, 1.24, 0.40, 0.32, "plastic_white")
    Ms = tr(0, -0.12, 1.24) @ rx(-15)
    b.boxz(0, 0, 0.0, 0.32, 0.40, 0.04, "dark_plastic", Ms)
    b.boxz(0, -0.021, 0.02, 0.30, 0.36, 0.003, "screen_vent", Ms)
    # breathing circuit loops toward the bed head
    pts = [(0.12 * s, -0.16, 1.0) for s in (-1, 1)]
    for s, p in zip((-1, 1), pts):
        b.tube([p, (p[0], -0.5, 0.95), (p[0] * 2.5, -0.85, 0.86), (-0.6 + 0.05 * s, -1.0, 0.85)], 0.016, "plastic_white", 10)
    ob = b.obj("kit_ventilator", coll, bevel=0.01)
    _uv_front(ob, "screen_vent")
    return ob


def iv_pole(spec, coll):
    b = Builder()
    for i in range(5):
        a = i * 2 * math.pi / 5
        b.cyl((0, 0, 0.1), (0.28 * math.cos(a), 0.28 * math.sin(a), 0.08), 0.014, "steel", 10)
        caster(b, 0.28 * math.cos(a), 0.28 * math.sin(a), r=0.035)
    b.cyl((0, 0, 0.08), (0, 0, 2.05), 0.014, "steel", 12)
    for a in (0, 90, 180, 270):
        t = math.radians(a)
        b.tube([(0, 0, 2.0), (0.14 * math.cos(t), 0.14 * math.sin(t), 2.0), (0.14 * math.cos(t), 0.14 * math.sin(t), 2.04)], 0.006, "steel", 8)
    for a in (0, 180):
        t = math.radians(a)
        b.box((0.14 * math.cos(t), 0.14 * math.sin(t), 1.86), (0.12, 0.035, 0.22), "bag")
    b.tube([(0.14, 0, 1.74), (0.14, 0.0, 1.5), (0.35, 0.25, 1.0), (0.8, 0.5, 0.75)], 0.003, "bag", 6)
    return b.obj("kit_iv_pole", coll, bevel=0.0)


def recliner(spec, coll):
    b = Builder()
    b.boxz(0, 0, 0.0, 0.08, 0.62, 0.7, "plastic_grey")
    for x in (-0.28, 0.28):
        for y in (-0.3, 0.3):
            caster(b, x, y, r=0.04)
    b.boxz(0, 0.0, 0.08, 0.38, 0.5, 0.5, "plastic_grey")
    b.boxz(0, 0.02, 0.38, 0.5, 0.58, 0.56, "upholstery")
    Mb = tr(0, -0.27, 0.45) @ rx(-18)
    b.boxz(0, -0.06, 0.0, 0.72, 0.58, 0.14, "upholstery", Mb)
    b.boxz(0, -0.08, 0.6, 0.78, 0.4, 0.12, "upholstery", Mb)  # head cushion
    for x in (-0.33, 0.33):
        b.boxz(x, 0.0, 0.38, 0.62, 0.1, 0.56, "upholstery")
        b.boxz(x, 0.0, 0.62, 0.66, 0.12, 0.58, "plastic_grey")
    Mf = tr(0, 0.30, 0.45) @ rx(60)
    b.boxz(0, 0.18, -0.06, 0.04, 0.56, 0.36, "upholstery", Mf)
    return b.obj("kit_recliner", coll, bevel=0.03, segments=3)


def visitor_chair(spec, coll):
    b = Builder()
    for x in (-0.22, 0.22):
        b.tube([(x, 0.22, 0.0), (x, 0.2, 0.44), (x, -0.2, 0.44), (x, -0.24, 0.0)], 0.011, "steel", 10)
        b.tube([(x, -0.2, 0.44), (x, -0.26, 0.86)], 0.011, "steel", 10)
    b.boxz(0, 0.0, 0.44, 0.49, 0.5, 0.46, "upholstery")
    Mb = tr(0, -0.24, 0.55) @ rx(-10)
    b.boxz(0, 0, 0.0, 0.32, 0.48, 0.05, "upholstery", Mb)
    return b.obj("kit_visitor_chair", coll, bevel=0.015, segments=3)


def overbed_table(spec, coll):
    b = Builder()
    b.boxz(0, 0, 0.06, 0.1, 0.06, 0.7, "plastic_grey")
    b.boxz(-0.3, 0, 0.06, 0.1, 0.62, 0.06, "plastic_grey")
    for y in (-0.32, 0.32):
        caster(b, 0, y, r=0.03)
    b.boxz(-0.55, 0, 0.1, 0.92, 0.06, 0.06, "steel")
    b.boxz(-0.2, 0, 0.92, 0.95, 0.85, 0.42, "cabinet")
    b.boxz(0.1, 0.05, 0.95, 1.0, 0.12, 0.08, "plastic_white")  # cup
    return b.obj("kit_overbed_table", coll, bevel=0.01)


def exam_light(spec, coll, ceiling):
    b = Builder()
    b.cyl((0, 0, ceiling - 0.05), (0, 0, ceiling - 0.002), 0.32, "plastic_white", 40)
    b.cyl((0, 0, ceiling - 0.052), (0, 0, ceiling - 0.05), 0.27, "led_panel", 40)
    return b.obj("kit_exam_light", coll, bevel=0.006)


def office_chair(spec, coll, mat="upholstery"):
    b = Builder()
    for i in range(5):
        a = i * 2 * math.pi / 5
        b.box((0.16 * math.cos(a), 0.16 * math.sin(a), 0.07), (0.32, 0.04, 0.03), "dark_plastic", rz=a)
        caster(b, 0.3 * math.cos(a), 0.3 * math.sin(a), r=0.028)
    b.cyl((0, 0, 0.08), (0, 0, 0.42), 0.025, "steel", 16)
    b.boxz(0, 0, 0.42, 0.5, 0.48, 0.46, mat)
    Mb = tr(0, -0.24, 0.5) @ rx(-8)
    b.boxz(0, 0, 0.12, 0.58, 0.44, 0.06, mat, Mb)
    b.boxz(0, 0.02, 0.0, 0.14, 0.06, 0.04, "dark_plastic", Mb)
    return b.obj("kit_office_chair", coll, bevel=0.02, segments=3)


def workstation(spec, coll):
    """Monitor + keyboard on a desk top at z=0 (placed at desk height)."""
    b = Builder()
    b.boxz(0, 0.08, 0.0, 0.015, 0.22, 0.18, "dark_plastic")
    b.boxz(0, 0.1, 0.015, 0.15, 0.05, 0.03, "dark_plastic")  # stops inside the tilted panel, short of the screen
    Mm = tr(0, 0.1, 0.12) @ rx(-6)
    b.boxz(0, 0, 0.0, 0.33, 0.56, 0.035, "dark_plastic", Mm)
    b.boxz(0, -0.019, 0.015, 0.315, 0.53, 0.003, "screen_ui", Mm)
    b.boxz(0, -0.22, 0.0, 0.02, 0.44, 0.14, "dark_plastic")
    b.boxz(0.32, -0.2, 0.0, 0.02, 0.06, 0.1, "dark_plastic")
    ob = b.obj("kit_workstation", coll, bevel=0.004)
    _uv_front(ob, "screen_ui")
    return ob


def basin_tap(spec, coll):
    """Basin bowl set into a counter top (z=0 = counter top) with a gooseneck tap."""
    b = Builder()
    b.cyl((0, 0, -0.004), (0, 0, 0.004), 0.21, "plastic_white", 40)
    b.cyl((0, 0, -0.003), (0, 0, 0.005), 0.17, "steel", 40)
    b.cyl((0, 0, 0.005), (0, 0, 0.006), 0.03, "dark_plastic", 16)
    b.tube([(0, -0.25, 0.0), (0, -0.25, 0.28), (0, -0.18, 0.33), (0, -0.1, 0.3), (0, -0.08, 0.22)], 0.012, "steel", 12)
    b.boxz(0.05, -0.25, 0.12, 0.14, 0.12, 0.02, "steel")
    return b.obj("kit_basin", coll, bevel=0.0)


def basin_drawn(spec, coll, name, rim, bowl, drain, drain_r, tap):
    """basin_tap's fitting in the drawing's own shape: rim and bowl outlines, drain and tap base are local (x, y), z=0 = counter top.

    The gooseneck runs toward +y and reaches 0.13 m, as drawn on the sink blocks.
    """
    b = Builder()
    b.prism(rim, -0.004, 0.004, "plastic_white")
    b.prism(bowl, -0.003, 0.005, "steel")
    b.cyl((drain[0], drain[1], 0.005), (drain[0], drain[1], 0.006), drain_r, "dark_plastic", 16)
    x, y = tap
    b.tube([(x, y, 0.0), (x, y, 0.28), (x, y + 0.054, 0.33), (x, y + 0.115, 0.3), (x, y + 0.13, 0.22)], 0.012, "steel", 12)
    b.boxz(x + 0.05, y, 0.12, 0.14, 0.12, 0.02, "steel")
    return b.obj(name, coll, bevel=0.0)


def crash_cart(spec, coll):
    b = Builder()
    b.boxz(0, 0, 0.12, 1.0, 0.75, 0.5, "cart_red")
    for i in range(5):
        z = 0.2 + i * 0.16
        b.boxz(0, 0.252, z, z + 0.13, 0.7, 0.01, "cart_red")
        b.boxz(0, 0.262, z + 0.1, z + 0.115, 0.3, 0.02, "steel")
    b.boxz(0, 0, 1.0, 1.04, 0.8, 0.55, "dark_plastic")
    b.boxz(0.1, 0, 1.04, 1.22, 0.32, 0.28, "plastic_white")
    for x in (-0.3, 0.3):
        for y in (-0.2, 0.2):
            caster(b, x, y, r=0.05)
    return b.obj("kit_crash_cart", coll, bevel=0.01)


def stretcher(spec, coll):
    b = Builder()
    b.boxz(0, 0, 0.15, 0.3, 0.55, 1.6, "plastic_grey")
    for y in (-0.7, 0.7):
        for x in (-0.25, 0.25):
            caster(b, x, y, r=0.07)
    b.boxz(0, 0, 0.3, 0.75, 0.2, 0.2, "plastic_white")
    b.boxz(0, 0, 0.75, 0.82, 0.68, 1.95, "steel")
    b.boxz(0, 0, 0.82, 0.92, 0.64, 1.9, "mattress")
    b.boxz(0, 0.1, 0.92, 0.93, 0.66, 1.6, "sheet")
    return b.obj("kit_stretcher", coll, bevel=0.015)


def bins(spec, coll):
    b = Builder()
    for x, m in ((0, "bin_yellow"), (0.42, "bin_black")):
        b.cyl((x, 0, 0.0), (x, 0, 0.62), 0.17, m, 28, r1=0.18)
        b.cyl((x, 0, 0.62), (x, 0, 0.66), 0.19, "plastic_grey", 28)
        b.boxz(x, 0.17, 0.02, 0.05, 0.12, 0.08, "dark_plastic")
    return b.obj("kit_bins", coll, bevel=0.0)


def dispenser(spec, coll):
    b = Builder()
    for x, m in ((0, "plastic_white"), (0.16, "plastic_white"), (0.32, "outlet_blue")):
        b.boxz(x, -0.04, 1.25, 1.5, 0.12, 0.08, m)
    b.boxz(0.65, -0.05, 1.15, 1.55, 0.36, 0.1, "steel")  # glove box holder
    for i, m in enumerate(("outlet_blue", "plastic_white", "accent_teal")):
        b.boxz(0.53 + i * 0.12, -0.06, 1.2, 1.5, 0.1, 0.09, m)
    return b.obj("kit_dispensers", coll, bevel=0.006)
