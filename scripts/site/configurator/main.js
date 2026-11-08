// Room configurator: a design proposal, built on the as-built model of one room.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stage, W2T } from "./stage.js";
import { Rig, inside } from "./cameras.js";
import { Daylight, sunAt } from "./sky.js";
import { Lighting } from "./lights.js";
import { FrontGlass } from "./glass.js";
import { applyLook } from "./surfaces.js";
import { setAddon, setAddonLook, setShade, setTv, syncPalms, tickAddons, toggleWardrobe } from "./addons.js";
import { decodeSpec, encodeSpec } from "./state.js";
import { differences, optionLabel, resolveProfile } from "./profile.js";
import { summaryContent } from "./summary.js";
import { el, Panel } from "./panel.js";
import { APIS } from "./apis.js";
import { PACS } from "./pacs.js";

addEventListener("error", e => window.__configErrors.push(String(e.message)));
addEventListener("unhandledrejection", e => window.__configErrors.push(String(e.reason)));
document.addEventListener("touchstart", () => {}, { passive: true }); // iOS Safari only applies :active once the page listens for touches

const SITE = /*SITE_JSON*/{ latitude_deg: 24.45, declination_deg: -2.5, north_offset_deg: 0 };
const STOPS = { morning: 8.5, midday: 12, afternoon: 15.53, sunset: 17.75, night: 21 };
const NIGHT_FROM = 18.4;
const $ = id => document.getElementById(id);

const canvas = $("c"), panel = $("panel");
const query = new URLSearchParams(location.search);
// phones and small screens skip bloom and glass transmission, and get fewer lights
const tier = query.get("tier") || (matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600 ? "low" : "high");
const stage = new Stage(canvas, tier);
const controls = new OrbitControls(stage.camera, canvas);
const state = { room: "W1", view: "overview", hour: STOPS.afternoon };
let dirty = true, lastDayHour = STOPS.afternoon;
const invalidate = () => { dirty = true; };
const rig = new Rig(stage.camera, controls, W2T, invalidate);
const daylight = new Daylight(stage.scene, SITE, W2T, tier === "low" ? 1024 : 2048);
stage.onQualityDrop = () => { resize(); };
const lighting = new Lighting(stage, daylight, tier);
const glass = new FrontGlass(tier);
controls.addEventListener("change", invalidate);
rig.onView = (name, isDoll) => {
  // going up: the ceiling goes first, so the camera doesn't pass through it. Coming down: it returns on arrival
  if (isDoll) stage.setCeiling(false);
  state.view = name;
  syncViews();
  remember();
  describe();
  say(`${viewLabel(name)} view.`);
};
rig.onArrive = name => {
  if (name !== "dollhouse") stage.setCeiling(true);
  invalidate();
  tour.arrived();
};

// ---------------------------------------------------------------- layout
function resize() {
  const w = innerWidth, h = innerHeight;
  stage.resize(w, h);
  stage.camera.aspect = w / h;
  const rect = (document.body.classList.contains("pacs-active") ? $("pacsPanel") : panel).getBoundingClientRect();
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
}

// what the 3D view shows, for anyone who can't see it
const viewLabel = name => $("views").querySelector(`[data-value="${name}"]`).textContent;
const say = text => { $("announce").textContent = text; };
function describe() {
  if (!rig.meta) return;
  const room = rig.meta.isolation ? `isolation room ${state.room}` : `standard room ${state.room}`;
  canvas.setAttribute("aria-label", `3D view of ${room}, ${viewLabel(state.view)} view, ${clock(state.hour)} solar time. Drag or use the arrow keys to look around, and plus and minus to move closer.`);
}

