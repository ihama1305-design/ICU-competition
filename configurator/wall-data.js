// The smart clinical wall, Transform my environment and the clinician workstation: their words, their made-up data and the
// rule that keeps them in step with the room. Data only, with no Three.js, so check 14 can read it in Node.
// SIMULATED throughout: every reading is made up and says so, the patient has no name or diagnosis, nothing listens, and
// nothing here changes an alarm, a device or the bedside monitor, which keeps running beside the wall.
import { MODES } from "./modes.js";

/** The wall's switch: who it is for right now. An option group (options.json `wall`, code 43). */
export const WALL_MODES = {
  clinical: {
    label: "Clinical",
    note: "For staff: the staff panel shows made-up observations, care tasks and equipment. The bedside monitor keeps running beside it.",
  },
  patient: {
    label: "Patient",
    note: "For the patient: the day, the date and the time, the care team by role, a simple plan for the day, and buttons for the communication board and family.",
  },
  relaxation: {
    label: "Relaxation",
    note: "A scene in place of everything that isn't needed now. Staff can switch the wall back at any time.",
  },
};
export const WALL_ORDER = ["clinical", "patient", "relaxation"];
export const DEFAULT_WALL = "patient";

/**
 * Transform my environment: one choice sets the patient wall, the ceiling above the bed and the room's light together
 * (options.json `scene`, code 44). The light is a look laid over the room, like a room mode's, and it eases in and out over
 * SCENE_MS. Off goes back to how the room was. Each scene is drawn in code (wall.js), in the style of the scenes the room already has.
 */
export const SCENES = {
  forest: { label: "Forest", light: { kelvin: 3500, level: 0.6 }, swatch: "#3f6b4a" },
  ocean: { label: "Ocean", light: { kelvin: 5000, level: 0.75 }, swatch: "#2f7fa6" },
  mountains: { label: "Mountains", light: { kelvin: 4500, level: 0.7 }, swatch: "#7c8fa6" },
  desert: { label: "Desert", light: { kelvin: 3200, level: 0.65 }, swatch: "#d3a26e" },
  garden: { label: "Garden", light: { kelvin: 4000, level: 0.7 }, swatch: "#7fae6b" },
  clearSky: { label: "Clear sky", light: { kelvin: 5500, level: 0.85 }, swatch: "#6fb2d6" },
  nightSky: { label: "Night sky", light: { kelvin: 2700, level: 0.2 }, swatch: "#1b2742" },
};
export const SCENE_ORDER = ["forest", "ocean", "mountains", "desert", "garden", "clearSky", "nightSky"];
export const SCENE_MS = 4000; // a slow change: the light and the pictures ease over four seconds (at once with reduced motion)
/** Relaxation with no scene chosen shows the one the sample comfort passport asks for (patient-states.js PASSPORT). */
export const PASSPORT_SCENE = "desert";

/**
 * What the wall shows, kept in step with the room, by the levels in modes.js (LEVELS), highest first. Emergency-ready
 * (clinical safety: the patient wall's screens and every scene go off, and the staff panel shows its clinical screen); then
 * the room mode staff chose, from its row in the mode table (Clinical turns the wall to Clinical, Comfort to Relaxation,
 * Family visit to family connection, Cleaning off); then Quiet now (the patient wall goes dark); then the wall's own switch
 * and the scene chosen (the patient's comfort preference). A sedated patient is never prompted: no buttons on the wall.
 * Returns { wall, staff: "clinical" | "standby", patient: "info" | "orientation" | "scene" | "family" | "off", scene: id or
 * null (on the patient wall), ceiling: id or null, light: id or null (the scene whose light is laid over the room), prompts,
 * emergency }.
 */
