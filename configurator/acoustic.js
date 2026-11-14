// Acoustic comfort mode's numbers: the room's simulated sound sources, what each fitting does, and how loud a spot is.
// Every level here is ILLUSTRATIVE. Nothing is measured: no microphone is used, and this model never listens.
//
// The levels are set near the readings Darbyshire and Young took in one empty ICU side room, with the meter where the
// patient's head would be (Crit Care 2013;17:R187): 34.1 dBA with everything off, 43.5 with a ventilator running. A
// television is about 60 dBA and normal conversation about 55 in their discussion. They're a starting point for a picture,
// not a prediction for this room. The fittings' reductions are made up, and the screen says so.
//
// The distance rule is the simplest there is: a small source in open air is 6 dB quieter each time the distance from it
// doubles (20 log10 of the distance in metres, from its level at 1 m), and sources add as energy. A real room reflects
// sound, so far from a source it's louder than this says. Nothing here reads, changes or silences a medical device or an alarm.

/** Quiet room, everything off: the side room's reading. dBA, illustrative. */
export const BACKGROUND = 34;

/**
 * The simulated sources, each with its level at 1 m in dBA. `kind`: medical (the patient's kit, which no fitting or
 * setting here touches), room (non-critical kit), door, corridor. `at` says where in the room it sits; main.js finds it.
 */
export const SOURCES = [
  { id: "monitor", label: "Monitor tones", level: 50, kind: "medical", at: "part:cfg_kit_monitor" },
  { id: "pumps", label: "Infusion pumps", level: 48, kind: "medical", at: "part:cfg_kit_pumps" },
  { id: "ventilator", label: "Ventilator", level: 44, kind: "medical", at: "part:cfg_kit_ventilator" },
  { id: "fans", label: "Equipment fans", level: 42, kind: "room", at: "addon:tv" },
  { id: "door", label: "The door closing", level: 58, kind: "door", at: "front" },
  { id: "corridor", label: "Talk in the corridor", level: 55, kind: "corridor", at: "corridor" },
];

/**
 * The fittings and their made-up effect on each kind of source, in dB. Panels absorb some of what bounces round the room,
 * so they take a little off everything; the others act only on their own kind of sound. None acts on the patient's
 * equipment itself: the panels change the room around it, not the device.
 */
export const FITTINGS = {
  acousticPanels: { medical: -3, room: -3, door: -3, corridor: -3 },
  acousticFront: { corridor: -9, door: -4 },
  softClose: { door: -10 },
  dampers: { room: -6 },
};

/** The fitting groups in options.json, in code order. */
export const FITTING_GROUPS = Object.keys(FITTINGS);

/** A source's level at 1 m with the fittings that are on. */
export function sourceLevel(source, on = {}) {
  let dB = source.level;
  for (const [id, cut] of Object.entries(FITTINGS)) if (on[id]) dB += cut[source.kind] || 0;
  return dB;
}

/**
 * The level at a point, in dBA: every source by the distance rule, added as energy, with the quiet room under it.
 * points: { [sourceId]: [x, y, z] } in metres; p: [x, y, z]. A source closer than 0.5 m counts as 0.5 m away.
 */
export function levelAt(p, points, on = {}) {
  let energy = 10 ** (BACKGROUND / 10);
  for (const s of SOURCES) {
    const q = points[s.id];
    if (!q) continue;
    const d = Math.max(0.5, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    energy += 10 ** ((sourceLevel(s, on) - 20 * Math.log10(d)) / 10);
  }
  return 10 * Math.log10(energy);
}

/** The loudest sources at a point, loudest first, with what each contributes there. */
export function loudestAt(p, points, on = {}, n = 2) {
  return SOURCES.filter(s => points[s.id]).map(s => {
    const q = points[s.id], d = Math.max(0.5, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
    return { id: s.id, label: s.label, dB: sourceLevel(s, on) - 20 * Math.log10(d) };
  }).sort((a, b) => b.dB - a.dB).slice(0, n);
}

/** The colour of a level on the sound map, from quiet to loud. Each band also has its words in the legend. */
export const BANDS = [
  { upTo: 40, colour: "#2f8f9d", words: "quiet" },
  { upTo: 45, colour: "#7fb069", words: "calm" },
  { upTo: 50, colour: "#e6c84f", words: "busy" },
  { upTo: 55, colour: "#e8913a", words: "loud" },
  { upTo: Infinity, colour: "#c8553d", words: "very loud" },
];
export const bandOf = dB => BANDS.find(b => dB < b.upTo);

/**
 * The three kinds of notification, as the panel lists them. Critical alarms are shown, never sounded here, and the comfort
 * system has no control over them. Routine ones are listed as they are. Environmental notices are the only ones this
 * system raises itself, and staff acknowledge them.
 */
export const NOTIFICATIONS = {
  critical: {
    title: "Critical alarms",
    line: "Always sounding and always visible. The comfort system has no control over them.",
    examples: ["Ventilator: high airway pressure", "Monitor: heart rhythm alarm"],
  },
  routine: {
    title: "Routine notifications",
    line: "A hospital might review some of these at the nurse station, where the device and its policy allow. Nothing here changes that.",
    examples: ["Infusion pump: infusion nearly complete", "Monitor: check a lead", "Ventilator: routine prompt"],
  },
  environmental: {
    title: "Environmental notices",
    line: "The only notices this system raises itself. Staff acknowledge them.",
    examples: [
      { id: "loud", text: "The room is louder than its quiet setting." },
      { id: "door", text: "The door has been left open." },
      { id: "vibration", text: "Non-critical kit is vibrating." },
    ],
  },
};

/** What the sound map and its numbers are, said once on screen. */
export const ILLUSTRATIVE = "Illustrative: the levels are made up for this picture, near readings from one ICU side room, and the difference the fittings make is made up too. Nothing is measured.";
