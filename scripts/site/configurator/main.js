// Room configurator: a design proposal, built on the as-built model of one room.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stage, W2T } from "./stage.js";
import { Rig, inside } from "./cameras.js";
import { Daylight, sunAt } from "./sky.js";
import { Lighting } from "./lights.js";
import { FrontGlass } from "./glass.js";
import { applyLook } from "./surfaces.js";
import { setAddon, setAddonLook, setOldWardrobe, setOrientation, setShade, setTv, setWardrobe, syncPalms, tickAddons, tickWardrobe, toggleWardrobe, wardrobeFigures, wardrobeMoving } from "./addons.js";
import { decodeSpec, encodeSpec } from "./state.js";
import { differences, optionLabel, resolveProfile } from "./profile.js";
import { summaryContent } from "./summary.js";
import { el, Panel } from "./panel.js";
import { cueFor, LEVELS, noticeFor, QUIET, SOUNDS } from "./vocal.js";
import { APIS } from "./apis.js";
import { PACS } from "./pacs.js";
import { RoomModes, modeText } from "./modes.js";
import { HORIZON_DEG } from "./solar.js";
import { MAX_PRESETS, deletePreset, readPresets, savePreset } from "./presets.js";
import { CHECK, ITEMS, MAX_PLACED, Placement, decodePlaced, encodePlaced, itemById, wallsOf } from "./placed.js";
import { ClinicalView } from "./clinical.js";
import { GuidedTour, CAVEAT } from "./guide.js";
import { Features } from "./features.js";
import { Highlight } from "./highlight.js";
import { ACTIONS, DEMOS, HOLD_MS as DEMO_HOLD_MS } from "./demos.js";
import { LookHint } from "./hint.js";
import { readChoice, saveChoice, readMeasured, saveMeasured, startTier, handheld, pickTier, probe } from "./quality.js";

addEventListener("error", e => window.__configErrors.push(String(e.message)));
addEventListener("unhandledrejection", e => window.__configErrors.push(String(e.reason)));
document.addEventListener("touchstart", () => {}, { passive: true }); // iOS Safari only applies :active once the page listens for touches

const SITE = /*SITE_JSON*/{ latitude_deg: 24.45, declination_deg: -2.5, north_offset_deg: 0 };
const STOPS = { morning: 8.5, midday: 12, afternoon: 15.53, sunset: 17.75, night: 21 };
const NIGHT_FROM = 18.4;
const $ = id => document.getElementById(id);

const canvas = $("c"), panel = $("panel");
const query = new URLSearchParams(location.search);
// Graphics quality (quality.js): Auto, High or Low, remembered in this browser. Auto starts in the tier this device measured
// last time; until it has, a phone or tablet starts on Low as before and anything else on High. Then it times test draws.
// ?tier=low or ?tier=high forces one, as the checks do.
const forcedTier = ["low", "high"].includes(query.get("tier")) ? query.get("tier") : null;
const quality = { choice: forcedTier || readChoice(), ms: 0 };
let tier = forcedTier || startTier(quality.choice, readMeasured("configurator"), handheld());
const stage = (() => {
  // the page checked for WebGL 2 before loading, but a context can still be refused (a blocklisted GPU, too many open tabs)
  try { return new Stage(canvas, tier); } catch (err) { window.cantDraw?.("webgl2"); throw err; }
})();
const controls = new OrbitControls(stage.camera, canvas);
const placement = new Placement(stage); // items the visitor places, room by room
const clinical = new ClinicalView({ stage, placement, layer: $("clinicalLabels") });
let clinicalByHand = false, clinicalByMode = false; // Equipment labels are on if either asks for them
const state = { room: "W1", view: "overview", hour: STOPS.afternoon };
let beforePatient = "overview"; // where Return goes from Patient view
let dirty = true, lastDayHour = STOPS.afternoon;
const invalidate = () => { dirty = true; };
const rig = new Rig(stage.camera, controls, W2T, invalidate);
const daylight = new Daylight(stage.scene, SITE, W2T, tier === "low" ? 1024 : 2048);
stage.onQualityDrop = () => { resize(); };
// still too slow with the bloom gone, at one pixel per CSS pixel: on Auto, drop to Low
stage.onTooSlow = () => { if (quality.choice === "auto" && !forcedTier && tier !== "low") { saveMeasured("configurator", "low"); applyTier("low"); syncQuality(); } };
const lighting = new Lighting(stage, daylight, tier);
const glass = new FrontGlass(tier);
controls.addEventListener("change", invalidate);
rig.onView = (name, isDoll) => {
  // going up: the ceiling goes first, so the camera doesn't pass through it. Coming down: it returns on arrival
  if (isDoll) stage.setCeiling(false);
  if (name === "patient" && state.view !== "patient") beforePatient = state.view;
  state.view = name;
  syncViews();
  remember();
  describe();
  say(name === "patient" ? "Patient view, from the pillow. Drag or use the arrow keys to turn. Escape goes back." : `${viewPhrase(name)}.`);
};
rig.onArrive = name => {
  if (name !== "dollhouse") stage.setCeiling(true);
  invalidate();
  tour.arrived();
};

// ---------------------------------------------------------------- layout
/** An element's box where it comes to rest: without the offset of an entrance that is still playing. Not for the phone's
 *  options sheet, whose closed position is itself a transform. */
function restingRect(el) {
  const r = el.getBoundingClientRect(), t = getComputedStyle(el).transform;
  if (!t || t === "none") return r;
  const m = new DOMMatrixReadOnly(t);
  return new DOMRect(r.x - m.e, r.y - m.f, r.width, r.height);
}
function resize() {
  const w = innerWidth, h = innerHeight;
  stage.resize(w, h);
  stage.camera.aspect = w / h;
  const rect = document.body.classList.contains("pacs-active") ? restingRect($("pacsPanel")) : panel.getBoundingClientRect();
  const phone = matchMedia("(max-width: 820px)").matches;
  const coverX = phone || !rect.width ? 0 : w - rect.left;
  const coverY = phone && rect.height ? Math.max(0, h - rect.top) : 0;
  // keep the room centred in the part of the screen the panel leaves free
  stage.camera.setViewOffset(w, h, coverX / 2, coverY / 2, w, h);
  rig.visible = { w: w - coverX, h: h };
  if (rig.meta) rig.fit();
  const closed = phone && !panel.classList.contains("open"); // a closed sheet's controls are off-screen
  $("panelBody").inert = closed;
  panel.querySelector(".actions").inert = closed;
  stage.camera.updateProjectionMatrix();
  invalidate();
}
addEventListener("resize", resize);
new ResizeObserver(resize).observe(panel);
panel.addEventListener("transitionend", e => { if (e.target === panel && e.propertyName === "transform") resize(); });

// ---------------------------------------------------------------- controls
function pressed(group, value) {
  group.querySelectorAll("button[data-value]").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.value === value)); });
}
function syncViews() {
  pressed($("views"), state.view);
  const bathroom = $("views").querySelector('[data-value="bathroom"]');
  if (bathroom) bathroom.hidden = !!rig.meta && !rig.meta.cameras.bathroom;
  const leave = $("leavePatient");
  leave.hidden = state.view !== "patient";
  if (!leave.hidden) leave.textContent = `Return to ${viewLabel(returnView())}`;
}
// the view Return goes to: the one before Patient view, if this room has it
const returnView = () => (rig.meta?.cameras[beforePatient] && beforePatient !== "patient" ? beforePatient : "overview");
function leavePatient() {
  tour.stop();
  rig.go(returnView());
  remember();
}

// what the 3D view shows, for anyone who can't see it
const viewLabel = name => $("views").querySelector(`[data-value="${name}"]`).textContent;
const viewPhrase = name => (/ view$/i.test(viewLabel(name)) ? viewLabel(name) : `${viewLabel(name)} view`);
const say = text => { $("announce").textContent = text; };
function describe() {
  if (!rig.meta) return;
  const room = rig.meta.isolation ? `isolation room ${state.room}` : `standard room ${state.room}`;
  const moves = state.view === "patient" ? "Drag or use the arrow keys to turn your head, and plus and minus to narrow or widen what you see. Escape goes back." : "Drag or use the arrow keys to look around, and plus and minus to move closer.";
  canvas.setAttribute("aria-label", `3D view of ${room}, ${viewPhrase(state.view)}, ${clock(state.hour)} solar time. ${moves}`);
}

const clock = h => {
  const m = Math.round(h * 60), hh = Math.floor(m / 60) % 24, mm = m % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
};
const isNight = h => h >= NIGHT_FROM;

/** Between sunset and sunrise, from the sun's height the room's daylight already computed: Comfort and PACS leave the blinds alone. */
const afterDark = () => daylight.elevation < HORIZON_DEG;
/** The daylight sensor's card: what it would read, from the same sun height. */
function daylightCard() {
  const node = stage.current?.addons?.daylightSensor;
  if (!node) return "";
  const el = daylight.elevation, dark = afterDark();
  const text = `A small light sensor on the window sill. It tells Comfort mode and PACS whether daylight is coming in: after sunset they leave the blinds alone and change only the lighting. In this model the sun's height at the room's solar hour stands in for its reading: ${Math.abs(el).toFixed(0)}° ${el >= 0 ? "above" : "below"} the horizon at ${clock(state.hour)}, so ${dark ? "it's after sunset" : "it's daylight"}. A concept: it isn't connected to anything.`;
  node.traverse(n => { if (n.userData.itemInfo) n.userData.itemInfo.description = text; });
  return text;
}

function relight() {
  if (stage.current) setOrientation(stage.current, state.hour); // the orientation screen tells the room's time
  const day = daylight.apply(state.hour);
  daylightCard();
  lighting.update(state.hour, day);
  invalidate();
}

function setTime(h) {
  state.hour = h;
  if (!isNight(h)) lastDayHour = h;
  relight();
  stage.renderer.shadowMap.needsUpdate = true;
  const slider = $("time");
  slider.value = String(h);
  const text = clock(h);
  slider.setAttribute("aria-valuetext", `${text} solar time`);
  $("timeNow").textContent = text;
  remember();
  describe();
  pressed($("dayNight"), isNight(h) ? "night" : "day");
  modes.timeChanged(); // Comfort leaves the blinds alone after dark, so crossing sunset or sunrise changes what it does
  const stop = Object.entries(STOPS).find(([, v]) => Math.abs(v - h) < 0.2)?.[0];
  $("stops").querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.value === stop)); });
  invalidate();
}

async function setRoom(label, { keepView = true } = {}) {
  endVocalCue(); // its notice names the room being left
  endCompare();
  if (pacs.active) pacs.exit();
  endMode();
  state.room = label;
  pressed($("rooms"), label);
  const status = $("roomStatus");
  const known = stage.rooms.has(label);
  if (!known) status.textContent = "Loading the room…";
  const room = await stage.load(label, f => { status.textContent = `Loading the room… ${Math.round(f * 100)}%`; });
  if (state.room !== label) return; // another room was chosen while this one loaded
  stage.show(room);
  placement.show(room);
  apis.setRoom(room);
  rig.setRoom(room.meta);
  if (!room.meta.cameras[state.view]) state.view = "overview";
  daylight.setCentre((room.meta.room[0] + room.meta.room[2]) / 2, (room.meta.room[1] + room.meta.room[3]) / 2);
  lighting.setRoom(room);
  glass.setRoom(room);
  setAddon(room, "comfortControl", true); // not an option: the wall control is always there
  setAddon(room, "daylightSensor", true); // nor the daylight sensor the comfort rules read
  applyAll();
  setDemoReadout();
  clinical.set(clinical.on, room);
  relight();
  rig.view = null;
  rig.go(keepView ? state.view : "overview", { instant: true });
  stage.setCeiling(state.view !== "dollhouse");
  syncUi();
  describe();
  say(room.meta.isolation ? `Isolation room ${label}.` : `Standard room ${label}.`);
  status.textContent = room.meta.isolation ? "With its ante room and toilet." : "Opens straight onto the corridor.";
  invalidate();
}

$("rooms").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  const previous = state.room;
  setRoom(b.dataset.value).catch(err => {
    // the room on screen still works: stay in it and say what happened
    window.__configErrors.push(String(err));
    state.room = previous;
    pressed($("rooms"), previous);
    $("roomStatus").textContent = "That room could not be loaded. Check your connection and try again.";
  });
});
$("views").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.id === "tour") { tour.toggle(); return; }
  if (!b.dataset.value) return; // not a view, like the Equipment labels toggle
  tour.stop();
  rig.go(b.dataset.value);
  remember();
});
$("dayNight").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  setTime(b.dataset.value === "night" ? STOPS.night : lastDayHour);
  say(`${b.textContent}, ${clock(state.hour)}.`);
});
$("stops").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (!b) return;
  setTime(STOPS[b.dataset.value]);
  say(`${b.textContent}, ${clock(state.hour)}.`);
});
$("time").addEventListener("input", e => setTime(Number(e.target.value)));

const sheet = $("sheet");
$("panelBody").addEventListener("click", e => {
  const current = e.target.closest('details[name="options"] > summary')?.parentElement;
  if (!current) return;
  requestAnimationFrame(() => {
    if (current.open) $("panelBody").querySelectorAll('details[name="options"][open]').forEach(other => { if (other !== current) other.open = false; });
  });
});
function setSheet(open) {
  panel.classList.toggle("open", open);
  sheet.setAttribute("aria-expanded", String(open));
  sheet.setAttribute("aria-label", open ? "Hide the options" : "Show the options");
  resize();
}
// tap the handle, or swipe the handle or title up and down
let swipeFrom = null, swiped = false;
sheet.addEventListener("click", () => {
  if (!swiped) setSheet(!panel.classList.contains("open"));
  swiped = false;
});
for (const area of [sheet, panel.querySelector("header")]) {
  area.addEventListener("pointerdown", e => { if (!e.target.closest("a")) swipeFrom = e.clientY; });
}
addEventListener("pointerup", e => {
  if (swipeFrom === null || !matchMedia("(max-width: 820px)").matches) { swipeFrom = null; return; }
  const dy = e.clientY - swipeFrom;
  swipeFrom = null;
  if (Math.abs(dy) > 24) { swiped = true; setSheet(dy < 0); setTimeout(() => { swiped = false; }); }
});
addEventListener("pointercancel", () => { swipeFrom = null; });