const clock = h => {
  const m = Math.round(h * 60), hh = Math.floor(m / 60) % 24, mm = m % 60;
  return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`;
};
const isNight = h => h >= NIGHT_FROM;

function relight() {
  const day = daylight.apply(state.hour);
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
  const stop = Object.entries(STOPS).find(([, v]) => Math.abs(v - h) < 0.2)?.[0];
  $("stops").querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.value === stop)); });
  invalidate();
}

async function setRoom(label, { keepView = true } = {}) {
  if (pacs.active) pacs.exit();
  state.room = label;
  pressed($("rooms"), label);
  const status = $("roomStatus");
  const known = stage.rooms.has(label);
  if (!known) status.textContent = "Loading the room…";
  const room = await stage.load(label, f => { status.textContent = `Loading the room… ${Math.round(f * 100)}%`; });
  if (state.room !== label) return; // another room was chosen while this one loaded
  stage.show(room);
  apis.setRoom(room);
  rig.setRoom(room.meta);
  if (!room.meta.cameras[state.view]) state.view = "overview";
  daylight.setCentre((room.meta.room[0] + room.meta.room[2]) / 2, (room.meta.room[1] + room.meta.room[3]) / 2);
  lighting.setRoom(room);
  glass.setRoom(room);
  applyAll();
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

canvas.addEventListener("keydown", e => {
  const s = 0.09, map = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  const zoom = { "+": 0.88, "=": 0.88, "-": 1.14, _: 1.14 }[e.key];
  if (!map && !zoom) return;
  e.preventDefault();
  if (map) rig.orbitBy(...map);
  else rig.dolly(zoom);
});

// ---------------------------------------------------------------- options, from options.json
let optionData = null, panelUi = null;
const selected = {};
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
  if (pacs.active) pacs.exit();
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
  if (pacs.active) pacs.exit();
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

// ---------------------------------------------------------------- Tune it in: the rules are in options.json, and resolved in profile.js
let idea = null; // the room idea just made, while it can still be compared or undone

function showSelections(next) {
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
  for (const mesh of stage.current?.parts.addon_ventilation || []) {
    for (const mat of [mesh.material].flat()) if (mat?.name === "vent_status") mat.color.set(tint);
  }
  invalidate();
}

function previewSoundAlert() {
  $("systemStatus").textContent = "Demo only: a high sound-level event was simulated. No audio was captured and no staff were contacted.";
  for (const mesh of stage.current?.parts.addon_soundSensor || []) {
    for (const mat of [mesh.material].flat()) if (mat?.name === "sound_indicator") mat.color.set("#e6a342");
  }
  invalidate();
  setTimeout(() => {
    for (const mesh of stage.current?.parts.addon_soundSensor || []) {
      for (const mat of [mesh.material].flat()) if (mat?.name === "sound_indicator") mat.color.set("#55b985");
    }
    invalidate();
  }, 2200);
}

$("demoTemp").addEventListener("input", setDemoReadout);
$("demoHumidity").addEventListener("input", setDemoReadout);
$("previewSoundAlert").addEventListener("click", previewSoundAlert);
$("closeObjectCard").addEventListener("click", () => { $("objectCard").hidden = true; canvas.focus({ preventScroll: true }); });
$("objectAction").addEventListener("click", e => {
  if (e.currentTarget.dataset.action === "wardrobe") {
    const open = toggleWardrobe(stage.current);
    e.currentTarget.textContent = open ? "Slide doors closed" : "Slide doors open";
    stage.renderer.shadowMap.needsUpdate = true;
    invalidate();
  } else if (e.currentTarget.dataset.action === "soundAlert") {
    previewSoundAlert();
  } else if (e.currentTarget.dataset.action.startsWith("apis:")) {
    apis.open(e.currentTarget.dataset.action.slice(5));
  } else if (e.currentTarget.dataset.action === "pacs") {
    pacs.open();
  }
});

function syncUi() {
  panelUi?.sync(selected, state.room);
  const theme = currentTheme();
  $("themes").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.value === theme?.id)));
  $("themeNote").textContent = theme ? theme.blurb : "Your own combination. Choose a theme to start again from it.";
  remember();
}

// ---------------------------------------------------------------- sharing: the room is in the URL
const specCode = () => encodeSpec(optionData, state, selected);
let rememberTimer = 0;
function remember() {
  if (!optionData || !window.__configReady) return;
  // not on every slider event: Safari refuses more than 100 replaceState calls in 30 seconds
  clearTimeout(rememberTimer);
  rememberTimer = setTimeout(() => history.replaceState(null, "", `#c=${specCode()}`), 250);
}

