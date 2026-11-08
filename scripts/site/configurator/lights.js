// Electric lighting. The numbers for each scheme live in options.json; this turns them into lights and glowing fixtures.
// Each scheme turns on only the lights it uses, because every light costs on every pixel: measured on an M5 at 2x, all of them
// on at zero brightness took 43 ms a frame. The price is a short recompile the first time a scheme is chosen.
// Real-time lights don't bounce, so a cove's soft glow is drawn: a gradient on the ceiling and wall, and a bright strip for the bloom pass.
import * as THREE from "three";
import { W2T } from "./stage.js";

export function kelvinColour(k) {
  const t = k / 100;
  const r = t <= 66 ? 255 : 329.7 * (t - 60) ** -0.1332;
  const g = t <= 66 ? 99.47 * Math.log(t) - 161.12 : 288.12 * (t - 60) ** -0.0755;
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  const c = v => Math.min(1, Math.max(0, v / 255));
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}

const between = (a, b, h, x0, x1) => a + (b - a) * Math.min(1, Math.max(0, (h - x0) / (x1 - x0)));
/** Tunable white: warm at the ends of the day, cool around midday, warmest late at night. */
export function autoKelvin(h) {
  if (h < 10) return between(2700, 4800, h, 6.5, 10);
  if (h < 15) return 4800;
  if (h < 19) return between(4800, 2700, h, 15, 19);
  return between(2700, 2200, h, 19, 21.5);
}
const circadianLevel = h => between(1, 0.42, h, 18.5, 21.5);
const AMBER = new THREE.Color().setRGB(1, 0.42, 0.07, THREE.SRGBColorSpace);

/** Quads with a brightness per corner, for additive glows. */
class GlowGeometry {
  constructor() { this.p = []; this.c = []; }
  quad(a, b, c, d, ca, cb, cc, cd) {
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (const v of [ca, cb, cc, ca, cc, cd]) this.c.push(v, v, v);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

const glowMaterial = () => new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide });

export class Lighting {
  constructor(stage, daylight, tier) {
    this.stage = stage; this.daylight = daylight; this.tier = tier;
    const nRect = tier === "low" ? 2 : 4, nSpot = tier === "low" ? 3 : 6;
    this.rects = Array.from({ length: nRect }, () => {
      const l = new THREE.RectAreaLight(0xffffff, 0, 1, 1);
      l.rotation.order = "YXZ";
      stage.scene.add(l);
      return l;
    });
    this.spots = Array.from({ length: nSpot }, () => {
      const l = new THREE.SpotLight(0xffffff, 0, 0, 0.72, 0.8, 1.7);
      stage.scene.add(l, l.target);
      return l;
    });
    this.reading = new THREE.SpotLight(0xfff0dc, 0, 5, 0.42, 0.6, 1.5);
    stage.scene.add(this.reading, this.reading.target);
    // the examination task light: straight down from the ceiling fitting over the bed, on its own switch
    this.task = new THREE.SpotLight(0xffffff, 0, 4.5, 0.55, 0.5, 1.4);
    this.task.visible = false;
    stage.scene.add(this.task, this.task.target);
    this.params = { scheme: { kind: "panels", rect: 30, fill: 0.4, panel: 2.2 }, kelvin: 4000, reading: false, nightLight: "off", task: false };
    // a room mode's look, { kelvin, level }, laid over the configured light (main.js eases it), and whether it turns the task light on
    this.scene = null; this.sceneTask = false;
    this.day = 1;
    this.room = null;
    this.colour = new THREE.Color();
  }