$("leavePatient").addEventListener("click", leavePatient);
canvas.addEventListener("keydown", e => {
  if (e.key === "Escape" && state.view === "patient") { e.preventDefault(); leavePatient(); return; }
  const s = 0.09, map = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  const zoom = { "+": 0.88, "=": 0.88, "-": 1.14, _: 1.14 }[e.key];
  if (!map && !zoom) return;
  e.preventDefault();
  lookHint.looked();
  if (map) rig.orbitBy(...map);
  else rig.dolly(zoom);
});

// ---------------------------------------------------------------- options, from options.json
let optionData = null, panelUi = null;
const selected = {};
// options a feature demo is showing without choosing them (demos.js): the panel, the link and the summary keep `selected`
const demoShown = {};
const shownChoice = id => demoShown[id] ?? selected[id];
const optionOf = (groupId, optionId) => groupById(groupId).options.find(o => o.id === optionId);
const groupById = id => optionData.sections.flatMap(s => s.groups).find(g => g.id === id);

const EFFECTS = {
  color: e => { for (const n of Object.values(stage.current.parts).flat()) if (!Array.isArray(n.material) && n.material.name === e.material) n.material.color.set(e.value); },
  material: e => applyLook(stage.current, e.target, e.look),
  visible: e => {
    for (const [name, meshes] of Object.entries(stage.current.parts)) {
      if (e.part ? name === e.part : name.startsWith(e.prefix)) meshes.forEach(n => { n.visible = e.on; });
    }
  },
  addon: e => { setAddon(stage.current, e.id, e.on); stage.refreshCeiling(); },
  addonLook: e => setAddonLook(stage.current, e.id, e.look),
  light: e => {
    const p = { ...e };
    delete p.do;
    lighting.set(p);
  },
  glass: e => glass.set(e),
  blinds: e => {
    (stage.current.parts.cfg_blinds || []).forEach(n => {
      n.visible = e.level > 0;
      if (e.blackout !== undefined) n.material.color.set(e.blackout ? "#3c4145" : "#e9e4d8");
    });
    const node = stage.current.root.getObjectByName("cfg_blinds");
    if (node) node.scale.y = Math.max(0.001, e.level);
  },
  tv: e => setTv(stage.current, e),
  shade: e => setShade(stage.current, e.kind),
};

function runEffects(group, optionId) {
  if (optionId === "custom") {
    EFFECTS[group.custom.effect.do]({ ...group.custom.effect, value: selected[`${group.id}:custom`] });
    return;
  }
  for (const e of optionOf(group.id, optionId).effects) EFFECTS[e.do](e);
}

const allGroups = () => optionData.sections.flatMap(s => s.groups);

/** What depends on more than one choice, and colours for add-ons built since they were chosen. */
function settle() {
  syncPalms(stage.current, selected.palms === "on", selected.patio === "on");
  setShade(stage.current, selected.shade);
  for (const g of allGroups()) {
    if (selected[g.id] === "custom" || optionOf(g.id, selected[g.id])?.effects.some(e => e.do === "color" || e.do === "addonLook")) runEffects(g, selected[g.id]);
  }
  stage.renderer.shadowMap.needsUpdate = true;
}

/** Bring the room on show up to the current selections. */
function applyAll() {
  for (const g of allGroups()) runEffects(g, selected[g.id]);
  settle();
}

function setOption(groupId, optionId, custom) {
  endCompare();
  if (pacs.active) pacs.exit();
  endMode();
  endIdea();
  const group = groupById(groupId);
  if (custom !== undefined) selected[`${groupId}:custom`] = custom;
  selected[groupId] = optionId;
  runEffects(group, optionId);
  const also = optionId === "custom" ? null : optionOf(groupId, optionId).sets;
  for (const [g, o] of Object.entries(also || {})) {
    selected[g] = o;
    runEffects(groupById(g), o);
  }
  settle();
  relight();
  syncUi();
  const chosen = optionId === "custom" ? "custom colour" : optionOf(groupId, optionId).label;
  say(`${group.label}: ${chosen}.`);
}

/** A theme is a starting point: every option goes to its default, then the theme's choices. Anything can be changed afterwards. */
function themeSelections(theme) {
  const out = {};
  for (const g of allGroups()) out[g.id] = g.default;
  return Object.assign(out, theme.sets);
}

function applyTheme(id) {
  endCompare();
  if (pacs.active) pacs.exit();
  endMode();
  endIdea();
  const theme = optionData.themes.find(t => t.id === id);
  for (const k of Object.keys(selected)) delete selected[k];
  Object.assign(selected, themeSelections(theme));
  applyAll();
  relight();
  syncUi();
  say(`${theme.label} applied.`);
}

const currentTheme = () => optionData.themes.find(t => {
  const want = themeSelections(t);
  return allGroups().every(g => selected[g.id] === want[g.id]);
});

// ---------------------------------------------------------------- Suggest a room: the rules are in options.json, and resolved in profile.js
let idea = null; // the room idea just made, while it can still be compared or undone

function showSelections(next) {
  endMode();
  for (const k of Object.keys(selected)) delete selected[k];
  Object.assign(selected, next);
  applyAll();
  relight();
  syncUi();
}

function endIdea() {
  idea = null;
  $("profileBar").hidden = true;
}

function createProfileIdea(form) {
  endCompare();
  const result = resolveProfile(optionData, Object.fromEntries(new FormData(form).entries()));
  const before = { ...selected };
  showSelections(result.selections);
  idea = { before, after: { ...selected } };
  // measured, so this can't claim a change that didn't happen
  const changes = differences(optionData, before, idea.after);
  // one row for each reason, so a theme's ten changes don't repeat it ten times
  const byReason = new Map();
  const add = (why, line) => byReason.set(why, [...(byReason.get(why) || []), line]);
  for (const c of changes) add(result.why[c.group] || "Back to its usual setting for this starting look.", `${c.label}: ${c.to}`);
  for (const o of result.overruled) add(result.why[o.group], `Left out: ${optionLabel(optionData, o.group, o.wanted)}`);
  $("profileChanges").replaceChildren(...[...byReason].map(([why, lines]) => el("li", {}, el("strong", { textContent: lines.join(" · ") }), el("span", { textContent: why }))));
  $("profileSummary").textContent = changes.length ? `${changes.length} ${changes.length === 1 ? "change" : "changes"} from your room. It stays ${state.room}, and anything can still be changed.` : `The room already matches. It stays ${state.room}.`;
  const compare = $("profileCompare");
  compare.setAttribute("aria-pressed", "false");
  compare.disabled = $("profileUndo").disabled = !changes.length;
  $("profileBar").hidden = false;
  $("profile").close();
  if (matchMedia("(max-width: 820px)").matches) setSheet(true);
  $("panelBody").scrollTop = 0;
  say(`Room idea made, with ${changes.length} ${changes.length === 1 ? "change" : "changes"}.`);
}

$("profileCompare").addEventListener("click", e => {
  if (!idea) return;
  const showBefore = e.currentTarget.getAttribute("aria-pressed") !== "true";
  e.currentTarget.setAttribute("aria-pressed", String(showBefore));
  showSelections(showBefore ? idea.before : idea.after);
  say(showBefore ? "Showing the room before." : "Showing the room idea.");
});
$("profileUndo").addEventListener("click", () => {
  if (!idea) return;
  showSelections(idea.before);
  endIdea();
  say("Room idea undone.");
});

$("openProfile").addEventListener("click", () => $("profile").showModal());
$("closeProfile").addEventListener("click", () => $("profile").close());
$("profileForm").addEventListener("submit", e => {
  e.preventDefault();
  createProfileIdea(e.currentTarget);
});

function setDemoReadout() {
  const temp = Number($("demoTemp").value), humidity = Number($("demoHumidity").value);
  $("demoTempValue").textContent = `${temp} °C`;
  $("demoHumidityValue").textContent = `${humidity}%`;
  const tint = temp < 22 ? "#63aecd" : temp > 25 ? "#df9762" : "#4aaeb2";
  for (const mesh of stage.current?.parts.addon_comfortControl || []) {
    for (const mat of [mesh.material].flat()) if (mat?.name === "comfort_status") mat.color.set(tint);
  }
  invalidate();
}

// ---------------------------------------------------------------- the vocal-distress cue (vocal.js)
// SIMULATED. The sounds are the two demo buttons: nothing here asks for a microphone, records, stores or sends anything, and
// no alarm or device changes. The sensor's light changes and a notice asks the nurse to look in through the glass; the nurse decides.
let vocal = null; // the notice on show: { sound, level, room }
let groans = [];  // when each simulated groan was "heard", for the rule's count over the last minute
const sensorShown = () => selected.soundSensor === "on" && !!stage.current?.addons?.soundSensor?.visible;

/** The sensor's light and ring, for a level of notice or (with none) back to quiet green. */
function paintSensor(level) {
  const hex = level ? LEVELS[level].colour : QUIET;
  for (const mesh of stage.current?.parts.addon_soundSensor || []) {
    for (const mat of [mesh.material].flat()) {
      if (mat?.name === "sound_indicator") { mat.color.set(hex); mat.emissive.set(hex); }
      if (mat?.name === "sound_ring") { mat.emissive.set(level ? hex : "#000000"); mat.emissiveIntensity = level ? 0.9 : 0; }
      if (mat?.name === "sound_halo") { mat.color.set(hex); mat.opacity = level ? 0.34 : 0; }
    }
  }
  invalidate();
}

function simulateSound(sound) {
  if (pacs.active) pacs.exit(); // PACS borrows the same light, and hides the notice's place on the screen
  const status = $("systemStatus");
  if (!sensorShown()) {
    status.textContent = "The sound sensor is hidden, so nothing was heard. Show it under Sound-level indicator to try this.";
    say(status.textContent);
    return;
  }
  const now = Date.now();
  groans = groans.filter(t => now - t < 60000);
  if (sound === "groan") groans.push(now);
  const level = cueFor(sound, sound === "groan" ? groans.length : 0);
  if (!LEVELS[level]) {
    status.textContent = `Simulated: ${SOUNDS[sound]} was heard. The sensor waits to hear more before it tells anyone.`;
    say(status.textContent);
    return;
  }
  if (vocal?.level === "now" && level !== "now") { // a notice already asking for a look now is never downgraded
    status.textContent = `Simulated: ${SOUNDS[sound]} was heard too. The notice already asks for a look now.`;
    say(status.textContent);
    return;
  }
  vocal = { sound, level, room: state.room };
  const text = noticeFor(sound, level, rig.meta.isolation ? `Isolation room ${state.room}` : `Standard room ${state.room}`, clock(state.hour));
  $("vocalText").textContent = `${text.heard} ${text.ask}`;
  $("vocalMeta").textContent = text.meta;
  $("vocalNotice").dataset.level = level;
  $("vocalNotice").hidden = false;
  // the sensor's own card, where the sound may have been started, never covers the notice or its Acknowledge button
  const card = $("objectCard"), a = card.getBoundingClientRect(), b = restingRect($("vocalNotice"));
  if (!card.hidden && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) card.hidden = true;
  paintSensor(level);
  status.textContent = "Simulated: the sensor's light changed and a notice went to the nurse station. No audio was captured, and nothing left this page.";
  say(`Simulated notice at the nurse station. ${text.heard} ${text.ask}`);
}

/** Take the notice down and put the sensor's light back: on Acknowledge, and whenever the room or the sensor it names goes away. */
function endVocalCue(why = "") {
  if (!vocal) return;
  vocal = null; groans = [];
  $("vocalNotice").hidden = true;
  paintSensor(null);
  if (why) { $("systemStatus").textContent = why; say(why); }
}

$("demoTemp").addEventListener("input", setDemoReadout);
$("demoHumidity").addEventListener("input", setDemoReadout);
for (const b of document.querySelectorAll(".demo-sounds button[data-sound]")) b.addEventListener("click", () => simulateSound(b.dataset.sound));
$("vocalAck").addEventListener("click", () => {
  endVocalCue("Acknowledged. The sensor's light is green again. Nothing was recorded.");
  canvas.focus({ preventScroll: true });
});
$("closeObjectCard").addEventListener("click", () => closeCard());
$("objectAction").addEventListener("click", e => {
  const handler = ACTION_HANDLERS[e.currentTarget.dataset.action];
  if (handler) {
    handler.run(e.currentTarget);
  } else if (e.currentTarget.dataset.action.startsWith("apis:")) {
    apis.open(e.currentTarget.dataset.action.slice(5));
  } else if (e.currentTarget.dataset.action === "pacs") {
    pacs.open();
  } else if (e.currentTarget.dataset.action.startsWith("placed:")) {
    const found = placement.find(Number(e.currentTarget.dataset.action.slice(7)));
    if (found) turnPlaced(found.entry, 45);
  }
});
$("objectAction2").addEventListener("click", e => {
  const handler = ACTION_HANDLERS[e.currentTarget.dataset.action];
  if (handler) { handler.run(e.currentTarget); return; }
  const found = placement.find(Number(e.currentTarget.dataset.action.slice(7)));
  if (found) removePlaced(found.entry);
});

function syncUi() {
  if (vocal && !sensorShown()) endVocalCue("The sound sensor was hidden, so its notice was taken down.");
  panelUi?.sync(selected, state.room);
  const theme = currentTheme();
  $("themes").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === theme?.id)));
  $("themeNote").textContent = theme ? theme.blurb : "Your own combination. Choose a theme to start again from it.";
  if (features?.on) refreshExplore(); // a choice can add, move or swap what Explore marks
  remember();
}

