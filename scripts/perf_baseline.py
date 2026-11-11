"""Performance baseline: load time (navigation to the page's ready flag), FPS and draw cost, cold cache, one run per row.
Usage: perf_baseline.py <site root or https URL> <label> [--viewports 1440x900@2,2560x1440@2] [--tiers high,low] [--gpu swiftshader] [--as-visitor] [--pages configurator] [--states default,...]
Writes build/perf_<label>.json. Not part of run_all.sh: it measures, it doesn't pass or fail.
Needs a real GPU to mean anything; it prints the WebGL renderer so you can tell. --gpu swiftshader is the worst case on purpose:
Chromium's software renderer, as on a machine whose GPU is blocklisted. See docs/adaptive-icu-baseline.md."""
import argparse, functools, http.server, json, os, threading
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("label")
ap.add_argument("--viewports", default="1440x900@2,1920x1080@1", help="comma-separated WxH@DPR")
ap.add_argument("--tiers", default="", help="comma-separated tiers to force with ?tier=; empty lets the page choose")
ap.add_argument("--gpu", default="hardware", choices=["hardware", "swiftshader"])
ap.add_argument("--seconds", type=float, default=8, help="seconds per FPS window")
ap.add_argument("--timeout", type=float, default=300, help="seconds to wait for a page to be ready")
ap.add_argument("--pages", default="walkthrough,configurator", help="which pages to measure")
ap.add_argument("--states", default="default", help="comma-separated room states to time in the configurator, from STATES; 'all' for every one")
ap.add_argument("--as-visitor", action="store_true", help="hide the automation flag, so Auto times the device and picks a tier as it does for a visitor")
args = ap.parse_args()
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "build")
os.makedirs(OUT, exist_ok=True)
if args.src.startswith("http"):
    BASE = args.src.rstrip("/")
else:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 128  # the page asks for dozens of modules at once; the default backlog of 5 resets some of them
    srv = Server(("127.0.0.1", 0), functools.partial(Quiet, directory=args.src)); threading.Thread(target=srv.serve_forever, daemon=True).start()
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
# This times one draw from outside the page: every animation-frame callback that drew is followed by a one-pixel read, which
# waits for the GPU to finish. It needs no change to the page, so it measures any version of it, and it follows whichever
# draw counter the page keeps (the walkthrough's or the configurator's). Installed before the page's scripts run.
# The configurator's own perf() is not this: it draws once itself and the page draws once more in the same frame because the
# view moved, so its figure is about two draws. Rows keep it as `perf` so older tables stay comparable; `draw1` is one draw.
TIMER = """(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
    const ctx = get.call(this, kind, ...rest);
    if (kind === 'webgl2' && ctx && this.id === 'c') window.__perfGL = ctx;
    return ctx;
  };
  const raf = window.requestAnimationFrame.bind(window), px = new Uint8Array(4);
  window.__perfTimes = null; // set to [] to start recording
  const drawn = () => window.__viewerFrames ?? window.__configFrames;
  window.requestAnimationFrame = cb => raf(ts => {
    if (!window.__perfTimes) return cb(ts);
    const f0 = drawn(), t0 = performance.now();
    cb(ts);
    if (drawn() !== f0 && window.__perfGL) {
      const gl = window.__perfGL; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      window.__perfTimes.push(performance.now() - t0);
    }
  });
})();"""
VIEWER_PERF = """async s => { window.__perfTimes = []; const end = performance.now() + s * 1000;
  while (performance.now() < end) { window.__viewerInvalidate(); await new Promise(r => setTimeout(r, 0)); await new Promise(requestAnimationFrame); }
  const t = window.__perfTimes.sort((a, b) => a - b); window.__perfTimes = null;
  const q = window.__viewerQuality ? window.__viewerQuality() : {};
  return { frames: t.length, medianMs: t.length ? +t[t.length >> 1].toFixed(1) : null, p95Ms: t.length ? +t[Math.floor(t.length * 0.95)].toFixed(1) : null,
    ratio: q.ratio, tier: q.tier, antialias: q.antialias, transmission: q.transmission, pixels: Math.round(innerWidth * innerHeight * (q.ratio || 1) ** 2) }; }"""


# One configurator draw while the view moves: orbit a little, let the page draw its own frame, and let TIMER time it.
CONFIG_DRAW1 = """async s => { const c = window.__config; for (let i = 0; i < 20; i++) { c.orbit(0.01, 0); await new Promise(requestAnimationFrame); }
  window.__perfTimes = []; const end = performance.now() + s * 1000;
  while (performance.now() < end) { c.orbit(0.01, 0); await new Promise(requestAnimationFrame); }
  const t = window.__perfTimes.sort((a, b) => a - b); window.__perfTimes = null;
  return { frames: t.length, medianMs: t.length ? +t[t.length >> 1].toFixed(1) : null, p95Ms: t.length ? +t[Math.floor(t.length * 0.95)].toFixed(1) : null }; }"""
