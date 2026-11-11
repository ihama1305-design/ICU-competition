# Adaptive ICU: performance baseline

Measured on 8 November 2026, before any Adaptive ICU change. Main was at `d6f295a`, tagged `pre-adaptive`, and was also what GitHub Pages served.

## How it was measured

- **Browser:** Playwright's Chromium in headless mode on an Apple M5 Mac. WebGL reported `ANGLE Metal Renderer: Apple M5`, so this is the real GPU, not a software renderer.
- **Cache:** cold, with a new browser context for each viewport.
- **Runs:** one per row, so treat small differences as noise.
- **Load:** milliseconds from navigation to the page's own ready flag (`__viewerReady` or `__configReady`). That is when the model is in place and the first frame can draw.
- **Walkthrough FPS:** frames per second over 8 s while idle. It redraws every frame even when nothing moves.
- **Configurator FPS:** it draws only when something changes, so it was measured while orbiting a little on every frame for 8 s.
- **Configurator draw cost:** the configurator's own `perf()` timer, which times one draw plus a pixel read, so it measures the GPU finishing. (Later found to cover two draws: see "One configurator frame, taken apart".)
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

## Before phase 2: draw cost per tier

Measured on 10 November 2026 on `main` at `e92f613`, before any phase 2 change, served from this checkout. Same Apple M5 Mac, Playwright's headless Chromium, one run per row.

**New in the script:** tiers are forced with `?tier=`, and the walkthrough's draw is timed from outside the page. Every animation frame that draws is followed by a one-pixel read, so the time includes the GPU finishing, as the configurator's own `perf()` does. That makes it comparable across both pages and needs no change to either. The worst case uses Chromium's software renderer (`--gpu swiftshader`, which is `--use-angle=swiftshader`), as on a machine whose GPU is blocklisted.

| Page | Viewport | Renderer | Tier | Pixels drawn | Draw, median / p95 (ms) |
|---|---|---|---|---|---|
| Walkthrough | 1440×900 @2x | M5 GPU | High | 5.2 M (2x) | 16.0 / 17.8 |
| Walkthrough | 1440×900 @2x | M5 GPU | Low | 2.9 M (1.5x) | 8.9 / 9.9 |
| Walkthrough | 2560×1440 @2x | M5 GPU | High | **14.7 M** (2x) | 23.5 / 25.0 |
| Walkthrough | 2560×1440 @2x | M5 GPU | Low | 8.3 M (1.5x) | 9.0 / 9.5 |
| Configurator (W1) | 1440×900 @2x | M5 GPU | High | 3.6 M (1.67x) | 20.6 / 21.7 |
| Configurator (W1) | 1440×900 @2x | M5 GPU | Low | 2.9 M (1.5x) | 13.2 / 14.1 |
| Configurator (W1) | 2560×1440 @2x | M5 GPU | High | 3.7 M (1x) | 21.5 / 22.3 |
| Configurator (W1) | 2560×1440 @2x | M5 GPU | Low | 3.7 M (1x) | 15.7 / 16.6 |
| Walkthrough | 1440×900 @2x | SwiftShader | High | 5.2 M (2x) | about 4,100 (1 frame) |
| Configurator (W1) | 1440×900 @2x | SwiftShader | High | 3.6 M (1.67x) | about 11,800 (1 frame) |
| Walkthrough | 1440×900 @2x | SwiftShader | Low | 2.9 M (1.5x) | about 310 (11 frames) |
| Configurator (W1) | 1440×900 @2x | SwiftShader | Low | 2.9 M (1.5x) | about 8,300 (1 frame) |

**Corrected later on 10 November.** This table first said the configurator on Low "didn't finish loading in 5 minutes" on the software renderer, and had no walkthrough Low row. That was the script, not the page: its local test server queued 5 connections at a time, the configurator asks for about 40 files, many of them at once, and in a test of four cold loads two had one file reset. `06` and `08` already allowed for this, and the script does now. The two Low rows above were measured again on the same `e92f613` with that fixed: the configurator was ready in 5.6 s.

What this shows:
- **Laptops got High by default, phones got Low.** The tier was chosen from touch versus mouse, so every laptop paid for High: transmission glass on 41 meshes in the walkthrough; bloom and its multisampled target, transmission glass and 2048 px shadows in the configurator.
- **The walkthrough had no pixel budget.** At 2560×1440 @2x it drew 14.7 million pixels a frame on High, four times the configurator's 3.6 million cap.
- **On this GPU, Low costs well under High:** 0.38 to 0.56 of it in the walkthrough, and 0.64 to 0.73 in the configurator.
  - In the walkthrough, Low's time hardly changes with screen size (8.9 against 9.0 ms), so the transmission glass, not the pixel count, is most of what High adds.
- **The software renderer** took 4 s and 12 s for one High frame, and 0.3 s and 8 s on Low.
  - These numbers show how bad the worst case is. **No threshold is tuned from them**: Auto's thresholds come from the Mac figures above and in REPORT.md's "Performance", and from real devices' `?stats=1` readouts.
