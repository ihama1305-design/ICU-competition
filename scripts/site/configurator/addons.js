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
function palm(base, crownY, seed) {
  leaf ||= new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 });
  bark ||= new THREE.MeshStandardMaterial({ map: trunkTexture(), roughness: 1 });
  const rnd = random(seed), parts = [];
  // three rings of fronds: young ones reaching up, old ones hanging
  for (const [count, lift, droop, len] of [[9, 1.0, 0.75, 2.5], [11, 0.55, 0.95, 2.9], [10, 0.12, 1.25, 2.8]]) {
    for (let i = 0; i < count; i++) {
      const g = frondGeometry(len * (0.85 + rnd() * 0.25), 0.6, lift + (rnd() - 0.5) * 0.25, droop * (0.85 + rnd() * 0.3));
      g.rotateX((rnd() - 0.5) * 0.7);
      g.rotateY((i / count) * Math.PI * 2 + rnd() * 0.5);
      parts.push(g);
    }
  }
  const crown = new THREE.Mesh(mergeGeometries(parts), leaf);
  crown.castShadow = true;
  crown.position.set(base.x, crownY, base.z);
  const height = crownY - base.y;
  const trunkMap = bark.map;
  trunkMap.repeat.set(2, height / 2);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, height, 12), bark);
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
    room.root.add(room.addons[id]);
  }
  if (room.addons[id]) {
    room.addons[id].userData.schemeOn = on;
    room.addons[id].visible = on;
  }
}