export function wallFor({ wall = DEFAULT_WALL, mode = "standard", state = "awake", quiet = false, scene = "off" } = {}) {
  const m = MODES[mode] || MODES.standard, chosen = SCENES[scene] && !m.scenesOff ? scene : null;
  if (mode === "emergency") return { wall: "clinical", staff: "clinical", patient: "off", scene: null, ceiling: null, light: null, prompts: false, emergency: true };
  if (m.wall === "off") return { wall: "off", staff: "standby", patient: "off", scene: null, ceiling: null, light: null, prompts: false, emergency: false }; // no patient: Cleaning
  const w = m.wall || (WALL_MODES[wall] ? wall : DEFAULT_WALL);
  const out = { wall: w, staff: w === "clinical" ? "clinical" : "standby", patient: "info", scene: null, ceiling: chosen, light: chosen, prompts: state !== "sedated", emergency: false };
  if (w === "clinical") { out.patient = "orientation"; out.prompts = false; } // a focused place to work: the patient keeps the time and date
  else if (w === "relaxation") { out.patient = "scene"; out.scene = chosen || PASSPORT_SCENE; out.prompts = false; }
  else if (w === "family") { out.patient = "family"; out.scene = chosen; out.prompts = false; } // family connection on the TV, a chosen scene round it
  else if (chosen) { out.patient = "scene"; out.scene = chosen; } // Patient, with a scene: the information sits over it
  if (quiet) { out.patient = "off"; out.scene = null; out.prompts = false; } // staff's Quiet now: no stimulation on the patient's wall
  return out;
}

// ---------------------------------------------------------------- what the screens say: made up, and marked so

/** Made-up observations for the staff panel's clinical screen and the workstation. Not readings: fixed sample values. */
export const OBS = [
  { id: "hr", label: "Heart rate", value: "78", unit: "/min", trace: "beat", colour: "#5fd38d" },
  { id: "spo2", label: "Oxygen saturation", short: "SpO₂", value: "97", unit: "%", trace: "wave", colour: "#5ab8f0" },
  { id: "bp", label: "Blood pressure", short: "BP", value: "118/72", unit: "mmHg", colour: "#f08a7a" },
  { id: "rr", label: "Breathing rate", short: "Resp", value: "16", unit: "/min", trace: "slow", colour: "#f0d25a" },
  { id: "temp", label: "Temperature", short: "Temp", value: "36.8", unit: "°C", colour: "#c9a6f0" },
];
export const OBS_NOTE = "Made-up values, fixed for this demo. The bedside monitor shows the patient, and its alarms are unchanged.";

/** The patient wall's information, for the patient: the care team by role and a simple plan. No names. */
export const CARE_TEAM = ["Nurse", "Doctor", "Physiotherapist", "Dietitian"];
export const DAY_PLAN = ["Wash", "Physiotherapy", "Rest", "Family visit at 4"];
/** The strip's text, in its canvas's pixels (fittings.js draws it 1600 by 200): two rows, as large as the strip allows. */
export const STRIP_TEXT = { canvas: [1600, 200], size: 52 };
/** The two buttons on the patient wall, beside the TV. Each opens a bedside screen (bedside.js). */
export const WALL_BUTTONS = [
  { id: "board", label: "Ask for something", tab: "board" },
  { id: "family", label: "Family", tab: "family" },
];

// ---------------------------------------------------------------- the clinician workstation

/** The overview: no name, no diagnosis. */
export const OVERVIEW = ["Adult patient · day 3 in intensive care", "On a ventilator, sedation stopped this morning", "Lines: arterial line, central line, feeding tube"];

/**
 * Care tasks. Choose one and the station shows what it needs and lights where that is in the room (`where`: an object the
 * page can find, see workstation.js). Done ticks it off, on the station and on the staff panel. Nothing is started by a timer.
 */
export const TASKS = [
  { id: "turn", label: "Turn and check skin", due: "Due at 2 pm", needs: ["Two staff", "The bed's controls", "Pillows to support the new position"], where: "bed", whereText: "At the bed" },
  { id: "dressing", label: "Change the central line dressing", due: "Due today", needs: ["Dressing pack", "Sterile gloves", "Cleaning wipes"], where: "supplies", whereText: "In the workstation's left cupboard" },
  { id: "lines", label: "Check every line", due: "Every hour", needs: ["The infusion pumps", "Each line's label"], where: "pumps", whereText: "On the pendant, by the bed head" },
  { id: "mouth", label: "Mouth care", due: "Due at 4 pm", needs: ["Mouth-care kit", "Gloves"], where: "ppe", whereText: "In the workstation's right cupboard" },
  { id: "vent", label: "Ventilator check", due: "Every four hours", needs: ["The ventilator's own screen"], where: "ventilator", whereText: "Beside the bed" },
];

