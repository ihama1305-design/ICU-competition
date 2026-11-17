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
draws while the page is idle, and slow frames lower the quality. Suggest a room: a table of answers and rooms, every combination of answers, the real form, comparing, undo, and what stays out of links and storage. Feature cards: every registered feature by a real click in both rooms and from the Features list by keyboard, every demo run and the room and link proved unchanged, Esc, Stop and Emergency ending one, Explore features and its filter, a hover costing one draw, Low graphics and a phone. Patient states: each state's light and screens, the modes winning, the board's three inputs and its nurse-side list, the passport saved in this browser, family connection, Quiet now, the staff view, and a phone.
Lighting schemes, smart glass, palms and themes get screenshots to look at. Screenshots -> build/shots/config_*.png. Checks the published site in spec site.dir.
"""
import functools
import http.server
import io
import json
import math
import random
import re
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
    """Wait for interface animations, then for the frame after this change to reach the screen.

    The guided tour's wait fill doesn't count: it is a clock that runs for as long as a step is held, not an entrance.
    """
    pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running' || a.effect?.target?.id === 'guideHold')", timeout=60000)
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
    """Serious and critical accessibility faults inside selector, as short strings.

    Entrances finish first. A dialog that is still fading in is partly transparent, and axe then reads its text as too low
    in contrast: held under about 0.6 of the way to opaque, the summary's Copy link button fails, and passes once arrived.
    """
    try:
        pg.wait_for_function("document.getAnimations().every(a => a.playState !== 'running' || a.effect?.target?.id === 'guideHold')", timeout=10000)
    except PlaywrightTimeout:
        pass  # something on the page animates without end: judge it as it stands
    found = pg.evaluate("""async sel => {
      const r = await axe.run(sel, { resultTypes: ['violations'] });
      return r.violations.filter(v => ['serious', 'critical'].includes(v.impact)).map(v => `${v.id}: ${v.nodes.slice(0, 2).map(n => n.target.join(' ')).join(', ')}`);
    }""", selector)
    return found


def gone(pg, selector):
    """True once selector is off the page. A layer that fades out takes a moment to go, so this waits for it, briefly."""
    try:
        pg.wait_for_selector(selector, state="hidden", timeout=3000)
        return True
    except Exception:
        return False


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
        # the seven every room has, any of its own in the spec, such as W1's bathroom, and the page's own view across the room
        want_views = {"overview", "family", "entrance", "bed", "bed_window", "window", "dollhouse", "across"}
        check(want_views <= set(views) and set(views) == set(spec["configurator"]["rooms"][room]["cameras"]) | {"across"}, f"{room} has all the views")
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
    check(pg.is_visible("#modeBar") and "alarms always stay on" in pg.inner_text("#modeBar").lower(), "the room-mode bar is on screen and says clinical alarms always stay on")
    pg.click("#modeBar button[data-mode='comfort']")
    check(pg.evaluate("window.__config.mode().easing"), "Comfort eases in rather than cutting")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    # after sunset there's no daylight to block: Comfort changes only the lighting and says why in one line
    check(m["current"] == "comfort" and m["look"] == {"kelvin": 2700, "level": 0.35} and m["blinds"] == 0 and not m["task"], f"Comfort after dark: warm, dim light, the blinds left as configured, task light left alone {m}")
    note = pg.inner_text("#modeNote")
    check(pg.locator("#modeBar button[data-mode='comfort']").get_attribute("aria-pressed") == "true" and "not affected" in note, "Comfort: its button is pressed and the note says what's not affected")
    why = pg.locator("#modeNote .mode-why")
    check(why.count() == 1 and "after sunset" in why.inner_text().lower() and "blinds stay" in why.inner_text() and "lowered blinds" not in note, f"Comfort after dark: one line says why the blinds stay ({note!r})")
    shot(pg, "w1_mode_comfort_night")
    pg.evaluate("window.__config.time(window.__config.stops.afternoon)")  # crossing sunrise sets Comfort again, now with the blinds
    code0 = pg.evaluate("window.__config.code()")  # the link holds the time, which changed just now; a mode never does
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "comfort" and m["blinds"] == 1 and m["look"] == {"kelvin": 2700, "level": 0.35} and pg.locator("#modeNote .mode-why").count() == 0 and "lowered blinds" in pg.inner_text("#modeNote"),
          f"Comfort by day: the blinds lower too, and the after-dark line goes {m}")
    shot(pg, "w1_mode_comfort")
    pg.click("#modeBar button[data-mode='emergency']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "emergency" and m["look"] == {"kelvin": 4000, "level": 1} and m["task"], f"Emergency: full light and the task light on {m}")
    clear = pg.evaluate("window.__config.glassLevel()")
    check(not m["tvPlaying"] and m["aquariumScreen"] is False and m["glass"] == "clear" and not m["curtain"] and clear < 0.01, f"Emergency: the TV and aquarium screen off, the glazed front clear ({clear:.2f}) {m}")
    check(pg.is_visible("#modeBanner") and "not changed" in pg.inner_text("#modeBanner"), "Emergency: a banner says alarms and devices are not changed")
    shot(pg, "w1_mode_emergency")
    pg.click("#leaveEmergency")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "comfort" and m["tvPlaying"] and m["aquariumScreen"] and m["glass"] == "opaque" and m["blinds"] == 1, f"leaving Emergency mode goes back to Comfort, screens and glass as they were {m}")
    pg.click("#modeBar button[data-mode='clinical']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "clinical" and m["task"] and m["blinds"] == 0 and m["look"]["level"] == 1, f"Clinical: task light on, full light, the blinds back to the room's own {m}")
    pg.click("#modeBar button[data-mode='standard']")
    pg.wait_for_function(settled, timeout=60000)
    m = pg.evaluate("window.__config.mode()")
    check(m["current"] == "standard" and m["look"] is None and not m["task"] and m["blinds"] == 0, f"As set puts the configured room back {m}")
    check(pg.inner_text("#modeBar button[data-mode='standard']") == "As set", "the mode that lays nothing over the room is called As set, since Standard is also a kind of room")
    check(pg.evaluate("window.__config.code()") == code0 and pg.evaluate("window.__config.selected()") == chosen0, "no mode changes a choice or the share link")
    # Privacy: smart glass goes opaque and the blinds lower halfway; As set clears it again
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
    check(not pg.evaluate("document.body.classList.contains('pacs-active')") and pg.evaluate("window.__config.mode().current") == "emergency", "Emergency wins over PACS")
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

    # ---------------------------------------------------------------- Equipment labels: labels on the kit and keep-clear areas, over the room as it is
    go(pg, "W1")
    set_defaults(pg)
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    code0 = pg.evaluate("window.__config.code()")
    pg.click("#clinicalToggle")
    drawn(pg)
    cv = pg.evaluate("window.__config.clinical()")
    check(cv["on"] and cv["zones"] and {"Bed", "Patient monitor · simulated readings", "Ventilator"} <= set(cv["labels"]), f"Equipment labels name the kit and draw the keep-clear areas {cv}")
    check(pg.is_visible("#clinicalNote") and "not a clinical or compliance check" in pg.inner_text("#clinicalNote"), "Equipment labels say they're illustrative")
    check(pg.inner_text("#clinicalToggle").startswith("Equipment labels") and pg.inner_text("#clinicalNote").startswith("Equipment labels:"), "the labels are called Equipment labels on their button and in their note, since Clinical is also a mode and part of a theme's name")
    boxes = pg.evaluate("[...document.querySelectorAll('#clinicalLabels span')].filter(e => !e.hidden).map(e => e.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom])")
    panel_left = pg.evaluate("document.getElementById('panel').getBoundingClientRect().left")
    overlaps = [(a, b2) for i, a in enumerate(boxes) for b2 in boxes[i + 1:] if a[0] < b2[2] and b2[0] < a[2] and a[1] < b2[3] and b2[1] < a[3]]
    check(not overlaps and all(r[2] <= panel_left + 1 for r in boxes), f"its labels don't overlap or sit under the panel {overlaps[:2]}")
    check(pg.evaluate("window.__config.code()") == code0, "Equipment labels don't change the room or its link")
    shot(pg, "w1_clinical_view")
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    drawn(pg)
    check(len(pg.evaluate("window.__config.clinical()")["labels"]) >= 7, "from the dollhouse it labels the room's kit")
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    pg.click("#clinicalToggle")
    check(not pg.evaluate("window.__config.clinical()")["on"] and not pg.is_visible("#clinicalLabels"), "the toggle turns it off again")
    # the Clinical and Emergency modes turn them on, and As set puts them back as they were
    pg.click("#modeBar button[data-mode='clinical']")
    check(pg.evaluate("window.__config.clinical()")["on"], "Clinical mode turns the equipment labels on")
    pg.click("#modeBar button[data-mode='standard']")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    check(not pg.evaluate("window.__config.clinical()")["on"], "As set turns them back off")
    pg.click("#modeBar button[data-mode='emergency']")
    check(pg.evaluate("window.__config.clinical()")["on"], "Emergency turns the equipment labels on")
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
    filling = "document.getElementById('guideHold').getAnimations().filter(a => a.playState === 'running').length"
    # the wait is time to read the step with its room drawn, so it starts when the camera has arrived, not when the step is chosen.
    # Pressed and read in one go, so the read can't arrive after the camera has
    early = pg.evaluate(f"""async () => {{ document.getElementById('openBasics').click(); await new Promise(r => setTimeout(r));
      return {{ moving: window.__config.state().moving, still: window.__config.guide().still, filling: {filling} }}; }}""")
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and g["at"] == 0 and pg.is_visible("#guide") and pg.inner_text("#guideCount") == "1 of 9", f"the guided tour starts at its first step {g}")
    check(pg.inner_text("#guideCaveat") == "Simulated demo. A nurse approves every change.", "one fixed line under the captions carries the caveats")
    check(pg.get_attribute("#guidePrev", "disabled") is not None, "Previous waits until there's somewhere to go back to")
    check(early["moving"] and not early["still"] and early["filling"] == 0, f"while the camera is still on its way to a step, the step's wait hasn't started {early}")
    pg.wait_for_function("window.__config.guide().still", timeout=120000)
    pg.wait_for_function(f"{filling} === 1", timeout=20000)
    wait_ms = pg.evaluate("document.getElementById('guideHold').getAnimations()[0]?.effect.getTiming().duration")
    check(not pg.evaluate("window.__config.state().moving") and wait_ms and wait_ms <= 9000, f"once the room is still, the bar's next segment fills over the wait, so a visitor can see it will move on by itself ({wait_ms} ms)")
    pg.click("#guidePlay")
    check(not pg.evaluate("window.__config.guide()")["playing"] and pg.inner_text("#guidePlay") == "Play" and pg.evaluate(filling) == 0, "Pause stops it moving on by itself, and the bar stops filling")
    seen = {}
    for i in range(1, 9):
        pg.click("#guideNext")
        pg.wait_for_function(f"window.__config.guide().at === {i}", timeout=60000)
        pg.wait_for_function("!window.__config.state().moving && !window.__config.mode().easing", timeout=120000)
        seen[i] = {"view": pg.evaluate("window.__config.state().view"), "mode": pg.evaluate("window.__config.mode().current"), "clinical": pg.evaluate("window.__config.clinical().on"), "placed": len(pg.evaluate("window.__config.placed()")), "theme": pg.evaluate("window.__config.currentTheme()"),
                   "tv": pg.evaluate("window.__config.selected().tvplay"), "screen": pg.evaluate("window.__config.orientation()")}
    check(seen[2]["view"] == "patient", f"it shows Patient view {seen[2]}")
    # the wall Patient view faces is mostly television: it shows the day and the time, where off it was a black rectangle
    check(seen[2]["tv"] == "orientation" and seen[2]["screen"] and len(seen[2]["screen"]) >= 5, f"in Patient view the television is on its orientation screen, so the view has something to show {seen[2]}")
    check(seen[3]["mode"] == "comfort" and seen[4]["mode"] == "clinical" and seen[4]["clinical"] and seen[5]["mode"] == "emergency", f"it shows Comfort, Clinical with the equipment labels, and Emergency {seen[3]} {seen[4]} {seen[5]}")
    check(seen[6]["placed"] == 2 and seen[6]["mode"] == "standard", f"it places two items {seen[6]}")
    check(seen[7]["theme"] == "desert", f"it shows a theme at sunset {seen[7]}")
    check(seen[7]["view"] == "overview" and seen[6]["view"] == "overview", f"the theme changes in place, from the view the step before it stood at, facing the window and the low sun {seen[7]}")
    check(pg.locator("#guideLinks button").count() == 2 and pg.inner_text("#guideNext") == "Finish", "the last step offers the PACS and APIS demos, and Finish")
    pg.click("#guidePlay")
    check(pg.evaluate("window.__config.guide()")["playing"] and pg.evaluate(filling) == 0, "the last step has nothing to move on to, so its bar shows no wait")
    pg.click("#guidePlay")
    shot(pg, "w1_guide_last")
    # Restart: back to the first step and playing, with the room as it was before the tour, so no item or mode carries over
    check(pg.is_visible("#guideRestart"), "the tour has a Restart button")
    pg.click("#guideRestart")
    pg.wait_for_function("window.__config.guide().at === 0 && !window.__config.state().moving && !window.__config.mode().easing", timeout=120000)
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and g["playing"] and pg.inner_text("#guideCount") == "1 of 9" and pg.evaluate("window.__config.placed()") == [] and pg.evaluate("window.__config.mode().current") == "standard" and pg.evaluate("window.__config.currentTheme()") == "calm",
          f"Restart plays again from the first step, with the tour's placed items and modes cleared {g}")
    pg.click("#guidePlay")

    def finish(twice=False):
        """Run the tour to its last step and press Finish; returns once the room has been put back.
        With twice, a second press follows at once on each button the ending puts where Finish was."""
        if not pg.evaluate("window.__config.guide().running"):
            pg.click("#openBasics")
            pg.click("#guidePlay")
        pg.evaluate("window.__config.guideGo(8)")
        pg.wait_for_function("window.__config.guide().at === 8", timeout=60000)
        if twice:
            pg.evaluate("for (const id of ['guideNext', 'guideAgain', 'guideTry']) document.getElementById(id).click()")
        else:
            pg.click("#guideNext")
        pg.wait_for_function("window.__config.guide().ended", timeout=60000)
        pg.wait_for_function(f"window.__config.code() === '{before}'", timeout=120000)

    def said(text):
        try:
            pg.wait_for_function(f"document.getElementById('announce').textContent === {json.dumps(text)}", timeout=30000)
            return True
        except Exception:
            return False

    ending = """(() => { const $ = id => document.getElementById(id), shown = e => !e.hidden && getComputedStyle(e).display !== 'none';
      return { card: shown($('guide')), count: $('guideCount').textContent, title: $('guideTitle').textContent, text: $('guideText').textContent, caveat: shown($('guideCaveat')),
               steps: shown($('guideSteps')), buttons: shown($('guideAfter')) ? [...$('guideAfter').children].map(b => b.textContent) : [], focus: document.activeElement?.id,
               guided: document.body.classList.contains('guided'), running: window.__config.guide().running }; })()"""
    finish()
    check(pg.evaluate("window.__config.placed()") == [] and pg.evaluate("window.__config.mode().current") == "standard" and not pg.evaluate("window.__config.clinical()")["on"] and pg.evaluate("window.__config.selected().tvplay") == "off",
          "Finish puts the room back exactly as it was: choices, view, time, items, mode")
    e = pg.evaluate(ending)
    # the ending: Finish used to take the card away and change the room without a word, leaving nothing to do next
    check(e["card"] and not e["running"] and e["title"] == "That's the tour" and e["count"] == "Finished" and "back to how it was" in e["text"], f"after Finish the card stays to say the tour is over and the room is back to how it was {e}")
    check(e["buttons"] == ["Try it yourself", "Watch again"] and not e["steps"] and not e["caveat"] and e["focus"] == "guideTry", f"the ending offers what comes next, in place of the tour's own controls, with the keyboard on the first {e}")
    check(said("Guided tour finished. The room is back as it was."), "the last thing announced after Finish is that the tour finished, after the announcements that putting the room back makes")
    shot(pg, "w1_guide_ending")
    pg.wait_for_timeout(700)
    pg.click("#guideTry")
    check(gone(pg, "#guide") and not pg.evaluate("document.body.classList.contains('guided')") and pg.evaluate("document.activeElement.closest('#themes') !== null"),
          "Try it yourself puts the card away and moves the keyboard to the first of the room's options, the themes")
    # a second click meant for Finish lands where the ending's buttons now are: it does nothing
    finish(twice=True)
    e = pg.evaluate(ending)
    check(e["card"] and not e["running"] and e["title"] == "That's the tour", f"a press on the ending's buttons in the moment after Finish is ignored, so a double click on Finish doesn't restart or close it {e}")
    pg.wait_for_timeout(700)
    pg.click("#guideAgain")
    pg.wait_for_function("window.__config.guide().at === 0", timeout=60000)
    e = pg.evaluate(ending)
    check(e["running"] and e["count"] == "1 of 9" and e["steps"] and e["caveat"] and not e["buttons"] and pg.evaluate("window.__config.guide().playing"), f"Watch again plays the tour from its first step, with its own controls back {e}")
    finish()
    pg.focus("#guideTry")
    pg.keyboard.press("Escape")
    check(gone(pg, "#guide") and not pg.evaluate("window.__config.guide().ended") and not pg.evaluate("document.body.classList.contains('guided')"), "Esc puts the ending away")
    finish()
    # a press without a drag: a real drag here turns the room, and in the software renderer the turn takes most of a minute to
    # die away, which would move the camera under the tests that follow
    pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.up()
    check(gone(pg, "#guide") and not pg.evaluate("window.__config.guide().ended"), "pressing on the room puts the ending away: the room is in the visitor's hands, which is what it asked for")
    pg.evaluate("document.getElementById('objectCard').hidden = true")
    # Esc from the card leaves it too, and dragging the room pauses rather than ends it
    pg.click("#openBasics")
    pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(460, 410); pg.mouse.up()
    g = pg.evaluate("window.__config.guide()")
    check(g["running"] and not g["playing"], f"dragging the room pauses the tour rather than ending it {g}")
    pg.focus("#guideNext")
    pg.keyboard.press("Escape")
    pg.wait_for_function(f"window.__config.code() === '{before}'", timeout=120000)
    check(not pg.evaluate("window.__config.guide()")["running"] and gone(pg, "#guide"), "Esc on the tour's card ends it, and the room is as it was")
    check(said("Guided tour ended. The room is back as it was."), "leaving the tour early is announced after the room is back, so the announcement isn't replaced by the room's own")
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
    check(o and o[2] == pg.inner_text("#timeNow") and o[3] == "Night" and o[4] == "Night-time", f"it follows the time of day into the night, and says it's night-time {o}")
    check(o[5:] == ["You are in hospital, in the intensive care unit.", "Visiting today: 4 to 8 pm · confirmed by staff", "Later: a wash, then a rest"],
          f"beside the time: where the patient is, visiting marked as confirmed by staff, and a plan; never a name or a diagnosis {o[5:]}")
    pg.click("#modeBar button[data-mode='emergency']")
    check(not pg.evaluate("window.__config.mode()")["tvPlaying"] and pg.evaluate("window.__config.orientation()") is not None, "Emergency turns it off like any screen")
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
    check("air seal" in pg.text_content("#options"), "W1: the patio carries the pressure warning")
    go(pg, "W3")
    check("air seal" not in pg.text_content("#options"), "W3: the patio has no isolation warning")
    go(pg, "W1")
    pg.evaluate("window.__config.set('patio', 'off')")
    check("air seal" not in pg.text_content("#options"), "W1: no patio warning without a patio")
    pg.evaluate("window.__config.set('patio', 'on')")
    go(pg, "W3")
    pg.evaluate("window.__config.camera('bed_window', { instant: true })")
    shot(pg, "w3_patio_from_bed")
    pg.evaluate("window.__config.set('floor', 'terrazzo'); window.__config.set('feature', 'sea')")  # for the summary below
    pg.evaluate("window.__config.set('aquarium', 'sealed')")
    check("against fish tanks" in pg.text_content("#options"), "the sealed tank carries the CDC note")
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
    check("air seal" in text and "fall-safety" in text, "a Family Suite summary in W1 carries the patio's warning and concept notes")
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
    pg.goto("about:blank")
    pg.goto(URL + "?tier=low#c=" + short)
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check(pg.evaluate("window.__config.selected().patio") == "off" and pg.evaluate("window.__config.selected().paint") == "sand", "an older, shorter code opens with defaults for the rest")
    pg.goto(URL + "?tier=low#c=!!nonsense")
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check("didn't work" in pg.inner_text("#roomStatus"), "a bad code says so and opens the default room")
    # a link made before a group was hidden still opens: what it asked for that isn't offered falls back, and the page says so
    ALPHA = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    hidden = [g for g in groups if g.get("hidden")]
    check(hidden and not [g["id"] for g in hidden if pg.locator(f"#g-{g['id']}").count()], "the panel doesn't offer the hidden groups")
    pg.evaluate("window.__config.theme('desert')")
    old_code = list(pg.evaluate("window.__config.code()"))
    for g in hidden:
        old_code[5 + g["code"]] = ALPHA[next(o["code"] for o in g["options"] if o["id"] != g["default"])]
    # a fresh load of the old link: a change of hash alone lets the open page tidy the address before a reload reads it
    pg.goto("about:blank")
    pg.goto(URL + "?tier=low#c=" + "".join(old_code))
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
                check(pg.is_hidden("#vocalNotice") and "waits for more" in pg.inner_text("#systemStatus"), f"{room}: one groan the rule doesn't act on says so, and tells nobody")
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
        check(len(limits) == 4 and all(any(w in t for t in limits) for w in ("on a breathing machine or sedated may not make sounds", "Alarms", "classified on the device", "No microphone")) and "stored" in " ".join(limits),
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
    pg.evaluate("window.__config.orbit(0, 0.12)")  # tilted a little: on a phone the mode bar's two rows of three would cover the sensor
    at = pg.evaluate("window.__config.itemPoint('Sound-level sensor')")
    check(pg.evaluate("([x, y]) => document.elementFromPoint(x, y)?.id", [at["x"], at["y"]]) == "c", "phone: the sensor is in sight, below the mode bar")
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
    check(pg.text_content("main a[href='../']").strip() == "Adaptive ICU" and pg.title().endswith(": Adaptive ICU"), "the plan page calls the site by the proposal's name")
    pg.goto(URL.replace("configurator/", "index.html"))
    check(pg.locator("a[href='ventilation/']").count() > 0, "the home page links to the plan")
    # ---------------------------------------------------------------- Suggest a room: answers to a room, from the data in options.json
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
    check(not errs, f"Suggest a room: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- feature cards: every feature by a click in the room and from the panel, its demo, and Explore features
    OLD_LINK = "10030010002000000000000000000000000100"  # a link from before the cards: it must open the same room
    MOVING = "document.body.classList.contains('placing') || document.body.classList.contains('dragging-item')"
    COVERS = """() => { const c = document.getElementById('objectCard').getBoundingClientRect();
      return [...document.getElementById('hud').children].filter(n => !n.hidden && n.offsetParent).map(n => [n.id || n.className, n.getBoundingClientRect()])
        .filter(([, r]) => c.left < r.right && c.right > r.left && c.top < r.bottom && c.bottom > r.top).map(([n]) => n); }"""

    def card_on_top(pg):
        """The card is open, in the window, and covers neither the mode bar nor any notice."""
        c = pg.evaluate("window.__config.card()")
        r = c["rect"]
        inside = r["left"] >= 0 and r["top"] >= 0 and r["right"] <= pg.viewport_size["width"] and r["bottom"] <= pg.viewport_size["height"]
        return c, inside, pg.evaluate(COVERS)

    def run_demo(pg, fid, skip=False, timeout=180000, menu=None):
        """Open a feature's card from the Features list, press See it in action (or the menu item named `menu`), and let it run
        to the end (or skip each hold)."""
        pg.evaluate("document.getElementById('featuresSection').open = true")
        pg.click(f"#featureList button[data-feature='{fid}']")
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        if menu:
            pg.click("#featureMenuToggle")
            pg.click(f"#featureMenuList button:text-is('{menu}')")
        else:
            pg.click("#featureDemo")
        pg.wait_for_function("window.__config.demo() !== null", timeout=10000)
        seen = pg.evaluate("({ bar: !document.getElementById('demoBar').hidden, card: !document.getElementById('objectCard').hidden, text: document.getElementById('demoText').textContent })")
        frozen = []
        while True:
            try:
                pg.wait_for_function("!window.__config.demo() || window.__config.demo().waiting", timeout=timeout)
            except PlaywrightTimeout:
                return seen, frozen, False
            d = pg.evaluate("window.__config.demo()")
            if not d:
                return seen, frozen, True
            frozen.append(pg.evaluate("({ code: window.__config.code(), hash: location.hash.slice(3), selected: window.__config.fingerprint().selected })"))
            if skip:
                pg.evaluate("window.__config.demoAdvance()")
            else:
                pg.wait_for_function(f"!window.__config.demo() || window.__config.demo().at !== {d['at']}", timeout=timeout)

    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    feats = pg.evaluate("window.__config.features()")
    names = {f["id"]: f["name"] for f in feats}
    check(len(feats) >= 12 and {"circadian", "privacy", "orientation", "nature", "wardrobe", "soundSensor", "comfortControl", "daylightSensor"} <= set(names),
          f"the registry has the eight features that were here before the cards, and the nature display's parts ({len(feats)} entries)")
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        # what the default room leaves out, so every card has its object in the room
        pg.evaluate("() => { const c = window.__config; c.set('ceiling', 'sky'); c.set('aquarium', 'digital'); c.placeInView('leafpanel'); c.placeInView('tablet'); for (const g of ['acousticPanels', 'acousticFront', 'softClose', 'dampers', 'lineClips', 'ceilingTray', 'staffPanel', 'patientWall', 'workstation', 'bedsideCabinet', 'ceilingSensors', 'cableChannels']) c.set(g, 'on'); document.getElementById('objectCard').hidden = true; }")
        views = pg.evaluate("window.__config.views()")
        missed, wrong, covered, stray = [], [], [], []
        for f in feats:
            if not f["own"]:
                continue  # a feature made of parts, like the nature display: its parts are what's clicked
            pg.evaluate(f"window.__config.set('tvplay', '{'on' if f['id'] == 'tvScene' else 'off'}')")
            pg.evaluate(f"window.__config.set('scene', '{'forest' if f['id'] == 'transformEnvironment' else 'off'}')")  # a scene's picture is there only while one is chosen
            # a wardrobe compartment is there only while its door is open: the clothes are behind the right, the rest the left
            side = ("right" if f["id"] == "wardrobeClothing" else "left") if f["parent"] == "wardrobe" else None
            pg.evaluate("s => window.__config.wardrobe(s)", side)
            point = None
            for v in ["overview", *[x for x in views if x not in ("overview", "patient", "bathroom")]]:
                pg.evaluate(f"window.__config.camera('{v}', {{ instant: true }})")
                point = pg.evaluate(f"window.__config.featurePoint('{f['id']}')")
                if point:
                    break
            if not point and pg.evaluate(f"window.__config.frameFeature('{f['id']}')"):  # no view shows it: stand in front of it, as its demo does
                point = pg.evaluate(f"window.__config.featurePoint('{f['id']}')")
            if not point:
                missed.append(f["id"])
                continue
            pg.mouse.click(point["x"], point["y"])
            pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
            c, inside, over = card_on_top(pg)
            if c["feature"] != f["id"] or c["title"] != f["name"] or not c["evidence"].startswith("Evidence") or (not c["how"]) or "Benefit" not in c["facts"]:
                wrong.append((f["id"], c["feature"], c["title"]))
            if over or not inside:
                covered.append((f["id"], over, c["rect"]))
            if pg.evaluate(MOVING):
                stray.append(f["id"])
            pg.keyboard.press("Escape")
            if not gone(pg, "#objectCard") or pg.evaluate("document.activeElement.id") != "c":
                wrong.append((f["id"], "Esc"))
            if f["id"] in ("circadian", "wardrobe"):
                shot(pg, f"{room.lower()}_feature_{f['id']}")
        pg.evaluate("window.__config.wardrobe(null)")
        check(not missed, f"{room}: every feature can be clicked in the room, from one of its views {missed}")
        check(not wrong, f"{room}: a click opens that feature's card, with How it works, its benefit and its evidence, and Esc closes it and gives focus back to the room {wrong[:3]}")
        check(not covered, f"{room}: no card covers the mode bar or a notice, and each fits the window {covered[:2]}")
        check(not stray, f"{room}: opening a card starts no placing or dragging {stray}")
        # the same cards by keyboard, from the panel's Features list
        pg.evaluate("document.getElementById('featuresSection').open = true")
        keyed = []
        for f in feats:
            pg.focus(f"#featureList button[data-feature='{f['id']}']")
            pg.keyboard.press("Enter")
            pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
            got = pg.evaluate("({ feature: window.__config.card().feature, focus: document.activeElement.id })")
            pg.keyboard.press("Escape")
            back = pg.evaluate("document.activeElement.dataset.feature")
            if got["feature"] != f["id"] or got["focus"] != "objectCard" or back != f["id"] or not gone(pg, "#objectCard"):
                keyed.append((f["id"], got, back))
        check(not keyed, f"{room}: from the Features list, Enter opens each card with focus in it, and Esc gives focus back to the list {keyed[:3]}")
        # every demo puts the room back exactly: its choices, link, mode, time, view, doors and screens. W1 waits through each
        # step as a visitor would; W3 runs every step without the reading time
        pg.evaluate("() => { const c = window.__config; c.set('ceiling', 'plain'); c.set('aquarium', 'none'); c.set('tvplay', 'off'); c.set('scene', 'off'); for (const g of ['acousticPanels', 'acousticFront', 'softClose', 'dampers']) c.set(g, 'off'); c.camera('overview', { instant: true }); }")
        pg.wait_for_function("!window.__config.fading()", timeout=60000)  # the last card's scene has gone, and its light with it
        drawn(pg)
        bad = []
        demos = [(x["id"], None) for x in feats if x["demo"]] + [("wardrobe", "View storage compartments"), ("wardrobe", "Compare with the old wardrobe")]
        for fid, menu in demos:
            f = next(x for x in feats if x["id"] == fid)
            before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), hash: location.hash.slice(3) })")
            seen, frozen, ended = run_demo(pg, f["id"], skip=room != ROOMS[0], menu=menu)
            pg.wait_for_function("!window.__config.state().moving", timeout=60000)
            after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), hash: location.hash.slice(3), focus: document.activeElement.dataset.feature })")
            diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k]]
            held = all(x["code"] == before["code"] and x["selected"] == before["fp"]["selected"] for x in frozen)
            if not (ended and seen["bar"] and not seen["card"] and held and not diff and after["code"] == before["code"] and after["focus"] == f["id"]):
                bad.append((f["id"], menu, ended, seen, held, diff[:4], after["focus"]))
        check(not bad, f"{room}: every demo runs to its end with its caption up and the card out of the way, changes no choice or link while it runs, and puts the room back exactly, with focus back on its button {bad[:2]}")
    # stopping: Esc, Stop, taking the view, or Emergency
    go(pg, ROOMS[0])
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    before = pg.evaluate("window.__config.fingerprint()")
    pg.evaluate("document.getElementById('featuresSection').open = true")
    pg.click("#featureList button[data-feature='circadian']")
    pg.click("#featureDemo")
    pg.wait_for_function("window.__config.demo() && window.__config.demo().waiting", timeout=60000)
    pg.keyboard.press("Escape")
    after = pg.evaluate("window.__config.fingerprint()")
    check(not pg.evaluate("window.__config.demo()") and after == before and "Demo stopped" in pg.inner_text("#announce") and pg.is_hidden("#demoBar"),
          "Esc stops a demo partway, says so, and the room is back exactly")
    pg.click("#featureList button[data-feature='privacy']")
    pg.click("#featureDemo")
    pg.wait_for_function("window.__config.demo() && window.__config.demo().at >= 1", timeout=60000)
    pg.click("#demoStop")
    pg.wait_for_function("!window.__config.state().moving && !window.__config.mode().easing", timeout=60000)
    check(not pg.evaluate("window.__config.demo()") and pg.evaluate("window.__config.fingerprint()") == before and pg.evaluate("document.activeElement.dataset.feature") == "privacy",
          "Stop does the same from its button, Privacy mode and smart glass included, and focus goes back to the feature's button")
    pg.click("#featureList button[data-feature='orientation']")
    pg.click("#featureDemo")
    pg.wait_for_function("window.__config.demo() && window.__config.demo().waiting", timeout=60000)
    pg.mouse.move(500, 420); pg.mouse.down(); pg.mouse.up()  # a press on the room, without a drag: the camera stays put
    after = pg.evaluate("window.__config.fingerprint()")
    # the link holds the view too (its third character), and the visitor keeps the view they took
    keep = lambda fp: {**{k: v for k, v in fp.items() if k not in ("eye", "target", "view", "live")}, "live": fp["live"][:2] + fp["live"][3:]}  # noqa: E731
    check(not pg.evaluate("window.__config.demo()") and keep(after) == keep(before), f"taking the view in hand ends a demo: the room goes back and the camera stays with the visitor {[(k, before[k], after.get(k)) for k in keep(before) if before[k] != after.get(k)][:3]}")
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    pg.click("#featureList button[data-feature='daylightSensor']")
    pg.click("#featureDemo")
    pg.wait_for_function("window.__config.demo() !== null", timeout=10000)
    pg.click(".mode-bar button[data-mode='emergency']")
    m = pg.evaluate("window.__config.mode()")
    check(not pg.evaluate("window.__config.demo()") and m["current"] == "emergency" and pg.evaluate("window.__config.fingerprint().selected") == before["selected"],
          "Emergency ends a demo at once, and the room's choices are as they were")
    pg.click("#featureList button[data-feature='wardrobe']")
    pg.click("#featureDemo")
    check(not pg.evaluate("window.__config.demo()") and "Not during Emergency mode" in pg.inner_text("#featureStatus"), "no demo starts during Emergency mode, and the card says why")
    pg.keyboard.press("Escape")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    # Explore features: a mark on everything registered, by group, and each mark opens its card
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    pg.click("#exploreToggle")
    drawn(pg)
    ex = pg.evaluate("window.__config.explore()")
    present = {f["id"] for f in pg.evaluate("window.__config.features()") if f["present"] and f["id"] != "nature"}
    marked = {m_["id"] for m_ in ex["markers"]}
    check(ex["on"] and len(marked) >= 5 and marked <= present and "explore" in pg.evaluate("window.__config.highlight().on"),
          f"Explore features marks the registered objects in view and outlines them {sorted(marked)}")
    shot(pg, "w1_explore_features")
    pg.click("#exploreFilters button[data-group='light']")
    drawn(pg)
    light = {m_["id"] for m_ in pg.evaluate("window.__config.explore().markers")}
    check(light and all(names[i] and next(f for f in feats if f["id"] == i)["group"] == "light" for i in light), f"its Light filter marks only light features {sorted(light)}")
    pg.click("#exploreFilters button[data-group='']")
    drawn(pg)
    mk = next(m_ for m_ in pg.evaluate("window.__config.explore().markers") if m_["id"] == "wardrobe")
    pg.mouse.click(mk["x"], mk["y"])
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    check(pg.evaluate("window.__config.card().feature") == "wardrobe" and not pg.evaluate(MOVING), "a mark opens its feature's card, and starts nothing under it")
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "#objectCard") + axe_faults(pg, ".explore-row")
    check(not faults, f"axe finds no serious faults in a feature card or Explore's controls {faults[:4]}")
    pg.keyboard.press("Escape")
    pg.click("#exploreToggle")
    check(not pg.evaluate("window.__config.explore().markers") and pg.is_hidden("#featureMarkers") and "explore" not in pg.evaluate("window.__config.highlight().on"), "Explore features off: the marks and outlines go")
    # hover: the feature under the pointer is outlined, for one draw, and moving within it draws nothing
    pg.evaluate("window.__config.camera('bed', { instant: true })")
    pg.wait_for_function("!window.__config.state().moving", timeout=60000)
    drawn(pg)
    pt = pg.evaluate("window.__config.featurePoint('orientation')")
    # a second point on the same feature, a few pixels away, to move to without leaving it
    pt2 = pg.evaluate("""p => { for (const [dx, dy] of [[3, 0], [-3, 0], [0, 3], [0, -3], [3, 3], [-3, -3]]) if (window.__config.featureAt(p.x + dx, p.y + dy) === 'orientation') return { x: p.x + dx, y: p.y + dy }; return null; }""", pt)
    start = pg.evaluate("window.__config.frames()")
    pg.mouse.move(pt["x"], pt["y"])
    pg.wait_for_function("window.__config.highlight().hover === 'orientation'", timeout=10000)
    drawn(pg)
    one = pg.evaluate("window.__config.frames()") - start
    check(pt2 is not None, "the TV has a second point a few pixels from the first")
    pg.mouse.move(pt2["x"], pt2["y"])
    pg.wait_for_timeout(1500)
    two = pg.evaluate("window.__config.frames()") - start
    check(1 <= one <= 2 and two == one and pg.evaluate("document.getElementById('c').classList.contains('over-feature')"), f"hovering a feature outlines it for one draw, and moving within it draws nothing more ({one}, {two})")
    pg.mouse.move(5, 790)
    pg.wait_for_function("window.__config.highlight().hover === null", timeout=10000)
    # the old link opens the same room as before the cards, and nothing asked for a microphone
    pg.goto("about:blank")
    pg.goto(URL + "#c=" + OLD_LINK)
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    check(pg.evaluate("window.__config.code()").startswith(OLD_LINK), "the link from before the cards opens the same room")
    check(not errs, f"feature cards: no errors {errs[:3]}")
    ctx.close()
    # Low graphics keeps every part of it: the outline, the marks and the cards
    ctx, pg, errs, _, _ = open_page(b, 1100, 720, query="?tier=low")
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    pg.click("#exploreToggle")
    drawn(pg)
    ex = pg.evaluate("window.__config.explore()")
    check(pg.evaluate("window.__config.quality().tier") == "low" and len(ex["markers"]) >= 5 and "explore" in pg.evaluate("window.__config.highlight().on"), f"on Low the marks and outlines are all there ({len(ex['markers'])})")
    shot(pg, "w1_explore_low")
    check(not errs, f"feature cards on Low: no errors {errs[:3]}")
    ctx.close()
    # a phone: Explore is on screen, a mark opens a card that fits, and a card from the Features list gives the sheet back
    ctx, pg, errs, _, _ = open_page(b, 390, 844, query="?tier=low", has_touch=True, is_mobile=True)
    r = pg.evaluate("(() => { const r = document.getElementById('exploreToggle').getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height }; })()")
    check(r["l"] >= 0 and r["r"] <= 390 and r["b"] <= 844 and r["h"] >= 40, f"phone: Explore features is on screen and a finger's size {r}")
    pg.tap("#exploreToggle")
    pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
    drawn(pg)
    mk = pg.evaluate("window.__config.explore().markers")
    check(len(mk) >= 3, f"phone: the marks show ({len(mk)})")
    # a mark the bars above the room don't cover: the one a finger would reach
    free = pg.evaluate("ms => ms.filter(m => document.elementFromPoint(m.x, m.y)?.dataset?.feature === m.id)", mk)
    check(len(free) >= 2, f"phone: most marks are clear of the bars above the room ({len(free)} of {len(mk)})")
    pg.touchscreen.tap(free[0]["x"], free[0]["y"])
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    c, inside, over = card_on_top(pg)
    over_x = pg.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
    check(inside and not over and over_x <= 0, f"phone: a card fits the screen and covers neither the mode bar nor a notice {c['rect']} {over}")
    shot(pg, "phone_feature_card")
    pg.tap("#closeObjectCard")
    pg.tap("#sheet")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')")
    pg.evaluate("document.getElementById('featuresSection').open = true")
    pg.locator("#featureList button[data-feature='wardrobe']").scroll_into_view_if_needed()
    pg.tap("#featureList button[data-feature='wardrobe']")
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    c, inside, over = card_on_top(pg)
    check(inside and not pg.evaluate("document.getElementById('panel').classList.contains('open')"), "phone: a card from the Features list closes the sheet, so it has room")
    pg.tap("#closeObjectCard")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')", timeout=10000)
    check(pg.evaluate("document.activeElement.dataset.feature") == "wardrobe", "phone: closing it brings the sheet back, with focus on the feature's button")
    check(pg.evaluate("window.__mic || 0") == 0 and not errs, f"phone, feature cards: no errors, and no microphone {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the wardrobe explains itself: its doors, its compartments, and the wardrobe it replaced
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    WSTATE = "(() => { const f = window.__config.fingerprint(); return { side: f.wardrobe, old: f.oldWardrobe, moving: window.__config.wardrobeMoving() }; })()"
    # the two wardrobes' sizes, as their code builds them: the built-in one's ends (addons.js, wardrobe()) and the
    # freestanding one's boxes before PR #47 (git show eff8931^:scripts/site/configurator/addons.js), 1 m wide in W1's niche
    SIZES = {"W1": {"now": (13.727 - 12.62, 31.607 - 30.97), "before": (1.0, 0.6375)}, "W3": {"now": (7.83 - 6.53, 22.305 - 21.68), "before": (1.355, 0.6375)}}
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.camera('overview', { instant: true })")
        pg.evaluate("document.getElementById('featuresSection').open = true")
        pg.click("#featureList button[data-feature='wardrobe']")
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        pg.click("#featureMenuToggle")
        menu = pg.evaluate("[...document.querySelectorAll('#featureMenuList button')].map(b => b.textContent)")
        check(menu == ["Learn about this design", "Open cabinet", "View storage compartments", "Compare with the old wardrobe"] and pg.inner_text("#featureDemo") == "See how it works",
              f"{room}: the wardrobe's card has See how it works and its four actions in a short menu {menu}")
        pg.click("#featureMenuList button:text-is('Learn about this design')")
        check(pg.evaluate("document.getElementById('featureHow').open && document.activeElement === document.querySelector('#featureHow summary')") and "one side opens at a time" in pg.inner_text("#featureHowText"),
              f"{room}: Learn about this design opens How it works and takes focus there")
        # Open cabinet: the left door slides behind the right, eased, and stops; the light inside comes on
        pg.evaluate("window.__config.frameFeature('wardrobe')")
        pg.click("#featureMenuList button:text-is('Open cabinet')")
        moving = pg.evaluate(WSTATE)
        pg.wait_for_function("!window.__config.wardrobeMoving()", timeout=30000)
        st = pg.evaluate(WSTATE)
        check(moving["moving"] and st["side"] == "left" and pg.inner_text("#featureMenuList button:nth-child(2)") == "Close cabinet", f"{room}: Open cabinet slides the left door open over a moment, then it stops, and the button says Close cabinet {moving} {st}")
        present = {f["id"] for f in pg.evaluate("window.__config.features()") if f["present"]}
        check({"wardrobeEssentials", "wardrobeValuables", "wardrobeBelongings", "wardrobeLighting", "wardrobeDoors"} <= present and "wardrobeClothing" not in present,
              f"{room}: with the left side open, its compartments are there to click, and the clothes behind the right door aren't {sorted(p for p in present if p.startswith('wardrobe'))}")
        pg.keyboard.press("Escape")
        shot(pg, f"{room.lower()}_wardrobe_left")
        names_ = {f["id"]: f["name"] for f in pg.evaluate("window.__config.features()")}
        wrong = []
        for side, parts in (("left", ["wardrobeEssentials", "wardrobeValuables", "wardrobeBelongings", "wardrobeLighting"]), ("right", ["wardrobeClothing", "wardrobeDoors"])):
            pg.evaluate("s => window.__config.wardrobe(s)", side)
            for pid in parts:
                pg.evaluate(f"window.__config.frameFeature('{pid}')")
                pt = pg.evaluate(f"window.__config.featurePoint('{pid}')")
                if not pt:
                    wrong.append((pid, "not clickable"))
                    continue
                pg.mouse.click(pt["x"], pt["y"])
                pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
                c = pg.evaluate("window.__config.card()")
                if c["feature"] != pid or c["title"] != names_[pid] or c["kicker"] != "Part of Built-in sliding wardrobe":
                    wrong.append((pid, c["feature"], c["kicker"]))
                pg.keyboard.press("Escape")
            if side == "right":
                shot(pg, f"{room.lower()}_wardrobe_right")
        check(not wrong, f"{room}: each compartment, the light and the doors open their own card, as a part of the wardrobe {wrong[:3]}")
        # closed, the doors are the wardrobe: a click on them opens its card, not the doors'
        pg.evaluate("window.__config.wardrobe(null)")
        pg.evaluate("window.__config.frameFeature('wardrobe')")
        pt = pg.evaluate("window.__config.featurePoint('wardrobe')")
        pg.mouse.click(pt["x"], pt["y"])
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        check(pg.evaluate("window.__config.card().feature") == "wardrobe" and not ({f["id"] for f in pg.evaluate("window.__config.features()") if f["present"]} & {"wardrobeClothing", "wardrobeEssentials", "wardrobeDoors"}),
              f"{room}: with the doors closed the compartments aren't there, and a click on the doors opens the wardrobe's card")
        pg.keyboard.press("Escape")
        # the comparison: the old wardrobe outlined where it stood, and both floor areas from the models' sizes
        fig = pg.evaluate("window.__config.wardrobeFigures()")
        want = SIZES[room]
        ok_sizes = all(abs(fig[k]["width"] - want[k][0]) < 0.001 and abs(fig[k]["depth"] - want[k][1]) < 0.001 for k in ("now", "before"))
        check(ok_sizes, f"{room}: the comparison's sizes are the two models' own ({fig['before']['width']:.3f} x {fig['before']['depth']:.3f} m before, {fig['now']['width']:.3f} x {fig['now']['depth']:.3f} m now)")
        pg.click("#featureList button[data-feature='wardrobe']")
        pg.click("#featureMenuToggle")
        pg.click("#featureMenuList button:text-is('Compare with the old wardrobe')")
        pg.wait_for_function("window.__config.demo() && window.__config.demo().waiting", timeout=60000)
        said, st = pg.inner_text("#demoText"), pg.evaluate(WSTATE)
        areas = [f"{fig['before']['area']:.2f} m²", f"{fig['now']['area']:.2f} m²"]
        more = fig["now"]["area"] > fig["before"]["area"]
        check(st["old"] and all(a in said for a in areas) and ("more" if more else "less") in said and "models' sizes" in said and not re.search(r"\b(sav(es|ed|ing)|frees|freed)\b", said, re.I),  # whole words: "freestanding" is fine
              f"{room}: Compare outlines the old wardrobe and gives both floor areas from the models, {'more' if more else 'less'} floor now, and no claim of space saved: {said}")
        shot(pg, f"{room.lower()}_wardrobe_compare")
        pg.click("#demoStop")
        check(not pg.evaluate(WSTATE)["old"], f"{room}: and the outline goes when the demo does")
    pg.add_script_tag(url=AXE)
    pg.click("#featureList button[data-feature='wardrobe']")
    pg.click("#featureMenuToggle")
    faults = axe_faults(pg, "#objectCard")
    check(not faults, f"axe finds no serious faults in the wardrobe's card with its menu open {faults[:4]}")
    check(not errs, f"the wardrobe: no errors {errs[:3]}")
    ctx.close()
    # with reduced motion the doors don't slide: they're open or closed at once
    ctx, pg, errs, _, _ = open_page(b, 1100, 700, reduced_motion="reduce")
    pg.evaluate("window.__config.wardrobe('left', false)")
    st = pg.evaluate("({ moving: window.__config.wardrobeMoving(), side: window.__config.fingerprint().wardrobe })")
    check(st == {"moving": False, "side": "left"}, f"with reduced motion the doors open at once {st}")
    ctx.close()

    # ---------------------------------------------------------------- Acoustic comfort mode: sources, a sound map, the fittings shown not chosen, the three kinds of notice, and demo sound
    FITS = ["acousticPanels", "acousticFront", "softClose", "dampers"]
    OLD_LINK = "10030010002000000000000000000000000100"  # a link from before the fittings: it must open the same room
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    AC = "window.__config.acoustic()"
    check(pg.evaluate(AC)["sound"] == {"playing": None, "made": False, "cap": 0.12}, "nothing makes sound as the page loads: no sound engine is even made")
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.camera('dollhouse', { instant: true })")
        drawn(pg)
        before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        pg.click("#acousticToggle")
        drawn(pg)
        a = pg.evaluate(AC)
        marks = {m["id"]: m for m in a["marks"]}
        check(a["on"] and a["map"] and a["zone"] and {"monitor", "pumps", "ventilator", "fans", "door", "corridor", "zone", "sensor"} <= set(marks) and sum(m["loudest"] for m in a["marks"]) == 2,
              f"{room}: Acoustic comfort mode labels the six sources, marks the two loudest at the pillow, draws the sound map and quiet zone, and shows a level at the sensor {sorted(marks)}")
        panel = pg.evaluate("({ shown: !document.getElementById('acousticPanel').hidden, options: getComputedStyle(document.getElementById('panel')).visibility, focus: document.activeElement.id, said: document.getElementById('acousticReading').textContent, note: document.getElementById('acousticIllustrative').textContent })")
        check(panel["shown"] and panel["options"] == "hidden" and panel["focus"] == "acousticTitle" and panel["said"].startswith("At the pillow: about") and "made up" in panel["note"] and "Nothing is measured" in panel["note"],
              f"{room}: its panel takes the options panel's place, with focus, a reading at the pillow and the line that every level is made up {panel}")
        check(not any(a["shown"].values()), f"{room}: without fittings, none is shown {a['shown']}")
        shot(pg, f"{room.lower()}_acoustic_without")
        pg.click("#acousticCompare button[data-fittings='with']")
        drawn(pg)
        w = pg.evaluate(AC)
        check(all(w["shown"].values()) and w["reading"]["pillow"] < a["reading"]["pillow"] and "made-up difference" in pg.inner_text("#acousticReading") and "acoustic" in pg.evaluate("window.__config.highlight().on"),
              f"{room}: with fittings, all four are shown and outlined, the pillow is quieter, and the panel says the difference is made up ({a['reading']['pillow']:.1f} -> {w['reading']['pillow']:.1f} dBA)")
        wm = {m["id"]: m["text"] for m in w["marks"]}
        check(all("in the room" not in wm[k] for k in ("monitor", "pumps", "ventilator")) and all("in the room" in wm[k] for k in ("door", "corridor")),
              f"{room}: with fittings the patient's kit shows its own level, since no fitting changes a device, and the door and corridor show what reaches the room {wm.get('monitor')} / {wm.get('corridor')}")
        mid = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        check(mid["code"] == before["code"] and mid["fp"]["selected"] == before["fp"]["selected"], f"{room}: the fittings are shown, not chosen: no choice or link changes")
        shot(pg, f"{room.lower()}_acoustic_with")
        # the three kinds of notification
        check(not pg.evaluate("document.getElementById('acousticNotices').open"), f"{room}: the notifications start folded away")
        pg.click("#acousticNotices > summary")
        kinds = pg.evaluate("[...document.querySelectorAll('#acousticNoticeList h3')].map(h => h.textContent)")
        text = pg.inner_text("#acousticNoticeList")
        check(kinds == ["Critical alarms", "Routine notifications", "Environmental notices"] and "no control" in text and "Nothing here changes that" in text and "Staff acknowledge" in text,
              f"{room}: it lists three kinds of notification: critical alarms out of its control, routine ones as they are, and its own notices for staff {kinds}")
        pg.click("#acousticNoticeList button:text-is('Show an example')")
        check(pg.is_visible("#criticalExample") and "never sounded" in pg.inner_text("#criticalExample"), f"{room}: a critical alarm example is shown, and never sounded")
        pg.click("#criticalClose")
        pg.click("#acousticNoticeList button:text-is('Raise it') >> nth=0")
        check(pg.is_visible("#envNotice") and pg.evaluate("document.activeElement.id") == "envAck", f"{room}: an environmental notice is raised, with focus on Acknowledge")
        pg.click("#envAck")
        check(pg.is_hidden("#envNotice"), f"{room}: and staff acknowledge it")
        pg.add_script_tag(url=AXE)
        faults = axe_faults(pg, "#acousticPanel") + axe_faults(pg, ".explore-row")
        check(not faults, f"{room}: axe finds no serious faults in the mode's panel {faults[:4]}")
        # leaving puts the room back exactly
        pg.click("#acousticClose")
        drawn(pg)
        after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), focus: document.activeElement.id, options: getComputedStyle(document.getElementById('panel')).visibility })")
        diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k]]
        check(not diff and after["code"] == before["code"] and after["focus"] == "acousticToggle" and after["options"] == "visible" and not pg.evaluate(AC)["marks"],
              f"{room}: closing it puts the room back exactly, the options come back, and focus returns to its button {diff[:4]}")
        # idle, it draws nothing
        pg.click("#acousticToggle")
        drawn(pg)
        start = pg.evaluate("window.__config.frames()")
        pg.wait_for_timeout(2500)
        check(pg.evaluate("window.__config.frames()") == start, f"{room}: with the mode on and nothing changing, nothing is drawn")
        pg.keyboard.press("Escape") if pg.evaluate("document.getElementById('acousticPanel').contains(document.activeElement)") else pg.click("#acousticClose")
        check(not pg.evaluate(AC)["on"], f"{room}: Esc in its panel closes it")
    # demo sound: off until asked; heard without and then with the fittings, with everything heard also shown; it stops on Esc,
    # a hidden tab, a notice, an alarm example, the sound sensor's notice and Emergency; never a microphone
    go(pg, ROOMS[0])
    pg.evaluate("window.__config.camera('family', { instant: true })")
    pg.click("#acousticToggle")
    check(pg.evaluate(AC)["sound"]["made"] is False, "opening the mode makes no sound")
    pg.click("#playSound")
    s1 = pg.evaluate(f"({{ s: {AC}.sound, caption: document.getElementById('soundCaption').textContent, mute: !document.getElementById('muteSound').hidden, focus: document.activeElement.id, with: {AC}.with }})")
    check(s1["s"]["playing"] == "noisy" and s1["caption"].startswith("Demo sound") and "Illustrative" in s1["caption"] and s1["mute"] and s1["focus"] == "muteSound" and not s1["with"],
          f"Play demo sound starts the noisy room without the fittings, says Demo sound on screen, and Mute demo sound is in view with focus {s1}")
    pg.wait_for_function(f"{AC}.with === true", timeout=20000)
    # the labels are drawn again for the room with its fittings, and the next sound flashes its own about half a second on
    try:
        pg.wait_for_function("document.querySelectorAll('.acoustic-mark.ping').length > 0", timeout=8000)
    except PlaywrightTimeout:
        pass
    seen = pg.evaluate("({ caption: document.getElementById('soundCaption').textContent, pings: document.querySelectorAll('.acoustic-mark.ping').length })")
    check("with the fittings" in seen["caption"] and "made up" in seen["caption"] and seen["pings"] >= 1, f"then the same room with the fittings, which the map shows too, and each sound's label flashes as it's heard {seen}")
    pg.keyboard.press("Escape")
    check(pg.evaluate(AC)["sound"]["playing"] is None and pg.evaluate(AC)["on"] and pg.is_hidden("#muteSound"), "Esc stops the sound, and the mode stays")
    stops = {}
    for name, act in [
        ("Mute", lambda: pg.click("#muteSound")),
        ("a hidden tab", lambda: pg.evaluate("() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); delete document.hidden; }")),
        ("an environmental notice", lambda: (pg.click("#acousticNotices > summary") if not pg.evaluate("document.getElementById('acousticNotices').open") else None, pg.click("#acousticNoticeList button:text-is('Raise it') >> nth=1"))),
        ("a critical alarm example", lambda: pg.click("#acousticNoticeList button:text-is('Show an example')")),
    ]:
        pg.click("#playSound")
        playing = pg.evaluate(AC)["sound"]["playing"]
        act()
        stops[name] = (playing, pg.evaluate(AC)["sound"]["playing"])
        for b_ in ("#envAck", "#criticalClose"):
            if pg.is_visible(b_):
                pg.click(b_)
    check(all(p0 == "noisy" and p1 is None for p0, p1 in stops.values()), f"the sound stops for Mute, a hidden tab, a notice and an alarm example {stops}")
    pg.click("#acousticNoticeList button:text-is('Raise it') >> nth=2")
    pg.click("#playSound")
    check(pg.evaluate(AC)["sound"]["playing"] is None and "waits" in pg.inner_text("#soundCaption"), "and it won't start while a notice is up")
    pg.click("#envAck")
    # the sound sensor's own notice stops it too
    pg.click("#playSound")
    pt = pg.evaluate("window.__config.featurePoint('soundSensor')")
    pg.mouse.click(pt["x"], pt["y"])
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    pg.click("#objectAction")
    check(pg.is_visible("#vocalNotice") and pg.evaluate(AC)["sound"]["playing"] is None, "the sound sensor's notice stops demo sound: comfort sound never plays over a notice")
    pg.click("#vocalAck")
    pg.click("#restfulSound")
    check(pg.evaluate(AC)["sound"]["playing"] == "restful" and "restful" in pg.inner_text("#soundCaption"), "Play restful sound plays the restful sound through the same module")
    pg.click(".mode-bar button[data-mode='emergency']")
    check(pg.evaluate(AC)["sound"]["playing"] is None and not pg.evaluate(AC)["on"], "Emergency stops the sound and ends the mode: comfort yields to care")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    # Explore features shows the fittings while it runs, without choosing them
    sel = pg.evaluate("window.__config.selected()")
    pg.click("#exploreToggle")
    fp = pg.evaluate("window.__config.fingerprint()")
    present = {f["id"] for f in pg.evaluate("window.__config.features()") if f["present"]}
    check(all(fp["fittings"]) and set(FITS) <= present and pg.evaluate("window.__config.selected()") == sel, "Explore features shows the acoustic fittings, off as the room loads, without choosing them")
    pg.click("#exploreToggle")
    check(not any(pg.evaluate("window.__config.fingerprint().fittings")), "and they go again when it ends")
    mic = pg.evaluate("window.__mic")
    # the fittings as choices: off by default, so the old link opens the same room, and a chosen one is in the link
    pg.goto("about:blank")
    pg.goto(URL + "#c=" + OLD_LINK)
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    code = pg.evaluate("window.__config.code()")
    check(code.startswith(OLD_LINK) and set(code[len(OLD_LINK):len(OLD_LINK) + 4]) <= {"0"} and not any(pg.evaluate("window.__config.fingerprint().fittings")), f"the old link opens the same room, with every fitting off {code}")
    pg.evaluate("window.__config.set('acousticPanels', 'on')")
    check(pg.evaluate("window.__config.code()")[5 + 33] == "1" and pg.evaluate("window.__config.fingerprint().fittings")[0], "a fitting chosen in the panel is in the link, at its code")
    check(mic == 0 and not errs, f"Acoustic comfort: no errors, and no microphone was ever asked for ({mic}) {errs[:3]}")
    ctx.close()
    # a phone: the mode's panel is a sheet, and the room above it still shows the map
    ctx, pg, errs, _, _ = open_page(b, 390, 844, query="?tier=low", has_touch=True, is_mobile=True)
    pg.tap("#acousticToggle")
    drawn(pg)  # its entrance has finished
    r = pg.evaluate("(() => { const p = document.getElementById('acousticPanel').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, left: p.left, right: p.right, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()")
    check(r["left"] >= 0 and r["right"] <= 390 and r["bottom"] <= 844.5 and r["top"] > 844 * 0.4 and r["over"] <= 0, f"phone: the mode's panel is a sheet at the bottom, and nothing scrolls sideways {r}")
    shot(pg, "phone_acoustic")
    check(not errs, f"phone, Acoustic comfort: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- patient states and the bedside screens: sedated, awake, recovering; the board, the passport, family and staff's view
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    PS = "window.__config.patientState()"
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.set('tvplay', 'on'); window.__config.camera('overview', { instant: true })")
        drawn(pg)
        before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        check(pg.evaluate(PS)["state"] == "awake" and pg.evaluate("document.querySelector('#patientBar button[aria-pressed=\"true\"]').dataset.state") == "awake" and pg.is_hidden("#patientNote"),
              f"{room}: the patient starts awake, which is the room as configured")
        pg.click("#patientBar button[data-state='sedated']")
        easing = pg.evaluate(PS)["easing"]
        pg.wait_for_function(f"!{PS}.easing", timeout=60000)
        sed = pg.evaluate(f"({{ ps: {PS}, fp: window.__config.fingerprint(), code: window.__config.code(), note: document.getElementById('patientNote').textContent }})")
        check(easing and sed["ps"]["look"] and sed["fp"]["tv"] == "off" and "positioning reminder" in sed["note"], f"{room}: Sedated eases to steady light by the time of day and turns the TV's entertainment off {sed['ps']['look']}")
        check(sed["code"] == before["code"] and sed["fp"]["selected"] == before["fp"]["selected"], f"{room}: a patient state changes no choice or link")
        shot(pg, f"{room.lower()}_patient_sedated")
        pg.click("#modeBar button[data-mode='clinical']")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        m = pg.evaluate("window.__config.mode()")
        check(m["look"] and m["look"]["level"] == 1 and m["look"]["kelvin"] == 4000, f"{room}: Clinical mode is the staff override: full neutral light over the sedated state {m['look']}")
        pg.click("#modeBar button[data-mode='standard']")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        check(pg.evaluate(PS)["state"] == "sedated" and pg.evaluate("window.__config.mode().look") is None, f"{room}: and back in As set, the patient is still sedated")
        pg.click("#patientBar button[data-state='recovering']")
        pg.wait_for_function(f"!{PS}.easing", timeout=60000)
        rec = pg.evaluate("({ fp: window.__config.fingerprint(), o: window.__config.orientation() })")
        check(rec["fp"]["tv"] == "orientation" and rec["o"] and "Today's goal: sit in the chair for a while" in rec["o"], f"{room}: Recovering puts the orientation screen first, with a recovery note {rec['o'][5:] if rec['o'] else None}")
        pg.click("#patientBar button[data-state='awake']")
        pg.wait_for_function(f"!{PS}.easing", timeout=60000)
        drawn(pg)
        after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k]]
        check(not diff and after["code"] == before["code"], f"{room}: back to Awake, the room is exactly as configured {diff[:4]}")
        # a design change puts the patient back to Awake, as it puts a mode back to As set
        pg.click("#patientBar button[data-state='sedated']")
        pg.evaluate("window.__config.set('tvplay', 'off')")
        check(pg.evaluate(PS)["state"] == "awake", f"{room}: changing the room's design puts the patient back to Awake")
        set_defaults(pg)
    # the communication board: touch, a switch that steps, and gaze by dwell; each request listed with the time until acknowledged
    pg.click("#openBedside")
    bs = pg.evaluate("({ b: window.__config.bedside(), focus: document.activeElement.id, options: getComputedStyle(document.getElementById('panel')).visibility })")
    check(bs["b"]["open"] and bs["focus"] == "bedsideTitle" and bs["options"] == "hidden" and bs["b"]["board"] == ["I need help", "I am in pain", "I feel cold", "I feel hot", "I need repositioning", "I want to contact my family", "I need a nurse", "I need water", "I can't sleep", "I need help communicating", "I would like some privacy"] and all(a and a[0] and a[1] == "rtl" for a in bs["b"]["arabic"]),
          f"Bedside screens open in the options panel's place, with focus, on the board's seven requests, three more and a privacy request, each with its Arabic, right to left {bs['b']['board']}")
    pg.click(".board-button[data-request='pain']")
    req = pg.evaluate("window.__config.bedside().requests")
    now = pg.evaluate("document.getElementById('timeNow').textContent")
    check(len(req) == 1 and req[0]["label"] == "I am in pain" and req[0]["time"] == now, f"touch: a request goes to the nurse-side list with the room's time {req} {now!r}")
    pg.click(".board-inputs button[data-input='switch']")
    check(pg.is_visible(".switch-press") and pg.evaluate("window.__config.bedside().scanning"), "a single switch: the highlight steps through the requests")
    pg.wait_for_function("document.querySelector('.board-button.scan')?.dataset.request === 'cold'", timeout=30000)
    pg.click(".switch-press")
    check([r["id"] for r in pg.evaluate("window.__config.bedside().requests")] == ["pain", "cold"] and not pg.evaluate("window.__config.bedside().scanning"), "pressing the switch chooses the lit request")
    pg.click(".switch-press")
    pg.wait_for_function("!window.__config.bedside().scanning", timeout=60000)
    check("paused" in pg.inner_text("#pane-board"), "and with no press, scanning pauses after two rounds: nothing runs for ever")
    pg.click(".board-inputs button[data-input='gaze']")
    pg.hover(".board-button[data-request='nurse']")
    pg.wait_for_function("window.__config.bedside().requests.some(r => r.id === 'nurse')", timeout=10000)
    check(True, "gaze: a look held on a request chooses it")
    for _ in range(3):
        pg.click(".requests li button")
    check(not pg.evaluate("window.__config.bedside().requests") and "No requests waiting" in pg.inner_text("#pane-board"), "each request stays until a nurse acknowledges it")
    check("does not replace a certified nurse-call system" in pg.inner_text("#pane-board"), "the board says it doesn't replace a certified nurse-call system")
    pg.add_script_tag(url=AXE)
    faults = axe_faults(pg, "#bedside") + axe_faults(pg, "#patientBar")
    # the passport: preferences and the care team's settings apart, how each is used in each state, saved in this browser
    pg.click("#bedsideTabs button[data-tab='passport']")
    table = pg.evaluate("[...document.querySelectorAll('.apply-table tbody tr')].map(r => [r.cells[0].textContent, ...[...r.cells].slice(1).map(c => c.dataset.apply)])")
    temp = next(r for r in table if r[0] == "Temperature")
    check(len(table) == 8 and temp[1:] == ["held", "held", "held"] and "Set by the care team" in pg.inner_text("#pane-passport") and "Alarm limits" in pg.inner_text("#pane-passport"),
          f"the passport shows eight preferences, the care team's settings apart, and temperature held back in every state {temp}")
    pg.select_option("#pp-light", "bright")
    pg.click("#pane-passport button:text-is('Save in this browser')")
    stored = pg.evaluate("localStorage.getItem('adaptiveIcu.passport')")
    check(stored and json.loads(stored)["light"] == "bright" and "this browser only" in pg.inner_text("#pane-passport"), "Save keeps it in this browser only")
    mic_before = pg.evaluate("window.__mic")
    pg.reload()
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    pg.add_script_tag(url=AXE)  # the reload took it away, and the microphone counter with it
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    pg.evaluate("window.__config.openBedside('passport')")
    check(pg.eval_on_selector("#pp-light", "s => s.value") == "bright", "and it's there after a reload")
    pg.click("#pane-passport button:text-is('Restore the sample')")
    check(pg.eval_on_selector("#pp-light", "s => s.value") == "warm" and pg.evaluate("localStorage.getItem('adaptiveIcu.passport')") is None, "Restore the sample puts the sample back and removes what was saved")
    faults += axe_faults(pg, "#bedside")
    # family connection: for a sedated patient only what staff allow; music as demo sound, off until pressed; Quiet now
    pg.evaluate("window.__config.setPatientState('sedated', { instant: true })")
    pg.click("#bedsideTabs button[data-tab='family']")
    disabled = pg.evaluate("[...document.querySelectorAll('#pane-family .family-list li')].map(li => [li.querySelector('strong').textContent, li.querySelector('button')?.disabled ?? null])")
    check(dict(disabled)["Video call"] and dict(disabled)["Familiar music"] and dict(disabled)["Voice message"] is False, f"sedated: the call and music wait until staff allow them; the message is allowed {disabled}")
    pg.check("#allow-music")
    check(pg.evaluate("window.__config.acoustic().sound.made") is False, "allowing music plays nothing")
    pg.click("#familyMusic")
    s1 = pg.evaluate("({ s: window.__config.acoustic().sound, label: document.getElementById('familyMusic').textContent, cap: document.querySelector('#pane-family [role=status]').textContent })")
    check(s1["s"]["playing"] == "music" and s1["label"] == "Mute demo sound" and "Demo sound" in s1["cap"] and "not a recording" in s1["cap"], f"Play familiar music plays it as demo sound, with Mute where Play was and words on screen {s1['label']}")
    pg.check("#allow-scene")
    pg.click("#pane-family button:text-is('Show on the TV')")
    check(pg.evaluate("window.__config.fingerprint().tv") == "on", "the personal scene goes on the TV")
    pg.check("#quietNow")
    q = pg.evaluate("({ ps: window.__config.patientState(), tv: window.__config.fingerprint().tv, sound: window.__config.acoustic().sound.playing, any: [...document.querySelectorAll('#pane-family .family-list button')].some(b => !b.disabled) })")
    check(q["ps"]["quiet"] and q["tv"] == "off" and q["sound"] is None and not q["any"], f"Quiet now turns everything off, sound included, until staff turn it off {q}")
    pg.uncheck("#quietNow")
    pg.click("#bedsideTabs button[data-tab='staff']")
    staff = pg.inner_text("#pane-staff")
    check("Positioning assessment due" in staff and "Nothing here moves a patient" in staff and "dBA" in staff and "illustrative" in staff, "staff see the positioning reminder, line status and noise, all simulated")
    pg.click("#pane-staff button:text-is('Dismiss')")
    check("dismissed" in pg.inner_text("#pane-staff"), "and staff dismiss the reminder")
    faults += axe_faults(pg, "#bedside")
    check(not faults, f"axe finds no serious faults in the bedside screens or the Patient bar {faults[:4]}")
    pg.keyboard.press("Escape")
    check(not pg.evaluate("window.__config.bedside().open") and pg.evaluate("getComputedStyle(document.getElementById('panel')).visibility") == "visible", "Esc closes the bedside screens and gives the options back")
    # they open from the tablet arm, the TV and the window, as well as the panel, and never need an item placed
    pg.evaluate("window.__config.setPatientState('awake', { instant: true })")
    for fid, tab in (("communicationBoard", "board"), ("comfortPassport", "passport"), ("orientation", "family")):
        pg.evaluate("document.getElementById('featuresSection').open = true")
        pg.click(f"#featureList button[data-feature='{fid}']")
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
        btn = pg.evaluate("[...document.querySelectorAll('#objectCard .object-actions button, #featureMenuList button')].filter(b => b.offsetParent && /^Open (the communication board|the comfort passport|family connection)$/.test(b.textContent)).map(b => b.textContent)")
        if not btn:
            pg.click("#featureMenuToggle")
            btn = pg.evaluate("[...document.querySelectorAll('#featureMenuList button')].filter(b => b.offsetParent).map(b => b.textContent)")
        pg.click(f"#objectCard button:text-is('{btn[0]}')")
        check(pg.evaluate("window.__config.bedside()")["open"] and pg.evaluate("window.__config.bedside().tab") == tab, f"{fid}'s card opens the {tab} screen, with nothing placed ({btn[0]})")
        pg.keyboard.press("Escape")
    pg.evaluate("window.__config.placeInView('tablet')")
    pg.keyboard.press("Escape")
    pt = pg.evaluate("window.__config.featurePoint('communicationBoard')")
    if pt:
        pg.mouse.click(pt["x"], pt["y"])
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    c = pg.evaluate("window.__config.card()")
    check(pt and c["feature"] == "communicationBoard" and "Turn 45°" in c["buttons"] and "Remove" in c["buttons"], f"a placed tablet arm opens the board's card and keeps Turn and Remove {c['buttons']}")
    mic = mic_before + pg.evaluate("window.__mic")
    check(mic == 0 and not errs, f"patient states: no errors, and no microphone ({mic}) {errs[:3]}")
    ctx.close()
    # a phone: the Patient bar fits, and the bedside screens are a sheet
    ctx, pg, errs, _, _ = open_page(b, 390, 844, query="?tier=low", has_touch=True, is_mobile=True)
    r = pg.evaluate("(() => { const b = document.getElementById('patientBar').getBoundingClientRect(); return { l: b.left, r: b.right, small: [...document.querySelectorAll('#patientBar button')].filter(x => x.offsetParent && x.getBoundingClientRect().height < 36).length, rows: Math.round(b.height), over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()")
    check(r["l"] >= 0 and r["r"] <= 390 and not r["small"] and r["over"] <= 0 and r["rows"] < 64, f"phone: the Patient bar fits on one row, with targets a finger can hit {r}")
    pg.tap("#sheet")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')")
    pg.locator(".bedside-launch button[data-open='board']").scroll_into_view_if_needed()
    pg.tap(".bedside-launch button[data-open='board']")
    drawn(pg)
    sheet = pg.evaluate("(() => { const p = document.getElementById('bedside').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, l: p.left, r: p.right }; })()")
    check(sheet["l"] >= 0 and sheet["r"] <= 390 and sheet["bottom"] <= 844.5 and sheet["top"] > 300, f"phone: the bedside screens are a sheet at the bottom {sheet}")
    shot(pg, "phone_bedside")
    pg.tap("#bedsideClose")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')", timeout=10000)
    check(pg.evaluate("document.activeElement.dataset.open") == "board", "phone: closing the screens brings the sheet back, with focus where it was")
    check(not errs, f"phone, patient states: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the bed: the pressure map on the mattress, the line clips, each line's slack, and the check before a move
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.evaluate("""() => { window.__mic = 0; const count = () => { window.__mic++; return Promise.reject(new Error('refused by the check')); };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = count; navigator.getUserMedia = count; }""")
    BED = "window.__config.bed()"
    pg.add_script_tag(url=AXE)
    faults = []
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.camera('overview', { instant: true })")
        drawn(pg)
        before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        check(not before["fp"]["clips"] and not before["fp"]["bedMap"] and not before["fp"]["ghost"], f"{room}: as the room loads, the line clips are off and the map hidden")
        pg.locator(".bed-launch button[data-open='pressure']").scroll_into_view_if_needed()
        pg.click(".bed-launch button[data-open='pressure']")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        drawn(pg)
        bd = pg.evaluate(f"({{ b: {BED}, focus: document.activeElement.id, options: getComputedStyle(document.getElementById('panel')).visibility }})")
        check(bd["b"]["open"] and bd["focus"] == "bedTitle" and bd["options"] == "hidden" and bd["b"]["map"] and bd["b"]["ghost"],
              f"{room}: the pressure map opens in the options panel's place, with focus, on the mattress, the patient faint over it")
        check(bd["b"]["marked"] == ["sacrum", "heelR", "heelL"] and bd["b"]["due"] and pg.is_visible(".bed-reminder"),
              f"{room}: on the back for 2 h 10 min, the sacrum and heels are marked, and Positioning assessment due shows {bd['b']['marked']}")
        # the map is on screen where the sacrum is: the higher band's red, seen through the faint figure
        pt = pg.evaluate("window.__config.bedPoint('sacrum')")
        img = frame(pg)
        x, y = int(pt["x"]), int(pt["y"])
        patch = img[max(0, y - 4):y + 5, max(0, x - 4):x + 5].reshape(-1, 3)
        red, green_back = int((patch[:, 0] - patch[:, 1]).max()), float(patch[:, 1].mean())
        check(0 < x < 1000 and 0 < y < 820 and red > 30, f"{room}: the map shows on the mattress, red at the sacrum ({x}, {y}): R-G {red}")
        shot(pg, f"{room.lower()}_pressure_map")
        text = pg.inner_text("#bedPanel")
        check("not a measurement" in text and "predicts no injury" in text and "never moves a patient" in text and "don't move" in text and "SIMULATED" in text,
              f"{room}: the panel says it's not a measurement, predicts no injury, never moves a patient, and the bed and figure don't move")
        # time in the position: nothing marked before the plan's interval
        pg.click("#pane-pressure .bed-times button:text-is('15 min')")
        t = pg.evaluate(BED)
        check(not t["marked"] and not t["due"] and pg.is_hidden(".bed-reminder") and "Nothing marked" in pg.inner_text(".bed-marked"), f"{room}: at 15 minutes nothing is marked and no reminder shows")
        pg.click("#pane-pressure .bed-times button:text-is('2 h 10 min')")
        check(pg.evaluate(BED)["due"], f"{room}: past the interval again, the reminder is back")
        # a move asks for the line check first; Esc cancels it, and nothing changes
        pg.click("#bedPositions button[data-position='left']")
        mv = pg.evaluate(f"({{ b: {BED}, focus: document.activeElement.textContent, check: !document.getElementById('bedCheck').hidden }})")
        check(mv["check"] and mv["b"]["pending"] == "left" and mv["b"]["position"] == "back" and mv["focus"] == "Lines checked: show the move",
              f"{room}: choosing a position first asks staff to check the lines, and moves nothing yet {mv['focus']!r}")
        faults += axe_faults(pg, "#bedPanel")
        pg.keyboard.press("Escape")
        cx = pg.evaluate(f"({{ b: {BED}, focus: document.activeElement.dataset.position }})")
        check(cx["b"]["open"] and not cx["b"]["pending"] and cx["b"]["position"] == "back" and cx["focus"] == "left", f"{room}: Esc cancels the move, keeps the panel open and changes nothing")
        pg.click("#bedPositions button[data-position='left']")
        pg.click("#bedCheck .bed-confirm")
        lf = pg.evaluate(BED)
        check(lf["position"] == "left" and lf["minutes"] == 15 and not lf["marked"], f"{room}: once a person confirms the check, the map shows the new position, its time starting again")
        pt = pg.evaluate("window.__config.bedPoint('sacrum')")
        img = frame(pg)
        green_left = float(img[max(0, int(pt["y"]) - 4):int(pt["y"]) + 5, max(0, int(pt["x"]) - 4):int(pt["x"]) + 5].reshape(-1, 3)[:, 1].mean())
        check(green_left - green_back > 20, f"{room}: and on the mattress, the sacrum goes from the higher band to a lighter one (green {green_back:.0f} to {green_left:.0f})")
        pg.click("#pane-pressure .bed-times button:text-is('2 h 10 min')")
        check("hipL" in pg.evaluate(BED)["marked"] and "sacrum" not in pg.evaluate(BED)["marked"], f"{room}: turned left, the left hip takes the weight, and the sacrum is spared {pg.evaluate(BED)['marked']}")
        # staff dismiss the reminder, here or in the staff view: one reminder
        pg.click(".bed-reminder button:text-is('Dismiss')")
        check(not pg.evaluate(BED)["due"] and pg.evaluate("window.__config.bedside().reminder") == "dismissed", f"{room}: staff dismiss the reminder, and the staff view's goes with it")
        faults += axe_faults(pg, "#bedPanel")
        # the lines: the clips shown, not chosen; each line's slack by its clip and in the list
        pg.click("#bedTabs button[data-tab='lines']")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        drawn(pg)
        ln = pg.evaluate(f"({{ b: {BED}, fp: window.__config.fingerprint(), code: window.__config.code(), list: [...document.querySelectorAll('.bed-line')].map(li => [li.dataset.line, li.querySelector('.bed-line-status').textContent]) }})")
        check(ln["fp"]["clips"] and not ln["b"]["map"] and not ln["b"]["ghost"] and ln["code"] == before["code"] and ln["fp"]["selected"] == before["fp"]["selected"],
              f"{room}: Lines shows the clips without choosing them: the link is unchanged, and the map goes")
        check(len(ln["b"]["marks"]) == 5 and all("·" in m["text"] for m in ln["b"]["marks"]) and dict(ln["list"])["ecg"].endswith("Less slack"),
              f"{room}: each of the five lines shows its slack by its clip and in the list {[m['text'] for m in ln['b']['marks']][:2]}")
        check("no tension, force or flow" in pg.inner_text("#pane-lines") and "Nothing here changes a real line, connector or device" in pg.inner_text("#pane-lines"), f"{room}: no force or flow is worked out, and no real line is changed")
        shot(pg, f"{room.lower()}_bed_lines")
        faults += axe_faults(pg, "#bedPanel")
        # closing puts the room back, at the view it was opened from
        pg.click("#bedClose")
        drawn(pg)
        after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), focus: document.activeElement.dataset.open })")
        diff = [k for k in before["fp"] if k != "bed" and before["fp"][k] != after["fp"][k]]
        check(not diff and after["code"] == before["code"] and after["focus"] == "pressure", f"{room}: closing the bed panel puts the room back exactly, focus on what opened it {diff[:4]}")
        pg.evaluate("window.__config.bedPosition('back', 130)")  # the next room starts where the page does
    check(not faults, f"axe finds no serious faults in the bed panel, either tab, or the line check {faults[:4]}")
    # the clips are an option of their own too, off by default: choosing them changes the link and shows them for good
    pg.evaluate("window.__config.set('lineClips', 'on')")
    on = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
    pg.evaluate("window.__config.set('lineClips', 'off')")
    check(on["fp"]["clips"] and on["code"] != pg.evaluate("window.__config.code()"), "the line clips can be chosen under Bed, and then they're in the link")
    # Explore features shows the clips, then takes them away
    pg.click("#exploreToggle")
    ex = pg.evaluate("window.__config.fingerprint().clips")
    pg.click("#exploreToggle")
    check(ex and not pg.evaluate("window.__config.fingerprint().clips"), "Explore features shows the line clips while it's on")
    # the bed's card from the room, and the staff view's links
    pg.evaluate("window.__config.camera('overview', { instant: true })")
    drawn(pg)
    pt = pg.evaluate("window.__config.featurePoint('pressureBed')")
    if pt:
        pg.mouse.click(pt["x"], pt["y"])
        pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    c = pg.evaluate("window.__config.card()")
    check(pt and c["feature"] == "pressureBed" and "Open the pressure map" in c["buttons"], f"clicking the bed opens the pressure-awareness bed's card {c['buttons'] if c else None}")
    pg.click("#objectCard button:text-is('Open the pressure map')")
    check(pg.evaluate(BED)["open"] and pg.evaluate(BED)["tab"] == "pressure", "and its card opens the pressure map")
    pg.keyboard.press("Escape")
    check(not pg.evaluate(BED)["open"], "Esc closes the bed panel")
    pg.evaluate("window.__config.openBedside('staff')")
    pg.click("#pane-staff button:text-is('Open the lines')")
    check(pg.evaluate(BED)["open"] and pg.evaluate(BED)["tab"] == "lines" and not pg.evaluate("window.__config.bedside().open"), "the staff view opens the lines, in the bedside screens' place")
    # Emergency: care comes first, so the bed panel closes and won't open
    pg.click("#modeBar button[data-mode='emergency']")
    em = pg.evaluate(BED)["open"]
    pg.evaluate("window.__config.openBed('pressure')")
    check(not em and not pg.evaluate(BED)["open"], "Emergency closes the bed panel, and it waits until Emergency mode ends")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    # a sedated patient's dismissed reminder comes back
    pg.evaluate("window.__config.openBed('pressure')")
    pg.click("#pane-pressure .bed-times button:text-is('2 h 10 min')")
    pg.click(".bed-reminder button:text-is('Dismiss')")
    pg.evaluate("window.__config.setPatientState('sedated', { instant: true })")
    check(pg.evaluate(BED)["due"], "a reminder staff dismissed comes back when the patient is next sedated")
    pg.evaluate("window.__config.setPatientState('awake', { instant: true }); window.__config.setBed(false)")
    mic = pg.evaluate("window.__mic")
    check(mic == 0 and not errs, f"the bed: no errors, and no microphone ({mic}) {errs[:3]}")
    ctx.close()
    # a phone: the bed panel is a sheet, and closing it brings the options back
    ctx, pg, errs, _, _ = open_page(b, 390, 844, query="?tier=low", has_touch=True, is_mobile=True)
    pg.tap("#sheet")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')")
    pg.locator(".bed-launch button[data-open='pressure']").scroll_into_view_if_needed()
    pg.tap(".bed-launch button[data-open='pressure']")
    drawn(pg)
    sh = pg.evaluate("(() => { const p = document.getElementById('bedPanel').getBoundingClientRect(), m = document.querySelector('.bed-map').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, l: p.left, r: p.right, mapR: m.right, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()")
    check(sh["l"] >= 0 and sh["r"] <= 390 and sh["bottom"] <= 844.5 and sh["top"] > 300 and sh["mapR"] <= 390 and sh["over"] <= 0, f"phone: the bed panel is a sheet at the bottom, its map inside the screen {sh}")
    shot(pg, "phone_bed")
    pg.tap("#bedClose")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')", timeout=10000)
    check(pg.evaluate("document.activeElement.dataset.open") == "pressure", "phone: closing the bed panel brings the sheet back, with focus where it was")
    check(not errs, f"phone, the bed: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the Future ICU look: its theme, five fittings in step with the room, the view across it, and nothing in the way
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    FUTURE = ["ceilingTray", "staffPanel", "patientWall", "workstation", "bedsideCabinet"]
    themes = pg.evaluate("[...document.querySelectorAll('#themes button')].map(b => [b.dataset.value, b.textContent])")
    check(themes[0] == ["future", "Future ICU"], f"Future ICU is the first theme {themes[:2]}")
    check(pg.evaluate("window.__config.currentTheme()") == "calm" and pg.evaluate("window.__config.fittings().shown") == [], "a link with no code still opens today's room, with no fitting")
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.afternoon)")
        code0 = pg.evaluate("window.__config.code()")
        check(code0[5 + 38:5 + 43] == "00000", f"{room}: the five fittings are codes 38 to 42, and off ({code0})")
        pg.click("#themes button[data-value='future']")
        f = pg.evaluate("window.__config.fittings()")
        check(f["shown"] == FUTURE and pg.evaluate("window.__config.code()")[5 + 38:5 + 43] == "11111" and pg.evaluate("window.__config.currentTheme()") == "future",
              f"{room}: Future ICU turns on all five fittings, and the link carries them {f['shown']}")
        # nothing in the way: one check, the one the room safety scan will use
        lay = pg.evaluate("window.__config.layout()")
        mine = [x for x in lay["findings"] if x["fitting"]]
        own = [x for x in lay["findings"] if x["level"] == "overlap" and x["a"].startswith("part:") and x["b"].startswith("part:")]
        other = [x for x in lay["findings"] if x["level"] == "overlap" and x not in own]
        check(all(f"addon:{x}" in lay["solids"] for x in FUTURE) and {"clearRight", "clearLeft", "clearFoot", "route", "wardrobe"} <= set(lay["areas"]) and any(a.startswith("door") for a in lay["areas"]),
              f"{room}: the layout check sees the five fittings, the keep-clear areas, the doors, the wardrobe's front and the route to the bed {lay['areas']}")
        check(not mine, f"{room}: no fitting overlaps anything, or stands in a keep-clear area, a door's way, the wardrobe's front or the route to the bed {mine[:3]}")
        check(not other, f"{room}: with the theme and every fitting on, nothing solid overlaps but the room model's own kit {other[:3]}")
        print(f"  {room}: the room model's own kit overlaps by its boxes, as exported: {[(x['a'][5:], x['b'][5:]) for x in own]}; in the keep-clear areas, as Equipment labels draws them: {sorted({x['a'] for x in lay['findings'] if x['level'] == 'clearance'})}", flush=True)
        # seen: every registered object from at least one view, and the new ones from the view across the room
        present = pg.evaluate("window.__config.features().filter(f => f.present && f.own).map(f => f.id)")
        seen = {fid: pg.evaluate(f"window.__config.seenFrom('{fid}')") for fid in present}
        unseen = [k for k, v in seen.items() if not v]
        check(all(x in present for x in FUTURE) and not unseen, f"{room}: with the theme on, each of the {len(present)} registered objects in the room can be seen from at least one view {unseen}")
        check(all("across" in seen[x] for x in ["ceilingTray", "staffPanel", "patientWall", "workstation"]), f"{room}: the view across the room shows the tray, both wall panels and the workstation {({x: seen[x] for x in FUTURE})}")
        check(not seen["staffPanel"] or "bed" not in seen["staffPanel"], f"{room}: the staff panel is behind the patient's head: the view from the bed doesn't show it")
        # in step: the TV sits on the patient wall's face, the printed sky inside the tray, W1's chair out of the desk's way, and each goes back
        check(f["tvOut"] == 0.035, f"{room}: the TV and its mounts sit on the patient wall's face ({f['tvOut']} m out)")
        pg.evaluate("window.__config.set('ceiling', 'sky')")
        sky_in = pg.evaluate("window.__config.fittings().sky")
        pg.evaluate("window.__config.set('ceilingTray', 'off')")
        sky_out = pg.evaluate("window.__config.fittings().sky")
        check(sky_in and sky_in[0] < 1 and sky_in[1] <= 1 and sky_out == [1, 1], f"{room}: the printed sky fits inside the tray, and takes its own size without it {sky_in} {sky_out}")
        pg.evaluate("window.__config.set('ceiling', 'plain'); window.__config.set('ceilingTray', 'on'); window.__config.set('patientWall', 'off')")
        check(pg.evaluate("window.__config.fittings().tvOut") == 0, f"{room}: without the patient wall, the TV is back on the wall")
        pg.evaluate("window.__config.set('patientWall', 'on')")
        if room == "W1":
            chair_on = pg.evaluate("window.__config.fittings().chair")
            pg.evaluate("window.__config.set('workstation', 'off')")
            chair_off = pg.evaluate("window.__config.fittings().chair")
            pg.evaluate("window.__config.set('workstation', 'on')")
            check(chair_on == [8.82, 29.07] and chair_off != chair_on and abs(chair_off[0] - 9.47) < 0.1, f"W1: the visitor chair moves to the window while the workstation is there, and back after {chair_on} {chair_off}")
        # placed items: a wall item can't hang over the staff panel or the patient wall, only over bare wall
        wall = {"W1": ([11.0, 31.61, 0], [11.6, 27.14, 180]), "W3": ([10.3, 22.388, 0], [10.6, 18.14, 180])}[room]
        over = pg.evaluate(f"[window.__config.wallClear('sharps', {wall[0][0]}, {wall[0][1]}, {wall[0][2]}), window.__config.wallClear('rub', {wall[1][0]}, {wall[1][1]}, {wall[1][2]})]")
        pg.evaluate("window.__config.set('staffPanel', 'off'); window.__config.set('patientWall', 'off')")
        bare = pg.evaluate(f"[window.__config.wallClear('sharps', {wall[0][0]}, {wall[0][1]}, {wall[0][2]}), window.__config.wallClear('rub', {wall[1][0]}, {wall[1][1]}, {wall[1][2]})]")
        pg.click("#themes button[data-value='future']")
        check(over == [False, False] and bare == [True, True], f"{room}: a wall item can't hang over the staff panel or the patient wall, and can on the bare wall {over} {bare}")
        # the view across the room, from the reference picture's angle
        pg.click("#views button[data-value='across']")
        pg.wait_for_function("window.__config.state().view === 'across' && !window.__config.state().moving", timeout=120000)
        check(pressed_view(pg) == ["across"] and pg.evaluate("window.__config.code()")[2] == "9", f"{room}: Across the room is a view, and the link keeps it as the tenth")
        shot(pg, f"{room.lower()}_future_across")
        pg.evaluate("window.__config.time(window.__config.stops.night)")
        shot(pg, f"{room.lower()}_future_across_night")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        pg.click("#views button[data-value='dollhouse']")
        pg.wait_for_function("window.__config.state().view === 'dollhouse' && !window.__config.state().moving", timeout=120000)
        check(not pg.evaluate("window.__config.addonShown('ceilingTray')"), f"{room}: the dollhouse lifts the tray off with the ceiling")
        pg.click("#views button[data-value='overview']")
        pg.wait_for_function("window.__config.state().view === 'overview' && !window.__config.state().moving", timeout=120000)
        check(pg.evaluate("window.__config.addonShown('ceilingTray')"), f"{room}: and puts it back")
        # Before / after shows none of them, and puts them back
        pg.click("#compareToggle")
        cmp_on = pg.evaluate("window.__config.fittings()")
        pg.click("#compareToggle")
        cmp_off = pg.evaluate("window.__config.fittings()")
        check(cmp_on["shown"] == [] and cmp_on["tvOut"] == 0 and cmp_off["shown"] == FUTURE and cmp_off["tvOut"] == 0.035, f"{room}: today's room has no fittings, and yours gets them back {cmp_on['shown']} {cmp_off['shown']}")
    # the old reference link: the same room, with every fitting off
    pg.evaluate("location.hash = '#c=10030010002000000000000000000000000100'")
    pg.wait_for_function("window.__config.state().room === 'W1' && window.__config.code().startsWith('10030010002000000000000000000000000100')", timeout=60000)
    check(pg.evaluate("window.__config.fittings().shown") == [], "the reference link still opens the same room, with no fitting")
    faults = axe_faults(pg, "#panel")
    check(not faults, f"the panel with the fittings' section passes axe {faults[:3]}")
    check(not errs, f"the Future ICU look: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the smart clinical wall, Transform my environment and the clinician workstation, in step with the room
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    W = "window.__config.wall()"

    def still_wall():
        pg.wait_for_function("!window.__config.fading() && !window.__config.state().moving", timeout=60000)
        return pg.evaluate(W)

    def mode(name):
        pg.click(f"#modeBar button[data-mode='{name}']")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)

    FOREST = {"kelvin": 3500, "level": 0.6}
    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        w = still_wall()
        check(w["wall"] == "patient" and w["staff"] == "standby" and w["tv"] == "orientation" and w["strip"] == {"shown": True, "buttons": ["board", "family"]} and not w["wallScene"] and w["env"] is None,
              f"{room}: Future ICU sets the wall for the patient: the orientation screen, the care team and the plan with two buttons, and the staff panel resting {w}")
        # the staff panel's clock tells the room's time whenever the time changes, as the TV's orientation screen does
        CLOCK = "({ hour: window.__config.state().hour, drawn: JSON.parse(window.__config.wall().drawn.staffLeft) })"
        clocks = []
        for stop in ("night", "morning", "afternoon"):
            pg.evaluate(f"window.__config.time(window.__config.stops.{stop})")
            clocks.append(pg.evaluate(CLOCK))
        check(all(c["drawn"] == ["standby", round(c["hour"] * 60)] for c in clocks) and len({c["drawn"][1] for c in clocks}) == 3, f"{room}: in standby the staff panel's clock follows the time of day {[c['drawn'] for c in clocks]}")
        # from the pillow: the strip reads at least as large as the orientation screen's own lines, and its buttons open the bedside screens
        pg.click("#views button[data-value='patient']")
        pg.wait_for_function("window.__config.state().view === 'patient' && !window.__config.state().moving", timeout=120000)
        rd = pg.evaluate("window.__config.readable()")
        check(rd["strip"] and rd["strip"] >= rd["orient"] and rd["strip"] >= 9, f"{room}: from Patient view, the strip's letters ({rd['strip']} px) are no smaller than the orientation screen's lines ({rd['orient']} px)")
        shot(pg, f"{room.lower()}_wall_patient")
        pt = pg.evaluate("window.__config.wallButtonPoint('board')")
        pg.mouse.click(pt["x"], pt["y"])
        bs = pg.evaluate("window.__config.bedside()")
        check(bs["open"] and bs["tab"] == "board", f"{room}: the wall's Ask for something button, clicked in the room, opens the communication board {bs['open']} {bs['tab']}")
        pg.click("#bedsideClose")
        # the switch, and the modes moving it without changing it
        pg.evaluate("window.__config.set('wall', 'clinical')")
        w = still_wall()
        pg.evaluate("window.__config.time(window.__config.stops.midday)")
        c = pg.evaluate(CLOCK)
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        check(c["drawn"] == ["clinical", round(c["hour"] * 60)] and pg.evaluate(CLOCK)["drawn"][1] == round(pg.evaluate("window.__config.state().hour") * 60), f"{room}: in Clinical the staff panel's clock follows the time too {c['drawn']}")
        check(w["staff"] == "clinical" and w["tv"] == "orientation" and w["strip"]["buttons"] == [] and "clinical" in w["drawn"]["staffLeft"], f"{room}: Clinical: made-up observations on the staff panel, the patient keeps the time, and no buttons {w['staff']} {w['drawn'].get('staffLeft')}")
        pg.evaluate("window.__config.set('wall', 'relaxation')")
        w = still_wall()
        check(w["wallScene"] == "desert" and w["tv"] == "scene" and not w["strip"]["shown"] and w["env"] is None and w["ceilingScene"] is None,
              f"{room}: Relaxation: the passport's desert across the wall and the TV, and the room's light and ceiling as they were {w['wallScene']} {w['tv']} {w['env']}")
        pg.evaluate("window.__config.set('wall', 'patient')")
        mode("clinical")
        w = still_wall()
        check(w["wall"] == "clinical" and w["staff"] == "clinical" and pg.evaluate("window.__config.selected().wall") == "patient", f"{room}: Clinical mode turns the wall to Clinical, and leaves the choice as it was")
        mode("comfort")
        w = still_wall()
        check(w["wall"] == "relaxation" and w["wallScene"] == "desert" and w["staff"] == "standby", f"{room}: Comfort mode turns it to Relaxation {w['wall']} {w['wallScene']}")
        mode("standard")
        w = still_wall()
        check(w["wall"] == "patient" and w["tv"] == "orientation" and not w["wallScene"], f"{room}: As set puts it back {w['wall']} {w['tv']}")
        # Transform my environment: the wall, the ceiling and the light together, slowly, and back
        pg.evaluate("window.__config.set('scene', 'forest')")
        check(pg.evaluate("window.__config.fading()") or pg.evaluate("matchMedia('(prefers-reduced-motion: reduce)').matches"), f"{room}: a scene comes in slowly")
        w = still_wall()
        code = pg.evaluate("window.__config.code()")
        check(w["wallScene"] == "forest" and w["ceilingScene"] == "forest" and w["env"] == FOREST and w["tv"] == "scene" and w["strip"]["buttons"] == ["board", "family"] and code[5 + 44] == "1",
              f"{room}: Forest sets the wall, the ceiling over the bed and the light together, the plan and buttons stay over it, and the link keeps it {w['wallScene']} {w['ceilingScene']} {w['env']} {code[5 + 44]}")
        pg.evaluate("window.__config.camera('across', { instant: true })")
        shot(pg, f"{room.lower()}_scene_forest")
        # Emergency: scenes off, the patient wall off, the station's emergency view; and back
        mode("emergency")
        w = still_wall()
        check(w["emergency"] and w["tv"] == "off" and not w["wallScene"] and not w["ceilingScene"] and w["env"] is None and w["staff"] == "clinical" and pg.evaluate("window.__config.selected().scene") == "forest",
              f"{room}: Emergency turns every scene and the patient wall off, and the staff panel to Clinical, without changing the choice {w}")
        pg.click("#openStation") if pg.is_visible("#openStation") else pg.evaluate("window.__config.openStation(true)")
        st = pg.evaluate("window.__config.station()")
        check(st["open"] and st["emergency"] and st["route"] and st["outlined"] and pg.is_visible("#stationEmergency") and "Not a validated emergency protocol" in pg.inner_text("#stationEmergency"),
              f"{room}: in Emergency mode the workstation shows where the emergency equipment is, lights it, marks the clear route, and says it isn't a validated protocol {st}")
        faults = axe_faults(pg, "#stationPanel")
        check(not faults, f"{room}: the workstation's Emergency view passes axe {faults[:3]}")
        pg.keyboard.press("Escape")
        pg.click("#leaveEmergency")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        w = still_wall()
        st = pg.evaluate("window.__config.station()")
        check(w["wallScene"] == "forest" and w["env"] == FOREST and not st["route"] and not st["emergency"], f"{room}: leaving Emergency mode brings the scene back, and takes the route away {w['wallScene']} {st['route']}")
        # a sedated patient gets no prompts; Quiet now clears the patient's wall
        pg.click("#patientBar button[data-state='sedated']")
        w = still_wall()
        check(w["strip"]["buttons"] == [] and not w["prompts"], f"{room}: a sedated patient gets no buttons on the wall")
        pg.click("#patientBar button[data-state='awake']")
        pg.click("#openBedside")
        pg.check("#quietNow")
        w = still_wall()
        check(w["patient"] == "off" and w["tv"] == "off" and not w["wallScene"], f"{room}: Quiet now takes the scene and the screens off the patient wall {w['patient']} {w['tv']}")
        pg.uncheck("#quietNow")
        pg.click("#bedsideClose")
        # Off: the way back
        pg.evaluate("window.__config.set('scene', 'off')")
        w = still_wall()
        check(w["env"] is None and not w["ceilingScene"] and not w["wallScene"] and w["tv"] == "orientation", f"{room}: Off goes back to how the room was {w['env']} {w['tv']}")
        # without the patient wall the scene goes on the TV, and the TV goes back to its own choice after
        pg.evaluate("window.__config.set('patientWall', 'off'); window.__config.set('tvplay', 'off'); window.__config.set('scene', 'ocean')")
        w = still_wall()
        on_tv = w["tv"]
        pg.evaluate("window.__config.set('scene', 'off')")
        w = still_wall()
        check(on_tv == "scene" and w["tv"] == "off", f"{room}: without the patient wall a scene shows on the TV, and Off gives the TV back to its own choice {on_tv} {w['tv']}")
        pg.click("#themes button[data-value='future']")
        # the clinician workstation: its panel, a task from choosing to Done, both views, the hands-free buttons, PACS
        pg.evaluate("window.__config.set('workstation', 'off')")
        pg.click("#openStation")
        pg.wait_for_selector("#stationPanel", state="visible", timeout=10000)
        st = pg.evaluate("window.__config.station()")
        check(st["open"] and st["desk"] and st["view"] == "nurse" and st["sections"] == ["Overview", "Care tasks", "Equipment", "Observations", "Where supplies are", "Handover"] and pg.evaluate("document.activeElement.id") == "stationTitle",
              f"{room}: Open the workstation: Nurse view, tasks first, the desk in the room while it's open, and focus in the panel {st['sections']}")
        pg.click("#stationBody button[data-task='dressing']")
        st = pg.evaluate("window.__config.station()")
        check(st["task"] == "dressing" and st["lit"] == "supplies" and st["outlined"] and "Dressing pack" in pg.inner_text(".station-detail"), f"{room}: a task shows what it needs and lights the cupboard it's in {st['lit']}")
        pg.click(".station-detail .station-done")
        st = pg.evaluate("window.__config.station()")
        check(st["done"] == ["dressing"] and "dressing" in pg.evaluate(W)["drawn"]["staffRight"], f"{room}: Done ticks it off, on the station and on the staff panel {st['done']}")
        pg.click("#stationViews button[data-view='doctor']")
        st = pg.evaluate("window.__config.station()")
        check(st["view"] == "doctor" and st["sections"][:3] == ["Overview", "Observations", "Plan"], f"{room}: Doctor view: the same patient, observations and the plan first {st['sections']}")
        pg.click("#stationHands button[data-say='next']")
        st = pg.evaluate("window.__config.station()")
        check(st["view"] == "nurse" and st["task"] == "turn" and st["lit"] == "bed", f"{room}: hands-free: \"Next task\" chooses the next one not done, and lights the bed {st['task']} {st['lit']}")
        pg.click("#stationHands button[data-say='handover']")
        check(pg.evaluate("window.__config.station().task") is None and "isn't read aloud" in pg.inner_text("#announce"), f"{room}: \"Show the handover\" puts it on the screen, and nothing is read aloud")
        faults = axe_faults(pg, "#stationPanel")
        check(not faults, f"{room}: the workstation's panel passes axe {faults[:3]}")
        shot(pg, f"{room.lower()}_station")
        pg.keyboard.press("Escape")
        check(gone(pg, "#stationPanel") and pg.evaluate("document.activeElement.id") == "openStation" and not pg.evaluate("window.__config.station().desk") and not pg.evaluate("window.__config.station().outlined"),
              f"{room}: Esc closes it, focus goes back to its button, and the desk goes with it when it wasn't chosen")
        pg.evaluate("window.__config.set('workstation', 'on')")
        pg.click("#openStation")
        pg.click("#stationPacs")
        pg.wait_for_function("window.__config.pacs().active", timeout=30000)
        check(not pg.evaluate("window.__config.station().open"), f"{room}: Open PACS opens PACS as it is, in the workstation's place")
        pg.evaluate("window.__config.pacsExit()")
    # an old link opens as it did; a link with a scene keeps it
    pg.evaluate("window.__config.set('scene', 'garden')")
    linked = pg.evaluate("window.__config.code()")
    pg.goto("about:blank")
    pg.goto(f"{URL}#c={linked}")
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    w = still_wall()
    check(pg.evaluate("window.__config.selected().scene") == "garden" and w["wallScene"] == "garden" and w["env"] == {"kelvin": 4000, "level": 0.7}, f"a link with a scene opens with it {w['wallScene']}")
    pg.goto("about:blank")
    pg.goto(f"{URL}#c=10030010002000000000000000000000000100")
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    w = still_wall()
    sel = pg.evaluate("window.__config.selected()")
    check(sel["scene"] == "off" and sel["wall"] == "patient" and w["env"] is None and not w["ceilingScene"] and w["tv"] == "off", f"the reference link opens the same room: no scene, the TV off, the light as it was {w['tv']} {w['env']}")
    pg.add_script_tag(url=AXE)  # a fresh load: axe again
    faults = axe_faults(pg, "#panel")
    check(not faults, f"the panel with the smart clinical wall's section passes axe {faults[:3]}")
    check(not errs, f"the smart clinical wall and the workstation: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- room modes that move everything together: Family visit, Cleaning, the notes, the board in Arabic, and the bar on a phone
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)

    def set_mode(name):
        pg.click(f"#modeBar button[data-mode='{name}']")
        pg.wait_for_function("!window.__config.mode().easing && !window.__config.fading()", timeout=60000)

    bar = pg.evaluate("[...document.querySelectorAll('#modeBar .mode-seg button')].map(b => b.textContent)")
    check(bar == ["As set", "Comfort", "Privacy", "Clinical", "Family visit", "Cleaning"], f"the bar: As set, Comfort, Privacy, Clinical, Family visit and Cleaning, with Emergency on its own {bar}")
    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.set('front', 'smart'); window.__config.set('scene', 'garden'); window.__config.time(window.__config.stops.afternoon)")
        pg.wait_for_function("!window.__config.fading()", timeout=60000)
        before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        # every mode: its note is one line, ending that medical alarms always stay on
        notes = {}
        for m in ["comfort", "privacy", "clinical", "family", "cleaning"]:
            set_mode(m)
            notes[m] = pg.inner_text("#modeNote")
        bad = {k: v for k, v in notes.items() if not v.endswith("Medical alarms always stay on.") or "\n" in v.strip()}
        check(not bad, f"{room}: each mode's note says in one line what changed, and that medical alarms always stay on {bad}")
        # Family visit: warm light, the glass softened, family connection on the wall, the chosen scene round it; staff end it
        set_mode("family")
        w, gl = pg.evaluate("window.__config.wall()"), pg.evaluate("window.__config.glass()")
        check(w["wall"] == "family" and w["tv"] == "family" and w["wallScene"] == "garden" and gl["opaque"] and 0 < gl["k"] < 1 and pg.evaluate("window.__config.selected().front") == "smart",
              f"{room}: Family visit: family connection on the TV, the patient's scene round it, and the glass softened, not opaque, so staff can still see in {w['tv']} {w['wallScene']} {gl}")
        shot(pg, f"{room.lower()}_mode_family")
        set_mode("standard")
        gl = pg.evaluate("window.__config.glass()")
        check(not gl["opaque"] and pg.evaluate("window.__config.wall()")["tv"] == "scene", f"{room}: staff end it, and the glass and the wall come back {gl}")
        # Cleaning: the bed empty, the screens off, no scene, the checklist lighting each step, and what finishing says
        set_mode("cleaning")
        c, w = pg.evaluate("window.__config.cleaning()"), pg.evaluate("window.__config.wall()")
        check(c["on"] and c["panel"] and c["figure"] is False and c["next"] == "handsIn" and c["outlined"] and w["patient"] == "off" and not w["wallScene"] and not w["ceilingScene"] and w["env"] is None,
              f"{room}: Cleaning: the patient figure goes, the screens and scenes go off, and the first step, hands, lights the basin {c} {w['patient']}")
        pg.check("#clean-handsIn")
        c = pg.evaluate("window.__config.cleaning()")
        check(c["next"] == "rails" and c["outlined"], f"{room}: ticking a step lights the next: the bed rails {c['next']}")
        for box in pg.locator("#cleaningSteps input").all():
            box.check()
        c = pg.evaluate("window.__config.cleaning()")
        done = pg.inner_text("#cleaningDone")
        check(c["done"] and c["next"] is None and not c["outlined"] and "Checklist finished" in done and "doesn't say the room is clean or disinfected" in done,
              f"{room}: finishing says the checklist is finished, and never that the room is disinfected {done!r}")
        check(pg.get_attribute("#cleaningAir", "href") == "../ventilation/" and "No airflow" in pg.inner_text("#cleaningPanel"), f"{room}: no airflow in the room: the checklist links to the ventilation plan")
        faults = axe_faults(pg, "#hud")
        check(not faults, f"{room}: the bar and the checklist pass axe {faults[:3]}")
        shot(pg, f"{room.lower()}_mode_cleaning")
        pg.click("#leaveCleaning")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        c = pg.evaluate("window.__config.cleaning()")
        check(not c["on"] and not c["panel"] and c["figure"] is True and c["ticks"] == [], f"{room}: leaving Cleaning puts the figure back and forgets the ticks {c}")
        # Emergency from Family visit: it outranks it, and leaving goes back
        set_mode("family")
        set_mode("emergency")
        w = pg.evaluate("window.__config.wall()")
        check(w["emergency"] and w["tv"] == "off" and not pg.evaluate("window.__config.glass()")["opaque"], f"{room}: Emergency outranks Family visit: screens off and the glass clear")
        pg.click("#leaveEmergency")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        check(pg.evaluate("window.__config.mode().current") == "family", f"{room}: leaving Emergency mode goes back to Family visit")
        set_mode("standard")
        pg.wait_for_function("!window.__config.fading()", timeout=60000)
        after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code() })")
        diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k] and k not in ("eye", "target", "view")]
        check(after["code"] == before["code"] and not diff, f"{room}: no mode changed a choice or the link, and As set puts the room back {diff}")
    # the board: Arabic beside English, and a privacy request a nurse acts on
    pg.click("#openBedside")
    pg.click(".board-button[data-request='privacy']")
    item = pg.locator(".requests li").last
    ar = item.locator("[lang='ar']").first
    check(ar.get_attribute("dir") == "rtl" and "nurse confirms anything clinical in person" in item.inner_text(), "a request shows in English and Arabic, right to left, with the line that a nurse confirms anything clinical in person")
    item.locator("button", has_text="Turn on Privacy").click()
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    check(pg.evaluate("window.__config.mode().current") == "privacy", "from the privacy request, the nurse turns Privacy on: nothing happened until they did")
    faults = axe_faults(pg, "#bedside")
    check(not faults, f"the board with its Arabic passes axe {faults[:3]}")
    pg.click("#bedsideClose")
    set_mode("standard")
    check(not errs, f"room modes: no errors {errs[:3]}")
    ctx.close()
    # the bar on a 390 px phone: two rows of three, Emergency below, nothing off the screen
    ctx, pg, errs, _, _ = open_page(b, 390, 844)
    rows = pg.evaluate("""() => { const bs = [...document.querySelectorAll('#modeBar button[data-mode]')];
      return bs.map(b => { const r = b.getBoundingClientRect(); return [b.dataset.mode, Math.round(r.top), Math.round(r.left), Math.round(r.right)]; }); }""")
    tops = sorted({r[1] for r in rows})
    seg = [r for r in rows if r[0] != "emergency"]
    check(len(tops) == 3 and len({r[1] for r in seg}) == 2 and all(r[3] <= 390 for r in rows) and [r for r in rows if r[0] == "emergency"][0][1] == tops[-1],
          f"390 px: the six modes in two rows of three, Emergency on the row below, nothing off the screen {rows}")
    shot(pg, "phone_mode_bar")
    check(not errs, f"the phone's mode bar: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the presentation: Experience the ICU of the future, Room basics, and Transform the ICU
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    go(pg, "W1")
    before = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint() })")
    check("Experience the ICU of the future" in pg.inner_text("#openGuide") and "nine-step" in pg.inner_text("#openBasics"), "the main button starts Experience the ICU of the future, and Room basics keeps the nine steps")
    pg.click("#openGuide")
    pg.wait_for_function("window.__config.guide().running", timeout=30000)
    if pg.evaluate("window.__config.guide().playing"):
        pg.click("#guidePlay")  # hold each step here; Next moves on
    want = ["Entering the room", "Comfort: a scene, the light, the quiet", "Asking without speaking", "Where the equipment and cables go", "The wall and the workstation",
            "The room's modes, together", "Before and after", "Adaptive ICU: a room that cares, connects and adapts"]
    seen, bad = [], []
    for i in range(len(want)):
        if i:
            pg.click("#guideNext")
        pg.wait_for_function(f"window.__config.guide().at === {i} && window.__config.guide().still", timeout=120000)
        g = pg.evaluate("window.__config.guide()")
        seen.append(g["title"])
        st = pg.evaluate("({ sel: window.__config.selected(), mode: window.__config.mode().current, bed: window.__config.bed().open, bs: window.__config.bedside(), station: window.__config.station(), view: window.__config.state().view, count: document.getElementById('guideCount').textContent })")
        ok = {
            0: st["sel"]["ceilingTray"] == "on" and st["view"] == "across",
            1: st["sel"]["scene"] == "forest" and st["mode"] == "comfort",
            2: st["bs"]["open"] and any(r["id"] == "water" for r in st["bs"]["requests"]),
            3: st["bed"] and not st["bs"]["open"],
            4: st["station"]["open"] and st["station"]["task"] == "dressing" and st["mode"] == "clinical",
            5: st["mode"] == "family" and not st["station"]["open"],
            6: st["sel"]["scene"] == "forest" and st["sel"]["workstation"] == "on" and st["sel"]["floor"] == "slate" and st["sel"]["paint"] == "sky" and st["mode"] == "standard",
            7: True,
        }[i]
        if not ok or st["count"] != f"{i + 1} of 8":
            bad.append((i, g["title"], st["mode"], st["count"]))
        if i == 1:
            shot(pg, "future_tour_comfort")
    check(seen == want, f"Experience the ICU of the future tells one patient's story, in the brief's order {seen}")
    check(not bad, f"each step sets up what it says: the scene, the board, the lines, the wall and the desk, a mode, and the room arriving piece by piece {bad}")
    faults = axe_faults(pg, "#guide")
    check(not faults, f"the tour's card passes axe {faults[:3]}")
    pg.click("#guideNext")  # Finish
    pg.wait_for_function("window.__config.guide().ended", timeout=60000)
    pg.wait_for_function("!window.__config.mode().easing && !window.__config.fading()", timeout=60000)
    after = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint(), bs: window.__config.bedside(), station: window.__config.station(), bed: window.__config.bed().open })")
    diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k] and k not in ("eye", "target", "view", "hour")]
    check(after["code"][:5 + 45] == before["code"][:5 + 45] and not after["bs"]["open"] and not after["bs"]["requests"] and not after["station"]["open"] and not after["station"]["task"] and not after["bed"] and not diff,
          f"Finish puts the room back as it was: its choices, the patient's request, the panels the steps opened {diff}")
    check(pg.inner_text("#guideTitle") == "That's the story", "its ending says the story is over")
    pg.keyboard.press("Escape")
    # its link, and Room basics' button
    pg.goto("about:blank")
    pg.goto(URL + "?tour=future")
    pg.wait_for_function("window.__configReady === true && window.__config.guide().running", timeout=120000)
    check(pg.evaluate("window.__config.guide().title") == "Entering the room", "?tour=future starts Experience the ICU of the future")
    pg.click("#guideExit")
    pg.wait_for_function("!window.__config.guide().running", timeout=60000)
    pg.click("#openBasics")
    pg.wait_for_function("window.__config.guide().running", timeout=30000)
    check(pg.inner_text("#guideCount") == "1 of 9" and pg.evaluate("window.__config.guide().title") == "An isolation room, as a design proposal", "Room basics plays the nine steps it always did")
    pg.click("#guideExit")
    pg.wait_for_function("!window.__config.guide().running", timeout=60000)
    # Transform the ICU: today's room, then the new one a piece at a time, and the visitor's room back after
    pg.add_script_tag(url=AXE)
    go(pg, "W1")
    pg.evaluate("window.__config.set('floor', 'oak')")
    before = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint() })")
    pg.click("#transformPlay")
    pg.wait_for_function("window.__config.demo() && window.__config.demo().id === 'transformIcu'", timeout=30000)
    steps = {}
    while True:
        pg.wait_for_function("!window.__config.demo() || window.__config.demo().waiting", timeout=120000)
        # read the step as soon as it's waiting, then move it on, unless its own timer already has
        got = pg.evaluate("""() => { const d = window.__config.demo(); if (!d?.waiting) return null;
          return { at: d.at, text: document.getElementById('demoText').textContent, shown: window.__config.fingerprint().shown }; }""")
        if not pg.evaluate("window.__config.demo()"):
            break
        if not got:
            continue
        steps[got["at"]] = got
        if got["at"] == 2:
            shot(pg, "transform_icu_tray")
        pg.evaluate("at => { const d = window.__config.demo(); if (d?.at === at && d.waiting) window.__config.demoAdvance(); }", got["at"])
    captions, shown = [steps[k]["text"] for k in sorted(steps)], [steps[k]["shown"] for k in sorted(steps)]
    pg.wait_for_function("!window.__config.state().moving && !window.__config.fading() && !window.__config.mode().easing", timeout=60000)
    after = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint() })")
    diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k] and k not in ("eye", "target", "view")]
    check(len(captions) == 7 and "not every ICU" in captions[0] and "how the room works" in captions[-1], f"Transform the ICU: seven captions, from today's room, a typical one, to how the room works {sorted(steps)} {captions[:1]} {captions[-1:]}")
    check(shown[0].get("floor") == "sand" and shown[1].get("floor") == "slate" and shown[1].get("paint") == "sky" and shown[1].get("feature") == "ash" and shown[5].get("scene") == "forest", "it starts from today's room and adds the new one a piece at a time, shown, not chosen")
    check(after["code"] == before["code"] and not diff, f"and when it ends the visitor's own room is back, oak floor and all {diff}")
    check(not errs, f"the presentation: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- the digital twin: the room read as it is, five separate parts, no total, no vital signs
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    TW = "window.__config.twin()"

    def settled():
        pg.wait_for_function("!window.__config.mode().easing && !window.__config.fading() && !window.__config.patientState().easing", timeout=60000)
        pg.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
        return pg.evaluate(TW)

    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        before = pg.evaluate("({ code: window.__config.code() })")
        pg.click("#openTwin")
        pg.wait_for_selector("#twinPanel", state="visible", timeout=10000)
        t = settled()
        check(t["open"] and t["all"] and t["parts"] == ["Environmental comfort", "Equipment organisation", "Access clearance", "Communication readiness", "Cleaning checklist"] and pg.evaluate("document.activeElement.id") == "twinTitle",
              f"{room}: the digital twin opens in the options' place, with every system faintly outlined and room health in five parts {t['parts']}")
        read = t["read"]
        check(not any(k in read for k in ("total", "score")) and not any("score" in h for h in read["health"]) and not any(w in pg.inner_text("#twinPanel").lower() for w in ("heart rate", "oxygen saturation", "blood pressure", "breathing rate")),
              f"{room}: no total, no score, and no vital signs on it")
        # each system, read in words and lit in the room
        bad = []
        for sys_id in ["bed", "ceiling", "walls", "storage", "equipment", "floor", "mode"]:
            pg.click(f"#twinSystems button[data-system='{sys_id}']")
            t = settled()
            if t["system"] != sys_id or not t["detail"] or (sys_id not in ("mode", "floor") and not t["outlined"]) or (sys_id == "floor") != t["route"]:
                bad.append((sys_id, t["system"], t["outlined"], t["route"]))
        check(not bad, f"{room}: each system reads its state and lights what it covers; the floor shows the route to the bed {bad}")
        # it reads the room as it is: the mode, the patient's state, a request, Cleaning
        pg.click("#modeBar button[data-mode='comfort']")
        t = settled()
        light = t["read"]["health"][0]["lines"][0]
        check(t["detail"].startswith("The mode in forceComfort") and "warm" in light and "room mode" in light, f"{room}: change the mode and it changes: Comfort's row, and the light from the mode {light!r}")
        pg.click("#modeBar button[data-mode='standard']")
        t = settled()
        check("room as set" in t["read"]["health"][0]["lines"][0], f"{room}: and back, once the light has finished easing {t['read']['health'][0]['lines'][0]!r}")
        pg.click("#patientBar button[data-state='sedated']")
        t = settled()
        comm = next(h for h in t["read"]["health"] if h["id"] == "communication")
        check("not offered while sedated" in comm["lines"][0], f"{room}: a sedated patient isn't offered the board, and the twin says so {comm['lines'][0]!r}")
        pg.click("#patientBar button[data-state='awake']")
        pg.click("#modeBar button[data-mode='cleaning']")
        t = settled()
        cl = next(h for h in t["read"]["health"] if h["id"] == "cleaning")
        check(cl["state"] == "look" and "0 of 9" in cl["lines"][0], f"{room}: Cleaning shows its checklist's progress {cl}")
        pg.click("#leaveCleaning")
        t = settled()
        check(next(h for h in t["read"]["health"] if h["id"] == "cleaning")["state"] == "off", f"{room}: and stops when Cleaning ends")
        faults = axe_faults(pg, "#twinPanel")
        check(not faults, f"{room}: the twin passes axe {faults[:3]}")
        shot(pg, f"{room.lower()}_twin")
        pg.focus("#twinSystems button[data-system='bed']")  # from inside the panel, as the other panels close
        pg.keyboard.press("Escape")
        t = pg.evaluate(TW)
        check(gone(pg, "#twinPanel") and not t["open"] and not t["outlined"] and not t["all"] and not t["route"] and pg.evaluate("document.activeElement.id") == "openTwin" and pg.evaluate("window.__config.code()") == before["code"],
              f"{room}: Esc closes it, its outlines and route go, focus goes back to its button, and no choice or link changed {[t['open'], t['outlined'], t['all'], t['route'], pg.evaluate('document.activeElement.id'), pg.evaluate('window.__config.code()'), before['code']]}")
    check(not errs, f"the digital twin: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- room intelligence and the room safety scan: made-up events by button, notices until acknowledged, and placed items checked
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    IN = "window.__config.intel()"
    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        before = pg.evaluate("window.__config.code()")
        pg.click("#openIntel")
        pg.wait_for_selector("#intelPanel", state="visible", timeout=10000)
        check(pg.evaluate("document.activeElement.id") == "intelTitle" and pg.is_disabled("#intelEvents button[data-event='edge']"), f"{room}: room intelligence opens in the options' place; its events wait until it's active")
        pg.click("#intelActivate")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        i = pg.evaluate(IN)
        check(i["active"] and i["cover"] and i["sensors"], f"{room}: activated, the three sensors show, with the floor each would cover {i}")
        shot(pg, f"{room.lower()}_intel_cover")
        pg.click("#intelEvents button[data-event='edge']")
        i = pg.evaluate(IN)
        check(i["notices"] == ["edge"] and i["banner"] and i["marks"].get("edge") and "edge of the bed" in pg.inner_text("#intelNotice") and "Nothing watched" in pg.inner_text("#intelNotice") + pg.inner_text("#intelPanel"),
              f"{room}: the bed's edge: its place lit, and a notice in front of staff that says nothing watched {i['notices']}")
        pg.click("#intelEvents button[data-event='clear']")
        i = pg.evaluate(IN)
        check(i["notices"] == ["edge", "clear"] and i["marks"].get("clear") and i["station"] == ["edge", "clear"], f"{room}: something left in a clear area: lit too, and both notices on the workstation {i['station']}")
        faults = axe_faults(pg, "#intelPanel") + axe_faults(pg, "#intelNotice")
        check(not faults, f"{room}: room intelligence and its notice pass axe {faults[:3]}")
        pg.click("#intelAck")
        i = pg.evaluate(IN)
        check(i["notices"] == ["edge"] and i["marks"].get("clear"), f"{room}: acknowledging takes the notice away, not what it pointed at {i}")
        pg.click("#intelReset")
        i = pg.evaluate(IN)
        check(not i["notices"] and not i["banner"] and not any(i["marks"].values()) and not i["station"], f"{room}: Reset takes every made-up event away {i}")
        pg.focus("#intelActivate")
        pg.keyboard.press("Escape")
        i = pg.evaluate(IN)
        check(gone(pg, "#intelPanel") and not i["active"] and not i["cover"] and pg.evaluate("document.activeElement.id") == "openIntel" and pg.evaluate("window.__config.code()") == before,
              f"{room}: Esc closes it, the coverage goes, focus goes back to its button, and no choice or link changed")
        # the room safety scan: nothing placed, then an item in a keep-clear area, its explanation and a clear spot, then moved
        pg.click("#runScan")
        check("No items placed" in pg.inner_text("#scanResults"), f"{room}: the scan with nothing placed says so")
        spot = pg.evaluate("window.__config.clearSpot()")
        pg.evaluate(f"window.__config.placeAt('bins', {spot[0]}, {spot[1]})")
        levels = pg.evaluate("window.__config.runScan()")
        sc = pg.evaluate("window.__config.scan()")
        check(levels and levels[0] in ("clearance", "overlap") and sc["results"][0]["why"] and sc["results"][0]["spot"], f"{room}: an item placed beside the bed is flagged, with why, and a nearby clear spot found {sc['results']}")
        pg.click("#scanResults button")
        sc = pg.evaluate("window.__config.scan()")
        check(sc["marker"] and sc["detail"] and "Drag the item there yourself" in sc["detail"], f"{room}: choosing it explains it and marks the clear spot on the floor {sc['detail']!r}")
        shot(pg, f"{room.lower()}_scan")
        r0 = sc["results"][0]
        pg.evaluate(f"window.__config.movePlaced({r0['uid']}, {spot[0] + r0['spot']['dx']}, {spot[1] + r0['spot']['dy']})")
        levels = pg.evaluate("window.__config.runScan()")
        check(levels == [None], f"{room}: moved there by the visitor, it's clear: no modelled conflict found {levels}")
        pg.evaluate("document.getElementById('resetRoom').click()")
    check(not errs, f"room intelligence and the scan: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- equipment and cables: Traditional and Organised, each kind labelled, gas in its own channel, APIS linked
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    CB = "window.__config.cables()"
    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        before = pg.evaluate("window.__config.code()")
        check(pg.evaluate(CB)["channels"], f"{room}: Future ICU has the cable channels")
        pg.click("#cableStates button[data-cables='traditional']")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        c = pg.evaluate(CB)
        check(c["view"] == "traditional" and not c["channels"] and set(c["tubes"]) == {"power", "data", "gas"} and set(c["labels"]) == {"power", "data", "gas", "patient"},
              f"{room}: Traditional: power, data and gas loose on the floor, no channels, and every kind labelled in the room {c}")
        shot(pg, f"{room.lower()}_cables_traditional")
        pg.click("#cableStates button[data-cables='organised']")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        c = pg.evaluate(CB)
        check(c["view"] == "organised" and c["channels"] and set(c["tubes"]) == {"power", "data", "gas"} and "patient" in c["labels"] and c["outlined"],
              f"{room}: Organised: the channels and the routes down the pendant, the patient's lines outlined {c}")
        shot(pg, f"{room.lower()}_cables_organised")
        faults = axe_faults(pg, "#panel")
        check(not faults, f"{room}: the cables' section passes axe {faults[:3]}")
        pg.click("#cableStates button[data-cables='off']")
        c = pg.evaluate(CB)
        check(c["view"] is None and c["channels"] and not c["outlined"] and pg.evaluate("window.__config.code()") == before, f"{room}: Off puts the room back: the channels as chosen, and no choice or link changed")
        pg.click("#cableApis")
        pg.wait_for_function("window.__config.apis().active", timeout=30000)
        check(pg.evaluate("window.__config.apis().mode") == "routing", f"{room}: the patient's lines open in APIS's Tubing & movement, as it is")
        pg.keyboard.press("Escape")
        pg.wait_for_function("!window.__config.apis().active", timeout=30000)
    # the reference link: no channels
    pg.goto("about:blank")
    pg.goto(f"{URL}#c=10030010002000000000000000000000000100")
    pg.wait_for_function("window.__configReady === true", timeout=120000)
    check(pg.evaluate("window.__config.selected().cableChannels") == "off" and not pg.evaluate(CB)["channels"], "the reference link opens with no cable channels")
    check(not errs, f"equipment and cables: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- Light across 24 hours: a timeline to drag, four phases, blinds that follow, quiet hours, and the staff override
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    DAY = "window.__config.day()"
    faults = []
    for room in ROOMS:
        go(pg, room)
        set_defaults(pg)
        pg.evaluate("window.__config.camera('overview', { instant: true }); window.__config.time(window.__config.stops.afternoon)")
        drawn(pg)
        before = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), hash: location.hash })")
        pg.locator("#openDay").scroll_into_view_if_needed()
        pg.click("#openDay")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        d = pg.evaluate(f"({{ d: {DAY}, focus: document.activeElement.id, options: getComputedStyle(document.getElementById('panel')).visibility, scheme: {DAY}.scheme }})")
        check(d["d"]["open"] and d["focus"] == "dayTitle" and d["options"] == "hidden" and d["d"]["phase"] == "afternoon" and d["scheme"] == "circadian",
              f"{room}: Light across 24 hours opens in the options panel's place, with focus, at the room's own hour, the circadian scheme shown {d['d']['handle']}")
        # the four phases, by their buttons: the light and blinds follow
        seen = {}
        for ph in ("Morning daylight", "Afternoon comfort", "Evening wind-down", "Night sleep"):
            pg.click(f"#dayTimeline .day-jump button:text-is('{ph}')")
            seen[ph] = pg.evaluate(DAY)
        m, a, n = seen["Morning daylight"], seen["Afternoon comfort"], seen["Night sleep"]
        check(m["blinds"] < 0.05 and a["blinds"] == 0.5 and n["blinds"] > 0.95, f"{room}: the blinds follow the plan: up in the morning, half down in the afternoon, down at night {[m['blinds'], a['blinds'], n['blinds']]}")
        check(a["plan"]["level"] == 1 and a["plan"]["kelvin"] >= 4500 and n["plan"]["level"] < 0.15 and n["plan"]["kelvin"] <= 2400 and n["quiet"] and not a["quiet"],
              f"{room}: bright, cool white by day; warm and low at night, in quiet hours {a['plan']} {n['plan']}")
        check("Quiet hours" in pg.inner_text("#dayFacts") and "Care still comes first" in pg.inner_text("#dayFacts"), f"{room}: quiet hours say care still comes first")
        shot(pg, f"{room.lower()}_day_night")
        faults += axe_faults(pg, "#dayPanel")
        # the handle by keyboard, and by dragging the track
        pg.focus("#dayTimeline .day-handle")
        h0 = pg.evaluate(DAY)["hour"]
        pg.keyboard.press("ArrowRight")
        pg.keyboard.press("PageUp")
        k = pg.evaluate(DAY)
        check(abs(((k["hour"] - h0) % 24) - 1.25) < 1e-6 and pg.get_attribute("#dayTimeline .day-handle", "aria-valuetext") == k["handle"], f"{room}: the arrow keys step a quarter hour and Page Up an hour {h0} to {k['hour']}")
        box = pg.locator("#dayTimeline .day-track").bounding_box()
        pg.mouse.move(box["x"] + box["width"] * 0.25, box["y"] + box["height"] / 2)
        pg.mouse.down()
        pg.mouse.move(box["x"] + box["width"] * 0.6, box["y"] + box["height"] / 2, steps=6)
        pg.mouse.up()
        dr = pg.evaluate(DAY)
        check(abs(dr["hour"] - 20.5) < 0.3 and dr["phase"] == "evening", f"{room}: dragging along the timeline moves the hour: 60% of the way from 6 am is about 8:30 pm {dr['hour']}")
        # the link stays as it was while the hour moves
        check(pg.evaluate("window.__config.code()") == before["code"], f"{room}: the link doesn't change while the hour is dragged")
        # the staff override: Clinical's light wins, and the plan waits
        pg.click("#modeBar button[data-mode='clinical']")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        ov = pg.evaluate("({ look: window.__config.mode().look, text: document.getElementById('dayOverride').textContent })")
        check(ov["look"] and ov["look"]["level"] == 1 and ov["look"]["kelvin"] == 4000 and "staff override wins" in ov["text"], f"{room}: Clinical mode is the staff override: its full neutral light wins over the plan {ov['look']}")
        pg.click("#modeBar button[data-mode='standard']")
        pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
        back = pg.evaluate(DAY)
        check(pg.evaluate("window.__config.mode().look") is None and back["plan"] and abs(back["blinds"] - back["planBlinds"]) < 0.02, f"{room}: back in Standard, the plan's light and blinds return {back['blinds']} {back['planBlinds']}")
        # Play the day: once round, then it stops by itself at the hour it began
        start = back["hour"]
        pg.click("#dayPlay")
        check(pg.evaluate(DAY)["playing"], f"{room}: Play the day plays")
        pg.wait_for_function(f"!{DAY}.playing", timeout=120000)
        check(abs(pg.evaluate(DAY)["hour"] - start) < 1e-6 and pg.inner_text("#dayPlay") == "Play the day", f"{room}: and stops by itself, back at the hour it began")
        # closing puts the time, the light, the blinds and the view back
        pg.click("#dayClose")
        drawn(pg)
        after = pg.evaluate("({ fp: window.__config.fingerprint(), code: window.__config.code(), hash: location.hash, focus: document.activeElement.id })")
        diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k]]
        check(not diff and after["code"] == before["code"] and after["focus"] == "openDay", f"{room}: closing puts the room back exactly, at its own time, focus on the button {diff[:4]}")
    check(not faults, f"axe finds no serious faults in Light across 24 hours {faults[:4]}")
    # Emergency closes it and it waits; the circadian card opens it
    pg.click("#openDay")
    pg.click("#modeBar button[data-mode='emergency']")
    em = pg.evaluate(DAY)["open"]
    pg.evaluate("window.__config.openDay()")
    check(not em and not pg.evaluate(DAY)["open"], "Emergency closes Light across 24 hours, and it waits until Emergency mode ends")
    pg.click("#leaveEmergency")
    pg.wait_for_function("!window.__config.mode().easing", timeout=60000)
    pg.evaluate("document.getElementById('featuresSection').open = true")
    pg.click("#featureList button[data-feature='circadian']")
    pg.wait_for_selector("#objectCard", state="visible", timeout=10000)
    pg.click("#objectCard button:text-is('Open Light across 24 hours')")
    check(pg.evaluate(DAY)["open"], "the circadian lighting card opens Light across 24 hours")
    pg.keyboard.press("Escape")
    check(not pg.evaluate(DAY)["open"], "Esc closes it")
    check(not errs, f"Light across 24 hours: no errors {errs[:3]}")
    ctx.close()
    # a phone: a sheet, with the timeline inside the screen
    ctx, pg, errs, _, _ = open_page(b, 390, 844, query="?tier=low", has_touch=True, is_mobile=True)
    pg.tap("#sheet")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')")
    pg.locator("#openDay").scroll_into_view_if_needed()
    pg.tap("#openDay")
    drawn(pg)
    sh = pg.evaluate("(() => { const p = document.getElementById('dayPanel').getBoundingClientRect(), t = document.querySelector('.day-track').getBoundingClientRect(); return { top: p.top, bottom: p.bottom, l: p.left, r: p.right, tl: t.left, tr: t.right, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; })()")
    check(sh["l"] >= 0 and sh["r"] <= 390 and sh["bottom"] <= 844.5 and sh["top"] > 300 and sh["tl"] >= 0 and sh["tr"] <= 390 and sh["over"] <= 0, f"phone: Light across 24 hours is a sheet, its timeline inside the screen {sh}")
    shot(pg, "phone_day")
    pg.tap("#dayClose")
    pg.wait_for_function("document.getElementById('panel').classList.contains('open')", timeout=10000)
    check(pg.evaluate("document.activeElement.id") == "openDay", "phone: closing it brings the sheet back, with focus where it was")
    check(not errs, f"phone, Light across 24 hours: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- when someone comes in: the demo plays a badge, a figure walks the route, the staff's screens are ready, and the room is put back
    ctx, pg, errs, _, _ = open_page(b, 1366, 820)
    pg.add_script_tag(url=AXE)
    AR = "window.__config.arrival()"
    ARRIVE = {"nurse": "#featureDemo", "doctor": "#objectCard button[data-action='demo:arrivalDoctor']", "family": "#objectCard button[data-action='demo:arrivalFamily']"}
    SEEN = """() => { const c = window.__config, d = c.demo(); if (!d?.waiting) return null;
      const w = c.wall(), st = c.station();
      return { at: d.at, text: document.getElementById('demoText').textContent, a: c.arrival(), mode: c.mode().current, staff: w.staff, tv: w.tv, station: st.open, view: st.view, route: st.route, shown: c.fingerprint().shown }; }"""
    near = lambda p, q: p is not None and q is not None and math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05
    for room in ROOMS:
        go(pg, room)
        pg.click("#themes button[data-value='future']")
        pg.evaluate("window.__config.time(window.__config.stops.afternoon)")
        pg.wait_for_function("!window.__config.state().moving", timeout=60000)
        before = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint() })")
        check(pg.evaluate(AR)["role"] is None and pg.evaluate("window.__config.wall().staff") == "standby", f"{room}: nobody is in, and the staff panel is in standby")
        for role in ("nurse", "doctor", "family"):
            pg.click("#arrivalPlay")
            pg.wait_for_selector("#objectCard:not([hidden])")
            if room == ROOMS[0] and role == "nurse":
                card = pg.inner_text("#objectCard")
                check("When someone comes in" in card and "Nothing recognises anyone" in card and all(t in card for t in ("A nurse comes in", "A doctor comes in", "A family visitor comes in")), f"the card under View says what it is and isn't, and offers all three {card[:70]!r}")
                faults = axe_faults(pg, "#objectCard")
                check(not faults, f"the arrival card passes axe {faults[:3]}")
            # the click and the first reading in one go: they start at the door, already walking
            first = pg.evaluate("sel => { document.querySelector(sel).click(); return window.__config.arrival(); }", ARRIVE[role])
            check(first["role"] == role and first["moving"] and first["shown"] and near(first["at"], first["door"]), f"{room}: the {role} starts at the door, walking {first}")
            steps = {}
            while True:
                pg.wait_for_function("!window.__config.demo() || window.__config.demo().waiting", timeout=120000)
                got = pg.evaluate(SEEN)
                if not pg.evaluate("window.__config.demo()"):
                    break
                if not got:
                    continue
                steps[got["at"]] = got
                if room == "W1" and got["at"] == 1:
                    shot(pg, f"arrival_{role}")
                pg.evaluate("at => { const d = window.__config.demo(); if (d?.at === at && d.waiting) window.__config.demoAdvance(); }", got["at"])
            st = [steps[k] for k in sorted(steps)]
            check(len(st) == (4 if role == "doctor" else 3) and "The demo plays the tap: nothing recognises anyone" in st[0]["text"], f"{room}, {role}: {len(st)} captions, and the first says the demo plays the tap")
            a = st[0]["a"]
            check(a["role"] == role and not a["moving"] and near(a["at"], a["bedside"]) and st[0]["route"] and st[0]["staff"] == "standby" and st[0]["mode"] == "standard",
                  f"{room}: the {role} stops at the bedside, along the marked route, and a badge alone changes no light or mode {a} {st[0]['staff']} {st[0]['mode']}")
            if role == "nurse":
                check(st[1]["staff"] == "clinical" and st[1]["station"] and st[1]["view"] == "nurse" and st[1]["mode"] == "standard" and st[1]["shown"].get("wall") == "clinical",
                      f"{room}: for a nurse the staff panel wakes and the workstation opens in Nurse view, with no mode changed {st[1]['staff']} {st[1]['view']} {st[1]['mode']}")
            if role == "doctor":
                check(st[1]["staff"] == "clinical" and st[1]["station"] and st[1]["view"] == "doctor" and st[1]["mode"] == "standard", f"{room}: for a doctor the workstation opens in Doctor view {st[1]['view']} {st[1]['mode']}")
                check(st[2]["mode"] == "clinical" and "The demo plays the doctor" in st[2]["text"], f"{room}: Clinical mode comes on only as the doctor's choice, and the caption says the demo plays the doctor {st[2]['mode']}")
            if role == "family":
                check(st[1]["mode"] == "family" and st[1]["staff"] == "standby" and not st[1]["station"] and "A nurse turns on Family visit" in st[1]["text"] and "shown nothing clinical" in st[1]["text"],
                      f"{room}: for a family visitor a nurse turns on Family visit, and the staff panel stays in standby {st[1]['mode']} {st[1]['staff']}")
            check(st[-1]["a"]["role"] is None and not st[-1]["a"]["moving"] and st[-1]["mode"] == "standard" and "leaves" in st[-1]["text"], f"{room}: the {role} leaves, and no mode is left on {st[-1]['a']} {st[-1]['mode']}")
            pg.wait_for_function("!window.__config.state().moving && !window.__config.fading() && !window.__config.mode().easing", timeout=60000)
            after = pg.evaluate("({ code: window.__config.code(), fp: window.__config.fingerprint(), a: window.__config.arrival(), route: window.__config.station().route })")
            diff = [k for k in before["fp"] if before["fp"][k] != after["fp"][k] and k not in ("eye", "target")]
            check(after["code"] == before["code"] and not diff and after["a"]["role"] is None and not after["a"]["shown"] and not after["route"], f"{room}: after the {role}'s demo the room is back as it was, with nobody in it and no route marked {diff}")
        # stopping part-way takes the figure away at once
        pg.click("#arrivalPlay")
        pg.wait_for_selector("#objectCard:not([hidden])")
        pg.click("#featureDemo")
        pg.wait_for_function("window.__config.demo()?.waiting", timeout=120000)
        pg.click("#demoStop")
        gone_now = pg.evaluate("({ a: window.__config.arrival(), route: window.__config.station().route, demo: window.__config.demo() })")
        check(gone_now["demo"] is None and gone_now["a"]["role"] is None and not gone_now["a"]["shown"] and not gone_now["route"], f"{room}: Stop takes the figure and the route away at once {gone_now['a']}")
    # Emergency comes first: no arrival demo starts over it
    pg.click("#modeBar button[data-mode='emergency']")
    pg.click("#arrivalPlay")
    pg.wait_for_selector("#objectCard:not([hidden])")
    pg.click("#featureDemo")
    check(pg.evaluate("window.__config.demo()") is None and pg.evaluate(AR)["role"] is None and "Not during Emergency" in pg.inner_text("#featureStatus"), "in Emergency no one is brought in by a demo: care comes first")
    pg.keyboard.press("Escape")
    pg.click("#leaveEmergency")
    check(not errs, f"when someone comes in: no errors {errs[:3]}")
    ctx.close()

    # ---------------------------------------------------------------- reduced motion
    ctx, pg, errs, _, _ = open_page(b, 1100, 600, query="?tier=low", reduced_motion="reduce")
    pg.click("#views button[data-value='entrance']")
    check(pg.evaluate("window.__config.state().moving") is False and pg.evaluate("window.__config.state().view") == "entrance", "reduced motion: moving between views is a cut")
    pg.click("#modeBar button[data-mode='comfort']")
    m = pg.evaluate("window.__config.mode()")
    check(not m["easing"] and m["blinds"] == 1 and m["look"]["level"] == 0.35, f"reduced motion: Comfort is a cut {m}")
    pg.click("#modeBar button[data-mode='standard']")
    # someone coming in is at the bedside at once, with no walk
    pg.click("#arrivalPlay")
    pg.wait_for_selector("#objectCard:not([hidden])")
    at_once = pg.evaluate("() => { document.querySelector('#featureDemo').click(); return window.__config.arrival(); }")
    check(at_once["role"] == "nurse" and not at_once["moving"] and math.hypot(at_once["at"][0] - at_once["bedside"][0], at_once["at"][1] - at_once["bedside"][1]) < 0.05, f"reduced motion: the nurse is at the bedside at once {at_once}")
    pg.click("#demoStop")
    check(pg.evaluate("window.__config.arrival()")["role"] is None, "reduced motion: and gone at once when the demo stops")
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
    check(pg.text_content(".top .mark").strip() == "Adaptive ICU" and "Walk the" not in pg.inner_text(".top"), "the home page's name is the proposal's, not the walkthrough's")
    check(pg.locator(".hero .actions a").first.get_attribute("href") == "configurator/?tour=future", "the home page's first action is Experience the ICU of the future")
    figs = pg.evaluate("[...document.querySelectorAll('#proposal figure')].map(f => ({ href: f.querySelector('a').getAttribute('href'), alt: f.querySelector('img').alt.length, lead: f.querySelector('figcaption b')?.textContent || '' }))")
    check(len(figs) == 6 and all("configurator/#c=" in f["href"] and f["alt"] > 40 and f["lead"] for f in figs), f"the proposal has six features, each with a described picture that opens its room {[f['lead'] for f in figs]}")
    words = pg.inner_text("#proposal")
    check(all(w in words for w in ("Room modes", "PACS", "APIS", "Equipment labels", "Remote care for the isolation room", "simulated")), "the proposal names the modes, PACS, APIS, Equipment labels and Remote care, and says the readings are simulated")
    check("Six things" in words and "never fewer checks" in words and "look through the glass first" in words, "Remote care's caption carries its pitch: look in first, fewer entries, never fewer checks")
    check(pg.evaluate("[...document.querySelectorAll('#rooms [role=tab]')].map(t => t.textContent.trim().split(/\\s+/)[0])") == ["Proposed", "Today"], "the first picture compares the proposed room with the room today")
    pg.evaluate("document.querySelectorAll('#proposal img').forEach(i => { i.loading = 'eager'; })")
    pg.wait_for_function("[...document.querySelectorAll('#proposal img')].every(i => i.complete && i.naturalWidth > 0)", timeout=60000)
    check(True, "every picture in the proposal loads")
    # a link carries a room's choices, view and time, but not its mode, an open demo or a pressed button. A picture that shows
    # one of those says where to find it, since its link opens the room without it
    opens = pg.evaluate("[...document.querySelectorAll('#proposal figure')].map(f => ({ lead: f.querySelector('figcaption b').textContent, href: f.querySelector('a').getAttribute('href'), says: f.querySelector('figcaption .opens')?.textContent || '' }))")
    told = {o["lead"].split(",")[0].rstrip("."): o["says"] for o in opens}
    check(all(told[k].startswith(f"Opens room {room}.") and where in told[k] for k, room, where in (("Room modes", "W1", "bar at its top"), ("PACS", "W1", "in its options, under Time of day"), ("APIS", "W1", "in its options, under Time of day"),
                                                                                                    ("Equipment labels", "W3", "bar at its top"), ("Remote care for the isolation room", "W1", "in its options, under Comfort systems"))),
          f"the five pictures that show a mode, a demo or a pressed button each say where to find it in the room they open {told}")
    check(told["What the patient sees"] == "", f"the picture whose link opens exactly what it shows says nothing extra {told}")
    shared = [o for o in opens if sum(1 for q in opens if q["href"] == o["href"]) > 1]
    check(len(shared) == 3 and all(o["says"] for o in shared), f"pictures that open the same room as another each say what they open {[(o['lead'], o['says']) for o in shared]}")
    # on a phone: one header row with a Menu button, and the room and the first action on the first screen
    pg.set_viewport_size({"width": 390, "height": 700})
    home = """(() => { const shown = e => getComputedStyle(e).display !== 'none', box = e => e.getBoundingClientRect(), nav = document.getElementById('nav'), menu = document.getElementById('menu');
      const links = [...nav.querySelectorAll('a')].map(a => box(a)), img = box(document.querySelector('.hero img')), act = box(document.querySelector('.hero .actions a'));
      return { header: Math.round(box(document.querySelector('.top')).height), menu: shown(menu), expanded: menu.getAttribute('aria-expanded'), nav: shown(nav), sideways: document.documentElement.scrollWidth > innerWidth,
               onScreen: shown(nav) ? links.filter(r => r.left >= 0 && r.right <= innerWidth && r.height >= 44).length : 0, columns: shown(nav) ? new Set(links.map(r => Math.round(r.left))).size : 0,
               picture: [Math.round(img.top), Math.round(img.bottom)], action: [Math.round(act.top), Math.round(act.bottom)], h: innerHeight, focus: document.activeElement.id }; })()"""
    h = pg.evaluate(home)
    check(not h["sideways"] and h["header"] <= 70 and h["menu"] and not h["nav"], f"on a phone the home page doesn't scroll sideways, and its header is one row with a Menu button {h}")
    # the first picture used to start more than a screen down, below the paragraph and three buttons
    check(0 < h["picture"][0] and h["picture"][1] <= h["h"] and h["picture"][1] <= h["action"][0] and h["action"][1] <= h["h"], f"on a phone the first screen shows the room, then the first action {h}")
    pg.click("#menu")
    h = pg.evaluate(home)
    check(h["expanded"] == "true" and h["onScreen"] == 9 and h["columns"] == 2, f"Menu shows all nine sections on screen, two to a row, each tall enough to tap {h}")
    pg.keyboard.press("Escape")
    h = pg.evaluate(home)
    check(h["expanded"] == "false" and not h["nav"] and h["focus"] == "menu", f"Esc closes the menu and leaves the keyboard on its button {h}")
    pg.click("#menu")
    pg.click("#nav a[href='#findings']")
    h = pg.evaluate(home)
    check(h["expanded"] == "false" and not h["nav"], f"choosing a section closes the menu {h}")
    ctx.close()
    # without scripts there is no Menu button, and the sections are the row that scrolls sideways
    ctx = b.new_context(viewport={"width": 390, "height": 700}, java_script_enabled=False)
    pg = ctx.new_page()
    pg.goto(URL.replace("configurator/", "index.html"))
    h = pg.evaluate("(() => { const nav = document.getElementById('nav'); return { menu: getComputedStyle(document.getElementById('menu')).display, nav: getComputedStyle(nav).display, links: nav.querySelectorAll('a').length, scrolls: nav.scrollWidth > nav.clientWidth, sideways: document.documentElement.scrollWidth > innerWidth }; })()")
    check(h["menu"] == "none" and h["nav"] != "none" and h["links"] == 9 and h["scrolls"] and not h["sideways"], f"without scripts the home page keeps its sections on screen, with no Menu button that would do nothing {h}")
    ctx.close()
    # that link opens the configurator straight into the tour
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.goto(URL + "?tour=guided")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    pg.wait_for_function("window.__config.guide().running", timeout=30000)
    check(pg.is_visible("#guide") and pg.evaluate("window.__config.guide().at") == 0, "?tour=guided starts the guided tour")
    check(pg.text_content("#panel a.back").strip() == "Adaptive ICU", "the configurator's link back names the site as the home page does")
    ctx.close()

    # ---------------------------------------------------------------- a first visit: the room's own controls first, and a line that says it moves
    def settles(expr, timeout=20000):
        try:
            pg.wait_for_function(expr, timeout=timeout)
            return True
        except PlaywrightTimeout:
            return False

    HINT = """(() => { const h = document.getElementById('lookHint'), r = h.getBoundingClientRect(), p = document.getElementById('panel').getBoundingClientRect(), s = getComputedStyle(h);
      return { text: h.textContent, shown: !h.hidden && s.opacity === '1', left: r.left, right: r.right, bottom: r.bottom, panelLeft: p.left, panelTop: p.top, w: innerWidth, h: innerHeight, clicks: s.pointerEvents }; })()"""
    faded, back = "getComputedStyle(document.getElementById('lookHint')).opacity === '0'", "getComputedStyle(document.getElementById('lookHint')).opacity === '1'"
    ctx = b.new_context(viewport={"width": 1280, "height": 800})
    pg = ctx.new_page()
    pg.goto(URL)
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    order = pg.evaluate("[...document.querySelectorAll('#panelBody > section:not([hidden]) > h2, #demos h2')].map(h => h.textContent.trim())")
    check(order[:6] == ["Theme", "Time of day", "Physiological Adaptive Comfort System", "Adaptive Patient Interface System", "View", "Room"],
          f"the panel opens on the room's look and its time of day, with the two demos next and View after them {order[:7]}")
    check(pg.is_hidden("#lookHint"), "an automated page isn't given the look-around hint, so screenshots show the room alone")
    pg.goto(URL + "?hint=1")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    drawn(pg)
    hint = pg.evaluate(HINT)
    check(hint["shown"] and hint["text"] == "Drag to look around. Scroll to move closer.", f"a first visit is told the room can be moved {hint}")
    check(hint["left"] >= 0 and hint["right"] <= hint["panelLeft"] and hint["bottom"] <= hint["h"] and hint["clicks"] == "none", f"the hint sits over the room, clear of the panel, and takes no clicks from it {hint}")
    shot(pg, "first_visit")
    pg.click("#openGuide")
    check(settles(faded), "the hint steps aside while the guided tour has the room")
    pg.click("#guideExit")
    pg.wait_for_function("!window.__config.guide().running", timeout=60000)
    check(settles(back), "and comes back afterwards, for someone who still hasn't looked around")
    pg.mouse.move(400, 400); pg.mouse.down(); pg.mouse.move(470, 420, steps=4); pg.mouse.up()
    check(gone(pg, "#lookHint"), "the hint leaves the first time the room is dragged")
    pg.goto(URL + "?hint=1&again=1")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    drawn(pg)
    check(pg.is_hidden("#lookHint"), "someone who has looked around isn't told again in the same visit")
    ctx.close()
    ctx = b.new_context(viewport={"width": 1280, "height": 800})  # a new visit
    pg = ctx.new_page()
    pg.goto(URL + "?hint=1")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    drawn(pg)
    check(pg.evaluate(HINT)["shown"], "a new visit is told again")
    pg.keyboard.press("Tab")
    check(pg.evaluate("document.activeElement.id") == "c" and pg.text_content("#lookHint") == "Arrow keys look around. Plus and minus move closer.", f"from the keyboard, the hint is in keys ({pg.text_content('#lookHint')!r})")
    pg.keyboard.press("ArrowLeft")
    check(gone(pg, "#lookHint"), "and looking around with the keys takes it down")
    ctx.close()
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    pg = ctx.new_page()
    pg.goto(URL + "?hint=1")
    pg.wait_for_function("window.__configReady === true", timeout=180000)
    drawn(pg)
    hint = pg.evaluate(HINT)
    check(hint["shown"] and hint["text"] == "Drag to look around. Pinch to move closer.", f"phone: the hint is in touch terms {hint}")
    check(hint["left"] >= 0 and hint["right"] <= hint["w"] and hint["bottom"] <= hint["panelTop"], f"phone: it sits above the closed sheet, inside the screen {hint}")
    pg.tap("#sheet")
    check(settles(faded), "phone: an open sheet has the lower half of the screen, so the hint goes")
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
    for what, init, words in [("no WebGL 2", NO_WEBGL2, "using a different browser"), ("no import maps", NO_IMPORT_MAPS, "too old to show the 3D room")]:
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
    # every room mode stays on a phone, and Emergency works by touch
    hud = pg.evaluate("(() => { const r = document.getElementById('modeBar').getBoundingClientRect(); return { right: Math.round(r.right), width: innerWidth, small: [...document.querySelectorAll('#modeBar button')].filter(b => b.getBoundingClientRect().height < 40).map(b => b.textContent) }; })()")
    check(hud["right"] <= hud["width"] and not hud["small"], f"phone: every room mode is on screen and large enough to tap {hud}")
    pg.tap("#modeBar button[data-mode='emergency']")
    check(pg.is_visible("#modeBanner") and pg.evaluate("window.__config.mode().current") == "emergency", "phone: Emergency works by touch")
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
    # the buttons on show: the card holds the steps' controls and the ending's, one set at a time
    on_card = "(() => { const r = document.getElementById('guide').getBoundingClientRect(), s = document.getElementById('panel').getBoundingClientRect(), on = [...document.querySelectorAll('#guide button')].filter(b => b.offsetParent); return { bottom: r.bottom, sheetTop: s.top, left: r.left, right: r.right, w: innerWidth, buttons: on.map(b => b.textContent), small: on.filter(b => b.getBoundingClientRect().height < 40).map(b => b.textContent) }; })()"
    card = pg.evaluate(on_card)
    check(card["bottom"] <= card["sheetTop"] + 1 and card["left"] >= 0 and card["right"] <= card["w"] and not card["small"] and len(card["buttons"]) == 5, f"phone: the guided tour's card fits above the sheet {card}")
    shot(pg, "phone_guide")
    # its ending on a phone: the same card, and Try it yourself brings the options up, since they are behind a closed sheet
    pg.tap("#guidePlay")
    last = pg.evaluate("+document.getElementById('guideCount').textContent.split(' of ')[1] - 1")  # the main button's tour: its last step
    pg.evaluate(f"window.__config.guideGo({last})")
    pg.wait_for_function(f"window.__config.guide().at === {last}", timeout=60000)
    pg.tap("#guideNext")
    pg.wait_for_function("window.__config.guide().ended", timeout=60000)
    drawn(pg)
    card = pg.evaluate(on_card)
    check(card["bottom"] <= card["sheetTop"] + 1 and card["left"] >= 0 and card["right"] <= card["w"] and not card["small"] and card["buttons"] == ["Try it yourself", "Watch again"], f"phone: the tour's ending fits above the sheet, with both buttons big enough to tap {card}")
    shot(pg, "phone_guide_ending")
    pg.wait_for_timeout(700)
    pg.tap("#guideTry")
    drawn(pg)
    theme = pg.evaluate("(() => { const r = document.querySelector('#themes button').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: innerHeight, open: document.getElementById('panel').classList.contains('open'), focus: !!document.activeElement.closest('#themes') }; })()")
    check(gone(pg, "#guide") and theme["open"] and theme["focus"] and 0 < theme["top"] and theme["bottom"] < theme["h"], f"phone: Try it yourself brings the room's options up, with the themes on screen {theme}")
    pg.tap("#sheet")
    drawn(pg)
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
    # Suggest a room on a phone: the form fits, and the panel opens to show what changed
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
print("  configurator check: ok (load, budget, views, orbit limits, moves, dollhouse, sun, time, every option, smart glass, palms, themes, spec codes, summary, tour, grilles and their plan, the smart clinical wall and the workstation, room modes with Family visit and Cleaning, the two tours and Transform the ICU, the digital twin, room intelligence and the room safety scan, equipment and cables, Light across 24 hours, when someone comes in, accessibility, adaptive quality, stats readout, phone)")
