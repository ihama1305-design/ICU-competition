// The compact visitor chair, drawn in code, and what changes in the room when it replaces the recliner and the visitor chair
// in the room models: their baked contact shadows come off the floor, and the privacy curtain gets its recessed track.
// One geometry for every theme: only the upholstery colour changes, through the Upholstery and curtain choice (options.json).
// The chair is a proposal. Its sizes are assumptions (chair-data.js), and nothing here says a product like it is approved.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { W2T } from "./stage.js";
import { inside } from "./cameras.js";
import { CHAIR, CHAIR_BAY } from "./chair-data.js";

const std = (color, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
const soft = (w, h, d, r, mat, x, y, z) => mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat, x, y, z);
/** A tube between two points, with a rounded cap at each end. */
function tube(a, b, r, mat) {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), len = from.distanceTo(to);
  const m = mesh(new THREE.CapsuleGeometry(r, len, 3, 10), mat);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  return m;
}

/** The soft shadow a chair leaves on the floor under it: drawn once, shared, and moved with the chair. It isn't a solid thing. */
let contact = null;
function contactShadow(w, d) {
  if (!contact) {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"), fade = g.createRadialGradient(64, 64, 14, 64, 64, 64);
    fade.addColorStop(0, "rgba(20, 24, 28, 0.5)"); fade.addColorStop(0.5, "rgba(20, 24, 28, 0.26)"); fade.addColorStop(1, "rgba(20, 24, 28, 0)");
    g.fillStyle = fade; g.fillRect(0, 0, 128, 128);
    contact = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: contact, transparent: true, depthWrite: false, toneMapped: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.012;
  m.renderOrder = 1;
  m.name = "contact_shadow";
  m.userData.notSolid = true; // the layout check counts solid things only (main.js layoutInputs)
  m.raycast = () => {}; // and a click goes to the floor under it
  return m;
}

/**
 * The chair, standing on y = 0 and facing +z. A seat and a back with a gap between them, so a cloth passes through where
 * crumbs and fluid would otherwise collect; slim padded arms under sealed caps, where hands go; and a sled base of two
 * runners, which reaches past the back so the backrest stays off the wall. Upholstery is one coated surface with rounded
 * edges and no piping or buttons drawn. Every part is rounded, and the whole is `CHAIR` in size.
 */
export function compactChair({ shadow = true, colour = "#3E7F8C" } = {}) {
  const g = new THREE.Group(), W = CHAIR.width, D = CHAIR.depth;
  const cloth = std(colour, 0.58); cloth.name = "upholstery"; // the Upholstery and curtain choice colours it
  const cap = std("#ecebe6", 0.32); cap.name = "chair_cap";
  const steel = std("#b7bdc0", 0.45, { metalness: 0.55 }); steel.name = "chair_frame";
  const glide = std("#3a4044", 0.7);
  const armX = W / 2 - 0.035, front = D / 2 - 0.02, back = -D / 2, seatY = CHAIR.seat - 0.05;
  // the seat and the back
  g.add(soft(CHAIR.seatWidth, 0.1, CHAIR.seatDepth, 0.04, cloth, 0, seatY, front - CHAIR.seatDepth / 2));
  // the back leans a little. Its height is worked out so that, leaning, it reaches exactly from the gap over the seat to the
  // chair's stated height: the size on the card is the size drawn
  const lean = 0.14, backT = 0.09, backH = (CHAIR.height - CHAIR.seat - CHAIR.cleanGap - backT * Math.sin(lean)) / Math.cos(lean);
  const rest = soft(CHAIR.seatWidth, backH, backT, 0.044, cloth, 0, (CHAIR.seat + CHAIR.cleanGap + CHAIR.height) / 2, back + 0.085);
  rest.rotation.x = -lean;
  g.add(rest);
  // the arms: a slim pad from the seat up, and a sealed cap on top
  for (const x of [-armX, armX]) {
    g.add(soft(0.05, 0.28, 0.46, 0.024, cloth, x, CHAIR.arm - 0.175, 0.01), soft(0.07, 0.035, 0.48, 0.016, cap, x, CHAIR.arm - 0.0175, 0.01));
  }
  // the sled base: a runner each side, a leg at each end of it up to the arm, and two rails under the seat
  const r = 0.014, legTop = CHAIR.arm - 0.3;
  for (const x of [-armX, armX]) {
    g.add(tube([x, r, back + r], [x, r, front], r, steel));
    g.add(tube([x, r, front - 0.06], [x, legTop, front - 0.1], r, steel), tube([x, r, back + 0.08], [x, legTop, back + 0.16], r, steel));
    for (const z of [back + 0.03, front - 0.03]) g.add(mesh(new THREE.BoxGeometry(0.034, 0.006, 0.05), glide, x, 0.003, z)); // glides, so it slides without marking the floor
  }
  for (const z of [front - 0.12, back + 0.2]) g.add(tube([-armX, seatY - 0.062, z], [armX, seatY - 0.062, z], 0.012, steel));
  for (const x of [-0.16, 0.16]) g.add(tube([x, seatY - 0.062, back + 0.2], [x, CHAIR.seat + CHAIR.cleanGap + 0.08, back + 0.1], 0.012, steel)); // the back's two stems
  if (shadow) g.add(contactShadow(W + 0.36, D + 0.36));
  return g;
}

/** The chair in its bay in this room (addons.js adds it as the compactChair add-on). */
export function placeCompactChair(room) {
  const bay = CHAIR_BAY[room.label], g = compactChair();
  g.position.copy(W2T(bay.at[0], bay.at[1], 0));
  g.rotation.y = ((bay.faces + 90) * Math.PI) / 180; // its front, local +z, toward `faces` on the plan
  g.userData.itemInfo = { title: "Compact visitor chair", description: "A compact chair for a visitor, in its bay by the window. A design proposal, not an approved product." };
  return g;
}

/**
 * A slim track set flush into the ceiling over the privacy curtain, along the glazed front, so nothing hangs below the
 * ceiling to collect dust and the curtain's parked position at the end of the opening is plain to see. Its line and length
 * come from the curtain in the room model. Shown only while the curtain is.
 */
export function curtainTrack(room) {
  const g = new THREE.Group(), f = room.meta.front, H = room.meta.ceiling, box = new THREE.Box3();
  room.root.updateMatrixWorld(true);
  (room.parts.cfg_curtain || []).forEach(n => box.expandByObject(n));
  // the curtain's distance into the room from the front's line; the track runs the front's whole width above it
  const c = box.isEmpty() ? null : box.getCenter(new THREE.Vector3()), into = c ? (c.x - f.at[0]) * f.inward[0] + (-c.z - f.at[1]) * f.inward[1] : 0.18;
  const len = f.width + 0.24, mid = [f.at[0] + f.inward[0] * into, f.at[1] + f.inward[1] * into];
  const turn = Math.atan2(f.axis[1], f.axis[0]); // local x along the front
  const channel = mesh(new THREE.BoxGeometry(len, 0.012, 0.05), std("#aab1b4", 0.5, { metalness: 0.3 })), reveal = mesh(new THREE.BoxGeometry(len - 0.02, 0.004, 0.014), std("#3b4145", 0.6));
  channel.position.copy(W2T(mid[0], mid[1], H - 0.006)); channel.rotation.y = turn; channel.castShadow = false;
  reveal.position.copy(W2T(mid[0], mid[1], H - 0.0125)); reveal.rotation.y = turn; reveal.castShadow = false;
  g.add(channel, reveal);
  g.userData.itemInfo = { title: "Recessed curtain track", description: "A track set flush into the ceiling over the privacy curtain. The curtain parks at the end of the opening, clear of the door." };
  room.ceiling.push(g); // lifted off with the ceiling in the dollhouse
  return g;
}

// ---------------------------------------------------------------- the old chairs' baked shadows

const OLD = ["cfg_kit_recliner", "cfg_kit_visitor_chair"], PAD = 0.16; // how far a baked contact shadow spreads past its chair, in metres
const SHADOW_TOP = 1.45; // and how far up a wall beside it, in metres: just over the recliner's back

/**
 * Where the room model's two chairs stand, noted once as a room loads and before anything moves: the floor's baked shadow
 * map (stage.js) has their contact shadows in it, at these places.
 */
export function noteSeating(room) {
  if (room.seating) return;
  room.root.updateMatrixWorld(true);
  const boxes = OLD.map(p => {
    const b = new THREE.Box3();
    (room.parts[p] || []).forEach(n => b.expandByObject(n));
    return b.isEmpty() ? null : [b.min.x - PAD, -b.max.z - PAD, b.max.x + PAD, -b.min.z + PAD];
  }).filter(Boolean);
  const floors = (room.parts.cfg_floor || []).filter(n => n.material.aoMap), walls = (room.parts.cfg_paint_walls || []).filter(n => n.material.aoMap);
  room.seating = { boxes, floors, walls, baked: floors[0]?.material.aoMap || null, wallsBaked: walls[0]?.material.aoMap || null, cleared: null, wallsCleared: null };
}

/**
 * The floor's shadow map without the two chairs' contact shadows: inside each chair's box, every pixel is filled from the
 * open floor just outside the box, nearer pixels counting for more. A narrow repair of the baked map, made only
 * where a chair stood, so the room model and its other shadows are untouched.
 */
function clearedShadows(room) {
  const s = room.seating, map = copyOf(s.baked), { W, H, px } = map, [x0, y0, x1, y1] = room.meta.room;
  const plan = (i, j) => [x0 + ((i + 0.5) / W) * (x1 - x0), y1 - ((j + 0.5) / H) * (y1 - y0)];
  const col = x => Math.round(((x - x0) / (x1 - x0)) * W), row = y => Math.round(((y1 - y) / (y1 - y0)) * H);
  const inBox = (x, y) => s.boxes.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
  for (const b of s.boxes) {
    const i0 = Math.max(1, col(b[0])), i1 = Math.min(W - 2, col(b[2])), j0 = Math.max(1, row(b[3])), j1 = Math.min(H - 2, row(b[1]));
    // the floor's own shade just outside the box: only where it's open floor, and under neither chair
    const rim = [];
    const take = (i, j) => { const [x, y] = plan(i, j); if (inside(x, y, room.meta.walkable) && !inBox(x, y)) rim.push([i, j, px[(j * W + i) * 4]]); };
    for (let i = i0 - 1; i <= i1 + 1; i += 2) { take(i, j0 - 1); take(i, j1 + 1); }
    for (let j = j0 - 1; j <= j1 + 1; j += 2) { take(i0 - 1, j); take(i1 + 1, j); }
    if (rim.length < 8) continue;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // every pixel in the box, the strip of floor between the walking area and the wall's face included: a pixel under
        // the wall itself is lifted too, where the wall hides it
        let sum = 0, weight = 0;
        for (const [ri, rj, v] of rim) { const w = 1 / ((ri - i) ** 2 + (rj - j) ** 2) ** 1.5; sum += v * w; weight += w; }
        const k = (j * W + i) * 4;
        px[k] = px[k + 1] = px[k + 2] = Math.max(px[k], sum / weight); // it only ever lifts a shadow
      }
    }
  }
  return map.texture();
}

