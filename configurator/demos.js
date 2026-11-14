// "See it in action": a short captioned demo for a feature card (features.json). Each step sets up the room through `api`
// (main.js), then holds while its caption is read. A demo is an overlay: it changes no choice, link or summary, and when it
// ends, or is stopped, the room goes back exactly as it was. Nothing here imports Three.js, so check 14 can read it in Node.
//
// api: option(group, id) shows an option without choosing it; time(stop); mode(name); camera(view); frame(featureId) stands
// in front of a feature's object; wardrobe(open).

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
  wardrobe: {
    steps: [
      { say: "The built-in wardrobe, floor to ceiling against the back wall.", run: a => { a.option("wardrobe", "on"); a.wardrobe(false); a.frame("wardrobe"); } },
      { say: "The doors slide open: the left runs behind the right. Inside are a shelf, a hanging rail and clothes.", run: a => a.wardrobe(true) },
      { say: "And they close flush with the end panels.", run: a => a.wardrobe(false) },
    ],
  },
  daylight: {
    steps: [
      { say: "Afternoon: the sensor sees daylight, so Comfort mode lowers the blinds against glare.", run: a => { a.time("afternoon"); a.camera("bed_window"); a.mode("comfort"); } },
      { say: "After sunset there's no glare to block. Comfort mode changes only the lights, and the blinds stay up.", run: a => a.time("night") },
    ],
  },
};

/** The card buttons a feature can name in its `actions`, besides its demo. main.js has a handler for each. */
export const ACTIONS = ["wardrobe", "sound:call", "sound:groan"];

export const HOLD_MS = 3200; // each step, counted from when its room has come to rest
