// The Future ICU fittings: a lit ceiling tray, the staff panel at the bed head, the patient wall round the TV, a clinician
// workstation and a bedside cabinet. Each is an option group (options.json, codes 38 to 42, off by default), and the Future ICU
// theme turns them all on. Drawn in code, built the first time they're asked for, at places measured from the room models:
// clear of the keep-clear areas, the doors, the wardrobe's front and the route to the bed (layout.js checks each room).
// Their screens show stills, marked SIMULATED: nothing on them is a reading, and none of them stands in for the patient monitor.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { drawn } from "./surfaces.js";
import { FIT } from "./fittings-data.js";

export { ACROSS, FIT } from "./fittings-data.js";

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const WHITE = () => std("#f1f2f0", 0.35); // a sealed, wipe-clean white
const tag = (node, title, description) => { node.userData.itemInfo = { title, description }; node.traverse(n => { if (n.isMesh) n.userData.itemInfo = node.userData.itemInfo; }); return node; };
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** A flat panel with rounded corners, `d` deep, its back at z = 0 and its face toward +z. */
function rounded(w, h, d, r, mat) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 6 }), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
/** A group on a wall, centred on its span at height z, facing into the room: local x along the wall, y up, z out of it. */
function onWall(g, { x, y, into }, z = 0) {
  g.position.copy(W2T((x[0] + x[1]) / 2, y, z));
  g.rotation.y = into < 0 ? 0 : Math.PI;
  return g;
}
/** The thin line of light under a panel. It shares the cove's strip, so it takes the room light's colour. */
const lightLine = (room, w, y, z) => { const n = box(w, 0.012, 0.012, room.fixtures?.strip || new THREE.MeshBasicMaterial({ color: "#f4f8ff" }), 0, y, z); n.castShadow = false; return n; };

// ---------------------------------------------------------------- the screens' stills, drawn once

const INK = "#e8f1f4", DIM = "#8fa7b0", BG = "#0e1b22";
function still(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = BG; g.fillRect(0, 0, w, h);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The mark every screen carries, bottom right. */
function simulated(g, w, h, size = 22) {
  g.font = `600 ${size}px system-ui, sans-serif`;
  const text = "SIMULATED", tw = g.measureText(text).width, pad = size * 0.45;
  g.fillStyle = "#f2c14e"; g.fillRect(w - tw - pad * 3, h - size - pad * 2.6, tw + pad * 2, size + pad * 1.6);
  g.fillStyle = "#1a1a1a"; g.textBaseline = "middle"; g.fillText(text, w - tw - pad * 2, h - size / 2 - pad * 1.8);
}
const heading = (g, text, x, y, size = 30) => { g.font = `600 ${size}px system-ui, sans-serif`; g.fillStyle = INK; g.textBaseline = "alphabetic"; g.fillText(text, x, y); };
const line = (g, text, x, y, size = 24, colour = DIM) => { g.font = `${size}px system-ui, sans-serif`; g.fillStyle = colour; g.textBaseline = "alphabetic"; g.fillText(text, x, y); };
/** A made-up trace: a shape, not a reading. */
function trace(g, x0, y0, w, h, colour, kind) {
  g.strokeStyle = colour; g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= w; i += 2) {
    const t = i / w * 6.283 * 4, k = t % 6.283;
    const v = kind === "beat" ? (k > 1.4 && k < 1.7 ? -0.9 : k > 1.7 && k < 1.9 ? 0.5 : Math.sin(t * 0.5) * 0.06) : kind === "wave" ? Math.sin(t) * 0.45 + Math.sin(t * 2) * 0.12 : Math.sin(t * 0.5) * 0.4;
    g[i ? "lineTo" : "moveTo"](x0 + i, y0 + h / 2 + v * h / 2);
  }
  g.stroke();
}

