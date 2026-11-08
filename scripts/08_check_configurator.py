"""Headless check of the configurator page. Exits non-zero on any failure.

Serves the published site under /<repo>/ like GitHub Pages does, so an absolute path 404s, and runs in
Chromium with SwiftShader. That renderer manages about one frame a second, so nothing here waits a fixed time.

Loads without console errors or missing files, under the download budget, with the second room left unloaded;
every view works in both rooms; the camera can't leave the room by orbiting or during a move; a frame timed before the click that started a move does no harm; the dollhouse
removes the ceiling and leaving it brings the ceiling back; the sun matches the spec at Afternoon, and the time
controls and the Day/Night toggle work; a phone gets a bottom sheet with no sideways scroll.
Every option in options.json changes the picture, in each room it applies to, seen from where its check entry says. Themes apply and stay editable; a spec code restores the
exact room after a reload, for every theme and 20 random rooms; the summary, image download and tour work. The panel and
home page have no serious accessibility faults under axe, every control can be reached by keyboard with visible focus, nothing
draws while the page is idle, and slow frames lower the quality. Tune it in: a table of answers and rooms, every combination of answers, the real form, comparing, undo, and what stays out of links and storage.
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
AXE = "https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js"
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
    request_queue_size = 128  # the page asks for a dozen modules at once; the default backlog of 5 resets some of them


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


def axe_faults(pg, selector):
    """Serious and critical accessibility faults inside selector, as short strings."""
    found = pg.evaluate("""async sel => {
      const r = await axe.run(sel, { resultTypes: ['violations'] });
      return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')}`);
    }""", selector)
    return found


def shot(pg, name):
    drawn(pg)
    pg.screenshot(path=os.path.join(SHOTS, f"config_{name}.png"))


def pressed_view(pg):
    return pg.evaluate("[...document.querySelectorAll('#views button[aria-pressed=\"true\"]')].map(b => b.dataset.value)")


def tour_finished(pg, what):
    """A tour that ran to the end: on the dollhouse, with no ceiling, and the panel saying so."""
    st = pg.evaluate("window.__config.state()")
    check(st["view"] == "dollhouse" and not st["moving"], f"{what} ends at rest on the dollhouse ({st['view']})")
    check(st["ceiling"] is False, f"{what} ends with the ceiling off")
    check(pressed_view(pg) == ["dollhouse"], f"{what} leaves the Dollhouse button selected {pressed_view(pg)}")
    check(pg.get_attribute("#tour", "aria-pressed") == "false", f"{what} leaves its button off")


def tour_stopped(pg, what):
    """A tour stopped partway: any move in flight finishes, no later stop happens, and the ceiling and panel match the view."""
    pg.wait_for_function("!window.__config.state().moving", timeout=120000)
    before = pg.evaluate("window.__config.tour().log")
    pg.wait_for_timeout(3500)  # longer than a hold on a view, even with reduced motion
    st = pg.evaluate("window.__config.state()")
    check(pg.evaluate("window.__config.tour().log") == before, f"{what}: no more stops")
    check(st["ceiling"] == (st["view"] != "dollhouse"), f"{what}: the ceiling matches the {st['view']} view")
    check(pressed_view(pg) == [st["view"]], f"{what}: the selected button is that view {pressed_view(pg)}")


def look_for(pg, ch, room):
    """Put the camera where an option group's check entry says its effect shows: a view, at an anchor, or an eye and a look point. `rooms` gives what differs by room."""
    ch = {**ch, **ch.get("rooms", {}).get(room, {})}
    pg.evaluate(f"window.__config.time(window.__config.stops.{ch['time']})")
    if "aim" in ch:
        pg.evaluate(f"window.__config.frameAnchor('{ch['aim']}', 1.8, 0.5)")
    elif "eye" in ch:
        pg.evaluate("([e, l]) => window.__config.lookFrom(e, l)", [ch["eye"], ch["look"]])
    else:
        pg.evaluate(f"window.__config.camera('{ch['view']}', {{ instant: true }})")


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    # ---------------------------------------------------------------- desktop
    ctx, pg, errs, missing, sizes = open_page(b, 1366, 820)
    check(not errs, f"page loads with no errors {errs[:3]}")
    # the very first picture, with nothing having asked for a redraw: the page only draws when something changes
    first = np.asarray(Image.open(io.BytesIO(pg.screenshot(clip={"x": 0, "y": 0, "width": 900, "height": 800}))).convert("L"), dtype=float)
    check(first[:200].mean() > 110, f"the first picture is properly lit, not waiting on a texture (ceiling brightness {first[:200].mean():.0f})")
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
        # the seven every room has, and any of its own in the spec, such as W1's bathroom
        want_views = {"overview", "family", "entrance", "bed", "bed_window", "window", "dollhouse"}
        check(want_views <= set(views) and set(views) == set(spec["configurator"]["rooms"][room]["cameras"]), f"{room} has all the views")
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
        # a group that only applies in another room isn't offered here, so it has nothing to show
        groups = [g for g in pg.evaluate("window.__config.options().sections.flatMap(s => s.groups)") if g.get("requires", {}).get("room", room) == room]
        unchecked = [g["id"] for g in groups if "check" not in g]
        check(not unchecked, f"{room}: every option group says where to look for its effect {unchecked[:6]}")
        groups = [g for g in groups if "check" in g]
        dead = []
        for g in groups:
            ch = g["check"]
            set_defaults(pg)
            for k, v in ch.get("first", {}).items():
                pg.evaluate(f"window.__config.set('{k}', '{v}')")
            look_for(pg, ch, room)
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
            look_for(pg, g["check"], room)
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

    # the tour starts and ends at the dollhouse, visits every view and ends by itself
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    pg.evaluate("window.__config.startTour()")
    pg.wait_for_function("!window.__config.tour().running", timeout=180000)
    tour = pg.evaluate("window.__config.tour()")
    log = tour["log"]
    check(log[0] == "dollhouse" and log[-1] == "dollhouse", f"the tour starts and ends at the dollhouse {log[:1]} {log[-1:]}")
    check(log == tour["order"], f"the tour stops at each of its views in order ({len(log)} stops)")
    check(set(log) == set(pg.evaluate("window.__config.views()")), f"the tour visits every view ({len(log)} stops)")
    tour_finished(pg, "the tour")
    # already on the first stop: its move goes nowhere, and has to arrive for the tour to go on
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    pg.evaluate("window.__config.startTour()")
    pg.wait_for_function("window.__config.tour().log.length >= 2", timeout=120000)
    check(pg.evaluate("window.__config.tour().log")[:2] == ["dollhouse", "overview"], "a tour started on the dollhouse goes on to the next view")
    # stopped on the way down from the dollhouse, with the ceiling still off: it comes back when the camera arrives
    pg.mouse.click(300, 300)
    check(pg.evaluate("window.__config.tour().running") is False, "touching the view ends the tour")
    tour_stopped(pg, "stopped on the way down from the dollhouse")
    # stopped with its own button, while holding on a view
    pg.evaluate("window.__config.startTour()")
    pg.wait_for_function("window.__config.tour().log.length >= 3 && !window.__config.state().moving", timeout=180000)
    pg.click("#tour")
    check(pg.evaluate("window.__config.tour().running") is False, "the tour's button stops it")
    tour_stopped(pg, "stopped on a view")
    check(pg.inner_text("#tour") == "Cinematic tour" and pg.get_attribute("#tour", "aria-pressed") == "false", "the tour's button goes back to starting one")
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
            # this room's views: options.json lists every room's, and W3 has no bathroom
            pg.evaluate(f"window.__config.camera('{rnd.choice(pg.evaluate('window.__config.views()'))}', {{ instant: true }})")
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

    # ---------------------------------------------------------------- a frame timed before the click
    # a frame's timestamp is when it began, so a click during a slow frame starts a move later than the next frame says it is.
    # Landing there is luck, so the page's clock runs an hour ahead for the click, and every frame after it comes before the move's start.
    ctx, pg, errs, _, _ = open_page(b, 1100, 600, query="?tier=low")
    moves, stuck = 0, []
    for room in ROOMS:  # a room that opens straight onto the corridor has no waypoints, so not every room adds to these
        go(pg, room)
        views = pg.evaluate("window.__config.views()")
        for f, t in [(f, t) for f in views for t in views if f != t and pg.evaluate(f"window.__config.waypoints('{f}', '{t}')")]:
            moves += 1
            pg.evaluate(f"window.__config.camera('{f}', {{ instant: true }})")
            pg.evaluate("(() => { const real = performance.now.bind(performance); performance.now = () => real() + 3600000; })()")
            pg.click(f"#views button[data-value='{t}']")
            started = pg.evaluate("""async () => {
              delete performance.now;
              const moving = window.__config.state().moving;
              await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
              return moving;
            }""")
            if not started:
                stuck.append(f"{room} {f} to {t}")
    check(moves > 0, "some moves between views go through waypoints")
    check(not stuck, f"each of those clicks starts its move {stuck[:3]}")
    check(not errs, f"frames timed before the click don't break any of the {moves} moves through waypoints {errs[:2]}")
    # the glass fade starts from the same kind of click. It can't throw, but its level would leave 0 to 1, and with it the glass's opacity and roughness
    pg.evaluate("window.__config.set('front', 'smart')")
    for to in ("opaque", "clear"):
        pg.wait_for_function("!window.__config.fading()", timeout=60000)
        pg.evaluate("(() => { const real = performance.now.bind(performance); performance.now = () => real() + 4000; })()")
        pg.evaluate(f"window.__config.set('switch', '{to}')")
        level = pg.evaluate("""async () => {
          delete performance.now;
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          return window.__config.glassLevel();
        }""")
        check(0 <= level <= 1, f"a frame timed before the click keeps the glass fade in range, going {to} (level {level:.2f})")
    ctx.close()

    # ---------------------------------------------------------------- Tune it in: answers to a room, from the data in options.json
    ctx, pg, errs, _, _ = open_page(b, 1000, 640, query="?tier=low")
    plain = {"patientType": "adult", "stay": "short", "sex": "skip", "children": "no", "mobility": "independent", "care": "routine", "sensory": "none"}
    PROFILE_CASES = [  # answers that differ from plain, theme, what has to be set, what a higher tier has to overrule
        ({}, "calm", {"patio": "off"}, []),
        ({"patientType": "child"}, "paediatric", {"toyshelf": "on", "playmat": "on", "aquarium": "digital"}, []),
        ({"children": "yes"}, "family", {"seating": "sofa", "patio": "off", "tvplay": "on"}, []),
        ({"children": "sometimes"}, "family", {"seating": "sofa"}, []),
        ({"sensory": "company"}, "family", {"seating": "sofa"}, []),
        ({"stay": "long"}, "desert", {"wardrobeFinish": "warm"}, []),
        ({"patientType": "longstay"}, "desert", {"wardrobeFinish": "warm"}, []),
        ({"patientType": "child", "children": "yes", "stay": "long"}, "paediatric", {"seating": "sofa", "wardrobeFinish": "warm"}, []),
        ({"mobility": "wheelchair", "children": "yes"}, "family", {"seating": "chairs"}, ["seating"]),
        ({"mobility": "aid", "sensory": "company"}, "family", {"seating": "chairs"}, ["seating"]),
        ({"mobility": "assistance", "patientType": "child"}, "paediatric", {"playmat": "off", "softtoys": "off", "seating": "chairs"}, []),
        ({"sensory": "quiet", "patientType": "child"}, "paediatric", {"tvplay": "off", "aquarium": "none", "scheme": "cove", "temperature": "k3000"}, []),
        ({"sensory": "quiet", "children": "yes"}, "family", {"tvplay": "off", "scheme": "cove", "temperature": "k3000", "seating": "sofa"}, []),
        ({"sensory": "routine"}, "calm", {"nightlight": "on"}, []),
        ({"sex": "female", "care": "frequent", "notes": "anything"}, "calm", {}, []),
    ]
    wrong = []
    for changed, theme, want, overruled in PROFILE_CASES:
        got = pg.evaluate("a => window.__config.profile(a)", {**plain, **changed})
        missed = {k: got["selections"].get(k) for k, v in want.items() if got["selections"].get(k) != v}
        if got["theme"] != theme or missed or sorted(o["group"] for o in got["overruled"]) != sorted(overruled):
            wrong.append(f"{changed}: theme {got['theme']}, wrong {missed}, overruled {got['overruled']}")
    check(not wrong, f"each of the {len(PROFILE_CASES)} sets of answers gives its room {wrong[:2]}")
    # every combination of the form's own answers, in the page: nothing here needs the 3D
    found = pg.evaluate("""() => {
      const data = window.__config.options(), P = data.profile, out = { problems: [], combos: 0 };
      const groups = Object.fromEntries(data.sections.flatMap(s => s.groups).map(g => [g.id, g]));
      const form = document.getElementById('profileForm');
      const selects = [...form.querySelectorAll('select')].map(s => [s.name, [...s.options].map(o => o.value)]);
      const texts = [...form.querySelectorAll('input, textarea')].map(i => i.name);
      const used = {};
      const note = when => [when].flat().filter(Boolean).forEach(a => Object.entries(a).forEach(([k, v]) => v.forEach(x => (used[k] ||= new Set()).add(x))));
      [...P.themes, ...P.rules].forEach(x => note(x.when));
      // every answer is either used by a rule or says it changes nothing, never both
      for (const [name, values] of selects) for (const v of values) {
        const none = P.noEffect[name] === '*' || (P.noEffect[name] || []).includes(v), rule = used[name]?.has(v);
        if (!!none === !!rule) out.problems.push(`answer ${name}=${v}: ${rule ? 'used and also listed as no effect' : 'neither used nor listed as no effect'}`);
      }
      for (const name of texts) if (P.noEffect[name] !== '*') out.problems.push(`free text ${name} isn't listed as no effect`);
      for (const k of Object.keys(used)) for (const v of used[k]) if (!selects.some(([n, vs]) => n === k && vs.includes(v))) out.problems.push(`a rule asks for ${k}=${v}, which the form doesn't offer`);
      // what the rules and themes point at exists, and what they say is about the room
      for (const x of [...P.rules, ...data.themes]) for (const [g, o] of Object.entries(x.sets)) if (!groups[g]?.options.some(q => q.id === o)) out.problems.push(`${x.id} sets ${g}=${o}, which doesn't exist`);
      for (const x of [...P.rules, ...P.themes]) { if (!x.because) out.problems.push(`${x.id || x.theme} gives no reason`); if (/wheelchair|walking aid|diagnos|\\bsex\\b|female|\\bmale\\b|mobility/i.test(x.because)) out.problems.push(`${x.id || x.theme}'s reason talks about the person: ${x.because}`); }
      for (const t of P.themes) if (!data.themes.some(q => q.id === t.theme)) out.problems.push(`no theme ${t.theme}`);
      for (const r of P.rules) if (!P.tiers.includes(r.tier)) out.problems.push(`${r.id}: no tier ${r.tier}`);
      // all answers together
      const fixed = Object.fromEntries(texts.map(n => [n, '']));
      const walk = (i, a) => {
        if (i === selects.length) {
          out.combos += 1;
          const r = window.__config.profile({ ...fixed, ...a });
          const s = r.selections;
          for (const g of Object.keys(groups)) if (!groups[g].options.some(q => q.id === s[g])) out.problems.push(`${JSON.stringify(a)}: ${g}=${s[g]}`);
          if (Object.keys(s).some(k => !groups[k])) out.problems.push(`${JSON.stringify(a)} sets something that isn't an option, like the room: ${Object.keys(s).filter(k => !groups[k])}`);
          if (s.patio !== 'off') out.problems.push(`${JSON.stringify(a)}: the patio is on`);
          for (const g of ['wardrobe', 'ventilation', 'soundSensor']) if (s[g] !== 'on') out.problems.push(`${JSON.stringify(a)}: ${g} is off`);
          if (['aid', 'wheelchair', 'assistance'].includes(a.mobility) && (s.seating !== 'chairs' || s.playmat !== 'off' || s.softtoys !== 'off')) out.problems.push(`${JSON.stringify(a)}: still a lot on the floor`);
          return;
        }
        const [name, values] = selects[i];
        const skip = P.noEffect[name] === '*';  // these change nothing: tested below instead of multiplying the combinations
        for (const v of skip ? values.slice(0, 1) : values) walk(i + 1, { ...a, [name]: v });
      };
      walk(0, {});
      // an answer listed as having no effect changes nothing, and one that's used changes something
      const base = Object.fromEntries(selects.map(([n, v]) => [n, v[0]]));
      for (const [name, values] of selects) {
        const noEffect = values.filter(v => P.noEffect[name] === '*' || (P.noEffect[name] || []).includes(v));
        const key = a => JSON.stringify(window.__config.profile({ ...fixed, ...a }).selections);
        for (const other of [{}, { patientType: 'child' }, { mobility: 'wheelchair' }, { sensory: 'quiet' }, { children: 'yes' }]) {
          const start = { ...base, ...other };
          if (name in other) continue;
          const seen = new Set(noEffect.map(v => key({ ...start, [name]: v })));
          if (seen.size > 1) out.problems.push(`${name}: answers listed as no effect change the room`);
        }
        // a rule can only take away what a theme brought, so an answer in use has to change something from some starting point
        for (const v of values.filter(x => !noEffect.includes(x))) {
          const moves = [{}, { patientType: 'child' }, { children: 'yes' }, { sensory: 'quiet' }, { stay: 'long' }].filter(o => !(name in o))
            .some(o => key({ ...base, ...o, [name]: v }) !== key({ ...base, ...o, [name]: noEffect[0] ?? values[0] }));
          if (!moves) out.problems.push(`${name}=${v} changes nothing, so it should be listed as no effect`);
        }
      }
      return out;
    }""")
    check(not found["problems"], f"every answer across {found['combos']} combinations is accounted for and gives a sound room {found['problems'][:3]}")

    # the real form: wheelchair access and visiting family, the case the rules used to get wrong
    for room in ROOMS:
        go(pg, room)
        pg.evaluate("window.__config.theme('calm'); window.__config.set('paint', 'custom', '#336699')")
        pg.wait_for_function(f"location.hash === '#c=' + window.__config.code()")
        start = pg.evaluate("({ code: window.__config.code(), paint: window.__config.selected()['paint:custom'] })")
        pg.click("#openProfile")
        pg.wait_for_selector("#profile[open]")
        pg.select_option("select[name=mobility]", "wheelchair")
        pg.select_option("select[name=children]", "yes")
        pg.fill("textarea[name=notes]", "private note")
        pg.click("#profileForm button[type=submit]")
        pg.wait_for_function("!document.getElementById('profile').open")
        sel = pg.evaluate("window.__config.selected()")
        check(sel["seating"] == "chairs" and sel["paint"] == "clay" and sel["playmat"] == "off", f"{room}: the form gives the room its rules say")
        check(pg.evaluate("window.__config.state().room") == room, f"{room}: the form doesn't change the room")
        bar = pg.inner_text("#profileBar")
        check(pg.is_visible("#profileBar") and "Sofa-bed" in bar and "hasn't been measured" in bar, f"{room}: the panel says what changed and why, including what was left out")
        check("wheelchair" not in bar.lower() and "private note" not in bar, f"{room}: the reasons don't repeat the answers")
        why = pg.evaluate("[...document.querySelectorAll('#profileChanges li span')].map(s => s.textContent)")
        check(len(why) == len(set(why)) >= 2, f"{room}: each reason is given once ({len(why)} reasons)")
        after = pg.evaluate("window.__config.code()")
        pg.wait_for_function(f"location.hash === '#c={after}'")
        check(not any(w in pg.url.lower() for w in ("wheelchair", "private", "mobility", "notes")), f"{room}: the link holds the room, not the answers")
        check(pg.evaluate("localStorage.length + sessionStorage.length") == 0, f"{room}: no answer is stored in the browser")
        pg.click("#profileCompare")
        check(pg.evaluate("window.__config.code()") == start["code"], f"{room}: comparing shows the exact room from before")
        drawn(pg)
        pg.click("#profileCompare")
        check(pg.evaluate("window.__config.code()") == after, f"{room}: comparing again shows the idea")
        if room == ROOMS[0]:
            pg.add_script_tag(url=AXE)
            faults = axe_faults(pg, "#profileBar")
            check(not faults, f"axe finds no serious faults in the room idea's panel {faults[:4]}")
            shot(pg, "tune_idea")
        pg.click("#profileUndo")
        check(pg.evaluate("window.__config.code()") == start["code"] and pg.evaluate("window.__config.selected()['paint:custom']") == start["paint"], f"{room}: undo restores the exact room, custom colour included")
        check(not pg.is_visible("#profileBar"), f"{room}: undo closes the panel")
        # a change by hand ends the comparison, rather than undoing past it
        pg.click("#openProfile")
        pg.wait_for_selector("#profile[open]")
        pg.click("#profileForm button[type=submit]")
        pg.wait_for_function("!document.getElementById('profile').open")
        pg.evaluate("window.__config.set('floor', 'slate')")
        check(not pg.is_visible("#profileBar"), f"{room}: changing something by hand ends the comparison")
        pg.reload()
        pg.wait_for_function("window.__configReady === true", timeout=120000)
    pg.click("#openProfile")
    pg.wait_for_selector("#profile[open]")
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "#profile")
    check(not faults, f"axe finds no serious faults in the form {faults[:4]}")
    pg.keyboard.press("Escape")
    # a link to a room idea opens the same room
    pg.click("#openProfile")
    pg.select_option("select[name=sensory]", "quiet")
    pg.select_option("select[name=patientType]", "child")
    pg.click("#profileForm button[type=submit]")
    pg.wait_for_function("!document.getElementById('profile').open")
    code = pg.evaluate("window.__config.code()")
    pg.wait_for_function(f"location.hash === '#c={code}'")
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check(pg.evaluate("window.__config.code()") == code, "a room idea's link reloads the same room")
    check(not errs, f"Tune it in: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- reduced motion
    ctx, pg, errs, _, _ = open_page(b, 1100, 600, query="?tier=low", reduced_motion="reduce")
    pg.click("#views button[data-value='entrance']")
    check(pg.evaluate("window.__config.state().moving") is False and pg.evaluate("window.__config.state().view") == "entrance", "reduced motion: moving between views is a cut")
    # the tour cuts between its views, in both rooms, including one started on the dollhouse
    for room in ROOMS:
        go(pg, room)
        pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
        pg.evaluate("window.__config.startTour()")
        check(pg.evaluate("window.__config.tour().log") == ["dollhouse"], f"reduced motion, {room}: a tour started on the dollhouse holds there first")
        pg.wait_for_function("!window.__config.tour().running", timeout=120000)
        tour = pg.evaluate("window.__config.tour()")
        check(tour["log"] == tour["order"], f"reduced motion, {room}: the tour stops at each of its views in order ({len(tour['log'])} stops)")
        # W1's Bathroom view stands in a wall block, so the tour leaves it out on purpose
        check(set(pg.evaluate("window.__config.views()")) - set(tour["log"]) <= {"bathroom"} and "bathroom" not in tour["log"], f"reduced motion, {room}: the tour visits every view but the bathroom")
        tour_finished(pg, f"reduced motion, {room}: the tour")
    pg.evaluate("window.__config.startTour()")
    pg.wait_for_function("window.__config.tour().log.length >= 2", timeout=60000)
    pg.click("#tour")
    tour_stopped(pg, "reduced motion: stopped")
    check(not errs, f"reduced motion: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- accessibility
    ctx, pg, errs, _, _ = open_page(b, 1366, 900, query="?tier=low")
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "#panel")
    for i in range(pg.locator("details").count()):
        pg.locator("summary").nth(i).click()
        faults += axe_faults(pg, "#panel")
    pg.evaluate("window.__config.set('front', 'smart')")
    faults += axe_faults(pg, "#panel")
    check(not sorted(set(faults)), f"axe finds no serious faults in the panel, with each section open {sorted(set(faults))[:4]}")
    pg.click("#openSummary")
    pg.wait_for_selector("#summary[open]")
    faults = axe_faults(pg, "#summary")
    check(not faults, f"axe finds no serious faults in the summary {faults[:4]}")
    check(pg.evaluate("document.activeElement.closest('#summary') !== null"), "opening the summary moves focus into it")
    pg.keyboard.press("Escape")
    check(pg.evaluate("document.activeElement.id") == "openSummary", "Escape closes the summary and returns focus to its button")

    # every control can be reached by keyboard, with focus that shows
    pg.evaluate("document.querySelectorAll('details').forEach(d => { d.removeAttribute('name'); d.open = true; })")
    want = pg.evaluate("""[...document.querySelectorAll('#panel button, #panel a, #panel input, #panel summary')]
      .filter(n => n.offsetParent && !n.closest('[hidden]') && getComputedStyle(n).visibility !== 'hidden')
      .map((n, i) => { n.dataset.tabCheck = i; return i; })""")
    pg.focus("#c")
    reached, unmarked = set(), []
    for _ in range(len(want) * 2 + 10):
        pg.keyboard.press("Tab")
        got = pg.evaluate("""(() => { const a = document.activeElement, s = getComputedStyle(a);
          return { mark: a.dataset.tabCheck, outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 1, name: a.id || a.textContent.slice(0, 20) }; })()""")
        if got["mark"] is not None:
            reached.add(int(got["mark"]))
            if not got["outline"]:
                unmarked.append(got["name"])
    # a radio-like range of swatches and buttons all tab in order, so everything should turn up
    check(len(reached) == len(want), f"every control is reachable by keyboard ({len(reached)} of {len(want)})")
    check(not unmarked, f"every control shows where keyboard focus is {sorted(set(unmarked))[:5]}")
    # the 3D view by keyboard, and what's said about it
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    pg.focus("#c")
    before = pg.evaluate("window.__config.eye()")
    pg.keyboard.press("+")
    check(pg.evaluate("window.__config.eye()") != before, "plus and minus move the view closer and further")
    pg.click("#views button[data-value='entrance']")
    check("Entrance" in pg.inner_text("#announce"), "changing the view is announced")
    check("Entrance view" in pg.get_attribute("#c", "aria-label"), "the 3D view's label says what it shows")
    # drawing stops when nothing is changing
    pg.wait_for_function("!window.__config.state().moving", timeout=60000)
    drawn(pg)
    start = pg.evaluate("window.__config.frames()")
    pg.wait_for_timeout(2500)
    check(pg.evaluate("window.__config.frames()") == start, "nothing is drawn while the page is idle")
    check(not errs, f"accessibility checks: no errors {errs[:3]}")
    ctx.close()

    # slow frames lower the resolution, then drop the bloom
    ctx, pg, errs, _, _ = open_page(b, 900, 650, query="?tier=high", device_scale_factor=2)
    before = pg.evaluate("window.__config.quality()")
    pg.evaluate("for (let i = 0; i < 30; i++) window.__config.noteFrame(60)")
    after = pg.evaluate("window.__config.quality()")
    check(after["ratio"] < before["ratio"], f"slow frames lower the resolution ({before['ratio']:.2f} -> {after['ratio']:.2f})")
    pg.evaluate("for (let i = 0; i < 300; i++) window.__config.noteFrame(60)")
    check(pg.evaluate("window.__config.quality().bloomDropped") is True, "if it's still slow, the bloom goes too")
    ctx.close()

    # the home page, with its carousel and configurator section
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.goto(URL.replace("configurator/", "index.html"))
    pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running')", timeout=60000)
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "body")
    check(not faults, f"axe finds no serious faults on the home page {faults[:4]}")
    href = pg.locator("#configurator a").first.get_attribute("href")
    check("#c=" in href, "the home page's pictures link to their exact rooms")
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
    # a swipe down on the title closes the sheet, a swipe up opens it
    box = pg.locator("#panel header").bounding_box()
    x, y = box["x"] + 60, box["y"] + 20
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y + 90, steps=4); pg.mouse.up()
    check(pg.evaluate("document.getElementById('panel').classList.contains('open')") is False, "phone: swiping down closes the sheet")
    check(pg.evaluate("document.getElementById('panelBody').inert") is True, "phone: a closed sheet's controls can't be reached")
    drawn(pg)
    box = pg.locator("#panel header").bounding_box()
    x, y = box["x"] + 60, box["y"] + 20
    pg.mouse.move(x, y); pg.mouse.down(); pg.mouse.move(x, y - 90, steps=4); pg.mouse.up()
    check(pg.evaluate("document.getElementById('panel').classList.contains('open')") is True, "phone: swiping up opens it")
    drawn(pg)
    pg.tap("#views button[data-value='bed_window']")
    pg.wait_for_function("window.__config.state().view === 'bed_window' && !window.__config.state().moving", timeout=120000)
    shot(pg, "phone_bed_window")
    # Tune it in on a phone: the form fits, and the panel opens to show what changed
    pg.tap("#openProfile")
    pg.wait_for_selector("#profile[open]")
    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(over <= 0, f"phone: the form causes no sideways scroll ({over})")
    pg.select_option("select[name=children]", "yes")
    pg.tap("#profileForm button[type=submit]")
    pg.wait_for_function("!document.getElementById('profile').open")
    check(pg.evaluate("document.getElementById('panel').classList.contains('open')") and pg.is_visible("#profileBar"), "phone: the sheet opens on the room idea")
    drawn(pg)
    shot(pg, "phone_tune")
    small = pg.evaluate("[...document.querySelectorAll('#profileBar button')].filter(b => b.getBoundingClientRect().height < 36).map(b => b.textContent)")
    check(not small, f"phone: the room idea's buttons are large enough to tap {small[:3]}")
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
print("  configurator check: ok (load, budget, views, orbit limits, moves, dollhouse, sun, time, every option, smart glass, palms, themes, spec codes, summary, tour, accessibility, adaptive quality, phone)")
