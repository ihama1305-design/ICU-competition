// Things added to a room, built the first time they're asked for. Procedural: no model files, nothing to license.
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { W2T } from "./stage.js";
import { drawn } from "./surfaces.js";

const random = seed => { let a = seed >>> 0; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; };

function leafTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 512;
  const g = c.getContext("2d");
  const rnd = random(31);
  g.lineCap = "round";
  for (let i = 0; i < 74; i++) {
    const y = 8 + (i / 74) * 490;
    for (const side of [-1, 1]) {
      const reach = 58 * Math.sin(Math.PI * (0.07 + 0.93 * (y / 512)) ** 0.8) * (0.8 + rnd() * 0.2);
      g.strokeStyle = `hsl(${88 + rnd() * 26}, ${32 + rnd() * 16}%, ${25 + rnd() * 14}%)`;
      g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(64, y); g.lineTo(64 + side * reach, y - 16 - rnd() * 10); g.stroke();
    }
  }
  g.strokeStyle = "#7c7a43"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function trunkTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 256;
  const g = c.getContext("2d");
  g.fillStyle = "#7d6443"; g.fillRect(0, 0, 64, 256);
  const rnd = random(37);
  for (let y = 0; y < 256; y += 10) {
    g.fillStyle = `rgba(50, 36, 20, ${0.25 + rnd() * 0.3})`; g.fillRect(0, y, 64, 3);
    g.fillStyle = `rgba(190, 165, 125, ${0.08 + rnd() * 0.14})`; g.fillRect(0, y + 4, 64, 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** One palm frond: a strip along a drooping curve, starting at the origin and leaving along +x. */
function frondGeometry(length, width, lift, droop, segments = 9) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, x = length * Math.cos(lift * (1 - t) * 0.6) * t;
    const y = length * (Math.sin(lift) * t - droop * t * t);
    const w = width * (0.35 + 0.65 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)));
    pos.push(x, y, -w / 2, x, y, w / 2);
    uv.push(0, 1 - t, 1, 1 - t);
    if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let leaf = null, bark = null;
function palm(base, crownY, seed, scale = 1) {
  leaf ||= new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  bark ||= new THREE.MeshStandardMaterial({ map: trunkTexture(), roughness: 1 });
  const rnd = random(seed), parts = [];
  // three rings of fronds: young ones reaching up, old ones hanging
  for (const [count, lift, droop, len] of [[9, 1.0, 0.75, 2.5], [11, 0.55, 0.95, 2.9], [10, 0.12, 1.25, 2.8]]) {
    for (let i = 0; i < count; i++) {
      const g = frondGeometry(scale * len * (0.85 + rnd() * 0.25), 0.6 * scale, lift + (rnd() - 0.5) * 0.25, droop * (0.85 + rnd() * 0.3));
      g.rotateX((rnd() - 0.5) * 0.7);
      g.rotateY((i / count) * Math.PI * 2 + rnd() * 0.5);
      parts.push(g);
    }
  }
  const crown = new THREE.Mesh(mergeGeometries(parts), leaf);
  crown.castShadow = true;
  crown.position.set(base.x, crownY, base.z);
  const height = crownY - base.y;
  const trunkGeo = new THREE.CylinderGeometry(0.2 * scale, 0.32 * scale, height, 12);
  const uv = trunkGeo.attributes.uv; // one ring pattern per 2 m, whatever the height: the material is shared by every palm
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, (uv.getY(i) * height) / (2 * scale));
  const trunk = new THREE.Mesh(trunkGeo, bark);
  trunk.castShadow = true;
  trunk.position.set(base.x, base.y + height / 2, base.z);
  const g = new THREE.Group();
  g.add(crown, trunk);
  return g;
}

const BUILD = {
  /** Two date palms outside the window. The floor is well above the ground, so their crowns rise to window height. */
  palms(room) {
    const g = new THREE.Group(), v = new THREE.Vector3();
    [["palm_1", 2.55, 41], ["palm_2", 1.95, 43]].forEach(([name, crownY, seed]) => {
      room.anchors[name].getWorldPosition(v);
      g.add(palm(v.clone(), crownY, seed));
    });
    return g;
  },

  /** Low desert planting on the ground below: mounds of grey-green shrubs fanning out from the facade. */
  planting(room) {
    const f = room.meta.facade, rnd = random(47), count = 240;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), count);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const dist = 6 + rnd() ** 0.7 * 70, side = (rnd() - 0.5) * (18 + dist * 1.5);
      const x = f.at[0] + f.normal[0] * dist - f.normal[1] * side, y = f.at[1] + f.normal[1] * dist + f.normal[0] * side;
      const r = 0.45 + rnd() * 1.0;
      s.set(r * (1 + rnd() * 0.5), r * (0.5 + rnd() * 0.3), r * (1 + rnd() * 0.5));
      m.compose(W2T(x, y, -18 + r * 0.3), q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHSL(0.2 + rnd() * 0.1, 0.18 + rnd() * 0.16, 0.33 + rnd() * 0.14));
    }
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  },

  /** A printed sky panel on the ceiling above the bed. Lit from behind, so it reads without the room's lights. */
  sky(room) {
    const m = room.meta, H = m.ceiling, foot = m.bed.foot;
    const cx = m.bed.head[0] + foot[0] * 1.2, cy = m.bed.head[1] + foot[1] * 1.2;
    const mat = new THREE.MeshStandardMaterial({ map: drawn("sky"), roughness: 0.9, emissive: "#ffffff", emissiveMap: drawn("sky"), emissiveIntensity: 0.75 });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.2), mat);
    panel.rotation.x = Math.PI / 2;
    panel.position.copy(W2T(cx, cy, H - 0.006));
    panel.renderOrder = 1;
    room.ceilingExtras.push(panel);
    return panel;
  },
};

