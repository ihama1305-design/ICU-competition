// The bed: a simulated pressure map, and the lines round the patient. Data only, with no Three.js, so the checks can read it
// in Node. SIMULATED throughout: there's no sensor, nothing is measured, no injury is predicted, and nothing moves a patient.
// The bed and the patient figure in this model can't move, so a position is shown on the map and in the line list only.
//
// Places on the bed are bed-local metres: `x` across it (plus is the patient's left), `d` from the headboard.

/** The mattress, from the bed model (both rooms have the same bed): its width, and where it starts and ends from the headboard. */
export const MAT = { width: 0.9, from: 0.22, to: 2.08 };
/** The simulated sensor grid: about 6 cm a cell. */
export const GRID = { cols: 15, rows: 31 };

/** The map's bands, by relative load from 0 to 1. Relative and simulated: there are no units because nothing is measured. */
export const BANDS = [
  { id: "light", label: "Light", min: 0.12, colour: "#bfe0d8" },
  { id: "moderate", label: "Moderate", min: 0.4, colour: "#e9c46a" },
  { id: "higher", label: "Higher", min: 0.7, colour: "#c8553d" },
];
export const bandOf = v => [...BANDS].reverse().find(b => v >= b.min) || null;

// A place the weight bears on: where, how much at its middle (0 to 1), and how far it spreads. Named places can be marked;
// the broad ones without a name just fill in the body's outline.
const at = (id, label, x, d, w, r) => ({ id, label, x, d, w, r });
const body = (x0, w, seat = 0.42) => [
  at("back", null, x0, 0.7, 0.2 * w, 0.17), at("seat", null, x0, 1.14, seat * w, 0.15),
  at("legR", null, x0 - 0.11, 1.62, 0.22 * w, 0.1), at("legL", null, x0 + 0.11, 1.62, 0.22 * w, 0.1),
];

/**
 * The positions, as a staff member would turn the patient or set the bed. `back` is how the figure lies. Each lists where the
 * weight bears, from the usual teaching pictures of pressure points: not from a measurement.
 */
export const POSITIONS = {
  back: {
    label: "On the back, backrest at 30°", short: "On the back",
    regions: [
      ...body(0, 1),
      at("occiput", "Back of the head", 0, 0.33, 0.5, 0.06),
      at("shoulderR", "Right shoulder blade", -0.12, 0.62, 0.45, 0.07), at("shoulderL", "Left shoulder blade", 0.12, 0.62, 0.45, 0.07),
      at("elbowR", "Right elbow", -0.3, 0.98, 0.42, 0.045), at("elbowL", "Left elbow", 0.3, 0.98, 0.42, 0.045),
      at("sacrum", "Sacrum", 0, 1.1, 0.95, 0.08),
      at("heelR", "Right heel", -0.1, 2.0, 0.85, 0.04), at("heelL", "Left heel", 0.1, 2.0, 0.85, 0.04),
    ],
  },
  left: {
    label: "Turned 30° onto the left side", short: "Turned left",
    regions: [
      ...body(0.05, 1, 0.2), // tilted: the weight comes off the middle of the seat
      at("occiput", "Back of the head", 0.04, 0.33, 0.4, 0.06),
      at("shoulderL", "Left shoulder", 0.18, 0.6, 0.6, 0.07),
      at("elbowL", "Left elbow", 0.32, 0.98, 0.4, 0.045),
      at("hipL", "Left hip", 0.17, 1.14, 0.9, 0.08), at("sacrum", "Sacrum", 0.02, 1.1, 0.12, 0.07),
      at("heelL", "Left heel", 0.13, 2.0, 0.78, 0.04), at("heelR", "Right heel", -0.08, 2.0, 0.4, 0.04),
    ],
  },
  right: {
    label: "Turned 30° onto the right side", short: "Turned right",
    regions: [
      ...body(-0.05, 1, 0.2),
      at("occiput", "Back of the head", -0.04, 0.33, 0.4, 0.06),
      at("shoulderR", "Right shoulder", -0.18, 0.6, 0.6, 0.07),
      at("elbowR", "Right elbow", -0.32, 0.98, 0.4, 0.045),
      at("hipR", "Right hip", -0.17, 1.14, 0.9, 0.08), at("sacrum", "Sacrum", -0.02, 1.1, 0.12, 0.07),
      at("heelR", "Right heel", -0.13, 2.0, 0.78, 0.04), at("heelL", "Left heel", 0.08, 2.0, 0.4, 0.04),
    ],
  },
  upright: {
    label: "Sitting up, backrest at 45°", short: "Sitting up",
    regions: [
      ...body(0, 1.1),
      at("occiput", "Back of the head", 0, 0.36, 0.3, 0.06),
      at("shoulderR", "Right shoulder blade", -0.12, 0.66, 0.35, 0.07), at("shoulderL", "Left shoulder blade", 0.12, 0.66, 0.35, 0.07),
      at("sacrum", "Sacrum", 0, 1.13, 1.0, 0.1),
      at("heelR", "Right heel", -0.1, 2.0, 0.8, 0.04), at("heelL", "Left heel", 0.1, 2.0, 0.8, 0.04),
    ],
  },
};
export const POSITION_ORDER = ["back", "left", "right", "upright"];
export const DEFAULT_POSITION = "back";

