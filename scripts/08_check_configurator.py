"""Headless check of the configurator page. Exits non-zero on any failure.

Serves the published site under /<repo>/ like GitHub Pages does, so an absolute path 404s, and runs in
Chromium with SwiftShader. That renderer manages about one frame a second, so nothing here waits a fixed time.

Loads without console errors or missing files, under the download budget, with the second room left unloaded;
every view works in both rooms; the camera can't leave the room by orbiting or during a move; the dollhouse
removes the ceiling and leaving it brings the ceiling back; the sun matches the spec at Afternoon, and the time
controls and the Day/Night toggle work; a phone gets a bottom sheet with no sideways scroll.
Every option in options.json changes the picture, in both rooms. Themes apply and stay editable; a spec code restores the
exact room after a reload, for every theme and 20 random rooms; the summary, image download and tour work.
Lighting schemes, smart glass, palms and themes get screenshots to look at. Screenshots -> build/shots/config_*.png. Checks the published site in spec site.dir.
"""
import functools
import http.server
import io
import json
import random
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


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 128  # the page asks for a dozen modules at once, each on its own connection


# the site inside a folder named like the repo, as on github.io/<repo>/
tmp = tempfile.mkdtemp()
os.symlink(SITE, os.path.join(tmp, "ICU-competition"))
server = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=tmp))
threading.Thread(target=server.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{server.server_address[1]}/ICU-competition/configurator/"


def open_page(browser, width, height, scheme="light", query="", **kw):
    """Open the page and wait for it. A page that doesn't become ready gets one more try, and reports how far it got."""
    for attempt in (1, 2):
        ctx = browser.new_context(viewport={"width": width, "height": height}, color_scheme=scheme, **kw)
        pg = ctx.new_page()
        errs, missing, sizes, waiting, failed = [], [], {}, set(), []

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
        pg.on("requestfailed", lambda r, w=waiting, f=failed: (w.discard(r.url), f.append(f"{r.failure} {r.url}")))
        pg.on("response", on_response)
        pg.goto(URL + query)
        try:
            pg.wait_for_function("window.__configReady === true || (window.__configErrors || []).length > 0", timeout=120000)
        except PlaywrightTimeout:
            stalled = sorted(waiting)
            pg.set_default_timeout(20000)
            try:
                stage = pg.evaluate("({ stage: window.__configStage, frames: window.__configFrames, visible: document.visibilityState, message: document.getElementById('load').textContent })")
            except Exception as err:
                stage = f"the page isn't answering: {str(err)[:80]}"
            print(f"  page not ready after 2 minutes (attempt {attempt}); still downloading: {stalled[:5]}; failed: {failed[:5]}; page: {stage}")
            ctx.close()
            if attempt == 1:
                print("  RETRY: trying the page once more")
                continue
            raise SystemExit("configurator check FAILED: the page never became ready") from None
        early = pg.evaluate("window.__configErrors")
        if early and attempt == 1 and failed:  # a request failed outright: the page says so, and it's worth one more try
            print(f"  RETRY: the page reported {early} after these failed: {failed[:5]}")
            ctx.close()
            continue
        errs += early
        if failed:
            print(f"  note: requests that failed without stopping the page: {failed[:5]}")
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
        check(set(views) == {"overview", "family", "entrance", "bed", "bed_window", "window", "dollhouse"}, f"{room} has all the views")
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
        pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.night)")
        shot(pg, f"{room.lower()}_night_overview")

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
    pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.night)")
    for room in ROOMS:
        go(pg, room)
        pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.night)")
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
        at = pg.evaluate("window.__config.frameAnchor('switch')")
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
    ctx, pg, errs, _, _ = open_page(b, 480, 300, query="?tier=low")
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
            pg.evaluate(f"window.__config.time(window.__config.stops.{ch['time']})")
            if "aim" in ch:
                up = 1.2 if ch["aim"] == "playmat" else 0.5
                pg.evaluate(f"window.__config.frameAnchor('{ch['aim']}', 1.8, {up})")
            else:
                pg.evaluate(f"window.__config.camera('{ch['view']}', {{ instant: true }})")
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

    # ---------------------------------------------------------------- themes
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    data = pg.evaluate("window.__config.options()")
    check(pg.evaluate("window.__config.currentTheme()") == "calm", "the page starts on Calm Clinical")
    for room in ROOMS:
        go(pg, room)
        for t in data["themes"]:
            pg.click(f"#themes button[data-value='{t['id']}']")
            check(pg.evaluate("window.__config.currentTheme()") == t["id"], f"{room}: {t['label']} applies")
            sel = pg.evaluate("window.__config.selected()")
            check(all(sel[k] == v for k, v in t["sets"].items()), f"{room}: {t['label']} sets all its options")
            pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.afternoon)")
            shot(pg, f"{room.lower()}_theme_{t['id']}_day")
            pg.evaluate("window.__config.camera('family', { instant: true })")
            shot(pg, f"{room.lower()}_theme_{t['id']}_family")
            pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.night)")
            shot(pg, f"{room.lower()}_theme_{t['id']}_night")
        # a theme is a starting point
        pg.evaluate("window.__config.set('floor', 'slate')")
        check(pg.evaluate("window.__config.selected().floor") == "slate" and pg.evaluate("window.__config.currentTheme()") is None,
              f"{room}: an option can still be changed after a theme, and the room then belongs to no theme")
        pg.evaluate("window.__config.theme('calm')")
    # what's said about the patio, and the patient's view from a Family Suite
    pg.evaluate("window.__config.theme('family')")
    go(pg, "W1")
    pg.evaluate("window.__config.time(window.__config.stops.afternoon); window.__config.camera('window', { instant: true })")
    shot(pg, "w1_patio")
    pg.evaluate("window.__config.set('shade', 'sail')")
    shot(pg, "w1_patio_sail")
    check("pressure regime" in pg.text_content("#options"), "W1: the patio carries the pressure warning")
    go(pg, "W3")
    check("pressure regime" not in pg.text_content("#options"), "W3: the patio has no isolation warning")
    go(pg, "W1")
    pg.evaluate("window.__config.set('patio', 'off')")
    check("pressure regime" not in pg.text_content("#options"), "W1: no patio warning without a patio")
    pg.evaluate("window.__config.set('patio', 'on')")
    go(pg, "W3")
    pg.evaluate("window.__config.camera('bed_window', { instant: true })")
    shot(pg, "w3_patio_from_bed")
    pg.evaluate("window.__config.theme('paediatric')")
    check(pg.evaluate("window.__config.selected().aquarium") == "digital", "Paediatric Play uses the digital aquarium, not a tank")
    pg.evaluate("window.__config.set('aquarium', 'sealed')")
    check("avoid fish tanks" in pg.text_content("#options"), "the sealed tank carries the CDC note")
    pg.evaluate("window.__config.frameAnchor('aquarium', 1.6, 0.1)")
    shot(pg, "w3_sealed_tank")
    pg.evaluate("window.__config.set('aquarium', 'digital')")
    shot(pg, "w3_digital_aquarium")
    pg.evaluate("window.__config.camera('bed', { instant: true }); window.__config.set('tvsize', 's65')")
    shot(pg, "w3_tv_on")

    # the summary: every choice, the notes, the proposal label
    pg.click("#openSummary")
    pg.wait_for_selector("#summary[open]")
    text = pg.inner_text("#summary")
    check(all(t in text for t in ("Vinyl floor", "Terrazzo", "Sea mural", "Digital screen", "65 inch", "proposal", "endorsed")), "the summary lists the choices and the proposal note")
    check(pg.evaluate("window.__config.code()") in text, "the summary shows the spec code")
    check("isn't made or endorsed" in text, "the summary carries the not-endorsed note")
    groups = sum(len(sec["groups"]) for sec in data["sections"])
    rows = pg.locator("#summaryBody dt").count()
    check(rows >= groups - 3, f"the summary lists every option that applies ({rows} rows)")
    pg.locator("#summaryBody img").evaluate("i => i.decode()")
    pg.screenshot(path=os.path.join(SHOTS, "config_summary.png"))
    with pg.expect_download(timeout=120000) as dl:
        pg.click("#saveImage2")
    file = dl.value.path()
    im = np.asarray(Image.open(file).convert("RGB"))
    check(dl.value.suggested_filename.endswith(".png") and im.std() > 5, f"Save image downloads a real picture ({dl.value.suggested_filename[:30]}, {im.shape[1]} x {im.shape[0]})")
    pg.click("#closeSummary")
    pg.evaluate("window.__config.theme('family')")
    go(pg, "W1")
    pg.click("#openSummary")
    pg.wait_for_selector("#summary[open]")
    text = pg.inner_text("#summary")
    check("pressure regime" in text and "fall-safety" in text, "a Family Suite summary in W1 carries the patio's warning and concept notes")
    pg.click("#closeSummary")
    go(pg, "W3")

    # the tour visits every view and ends by itself
    pg.evaluate("window.__config.startTour()")
    pg.wait_for_function("!window.__config.tour().running", timeout=180000)
    log = pg.evaluate("window.__config.tour().log")
    check(set(log) == set(pg.evaluate("window.__config.views()")), f"the tour visits every view ({len(log)} stops)")
    pg.evaluate("window.__config.startTour()")
    pg.mouse.click(300, 300)
    check(pg.evaluate("window.__config.tour().running") is False, "touching the view ends the tour")
    check(not errs, f"themes, summary, tour: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- a spec code restores the exact room
    ctx, pg, errs, _, _ = open_page(b, 480, 320, query="?tier=low")
    data = pg.evaluate("window.__config.options()")
    groups = [g for sec in data["sections"] for g in sec["groups"]]
    rnd = random.Random(20261104)
    rooms_to_try = [("theme", t["id"]) for t in data["themes"]] + [("random", i) for i in range(20)]
    bad = []
    for kind, which in rooms_to_try:
        if kind == "theme":
            pg.evaluate(f"window.__config.theme('{which}')")
        else:
            go(pg, rnd.choice(ROOMS))
            for g in groups:
                o = rnd.choice(g["options"])["id"]
                pg.evaluate(f"window.__config.set('{g['id']}', '{o}')")
            if rnd.random() < 0.4:
                pg.evaluate(f"window.__config.set('paint', 'custom', '#{rnd.randrange(16 ** 6):06x}')")
            pg.evaluate(f"window.__config.time({rnd.randrange(72, 264) / 12})")
            pg.evaluate(f"window.__config.camera('{rnd.choice(data['views'])}', {{ instant: true }})")
        before = pg.evaluate("({ selected: window.__config.selected(), state: window.__config.state(), code: window.__config.code() })")
        pg.wait_for_function(f"location.hash === '#c={before['code']}'")
        pg.reload()
        pg.wait_for_function("window.__configReady === true", timeout=120000)
        after = pg.evaluate("({ selected: window.__config.selected(), state: window.__config.state(), code: window.__config.code() })")
        keys = ("room", "view")
        same = all(before["state"][k] == after["state"][k] for k in keys) and abs(before["state"]["hour"] - after["state"]["hour"]) < 0.05
        # options a group's requirement hides, and a custom colour left over after choosing a swatch, don't matter only if they round-trip too
        wanted = {k: v for k, v in before["selected"].items() if ":custom" not in k or before["selected"][k.split(":")[0]] == "custom"}
        if not same or any(after["selected"].get(k) != v for k, v in wanted.items()) or before["code"] != after["code"]:
            bad.append(f"{kind} {which}: {before['code']} -> {after['code']}")
    check(not bad, f"a spec code reloads the same room, {len(rooms_to_try)} rooms {bad[:2]}")
    check(not errs, f"round trip: no errors {errs[:3]}")
    # an older, shorter code still opens, with defaults for what it doesn't mention; a bad one says so
    pg.evaluate("window.__config.theme('desert')")
    short = pg.evaluate("window.__config.code()")[:12]
    pg.goto(URL + "?tier=low#c=" + short)
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check(pg.evaluate("window.__config.selected().patio") == "off" and pg.evaluate("window.__config.selected().paint") == "sand", "an older, shorter code opens with defaults for the rest")
    pg.goto(URL + "?tier=low#c=!!nonsense")
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check("couldn't be read" in pg.inner_text("#roomStatus"), "a bad code says so and opens the default room")
    ctx.close()

    # ---------------------------------------------------------------- reduced motion
    ctx, pg, errs, _, _ = open_page(b, 1100, 600, query="?tier=low", reduced_motion="reduce")
    pg.click("#views button[data-value='entrance']")
    check(pg.evaluate("window.__config.state().moving") is False and pg.evaluate("window.__config.state().view") == "entrance", "reduced motion: moving between views is a cut")
    ctx.close()

    # ---------------------------------------------------------------- a script that can't load says so
    ctx = b.new_context(viewport={"width": 1100, "height": 600})
    pg = ctx.new_page()
    pg.route("**/three.module.js", lambda r: r.abort())
    pg.goto(URL)
    pg.wait_for_function("window.__configErrors.length > 0", timeout=60000)
    check("could not be loaded" in pg.inner_text("#load"), "if Three.js can't be fetched, the page says so instead of loading for ever")
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
print("  configurator check: ok (load, budget, views, orbit limits, moves, dollhouse, sun, time, every option, smart glass, palms, themes, spec codes, summary, tour, phone)")