// ---------------------------------------------------------------- sharing: the room is in the URL
// while today's room is showing for comparison, or a feature demo runs, the link and summary stay with the visitor's own design
const specCode = () => (compare ? compare.code : demo ? demo.snap.code : encodeSpec(optionData, state, selected, encodePlaced(placement.list(state.room))));
let rememberTimer = 0;
function remember() {
  if (!optionData || !window.__configReady) return;
  // not on every slider event: Safari refuses more than 100 replaceState calls in 30 seconds
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => history.replaceState(null, "", `#c=${specCode()}`), 250);
}

async function applySpec(spec) {
  endCompare();
  if (pacs.active) pacs.exit();
  endMode();
  endIdea();
  for (const k of Object.keys(selected)) delete selected[k];
  Object.assign(selected, spec.selected);
  state.hour = spec.hour;
  state.view = spec.view;
  placement.set(spec.room, decodePlaced(spec.placed));
  if (spec.room !== state.room || !stage.current) await setRoom(spec.room);
  else { placement.show(stage.current); applyAll(); rig.go(spec.view, { instant: true }); }
  setTime(spec.hour);
  syncUi();
}

/** What to say when a link asked for options that aren't offered any more. */
const leftOut = labels => {
  const list = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0];
  return `This link included ${list}, which the configurator no longer offers, so ${labels.length > 1 ? "they're" : "it's"} left out.`;
};

// ---------------------------------------------------------------- saved rooms, in this browser only (presets.js)
const presetSay = text => { $("presetStatus").textContent = text; };
function renderPresets() {
  $("presetList").replaceChildren(...readPresets().map(p => {
    const load = el("button", { type: "button", textContent: "Open" }), drop = el("button", { type: "button", textContent: "Delete" });
    load.setAttribute("aria-label", `Open ${p.name}`);
    drop.setAttribute("aria-label", `Delete ${p.name}`);
    load.addEventListener("click", () => openPreset(p));
    drop.addEventListener("click", () => {
      const left = deletePreset(p.name);
      renderPresets();
      presetSay(left ? `Deleted “${p.name}”.` : "This browser won't let the page change its saved rooms.");
    });
    return el("li", {}, el("span", { className: "name", textContent: p.name, title: p.name }), load, drop);
  }));
}
function openPreset(p) {
  const spec = decodeSpec(optionData, `#c=${p.code}`);
  if (!spec) { presetSay(`“${p.name}” can't be read any more, so the room is unchanged.`); return; }
  applySpec(spec).then(() => {
    presetSay(spec.dropped.length ? `Opened “${p.name}”. ${leftOut(spec.dropped)}` : `Opened “${p.name}”.`);
    say(`Opened ${p.name}.`);
  }).catch(fail);
}
$("presetForm").addEventListener("submit", e => {
  e.preventDefault();
  const input = $("presetName"), name = input.value.trim().replace(/\s+/g, " ") || `Saved room ${readPresets().length + 1}`;
  const r = savePreset(name, specCode());
  if (r.ok) { input.value = ""; renderPresets(); presetSay(r.replaced ? `Updated “${name}”.` : `Saved “${name}” in this browser.`); }
  else presetSay(r.reason === "full" ? `There are already ${MAX_PRESETS} saved rooms. Delete one to save another.` : "This browser won't let the page save rooms, so nothing was saved.");
});
$("resetRoom").addEventListener("click", () => {
  endCompare();
  if (pacs.active) pacs.exit();
  endIdea();
  placement.set(state.room, []);
  placement.show(stage.current);
  showSelections(Object.fromEntries(allGroups().map(g => [g.id, g.default]))); // also ends any room mode
  modes.leave();
  presetSay("The room is back to its defaults, with no placed items. The view and the time stay as they were.");
  say("Room reset.");
});

function shareLink() { return `${location.origin}${location.pathname}#c=${specCode()}`; }

// ---------------------------------------------------------------- summary and saving a picture
const captureBlob = () => new Promise(done => { stage.draw(); canvas.toBlob(done, "image/png"); });

