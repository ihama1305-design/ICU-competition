// Equipment and cables in the room: flush channel covers on the ceiling and the wall behind the bed head, with a docking
// spot for mobile kit (an option, built when first chosen), and the cable overlay, Traditional or Organised. cables-data.js
// has the kinds, the routes by name and the words; here they become points measured from each room's own kit. Nothing here
// moves, retracts, clamps or disconnects anything: it's a picture of where things would run.
import * as THREE from "three";
import { W2T } from "./stage.js";
import { FIT } from "./fittings-data.js";
import { KINDS, ROUTES_BY_STATE } from "./cables-data.js";

const plan = (room, name) => { // a part's box in plan metres: [x0, y0, z0, x1, y1, z1]
  const box = new THREE.Box3(); (room.parts[name] || []).forEach(n => box.expandByObject(n));
  return box.isEmpty() ? null : [box.min.x, -box.max.z, box.min.y, box.max.x, -box.min.z, box.max.y];
};
const mid = b => [(b[0] + b[3]) / 2, (b[1] + b[4]) / 2];

/** The named points the routes join, in plan metres with height, from the room's own pendant, kit and bed-head wall. */
export function cablePoints(room) {
  room.root.updateMatrixWorld(true);
  const H = room.meta.ceiling, wallY = FIT[room.label].staff.y, p = plan(room, "cfg_kit_pendant"), [px, py] = mid(p);
  const at = (name, z) => { const b = plan(room, name), [x, y] = mid(b); return [x, y, z ?? (b[2] + b[5]) / 2]; };
  const v = plan(room, "cfg_kit_ventilator"), bed = plan(room, "cfg_kit_bed");
  return {
    pendant: [px, py, 1.95], pendantTop: [px, p[4], H - 0.01], pumps: at("cfg_kit_pumps"), monitor: at("cfg_kit_monitor"),
    ventilator: [(v[0] + v[3]) / 2, (v[1] + v[4]) / 2, 1.35], dock: [(v[0] + v[3]) / 2, (v[1] + v[4]) / 2, 1.0], ventBox: v,
    bed: [(bed[0] + bed[3]) / 2, bed[4] - 0.1, 0.45], iv: at("cfg_kit_iv_pole", 1.0),
    "wall-low": [px - 0.6, wallY - 0.03, 0.3], "wall-channel": [px + 0.15, wallY - 0.03, 2.5], "gas-channel": [px - 0.15, wallY - 0.03, 2.7],
    wallY, H, px,
  };
}

const flat = (w, d, h, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = false; m.receiveShadow = true; return m; };
const tag = (node, title, description) => { node.userData.itemInfo = { title, description }; node.traverse(n => { if (n.isMesh) n.userData.itemInfo = node.userData.itemInfo; }); return node; };

export const CABLES = {
  /**
   * Flush covers: a power-and-data channel and a separate medical gas channel, each from the top of the pendant to the wall
   * behind the bed head, then along the wall above the staff panel; and a docking spot for mobile kit marked on the floor
   * where the ventilator stands, fed from the pendant. They take no floor and stand in nobody's way.
   */
  cableChannels(room) {
    const g = new THREE.Group(), c = cablePoints(room), H = c.H, f = FIT[room.label].staff;
    const cover = new THREE.MeshStandardMaterial({ color: "#eef0ef", roughness: 0.45 }), gasTrim = new THREE.MeshBasicMaterial({ color: "#4caf50" }), elTrim = new THREE.MeshBasicMaterial({ color: "#9aa3a6" });
    const ceilingRun = (x, trim, title, text) => {
      const len = c.wallY - c.pendantTop[1], run = new THREE.Group();
      run.add(flat(0.12, len, 0.008, cover), flat(0.02, len, 0.002, trim));
      run.children[1].position.y = -0.005;
      run.position.copy(W2T(x, c.pendantTop[1] + len / 2, H - 0.004));
      g.add(tag(run, title, text));
    };
    ceilingRun(c.px + 0.15, elTrim, "Power and data channel", "A flush channel in the ceiling from the pendant to the wall, then along the wall above the staff panel. Power and data only.");
    ceilingRun(c.px - 0.15, gasTrim, "Medical gas channel", "Its own flush channel: medical gas never shares one with power or data.");
    const wallRun = (x0, x1, z, trim, title, text) => {
      const run = new THREE.Group(), w = x1 - x0;
      run.add(flat(w, 0.03, 0.08, cover), flat(w, 0.004, 0.012, trim));
      run.children[1].position.set(0, -0.025, 0.016);
      run.position.copy(W2T((x0 + x1) / 2, c.wallY - 0.016, z)); // its back on the wall behind the bed head
      g.add(tag(run, title, text));
    };
    wallRun(f.x[0], f.x[1], 2.5, elTrim, "Power and data channel", "Along the wall above the staff panel, to the workstation and the outlets. Power and data only.");
    wallRun(c.px - 0.45, c.px + 0.05, 2.68, gasTrim, "Medical gas channel", "Its own run on the wall: medical gas never shares a channel with power or data.");
    // the docking spot: an outline on the floor round where the ventilator stands
    const v = c.ventBox, pad = 0.08, w = v[3] - v[0] + pad * 2, d = v[4] - v[1] + pad * 2, line = new THREE.MeshBasicMaterial({ color: "#2f8f9d" }), dock = new THREE.Group();
    for (const [dx, dy, lx, ly] of [[0, -d / 2, w, 0.03], [0, d / 2, w, 0.03], [-w / 2, 0, 0.03, d], [w / 2, 0, 0.03, d]]) {
      const m = flat(lx, ly, 0.002, line); m.position.copy(W2T(dx, dy, 0)); dock.add(m);
    }
    dock.position.copy(W2T((v[0] + v[3]) / 2, (v[1] + v[4]) / 2, 0.006));
    g.add(tag(dock, "Docking spot for mobile kit", "Marked on the floor where the ventilator stands. Its power, data and gas come down from the pendant, so nothing crosses the floor."));
    return tag(g, "Cable channels", "Flush channels on the ceiling and wall, and a docking spot. A concept: the routes are illustrative.");
  },
};

