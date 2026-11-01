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
url = "file://" + os.path.join(ROOT, "output", "viewer", "index.html")
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

    p0 = pg.evaluate("window.__camera()")
    p1 = pg.evaluate("window.__walk('KeyW', 1500)")
    moved = ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2) ** 0.5
    print(f"  walked {moved:.2f} m forward")
    check(moved > 0.1, "W did not move the camera")

    # walk straight at the west facade from 1 m away: the upstand must stop us
    start = pg.evaluate("window.__camera()")
    k = 0.2162
    face_x = 1.72 + k * start[1]
    pg.evaluate(f"window.__teleport({face_x + 1.0}, {start[1]})")
    pg.keyboard.down("ShiftLeft")
    end = pg.evaluate("window.__walk('KeyW', 4000)")
    pg.keyboard.up("ShiftLeft")
    print(f"  facade test: inner face x={face_x:.2f}, stopped at x={end[0]:.2f}")
    check(end[0] > face_x + 0.1, "walked through the facade")

    ok = pg.evaluate("window.__miniGo(0.5, 0.45)")
    check(ok is not None, "minimap click failed")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_minimap_jump.png"))

    pg.set_viewport_size({"width": 400, "height": 820}); pg.wait_for_timeout(800)
    sw = pg.evaluate("document.documentElement.scrollWidth")
    check(sw <= 400, f"horizontal overflow at phone width ({sw}px)")
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_phone.png"))

    check(not errs, f"console errors: {errs[:3]}")
    b.close()
print("  viewer check: " + ("FAILED " + "; ".join(fail) if fail else "ok (views, list, click-to-name, walking, collisions, minimap, phone width)"))
sys.exit(1 if fail else 0)