const STILLS = {
  /** The staff panel's left screen: the shapes of the observations, with no numbers. Phase 2 puts the made-up readings here. */
  staffObs: () => still(1024, 584, (g, w, h) => {
    heading(g, "Observations", 40, 64);
    [["Heart", "#5fd38d", "beat"], ["Oxygen", "#5ab8f0", "wave"], ["Breathing", "#f0d25a", "slow"]].forEach(([label, colour, kind], i) => {
      const y = 104 + i * 140;
      line(g, label, 40, y + 40, 26, INK);
      trace(g, 220, y, w - 280, 90, colour, kind);
    });
    line(g, "A still, not a monitor. The bedside monitor shows the patient.", 40, h - 34, 22);
    simulated(g, w, h);
  }),
  /** The staff panel's right screen: care tasks and equipment, as words. */
  staffTasks: () => still(1024, 584, (g, w, h) => {
    heading(g, "Care tasks", 40, 64);
    ["Turn and check skin", "Mouth care", "Check every line", "Family call"].forEach((t, i) => { g.strokeStyle = DIM; g.lineWidth = 3; g.strokeRect(44, 96 + i * 54, 26, 26); line(g, t, 92, 118 + i * 54, 28, INK); });
    heading(g, "Equipment", 560, 64);
    ["Ventilator", "Infusion pumps", "Patient monitor", "Bed"].forEach((t, i) => { g.fillStyle = "#5fd38d"; g.beginPath(); g.arc(574, 109 + i * 54, 9, 0, 6.283); g.fill(); line(g, t, 596, 118 + i * 54, 28, INK); });
    simulated(g, w, h);
  }),
  /** The strip on the patient wall, over the TV: who is caring for the patient today, and what the day holds. */
  patientStrip: () => still(1600, 200, (g, w, h) => {
    heading(g, "Your care team today", 40, 62, 40);
    line(g, "Your nurse · Your doctor · Physiotherapist", 40, 130, 38, INK);
    heading(g, "Today", 900, 62, 40);
    line(g, "Wash · Physiotherapy · Family visit", 900, 130, 38, INK);
    simulated(g, w, h, 26);
  }),
  /** The workstation's own screen. */
  desk: () => still(832, 512, (g, w, h) => {
    heading(g, "Clinician workstation", 36, 60, 34);
    ["Overview", "Care tasks", "Equipment", "Observations", "Plan", "Handover", "Supplies"].forEach((t, i) => {
      const x = 36 + (i % 2) * 380, y = 110 + Math.floor(i / 2) * 78;
      g.fillStyle = "#1d3340"; g.fillRect(x, y, 350, 60); line(g, t, x + 20, y + 40, 28, INK);
    });
    line(g, "No name, no diagnosis: a made-up patient.", 36, h - 30, 22);
    simulated(g, w, h);
  }),
  /** The screen on the arm above the desk. */
  arm: () => still(768, 448, (g, w, h) => {
    heading(g, "Handover", 36, 60, 34);
    ["Comfortable overnight.", "Family visiting at four.", "Check the lines before the turn."].forEach((t, i) => line(g, t, 36, 130 + i * 56, 28, INK));
    simulated(g, w, h);
  }),
};
/** A screen: `id` is how the smart clinical wall (wall.js) finds it to draw on it. */
const screen = (w, h, texture, id) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  m.name = "fitting_screen"; m.userData.screen = id;
  if (id === "staffLeft" || id === "staffRight" || id === "strip") m.name = "wall_screen"; // the smart clinical wall's own: a click opens its card
  return m;
};
/** The screens' drawing tools, for wall.js. */
export const PAINT = { simulated, heading, line, trace, INK, DIM, BG };

// ---------------------------------------------------------------- the builders (addons.js adds them to its own)