async function saveImage() {
  const url = URL.createObjectURL(await captureBlob());
  const a = Object.assign(document.createElement("a"), { href: url, download: `icu-room-${state.room}-${specCode()}.png` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function openSummary() {
  endCompare(); // the summary is of the visitor's own room
  const dialog = $("summary");
  const picture = URL.createObjectURL(await captureBlob());
  const roomLabel = rig.meta.isolation ? `Isolation room ${state.room}, with ante room and toilet` : `Standard room ${state.room}`;
  const body = summaryContent(optionData, selected, state.room, { roomLabel, picture, code: specCode(), theme: currentTheme()?.label, placed: placement.list(state.room).map(p => itemById(p.type).label) });
  $("summaryBody").replaceChildren(body);
  $("copyStatus").textContent = "";
  dialog.showModal();
  dialog.addEventListener("close", () => URL.revokeObjectURL(picture), { once: true });
}

$("openSummary").addEventListener("click", () => openSummary().catch(fail));
$("saveImage").addEventListener("click", () => saveImage().catch(fail));
$("saveImage2").addEventListener("click", () => saveImage().catch(fail));
$("closeSummary").addEventListener("click", () => $("summary").close());
$("copyLink").addEventListener("click", async () => {
  const msg = $("copyStatus");
  try {
    await navigator.clipboard.writeText(shareLink());
    msg.textContent = "Link copied.";
  } catch {
    msg.textContent = shareLink(); // no clipboard here: show it, to copy by hand
  }
});
$("themes").addEventListener("click", e => { const b = e.target.closest("button"); if (b) applyTheme(b.dataset.value); });
addEventListener("hashchange", () => {
  const spec = decodeSpec(optionData, location.hash);
  if (spec && specCode() !== location.hash.slice(3)) applySpec(spec).then(() => { if (spec.dropped.length) $("roomStatus").textContent = leftOut(spec.dropped); }).catch(fail);
});

// ---------------------------------------------------------------- the cinematic tour
const tour = {
  // starts and ends on the whole room. If the camera is already there, the first stop is a move to where it stands, which still arrives
  order: ["dollhouse", "overview", "entrance", "family", "bed", "bed_window", "window", "dollhouse"], at: -1, timer: 0, log: [],
  get running() { return this.at >= 0; },
  toggle() { if (this.running) this.stop(); else this.start(); },
  start() { this.at = -1; this.log = []; this.mark(true); this.at = 0; this.step(); },
  step() { const name = this.order[this.at]; this.log.push(name); rig.go(name); },
  arrived() {
    if (!this.running) return;
    clearTimeout(this.timer);
    // reduced motion cuts between views, so each one stays up long enough to take in
    this.timer = setTimeout(() => {
      if (!this.running) return;
      this.at += 1;
      if (this.at >= this.order.length) this.stop(); else this.step();
    }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 3000 : 1400);
  },
  stop() { clearTimeout(this.timer); this.at = -1; this.mark(false); remember(); },
  mark(on) { const b = $("tour"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "Stop tour" : "Cinematic tour"; },
};
// anything the person does with the view ends the tour, and pauses the guided one. Once the guided tour has finished, taking
// the room in hand is what its ending asks for, so the ending's card goes
canvas.addEventListener("pointerdown", () => { if (tour.running) tour.stop(); guide?.pause(); guide?.close(); });
canvas.addEventListener("wheel", () => { if (tour.running) tour.stop(); }, { passive: true });
canvas.addEventListener("keydown", () => { if (tour.running) tour.stop(); });

// APIS owns a reversible inspection camera and separate schematic detail scene.
// Room options, profile answers, share codes and original model meshes stay independent.
const apis = new APIS({ stage, rig, controls, invalidate, stopTour: () => tour.stop() });
const pacs = new PACS({ stage, lighting, rig, controls, relight, invalidate,
  stopTour: () => tour.stop(), getState: () => state, isDark: () => afterDark(),
  closeApis: () => { endVocalCue(); endCompare(); endMode(); setExplore(false); const enabled = apis.enabled; if (apis.active) { apis.dialog.close(); apis.restore(); } apis.setEnabled(false); return enabled; },
  restoreApisMarkers: on => apis.setEnabled(on),
});
apis.beforeOpen = () => { endDemo(); setExplore(false); if (pacs.active) pacs.exit(); };
pacs.restoreViewState = name => { state.view = name; syncViews(); remember(); describe(); };

// ---------------------------------------------------------------- room modes: scenes over the configured room (modes.js)
const modeApi = {
  baseLight: () => lighting.base(state.hour),
  isDark: () => afterDark(),
  setLight: (look, task) => { lighting.scene = look; lighting.sceneTask = task; relight(); },
  blindsNow: () => {
    const node = stage.current?.root.getObjectByName("cfg_blinds");
    return node && (stage.current.parts.cfg_blinds || []).some(n => n.visible) ? node.scale.y : 0;
  },
  configuredBlinds: () => optionOf("blinds", shownChoice("blinds"))?.effects.find(e => e.do === "blinds")?.level ?? 0,
  setBlinds: level => { EFFECTS.blinds({ level }); stage.renderer.shadowMap.needsUpdate = true; invalidate(); },
  // a mode lays itself over what the room shows: its choices, or what a feature demo is showing in their place
  restore: ids => { for (const id of ids) runEffects(groupById(id), shownChoice(id)); stage.renderer.shadowMap.needsUpdate = true; invalidate(); },
  screens: on => {
    if (!on) setTv(stage.current, { playing: false });
    // the digital aquarium's picture; its dark case stays, like a screen that's off
    stage.current.addons?.digital?.traverse(n => { if (n.isMesh && n.material?.isMeshBasicMaterial && n.material.map) n.visible = on; });
    invalidate();
  },
  glassClear: () => { glass.set({ mode: "clear", opaque: false }); EFFECTS.visible({ part: "cfg_curtain", on: false }); },
  // only smart glass changes: a clear front has its curtain, and a blinds front its slats, closed already
  glassPrivate: () => { if (shownChoice("front") === "smart") glass.set({ opaque: true }); },
  overlay: on => { clinicalByMode = on; syncClinical(); },
  beforeChange: () => { if (pacs.active) pacs.exit(); },
  changed: name => syncModes(name),
};
const modes = new RoomModes(modeApi);
function syncModes(name) {
  $("modeBar").querySelectorAll("button[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === name)));
  const note = $("modeNote"), text = modeText(name, modes.dark);
  note.replaceChildren();
  if (name !== "emergency" && text.note) {
    note.append(text.note);
    if (text.why) note.append(Object.assign(document.createElement("span"), { className: "mode-why", textContent: text.why }));
  }
  note.hidden = !note.textContent;
  $("modeBanner").hidden = name !== "emergency";
  document.body.classList.toggle("emergency-ready", name === "emergency");
  say(text.say);
  invalidate();
}
/** Something is about to change the room's design: a mode would hide that, so it ends first. */
function endMode() {
  if (!modes.leave()) return;
  $("modeNote").textContent = "The mode ended and the room is back to As set, because its design changed.";
  $("modeNote").hidden = false;
}
$("modeBar").addEventListener("click", e => {
  const b = e.target.closest("button[data-mode]");
  if (b) { endCompare(); modes.set(b.dataset.mode); }
});
$("leaveEmergency").addEventListener("click", () => modes.exitEmergency());

// ---------------------------------------------------------------- Equipment labels and keep-clear areas (clinical.js)
function syncClinical() {
  const on = clinicalByHand || clinicalByMode, was = clinical.on;
  if (stage.current) clinical.set(on, stage.current);
  $("clinicalToggle").setAttribute("aria-pressed", String(on));
  $("clinicalNote").hidden = !on;
  invalidate();
  if (on !== was) say(on ? `Equipment labels on: ${clinical.fixed.length} pieces of equipment labelled, with keep-clear areas around the bed.` : "Equipment labels off.");
}
$("clinicalToggle").addEventListener("click", () => {
  // a mode that turned it on is overruled by hand until the mode changes
  const on = !(clinicalByHand || clinicalByMode);
  clinicalByHand = on;
  if (!on) clinicalByMode = false;
  syncClinical();
});

const OBJECT_DETAILS = {
  cfg_kit_bed: ["Adjustable ICU bed", "A modeled patient bed with a raised backrest, side rails, mattress, and bedding."],
  cfg_kit_pendant: ["Ceiling service pendant", "A visual equipment pendant with shelves and service outlets."],
  cfg_kit_monitor: ["Patient monitor", "A modeled bedside monitor. Its display is illustrative and is not connected to a patient."],
  cfg_kit_pumps: ["Infusion pumps", "Visual pump units mounted at the bedside. They are not functional medical equipment."],
  cfg_kit_ventilator: ["Ventilator model", "A static equipment model for room layout visualization; it does not provide ventilation."],
  cfg_kit_iv_pole: ["IV pole", "A mobile pole shown as part of the room layout concept."],
  cfg_kit_recliner: ["Patient recliner", "A visitor or recovery chair shown as a furniture concept."],
  cfg_kit_visitor_chair: ["Visitor chair", "A chair for a family member or visitor."],
  cfg_kit_overbed_table: ["Over-bed table", "A movable bedside table for personal items and meals."],
  cfg_kit_exam_light: ["Examination light", "A ceiling-mounted examination light model."],
  cfg_feature_wall: ["Feature wall", "A customizable finish panel behind the bed."],
  cfg_tv: ["Television", "A wall-mounted television concept. The sample animation is original placeholder content."],
  cfg_tv_screen: ["Television screen", "A display surface for the room's placeholder animation."],
  cfg_curtain: ["Privacy curtain", "A curtain concept at the glazed room front."],
  cfg_blinds: ["Window blinds", "Adjustable blinds at the outside window."],
  cfg_floor: ["Room flooring", "The configurable resilient floor surface shown in this design proposal."],
  cfg_paint_walls: ["Room walls", "The room wall finish can be changed in the Walls section."],
  cfg_ceiling: ["Ceiling", "The room ceiling and its lighting layout."],
  cfg_panels: ["Ceiling light panel", "A modeled ceiling light panel; the lighting scheme controls the room's lighting."],
  cfg_front_frame: ["Glazed room front", "The room-front frame and glazing concept."],
};

// ---------------------------------------------------------------- feature cards (features.json, features.js, highlight.js)
let features = null; // the registry against the room on show, once features.json has loaded
const highlight = new Highlight();
let cardOpener = null, cardFromSheet = false; // where focus goes back to when the card closes, and whether a phone's sheet was open

/** The card buttons a feature names in `actions` (demos.js lists them): what each says, and what it does. */
const ACTION_HANDLERS = {
  wardrobe: {
    label: () => (stage.current.addons?.wardrobe?.userData.side ? "Close cabinet" : "Open cabinet"),
    run: b => { const open = toggleWardrobe(stage.current); b.textContent = open ? "Close cabinet" : "Open cabinet"; invalidate(); say(open ? "The cabinet's left door slides open." : "The cabinet's doors close."); },
  },
  // Learn about this design: the card's own How it works, opened and brought into view
  "wardrobe:learn": {
    label: () => "Learn about this design",
    run: () => { const how = $("featureHow"); how.open = true; how.scrollIntoView({ block: "nearest" }); how.querySelector("summary").focus({ preventScroll: true }); },
  },
  "sound:call": { label: () => "Simulate a call for help", run: () => simulateSound("call") },
  "sound:groan": { label: () => "Simulate a groan", run: () => simulateSound("groan") },
};
// "demo:<id>": another of the feature's demos, such as the wardrobe's compartments, under the label that demo gives
for (const a of ACTIONS) if (a.startsWith("demo:")) ACTION_HANDLERS[a] = { label: () => DEMOS[a.slice(5)].label, run: () => startDemo($("objectCard").dataset.feature, a.slice(5)).catch(err => window.__configErrors.push(String(err))) };
for (const a of ACTIONS) if (!ACTION_HANDLERS[a]) window.__configErrors.push(`No handler for the card action ${a}`);

const optionName = (group, id) => optionOf(group, id)?.label ?? id;
/** A line on a feature's card about the room on show: is it on here, and what does it read. Simulated, like the rest. */
const FEATURE_STATUS = {
  circadian: () => (selected.scheme === "circadian" ? "In this room: on." : `In this room: the lighting is ${optionName("scheme", selected.scheme).toLowerCase()}. Choose Circadian under Lighting, or see it in action.`),
  privacy: () => `In this room: the glazed front is ${optionName("front", selected.front).toLowerCase()}.`,
  orientation: () => (selected.tvplay === "orientation" ? "In this room: on." : `In this room: the TV is ${optionName("tvplay", selected.tvplay).toLowerCase()}.`),
  tvScene: () => (selected.tvplay === "on" ? "In this room: on." : `In this room: the TV is ${optionName("tvplay", selected.tvplay).toLowerCase()}.`),
  skyCeiling: () => (selected.ceiling === "sky" ? "In this room: on." : "In this room: the ceiling is plain."),
  digitalAquarium: () => (selected.aquarium === "digital" ? "In this room: on." : `In this room: ${selected.aquarium === "none" ? "no aquarium" : "the sealed tank instead"}.`),
  biophilicPanel: () => { const n = placement.list(state.room).filter(p => p.type === "leafpanel").length; return n ? `In this room: ${n} placed.` : "In this room: none placed yet."; },
  wardrobe: () => { const side = stage.current?.addons?.wardrobe?.userData.side; return selected.wardrobe === "on" ? `In this room: ${side ? `the ${side} side is open` : "doors closed"}.` : "In this room: off. Turn it on under Furniture and bathroom."; },
  soundSensor: () => (selected.soundSensor === "on" ? "" : "In this room: hidden. Show it under Sound-level indicator."),
  comfortControl: () => `SIMULATED readout: ${$("demoTempValue").textContent}, ${$("demoHumidityValue").textContent}.`,
  daylightSensor: () => { const e = daylight.elevation; return `Now: the sun is ${Math.abs(e).toFixed(0)}° ${e >= 0 ? "above" : "below"} the horizon at ${clock(state.hour)}, so ${afterDark() ? "it's after sunset" : "it's daylight"}.`; },
};

const link = s => Object.assign(document.createElement("a"), { href: s.url, textContent: s.label, target: "_blank", rel: "noopener noreferrer" });
/** Sources from options.json, named as a group ("palms") or one of its options ("front:smart"), so a source lives in one place. */
function sourcesOf(ref) {
  if (!ref) return [];
  const [g, o] = ref.split(":");
  return (o ? optionOf(g, o)?.note?.sources : groupById(g)?.note?.sources) || [];
}

/** Fill the card's feature parts, or hide them for an object that isn't a feature. */
function fillFeature(f) {
  const facts = $("featureFacts"), how = $("featureHow");
  $("objectKicker").textContent = !f ? "Selected object" : f.parent ? `Part of ${features.get(f.parent).name}` : `Feature · ${features.groupLabel(f.group)}`;
  const status = f ? FEATURE_STATUS[f.id]?.() || "" : "";
  $("featureStatus").textContent = status;
  $("featureStatus").hidden = !status;
  how.hidden = !f?.how;
  how.open = false; // short text first: How it works is there to open
  $("featureHowText").textContent = f?.how || "";
  const rows = f ? [["Benefit", f.benefit], ["Awake", f.awake], ["Sedated", f.sedated], ["Limits", f.limits]].filter(([, t]) => t) : [];
  facts.replaceChildren(...rows.flatMap(([k, t]) => [el("dt", { textContent: k }), el("dd", { textContent: t })]));
  facts.hidden = !rows.length;
  const ev = $("featureEvidence");
  ev.replaceChildren();
  if (f) {
    ev.append(el("span", { className: "evidence-label", textContent: "Evidence " }), f.evidence.text);
    if (f.evidence.strength) ev.append(" ", el("span", { className: "evidence-strength", textContent: `(${f.evidence.strength})` }));
    const s = sourcesOf(f.evidence.sourcesFrom);
    if (s.length) { ev.append(" "); s.forEach((src, i) => { ev.append(link(src)); if (i < s.length - 1) ev.append("; "); }); }
  }
  ev.hidden = !f;
  const demoButton = $("featureDemo");
  demoButton.hidden = !f?.demo;
  demoButton.textContent = f?.demoLabel || "See it in action";
  demoButton.dataset.demo = f?.demo || "";
  // a feature with more than two actions lists them in a short menu, so the card stays one row of buttons
  const menu = $("featureMenu"), acts = f?.actions || [];
  menu.hidden = $("featureMenuToggle").hidden = acts.length <= 2;
  $("featureMenuToggle").setAttribute("aria-expanded", "false");
  $("featureMenuList").hidden = true;
  $("featureMenuList").replaceChildren(...(acts.length > 2 ? acts : []).map(a => {
    const b = el("button", { type: "button", className: "outline-action", textContent: ACTION_HANDLERS[a].label() });
    b.dataset.action = a;
    return b;
  }));
}

/** opener: where focus goes back to when the card closes; by default whatever has focus as it opens. */
function showObjectCard(info, x, y, opener = document.activeElement) {
  const card = $("objectCard"), action = $("objectAction"), action2 = $("objectAction2");
  const f = info.feature ? features.get(info.feature) : null;
  if (!card.contains(opener)) cardOpener = opener;
  card.dataset.feature = f?.id || "";
  fillFeature(f);
  $("objectTitle").textContent = f ? f.name : info.title;
  const text = f ? features.text(f, "purpose") : info.description;
  $("objectDescription").textContent = text;
  action.hidden = !info.action;
  action.dataset.action = info.action || "";
  // a placed item: turn it (on the floor) and remove it, by button or, with the card focused, by key
  const placedEntry = info.action?.startsWith("placed:") ? placement.find(Number(info.action.slice(7)))?.entry : null;
  card.dataset.placed = placedEntry ? String(placedEntry.uid) : "";
  action2.hidden = !placedEntry;
  action2.dataset.action = info.action || "";
  if (placedEntry) {
    const onFloor = itemById(placedEntry.type).on === "floor";
    action.hidden = !onFloor;
    action.textContent = "Turn 45°";
    action2.textContent = "Remove";
    $("objectDescription").textContent = `${f ? `${text} ${CHECK}` : text} Drag it to move it. With this card focused, the arrow keys move it${onFloor ? ", R turns it" : ""} and Delete removes it.`;
  } else if (f) {
    const acts = f.actions || [], few = acts.length <= 2;
    for (const [b, a] of [[action, few ? acts[0] : null], [action2, few ? acts[1] : null]]) {
      b.hidden = !a; b.dataset.action = a || "";
      if (a) b.textContent = ACTION_HANDLERS[a].label();
    }
  }
  // a card that cites a source: the same links as the option note it names, so a source lives in one place, options.json
  // a card with a short table: rows from a named block of options.json, in the column for this kind of room where the block
  // has one. The comfort control's clean-air rows are the same list as the ventilation plan's, and the block's link leads to
  // the basis there; the sound sensor's are the limits of the vocal-distress cue
  const rowsFrom = f ? f.rowsFrom : info.rowsFrom, sourcesFrom = f ? f.sourcesFrom : info.sourcesFrom;
  const table = rowsFrom ? optionData[rowsFrom] : null, kind = rig.meta.isolation ? "isolation" : "patient";
  $("objectRowsTitle").textContent = table ? table.titles?.[kind] ?? table.title : "";
  $("objectRows").replaceChildren(...(table?.rows || []).flatMap(r => [el("dt", { textContent: r.label }), el("dd", { textContent: r[kind] ?? r.text })]));
  $("objectRowsTitle").hidden = $("objectRows").hidden = !table;
  const sources = table?.sources || (sourcesFrom ? groupById(sourcesFrom)?.note?.sources || [] : []);
  $("objectSources").replaceChildren(...sources.map(link));
  $("objectSources").hidden = !sources.length;
  if (!f) {
    if (info.action === "wardrobe") action.textContent = ACTION_HANDLERS.wardrobe.label();
    else if (info.action === "soundCue") { // the sensor's two simulated sounds, as in the Comfort systems section
      action.textContent = "Simulate a call for help"; action.dataset.action = "sound:call";
      action2.textContent = "Simulate a groan"; action2.dataset.action = "sound:groan"; action2.hidden = false;
    }
    else if (info.action?.startsWith("apis:")) action.textContent = "Inspect attachment in APIS";
    else if (info.action === "pacs") action.textContent = "Physiological Adaptive Mode";
  }
  card.hidden = false;
  card.scrollTop = 0;
  placeCard(card, x, y);
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
  // the feature whose card is open stays outlined, in place of the one under the pointer
  setHover(null);
  if (f) highlight.show("card", features.objects(f.id)); else highlight.clear("card");
  invalidate();
}

/**
 * Put the card by the point it was opened from, clear of the options panel (or PACS's), of the room-mode bar and of every
 * notice above the room. If there isn't room for all of it, it scrolls.
 */
let cardAt = { x: 24, y: 24 }; // where the card was opened from, to fit it again when it grows
function placeCard(card, x, y) {
  cardAt = { x, y };
  card.style.maxHeight = "";
  const rect = card.getBoundingClientRect(), panelRect = pacs.active ? restingRect($("pacsPanel")) : panel.getBoundingClientRect();
  const phone = matchMedia("(max-width: 820px)").matches;
  let left = x + 14, top = y + 14;
  if (left + rect.width > panelRect.left && x < panelRect.left) left = Math.max(12, panelRect.left - rect.width - 12);
  if (left + rect.width > innerWidth - 12) left = innerWidth - rect.width - 12;
  left = Math.max(12, left);
  // the bar and the notices sit at the top left: a card that would overlap any of them goes below the lowest it meets
  const above = [...$("hud").children].filter(n => !n.hidden && n.offsetParent).map(n => restingRect(n)).filter(r => r.width && left < r.right && left + rect.width > r.left);
  const floor = above.reduce((m, r) => Math.max(m, r.bottom), 0);
  const bottom = phone && panelRect.height ? panelRect.top - 10 : innerHeight - 12;
  if (top < floor + 10) top = floor + 10;
  if (top + rect.height > bottom) top = Math.max(floor + 10, bottom - rect.height);
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  if (top + rect.height > bottom) card.style.maxHeight = `${Math.max(140, bottom - top)}px`;
}

/** Close the card and give focus back to whatever opened it: the room, a marker, or the button in the Features list. */
function closeCard() {
  const card = $("objectCard");
  if (card.hidden) return;
  card.hidden = true;
  const back = cardOpener?.isConnected && cardOpener !== document.body && !cardOpener.closest("[hidden]") ? cardOpener : canvas;
  cardOpener = null;
  if (cardFromSheet && isPhone()) setSheet(true);
  cardFromSheet = false;
  back.focus({ preventScroll: true });
}
// however the card goes (its close button, Esc, a click on nothing, a placed item removed), its outline goes with it
new MutationObserver(() => { if ($("objectCard").hidden && highlight.clear("card")) invalidate(); }).observe($("objectCard"), { attributes: true, attributeFilter: ["hidden"] });

/** Open an entry's card: by its object if that's on screen, otherwise beside the panel. */
function openFeature(id, from) {
  const at = features.anchor(id);
  let x = 24, y = 24;
  if (at) {
    const p = at.clone().project(stage.camera), sx = ((p.x + 1) / 2) * innerWidth, sy = ((1 - p.y) / 2) * innerHeight;
    if (p.z < 1 && sx > 0 && sx < rig.visible.w && sy > 0 && sy < innerHeight) { x = sx; y = sy; }
  }
  // on a phone the open sheet would leave the card no room: it closes, and opens again when the card does
  cardFromSheet = isPhone() && !!from && panel.contains(from) && panel.classList.contains("open");
  if (cardFromSheet) setSheet(false);
  const f = features.get(id), placedOne = f.objects.some(o => o.startsWith("placed:")) ? features.objects(id)[0] : null;
  const action = placedOne?.userData.itemInfo?.action;
  showObjectCard({ feature: id, ...(action ? { action } : {}) }, x, y, from || document.activeElement);
}

// ---------------------------------------------------------------- hover: on a desktop, the feature under the pointer is outlined
const hoverable = matchMedia("(hover: hover) and (pointer: fine)");
let hoverAt = null, hoverId = null, hoverQueued = false;
canvas.addEventListener("pointermove", e => {
  if (!features || !hoverable.matches || e.pointerType !== "mouse") return;
  hoverAt = e.buttons ? null : [e.clientX, e.clientY];
  if (!hoverQueued) { hoverQueued = true; requestAnimationFrame(hoverCheck); }
});
canvas.addEventListener("pointerleave", () => { hoverAt = null; setHover(null); });
function hoverCheck() {
  hoverQueued = false;
  if (!hoverAt || !stage.current || placing || moving || apis.active || pacs.active || rig.tween || document.body.classList.contains("dragging-item")) { setHover(null); return; }
  const hit = nearestSolid(rayAt(...hoverAt));
  setHover(hit ? features.at(hit.object)?.id ?? null : null);
}
/** One draw per change: nothing is drawn while the pointer moves within the same feature, or over nothing. */
function setHover(id) {
  if (id === hoverId) return;
  hoverId = id;
  canvas.classList.toggle("over-feature", !!id);
  const open = $("objectCard").hidden ? "" : $("objectCard").dataset.feature;
  if (id && id !== open) highlight.show("hover", features.objects(id)); else highlight.clear("hover");
  invalidate();
}

// ---------------------------------------------------------------- Explore features: every registered object marked, by group
function setExplore(on, filter) {
  if (!features || (on === features.on && filter === undefined)) return;
  features.set(on, filter === undefined ? features.filter : filter);
  syncExplore();
  if (on) say(`Explore features on: ${features.marked().length} features marked${features.filter ? `, ${features.groupLabel(features.filter)} only` : ""}. Click a mark for its card.`);
  else say("Explore features off.");
}
function syncExplore() {
  if (!features) return;
  const on = features.on;
  $("exploreToggle").setAttribute("aria-pressed", String(on));
  $("exploreFilters").hidden = !on;
  if (on) {
    const groups = features.groupsHere();
    if (features.filter && !groups.some(g => g.id === features.filter)) features.filter = null;
    $("exploreFilters").replaceChildren(...[{ id: "", label: "All" }, ...groups].map(g => {
      const b = el("button", { type: "button", textContent: g.label });
      b.dataset.group = g.id;
      b.setAttribute("aria-pressed", String((features.filter || "") === g.id));
      return b;
    }));
  }
  refreshExplore();
}
/** The markers and soft outlines, for the room as it is now. */
function refreshExplore() {
  if (!features) return;
  features.refresh();
  if (features.on) highlight.show("explore", features.marked().flatMap(f => features.objects(f.id)), "soft");
  else highlight.clear("explore");
  invalidate();
}
$("exploreToggle").addEventListener("click", () => setExplore(!features.on));
$("exploreFilters").addEventListener("click", e => {
  const b = e.target.closest("button[data-group]");
  if (b) setExplore(true, b.dataset.group || null);
});

// ---------------------------------------------------------------- See it in action: a feature's demo (demos.js)
// An overlay, like a room mode: options are shown, not chosen (demoShown), the link and summary stay as they were, and
// when it ends the room goes back exactly. It never runs during Emergency-ready, and starting one ends any room mode for
// as long as it runs.
var demo = null; // { id, feature, steps, at, token, timer, snap, opener }
const demoSay = text => { $("demoText").textContent = text; say(text); };

function cameraPose() { return { view: state.view, pos: stage.camera.position.clone(), target: controls.target.clone(), hfov: rig.hfov }; }
function restorePose(p) {
  rig.go(p.view, { instant: true });
  stage.camera.position.copy(p.pos);
  controls.target.copy(p.target);
  rig.hfov = p.hfov; rig.fit();
  stage.camera.lookAt(p.target);
  controls.update();
  invalidate();
}
/**
 * Where to stand to see objects: straight in front of the first, along the way it faces (a wall item's front faces into
 * the room), far enough back to take in their width and height, and never past the room's walls.
 */
function framePose(objects) {
  const box = new THREE.Box3();
  objects.forEach(o => box.expandByObject(o));
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), m = rig.meta;
  const dir = new THREE.Vector3(0, 0, 1).transformDirection(objects[0].matrixWorld).setY(0);
  if (dir.lengthSq() < 0.25) { const mid = W2T((m.room[0] + m.room[2]) / 2, (m.room[1] + m.room[3]) / 2, 0); dir.set(mid.x - c.x, 0, mid.z - c.z); }
  dir.normalize();
  const tan = deg => Math.tan(THREE.MathUtils.degToRad(deg / 2));
  // with room to spare: the panel and the bar above the room cover some of the view
  const want = Math.max(2.4, (Math.hypot(size.x, size.z) / 2) / tan(rig.hfov) * 1.6, (Math.min(size.y, 2.4) / 2) / tan(stage.camera.fov) * 1.6);
  const inRoom = p => p.x > m.room[0] + 0.35 && p.x < m.room[2] - 0.35 && -p.z > m.room[1] + 0.35 && -p.z < m.room[3] - 0.35;
  let dist = 0.6;
  for (let d = 0.6; d <= want + 1e-6; d += 0.1) { if (!inRoom(c.clone().addScaledVector(dir, d))) break; dist = d; }
  const eye = c.clone().addScaledVector(dir, dist);
  eye.y = Math.min(m.ceiling - 0.3, 1.6);
  return { eye, target: new THREE.Vector3(c.x, Math.min(c.y, 1.4), c.z) };
}

const demoApi = {
  option: (group, id) => {
    const g = groupById(group);
    for (const [gid, oid] of [[group, id], ...Object.entries(optionOf(group, id).sets || {})]) {
      demoShown[gid] = oid;
      runEffects(groupById(gid), oid);
    }
    if (g) { settle(); relight(); refreshExplore(); }
  },
  time: stop => setTime(STOPS[stop]),
  mode: name => modes.set(name),
  camera: name => { if (rig.meta.cameras[name] && state.view !== name) rig.go(name); },
  frame: id => {
    const objs = features.objects(id);
    if (!objs.length) return;
    if (state.view === "dollhouse" || state.view === "patient") rig.go("overview", { instant: true });
    const { eye, target } = framePose(objs);
    rig.goTo(eye, target);
  },
  wardrobe: side => {
    const w = stage.current.addons?.wardrobe, want = side === true ? "left" : side || null;
    if (w && w.userData.side !== want) { setWardrobe(stage.current, want); invalidate(); if (features.on) refreshExplore(); }
  },
  outline: id => { highlight.show("demo", features.objects(id)); invalidate(); },
  oldWardrobe: on => { setOldWardrobe(stage.current, on); invalidate(); },
  /** The two wardrobes' floor areas and heights, from their models, as a sentence. */
  figures: () => {
    const f = wardrobeFigures(stage.current);
    if (!f) return "";
    const m = n => (n + 1e-9).toFixed(2), diff = f.now.area - f.before.area; // 1.355 is stored just under itself, and should read 1.36
    const size = x => `${m(x.width)} by ${m(x.depth)} m`;
    return `It took ${m(f.before.area)} m² of floor (${size(f.before)}), and this one takes ${m(f.now.area)} m² (${size(f.now)}): ${Math.abs(diff) < 0.005 ? "the same" : `${m(Math.abs(diff))} m² ${diff > 0 ? "more" : "less"}`}. It was ${m(f.before.height)} m tall; this one reaches the ceiling, at ${m(f.now.height)} m. Both from the models' sizes.`;
  },
};
/** The room has come to rest: the camera has arrived, and any change of mode or of the glass has finished easing. */
const roomStill = () => new Promise(done => {
  const look = () => (rig.tween || modes.easing || glass.fading || wardrobeMoving(stage.current) ? requestAnimationFrame(look) : done());
  requestAnimationFrame(look);
});

/** A feature's demo: its own, or another it names in its actions ("demo:<id>"). */
async function startDemo(featureId, demoId = features.get(featureId)?.demo) {
  const f = features.get(featureId), steps = DEMOS[demoId]?.steps;
  if (!steps) return;
  if (modes.current === "emergency") { $("featureStatus").textContent = "Not during Emergency-ready: care comes first."; $("featureStatus").hidden = false; say($("featureStatus").textContent); return; }
  const opener = cardOpener;
  endCompare(); // and any demo already running
  tour.stop();
  if (pacs.active) pacs.exit();
  if (guide.running || guide.ended) await guide.exit();
  $("objectCard").hidden = true;
  demo = {
    id: demoId, feature: f.id, steps, at: -1, token: 0, timer: 0, opener,
    snap: { code: specCode(), hour: state.hour, mode: modes.current, wardrobe: stage.current.addons?.wardrobe?.userData.side ?? null, pose: cameraPose() },
  };
  if (modes.current !== "standard") modes.set("standard", { instant: true }); // a mode would hide what the demo shows
  $("demoName").textContent = f.name;
  $("demoBar").hidden = false;
  $("demoStop").focus({ preventScroll: true });
  demoStep(0);
}

async function demoStep(i) {
  const d = demo;
  if (!d) return;
  d.at = i;
  const token = ++d.token, step = d.steps[i];
  d.timer = 0;
  $("demoCount").textContent = `${i + 1} of ${d.steps.length}`;
  if (highlight.clear("demo")) invalidate(); // each step marks its own subject
  try {
    step.run(demoApi);
    demoSay(typeof step.say === "function" ? step.say(demoApi) : step.say); // a caption worked out from the room, once it's set up
    await roomStill();
  } catch (err) { window.__configErrors.push(String(err)); }
  if (demo !== d || token !== d.token) return;
  d.timer = setTimeout(() => { if (demo === d) (i + 1 < d.steps.length ? demoStep(i + 1) : endDemo("done")); }, DEMO_HOLD_MS);
}

/**
 * End the demo and put the room back as it was: its options, doors, mode, time and view. "view": the visitor took the
 * view in hand, so the camera stays where they put it. Returns whether a demo was running.
 */
function endDemo(why = "") {
  const d = demo;
  if (!d) return false;
  clearTimeout(d.timer);
  demo = null;
  const shownGroups = Object.keys(demoShown);
  for (const g of shownGroups) delete demoShown[g];
  for (const g of shownGroups) runEffects(groupById(g), selected[g]);
  settle();
  highlight.clear("demo");
  setOldWardrobe(stage.current, false);
  setWardrobe(stage.current, d.snap.wardrobe, { instant: true });
  if (modes.current !== d.snap.mode || modes.easing) modes.set(d.snap.mode, { instant: true });
  if (state.hour !== d.snap.hour) setTime(d.snap.hour);
  if (why !== "view") restorePose(d.snap.pose);
  relight();
  stage.renderer.shadowMap.needsUpdate = true;
  $("demoBar").hidden = true;
  refreshExplore();
  remember();
  invalidate();
  say(why === "done" ? "Demo finished. The room is back as it was." : "Demo stopped. The room is back as it was.");
  if (why === "done" || why === "stop" || why === "esc") {
    const back = d.opener?.isConnected && !d.opener.closest("[hidden]") ? d.opener : canvas;
    back.focus({ preventScroll: true });
  }
  return true;
}
$("featureDemo").addEventListener("click", () => startDemo($("objectCard").dataset.feature).catch(err => window.__configErrors.push(String(err))));
$("demoStop").addEventListener("click", () => endDemo("stop"));
// Esc stops a demo before anything else hears it, such as Patient view's own Esc
addEventListener("keydown", e => { if (e.key === "Escape" && demo) { e.preventDefault(); e.stopPropagation(); endDemo("esc"); } }, true);
// taking the view in hand ends the demo, and the camera stays where the visitor puts it
canvas.addEventListener("pointerdown", () => { if (demo) endDemo("view"); });
canvas.addEventListener("wheel", () => { if (demo) endDemo("view"); }, { passive: true });

$("featureMenuToggle").addEventListener("click", e => {
  const open = e.currentTarget.getAttribute("aria-expanded") !== "true";
  e.currentTarget.setAttribute("aria-expanded", String(open));
  $("featureMenuList").hidden = !open;
  placeCard($("objectCard"), cardAt.x, cardAt.y); // taller now: it stays on screen
});
// How it works, opened or closed, changes the card's height the same way
$("featureHow").addEventListener("toggle", () => { if (!$("objectCard").hidden) placeCard($("objectCard"), cardAt.x, cardAt.y); });
$("featureMenuList").addEventListener("click", e => {
  const b = e.target.closest("button[data-action]");
  if (b) ACTION_HANDLERS[b.dataset.action]?.run(b);
});

/** The Features list in the panel: every entry by group, parts under their feature, each opening its card. */
function buildFeatureList() {
  const button = f => {
    const b = el("button", { type: "button", textContent: f.name });
    b.dataset.feature = f.id;
    b.addEventListener("click", () => openFeature(f.id, b));
    return b;
  };
  $("featureList").replaceChildren(...features.data.groups.filter(g => features.entries.some(f => f.group === g.id && !f.parent)).map(g => {
    const ul = el("ul", { className: "feature-list" });
    for (const f of features.entries.filter(x => x.group === g.id && !x.parent)) {
      const li = el("li", {}, button(f)), parts = features.partsOf(f.id);
      if (parts.length) li.append(el("ul", { className: "feature-parts" }, ...parts.map(p => el("li", {}, button(p)))));
      ul.append(li);
    }
    const h = el("h3", { textContent: g.label });
    return el("div", { className: "feature-group" }, h, ul);
  }));
}

// Clicking any visible solid object identifies it. The wall switch keeps its existing interaction.
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
let pressAt = null;
canvas.addEventListener("pointerdown", e => { pressAt = [e.clientX, e.clientY]; });

// ---------------------------------------------------------------- the look-around hint (hint.js)
// A real drag of the room, a scroll or pinch, or the keys: any of them shows the visitor has found that the room moves.
// Placing an item or dragging a placed one isn't looking around, so neither counts.
const lookHint = new LookHint($("lookHint"), matchMedia("(pointer: coarse)").matches);
let lookFrom = null;
canvas.addEventListener("pointerdown", e => { lookFrom = placing ? null : [e.clientX, e.clientY]; });
canvas.addEventListener("pointermove", e => {
  if (!lookFrom || !e.buttons || document.body.classList.contains("dragging-item")) return;
  if (Math.hypot(e.clientX - lookFrom[0], e.clientY - lookFrom[1]) > 8) { lookFrom = null; lookHint.looked(); }
});
addEventListener("pointerup", () => { lookFrom = null; });
canvas.addEventListener("wheel", () => lookHint.looked(), { passive: true });
canvas.addEventListener("focus", () => { if (canvas.matches(":focus-visible")) lookHint.keys(); });
canvas.addEventListener("pointerup", e => {
  if (!pressAt || Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 6) return;
  pressAt = null;
  if (placing) { placeAtClick(e.clientX, e.clientY); return; }
  // Only the nearest solid object responds, so clicks don't pass through walls or equipment.
  const hit = nearestSolid(rayAt(e.clientX, e.clientY));
  if (!hit) { $("objectCard").hidden = true; return; }
  if (apis.pick(hit.object)) return;
  if (glass.isSwitch(hit.object)) setOption("switch", selected.switch === "opaque" ? "clear" : "opaque");
  let info = null;
  for (let node = hit.object; node && node !== stage.current.root; node = node.parent) {
    if (node.userData.itemInfo) { info = node.userData.itemInfo; break; }
  }
  // part of a registered feature: its card. A placed one keeps its Turn and Remove
  const f = features?.at(hit.object);
  if (f) { showObjectCard({ feature: f.id, ...(info?.action?.startsWith("placed:") ? { action: info.action } : {}) }, e.clientX, e.clientY); return; }
  if (!info) {
    const top = stage.topName(hit.object, stage.current.root), known = OBJECT_DETAILS[top];
    const label = top.replace(/^cfg_(kit_|)/, "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) || "Room object";
    info = known ? { title: known[0], description: known[1] } : { title: label, description: "A modeled room surface or furnishing in this editable design proposal." };
    if (top === "cfg_kit_monitor") info.action = "pacs";
  }
  showObjectCard(info, e.clientX, e.clientY);
});

// ---------------------------------------------------------------- placing items: drag from the panel onto the room (placed.js)
let placing = null; // an item chosen from the list and waiting for a click or tap on the room
const placeSay = text => { $("placeStatus").textContent = text; };
const isPhone = () => matchMedia("(max-width: 820px)").matches;
function rayAt(x, y) {
  pointer.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, stage.camera);
  return ray;
}
/** The nearest solid thing shown along a ray: glass and other see-through parts don't count, the smart-glass switch does. */
function nearestSolid(r) {
  const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  return r.intersectObject(stage.current.root, true).find(h => {
    if (!shown(h.object)) return false;
    if (glass.isSwitch(h.object)) return true;
    return [h.object.material].flat().filter(Boolean).every(m => !m.transparent && !m.transmission);
  });
}
const locateAt = (type, x, y) => placement.locate(rayAt(x, y), stage.current, type, stage.camera);
/** Whether all of a wall item placed at `at` would be in plain sight: nothing solid between the camera and its face but the wall. */
function faceInSight(type, at) {
  const item = itemById(type), t = (at.rot * Math.PI) / 180, n = new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
  const walls = wallsOf(stage.current), eye = stage.camera.getWorldPosition(new THREE.Vector3());
  return placement.facePoints(item, W2T(at.x, at.y, item.height), n).every(p => {
    ray.set(eye, p.sub(eye).normalize());
    return walls.includes(nearestSolid(ray)?.object);
  });
}
const whyNot = type => (itemById(type).on === "wall"
  ? "That isn't a clear piece of wall at the right height. Try another spot on a wall."
  : "That isn't open floor inside the room. Try another spot.");

function setPlacing(type) {
  placing = type;
  $("placeItems").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.item === type)));
  document.body.classList.toggle("placing", !!type);
  if (!type) return;
  const item = itemById(type);
  placeSay(`Now click or tap where the ${item.label.toLowerCase()} goes${item.on === "wall" ? ", on a wall" : ""}. Esc cancels.`);
  if (isPhone()) setSheet(false); // the sheet would cover the room
}

function placeItem(type, at) {
  endCompare(); // the comparison hides placed items: placing one goes back to the visitor's room
  const entry = placement.add(stage.current, type, at.x, at.y, at.rot);
  if (!entry) { placeSay(`This room already has ${MAX_PLACED} placed items. Remove one to place another.`); return null; }
  stage.renderer.shadowMap.needsUpdate = true;
  invalidate();
  remember();
  placeSay(`Placed the ${itemById(type).label.toLowerCase()}.`);
  say(`${itemById(type).label} placed.`);
  if (features?.on) refreshExplore();
  return entry;
}

function placeAtClick(x, y) {
  const type = placing, at = locateAt(type, x, y);
  if (!at.ok) { placeSay(whyNot(type)); return; }
  setPlacing(null);
  placeItem(type, at);
}

/** From the keyboard: straight into the room, somewhere in view, with its card open to move it by key. */
function placeInView(type) {
  const w = rig.visible.w, h = innerHeight, onWall = itemById(type).on === "wall";
  // the middle of the view first, then anywhere in it: a wide item fits on fewer stretches of wall
  const spots = [[0.5, 0.62], [0.5, 0.5], [0.35, 0.6], [0.65, 0.6], [0.5, 0.75], [0.3, 0.45], [0.7, 0.45], [0.5, 0.35]];
  for (let fy = 0.3; fy < 0.85; fy += 0.1) for (let fx = 0.1; fx < 0.95; fx += 0.1) spots.push([fx, fy]);
  // a wall item goes first to a spot nothing stands in front of; only if there's none, to one behind the equipment
  for (const inSight of onWall ? [true, false] : [false]) {
    for (const [fx, fy] of spots) {
      const at = locateAt(type, w * fx, h * fy);
      if (!at.ok || (inSight && !faceInSight(type, at))) continue;
      const entry = placeItem(type, at);
      if (entry) showPlacedCard(entry);
      return;
    }
  }
  setPlacing(type);
  placeSay(`There's no ${onWall ? "clear wall wide enough" : "open floor"} in this view. Click or tap where it goes, or choose another view first.`);
}

function showPlacedCard(entry) {
  const p = entry.node.getWorldPosition(new THREE.Vector3()).project(stage.camera);
  showObjectCard(entry.node.userData.itemInfo, ((p.x + 1) / 2) * innerWidth, ((1 - p.y) / 2) * innerHeight);
}

function removePlaced(entry) {
  const found = placement.find(entry.uid);
  if (!found) return;
  placement.remove(found.label, entry);
  $("objectCard").hidden = true;
  canvas.focus({ preventScroll: true });
  stage.renderer.shadowMap.needsUpdate = true;
  invalidate();
  remember();
  placeSay(`Removed the ${itemById(entry.type).label.toLowerCase()}.`);
  say(`${itemById(entry.type).label} removed.`);
  if (features?.on) refreshExplore();
}

function turnPlaced(entry, degrees) {
  if (itemById(entry.type).on !== "floor") return; // a wall item faces out from its wall
  placement.move(entry, entry.x, entry.y, (entry.rot + degrees + 360) % 360);
  stage.renderer.shadowMap.needsUpdate = true;
  invalidate();
  remember();
}

/** Arrow keys on a placed item's card: 10 cm at a time, across the screen as you see it; a wall item slides along its wall. */
function nudgePlaced(entry, dx, dy) {
  const item = itemById(entry.type), f = stage.camera.getWorldDirection(new THREE.Vector3());
  const fwd = new THREE.Vector2(f.x, -f.z).normalize(), right = new THREE.Vector2(fwd.y, -fwd.x);
  let x = entry.x, y = entry.y;
  if (item.on === "floor") {
    x += (right.x * dx + fwd.x * dy) * 0.1; y += (right.y * dx + fwd.y * dy) * 0.1;
    if (!inside(x, y, stage.current.meta.walkable)) { placeSay("That's the edge of the open floor."); return; }
  } else {
    if (!dx) return;
    const t = (entry.rot * Math.PI) / 180, along = new THREE.Vector2(Math.cos(t), Math.sin(t)); // the wall's own direction, in plan
    const sign = Math.sign(along.dot(right)) || 1;
    x += along.x * sign * dx * 0.1; y += along.y * sign * dx * 0.1;
    if (!placement.onWall(stage.current, entry, x, y)) { placeSay("That's the end of the clear wall."); return; }
  }
  placement.move(entry, x, y);
  stage.renderer.shadowMap.needsUpdate = true;
  invalidate();
  remember();
}

$("objectCard").addEventListener("keydown", e => {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeCard(); return; }
  const found = placement.find(Number($("objectCard").dataset.placed || 0));
  if (!found || $("objectCard").hidden) return;
  const { entry } = found;
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removePlaced(entry); return; }
  if (e.key === "r" || e.key === "R") { e.preventDefault(); turnPlaced(entry, e.shiftKey ? -15 : 15); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
  if (!d) return;
  e.preventDefault();
  nudgePlaced(entry, ...d);
});

