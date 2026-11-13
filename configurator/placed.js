// Items a visitor places: dragged from the panel's "Place items" list onto the floor or a wall of the room. Each is a
// concept for discussion and goes wherever the visitor puts it. Nothing here checks clinical clearances, infection-control
// positions or staff access, and every card says so.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const MAX_PLACED = 16;
export const CHECK = "Placed where you chose: staff access, clearances and infection-control positions haven't been checked.";

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

/**
 * A printed leaf scene for the biophilic panel: greenery with no soil, water or living plant. Drawn from a seeded generator,
 * like every other picture here, so there's nothing to license.
 */
function leafScene() {
  const c = document.createElement("canvas");
  c.width = 384; c.height = 512;
  const g = c.getContext("2d");
  let seed = 41;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const sky = g.createLinearGradient(0, 0, 0, 512);
  sky.addColorStop(0, "#e9efe3"); sky.addColorStop(1, "#cfdcc8");
  g.fillStyle = sky; g.fillRect(0, 0, 384, 512);
  // three layers of leaves on curved stems, paler at the back, so the panel has depth without being busy
  for (const [layer, n, light] of [[0, 14, 70], [1, 12, 52], [2, 9, 36]]) {
    for (let i = 0; i < n; i++) {
      const x0 = rnd() * 384, y0 = 512 + 20, len = 260 + rnd() * 220 - layer * 30, lean = (rnd() - 0.5) * 1.4;
      const tipX = x0 + Math.sin(lean) * len, tipY = y0 - Math.cos(lean) * len;
      g.strokeStyle = `hsl(${95 + rnd() * 30}, ${26 + layer * 6}%, ${light - 6}%)`; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0, (y0 + tipY) / 2, tipX, tipY); g.stroke();
      const size = 26 + rnd() * 26 - layer * 3, turn = Math.atan2(tipY - y0, tipX - x0) + Math.PI / 2;
      g.save(); g.translate(tipX, tipY); g.rotate(turn);
      g.fillStyle = `hsl(${92 + rnd() * 34}, ${30 + layer * 8}%, ${light + rnd() * 8}%)`;
      g.beginPath(); g.ellipse(0, size * 0.9, size * 0.5, size * 1.1, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = `hsla(${100}, 30%, ${light + 18}%, 0.6)`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, size * 1.9); g.stroke();
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
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
    id: "rub", code: "c", label: "Hand-rub dispenser", on: "wall", height: 1.2, size: [0.11, 0.28],
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
    id: "sharps", code: "e", label: "Sharps box", on: "wall", height: 1.35, size: [0.27, 0.3],
    description: "A sharps container on a wall bracket, about 1.35 m up, for used needles and blades.",
    build() {
      const g = new THREE.Group();
      g.add(box(0.27, 0.3, 0.012, mat("#b9c0c3", 0.4, { metalness: 0.3 }), 0, 0, 0.006));
      g.add(box(0.24, 0.22, 0.14, mat("#f2c230", 0.5), 0, -0.02, 0.085), box(0.245, 0.04, 0.145, mat("#c8352b", 0.45), 0, 0.11, 0.085));
      return g;
    },
  },
  {
    // greenery inside without soil or water; the living plants stay outside the glass. Its card cites the palms note's source
    id: "leafpanel", code: "g", label: "Biophilic wall panel", on: "wall", height: 1.7, size: [0.92, 1.22], sourcesFrom: "palms",
    description: "Greenery without soil or water: a printed leaf scene behind a sealed, wipe-clean acrylic face, about 0.9 by 1.2 m and centred 1.7 m up, clear of wall ledges. Living plants stay outside the glass, because CDC guidance says not to allow fresh flowers or potted plants in patient-care areas for immunosuppressed patients.",
    build() {
      const g = new THREE.Group(), frame = mat("#c9cfd1", 0.35, { metalness: 0.35 });
      g.add(box(0.92, 1.22, 0.03, frame, 0, 0, 0.015)); // a slim aluminium frame, sealed to the wall
      const print = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.18), mat("#ffffff", 0.9, { map: leafScene() }));
      print.position.z = 0.031; g.add(print);
      // the acrylic face: glossy, so it reads as a surface to wipe rather than a picture to touch
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.18), new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.08, metalness: 0, transparent: true, opacity: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }));
      face.position.z = 0.033; g.add(face);
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

/** The room's own walls that an item can hang on: the painted walls and the feature wall, where they're shown. */
export const wallsOf = room => [...(room.parts.cfg_paint_walls || []), ...(room.parts.cfg_feature_wall || [])].filter(w => w.visible);
const EDGE = 0.01; // an item's edge may sit this close to the end of a wall, in metres
const GRID = 0.1; // how far apart a wall item's face is probed, in metres: closer than a wall fixture is wide

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
    node.userData.itemInfo = { title: item.label, description: `${item.description} ${CHECK}`, action: `placed:${entry.uid}`, ...(item.sourcesFrom ? { sourcesFrom: item.sourcesFrom } : {}) };
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
    return this.hangs(room, item, W2T(x, y, item.height), n);
  }

  /** A grid of points across a wall item's face, 5 cm out from the wall: edge to edge, corners included, at most 10 cm apart. */
  facePoints(item, centre, n) {
    const [w, h] = item.size, along = new THREE.Vector3(n.z, 0, -n.x), points = [];
    const cols = Math.max(3, Math.ceil(w / GRID) + 1), rows = Math.max(3, Math.ceil(h / GRID) + 1);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const p = centre.clone().addScaledVector(along, (i / (cols - 1) - 0.5) * (w - 2 * EDGE)).addScaledVector(n, 0.05);
        p.y += (j / (rows - 1) - 0.5) * (h - 2 * EDGE);
        points.push(p);
      }
    }
    return points;
  }

  /**
   * Whether a wall item centred at `centre`, facing out along `n`, has solid wall behind all of it. A wide item with only
   * its centre on the wall would hang over a door, the glazed front or the end of the wall.
   */
  hangs(room, item, centre, n) {
    const walls = wallsOf(room), back = n.clone().negate();
    return this.facePoints(item, centre, n).every(p => new THREE.Raycaster(p, back, 0, 0.2).intersectObjects(walls, false).length > 0);
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
    for (const h of ray.intersectObjects(wallsOf(room), false)) {
      if (!h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
      if (Math.abs(n.y) > 0.3) continue;
      if (n.dot(ray.ray.direction) > 0) n.negate(); // the face the camera sees
      // a wall item hangs at its own height, so all of it has to be on wall there, not over a door, the glazed front or the window
      if (!this.hangs(room, item, new THREE.Vector3(h.point.x, item.height, h.point.z), n)) return { ok: false, why: "wall" };
      return { ok: true, x: h.point.x, y: -h.point.z, rot: ((Math.atan2(n.x, n.z) * 180) / Math.PI + 360) % 360 };
    }
    return { ok: false, why: "wall" };
  }
}
