"""Headless check of output/viewer/index.html: loads without errors, places work, clicking names things.
Screenshots -> renders/viewer_*.png. Exits non-zero on failure."""
import os
import sys

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
url = "file://" + os.path.join(ROOT, "output", "viewer", "index.html")
fail = []
with sync_playwright() as pw:
    b = pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    pg = b.new_page(viewport={"width": 1280, "height": 800})
    errs = []
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(url)
    pg.wait_for_function("window.__viewerReady === true || (window.__viewerErrors || []).length > 0", timeout=180000)
    errs += pg.evaluate("window.__viewerErrors")
    pg.wait_for_timeout(1500)
    pg.screenshot(path=os.path.join(ROOT, "renders", "viewer_floor.png"))
    for place, shot in (("Patient room", "viewer_room.png"), ("Nurse station", "viewer_corridor.png"), ("Top view", "viewer_top.png")):
        pg.evaluate(f"window.__go({place!r}, false)")
        pg.wait_for_timeout(1200)
        pg.screenshot(path=os.path.join(ROOT, "renders", shot))
    pg.evaluate("window.__go('Patient room', false)"); pg.wait_for_timeout(800)
    name = pg.evaluate("window.__pick(640, 470)")
    card = pg.inner_text("#infoName") if name else ""
    print(f"  picked {name!r} -> card {card!r}")
    if not name or not card:
        fail.append("click-to-name returned nothing in the patient room")
    if errs:
        fail.append(f"console errors: {errs[:3]}")
    b.close()
print("  viewer check: " + ("FAILED " + "; ".join(fail) if fail else "ok (no console errors, places and click-to-name work)"))
sys.exit(1 if fail else 0)