# Room states for the configurator, each set up from a fresh load by steps on window.__config:
#   ("theme", id)            a theme: calm, desert or family
#   ("time", stop)           a time of day: morning, midday, afternoon, sunset or night
#   ("set", group, option)   any option by its ids in options.json, such as ("set", "scheme", "cove")
# "default" is the room as it loads, in the afternoon. REPORT.md's "heaviest" column is the slowest of all of these.
STATES = {
    "default": [],
    # every lighting scheme at night, when the room's lights are all it has: each light costs on every pixel
    "panels-night": [("set", "scheme", "panels"), ("time", "night")],
    "cove-night": [("set", "scheme", "cove"), ("time", "night")],
    "downlights-night": [("set", "scheme", "downlights"), ("time", "night")],
    "slot-night": [("set", "scheme", "slot"), ("time", "night")],
    "circadian-night": [("set", "scheme", "circadian"), ("time", "night")],
    # the other two themes by day (the default is Calm Clinical)
    "desert-day": [("theme", "desert")],
    "family-day": [("theme", "family")],
    # both moving pictures on, which also keep the page drawing while they're in view
    "screens-on": [("set", "tvplay", "on"), ("set", "aquarium", "digital")],
}
APPLY = """steps => { const c = window.__config;
  for (const [what, a, b] of steps) { if (what === 'theme') c.theme(a); else if (what === 'time') c.time(c.stops[a]); else if (what === 'set') c.set(a, b); else throw new Error('unknown step ' + what); }
  c.renderNow(); }"""


# Auto leaves a browser under automation alone, so the checks test the tier they force. This hides the flag, so a row with no
# forced tier shows what a visitor gets: Auto's timed draws, its pick, and the step-down while the view moves.
VISITOR = "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false });"
QUALITY = "() => (window.__viewerQuality ? window.__viewerQuality() : window.__config && window.__config.quality ? window.__config.quality() : null)"


def auto_done(pg, tier):
    """With --as-visitor and no forced tier, wait until Auto has timed its test draws and picked."""
    if args.as_visitor and not tier:
        pg.wait_for_function(f"(({QUALITY})() || {{}}).ms > 0", timeout=args.timeout * 1000)


def load(ctx, path, flag):
    pg = ctx.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(BASE + path, wait_until="commit")
    pg.wait_for_function(f"window.{flag} === true", timeout=args.timeout * 1000)
    ms = pg.evaluate("performance.now()")
    kb = pg.evaluate("performance.getEntriesByType('resource').reduce((a, r) => a + (r.transferSize || 0), 0) / 1024")
    return pg, round(ms), round(kb), errs


def viewport(s):
    size, dpr = s.split("@")
    w, h = size.split("x")
    return f"{w}x{h} @{dpr}x", {"width": int(w), "height": int(h)}, float(dpr)


launch = ["--enable-gpu", "--ignore-gpu-blocklist"] if args.gpu == "hardware" else ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]
tiers = [t for t in args.tiers.split(",") if t] or [None]
pages = args.pages.split(",")
states = list(STATES) if args.states == "all" else args.states.split(",")
rows = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="chromium", headless=True, args=launch)
    for vs in args.viewports.split(","):
        name, vp, dpr = viewport(vs)
        for tier in tiers:
            q = f"?tier={tier}" if tier else ""
            ctx = b.new_context(viewport=vp, device_scale_factor=dpr)
            ctx.add_init_script(TIMER)
            if args.as_visitor:
                ctx.add_init_script(VISITOR)
            if "walkthrough" in pages:
                pg, ms, kb, errs = load(ctx, f"/viewer/{q}", "__viewerReady")
                auto_done(pg, tier)
                gpu = pg.evaluate(GPU); pg.wait_for_timeout(1500)
                idle = pg.evaluate(VIEWER_FPS, args.seconds)
                draws = pg.evaluate(VIEWER_DRAWS, args.seconds)  # null before draw-on-change existed
                perf = pg.evaluate(VIEWER_PERF, 4)
                rows.append(dict(page="walkthrough", view=name, tier=tier or "auto", gpu_mode=args.gpu, ready_ms=ms, transfer_kb=kb, fps_idle=idle,
                                 draws_per_s_idle=draws, perf=perf, quality=pg.evaluate(QUALITY), gpu=gpu, errors=errs)); pg.close()
                print(json.dumps(rows[-1]), flush=True)
            for state in (states if "configurator" in pages else []):
                pg, ms, kb, errs = load(ctx, f"/configurator/{q}", "__configReady")
                auto_done(pg, tier)
                pg.evaluate(APPLY, STATES[state]); pg.wait_for_timeout(1500)  # a lighting scheme recompiles the first time it's chosen
                draw1 = pg.evaluate(CONFIG_DRAW1, 3)
                # the frame rate and the page's own two-draw timer only for the room as it loads, as older tables have them
                fps, perf = (pg.evaluate(CONFIG_FPS, args.seconds), pg.evaluate("window.__config.perf(4)")) if state == "default" else (None, None)
                rows.append(dict(page="configurator", view=name, tier=tier or "auto", state=state, gpu_mode=args.gpu, ready_ms=ms, transfer_kb=kb, fps_orbit=fps,
                                 draw1=draw1, perf=perf, quality=pg.evaluate(QUALITY), gpu=pg.evaluate(GPU), errors=errs)); pg.close()
                print(json.dumps(rows[-1]), flush=True)
            ctx.close()
    b.close()
json.dump(dict(label=args.label, base=BASE, gpu_mode=args.gpu, rows=rows), open(os.path.join(OUT, f"perf_{args.label}.json"), "w"), indent=1)