  fixturesFor(room) {
    if (room.fixtures) return room.fixtures;
    const m = room.meta, H = m.ceiling, group = new THREE.Group();
    const strip = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const glow = glowMaterial(), floorGlow = glowMaterial(), amber = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const coveStrip = new GlowGeometry(), coveGlow = new GlowGeometry(), nightStrip = new GlowGeometry(), nightGlow = new GlowGeometry();
    for (const run of m.wall_runs) {
      const [ax, ay] = run.a, [bx, by] = run.b;
      const len = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / len, ny = (bx - ax) / len; // into the room
      const at = (d, z, t) => { const x = ax + (bx - ax) * t + nx * d, y = ay + (by - ay) * t + ny * d, v = W2T(x, y, z); return [v.x, v.y, v.z]; };
      coveStrip.quad(at(0.03, H - 0.012, 0), at(0.03, H - 0.012, 1), at(0.12, H - 0.012, 1), at(0.12, H - 0.012, 0), 1, 1, 1, 1);
      coveGlow.quad(at(0.02, H - 0.016, 0), at(0.02, H - 0.016, 1), at(1.25, H - 0.016, 1), at(1.25, H - 0.016, 0), 1, 1, 0, 0);
      coveGlow.quad(at(0.012, H - 0.01, 0), at(0.012, H - 0.01, 1), at(0.012, H - 1.15, 1), at(0.012, H - 1.15, 0), 0.8, 0.8, 0, 0);
      if (!run.door) {
        nightStrip.quad(at(0.035, 0.2, 0), at(0.035, 0.2, 1), at(0.035, 0.235, 1), at(0.035, 0.235, 0), 1, 1, 1, 1);
        nightGlow.quad(at(0.03, 0.012, 0), at(0.03, 0.012, 1), at(1.2, 0.012, 1), at(1.2, 0.012, 0), 1, 1, 0, 0);
        nightGlow.quad(at(0.018, 0.01, 0), at(0.018, 0.01, 1), at(0.018, 0.75, 1), at(0.018, 0.75, 0), 0.7, 0.7, 0, 0);
      }
    }
    const mesh = (geo, mat, order = 0) => { const n = new THREE.Mesh(geo, mat); n.renderOrder = order; group.add(n); return n; };
    const f = {
      group, strip, glow, amber, floorGlow,
      cove: [mesh(coveStrip.build(), strip), mesh(coveGlow.build(), glow, 1)],
      night: [mesh(nightStrip.build(), amber), mesh(nightGlow.build(), floorGlow, 1)],
      slot: [], discs: [],
      readingLamp: null,
    };
    strip.side = THREE.DoubleSide; amber.side = THREE.DoubleSide;
    for (const [ax, ay, bx, by] of m.fixtures.slots) {
      const len = Math.hypot(bx - ax, by - ay), n = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.07), strip);
      n.position.copy(W2T((ax + bx) / 2, (ay + by) / 2, H - 0.008));
      n.rotation.y = Math.atan2(by - ay, bx - ax);
      group.add(n); f.slot.push(n);
    }
    const discGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20);
    for (const [x, y] of m.fixtures.downlights) {
      const n = new THREE.Mesh(discGeo, strip);
      n.position.copy(W2T(x, y, H - 0.008));
      group.add(n); f.discs.push(n);
    }
    // the reading lamp: a small pendant above the bed head
    const a = room.anchors.reading_light;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.09, 16), new THREE.MeshStandardMaterial({ color: "#d9dde0", roughness: 0.4, emissive: "#fff0dc", emissiveIntensity: 0 }));
    a.getWorldPosition(lamp.position);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, H - lamp.position.y, 8), lamp.material);
    stem.position.set(lamp.position.x, (H + lamp.position.y) / 2, lamp.position.z);
    room.root.add(lamp, stem, group);
    f.readingLamp = lamp;
    // the examination light's lens, lit when the task light is on. Its own disc, so the fitting's material stays as exported
    room.root.updateMatrixWorld(true);
    const exam = new THREE.Box3();
    (room.parts.cfg_kit_exam_light || []).forEach(n => exam.expandByObject(n));
    if (!exam.isEmpty()) {
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.26, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lens.rotation.x = Math.PI / 2; // facing down
      const c = exam.getCenter(new THREE.Vector3());
      lens.position.set(c.x, exam.min.y - 0.003, c.z);
      lens.visible = false;
      lens.raycast = () => {}; // a click names the fitting, not the lens
      room.root.add(lens);
      f.taskLens = lens;
    }
    room.fixtures = f;
    room.ceilingFixtures = [f.cove[0], f.cove[1], ...f.slot, ...f.discs];
    return f;
  }

  setRoom(room) {
    this.room = room;
    this.fixturesFor(room);
    this.layout();
  }

  set(partial) {
    Object.assign(this.params, partial);
    if (this.room) this.layout();
  }

  /** Place the fixed lights for the scheme and show its fixtures. */
  layout() {
    const m = this.room.meta, H = m.ceiling, kind = this.params.scheme.kind, f = this.room.fixtures;
    f.cove.forEach(n => { n.userData.schemeOn = kind === "cove"; });
    f.slot.forEach(n => { n.userData.schemeOn = kind === "slot"; });
    f.discs.forEach(n => { n.userData.schemeOn = kind === "downlights"; });
    (this.room.parts.cfg_panels || []).forEach(n => { n.userData.schemeOn = kind === "panels"; });
    this.stage.refreshCeiling();

    let places = [];
    if (kind === "panels") places = m.panels.map(([x, y]) => ({ x, y, z: H - 0.02, w: 0.6, h: 0.6, yaw: 0 }));
    if (kind === "slot") places = m.fixtures.slots.map(([ax, ay, bx, by]) => ({ x: (ax + bx) / 2, y: (ay + by) / 2, z: H - 0.02, w: Math.hypot(bx - ax, by - ay), h: 0.12, yaw: Math.atan2(by - ay, bx - ax) }));
    if (kind === "cove") {
      // a soft sheet of light along each of the longest walls
      places = m.wall_runs.filter(r => !r.door)
        .map(r => { const dx = r.b[0] - r.a[0], dy = r.b[1] - r.a[1], len = Math.hypot(dx, dy); return { len, x: (r.a[0] + r.b[0]) / 2 - (dy / len) * 0.7, y: (r.a[1] + r.b[1]) / 2 + (dx / len) * 0.7, z: H - 0.12, w: len, h: 1.0, yaw: Math.atan2(dy, dx) }; })
        .sort((a, b) => b.len - a.len);
    }
    this.rectWeight = places.length ? Math.max(1, Math.min(places.length, 4) / this.rects.length) : 1;
    this.rects.forEach((l, i) => {
      const p = places[i];
      l.visible = !!p;
      if (!p) return;
      l.position.copy(W2T(p.x, p.y, p.z));
      l.width = p.w; l.height = p.h;
      l.rotation.set(-Math.PI / 2, p.yaw, 0);
    });
    const downs = kind === "downlights" ? m.fixtures.downlights : [];
    this.spotWeight = downs.length ? Math.max(1, downs.length / this.spots.length) : 1;
    this.spots.forEach((l, i) => {
      const p = downs[i];
      l.visible = !!p;
      if (!p) return;
      l.position.copy(W2T(p[0], p[1], H - 0.03));
      l.target.position.copy(W2T(p[0], p[1], 0));
      l.target.updateMatrixWorld();
    });
    const lamp = f.readingLamp;
    this.reading.position.copy(lamp.position);
    const bed = W2T(m.bed.head[0] + m.bed.foot[0] * 0.45, m.bed.head[1] + m.bed.foot[1] * 0.45, 0.7);
    this.reading.target.position.copy(bed);
    this.reading.target.updateMatrixWorld();
    if (f.taskLens) {
      this.task.position.copy(f.taskLens.position);
      this.task.position.y -= 0.02;
      this.task.target.position.set(f.taskLens.position.x, 0.6, f.taskLens.position.z);
      this.task.target.updateMatrixWorld();
    }
  }

  /** The room's electric light as configured, before any mode or PACS look: colour temperature and level. */
  base(hour, day = this.day) {
    const p = this.params, s = p.scheme;
    let level = s.circadian ? circadianLevel(hour) : 1;
    if (p.nightLight === "rounds" && 1 - day > 0.5) level = 0;
    return { kelvin: p.kelvin === "auto" ? autoKelvin(hour) : p.kelvin, level };
  }

  /** Whether the examination task light is on, by its own switch or a mode's. */
  get taskOn() { return !!(this.params.task || this.sceneTask) && !!this.room?.fixtures?.taskLens; }

  /** Set brightness and colour for the time of day. */
  update(hour, day) {
    const p = this.params, s = p.scheme, f = this.room?.fixtures;
    if (!f) return;
    this.day = day;
    // a room mode's look replaces the configured one while it's on; neither changes the option settings
    const look = this.scene || this.base(hour, day);
    const k = this.comfort?.kelvin ?? look.kelvin;
    const col = this.colour.copy(kelvinColour(k));
    const night = 1 - day;
    let level = look.level;
    level *= this.comfort?.level ?? 1; // transient PACS rendering overlay; original option settings are preserved

    this.rects.forEach(l => { l.color.copy(col); l.intensity = (s.rect || 0) * level * this.rectWeight; });
    this.spots.forEach(l => { l.color.copy(col); l.intensity = (s.spot || 0) * level * this.spotWeight; });
    f.strip.color.copy(col).multiplyScalar((s.strip || s.disc || 1) * Math.max(level, 0.02));
    f.glow.color.copy(col).multiplyScalar((s.glow || 0) * level * (0.45 + 0.55 * night));
    for (const n of this.room.parts.cfg_panels || []) {
      n.material.emissive.copy(col);
      n.material.emissiveIntensity = (s.panel || 0) * level;
    }

    this.reading.visible = p.reading;
    this.reading.intensity = 9;
    this.reading.color.copy(kelvinColour(Math.min(k, 3000)));
    f.readingLamp.material.emissiveIntensity = p.reading ? 3 : 0;

    const task = this.taskOn;
    this.task.visible = task;
    this.task.intensity = 26;
    this.task.color.copy(kelvinColour(4500));
    if (f.taskLens) f.taskLens.visible = task;

    const nightOn = p.nightLight !== "off";
    f.night.forEach(n => { n.visible = nightOn; });
    f.amber.color.copy(AMBER).multiplyScalar(2.2);
    f.floorGlow.color.copy(AMBER).multiplyScalar(0.2 * (0.15 + 0.85 * night));

    const fill = s.fill * level + (nightOn ? 0.015 : 0) + (p.reading ? 0.02 : 0) + (task ? 0.03 : 0);
    this.daylight.setFill(fill, col);
    this.stage.setBloom(0.5 * night);
  }
}