/** Show or hide an add-on in this room. */
export function setAddon(room, id, on) {
  room.addons ||= {};
  if (on && !room.addons[id]) {
    room.addons[id] = BUILD[id](room);
    room.addons[id].name ||= `addon_${id}`;
    room.root.add(room.addons[id]);
    if (id === "ventilation" && !room.ceilingFixtures.includes(room.addons[id])) room.ceilingFixtures.push(room.addons[id]);
  }
  if (room.addons[id]) {
    room.addons[id].userData.schemeOn = on;
    room.addons[id].visible = on;
    ensureParts(room, id);
  }
}

// ---------------------------------------------------------------- placed on anchors, built on first use

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const std = (color, roughness = 0.7, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const tagItem = (node, title, description, action) => {
  node.userData.itemInfo = { title, description, ...(action ? { action } : {}) };
  return node;
};
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function ball(r, mat, x, y, z, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  m.castShadow = true;
  return m;
}

/** Put an object on an anchor, with its +Z facing into the room. */
function placeAt(obj, anchor) {
  anchor.getWorldPosition(obj.position);
  anchor.getWorldQuaternion(obj.quaternion);
  obj.rotateY(Math.PI);
  return obj;
}

function canvasTexture(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return { g: c.getContext("2d"), t, w, h };
}

/** The TV's placeholder picture: an original loop of dunes drifting past under a slow sun. */
function drawTvFrame({ g, t, w, h }, seconds) {
  const k = (seconds % 24) / 24;
  const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
  sky.addColorStop(0, "#6fb2d6"); sky.addColorStop(1, "#f4dcb4");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = "#fff4d2";
  g.beginPath(); g.arc(w * (0.2 + 0.6 * Math.sin(k * Math.PI)), h * (0.42 - 0.26 * Math.sin(k * Math.PI)), h * 0.07, 0, 7); g.fill();
  [["#e2bb8a", 0.55, 0.05, 2, 1], ["#d3a26e", 0.66, 0.07, 1, 2], ["#bd8655", 0.8, 0.07, 1, 3]].forEach(([colour, y, amp, waves, speed]) => {
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * (y + amp * Math.sin((x / w) * Math.PI * 2 * waves + k * Math.PI * 2 * speed)));
    g.lineTo(w, h); g.fill();
  });
  t.needsUpdate = true;
}

/** The digital aquarium's picture: fish drawn on a canvas, in a loop. */
function drawFishFrame({ g, t, w, h }, seconds) {
  const k = (seconds % 30) / 30;
  const water = g.createLinearGradient(0, 0, 0, h);
  water.addColorStop(0, "#3fb6d1"); water.addColorStop(1, "#0d4c70");
  g.fillStyle = water; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255, 255, 255, 0.06)";
  for (let i = 0; i < 4; i++) { const x = w * (0.1 + i * 0.27) + 20 * Math.sin(k * 6.28 + i); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 60, 0); g.lineTo(x - 30, h); g.lineTo(x - 90, h); g.fill(); }
  g.fillStyle = "#c9b48a"; g.fillRect(0, h * 0.9, w, h * 0.1);
  g.strokeStyle = "#2f8f63"; g.lineWidth = 7; g.lineCap = "round";
  for (let i = 0; i < 7; i++) { const x = w * (0.06 + i * 0.145); g.beginPath(); g.moveTo(x, h * 0.93); g.quadraticCurveTo(x + 18 * Math.sin(k * 6.28 * 2 + i), h * 0.72, x + 8 * Math.sin(k * 6.28 + i), h * (0.5 + 0.06 * (i % 3))); g.stroke(); }
  const colours = ["#ff8a3c", "#ffd23c", "#f25f7a", "#7fe0c8", "#ffffff"];
  for (let i = 0; i < 9; i++) {
    const dir = i % 2 ? 1 : -1, p = (k * (i % 3 === 0 ? 2 : 1) + i * 0.13) % 1;
    const x = dir > 0 ? -40 + p * (w + 80) : w + 40 - p * (w + 80), y = h * (0.18 + 0.075 * i) + 8 * Math.sin(k * 6.28 * 3 + i), s = 11 + (i % 3) * 5;
    g.fillStyle = colours[i % colours.length];
    g.beginPath(); g.ellipse(x, y, s * 1.6, s, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(x - dir * s * 1.4, y); g.lineTo(x - dir * s * 2.6, y - s * 0.8); g.lineTo(x - dir * s * 2.6, y + s * 0.8); g.fill();
    g.fillStyle = "#14262d"; g.beginPath(); g.arc(x + dir * s * 0.9, y - s * 0.2, s * 0.14, 0, 7); g.fill();
  }
  t.needsUpdate = true;
}

