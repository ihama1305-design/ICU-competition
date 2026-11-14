// Acoustic comfort mode in the room: a sound map on the floor, a quiet zone round the bed, a label on each simulated source
// (the two loudest at the pillow marked), and a level at the sound sensor. Like Clinical view it moves nothing, and every
// number on it is ILLUSTRATIVE (acoustic.js says where they come from). Nothing here listens.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";
import { BANDS, SOURCES, bandOf, levelAt, loudestAt, sourceLevel } from "./acoustic.js";

const EAR = 1.2; // the map is worked out at a seated or lying head's height, in metres
const toModel = v => [v.x, -v.z, v.y];

export class AcousticView {
  constructor({ stage, layer }) {
    this.stage = stage; this.layer = layer;
    this.on = false; this.room = null; this.fittings = {};
    this.marks = new Map(); // id -> { el, point }
  }

  /** Where each source is in this room, in model metres: its kit's middle, the door's head, the corridor outside. */
  points(room) {
    const box = list => { const b = new THREE.Box3(); (list || []).forEach(o => b.expandByObject(o)); return b.isEmpty() ? null : toModel(b.getCenter(new THREE.Vector3())); };
    room.root.updateMatrixWorld(true);
    const f = room.meta.front, out = {};
    for (const s of SOURCES) {
      const [kind, arg] = s.at.split(":");
      if (kind === "part") out[s.id] = box(room.parts[arg]);
      else if (kind === "addon") out[s.id] = box(room.addons?.[arg] ? [room.addons[arg]] : null);
      else if (kind === "front") out[s.id] = [f.at[0], f.at[1], 2.0];
      else if (kind === "corridor") out[s.id] = [f.at[0] - f.inward[0] * 1.6, f.at[1] - f.inward[1] * 1.6, 1.6];
    }
    return out;
  }

  /** The pillow, in model metres: a little way down the bed from its head. */
  pillow(room) { const b = room.meta.bed; return [b.head[0] + b.foot[0] * 0.35, b.head[1] + b.foot[1] * 0.35, 0.95]; }

  /** Show it or take it away, for this room and with these fittings on ({ acousticPanels: true, ... }). */
  set(on, room, fittings = {}) {
    this.on = on; this.fittings = fittings;
    if (this.room && this.room !== room) this.clear(this.room);
    this.room = room;
    this.layer.hidden = !on;
    if (!on) { this.clear(room); return; }
    this.pts = this.points(room);
    this.drawMap(room);
    this.drawZone(room);
    this.drawMarks(room);
  }

  clear(room) {
    for (const k of ["acousticMap", "acousticZone"]) if (room?.[k]) { room[k].removeFromParent(); room[k].geometry.dispose(); room[k].material.map?.dispose(); room[k].material.dispose(); room[k] = null; }
    this.layer.replaceChildren(); this.marks.clear();
  }

  /** The level at the pillow and at the sensor, and the two loudest sources at the pillow, with the fittings now shown. */
  readings(room = this.room, fittings = this.fittings) {
    const pts = this.points(room), pillow = this.pillow(room);
    const sensor = room.addons?.soundSensor ? toModel(room.addons.soundSensor.getWorldPosition(new THREE.Vector3())) : null;
    return {
      pillow: levelAt(pillow, pts, fittings),
      sensor: sensor ? levelAt(sensor, pts, fittings) : null,
      loudest: loudestAt(pillow, pts, fittings, 2),
    };
  }

