"""Headless check of output/viewer/index.html. Exits non-zero on any failure.

Loads without console errors; Orbit / First person / Top work; the object list selects a room;
clicking names an object; walking moves the camera; walking into the facade is stopped; the
minimap teleports. Screenshots -> renders/viewer_*.png.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# default: the offline file; pass a URL to test the website's copy, which fetches and unpacks the model
url = sys.argv[1] if len(sys.argv) > 1 else "file://" + os.path.join(ROOT, "output", "viewer", "index.html")
spec = json.load(open(os.path.join(ROOT, "spec", "icu_spec.json")))
fail = []


def check(ok, msg):
    if not ok:
        fail.append(msg)


def camera_still(pg):
    """Wait until the camera stops: a view change flies in over a second, longer on a busy machine."""
    last = None
    for _ in range(60):
        c = pg.evaluate("window.__camera()")
        if last and max(abs(a - b) for a, b in zip(c, last)) < 1e-4:
            return
        last = c
        pg.wait_for_timeout(250)


with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1366, "height": 820})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "fonts.g" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url, timeout=120000)  # a busy machine can take a while to fetch Three.js
    pg.wait_for_function("window.__viewerReady === true || (window.__viewerErrors || []).length > 0", timeout=180000)
    errs += pg.evaluate("window.__viewerErrors")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_orbit.png"))

    rows = pg.locator(".row").count()
    check(rows >= 20, f"object list has only {rows} rows")
    pg.locator(".row").first.click()
    pg.wait_for_timeout(800)
    title = pg.inner_text("#iTitle")
    check(title.startswith("Room"), f"first list row did not select a room (card: {title!r})")

    pg.evaluate("window.__view('top')"); pg.wait_for_timeout(1000)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_top.png"))

    pg.evaluate("window.__view('first')"); pg.wait_for_timeout(1000)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_first_person.png"))
    picked = pg.evaluate("window.__pick(683, 470)")
    card = pg.inner_text("#iTitle") if picked else ""
    print(f"  first person: picked {picked!r} -> card {card!r}")
    check(bool(picked and card), "click-to-name returned nothing in first person")

    p0 = pg.evaluate("window.__walker()")
    # the software renderer runs at about 1 frame/s, so hold the key long enough for a few frames
    p1 = pg.evaluate("window.__walk('KeyW', 4000)")
    moved = ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** 0.5
    print(f"  walked {moved:.2f} m forward")
    check(moved > 0.1, "W did not move the camera")

    # walk straight at the west facade from 1 m away: the upstand must stop us
    start = pg.evaluate("window.__walker()")
    k = 0.2162
    face_x = 1.72 + k * start[1]
    pg.evaluate(f"window.__teleport({face_x + 1.0}, {start[1]})")
    pg.keyboard.down("ShiftLeft")
    end = pg.evaluate("window.__walk('KeyW', 4000)")
    pg.keyboard.up("ShiftLeft")
    print(f"  facade test: inner face x={face_x:.2f}, stopped at x={end[0]:.2f}")
    check(end[0] > face_x + 0.1, "walked through the facade")

    # drop the person by dragging the toolbar button onto open corridor floor (top view)
    pg.evaluate("window.__view('top')"); pg.wait_for_timeout(800); camera_still(pg)
    tx, ty = spec["cameras"].get("corridor_eye", [22.3, 27.0])
    sx, sy = pg.evaluate(f"window.__project({tx}, {ty}, 0)")
    bb = pg.locator("#drop").bounding_box()
    pg.mouse.move(bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2); pg.mouse.down()
    for i in range(1, 11):
        pg.mouse.move(bb["x"] + (sx - bb["x"]) * i / 10, bb["y"] + (sy - bb["y"]) * i / 10)
    pg.mouse.up(); pg.wait_for_timeout(1600)
    w = pg.evaluate("window.__walker()"); m = pg.evaluate("window.__mode()")
    print(f"  drag-drop on corridor ({tx}, {ty}) -> mode {m}, person at ({w[0]:.2f}, {w[1]:.2f})")
    check(m == "first" and abs(w[0] - tx) < 0.4 and abs(w[1] - ty) < 0.4, "dragging the person onto the corridor did not put you there")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_dropped.png"))

    # dropping on a wall is refused and leaves you where you were
    pg.evaluate("window.__view('top')"); pg.wait_for_timeout(600)
    wall = [10.0, 31.8]  # the north exterior wall
    ok_wall = pg.evaluate(f"window.__drop({wall[0]}, {wall[1]})")
    w2 = pg.evaluate("window.__walker()")
    print(f"  drop on wall accepted={ok_wall}, help: {pg.inner_text('#help')[:60]!r}")
    check(ok_wall is False and abs(w2[0] - w[0]) < 0.01, "a drop onto a wall was accepted")

    # orbit shows the person; clicking it goes into their eyes; V gives the behind view
    pg.evaluate("window.__view('first')"); pg.wait_for_timeout(300)
    pg.evaluate("window.__view('orbit')"); pg.wait_for_timeout(1000)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_person_orbit.png"))
    hx, hy = pg.evaluate(f"window.__project({w[0]}, {w[1]}, 1.2)")
    pg.mouse.click(hx, hy); pg.wait_for_timeout(1600)
    check(pg.evaluate("window.__mode()") == "first", "clicking the person did not enter first person")
    pg.keyboard.press("v"); pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_behind.png"))
    check(pg.get_attribute("#cam3", "aria-pressed") == "true", "V did not switch to the view from behind")
    pg.keyboard.press("v")

    # extinguisher cabinets: named when selected and when clicked, solid head-on, and not in the way along the wall
    fire = spec["fire"]["cabinets"]
    pg.evaluate("window.__view('first')"); pg.wait_for_timeout(600)
    if pg.get_attribute("#cam3", "aria-pressed") == "true":
        pg.keyboard.press("v")
    title = pg.evaluate("window.__select('fire')")
    check("extinguisher" in title.lower(), f"selecting the extinguisher cabinets names them (card: {title!r})")
    for c in fire:
        (x, y), (nx, ny) = c["face_at"], c["normal"]
        tx, ty = ny, -nx  # along the wall
        pg.evaluate(f"window.__teleport({x + nx * 1.3}, {y + ny * 1.3}); window.__face({x}, {y})")
        pg.wait_for_timeout(1500)
        sx, sy = pg.evaluate(f"window.__project({x}, {y}, 1.1)")
        picked = pg.evaluate(f"window.__pick({sx}, {sy})")
        print(f"  cabinet {c['id']}: clicked {picked!r}")
        check(picked == "fire", f"clicking cabinet {c['id']} names it (got {picked!r})")
        if c is fire[0]:
            pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_fire_cabinet.png"))
        check(not pg.evaluate(f"window.__pathClear({x + nx * 0.8}, {y + ny * 0.8}, {x + nx * 0.05}, {y + ny * 0.05})"), f"walking straight into cabinet {c['id']} is stopped")
        px, py = x + nx * 0.45, y + ny * 0.45
        along = pg.evaluate(f"window.__pathClear({px - tx * 1.2}, {py - ty * 1.2}, {px + tx * 1.2}, {py + ty * 1.2})")
        check(along, f"walking along the wall past cabinet {c['id']} isn't blocked")

    # ventilation grilles: named, labelled as a concept, and hidden with the ceiling. Or not in the model at all while they're hidden
    parts = pg.evaluate("window.__ceilingParts()")
    if spec["ventilation"]["show_in_model"]:
        for kind in ("supply", "return", "exhaust"):
            title = pg.evaluate(f"window.__select('vent_{kind}')")
            check(kind in title.lower(), f"selecting the {kind} grilles names them (card: {title!r})")
        check("concept" in pg.inner_text("#iNotes" if pg.locator("#iNotes").count() else "#info").lower(), "the grilles' card says they're a concept")
        check(all(f"vent_{k}" in parts for k in ("supply", "return", "exhaust")), f"the grilles hide with the ceiling {parts[:6]}")
    else:
        check(not [p for p in parts if p.startswith("vent_")], f"the grilles are hidden, so the walkthrough has none {parts[:6]}")

    ok = pg.evaluate("window.__miniGo(0.5, 0.45)")
    check(ok is not None, "minimap click failed")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_minimap_jump.png"))

    pg.set_viewport_size({"width": 400, "height": 820}); pg.wait_for_timeout(800)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check(sw <= 400, f"horizontal overflow at phone width ({sw}px)")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_phone.png"))

    # the website's copy links the two rooms the configurator has; the offline file doesn't link anywhere
    pg.set_viewport_size({"width": 1366, "height": 820}); pg.wait_for_timeout(400)
    tags = pg.evaluate("[...document.querySelectorAll('.row')].filter(r => r.querySelector('.cfg')).map(r => r.querySelector('.lb').firstChild.textContent)")
    if url.startswith("http"):
        check(sorted(tags) == ["Room W1 · isolation", "Room W3"], f"the configurable rooms are marked in the list {tags}")
        pg.locator(".row", has_text="Room W3").first.click(); pg.wait_for_timeout(500)
        href = pg.get_attribute("#iConfigure", "href") if pg.is_visible("#iConfigure") else None
        check(href == "../configurator/?room=W3", f"W3's card links to it in the configurator ({href})")
    else:
        check(not tags and not pg.is_visible("#iConfigure"), "the offline file has no configurator links")

    check(not errs, f"console errors: {errs[:3]}")

    # an idle page stops drawing; using it draws again
    # (the camera's damping can take a moment to come to rest on a slow software renderer, so it gets a few tries)
    pg.evaluate("window.__view('orbit')")
    for _ in range(6):
        f0 = pg.evaluate("window.__viewerFrames"); pg.wait_for_timeout(2500); f1 = pg.evaluate("window.__viewerFrames")
        if f1 == f0:
            break
    check(f1 == f0, f"an idle page stops drawing ({f1 - f0} frames in 2.5 s, after waiting up to 15 s to settle)")
    pg.mouse.move(300, 400); pg.mouse.move(340, 420); pg.wait_for_timeout(1200)
    check(pg.evaluate("window.__viewerFrames") > f1, "moving the pointer over it draws again")

    # a touch phone: one slim row of controls, and a joystick that walks forward, back and sideways
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
    tp = ctx.new_page()
    tp.goto(url, timeout=120000)
    tp.wait_for_function("window.__viewerReady === true || (window.__viewerErrors || []).length > 0", timeout=180000)
    bar_h = tp.evaluate("document.getElementById('bar').offsetHeight")
    names = tp.evaluate("[...document.querySelectorAll('#bar button')].filter(b => !b.hidden).map(b => b.textContent.trim())")
    check(bar_h <= 64 and {"Orbit", "First person", "Top", "Place person"} <= set(names), f"phone: the controls fit one slim row, with none left out ({bar_h}px) {names}")
    tp.evaluate("window.__view('first')"); tp.wait_for_timeout(1500)
    check(tp.is_visible("#pad .stick"), "phone: first person shows the walking joystick")
    for label, (dx, dy) in [("forward", (0, -60)), ("sideways", (60, 0))]:
        p0 = tp.evaluate("window.__walker()")
        bb = tp.locator("#pad .stick").bounding_box(); cx, cy = bb["x"] + bb["width"] / 2, bb["y"] + bb["height"] / 2
        tp.mouse.move(cx, cy); tp.mouse.down(); tp.mouse.move(cx + dx, cy + dy, steps=5); tp.wait_for_timeout(4000); tp.mouse.up()
        p1 = tp.evaluate("window.__walker()")
        moved = ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** 0.5
        print(f"  joystick {label}: {moved:.2f} m")
        check(moved > 0.1, f"phone: the joystick walks {label} ({moved:.2f} m)")
    tp.screenshot(path=os.path.join(ROOT, "renders", "viewer_phone_walk.png"))
    ctx.close()

    # a browser without WebGL 2 is told why, instead of seeing "Loading" for ever; the website's copy also links to the pictures
    ctx = b.new_context(viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
    ctx.add_init_script("HTMLCanvasElement.prototype.getContext = (g => function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); })(HTMLCanvasElement.prototype.getContext);")
    pg = ctx.new_page()
    pg.goto(url)
    pg.wait_for_function("window.__cantDraw", timeout=60000)
    pg.wait_for_timeout(2000)
    text = pg.inner_text("#load") if pg.is_visible("#load") else ""
    check("it needs WebGL 2" in text, f"without WebGL 2 the page says why it can't draw ({text[:80]!r})")
    check(not pg.is_visible("#bar"), "without WebGL 2 there's no toolbar of controls that would do nothing")
    if url.startswith("http"):
        check(pg.locator("#load a").get_attribute("href") == "../", "without WebGL 2 the website links to the pictures on the home page")
    ctx.close()
    b.close()
print("  viewer check: " + ("FAILED " + "; ".join(fail) if fail else "ok (views, list, click-to-name, walking, collisions, person drop, behind view, extinguisher cabinets, minimap, phone width, idle drawing, phone joystick, no-WebGL message)"))
sys.exit(1 if fail else 0)
