// "See it in action": a short captioned demo for a feature card (features.json). Each step sets up the room through `api`
// (main.js), then holds while its caption is read. A demo is an overlay: it changes no choice, link or summary, and when it
// ends, or is stopped, the room goes back exactly as it was. Nothing here imports Three.js, so check 14 can read it in Node.
//
// api: option(group, id) shows an option without choosing it; time(stop); mode(name); camera(view); frame(featureId) stands
// in front of a feature's object; wardrobe(side) slides its doors ("left", "right" or null for closed); outline(featureId)
// marks one feature for the step; oldWardrobe(on) outlines the wardrobe it replaced. A step's caption can be worked out
// from the room: say(api), where api.figures() gives the two wardrobes' sizes as a sentence.

export const DEMOS = {
  circadian: {
    steps: [
      { say: "Morning: the cool white light comes up with the day.", run: a => { a.option("scheme", "circadian"); a.time("morning"); a.camera("overview"); } },
      { say: "Midday: the brightest, coolest white.", run: a => a.time("midday") },
      { say: "Sunset: the light warms.", run: a => a.time("sunset") },
      { say: "Night: warm, and dimmed for sleep.", run: a => a.time("night") },
    ],
  },
  privacy: {
    steps: [
      { say: "Smart glass on the glazed front, clear, so staff can see in.", run: a => { a.option("front", "smart"); a.time("afternoon"); a.camera("entrance"); } },
      { say: "Privacy mode: the glass turns opaque and the window blinds lower halfway.", run: a => a.mode("privacy") },
      { say: "Staff can end it at any moment, and the glass clears.", run: a => a.mode("standard") },
    ],
  },
  orientation: {
    steps: [
      { say: "The TV shows the weekday, the date and the time of day.", run: a => { a.option("tvplay", "orientation"); a.time("afternoon"); a.camera("bed"); } },
      { say: "From the pillow, in Patient view, it's large enough to read.", run: a => a.camera("patient") },
      { say: "After dark the screen dims.", run: a => a.time("night") },
    ],
  },
  nature: {
    steps: [
      { say: "A slow desert scene on the TV.", run: a => { a.option("tvplay", "on"); a.time("afternoon"); a.camera("bed"); } },
      { say: "A printed sky on the ceiling above the bed.", run: a => { a.option("ceiling", "sky"); a.camera("overview"); } },
      { say: "Fish on a wall screen, with no water in the room.", run: a => { a.option("aquarium", "digital"); a.frame("digitalAquarium"); } },
    ],
  },
  tvScene: {
    steps: [{ say: "A slow desert scene on the TV, drawn in the page.", run: a => { a.option("tvplay", "on"); a.time("afternoon"); a.camera("bed"); } }],
  },
  skyCeiling: {
    steps: [{ say: "A printed sky on the ceiling above the bed, lit from behind.", run: a => { a.option("ceiling", "sky"); a.camera("overview"); } }],
  },
  digitalAquarium: {
    steps: [{ say: "Fish on a wall screen, with no water in the room.", run: a => { a.option("aquarium", "digital"); a.frame("digitalAquarium"); } }],
  },
  // See how it works, in the order the brief gives: the cabinet, the doors, each compartment with what it holds, the
  // wardrobe it replaced, and the doors closed again
  wardrobe: {
    steps: [
      { say: "The built-in wardrobe, floor to ceiling against the back wall.", run: a => { a.option("wardrobe", "on"); a.wardrobe(null); a.frame("wardrobe"); a.outline("wardrobe"); } },
      { say: "The left door slides behind the right, and a low-glare light comes on inside.", run: a => { a.wardrobe("left"); a.outline("wardrobeLighting"); } },
      { say: "Daily essentials at eye level: glasses, books, a wash bag.", run: a => a.outline("wardrobeEssentials") },
      { say: "Below them, a lockable box for valuables.", run: a => a.outline("wardrobeValuables") },
      { say: "On the cabinet floor, room for a bag.", run: a => a.outline("wardrobeBelongings") },
      { say: "The right door slides across, and clothes hang on the rail.", run: a => { a.wardrobe("right"); a.outline("wardrobeClothing"); } },
      { say: a => `The freestanding wardrobe it replaced, outlined. ${a.figures()}`, run: a => { a.wardrobe(null); a.oldWardrobe(true); } },
      { say: "The doors close flush with the end panels.", run: a => { a.oldWardrobe(false); a.outline("wardrobeDoors"); } },
    ],
  },
  wardrobeCompartments: {
    label: "View storage compartments",
    steps: [
      { say: "Behind the left door: daily essentials on the shelf at eye level.", run: a => { a.option("wardrobe", "on"); a.frame("wardrobe"); a.wardrobe("left"); a.outline("wardrobeEssentials"); } },
      { say: "A lockable box for valuables.", run: a => a.outline("wardrobeValuables") },
      { say: "Room for a bag on the cabinet floor.", run: a => a.outline("wardrobeBelongings") },
      { say: "Behind the right door: clothes on the rail, shoes below.", run: a => { a.wardrobe("right"); a.outline("wardrobeClothing"); } },
    ],
  },
  wardrobeCompare: {
    label: "Compare with the old wardrobe",
    steps: [
      { say: a => `The freestanding wardrobe it replaced, outlined. ${a.figures()}`, run: a => { a.option("wardrobe", "on"); a.wardrobe(null); a.frame("wardrobe"); a.oldWardrobe(true); } },
      { say: "What changed is height, cleaning and a tidier look: it reaches the ceiling, so there's no top for dust, and its end panels are flush with its doors.", run: a => a.outline("wardrobe") },
    ],
  },
  daylight: {
    steps: [
      { say: "Afternoon: the sensor sees daylight, so Comfort mode lowers the blinds against glare.", run: a => { a.time("afternoon"); a.camera("bed_window"); a.mode("comfort"); } },
      { say: "After sunset there's no glare to block. Comfort mode changes only the lights, and the blinds stay up.", run: a => a.time("night") },
    ],
  },
};

/**
 * The card buttons a feature can name in its `actions`, besides its demo. main.js has a handler for each. "demo:<id>"
 * runs another of the feature's demos, under the label that demo gives.
 */
export const ACTIONS = ["wardrobe", "wardrobe:learn", "demo:wardrobeCompartments", "demo:wardrobeCompare", "sound:call", "sound:groan"];

export const HOLD_MS = 3200; // each step, counted from when its room has come to rest