function outdoorChair() {
  const g = new THREE.Group(), frame = std("#6a6f72", 0.5), seat = std("#d8cbb5", 0.9);
  g.add(box(0.5, 0.05, 0.48, seat, 0, 0.42, 0), box(0.5, 0.48, 0.05, seat, 0, 0.68, -0.24));
  for (const x of [-0.23, 0.23]) for (const z of [-0.21, 0.21]) g.add(box(0.03, 0.42, 0.03, frame, x, 0.21, z));
  return g;
}

Object.assign(BUILD, {
  /** Compact sliding-door storage at the far wall, clear of the entrance and bed route. */
  wardrobe(room) {
    const g = new THREE.Group(), w1 = room.label === "W1";
    g.name = "addon_wardrobe";
    const at = w1 ? [13.12, 31.295] : [7.15, 22.04];
    g.position.copy(W2T(at[0], at[1], 0));
    if (w1) g.scale.x = 1 / 1.355; // W1's niche between the IV pole and the wing wall is 1 m wide; the unit is 1.355 m
    const shell = std("#e9e5dc", 0.65), trim = std("#4aaeb2", 0.5), metal = std("#777f82", 0.38, { metalness: 0.35 });
    const doorMat = std("#d2bb96", 0.58); doorMat.name = "wardrobe_surface";
    trim.name = "wardrobe_accent";
    g.add(box(1.25, 1.93, 0.015, std("#756c60", 0.9), 0, 1.03, -0.26));
    g.add(box(0.035, 1.96, 0.56, shell, -0.66, 1.03, 0), box(0.035, 1.96, 0.56, shell, 0.66, 1.03, 0));
    g.add(box(1.30, 0.035, 0.56, shell, 0, 2.02, 0), box(1.30, 0.035, 0.56, shell, 0, 0.045, 0));
    g.add(box(1.30, 0.025, 0.035, metal, 0, 2.07, 0.29), box(1.30, 0.025, 0.035, metal, 0, 0.055, 0.29));
    const shelf = tagItem(box(0.58, 0.035, 0.43, shell, -0.28, 1.47, -0.02), "Wardrobe shelf", "An interior shelf for folded clothes and personal belongings.");
    g.add(shelf);
    const rail = tagItem(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 12), metal), "Hanging rail", "A rail for hangers inside the wardrobe.");
    rail.rotation.z = Math.PI / 2; rail.position.set(0.27, 1.76, -0.05); rail.castShadow = true; g.add(rail);
    const fabric = std("#91b9b5", 0.95); fabric.name = "wardrobe_clothing";
    for (const [i, x] of [-0.43, -0.24, -0.05, 0.14].entries()) {
      const garment = tagItem(box(0.15, 0.47 + (i % 2) * 0.06, 0.025, fabric, x, 1.40, 0.02), "Stored clothing", "Simple clothing shapes show how the sliding wardrobe can hold personal items.");
      garment.material = fabric.clone(); garment.material.color.set(["#91b9b5", "#d5a989", "#a4abc5", "#e0d3b8"][i]);
      g.add(garment);
    }
    const left = tagItem(box(0.67, 1.94, 0.045, doorMat, -0.335, 1.03, 0.30), "Sliding wardrobe door", "This panel slides across the wardrobe opening. Use the button to open or close the doors.", "wardrobe");
    const right = tagItem(box(0.67, 1.94, 0.045, doorMat, 0.335, 1.03, 0.335), "Sliding wardrobe door", "This panel slides across the wardrobe opening. Use the button to open or close the doors.", "wardrobe");
    for (const d of [left, right]) {
      d.add(box(0.025, 0.24, 0.014, trim, 0.24, 0, 0.03));
      d.castShadow = true;
    }
    g.add(left, right);
    const plinth = tagItem(box(1.28, 0.1, 0.52, trim, 0, 0.07, 0), "Wardrobe base", "A recessed, easy-clean kick plate at the foot of the wardrobe.");
    g.add(plinth);
    Object.assign(g.userData, { doors: [left, right], open: false, itemInfo: { title: "Sliding wardrobe", description: "A compact patient storage unit for clothes and personal belongings. It is placed against the back wall to keep the entry route clear.", action: "wardrobe" } });
    return g;
  },

  /** Fixture concept fitted into the existing W1 toilet room beside its entry. */
  bathroom(room) {
    const g = new THREE.Group();
    g.name = "addon_bathroom";
    if (room.label !== "W1") return g;
    g.position.copy(W2T(17.98, 27.46, 0));
    const porcelain = std("#f4f3ef", 0.24), chrome = std("#9ba6a9", 0.28, { metalness: 0.55 }), accent = std("#4aaeb2", 0.45), mirrorMat = std("#c8dadd", 0.08, { metalness: 0.35 });
    const tile = std("#8e9aa0", 0.48); tile.name = "bathroom_surface"; tile.map = drawn("slate", 2.2, 2.5);
    g.add(tagItem(box(1.28, 0.014, 0.64, tile, 0, 0.012, 0), "Bathroom floor tile", "Textured, low-gloss floor finish shown as a design option.") );
    const toilet = new THREE.Group(); toilet.position.set(0.30, 0, -0.07);
    toilet.add(box(0.38, 0.58, 0.17, porcelain, 0, 0.31, -0.16));
    toilet.add(tagItem(ball(0.21, porcelain, 0, 0.22, 0.03, 0.92, 0.54, 1.2), "Toilet", "A compact water closet in the existing W1 bathroom shell."));
    toilet.add(tagItem(ball(0.185, std("#d5d4cf", 0.3), 0, 0.34, 0.035, 1, 0.12, 1.05), "Toilet seat", "Seat detail for the bathroom fixture concept."));
    g.add(tagItem(toilet, "Toilet", "A compact water closet in the existing W1 bathroom shell."));
    const sink = new THREE.Group(); sink.position.set(-0.34, 0, 0.15);
    sink.add(box(0.42, 0.08, 0.24, porcelain, 0, 0.78, 0));
    sink.add(tagItem(ball(0.15, std("#dfe4e2", 0.3), 0, 0.825, 0.015, 1.25, 0.22, 0.78), "Hand-wash basin", "A compact wall-mounted basin with a simple single-lever tap."));
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 10), chrome); tap.position.set(0, 0.91, -0.08); sink.add(tap);
    sink.add(box(0.035, 0.08, 0.12, chrome, 0, 0.96, -0.12));
    g.add(tagItem(sink, "Hand-wash basin", "A compact basin and tap for hand washing."));
    const mirror = tagItem(box(0.40, 0.48, 0.025, mirrorMat, -0.34, 1.42, 0.29), "Mirror", "A simple wall mirror above the hand-wash basin.");
    g.add(mirror);
    const railGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.62, 12);
    const sideRail = tagItem(new THREE.Mesh(railGeo, chrome), "Grab rail", "A visual grab-rail concept beside the toilet. Final placement and fixing need local review.");
    sideRail.rotation.x = Math.PI / 2; sideRail.position.set(0.56, 0.78, -0.07); sideRail.castShadow = true; g.add(sideRail);
    const backRail = tagItem(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.46, 12), chrome), "Rear grab rail", "A visual grab-rail concept behind the toilet. Final placement and fixing need local review.");
    backRail.rotation.z = Math.PI / 2; backRail.position.set(0.30, 0.78, -0.28); backRail.castShadow = true; g.add(backRail);
    const paper = tagItem(box(0.16, 0.12, 0.08, std("#ecebe6", 0.75), 0.55, 0.46, 0.04), "Toilet paper holder", "A wall-mounted toilet paper holder."); g.add(paper);
    const dispenser = tagItem(box(0.16, 0.25, 0.07, std("#e6e8e5", 0.6), -0.57, 1.15, 0.01), "Soap dispenser", "A compact wall-mounted soap dispenser beside the basin."); g.add(dispenser);
    const pull = new THREE.Group(); pull.position.set(-0.56, 1.45, -0.24);
    pull.add(tagItem(box(0.15, 0.17, 0.06, accent, 0, 0, 0), "Call-for-assistance control", "A bathroom assistance control concept. It is not connected to staff or an alarm system."));
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.74, 8), chrome); cord.position.set(0, -0.42, 0); pull.add(cord);
    pull.add(tagItem(ball(0.045, std("#d45349", 0.5), 0, -0.81, 0), "Assistance pull", "A visible pull handle for an assistance-call concept; it does not send a real call."));
    g.add(tagItem(pull, "Bathroom assistance control", "A visual assistance-call concept only; it is not connected to staff."));
    g.userData.itemInfo = { title: "W1 bathroom", description: "The adjacent bathroom shell from the existing model, shown with a toilet, basin, mirror, grab rails, dispensers, and an assistance-call concept." };
    return g;
  },

  /** Quiet, static supply and return grilles; no simulated airflow. Hidden for now: see the ventilation group in options.json. */
  ventilation(room) {
    const g = new THREE.Group(), H = room.meta.ceiling;
    g.name = "addon_ventilation";
    const panel = std("#e4e8e7", 0.62), slat = std("#a3abad", 0.5);
    const NAMES = { supply: "Ceiling supply grille", return: "Ceiling return grille", exhaust: "Ceiling exhaust grille" };
    // the same grilles as the floor's ventilation concept plan, from the room's data
    for (const v of room.meta.vents) {
      const [x, y] = v.at, [w, d] = v.size;
      const plate = tagItem(box(w, 0.012, d, panel), NAMES[v.kind], "A concept position from the floor's ventilation plan, not SSMC's mechanical design. No air moves in this model.");
      plate.position.copy(W2T(x, y, H - 0.006)); g.add(plate);
      const slots = v.kind === "supply" ? 3 : v.kind === "return" ? 5 : 3;
      for (let i = 0; i < slots; i++) {
        const fin = box(w * 0.8, 0.004, 0.012, slat);
        fin.position.copy(W2T(x, y - d * 0.36 + (d * 0.72 * i) / (slots - 1), H - 0.014)); g.add(fin);
      }
    }
    return g;
  },

  /**
   * The wall control for the Comfort systems demo, and one of PACS's connection points. Always shown: it used to come
   * with the grilles, and stays when they're hidden.
   */
  comfortControl(room) {
    const g = new THREE.Group();
    g.name = "addon_comfortControl";
    const light = std("#4aaeb2", 0.35, { emissive: "#4aaeb2", emissiveIntensity: 0.45 });
    light.name = "comfort_status"; // the Comfort systems temperature slider tints it
    const wall = room.label === "W1" ? [17.78, 30.85] : [14.40, 21.4];
    const control = tagItem(box(0.19, 0.24, 0.035, std("#e6e9e7", 0.48), 0, 0, 0), "Room comfort control", "A wall-mounted temperature and humidity control concept. It is not connected to room equipment or patient measurements.");
    control.position.copy(W2T(wall[0], wall[1], 1.55)); control.rotation.y = Math.PI / 2; g.add(control);
    const led = tagItem(ball(0.025, light, 0, 0, 0), "Comfort control status light", "An illustrative status light for the room comfort concept. The Comfort systems temperature demo changes its colour.");
    led.position.copy(W2T(wall[0] - 0.045, wall[1], 1.61)); g.add(led);
    return g;
  },

  /** Visible sound-level indicator concept. It never asks for microphone access. */
  soundSensor(room) {
    const g = new THREE.Group(); g.name = "addon_soundSensor";
    const at = room.label === "W1" ? [17.67, 30.1] : [14.3, 20.8];
    g.position.copy(W2T(at[0], at[1], 1.82));
    g.rotation.y = -Math.PI / 2;
    const shell = std("#e5e9e7", 0.5), ring = std("#7c8d91", 0.38, { metalness: 0.2 });
    g.add(tagItem(box(0.22, 0.15, 0.055, shell, 0, 0, 0), "Sound-level sensor", "A visible, non-recording sound-level sensor concept. This model does not capture audio or identify a patient."));
    const sensorRing = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.018, 20), ring);
    sensorRing.position.set(0, 0, 0.035); g.add(sensorRing);
    const led = tagItem(ball(0.018, std("#55b985", 0.35, { emissive: "#55b985", emissiveIntensity: 0.55 }), 0, 0, 0.052), "Sound indicator", "A status light used for the sound-alert demonstration.", "soundAlert");
    led.material.name = "sound_indicator"; g.add(led);
    g.userData.itemInfo = { title: "Sound-level sensor", description: "A visual, non-recording sensor concept. Use the preview button to show a simulated alert; it does not listen, assess pain, identify a patient, or contact staff.", action: "soundAlert" };
    return g;
  },

  /** A wall-hung TV on the patient's eye line. Width and picture are set by setTv. */
  tv(room) {
    const g = placeAt(new THREE.Group(), room.anchors.tv);
    const shell = box(1, 9 / 16, 0.05, std("#14171a", 0.45), 0, 0, 0.04);
    const pic = canvasTexture(480, 270);
    drawTvFrame(pic, 3);
    const off = new THREE.MeshStandardMaterial({ color: "#0b0e10", roughness: 0.18 });
    const on = new THREE.MeshBasicMaterial({ map: pic.t });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.97, 0.97 * 9 / 16), off);
    screen.position.z = 0.0665;
    const scaler = new THREE.Group();
    scaler.add(shell, screen);
    g.add(scaler);
    Object.assign(g.userData, { scaler, screen, off, on, pic, fps: 12, tick: s => { if (screen.material === on) drawTvFrame(pic, s); }, animated: () => screen.material === on, tickTarget: screen });
    return g;
  },

  /** A shelf under the TV with a console on it, and a controller on the overbed table. */
  console(room) {
    const g = new THREE.Group(), m = room.meta;
    const anchored = placeAt(new THREE.Group(), room.anchors.console);
    anchored.add(box(0.8, 0.03, 0.26, std("#d9d4ca", 0.6), 0, 1.0, -0.14));
    anchored.add(box(0.3, 0.07, 0.2, std("#20262b", 0.4), -0.12, 1.05, -0.14));
    anchored.add(box(0.03, 0.015, 0.003, new THREE.MeshBasicMaterial({ color: "#39d0c0" }), -0.12, 1.05, -0.039));
    const pad = new THREE.Group();
    pad.add(box(0.1, 0.02, 0.05, std("#20262b", 0.5)), ball(0.028, std("#20262b", 0.5), -0.055, 0, 0.018, 1, 0.5, 1.2), ball(0.028, std("#20262b", 0.5), 0.055, 0, 0.018, 1, 0.5, 1.2));
    pad.add(ball(0.009, std("#39d0c0", 0.3), 0.025, 0.014, -0.005), ball(0.009, std("#f25f7a", 0.3), 0.04, 0.014, 0.008));
    pad.position.copy(W2T(m.table.at[0], m.table.at[1], m.table.z + 0.02));
    pad.rotation.y = 0.4;
    g.add(anchored, pad);
    return g;
  },

  /** A low shelf of blocks, rings and books on the family-zone wall. */
  toyshelf(room) {
    const g = placeAt(new THREE.Group(), room.anchors.toys), rnd = random(53);
    const wood = std("#d9bd92", 0.6), colours = ["#e8604c", "#f2b632", "#3fa7c9", "#5bb56b", "#a06cd5"];
    for (const y of [-0.3, 0.12]) g.add(box(1.2, 0.03, 0.26, wood, 0, y, 0.13));
    for (const x of [-0.6, 0.6]) g.add(box(0.03, 0.72, 0.26, wood, x, -0.09, 0.13));
    for (const y of [-0.285, 0.135]) {
      let x = -0.5;
      while (x < 0.45) {
        const s = 0.07 + rnd() * 0.07, c = std(colours[Math.floor(rnd() * 5)], 0.5);
        g.add(rnd() > 0.65 ? ball(s * 0.6, c, x, y + s * 0.6, 0.13) : box(s, s, s, c, x, y + s / 2, 0.13));
        x += s + 0.05;
      }
    }
    return g;
  },

  /** A teddy and a rabbit, on the play mat's spot. */
  softtoys(room) {
    const g = placeAt(new THREE.Group(), room.anchors.playmat);
    const teddy = (x, z, fur, muzzle) => {
      const t = new THREE.Group(), a = std(fur, 0.95), b = std(muzzle, 0.95);
      t.add(ball(0.12, a, 0, 0.13, 0, 1, 1.1, 0.95), ball(0.09, a, 0, 0.3, 0.01), ball(0.038, a, -0.07, 0.38, 0), ball(0.038, a, 0.07, 0.38, 0));
      t.add(ball(0.04, b, 0, 0.285, 0.08), ball(0.045, a, -0.12, 0.17, 0.05, 0.8, 1.2, 0.8), ball(0.045, a, 0.12, 0.17, 0.05, 0.8, 1.2, 0.8), ball(0.05, a, -0.08, 0.05, 0.11), ball(0.05, a, 0.08, 0.05, 0.11));
      t.position.set(x, 0.012, z); t.rotation.y = -x;
      return t;
    };
    const rabbit = teddy(0.3, -0.32, "#ece4d8", "#f6c6c6");
    rabbit.add(ball(0.03, std("#ece4d8", 0.95), -0.04, 0.47, 0, 0.7, 2.4, 0.7), ball(0.03, std("#ece4d8", 0.95), 0.04, 0.47, 0, 0.7, 2.4, 0.7));
    g.add(teddy(-0.38, 0.1, "#b58a5a", "#e5cfae"), rabbit);
    return g;
  },

  /** A soft foam mat printed with simple shapes. */
  playmat(room) {
    const pic = canvasTexture(1024, 720), { g } = pic, rnd = random(59);
    g.fillStyle = "#f4efe2"; g.fillRect(0, 0, 1024, 720);
    const colours = ["#e8604c", "#f2b632", "#3fa7c9", "#5bb56b", "#a06cd5"];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      g.fillStyle = colours[(i + j * 2) % 5];
      const x = 128 + i * 256, y = 120 + j * 240, s = 70 + rnd() * 20;
      g.beginPath();
      if ((i + j) % 3 === 0) g.arc(x, y, s, 0, 7);
      else if ((i + j) % 3 === 1) g.rect(x - s, y - s, s * 2, s * 2);
      else { g.moveTo(x, y - s * 1.1); g.lineTo(x + s * 1.1, y + s * 0.9); g.lineTo(x - s * 1.1, y + s * 0.9); g.closePath(); }
      g.fill();
    }
    const mat = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.012, 1.2), [std("#d9d2c0"), std("#d9d2c0"), std("#ffffff", 0.9, { map: pic.t }), std("#d9d2c0"), std("#d9d2c0"), std("#d9d2c0")]);
    mat.receiveShadow = true;
    const a = placeAt(new THREE.Group(), room.anchors.playmat);
    mat.position.y = 0.006;
    a.add(mat);
    return a;
  },

  /** A sofa-bed against the family-zone wall. Its colour follows the upholstery choice. */
  sofa(room) {
    const g = placeAt(new THREE.Group(), room.anchors.seating), cloth = std("#5f8f8a", 0.95);
    if (room.label === "W3") g.position.copy(W2T(12.2, 22.0, 0)); // W3's sofa stands here, not on its seating anchor
    cloth.name = "upholstery";
    const feet = std("#7a7f82", 0.5);
    g.add(box(1.7, 0.3, 0.8, cloth, 0, 0.27, 0), box(0.8, 0.14, 0.68, cloth, -0.41, 0.48, 0.06), box(0.8, 0.14, 0.68, cloth, 0.41, 0.48, 0.06));
    g.add(box(1.7, 0.52, 0.16, cloth, 0, 0.62, -0.32), box(0.16, 0.42, 0.8, cloth, -0.85, 0.42, 0), box(0.16, 0.42, 0.8, cloth, 0.85, 0.42, 0));
    for (const x of [-0.78, 0.78]) for (const z of [-0.33, 0.33]) g.add(box(0.05, 0.12, 0.05, feet, x, 0.06, z));
    return g;
  },

  /** Animated fish on a wall screen. */
  digital(room) {
    const g = placeAt(new THREE.Group(), room.anchors.aquarium), pic = canvasTexture(640, 384);
    drawFishFrame(pic, 7);
    g.add(box(1.14, 0.7, 0.05, std("#1a1e22", 0.4), 0, 0, 0.025));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.08, 0.64), new THREE.MeshBasicMaterial({ map: pic.t }));
    screen.position.z = 0.052;
    g.add(screen);
    Object.assign(g.userData, { fps: 12, tick: s => drawFishFrame(pic, s), animated: () => true, tickTarget: screen });
    return g;
  },

  /** A sealed tank set into the wall, with fish that swim. */
  sealed(room) {
    const g = placeAt(new THREE.Group(), room.anchors.aquarium), W = 1.1, H = 0.62, D = 0.09;
    const back = canvasTexture(256, 160), c = back.g.createLinearGradient(0, 0, 0, 160);
    c.addColorStop(0, "#6fd0dd"); c.addColorStop(1, "#14587d");
    back.g.fillStyle = c; back.g.fillRect(0, 0, 256, 160);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: back.t }));
    water.position.z = 0.005;
    g.add(water);
    g.add(box(W + 0.1, 0.05, D + 0.02, std("#e9e7e1", 0.5), 0, H / 2 + 0.025, D / 2), box(W + 0.1, 0.05, D + 0.02, std("#e9e7e1", 0.5), 0, -H / 2 - 0.025, D / 2));
    g.add(box(0.05, H, D + 0.02, std("#e9e7e1", 0.5), -W / 2 - 0.025, 0, D / 2), box(0.05, H, D + 0.02, std("#e9e7e1", 0.5), W / 2 + 0.025, 0, D / 2));
    g.add(box(W, 0.06, D, std("#c9b48a", 1), 0, -H / 2 + 0.03, D / 2));
    const rnd = random(61), leaf = std("#2f8f63", 0.8, { side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.18 + rnd() * 0.22), leaf);
      p.position.set(-0.5 + i * 0.125, -H / 2 + 0.17, 0.03 + rnd() * 0.04);
      p.rotation.z = (rnd() - 0.5) * 0.4;
      g.add(p);
    }
    const fishGeo = mergeGeometries([new THREE.SphereGeometry(0.026, 10, 8).scale(1.5, 0.95, 0.45), new THREE.ConeGeometry(0.024, 0.04, 6).rotateZ(-Math.PI / 2).translate(-0.05, 0, 0)].map(q => q.toNonIndexed()));
    const count = 12, fish = new THREE.InstancedMesh(fishGeo, new THREE.MeshBasicMaterial(), count);
    const colours = ["#ff8a3c", "#ffd23c", "#f25f7a", "#7fe0c8", "#ffffff"], col = new THREE.Color();
    const swim = Array.from({ length: count }, (_, i) => {
      fish.setColorAt(i, col.set(colours[i % 5]));
      return { y: -0.18 + rnd() * 0.42, z: 0.025 + rnd() * 0.05, speed: 0.05 + rnd() * 0.05, phase: rnd() * 6.28, size: 0.8 + rnd() * 0.6 };
    });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const place = t => {
      swim.forEach((f, i) => {
        const a = t * f.speed * 6.28 + f.phase;
        v.set((W / 2 - 0.08) * Math.sin(a), f.y + 0.012 * Math.sin(a * 3), f.z);
        q.setFromAxisAngle(up, Math.cos(a) >= 0 ? 0 : Math.PI);
        s.setScalar(f.size);
        fish.setMatrixAt(i, m.compose(v, q, s));
      });
      fish.instanceMatrix.needsUpdate = true;
    };
    place(0);
    g.add(fish);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ color: "#dff0f2", roughness: 0.05, transparent: true, opacity: 0.1, depthWrite: false }));
    glass.position.z = D;
    g.add(glass);
    Object.assign(g.userData, { fps: 24, tick: place, animated: () => true, tickTarget: water });
    return g;
  },

  /** A shaded balcony beyond the facade's three bays. Local +Z points outward, from the glass line. */
  patio(room) {
    const g = placeAt(new THREE.Group(), room.anchors.patio), m = room.meta, W = m.patio.width, DEPTH = 2.5, H = m.ceiling;
    const metal = std("#7f8689", 0.5), pane = new THREE.MeshStandardMaterial({ color: "#d9e8ea", roughness: 0.05, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const deck = box(W + 0.2, 0.25, DEPTH, std("#cdbfa8", 0.85), 0, -0.127, DEPTH / 2);
    g.add(deck);
    // a sliding door: one fixed pane and one leaf, each half the opening
    const head = H - 0.06;
    g.add(box(W, 0.06, 0.1, metal, 0, head, 0), box(W, 0.02, 0.1, metal, 0, 0.01, 0));
    for (const x of [-W / 2, 0, W / 2]) g.add(box(0.06, head, 0.1, metal, x, head / 2, 0));
    for (const [x, z] of [[-W / 4, -0.02], [W / 4, 0.02]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(W / 2 - 0.06, head - 0.04), pane);
      p.position.set(x, head / 2, z);
      g.add(p);
    }
    // a glass balustrade on the three open sides
    for (const [w, x, z, ry] of [[W + 0.2, 0, DEPTH, 0], [DEPTH, -(W + 0.2) / 2, DEPTH / 2, Math.PI / 2], [DEPTH, (W + 0.2) / 2, DEPTH / 2, Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.08), pane);
      p.position.set(x, 0.54, z); p.rotation.y = ry;
      const rail = box(w, 0.04, 0.05, metal, x, 1.1, z);
      rail.rotation.y = ry;
      g.add(p, rail);
    }
    // planters, and palms in them when palms are chosen
    const terrace = new THREE.Group();
    for (const [x, z, crown, seed] of [[-W / 2 + 0.35, DEPTH - 0.4, 2.35, 67], [W / 2 - 0.35, DEPTH - 0.4, 2.05, 71]]) {
      g.add(box(0.6, 0.55, 0.6, std("#8d7a63", 0.9), x, 0.275, z), box(0.52, 0.02, 0.52, std("#4a3a2a", 1), x, 0.55, z));
      terrace.add(palm(new THREE.Vector3(x, 0.55, z), crown, seed, 0.5));
    }
    g.add(terrace);
    const chair = outdoorChair();
    chair.position.set(-0.55, 0, 1.2); chair.rotation.y = 2.5;
    g.add(chair);
    // shade: a pergola or a sail; setShade picks
    const pergola = new THREE.Group(), wood = std("#a8865f", 0.8);
    for (const x of [-W / 2, W / 2]) pergola.add(box(0.1, 2.6, 0.1, wood, x, 1.3, DEPTH - 0.08));
    for (const x of [-W / 2, W / 2]) pergola.add(box(0.08, 0.14, DEPTH, wood, x, 2.62, DEPTH / 2));
    for (let i = 0; i <= 11; i++) pergola.add(box(W, 0.06, 0.05, wood, 0, 2.72, 0.12 + i * ((DEPTH - 0.2) / 11)));
    const sail = new THREE.Group();
    const sg = new THREE.BufferGeometry(), a = [-W / 2, 2.72, 0.1], b = [W / 2, 2.72, 0.1], c = [W / 2, 2.35, DEPTH - 0.05], d = [-W / 2, 2.35, DEPTH - 0.05], mid = [0, 2.42, DEPTH / 2];
    sg.setAttribute("position", new THREE.Float32BufferAttribute([...a, ...b, ...mid, ...b, ...c, ...mid, ...c, ...d, ...mid, ...d, ...a, ...mid], 3));
    sg.computeVertexNormals();
    const cloth = new THREE.Mesh(sg, std("#f1ece0", 0.9, { side: THREE.DoubleSide }));
    cloth.castShadow = true;
    sail.add(cloth);
    for (const x of [-W / 2, W / 2]) sail.add(box(0.06, 2.4, 0.06, metal, x, 1.2, DEPTH - 0.05));
    g.add(pergola, sail);
    sail.visible = false;
    Object.assign(g.userData, { terrace, pergola, sail });
    return g;
  },
});

