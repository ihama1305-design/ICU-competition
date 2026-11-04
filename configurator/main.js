// Room configurator: a design proposal, built on the as-built model of one room.
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { Stage, W2T } from "./stage.js";
import { Rig, inside } from "./cameras.js";
import { Daylight, sunAt } from "./sky.js";

window.__configErrors = [];
addEventListener("error", e => window.__configErrors.push(String(e.message)));
addEventListener("unhandledrejection", e => window.__configErrors.push(String(e.reason)));
document.addEventListener("touchstart", () => {}, { passive: true }); // iOS Safari only applies :active once the page listens for touches

const SITE = {"latitude_deg": 24.45, "declination_deg": -2.5, "north_offset_deg": 0};
const STOPS = { morning: 8.5, midday: 12, afternoon: 15.53, sunset: 17.75, night: 21 };
const NIGHT_FROM = 18.4;
const $ = id => document.getElementById(id);

const canvas = $("c"), panel = $("panel");
const stage = new Stage(canvas);
const controls = new OrbitControls(stage.camera, canvas);
const state = { room: "W1", view: "family", hour: STOPS.afternoon };
let dirty = true, lastDayHour = STOPS.afternoon;
const invalidate = () => { dirty = true; };
const rig = new Rig(stage.camera, controls, W2T, invalidate);
const daylight = new Daylight(stage.scene, SITE, W2T);
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
  stage.renderer.setSize(w, h, false);
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

function setTime(h) {
  state.hour = h;
  if (!isNight(h)) lastDayHour = h;
  daylight.apply(h);
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
  daylight.apply(state.hour);
  rig.view = null;
  rig.go(keepView ? state.view : "family", { instant: true });
  stage.setCeiling(state.view !== "dollhouse");
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

// ---------------------------------------------------------------- drawing: only when something has changed
function frame(now) {
  requestAnimationFrame(frame);
  if (!rig.meta) return;
  if (rig.update(now)) dirty = true;
  if (dirty) {
    dirty = false;
    stage.renderer.render(stage.scene, stage.camera);
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
  state: () => ({ ...state, night: isNight(state.hour), sun: sunAt(state.hour, SITE), moving: !!rig.tween, ceiling: stage.current?.ceiling.every(n => n.visible) }),
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
  anchors: () => Object.keys(stage.current.anchors),
};

resize();
setTime(state.hour);
setRoom(state.room, { keepView: true }).then(() => {
  $("load").hidden = true;
  requestAnimationFrame(frame);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.remove("pending");
    window.__configReady = true;
  }));
}).catch(fail);