export const FITTINGS = {
  /**
   * A shallow ceiling tray over the bed: square tiles inside a border that steps down a few centimetres, with a continuous line
   * of light round its inner edge and a row of small downlights by the window. Fixed to the ceiling like the room's own
   * fixtures, so the dollhouse lifts it off with the ceiling.
   */
  ceilingTray(room) {
    const f = FIT[room.label].tray, H = room.meta.ceiling, g = new THREE.Group();
    const shape = new THREE.Shape(f.poly.map(([x, y]) => new THREE.Vector2(x, y)));
    // the tiles: one surface, with a 60 cm grid drawn on it
    const grid = document.createElement("canvas"); grid.width = grid.height = 128;
    const gg = grid.getContext("2d"); gg.fillStyle = "#eef0ee"; gg.fillRect(0, 0, 128, 128); gg.fillStyle = "#c9cdcb"; gg.fillRect(0, 0, 128, 3); gg.fillRect(0, 0, 3, 128);
    const tex = new THREE.CanvasTexture(grid); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1 / 0.6, 1 / 0.6); tex.colorSpace = THREE.SRGBColorSpace;
    const tiles = new THREE.Mesh(new THREE.ShapeGeometry(shape), std("#ffffff", 0.85, { map: tex }));
    tiles.rotation.x = Math.PI / 2; tiles.scale.y = -1; // the shape's x, y are plan x, y: lay it face down at the ceiling
    tiles.position.y = H - 0.004;
    tiles.receiveShadow = true;
    g.add(tiles);
    // the border: a band 8 cm wide, 4 cm down from the ceiling, with the light line on its inner face
    const band = std("#f3f3f1", 0.5), lit = room.fixtures?.strip || new THREE.MeshBasicMaterial({ color: "#f4f8ff" });
    const pts = f.poly, cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length], len = Math.hypot(bx - ax, by - ay);
      let nx = -(by - ay) / len, ny = (bx - ax) / len; // pointing in, toward the tray's middle
      if (nx * (cx - (ax + bx) / 2) + ny * (cy - (ay + by) / 2) < 0) { nx = -nx; ny = -ny; }
      const mx = (ax + bx) / 2 + nx * 0.04, my = (ay + by) / 2 + ny * 0.04, rot = Math.atan2(by - ay, bx - ax);
      const b = box(len + 0.08, 0.04, 0.08, band); b.position.copy(W2T(mx, my, H - 0.02)); b.rotation.y = rot; b.castShadow = false;
      const l = new THREE.Mesh(new THREE.BoxGeometry(len, 0.012, 0.006), lit); l.position.copy(W2T(mx + nx * 0.043, my + ny * 0.043, H - 0.03)); l.rotation.y = rot;
      g.add(b, l);
    }
    const disc = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16);
    for (const [x, y] of f.downlights) { const d = new THREE.Mesh(disc, lit); d.position.copy(W2T(x, y, H - 0.009)); g.add(d); }
    room.ceiling.push(g); // shown and hidden with the ceiling (stage.refreshCeiling)
    return tag(g, "Ceiling tray", "A shallow tray over the bed, with a line of light round its edge.");
  },

  /**
   * One flush white panel on the wall behind the bed head, with rounded corners, two wide screens for staff and a thin line of
   * light beneath. The pendant in front still carries the monitor, pumps and outlets: the panel adds to them, and it is for
   * staff, because a patient lying in the bed can't see the wall behind their head.
   */
  staffPanel(room) {
    const f = FIT[room.label].staff, w = f.x[1] - f.x[0], g = onWall(new THREE.Group(), f, 1.2), d = 0.03;
    const panel = rounded(w, 1.1, d, 0.07, WHITE()); panel.position.y = 0.55;
    const left = screen(1.04, 0.594, STILLS.staffObs(), "staffLeft"), right = screen(1.04, 0.594, STILLS.staffTasks(), "staffRight");
    left.position.set(-0.56, 0.6, d + 0.005); right.position.set(0.56, 0.6, d + 0.005);
    const bezel = std("#1b2226", 0.4);
    g.add(panel, box(1.08, 0.634, 0.004, bezel, -0.56, 0.6, d + 0.002), box(1.08, 0.634, 0.004, bezel, 0.56, 0.6, d + 0.002), left, right, lightLine(room, w - 0.2, -0.03, 0.012));
    g.userData.onWall = true; // placed items can't hang over it (placed.js)
    return tag(g, "Staff panel", "A flush panel at the bed head with two screens for staff. Simulated.");
  },

  /**
   * The wall the patient faces: a flush white panel round the TV, a strip of screen above it, and a line of light beneath.
   * The TV and its damping mounts sit on the panel's face (syncFittings), so everything on the TV keeps working.
   */
  patientWall(room) {
    const f = FIT[room.label].patient, w = f.x[1] - f.x[0], g = onWall(new THREE.Group(), f, 1.05), d = 0.03;
    const panel = rounded(w, 1.35, d, 0.07, WHITE()); panel.position.y = 0.675;
    const sw = w - 0.3, strip = screen(sw, sw / 8, STILLS.patientStrip(), "strip");
    strip.position.set(0, 1.35 - 0.06 - sw / 16, d + 0.005);
    strip.userData.bezel = box(sw + 0.03, sw / 8 + 0.03, 0.004, std("#1b2226", 0.4), 0, strip.position.y, d + 0.002);
    g.add(panel, strip.userData.bezel, strip, lightLine(room, w - 0.2, -0.03, 0.012));
    g.userData.onWall = true; // placed items can't hang over it (placed.js)
    return tag(g, "Patient wall", "A flush panel round the TV, with a strip of screen over it. Simulated.");
  },

  /**
   * A clinician's workstation against the wall: a rounded white top on a timber-and-white cabinet, a screen and keyboard, a
   * second screen on an arm above, and a lit rail on the wall. Out of the keep-clear areas and the route to the bed.
   */
  workstation(room) {
    const f = FIT[room.label].desk, w = f.x[1] - f.x[0], D = 0.5, g = onWall(new THREE.Group(), f, 0);
    const white = WHITE(), timber = std("#ffffff", 0.55, { map: drawn("oak", 1, 1) }), dark = std("#262c30", 0.45), plinth = std("#9aa1a4", 0.6);
    const top = rounded(w, D, 0.03, 0.06, white); top.rotation.x = -Math.PI / 2; top.position.set(0, 0.73, D / 2); // its rounded corners face the room
    const tw = w * 0.42, supplies = box(tw, 0.62, D - 0.04, timber, -w / 2 + tw / 2 + 0.01, 0.42, (D - 0.04) / 2), ppe = box(w - tw - 0.03, 0.62, D - 0.04, white, w / 2 - (w - tw - 0.03) / 2 - 0.01, 0.42, (D - 0.04) / 2);
    supplies.name = "ws_supplies"; ppe.name = "ws_ppe"; // the two cupboards the supply locator lights (wall-data.js SUPPLIES)
    g.add(top, supplies, ppe,
      box(w - 0.06, 0.1, D - 0.1, plinth, 0, 0.05, (D - 0.1) / 2));
    for (const x of [-w / 2 + tw + 0.06, w / 2 - 0.08]) g.add(box(0.012, 0.12, 0.02, dark, x, 0.6, D - 0.03)); // handles
    // the screen on the desk, and its keyboard
    const mon = new THREE.Group(); mon.position.set(-0.05, 0.76, 0.16);
    mon.add(box(0.5, 0.31, 0.025, dark, 0, 0.23, 0), box(0.04, 0.12, 0.03, dark, 0, 0.06, -0.01), box(0.18, 0.012, 0.12, dark, 0, 0.006, 0));
    const ds = screen(0.47, 0.289, STILLS.desk(), "desk"); ds.position.set(0, 0.23, 0.0135); mon.add(ds);
    g.add(mon, box(0.4, 0.015, 0.13, std("#e6e8e7", 0.5), -0.05, 0.768, 0.36));
    // the second screen, on an arm from the wall
    const arm = new THREE.Group(); arm.position.set(w / 2 - 0.26, 1.52, 0);
    arm.add(box(0.06, 0.1, 0.02, dark, 0, 0, 0.01), box(0.03, 0.03, 0.17, dark, 0, 0, 0.1), box(0.44, 0.27, 0.025, dark, 0, 0, 0.2));
    const as = screen(0.41, 0.249, STILLS.arm(), "arm"); as.position.set(0, 0, 0.2135); arm.add(as);
    g.add(arm);
    // a lit service rail on the wall over the desk
    g.add(box(w - 0.1, 0.04, 0.025, std("#c9cfd1", 0.4, { metalness: 0.3 }), 0, 1.12, 0.0125), lightLine(room, w - 0.16, 1.095, 0.02));
    g.userData.onWall = true; // placed items can't hang over it (placed.js)
    return tag(g, "Clinician workstation", "A desk with two screens for the care team. Simulated.");
  },

  /** A bedside cabinet with a rounded white top and a timber front, against the wall at the bed head, clear of the pendant. */
  bedsideCabinet(room) {
    const f = FIT[room.label].cabinet, w = f.x[1] - f.x[0], D = 0.45, g = onWall(new THREE.Group(), f, 0);
    const top = rounded(w, D, 0.025, 0.05, WHITE()); top.rotation.x = -Math.PI / 2; top.position.set(0, 0.7, D / 2);
    const timber = std("#ffffff", 0.55, { map: drawn("oak", 1, 1) });
    g.add(top, box(w - 0.02, 0.6, D - 0.03, WHITE(), 0, 0.4, (D - 0.03) / 2), box(w - 0.04, 0.4, 0.012, timber, 0, 0.355, D - 0.024),
      box(w - 0.04, 0.12, 0.012, timber, 0, 0.62, D - 0.024), box(w - 0.08, 0.1, D - 0.08, std("#9aa1a4", 0.6), 0, 0.05, (D - 0.08) / 2));
    return tag(g, "Bedside cabinet", "A cabinet at the bed head for the patient's things.");
  },
};