// the ghost that follows a drag from the list: the item itself, see-through, red where it can't go
function makeGhost(type) {
  const g = itemById(type).build();
  g.traverse(n => {
    if (!n.isMesh) return;
    n.material = n.material.clone();
    Object.assign(n.material, { transparent: true, opacity: 0.55, depthWrite: false });
    n.castShadow = false;
  });
  g.visible = false;
  stage.current.root.add(g);
  return g;
}
function showGhost(g, type, at) {
  g.visible = at.x !== undefined;
  if (g.visible) {
    const item = itemById(type);
    g.position.copy(W2T(at.x, at.y, item.on === "wall" ? item.height : 0));
    g.rotation.y = ((at.rot ?? 0) * Math.PI) / 180;
    g.traverse(n => { if (n.isMesh) n.material.emissive?.set(at.ok ? 0x000000 : 0x8a1c12); });
  }
  invalidate();
}
function dropGhost(g) {
  g.removeFromParent();
  g.traverse(n => { if (n.isMesh) { n.material.dispose(); n.geometry.dispose(); } });
  invalidate();
}

function buildPlaceItems() {
  $("placeItems").replaceChildren(...ITEMS.map(item => {
    const b = el("button", { type: "button" }, el("span", { textContent: item.label }), el("small", { textContent: item.on === "wall" ? "On a wall" : "On the floor" }));
    b.dataset.item = item.id;
    b.setAttribute("aria-pressed", "false");
    let drag = null;
    b.addEventListener("pointerdown", e => {
      if (e.button !== 0 || !stage.current) return;
      drag = { x: e.clientX, y: e.clientY, id: e.pointerId, ghost: null, at: null };
      b.setPointerCapture(e.pointerId);
    });
    b.addEventListener("pointermove", e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
        drag.ghost = makeGhost(item.id);
        setPlacing(null);
        document.body.classList.add("dragging-item");
        if (isPhone()) setSheet(false);
      }
      drag.at = document.elementFromPoint(e.clientX, e.clientY) === canvas ? locateAt(item.id, e.clientX, e.clientY) : { ok: false };
      showGhost(drag.ghost, item.id, drag.at);
    });
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      document.body.classList.remove("dragging-item");
      if (!d.ghost) return; // no drag: it's a click
      dropGhost(d.ghost);
      b.dataset.dragged = "1";
      if (e.type !== "pointerup") return;
      if (d.at?.ok) placeItem(item.id, d.at);
      else if (document.elementFromPoint(e.clientX, e.clientY) === canvas) placeSay(whyNot(item.id));
    };
    b.addEventListener("pointerup", end);
    b.addEventListener("pointercancel", end);
    b.addEventListener("click", e => {
      if (b.dataset.dragged) { delete b.dataset.dragged; return; } // the click that ends a drag
      if (e.detail === 0) placeInView(item.id); // from the keyboard
      else setPlacing(placing === item.id ? null : item.id);
    });
    return b;
  }));
}
addEventListener("keydown", e => { if (e.key === "Escape" && placing) { setPlacing(null); placeSay("Placing cancelled."); } });

