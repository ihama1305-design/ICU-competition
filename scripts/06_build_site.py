"""Build the GitHub Pages site (spec site.dir) from renders/, the model and scripts/site/.

Run after 04_export.py, which writes viewer/ and assets/model/, and 07_export_room.py, which adds the configurator's rooms. Every number on the page
comes from the build, so it can't drift from the model. Uses ICU_BLEND if set, like the other steps.
"""
import functools
import http.server
import json
import os
import re
import shutil
import statistics
import sys
import threading

from PIL import Image
from playwright.sync_api import sync_playwright
from shapely.geometry import Polygon

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import planlib  # noqa: E402

ROOT = planlib.ROOT
spec = planlib.load_spec()
SITE_DIR = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))
IMG = os.path.join(SITE_DIR, "assets", "img")
SRC = os.path.join(ROOT, "scripts", "site")
SITE_URL = spec["site"]["url"]
REPO_URL = spec["site"]["repo"]
WIDTHS = (800, 1400, 1920)
BLEND = os.environ.get("ICU_BLEND") or os.path.join(ROOT, "output", "icu.blend")
GLB = os.path.join(ROOT, "output", "icu.glb")
idx = json.load(open(os.path.join(ROOT, "build", "scene_index.json")))
plan = json.load(open(os.path.join(ROOT, "build", "plan.json")))
os.makedirs(IMG, exist_ok=True)


def optimise(path, name, widths=WIDTHS):
    """Write WebP sizes and return (src, srcset, width, height) for the largest size."""
    im = Image.open(path).convert("RGB")
    out = []
    for w in widths:
        w = min(w, im.width)
        h = round(im.height * w / im.width)
        fn = f"{name}-{w}.webp"
        im.resize((w, h), Image.LANCZOS).save(os.path.join(IMG, fn), "WEBP", quality=82, method=6)
        if (w, fn) not in out:
            out.append((w, fn))
    w_max, f_max = out[-1]
    srcset = ", ".join(f"assets/img/{fn} {w}w" for w, fn in out)
    return f"assets/img/{f_max}", srcset, w_max, round(im.height * w_max / im.width)


def img_tag(path, name, alt, sizes, loading):
    src, srcset, w, h = optimise(path, name)
    prio = ' fetchpriority="high"' if loading == "eager" else ""
    return (f'<img src="{src}" srcset="{srcset}" sizes="{sizes}" width="{w}" height="{h}" '
            f'alt="{alt}" loading="{loading}" decoding="async"{prio}>')


def settle(pg):
    """Wait for every interface animation to finish, then for a fresh frame of the 3D view.

    The software renderer runs at about 1 frame/s, so no fixed wait is safe: a transition can still be
    running seconds later. A timeout fails the build rather than publishing a half-finished screenshot.
    """
    pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running')", timeout=60000)
    pg.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")


# the configurator page: a template and its modules, which load the rooms 07 wrote to assets/model/
cfg_dir = os.path.join(SITE_DIR, "configurator")
shutil.rmtree(cfg_dir, ignore_errors=True)
shutil.copytree(os.path.join(SRC, "configurator"), cfg_dir)
cfg_page = open(os.path.join(SRC, "configurator.template.html")).read()
main_js = os.path.join(cfg_dir, "main.js")
main_src = open(main_js).read()
open(main_js, "w").write(re.sub(r"/\*SITE_JSON\*/\{.*?\}", json.dumps({k: v for k, v in spec["lighting"]["site"].items() if not k.startswith("_")}), main_src, count=1))
left = re.findall(r"\{\{\w+\}\}", cfg_page)
if left:
    raise SystemExit(f"unfilled placeholders in the configurator: {left}")
open(os.path.join(cfg_dir, "index.html"), "w").write(cfg_page)
open(os.path.join(SITE_DIR, ".nojekyll"), "w").close()


