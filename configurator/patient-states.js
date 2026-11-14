// The patient's state, and the bedside screens that follow it: the communication board, the comfort passport and family
// connection. Data only, with no Three.js, so the checks can read it in Node. Everything here is SIMULATED: the patient is a
// teaching figure with no identity, nothing is sent anywhere, and no alarm, device or clinical setting is ever changed.
//
// A state is an overlay, like a room mode: it changes no choice, link or summary. Awake is the room as configured, so the
// room looks the same as it loads. The room modes stay as they were: Clinical and Emergency-ready are the staff override
// and always win, and Emergency-ready is the brief's fourth mode.

export const STATES = {
  sedated: {
    label: "Sedated",
    long: "Sedated or unresponsive",
    // shown in place of the configured choices, never chosen: no entertainment on the patient's screen
    shows: { tvplay: "off" },
    light: "steady", // stable light by the time of day, a little lower
    note: "Sedated or unresponsive: light by the time of day, a little lower, no entertainment on the screen, and comfort set by staff. Staff see the positioning reminder, line status and noise.",
    say: "Patient state: sedated or unresponsive. Steady light by the time of day, and nothing on the patient's screen.",
  },
  awake: {
    label: "Awake",
    long: "Awake",
    shows: {},
    light: null, // the room as configured
    note: "",
    say: "Patient state: awake. The room as configured, with the patient's own controls.",
  },
  recovering: {
    label: "Recovering",
    long: "Recovering",
    shows: { tvplay: "orientation" },
    light: "day", // light by the time of day
    note: "Recovering: the orientation screen first, light by the time of day, simple choices and gentle changes.",
    say: "Patient state: recovering. The orientation screen first, and light by the time of day.",
  },
};
export const STATE_ORDER = ["sedated", "awake", "recovering"];
export const DEFAULT_STATE = "awake";
export const STATE_MS = 2600; // a change of state eases over this long: never abrupt

/** What each state offers on the bedside screens. Recovering keeps choices simple; sedated offers what staff allow. */
export const OFFERS = {
  sedated: { board: false, passport: "staff", family: "staff", note: "The patient can't use the screens now. Staff set comfort, and family connection offers only what staff allow." },
  awake: { board: true, passport: "patient", family: "all", note: "The patient's own controls: the communication board, privacy, family and orientation." },
  recovering: { board: "simple", passport: "patient", family: "all", note: "Simple choices and more independence: the board's four main requests, larger." },
};

/** The communication board, for a patient who can't speak: the brief's seven requests, in its order. */
export const BOARD = [
  { id: "help", label: "I need help", simple: true },
  { id: "pain", label: "I am in pain", simple: true },
  { id: "cold", label: "I feel cold" },
  { id: "hot", label: "I feel hot" },
  { id: "reposition", label: "I need repositioning", simple: true },
  { id: "family", label: "I want to contact my family" },
  { id: "nurse", label: "I need a nurse", simple: true },
];
/** The board's two simulated inputs besides touch: a switch that steps through the buttons, and gaze that selects by dwell. */
export const SCAN_MS = 1400; // the switch's highlight moves on this often
export const DWELL_MS = 1500; // a look held this long selects

/**
 * The sample comfort passport: a made-up patient's preferences, as they'd be recorded with the patient or family. No name.
 * `options` are what can be chosen; temperature is shown and never applied.
 */
export const PASSPORT = [
  { id: "light", label: "Preferred light", value: "warm", options: { warm: "Warm and low", neutral: "Neutral", bright: "Bright daylight" } },
  { id: "temperature", label: "Temperature", value: "cooler", options: { cooler: "A little cooler", neutral: "No preference", warmer: "A little warmer" }, shownOnly: true },
  { id: "sound", label: "Music or quiet", value: "music", options: { music: "Familiar music, quietly", quiet: "Quiet", nature: "Nature sounds" } },
  { id: "scene", label: "Nature scene", value: "desert", options: { desert: "Desert dunes", sea: "The sea", garden: "A garden" } },
  { id: "photos", label: "Family photographs", value: "show", options: { show: "Show them", ask: "Ask first", none: "Not shown" } },
  { id: "privacy", label: "Privacy", value: "rest", options: { rest: "Glass opaque while resting", care: "Only during care", open: "Prefers to see out" } },
  { id: "communicate", label: "How I like to communicate", value: "board", options: { speech: "Speaking", board: "Communication board", switch: "A single switch", gaze: "Eye gaze" } },
  { id: "entertainment", label: "Entertainment", value: "films", options: { films: "Films", news: "The news", none: "None" } },
];

