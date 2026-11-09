// Items a visitor places: dragged from the panel's "Place items" list onto the floor or a wall of the room. Each is a
// concept for discussion and goes wherever the visitor puts it. Nothing here checks clinical clearances, infection-control
// positions or staff access, and every card says so.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const MAX_PLACED = 16;
const CHECK = "Placed where you chose: staff access, clearances and infection-control positions haven't been checked.";

const mat = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function part(geometry, material, x = 0, y = 0, z = 0) {
  const n = new THREE.Mesh(geometry, material);
  n.position.set(x, y, z);
  n.castShadow = n.receiveShadow = true;
  return n;
}
const box = (w, h, d, m, x, y, z) => part(new THREE.BoxGeometry(w, h, d), m, x, y, z);
const cyl = (r, h, m, x, y, z, seg = 24) => part(new THREE.CylinderGeometry(r, r, h, seg), m, x, y, z);

/** The tablet's screen: a few large controls, drawn once. It isn't connected to anything. */
function tabletFace() {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 220;
  const g = c.getContext("2d");
  g.fillStyle = "#14262d"; g.fillRect(0, 0, 320, 220);
  g.fillStyle = "#e6f0f2"; g.font = "600 22px sans-serif"; g.fillText("Room", 18, 36);
  const keys = [["Call nurse", "#c8352b"], ["Lights", "#0b6d75"], ["Blinds", "#0b6d75"], ["TV", "#0b6d75"]];
  keys.forEach(([text, colour], i) => {
    const x = 18 + (i % 2) * 148, y = 56 + Math.floor(i / 2) * 76;
    g.fillStyle = colour; g.beginPath(); g.roundRect(x, y, 136, 64, 10); g.fill();
    g.fillStyle = "#ffffff"; g.font = "600 20px sans-serif"; g.fillText(text, x + 12, y + 39);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Each item is built facing +Z. A floor item stands on y = 0; a wall item hangs with its back on the wall at z = 0, centred
// on y = 0, and is raised to `height` when placed.
export const ITEMS = [
  {
    id: "tablet", code: "a", label: "Bedside tablet arm", on: "floor",
    description: "A patient tablet on a weighted stand with an arm, for calling a nurse and the room's lights, blinds and TV. A concept: it isn't connected to anything here.",
    build() {
      const g = new THREE.Group(), steel = mat("#b9c0c3", 0.35, { metalness: 0.4 }), dark = mat("#2a3236", 0.5);
      g.add(cyl(0.27, 0.04, dark, 0, 0.02, 0), cyl(0.02, 1.1, steel, 0, 0.59, 0));
      const arm = box(0.5, 0.035, 0.035, steel, 0.25, 1.13, 0); arm.rotation.y = -0.5; g.add(arm);
      const tab = new THREE.Group(); tab.position.set(0.44, 1.12, 0.24); tab.rotation.set(-0.25, -0.35, 0);
      tab.add(box(0.28, 0.2, 0.016, dark, 0, 0, 0));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.18), new THREE.MeshBasicMaterial({ map: tabletFace() }));
      face.position.z = 0.009; tab.add(face);
      g.add(tab);
      return g;
    },
  },
  {
    id: "screen", code: "b", label: "Privacy screen", on: "floor",
    description: "A folding, wipe-clean privacy screen for care at the bed, on wheels so it moves out of the way.",
    build() {
      const g = new THREE.Group(), frame = mat("#c8ced0", 0.4, { metalness: 0.3 }), panel = mat("#a9c9c6", 0.7);
      [[-0.56, 0.16, 0.55], [0, 0, 0], [0.56, 0.16, -0.55]].forEach(([x, z, turn]) => {
        const leaf = new THREE.Group(); leaf.position.set(x, 0, z); leaf.rotation.y = turn;
        leaf.add(box(0.58, 1.55, 0.015, panel, 0, 0.95, 0), box(0.6, 0.03, 0.03, frame, 0, 1.74, 0), box(0.6, 0.03, 0.03, frame, 0, 0.17, 0));
        leaf.add(box(0.03, 1.6, 0.03, frame, -0.3, 0.95, 0), box(0.03, 1.6, 0.03, frame, 0.3, 0.95, 0));
        leaf.add(cyl(0.03, 0.05, frame, -0.27, 0.03, 0), cyl(0.03, 0.05, frame, 0.27, 0.03, 0));
        g.add(leaf);
      });
      return g;
    },
  },
  {
    id: "rub", code: "c", label: "Hand-rub dispenser", on: "wall", height: 1.2,
    description: "An alcohol hand-rub dispenser on the wall, about 1.2 m up, for hand hygiene at the point of care.",
    build() {
      const g = new THREE.Group();
      g.add(box(0.11, 0.26, 0.1, mat("#f1f3f2", 0.35), 0, 0, 0.05), box(0.05, 0.02, 0.04, mat("#2a3236", 0.5), 0, -0.135, 0.07));
      g.add(box(0.07, 0.08, 0.004, mat("#9fd2d6", 0.4), 0, 0.05, 0.102));
      return g;
    },
  },
  {
    id: "bins", code: "d", label: "Waste bins", on: "floor",
    description: "Two pedal bins, for general and clinical waste, side by side.",
    build() {
      const g = new THREE.Group(), body = mat("#d9dcdc", 0.45);
      [[-0.18, "#2a3236"], [0.18, "#e5b51b"]].forEach(([x, lid]) => {
        g.add(box(0.32, 0.58, 0.3, body, x, 0.29, 0), box(0.33, 0.04, 0.31, mat(lid, 0.4), x, 0.6, 0), box(0.12, 0.02, 0.06, mat("#2a3236"), x, 0.03, 0.18));
      });
      return g;
    },
  },
  {
    id: "sharps", code: "e", label: "Sharps box", on: "wall", height: 1.35,
    description: "A sharps container on a wall bracket, about 1.35 m up, for used needles and blades.",
    build() {
      const g = new THREE.Group();
      g.add(box(0.27, 0.3, 0.012, mat("#b9c0c3", 0.4, { metalness: 0.3 }), 0, 0, 0.006));
      g.add(box(0.24, 0.22, 0.14, mat("#f2c230", 0.5), 0, -0.02, 0.085), box(0.245, 0.04, 0.145, mat("#c8352b", 0.45), 0, 0.11, 0.085));
      return g;
    },
  },
  {
    id: "chair", code: "f", label: "Compact family chair", on: "floor",
    description: "A compact, wipe-clean chair for a visitor, small enough to move aside for care.",
    build() {
      const g = new THREE.Group(), fabric = mat("#6f9c9a", 0.8), legs = mat("#7a6a58", 0.6);
      g.add(box(0.52, 0.1, 0.48, fabric, 0, 0.44, 0), box(0.52, 0.48, 0.09, fabric, 0, 0.73, -0.22));
      g.add(box(0.07, 0.2, 0.46, fabric, -0.29, 0.56, 0), box(0.07, 0.2, 0.46, fabric, 0.29, 0.56, 0));
      for (const [x, z] of [[-0.23, -0.2], [0.23, -0.2], [-0.23, 0.2], [0.23, 0.2]]) g.add(box(0.04, 0.4, 0.04, legs, x, 0.2, z));
      return g;
    },
  },
];
export const itemById = id => ITEMS.find(i => i.id === id);

const b62 = (n, len) => { let s = ""; for (let i = 0; i < len; i++) { s = ALPHABET[n % 62] + s; n = Math.floor(n / 62); } return s; };
const un62 = s => [...s].reduce((n, ch) => n * 62 + ALPHABET.indexOf(ch), 0);

/** Placed items for the share code: per item, its letter, x and y in centimetres (3 characters each) and its turn in degrees (2). */
export function encodePlaced(list) {
  return list.map(p => itemById(p.type).code + b62(Math.round(p.x * 100), 3) + b62(Math.round(p.y * 100), 3) + b62(((Math.round(p.rot) % 360) + 360) % 360, 2)).join("");
}
export function decodePlaced(text) {
  if (!text || text.length % 9 || ![...text].every(ch => ALPHABET.includes(ch))) return [];
  const out = [];
  for (let i = 0; i < text.length && out.length < MAX_PLACED; i += 9) {
    const item = ITEMS.find(it => it.code === text[i]);
    if (item) out.push({ type: item.id, x: un62(text.slice(i + 1, i + 4)) / 100, y: un62(text.slice(i + 4, i + 7)) / 100, rot: un62(text.slice(i + 7, i + 9)) % 360 });
  }
  return out;
}

/** The placed items, room by room. Each room shows its own; the share code holds the current room's. */
export class Placement {
  constructor(stage) {
    this.stage = stage;
    this.byRoom = {};
    this.uid = 0;
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  list(label) { return (this.byRoom[label] ||= []); }

  /** Put an item's model where its entry says, in the room on show. */
  pose(entry) {
    const item = itemById(entry.type), n = entry.node;
    n.position.copy(W2T(entry.x, entry.y, item.on === "wall" ? item.height : 0));
    n.rotation.y = (entry.rot * Math.PI) / 180;
    n.updateMatrixWorld(true);
  }

  build(entry) {
    const item = itemById(entry.type), node = item.build();
    node.name = `placed_${entry.type}`;
    node.userData.itemInfo = { title: item.label, description: `${item.description} ${CHECK}`, action: `placed:${entry.uid}` };
    node.userData.placed = entry;
    entry.node = node;
    this.pose(entry);
    return node;
  }

  /** Show this room's items (built on first sight), and hide the others'. */
  show(room) {
    for (const [label, list] of Object.entries(this.byRoom)) {
      for (const e of list) {
        if (label === room.label && !e.node) room.root.add(this.build(e));
        if (e.node) e.node.visible = label === room.label;
      }
    }
  }

  add(room, type, x, y, rot) {
    const list = this.list(room.label);
    if (list.length >= MAX_PLACED) return null;
    const entry = { uid: ++this.uid, type, x, y, rot };
    list.push(entry);
    room.root.add(this.build(entry));
    return entry;
  }

  move(entry, x, y, rot = entry.rot) { Object.assign(entry, { x, y, rot }); this.pose(entry); }

  remove(label, entry) {
    const list = this.list(label), at = list.indexOf(entry);
    if (at >= 0) list.splice(at, 1);
    entry.node?.removeFromParent();
    entry.node?.traverse(n => { n.geometry?.dispose(); [n.material].flat().forEach(m => { m?.map?.dispose(); m?.dispose(); }); });
  }

  /** Replace a room's items, as a link or a saved room gives them. */
  set(label, entries) {
    for (const e of this.list(label).slice()) this.remove(label, e);
    this.byRoom[label] = entries.slice(0, MAX_PLACED).map(e => ({ uid: ++this.uid, type: e.type, x: e.x, y: e.y, rot: e.rot }));
  }

  find(uid) {
    for (const [label, list] of Object.entries(this.byRoom)) { const e = list.find(p => p.uid === uid); if (e) return { label, entry: e }; }
    return null;
  }

  /** The placed item under a ray, in the room on show. */
  hit(ray, room) {
    const nodes = this.list(room.label).map(e => e.node).filter(Boolean);
    const h = ray.intersectObjects(nodes, true)[0];
    if (!h) return null;
    for (let n = h.object; n; n = n.parent) if (n.userData.placed) return n.userData.placed;
    return null;
  }

  /** Whether a wall item at x, y facing `rot` would still hang on the room's wall, for a keyboard nudge along it. */
  onWall(room, entry, x, y) {
    const item = itemById(entry.type), t = (entry.rot * Math.PI) / 180, n = new THREE.Vector3(Math.sin(t), 0, Math.cos(t));
    const walls = [...(room.parts.cfg_paint_walls || []), ...(room.parts.cfg_feature_wall || [])].filter(w => w.visible);
    const probe = new THREE.Raycaster(W2T(x, y, item.height).addScaledVector(n, 0.05), n.clone().negate(), 0, 0.2);
    return probe.intersectObjects(walls, false).length > 0;
  }

  /**
   * Where an item would go along a ray: open floor inside the room for a floor item, the room's own wall for a wall item.
   * Returns { ok, x, y, rot } in model coordinates and degrees, or { ok: false, why }.
   */
  locate(ray, room, type, camera) {
    const item = itemById(type), m = room.meta;
    if (item.on === "floor") {
      const p = ray.ray.intersectPlane(this.floor, new THREE.Vector3());
      if (!p) return { ok: false, why: "floor" };
      const x = p.x, y = -p.z;
      if (!inside(x, y, m.walkable)) return { ok: false, why: "floor", x, y };
      // turned to face the camera, in 15° steps
      const rot = Math.round(((Math.atan2(camera.position.x - p.x, camera.position.z - p.z) * 180) / Math.PI) / 15) * 15;
      return { ok: true, x, y, rot: (rot + 360) % 360 };
    }
    const walls = [...(room.parts.cfg_paint_walls || []), ...(room.parts.cfg_feature_wall || [])].filter(n => n.visible);
    for (const h of ray.intersectObjects(walls, false)) {
      if (!h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (Math.abs(n.y) > 0.3) continue;
      if (n.dot(ray.ray.direction) > 0) n.negate(); // the face the camera sees
      // a wall item hangs at its own height, so the spot has to be on wall there too, not over a door or the window
      const at = new THREE.Vector3(h.point.x, item.height, h.point.z).addScaledVector(n, 0.05);
      const probe = new THREE.Raycaster(at, n.clone().negate(), 0, 0.2);
      if (!probe.intersectObjects(walls, false).length) return { ok: false, why: "wall" };
      return { ok: true, x: h.point.x, y: -h.point.z, rot: ((Math.atan2(n.x, n.z) * 180) / Math.PI + 360) % 360 };
    }
    return { ok: false, why: "wall" };
  }
}
