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
  assert.ok(f.objects.length || parts.length, `${who} links to an object, or has parts that do`);
  for (const s of f.objects) {
    const o = parseObject(s);
    links += 1;
    if (o.kind === "addon") assert.ok(ADDONS.has(o.arg), `${who}: add-on ${o.arg} is built in addons.js`);
    else if (o.kind === "part") for (const [label, r] of Object.entries(ROOMS)) assert.ok(r.parts.has(o.arg), `${who}: ${o.arg} is a part of ${label}'s model`);
    else if (o.kind === "placed") assert.ok(PLACED.has(o.arg), `${who}: ${o.arg} is an item in Place items`);
    else if (o.kind === "node") assert.ok(new RegExp(`name\\s*[=:]\\s*["'\`]${o.arg}["'\`]`).test(addonsSrc), `${who}: an object named ${o.arg} is built in addons.js`);
    else assert.ok(["lights", "switch"].includes(o.kind) && !o.arg, `${who}: ${s} is a kind of link the page knows`);
    for (const [g, vs] of Object.entries(o.when)) {
      const group = groupById(g);
      assert.ok(group && vs.every(v => group.options.some(x => x.id === v)), `${who}: the condition on ${g} names its options`);
    }
  }
  // what it does: a demo the page has, and actions with handlers
  if (f.demo) { assert.ok(DEMOS[f.demo]?.steps?.length, `${who}: its demo ${f.demo} is in demos.js`); demosUsed.add(f.demo); }
  for (const a of f.actions || []) assert.ok(ACTIONS.includes(a), `${who}: its action ${a} has a handler`);
}
for (const a of ACTIONS) assert.ok(new RegExp(`["']?${a.replace(":", "\\:")}["']?\\s*:\\s*\\{`).test(mainSrc), `main.js handles the card action ${a}`);
assert.ok(/for \(const a of ACTIONS\) if \(!ACTION_HANDLERS\[a\]\)/.test(mainSrc), "and says so at load if one has no handler");
assert.deepEqual([...demosUsed].sort(), Object.keys(DEMOS).sort(), "every demo belongs to a feature");

// the eight features that were here before the cards, and the nature display's four parts
for (const id of ["circadian", "privacy", "orientation", "nature", "wardrobe", "soundSensor", "comfortControl", "daylightSensor"]) assert.ok(byId.has(id) && !byId.get(id).parent, `${id} is registered`);
assert.deepEqual(data.features.filter(f => f.parent === "nature").map(f => f.id), ["tvScene", "skyCeiling", "digitalAquarium", "biophilicPanel"], "the nature display's four parts");

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
  wardrobe: open => { assert.equal(typeof open, "boolean", "the wardrobe's doors open or close"); calls.push(["wardrobe"]); },
};
let steps = 0;
for (const [id, d] of Object.entries(DEMOS)) {
  for (const step of d.steps) {
    assert.ok(typeof step.say === "string" && step.say.trim() && typeof step.run === "function", `${id}: each step has a caption and a run`);
    assert.ok(!/\d\s*%/.test(step.say) && !OUTCOME.test(step.say), `${id}: its caption makes no claim: ${step.say}`);
    step.run(api);
    steps += 1;
  }
  assert.ok(d.steps.length <= 6, `${id} is short`);
}
assert.ok(HOLD_MS >= 2500 && HOLD_MS <= 6000, "each step holds long enough to read, and no longer");
assert.ok(calls.length >= steps, "every step sets something up");

console.log(`PASS feature registry: ${data.features.length} entries (${data.features.filter(f => f.parent).length} of them parts) in ${new Set(data.features.map(f => f.group)).size} groups, ${links} object links in both rooms, every field and evidence line present, sources only from options.json, no outcome claims, and ${Object.keys(DEMOS).length} demos (${steps} steps) that name only what the page has`);
