// Equipment labels: labels on the room's equipment, and the room's circulation drawn on the floor: the keep-clear areas for
// care around the bed, the route from the door, the door's approach, the reach in front of storage and the chair's bay. Laid
// over the room as it is: it uses the existing kit and whatever the visitor placed, and moves nothing. The areas are the ones
// the layout check works on (main.js layoutInputs), so the drawing and the check can't disagree. They have no dimensions:
// they're this model's own and illustrative, not a clinical or compliance check.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";
import { ZONE_KINDS } from "./layout.js";

// what's labelled, by the model part or add-on it sits on
const PARTS = [
  ["cfg_kit_bed", "Bed"],
  ["cfg_kit_monitor", "Patient monitor · simulated readings"],
  ["cfg_kit_pumps", "Infusion pumps"],
  ["cfg_kit_ventilator", "Ventilator"],
  ["cfg_kit_pendant", "Ceiling pendant · power, data and gas outlets"],
  ["cfg_kit_exam_light", "Examination light"],
  ["cfg_kit_iv_pole", "IV pole"],
  ["addon_comfortControl", "Room comfort control · concept"],
  ["addon_soundSensor", "Sound-level indicator · concept"],
];
const PLACED = { tablet: "Patient tablet", screen: "Privacy screen", rub: "Hand rub", bins: "Waste bins", sharps: "Sharps box", chair: "Family chair" };
const SIDE = 1.0, FOOT = 0.9; // how far the keep-clear areas reach from the bed's sides and foot, in metres: drawn, never labelled
const ZONE_PX = 64; // pixels a metre in the floor drawing
const hatches = new Map();
/** Diagonal stripes in one colour, as a repeating fill. */
function hatch(g, rgb) {
  if (!hatches.has(rgb)) {
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const h = c.getContext("2d");
    h.fillStyle = `rgba(${rgb},0.2)`; h.fillRect(0, 0, 16, 16);
    h.strokeStyle = `rgba(${rgb},0.6)`; h.lineWidth = 4;
    for (const o of [-16, 0, 16]) { h.beginPath(); h.moveTo(o, 16); h.lineTo(o + 16, 0); h.stroke(); }
    hatches.set(rgb, c);
  }
  return g.createPattern(hatches.get(rgb), "repeat");
}
const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };

/** The bed's footprint in its own frame, from the bed model: along from the head (a0 to a1), across from its centre line (c0 to c1). */
export function bedFrame(room) {
  const m = room.meta, f = new THREE.Vector2(...m.bed.foot).normalize(), s = new THREE.Vector2(f.y, -f.x), head = new THREE.Vector2(...m.bed.head);
  room.root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  (room.parts.cfg_kit_bed || []).forEach(o => box.expandByObject(o));
  let a0 = 0, a1 = 2.2, c0 = -0.5, c1 = 0.5;
  if (!box.isEmpty()) {
    const along = [], across = [];
    for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) {
      const d = new THREE.Vector2(x, -z).sub(head);
      along.push(d.dot(f)); across.push(d.dot(s));
    }
    [a0, a1, c0, c1] = [Math.min(...along), Math.max(...along), Math.min(...across), Math.max(...across)];
  }
  return { f, s, head, a0, a1, c0, c1 };
}

/** The keep-clear areas as plan polygons, the same ones drawn on the floor: for the layout check (layout.js). */
export function keepClearAreas(room) {
  const { f, s, head, a0, a1, c0, c1 } = bedFrame(room), at = (a, c) => [head.x + f.x * a + s.x * c, head.y + f.y * a + s.y * c];
  const rect = (A0, A1, C0, C1) => [at(A0, C0), at(A1, C0), at(A1, C1), at(A0, C1)];
  return [
    { id: "clearRight", label: "The keep-clear area on the patient's right", poly: rect(a0, a1, c1, c1 + SIDE) },
    { id: "clearLeft", label: "The keep-clear area on the patient's left", poly: rect(a0, a1, c0 - SIDE, c0) },
    { id: "clearFoot", label: "The keep-clear area past the bed's foot", poly: rect(a1, a1 + FOOT, c0 - SIDE, c1 + SIDE) },
  ];
}

export class ClinicalView {
  constructor({ stage, placement, layer }) {
    this.stage = stage; this.placement = placement; this.layer = layer;
    this.on = false; this.room = null;
    this.fixed = []; // { el, point, part }
    this.placedEls = new Map(); // uid -> el
    this.zoneEls = []; // { el, point }: the floor areas' names
  }