/** Show or hide an add-on, and register what it needs: its materials, for colour choices, and anything that animates. */
export function ensureParts(room, id) {
  const a = room.addons?.[id];
  if (!a || a.userData.registered) return;
  a.userData.registered = true;
  a.traverse(n => {
    const mats = n.isMesh ? [n.material].flat() : [];
    if (mats.length) (room.parts[`addon_${id}`] ||= []).push(n);
  });
}

/** Apply scaled, reusable surface looks to the added furniture. */
export function setAddonLook(room, id, look) {
  const addon = room.addons?.[id];
  if (!addon) return;
  const swap = (mat, texture, repeats, tint = "#ffffff") => {
    mat.map?.dispose();
    mat.map = drawn(texture, repeats[0], repeats[1]);
    mat.color.set(tint);
    mat.needsUpdate = true;
  };
  if (id === "wardrobe") {
    const map = { oak: ["oak", "#ffffff"], walnut: ["wood", "#ffffff"], linen: ["fabric", "#f1ece0"] }[look];
    if (!map) return;
    for (const door of addon.userData.doors || []) swap(door.material, map[0], [2.5, 2.2], map[1]);
  } else if (id === "bathroom") {
    const map = { stone: ["slate", "#ffffff"], terrazzo: ["terrazzo", "#ffffff"], sea: ["sand", "#a9cbd0"] }[look];
    if (!map) return;
    addon.traverse(n => { if (n.isMesh && n.material?.name === "bathroom_surface") swap(n.material, map[0], [2.2, 2.5], map[1]); });
  }
}

