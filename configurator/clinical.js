// Clinical view: labels on the room's equipment, and keep-clear areas for care around the bed, laid over the room as it
// is. It uses the existing kit and whatever the visitor placed, and moves nothing. The areas have no dimensions: they're
// illustrative, not a clinical or compliance check.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";

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
const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };

export class ClinicalView {
  constructor({ stage, placement, layer }) {
    this.stage = stage; this.placement = placement; this.layer = layer;
    this.on = false; this.room = null;
    this.fixed = []; // { el, point, part }
    this.placedEls = new Map(); // uid -> el
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

  /** The labels showing now, for the check. */
  showing() { return [...this.layer.children].filter(el => !el.hidden).map(el => el.textContent); }

  /**
   * Keep-clear areas beside the bed and at its foot, clipped to the room's open floor: hatched, see-through, on the floor.
   * Drawn into one texture over the room, so whatever stands in them shows plainly.
   */
  zonesFor(room) {
    if (room.clinicalZones) return room.clinicalZones;
    const m = room.meta, [x0, y0, x1, y1] = m.room, PX = 25;
    const W = Math.ceil((x1 - x0) * PX), H = Math.ceil((y1 - y0) * PX);
    // the bed's footprint in its own frame: along from the head, across from its centre line
    const f = new THREE.Vector2(...m.bed.foot).normalize(), s = new THREE.Vector2(f.y, -f.x), head = new THREE.Vector2(...m.bed.head);
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
    const inZone = (x, y) => {
      const d = new THREE.Vector2(x, y).sub(head), a = d.dot(f), c = d.dot(s);
      const side = a >= a0 && a <= a1 && ((c >= c0 - SIDE && c < c0) || (c > c1 && c <= c1 + SIDE));
      const foot = a > a1 && a <= a1 + FOOT && c >= c0 - SIDE && c <= c1 + SIDE;
      return side || foot;
    };
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext("2d"), img = g.createImageData(W, H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = x0 + (i + 0.5) / PX, y = y1 - (j + 0.5) / PX;
        if (!inZone(x, y) || !inside(x, y, m.walkable)) continue;
        const k = (j * W + i) * 4, stripe = (i + j) % 8 < 3;
        img.data[k] = 11; img.data[k + 1] = 109; img.data[k + 2] = 117; img.data[k + 3] = stripe ? 150 : 60;
      }
    }
    g.putImageData(img, 0, 0);
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
