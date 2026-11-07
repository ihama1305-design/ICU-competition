"""Draw the 2D ventilation concept plan -> ventilation/index.html and assets/model/vents.json (spec site.dir).

Drawn from the derived plan (build/plan.json and the spaces in build/scene_index.json) and the grilles 02 placed (build/vents.json),
so it can't disagree with the 3D model. It never touches the record drawing: the sheets aren't used, published or embedded here. This is concept work, not
SSMC's mechanical design.
"""
import html
import json
import os
import re
import sys

from shapely import wkt
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
SITE = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))
plan = json.load(open(os.path.join(ROOT, "build", "plan.json")))
data = json.load(open(os.path.join(ROOT, "build", "vents.json")))
V = spec["ventilation"]
vents, zones = data["vents"], data["zones"]
esc = lambda t: html.escape(str(t), quote=True)  # noqa: E731

# ---------------------------------------------------------------- the frame: world metres to the SVG, north up
pts = spec["plan"]["outline"]["points"]
x0, x1 = min(p[0] for p in pts) - 1.5, max(p[0] for p in pts) + 1.5
y0, y1 = spec["plan"]["cut_south_y"] - 1.0, max(max(p[1] for p in pts), max(s["at"][1] for s in V["shafts_on_sheet"])) + 1.0
S = 22  # pixels per metre in the viewBox
X = lambda x: round((x - x0) * S, 1)  # noqa: E731
Y = lambda y: round((y1 - y) * S, 1)  # noqa: E731
W, H = X(x1), Y(y0)


def ring(coords):
    return "M" + " L".join(f"{X(p[0])} {Y(p[1])}" for p in coords) + " Z"


svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-labelledby="planTitle planDesc" class="plan">',
       '<title id="planTitle">Ventilation concept plan of the fourth-floor ICU</title>',
       f'<desc id="planDesc">{len(vents)} ceiling grilles on the derived floor plan: supply, return and exhaust, with room names. A concept, not SSMC\'s mechanical design.</desc>']

# floor, then walls, from the derived plan
svg.append(f'<path class="floor" d="{ring(plan["floor"])}"/>')
wall_d = " ".join(ring(w["outer"]) + " " + " ".join(ring(h) for h in w["holes"]) for w in plan["walls"])
svg.append(f'<path class="wall" fill-rule="evenodd" d="{wall_d}"/>')
svg.append('<g class="door">' + "".join(f'<path d="{ring(h["poly"])}"/>' for h in plan["headers"]) + "</g>")

types = {t["type"]: t for t in V["room_types"]}
KEEP_CAPS = {"FHC", "HSKP"}
NAMED = {"NURSE ST.": "Nurse station", "MEDS": "Medicines"}


def room_name(r):
    name = r["name"]
    if name in KEEP_CAPS:
        return name
    return NAMED.get(name, name.title().replace("Icu ", ""))


# what to write, and where it first wants to go. An isolation suite's label carries its pressure, which is the point of the plan
PA = {}
tagged = {}
for z in zones:
    if z["label_at"] is None:
        continue
    key = tuple(z["label_at"])
    if z["type"] in ("patient", "isolation"):
        tagged[key] = f"{z['id']} isolation" if z["type"] == "isolation" else z["id"]
    if z["type"].startswith("isolation"):
        m = re.search(r"-\d+ Pa", types[z["type"]]["pressure"])
        if m:
            PA[key] = m.group(0).replace("-", "\u2212")
wanted = []
seen = {}
for r in plan["rooms"]:
    name = r["name"]
    if re.fullmatch(r"L4\d", name) or (name in ("CORRIDOR", "LOBBY") and seen.get(name, 0) >= 2):
        continue
    seen[name] = seen.get(name, 0) + 1
    x, y = r["label_at"]
    if not (x0 < x < x1 and y0 < y < y1):
        continue
    key = (round(x, 3), round(y, 3))
    wanted.append((tagged.get(key, room_name(r)), PA.get(key), x, y))
for s_ in V["shafts_on_sheet"]:
    if s_["name"] != "RISER":  # the riser is a room label on the plan already
        text = f"{s_['name'].title()}, on the sheet"
        wanted.append((text, None, s_["at"][0] + len(text) * 0.235 / 2 + 0.45, s_["at"][1]))

# each label takes the nearest spot that hides no grille and no other label
CHAR_M, LINE_M = 0.235, 0.46
blocked_rects = [box(v["at"][0] - v["size"][0] / 2, v["at"][1] - v["size"][1] / 2, v["at"][0] + v["size"][0] / 2, v["at"][1] + v["size"][1] / 2) for v in vents]
OFFSETS = sorted(((dx * 0.3, dy * 0.3) for dx in range(-12, 13) for dy in range(-8, 9)), key=lambda o: o[0] ** 2 + (o[1] * 1.4) ** 2)
walls_all = unary_union([Polygon(w["outer"], w["holes"]).buffer(0) for w in plan["walls"]])
own_rooms = [wkt.loads(q["poly"]) for q in json.load(open(os.path.join(ROOT, "build", "scene_index.json")))["geometry"]["spaces"] if len(q["names"]) == 1]
labels = []
for text, pa, x, y in wanted:
    # an isolation suite's pressure goes on a second line, so the label fits a small ante room or toilet
    width = max(len(text), len(pa or "")) * CHAR_M
    tall = LINE_M * (2 if pa else 1)
    # a room with a polygon of its own keeps its label inside: a pressure written in the corridor would say the wrong thing
    home = next((q for q in own_rooms if q.contains(Point(x, y))), None)
    spot = None
    for dx, dy in OFFSETS:
        rect = box(x + dx - width / 2, y + dy - tall / 2, x + dx + width / 2, y + dy + tall / 2)
        if home is not None and not home.contains(rect.centroid):
            continue
        if not any(rect.intersects(q) for q in blocked_rects) and rect.intersection(walls_all).area < 0.02:
            spot = (x + dx, y + dy, rect)
            break
    if spot is None:
        spot = (x, y, box(x - width / 2, y - tall / 2, x + width / 2, y + tall / 2))
    blocked_rects.append(spot[2])
    px, py = X(spot[0]), Y(spot[1])
    if pa:
        labels.append(f'<text class="room" x="{px}" y="{py - 2}">{esc(text)}<tspan class="pa" x="{px}" dy="11">{esc(pa)}</tspan></text>')
    else:
        labels.append(f'<text class="room" x="{px}" y="{py + 3.5}">{esc(text)}</text>')