/** Equipment, as words. A status here is part of the demo: it isn't read from any device. */
export const EQUIPMENT = [
  { label: "Patient monitor", status: "Running", where: "monitor" },
  { label: "Ventilator", status: "Running", where: "ventilator" },
  { label: "Infusion pumps", status: "Two running", where: "pumps" },
  { label: "Bed", status: "Brakes on, lowest height", where: "bed" },
];

/** What is planned, for the doctor's view. */
export const PLAN = ["Ward round at ten", "Try a short breathing trial this afternoon", "Physiotherapy at eleven", "Review the lines tomorrow"];
export const HANDOVER = ["Comfortable overnight, slept in short spells.", "Family visiting at four.", "Check the lines before the turn."];

/**
 * Where supplies are kept. Clinical supplies stay at the workstation, apart from the patient's own things in the bedside
 * cabinet and the wardrobe. Anything the model doesn't have is said so, never placed.
 */
export const SUPPLIES = [
  { label: "Dressings and line kits", where: "supplies", whereText: "Workstation, left cupboard" },
  { label: "Gloves, aprons, wipes and mouth care", where: "ppe", whereText: "Workstation, right cupboard" },
  { label: "Hand rub", where: null, whereText: "By the door: place a dispenser under Place items" },
  { label: "The patient's own things", where: "belongings", whereText: "Bedside cabinet and wardrobe: kept apart from supplies" },
  { label: "Linen", where: null, whereText: "The unit's store: not in this model" },
];

/** Two views of the same patient: the nurse's starts with tasks, the doctor's with observations and the plan. */
export const STATION_VIEWS = {
  nurse: { label: "Nurse view", sections: ["overview", "tasks", "equipment", "obs", "supplies", "handover"] },
  doctor: { label: "Doctor view", sections: ["overview", "obs", "plan", "equipment", "handover", "tasks"] },
};
export const SECTION_TITLES = { overview: "Overview", tasks: "Care tasks", equipment: "Equipment", obs: "Observations", plan: "Plan", handover: "Handover", supplies: "Where supplies are" };

/**
 * Hands-free: buttons standing in for spoken commands. Nothing listens. The station answers on its own screen only: nothing
 * about the patient is said aloud.
 */
export const HANDS_FREE = [
  { id: "tasks", says: "Show my tasks", does: "Shows the care tasks." },
  { id: "next", says: "Next task", does: "Chooses the next task not yet done, and lights where it is." },
  { id: "dressings", says: "Where are the dressings?", does: "Lights the cupboard they're in." },
  { id: "handover", says: "Show the handover", does: "Shows the handover note on the screen. It isn't read aloud." },
];
export const HANDS_FREE_NOTE = "Each button stands in for a spoken command. Nothing listens, and the station answers on its screen only: nothing about the patient is said aloud.";

/** Emergency-ready: where the emergency equipment is, and the clear way to the bed. Not a validated emergency protocol. */
export const EMERGENCY = {
  title: "Emergency: where things are",
  items: [
    { label: "Oxygen, suction and power", where: "pendant", whereText: "On the ceiling pendant at the bed head" },
    { label: "Patient monitor", where: "monitor", whereText: "On the pendant: it keeps running" },
    { label: "Ventilator", where: "ventilator", whereText: "Beside the bed" },
    { label: "Resuscitation trolley", where: "door", whereText: "Comes in by the door, along the clear route: kept outside the room in this model" },
  ],
  route: "The clear route from the door to the bed, and the keep-clear areas round it, are marked on the floor. Illustrative.",
  caveat: "Not a validated emergency protocol. A hospital sets its own, and staff follow it.",
};
