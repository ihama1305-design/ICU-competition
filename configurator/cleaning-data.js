// Cleaning mode, for a room between patients: the checklist a visitor ticks, one step at a time, each lighting what it
// covers in the room. Data only, with no Three.js, so check 14 can read it in Node. It's a demonstration of order, not a
// cleaning protocol: finishing it says the checklist is finished, and never that the room is clean or disinfected.

/**
 * The steps, in order: hands first and last, then the high-touch surfaces from the bed outwards, and the equipment.
 * `kind`: hygiene (a hand-hygiene point), touch (a high-touch surface) or equipment. `where`: what main.js lights.
 */
export const CLEANING_STEPS = [
  { id: "handsIn", label: "Clean your hands", kind: "hygiene", where: "basin" },
  { id: "rails", label: "Bed rails, controls and call button", kind: "touch", where: "bed" },
  { id: "table", label: "Overbed table", kind: "touch", where: "table" },
  { id: "screens", label: "Monitor and pump screens and buttons", kind: "equipment", where: "screens" },
  { id: "ventilator", label: "Ventilator's outer surfaces", kind: "equipment", where: "ventilator" },
  { id: "pendant", label: "Pendant shelves and outlet covers", kind: "touch", where: "pendant" },
  { id: "controls", label: "Wall controls, switches and handles", kind: "touch", where: "controls" },
  { id: "chairs", label: "Recliner and visitor chair", kind: "touch", where: "chairs" },
  { id: "handsOut", label: "Clean your hands again", kind: "hygiene", where: "basin" },
];
export const CLEANING_KINDS = { hygiene: "Hand hygiene", touch: "High-touch surface", equipment: "Equipment to clean" };

export const CLEANING_TEXT = {
  title: "Cleaning checklist · SIMULATED",
  intro: "For a room between patients, so the bed is empty. Tick each step: the next one lights in the room.",
  done: "Checklist finished. That's all it records: it doesn't say the room is clean or disinfected. The hospital's own cleaning procedure and checks decide that.",
  air: "No airflow is drawn in the room. How the air is changed is on the ventilation plan.",
  airLink: "../ventilation/",
  airLinkText: "See the ventilation plan",
  limits: "An order to show the idea, not a cleaning protocol. Products, contact times and the order of work are set by the hospital's infection-control team.",
};
