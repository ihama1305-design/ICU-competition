// Set views with eased moves between them, and free orbit that can't leave the room.
import * as THREE from "three";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const DURATION = 1500;
// a look_around view (Patient View) turns about a point this close in front of the eye, so the eye itself stays put
const LOOK_R = 0.05;
// how far either way it turns from where it first looks, in radians: about as far as a head and eyes can
const HEAD_TURN = 1.75;

/** Where a->b first leaves the polygon, as a fraction of the way along it; 1 if it never does. */
function exitFraction(ax, ay, bx, by, poly) {
  let best = 1;
  for (let i = 0; i < poly.length; i++) {
    const [px, py] = poly[i], [qx, qy] = poly[(i + 1) % poly.length];
    const rx = bx - ax, ry = by - ay, sx = qx - px, sy = qy - py;
    const d = rx * sy - ry * sx;
    if (Math.abs(d) < 1e-9) continue;
    const t = ((px - ax) * sy - (py - ay) * sx) / d, u = ((px - ax) * ry - (py - ay) * rx) / d;
    if (t >= 0 && t < best && u >= 0 && u <= 1) best = t;
  }
  return best;
}

export function inside(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/** An azimuth held between min and max, which may run across the -pi/pi seam. */
function turnWithin(theta, min, max) {
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const t = wrap(theta), lo = wrap(min), hi = wrap(max);
  const within = lo <= hi ? t >= lo && t <= hi : t >= lo || t <= hi;
  if (within) return t;
  const gap = a => Math.abs(wrap(t - a));
  return gap(lo) < gap(hi) ? lo : hi;
}

export class Rig {
  constructor(camera, controls, W2T, onChange) {
    this.camera = camera; this.controls = controls; this.W2T = W2T; this.onChange = onChange;
    this.meta = null; this.view = null; this.tween = null; this.lookAround = false;
    this.hfov = 70; this.visible = { w: 1, h: 1 };
    this.onView = () => {};
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
  }

  setRoom(meta) { this.meta = meta; }

  /** The camera's world position as model coordinates. */
  worldEye() { const p = this.camera.position; return { x: p.x, y: -p.z, z: p.y }; }

  fit() {
    // hold the view's width across the part of the screen the panel leaves free
    const { w, h } = this.visible;
    const tanV = Math.tan((this.hfov * Math.PI) / 360) * (h / Math.max(1, w));
    this.camera.fov = Math.min(88, Math.max(24, (Math.atan(tanV) * 360) / Math.PI));
    this.camera.updateProjectionMatrix();
  }

  pivotFor(view) {
    const e = this.W2T(...view.eye), l = this.W2T(...view.look);
    if (view === this.meta.cameras.dollhouse) return l;
    const dir = l.clone().sub(e), len = dir.length();
    dir.normalize();
    if (view.look_around) return e.clone().addScaledVector(dir, LOOK_R);
    // orbit around a point just ahead, inside the room, so dragging looks around rather than swinging through a wall
    const f = exitFraction(view.eye[0], view.eye[1], view.look[0], view.look[1], this.meta.walkable);
    const reach = Math.min(1.6, Math.max(0.25, f * len - 0.05));
    return e.clone().addScaledVector(dir, reach);
  }

  /** Waypoints between two eyes, if the straight line would leave the room. */
  pathFor(from, to, toDollhouse) {
    const pts = [from.clone()];
    if (!toDollhouse && this.view !== "dollhouse") {
      const a = this.worldEye(), b = { x: to.x, y: -to.z };
      if (exitFraction(a.x, a.y, b.x, b.y, this.meta.walkable) < 1) {
        const near = this.meta.via.map(p => this.W2T(...p));
        // start from the end of the route nearest where the camera is
        if (near.length && near[0].distanceTo(from) > near[near.length - 1].distanceTo(from)) near.reverse();
        pts.push(...near);
      }
    }
    pts.push(to.clone());
    return pts;
  }

  /** The route a move to this view would take from where the camera is now: a function of 0..1. */
  route(toEye, isDoll) {
    const pts = this.pathFor(this.camera.position, toEye, isDoll);
    if (pts.length > 2) {
      const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
      return (k, out) => curve.getPoint(k, out);
    }
    return (k, out) => out.lerpVectors(pts[0], pts[1], k);
  }

  go(name, { instant = false } = {}) {
    const v = this.meta.cameras[name];
    const toEye = this.W2T(...v.eye), toTarget = this.pivotFor(v);
    const isDoll = name === "dollhouse";
    this.onView(name, isDoll);
    this.limits(name);
    if (instant || reduced() || !this.view) {
      this.tween = null;
      this.controls.enabled = true;
      this.camera.position.copy(toEye);
      this.controls.target.copy(toTarget);
      this.hfov = v.hfov; this.fit();
      this.camera.lookAt(toTarget);
      this.view = name;
      this.controls.update();
      this.onArrive?.(name);
      this.onChange();
      return;
    }
    this.controls.enabled = false; // a drag now would be saved up and applied as a jump on arrival
    this.tween = {
      start: performance.now(), at: this.route(toEye, isDoll),
      fromT: this.controls.target.clone(), toT: toTarget,
      fromH: this.hfov, toH: v.hfov, name,
    };
    this.view = name;
    this.onChange();
  }

  /**
   * Move to a pose that isn't a named view, keeping the view's name and limits: a feature demo stands in front of an
   * object this way. Eased like go(), or a cut with reduced motion. Not for the dollhouse or Patient view.
   */
  goTo(eye, target, { instant = false } = {}) {
    if (instant || reduced()) {
      this.tween = null;
      this.controls.enabled = true;
      this.camera.position.copy(eye);
      this.controls.target.copy(target);
      this.camera.lookAt(target);
      this.controls.update();
      this.onArrive?.(this.view);
      this.onChange();
      return;
    }
    this.controls.enabled = false;
    this.tween = { start: performance.now(), at: this.route(eye, false), fromT: this.controls.target.clone(), toT: target.clone(), fromH: this.hfov, toH: this.hfov, name: this.view };
    this.onChange();
  }

  /**
   * Orbit limits for a view, by name. APIS and PACS restore a view with limits(true) for the dollhouse and limits(false)
   * for any other, after setting rig.view, so a boolean still works.
   */
  limits(name) {
    if (typeof name === "boolean") name = name ? "dollhouse" : this.view;
    const c = this.controls, view = this.meta.cameras[name] || {}, isDoll = name === "dollhouse";
    this.lookAround = !!view.look_around;
    c.enableZoom = !this.lookAround; // a scroll or pinch would only move the eye off the pillow
    if (this.lookAround) {
      // from looking well down at the bed to straight up at the ceiling, and as far left and right as a head can turn,
      // centred on where the view first looks
      const off = this.W2T(...view.eye).sub(this.W2T(...view.look));
      c.minDistance = c.maxDistance = LOOK_R;
      c.minPolarAngle = 0.6;
      c.maxPolarAngle = Math.PI - 0.06;
      c.minAzimuthAngle = Math.atan2(off.x, off.z) - HEAD_TURN;
      c.maxAzimuthAngle = Math.atan2(off.x, off.z) + HEAD_TURN;
      return;
    }
    c.minAzimuthAngle = -Infinity;
    c.maxAzimuthAngle = Infinity;
    c.minPolarAngle = isDoll ? 0.05 : 0.2;
    c.maxPolarAngle = isDoll ? 1.2 : 2.75;
    c.minDistance = isDoll ? 6 : 0.2;
    c.maxDistance = isDoll ? 34 : 7;
  }

  /** Returns true while something is moving. */
  update(now) {
    if (this.tween) {
      // now is when this frame began, which can be earlier than the click that set start
      const tw = this.tween, t = Math.max(0, Math.min(1, (now - tw.start) / DURATION)), k = ease(t);
      tw.at(k, this.camera.position);
      this.controls.target.lerpVectors(tw.fromT, tw.toT, k);
      this.hfov = tw.fromH + (tw.toH - tw.fromH) * k; this.fit();
      this.camera.lookAt(this.controls.target);
      if (t >= 1) { this.tween = null; this.controls.enabled = true; this.controls.update(); this.onArrive?.(tw.name); }
      return true;
    }
    const before = this.camera.position.clone();
    this.controls.update();
    this.clamp();
    return before.distanceToSquared(this.camera.position) > 1e-9;
  }

  /** Free orbit stays in the room and above the floor; the dollhouse stays above the ceiling. */
  clamp() {
    const p = this.camera.position, tg = this.controls.target, m = this.meta;
    if (this.view === "dollhouse") {
      p.y = Math.max(p.y, m.ceiling + 0.8);
      return;
    }
    if (this.lookAround) return; // the camera turns in place, within a few centimetres of the eye
    const ax = tg.x, ay = -tg.z;
    if (inside(ax, ay, m.walkable)) {
      const f = exitFraction(ax, ay, p.x, -p.z, m.walkable);
      if (f < 1) { const k = Math.max(0, f - 0.02); p.x = ax + (p.x - ax) * k; p.z = tg.z + (p.z - tg.z) * k; }
    }
    p.y = Math.min(m.ceiling - 0.12, Math.max(0.25, p.y));
    this.camera.lookAt(tg);
  }

  /** Move toward or away from what the view is centred on. */
  dolly(k) {
    if (this.lookAround) {
      // the patient can't move closer, so this narrows or widens what they take in instead
      this.hfov = Math.min(90, Math.max(40, this.hfov * k));
      this.fit();
      this.onChange();
      return;
    }
    const p = this.camera.position, t = this.controls.target;
    p.sub(t).multiplyScalar(k).add(t);
    this.clamp();
    this.onChange();
  }

  /** Keyboard orbit, in radians. A look_around view turns the same way: left looks left, up looks up. */
  orbitBy(yaw, pitch) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const s = new THREE.Spherical().setFromVector3(off);
    s.theta += yaw;
    if (this.lookAround) s.theta = turnWithin(s.theta, this.controls.minAzimuthAngle, this.controls.maxAzimuthAngle);
    // orbiting, up raises the camera over what it circles, so it looks further down; turning in place, up looks up
    s.phi = Math.min(this.controls.maxPolarAngle, Math.max(this.controls.minPolarAngle, s.phi + (this.lookAround ? -pitch : pitch)));
    off.setFromSpherical(s);
    this.camera.position.copy(this.controls.target).add(off);
    this.clamp();
    this.onChange();
  }
}
