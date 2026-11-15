// Room intelligence: three flush sensors on the ceiling, what each would cover, and two made-up events, each raised by a
// button. Data only, with no Three.js, so check 14 can read it in Node. Nothing watches and nothing listens: no camera, no
// microphone and no sensor reading. An event is a button standing in for what a real system might notice, and a person
// looks and acknowledges. It is a concept for decision support, not a validated clinical device, and it isn't AI.

/**
 * The sensors. `at`: where each sits, worked out per room in main.js from the room's own points: over the bed, inside the
 * door, and over the middle of the room. `reach`: the radius it would cover on the floor, in metres. Illustrative.
 */
export const SENSORS = [
  { id: "bed", label: "Over the bed", at: "bed", reach: 1.5, covers: "The bed and the space either side of it" },
  { id: "door", label: "Inside the door", at: "door", reach: 1.3, covers: "The door and the way in" },
  { id: "room", label: "Over the middle of the room", at: "room", reach: 1.6, covers: "The clear areas round the bed and the route to it" },
];

/** The two made-up events. `where`: what main.js lights. Each notice stays until a person acknowledges it. */
export const EVENTS = [
  {
    id: "edge", button: "Simulate: the patient moves toward the bed's edge", where: "edge",
    notice: "Possible movement toward the edge of the bed, on the patient's right. Look in on the patient.",
  },
  {
    id: "clear", button: "Simulate: something left in a clear area", where: "clear",
    notice: "Something may have been left in the clear area beside the bed. Move it when it's safe to.",
  },
];

export const INTEL_TEXT = {
  title: "Room intelligence · SIMULATED",
  intro: "A room that notices when help may be needed. Three flush sensors on the ceiling would each cover part of the room. Activate it to see what each would cover, then try the two made-up events.",
  meta: "A made-up event, raised by a button. Nothing watched the patient or the room: no camera, no microphone and no sensor reading. A person looks and acknowledges.",
  readings: "The readings are the ones the room already has: the comfort control's temperature and humidity (simulated), the noise at the pillow (illustrative), and the daylight sensor on the sill.",
  limits: "A concept for monitoring and decision support, not a validated clinical device. It changes no alarm or device, and it isn't AI.",
  acknowledged: "Acknowledged. The notice is gone; what it pointed at is still there until someone moves it.",
  reset: "Reset: the made-up events and their notices are gone.",
};

/** The room safety scan's words. Green, amber and red are always named in words as well. */
export const SCAN_TEXT = {
  none: "No items placed. Place some under Place items, then scan again.",
  clear: "No modelled conflict found",
  clearance: "A clearance to look at",
  overlap: "An overlap",
  intro: "Checks each placed item against this model's own clear areas, the doors, the wardrobe's front and the route to the bed. Not hospital rules.",
  move: "A nearby spot where it would be clear is marked on the floor. Drag the item there yourself.",
  nowhere: "No clear spot within a couple of metres: try another part of the room.",
};
