// Room intelligence in the room: three flush sensor discs on the ceiling (an option, built when first chosen), the floor each
// would cover, and the marks a made-up event leaves: the bed's edge, or an object left in a clear area. intel-data.js has the
// words. Nothing here senses anything: an event is raised by a button, and a person acknowledges it.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { ROUTES } from "./layout.js";
import { SENSORS } from "./intel-data.js";

/** Where each sensor sits, in plan metres, from the room's own points: over the bed, inside the door, over the middle. */
export function sensorSpots(room) {
  const b = room.meta.bed, r = ROUTES[room.label], [x0, y0] = r[0], [x1, y1] = r[1], len = Math.hypot(x1 - x0, y1 - y0);
  return {
    bed: [b.head[0] + b.foot[0] * 1.0, b.head[1] + b.foot[1] * 1.0],
    door: [x0 + ((x1 - x0) / len) * 0.6, y0 + ((y1 - y0) / len) * 0.6],
    room: [...r[Math.min(2, r.length - 1)]],
  };
}

export const INTEL = {
  /** Three flush discs on the ceiling, each a white ring round a dark lens. On the ceiling, so the dollhouse lifts them off. */
  ceilingSensors(room) {
    const g = new THREE.Group(), H = room.meta.ceiling, spots = sensorSpots(room);
    const body = new THREE.MeshStandardMaterial({ color: "#f3f4f2", roughness: 0.4 }), lens = new THREE.MeshStandardMaterial({ color: "#2a3236", roughness: 0.2 });
    for (const s of SENSORS) {
      const [x, y] = spots[s.at], d = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 28), body), eye = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.004, 20), lens);
      disc.position.y = -0.006; eye.position.y = -0.0135;
      d.add(disc, eye); d.position.copy(W2T(x, y, H)); d.name = `sensor_${s.id}`;
      d.userData.itemInfo = { title: `Ceiling sensor: ${s.label.toLowerCase()}`, description: `Would cover: ${s.covers.toLowerCase()}. A concept: it senses nothing here.` };
      d.traverse(n => { if (n.isMesh) n.userData.itemInfo = d.userData.itemInfo; });
      g.add(d);
    }
    room.ceiling.push(g);
    return g;
  },
};

/** The floor each sensor would cover: soft circles with a ring, shown while room intelligence is active. Built once. */
export function setCoverage(room, on) {
  if (on && !room.intelCover) {
    const g = new THREE.Group(), spots = sensorSpots(room);
    const fill = new THREE.MeshBasicMaterial({ color: "#3fc1c9", transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false });
    const edge = new THREE.MeshBasicMaterial({ color: "#0b6d75", transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
    for (const s of SENSORS) {
      const [x, y] = spots[s.at], at = W2T(x, y, 0.014);
      const c = new THREE.Mesh(new THREE.CircleGeometry(s.reach, 48), fill), ring = new THREE.Mesh(new THREE.RingGeometry(s.reach - 0.025, s.reach, 64), edge);
      for (const m of [c, ring]) { m.rotation.x = -Math.PI / 2; m.position.copy(at); m.renderOrder = 7; m.raycast = () => {}; g.add(m); }
    }
    g.name = "intel_coverage";
    room.root.add(g);
    room.intelCover = g;
  }
  if (room.intelCover) room.intelCover.visible = on;
}

/** A made-up event's mark: the clear area by the bed's edge lit amber, or a box left in the clear area at the bed's foot. */
export function setEventMark(room, id, on, areas) {
  room.intelMarks ||= {};
  if (on && !room.intelMarks[id]) {
    const g = new THREE.Group(), area = areas.find(a => a.id === (id === "edge" ? "clearRight" : "clearFoot"));
    if (area) {
      const shape = new THREE.Shape(area.poly.map(([x, y]) => new THREE.Vector2(x, y)));
      const m = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: "#e6a342", transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.016; m.renderOrder = 8; m.raycast = () => {};
      g.add(m);
      if (id === "clear") { // a made-up object, about the size of a box of supplies, in the middle of the area
        const cx = area.poly.reduce((s, p) => s + p[0], 0) / area.poly.length, cy = area.poly.reduce((s, p) => s + p[1], 0) / area.poly.length;
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.36), new THREE.MeshStandardMaterial({ color: "#c9a273", roughness: 0.8 }));
        box.position.copy(W2T(cx, cy, 0.16)); box.castShadow = true;
        box.userData.itemInfo = { title: "A made-up object, left in a clear area", description: "SIMULATED: part of the room intelligence demo. Reset takes it away." };
        g.add(box);
      }
    }
    g.name = `intel_${id}`;
    room.root.add(g);
    room.intelMarks[id] = g;
  }
  if (room.intelMarks[id]) room.intelMarks[id].visible = on;
}