// a placed item drags to a new spot; this runs before the camera's own controls see the press
let moving = null;
addEventListener("pointerdown", e => {
  if (e.target !== canvas || e.button !== 0 || placing || !stage.current || apis.active) return;
  const entry = placement.hit(rayAt(e.clientX, e.clientY), stage.current);
  if (!entry) return;
  moving = { entry, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, controls: controls.enabled };
  controls.enabled = false;
}, true);
addEventListener("pointermove", e => {
  if (!moving || e.pointerId !== moving.id) return;
  if (!moving.moved && Math.hypot(e.clientX - moving.x, e.clientY - moving.y) < 6) return;
  moving.moved = true;
  document.body.classList.add("dragging-item");
  const at = locateAt(moving.entry.type, e.clientX, e.clientY);
  if (at.ok) { placement.move(moving.entry, at.x, at.y, itemById(moving.entry.type).on === "wall" ? at.rot : moving.entry.rot); invalidate(); }
}, true);
const endMove = e => {
  if (!moving || e.pointerId !== moving.id) return;
  const m = moving;
  moving = null;
  controls.enabled = m.controls;
  document.body.classList.remove("dragging-item");
  if (!m.moved) return; // a click: the card opens as for anything else
  pressAt = null;
  stage.renderer.shadowMap.needsUpdate = true;
  invalidate();
  remember();
  if (features?.on) refreshExplore();
  say(`${itemById(m.entry.type).label} moved.`);
};
addEventListener("pointerup", endMove, true);
addEventListener("pointercancel", endMove, true);

