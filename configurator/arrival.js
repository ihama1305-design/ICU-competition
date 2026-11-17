// When someone comes in, in the room: a plain standing figure for a nurse, a doctor or a family visitor, walking the route
// from the door to the bedside (layout.js ROUTES) and back. arrival-data.js has who they are and the walk's arithmetic.
// SIMULATED: the figure stands in for a person in a demo. It has no face and no name, it senses nothing, and nothing
// recognises it. Drawn in code in the patient figure's style (patient.js), built the first time a role comes in.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { ROUTES } from "./layout.js";
import { ARRIVALS, ARRIVAL_TEXT, WALK, along, routeLength, walked, walkTime } from "./arrival-data.js";

const SKIN = "#bd957f", SHOE = "#3a4046";
const mat = color => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
function ball(parent, [x, y, z], [sx, sy, sz], material) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), material);
  m.position.set(x, y, z); m.scale.set(sx, sy, sz);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/** A standing adult, 1.7 m, facing its own +z, feet on the floor at its origin. The legs and arms hang from pivots, to swing. */
function figure(role) {
  const who = ARRIVALS[role], root = new THREE.Group(), top = mat(who.top), legs = mat(who.legs), skin = mat(SKIN), shoe = mat(SHOE);
  root.name = `arrival_${role}`;
  const limb = (x, y, build) => { const pivot = new THREE.Group(); pivot.position.set(x, y, 0); build(pivot); root.add(pivot); return pivot; };
  const leg = side => limb(side * 0.095, 0.9, p => { ball(p, [0, -0.43, 0], [0.085, 0.45, 0.095], legs); ball(p, [0, -0.865, 0.045], [0.062, 0.035, 0.125], shoe); });
  const arm = side => limb(side * 0.245, 1.4, p => { ball(p, [0, -0.28, 0], [0.055, 0.3, 0.062], top); ball(p, [0, -0.6, 0], [0.045, 0.06, 0.04], skin); });
  const parts = { legs: [leg(-1), leg(1)], arms: [arm(-1), arm(1)] };
  ball(root, [0, 1.0, 0], [0.185, 0.16, 0.125], legs); // hips
  ball(root, [0, 1.25, 0], [0.205, 0.3, 0.13], top); // torso
  ball(root, [0, 1.5, 0], [0.055, 0.06, 0.055], skin); // neck
  ball(root, [0, 1.6, 0], [0.095, 0.115, 0.105], skin); // head: no face, no hair, no name
  // what they tapped at the door: a badge on the chest, or a visitor's pass on a lanyard
  const pass = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.075, 0.008), mat(who.badge));
  pass.position.set(role === "family" ? 0 : 0.09, role === "family" ? 1.18 : 1.3, 0.128);
  root.add(pass);
  const info = { title: `A made-up ${who.label.toLowerCase()} · SIMULATED`, description: ARRIVAL_TEXT.figure };
  root.traverse(n => { if (n.isMesh) n.userData.itemInfo = info; });
  root.visible = false;
  return { root, ...parts };
}

export class Arrival {
  constructor() { this.walk = null; this.rooms = new Set(); }

  /** Whether someone is walking in or out right now. */
  get moving() { return !!this.walk; }

  /** The figure for a role in a room, built once and left hidden until it's wanted. */
  ensure(room, role) {
    room.arrival ||= { figures: {}, role: null };
    if (!room.arrival.figures[role]) {
      const f = figure(role);
      room.root.add(f.root);
      room.arrival.figures[role] = f;
    }
    this.rooms.add(room);
    return room.arrival.figures[role];
  }

  /** The bed's middle, in plan metres: what a person at the bedside turns to face. */
  bedside(room) { const b = room.meta.bed; return [b.head[0] + b.foot[0] * 1.0, b.head[1] + b.foot[1] * 1.0]; }

  /** Stand a figure `d` metres along the room's route, mid-stride by how far it has come. `swing`: 0 standing to 1 walking. */
  place(room, f, d, swing) {
    const p = along(ROUTES[room.label], d, this.bedside(room)), phase = (d / WALK.stride) * Math.PI;
    f.root.position.copy(W2T(p.x, p.y, Math.abs(Math.sin(phase)) * 0.018 * swing));
    f.root.rotation.y = p.heading + Math.PI / 2; // the figure faces its own +z; plan north is three.js -z
    f.legs.forEach((n, i) => { n.rotation.x = Math.sin(phase) * WALK.leg * swing * (i ? -1 : 1); });
    f.arms.forEach((n, i) => { n.rotation.x = Math.sin(phase) * WALK.arm * swing * (i ? 1 : -1); });
  }

  /**
   * Someone comes in: `role` walks from the door to the bedside. null: whoever is in walks back out and is gone.
   * `instant` (reduced motion): they are at the bedside, or gone, at once. Returns whether anything changed.
   */
  start(room, role, { instant = false, now = performance.now() } = {}) {
    if (!room || !ROUTES[room.label]) return false;
    const length = routeLength(ROUTES[room.label]), here = room.arrival?.role || null;
    if (role && !ARRIVALS[role]) return false;
    if (!role && !here) return false;
    if (role && here && here !== role) { room.arrival.figures[here].root.visible = false; room.arrival.role = null; }
    const who = role || here, f = this.ensure(room, who), leaving = !role;
    f.root.visible = true;
    room.arrival.role = who;
    if (instant) {
      this.walk = null;
      if (leaving) { f.root.visible = false; room.arrival.role = null; } else this.place(room, f, length, 0);
      return true;
    }
    this.walk = { room, f, length, leaving, t0: now };
    this.place(room, f, leaving ? length : 0, 0);
    return true;
  }

  /** Move the walk on. Returns true while there is something new to draw. */
  update(now) {
    const w = this.walk;
    if (!w) return false;
    const t = (now - w.t0) / 1000, total = walkTime(w.length), u = Math.min(1, t / total), d = walked(w.length, t);
    this.place(w.room, w.f, w.leaving ? w.length - d : d, Math.min(1, 4 * u * (1 - u) * 1.6)); // the stride fades in and out with the pace
    if (u >= 1) {
      this.walk = null;
      if (w.leaving) { w.f.root.visible = false; w.room.arrival.role = null; } else this.place(w.room, w.f, w.length, 0);
    }
    return true;
  }

  /** Everyone gone, in every room, at once. Returns whether anyone was there. */
  clear() {
    let was = !!this.walk;
    this.walk = null;
    for (const room of this.rooms) {
      if (room.arrival.role) was = true;
      Object.values(room.arrival.figures).forEach(f => { f.root.visible = false; });
      room.arrival.role = null;
    }
    return was;
  }

  /** For the checks: who is in the room, where they stand in plan metres, and whether they're still walking. */
  state(room) {
    const role = room?.arrival?.role || null, f = role ? room.arrival.figures[role] : null;
    const route = room ? ROUTES[room.label] : null;
    return { role, moving: this.moving, leaving: !!this.walk?.leaving, door: route?.[0] ?? null, bedside: route?.at(-1) ?? null, at: f ? [+f.root.position.x.toFixed(2), +(-f.root.position.z).toFixed(2)] : null, shown: !!f?.root.visible };
  }
}
