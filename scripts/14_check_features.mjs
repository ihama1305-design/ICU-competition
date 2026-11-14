// The feature registry, checked without a browser: node scripts/14_check_features.mjs
// Every entry in features.json has its fields, belongs to a group, links to objects that exist (add-ons built in addons.js,
// parts of both room models, placed items, named objects), cites only sources that options.json already holds, makes no
// outcome claim, and names a demo or action that has a handler. Each demo is run against a stand-in for the page, so a step
// that names an option, time, mode, view or feature that doesn't exist fails here. Checks 08 clicks every card for real.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ACTIONS, DEMOS, HOLD_MS } from "./site/configurator/demos.js";
import { MODES } from "./site/configurator/modes.js";
import { parseObject } from "./site/configurator/feature-links.js";
import { APPLY, BOARD, CLINICIAN, DEFAULT_STATE, FAMILY, OFFERS, ORIENTATION, PASSPORT, STAFF, STATES, STATE_MS, STATE_ORDER } from "./site/configurator/patient-states.js";
import { BACKGROUND, BANDS, FITTINGS, FITTING_GROUPS, ILLUSTRATIVE, NOTIFICATIONS, SOURCES, levelAt, sourceLevel } from "./site/configurator/acoustic.js";

const here = p => new URL(p, import.meta.url);
const read = p => readFileSync(here(p), "utf8");
const data = JSON.parse(read("./site/configurator/features.json"));
const options = JSON.parse(read("./site/configurator/options.json"));
const groups = options.sections.flatMap(s => s.groups);
const groupById = id => groups.find(g => g.id === id);

// what the page has: add-ons, placed items, named objects, the time stops, and each room's model parts and views
const addonsSrc = read("./site/configurator/addons.js"), placedSrc = read("./site/configurator/placed.js"), mainSrc = read("./site/configurator/main.js");
const ADDONS = new Set([...addonsSrc.matchAll(/^ {2}(\w+)\(room\) \{/gm)].map(m => m[1]));
const PLACED = new Set([...placedSrc.matchAll(/^ {4}id: "(\w+)", code:/gm)].map(m => m[1]));
const STOPS = new Set(Object.keys(Function(`return ${/const STOPS = (\{[^}]*\})/.exec(mainSrc)[1]}`)()));
const ROOMS = {};
for (const label of options.rooms) {
  const meta = JSON.parse(read(`../assets/model/room_${label.toLowerCase()}.json`));
  const glb = gunzipSync(readFileSync(here(`../assets/model/${meta.glb}`)));
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString("utf8"));
  ROOMS[label] = { parts: new Set(json.nodes.map(n => n.name).filter(Boolean)), views: new Set(Object.keys(meta.cameras)) };
}
assert.ok(ADDONS.has("wardrobe") && ADDONS.has("soundSensor") && PLACED.has("leafpanel") && STOPS.has("night"), "the page's add-ons, placed items and time stops are read");

// ---------------------------------------------------------------- the groups the brief names, and the entries
assert.deepEqual(data.groups.map(g => g.id), ["comfort", "bed", "light", "family", "admission", "storage"], "the six groups");
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
  mode: name => { assert.ok(MODES[name] && name !== "emergency", `a demo sets ${name}, a room mode that isn't Emergency-ready`); calls.push(["mode"]); },
  camera: v => { for (const [label, r] of Object.entries(ROOMS)) assert.ok(r.views.has(v), `a demo goes to the ${v} view, which ${label} has`); calls.push(["camera"]); },
  frame: id => { assert.ok(byId.get(id)?.objects.length, `a demo stands in front of ${id}, a registered feature with objects`); calls.push(["frame"]); },
  wardrobe: side => { assert.ok([null, "left", "right"].includes(side), `the wardrobe's doors show the left side, the right, or close (${side})`); calls.push(["wardrobe"]); },
  outline: id => { assert.ok(byId.has(id), `a demo outlines ${id}, a registered feature`); calls.push(["outline"]); },
  oldWardrobe: on => { assert.equal(typeof on, "boolean", "the old wardrobe's outline shows or goes"); calls.push(["oldWardrobe"]); },
  figures: () => "It took 0.64 m² of floor (1.00 by 0.64 m), and this one takes 0.71 m² (1.11 by 0.64 m): 0.07 m² more.",
  acoustic: state => { assert.ok(["without", "with"].includes(state), `a demo shows the room without or with the fittings (${state})`); calls.push(["acoustic"]); },
  notices: open => { assert.equal(typeof open, "boolean", "the notifications list opens or closes"); calls.push(["notices"]); },
  patient: name => { assert.ok(STATES[name], `a demo sets a patient state that exists (${name})`); calls.push(["patient"]); },
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
assert.deepEqual(BOARD.map(b => b.label), ["I need help", "I am in pain", "I feel cold", "I feel hot", "I need repositioning", "I want to contact my family", "I need a nurse"], "the board's seven requests, in the brief's words");
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

console.log(`PASS feature registry and acoustic model: ${data.features.length} entries (${data.features.filter(f => f.parent).length} of them parts) in ${new Set(data.features.map(f => f.group)).size} groups, ${links} object links in both rooms, every field and evidence line present, sources only from options.json, no outcome claims, and ${Object.keys(DEMOS).length} demos (${steps} steps) that name only what the page has; 6 sound sources, 4 fittings that only take sound away (codes 33 to 36, off by default), and 3 kinds of notification`);