# ---------------------------------------------------------------- symbols: shape and colour both say the kind
def symbol(v):
    x, y = v["at"]
    w, d = v["size"]
    cx, cy, hw, hd = X(x), Y(y), w / 2 * S, d / 2 * S
    k = v["kind"]
    box = f'<rect x="{cx - hw:.1f}" y="{cy - hd:.1f}" width="{2 * hw:.1f}" height="{2 * hd:.1f}"/>'
    if k == "supply":
        mark = f'<path d="M{cx - hw:.1f} {cy - hd:.1f}L{cx + hw:.1f} {cy + hd:.1f}M{cx + hw:.1f} {cy - hd:.1f}L{cx - hw:.1f} {cy + hd:.1f}"/>'
    elif k == "return":
        mark = "".join(f'<path d="M{cx - hw:.1f} {cy + dy:.1f}H{cx + hw:.1f}"/>' for dy in (-hd / 2, 0, hd / 2))
    else:
        mark = f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{min(hw, hd) * 0.55:.1f}"/>'
    return f'<g class="v {k}" data-id="{esc(v["id"])}" data-zone="{esc(v["zone"])}"><title>{esc(V["grilles"][k]["label"])} grille, {esc(v["zone"])}</title>{box}{mark}</g>'


svg += [f'<g id="grilles">{"".join(symbol(v) for v in vents)}</g>']
svg.append('<g class="room-labels">' + "".join(labels) + "</g>")
# the only mechanical content on the sheet: its label is placed with the others
for s_ in V["shafts_on_sheet"]:
    x, y = s_["at"]
    svg.append(f'<g class="shaft"><circle cx="{X(x)}" cy="{Y(y)}" r="5"/></g>')
svg.append(f'<g class="north" transform="translate({W - 34} 40)"><path d="M0 14V-14M-6 -6L0 -14L6 -6"/><text y="30">N</text></g>')
svg.append("</svg>")

# ---------------------------------------------------------------- the tables
kinds = ("supply", "return", "exhaust")
count = {k: sum(1 for v in vents if v["kind"] == k) for k in kinds}
by_type = {}
for z in zones:
    d = by_type.setdefault(z["type"], {"zones": 0, "area": 0.0, "supply": 0, "return": 0, "exhaust": 0})
    d["zones"] += 1
    d["area"] += z["area_m2"]
for v in vents:
    if v["type"] in by_type:
        by_type[v["type"]][v["kind"]] += 1


def basis_row(t):
    d = by_type.get(t["type"])
    if t["type"] == "none" or not d:
        return ""
    return (f'<tr><th scope="row">{esc(t["label"])}</th><td>{esc(t.get("pressure", ""))}</td><td class="n">{t.get("ach_total", "")}</td>'
            f'<td class="n">{t.get("ach_outdoor", "–")}</td><td class="n">{d["supply"]} / {d["return"]} / {d["exhaust"]}</td><td>{esc(t["basis"])}</td></tr>')


values = {
    "PLAN": "\n".join(svg),
    "TOTAL": str(len(vents)), "SUPPLY": str(count["supply"]), "RETURN": str(count["return"]), "EXHAUST": str(count["exhaust"]),
    "ROWS": "\n".join(basis_row(t) for t in V["room_types"]),
    "REPO_URL": spec["site"]["repo"],
    "H": f"{spec['building']['ceiling_height']:.2f}",
}
page = open(os.path.join(ROOT, "scripts", "site", "ventilation.template.html")).read()
for k, v in values.items():
    page = page.replace("{{" + k + "}}", v)
left = re.findall(r"\{\{\w+\}\}", page)
if left:
    raise SystemExit(f"unfilled placeholders in the ventilation plan: {left}")
out = os.path.join(SITE, "ventilation")
os.makedirs(out, exist_ok=True)
open(os.path.join(out, "index.html"), "w").write(page)
os.makedirs(os.path.join(SITE, "assets", "model"), exist_ok=True)
json.dump({"_note": "Ventilation concept, not SSMC's mechanical design. The same grilles as the 3D model.", **data}, open(os.path.join(SITE, "assets", "model", "vents.json"), "w"), indent=1)
print(f"  ventilation/index.html {os.path.getsize(os.path.join(out, 'index.html')) / 1e3:.0f} KB, {len(vents)} grilles: {count}")