- **All frame rates read 60**, because the display caps them. The draw times are what to compare.

Raw rows are in `build/perf_p2-before-hw.json` and `build/perf_p2-before-sw-high.json`. To repeat: `.venv/bin/python -I scripts/perf_baseline.py . <label> --viewports 1440x900@2,2560x1440@2 --tiers high,low`, and add `--gpu swiftshader --seconds 4 --timeout 1200` for the worst case.

## After phase 2

Measured on the afternoon of 10 November 2026 on `main` at `f712de8`, served from a checkout, on the same Apple M5 Mac with the same script. It includes everything merged that day: the pixel budget for the walkthrough and the Quality control with Auto (#55), and #45 to #54.

Each row was run twice with nothing else drawing on the machine. A first attempt, made while another window was busy, read up to 58% slower on some rows and doubled some 95th percentiles, so it was thrown away. The old version (`e92f613`) was also measured again the same afternoon at 1440×900, to show how much a figure moves between morning and afternoon: at most 0.8 ms.

### High and Low, forced, as before

| Page | Viewport | Tier | Pixels drawn, before → after | Draw before, median (ms) | Draw after, median, run 1 / 2 (ms) | Draw after, p95 (ms) |
|---|---|---|---|---|---|---|
| Walkthrough | 1440×900 @2x | High | 5.2 M → **3.6 M** (1.67x) | 16.0 (16.4 that afternoon) | **14.8 / 14.8** | 15.8 to 16.2 |
| Walkthrough | 1440×900 @2x | Low | 2.9 M → 2.9 M (1.5x) | 8.9 (9.7 that afternoon) | 8.6 / 9.4 | 9.1 to 10.0 |
| Walkthrough | 2560×1440 @2x | High | 14.7 M → **3.7 M** (1x) | 23.5 | **14.8 / 14.8** | 15.8 to 16.4 |
| Walkthrough | 2560×1440 @2x | Low | 8.3 M → 3.7 M (1x) | 9.0 | 10.4 / 10.2 | 10.6 to 10.8 |
| Configurator (W1) | 1440×900 @2x | High | 3.6 M → 3.6 M (1.67x) | 20.6 (20.6 that afternoon) | 20.7 / 20.7 | 21.6 |
| Configurator (W1) | 1440×900 @2x | Low | 2.9 M → 2.9 M (1.5x) | 13.2 (13.2 that afternoon) | 13.0 / 13.4 | 13.9 to 14.0 |
| Configurator (W1) | 2560×1440 @2x | High | 3.7 M → 3.7 M (1x) | 21.5 | 21.5 / 21.5 | 22.0 to 22.7 |
| Configurator (W1) | 2560×1440 @2x | Low | 3.7 M → 3.7 M (1x) | 15.7 | 15.0 / 15.1 | 15.6 to 15.8 |

### Auto, as a visitor gets it

Auto leaves a browser under automation alone, so the checks test the tier they force. The script's new `--as-visitor` hides that flag, and Auto then times its test draws and picks, as it does for a person.

| Page | Viewport | Renderer | Auto timed (ms) | Auto chose | Draw after, median / p95 (ms) |
|---|---|---|---|---|---|
| Walkthrough | 1440×900 @2x | M5 GPU | 15.6 | High | 15.0 / 16.3 |
| Configurator (W1) | 1440×900 @2x | M5 GPU | 11.8 | High | 20.7 / 21.6 |
| Walkthrough | 2560×1440 @2x | M5 GPU | 15.4 | High | 14.8 / 15.9 |
| Configurator (W1) | 2560×1440 @2x | M5 GPU | 11.8 | High | 21.5 / 23.6 |
| Walkthrough | 1440×900 @2x | SwiftShader | 1,278 | **Low** | about 520 (8 frames); it was about 4,100 on High |
| Configurator (W1) | 1440×900 @2x | SwiftShader | 1,770 | **Low** | about 5,100 (1 frame); it was about 11,800 on High |

What this shows:
- **The walkthrough's pixel budget is the gain you can measure on this Mac.** At 2560×1440 @2x on High it draws 3.7 million pixels a frame instead of 14.7 million, and a frame takes 14.8 ms instead of 23.5, about 37% less. At 1440×900 @2x it draws 3.6 million instead of 5.2 million and takes 14.8 ms instead of 16.0 to 16.4, about 8 to 10% less.
- **The tiers themselves cost what they did.** Every configurator row is within 0.7 ms of its "before", and the walkthrough's Low rows are within the afternoon's 0.8 ms drift or just outside it (9.0 to 10.3 ms at 2560×1440, on fewer pixels: Low's time hardly follows the pixel count).
- **On a fast machine Auto changes nothing.** It timed 15.6 and 11.8 ms, well under its 35 ms limit, and kept High on both pages at both sizes.
- **On the worst case Auto steps down by itself.** On the software renderer it timed one frame at 1.3 and 1.8 s, chose Low and remembered it. The walkthrough then drew a frame in about 0.5 s where the old default took 4.1 s, and the configurator in about 5.1 s where it took 11.8 s.
  - That is still far too slow to use. The software renderer stands for the worst case, not for an ordinary laptop, and no threshold is tuned from it.
  - The walkthrough's first visit keeps its antialiasing, which can only be set when the page loads. The next visit starts on Low without it; the old version forced to Low drew a frame in about 0.3 s.
- **The configurator's draw column counts two draws.** Its timer draws once itself, and the page draws once more in the same frame because the view moved: 189 timed draws and 189 of the page's own in one 4-second window. The column is still like for like with "before", which was measured the same way. The next section takes one frame apart.
- **Load and idle are unchanged.** The walkthrough downloads 1.9 MB and the configurator about 0.8 MB (it was 0.79 MB at `e92f613`); both were ready in 0.3 to 1.2 s here; the walkthrough still draws nothing while idle.

### One configurator frame, taken apart

Measured later the same afternoon, on `f712de8`. The script now times one whole configurator frame from outside the page, the way it times the walkthrough: the page's own frame callback, then a one-pixel read. A second pass split each frame into the page's own work and the wait for that read.

| Setup | The page's own work (ms) | Wait for the pixel read (ms) | Whole frame (ms) | Whole frame in the states run, run 1 / 2 (ms) |
|---|---|---|---|---|
| 1440×900 @1x, High | 2.5 | 7.7 | 10.2 | 12.2 / 11.7 |
| 1440×900 @2x, High | 1.4 | 11.9 | 13.4 | 14.1 / 14.0 |
| 1440×900 @2x, Low | 3.4 | 8.1 | 11.5 | 13.1 / 12.0 |
| 390×844 @3x, Low | 2.3 | 7.5 | 10.0 | 10.3 / 9.8 |

What this shows:
- **A pixel read costs about 7.5 ms whatever is drawn.** At phone size on Low there are 0.74 million pixels and almost nothing to draw, and the read still waits 7.5 ms. Four times the pixels, at 1440×900 @2x on Low, adds 0.6 ms. So every figure in this file that ends with a pixel read carries about 7.5 ms that a normal frame doesn't.
- **On High at 2x, drawing adds about 4.4 ms** to that wait, and a second queued draw adds about as much again. The three timers then agree:
  - Auto's own timing, one draw with nothing else queued: 11.8 ms.
  - A whole frame, one draw and the page's own work: 13.4 to 14.1 ms.
  - The page's `perf()`, two draws: 20.7 to 21.0 ms.
- **`perf()` isn't simply double.** On the lighter setups it reads a little under a whole frame (10.6 against 11.9 ms at 1x on High, 8.8 against 10.1 ms at phone size), because the second draw is cheap there and `perf()` leaves out the page's own work.
- **Nine room states barely differ.** Each was loaded fresh and timed at all four setups, twice: the room as it loads, each of the five lighting schemes at night, the Desert Sanctuary and Family Suite themes by day, and the TV and digital aquarium both playing. The heaviest was the cove scheme at night on High at 2x, 14.6 ms against 14.1 ms for the default. Elsewhere no state was above the default, and the same row moves by up to about 1 ms between runs.
- **Everything held 60 frames a second.**

REPORT.md's "Performance" table was corrected from these: it had 9, 22, 13 and 8 ms from `perf()`, and now has the whole-frame figures.

Raw rows are in `build/perf_report-high-1.json`, `-high-2.json`, `perf_report-low-1.json` and `-low-2.json`. To repeat: `.venv/bin/python -I scripts/perf_baseline.py . <label> --viewports 1440x900@1,1440x900@2 --tiers high --pages configurator --states all`, and the same with `--viewports 1440x900@2,390x844@3 --tiers low`. The states are named in `STATES` in the script.

**Still not measured:** an ordinary laptop with integrated graphics, which is what this work is for. That needs `?stats=1` readouts from real devices.

Raw rows are in `build/perf_p2-after-hw-1.json`, `-hw-2.json`, `p2-after-auto.json`, `p2-after-sw-auto.json`, and the same-day reruns of the old version in `p2-before-hw-recheck.json` and `p2-before-sw-low-recheck.json`. To repeat: the "before" command above for the forced rows, and `.venv/bin/python -I scripts/perf_baseline.py . <label> --viewports 1440x900@2,2560x1440@2 --as-visitor` for Auto, adding `--gpu swiftshader --seconds 4 --timeout 1200` for the worst case.

## Not measured yet

- **Safari:** it can't be driven here without "Allow Remote Automation", and Playwright's WebKit is not Safari.
- **Phones and tablets:** desktop emulation is not a real device, so these need a test on a real phone and tablet.
- **Integrated or older GPUs.**

The script also records the walkthrough's draws per second while idle, from `window.__viewerFrames`. To compare after each phase, run `.venv/bin/python -I scripts/perf_baseline.py . local-<phase>` for this checkout, or pass the site's URL instead of `.`. It writes `build/perf_<label>.json`, which git ignores.
