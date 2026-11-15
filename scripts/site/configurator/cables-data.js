// Equipment and cables: the kinds of cable and line the overlay shows, the channels they run in, and its words. Data only,
// with no Three.js, so check 14 can read it in Node. Every kind has a label as well as a colour, and medical gas never
// shares a channel with anything electrical. Illustrative: no route here is an engineering or clinical design.

/** The kinds the overlay tells apart, by colour and by a label in the room. `channel`: the one it runs in, when organised. */
export const KINDS = [
  { id: "power", label: "Power", colour: "#e8913a", channel: "electrical" },
  { id: "data", label: "Data", colour: "#3a8fd8", channel: "electrical" },
  { id: "gas", label: "Medical gas", colour: "#4caf50", channel: "gas" },
  { id: "patient", label: "Patient lines", colour: "#a98ad8", channel: null }, // at the patient: the bed's clips and tags, and APIS
];

/** The channels on the ceiling and the wall behind the bed head. Gas has its own: it never shares with power or data. */
export const CHANNELS = [
  { id: "electrical", label: "Power and data channel", carries: ["power", "data"] },
  { id: "gas", label: "Medical gas channel", carries: ["gas"] },
];

/** Where each kind runs, by state. A route is named by what it joins; main.js turns these into points in each room. */
export const ROUTES_BY_STATE = {
  traditional: [
    { kind: "power", from: "wall-low", to: "ventilator", floor: true },
    { kind: "power", from: "wall-low", to: "bed", floor: true },
    { kind: "power", from: "wall-low", to: "iv", floor: true },
    { kind: "data", from: "wall-low", to: "ventilator", floor: true },
    { kind: "gas", from: "wall-low", to: "ventilator", floor: true },
  ],
  organised: [
    { kind: "power", from: "wall-channel", to: "pendant" },
    { kind: "power", from: "pendant", to: "pumps" },
    { kind: "power", from: "pendant", to: "dock" },
    { kind: "data", from: "pendant", to: "wall-channel" },
    { kind: "data", from: "monitor", to: "pendant" },
    { kind: "gas", from: "gas-channel", to: "pendant" },
    { kind: "gas", from: "pendant", to: "dock" },
  ],
};

export const CABLE_TEXT = {
  title: "Equipment and cables · SIMULATED",
  intro: "Power, data, medical gas and the patient's lines, each with its own colour and a label in the room.",
  traditional: "Traditional: cables loose on the floor from the wall to the kit, round the bed where staff work.",
  organised: "Organised: power and data in one channel, medical gas in its own, down the ceiling pendant to the kit, and the ventilator's docking spot fed from the pendant. Nothing on the floor.",
  patient: "The patient's own lines are clipped and tagged at the bed (the bed's Lines), and APIS's Tubing & movement shows them tangled against organised.",
  limits: "Illustrative routes, not an engineering or clinical design. Nothing retracts, clamps or disconnects a line, and nothing moves by itself. Medical gas and electrical services would need their own engineering and regulatory review.",
};
