// The feature registry, checked without a browser: node scripts/14_check_features.mjs
// Every entry in features.json has its fields, belongs to a group, links to objects that exist (add-ons built in addons.js,
// parts of both room models, placed items, named objects), cites only sources that options.json already holds, makes no
// outcome claim, and names a demo or action that has a handler. Each demo is run against a stand-in for the page, so a step
// that names an option, time, mode, view or feature that doesn't exist fails here. Checks 08 clicks every card for real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ACTIONS, DEMOS, HOLD_MS } from "./site/configurator/demos.js";
import { ALARMS_LINE, LEVELS, MODES, MODE_ORDER, MODE_TABLE, SYSTEMS, decide, modeText } from "./site/configurator/modes.js";
import { CLEANING_STEPS, CLEANING_TEXT } from "./site/configurator/cleaning-data.js";
import { HEALTH, STATES as TWIN_STATES, TWIN_SYSTEMS, TWIN_TEXT, twinRead } from "./site/configurator/twin-data.js";
import { EVENTS, INTEL_TEXT, SCAN_TEXT, SENSORS } from "./site/configurator/intel-data.js";
import { suggestSpot } from "./site/configurator/layout.js";
import { ARRIVALS, ARRIVAL_ORDER, ARRIVAL_TEXT, ARRIVAL_VIEW, along, routeLength, walkTime, walked } from "./site/configurator/arrival-data.js";
import { CABLE_TEXT, CHANNELS, KINDS as CABLE_KINDS, ROUTES_BY_STATE } from "./site/configurator/cables-data.js";
import { parseObject } from "./site/configurator/feature-links.js";
import { APPLY, BOARD, BOARD_AR, BOARD_CONFIRM, CLINICIAN, DEFAULT_STATE, FAMILY, OFFERS, ORIENTATION, PASSPORT, STAFF, STATES, STATE_MS, STATE_ORDER } from "./site/configurator/patient-states.js";
import { BANDS as PRESSURE_BANDS, DEFAULT_MINUTES, DEFAULT_POSITION, GRID, LINES, LINES_TEXT, MOVE_CHECK, PLAN, POSITIONS, POSITION_ORDER, PRESSURE_TEXT, SLACK, SLACK_BY, TIMES, peakOf, pressureMap, sustained } from "./site/configurator/bed.js";
import { DAY_TEXT, PHASES, QUIET, blindsAt, inQuiet, lookAt, phaseAt, words } from "./site/configurator/day-plan.js";
import { BACKGROUND, BANDS, FITTINGS, FITTING_GROUPS, ILLUSTRATIVE, NOTIFICATIONS, SOURCES, levelAt, sourceLevel } from "./site/configurator/acoustic.js";
import { ACROSS, FIT } from "./site/configurator/fittings-data.js";
import { CHAIR, bayOutline, chairBox, chairFootprint } from "./site/configurator/chair-data.js";
import { DOOR_DEPTH, ROUTES, ZONE_KINDS, boxesOverlap, checkLayout, corridor, inPolygon, intrusion, strip } from "./site/configurator/layout.js";
import { decodeSpec } from "./site/configurator/state.js";
import {
  CARE_TEAM, DAY_PLAN, DEFAULT_WALL, EMERGENCY, EQUIPMENT, HANDS_FREE, HANDS_FREE_NOTE, OBS, OBS_NOTE, OVERVIEW, PASSPORT_SCENE, SCENES, SCENE_MS,
  SCENE_ORDER, STATION_VIEWS, STRIP_TEXT, SUPPLIES, TASKS, WALL_BUTTONS, WALL_MODES, WALL_ORDER, wallFor,
} from "./site/configurator/wall-data.js";

const here = p => new URL(p, import.meta.url);
const read = p => readFileSync(here(p), "utf8");
const data = JSON.parse(read("./site/configurator/features.json"));
const options = JSON.parse(read("./site/configurator/options.json"));
const groups = options.sections.flatMap(s => s.groups);
const groupById = id => groups.find(g => g.id === id);

// what the page has: add-ons, placed items, named objects, the time stops, and each room's model parts and views
const fittingsSrc = read("./site/configurator/fittings.js");
const addonsSrc = read("./site/configurator/addons.js") + fittingsSrc + read("./site/configurator/wall.js") + read("./site/configurator/intel.js") + read("./site/configurator/cables.js"), placedSrc = read("./site/configurator/placed.js"), mainSrc = read("./site/configurator/main.js");
const ADDONS = new Set([...addonsSrc.matchAll(/^ {2}(\w+)\(room\) \{/gm)].map(m => m[1]));
const PLACED = new Set([...placedSrc.matchAll(/^ {4}id: "(\w+)", code:/gm)].map(m => m[1]));
const STOPS = new Set(Object.keys(Function(`return ${/const STOPS = (\{[^}]*\})/.exec(mainSrc)[1]}`)()));
const ROOMS = {}, METAS = {};
for (const label of options.rooms) {
  const meta = METAS[label] = JSON.parse(read(`../assets/model/room_${label.toLowerCase()}.json`));
  const glb = gunzipSync(readFileSync(here(`../assets/model/${meta.glb}`)));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  // the view across the room is added by the page from fittings-data.js, as it loads each room
  ROOMS[label] = { parts: new Set(json.nodes.map(n => n.name).filter(Boolean)), views: new Set([...Object.keys(meta.cameras), ...(ACROSS[label] ? ["across"] : [])]) };
}
assert.ok(ADDONS.has("wardrobe") && ADDONS.has("soundSensor") && PLACED.has("leafpanel") && STOPS.has("night"), "the page's add-ons, placed items and time stops are read");

// ---------------------------------------------------------------- the groups the brief names, and the entries
assert.deepEqual(data.groups.map(g => g.id), ["comfort", "bed", "light", "family", "admission", "storage", "workflow"], "the six groups, and Clinical workflow for the Future ICU's staff fittings");
const ids = new Set(), names = new Set(), byId = new Map(data.features.map(f => [f.id, f]));
const sourcesOf = ref => { const [g, o] = ref.split(":"); return (o ? groupById(g)?.options.find(x => x.id === o)?.note?.sources : groupById(g)?.note?.sources) || []; };
const TEXT = ["purpose", "how", "benefit", "awake", "sedated", "limits"];
const OUTCOME = /\b(reduc\w*|prevent\w*|improv\w*|faster|shorter|proven|cures?|heal\w*|guarantee\w*)\b/i; // no outcome claims outside the evidence line
let links = 0, demosUsed = new Set();

for (const f of data.features) {
  const who = `${f.id || "an entry"}`;
  for (const k of ["id", "name", "group", "purpose", "how", "benefit"]) assert.ok(typeof f[k] === "string" && f[k].trim(), `${who} has its ${k}`);
  assert.ok(!ids.has(f.id) && !names.has(f.name), `${who}: its id and name are its own`);
  ids.add(f.id); names.add(f.name);
  assert.ok(data.groups.some(g => g.id === f.group), `${who}: its group ${f.group} is one of the six`);
  assert.equal(f.name, f.name[0].toUpperCase() + f.name.slice(1), `${who}: its name is in sentence case`);
  if (f.parent) {
    assert.ok(byId.has(f.parent) && !byId.get(f.parent).parent, `${who}: its feature ${f.parent} exists, and is a feature, not a part`);
    assert.equal(f.group, byId.get(f.parent).group, `${who}: a part is in its feature's group`);
  }
  // limits: a line of its own, or a table of them from options.json
  const table = f.rowsFrom ? options[f.rowsFrom] : null;
  if (f.rowsFrom) assert.ok(table?.rows?.length, `${who}: its rows, ${f.rowsFrom}, are in options.json`);
  assert.ok((typeof f.limits === "string" && f.limits.trim()) || table?.title === "Limits", `${who} states its limits`);
  for (const k of TEXT) {
    if (f[k] === undefined) continue;
    assert.ok(typeof f[k] === "string" && f[k].trim(), `${who}: ${k} is text`);
    assert.ok(!/\d\s*%/.test(f[k]), `${who}: no percentage in its ${k}`);
  }
  for (const k of ["purpose", "benefit", "awake", "sedated"]) if (f[k]) assert.ok(!OUTCOME.test(f[k]), `${who}: its ${k} makes no outcome claim: "${OUTCOME.exec(f[k])?.[0]}"`);
  for (const [room, lines] of Object.entries(f.byRoom || {})) {
    assert.ok(options.rooms.includes(room), `${who}: byRoom names a room, ${room}`);
    for (const [k, t] of Object.entries(lines)) assert.ok(TEXT.includes(k) && typeof t === "string" && !OUTCOME.test(t), `${who}: its ${room} ${k} is text with no outcome claim`);
  }
  // evidence: "Expected, not shown." or a line with its strength and sources already in options.json
  const ev = f.evidence;
  assert.ok(ev && typeof ev.text === "string" && ev.text.trim(), `${who} has an evidence line`);
  if (ev.text !== "Expected, not shown.") {
    assert.ok(typeof ev.strength === "string" && ev.strength.trim(), `${who}: its evidence says how strong it is`);
    assert.ok(ev.sourcesFrom && sourcesOf(ev.sourcesFrom).length, `${who}: its evidence cites sources from options.json (${ev.sourcesFrom})`);
  } else assert.ok(!ev.strength && !ev.sourcesFrom, `${who}: "Expected, not shown." cites nothing`);
  if (f.sourcesFrom) assert.ok(sourcesOf(f.sourcesFrom).length, `${who}: its sources, ${f.sourcesFrom}, are in options.json`);
  // objects: each exists, in every room
  assert.ok(Array.isArray(f.objects), `${who} lists its objects`);
  const parts = data.features.filter(p => p.parent === f.id);
  const template = read("./site/configurator.template.html");
  if (f.control !== undefined) assert.ok(new RegExp(`id="${f.control}"`).test(template) && !f.objects.length, `${who}: its control, #${f.control}, is on the page, and it links no object`);
  assert.ok(f.objects.length || parts.length || f.control, `${who} links to an object, or has parts that do, or names its control above the room`);
  for (const s of f.objects) {
    const o = parseObject(s);
    links += 1;
    if (o.kind === "addon") assert.ok(ADDONS.has(o.arg), `${who}: add-on ${o.arg} is built in addons.js`);
    else if (o.kind === "part") for (const [label, r] of Object.entries(ROOMS)) assert.ok(r.parts.has(o.arg), `${who}: ${o.arg} is a part of ${label}'s model`);
    else if (o.kind === "placed") assert.ok(PLACED.has(o.arg), `${who}: ${o.arg} is an item in Place items`);
    else if (o.kind === "node") assert.ok(new RegExp(`(name\\s*[=:]\\s*|part\\()["'\`]${o.arg}["'\`]`).test(addonsSrc), `${who}: an object named ${o.arg} is built in addons.js`);
    else assert.ok(["lights", "switch"].includes(o.kind) && !o.arg, `${who}: ${s} is a kind of link the page knows`);
    for (const [g, vs] of Object.entries(o.when)) {
      const group = groupById(g);
      assert.ok(group && vs.every(v => group.options.some(x => x.id === v)), `${who}: the condition on ${g} names its options`);
    }
  }
  // what it does: a demo the page has, and actions with handlers
  if (f.demo) { assert.ok(DEMOS[f.demo]?.steps?.length, `${who}: its demo ${f.demo} is in demos.js`); demosUsed.add(f.demo); }
  if (f.demoLabel !== undefined) assert.ok(f.demo && typeof f.demoLabel === "string" && f.demoLabel.trim(), `${who}: a demo label goes with a demo`);
  for (const a of f.actions || []) {
    assert.ok(ACTIONS.includes(a), `${who}: its action ${a} has a handler`);
    if (a.startsWith("demo:")) { assert.ok(DEMOS[a.slice(5)]?.label && DEMOS[a.slice(5)].steps.length, `${who}: its action ${a} names a demo with a label`); demosUsed.add(a.slice(5)); }
  }
  assert.ok((f.actions || []).length <= 4, `${who}: a short menu, at most four actions`);
}
// a demo action is handled by one rule in main.js; every other action by a handler of its own
assert.ok(/a\.startsWith\("demo:"\)\) ACTION_HANDLERS\[a\] = /.test(mainSrc), "main.js runs any demo:<id> action");
for (const a of ACTIONS.filter(x => !x.startsWith("demo:"))) assert.ok(new RegExp(`(^|[\\s{,])["']?${a.replace(":", "\\:")}["']?\\s*:\\s*\\{`, "m").test(mainSrc), `main.js handles the card action ${a}`);
assert.ok(/for \(const a of ACTIONS\) if \(!ACTION_HANDLERS\[a\]\)/.test(mainSrc), "and says so at load if one has no handler");
assert.deepEqual([...demosUsed].sort(), Object.keys(DEMOS).sort(), "every demo belongs to a feature");