// ---------------------------------------------------------------- before and after: today's room against this one
// Today's room is every option at its default, with none of the visitor's placed items, at the same view and time. The
// visitor's design is kept aside and comes back exactly; their link and summary don't change while it shows.
var compare = null;
function setCompare(on) {
  if (on === !!compare || !stage.current) return;
  if (on) {
    endDemo();
    if (pacs.active) pacs.exit();
    tour.stop();
    compare = { selected: { ...selected }, mode: modes.current, code: specCode() };
    modes.leave();
    showSelections(Object.fromEntries(allGroups().map(g => [g.id, g.default])));
    placement.list(state.room).forEach(p => { if (p.node) p.node.visible = false; });
  } else {
    const c = compare;
    compare = null;
    showSelections(c.selected);
    placement.show(stage.current);
    if (c.mode !== "standard") modes.set(c.mode, { instant: true });
  }
  $("compareToggle").setAttribute("aria-pressed", String(on));
  $("compareToggle").textContent = on ? "Back to your room" : "Compare with today's room";
  $("compareNote").hidden = !on;
  stage.renderer.shadowMap.needsUpdate = true;
  syncUi();
  invalidate();
  say(on ? "Showing today's room, at the same view and time." : "Showing your room again.");
}
/** Something is about to change the design: the comparison and any feature demo end first, so the change lands on the visitor's own room. */
function endCompare() { endDemo(); if (compare) setCompare(false); }
$("compareToggle").addEventListener("click", () => setCompare(!compare));

// ---------------------------------------------------------------- the guided tour (guide.js)
var guide = new GuidedTour({
  snapshot: () => ({ code: specCode(), mode: modes.current, clinical: clinicalByHand }),
  restore: snap => {
    const spec = decodeSpec(optionData, `#c=${snap.code}`);
    if (!spec) return Promise.resolve();
    return applySpec(spec).then(() => {
      modes.set(snap.mode, { instant: true });
      clinicalByHand = snap.clinical;
      syncClinical();
    }).catch(fail);
  },
  room: label => (state.room === label && stage.current ? Promise.resolve() : setRoom(label)),
  theme: id => applyTheme(id),
  time: stop => setTime(STOPS[stop]),
  camera: (name, instant) => { if (rig.meta.cameras[name]) rig.go(name, { instant: !!instant }); },
  mode: name => modes.set(name),
  option: (group, id) => { if (selected[group] !== id) setOption(group, id); },
  // the room has come to rest: the camera has arrived, and any change of mode or of the glass has finished easing
  still: () => new Promise(done => {
    const look = () => (rig.tween || modes.easing || glass.fading ? requestAnimationFrame(look) : done());
    requestAnimationFrame(look);
  }),
  place: types => { for (const t of types) placeInView(t); $("objectCard").hidden = true; },
  open: id => $(id === "pacs" ? "startPacsGuide" : "openApis")?.click(),
  shown: on => { document.body.classList.toggle("guided", on); if (on && isPhone()) setSheet(false); },
  // the tour's ending hands the room over: the options come up on a phone, and the keyboard lands on the first of them
  handOver: () => {
    if (isPhone()) setSheet(true);
    $("panelBody").scrollTop = 0;
    ($("themes").querySelector('[aria-pressed="true"]') || $("themes").querySelector("button"))?.focus({ preventScroll: true });
  },
  say, fail,
}, {
  card: $("guide"), count: $("guideCount"), bar: $("guideBar"), hold: $("guideHold"), title: $("guideTitle"), text: $("guideText"), caveat: $("guideCaveat"), links: $("guideLinks"),
  steps: $("guideSteps"), prev: $("guidePrev"), play: $("guidePlay"), next: $("guideNext"), restart: $("guideRestart"), exit: $("guideExit"),
  after: $("guideAfter"), tryIt: $("guideTry"), again: $("guideAgain"),
});
$("guideCaveat").textContent = CAVEAT;
$("openGuide").addEventListener("click", () => { endCompare(); tour.stop(); if (pacs.active) pacs.exit(); guide.start(); });
$("guide").addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); guide.exit(); } });

// ---------------------------------------------------------------- graphics quality: Auto, High or Low (quality.js)
/** Switch tier while the page runs: bloom and its antialiasing, transmission glass and the shadow map's size. */
function applyTier(next) {
  if (next === tier) return;
  tier = next;
  stage.setTier(next);
  daylight.setShadowSize(next === "low" ? 1024 : 2048);
  glass.setTier(next);
  stage.renderer.shadowMap.needsUpdate = true;
  resize();
  relight();
}
const tierName = t => (t === "low" ? "Low" : "High");
function syncQuality(text) {
  pressed($("quality"), quality.choice);
  $("qualityStatus").textContent = text || (quality.choice !== "auto"
    ? `${tierName(tier)}, as chosen. Auto would time this device and pick.`
    : quality.ms && tier === "low" && handheld() ? `Auto keeps a phone or tablet on Low: a frame took about ${Math.round(quality.ms)} ms to draw here. You can still choose High.`
    : quality.ms ? `Auto chose ${tierName(tier)}: a frame took about ${Math.round(quality.ms)} ms to draw on this device.`
    : `Auto: ${tierName(tier)}, until it has timed a few frames on this device.`);
}
/** Auto: time a few frames and pick. A test passes the time in, since a software renderer is left alone, as below. */
async function autoQuality(ms) {
  if (quality.choice !== "auto" || forcedTier) return;
  if (ms === undefined) {
    if (navigator.webdriver) return;
    ms = await probe(() => stage.draw(), stage.renderer.getContext(), () => stage.renderer.compileAsync(stage.scene, stage.camera));
    if (quality.choice !== "auto") return; // the visitor chose meanwhile
  }
  quality.ms = ms;
  const next = pickTier(ms, tier, handheld());
  saveMeasured("configurator", next);
  applyTier(next);
  syncQuality();
  invalidate();
}
$("quality").addEventListener("click", e => {
  const b = e.target.closest("button[data-value]");
  if (!b || forcedTier) return;
  quality.choice = b.dataset.value;
  saveChoice(quality.choice);
  quality.ms = 0;
  applyTier(quality.choice === "auto" ? startTier("auto", readMeasured("configurator"), handheld()) : quality.choice);
  syncQuality();
  say(`Graphics quality: ${b.textContent}.`);
  autoQuality();
  invalidate();
});

// ---------------------------------------------------------------- drawing: only when something has changed
let lastMovingDraw = 0;
const adaptive = !navigator.webdriver; // a software renderer in a test shouldn't talk itself down from what it's testing
// iOS Safari drops a page's WebGL context when memory runs short, which would leave a frozen picture. Say so and offer a
// reload: the link already holds the room, and starting again is more reliable than re-uploading every texture in place
let glLost = false;
canvas.addEventListener("webglcontextlost", () => {
  glLost = true;
  if (optionData && window.__configReady) history.replaceState(null, "", `#c=${specCode()}`);
  if (!matchMedia("(pointer: coarse)").matches) $("glReload").textContent = "Reload the 3D view";
  $("glLost").hidden = false;
  $("glReload").focus({ preventScroll: true });
});
$("glReload").addEventListener("click", () => location.reload());

function frame(now) {
  if (glLost) return; // nothing can be drawn until the page reloads
  requestAnimationFrame(frame);
  if (!rig.meta) return;
  const moving = apis.active ? apis.update(now) : rig.update(now);
  if (moving) {
    dirty = true;
    if (adaptive && lastMovingDraw) stage.noteFrame(now - lastMovingDraw);
    lastMovingDraw = now;
  } else {
    lastMovingDraw = 0;
  }
  if (glass.update(now)) dirty = true;
  if (tickAddons(stage.current, now, stage.camera)) dirty = true;
  if (tickWardrobe(stage.current, now)) {
    dirty = true;
    stage.renderer.shadowMap.needsUpdate = true;
    if (!wardrobeMoving(stage.current) && features?.on) refreshExplore(); // its compartments' marks, now the doors have stopped
  }
  if (modes.update(now)) dirty = true;
  if (pacs.update(now)) dirty = true;
  if (dirty) {
    dirty = false;
    stage.draw();
    clinical.update(stage.camera, rig.visible.w);
    features?.update(stage.camera, rig.visible.w);
    window.__configFrames = (window.__configFrames || 0) + 1;
  }
}

function fail(err) {
  $("load").textContent = "The room could not be loaded. Check your connection and reload the page.";
  $("load").hidden = false;
  window.__configErrors.push(String(err));
}

