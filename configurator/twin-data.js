// The digital twin: the room's hidden state, made readable. Data and rules only, with no Three.js, so check 14 can run them
// in Node. twinRead() takes what the room is doing now (main.js gathers it) and says, in words, what each system's state is,
// and the room health dashboard in five separate parts. There is no total and no ranking, and no vital sign: those are
// PACS's. Every reading here is one the room already has (simulated or illustrative, and said so), never a second set.
import { BANDS, bandOf } from "./acoustic.js";
import { LEVELS, MODES, MODE_TABLE, SYSTEMS as MODE_SYSTEMS } from "./modes.js";

/** The systems a visitor can click, in the order the panel lists them. `lights`: what main.js outlines in the room. */
export const TWIN_SYSTEMS = [
  { id: "bed", label: "The bed" },
  { id: "ceiling", label: "The ceiling: sensors and light" },
  { id: "walls", label: "The walls: screens, privacy, comfort control" },
  { id: "storage", label: "Storage" },
  { id: "equipment", label: "Equipment" },
  { id: "floor", label: "The floor: clear areas" },
  { id: "mode", label: "The mode in force" },
];

/** The room health dashboard: five parts, each read on its own. Never added up. */
export const HEALTH = [
  { id: "comfort", label: "Environmental comfort" },
  { id: "equipment", label: "Equipment organisation" },
  { id: "access", label: "Access clearance" },
  { id: "communication", label: "Communication readiness" },
  { id: "cleaning", label: "Cleaning checklist" },
];
/** What a part's state is called. Words, not a score: "look" asks a person to look, nothing more. */
export const STATES = { settled: "Nothing to look at", look: "Look at this", off: "Not running now", done: "Finished" };

export const TWIN_TEXT = {
  title: "Digital twin · SIMULATED",
  intro: "The room's hidden state, read from the room as it is now. Change the mode, the patient's state or a choice, and it changes.",
  limits: "A concept for showing how the space, equipment, environment and work fit together. It reads only this model, with its simulated and illustrative values: it monitors nothing, adds no total, and shows no vital signs.",
};

const lightWords = level => (level < 0.3 ? "low" : level < 0.6 ? "dimmed" : level < 0.95 ? "lowered" : "full");
const warmth = k => (k <= 3000 ? "warm" : k < 4500 ? "neutral" : "cool");
const blindWords = level => (level <= 0 ? "up" : level < 0.75 ? "partly down" : "down");
const SOURCES = { mode: "the room mode", patient: "the patient's state", scene: "the scene chosen", set: "the room as set" };

/**
 * Read the room. `r` (main.js twinInput()):
 *   mode, state ("sedated" | "awake" | "recovering"), quiet,
 *   light { kelvin, level, from: "mode" | "patient" | "scene" | "set", scheme (its label), task },
 *   blinds (0 to 1), glass { front: "clear" | "smart" | "blinds", opaque, level },
 *   temp, humidity (the comfort control's simulated readout), noise (dBA at the pillow, illustrative),
 *   wall (wallFor()'s result), sceneLabel, tv ("off" | "on" | "orientation" | "scene" | "family"),
 *   fittings { ceilingTray, staffPanel, patientWall, workstation, bedsideCabinet }, sky, wardrobe { shown, side },
 *   lineClips, bed { position, minutes, reminder }, tasks { done, total },
 *   layout { added: [findings on items or fittings the visitor added], own: number of the model's own }, placed (count),
 *   board (OFFERS[state].board), family (OFFERS[state].family), requests (waiting), cleaning { on, ticks, total, next }.
 * Returns { systems: { id: { label, lines } }, health: [{ id, label, state, lines }], mode }.
 */