  set(on, room) {
    this.on = on;
    this.layer.hidden = !on;
    if (this.room && this.room !== room && this.room.clinicalZones) this.room.clinicalZones.visible = false;
    this.room = room;
    if (!room) return;
    this.zonesFor(room).visible = on;
    if (on) this.build(room);
  }

  /**
   * Draw the floor areas main.js hands over, the same ones the layout check uses, and name each in words. `zones`:
   * [{ id, kind, poly or polys, line?: [[x, y], ...] for a route's centre line, note?: words after the name }].
   */
  setZones(room, zones) {
    const mesh = this.zonesFor(room), m = room.meta, [x0, , , y1] = m.room, canvas = mesh.material.map.image, g = canvas.getContext("2d");
    const X = x => (x - x0) * ZONE_PX, Y = y => (y1 - y) * ZONE_PX, path = poly => { g.beginPath(); poly.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](X(x), Y(y))); g.closePath(); };
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.save();
    path(m.walkable); g.clip(); // only ever on the open floor
    const order = ["route", "door", "wardrobe", "desk", "keep-clear", "bay"];
    for (const z of [...zones].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))) {
      const k = ZONE_KINDS[z.kind];
      if (!k) continue;
      const rgb = k.fill.join(","), edge = k.line.join(",");
      for (const poly of z.polys || [z.poly]) {
        path(poly);
        if (k.pattern === "hatch") { g.fillStyle = hatch(g, rgb); g.fill(); }
        else { g.fillStyle = `rgba(${rgb},${k.pattern === "flow" ? 0.16 : k.pattern === "solid" ? 0.14 : 0.08})`; g.fill(); }
        if (k.pattern === "dash" || k.pattern === "solid") {
          g.setLineDash(k.pattern === "dash" ? [9, 6] : []); g.lineWidth = k.pattern === "solid" ? 4 : 2.5; g.strokeStyle = `rgba(${edge},0.85)`;
          path(poly); g.stroke(); g.setLineDash([]);
        }
      }
      if (z.line) { // a route: its centre line, dashed, with an arrowhead at the bed's end
        g.strokeStyle = g.fillStyle = `rgba(${edge},0.8)`; g.lineWidth = 3; g.setLineDash([12, 9]);
        g.beginPath(); z.line.forEach(([x, y], i) => g[i ? "lineTo" : "moveTo"](X(x), Y(y))); g.stroke(); g.setLineDash([]);
        const [ax, ay] = z.line.at(-2), [bx, by] = z.line.at(-1), t = Math.atan2(Y(by) - Y(ay), X(bx) - X(ax));
        g.beginPath(); g.moveTo(X(bx), Y(by)); g.lineTo(X(bx) - 15 * Math.cos(t - 0.45), Y(by) - 15 * Math.sin(t - 0.45)); g.lineTo(X(bx) - 15 * Math.cos(t + 0.45), Y(by) - 15 * Math.sin(t + 0.45)); g.closePath(); g.fill();
      }
    }
    g.restore();
    mesh.material.map.needsUpdate = true;
    // the names: one for each area, hung over its middle on the floor
    this.zoneEls.forEach(z => z.el.remove());
    this.zoneEls = [];
    if (!this.on) return;
    const seen = new Set();
    for (const z of zones) {
      const k = ZONE_KINDS[z.kind];
      if (!k) continue;
      const poly = z.line ? z.line : (z.polys || [z.poly])[0], cx = poly.reduce((t, p) => t + p[0], 0) / poly.length, cy = poly.reduce((t, p) => t + p[1], 0) / poly.length;
      if (!inside(cx, cy, m.walkable)) continue; // an area that falls outside the open floor has nothing drawn to name
      const text = `${k.label}${z.note ? ` · ${z.note}` : ""}`;
      if (seen.has(text)) continue; // one name for the three keep-clear areas, and one for two doors
      seen.add(text);
      const el = this.label(text);
      el.className = "zone"; el.dataset.kind = z.kind;
      this.zoneEls.push({ el, point: W2T(cx, cy, 0.05) });
    }
  }

  label(text) {
    const el = document.createElement("span");
    el.textContent = text;
    this.layer.append(el);
    return el;
  }

  /** The point a label hangs from: just above an object, but under the ceiling. */
  anchor(objects) {
    const box = new THREE.Box3();
    objects.forEach(o => box.expandByObject(o));
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3());
    c.y = Math.min(box.max.y + 0.08, this.room.meta.ceiling - 0.3);
    return c;
  }

  build(room) {
    this.layer.replaceChildren();
    this.placedEls.clear();
    this.zoneEls = [];
    room.root.updateMatrixWorld(true);
    this.fixed = PARTS.map(([part, text]) => {
      const objects = room.parts[part] || [];
      const point = objects.length ? this.anchor(objects) : null;
      return point ? { el: this.label(text), point, objects } : null;
    }).filter(Boolean);
  }

  /**
   * Move each label to its object on screen; hide what's behind the camera, off screen, hidden, or under the panel. Labels
   * that would overlap stack upwards, each with a longer leader line down to its object.
   */
  update(camera, visibleWidth) {
    if (!this.on || !this.room) return;
    const w = innerWidth, h = innerHeight, v = new THREE.Vector3(), queue = [];
    const place = (el, point, visible) => {
      v.copy(point).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      el.hidden = !visible || v.z > 1 || x < 8 || x > visibleWidth - 8 || y < 8 || y > h - 8;
      if (!el.hidden) queue.push({ el, x, y });
    };
    for (const f of this.fixed) place(f.el, f.point, f.objects.some(shown));
    for (const z of this.zoneEls) place(z.el, z.point, true);
    // placed items come and go: keep one label each
    const list = this.placement.list(this.room.label), seen = new Set();
    for (const p of list) {
      if (!p.node) continue;
      seen.add(p.uid);
      let el = this.placedEls.get(p.uid);
      if (!el) { el = this.label(PLACED[p.type] || p.type); this.placedEls.set(p.uid, el); }
      place(el, this.anchor([p.node]), shown(p.node));
    }
    for (const [uid, el] of this.placedEls) if (!seen.has(uid)) { el.remove(); this.placedEls.delete(uid); }
    // lowest first, so the ones above step up out of their way
    queue.sort((a, b) => b.y - a.y);
    const taken = [];
    for (const q of queue) {
      const lw = q.el.offsetWidth, lh = q.el.offsetHeight, left = q.x - lw / 2, right = q.x + lw / 2;
      if (left < 4 || right > visibleWidth - 4) { q.el.hidden = true; continue; } // it would reach under the panel or off screen
      let bottom = q.y - 8; // the leader line's usual length
      for (let moved = true, guard = 0; moved && guard < 20; guard++) {
        moved = false;
        for (const t of taken) {
          if (left < t.right + 4 && right > t.left - 4 && bottom > t.top - 2 && bottom - lh < t.bottom + 2) { bottom = t.top - 2; moved = true; }
        }
      }
      if (bottom - lh < 4) { q.el.hidden = true; continue; } // stacked up off the top
      taken.push({ left, right, top: bottom - lh, bottom });
      q.el.style.setProperty("--lead", `${(q.y - bottom).toFixed(1)}px`);
      q.el.style.transform = `translate(${(q.x - lw / 2).toFixed(1)}px, ${(bottom - lh).toFixed(1)}px)`;
    }
  }

  /** The equipment labels showing now, for the check; and the floor areas' names. */
  showing() { return [...this.layer.children].filter(el => !el.hidden && el.className !== "zone").map(el => el.textContent); }
  zonesShowing() { return this.zoneEls.map(z => ({ text: z.el.textContent, kind: z.el.dataset.kind, hidden: z.el.hidden })); }

  /**
   * The floor drawing: one see-through texture over the room, so whatever stands in an area shows plainly. setZones draws
   * the areas on it, clipped to the room's open floor.
   */
  zonesFor(room) {
    if (room.clinicalZones) return room.clinicalZones;
    const m = room.meta, [x0, y0, x1, y1] = m.room;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil((x1 - x0) * ZONE_PX); canvas.height = Math.ceil((y1 - y0) * ZONE_PX);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(W2T((x0 + x1) / 2, (y0 + y1) / 2, 0.006));
    mesh.renderOrder = 1;
    mesh.name = "clinical_keep_clear";
    mesh.raycast = () => {}; // clicks go to what stands there
    mesh.visible = false;
    room.root.add(mesh);
    room.clinicalZones = mesh;
    return mesh;
  }
}
