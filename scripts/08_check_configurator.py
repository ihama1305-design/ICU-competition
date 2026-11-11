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

    # ---------------------------------------------------------------- Patient view: the eye stays at the pillow and only turns
    for room in ROOMS:
        go(pg, room)
        pillow = spec["configurator"]["rooms"][room]["cameras"]["patient"]["eye"]
        pg.evaluate("window.__config.camera('family', { instant: true })")
        pg.click("#views button[data-value='patient']")
        pg.wait_for_function("window.__config.state().view === 'patient' && !window.__config.state().moving", timeout=60000)
        r = pg.evaluate("""(pillow) => {
          const c = window.__config, off = () => { const e = c.eye(); return Math.hypot(e.x - pillow[0], e.y - pillow[1], e.z - pillow[2]); };
          const yaw = d => Math.atan2(d.y, d.x), turned = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
          const out = { arrived: off() }, start = c.look();
          c.orbit(0.09, 0); c.renderNow();
          out.leftIsLeft = turned(yaw(start), yaw(c.look())) > 0;  // counter-clockwise seen from above, with y north
          let worst = 0, most = 0;
          for (let i = 0; i < 40; i++) { c.orbit(0.09, 0); c.renderNow(); worst = Math.max(worst, off()); most = Math.max(most, Math.abs(turned(yaw(start), yaw(c.look())))); }
          for (let i = 0; i < 80; i++) { c.orbit(-0.09, 0); c.renderNow(); worst = Math.max(worst, off()); most = Math.max(most, Math.abs(turned(yaw(start), yaw(c.look())))); }
          out.mostTurn = most;
          for (let i = 0; i < 40; i++) { c.orbit(0, -0.09); c.renderNow(); worst = Math.max(worst, off()); }
          out.up = Math.asin(c.look().z);
          for (let i = 0; i < 60; i++) { c.orbit(0, 0.09); c.renderNow(); worst = Math.max(worst, off()); }
          out.down = Math.asin(c.look().z);
          const before = c.eye(), h = c.hfov();
          c.zoomOut(0.8); c.renderNow();
          const after = c.eye();
          out.zoomMoved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
          out.zoomNarrowed = c.hfov() < h;
          out.worst = worst;
          return out;
        }""", pillow)
        check(r["arrived"] < 0.06, f"{room} Patient view: arrives at the pillow ({r['arrived']:.3f} m off)")
        check(r["worst"] < 0.11, f"{room} Patient view: turning keeps the eye at the pillow ({r['worst']:.3f} m at most)")
        check(r["leftIsLeft"], f"{room} Patient view: the left arrow looks left")
        check(1.5 < r["mostTurn"] < 1.85, f"{room} Patient view: turns about as far as a head can and no further ({r['mostTurn']:.2f} rad)")
        check(r["up"] > 1.3, f"{room} Patient view: looks up to the ceiling ({r['up']:.2f} rad)")
        check(-1.1 < r["down"] < -0.6, f"{room} Patient view: looks down at the bed, not under it ({r['down']:.2f} rad)")
        check(r["zoomMoved"] < 0.001 and r["zoomNarrowed"], f"{room} Patient view: plus narrows the view without moving the eye ({r['zoomMoved']:.4f} m)")
        leave = pg.locator("#leavePatient")
        check(leave.is_visible() and leave.inner_text() == "Return to Family zone", f"{room} Patient view: Return names the view it goes back to ({leave.inner_text()!r})")
        shot(pg, f"{room.lower()}_patient_up")
        leave.click()
        pg.wait_for_function("window.__config.state().view === 'family' && !window.__config.state().moving", timeout=60000)
        check(not leave.is_visible(), f"{room} Patient view: Return goes back to Family zone and hides")
        pg.click("#views button[data-value='patient']")
        pg.wait_for_function("window.__config.state().view === 'patient' && !window.__config.state().moving", timeout=60000)
        pg.focus("#c")
        pg.keyboard.press("Escape")
        check(pg.evaluate("window.__config.state().view") == "family", f"{room} Patient view: Escape goes back too")
        if room == "W1":
            # PACS borrows the camera and gives it back: Patient view keeps its limits afterwards
            pg.click("#views button[data-value='patient']")
            pg.wait_for_function("window.__config.state().view === 'patient' && !window.__config.state().moving", timeout=60000)
            pg.click("#openPacs")
            pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
            pg.click("#pacsExit")
            pg.wait_for_function("!document.body.classList.contains('pacs-active')", timeout=60000)
            worst = pg.evaluate("""(pillow) => {
              const c = window.__config; let w = 0;
              for (let i = 0; i < 30; i++) { c.orbit(0.2, 0.1); c.zoomOut(1.4); c.renderNow(); const e = c.eye(); w = Math.max(w, Math.hypot(e.x - pillow[0], e.y - pillow[1], e.z - pillow[2])); }
              return w;
            }""", pillow)
            check(pg.evaluate("window.__config.state().view") == "patient" and worst < 0.11, f"W1 Patient view: after PACS, the eye still stays at the pillow ({worst:.3f} m)")
            pg.keyboard.press("Escape") if pg.evaluate("document.activeElement === document.getElementById('c')") else pg.click("#leavePatient")
    pg.evaluate("window.__config.camera('overview', { instant: true })")

    # ---------------------------------------------------------------- room modes: scenes over the room that never change a choice
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.set('tvplay', 'on'); window.__config.set('front', 'smart'); window.__config.set('switch', 'opaque'); window.__config.set('aquarium', 'digital')")
    pg.evaluate("window.__config.time(window.__config.stops.night)")
    code0, chosen0 = pg.evaluate("window.__config.code()"), pg.evaluate("window.__config.selected()")
    settled = "!window.__config.mode().easing"
    check(pg.is_visible("#modeBar") and "alarms unaffected" in pg.inner_text("#modeBar").lower(), "the room-mode bar is on screen and says clinical alarms are unaffected")
    pg.click("#modeBar button[data-mode='comfort']")
    check(pg.evaluate("window.__config.mode().easing"), "Comfort eases in rather than cutting")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    # after sunset there's no daylight to block: Comfort changes only the lighting and says why in one line
    check(m["current"] == "comfort" and m["look"] == {"kelvin": 2700, "level": 0.35} and m["blinds"] == 0 and not m["task"], f"Comfort after dark: warm, dim light, the blinds left as configured, task light left alone {m}")
    note = pg.inner_text("#modeNote")
    check(pg.locator("#modeBar button[data-mode='comfort']").get_attribute("aria-pressed") == "true" and "unaffected" in note, "Comfort: its button is pressed and the note says what's unaffected")
    why = pg.locator("#modeNote .mode-why")
    check(why.count() == 1 and "after sunset" in why.inner_text().lower() and "blinds stay" in why.inner_text() and "blinds lower" not in note, f"Comfort after dark: one line says why the blinds stay ({note!r})")
    shot(pg, "w1_mode_comfort_night")
    pg.evaluate("window.__config.time(window.__config.stops.afternoon)")  # crossing sunrise sets Comfort again, now with the blinds
    code0 = pg.evaluate("window.__config.code()")  # the link holds the time, which changed just now; a mode never does
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "comfort" and m["blinds"] == 1 and m["look"] == {"kelvin": 2700, "level": 0.35} and pg.locator("#modeNote .mode-why").count() == 0 and "blinds lower" in pg.inner_text("#modeNote"),
          f"Comfort by day: the blinds lower too, and the after-dark line goes {m}")
    shot(pg, "w1_mode_comfort")
    pg.click("#modeBar button[data-mode='emergency']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "emergency" and m["look"] == {"kelvin": 4000, "level": 1} and m["task"], f"Emergency-ready: full light and the task light on {m}")
    clear = pg.evaluate("window.__config.glassLevel()")
    check(not m["tvPlaying"] and m["aquariumScreen"] is False and m["glass"] == "clear" and not m["curtain"] and clear < 0.01, f"Emergency-ready: the TV and aquarium screen off, the glazed front clear ({clear:.2f}) {m}")
    check(pg.is_visible("#modeBanner") and "not changed" in pg.inner_text("#modeBanner"), "Emergency-ready: a banner says alarms and devices are not changed")
    shot(pg, "w1_mode_emergency")
    pg.click("#leaveEmergency")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "comfort" and m["tvPlaying"] and m["aquariumScreen"] and m["glass"] == "opaque" and m["blinds"] == 1, f"leaving Emergency-ready goes back to Comfort, screens and glass as they were {m}")
    pg.click("#modeBar button[data-mode='clinical']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "clinical" and m["task"] and m["blinds"] == 0 and m["look"]["level"] == 1, f"Clinical: task light on, full light, the blinds back to the room's own {m}")
    pg.click("#modeBar button[data-mode='standard']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "standard" and m["look"] is None and not m["task"] and m["blinds"] == 0, f"Standard puts the configured room back {m}")
    check(pg.evaluate("window.__config.code()") == code0 and pg.evaluate("window.__config.selected()") == chosen0, "no mode changes a choice or the share link")
    # Privacy: smart glass goes opaque and the blinds lower halfway; Standard clears it again
    pg.evaluate("window.__config.set('switch', 'clear')")
    pg.click("#modeBar button[data-mode='privacy']")
    pg.wait_for_function(settled, timeout=60000)
    pg.wait_for_function("!window.__config.fading()", timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "privacy" and m["glass"] == "opaque" and m["blinds"] == 0.5 and pg.evaluate("window.__config.glassLevel()") > 0.99, f"Privacy: the smart glass goes opaque and the blinds lower halfway {m}")
    check("Staff can end it" in pg.inner_text("#modeNote"), "Privacy says staff can end it")
    pg.click("#modeBar button[data-mode='standard']")
    pg.wait_for_function(settled, timeout=60000)
    pg.wait_for_function("!window.__config.fading()", timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["glass"] == "smart" and m["blinds"] == 0 and pg.evaluate("window.__config.glassLevel()") < 0.01, f"leaving Privacy clears the glass and raises the blinds again {m}")
    # a design change ends a mode, and so does PACS, which keeps its own scene
    pg.click("#modeBar button[data-mode='comfort']")
    pg.evaluate("window.__config.set('paint', window.__config.options().sections[0].groups[0].options[1].id)")
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "standard" and m["blinds"] == 0 and m["look"] is None and "design changed" in pg.inner_text("#modeNote"), f"changing the design ends the mode and says so {m}")
    pg.click("#modeBar button[data-mode='comfort']")
    pg.click("#openPacs")
    pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
    check(pg.evaluate("window.__config.mode().current") == "standard", "opening PACS ends the mode first")
    pg.click("#pacsExit")
    pg.wait_for_function("!document.body.classList.contains('pacs-active')", timeout=60000)
    pg.click("#openPacs")
    pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
    check(not pg.is_visible("#modeBar"), "the mode bar steps aside while PACS lays out its own tools")
    pg.evaluate("window.__config.setMode('emergency')")
    check(not pg.evaluate("document.body.classList.contains('pacs-active')") and pg.evaluate("window.__config.mode().current") == "emergency", "Emergency-ready wins over PACS")
    pg.click("#leaveEmergency")
    pg.wait_for_function(settled, timeout=60000)
    # PACS after dark: only the lighting can change, the blinds choice is off and greyed, and the panel says why
    pg.evaluate("window.__config.time(window.__config.stops.night)")
    pg.click("#openPacs")
    pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
    blinds0 = pg.evaluate("window.__config.pacs().environment.blinds")
    pg.click("#pacsScenarios [data-scenario='possible']")
    pg.click("#pacsResponse")
    pg.check("#pacsReviewed")
    box = pg.locator("#pacsChoices [data-choice='blinds']")
    check(pg.evaluate("window.__config.pacs().dark") is True and box.is_disabled() and not box.is_checked(), "PACS after dark: the blinds choice is unticked and greyed out")
    check(pg.is_visible("#pacsNight") and "no daylight" in pg.inner_text("#pacsNight"), "PACS after dark: one line says why only the lighting is adjusted")
    pg.click("#pacsApprove")
    pg.wait_for_function("!window.__config.pacs().transitioning", timeout=60000)
    env = pg.evaluate("window.__config.pacs().environment")
    check(env["blinds"] == blinds0 and env["light"] == 0.65, f"PACS after dark: approval dims the lights and leaves the blinds where they were ({blinds0}) {env}")
    shot(pg, "w1_pacs_night")
    pg.click("#pacsExit")
    pg.wait_for_function("!document.body.classList.contains('pacs-active')", timeout=60000)
    pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
    pg.click("#openPacs")
    pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
    check(pg.evaluate("window.__config.pacs().dark") is False and not pg.is_visible("#pacsNight") and not pg.locator("#pacsChoices [data-choice='blinds']").is_disabled(), "PACS by day: the blinds choice is back and the after-dark line is gone")
    pg.click("#pacsExit")
    pg.wait_for_function("!document.body.classList.contains('pacs-active')", timeout=60000)
    # the daylight sensor on the window sill, in both rooms: its card reports the sun height the comfort rules read
    for room in ROOMS:
        go(pg, room)
        for stop, dark in (("night", True), ("afternoon", False)):
            pg.evaluate(f"window.__config.time(window.__config.stops.{stop})")
            d = pg.evaluate("window.__config.daylightSensor()")
            check(d["shown"] and d["dark"] is dark and (d["elevation"] < -0.833) is dark and (("so it's after sunset" if dark else "so it's daylight") in d["text"]) and "isn't connected" in d["text"],
                  f"{room} at {stop}: the daylight sensor is on the sill and says {'after sunset' if dark else 'daylight'} from the sun's height {d['elevation']:.1f}°")
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('overview', { instant: true })")

    # ---------------------------------------------------------------- saved rooms: in this browser only, by name
    go(pg, "W1")
    pg.evaluate("window.__config.theme('desert')")
    saved_code = pg.evaluate("window.__config.code()")
    pg.fill("#presetName", "Evening calm")
    pg.click("#presetForm button[type='submit']")
    presets = pg.evaluate("window.__config.presets()")
    check([p["name"] for p in presets] == ["Evening calm"] and presets[0]["code"] == saved_code, f"Save keeps the room's own code under its name {presets}")
    pg.click("#resetRoom")
    defaults = pg.evaluate("Object.fromEntries(window.__config.options().sections.flatMap(s => s.groups).map(g => [g.id, g.default]))")
    check(pg.evaluate("window.__config.selected()") == defaults, "Reset the room puts every choice back to its default")
    pg.click("#presetList button[aria-label='Open Evening calm']")
    pg.wait_for_function(f"window.__config.code() === '{saved_code}'", timeout=60000)
    check("Opened" in pg.inner_text("#presetStatus"), "opening a saved room brings it back exactly and says so")
    pg.evaluate("window.__config.theme('family')")
    pg.fill("#presetName", "evening CALM")
    pg.click("#presetForm button[type='submit']")
    presets = pg.evaluate("window.__config.presets()")
    check(len(presets) == 1 and presets[0]["code"] != saved_code and "Updated" in pg.inner_text("#presetStatus"), f"saving under the same name, in any case, updates it {presets}")
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    check(pg.locator("#presetList li").count() == 1, "saved rooms are still there after a reload")
    pg.click("#presetList button[aria-label='Delete evening CALM']")
    check(pg.evaluate("window.__config.presets()") == [] and pg.locator("#presetList li").count() == 0, "Delete removes a saved room")
    set_defaults(pg)

    # ---------------------------------------------------------------- placing items: dragged from the panel onto the room
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    check(pg.locator("#placeItems button").count() == 7, "the panel offers the seven items to place")

    def drag_to(src, x, y):
        pg.locator(src).scroll_into_view_if_needed()
        bb = pg.locator(src).bounding_box()
        pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2)
        pg.mouse.down()
        for i in range(1, 9):
            pg.mouse.move(bb["x"] + bb["width"] / 2 + (x - bb["x"] - bb["width"] / 2) * i / 8, bb["y"] + bb["height"] / 2 + (y - bb["y"] - bb["height"] / 2) * i / 8)
        pg.mouse.up()

    def floor_spot(k=0.5):
        """A point of open floor in view: part way between the walkable area's centre and its first corner."""
        return pg.evaluate("""(k) => {
          const c = window.__config, w = c.walkable(), cx = w.reduce((a, p) => a + p[0], 0) / w.length, cy = w.reduce((a, p) => a + p[1], 0) / w.length;
          const x = cx + (w[0][0] - cx) * k * 0.3, y = cy + (w[0][1] - cy) * k * 0.3;
          return { world: [x, y], screen: c.screenOf(x, y, 0) };
        }""", k)

    s1 = floor_spot(0)
    drag_to("#placeItems button[data-item='screen']", s1["screen"]["x"], s1["screen"]["y"])
    placed = pg.evaluate("window.__config.placed()")
    check(len(placed) == 1 and placed[0]["type"] == "screen" and abs(placed[0]["x"] - s1["world"][0]) < 0.05 and abs(placed[0]["y"] - s1["world"][1]) < 0.05, f"dragging the privacy screen onto the floor puts it there {placed} {s1['world']}")
    code = pg.evaluate("window.__config.code()")
    check("." in code, "the share link holds the placed item")
    w = pg.evaluate("window.__config.faceWall()")
    drag_to("#placeItems button[data-item='rub']", w["x"], w["y"])
    placed = pg.evaluate("window.__config.placed()")
    check(len(placed) == 2 and placed[1]["type"] == "rub", f"dragging the hand-rub dispenser onto a wall hangs it there {placed}")
    # a floor item dropped on a wall doesn't go anywhere, and the page says why
    drag_to("#placeItems button[data-item='bins']", w["x"], w["y"])
    check(len(pg.evaluate("window.__config.placed()")) == 2 and "open floor" in pg.inner_text("#placeStatus"), "a floor item dropped on a wall isn't placed, and the page says why")
    shot(pg, "w1_placed_wall")
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    # move the screen by dragging it, then turn and remove it from its card
    s1 = floor_spot(0)
    s2 = floor_spot(1)
    pg.mouse.move(s1["screen"]["x"], s1["screen"]["y"] - 40); pg.mouse.down()
    for i in range(1, 9):
        pg.mouse.move(s1["screen"]["x"] + (s2["screen"]["x"] - s1["screen"]["x"]) * i / 8, s1["screen"]["y"] - 40 + (s2["screen"]["y"] - s1["screen"]["y"]) * i / 8)
    pg.mouse.up()
    moved = pg.evaluate("window.__config.placed()")[0]
    check(abs(moved["x"] - s1["world"][0]) > 0.1 or abs(moved["y"] - s1["world"][1]) > 0.1, f"dragging a placed item moves it {moved}")
    check(pg.evaluate("window.__config.state().view") == "overview" and not pg.evaluate("window.__config.state().moving"), "moving an item leaves the camera where it was")
    shot(pg, "w1_placed")
    p = pg.evaluate(f"window.__config.screenOf({moved['x']}, {moved['y']}, 1.0)")
    pg.mouse.click(p["x"], p["y"])
    check(pg.is_visible("#objectCard") and pg.inner_text("#objectTitle") == "Privacy screen" and pg.inner_text("#objectAction2") == "Remove", "clicking a placed item opens its card, with Turn and Remove")
    rot0 = pg.evaluate("window.__config.placed()")[0]["rot"]
    pg.click("#objectAction")
    check(pg.evaluate("window.__config.placed()")[0]["rot"] == (rot0 + 45) % 360, "Turn 45° turns it")
    pg.click("#objectAction2")
    check([q["type"] for q in pg.evaluate("window.__config.placed()")] == ["rub"], "Remove takes it away")
    # from the keyboard: Enter places an item in view and focuses its card, where keys move, turn and remove it
    pg.focus("#placeItems button[data-item='chair']")
    pg.keyboard.press("Enter")
    chair = pg.evaluate("window.__config.placed()")[-1]
    check(chair["type"] == "chair" and pg.evaluate("document.activeElement.id") == "objectCard", f"Enter places the chair in view and focuses its card {chair}")
    pg.keyboard.press("ArrowRight"); pg.keyboard.press("r")
    after = pg.evaluate("window.__config.placed()")[-1]
    check(abs(after["x"] - chair["x"]) + abs(after["y"] - chair["y"]) > 0.05 and after["rot"] == (chair["rot"] + 15) % 360, f"the arrow keys move it and R turns it {chair} {after}")
    pg.keyboard.press("Delete")
    check([q["type"] for q in pg.evaluate("window.__config.placed()")] == ["rub"], "Delete removes it")
    # choose, then click: the sharps box on the wall
    w = pg.evaluate("window.__config.faceWall()")
    pg.click("#placeItems button[data-item='sharps']")
    check(pg.locator("#placeItems button[data-item='sharps']").get_attribute("aria-pressed") == "true", "clicking an item waits for a spot")
    pg.mouse.click(w["x"] + 60, w["y"])
    check([q["type"] for q in pg.evaluate("window.__config.placed()")] == ["rub", "sharps"], "then clicking a wall places it there")
    # the biophilic panel: greenery on the wall with no soil or water, and a card that says why, citing the palms note's CDC source
    pg.click("#placeItems button[data-item='leafpanel']")
    pg.mouse.click(w["x"] - 140, w["y"] - 40)
    check([q["type"] for q in pg.evaluate("window.__config.placed()")] == ["rub", "sharps", "leafpanel"], "the biophilic panel hangs on a wall")
    # all of a wall item has to be on solid wall. With only its centre checked, the 0.9 m panel used to hang half over the glazed front
    fits = pg.evaluate("[['leafpanel', 15.5, 28.75, 180], ['rub', 15.5, 28.75, 180], ['leafpanel', 14.6, 28.75, 180]].map(a => window.__config.wallClear(...a))")
    check(fits == [False, True, True], f"beside the glazed front the panel doesn't fit though the small dispenser does, and further along the wall it fits {fits}")
    hung = pg.evaluate("window.__config.placed().map(q => window.__config.wallClear(q.type, q.x, q.y, q.rot))")
    check(len(hung) == 3 and all(hung), f"each wall item placed by clicking has wall behind all of it {hung}")
    cdc = pg.evaluate("window.__config.options().sections.flatMap(s => s.groups).find(g => g.id === 'palms').note.sources[0].url")
    pt = pg.evaluate("window.__config.itemPoint('Biophilic wall panel')")
    pg.evaluate("document.getElementById('objectCard').hidden = true")
    pg.mouse.click(pt["x"], pt["y"])
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    card = pg.inner_text("#objectCard")
    links = pg.evaluate("[...document.querySelectorAll('#objectSources a')].map(a => a.href)")
    check("Biophilic wall panel" in card and "without soil or water" in card and "outside the glass" in card and links == [cdc], f"its card says why living plants stay outside and links the CDC guidance from options.json {links}")
    shot(pg, "w1_biophilic_panel")
    pg.evaluate("document.getElementById('objectCard').hidden = true")
    pg.mouse.click(w["x"], w["y"] - 200)  # elsewhere: another object's card has no sources
    check(pg.locator("#objectSources").is_hidden() or not pg.evaluate("document.querySelectorAll('#objectSources a').length"), "other cards carry no source links")
    pg.evaluate("document.getElementById('objectCard').hidden = true")
    # links, the summary and Reset
    code = pg.evaluate("window.__config.code()")
    pg.goto("about:blank")  # a fresh load: the same page with a new hash would only be a hashchange
    pg.goto(URL + "#c=" + code)
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    check([q["type"] for q in pg.evaluate("window.__config.placed()")] == ["rub", "sharps", "leafpanel"], "a link restores the placed items")
    pg.click("#openSummary")
    pg.wait_for_selector("#summary[open]")
    try:  # it fills in once its picture is taken, replacing what an earlier summary showed
        pg.wait_for_function("document.getElementById('summaryBody').textContent.includes('Sharps box')", timeout=120000)
    except Exception:
        pass
    summary_text = pg.text_content("#summaryBody")  # the headings are shown in capitals, so not inner_text
    check("Placed items" in summary_text and "Sharps box" in summary_text, "the summary lists the placed items")
    pg.click("#closeSummary")
    pg.click("#resetRoom")
    check(pg.evaluate("window.__config.placed()") == [], "Reset the room removes placed items")
    set_defaults(pg)

    # ---------------------------------------------------------------- Clinical view: labels on the kit and keep-clear areas, over the room as it is
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    code0 = pg.evaluate("window.__config.code()")
    pg.click("#clinicalToggle")
    drawn(pg)
    cv = pg.evaluate("window.__config.clinical()")
    check(cv["on"] and cv["zones"] and {"Bed", "Patient monitor · simulated readings", "Ventilator"} <= set(cv["labels"]), f"Clinical view labels the kit and draws the keep-clear areas {cv}")
    check(pg.is_visible("#clinicalNote") and "not a clinical or compliance check" in pg.inner_text("#clinicalNote"), "Clinical view says it's illustrative")
    boxes = pg.evaluate("[...document.querySelectorAll('#clinicalLabels span')].filter(e => !e.hidden).map(e => e.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom])")
    panel_left = pg.evaluate("document.getElementById('panel').getBoundingClientRect().left")
    overlaps = [(a, b2) for i, a in enumerate(boxes) for b2 in boxes[i + 1:] if a[0] < b2[2] and b2[0] < a[2] and a[1] < b2[3] and b2[1] < a[3]]
    check(not overlaps and all(r[2] <= panel_left + 1 for r in boxes), f"its labels don't overlap or sit under the panel {overlaps[:2]}")
    check(pg.evaluate("window.__config.code()") == code0, "Clinical view doesn't change the room or its link")
    shot(pg, "w1_clinical_view")
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    drawn(pg)
    check(len(pg.evaluate("window.__config.clinical()")["labels"]) >= 7, "from the dollhouse it labels the room's kit")
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    pg.click("#clinicalToggle")
    check(not pg.evaluate("window.__config.clinical()")["on"] and not pg.is_visible("#clinicalLabels"), "the toggle turns it off again")
    # the Clinical and Emergency-ready modes turn it on, and Standard puts it back as it was
    pg.click("#modeBar button[data-mode='clinical']")
    check(pg.evaluate("window.__config.clinical()")["on"], "Clinical mode turns Clinical view on")
    pg.click("#modeBar button[data-mode='standard']")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    check(not pg.evaluate("window.__config.clinical()")["on"], "Standard turns it back off")
    pg.click("#modeBar button[data-mode='emergency']")
    check(pg.evaluate("window.__config.clinical()")["on"], "Emergency-ready turns Clinical view on")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    # a placed item gets its own label
    pg.click("#clinicalToggle")
    w = pg.evaluate("window.__config.faceWall()")
    pg.click("#placeItems button[data-item='sharps']")
    pg.mouse.click(w["x"], w["y"])
    drawn(pg)
    check("Sharps box" in pg.evaluate("window.__config.clinical()")["labels"], f"a placed item is labelled too {pg.evaluate('window.__config.clinical()')['labels']}")
    pg.click("#clinicalToggle")
    pg.click("#resetRoom")
    set_defaults(pg)

    # ---------------------------------------------------------------- the guided tour: captioned steps, and Exit puts the room back
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('entrance', { instant: true }); window.__config.time(window.__config.stops.morning)")
    before = pg.evaluate("window.__config.code()")
    pg.click("#openGuide")
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and g["at"] == 0 and pg.is_visible("#guide") and pg.inner_text("#guideCount") == "1 of 9", f"the guided tour starts at its first step {g}")
    check(pg.inner_text("#guideCaveat") == "Simulated demo. A nurse approves every change.", "one fixed line under the captions carries the caveats")
    check(pg.get_attribute("#guidePrev", "disabled") is not None, "Previous waits until there's somewhere to go back to")
    pg.click("#guidePlay")
    check(not pg.evaluate("window.__config.guide()")["playing"] and pg.inner_text("#guidePlay") == "Play", "Pause stops it moving on by itself")
    seen = {}
    for i in range(1, 9):
        pg.click("#guideNext")
        pg.wait_for_function(f"window.__config.guide().at === {i}", timeout=60000)
        pg.wait_for_function("!window.__config.state().moving && !window.__config.mode().easing", timeout=120000)
        seen[i] = {"view": pg.evaluate("window.__config.state().view"), "mode": pg.evaluate("window.__config.mode().current"), "clinical": pg.evaluate("window.__config.clinical().on"), "placed": len(pg.evaluate("window.__config.placed()")), "theme": pg.evaluate("window.__config.currentTheme()")}
    check(seen[2]["view"] == "patient", f"it shows Patient view {seen[2]}")
    check(seen[3]["mode"] == "comfort" and seen[4]["mode"] == "clinical" and seen[4]["clinical"] and seen[5]["mode"] == "emergency", f"it shows Comfort, Clinical with Clinical view, and Emergency-ready {seen[3]} {seen[4]} {seen[5]}")
    check(seen[6]["placed"] == 2 and seen[6]["mode"] == "standard", f"it places two items {seen[6]}")
    check(seen[7]["theme"] == "desert", f"it shows a theme at sunset {seen[7]}")
    check(pg.locator("#guideLinks button").count() == 2 and pg.inner_text("#guideNext") == "Finish", "the last step offers the PACS and APIS demos, and Finish")
    shot(pg, "w1_guide_last")
    # Restart: back to the first step and playing, with the room as it was before the tour, so no item or mode carries over
    check(pg.is_visible("#guideRestart"), "the tour has a Restart button")
    pg.click("#guideRestart")
    pg.wait_for_function("window.__config.guide().at === 0 && !window.__config.state().moving && !window.__config.mode().easing", timeout=120000)
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and g["playing"] and pg.inner_text("#guideCount") == "1 of 9" and pg.evaluate("window.__config.placed()") == [] and pg.evaluate("window.__config.mode().current") == "standard" and pg.evaluate("window.__config.currentTheme()") == "calm",
          f"Restart plays again from the first step, with the tour's placed items and modes cleared {g}")
    pg.click("#guidePlay")
    pg.evaluate("window.__config.guideGo(8)")
    pg.wait_for_function("window.__config.guide().at === 8", timeout=60000)
    pg.click("#guideNext")
    pg.wait_for_function("!window.__config.guide().running", timeout=60000)
    pg.wait_for_function(f"window.__config.code() === '{before}'", timeout=120000)
    check(not pg.is_visible("#guide") and pg.evaluate("window.__config.placed()") == [] and pg.evaluate("window.__config.mode().current") == "standard" and not pg.evaluate("window.__config.clinical()")["on"], "Finish puts the room back exactly as it was: choices, view, time, items, mode")
    # Esc from the card leaves it too, and dragging the room pauses rather than ends it
    pg.click("#openGuide")
    pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(460, 410); pg.mouse.up()
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and not g["playing"], f"dragging the room pauses the tour rather than ending it {g}")
    pg.focus("#guideNext")
    pg.keyboard.press("Escape")
    pg.wait_for_function(f"window.__config.code() === '{before}'", timeout=120000)
    check(not pg.evaluate("window.__config.guide()")["running"], "Esc on the tour's card ends it, and the room is as it was")
    set_defaults(pg)

    # ---------------------------------------------------------------- the orientation screen: the weekday, date and the room's own time
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.set('tvplay', 'orientation'); window.__config.time(window.__config.stops.afternoon)")
    o = pg.evaluate("window.__config.orientation()")
    today = pg.evaluate("[new Date().toLocaleDateString('en-GB', { weekday: 'long' }), new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })]")
    check(o and o[:2] == today and o[2] == pg.inner_text("#timeNow") and o[3] == "Afternoon", f"the orientation screen shows today and the room's own time {o} {today}")
    pg.evaluate("window.__config.time(window.__config.stops.night)")
    o = pg.evaluate("window.__config.orientation()")
    check(o and o[2] == pg.inner_text("#timeNow") and o[3] == "Night", f"it follows the time of day into the night {o}")
    pg.click("#modeBar button[data-mode='emergency']")
    check(not pg.evaluate("window.__config.mode()")["tvPlaying"] and pg.evaluate("window.__config.orientation()") is not None, "Emergency-ready turns it off like any screen")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    check(pg.evaluate("window.__config.selected().tvplay") == "orientation", "and leaving puts it back")
    set_defaults(pg)

    # ---------------------------------------------------------------- before and after: today's room, then the visitor's, at the same view
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.theme('desert'); window.__config.camera('overview', { instant: true })")
    pg.focus("#placeItems button[data-item='screen']"); pg.keyboard.press("Enter")
    pg.evaluate("document.getElementById('objectCard').hidden = true")
    mine, eye0 = pg.evaluate("window.__config.selected()"), pg.evaluate("window.__config.eye()")
    code_mine = pg.evaluate("window.__config.code()")
    defaults = pg.evaluate("Object.fromEntries(window.__config.options().sections.flatMap(s => s.groups).map(g => [g.id, g.default]))")
    pg.click("#compareToggle")
    check(pg.evaluate("window.__config.comparing()") and pg.evaluate("window.__config.selected()") == defaults and pg.evaluate("window.__config.placedShown()") == 0, "Compare shows today's room: every default, none of the placed items")
    check(pg.evaluate("window.__config.eye()") == eye0 and pg.evaluate("window.__config.code()") == code_mine and pg.is_visible("#compareNote"), "at the same view, with the visitor's link unchanged, and a note saying so")
    pg.wait_for_timeout(400)
    check(pg.evaluate("location.hash") == "#c=" + code_mine, "the address bar keeps the visitor's room too")
    shot(pg, "w1_compare_before")
    pg.click("#compareToggle")
    check(not pg.evaluate("window.__config.comparing()") and pg.evaluate("window.__config.selected()") == mine and pg.evaluate("window.__config.placedShown()") == 1, "pressing it again brings the visitor's room back exactly")
    # a change while comparing lands on the visitor's own room, not on today's
    pg.click("#compareToggle")
    pg.evaluate("window.__config.set('tvplay', 'on')")
    after = pg.evaluate("window.__config.selected()")
    check(not pg.evaluate("window.__config.comparing()") and after["feature"] == mine["feature"] and after["tvplay"] == "on" and pg.evaluate("window.__config.placedShown()") == 1, "changing something while comparing ends it, and the change lands on the visitor's room")
    pg.click("#resetRoom")
    set_defaults(pg)

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
    # the room alone: at this size the room-mode bar takes the phone layout across the top, where it would cover the walls
    pg.add_style_tag(content="#panel, #hud { display: none; }")
    pg.evaluate("window.dispatchEvent(new Event('resize'))")
    for room in ROOMS:
        go(pg, room)
        # a group that only applies in another room isn't offered here, so it has nothing to show; nor is a hidden one, anywhere
        groups = [g for g in pg.evaluate("window.__config.options().sections.flatMap(s => s.groups)") if g.get("requires", {}).get("room", room) == room and not g.get("hidden")]
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
    pg.evaluate("window.__config.set('floor', 'terrazzo'); window.__config.set('feature', 'sea')")  # for the summary below
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
    groups = sum(1 for sec in data["sections"] for g in sec["groups"] if not g.get("hidden"))
    rows = pg.locator("#summaryBody dt").count()
    check(rows >= groups - 3, f"the summary lists every option that applies ({rows} rows)")
    check(not [g["label"] for sec in data["sections"] for g in sec["groups"] if g.get("hidden") and g["label"] in text], "the summary leaves out what isn't offered")
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
    # Patient view is somewhere to go and come back from, not a stop: it starts where From the bed does
    check(set(log) == set(pg.evaluate("window.__config.views()")) - {"patient"}, f"the tour visits every view but Patient view ({len(log)} stops)")
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
            for g in (x for x in groups if not x.get("hidden")):
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
    # a link made before a group was hidden still opens: what it asked for that isn't offered falls back, and the page says so
    ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    hidden = [g for g in groups if g.get("hidden")]
    check(hidden and not [g["id"] for g in hidden if pg.locator(f"#g-{g['id']}").count()], "the panel doesn't offer the hidden groups")
    pg.evaluate("window.__config.theme('desert')")
    old_code = list(pg.evaluate("window.__config.code()"))
    for g in hidden:
        old_code[5 + g["code"]] = ALPHA[next(o["code"] for o in g["options"] if o["id"] != g["default"])]
    pg.goto(URL + "?tier=low#c=" + "".join(old_code))
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    sel = pg.evaluate("window.__config.selected()")
    check(all(sel[g["id"]] == g["default"] for g in hidden), f"an old link's hidden options fall back to their defaults {[(g['id'], sel[g['id']]) for g in hidden if sel[g['id']] != g['default']]}")
    check(sel["paint"] == "sand" and sel["feature"] == "mashrabiya", "and the rest of that link's room is kept")
    status = pg.inner_text("#roomStatus")
    check(all(g["label"] in status for g in hidden), f"the page names what the link asked for that it left out ({status!r})")
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

    # ---------------------------------------------------------------- the vocal-distress cue: the sound sensor lights and tells the nurse. SIMULATED
    ctx, pg, errs, _, _ = open_page(b, 1000, 640, query="?tier=low")
    # the page must never ask for a microphone. Any attempt from here on is counted; check 12 also finds no audio API named in the source
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    level_colour = {"now": "e2574c", "soon": "e6a342"}
    quiet = lambda v: not v["notice"] and v["light"]["colour"] == "55b985" and v["halo"]["opacity"] == 0 and v["ring"]["strength"] == 0  # noqa: E731
    call, groan = ".demo-sounds button[data-sound='call']", ".demo-sounds button[data-sound='groan']"
    for room in ROOMS:
        go(pg, room)
        pg.evaluate("window.__config.camera('family', { instant: true }); document.getElementById('systemsSection').open = true; document.getElementById('objectCard').hidden = true")
        start = pg.evaluate("({ code: window.__config.code(), stored: JSON.stringify([localStorage, sessionStorage]), vocal: window.__config.vocal() })")
        check(start["vocal"]["shown"] and quiet(start["vocal"]) and pg.is_hidden("#vocalNotice"), f"{room}: the sound sensor starts quiet: a green light, no glow and no notice")
        at = pg.evaluate("window.__config.itemPoint('Sound-level sensor')")
        near = (slice(max(0, int(at["y"]) - 50), int(at["y"]) + 50), slice(max(0, int(at["x"]) - 60), int(at["x"]) + 60))
        calm = frame(pg)
        # a call for help: a notice at once, with the light and its glow in that level's colour
        want = pg.evaluate("window.__config.cueFor('call', 0)")
        pg.click(call)
        pg.wait_for_selector("#vocalNotice", state="visible", timeout=10000)
        v, notice = pg.evaluate("window.__config.vocal()"), pg.inner_text("#vocalNotice")
        check(want in level_colour and v["notice"] == {"sound": "call", "level": want, "room": room}, f"{room}: a simulated call for help raises a notice straight away ({v['notice']})")
        check(v["light"]["colour"] == v["halo"]["colour"] == level_colour.get(want) and v["halo"]["opacity"] > 0 and v["ring"]["strength"] > 0, f"{room}: the sensor's light, ring and glow take the notice's colour {v['light']}")
        check(all(w in notice for w in ("SIMULATED", f"room {room}", "a call for help was heard", "Look in through the glass", "You decide whether to go in")), f"{room}: the notice says it's simulated, names the room and what was heard, and leaves going in to the nurse")
        check(all(w in notice for w in ("No audio was captured or stored", "no alarm or device was changed")) and pg.get_attribute("#vocalNotice", "data-level") == want, f"{room}: it says nothing was captured and no alarm or device changed")
        pg.evaluate("document.getElementById('vocalNotice').style.visibility = 'hidden'")
        lit = frame(pg)
        pg.evaluate("document.getElementById('vocalNotice').style.visibility = ''")
        changed = int((np.abs(lit - calm).max(axis=2)[near] > 6).sum())
        check(changed > 40, f"{room}: the lit sensor shows in the picture ({changed} pixels changed around it)")
        shot(pg, f"{room.lower()}_vocal_call")
        # it waits for the nurse: only Acknowledge takes it down, and the room looks as it did
        pg.wait_for_timeout(2600)  # longer than the old preview, which reset itself after 2.2 seconds
        check(pg.is_visible("#vocalNotice") and not quiet(pg.evaluate("window.__config.vocal()")), f"{room}: the notice and the light stay until someone acknowledges them")
        pg.click("#vocalAck")
        v = pg.evaluate("window.__config.vocal()")
        check(pg.is_hidden("#vocalNotice") and quiet(v) and "Acknowledged" in pg.inner_text("#systemStatus"), f"{room}: Acknowledge takes the notice down and puts the light back to green")
        back = int((np.abs(frame(pg) - calm).max(axis=2)[near] > 6).sum())
        check(back < 40, f"{room}: and the picture is as it was ({back} pixels differ)")
        # groans: the rule in vocal.js says how many it takes and how urgent they are. By the third there is a notice
        rule = pg.evaluate("[1, 2, 3].map(n => window.__config.cueFor('groan', n))")
        seen = []
        for n in (1, 2, 3):
            pg.click(groan)
            seen.append(pg.evaluate("(window.__config.vocal().notice || {}).level || null"))
            if n == 1 and rule[0] is None:
                check(pg.is_hidden("#vocalNotice") and "waits to hear more" in pg.inner_text("#systemStatus"), f"{room}: one groan the rule doesn't act on says so, and tells nobody")
        v = pg.evaluate("window.__config.vocal()")
        check(seen == rule and seen[-1] in level_colour and v["groans"] == 3, f"{room}: groans raise the notice the rule gives, {rule}, counting them over the last minute {seen}")
        check("groaning was heard" in pg.inner_text("#vocalNotice") and v["light"]["colour"] == level_colour.get(seen[-1]), f"{room}: the groan's notice says what was heard, in its level's colour")
        shot(pg, f"{room.lower()}_vocal_groan")
        if seen[-1] != "now":  # a look-now notice replaces a look-when-you-can one, and is never replaced by one
            pg.click(call)
        pg.click(groan)
        check(pg.evaluate("window.__config.vocal().notice.level") == "now", f"{room}: a notice asking for a look now isn't downgraded by a later groan")
        pg.click("#vocalAck")
        # the sensor's own card: why it's there, its limits, and the same two sounds
        pg.mouse.click(at["x"], at["y"])
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        card = pg.inner_text("#objectCard")
        limits = pg.evaluate("[...document.querySelectorAll('#objectRows dd')].map(d => d.textContent)")
        check("Sound-level sensor" in card and ("closed isolation door" if room == "W1" else "closed door keeps a patient's voice in") in card and "hearing back" in card, f"{room}: the sensor's card says what a closed door takes away and what the sensor gives back")
        check(len(limits) == 4 and all(any(w in t for t in limits) for w in ("Ventilated or sedated patients may make no sound", "Alarms", "classified on the device", "no microphone")) and "stored" in " ".join(limits),
              f"{room}: it lists the limits: silent patients, false alerts from alarms, on-device and never stored, and no microphone here {limits[:1]}")
        buttons = pg.evaluate("[...document.querySelectorAll('#objectCard .object-actions button')].filter(b => !b.hidden).map(b => b.textContent)")
        check(buttons == ["Simulate a call for help", "Simulate a groan"], f"{room}: the card has the two simulated sounds {buttons}")
        shot(pg, f"{room.lower()}_vocal_card")
        pg.click("#objectAction")
        pg.wait_for_selector("#vocalNotice", state="visible", timeout=10000)
        covered = pg.evaluate("""() => { const c = document.getElementById('objectCard'), a = c.getBoundingClientRect(), n = document.getElementById('vocalNotice').getBoundingClientRect();
          return !c.hidden && a.left < n.right && a.right > n.left && a.top < n.bottom && a.bottom > n.top; }""")
        check(pg.evaluate("window.__config.vocal().notice.sound") == "call" and not covered, f"{room}: the card's button raises the notice, and the card never covers it")
        # hiding the sensor takes its notice down, and with no sensor nothing is heard
        pg.evaluate("window.__config.set('soundSensor', 'off')")
        check(pg.is_hidden("#vocalNotice") and not pg.evaluate("window.__config.vocal().notice"), f"{room}: hiding the sensor takes its notice down")
        pg.evaluate("document.getElementById('objectCard').hidden = true")
        pg.click(call)
        check(pg.is_hidden("#vocalNotice") and "sensor is hidden" in pg.inner_text("#systemStatus"), f"{room}: with the sensor hidden a simulated sound raises nothing, and the panel says why")
        pg.evaluate("window.__config.set('soundSensor', 'on')")
        check(quiet(pg.evaluate("window.__config.vocal()")), f"{room}: shown again, the sensor is quiet")
        # none of it touched the room's design, its link or the browser's storage, and no microphone was asked for
        end = pg.evaluate("({ code: window.__config.code(), stored: JSON.stringify([localStorage, sessionStorage]), mic: window.__mic })")
        check(end["code"] == start["code"] and end["stored"] == start["stored"] and end["mic"] == 0, f"{room}: the cue changed no choice, link or stored data, and never asked for a microphone ({end['mic']} requests)")
    # the notice names its room, so leaving the room takes it down; and PACS, which borrows the same light, starts from a quiet sensor
    pg.click(call)
    go(pg, ROOMS[0])
    check(pg.is_hidden("#vocalNotice") and quiet(pg.evaluate("window.__config.vocal()")), "changing room takes the notice down, and the new room's sensor is quiet")
    pg.evaluate("window.__config.camera('family', { instant: true })")
    pg.click(call)
    pg.click("#openPacs")
    pg.wait_for_function("document.body.classList.contains('pacs-active')", timeout=60000)
    check(not pg.evaluate("window.__config.vocal().notice") and pg.is_hidden("#vocalNotice"), "opening PACS takes the notice down first")
    pg.click("#pacsExit")
    pg.wait_for_function("!document.body.classList.contains('pacs-active')", timeout=60000)
    check(quiet(pg.evaluate("window.__config.vocal()")), "and after PACS the sensor's light is green again")
    # by keyboard, and to a screen reader
    pg.evaluate("document.getElementById('systemsSection').open = true")
    pg.focus(call)
    pg.keyboard.press("Enter")
    check(pg.is_visible("#vocalNotice") and "Simulated notice at the nurse station" in pg.inner_text("#announce"), "Enter on the button raises the notice, and it's announced")
    pg.focus("#vocalAck")
    ring = pg.evaluate("(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0; })()")
    pg.keyboard.press("Enter")
    check(ring and pg.is_hidden("#vocalNotice") and "Acknowledged" in pg.inner_text("#announce"), "Acknowledge works from the keyboard with a visible focus ring, and is announced")
    pg.click(groan) if pg.evaluate("window.__config.cueFor('groan', 1)") else pg.click(call)
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "#vocalNotice") + axe_faults(pg, "#systemsSection")
    check(not faults, f"axe finds no serious faults in the notice or the Comfort systems section {faults[:4]}")
    pg.click("#vocalAck")
    check(not errs, f"the vocal-distress cue: no errors {errs[:3]}")
    ctx.close()
    # on a phone the notice fits under the mode bar, and the card that raised it gets out of its way
    ctx, pg, errs, _, _ = open_page(b, 390, 760, query="?tier=low", has_touch=True, is_mobile=True)
    pg.evaluate("window.__config.camera('family', { instant: true })")
    at = pg.evaluate("window.__config.itemPoint('Sound-level sensor')")
    pg.touchscreen.tap(at["x"], at["y"])
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    pg.click("#objectAction")
    pg.wait_for_selector("#vocalNotice", state="visible", timeout=10000)
    fit = pg.evaluate("""() => { const n = document.getElementById('vocalNotice').getBoundingClientRect(), a = document.getElementById('vocalAck').getBoundingClientRect();
      return { inside: n.left >= 0 && n.right <= innerWidth && a.bottom <= innerHeight, over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
               onTop: document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2)?.id, card: !document.getElementById('objectCard').hidden }; }""")
    check(fit["inside"] and fit["over"] <= 0 and fit["onTop"] == "vocalAck" and not fit["card"], f"phone: the notice fits, nothing scrolls sideways and Acknowledge can be tapped {fit}")
    shot(pg, "phone_vocal_notice")
    check(not errs, f"phone, the vocal-distress cue: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- one set of grilles, and the plan that shows them
    ctx, pg, errs, _, _ = open_page(b, 1000, 640, query="?tier=low")
    plan_vents = json.load(open(os.path.join(SITE, "assets", "model", "vents.json")))["vents"]
    by_id = {v["id"]: v for v in plan_vents}
    clean_rows = spec["ventilation"]["clean_air"]["rows"]
    for room in ROOMS:
        go(pg, room)
        names = pg.evaluate("window.__config.partNames()")
        check(not [n for n in names if n.startswith("vent_")], f"{room}: the floor's grilles aren't in the room model, so it has one set")
        # the grilles are hidden, but the wall control they used to come with isn't: the Comfort systems demo and PACS both use it.
        # (The last room's turn below switched the grilles on, so they go back to the default first.)
        pg.evaluate("window.__config.set('ventilation', 'off')")
        shown = pg.evaluate("({ control: window.__config.addonShown('comfortControl'), grilles: window.__config.addonShown('ventilation') })")
        check(shown["control"] and not shown["grilles"], f"{room}: the wall comfort control is there and the grilles aren't {shown}")
        pg.evaluate("document.getElementById('demoTemp').value = 19; document.getElementById('demoTemp').dispatchEvent(new Event('input'))")
        tint = pg.evaluate("window.__config.comfortTint()")
        check(tint == "63aecd", f"{room}: the temperature demo tints the control's status light ({tint})")
        # the control's card lists the clean-air concept for this kind of room: the plan page's rows, from options.json. Nothing is added to the room
        kind = "isolation" if room == "W1" else "patient"
        pg.evaluate("window.__config.camera('family', { instant: true }); document.getElementById('objectCard').hidden = true")
        pt = pg.evaluate("window.__config.itemPoint('Room comfort control')")
        pg.mouse.click(pt["x"], pt["y"])
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        card = pg.evaluate("""() => { const c = document.getElementById('objectCard'), r = c.getBoundingClientRect(); return {
          title: document.getElementById('objectTitle').textContent, heading: document.getElementById('objectRowsTitle').textContent,
          rows: [...document.querySelectorAll('#objectRows dt')].map((dt, i) => [dt.textContent, document.querySelectorAll('#objectRows dd')[i].textContent]),
          links: [...document.querySelectorAll('#objectSources a')].map(a => a.getAttribute('href')), inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth }; }""")
        check(card["title"] == "Room comfort control" and card["rows"] == [[r["label"], r[kind]] for r in clean_rows], f"{room}: the comfort control's card lists the plan's {len(clean_rows)} clean-air rows for this kind of room {card['rows'][:1]}")
        said = " ".join(text for _, text in card["rows"])
        check(("isolation room" in card["heading"] and "HEPA" in said and "None is recirculated" in said) if room == "W1" else ("ICU room" in card["heading"] and "Return air" in said and "HEPA" not in said.replace("The HEPA grade", "")),
              f"{room}: it says how this room's air leaves: {'through a HEPA filter and outdoors' if room == 'W1' else 'back through the filters'} ({card['heading']})")
        check("concept" in card["heading"] and card["links"] == ["../ventilation/#clean-air"] and card["inView"], f"{room}: the card calls it a concept, links the plan's basis and fits the window {card['links']}")
        shot(pg, f"{room.lower()}_clean_air_card")
        pg.evaluate("document.getElementById('objectCard').hidden = true")
        here = pg.evaluate("window.__config.roomVents()")
        check(len(here) > 0 and all(by_id.get(v["id"], {}).get("at") == v["at"] for v in here), f"{room}: its {len(here)} grilles are the plan's own")
        pg.evaluate("window.__config.set('ventilation', 'on')")
        check(pg.evaluate("window.__config.ventPlates()") == len(here), f"{room}: the option draws each of them once")
        kinds = {v["kind"] for v in here}
        check({"supply", "exhaust"} <= kinds and "return" not in {v["kind"] for v in here if v["zone"] == room} if room == "W1" else {"supply", "return"} <= kinds, f"{room}: it has the right kinds of grille {sorted(kinds)}")
    check(not errs, f"grilles in the rooms: no errors {errs[:3]}")
    ctx.close()
    ctx = b.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    page_errs = []
    pg.on("console", lambda m, e=page_errs: e.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e, l=page_errs: l.append(str(e)))
    pg.goto(URL.replace("configurator/", "ventilation/"))
    text = pg.inner_text("main")
    check("not SSMC's mechanical design" in pg.inner_text("#status"), "the plan says it's concept work, not SSMC's design")
    drawn_ids = pg.evaluate("[...document.querySelectorAll('#grilles .v')].map(g => g.dataset.id)")
    check(sorted(drawn_ids) == sorted(by_id), f"the plan draws exactly the 3D model's grilles ({len(drawn_ids)} of {len(by_id)})")
    legend = pg.inner_text("#legend")
    check(all(w in legend for w in ("Supply", "Return", "Exhaust")), "the plan has a legend for supply, return and exhaust")
    check(all(w in text for w in ("air changes", "Isolation room", "Abu Dhabi", "wasn't found")), "the plan gives its basis, and says what wasn't read")
    check("W1 isolation" in pg.text_content("svg.plan .room-labels") and "Corridor" in pg.text_content("svg.plan .room-labels"), "the plan names the rooms")
    # the clean-air layer: filters and UV-C in the plant, as rows with a basis each. It adds no grille (the count above) and claims nothing it shouldn't
    table = pg.evaluate("[...document.querySelectorAll('#cleanAir tbody tr')].map(r => ({ id: r.dataset.row, cells: [...r.cells].map(c => c.innerText.trim()) }))")
    check([r["id"] for r in table] == [r["id"] for r in clean_rows] and all(r["cells"][0] == w["label"] and r["cells"][-1] == w["basis"] and w["isolation"] in r["cells"] and w["patient"] in r["cells"] for r, w in zip(table, clean_rows)),
          f"the plan's clean-air table is the spec's {len(clean_rows)} rows, each with its basis {[r['id'] for r in table]}")
    clean_text = pg.inner_text("#cleanAir")
    check(all(w in clean_text for w in ("MERV 8", "MERV 14", "HEPA", "UV-C", "Assumed")), "it has the filter stages, the HEPA exhaust and UV-C, and marks what's assumed")
    proposed = " ".join(" ".join(r["cells"][:-1]) for r in table if r["id"] != "not_proposed").lower()
    check(not any(w in proposed for w in ("fogg", "ozone", "ionis", "ioniz", "photocatal")) and "Fogging, ozone, ionisers" in clean_text, "fogging, ozone and ionisers appear only in the row that rules them out")
    check(all(w in text for w in ("not a mandatory requirement", "Table 7.1 and its notes only", "Annexure A-3")), "the page says UV-C is an extra, and which parts of its sources weren't read")
    pg.locator("#clean-air").scroll_into_view_if_needed()
    pg.screenshot(path=os.path.join(SHOTS, "ventilation_clean_air.png"))
    faded = pg.evaluate("[...document.querySelectorAll('svg.plan, svg.plan g')].filter(g => getComputedStyle(g).animationName !== 'none').map(g => g.getAttribute('class'))")
    check(not faded, f"nothing on the plan picks up an animation from the site's stylesheet {faded[:3]}")
    check(pg.locator("svg.plan image").count() == 0 and "<image" not in pg.content(), "the plan embeds no picture, so nothing from the drawings")
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "main")
    check(not faults, f"axe finds no serious faults on the plan page {faults[:4]}")
    pg.screenshot(path=os.path.join(SHOTS, "ventilation_plan.png"), full_page=True)
    pg.set_viewport_size({"width": 390, "height": 844})
    over = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(over <= 0, f"the plan page has no sideways scroll on a phone ({over})")
    pg.screenshot(path=os.path.join(SHOTS, "ventilation_phone.png"))
    check(not page_errs, f"the plan page has no errors {page_errs[:3]}")
    pg.goto(URL.replace("configurator/", "index.html"))
    check(pg.locator("a[href='ventilation/']").count() > 0, "the home page links to the plan")
    # ---------------------------------------------------------------- Tune it in: answers to a room, from the data in options.json
    ctx, pg, errs, _, _ = open_page(b, 1000, 640, query="?tier=low")
    plain = {"patientType": "adult", "stay": "short", "sex": "skip", "children": "no", "mobility": "independent", "care": "routine", "sensory": "none"}
    PROFILE_CASES = [  # answers that differ from plain, theme, what has to be set, what a higher tier has to overrule
        ({}, "calm", {"patio": "off"}, []),
        ({"children": "yes"}, "family", {"seating": "sofa", "patio": "off", "tvplay": "on"}, []),
        ({"children": "sometimes"}, "family", {"seating": "sofa"}, []),
        ({"sensory": "company"}, "family", {"seating": "sofa"}, []),
        ({"stay": "long"}, "desert", {"wardrobeFinish": "warm"}, []),
        ({"patientType": "longstay"}, "desert", {"wardrobeFinish": "warm"}, []),
        ({"children": "yes", "stay": "long"}, "family", {"seating": "sofa", "wardrobeFinish": "warm"}, []),
        ({"mobility": "wheelchair", "children": "yes"}, "family", {"seating": "chairs"}, ["seating"]),
        ({"mobility": "aid", "sensory": "company"}, "family", {"seating": "chairs"}, ["seating"]),
        ({"mobility": "assistance"}, "calm", {"seating": "chairs"}, []),
        ({"sensory": "quiet"}, "calm", {"tvplay": "off", "aquarium": "none", "scheme": "cove", "temperature": "k3000"}, []),
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
      for (const x of [...P.rules, ...data.themes]) for (const g of Object.keys(x.sets)) if (groups[g]?.hidden) out.problems.push(`${x.id} sets ${g}, which isn't offered`);
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
          for (const g of ['wardrobe', 'soundSensor']) if (s[g] !== 'on') out.problems.push(`${JSON.stringify(a)}: ${g} is off`);
          for (const g of Object.values(groups).filter(g => g.hidden)) if (s[g.id] !== g.default) out.problems.push(`${JSON.stringify(a)}: ${g.id}, which isn't offered, is ${s[g.id]}`);
          if (['aid', 'wheelchair', 'assistance'].includes(a.mobility) && s.seating !== 'chairs') out.problems.push(`${JSON.stringify(a)}: still a lot on the floor`);
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
    pg.select_option("select[name=stay]", "long")
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
    pg.click("#modeBar button[data-mode='comfort']")
    m = pg.evaluate("window.__config.mode()")
    check(not m["easing"] and m["blinds"] == 1 and m["look"]["level"] == 0.35, f"reduced motion: Comfort is a cut {m}")
    pg.click("#modeBar button[data-mode='standard']")
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
        check(set(pg.evaluate("window.__config.views()")) - set(tour["log"]) <= {"bathroom", "patient"} and not {"bathroom", "patient"} & set(tour["log"]), f"reduced motion, {room}: the tour visits every view but the bathroom and Patient view")
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
    # the panel's own sections: PACS and APIS have theirs inside panels that stay hidden until they open
    for i in range(pg.locator("#panel details").count()):
        pg.locator("#panel details > summary").nth(i).click()
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
      .filter(n => n.offsetParent && !n.disabled && !n.closest('[hidden]') && getComputedStyle(n).visibility !== 'hidden')
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

    # ?stats=1: a readout for diagnosing a slow device, which times real draws
    ctx, pg, errs, _, _ = open_page(b, 1100, 700, query="?stats=1")
    pg.wait_for_selector("#stats", state="visible", timeout=30000)
    pg.wait_for_function("window.__stats && window.__stats().ms !== null", timeout=180000)
    st = pg.evaluate("window.__stats()")
    check(all(k in st["text"] for k in ("GPU: ", "Quality: High", "Pixel ratio: ", "Canvas: ", "ms median")) and st["ms"] > 0, f"?stats=1 shows the GPU, tier, pixel ratio, canvas pixels and a timed median draw {st}")
    check(not errs, f"?stats=1: no errors {errs[:3]}")
    ctx.close()

    # graphics quality: Auto, High or Low, remembered. Until measured, a phone starts on Low, never heavier than before
    ctx, pg, errs, _, _ = open_page(b, 390, 844, device_scale_factor=2, is_mobile=True, has_touch=True)
    q = pg.evaluate("window.__config.quality()")
    check(q["choice"] == "auto" and q["tier"] == "low" and not q["composer"] and q["measured"] is None and "until it has timed" in pg.inner_text("#qualityStatus"),
          f"a phone starts on Low, as before, until Auto has timed its test draws {q}")
    pg.evaluate("window.__config.autoQuality(4)")  # as if its test draws were very quick
    q = pg.evaluate("window.__config.quality()")
    check(q["tier"] == "low" and not q["composer"] and q["measured"] == "low" and "You can still choose High" in pg.inner_text("#qualityStatus"),
          f"Auto never steps a phone up, however quick its test draws, and says so {q} {pg.inner_text('#qualityStatus')!r}")
    check(not errs, f"graphics quality on a phone: no errors {errs[:3]}")
    ctx.close()
    # a laptop starts on High; slow test draws step it down without a reload
    ctx, pg, errs, _, _ = open_page(b, 1100, 700, device_scale_factor=2)
    q = pg.evaluate("window.__config.quality()")
    check(q["tier"] == "high" and q["composer"] and q["transmission"] and q["shadow"] == 2048, f"a laptop starts on High until measured {q}")
    pg.evaluate("window.__config.autoQuality(400)")  # as if its test draws took 400 ms each (a test's software renderer is left alone)
    q = pg.evaluate("window.__config.quality()")
    check(q["tier"] == "low" and not q["composer"] and not q["transmission"] and q["shadow"] == 1024 and q["ratio"] <= 1.5 and q["measured"] == "low",
          f"slow test draws: Auto drops the bloom and its antialiasing, transmission glass and half the shadow size, not only resolution, without a reload {q}")
    check("Auto chose Low" in pg.inner_text("#qualityStatus") and "400 ms" in pg.inner_text("#qualityStatus"), "the status says what Auto chose and why")
    drawn(pg)
    pg.reload(); pg.wait_for_function("window.__configReady === true", timeout=180000)
    q = pg.evaluate("window.__config.quality()")
    check(q["tier"] == "low" and q["choice"] == "auto", f"the next load starts in what Auto measured {q}")
    pg.locator("#quality button[data-value='high']").scroll_into_view_if_needed()
    pg.click("#quality button[data-value='high']")
    q = pg.evaluate("window.__config.quality()")
    check(q["tier"] == "high" and q["choice"] == "high" and q["composer"] and q["transmission"] and q["shadow"] == 2048 and pg.locator("#quality button[data-value='high']").get_attribute("aria-pressed") == "true",
          f"High brings them all back at once {q}")
    drawn(pg)
    pg.reload(); pg.wait_for_function("window.__configReady === true", timeout=180000)
    check(pg.evaluate("window.__config.quality()")["choice"] == "high", "the choice is remembered")
    pg.locator("#quality button[data-value='auto']").scroll_into_view_if_needed()
    pg.click("#quality button[data-value='auto']")
    q = pg.evaluate("window.__config.quality()")
    check(q["choice"] == "auto" and q["tier"] == "low", f"back to Auto starts from what it measured {q}")
    pg.evaluate("localStorage.clear()")
    check(not errs, f"graphics quality: no errors {errs[:3]}")
    ctx.close()
    # a big laptop screen draws no more than the pixel budget; ?tier= forces a tier and the switch says it can't change
    ctx, pg, errs, _, _ = open_page(b, 2560, 1440, query="?tier=high", device_scale_factor=2)
    q = pg.evaluate("window.__config.quality()")
    check(q["pixels"] <= 3.7e6 and pg.locator("#quality button[data-value='low']").is_disabled(), f"2560 x 1440 @2x draws at most about 3.6 million pixels, and a forced tier locks the switch {q}")
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
    check(pg.locator("#configurator a[href='configurator/?tour=guided']").count() == 1, "the home page offers the guided tour")
    # the page leads with the proposal: the tour is the first action, and each feature has its own picture that opens its room
    check(pg.locator(".hero .actions a").first.get_attribute("href") == "configurator/?tour=guided", "the home page's first action is the guided tour")
    figs = pg.evaluate("[...document.querySelectorAll('#proposal figure')].map(f => ({ href: f.querySelector('a').getAttribute('href'), alt: f.querySelector('img').alt.length, lead: f.querySelector('figcaption b')?.textContent || '' }))")
    check(len(figs) == 6 and all("configurator/#c=" in f["href"] and f["alt"] > 40 and f["lead"] for f in figs), f"the proposal has six features, each with a described picture that opens its room {[f['lead'] for f in figs]}")
    words = pg.inner_text("#proposal")
    check(all(w in words for w in ("Room modes", "PACS", "APIS", "Clinical view", "Remote care for the isolation room", "simulated")), "the proposal names the modes, PACS, APIS, Clinical view and Remote care, and says the readings are simulated")
    check("Six things" in words and "Fewer unnecessary entries, never fewer checks" in words and "look in through the glass first" in words, "Remote care's caption carries its pitch: look in first, fewer entries, never fewer checks")
    check(pg.evaluate("[...document.querySelectorAll('#rooms [role=tab]')].map(t => t.textContent.trim().split(/\\s+/)[0])") == ["Proposed", "Today"], "the first picture compares the proposed room with the room today")
    pg.evaluate("document.querySelectorAll('#proposal img').forEach(i => { i.loading = 'eager'; })")
    pg.wait_for_function("[...document.querySelectorAll('#proposal img')].every(i => i.complete && i.naturalWidth > 0)", timeout=60000)
    check(True, "every picture in the proposal loads")
    pg.set_viewport_size({"width": 390, "height": 844})
    check(pg.evaluate("document.documentElement.scrollWidth <= innerWidth && document.querySelector('.top').getBoundingClientRect().height < 140"), "on a phone the home page doesn't scroll sideways and its menu stays on one row")
    ctx.close()
    # that link opens the configurator straight into the tour
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.goto(URL + "?tour=guided")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    pg.wait_for_function("window.__config.guide().running", timeout=30000)
    check(pg.is_visible("#guide") and pg.evaluate("window.__config.guide().at") == 0, "?tour=guided starts the guided tour")
    ctx.close()

    # ---------------------------------------------------------------- a script that can't load says so
    ctx = b.new_context(viewport={"width": 1100, "height": 600})
    pg = ctx.new_page()
    pg.route("**/three.module.js", lambda r: r.abort())
    pg.goto(URL)
    pg.wait_for_function("window.__configErrors.length > 0", timeout=60000)
    check("could not be loaded" in pg.inner_text("#load"), "if Three.js can't be fetched, the page says so instead of loading for ever")
    ctx.close()

    # ---------------------------------------------------------------- storage refused: saving says so, nothing breaks
    ctx = b.new_context(viewport={"width": 1100, "height": 700})
    ctx.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('refused', 'SecurityError'); } });")
    pg = ctx.new_page()
    perrs = []
    pg.on("pageerror", lambda e: perrs.append(str(e)))
    pg.goto(URL)
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    pg.fill("#presetName", "Test")
    pg.click("#presetForm button[type='submit']")
    check("won't let the page save" in pg.inner_text("#presetStatus") and not perrs, f"with storage refused, Save says nothing was saved {perrs[:2]}")
    ctx.close()
    # the walkthrough links each configurable room here with ?room=
    ctx = b.new_context(viewport={"width": 1100, "height": 700})
    pg = ctx.new_page()
    pg.goto(URL + "?room=W3")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    check(pg.evaluate("window.__config.state().room") == "W3", "?room=W3 opens W3")
    ctx.close()

    # ---------------------------------------------------------------- a browser that can't draw says why, and where the pictures are
    NO_WEBGL2 = "HTMLCanvasElement.prototype.getContext = (g => function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); })(HTMLCanvasElement.prototype.getContext);"
    NO_IMPORT_MAPS = "HTMLScriptElement.supports = t => t !== 'importmap';"
    for what, init, words in [("no WebGL 2", NO_WEBGL2, "it needs WebGL 2"), ("no import maps", NO_IMPORT_MAPS, "too old for the way the page loads")]:
        ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        ctx.add_init_script(init)
        pg = ctx.new_page()
        if what == "no import maps":
            pg.route("**/three.module.js", lambda r: r.abort())  # this Chromium has import maps: make "three" fail as it would without them
        pg.goto(URL)
        pg.wait_for_function("window.__cantDraw", timeout=60000)
        pg.wait_for_timeout(2000)  # long enough for main.js to have failed, or to have hidden the message by mistake
        text = pg.inner_text("#load") if pg.is_visible("#load") else ""
        check(words in text, f"{what}: the page says why it can't draw ({text[:80]!r})")
        check(pg.locator("#load a").get_attribute("href") == "../", f"{what}: it links to the pictures on the home page")
        check(not pg.is_visible("#panel"), f"{what}: no panel of controls that would do nothing")
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
    # every room mode stays on a phone, and Emergency-ready works by touch
    hud = pg.evaluate("(() => { const r = document.getElementById('modeBar').getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, small: [...document.querySelectorAll('#modeBar button')].filter(b => b.getBoundingClientRect().height < 40).map(b => b.textContent) }; })()")
    check(hud["right"] <= hud["width"] and not hud["small"], f"phone: every room mode is on screen and large enough to tap {hud}")
    pg.tap("#modeBar button[data-mode='emergency']")
    check(pg.is_visible("#modeBanner") and pg.evaluate("window.__config.mode().current") == "emergency", "phone: Emergency-ready works by touch")
    shot(pg, "phone_emergency")
    pg.tap("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    # placing by touch: tap an item in the sheet, which closes to show the room, then tap the floor
    pg.tap("#sheet")
    pg.wait_for_timeout(600)
    pg.locator("#placeItems button[data-item='bins']").scroll_into_view_if_needed()
    pg.tap("#placeItems button[data-item='bins']")
    drawn(pg)  # the sheet slides away first, and the room's framing changes with it
    spot = pg.evaluate("""(() => { const c = window.__config, w = c.walkable(), cx = w.reduce((a, p) => a + p[0], 0) / w.length, cy = w.reduce((a, p) => a + p[1], 0) / w.length; return c.screenOf(cx, cy, 0); })()""")
    closed_sheet = not pg.evaluate("document.getElementById('panel').classList.contains('open')")
    pg.tap("#c", position={"x": spot["x"], "y": spot["y"]})
    check(closed_sheet and [q["type"] for q in pg.evaluate("window.__config.placed()")] == ["bins"], f"phone: tapping an item, then the floor, places it {spot} {pg.inner_text('#placeStatus')!r}")
    pg.evaluate("document.getElementById('resetRoom').click()")
    # the guided tour on a phone: its card sits above the closed sheet, with buttons big enough to tap
    pg.tap("#sheet"); pg.wait_for_timeout(600)
    pg.tap("#openGuide")
    drawn(pg)
    card = pg.evaluate("(() => { const r = document.getElementById('guide').getBoundingClientRect(), s = document.getElementById('panel').getBoundingClientRect(); return { bottom: r.bottom, sheetTop: s.top, left: r.left, right: r.right, w: innerWidth, small: [...document.querySelectorAll('#guide button')].filter(b => b.getBoundingClientRect().height < 40).map(b => b.textContent) }; })()")
    check(card["bottom"] <= card["sheetTop"] + 1 and card["left"] >= 0 and card["right"] <= card["w"] and not card["small"], f"phone: the guided tour's card fits above the sheet {card}")
    shot(pg, "phone_guide")
    pg.tap("#guideExit")
    pg.wait_for_function("!window.__config.guide().running", timeout=60000)
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
    # iOS Safari drops the WebGL context under memory pressure: the page says so and offers a reload, instead of freezing
    pg.evaluate("window.__config.set('wardrobe', 'off')")
    pg.wait_for_timeout(400)  # the link is written a moment after a change
    code = pg.evaluate("window.__config.code()")
    pg.evaluate("document.getElementById('c').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    pg.wait_for_selector("#glLost", state="visible", timeout=10000)
    check(pg.inner_text("#glReload") == "Tap to reload the 3D view" and pg.evaluate("document.activeElement.id") == "glReload", "phone: a lost 3D view says so, with a focused Tap to reload button")
    pg.screenshot(path=os.path.join(SHOTS, "phone_context_lost.png"))  # not shot(): nothing draws once the context is lost
    pg.tap("#glReload")
    pg.wait_for_function("window.__configReady === true && document.getElementById('glLost').hidden", timeout=120000)
    check(pg.evaluate("window.__config.code()") == code, "phone: reloading after a lost 3D view brings back the same room")
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
print("  configurator check: ok (load, budget, views, orbit limits, moves, dollhouse, sun, time, every option, smart glass, palms, themes, spec codes, summary, tour, grilles and their plan, accessibility, adaptive quality, stats readout, phone)")