async function applySpec(spec) {
  if (pacs.active) pacs.exit();
  endIdea();
  for (const k of Object.keys(selected)) delete selected[k];
  Object.assign(selected, spec.selected);
  state.hour = spec.hour;
  state.view = spec.view;
  if (spec.room !== state.room || !stage.current) await setRoom(spec.room);
  else { applyAll(); rig.go(spec.view, { instant: true }); }
  setTime(spec.hour);
  syncUi();
}

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
  const dialog = $("summary");
  const picture = URL.createObjectURL(await captureBlob());
  const roomLabel = rig.meta.isolation ? `Isolation room ${state.room}, with ante room and toilet` : `Standard room ${state.room}`;
  const body = summaryContent(optionData, selected, state.room, { roomLabel, picture, code: specCode(), theme: currentTheme()?.label });
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
  if (spec && specCode() !== location.hash.slice(3)) applySpec(spec).catch(fail);
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
// anything the person does with the view ends the tour
canvas.addEventListener("pointerdown", () => { if (tour.running) tour.stop(); });
canvas.addEventListener("wheel", () => { if (tour.running) tour.stop(); }, { passive: true });
canvas.addEventListener("keydown", () => { if (tour.running) tour.stop(); });

// APIS owns a reversible inspection camera and separate schematic detail scene.
// Room options, profile answers, share codes and original model meshes stay independent.
const apis = new APIS({ stage, rig, controls, invalidate, stopTour: () => tour.stop() });
const pacs = new PACS({ stage, lighting, rig, controls, relight, invalidate,
  stopTour: () => tour.stop(), getState: () => state,
  closeApis: () => { const enabled = apis.enabled; if (apis.active) { apis.dialog.close(); apis.restore(); } apis.setEnabled(false); return enabled; },
  restoreApisMarkers: on => apis.setEnabled(on),
});
apis.beforeOpen = () => { if (pacs.active) pacs.exit(); };
pacs.restoreViewState = name => { state.view = name; syncViews(); remember(); describe(); };

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

function showObjectCard(info, x, y) {
  const card = $("objectCard"), action = $("objectAction");
  $("objectTitle").textContent = info.title;
  $("objectDescription").textContent = info.description;
  action.hidden = !info.action;
  action.dataset.action = info.action || "";
  if (info.action === "wardrobe") action.textContent = stage.current.addons?.wardrobe?.userData.open ? "Slide doors closed" : "Slide doors open";
  else if (info.action === "soundAlert") action.textContent = "Preview sound alert";
  else if (info.action?.startsWith("apis:")) action.textContent = "Inspect attachment in APIS";
  else if (info.action === "pacs") action.textContent = "Physiological Adaptive Mode";
  card.hidden = false;
  const rect = card.getBoundingClientRect(), panelRect = (pacs.active ? $("pacsPanel") : panel).getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + rect.width > panelRect.left && x < panelRect.left) left = Math.max(12, panelRect.left - rect.width - 12);
  if (left + rect.width > innerWidth - 12) left = innerWidth - rect.width - 12;
  if (matchMedia("(max-width: 820px)").matches && top + rect.height > panelRect.top) top = Math.max(12, panelRect.top - rect.height - 10);
  if (top + rect.height > innerHeight - 12) top = innerHeight - rect.height - 12;
  card.style.left = `${Math.max(12, left)}px`;
  card.style.top = `${Math.max(12, top)}px`;
  card.tabIndex = -1;
  card.focus({ preventScroll: true });
}