// ---------------------------------------------------------------- for the headless check
window.__config = {
  pacs: () => pacs.inspect(),
  pacsSimulation: () => pacs.sim,
  patient: () => ({ anchors: stage.current?.patient?.anchors, routes: stage.current?.patient?.routes.children.map(n => n.userData.itemInfo?.title) }),
  itemPoint: title => {
    let item = null; stage.current.root.traverse(n => { if (n.userData.itemInfo?.title === title) item = n; });
    if (!item) return null;
    stage.current.root.updateMatrixWorld(true); stage.camera.updateMatrixWorld();
    const p = new THREE.Box3().setFromObject(item).getCenter(new THREE.Vector3()).project(stage.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  },
  apis: () => apis.inspect(),
  apisPoint: id => apis.screenPoint(id),
  state: () => ({ ...state, night: isNight(state.hour), sun: sunAt(state.hour, SITE), moving: !!rig.tween, ceiling: stage.ceilingOn, roomBox: rig.meta?.room }),
  views: () => Object.keys(rig.meta.cameras),
  room: label => setRoom(label),
  camera: (name, opts) => rig.go(name, opts),
  time: setTime,
  stops: STOPS,
  orbit: (yaw, pitch) => rig.orbitBy(yaw, pitch),
  zoomOut: k => rig.dolly(k),
  frames: () => window.__configFrames,
  quality: () => ({
    ratio: stage.renderer.getPixelRatio(), bloomDropped: stage.bloomDropped, tier, choice: quality.choice, ms: quality.ms,
    measured: readMeasured("configurator"), composer: !!stage.composer, transmission: !!glass.material.isMeshPhysicalMaterial,
    shadow: daylight.sun.shadow.mapSize.x, pixels: Math.round(innerWidth * innerHeight * stage.renderer.getPixelRatio() ** 2),
  }),
  autoQuality: ms => autoQuality(ms),
  noteFrame: ms => stage.noteFrame(ms),
  /**
   * Cost of drawing while orbiting: the draw is followed by a pixel read, so it times the GPU finishing, not the display's refresh.
   * It reads long: orbiting also makes the page draw its own frame, so two draws are queued when the read waits, and the read
   * itself costs several milliseconds. scripts/perf_baseline.py times one whole frame from outside (docs/adaptive-icu-baseline.md).
   */
  perf: async (seconds = 4) => {
    const gl = stage.renderer.getContext(), px = new Uint8Array(4), times = [];
    const end = performance.now() + seconds * 1000;
    while (performance.now() < end) {
      rig.orbitBy(0.02, 0);
      const t0 = performance.now();
      stage.draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      times.push(performance.now() - t0);
      await new Promise(requestAnimationFrame);
    }
    times.sort((a, b) => a - b);
    const info = stage.renderer.info;
    return { tier, size: [innerWidth, innerHeight], ratio: stage.renderer.getPixelRatio(), frames: times.length, medianMs: +times[times.length >> 1].toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(1), drawCalls: info.render.calls, triangles: info.render.triangles, programs: info.programs.length, textures: info.memory.textures };
  },
  eye: () => rig.worldEye(),
  /** Which way the camera faces, as a model-coordinate unit vector. */
  look: () => { const d = stage.camera.getWorldDirection(new THREE.Vector3()); return { x: d.x, y: -d.z, z: d.y }; },
  hfov: () => rig.hfov,
  inRoom: () => { const e = rig.worldEye(); return inside(e.x, e.y, rig.meta.walkable); },
  renderNow: () => { rig.update(performance.now()); },
  invalidate,
  /** Fractions along the move from one view to another that fall outside the room. */
  routeOutside: (from, to) => {
    rig.go(from, { instant: true });
    const v = rig.meta.cameras[to], at = rig.route(W2T(...v.eye), to === "dollhouse"), p = W2T(0, 0), out = [];
    for (let i = 0; i <= 200; i++) { at(i / 200, p); if (!inside(p.x, -p.z, rig.meta.walkable)) out.push(i / 200); }
    return out;
  },
  /** How many waypoints the move from one view to another goes through. */
  waypoints: (from, to) => {
    rig.go(from, { instant: true });
    return rig.pathFor(stage.camera.position, W2T(...rig.meta.cameras[to].eye), to === "dollhouse").length - 2;
  },
  ceiling: () => rig.meta.ceiling,
  anchors: () => Object.fromEntries(Object.entries(stage.current.anchors).map(([k, a]) => { const v = new THREE.Vector3(); a.getWorldPosition(v); return [k, [v.x, -v.z, v.y]]; })),
  get tier() { return tier; },
  set: setOption,
  selected: () => ({ ...selected }),
  options: () => optionData,
  partNames: () => Object.keys(stage.current.parts),
  roomVents: () => rig.meta.vents,
  mode: () => {
    const tv = stage.current.addons?.tv?.userData;
    let aquariumScreen = null;
    stage.current.addons?.digital?.traverse(n => { if (n.isMesh && n.material?.isMeshBasicMaterial && n.material.map) aquariumScreen = n.visible; });
    return {
      current: modes.current, before: modes.before, easing: modes.easing, look: lighting.scene && { ...lighting.scene }, task: lighting.taskOn,
      blinds: modeApi.blindsNow(), tvPlaying: !!tv && tv.screen.material === tv.on, glass: glass.mode === "smart" && glass.opaque ? "opaque" : glass.mode,
      curtain: (stage.current.parts.cfg_curtain || []).some(n => n.visible), aquariumScreen,
    };
  },
  setMode: (name, opts) => modes.set(name, opts),
  presets: () => readPresets(),
  walkable: () => rig.meta.walkable,
  guide: () => ({ running: guide.running, at: guide.at, playing: guide.playing, still: guide.still, ended: guide.ended, title: $("guideTitle").textContent }),
  guideGo: i => guide.go(i),
  clinical: () => ({ on: clinical.on, labels: clinical.showing(), zones: !!stage.current.clinicalZones?.visible }),
  placed: () => placement.list(state.room).map(({ type, x, y, rot }) => ({ type, x: +x.toFixed(2), y: +y.toFixed(2), rot })),
  /** Whether a wall item of this type, centred at x, y and facing `rot` degrees, would have wall behind all of it. */
  wallClear: (type, x, y, rot) => placement.onWall(stage.current, { type, rot }, x, y),
  screenOf: (x, y, z) => { const v = W2T(x, y, z).project(stage.camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; },
  /** Stand 2.2 m in front of the room's longest plain wall and return where a point on it, 1.2 m up, is on screen. */
  faceWall: () => {
    const m = rig.meta, run = m.wall_runs.filter(r => !r.door).map(r => ({ r, len: Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) })).sort((a, b) => b.len - a.len)[0].r;
    const dx = run.b[0] - run.a[0], dy = run.b[1] - run.a[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len; // into the room
    const mx = (run.a[0] + run.b[0]) / 2, my = (run.a[1] + run.b[1]) / 2;
    rig.go("overview", { instant: true });
    stage.camera.position.copy(W2T(mx + nx * 2.2, my + ny * 2.2, 1.5));
    controls.target.copy(W2T(mx, my, 1.25));
    controls.update();
    stage.camera.updateMatrixWorld();
    invalidate();
    const v = W2T(mx + nx * 0.01, my + ny * 0.01, 1.2).project(stage.camera);
    return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
  },
  comparing: () => !!compare,
  placedShown: () => placement.list(state.room).filter(p => p.node?.visible).length,
  orientation: () => stage.current.addons?.tv?.userData.orientText,
  addonShown: id => !!stage.current.addons?.[id]?.visible,
  daylightSensor: () => ({ shown: !!stage.current.addons?.daylightSensor?.visible, text: daylightCard(), elevation: daylight.elevation, dark: afterDark() }),
  vocal: () => {
    const tint = name => { let hex = null; for (const m of stage.current.parts.addon_soundSensor || []) for (const mat of [m.material].flat()) if (mat?.name === name) hex = { colour: mat.color.getHexString(), glow: mat.emissive.getHexString(), strength: mat.emissiveIntensity }; return hex; };
    let halo = null; for (const m of stage.current.parts.addon_soundSensor || []) if (m.material?.name === "sound_halo") halo = { colour: m.material.color.getHexString(), opacity: m.material.opacity };
    return { notice: vocal ? { ...vocal } : null, groans: groans.length, light: tint("sound_indicator"), ring: tint("sound_ring"), halo, shown: sensorShown() };
  },
  cueFor: (sound, n) => cueFor(sound, n) ?? null,
  comfortTint: () => { let hex = null; for (const m of stage.current.parts.addon_comfortControl || []) for (const mat of [m.material].flat()) if (mat?.name === "comfort_status") hex = mat.color.getHexString(); return hex; },
  ventPlates: () => { let n = 0; stage.current.addons?.ventilation?.traverse(o => { if (/grille/.test(o.userData.itemInfo?.title || "")) n += 1; }); return n; },
  profile: answers => resolveProfile(optionData, answers),
  fading: () => glass.fading,
  glassLevel: () => glass.k,
  /** Stand in front of an anchor, looking at it, and return where it is on screen. */
  frameAnchor: (name, back = 1.2, up = 0.1) => {
    const a = stage.current.anchors[name], p = new THREE.Vector3(), q = new THREE.Vector3(0, 0, -1);
    a.getWorldPosition(p);
    if (name === "switch") p.y = 1.2;
    q.applyQuaternion(a.getWorldQuaternion(new THREE.Quaternion()));
    rig.go("overview", { instant: true });
    stage.camera.position.copy(p).addScaledVector(q, back);
    stage.camera.position.y += up;
    controls.target.copy(p);
    controls.update();
    stage.camera.updateMatrixWorld();
    invalidate();
    const s = p.clone().project(stage.camera);
    return { x: ((s.x + 1) / 2) * innerWidth, y: ((1 - s.y) / 2) * innerHeight };
  },
  /** Stand somewhere no view does, for an option that no set view shows well. */
  lookFrom: (eye, look) => {
    rig.go("overview", { instant: true });
    stage.camera.position.copy(W2T(...eye));
    controls.target.copy(W2T(...look));
    controls.update();
    stage.camera.updateMatrixWorld();
    invalidate();
  },
  code: specCode,
  theme: applyTheme,
  currentTheme: () => currentTheme()?.id,
  tour: () => ({ running: tour.running, log: tour.log.slice(), order: tour.order.slice() }),
  startTour: () => tour.start(),
  placeInView: type => placeInView(type),
  wardrobe: (side, instant = true) => { setWardrobe(stage.current, side, { instant }); invalidate(); if (features.on) refreshExplore(); return stage.current.addons?.wardrobe?.userData.side ?? null; },
  wardrobeMoving: () => wardrobeMoving(stage.current),
  wardrobeFigures: () => wardrobeFigures(stage.current),
  /** Stand in front of a feature, as its demo does, at once. */
  frameFeature: id => { const objs = features.objects(id); if (!objs.length) return false; if (state.view === "dollhouse" || state.view === "patient") rig.go("overview", { instant: true }); const { eye, target } = framePose(objs); rig.goTo(eye, target, { instant: true }); return true; },
  // feature cards
  features: () => features.entries.map(f => ({ id: f.id, name: f.name, group: f.group, parent: f.parent || null, demo: f.demo || null, actions: f.actions || [], present: features.present(f.id) })),
  featureAt: (x, y) => { const hit = nearestSolid(rayAt(x, y)); return hit ? features.at(hit.object)?.id ?? null : null; },
  /** A point on screen where a click lands on this feature, from where the camera is now, or null. */
  featurePoint: id => {
    stage.current.root.updateMatrixWorld(true); stage.camera.updateMatrixWorld();
    for (const o of features.objects(id)) {
      const pts = [];
      o.traverse(n => {
        if (!n.isMesh || n.userData.outline || !n.geometry?.attributes.position) return;
        const pos = n.geometry.attributes.position, idx = n.geometry.index, tris = (idx ? idx.count : pos.count) / 3, step = Math.max(1, Math.floor(tris / 60));
        const corner = (t, k) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(t * 3 + k) : t * 3 + k);
        for (let t = 0; t < tris; t += step) pts.push(corner(t, 0).add(corner(t, 1)).add(corner(t, 2)).divideScalar(3).applyMatrix4(n.matrixWorld));
      });
      for (const p of pts) {
        const s = p.project(stage.camera), x = ((s.x + 1) / 2) * innerWidth, y = ((1 - s.y) / 2) * innerHeight;
        if (s.z > 1 || x < 4 || y < 4 || x > rig.visible.w - 4 || y > innerHeight - 4) continue;
        const top = document.elementFromPoint(x, y);
        if (top !== canvas) continue; // under the panel, the bar or a marker
        const hit = nearestSolid(rayAt(x, y));
        if (hit && features.at(hit.object)?.id === id) return { x, y };
      }
    }
    return null;
  },
  card: () => {
    const c = $("objectCard"), r = c.getBoundingClientRect();
    return { open: !c.hidden, feature: c.dataset.feature, title: $("objectTitle").textContent, kicker: $("objectKicker").textContent,
      buttons: [...c.querySelectorAll(".object-actions button")].filter(b => !b.hidden && b.offsetParent).map(b => b.textContent),
      how: !$("featureHow").hidden, facts: [...$("featureFacts").querySelectorAll("dt")].map(d => d.textContent), evidence: $("featureEvidence").textContent,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
  },
  demo: () => (demo ? { id: demo.id, feature: demo.feature, at: demo.at, steps: demo.steps.length, waiting: !!demo.timer } : null),
  /** Skip the rest of a step's hold, once its room is still: every step still runs, without the reading time. */
  demoAdvance: () => { if (!demo?.timer) return false; const d = demo; clearTimeout(d.timer); d.timer = 0; if (d.at + 1 < d.steps.length) demoStep(d.at + 1); else endDemo("done"); return true; },
  highlight: () => ({ hover: hoverId, on: ["hover", "card", "explore", "demo"].filter(k => highlight.has(k)) }),
  explore: () => ({ on: features.on, filter: features.filter, markers: features.showing() }),
  /** The room as it's shown now, for proving a demo put it all back. */
  fingerprint: () => {
    const r = n => Math.round(n * 1000) / 1000, tv = stage.current.addons?.tv?.userData, w = stage.current.addons?.wardrobe;
    return {
      live: encodeSpec(optionData, state, selected, encodePlaced(placement.list(state.room))), selected: { ...selected }, shown: { ...demoShown },
      mode: modes.current, look: lighting.scene && { ...lighting.scene }, task: lighting.taskOn, scheme: lighting.params.scheme?.kind, kelvin: lighting.params.kelvin,
      hour: state.hour, view: state.view, eye: stage.camera.position.toArray().map(r), target: controls.target.toArray().map(r),
      wardrobe: w?.userData.side ?? null, wardrobeShown: !!w?.visible, oldWardrobe: !!stage.current.oldWardrobe?.visible, tv: tv ? (tv.screen.material === tv.on ? "on" : tv.screen.material === tv.orientOn ? "orientation" : "off") : null,
      glass: [glass.mode, glass.opaque], blinds: r(modeApi.blindsNow()), sky: !!stage.current.addons?.sky?.visible, aquarium: !!stage.current.addons?.digital?.visible,
    };
  },
};

// ?stats=1: a readout of the GPU, tier, pixel ratio, canvas size and draw time, for diagnosing a slow device (stats.js)
if (query.get("stats") === "1") {
  import("./stats.js").then(m => m.showStats({ page: "Configurator", renderer: stage.renderer, draw: () => stage.draw(), tier: () => `${tier === "low" ? "Low" : "High"} (${quality.choice === "auto" ? (quality.ms ? `Auto, timed ${Math.round(quality.ms)} ms` : "Auto, not yet timed") : forcedTier ? "forced by ?tier=" : "chosen"})`, ready: () => !!window.__configReady })).catch(fail);
}

async function boot() {
  window.__configStage = "fetching options";
  const [res, featureRes] = await Promise.all([fetch("options.json"), fetch("features.json")]);
  if (!res.ok) throw new Error(`options.json: HTTP ${res.status}`);
  if (!featureRes.ok) throw new Error(`features.json: HTTP ${featureRes.status}`);
  optionData = await res.json();
  features = new Features(await featureRes.json(), {
    stage, placement, choice: shownChoice, layer: $("featureMarkers"),
    onPick: (id, marker) => openFeature(id, marker),
  });
  buildFeatureList();
  for (const sec of optionData.sections) for (const g of sec.groups) selected[g.id] = g.default;
  panelUi = new Panel($("options"), optionData, setOption);
  $("themes").replaceChildren(...optionData.themes.map(t => Object.assign(document.createElement("button"), { type: "button", textContent: t.label })));
  $("themes").querySelectorAll("button").forEach((b, i) => { b.dataset.value = optionData.themes[i].id; });
  resize();
  const fromLink = location.hash ? decodeSpec(optionData, location.hash) : null;
  // the walkthrough links each configurable room here with ?room=W1 or ?room=W3
  if (!fromLink && optionData.rooms.includes(query.get("room"))) state.room = query.get("room");
  renderPresets();
  buildPlaceItems();
  if (fromLink) {
    placement.set(fromLink.room, decodePlaced(fromLink.placed));
    Object.assign(selected, fromLink.selected);
    state.room = fromLink.room; state.view = fromLink.view; state.hour = fromLink.hour;
  }
  await setRoom(state.room, { keepView: true });
  setDemoReadout();
  window.__configStage = "setting the time";
  setTime(state.hour);
  window.__configStage = "drawing the first frame";
  if (location.hash && !fromLink) $("roomStatus").textContent = "That link's code couldn't be read, so this is the default room.";
  else if (fromLink?.dropped.length) $("roomStatus").textContent = leftOut(fromLink.dropped);
  $("load").hidden = true;
  syncQuality();
  if (forcedTier) $("quality").querySelectorAll("button").forEach(b => { b.disabled = true; });
  requestAnimationFrame(frame);
  // the home page's "Take the guided tour" link
  if (query.get("tour") === "guided") requestAnimationFrame(() => guide.start());
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.remove("pending");
    // a first visit is told the room can be moved. Automated pages don't get the hint, so the checks' and the home page's
    // screenshots show the room alone; ?hint=1 asks for it, which is how the checks test it
    if (!navigator.webdriver || query.get("hint") === "1") lookHint.offer();
    window.__configStage = "ready";
    window.__configReady = true;
    remember();
    autoQuality(); // the first frame is up: time a few more and pick
  }));
}
boot().catch(fail);
