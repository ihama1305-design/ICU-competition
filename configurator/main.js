// Room configurator: a design proposal, built on the as-built model of one room.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stage, W2T } from "./stage.js";
import { Rig, inside } from "./cameras.js";
import { Daylight, sunAt } from "./sky.js";
import { Lighting } from "./lights.js";
import { FrontGlass } from "./glass.js";
import { applyLook } from "./surfaces.js";
import { setAddon } from "./addons.js";
import { Panel } from "./panel.js";

window.__configErrors = [];
addEventListener("error", e => window.__configErrors.push(String(e.message)));
addEventListener("unhandledrejection", e => window.__configErrors.push(String(e.reason)));
document.addEventListener("touchstart", () => {}, { passive: true }); // iOS Safari only applies :active once the page listens for touches

const SITE = {"latitude_deg": 24.45, "declination_deg": -2.5, "north_offset_deg": 0};
const STOPS = { morning: 8.5, midday: 12, afternoon: 15.53, sunset: 17.75, night: 21 };
const NIGHT_FROM = 18.4;
const $ = id => document.getElementById(id);

const canvas = $("c"), panel = $("panel");
const query = new URLSearchParams(location.search);
// phones and small screens skip bloom and glass transmission, and get fewer lights
const tier = query.get("tier") || (matchMedia("(pointer: coarse)").matches || Math.min(screen.width, screen.height) < 600 ? "low" : "high");
const stage = new Stage(canvas, tier);
const controls = new OrbitControls(stage.camera, canvas);
const state = { room: "W1", view: "family", hour: STOPS.afternoon };
let dirty = true, lastDayHour = STOPS.afternoon;
const invalidate = () => { dirty = true; };
const rig = new Rig(stage.camera, controls, W2T, invalidate);
const daylight = new Daylight(stage.scene, SITE, W2T);
const lighting = new Lighting(stage, daylight, tier);
const glass = new FrontGlass(tier);
controls.addEventListener("change", invalidate);
rig.onView = (name, isDoll) => {
  // going up: the ceiling goes first, so the camera doesn't pass through it. Coming down: it returns on arrival
  if (isDoll) stage.setCeiling(false);
  state.view = name;
  syncViews();
};
rig.onArrive = name => { if (name !== "dollhouse") stage.setCeiling(true); invalidate(); };

// ---------------------------------------------------------------- layout
function resize() {
  const w = innerWidth, h = innerHeight;
  stage.resize(w, h);
  stage.camera.aspect = w / h;
  const rect = panel.getBoundingClientRect();
  const phone = matchMedia("(max-width: 820px)").matches;
  const coverX = phone || !rect.width ? 0 : w - rect.left;
  const coverY = phone && rect.height ? Math.max(0, h - rect.top) : 0;
  // keep the room centred in the part of the screen the panel leaves free
  stage.camera.setViewOffset(w, h, coverX / 2, coverY / 2, w, h);
  rig.visible = { w: w - coverX, h: h };
  if (rig.meta) rig.fit();
  $("panelBody").inert = phone && !panel.classList.contains("open"); // a closed sheet's controls are off-screen
  stage.camera.updateProjectionMatrix();
  invalidate();
}
addEventListener("resize", resize);
new ResizeObserver(resize).observe(panel);
panel.addEventListener("transitionend", e => { if (e.target === panel && e.propertyName === "transform") resize(); });

// ---------------------------------------------------------------- controls
function pressed(group, value) {
  group.querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.value === value)); });
}
function syncViews() { pressed($("views"), state.view); }

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
  pressed($("dayNight"), isNight(h) ? "night" : "day");
  const stop = Object.entries(STOPS).find(([, v]) => Math.abs(v - h) < 0.2)?.[0];
  $("stops").querySelectorAll("button").forEach(b => { b.setAttribute("aria-pressed", String(b.dataset.value === stop)); });
  invalidate();
}

async function setRoom(label, { keepView = true } = {}) {
  state.room = label;
  pressed($("rooms"), label);
  const status = $("roomStatus");
  const known = stage.rooms.has(label);
  if (!known) status.textContent = "Loading the room…";
  const room = await stage.load(label, f => { status.textContent = `Loading the room… ${Math.round(f * 100)}%`; });
  if (state.room !== label) return; // another room was chosen while this one loaded
  stage.show(room);
  rig.setRoom(room.meta);
  daylight.setCentre((room.meta.room[0] + room.meta.room[2]) / 2, (room.meta.room[1] + room.meta.room[3]) / 2);
  lighting.setRoom(room);
  glass.setRoom(room);
  applyAll();
  relight();
  rig.view = null;
  rig.go(keepView ? state.view : "family", { instant: true });
  stage.setCeiling(state.view !== "dollhouse");
  panelUi?.sync(selected, label);
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
$("views").addEventListener("click", e => { const b = e.target.closest("button"); if (b) rig.go(b.dataset.value); });
$("dayNight").addEventListener("click", e => {
  const b = e.target.closest("button");
  if (b) setTime(b.dataset.value === "night" ? STOPS.night : lastDayHour);
});
$("stops").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setTime(STOPS[b.dataset.value]); });
$("time").addEventListener("input", e => setTime(Number(e.target.value)));

const sheet = $("sheet");
sheet.addEventListener("click", () => {
  const open = panel.classList.toggle("open");
  sheet.setAttribute("aria-expanded", String(open));
  sheet.setAttribute("aria-label", open ? "Hide the options" : "Show the options");
  resize();
});