export function toggleWardrobe(room) {
  const wardrobe = room.addons?.wardrobe;
  if (!wardrobe) return false;
  wardrobe.userData.open = !wardrobe.userData.open;
  const [left] = wardrobe.userData.doors;
  left.position.x = wardrobe.userData.open ? 0.335 : -0.335;
  return wardrobe.userData.open;
}

/** TV width in metres, and whether it's playing. Built on first use, and it replaces the exported TV. */
export function setTv(room, { width, playing }) {
  setAddon(room, "tv", true);
  (room.parts.cfg_tv || []).forEach(n => { n.visible = false; });
  (room.parts.cfg_tv_screen || []).forEach(n => { n.visible = false; });
  const u = room.addons.tv.userData;
  if (width !== undefined) u.scaler.scale.set(width, width, 1);
  if (playing !== undefined) u.screen.material = playing ? u.on : u.off;
}

export function setShade(room, kind) {
  const p = room.addons?.patio;
  if (!p) return;
  p.userData.pergola.visible = kind === "pergola";
  p.userData.sail.visible = kind === "sail";
}

/** Palms stand in terrace planters when there's a patio, and as tall crowns outside the window when there isn't. */
export function syncPalms(room, palmsOn, patioOn) {
  if (room.addons?.palms) room.addons.palms.visible = palmsOn && !patioOn;
  if (room.addons?.patio) room.addons.patio.userData.terrace.visible = palmsOn;
}

const camera_frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4();
/** Advance anything animated that's in view. Returns true if something changed. */
export function tickAddons(room, now, camera) {
  if (!room.addons || reduced()) return false;
  viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  camera_frustum.setFromProjectionMatrix(viewProjection);
  let changed = false;
  for (const a of Object.values(room.addons)) {
    const u = a.userData;
    if (!u.tick || !a.visible || !u.animated() || !camera_frustum.intersectsObject(u.tickTarget)) continue;
    if (now - (u.last || 0) < 1000 / u.fps) continue;
    u.last = now;
    u.tick(now / 1000);
    changed = true;
  }
  return changed;
}