/**
 * What depends on more than one fitting, run after every change of choices (main.js settle()): the TV and its damping mounts
 * step forward onto the patient wall's face, the printed sky fits inside the tray, and the visitor chair moves out of the
 * workstation's way. Each goes back exactly when its fitting is off.
 */
export function syncFittings(room) {
  const a = room.addons || {}, on = id => !!a[id]?.visible || !!a[id]?.userData.schemeOn;
  // the TV and its mounts: out by the panel's depth, and a few millimetres more
  for (const id of ["tv", "dampers"]) {
    const n = a[id];
    if (!n) continue;
    n.userData.wallAt ||= n.position.clone();
    const out = on("patientWall") ? 0.035 : 0;
    n.position.copy(n.userData.wallAt).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(n.quaternion), out);
  }
  // the printed sky: inside the tray's border while the tray is on
  const sky = a.sky;
  if (sky) {
    sky.userData.own ||= { x: sky.position.x, z: sky.position.z, w: sky.geometry.parameters.width, h: sky.geometry.parameters.height };
    const o = sky.userData.own;
    if (on("ceilingTray")) {
      const [bx0, by0, bx1, by1] = FIT[room.label].tray.sky, x0 = Math.max(bx0, o.x - o.w / 2), x1 = Math.min(bx1, o.x + o.w / 2);
      const y0 = Math.max(by0, -o.z - o.h / 2), y1 = Math.min(by1, -o.z + o.h / 2);
      sky.position.x = (x0 + x1) / 2; sky.position.z = -(y0 + y1) / 2;
      sky.scale.set((x1 - x0) / o.w, (y1 - y0) / o.h, 1);
    } else { sky.position.x = o.x; sky.position.z = o.z; sky.scale.set(1, 1, 1); }
  }
  // the visitor chair (W1): to its spot by the window while the desk stands where it was
  const spot = FIT[room.label].chair, chair = room.root.getObjectByName("cfg_kit_visitor_chair");
  if (spot && chair) {
    chair.userData.own ||= chair.position.clone();
    chair.position.copy(chair.userData.own);
    if (on("workstation")) {
      chair.updateWorldMatrix(true, true);
      const now = new THREE.Box3().setFromObject(chair).getCenter(new THREE.Vector3()), to = W2T(spot[0], spot[1], 0);
      to.y = now.y;
      const p = chair.parent; p.updateWorldMatrix(true, false);
      chair.position.add(p.worldToLocal(to.clone()).sub(p.worldToLocal(now.clone())));
    }
    chair.updateWorldMatrix(true, true);
  }
}