canvas.addEventListener("keydown", e => {
  const s = 0.09, map = { ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] }[e.key];
  if (!map) return;
  e.preventDefault();
  rig.orbitBy(...map);
});

// ---------------------------------------------------------------- options, from options.json
let optionData = null, panelUi = null;
const selected = {};
const optionOf = (groupId, optionId) => groupById(groupId).options.find(o => o.id === optionId);
const groupById = id => optionData.sections.flatMap(s => s.groups).find(g => g.id === id);

const EFFECTS = {
  color: e => { for (const n of Object.values(stage.current.parts).flat()) if (n.material.name === e.material) n.material.color.set(e.value); },
  material: e => applyLook(stage.current, e.target, e.look),
  visible: e => { (stage.current.parts[e.part] || []).forEach(n => { n.visible = e.on; }); },
  addon: e => { setAddon(stage.current, e.id, e.on); stage.refreshCeiling(); },
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
};

function runEffects(group, optionId) {
  if (optionId === "custom") {
    EFFECTS[group.custom.effect.do]({ ...group.custom.effect, value: selected[`${group.id}:custom`] });
    return;
  }
  for (const e of optionOf(group.id, optionId).effects) EFFECTS[e.do](e);
}

/** Bring a newly shown room up to the current selections. */
function applyAll() {
  for (const s of optionData.sections) for (const g of s.groups) runEffects(g, selected[g.id]);
  stage.renderer.shadowMap.needsUpdate = true;
}

function setOption(groupId, optionId, custom) {
  const group = groupById(groupId);
  if (custom !== undefined) selected[`${groupId}:custom`] = custom;
  selected[groupId] = optionId;
  runEffects(group, optionId);
  const also = optionId === "custom" ? null : optionOf(groupId, optionId).sets;
  for (const [g, o] of Object.entries(also || {})) {
    selected[g] = o;
    runEffects(groupById(g), o);
  }
  stage.renderer.shadowMap.needsUpdate = true;
  relight();
  panelUi.sync(selected, state.room);
}

// the wall switch in the room works too
const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
let pressAt = null;
canvas.addEventListener("pointerdown", e => { pressAt = [e.clientX, e.clientY]; });
canvas.addEventListener("pointerup", e => {
  if (!pressAt || Math.hypot(e.clientX - pressAt[0], e.clientY - pressAt[1]) > 6) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  if (!glass.switchTargets().length) return;
  ray.setFromCamera(pointer, stage.camera);
  // the nearest solid thing along the ray has to be the switch: it can't be pressed through a wall
  const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
  const hit = ray.intersectObject(stage.current.root, true).find(h => shown(h.object) && !h.object.material.transparent && !h.object.material.transmission);
  if (hit && glass.isSwitch(hit.object)) setOption("switch", selected.switch === "opaque" ? "clear" : "opaque");
});

// ---------------------------------------------------------------- drawing: only when something has changed
function frame(now) {
  requestAnimationFrame(frame);
  if (!rig.meta) return;
  if (rig.update(now)) dirty = true;
  if (glass.update(now)) dirty = true;
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
  state: () => ({ ...state, night: isNight(state.hour), sun: sunAt(state.hour, SITE), moving: !!rig.tween, ceiling: stage.ceilingOn, roomBox: rig.meta?.room }),
  views: () => Object.keys(rig.meta.cameras),
  room: label => setRoom(label),
  camera: (name, opts) => rig.go(name, opts),
  time: setTime,
  stops: STOPS,
  orbit: (yaw, pitch) => rig.orbitBy(yaw, pitch),
  zoomOut: k => { const p = stage.camera.position, t = controls.target; p.sub(t).multiplyScalar(k).add(t); rig.clamp(); invalidate(); },
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
  ceiling: () => rig.meta.ceiling,
  anchors: () => Object.fromEntries(Object.entries(stage.current.anchors).map(([k, a]) => { const v = new THREE.Vector3(); a.getWorldPosition(v); return [k, [v.x, -v.z, v.y]]; })),
  tier,
  set: setOption,
  selected: () => ({ ...selected }),
  options: () => optionData,
  fading: () => glass.fading,
  /** Stand in front of the wall switch and return where it is on screen. */
  frameSwitch: () => {
    const f = rig.meta.front, a = stage.current.anchors.switch, p = new THREE.Vector3();
    a.getWorldPosition(p);
    p.y = 1.2;
    rig.go("family", { instant: true });
    stage.camera.position.copy(p).add(W2T(f.inward[0] * 1.2, f.inward[1] * 1.2, 0.1));
    controls.target.copy(p);
    controls.update();
    stage.camera.updateMatrixWorld();
    invalidate();
    const s = p.clone().project(stage.camera);
    return { x: ((s.x + 1) / 2) * innerWidth, y: ((1 - s.y) / 2) * innerHeight };
  },
};

async function boot() {
  const res = await fetch("options.json");
  if (!res.ok) throw new Error(`options.json: HTTP ${res.status}`);
  optionData = await res.json();
  for (const sec of optionData.sections) for (const g of sec.groups) selected[g.id] = g.default;
  panelUi = new Panel($("options"), optionData, setOption);
  resize();
  await setRoom(state.room, { keepView: true });
  setTime(state.hour);
  $("load").hidden = true;
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.remove("pending");
    window.__configReady = true;
  }));
}
boot().catch(fail);