/** A text label that faces the camera: the kind's name on a pill in its colour, so the colour is never the only clue. */
function label(text, colour) {
  const c = document.createElement("canvas"); c.width = 384; c.height = 96;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(20, 38, 45, 0.88)"; g.beginPath(); g.roundRect(4, 4, 376, 88, 44); g.fill();
  g.fillStyle = colour; g.beginPath(); g.arc(52, 48, 22, 0, 7); g.fill();
  g.fillStyle = "#ffffff"; g.font = "600 40px system-ui, sans-serif"; g.textBaseline = "middle"; g.fillText(text, 90, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, toneMapped: false }));
  s.scale.set(0.52, 0.13, 1); s.renderOrder = 30; s.raycast = () => {};
  return s;
}

/** A route's points: a loose cable sags to the floor and wanders; an organised one runs straight, through its channel. */
function routePoints(c, r, i) {
  const a = c[r.from], b = c[r.to];
  if (r.floor) {
    const wob = (k, s) => Math.sin(k * 3.1 + i * 1.7) * s;
    return [a, [a[0], a[1] - 0.15, 0.02], ...[0.3, 0.55, 0.8].map(k => [a[0] + (b[0] - a[0]) * k + wob(k, 0.25), a[1] + (b[1] - a[1]) * k + wob(k + 1, 0.2), 0.02]), [b[0], b[1] + 0.1, 0.02], b];
  }
  const via = [];
  if (r.from.endsWith("channel")) via.push([a[0], a[1], c.H - 0.02], [a[0], c.pendantTop[1], c.H - 0.02], c.pendantTop);
  if (r.to.endsWith("channel")) via.push(c.pendantTop, [b[0], c.pendantTop[1], c.H - 0.02], [b[0], b[1], c.H - 0.02]);
  return [a, ...via, b];
}

/** Show the overlay, Traditional or Organised, or put it away (null). Each state is built the first time it's shown. */
export function setCableView(room, state) {
  room.cableViews ||= {};
  if (state && !room.cableViews[state]) {
    const c = cablePoints(room), g = new THREE.Group(), seen = new Set();
    ROUTES_BY_STATE[state].forEach((r, i) => {
      const kind = KINDS.find(k => k.id === r.kind), pts = routePoints(c, r, i).map(p => W2T(...p));
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "centripetal"), 64, r.floor ? 0.009 : 0.012, 6), new THREE.MeshBasicMaterial({ color: kind.colour, toneMapped: false }));
      tube.raycast = () => {}; tube.userData.kind = kind.id;
      g.add(tube);
      if (!seen.has(`${kind.id}${r.floor ? "f" : ""}`)) { // one label per kind, at the middle of its first route
        seen.add(`${kind.id}${r.floor ? "f" : ""}`);
        const m = pts[Math.floor(pts.length / 2)], s = label(kind.label, kind.colour);
        s.position.copy(m).add(new THREE.Vector3(0, 0.16, 0));
        s.userData.kind = kind.id;
        g.add(s);
      }
    });
    const patient = KINDS.find(k => k.id === "patient"), s = label(patient.label, patient.colour);
    s.position.copy(W2T(...c.bed.slice(0, 2), 1.55)); s.userData.kind = "patient";
    g.add(s);
    g.name = `cables_${state}`;
    room.root.add(g);
    room.cableViews[state] = g;
  }
  for (const [k, v] of Object.entries(room.cableViews)) v.visible = k === state;
}