def capture_configurator_shots(tmp):
    """Real screenshots of the configurator for the home page. Returns each one's spec code, so its picture can link to that room."""
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass

    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 128  # the page asks for a dozen modules at once; the default backlog of 5 resets some of them

    server = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=SITE_DIR))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    # name: room, theme, view, time, which of the options panel and the room-mode bar stay in the picture, the steps that
    # set the scene, and the picture's height. A step is a CSS selector to click, or "js:" and a statement run with
    # c = window.__config. A shot of the room alone keeps neither the panel nor the bar.
    views = {
        "config-desert": ("W1", "desert", "overview", "night", ["panel", "hud"], [], 860),
        "config-calm": ("W3", "calm", "overview", "afternoon", [], [], 860),
        "config-patio": ("W3", "family", "bed_window", "afternoon", [], [], 860),
        # the proposal, at the top of the page: the hero's room at 16:9 like the render beside it, then one picture per feature
        "proposal-room": ("W1", "desert", "overview", "sunset", [], [], 810),
        "proposal-modes": ("W1", "calm", "overview", "afternoon", ["hud"], ["#modeBar button[data-mode='comfort']"], 860),
        "proposal-pacs": ("W1", "calm", "overview", "afternoon", ["panel", "hud"], ["#openPacs"], 860),
        "proposal-apis": ("W1", "calm", "overview", "afternoon", ["panel", "hud"], ["#openApis"], 860),
        "proposal-patient": ("W1", "desert", "patient", "afternoon", [], ["js:c.set('tvplay', 'orientation')"], 860),
        "proposal-clinical": ("W3", "calm", "overview", "afternoon", ["hud"], ["#modeBar button[data-mode='clinical']"], 860),
        # the vocal-distress cue: the sensor lit and its notice up, seen with the glazed front the nurse looks through
        "proposal-remote": ("W1", "calm", "family", "afternoon", ["hud"], ["js:document.querySelector(\".demo-sounds button[data-sound='call']\").click()"], 860),
    }
    codes = {}
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1440, "height": 860})
        for name, (room, theme, view, when, keep, steps, height) in views.items():
            pg.set_viewport_size({"width": 1440, "height": height})
            # a fresh load for each, so one shot's mode or open panel can't carry into the next
            pg.goto("about:blank")
            pg.goto(f"http://127.0.0.1:{server.server_address[1]}/configurator/?room={room}")
            pg.wait_for_function("window.__configReady === true", timeout=180000)
            pg.evaluate(f"window.__config.theme('{theme}'); window.__config.time(window.__config.stops.{when}); window.__config.camera('{view}', {{ instant: true }})")
            codes[name] = pg.evaluate("window.__config.code()")
            for step in steps:
                if step.startswith("js:"):
                    pg.evaluate("(() => { const c = window.__config; " + step[3:] + "; })()")
                else:
                    pg.click(step)
            pg.evaluate(f"for (const id of ['panel', 'hud']) document.getElementById(id).style.display = {json.dumps(keep)}.includes(id) ? '' : 'none'; dispatchEvent(new Event('resize'))")
            pg.wait_for_function("!window.__config.mode().easing && !window.__config.state().moving", timeout=120000)
            settle(pg)
            pg.screenshot(path=os.path.join(tmp, f"{name}.png"))
        b.close()
    server.shutdown()
    return codes


def capture_viewer_shots():
    """Real screenshots of the walkthrough, for the page's walkthrough section."""
    tmp = os.path.join(ROOT, "build", "shots")
    os.makedirs(tmp, exist_ok=True)
    hero = next(r for r in idx["rooms"] if r["id"] == idx["hero"])
    url = "file://" + os.path.join(ROOT, "output", "viewer", "index.html")
    with sync_playwright() as pw:
        b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        pg = b.new_page(viewport={"width": 1440, "height": 860})
        pg.goto(url)
        pg.wait_for_function("window.__viewerReady === true", timeout=180000)
        pg.evaluate("window.__view('first')")
        nx, ny = hero["front_normal_in"]
        fx, fy = hero["front"]
        pg.evaluate(f"window.__teleport({fx + nx * 3.7}, {fy + ny * 3.7})")  # far enough in that the camera clears the curtain
        pg.keyboard.press("v")
        settle(pg)
        pg.screenshot(path=os.path.join(tmp, "walk-behind.png"))
        pg.keyboard.press("v")
        pg.evaluate("window.__view('orbit')")
        settle(pg)
        pg.screenshot(path=os.path.join(tmp, "walk-orbit.png"))
        b.close()
    return tmp