/** Set by the care team. Listed so the line between the patient's wishes and clinical decisions is clear: nothing here changes them. */
export const CLINICIAN = [
  { label: "Alarm limits and volumes", value: "Set on each device by the care team. Never changed here." },
  { label: "Light for care", value: "Staff turn on full light or the task light whenever care needs it." },
  { label: "Positioning plan", value: "Set by the nursing team." },
  { label: "Sedation and pain relief", value: "Clinical decisions, not comfort settings." },
  { label: "Room temperature", value: "Within the hospital's limits. No approved limits were supplied, so the preference is shown, not applied." },
];

/**
 * How each preference is used in each state: "used", "gentle" (used, with gentle changes), "staff" (only if staff allow),
 * or "held" (held back), with the reason. Temperature is never used: there's no approved range to apply it in.
 */
export const APPLY = {
  light: { sedated: ["held", "Staff set the light by the time of day."], awake: ["used", "The patient's own setting."], recovering: ["gentle", "Changed gradually."] },
  temperature: { sedated: ["held", "Shown, not applied."], awake: ["held", "Shown, not applied."], recovering: ["held", "Shown, not applied."] },
  sound: { sedated: ["staff", "Only if staff allow, and quietly."], awake: ["used", "When the patient asks."], recovering: ["used", "Quietly."] },
  scene: { sedated: ["staff", "Only if staff allow."], awake: ["used", "On the TV when chosen."], recovering: ["used", "After the orientation screen."] },
  photos: { sedated: ["staff", "Only if staff allow."], awake: ["used", "As the patient chose."], recovering: ["used", "As the patient chose."] },
  privacy: { sedated: ["staff", "Staff decide, and keep sight of the patient."], awake: ["used", "The patient can ask."], recovering: ["used", "The patient can ask."] },
  communicate: { sedated: ["held", "Staff watch for signs instead."], awake: ["used", "The board opens in this way."], recovering: ["used", "With fewer, larger buttons."] },
  entertainment: { sedated: ["held", "Nothing on the screen."], awake: ["used", "When the patient asks."], recovering: ["gentle", "Short spells."] },
};
export const APPLY_WORDS = { used: "Used", gentle: "Used gently", staff: "If staff allow", held: "Held back" };

/** Family connection: what can be offered, and whether staff allow each for a sedated or unresponsive patient by default. */
export const FAMILY = [
  { id: "photos", label: "Family photographs", what: "Drawn placeholders here: no photograph is uploaded or stored.", staffAllow: true },
  { id: "message", label: "Voice message", what: "Shown, not played: there's no real voice to use. A caption says what it would say.", staffAllow: true },
  { id: "call", label: "Video call", what: "Simulated: no camera, microphone or call is used.", staffAllow: false },
  { id: "scene", label: "A personal scene", what: "The TV shows the scene from the passport.", staffAllow: false },
  { id: "music", label: "Familiar music", what: "Plays as demo sound, quietly, only when pressed.", staffAllow: false },
  { id: "orientation", label: "Orientation messages", what: "Short lines on the orientation screen, confirmed by staff.", staffAllow: true },
];
/** The voice message's caption, as family might record it. No names. */
export const MESSAGE = "Hello love, it's us. We're all thinking of you. We'll be in to see you this afternoon.";

/** The orientation screen's extra lines. Where the patient is, visiting confirmed by staff, and plans: never patient details. */
export const ORIENTATION = {
  where: "You are in hospital, in the intensive care unit.",
  visiting: "Visiting today: 4 to 8 pm · confirmed by staff",
  planned: "Later: a wash, then a rest",
  recovering: "Today's goal: sit in the chair for a while",
  family: "Your family will visit this afternoon.",
};

/** The staff view while the patient is sedated: a reminder staff dismiss, line status and noise. All simulated. */
export const STAFF = {
  reminder: "Positioning assessment due · SIMULATED. Check the positioning plan. Nothing here moves a patient.",
  lines: "Lines and tubes: routed and labelled on the patient figure. SIMULATED: no line or device is monitored.",
  noise: "Noise at the pillow: see Acoustic comfort mode. Illustrative.",
};
