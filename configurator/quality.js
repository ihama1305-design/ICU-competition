// Graphics quality: Auto, High or Low, chosen by the visitor and remembered in this browser. The walkthrough has its own
// copy of these functions (it's also a single offline file), and check 12 makes sure the two give the same answers.
//
// Auto picks from a few timed test draws after loading, not from watching the frame rate: both pages draw only when something
// changes. It waits until every shader has compiled, so compiling is never timed, and remembers what it measured, so the
// next load starts in that tier, including the things that can only be set when the page loads. A phone or tablet starts on
// Low, as it always did, and Auto only ever steps it down; anything else starts on High until measured.
//
// High: post-processing (bloom, with 4x antialiasing), see-through glass that bends light (transmission), 2048 px sun shadows,
// up to 2 pixels per CSS pixel. Low: none of those, 1024 px shadows, up to 1.5 pixels per CSS pixel. Both draw at most
// PIXEL_BUDGET pixels a frame, and either steps its resolution down further if frames stay slow while the view moves.

export const CHOICES = ["auto", "high", "low"];
export const PIXEL_BUDGET = 3.6e6;

const storage = () => { try { return window.localStorage; } catch { return null; } };
const read = key => { try { return storage()?.getItem(key) ?? null; } catch { return null; } };
const write = (key, value) => { try { storage()?.setItem(key, value); } catch { /* private browsing: it just isn't remembered */ } };

/** The visitor's choice: auto, high or low. Auto until they pick. */
export const readChoice = () => (CHOICES.includes(read("icu-quality")) ? read("icu-quality") : "auto");
export const saveChoice = choice => write("icu-quality", choice);
/** What Auto measured on this page last time, or null. */
export const readMeasured = page => (["high", "low"].includes(read(`icu-quality-measured-${page}`)) ? read(`icu-quality-measured-${page}`) : null);
export const saveMeasured = (page, tier) => write(`icu-quality-measured-${page}`, tier);

/** A phone, tablet or small screen: the rule that chose the tier before Auto, kept so these never start heavier than they did. */
export const handheld = () => matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600;
/** The tier to load in: the visitor's choice, or for Auto what this device measured last time, or until it has, Low on a handheld. */
export const startTier = (choice, measured, isHandheld = false) => (choice === "auto" ? measured || (isHandheld ? "low" : "high") : choice);

/** Pixels per CSS pixel: sharp on any screen, never more than the budget, and at most `limit` once stepped down. */
export function pixelRatio(dpr, w, h, tier, limit = Infinity) {
  return Math.max(1, Math.min(dpr, tier === "low" ? 1.5 : 2, Math.sqrt(PIXEL_BUDGET / (w * h)), limit));
}

/**
 * Auto's decision, from how long this device takes to draw a frame.
 * `medianMs`: the median time to draw one frame and wait for the GPU to finish it, over the first few frames. Waiting makes
 *   it longer than a normal, pipelined frame: a fast laptop that orbits at 60 fps measures 12 to 16 ms on High at 1440 x 900 @2x,
 *   about 7.5 ms of which is the wait itself.
 * `current`: the tier those frames were drawn in, "high" or "low". On the M5, Low frames cost 0.38 to 0.73 of High ones.
 * `isHandheld`: a phone or tablet, which Auto only ever steps down (see below).
 * Returns the tier to use: "high" or "low".
 *
 * High is kept while a frame takes at most 35 ms: about 30 a second once the wait for the GPU is taken off, and clear of the
 * 14 to 15 ms a whole frame takes on the M5 at 1440 x 900 @2x (REPORT.md, "Performance"). No figure here comes from a software renderer.
 * From Low, a frame on High is assumed to cost the most it was seen to, 1 / 0.38 times as much, so Low steps up only at
 * 13 ms or less. Then a device can't flip between the two on alternate visits: what makes it step up keeps it on High,
 * and what makes it drop keeps it on Low.
 * A phone or tablet is never stepped up, so it never starts heavier than it did before Auto: a few quick test draws say
 * nothing about memory, which is what makes a phone's browser drop the 3D view. The visitor can still choose High.
 */
export function pickTier(medianMs, current, isHandheld = false) {
  const SLOW_MS = 35, LOW_SHARE = 0.38;
  if (current === "low" && isHandheld) return "low";
  const highMs = current === "low" ? medianMs / LOW_SHARE : medianMs;
  return highMs <= SLOW_MS ? "high" : "low";
}

export const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/**
 * Time a few test draws, one per animation frame: each draw is followed by a one-pixel read, which waits for the GPU, so the
 * time is the device's real work and not the display's refresh. `compile()` resolves once every shader is ready; two
 * untimed warm-up draws follow, for anything still created on first use (render targets, the bloom's passes).
 * Stops early on a very slow device: one draw over 250 ms already says enough. Returns the median in milliseconds.
 */
export async function probe(draw, gl, compile, frames = 8, budgetMs = 1500) {
  const px = new Uint8Array(4), times = [];
  const timed = () => { const t0 = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return performance.now() - t0; };
  await compile?.();
  timed(); await new Promise(requestAnimationFrame); timed();
  const start = performance.now();
  while (times.length < frames && !(times.at(-1) > 250) && (times.length < 3 || performance.now() - start < budgetMs)) {
    await new Promise(requestAnimationFrame);
    times.push(timed());
  }
  return median(times);
}