shots = capture_viewer_shots()
config_codes = capture_configurator_shots(shots)

areas = [r["area_m2"] for r in idx["rooms"]]
values = {
    "SITE_URL": SITE_URL, "REPO_URL": REPO_URL,
    "ROOMS": str(len(idx["rooms"])),
    "AREA_MEDIAN": f"{statistics.median(areas):.1f}", "AREA_MIN": f"{min(areas):.1f}", "AREA_MAX": f"{max(areas):.1f}",
    "FLOOR_M2": f"{Polygon(spec['plan']['outline']['points']).area:,.0f}",
    "NOOKS": str(sum(1 for r in plan["rooms"] if r["name"] == "OBSERVATION")),
    "LIGHTS": str(idx["lights"]),
    "CEILING": f"{spec['building']['ceiling_height']:.2f}",
    **{f"CODE_{k.split('-')[1].upper()}": v for k, v in config_codes.items()},
}
os.makedirs(os.path.join(SITE_DIR, "downloads"), exist_ok=True)
shutil.copyfile(BLEND, os.path.join(SITE_DIR, "downloads", "icu.blend"))
shutil.copyfile(GLB, os.path.join(SITE_DIR, "downloads", "icu.glb"))
mb = lambda p: f"{os.path.getsize(p) / 1e6:.1f}"  # noqa: E731
values["BLEND_MB"] = mb(BLEND)
values["GLB_MB"] = mb(GLB)
values["GLB_WEB_MB"] = mb(os.path.join(SITE_DIR, "assets", "model", "icu.glb.gz"))

page = open(os.path.join(SRC, "index.template.html")).read()


def sub_img(m):
    name, alt, sizes, loading = (s.strip() for s in m.group(1).split("|"))
    return img_tag(os.path.join(ROOT, "renders", f"{name}.png"), name, alt, sizes, loading)


def sub_shot(m):
    name, alt, sizes, *loading = (s.strip() for s in m.group(1).split("|"))  # lazy unless it says otherwise: the hero's is eager
    return img_tag(os.path.join(shots, f"{name}.png"), name, alt, sizes, loading[0] if loading else "lazy")


page = re.sub(r"<!--IMG (.+?)-->", sub_img, page)
page = re.sub(r"<!--SHOT (.+?)-->", sub_shot, page)
page = re.sub(r"\{\{FULL:(\w+)\}\}", lambda m: f"assets/img/{m.group(1)}-{min(1920, Image.open(os.path.join(ROOT, 'renders', m.group(1) + '.png')).width)}.webp", page)
for k, v in values.items():
    page = page.replace("{{" + k + "}}", v)
left = re.findall(r"\{\{\w+\}\}", page)
if left:
    raise SystemExit(f"unfilled placeholders in the site: {left}")
open(os.path.join(SITE_DIR, "index.html"), "w").write(page)
shutil.copyfile(os.path.join(SRC, "styles.css"), os.path.join(SITE_DIR, "styles.css"))
shutil.copyfile(os.path.join(SRC, "favicon.svg"), os.path.join(SITE_DIR, "favicon.svg"))

# link preview image, 1200 x 630: the proposed room, as at the top of the page
im = Image.open(os.path.join(shots, "proposal-room.png")).convert("RGB")
scale = 1200 / im.width
im = im.resize((1200, round(im.height * scale)), Image.LANCZOS)
top = (im.height - 630) // 2
im.crop((0, top, 1200, top + 630)).save(os.path.join(IMG, "og.jpg"), "JPEG", quality=82, optimize=True)

size = sum(os.path.getsize(os.path.join(d, f)) for sub in ("assets", "viewer", "configurator", "downloads")
           for d, _, fs in os.walk(os.path.join(SITE_DIR, sub)) for f in fs)
print(f"  website {size / 1e6:.1f} MB; page data: {values}")
