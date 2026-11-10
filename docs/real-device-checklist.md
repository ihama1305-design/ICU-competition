# Real-device checklist

About 5 minutes per device, plus one minute on a slow one. Everything so far was tested in headless Chromium on one Mac, so a device only counts as working once it has been through this list.

**Open the site:** scan `docs/qr-live-site.png`, or go to https://ihama1305-design.github.io/ICU-competition/.

**Devices:** iPhone (Safari), iPad (Safari), Android phone (Chrome), Windows laptop (Chrome, then Edge), Mac (Safari).

## Before you start (30 s)

Write down:
- The device model, OS version and browser version.
- Whether battery saver or low power mode is on, and whether it's plugged in.

Close other tabs.

## 1. Home page and guided tour (1½ min)

1. Tap **Take the guided tour**. Count roughly how many seconds pass before the room appears.
2. Let two steps play by themselves, then tap **Pause**, **Next** and **Previous**.
3. Tap **Restart**. It should go back to step 1 and play again.
4. Tap **Exit**. The room should look as it did before the tour.

Note: Do the captions fit, and can you read them? Does the 3D stutter while it moves?

## 2. Configurator (1½ min)

1. Drag to turn the room, then zoom: pinch on a touch screen, or scroll on a laptop. Switch between **W1** and **W3**.
2. With the time at afternoon, tap **Comfort**: the lights dim and the blinds lower. Tap **Night**: the blinds should go back up, and one line should say why.
3. **Quality** (if the switch is there): note what **Auto** chose and its status line. Try **Low**, then **High**, and say whether either feels smoother.
4. Drag **Biophilic wall panel** from Place items onto a wall. Tap the panel, then the CDC link on its card.
5. Tap the wardrobe, then **Slide doors open**.

Note: Smooth, OK or stuttery? Is anything cut off, or too small to tap?

## 3. PACS (30 s)

Tap **Physiological Adaptive Mode**. Does the panel fit the screen, and does **Exit** bring the room back?

## 4. Walkthrough (1 min)

Open **Walk the ICU**.
1. Orbit, then tap **First person**.
2. On a phone or tablet, walk with the joystick. On a laptop, use W, A, S and D.
3. Drop the person, then tap the view behind them.

Note: Smooth, OK or stuttery? Does walking feel stuck anywhere?

## 5. Memory test, phones and tablets only (30 s)

1. Open the configurator in 3 or 4 tabs, then go back to the first tab.
2. If the 3D view stopped, it should say **Tap to reload the 3D view**, not show a frozen picture. Tap it: the same room should come back.

Note: what happened, even if nothing did.

## 6. A slow device: send its readout (1 min)

On any device that feels slow, open both of these and wait about 5 seconds for the **Draw** line:
- https://ihama1305-design.github.io/ICU-competition/configurator/?stats=1
- https://ihama1305-design.github.io/ICU-competition/viewer/?stats=1

The box at the bottom left shows the GPU, quality tier, pixel ratio, canvas pixels and the median time to draw a frame. Tap **Copy** and paste it into the notes. The page sends nothing anywhere.

## What to send back

One line per device, plus a screenshot of anything that looked wrong.

| Device and browser | Tour | Configurator | Quality: Auto chose | PACS | Walkthrough | Memory test | ?stats=1 draw (ms) | Notes |
|---|---|---|---|---|---|---|---|---|
| iPhone, Safari | | | | | | | | |
| iPad, Safari | | | | | | | | |
| Android, Chrome | | | | | | | | |
| Windows, Chrome | | | | | | n/a | | |
| Windows, Edge | | | | | | n/a | | |
| Mac, Safari | | | | | | n/a | | |

For each cell, use ✓ (works), ~ (works, with a note) or ✗ (broken, with a note).