/** The relative load in every cell of the grid, row by row from the head: each place's share, added up and capped at 1. */
export function pressureMap(position) {
  const { cols, rows } = GRID, cw = MAT.width / cols, ch = (MAT.to - MAT.from) / rows, out = new Float32Array(cols * rows);
  const regions = POSITIONS[position].regions;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -MAT.width / 2 + (i + 0.5) * cw, d = MAT.from + (j + 0.5) * ch;
    let v = 0;
    for (const r of regions) v += r.w * Math.exp(-((x - r.x) ** 2 + (d - r.d) ** 2) / (2 * r.r * r.r));
    out[j * cols + i] = Math.min(1, v);
  }
  return out;
}
/** A named place's peak load in a position: the most of any cell within its spread. */
export function peakOf(position, region, map = pressureMap(position)) {
  const { cols, rows } = GRID, cw = MAT.width / cols, ch = (MAT.to - MAT.from) / rows;
  let peak = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = -MAT.width / 2 + (i + 0.5) * cw, d = MAT.from + (j + 0.5) * ch;
    if (Math.hypot(x - region.x, d - region.d) <= Math.max(region.r, Math.hypot(cw, ch) / 2 + 0.005)) peak = Math.max(peak, map[j * cols + i]);
  }
  return peak;
}

/** The sample positioning plan. The nursing team sets the real one for each patient; this one is made up. */
export const PLAN = {
  interval: 120,
  note: "Sample positioning plan: a positioning assessment every 2 hours. The nursing team sets each patient's real plan.",
};
/** How long the patient has been in this position. Simulated, and set here by hand: the page never counts time by itself. */
export const TIMES = [
  { minutes: 15, label: "15 min" },
  { minutes: 80, label: "1 h 20 min" },
  { minutes: 130, label: "2 h 10 min" },
];
export const DEFAULT_MINUTES = 130; // as the room loads, the reminder is due: the staff view's example
export const timeLabel = m => TIMES.find(t => t.minutes === m)?.label ?? `${m} min`;

/** The places marked as under sustained pressure: a higher load, held past the plan's interval. */
export function sustained(position, minutes) {
  if (minutes < PLAN.interval) return [];
  const map = pressureMap(position);
  return POSITIONS[position].regions.filter(r => r.label && bandOf(peakOf(position, r, map))?.id === "higher");
}

export const PRESSURE_TEXT = {
  limits: "Simulated: not a measurement. It predicts no injury, and it never moves a patient. Staff assess the skin and reposition by the patient's own positioning plan.",
  still: "The bed and the patient figure in this model don't move: the position is shown on the map and in the line list only.",
  reminder: "Positioning assessment due · SIMULATED. The position has been held past the sample plan's 2 hours. Check the positioning plan. Nothing here moves a patient.",
};

/**
 * The lines round the patient, on the routes patient.js draws (by their titles), with the colours it gives them. Where each
 * one's clip sits is a share of the way along its route, as patient.js draws it.
 */
export const LINES = [
  { id: "respiratory", label: "Respiratory circuit", route: "Respiratory circuit extension", colour: "#b5cbd1", clip: 0.75, holder: "a circuit holder at the bed's head end" },
  { id: "iv", label: "IV line", route: "IV extension route", colour: "#668fbb", clip: 0.42, holder: "a clip on the left side rail's top" },
  { id: "feeding", label: "Feeding tube", route: "Enteral feeding tube route", colour: "#cbaa67", clip: 0.85, holder: "a clip on the left side rail's top, apart from the IV line" },
  { id: "ecg", label: "ECG leads", route: "ECG lead route", colour: "#617079", clip: 0.2, holder: "a clip on the right side rail's top" },
  { id: "urinary", label: "Urinary drainage", route: "Urinary drainage route", colour: "#a492bd", clip: 0.85, holder: "a guide on the bed frame below the mattress, never on a moving rail" },
];

/** The slack indicator's words. Simulated, from a fixed table: no tension, force or flow is worked out. */
export const SLACK = {
  ok: { label: "Slack enough", mark: "✓" },
  less: { label: "Less slack", mark: "!" },
  check: { label: "Check this line", mark: "!!" },
};
/** Each line's slack in each position, and why. Made up, to show the idea: staff check the real lines. */
export const SLACK_BY = {
  back: { respiratory: ["ok", "Its route as set."], iv: ["ok", "Its route as set."], feeding: ["ok", "Its route as set."], ecg: ["ok", "Its route as set."], urinary: ["ok", "The bag below the bladder and off the floor."] },
  left: {
    respiratory: ["less", "The face turns away from the ventilator, on the patient's right."],
    iv: ["ok", "The patient turns towards it."], feeding: ["ok", "The patient turns towards it."],
    ecg: ["less", "The chest turns away from the lead's route, up the right side rail."],
    urinary: ["less", "The hips turn away from the bag. Keep the bag below the bladder."],
  },
  right: {
    respiratory: ["ok", "The face turns towards the ventilator."],
    iv: ["check", "The left arm comes across the body, away from the line's side."],
    feeding: ["less", "The face turns away from the feeding line's side."],
    ecg: ["ok", "The chest turns towards the lead's route."], urinary: ["ok", "The bag below the bladder and off the floor."],
  },
  upright: {
    respiratory: ["check", "The head rises and comes forward, away from the ventilator."],
    iv: ["ok", "The arm stays where it was."], feeding: ["less", "The face rises with the backrest."],
    ecg: ["less", "The chest rises with the backrest."], urinary: ["ok", "The bag below the bladder and off the floor."],
  },
};

export const LINES_TEXT = {
  limits: "Simulated: no tension, force or flow is worked out, and no line or device is monitored. Nothing here changes a real line, connector or device.",
  clips: "The clips and tags show while this tab is open. To keep them in the room, choose them under Bed in the options.",
};

/** The check before any move of the patient or the bed. A person confirms it: nothing is checked for them. */
export const MOVE_CHECK = {
  title: "Before the move, check the lines",
  text: "Staff check every line first: its route, its slack and its connections, so nothing pulls or kinks as the patient moves.",
  confirm: "Lines checked: show the move",
  cancel: "Cancel",
};
