# Adaptive ICU: performance baseline

Measured on 8 November 2026, before any Adaptive ICU change. Main was at `d6f295a`, tagged `pre-adaptive`, and was also what GitHub Pages served.

## How it was measured

- **Browser:** Playwright's Chromium in headless mode on an Apple M5 Mac. WebGL reported `ANGLE Metal Renderer: Apple M5`, so this is the real GPU, not a software renderer.
- **Cache:** cold, with a new browser context for each viewport.
- **Runs:** one per row, so treat small differences as noise.
- **Load:** milliseconds from navigation to the page's own ready flag (`__viewerReady` or `__configReady`). That is when the model is in place and the first frame can draw.
- **Walkthrough FPS:** frames per second over 8 s while idle. It redraws every frame even when nothing moves.
- **Configurator FPS:** it draws only when something changes, so it was measured while orbiting a little on every frame for 8 s.
- **Configurator draw cost:** the configurator's own `perf()` timer, which times one draw plus a pixel read, so it measures the GPU finishing.
- **Download:** Resource Timing transfer size. It may undercount cross-origin files that don't send timing headers.

## Results

| Page | Viewport | Where | Ready (ms) | Download (KB) | FPS | Draw, median / p95 (ms) |
|---|---|---|---|---|---|---|
| Walkthrough | 1440×900 @2x | localhost | 2135 | 1988 | 60 idle | |
| Walkthrough | 1440×900 @2x | live site | 904 | 1988 | 60 idle | |
| Walkthrough | 1920×1080 @1x | localhost | 857 | 1986 | 60 idle | |
| Walkthrough | 1920×1080 @1x | live site | 624 | 1988 | 60 idle | |
| Configurator (W1) | 1440×900 @2x | localhost | 386 | 537 | 60 orbiting | 20.7 / 22.0 at pixel ratio 1.67 |
| Configurator (W1) | 1440×900 @2x | live site | 989 | 413 | 60 orbiting | 20.8 / 22.1 at pixel ratio 1.67 |
| Configurator (W1) | 1920×1080 @1x | localhost | 309 | 537 | 60 orbiting | 13.4 / 14.0 at pixel ratio 1 |
| Configurator (W1) | 1920×1080 @1x | live site | 447 | 413 | 60 orbiting | 13.4 / 14.1 at pixel ratio 1 |

FPS is capped by the display's 60 Hz refresh, so the configurator's draw cost is the better number to compare after later changes. At 1440×900 @2x the timed draw (21 ms) is longer than one 60 Hz frame (16.7 ms), but orbiting still held 60 fps. The timer makes the GPU finish before it stops, so it overstates the cost of a normal, pipelined frame.

The localhost walkthrough row at 2135 ms was the very first page load, which also fetched Three.js from the CDN. Later loads were faster.

## After phase 1

Measured on the evening of 8 November 2026 on the live site at `06628b9`, the same way, twice. It includes the teammate's APIS, PACS and patient figure, and today's work: the cleanup, Patient view, room modes, saved rooms, placed items, Clinical view, the phone walkthrough and the guided tour.

| Page | Viewport | Ready (ms), run 1 / 2 | Download (KB) | FPS | Draws per second while idle | Draw, median / p95 (ms) |
|---|---|---|---|---|---|---|
| Walkthrough | 1440×900 @2x | 1215 / 836 | 1911 | 60 idle | **0** | |
| Walkthrough | 1920×1080 @1x | 786 / 949 | 1912 | 60 idle | **0** | |
| Configurator (W1) | 1440×900 @2x | 1178 / 1197 | 489 / 525 | 60 orbiting | | 20.6 / 21.5 |
| Configurator (W1) | 1920×1080 @1x | 489 / 1203 | 525 | 60 orbiting | | 13.7–13.8 / 14.1 |

What changed:
- **The walkthrough no longer draws while idle.** Before, it drew every frame, about 60 a second, idle or not. Now it draws only when something changes, which saves the most on a phone's battery.
  - The FPS column still counts animation-frame callbacks, so it reads 60 either way.
  - The new column counts actual draws from the page's own counter.
- **The configurator's draw cost is unchanged** within noise: 20.6 against 20.7 ms, and 13.7–13.8 against 13.4 ms.
- **The configurator downloads 75–110 KB more:** the APIS, PACS, patient, modes, saved rooms, placed items, Clinical view and guided tour modules.
- **Its ready time** at 1440×900 @2x was about 200 ms slower in both runs. Cold-cache load times vary a lot from run to run (489 to 1203 ms for the same page), so other differences are within noise.

## Not measured yet

- **Safari:** it can't be driven here without "Allow Remote Automation", and Playwright's WebKit is not Safari.
- **Phones and tablets:** desktop emulation is not a real device, so these need a test on a real phone and tablet.
- **Integrated or older GPUs.**

The script also records the walkthrough's draws per second while idle, from `window.__viewerFrames`. To compare after each phase, run `.venv/bin/python -I scripts/perf_baseline.py . local-<phase>` for this checkout, or pass the site's URL instead of `.`. It writes `build/perf_<label>.json`, which git ignores.