export function twinRead(r) {
  const m = MODES[r.mode] || MODES.standard, w = r.wall || {}, f = r.fittings || {};
  const band = bandOf(r.noise), loud = BANDS.indexOf(band) >= 3;
  const lightLine = `Light: ${warmth(r.light.kelvin)} (${Math.round(r.light.kelvin / 100) * 100} K) and ${lightWords(r.light.level)}, from ${SOURCES[r.light.from]}${r.light.task ? ", with the task light" : ""}.`;
  const glassLine = r.glass.front === "smart" ? `Glazed front: smart glass, ${r.glass.opaque ? (r.glass.level < 1 ? "softened" : "opaque") : "clear"}.` : `Glazed front: ${r.glass.front === "blinds" ? "blinds between the panes" : "clear, with its curtain"}.`;
  const systems = {
    bed: [
      `Patient: ${r.state}${r.quiet ? ", with Quiet now on" : ""}.`,
      `Position, as the bed panel shows it: ${r.bed.position}, for ${r.bed.minutes} minutes${r.bed.reminder === "due" ? ". Positioning assessment due" : ""}.`,
      `Line clips and tags: ${r.lineClips ? "on" : "off"}.`,
      "Nothing here moves the bed or a line.",
    ],
    ceiling: [
      lightLine,
      `Ceiling over the bed: ${f.ceilingTray ? "the lit tray" : "plain"}${w.ceiling ? `, showing ${r.sceneLabel}` : r.sky ? ", with the printed sky" : ""}.`,
      "Daylight sensor on the sill: tells Comfort mode whether there's daylight to block. Sound sensor by the door: a concept, with no microphone.",
    ],
    walls: [
      f.staffPanel || f.patientWall ? `Smart clinical wall: ${w.wall === "off" ? "off" : w.wall}${w.emergency ? ", Emergency" : ""}. Staff panel ${w.staff === "clinical" ? "showing made-up observations" : "resting"}.` : "No wall panels in this room.",
      `Patient's screen: ${{ off: "off", on: "playing", orientation: "the orientation screen", scene: `a scene, ${r.sceneLabel}`, family: "family connection" }[r.tv] || "off"}${w.prompts ? ", with the two buttons" : ""}.`,
      glassLine,
      `Comfort control: ${r.temp} °C and ${r.humidity}% humidity, its simulated readout. It changes nothing by itself.`,
    ],
    storage: [
      r.wardrobe.shown ? `Built-in wardrobe: doors ${r.wardrobe.side ? `open on the ${r.wardrobe.side}` : "closed"}. The patient's own things.` : "No wardrobe in this room.",
      f.bedsideCabinet ? "Bedside cabinet: the patient's small things, apart from clinical supplies." : "No bedside cabinet.",
      f.workstation ? "Clinical supplies: in the workstation's two cupboards, found from its supply list." : "No workstation: supplies come from the unit's store.",
    ],
    equipment: [
      "Ceiling pendant: carries the monitor, pumps and outlets off the floor.",
      "Bedside monitor: running. Its alarms are never changed here.",
      `Workstation tasks: ${r.tasks.done} of ${r.tasks.total} ticked by staff.`,
    ],
    floor: [
      r.layout.added.length ? `Added items and fittings: ${r.layout.added.length} to look at.` : "Added items and fittings: no modelled conflict found.",
      `Placed items: ${r.placed}.`,
      `The room's own kit, as modelled: ${r.layout.own} places where it overlaps or stands in a keep-clear area, as Equipment labels shows.`,
      "The keep-clear areas, doors and route are this model's own, and illustrative.",
    ],
    mode: [
      `${m.label}${r.mode === "standard" ? ": the room as configured." : "."}`,
      ...MODE_SYSTEMS.filter(s => MODE_TABLE[r.mode]?.[s.id]).map(s => { const [does, level] = MODE_TABLE[r.mode][s.id]; return `${s.label}: ${does} (${LEVELS.find(l => l.id === level).label.toLowerCase()}).`; }),
      "Medical alarms always stay on.",
    ],
  };

  const added = r.layout.added, red = added.some(x => x.level === "overlap");
  const health = [
    { id: "comfort", state: loud ? "look" : "settled", lines: [lightLine, `Blinds: ${blindWords(r.blinds)}.`, glassLine, `Noise at the pillow: about ${Math.round(r.noise)} dBA, ${band.words}. Illustrative.`, `Temperature and humidity: ${r.temp} °C, ${r.humidity}%, simulated.`] },
    { id: "equipment", state: r.lineClips ? "settled" : "look", lines: ["The pendant keeps the monitor, pumps and outlets off the floor.", r.lineClips ? "Every line is clipped and tagged." : "Lines aren't clipped or tagged: turn on Line clips and tags under Bed.", f.workstation ? "Supplies have a place at the workstation." : "No workstation: supplies have no place in the room.", "Cable routes by type: not modelled yet."] },
    { id: "access", state: added.length ? "look" : "settled", red, lines: [added.length ? added.slice(0, 4).map(x => `${x.label}: ${x.what}.`).join(" ") : "Added items and fittings: no modelled conflict found.", `The room's own kit: ${r.layout.own} findings as modelled, which Equipment labels shows.`, "This model's own areas, not hospital rules."] },
    { id: "communication", state: r.requests ? "look" : "settled", lines: [`Communication board: ${r.board === "simple" ? "the four main requests, larger" : r.board ? "every request, in English and Arabic" : "not offered while sedated"}.`, r.requests ? `${r.requests} request${r.requests > 1 ? "s" : ""} waiting at the nurse station.` : "No requests waiting.", `The wall's buttons: ${w.prompts ? "shown" : "not shown"}.`, `Family connection: ${r.family === "all" ? "everything" : "what staff allow"}.`] },
    { id: "cleaning", state: !r.cleaning.on ? "off" : r.cleaning.next ? "look" : "done", lines: r.cleaning.on ? [`${r.cleaning.ticks} of ${r.cleaning.total} steps ticked.`, r.cleaning.next ? `Next: ${r.cleaning.next}.` : "Checklist finished. It doesn't say the room is clean or disinfected."] : ["Cleaning mode is off: the checklist runs between patients."] },
  ].map(h => ({ ...h, label: HEALTH.find(x => x.id === h.id).label }));
  return { systems: Object.fromEntries(TWIN_SYSTEMS.map(s => [s.id, { label: s.label, lines: systems[s.id] }])), health, mode: m.label };
}