// the eight features that were here before the cards, and the nature display's four parts
for (const id of ["circadian", "privacy", "orientation", "nature", "wardrobe", "soundSensor", "comfortControl", "daylightSensor"]) assert.ok(byId.has(id) && !byId.get(id).parent, `${id} is registered`);
assert.deepEqual(data.features.filter(f => f.parent === "nature").map(f => f.id), ["tvScene", "skyCeiling", "digitalAquarium", "biophilicPanel"], "the nature display's four parts");
// the wardrobe: the brief's six parts, each a compartment built inside it, and its card's four actions
assert.deepEqual(data.features.filter(f => f.parent === "wardrobe").map(f => f.name), ["Clothing", "Daily essentials", "Personal belongings", "Secure valuables", "Cabinet lighting", "Sliding doors"], "the wardrobe's six parts");
for (const f of data.features.filter(x => x.parent === "wardrobe")) {
  const node = parseObject(f.objects[0]).arg;
  assert.ok(new RegExp(`part\\("${node}", "(left|right|any)"\\)`).test(addonsSrc), `${f.id}: ${node} is built inside the wardrobe, behind a door`);
}
assert.deepEqual(byId.get("wardrobe").actions.map(a => (a.startsWith("demo:") ? DEMOS[a.slice(5)].label : a)), ["wardrobe:learn", "wardrobe", "View storage compartments", "Compare with the old wardrobe"], "the wardrobe's four actions");
// no claim of floor space saved: the built-in wardrobe takes about the same floor as the one it replaced (wardrobeFigures)
for (const f of data.features.filter(x => x.id === "wardrobe" || x.parent === "wardrobe")) for (const k of TEXT) assert.ok(!/(sav\w*|more|frees?|gains?)\s+(usable\s+)?(floor|space)/i.test(f[k] || ""), `${f.id}: its ${k} claims no floor space saved`);

// ---------------------------------------------------------------- every demo, against a stand-in for the page
// The stand-in keeps what a step asks for. A step may show an option without choosing it, change the time, set a mode,
// move to a view or stand in front of a feature: nothing else, and only what exists.
const calls = [];
const api = {
  option: (g, o) => { assert.ok(groupById(g)?.options.some(x => x.id === o), `a demo shows ${g}: ${o}, which options.json offers`); calls.push(["option", g]); },
  time: stop => { assert.ok(STOPS.has(stop), `a demo sets the time to ${stop}, a stop main.js has`); calls.push(["time"]); },
  mode: name => { assert.ok(MODES[name] && name !== "emergency", `a demo sets ${name}, a room mode that isn't Emergency`); calls.push(["mode"]); },
  camera: v => { for (const [label, r] of Object.entries(ROOMS)) assert.ok(r.views.has(v), `a demo goes to the ${v} view, which ${label} has`); calls.push(["camera"]); },
  frame: id => { assert.ok(byId.get(id)?.objects.length, `a demo stands in front of ${id}, a registered feature with objects`); calls.push(["frame"]); },
  wardrobe: side => { assert.ok([null, "left", "right"].includes(side), `the wardrobe's doors show the left side, the right, or close (${side})`); calls.push(["wardrobe"]); },
  outline: id => { assert.ok(byId.has(id), `a demo outlines ${id}, a registered feature`); calls.push(["outline"]); },
  oldWardrobe: on => { assert.equal(typeof on, "boolean", "the old wardrobe's outline shows or goes"); calls.push(["oldWardrobe"]); },
  figures: () => "It took 0.64 m² of floor (1.00 by 0.64 m), and this one takes 0.71 m² (1.11 by 0.64 m): 0.07 m² more.",
  acoustic: state => { assert.ok(["without", "with"].includes(state), `a demo shows the room without or with the fittings (${state})`); calls.push(["acoustic"]); },
  notices: open => { assert.equal(typeof open, "boolean", "the notifications list opens or closes"); calls.push(["notices"]); },
  patient: name => { assert.ok(STATES[name], `a demo sets a patient state that exists (${name})`); calls.push(["patient"]); },
  bed: tab => { assert.ok(["pressure", "lines"].includes(tab), `a demo opens the bed panel's ${tab} tab, which exists`); calls.push(["bed"]); },
  position: (id, minutes) => { assert.ok(POSITIONS[id] && TIMES.some(t => t.minutes === minutes), `a demo shows ${id} for ${minutes} min, a position and time the panel offers`); calls.push(["position"]); },
  day: h => { assert.ok(h >= 0 && h < 24, `a demo shows the plan at ${h}, an hour of the day`); calls.push(["day"]); },
  askMove: id => { assert.ok(POSITIONS[id], `a demo asks for the line check before a move to ${id}`); calls.push(["askMove"]); },
  today: () => calls.push(["today"]),
  cables: state => { assert.ok([null, "traditional", "organised"].includes(state), `a demo shows the cables ${state}`); calls.push(["cables"]); },
  intel: id => { assert.ok(id === null || id === "reset" || EVENTS.some(e => e.id === id), `a demo raises ${id}, a made-up event room intelligence has`); calls.push(["intel"]); },
  twin: id => { assert.ok(TWIN_SYSTEMS.some(x => x.id === id), `a demo opens the digital twin on ${id}, a system it reads`); calls.push(["twin"]); },
  clean: n => { assert.ok(Number.isInteger(n) && n >= 0 && n <= CLEANING_STEPS.length, `a demo ticks the first ${n} of Cleaning's steps, which it has`); calls.push(["clean"]); },
  station: view => { assert.ok(STATION_VIEWS[view], `a demo opens the workstation in ${view}, a view it has`); calls.push(["station"]); },
  arrive: role => { assert.ok(role === null || ARRIVALS[role], `a demo brings in ${role}, someone the arrival data has, or takes them out`); calls.push(["arrive"]); },
  arriveView: () => calls.push(["arriveView"]),
  task: (id, done) => { assert.ok(TASKS.some(t => t.id === id) && [undefined, true].includes(done), `a demo chooses the task ${id}, or presses its Done`); calls.push(["task"]); },
};
let steps = 0;
for (const [id, d] of Object.entries(DEMOS)) {
  for (const step of d.steps) {
    assert.ok(["string", "function"].includes(typeof step.say) && typeof step.run === "function", `${id}: each step has a caption and a run`);
    step.run(api);
    const say = typeof step.say === "function" ? step.say(api) : step.say;
    assert.ok(typeof say === "string" && say.trim() && !/\d\s*%/.test(say) && !OUTCOME.test(say), `${id}: its caption is text and makes no claim: ${say}`);
    steps += 1;
  }
  assert.ok(d.steps.length <= 8, `${id} is short`);
}
assert.ok(HOLD_MS >= 2500 && HOLD_MS <= 6000, "each step holds long enough to read, and no longer");
assert.ok(calls.length >= steps, "every step sets something up");

// ---------------------------------------------------------------- Acoustic comfort mode's model (acoustic.js)
// the six sources the brief names, each with a level that looks like what it is: illustrative, near the side-room readings
assert.deepEqual(SOURCES.map(x => x.id), ["monitor", "pumps", "ventilator", "fans", "door", "corridor"], "the six simulated sources");
assert.ok(SOURCES.every(x => x.level >= 35 && x.level <= 65 && ["medical", "room", "door", "corridor"].includes(x.kind)), "each has a level in a plausible range and a kind");
assert.ok(BACKGROUND === 34, "the quiet room is the side room's reading, everything off");
// fittings: four groups in options.json, codes from 33, off by default, each needing sign-off; none makes anything louder
const acousticSection = options.sections.find(x => x.id === "acoustic");
assert.deepEqual(acousticSection?.groups.map(g => g.id), FITTING_GROUPS, "the fittings are option groups, in their own section");
for (const [i, g] of acousticSection.groups.entries()) {
  assert.equal(g.code, 33 + i, `${g.id} takes code ${33 + i}`);
  assert.ok(g.default === "off" && g.options.map(o => o.id).join() === "off,on", `${g.id} is off by default, so old links open the same room`);
  assert.ok(g.options.find(o => o.id === "on").effects.some(e => e.do === "addon" && e.id === g.id && e.on) && ADDONS.has(g.id), `${g.id} shows its own add-on`);
  assert.ok(/infection-control and manufacturer sign-off/.test(g.note.text) && /made up/.test(g.note.text), `${g.id}'s note says its effect is made up and a real one needs sign-off`);
  assert.ok(g.check && (g.check.view || g.check.eye), `${g.id} says where 08 can see it`);
}
const codes = groups.map(g => g.code).sort((a, b) => a - b);
assert.deepEqual(codes, codes.map((_, i) => i), "option codes run from 0 with none missing or repeated");
for (const [id, cuts] of Object.entries(FITTINGS)) {
  assert.ok(Object.values(cuts).every(c => c < 0), `${id} only ever takes sound away`);
  if (cuts.medical) assert.equal(id, "acousticPanels", "only the panels act on the medical kit's sound, by absorbing it in the room, not by changing the device");
}
assert.deepEqual(Object.keys(FITTINGS.dampers), ["room"], "damping mounts act only on non-critical kit");
for (const f of data.features.filter(x => x.parent === "acousticComfort")) assert.ok(/infection-control and manufacturer sign-off/.test(f.limits) && /made up/.test(f.limits) && f.objects[0] === `addon:${f.id}`, `${f.id}'s card says a real one needs sign-off, and its effect is made up`);
assert.deepEqual(data.features.filter(x => x.parent === "acousticComfort").map(f => f.id), FITTING_GROUPS, "each fitting has its card");
// the distance rule: farther is quieter, the fittings never add, and the quiet room is the floor
const pts = { monitor: [0, 0, 1.2], pumps: [0.4, 0, 1], ventilator: [-0.5, 0.3, 0.8], fans: [3, 2, 1.6], door: [5, 0, 2], corridor: [6.6, 0, 1.6] };
const near = levelAt([1, 0, 1.2], pts), far = levelAt([1, 3, 1.2], pts), allOn = Object.fromEntries(FITTING_GROUPS.map(g => [g, true]));
assert.ok(near > far && far > BACKGROUND, `nearer the kit is louder (${near.toFixed(1)} against ${far.toFixed(1)} dBA), and anywhere is above the quiet room`);
for (const p of [[1, 0, 1.2], [3, 2, 1.2], [5.5, 0.5, 1.6]]) assert.ok(levelAt(p, pts, allOn) <= levelAt(p, pts) + 1e-9, "the fittings never make a spot louder");
assert.ok(SOURCES.every(x => sourceLevel(x, allOn) <= x.level), "nor any source");
assert.ok(BANDS.every((b, i) => i === 0 || b.upTo > BANDS[i - 1].upTo) && BANDS.length === 5 && BANDS.every(b => b.words), "the map's colours go quiet to loud, each with words");
// the three kinds of notification, in the brief's terms
assert.ok(/always sounding and always visible/i.test(NOTIFICATIONS.critical.line) && /no control/.test(NOTIFICATIONS.critical.line), "critical alarms: always sounding and visible, out of the comfort system's control");
assert.ok(/might review some/.test(NOTIFICATIONS.routine.line) && /Nothing here changes that/.test(NOTIFICATIONS.routine.line), "routine notifications: a hospital might review some, and nothing here changes that");
assert.ok(/only notices this system raises itself/.test(NOTIFICATIONS.environmental.line) && /Staff acknowledge/.test(NOTIFICATIONS.environmental.line) && NOTIFICATIONS.environmental.examples.length === 3, "environmental notices: the only ones it raises, acknowledged by staff");
assert.ok(/made up/.test(ILLUSTRATIVE) && /Nothing is measured/.test(ILLUSTRATIVE), "the screen says the levels and the difference are made up");

