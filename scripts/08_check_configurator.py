"""Headless check of the configurator page. Exits non-zero on any failure.

Serves the published site under /<repo>/ like GitHub Pages does, so an absolute path 404s, and runs in
Chromium with SwiftShader. That renderer manages about one frame a second, so nothing here waits a fixed time.

Loads without console errors or missing files, under the download budget, with the second room left unloaded;
every view works in both rooms; the camera can't leave the room by orbiting or during a move; the dollhouse
removes the ceiling and leaving it brings the ceiling back; the sun matches the spec at Afternoon, and the time
controls and the Day/Night toggle work; a phone gets a bottom sheet with no sideways scroll.
Every option in options.json changes the picture, in both rooms. Each lighting scheme, the smart glass and the palms
get screenshots to look at. Screenshots -> build/shots/config_*.png. Checks the published site in spec site.dir.
"""
import functools
import http.server
import io
import json
import os
import shutil
import sys
import tempfile
import threading

import numpy as np
from PIL import Image
from playwright.sync_api import TimeoutError as PlaywrightTimeout
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = json.load(open(os.path.join(ROOT, "spec", "icu_spec.json")))
SITE = os.path.normpath(os.path.join(ROOT, spec["site"]["dir"]))
SHOTS = os.path.join(ROOT, "build", "shots")
BUDGET_MB = 15
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
ROOMS = list(spec["configurator"]["rooms"])
os.makedirs(SHOTS, exist_ok=True)
fail = []


def check(ok, msg):
    print(("  ok    " if ok else "  FAIL  ") + msg)
    if not ok:
        fail.append(msg)


class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass


# the site inside a folder named like the repo, as on github.io/<repo>/
tmp = tempfile.mkdtemp()
os.symlink(SITE, os.path.join(tmp, "ICU-competition"))
server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_address[1]}/ICU-competition/configurator/"


def open_page(browser, width, height, scheme="light", query="", **kw):
    """Open the page and wait for it. Three.js comes from a CDN: a stalled download gets one more try, and names itself if it fails again."""
    for attempt in (1, 2):
        ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, **kw)
        pg = ctx.new_page()
        errs, missing, sizes, waiting = [], [], {}, set()

        def on_response(r, missing=missing, sizes=sizes):
            if r.status >= 400 and "fonts.g" not in r.url:
                missing.append(f"{r.status} {r.url}")
            try:
                sizes[r.url] = len(r.body())
            except Exception:
                pass

        pg.on("console", lambda m, errs=errs: errs.append(m.text) if m.type == "error" and "fonts.g" not in m.text else None)
        pg.on("pageerror", lambda e, errs=errs: errs.append(str(e)))
        pg.on("request", lambda r, w=waiting: w.add(r.url))
        pg.on("requestfinished", lambda r, w=waiting: w.discard(r.url))
        pg.on("requestfailed", lambda r, w=waiting: w.discard(r.url))
        pg.on("response", on_response)
        pg.goto(URL + query)
        try:
            pg.wait_for_function("window.__configReady === true || (window.__configErrors || []).length > 0", timeout=120000)
        except PlaywrightTimeout:
            stalled = sorted(waiting)
            third_party = [u for u in stalled if "127.0.0.1" not in u]
            print(f"  page not ready after 2 minutes (attempt {attempt}); still downloading: {stalled[:5]}")
            ctx.close()
            if attempt == 1 and third_party:
                continue
            raise SystemExit("configurator check FAILED: the page never became ready") from None
        errs += pg.evaluate("window.__configErrors")
        return ctx, pg, errs, missing, sizes


def drawn(pg):
    """Wait for interface animations, then for the frame after this change to reach the screen."""
    pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running')", timeout=60000)
    pg.evaluate("""() => new Promise((done, stop) => {
      const start = window.__configFrames, t0 = performance.now();
      window.__config.invalidate();
      const wait = () => {
        if (window.__configFrames > start) requestAnimationFrame(() => requestAnimationFrame(done));
        else if (performance.now() - t0 > 120000) stop(new Error('no new frame drawn in 2 minutes'));
        else requestAnimationFrame(wait);
      };
      requestAnimationFrame(wait);
    })""")


def frame(pg):
    """The picture as it stands, as an array, once any fade has finished."""
    pg.wait_for_function("!window.__config.fading()", timeout=60000)
    drawn(pg)
    return np.asarray(Image.open(io.BytesIO(pg.screenshot())).convert("RGB"), dtype=np.int16)


