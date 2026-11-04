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


with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1366, "height": 820})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" and "fonts.g" not in m.text else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url)
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
    pg.evaluate("window.__view('top')"); pg.wait_for_timeout(800)
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

    ok = pg.evaluate("window.__miniGo(0.5, 0.45)")
    check(ok is not None, "minimap click failed")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_minimap_jump.png"))

    pg.set_viewport_size({"width": 400, "height": 820}); pg.wait_for_timeout(800)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check(sw <= 400, f"horizontal overflow at phone width ({sw}px)")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_phone.png"))

    check(not errs, f"console errors: {errs[:3]}")
    b.close()
print("  viewer check: " + ("FAILED " + "; ".join(fail) if fail else "ok (views, list, click-to-name, walking, collisions, person drop, behind view, minimap, phone width)"))
sys.exit(1 if fail else 0)
