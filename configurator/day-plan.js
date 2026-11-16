// Light across 24 hours: a plan for the room's light and blinds over a whole day, on top of the circadian scheme (lights.js),
// the sun path (sky.js) and Comfort mode's after-dark rule (modes.js). Data only, with no Three.js, so the checks can read it
// in Node. A plan, not a measurement: the light is a design setting, and every change is gradual. The room modes stay the
// staff override: Clinical and Emergency-ready always win.

/** The four phases, in the room's solar time. Night sleep runs past midnight to the morning. `light` and `blinds` give each
 * phase's reason, after the hour's own words (see words()), so the panel never says the same thing twice. */
export const PHASES = [
  { id: "morning", label: "Morning daylight", from: 6, to: 12, light: "coming up with the day", blinds: "to let the daylight in" },
  { id: "afternoon", label: "Afternoon comfort", from: 12, to: 17, light: "steady through the afternoon", blinds: "against the glare" },
  { id: "evening", label: "Evening wind-down", from: 17, to: 21, light: "winding down for the night", blinds: "as it gets dark" },
  { id: "night", label: "Night sleep", from: 21, to: 30, light: "enough to see by", blinds: "for a dark room" },
];
export const phaseAt = h => { const x = ((h % 24) + 24) % 24; return PHASES.find(p => (x >= p.from && x < p.to) || (x + 24 >= p.from && x + 24 < p.to)); };

/** Quiet hours: lights low and noise kept down. Care still comes first. */
export const QUIET = { from: 22, to: 6, label: "Quiet hours, 10 pm to 6 am", note: "Lights low and noise kept down. Care still comes first: staff turn on full light or the task light whenever care needs it." };
export const inQuiet = h => { const x = ((h % 24) + 24) % 24; return x >= QUIET.from || x < QUIET.to; };

// The plan's light and blinds at a few hours, joined by straight lines: every change takes an hour or more.
const LIGHT = [
  [0, 2200, 0.08], [5.5, 2200, 0.08], [8, 4800, 1], [12, 5000, 1], [16, 4800, 1], [17.5, 4000, 0.85],
  [19.5, 3000, 0.55], [21, 2400, 0.25], [22, 2200, 0.08], [24, 2200, 0.08],
];
const BLINDS = [[0, 1], [5.5, 1], [7, 0], [12, 0], [13, 0.5], [17, 0.5], [18.5, 0.8], [20, 1], [24, 1]];
const along = (keys, h, k) => {
  const x = ((h % 24) + 24) % 24;
  for (let i = 1; i < keys.length; i++) if (x <= keys[i][0]) { const a = keys[i - 1], b = keys[i], t = (x - a[0]) / (b[0] - a[0] || 1); return a[k] + (b[k] - a[k]) * t; }
  return keys[keys.length - 1][k];
};
/** The plan's light at an hour, as { kelvin, level }: the look lights.js lays over the room. */
export const lookAt = h => ({ kelvin: Math.round(along(LIGHT, h, 1)), level: along(LIGHT, h, 2) });
/** How far down the blinds are at an hour, from 0 (up) to 1 (down). */
export const blindsAt = h => along(BLINDS, h, 1);

/** The light and blinds in words: design settings, so no number is shown as if it were measured. */
export function words(h) {
  const { kelvin, level } = lookAt(h), b = blindsAt(h);
  const colour = kelvin >= 4500 ? "cool white" : kelvin >= 3300 ? "neutral white" : "warm white";
  const bright = level >= 0.9 ? "bright" : level >= 0.5 ? "dimmed" : level >= 0.2 ? "low" : "night-low";
  const blinds = b < 0.05 ? "up" : b < 0.6 ? "half down" : b < 0.95 ? "most of the way down" : "down";
  return { light: `${colour}, ${bright}`, blinds };
}

/** The steps the whole day takes when played: an hour a second, so a day takes 24 seconds, and then it stops. */
export const PLAY_MS_PER_HOUR = 1000;

export const DAY_TEXT = {
  override: "Clinical and Emergency-ready are the staff override and always win: the plan waits while they're on.",
  limits: "A plan for the room's light, shown on the room's solar time. It changes no choice or link, and closing it puts the time back. Light alone isn't shown to prevent delirium.",
};