def go(pg, room):
    pg.evaluate(f"window.__config.room('{room}')")
    pg.wait_for_function(f"window.__config.state().room === '{room}'")


def set_defaults(pg):
    pg.evaluate("""() => { const c = window.__config;
      for (const s of c.options().sections) for (const g of s.groups) c.set(g.id, g.default); }""")


def shot(pg, name):
    drawn(pg)
    pg.screenshot(path=os.path.join(SHOTS, f"config_{name}.png"))


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    # ---------------------------------------------------------------- desktop
    ctx, pg, errs, missing, sizes = open_page(b, 1366, 820)
    check(not errs, f"page loads with no errors {errs[:3]}")
    check(not missing, f"nothing 404s under /<repo>/ {missing[:3]}")
    total = sum(sizes.values()) / 1e6
    check(total < BUDGET_MB, f"initial download {total:.1f} MB is under {BUDGET_MB} MB")
    check(not any("room_w3" in u for u in sizes), "the second room isn't loaded until it's asked for")
    check("noindex" in pg.inner_html("head"), "page is noindex, like the rest of the site")
    check("proposal" in pg.inner_text("#panel").lower(), "page says it's a design proposal")
    check("endorsed" in pg.inner_text("#panel"), "page carries the not-endorsed note")
    anchors = pg.evaluate("window.__config.anchors()")
    want = {"tv", "console", "toys", "playmat", "seating", "aquarium", "reading_light", "patio", "palm_1", "palm_2", "switch"}
    check(want <= set(anchors), f"add-on anchors are in the model {sorted(want - set(anchors))}")
    room_box = pg.evaluate("window.__config.state().roomBox")
    misplaced = [k for k, (x, y, _) in anchors.items() if not (room_box[0] - 6 < x < room_box[2] + 6 and room_box[1] - 6 < y < room_box[3] + 6)]
    check(not misplaced, f"anchors are at the room, not at the origin {misplaced[:4]}")

    s = pg.evaluate("window.__config.state()")
    sun = spec["lighting"]["sun"]
    check(abs(s["sun"]["azimuth"] - sun["azimuth_deg"]) < 0.5 and abs(s["sun"]["elevation"] - sun["elevation_deg"]) < 0.5,
          f"Afternoon's sun is the renders' sun ({s['sun']['azimuth']:.1f}, {s['sun']['elevation']:.1f})")
    morning = pg.evaluate("(() => { window.__config.time(window.__config.stops.morning); return window.__config.state().sun; })()")
    check(morning["azimuth"] < 180, f"the morning sun is in the east ({morning['azimuth']:.0f})")

    for room in ROOMS:
        pg.evaluate(f"window.__config.room('{room}')")
        pg.wait_for_function(f"window.__config.state().room === '{room}' && window.__config.eye().x !== undefined")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        views = pg.evaluate("window.__config.views()")
        check(set(views) == {"entrance", "bed", "bed_window", "family", "window", "dollhouse"}, f"{room} has all the views")
        for v in views:
            pg.evaluate(f"window.__config.camera('{v}', {{ instant: true }})")
            shot(pg, f"{room.lower()}_{v}")
            st = pg.evaluate("window.__config.state()")
            check(st["ceiling"] == (v != "dollhouse"), f"{room} {v}: ceiling {'on' if v != 'dollhouse' else 'off'}")
            if v != "dollhouse":
                check(pg.evaluate("window.__config.inRoom()"), f"{room} {v}: camera starts inside the room")
        for stop in ("morning", "midday", "afternoon", "sunset", "night"):
            pg.evaluate(f"window.__config.camera('window', {{ instant: true }}); window.__config.time(window.__config.stops.{stop})")
            shot(pg, f"{room.lower()}_time_{stop}")
        pg.evaluate("window.__config.camera('family', { instant: true }); window.__config.time(window.__config.stops.night)")
        shot(pg, f"{room.lower()}_night_family")

        # orbiting and zooming out as far as it will go, from each view, must stay in the room and above the floor
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        out = pg.evaluate("""() => {
          const c = window.__config, bad = [];
          for (const v of c.views().filter(n => n !== 'dollhouse')) {
            c.camera(v, { instant: true });
            for (let i = 0; i < 40; i++) {
              c.orbit(0.31, i % 2 ? 0.2 : -0.2);
              c.zoomOut(1.4);
              c.renderNow();
              const e = c.eye();
              if (!c.inRoom() || e.z < 0.2 || e.z > c.ceiling()) bad.push([v, i, +e.x.toFixed(2), +e.y.toFixed(2), +e.z.toFixed(2)]);
            }
          }
          return bad;
        }""")
        check(not out, f"{room}: orbit and zoom stay inside the room {out[:3]}")

        # every move between views: the planned route goes through the door, never through a wall
        out = pg.evaluate("""() => {
          const c = window.__config, names = c.views().filter(n => n !== 'dollhouse'), bad = [];
          for (const f of names) for (const t of names) if (f !== t) { const o = c.routeOutside(f, t); if (o.length) bad.push([f, t, o.length]); }
          return bad;
        }""")
        check(not out, f"{room}: every route between views stays inside the room {out[:6]}")

    # the options
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('family', { instant: true }); window.__config.time(window.__config.stops.night)")
    for room in ROOMS:
        go(pg, room)
        pg.evaluate("window.__config.camera('family', { instant: true }); window.__config.time(window.__config.stops.night)")
        for scheme in ("panels", "cove", "downlights", "slot", "circadian"):
            pg.evaluate(f"window.__config.set('scheme', '{scheme}')")
            shot(pg, f"{room.lower()}_scheme_{scheme}")
        set_defaults(pg)
        pg.evaluate("window.__config.set('nightlight', 'rounds')")
        shot(pg, f"{room.lower()}_rounds")
        set_defaults(pg)
        pg.evaluate("window.__config.time(window.__config.stops.afternoon); window.__config.camera('entrance', { instant: true })")
        pg.evaluate("window.__config.set('front', 'smart')")
        clear = frame(pg)
        pg.screenshot(path=os.path.join(SHOTS, f"config_{room.lower()}_glass_clear.png"))
        pg.evaluate("window.__config.set('switch', 'opaque')")
        opaque = frame(pg)
        pg.screenshot(path=os.path.join(SHOTS, f"config_{room.lower()}_glass_opaque.png"))
        # the test of opaque: repaint the room behind the glass. Through clear glass that shows; through opaque glass it mustn't
        width = clear.shape[1] * 6 // 10  # left of the panel
        pg.evaluate("window.__config.set('paint', 'custom', '#7a3b8f')")
        behind_opaque = (np.abs(frame(pg) - opaque).max(axis=2)[:, :width] > 6).sum()
        pg.evaluate("window.__config.set('switch', 'clear')")
        behind_clear = (np.abs(frame(pg) - clear).max(axis=2)[:, :width] > 6).sum()
        check(behind_clear > 2000, f"{room}: repainting the room shows through clear glass ({behind_clear} pixels)")
        check(behind_opaque < behind_clear / 50, f"{room}: and doesn't show through opaque glass ({behind_opaque} pixels)")
        pg.evaluate("window.__config.set('paint', 'cloud'); window.__config.set('switch', 'opaque')")
        # the switch on the wall does the same as the panel
        at = pg.evaluate("window.__config.frameSwitch()")
        drawn(pg)
        pg.mouse.click(at["x"], at["y"])
        check(pg.evaluate("window.__config.selected().switch") == "clear", f"{room}: clicking the switch on the wall clears the glass")
        set_defaults(pg)
        pg.evaluate("window.__config.camera('bed_window', { instant: true })")
        shot(pg, f"{room.lower()}_palms")
        pg.evaluate("window.__config.set('feature', 'mashrabiya'); window.__config.camera('bed', { instant: true })")
        shot(pg, f"{room.lower()}_mashrabiya")
        set_defaults(pg)

        # the visible controls drive the same state
    pg.click("#rooms button[data-value='W1']")
    pg.wait_for_function("window.__config.state().room === 'W1'")
    pg.click("#views button[data-value='dollhouse']")
    pg.wait_for_function("window.__config.state().view === 'dollhouse' && !window.__config.state().moving", timeout=120000)
    check(pg.evaluate("window.__config.state().ceiling") is False, "the Dollhouse button removes the ceiling")
    pg.click("#views button[data-value='bed']")
    pg.wait_for_function("window.__config.state().view === 'bed' && !window.__config.state().moving", timeout=120000)
    check(pg.evaluate("window.__config.state().ceiling") is True, "leaving the dollhouse brings the ceiling back")
    pg.click("#dayNight button[data-value='night']")
    check(pg.evaluate("window.__config.state().night") is True, "the Night button switches to night")
    pg.click("#dayNight button[data-value='day']")
    check(pg.evaluate("window.__config.state().night") is False, "the Day button returns to the last daytime")
    pg.evaluate("(() => { const t = document.getElementById('time'); t.value = '12'; t.dispatchEvent(new Event('input', { bubbles: true })); })()")
    check(abs(pg.evaluate("window.__config.state().hour") - 12) < 0.01, "the time slider sets the time")
    check("pm" in pg.inner_text("#timeNow") or "am" in pg.inner_text("#timeNow"), "the time is shown")
    pg.focus("#c")
    before = pg.evaluate("window.__config.eye()")
    pg.keyboard.press("ArrowLeft")
    after = pg.evaluate("window.__config.eye()")
    check(before != after, "arrow keys orbit the view")
    check(not errs, f"no errors after using every control {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- every option does something
    ctx, pg, errs, _, _ = open_page(b, 640, 400, query="?tier=low")
    pg.add_style_tag(content="#panel { display: none; }")
    pg.evaluate("window.dispatchEvent(new Event('resize'))")
    for room in ROOMS:
        go(pg, room)
        groups = pg.evaluate("window.__config.options().sections.flatMap(s => s.groups)")
        dead = []
        for g in groups:
            ch = g["check"]
            set_defaults(pg)
            for k, v in ch.get("first", {}).items():
                pg.evaluate(f"window.__config.set('{k}', '{v}')")
            pg.evaluate(f"window.__config.time(window.__config.stops.{ch['time']}); window.__config.camera('{ch['view']}', {{ instant: true }})")
            base = frame(pg)
            for o in g["options"]:
                if o["id"] == g["default"]:
                    continue
                pg.evaluate(f"window.__config.set('{g['id']}', '{o['id']}')")
                if (np.abs(frame(pg) - base).max(axis=2) > 6).sum() < 40:
                    dead.append(f"{g['id']}:{o['id']}")
                pg.evaluate(f"window.__config.set('{g['id']}', '{g['default']}')")
        n = sum(len(g["options"]) - 1 for g in groups)
        check(not dead, f"{room}: each of the {n} non-default options changes the picture {dead[:6]}")
        for g in (x for x in groups if x.get("custom")):
            set_defaults(pg)
            pg.evaluate(f"window.__config.time(window.__config.stops.{g['check']['time']}); window.__config.camera('{g['check']['view']}', {{ instant: true }})")
            base = frame(pg)
            pg.evaluate(f"window.__config.set('{g['id']}', 'custom', '#7a3b8f')")
            check((np.abs(frame(pg) - base).max(axis=2) > 6).sum() > 40, f"{room}: a custom {g['id']} colour changes the room")
    check(not errs, f"options: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- dark theme
    ctx, pg, errs, missing, _ = open_page(b, 1366, 820, scheme="dark")
    shot(pg, "dark")
    check(not errs, f"dark theme loads with no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- phone
    ctx, pg, errs, missing, _ = open_page(b, 390, 844, device_scale_factor=2, is_mobile=True, has_touch=True)
    shot(pg, "phone")
    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(over <= 0, f"phone: no sideways scroll ({over})")
    closed = pg.evaluate("document.getElementById('panel').getBoundingClientRect().top")
    pg.tap("#sheet")
    drawn(pg)
    opened = pg.evaluate("document.getElementById('panel').getBoundingClientRect().top")
    check(opened < closed - 100, f"phone: the bottom sheet opens ({closed:.0f} -> {opened:.0f})")
    shot(pg, "phone_open")
    tall = pg.evaluate("[...document.querySelectorAll('#panel button')].filter(b => b.offsetParent && b.getBoundingClientRect().height < 36).map(b => b.textContent)")
    check(not tall, f"phone: buttons are large enough to tap {tall[:3]}")
    pg.tap("#views button[data-value='bed_window']")
    pg.wait_for_function("window.__config.state().view === 'bed_window' && !window.__config.state().moving", timeout=120000)
    shot(pg, "phone_bed_window")
    check(not errs, f"phone: no errors {errs[:3]}")
    ctx.close()
    b.close()

server.shutdown()
shutil.rmtree(tmp, ignore_errors=True)
if fail:
    print(f"configurator check FAILED, {len(fail)} problem(s):")
    for m in fail:
        print("  -", m)
    sys.exit(1)
print("  configurator check: ok (load, budget, views, orbit limits, moves, dollhouse, sun, time, every option, smart glass, palms, themes, phone)")