/** A copy of a baked shadow map to repair, as a canvas and its pixels, and the texture made from it afterwards. */
function copyOf(baked) {
  const img = baked.image, c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, c.width, c.height);
  return {
    W: c.width, H: c.height, px: data.data,
    texture() {
      g.putImageData(data, 0, 0);
      const t = new THREE.CanvasTexture(c);
      t.flipY = baked.flipY; t.colorSpace = baked.colorSpace; t.channel = baked.channel; t.wrapS = baked.wrapS; t.wrapT = baked.wrapT;
      return t;
    },
  };
}

/**
 * The walls' shadow map without the shadow each chair cast on the wall beside it. The walls' map is laid out by the wall
 * mesh's own UVs, so this goes through the mesh: each wall triangle that comes within a chair's box is walked texel by
 * texel, and a texel below SHADOW_TOP inside the box takes the shade of the same wall straight above it, just over where the
 * chair's shadow stopped. It only ever lifts a shadow, and touches nothing outside the boxes.
 */
function clearedWalls(room) {
  const s = room.seating, map = copyOf(s.wallsBaked), { W, H, px } = map, orig = px.slice();
  const inBox = (x, y) => s.boxes.some(b => x > b[0] && x < b[2] && y > b[1] && y < b[3]);
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), P = new THREE.Vector3(), bary = new THREE.Vector3();
  room.root.updateMatrixWorld(true);
  for (const mesh of s.walls) {
    const geo = mesh.geometry, pos = geo.attributes.position, uv = geo.attributes.uv, index = geo.index;
    if (!pos || !uv) continue;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const [ia, ib, ic] = index ? [index.getX(t), index.getX(t + 1), index.getX(t + 2)] : [t, t + 1, t + 2];
      A.fromBufferAttribute(pos, ia).applyMatrix4(mesh.matrixWorld); B.fromBufferAttribute(pos, ib).applyMatrix4(mesh.matrixWorld); C.fromBufferAttribute(pos, ic).applyMatrix4(mesh.matrixWorld);
      if (Math.min(A.y, B.y, C.y) > SHADOW_TOP) continue;
      // near a chair's box at all? (plan x is world x, plan y is -world z)
      const x0 = Math.min(A.x, B.x, C.x), x1 = Math.max(A.x, B.x, C.x), y0 = Math.min(-A.z, -B.z, -C.z), y1 = Math.max(-A.z, -B.z, -C.z);
      if (!s.boxes.some(b => x1 > b[0] && x0 < b[2] && y1 > b[1] && y0 < b[3])) continue;
      const ua = uv.getX(ia) * W, va = uv.getY(ia) * H, ub = uv.getX(ib) * W, vb = uv.getY(ib) * H, uc = uv.getX(ic) * W, vc = uv.getY(ic) * H;
      const den = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc);
      if (Math.abs(den) < 1e-9) continue;
      for (let j = Math.max(0, Math.floor(Math.min(va, vb, vc))); j <= Math.min(H - 1, Math.ceil(Math.max(va, vb, vc))); j++) {
        for (let i = Math.max(0, Math.floor(Math.min(ua, ub, uc))); i <= Math.min(W - 1, Math.ceil(Math.max(ua, ub, uc))); i++) {
          const wa = ((vb - vc) * (i + 0.5 - uc) + (uc - ub) * (j + 0.5 - vc)) / den, wb = ((vc - va) * (i + 0.5 - uc) + (ua - uc) * (j + 0.5 - vc)) / den, wc = 1 - wa - wb;
          if (wa < -0.02 || wb < -0.02 || wc < -0.02) continue;
          P.set(0, 0, 0).addScaledVector(A, wa).addScaledVector(B, wb).addScaledVector(C, wc);
          if (P.y >= SHADOW_TOP || !inBox(P.x, -P.z)) continue;
          // the same spot on the wall, straight up to just over the shadow: where that falls on the map, by this triangle's own layout
          P.y = SHADOW_TOP + 0.06;
          THREE.Triangle.getBarycoord(P, A, B, C, bary);
          const ri = Math.round(bary.x * ua + bary.y * ub + bary.z * uc - 0.5), rj = Math.round(bary.x * va + bary.y * vb + bary.z * vc - 0.5);
          if (ri < 0 || rj < 0 || ri >= W || rj >= H) continue;
          const k = (j * W + i) * 4, ref = orig[(rj * W + ri) * 4];
          px[k] = px[k + 1] = px[k + 2] = Math.max(px[k], ref);
        }
      }
    }
  }
  return map.texture();
}

/**
 * Run after every change of choices (main.js settle()). While both of the model's chairs are hidden the floor takes the
 * shadow map without them, and it takes the baked one back as soon as either returns. The curtain's track shows with the
 * curtain. The walls beside the chairs follow the floor. Returns true if any baked shadow changed.
 */
export function syncSeating(room, setAddon) {
  const s = room.seating, shown = p => (room.parts[p] || []).some(n => n.visible);
  setAddon(room, "curtainTrack", (room.parts.cfg_curtain || []).some(n => n.visible));
  if (!s?.baked) return false;
  const here = OLD.some(shown), want = here ? s.baked : (s.cleared ||= clearedShadows(room));
  let changed = false;
  for (const n of s.floors) if (n.material.aoMap !== want) { n.material.aoMap = want; changed = true; }
  if (s.wallsBaked) {
    const wall = here ? s.wallsBaked : (s.wallsCleared ||= clearedWalls(room));
    for (const n of s.walls) if (n.material.aoMap !== wall) { n.material.aoMap = wall; changed = true; }
  }
  return changed;
}
