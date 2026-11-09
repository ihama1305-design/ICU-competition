"""Performance baseline: load time (navigation to the page's ready flag) and average FPS, cold cache, one run per row.
Usage: perf_baseline.py <site root or https URL> <label>. Writes build/perf_<label>.json. Not part of run_all.sh: it measures, it doesn't pass or fail.
Needs a real GPU to mean anything; it prints the WebGL renderer so you can tell. See docs/adaptive-icu-baseline.md."""
import functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

SRC, LABEL = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
os.makedirs(OUT, exist_ok=True)
if SRC.startswith("http"):
    BASE = SRC.rstrip("/")
else:
    H = functools.partial(http.server.SimpleHTTPRequestHandler, directory=SRC); H.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), H); threading.Thread(target=srv.serve_forever, daemon=True).start()
    BASE = f"http://127.0.0.1:{srv.server_address[1]}"

GPU = """() => { const c = document.createElement('canvas').getContext('webgl2'); if (!c) return 'no webgl2';
  const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER); }"""
# animation-frame callbacks over a fixed window: how responsive the page is. Since 8 November the walkthrough draws only when
# something changes, so this no longer counts draws; VIEWER_DRAWS does, from the page's own counter
VIEWER_FPS = """async s => { let n = 0, on = true; const f = () => { n++; if (on) requestAnimationFrame(f); }; requestAnimationFrame(f);
  await new Promise(r => setTimeout(r, s * 1000)); on = false; return +(n / s).toFixed(1); }"""
VIEWER_DRAWS = """async s => { if (window.__viewerFrames === undefined) return null; const f0 = window.__viewerFrames;
  await new Promise(r => setTimeout(r, s * 1000)); return +((window.__viewerFrames - f0) / s).toFixed(1); }"""
# the configurator draws on demand: orbit a little every frame and count the frames it really drew
CONFIG_FPS = """async s => { const c = window.__config, f0 = c.frames(); const end = performance.now() + s * 1000;
  while (performance.now() < end) { c.orbit(0.01, 0); await new Promise(requestAnimationFrame); }
  return +((c.frames() - f0) / s).toFixed(1); }"""

def load(ctx, path, flag):
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + path, wait_until="commit")
    pg.wait_for_function(f"window.{flag} === true", timeout=120000)
    ms = pg.evaluate("performance.now()")
    kb = pg.evaluate("performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024")
    return pg, round(ms), round(kb), errs

rows = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", headless=True, args=["--enable-gpu", "--ignore-gpu-blocklist"])
    for name, vp, dpr in [("desktop 1440x900 @2x", {"width": 1440, "height": 900}, 2), ("desktop 1920x1080 @1x", {"width": 1920, "height": 1080}, 1)]:
        ctx = b.new_context(viewport=vp, device_scale_factor=dpr)
        pg, ms, kb, errs = load(ctx, "/viewer/", "__viewerReady")
        gpu = pg.evaluate(GPU); pg.wait_for_timeout(1500)
        idle = pg.evaluate(VIEWER_FPS, 8)
        draws = pg.evaluate(VIEWER_DRAWS, 8)  # null before draw-on-change existed
        rows.append(dict(page="walkthrough", view=name, ready_ms=ms, transfer_kb=kb, fps_idle=idle, draws_per_s_idle=draws, gpu=gpu, errors=errs)); pg.close()
        pg, ms, kb, errs = load(ctx, "/configurator/", "__configReady")
        pg.wait_for_timeout(1500)
        fps = pg.evaluate(CONFIG_FPS, 8); perf = pg.evaluate("window.__config.perf(4)")
        rows.append(dict(page="configurator", view=name, ready_ms=ms, transfer_kb=kb, fps_orbit=fps, perf=perf, errors=errs)); ctx.close()
    b.close()
json.dump(dict(label=LABEL, base=BASE, rows=rows), open(os.path.join(OUT, f"perf_{LABEL}.json"), "w"), indent=1)
for r in rows: print(json.dumps(r))