// Clicking any visible solid object identifies it. The wall switch keeps its existing interaction.
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
let pressAt = null;
canvas.addEventListener("pointerdown", e => { pressAt = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", e => {
  if (!pressAt || Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 6) return;
  pressAt = null;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(pointer, stage.camera);
  // Only the nearest solid object responds, so clicks don't pass through walls or equipment.
  const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  const hit = ray.intersectObject(stage.current.root, true).find(h => {
    if (!shown(h.object)) return false;
    if (glass.isSwitch(h.object)) return true;
    return [h.object.material].flat().filter(Boolean).every(m => !m.transparent && !m.transmission);
  });
  if (!hit) { $("objectCard").hidden = true; return; }
  if (apis.pick(hit.object)) return;
  if (glass.isSwitch(hit.object)) setOption("switch", selected.switch === "opaque" ? "clear" : "opaque");
  let info = null;
  for (let node = hit.object; node && node !== stage.current.root; node = node.parent) {
    if (node.userData.itemInfo) { info = node.userData.itemInfo; break; }
  }
  if (!info) {
    const top = stage.topName(hit.object, stage.current.root), known = OBJECT_DETAILS[top];
    const label = top.replace(/^cfg_(kit_|)/, "").replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase()) || "Room object";
    info = known ? { title: known[0], description: known[1] } : { title: label, description: "A modeled room surface or furnishing in this editable design proposal." };
    if (top === "cfg_kit_monitor") info.action = "pacs";
  }
  showObjectCard(info, e.clientX, e.clientY);
});

// ---------------------------------------------------------------- drawing: only when something has changed
let lastMovingDraw = 0;
const adaptive = !navigator.webdriver; // a software renderer in a test shouldn't talk itself down from what it's testing
function frame(now) {
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
  if (pacs.update(now)) dirty = true;
  if (dirty) {
    dirty = false;
    stage.draw();
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
  quality: () => ({ ratio: stage.renderer.getPixelRatio(), bloomDropped: stage.bloomDropped }),
  noteFrame: ms => stage.noteFrame(ms),
  /** Real cost of drawing while orbiting: the draw is followed by a pixel read, so it times the GPU finishing, not the display's refresh. */
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
  tier,
  set: setOption,
  selected: () => ({ ...selected }),
  options: () => optionData,
  partNames: () => Object.keys(stage.current.parts),
  roomVents: () => rig.meta.vents,
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
};

async function boot() {
  window.__configStage = "fetching options";
  const res = await fetch("options.json");
  if (!res.ok) throw new Error(`options.json: HTTP ${res.status}`);
  optionData = await res.json();
  for (const sec of optionData.sections) for (const g of sec.groups) selected[g.id] = g.default;
  panelUi = new Panel($("options"), optionData, setOption);
  $("themes").replaceChildren(...optionData.themes.map(t => Object.assign(document.createElement("button"), { type: "button", textContent: t.label })));
  $("themes").querySelectorAll("button").forEach((b, i) => { b.dataset.value = optionData.themes[i].id; });
  resize();
  const fromLink = location.hash ? decodeSpec(optionData, location.hash) : null;
  if (fromLink) {
    Object.assign(selected, fromLink.selected);
    state.room = fromLink.room; state.view = fromLink.view; state.hour = fromLink.hour;
  }
  await setRoom(state.room, { keepView: true });
  setDemoReadout();
  window.__configStage = "setting the time";
  setTime(state.hour);
  window.__configStage = "drawing the first frame";
  if (location.hash && !fromLink) $("roomStatus").textContent = "That link's code couldn't be read, so this is the default room.";
  $("load").hidden = true;
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.remove("pending");
    window.__configStage = "ready";
    window.__configReady = true;
    remember();
  }));
}
boot().catch(fail);