// ---------------------------------------------------------------- patient states and the bedside screens (patient-states.js)
assert.deepEqual(STATE_ORDER, ["sedated", "awake", "recovering"], "three patient states, in the brief's order");
assert.equal(DEFAULT_STATE, "awake", "Awake is the default");
assert.deepEqual(STATES.awake.shows, {}, "and it shows the room as configured, so the room looks the same as it loads");
assert.equal(STATES.awake.light, null, "with its own light");
assert.ok(STATES.sedated.shows.tvplay === "off" && !OFFERS.sedated.board, "sedated: nothing on the patient's screen, and no board to work");
assert.ok(STATES.recovering.shows.tvplay === "orientation", "recovering: the orientation screen first");
assert.ok(STATE_MS >= 1500, "a change of state eases, never abruptly");
for (const st of Object.values(STATES)) for (const g of Object.keys(st.shows)) assert.ok(groupById(g) && !/front|switch|task|blinds|nightlight/.test(g), `a state shows only screen options, never privacy, light switches or anything for care (${g})`);
assert.deepEqual(BOARD.map(b => b.label), ["I need help", "I am in pain", "I feel cold", "I feel hot", "I need repositioning", "I want to contact my family", "I need a nurse", "I need water", "I can't sleep", "I need help communicating", "I would like some privacy"], "the board's seven requests in the first brief's words, then this brief's three more and a privacy request");
assert.ok(BOARD.filter(b => b.simple).length >= 3 && BOARD.find(b => b.id === "help").simple, "recovering keeps a simple few, help among them");
const pp = Object.fromEntries(PASSPORT.map(x => [x.id, x]));
assert.deepEqual(Object.keys(pp), ["light", "temperature", "sound", "scene", "photos", "privacy", "communicate", "entertainment"], "the passport's eight preferences");
assert.ok(pp.temperature.shownOnly && STATE_ORDER.every(st => APPLY.temperature[st][0] === "held"), "temperature is shown and never applied, in any state");
for (const x of PASSPORT) {
  assert.ok(x.value in x.options, `${x.id}: the sample's value is one of its options`);
  assert.ok(STATE_ORDER.every(st => ["used", "gentle", "staff", "held"].includes(APPLY[x.id][st][0]) && APPLY[x.id][st][1]), `${x.id}: each state says how it's used, and why`);
}
assert.ok(PASSPORT.every(x => !/name|diagnos|age\b/i.test(x.label)), "no name, diagnosis or age in the passport");
assert.ok(CLINICIAN.length >= 4 && CLINICIAN.some(c => /Alarm/.test(c.label) && /Never changed/.test(c.value)), "the care team's settings are listed apart, alarms never changed here");
assert.ok(STATE_ORDER.every(st => !["used", "gentle"].includes(APPLY.entertainment.sedated[0])), "no entertainment for a sedated patient");
assert.deepEqual(FAMILY.map(x => x.id), ["photos", "message", "call", "scene", "music", "orientation"], "family connection's six things");
assert.ok(!FAMILY.find(x => x.id === "call").staffAllow && !FAMILY.find(x => x.id === "music").staffAllow, "a call and music are off for an unresponsive patient until staff allow them");
assert.ok(/not played/.test(FAMILY.find(x => x.id === "message").what) && /no camera, microphone or call/i.test(FAMILY.find(x => x.id === "call").what), "the voice message is shown, not played, and the call uses no camera or microphone");
assert.ok(Object.values(ORIENTATION).every(l => !/\b(Mr|Mrs|Ms|diagnos|surgery|sepsis|bed \d)/i.test(l)) && /confirmed by staff/.test(ORIENTATION.visiting), "the orientation screen's lines carry no patient details, and visiting is marked as confirmed by staff");
assert.ok(/SIMULATED/.test(STAFF.reminder) && /Nothing here moves a patient/.test(STAFF.reminder), "the positioning reminder is simulated and moves nobody");
const bedsideSrc = read("./site/configurator/bedside.js");
assert.ok(/does not replace a certified nurse-call system/.test(bedsideSrc) && !/fetch\(|XMLHttpRequest|sendBeacon|WebSocket/.test(bedsideSrc), "the board says it doesn't replace nurse call, and nothing in the bedside screens is sent anywhere");
assert.ok(byId.get("communicationBoard").objects.includes("placed:tablet") && byId.get("comfortPassport").objects.some(o => o.startsWith("part:cfg_bay")) && byId.get("orientation").actions.includes("bedside:family"),
  "the screens open from the tablet arm, the window and the TV, as well as from the panel");

// ---------------------------------------------------------------- the bed: the pressure map and the lines (bed.js)
assert.deepEqual(POSITION_ORDER, ["back", "left", "right", "upright"], "four positions: on the back, turned either way, sitting up");
assert.equal(DEFAULT_POSITION, "back", "the map starts as the figure lies");
for (const id of POSITION_ORDER) {
  const m = pressureMap(id), named = POSITIONS[id].regions.filter(r => r.label);
  assert.ok(m.length === GRID.cols * GRID.rows && m.every(v => v >= 0 && v <= 1), `${id}: a relative load from 0 to 1 in every cell of the grid`);
  assert.ok(named.length >= 4 && new Set(named.map(r => r.id)).size === named.length, `${id}: its named places, each once`);
  assert.equal(sustained(id, PLAN.interval - 1).length, 0, `${id}: nothing is marked before the plan's interval`);
}
assert.deepEqual(sustained("back", DEFAULT_MINUTES).map(r => r.id), ["sacrum", "heelR", "heelL"], "on the back, past the interval: the sacrum and both heels are marked");
assert.ok(DEFAULT_MINUTES >= PLAN.interval, "as the room loads, the staff view's reminder is due");
const sac = id => peakOf(id, POSITIONS[id].regions.find(r => r.id === "sacrum"));
assert.ok(sac("left") < sac("back") && sac("right") < sac("back") && sac("upright") >= sac("back"), "a 30° turn takes weight off the sacrum, and sitting up puts it on");
assert.ok(PRESSURE_BANDS.every(b => !/\d|mmHg|kPa|%/.test(b.label)) && PRESSURE_BANDS.length === 3, "three relative bands, in words: no units, because nothing is measured");
assert.ok(/not a measurement/.test(PRESSURE_TEXT.limits) && /predicts no injury/.test(PRESSURE_TEXT.limits) && /never moves a patient/.test(PRESSURE_TEXT.limits), "the map says it's not a measurement, predicts no injury and never moves a patient");
assert.ok(/don't move/.test(PRESSURE_TEXT.still) && /SIMULATED/.test(PRESSURE_TEXT.reminder) && /Nothing here moves a patient/.test(PRESSURE_TEXT.reminder), "the bed and figure don't move, and the reminder moves nobody");
assert.ok(/nursing team sets/.test(PLAN.note) && /Sample/.test(PLAN.note), "the plan is a sample: the nursing team sets the real one");
const patientSrc = read("./site/configurator/patient.js");
assert.deepEqual(LINES.map(l => l.id), ["respiratory", "iv", "feeding", "ecg", "urinary"], "five lines round the patient");
for (const l of LINES) {
  assert.ok(patientSrc.includes(`"${l.route}"`) && patientSrc.includes(`"${l.colour}"`), `${l.id}: on patient.js's own route, in its colour`);
  assert.ok(l.clip > 0 && l.clip < 1 && l.holder, `${l.id}: a clip partway along its route, and what holds it`);
}
assert.ok(/never on a moving rail/.test(LINES.find(l => l.id === "urinary").holder), "the drainage guide is never on a moving rail");
assert.deepEqual(Object.keys(SLACK), ["ok", "less", "check"], "slack in three words");
for (const p of POSITION_ORDER) for (const l of LINES) {
  const [st, why] = SLACK_BY[p][l.id] || [];
  assert.ok(SLACK[st] && why && !/\d\s*(N|kg|cm|mm|%)/.test(why), `${p}, ${l.id}: a slack word and a reason, with no force or length`);
}
assert.ok(LINES.every(l => SLACK_BY.back[l.id][0] === "ok"), "as the figure lies, every line has slack enough");
assert.ok(/no tension, force or flow/.test(LINES_TEXT.limits) && /no line or device is monitored/.test(LINES_TEXT.limits) && /Nothing here changes a real line, connector or device/.test(LINES_TEXT.limits), "no force or flow is worked out, and no real line, connector or device is changed");
assert.ok(/check every line/.test(MOVE_CHECK.text) && /Lines checked/.test(MOVE_CHECK.confirm), "a move asks staff to check the lines first, and a person confirms it");
const bedSection = options.sections.find(x => x.id === "bed");
assert.deepEqual(bedSection?.groups.map(g => [g.id, g.code, g.default]), [["lineClips", 37, "off"]], "the line clips are code 37, off by default, so old links open the same room");
assert.ok(ADDONS.has("lineClips") && bedSection.groups[0].check?.eye && /don't secure a line/.test(bedSection.groups[0].note.text), "the clips are an add-on 08 can see, and they secure no line");
const bedViewSrc = read("./site/configurator/bed-view.js"), bedSrc = read("./site/configurator/bed.js");
assert.ok(![bedViewSrc, bedSrc].some(x => /fetch\(|XMLHttpRequest|sendBeacon|WebSocket|setInterval|setTimeout/.test(x)), "the bed panel sends nothing, and never counts time by itself");
assert.ok(byId.get("pressureBed").objects[0] === "part:cfg_kit_bed" && /not a measurement/.test(byId.get("pressureBed").limits) && /predicts no injury/.test(byId.get("pressureBed").limits) && /never moves a patient/.test(byId.get("pressureBed").limits), "the bed's card: not a measurement, no injury predicted, no patient moved");
assert.ok(byId.get("lineClips").objects[0] === "addon:lineClips" && /APIS keeps its own tubing tab/.test(byId.get("lineClips").limits), "the clips' card, and APIS's tubing tab left as it is");

// ---------------------------------------------------------------- the Future ICU fittings and theme (fittings.js, layout.js)
const FUTURE = ["ceilingTray", "staffPanel", "patientWall", "workstation", "bedsideCabinet"];
const futureSection = options.sections.find(x => x.id === "future");
assert.deepEqual(futureSection?.groups.map(g => [g.id, g.code, g.default, g.options.map(o => o.id).join()]), FUTURE.map((id, i) => [id, 38 + i, "off", "off,on"]), "the five fittings are codes 38 to 42, off by default");
for (const id of FUTURE) {
  assert.ok(ADDONS.has(id) && byId.get(id)?.objects[0] === `addon:${id}`, `${id}: an add-on, with its card`);
  assert.ok(groupById(id).check?.eye && groupById(id).check.rooms?.W3, `${id}: 08 knows where to look for it in both rooms`);
  assert.ok(/simulated|concept/i.test(byId.get(id).limits) || /simulated|concept/i.test(groupById(id).note.text), `${id}: it says it's simulated or a concept`);
}
assert.ok(/never stands in for the patient monitor/.test(byId.get("staffPanel").limits) && /working/.test(byId.get("staffPanel").limits), "the staff panel never stands in for the monitor, which stays working");
// every still is marked SIMULATED, and none shows a number
const stills = fittingsSrc.slice(fittingsSrc.indexOf("const STILLS = {"), fittingsSrc.indexOf("const screen = "));
const stillCount = (stills.match(/\(\) => still\(/g) || []).length;
assert.ok(stillCount === 5 && (stills.match(/simulated\(g, w, h/g) || []).length === stillCount, "each of the five stills carries the SIMULATED mark");
assert.ok(!/["'`][^"'`]*\d+\s*(bpm|%|mmHg|°)/.test(stills), "no still shows a reading");
// the theme: listed first, turns every fitting on, sets only what exists, and no other theme turns a fitting on
const [future, ...others] = options.themes;
assert.ok(future.id === "future" && future.label === "Future ICU", "Future ICU is the first theme");
assert.ok(FUTURE.every(id => future.sets[id] === "on"), "it turns on all five fittings");
for (const [g, o] of Object.entries(future.sets)) assert.ok(groupById(g)?.options.some(x => x.id === o), `it sets ${g} to ${o}, which options.json offers`);
assert.ok(options.themes.every(t => t.sets.seating !== "sofa"), "no theme puts the sofa-bed in: W3's sofa would stand on the IV pole");
// the four themes share one clinical base (options.json themeBase): a theme changes how the room looks, never what stands in it
const base = options.themeBase;
assert.ok(base && Object.keys(base.sets).length >= 7 && !("start" in base), "the themes' shared base is listed, and it names no starting theme: a visit with no link opens today's room");
assert.ok(!/startTheme|themeBase\?\.start/.test(mainSrc), "and the page doesn't put a theme on as it starts");
for (const [g, o] of Object.entries(base.sets)) assert.ok(groupById(g)?.options.some(x => x.id === o), `the shared base sets ${g} to ${o}, which options.json offers`);
for (const t of options.themes) {
  for (const [g, o] of Object.entries(base.sets)) assert.equal(t.sets[g], o, `${t.label} keeps the shared base: ${g} is ${o}`);
  for (const [g, o] of Object.entries(t.sets)) assert.ok(groupById(g)?.options.some(x => x.id === o) && !groupById(g).hidden, `${t.label} sets ${g} to ${o}, which options.json offers`);
  assert.ok(/same clinical base/.test(t.blurb), `${t.label} says it shares the clinical base`);
  assert.ok(!("patio" in t.sets), `${t.label} leaves the patio to the person: it is a concept with open questions`);
}
assert.ok(FUTURE.every(id => base.sets[id] === "on" || id === "ceilingTray") && base.sets.ceilingTray === "on", "the five fittings are part of that base");
// what tells the themes apart is finish and light alone: each has its own paint, feature wall, floor, upholstery and joinery
for (const g of ["paint", "feature", "floor", "accent"]) assert.equal(new Set(options.themes.map(t => t.sets[g])).size, options.themes.length, `each theme has its own ${g}`);
// today's room is still every option's default: none of the base is a default, so Before / after and old links are unchanged
assert.ok(groupById("seating").default === "chairs" && FUTURE.every(id => groupById(id).default === "off") && groupById("cableChannels").default === "off", "the defaults are today's room, as before");
// old links: the view list only grows, and the reference link opens the same room with every fitting off
assert.deepEqual(options.views.slice(0, 9), ["overview", "family", "entrance", "bed", "bed_window", "window", "dollhouse", "bathroom", "patient"], "the old views keep their places");
assert.equal(options.views[9], "across", "the view across the room is appended");
const old = decodeSpec(options, "#c=10030010002000000000000000000000000100");
assert.ok(old && old.room === "W1" && old.view === "overview" && FUTURE.every(id => old.selected[id] === "off") && !old.dropped.length, "the reference link still opens W1 from Overview, with every fitting off");
for (const label of options.rooms) assert.ok(ACROSS[label]?.eye?.length === 3 && ACROSS[label].look.length === 3 && inPolygon(ACROSS[label].eye[0], ACROSS[label].eye[1], METAS[label].walkable), `${label}: the view across the room stands inside the room`);
// the layout check itself, on made-up boxes
assert.ok(boxesOverlap([0, 0, 0, 1, 1, 1], [0.5, 0.5, 0.5, 2, 2, 2]) && !boxesOverlap([0, 0, 0, 1, 1, 1], [1, 0, 0, 2, 1, 1]), "two boxes overlap when they share space, and not when they only touch");
const sq = [[0, 0], [1, 0], [1, 1], [0, 1]];
assert.ok(inPolygon(0.5, 0.5, sq) && !inPolygon(1.5, 0.5, sq) && Math.abs(intrusion([0.5, 0, 0, 1.5, 1, 1], { poly: sq }) - 0.5) < 0.01, "a box half in an area is half in it");
const toy = checkLayout({
  solids: [{ id: "a", boxes: [[0, 0, 0, 1, 1, 1]] }, { id: "b", boxes: [[0.5, 0.5, 0, 1.5, 1.5, 1]] }, { id: "c", boxes: [[0.9, 0, 0, 1.1, 0.6, 1]] }, { id: "w", wall: true, boxes: [[0, 0, 1.2, 1, 0.05, 2]] }],
  areas: [{ id: "clear", kind: "keep-clear", poly: [[2, 0], [3, 0], [3, 1], [2, 1]] }, { id: "route", kind: "route", polys: corridor([[0, 0.5], [1, 0.5]], 0.1) }],
  mounted: [["a", "c"]],
});
assert.deepEqual(toy.map(f => `${f.level}:${f.a}:${f.b}`), ["overlap:a:b", "overlap:b:c", "clearance:a:route", "clearance:b:route", "clearance:c:route"], "the layout check finds overlaps first, skips what's mounted, and leaves wall items off the floor");
assert.deepEqual(checkLayout({ solids: [{ id: "a", boxes: [[0, 0, 0, 1, 1, 1]] }], areas: [] }), [], "a room with nothing in the way: no modelled conflict found");
// where the floor fittings stand: clear of each door's way and the walking route, in both rooms. The keep-clear areas need
// the bed's own shape, so 08 checks those in the page with the same function.
const floorBox = (w, depth, h) => { const y0 = w.into > 0 ? w.y : w.y - depth; return [w.x[0], y0, 0, w.x[1], y0 + depth, h]; };
for (const [label, f] of Object.entries(FIT)) {
  const meta = METAS[label];
  assert.ok(ROUTES[label].every(([x, y]) => inPolygon(x, y, meta.walkable)), `${label}: the walking route is inside the room`);
  const areas = [...meta.wall_runs.filter(r => r.door).map((r, i) => ({ id: `door${i}`, kind: "door", poly: strip(r.a, r.b, DOOR_DEPTH), within: meta.walkable })), { id: "route", kind: "route", polys: corridor(ROUTES[label]), within: meta.walkable }];
  const solids = [{ id: "workstation", boxes: [floorBox(f.desk, 0.5, 0.77)] }, { id: "bedsideCabinet", boxes: [floorBox(f.cabinet, 0.45, 0.725)] }];
  assert.deepEqual(checkLayout({ solids, areas }), [], `${label}: the workstation and cabinet stand clear of the doors and the route to the bed`);
  const [x0, y0, x1, y1] = meta.room;
  for (const [x, y] of f.tray.poly) assert.ok(x > x0 && x < x1 && y > y0 && y < y1, `${label}: the tray is inside the room's ceiling`);
  assert.ok(f.tray.downlights.every(([x, y]) => inPolygon(x, y, f.tray.poly)), `${label}: the tray's downlights are inside it`);
}

// ---------------------------------------------------------------- the compact chair (chair-data.js, chair.js) and the Research tabs
// the choice: appended to Family seating, so old links keep their meaning; it swaps both of the model's chairs for the one chair
const seating = groupById("seating");
assert.deepEqual(seating.options.map(o => [o.id, o.code]), [["chairs", 0], ["sofa", 1], ["compact", 2]], "Compact chair is appended to Family seating: the old codes keep their meaning");
const fx = id => seating.options.find(o => o.id === id).effects, has = (list, e) => list.some(x => Object.entries(e).every(([k, v]) => x[k] === v));
assert.ok(has(fx("compact"), { do: "addon", id: "compactChair", on: true }) && has(fx("compact"), { do: "visible", part: "cfg_kit_recliner", on: false }) && has(fx("compact"), { do: "visible", part: "cfg_kit_visitor_chair", on: false }) && has(fx("compact"), { do: "addon", id: "sofa", on: false }),
  "Compact chair shows the one chair and hides the recliner, the visitor chair and the sofa-bed: no chair is left under another");
for (const id of ["chairs", "sofa"]) assert.ok(has(fx(id), { do: "addon", id: "compactChair", on: false }) && has(fx(id), { do: "visible", part: "cfg_kit_recliner", on: true }), `${id}: the compact chair goes and the recliner comes back`);
assert.ok(ADDONS.has("compactChair") && ADDONS.has("curtainTrack") && byId.get("compactChair")?.objects[0] === "addon:compactChair", "the chair and the curtain's track are add-ons, and the chair has its card");
assert.ok(/not an approved product/.test(seating.options[2].note.text) && /design assumptions/.test(seating.options[2].note.text) && seating.options[2].note.sources.length >= 2, "the choice says the chair is an assumption, not an approved product, and cites its sources");
assert.ok(/not an approved product/.test(byId.get("compactChair").limits) && /doesn't recline or move/.test(byId.get("compactChair").limits), "the chair's card says what it isn't, and that it doesn't move");
// a believable size: inside the range of ordinary armchairs, and the same in every theme
assert.ok(CHAIR.width >= 0.58 && CHAIR.width <= 0.72 && CHAIR.depth >= 0.58 && CHAIR.depth <= 0.75 && CHAIR.seat >= 0.43 && CHAIR.seat <= 0.5 && CHAIR.height >= 0.8 && CHAIR.height <= 1.0 && CHAIR.arm > CHAIR.seat + 0.15,
  `the chair is the size of an ordinary armchair, not shrunk to fit: ${JSON.stringify(CHAIR)}`);
assert.ok(new RegExp(`${Math.round(CHAIR.width * 100)} cm wide, ${Math.round(CHAIR.depth * 100)} cm deep and ${Math.round(CHAIR.height * 100)} cm high`).test(byId.get("compactChair").how), "its card gives the same size the model draws");
const chairSrc = read("./site/configurator/chair.js");
assert.ok(/cloth\.name = "upholstery"/.test(chairSrc) && !/label === "W[13]"/.test(chairSrc), "one geometry for both rooms and every theme: only the upholstery's colour is a choice");
// its bay, in both rooms: on the open floor, clear of each door's way, the route to the bed, the desk and its standing room and
// the bedside cabinet. The keep-clear areas need the bed's own shape, and the wardrobe its own, so 08 checks those in the page
for (const label of options.rooms) {
  const meta = METAS[label], f = FIT[label], box = chairBox(label), bay = bayOutline(label);
  assert.ok(chairFootprint(label).every(([x, y]) => inPolygon(x, y, meta.walkable)) && bay.every(([x, y]) => inPolygon(x, y, meta.walkable)), `${label}: the chair and its marked bay stand on the open floor`);
  const deskNear = f.desk.y + f.desk.into * 0.52, deskFar = deskNear + f.desk.into * 0.6;
  const areas = [
    ...meta.wall_runs.filter(r => r.door).map((r, i) => ({ id: `door${i}`, kind: "door", poly: strip(r.a, r.b, DOOR_DEPTH), within: meta.walkable })),
    { id: "route", kind: "route", polys: corridor(ROUTES[label]), within: meta.walkable },
    { id: "desk", kind: "desk", poly: [[f.desk.x[0], Math.min(deskNear, deskFar)], [f.desk.x[1], Math.min(deskNear, deskFar)], [f.desk.x[1], Math.max(deskNear, deskFar)], [f.desk.x[0], Math.max(deskNear, deskFar)]], within: meta.walkable },
  ];
  const fixed = [{ id: "workstation", boxes: [floorBox(f.desk, 0.5, 0.77)] }, { id: "bedsideCabinet", boxes: [floorBox(f.cabinet, 0.45, 0.725)] }];
  const chair = { id: "compactChair", boxes: [box] };
  assert.deepEqual(checkLayout({ solids: [...fixed, chair], areas }), [], `${label}: the chair in its bay: no modelled conflict found with the doors, the route, the desk or the cabinet`);
  // and the check does see it: the same chair pushed onto the route, then onto the desk, is found both times
  const [rx, ry] = ROUTES[label][1], moved = to => ({ id: "compactChair", boxes: [[to[0] - 0.33, to[1] - 0.32, 0, to[0] + 0.33, to[1] + 0.32, CHAIR.height]] });
  assert.ok(checkLayout({ solids: [...fixed, moved([rx, ry])], areas }).some(x => x.level === "clearance" && x.a === "compactChair" && x.b === "route"), `${label}: put on the route, the chair is flagged as a clearance to look at`);
  const onDesk = [(f.desk.x[0] + f.desk.x[1]) / 2, f.desk.y + f.desk.into * 0.25];
  assert.ok(checkLayout({ solids: [...fixed, moved(onDesk)], areas }).some(x => x.level === "overlap" && [x.a, x.b].includes("compactChair") && [x.a, x.b].includes("workstation")), `${label}: put on the desk, it is flagged as an overlap`);
  assert.equal(box[5], CHAIR.height, `${label}: the footprint box is the chair's full height`);
}
// the scan and the floor drawing use the layout check's own areas and words
assert.ok(/layoutInputs\(\)/.test(mainSrc.slice(mainSrc.indexOf("function circulationZones"), mainSrc.indexOf("function refreshZones"))), "the floor drawing takes its areas from the layout check, so the two can't disagree");
assert.ok(/FIXED_SEATS = \[\["compactChair"/.test(mainSrc) && /n\.userData\.notSolid/.test(mainSrc), "the scan covers the room's own seating, and a drawn shadow isn't counted as solid");
assert.ok(!/\b(safe|compliant|complies|certified|approved)\b/i.test(JSON.stringify([SCAN_TEXT.fixedClear, SCAN_TEXT.fixedLook, SCAN_TEXT.fixedTitle]).replace("not a clinical or compliance finding", "")), "the scan's words for the room's own seating claim nothing");
assert.deepEqual(Object.keys(ZONE_KINDS), ["keep-clear", "route", "door", "wardrobe", "desk", "bay"], "six kinds of floor area, each named");
assert.ok(new Set(Object.values(ZONE_KINDS).map(k => k.label)).size === 6 && Object.values(ZONE_KINDS).every(k => ["hatch", "flow", "dash", "solid"].includes(k.pattern)), "each kind has its own name in words and a pattern, so none is told apart by colour alone");

// the Research tabs: Features, Benefits, and Evidence and limits, on the cards the brief names
const R = options.research, KINDS = Object.keys(R.kinds), sourceIds = new Set();
assert.deepEqual(KINDS, ["guideline", "policy", "study", "product", "design", "proposal"], "a source is a guideline, a hospital's policy, a study, a product, a design precedent or this project's own proposal");
for (const x of R.sources) {
  assert.ok(x.id && !sourceIds.has(x.id), `source ${x.id}: its id is its own`);
  sourceIds.add(x.id);
  for (const k of ["label", "supports", "limits", "checked"]) assert.ok(typeof x[k] === "string" && x[k].trim(), `source ${x.id} has its ${k}`);
  assert.ok(/^https:\/\//.test(x.url) && KINDS.includes(x.kind), `source ${x.id} has an address and a kind`);
  assert.ok(/^(Read on \d+ \w+ \d{4}\.|Run for this update, on \d+ \w+ \d{4}\.|Not reread for this update)/.test(x.checked), `source ${x.id} says whether it was read for this update: "${x.checked}"`);
  // a product or a design precedent shows a thing exists, and says it shows no more
  if (["product", "design"].includes(x.kind)) assert.ok(/\bnot\b|\bno\b|nothing/i.test(x.limits), `source ${x.id}: a ${x.kind} precedent says what it doesn't show`);
}
const CLAIMS = /\b(compliant|complies|certified|clinically safe|approved by|meets the standard)\b/i;
const RESEARCHED = ["compactChair", "circulation", "ceilingTray", "ceilingPendant", "wardrobe", "privacy", "acousticComfort", "workstation", "orientation"];
for (const id of RESEARCHED) assert.ok(byId.get(id)?.research, `${id}: its card has the Research tabs`);
let researched = 0, cited = new Set();
for (const f of data.features.filter(x => x.research)) {
  const r = f.research, who = `${f.id}'s research`;
  researched += 1;
  assert.ok(Array.isArray(r.features) && r.features.length >= 3 && r.features.every(t => typeof t === "string" && t.trim()), `${who} lists its features`);
  assert.ok(/^What it is:/.test(r.features[0]) && r.features.some(t => /^In the model:/.test(t)) && r.features.some(t => /^States:/.test(t)), `${who}: what it is, what changes in the model, and its named states`);
  for (const k of ["patient", "staff", "cleaning"]) assert.ok(typeof r.benefits?.[k] === "string" && r.benefits[k].trim(), `${who}: a benefit for ${k}`);
  for (const t of [...r.features, ...Object.values(r.benefits)]) {
    assert.ok(!OUTCOME.test(t), `${who} makes no outcome claim: "${OUTCOME.exec(t)?.[0]}" in "${t}"`);
    assert.ok(!CLAIMS.test(t) && !/\d\s*%/.test(t), `${who} claims no approval and gives no percentage: "${t}"`);
  }
  assert.ok(Array.isArray(r.evidence) && r.evidence.length >= 2, `${who} names its sources`);
  for (const e of r.evidence) {
    assert.ok(typeof e.claim === "string" && e.claim.trim(), `${who}: each source says what it is used for here`);
    if (e.source) { assert.ok(sourceIds.has(e.source), `${who}: ${e.source} is in options.json's research sources`); cited.add(e.source); }
    else {
      assert.ok(e.from && sourcesOf(e.from).length, `${who}: ${e.from} is an option note with sources`);
      assert.ok(KINDS.includes(e.kind) && typeof e.supports === "string" && e.supports.trim() && typeof e.limits === "string" && e.limits.trim(), `${who}: a source taken from a note gives its kind, what it supports and what it doesn't show`);
    }
  }
  assert.ok(r.evidence.some(e => e.source === "thisModel"), `${who} says which part is this project's own model`);
  assert.ok(typeof r.validation === "string" && r.validation.trim() && !CLAIMS.test(r.validation), `${who} says what is still to be validated`);
}
assert.deepEqual([...sourceIds].filter(id => !cited.has(id)), [], "every source in the catalogue is used by a card");
const template = read("./site/configurator.template.html");
assert.ok(/id="researchTabFeatures"[^>]*>Features</.test(template) && /id="researchTabBenefits"[^>]*>Benefits</.test(template) && /id="researchTabEvidence"[^>]*>Evidence and limits</.test(template) && (template.match(/role="tabpanel"/g) || []).length === 3, "the card has the three tabs, each with its panel");
assert.ok(/None of it has been measured or shown/.test(template), "the Benefits tab says they are intentions");
console.log(`PASS the compact chair and the Research tabs: one chair for both rooms and every theme, in a bay clear of the doors, the route, the desk and the cabinet, and found by the check when it's moved onto them; four themes on one shared base; ${researched} cards with Features, Benefits, and Evidence and limits, citing ${cited.size} sources of ${KINDS.length} kinds`);

// ---------------------------------------------------------------- the smart clinical wall, Transform my environment and the clinician workstation (wall-data.js, wall.js, station.js)
const wallSection = options.sections.find(x => x.id === "smartWall");
assert.deepEqual(wallSection?.groups.map(g => [g.id, g.code, g.default]), [["wall", 43, DEFAULT_WALL], ["scene", 44, "off"]], "the wall's switch and the scene are codes 43 and 44, after the fittings");
assert.deepEqual(groupById("wall").options.map(o => [o.id, o.label]), WALL_ORDER.map(id => [id, WALL_MODES[id].label]), "the switch: Clinical, Patient and Relaxation, named as the data names them");
assert.deepEqual(groupById("scene").options.map(o => [o.id, o.label]), [["off", "Off"], ...SCENE_ORDER.map(id => [id, SCENES[id].label])], "Transform my environment: Off and the brief's seven scenes, in its order");
assert.deepEqual(SCENE_ORDER.map(id => SCENES[id].label), ["Forest", "Ocean", "Mountains", "Desert", "Garden", "Clear sky", "Night sky"], "forest, ocean, mountains, desert, garden, clear sky, night sky");
for (const g of wallSection.groups) assert.ok(g.check?.eye && g.check.rooms?.W3 && g.options.every(o => o.effects.some(e => e.do === "wall")), `${g.id}: 08 knows where to look, and each option moves the wall`);
assert.ok(SCENE_ORDER.every(id => SCENES[id].light.kelvin >= 2700 && SCENES[id].light.kelvin <= 6500 && SCENES[id].light.level > 0 && SCENES[id].light.level <= 1), "each scene's light is a look the room's lights can give");
assert.ok(SCENE_MS >= 2000, "a scene changes slowly, over seconds");
assert.ok(future.sets.wall === "patient" && !("scene" in future.sets), "Future ICU sets the wall for the patient, and chooses no scene");
assert.ok(others.every(t => !("wall" in t.sets) && !("scene" in t.sets)), "the other themes leave the wall and the scenes alone");
const oldWall = decodeSpec(options, "#c=10030010002000000000000000000000000100");
assert.ok(oldWall.selected.wall === DEFAULT_WALL && oldWall.selected.scene === "off", "the reference link opens with no scene, and the wall's switch at its default, which shows nothing without the fittings");
// the rule that keeps the wall in step with the room: every combination of switch, mode, state, Quiet now and scene
const combos = [];
for (const wall of WALL_ORDER) for (const mode of Object.keys(MODES)) for (const state of STATE_ORDER) for (const quiet of [false, true]) for (const scene of ["off", ...SCENE_ORDER]) combos.push({ wall, mode, state, quiet, scene });
for (const c of combos) {
  const w = wallFor(c), who = JSON.stringify(c);
  if (c.mode === "emergency") assert.ok(w.emergency && w.patient === "off" && !w.scene && !w.ceiling && !w.light && !w.prompts && w.staff === "clinical", `${who}: Emergency turns every scene and the patient wall off, and the staff panel to Clinical`);
  else if (MODES[c.mode].wall === "off") assert.ok(w.patient === "off" && !w.scene && !w.ceiling && !w.light && !w.prompts && w.staff === "standby", `${who}: Cleaning: no patient, so nothing on either wall panel and no scene`);
  else {
    assert.equal(w.wall, MODES[c.mode].wall || c.wall, `${who}: a mode's row sets the wall (Clinical to Clinical, Comfort to Relaxation, Family visit to family connection), and otherwise the switch decides`);
    assert.equal(w.light, c.scene === "off" ? null : c.scene, `${who}: the light is the chosen scene's, and only a chosen scene's`);
    assert.equal(w.ceiling, w.light, `${who}: the ceiling shows the scene whose light it is`);
    assert.equal(w.staff, w.wall === "clinical" ? "clinical" : "standby", `${who}: the staff panel shows observations only in Clinical`);
  }
  if (c.state === "sedated") assert.ok(!w.prompts, `${who}: a sedated patient gets no prompts`);
  if (c.quiet) assert.ok(w.patient === "off" && !w.scene && !w.prompts, `${who}: Quiet now takes everything off the patient wall`);
  if (w.prompts) assert.ok(w.wall === "patient" && c.state !== "sedated", `${who}: buttons only for the patient, awake or recovering`);
  if (w.wall === "relaxation" && !c.quiet) assert.equal(w.scene, c.scene === "off" ? PASSPORT_SCENE : c.scene, `${who}: Relaxation shows the chosen scene, or the passport's`);
}
assert.ok(PASSPORT.find(p => p.id === "scene").value === PASSPORT_SCENE, "Relaxation's own scene is the one the sample passport asks for");
// what the screens say: made up and marked, no name, nothing aloud
assert.deepEqual(OBS.map(o => o.id), ["hr", "spo2", "bp", "rr", "temp"], "the five observations the brief names: heart rate, oxygen saturation, blood pressure, breathing rate, temperature");
assert.ok(/Made-up/.test(OBS_NOTE) && /bedside monitor shows the patient/.test(OBS_NOTE) && /alarms are unchanged/.test(OBS_NOTE), "the values say they're made up, and that the monitor and its alarms are as they were");
const wallSrc = read("./site/configurator/wall.js");
for (const fn of ["staffObs", "staffTasks", "staffEmergency", "deskScreen", "armScreen"]) {
  const body = wallSrc.slice(wallSrc.indexOf(`function ${fn}(`), wallSrc.indexOf("\n}\n", wallSrc.indexOf(`function ${fn}(`)));
  assert.ok(/simulated\(g, w, h/.test(body) || /staffEmergency\(g, w, h\)/.test(body), `${fn}: every staff screen carries the SIMULATED mark`);
}
const stripBody = wallSrc.slice(wallSrc.indexOf("function patientStrip("), wallSrc.indexOf("\n}\n", wallSrc.indexOf("function patientStrip(")));
assert.equal((stripBody.match(/mark\(g, /g) || []).length, 2, "the strip over the TV carries its SIMULATED mark, for the patient and in Clinical");
assert.ok(!/\b(Mr|Mrs|Ms|Miss|Dr)\.?\s+[A-Z]/.test(JSON.stringify([OVERVIEW, TASKS, EQUIPMENT, CARE_TEAM, DAY_PLAN])), "no one is named: roles only");
assert.ok(CARE_TEAM.every(r => /^[A-Z][a-z]+$/.test(r)) && DAY_PLAN.length >= 3, "the care team by role, and a simple plan");
assert.deepEqual(WALL_BUTTONS.map(b => b.tab), ["board", "family"], "the wall's two buttons open the communication board and family connection");
assert.ok(/Nothing listens/.test(HANDS_FREE_NOTE) && /nothing about the patient is said aloud/.test(HANDS_FREE_NOTE) && HANDS_FREE.length >= 3, "hands-free buttons stand in for speech: nothing listens, and nothing is said aloud");
assert.ok(!/speechSynthesis|SpeechRecognition|getUserMedia|webkitSpeech/.test(wallSrc + read("./site/configurator/station.js")), "the wall and the station neither speak nor listen");
assert.ok(/Not a validated emergency protocol/.test(EMERGENCY.caveat) && EMERGENCY.items.length >= 3 && /Illustrative/.test(EMERGENCY.route), "Emergency: where things are, the route marked as illustrative, and not a validated protocol");
// every place the station lights is one the page can find in both rooms
const places = /const places = \{([\s\S]*?)\n  \};/.exec(mainSrc)?.[1] || "";
const named = new Set([...places.matchAll(/(\w+):/g)].map(m => m[1]));
for (const where of [...TASKS, ...EQUIPMENT, ...SUPPLIES, ...EMERGENCY.items].map(x => x.where).filter(w => w && w !== "door")) assert.ok(named.has(where), `the station can light ${where}`);
for (const part of [...places.matchAll(/part\("(\w+)"\)/g)].map(m => m[1])) for (const [label, r] of Object.entries(ROOMS)) assert.ok(r.parts.has(part), `${label} has ${part}, which the station lights`);
assert.ok(/name = "ws_supplies"/.test(fittingsSrc) && /"ws_ppe"/.test(fittingsSrc), "the workstation's two cupboards are named, for the supply locator");
assert.deepEqual(Object.keys(STATION_VIEWS), ["nurse", "doctor"], "Nurse view and Doctor view");
assert.ok(STATION_VIEWS.nurse.sections[1] === "tasks" && STATION_VIEWS.doctor.sections[1] === "obs" && STATION_VIEWS.nurse.sections.length === STATION_VIEWS.doctor.sections.length, "the same patient, shown differently: tasks first for the nurse, observations first for the doctor");
// the cards
for (const id of ["smartWall", "transformEnvironment"]) assert.ok(byId.has(id) && byId.get(id).demo, `${id} is registered, with its demo`);
assert.ok(/never stands in for the bedside monitor/.test(byId.get("smartWall").limits) && /alarms unchanged/.test(byId.get("smartWall").limits), "the wall's card: it never stands in for the monitor, and the alarms are unchanged");
assert.ok(/no claim about sleep, delirium or recovery/.test(byId.get("transformEnvironment").limits) && /Living plants stay outside/.test(byId.get("transformEnvironment").limits), "Transform's card: no claim about outcomes, and no living plants inside");
assert.ok(byId.get("workstation").actions.includes("station") && byId.get("workstation").demo === "workstation" && /not a validated emergency protocol/.test(byId.get("workstation").limits) && /doesn't copy or change it/.test(byId.get("workstation").limits), "the workstation's card opens it, has a demo, and says what it isn't");
// readable from the pillow: the strip's text is at least as large as the orientation screen's own detail lines, which its
// card already says read from the bed, at a similar distance
const tvWidth = groupById("tvsize").options.find(o => o.id === groupById("tvsize").default).effects.find(e => e.do === "tv").width;
const orientEm = (15 / 270) * 0.97 * (9 / 16) * tvWidth;
for (const [label, f] of Object.entries(FIT)) {
  const stripH = (f.patient.x[1] - f.patient.x[0] - 0.3) / 8, em = (STRIP_TEXT.size / STRIP_TEXT.canvas[1]) * stripH;
  const eye = METAS[label].bed.eye, dist = Math.abs(eye[1] - f.patient.y), arcmin = (Math.atan(em / dist) * 180 / Math.PI) * 60;
  assert.ok(em >= orientEm, `${label}: the strip's text (${(em * 100).toFixed(1)} cm) is no smaller than the orientation screen's detail lines (${(orientEm * 100).toFixed(1)} cm)`);
  assert.ok(arcmin >= 40, `${label}: from the pillow, ${dist.toFixed(2)} m away, its letters subtend ${arcmin.toFixed(0)} arcminutes`);
}

// ---------------------------------------------------------------- room modes that move everything together (modes.js, cleaning-data.js), tested as PACS's rules are
assert.deepEqual(LEVELS.map(l => l.id), ["safety", "staff", "communication", "comfort", "decoration"], "five levels of priority, highest first: clinical safety, staff, communication, comfort, decoration");
assert.deepEqual(SYSTEMS.map(x => x.id), ["light", "blinds", "glass", "wall", "scenes", "sound", "bedside", "notices", "overlays"], "the systems every mode answers for: light, blinds, glass, the wall, scenes, sound, the bedside screens, notices and overlays");
assert.deepEqual(Object.keys(MODE_TABLE).sort(), Object.keys(MODES).sort(), "one row in the table for every mode");
for (const [mode, row] of Object.entries(MODE_TABLE)) {
  assert.deepEqual(Object.keys(row).sort(), SYSTEMS.map(x => x.id).sort(), `${mode}: its row says something, or "as set", for every system`);
  for (const [sys, cell] of Object.entries(row)) if (cell) assert.ok(typeof cell[0] === "string" && cell[0] && LEVELS.some(l => l.id === cell[1]), `${mode} ${sys}: what it does, in words, at one of the five levels`);
  if (mode === "emergency") assert.ok(Object.values(row).filter(Boolean).every(c => c[1] === "safety"), "Emergency acts at the highest level, clinical safety, in every system it touches");
  else assert.ok(Object.values(row).filter(Boolean).every(c => c[1] !== "safety"), `${mode}: only Emergency claims clinical safety`);
  // the table and the modes agree: what a mode sets is what its row says
  const m = MODES[mode];
  assert.equal(!!row.light, !!m.light, `${mode}: its row and its light agree`);
  assert.equal(!!row.wall, !!m.wall, `${mode}: its row and the wall it sets agree`);
  assert.equal(!!row.scenes, !!m.scenesOff, `${mode}: its row and whether it turns scenes off agree`);
  assert.equal(!!row.overlays, !!(m.overlay || m.cleaning), `${mode}: its row and its overlays agree`);
  assert.equal(!!row.glass, !!(m.glassClear || m.privateFront || m.softFront), `${mode}: its row and what it does to the glass agree`);
  if (m.blinds !== undefined) assert.ok(row.blinds, `${mode}: its blinds are in its row`);
}
// a lower level never overrides a higher one, whatever order the claims come in
const lv = LEVELS.map(l => l.id);
for (let a = 0; a < lv.length; a++) for (let b = 0; b < lv.length; b++) {
  const win = decide([{ level: lv[a], value: "a" }, { level: lv[b], value: "b" }]);
  assert.equal(win.value, a < b ? "a" : "b", `${lv[a]} against ${lv[b]}: the higher level wins, and of two at one level the later`);
}
assert.equal(decide([]), null, "nothing claimed, nothing decided");
// the page's systems obey the same order: a room mode's light over the patient's state's, over a scene's, over the configured
const lightsSrc = read("./site/configurator/lights.js");
assert.ok(/const look = this\.scene \|\| this\.plan \|\| this\.patient \|\| this\.env \|\| this\.base\(hour, day\);/.test(lightsSrc), "the light: a mode (staff) over Light across 24 hours' plan, over the patient's state, over a scene (comfort), over the room as configured (decoration)");
for (const [mode, m] of Object.entries(MODES)) {
  const w = wallFor({ mode, scene: "forest", wall: "patient" });
  if (m.scenesOff) assert.ok(!w.scene && !w.light && !w.ceiling, `${mode}: it turns scenes off, and no scene's light or picture outranks it`);
}
// each mode's note: one line that says what changed, and that medical alarms stay on
assert.ok(/Medical alarms always stay on\./.test(ALARMS_LINE), "the line every note ends with");
for (const mode of MODE_ORDER.filter(x => x !== "standard")) {
  for (const dark of [false, true]) {
    const t = modeText(mode, dark);
    assert.ok(t.note.endsWith(ALARMS_LINE) && !t.note.includes("\n") && t.note.length <= 260, `${mode}${dark ? " after dark" : ""}: one line, ending that medical alarms always stay on (${t.note.length} characters)`);
  }
}
assert.deepEqual(MODE_ORDER, ["standard", "comfort", "privacy", "clinical", "family", "cleaning"], "the bar: As set, Comfort, Privacy, Clinical, Family visit, Cleaning; Emergency on its own");
assert.ok(MODES.family.label === "Family visit" && /Staff can still see in/.test(MODES.family.note) && /end it/.test(MODES.family.note) && MODES.family.softFront && MODES.family.wall === "family", "Family visit: staff can still see in and end it, the glass softened, family connection on the wall");
assert.ok(MODES.cleaning.label === "Cleaning" && MODES.cleaning.cleaning && MODES.cleaning.scenesOff && MODES.cleaning.wall === "off", "Cleaning: an empty room, no scenes, the patient wall off");
// Cleaning's checklist: hands first and last, the high-touch surfaces and the equipment, and it never says the room is disinfected
assert.ok(CLEANING_STEPS[0].kind === "hygiene" && CLEANING_STEPS.at(-1).kind === "hygiene" && CLEANING_STEPS.some(x => x.kind === "touch") && CLEANING_STEPS.some(x => x.kind === "equipment"), "hands first and last, high-touch surfaces and equipment between");
assert.ok(/Checklist finished/.test(CLEANING_TEXT.done) && /doesn't say the room is clean or disinfected/.test(CLEANING_TEXT.done), "finishing says the checklist is finished, and never that the room is disinfected");
assert.ok(!/\b(is|now) (clean|disinfected|sterile|safe)\b/i.test((JSON.stringify(CLEANING_TEXT) + JSON.stringify(CLEANING_STEPS)).replace("doesn't say the room is clean or disinfected", "")), "nothing else claims the room is clean, disinfected, sterile or safe");
assert.ok(!("airLink" in CLEANING_TEXT) && /No airflow is drawn/.test(CLEANING_TEXT.air) && !/ventilation plan/.test(CLEANING_TEXT.air), "no airflow in the room, and no link to a plan this site doesn't publish");
const cleaningPlaces = /return \(\{\n    basin:([\s\S]*?)\n  \}\)\[where\]/.exec(mainSrc)?.[0] || "";
for (const step of CLEANING_STEPS) assert.ok(new RegExp(`\\b${step.where}:`).test(cleaningPlaces), `Cleaning can light ${step.where}`);
// the board: Arabic beside English, in one block, and the nurse confirms anything clinical
assert.deepEqual(Object.keys(BOARD_AR).filter(k => k !== "confirm").sort(), BOARD.map(b => b.id).sort(), "every request has its Arabic, in one block");
assert.ok(Object.values(BOARD_AR).every(t => /[؀-ۿ]/.test(t) && !/[A-Za-z]/.test(t)), "the Arabic block is Arabic");
assert.ok(/A nurse confirms anything clinical in person/.test(BOARD_CONFIRM), "a nurse confirms anything clinical in person");
assert.ok(/n\.lang = "ar"; n\.dir = "rtl";/.test(bedsideSrc), "the Arabic is marked lang=\"ar\" and dir=\"rtl\"");
assert.ok(BOARD.find(b => b.id === "privacy")?.privacy && /Turn on Privacy/.test(bedsideSrc) && /this\.api\.privacy\(\)/.test(bedsideSrc), "the patient can ask for privacy, and a nurse turns it on from the request: nothing happens by itself");

// ---------------------------------------------------------------- the digital twin (twin-data.js): the room read in words, five separate parts, no total, no vital signs
const sample = {
  mode: "standard", state: "awake", quiet: false, light: { kelvin: 4000, level: 1, from: "set", task: false }, blinds: 0, glass: { front: "smart", opaque: false, level: 1 },
  temp: 23, humidity: 45, noise: 41, wall: wallFor({}), sceneLabel: "", tv: "orientation", fittings: { ceilingTray: true, staffPanel: true, patientWall: true, workstation: true, bedsideCabinet: true },
  sky: false, wardrobe: { shown: true, side: null }, lineClips: true, bed: { position: "on the back, backrest at 30°", minutes: 15, reminder: "none" }, tasks: { done: 0, total: 5 },
  layout: { added: [], own: 7 }, placed: 0, board: true, family: "all", requests: 0, cleaning: { on: false, ticks: 0, total: 9, next: null },
};
const calm = twinRead(sample);
assert.deepEqual(Object.keys(calm.systems), ["bed", "ceiling", "walls", "storage", "equipment", "floor", "mode"], "seven systems: the bed, the ceiling, the walls, storage, equipment, the floor and the mode in force");
assert.deepEqual(calm.health.map(h => h.label), ["Environmental comfort", "Equipment organisation", "Access clearance", "Communication readiness", "Cleaning checklist"], "the dashboard's five parts, in the brief's order");
assert.ok(calm.health.every(h => h.state in TWIN_STATES && h.lines.length) && !("total" in calm) && !("score" in calm) && calm.health.every(h => !("score" in h)), "each part is read on its own, in words: no total and no score");
assert.ok(calm.health.filter(h => h.id !== "cleaning").every(h => h.state === "settled") && calm.health.find(h => h.id === "cleaning").state === "off", "a settled room has nothing to look at, and Cleaning isn't running");
const allText = JSON.stringify(calm);
assert.ok(!/heart rate|oxygen saturation|blood pressure|breathing rate|SpO|\bbpm\b/i.test(allText), "no vital signs: those are PACS's");
assert.ok(/no modelled conflict found/.test(allText) && /not hospital rules/.test(allText) && /Illustrative/.test(allText) && /simulated/.test(allText), "it says the clear areas are the model's own, and which values are illustrative or simulated");
// it reads the room as it is: a mode, a request, a loud room, an added item in the way, and Cleaning each change what it says
const comfort = twinRead({ ...sample, mode: "comfort", light: { kelvin: 2700, level: 0.35, from: "mode", task: false }, wall: wallFor({ mode: "comfort" }) });
assert.ok(comfort.systems.mode.lines[0].startsWith("Comfort") && comfort.systems.mode.lines.some(l => /Relaxation/.test(l)) && /warm/.test(comfort.health[0].lines[0]) && /room mode/.test(comfort.health[0].lines[0]), "change the mode and it changes: Comfort's row, and the light from the mode");
assert.equal(twinRead({ ...sample, noise: 57 }).health.find(h => h.id === "comfort").state, "look", "a loud pillow asks someone to look");
assert.equal(twinRead({ ...sample, requests: 2 }).health.find(h => h.id === "communication").state, "look", "a request waiting asks someone to look");
assert.equal(twinRead({ ...sample, board: false }).health.find(h => h.id === "communication").lines[0], "Communication board: not offered while sedated.", "a sedated patient isn't offered the board, and it says so");
const blocked = twinRead({ ...sample, layout: { added: [{ level: "overlap", label: "Privacy screen", what: "overlaps bed" }], own: 7 } }).health.find(h => h.id === "access");
assert.ok(blocked.state === "look" && blocked.red && /Privacy screen: overlaps bed/.test(blocked.lines[0]), "an added item overlapping something is marked red, by name");
assert.equal(twinRead({ ...sample, lineClips: false }).health.find(h => h.id === "equipment").state, "look", "lines without clips ask someone to look");
const cleaningNow = twinRead({ ...sample, mode: "cleaning", cleaning: { on: true, ticks: 3, total: 9, next: "Monitor and pump screens and buttons" } }).health.find(h => h.id === "cleaning");
const cleaningDone = twinRead({ ...sample, mode: "cleaning", cleaning: { on: true, ticks: 9, total: 9, next: null } }).health.find(h => h.id === "cleaning");
assert.ok(cleaningNow.state === "look" && /3 of 9/.test(cleaningNow.lines[0]) && cleaningDone.state === "done" && /doesn't say the room is clean or disinfected/.test(cleaningDone.lines[1]), "Cleaning: the steps ticked, and finishing never says the room is disinfected");
assert.ok(/monitors nothing/.test(TWIN_TEXT.limits) && /no total/.test(TWIN_TEXT.limits) && /no vital signs/.test(TWIN_TEXT.limits), "the twin says it monitors nothing, adds no total and shows no vital signs");
assert.ok(byId.get("digitalTwin")?.control === "openTwin" && byId.get("digitalTwin").demo === "digitalTwin" && /never added into a score/.test(byId.get("digitalTwin").limits), "the twin's card: its button, its demo, and no score");

// ---------------------------------------------------------------- room intelligence and the room safety scan (intel-data.js, intel.js, layout.js)
const sensorsGroup = groupById("ceilingSensors");
assert.ok(sensorsGroup?.code === 45 && sensorsGroup.default === "off" && sensorsGroup.options.map(o => o.id).join() === "off,on" && ADDONS.has("ceilingSensors"), "the ceiling sensors are code 45, off by default, an add-on of their own");
assert.ok(future.sets.ceilingSensors === "on" && others.every(t => !("ceilingSensors" in t.sets)), "Future ICU turns them on, and the other themes leave them off");
assert.equal(decodeSpec(options, "#c=10030010002000000000000000000000000100").selected.ceilingSensors, "off", "the reference link opens with no sensors");
assert.deepEqual(SENSORS.map(x => x.at), ["bed", "door", "room"], "three sensors: over the bed, inside the door, over the middle of the room");
assert.deepEqual(EVENTS.map(e => e.id), ["edge", "clear"], "two made-up events: the patient moving toward the bed's edge, and something left in a clear area");
assert.ok(/Nothing watched/.test(INTEL_TEXT.meta) && /no camera, no microphone and no sensor reading/.test(INTEL_TEXT.meta) && /A person looks and acknowledges/.test(INTEL_TEXT.meta), "each event says nothing watched, and a person acknowledges");
assert.ok(/not a validated clinical device/.test(INTEL_TEXT.limits) && /isn't AI/.test(INTEL_TEXT.limits) && /changes no alarm or device/.test(INTEL_TEXT.limits), "a concept, not a validated device, and not AI");
const intelWords = JSON.stringify([SENSORS, EVENTS, INTEL_TEXT, SCAN_TEXT]).replace("isn't AI", "");
assert.ok(!/\bAI\b|artificial intelligence|machine learning|detects?\b/i.test(intelWords), "no AI claimed, and nothing said to detect: events are raised by buttons");
assert.ok(/not a validated clinical device/.test(byId.get("roomIntelligence").limits) && /every event is a button/.test(byId.get("roomIntelligence").limits), "room intelligence's card says what it isn't");
// the scan: the same check, its words, and a suggested spot that is clear
assert.ok(SCAN_TEXT.clear === "No modelled conflict found" && !/\bsafe\b/i.test(JSON.stringify(SCAN_TEXT)), "the scan says no modelled conflict found, never safe");
assert.ok(/never that a room is safe/.test(byId.get("roomSafetyScan").limits) && /isn't a compliance check/.test(byId.get("roomSafetyScan").limits), "the scan's card: not safe, not compliance");
assert.ok(/room safety scan/.test(read("./site/configurator/placed.js")) && /not hospital rules/.test(read("./site/configurator/placed.js")) && !/haven't been checked/.test(read("./site/configurator/placed.js")), "placed items' cards say the scan checks them, against this model's areas, not hospital rules");
const floor = [[0, 0], [5, 0], [5, 5], [0, 5]], bedBox = { id: "bed", boxes: [[2, 2, 0, 3, 4, 1]] }, keep = { id: "clear", kind: "keep-clear", poly: [[1.2, 2], [2, 2], [2, 4], [1.2, 4]] };
const inWay = { id: "placed:1", boxes: [[1.4, 2.8, 0, 1.8, 3.2, 1]] }, spot = suggestSpot({ item: inWay, solids: [bedBox, inWay], areas: [keep], within: floor });
const moved = { ...inWay, boxes: inWay.boxes.map(b => [b[0] + spot.dx, b[1] + spot.dy, b[2], b[3] + spot.dx, b[4] + spot.dy, b[5]]) };
assert.ok(spot && Math.hypot(spot.dx, spot.dy) > 0 && !checkLayout({ solids: [bedBox, moved], areas: [keep] }).length, `an item in a keep-clear area gets a nearby spot where nothing is in the way (${spot.dx}, ${spot.dy})`);
assert.deepEqual(suggestSpot({ item: { id: "placed:2", boxes: [[4, 0.5, 0, 4.3, 0.8, 1]] }, solids: [bedBox], areas: [keep], within: floor }), { dx: 0, dy: 0 }, "an item already clear stays where it is");
assert.equal(suggestSpot({ item: { id: "placed:3", boxes: [[0.1, 0.1, 0, 0.9, 0.9, 1]] }, solids: [{ id: "wall", boxes: [[0, 0, 0, 5, 5, 1]] }], within: floor, maxR: 0.6 }), null, "with nowhere clear nearby it says so, and moves nothing");

// ---------------------------------------------------------------- equipment and cables (cables-data.js, cables.js)
const cableGroup = groupById("cableChannels");
assert.ok(cableGroup?.code === 46 && cableGroup.default === "off" && ADDONS.has("cableChannels") && options.themes.every(t => t.sets.cableChannels === "on") && options.themeBase.sets.cableChannels === "on", "the cable channels are code 46, off by default, and part of the base all four themes share");
assert.equal(decodeSpec(options, "#c=10030010002000000000000000000000000100").selected.cableChannels, "off", "the reference link opens with no channels");
assert.deepEqual(CABLE_KINDS.map(k => k.id), ["power", "data", "gas", "patient"], "power, data, medical gas and the patient's lines");
assert.ok(CABLE_KINDS.every(k => k.label && /^#[0-9a-f]{6}$/i.test(k.colour)) && new Set(CABLE_KINDS.map(k => k.colour)).size === CABLE_KINDS.length && new Set(CABLE_KINDS.map(k => k.label)).size === CABLE_KINDS.length, "each kind has its own colour and its own label: colour is never the only clue");
const gasCh = CHANNELS.find(c => c.id === "gas"), elCh = CHANNELS.find(c => c.id === "electrical");
assert.ok(gasCh.carries.join() === "gas" && !elCh.carries.includes("gas") && CABLE_KINDS.filter(k => k.id !== "patient").every(k => CHANNELS.find(c => c.id === k.channel)?.carries.includes(k.id)), "medical gas has its own channel and never shares one with power or data");
assert.ok(ROUTES_BY_STATE.traditional.every(r => r.floor) && ROUTES_BY_STATE.organised.every(r => !r.floor), "Traditional: every cable on the floor; Organised: none");
assert.ok(ROUTES_BY_STATE.organised.filter(r => r.kind === "gas").every(r => ![r.from, r.to].includes("wall-channel")) && ROUTES_BY_STATE.organised.filter(r => r.kind !== "gas").every(r => ![r.from, r.to].includes("gas-channel")), "routed gas never uses the power and data channel, nor anything electrical the gas channel");
const cablesSrc = read("./site/configurator/cables.js");
const pointsAt = cablesSrc.indexOf("return {", cablesSrc.indexOf("export function cablePoints")), pointsSrc = cablesSrc.slice(pointsAt, cablesSrc.indexOf("};", pointsAt));
const pointNames = new Set([...pointsSrc.matchAll(/(?:"([\w-]+)"|\b(\w+)):\s/g)].map(m => m[1] || m[2]));
for (const r of [...ROUTES_BY_STATE.traditional, ...ROUTES_BY_STATE.organised]) assert.ok(pointNames.has(r.from) && pointNames.has(r.to), `cables.js knows the points ${r.from} and ${r.to}`);
assert.ok(/Nothing retracts, clamps or disconnects a line/.test(CABLE_TEXT.limits) && /nothing moves by itself/.test(CABLE_TEXT.limits) && /APIS/.test(CABLE_TEXT.patient), "nothing retracts, clamps, disconnects or moves; the patient's lines are linked to APIS, not repeated");
assert.ok(byId.get("ceilingPendant")?.objects[0] === "part:cfg_kit_pendant" && byId.get("cableOverlay")?.demo === "cables", "the ceiling pendant has its card, and the cables theirs, with a demo");
assert.ok(/apis\.setMode\("routing"\)/.test(mainSrc) && !/cables/.test(read("./site/configurator/apis.js")), "APIS's tubing tab is opened as it is: nothing in APIS changed");

// ---------------------------------------------------------------- Light across 24 hours (day-plan.js)
assert.deepEqual(PHASES.map(p => p.label), ["Morning daylight", "Afternoon comfort", "Evening wind-down", "Night sleep"], "the brief's four phases, in order");
assert.ok(PHASES.every((p, i) => i === 0 || p.from === PHASES[i - 1].to) && PHASES[3].to - PHASES[0].from === 24, "they meet end to end and cover the 24 hours");
let maxK = 0, maxL = 0, maxB = 0;
for (let h = 0; h < 24; h += 0.25) {
  assert.ok(phaseAt(h), `${h}: every hour is in a phase`);
  const a = lookAt(h), b = lookAt(h + 0.25);
  maxK = Math.max(maxK, Math.abs(a.kelvin - b.kelvin)); maxL = Math.max(maxL, Math.abs(a.level - b.level)); maxB = Math.max(maxB, Math.abs(blindsAt(h) - blindsAt(h + 0.25)));
  const w = words(h);
  assert.ok(!/\d/.test(w.light + w.blinds), `${h}: the light and blinds are in words, with no number that looks measured`);
}
assert.ok(maxK <= 500 && maxL <= 0.15 && maxB <= 0.2, `every change is gradual: at most ${maxK} K, ${maxL.toFixed(2)} of the level and ${maxB.toFixed(2)} of the blinds in 15 minutes`);
assert.ok(blindsAt(9) === 0 && lookAt(14.5).level === 1 && lookAt(14.5).kelvin >= 4500 && blindsAt(14.5) === 0.5 && lookAt(2).level < 0.15 && lookAt(2).kelvin <= 2400 && blindsAt(2) === 1,
  "morning: blinds up; afternoon: bright, cool and the blinds half down; night: warm, low and the blinds down");
assert.ok(inQuiet(23) && inQuiet(3) && !inQuiet(12) && !inQuiet(21.5) && QUIET.from === 22 && QUIET.to === 6 && /Care still comes first/.test(QUIET.note), "quiet hours run 10 pm to 6 am, and care still comes first");
assert.ok(/Clinical and Emergency are the staff override and always win/.test(DAY_TEXT.override) && /this\.scene \|\| this\.plan \|\| this\.patient/.test(read("./site/configurator/lights.js")),
  "the plan's light sits under the room modes: Clinical and Emergency always win");
const dp = byId.get("dayPlan");
assert.ok(dp && dp.control === "openDay" && dp.evidence.sourcesFrom === "scheme:circadian" && sourcesOf("scheme:circadian").length === 2 && /found no effect/.test(dp.evidence.text),
  "the card cites the two lighting studies options.json already holds, the trial that found no effect among them");
// ---------------------------------------------------------------- When someone comes in (arrival-data.js, arrival.js)
// three people, a walk that keeps to the room's route and ends at the bedside facing the bed, and words that say what it isn't
assert.deepEqual(ARRIVAL_ORDER, ["nurse", "doctor", "family"], "a nurse, a doctor and a family visitor can come in");
assert.ok(ARRIVAL_ORDER.every(r => ARRIVALS[r].label && ARRIVALS[r].pass && [ARRIVALS[r].top, ARRIVALS[r].legs, ARRIVALS[r].badge].every(col => /^#[0-9a-f]{6}$/.test(col))), "each has a name for their role, clothes, and something to tap at the door");
for (const label of options.rooms) {
  const route = ROUTES[label], length = routeLength(route), meta = METAS[label], bed = [meta.bed.head[0] + meta.bed.foot[0], meta.bed.head[1] + meta.bed.foot[1]];
  const start = along(route, 0, bed), end = along(route, length, bed);
  assert.ok(Math.hypot(start.x - route[0][0], start.y - route[0][1]) < 1e-9 && Math.hypot(end.x - route.at(-1)[0], end.y - route.at(-1)[1]) < 1e-9, `${label}: the walk starts at the door's end of the route and stops at the bedside`);
  const lane = corridor(route);
  for (let d = 0.05; d < length - 0.05; d += 0.05) { const p = along(route, d, bed); assert.ok(inPolygon(p.x, p.y, meta.walkable) && lane.some(q => inPolygon(p.x, p.y, q)), `${label}: ${d.toFixed(2)} m along, the walker is on the route, inside the room`); }
  const want = Math.atan2(bed[1] - end.y, bed[0] - end.x), off = Math.abs(Math.atan2(Math.sin(end.heading - want), Math.cos(end.heading - want)));
  assert.ok(off < 0.05, `${label}: at the bedside the walker faces the bed (${off.toFixed(3)} rad off)`);
  let last = 0, top = 0;
  for (let t = 0; t <= walkTime(length) + 0.5; t += 0.05) { const d = walked(length, t); assert.ok(d >= last - 1e-9 && d <= length + 1e-9, `${label}: the walk only goes forward`); top = Math.max(top, (d - last) / 0.05); last = d; }
  assert.ok(Math.abs(last - length) < 1e-9 && top <= 2 && walkTime(length) <= 8, `${label}: the walker arrives, at a walk and never a run (${top.toFixed(2)} m/s at most), in ${walkTime(length).toFixed(1)} s`);
  const v = ARRIVAL_VIEW[label];
  assert.ok(v?.eye.length === 3 && v.look.length === 3 && v.eye[0] > meta.room[0] && v.eye[0] < meta.room[2] && v.eye[1] > meta.room[1] && v.eye[1] < meta.room[3] && v.eye[2] > 0 && v.eye[2] < meta.ceiling, `${label}: an arrival is watched from inside the room, under the ceiling`);
}
const arr = byId.get("arrival");
assert.ok(arr && arr.control === "arrivalPlay" && arr.demo === "arrivalNurse" && arr.actions.join() === "demo:arrivalDoctor,demo:arrivalFamily", "the arrival card: its button under View, and a demo for each of the three");
assert.ok(/Nothing recognises anyone/.test(arr.limits) && /no camera/.test(arr.limits) && /only when a person chooses/.test(arr.limits) && /Nothing recognises anyone/.test(ARRIVAL_TEXT.figure) && /Nothing recognises anyone/.test(ARRIVAL_TEXT.limits), "it says nothing recognises anyone, and that only a person changes the light or the mode");
for (const id of ["arrivalNurse", "arrivalDoctor", "arrivalFamily"]) {
  assert.ok(/The demo plays the tap: nothing recognises anyone/.test(DEMOS[id].steps[0].say) && /leaves/.test(DEMOS[id].steps.at(-1).say), `${id}: its first caption says the demo plays the tap, and its last that they leave`);
}
// a badge wakes screens. A room mode is a person's choice, and the caption names who chooses
assert.ok(!DEMOS.arrivalNurse.steps.some(st => /a\.mode\(/.test(String(st.run))), "a nurse's badge changes no room mode");
assert.ok(/The demo plays the doctor/.test(DEMOS.arrivalDoctor.steps[2].say) && /A nurse turns on Family visit/.test(DEMOS.arrivalFamily.steps[1].say) && /shown nothing clinical/.test(DEMOS.arrivalFamily.steps[1].say), "where a mode changes, the caption names the person who chooses it; a visitor is shown nothing clinical");
const arrivalSrc = read("./site/configurator/arrival.js") + read("./site/configurator/arrival-data.js");
assert.ok(/SIMULATED/.test(arrivalSrc) && /no face/.test(arrivalSrc) && !/getUserMedia|FaceDetector|SpeechRecognition|navigator\.|fetch\(|localStorage/.test(arrivalSrc), "the figure is marked simulated and has no face, and its code senses, stores and sends nothing");
console.log(`PASS when someone comes in: ${ARRIVAL_ORDER.length} people, a walk on the route to the bedside in both rooms, a badge that changes no mode, and words that say nothing recognises anyone`);
console.log(`PASS feature registry and acoustic model: ${data.features.length} entries (${data.features.filter(f => f.parent).length} of them parts) in ${new Set(data.features.map(f => f.group)).size} groups, ${links} object links in both rooms, every field and evidence line present, sources only from options.json, no outcome claims, and ${Object.keys(DEMOS).length} demos (${steps} steps) that name only what the page has; 6 sound sources, 4 fittings that only take sound away (codes 33 to 36, off by default), and 3 kinds of notification; the bed's 4 positions, 5 lines with slack in words, and the clips at code 37, off by default; the Future ICU theme first, its 5 fittings at codes 38 to 42 (off by default, stills marked SIMULATED), the view across the room appended, and the layout check clear in both rooms; the smart clinical wall and Transform my environment at codes 43 and 44, in step with every mode, state and scene (${combos.length} combinations), the five made-up observations marked, the workstation's places in both rooms, and the strip readable from the pillow; the mode table with its five levels for ${Object.keys(MODES).length} modes across ${SYSTEMS.length} systems, every note one line that keeps medical alarms on, Cleaning's checklist, and the board in Arabic with ${BOARD.length} requests; the digital twin's ${TWIN_SYSTEMS.length} systems and ${HEALTH.length} separate parts, read from the room with no total and no vital signs; room intelligence's ${SENSORS.length} sensors and ${EVENTS.length} made-up events, raised by buttons, and the room safety scan's clear spot; ${CABLE_KINDS.length} kinds of cable, each labelled and coloured, with gas in its own channel; Light across 24 hours' four phases, gradual, under the modes`);