  /** A coloured map of the open floor, worked out cell by cell from the distance rule. */
  drawMap(room) {
    const m = room.meta, [x0, y0, x1, y1] = m.room, cell = 0.08;
    const w = Math.ceil((x1 - x0) / cell), h = Math.ceil((y1 - y0) / cell);
    const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
    const g = canvas.getContext("2d"), img = g.createImageData(w, h);
    const rgb = BANDS.map(b => [1, 3, 5].map(i => parseInt(b.colour.slice(i, i + 2), 16)));
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * cell, y = y1 - (j + 0.5) * cell, k = (j * w + i) * 4;
      if (!inside(x, y, m.walkable)) continue;
      const c = rgb[BANDS.indexOf(bandOf(levelAt([x, y, EAR], this.pts, this.fittings)))];
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = 150;
    }
    g.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter;
    let mesh = room.acousticMap;
    if (!mesh) {
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.copy(W2T((x0 + x1) / 2, (y0 + y1) / 2, 0.012));
      mesh.renderOrder = 3; mesh.raycast = () => {};
      room.root.add(mesh);
      room.acousticMap = mesh;
    }
    mesh.material.map?.dispose();
    mesh.material.map = tex; mesh.material.needsUpdate = true;
  }

  /** The quiet zone: a ring on the floor round the head of the bed. */
  drawZone(room) {
    if (room.acousticZone) return;
    const [x, y] = this.pillow(room);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.18, 1.25, 72), new THREE.MeshBasicMaterial({ color: "#2f8f9d", transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(W2T(x, y, 0.02));
    ring.renderOrder = 4; ring.raycast = () => {};
    room.root.add(ring);
    room.acousticZone = ring;
  }

  /** A label on each source, the quiet zone and the sensor, built as DOM so it reads at any size. */
  drawMarks(room) {
    this.layer.replaceChildren(); this.marks.clear();
    const r = this.readings(room), loud = new Set(r.loudest.map(l => l.id));
    const mark = (id, text, point, cls = "") => {
      const el = document.createElement("span");
      el.className = `acoustic-mark ${cls}`; el.dataset.source = id;
      el.textContent = text;
      this.layer.append(el);
      this.marks.set(id, { el, point: W2T(...point) });
    };
    for (const s of SOURCES) {
      const p = this.pts[s.id];
      if (!p) continue;
      // the patient's kit always shows its own level: no fitting changes a device. For the rest, what reaches the room too
      const own = s.level, heard = Math.round(sourceLevel(s, this.fittings)), room = s.kind !== "medical" && heard < own ? `, ${heard} in the room` : "";
      mark(s.id, `${s.label} · ${own} dBA at 1 m${room}${loud.has(s.id) ? " · loudest at the pillow" : ""}`, [p[0], p[1], p[2] + 0.25], loud.has(s.id) ? "loudest" : "");
    }
    const [x, y] = this.pillow(room);
    mark("zone", `Quiet zone · about ${Math.round(r.pillow)} dBA at the pillow`, [x, y, 0.05], "zone");
    if (r.sensor !== null) {
      const s = toModel(room.addons.soundSensor.getWorldPosition(new THREE.Vector3()));
      mark("sensor", `Sound sensor · about ${Math.round(r.sensor)} dBA here`, [s[0], s[1], s[2] + 0.15], "sensor");
    }
  }

  /** A source's label flashes once as its sound plays, so everything heard is also seen. The flash ends by itself. */
  pulse(id) {
    const el = this.marks.get(id)?.el;
    if (!el) return;
    el.classList.remove("ping"); void el.offsetWidth; el.classList.add("ping");
  }

  /** After each draw: each label over its point, hidden when it's behind the camera or off the free part of the screen. */
  update(camera, visibleWidth) {
    if (!this.on) return;
    const v = new THREE.Vector3(), w = innerWidth, h = innerHeight, placed = [];
    // nearest the top first; a label that would cover one already placed moves up above it, as Explore's marks do
    const order = [...this.marks.values()].map(m => {
      v.copy(m.point).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      return { m, x, y, off: v.z > 1 || x < 8 || x > visibleWidth - 8 || y < 8 || y > h - 8 };
    }).sort((a, b) => a.y - b.y);
    for (const o of order) {
      o.m.el.hidden = o.off;
      if (o.off) continue;
      o.m.w ||= o.m.el.offsetWidth; o.m.h ||= o.m.el.offsetHeight;
      const b = { l: o.x - o.m.w / 2, r: o.x + o.m.w / 2, t: o.y - o.m.h, b: o.y };
      let lift = 0;
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => b.l < p.r && b.r > p.l && b.t - lift < p.b && b.b - lift > p.t);
        if (!hit) break;
        lift = b.b - hit.t + 3;
      }
      o.m.el.style.transform = `translate(${Math.round(o.x)}px, ${Math.round(o.y - lift)}px) translate(-50%, -100%)`;
      placed.push({ l: b.l, r: b.r, t: b.t - lift, b: b.b - lift });
    }
  }

  /** For the check: the labels on show. */
  showing() { return [...this.marks].filter(([, m]) => !m.el.hidden).map(([id, m]) => ({ id, text: m.el.textContent, loudest: m.el.classList.contains("loudest") })); }
}
