import * as THREE from "three";

// Bed-local landmarks: lateral, distance from headboard, height (metres).
// Matched to the existing 2.2 m bed, 0.68 m mattress and 30-degree backrest.
export const PATIENT_ANCHORS = {
  ng: [-0.085, 0.30, 1.326], oxygen: [0, 0.35, 1.37], strap: [0.115, 0.30, 1.27],
  iv: [0.33, 1.12, 0.889], ecg: [-0.13, 0.68, 1.168], urinary: [-0.18, 1.36, 0.835],
};
const v = ([x, z, y]) => new THREE.Vector3(x, y, z);
const material = color => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
function label(object, title, description, action) { object.userData.itemInfo = { title, description, action }; return object; }
function ellipsoid(parent, at, scale, mat, title, description) {
  const o = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), mat); o.position.copy(v(at)); o.scale.set(...scale);
  label(o, title, description); parent.add(o); return o;
}
function line(parent, points, radius, color, title, description, action) {
  const curve = new THREE.CatmullRomCurve3(points.map(v), false, "centripetal");
  const o = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, radius, 8, false), material(color));
  label(o, title, description, action); parent.add(o); return o;
}
export function ensurePatient(room) {
  if (room.patient) return room.patient;
  const root = new THREE.Group(); root.name = "adaptive_patient";
  root.position.set(room.meta.bed.head[0], 0, -room.meta.bed.head[1]);
  root.rotation.y = Math.atan2(room.meta.bed.foot[0], -room.meta.bed.foot[1]);
  room.root.add(root);
  const skin = material("#bd957f"), gown = material("#a6c3c8"), cover = material("#c4d6db");
  const body = new THREE.Group(); root.add(body);
  label(body, "Simulated patient", "An adult-scale, clothed teaching figure fitted to the existing bed. No identity, diagnosis or measured physiology is represented.");
  const torso = ellipsoid(body, [0, 0.78, 0.99], [0.215, 0.125, 0.34], gown, "Patient gown / torso", "Illustrative torso following the bed's existing raised backrest. Device locations are schematic.");
  torso.rotation.x = Math.PI / 6;
  ellipsoid(body, [0, 1.10, 0.83], [0.22, 0.10, 0.21], cover, "Patient drape / hip region", "A continuous clothed silhouette joins the torso to the covered legs; the existing bed and over-bed table remain in place.");
  ellipsoid(body, [0, 0.30, 1.22], [0.12, 0.145, 0.15], skin, "Patient head", "Resting at the existing pillow. Respiratory and feeding interfaces are separate labeled teaching examples.");
  ellipsoid(body, [0, 0.48, 1.105], [0.068, 0.08, 0.1], skin, "Patient neck", "Illustrative anatomy; no airway procedure or treatment is simulated.");
  ellipsoid(body, [0, 0.35, 1.357], [0.026, 0.025, 0.04], skin, "Patient face", "Simulated facial landmarks; external interfaces remain schematic.");
  ellipsoid(body, [-0.13, 0.68, 1.145], [0.065, 0.018, 0.065], skin, "Exposed chest skin · schematic", "The ECG electrode contacts an illustrated exposed skin area, not the gown. This is not a clinical lead-placement guide.");
  ellipsoid(body, [-0.18, 1.36, 0.816], [0.07, 0.018, 0.09], skin, "Exposed securement site · schematic", "The urinary securement example contacts illustrated exposed skin rather than bedding. Actual site selection remains device- and patient-specific.");
  for (const side of [-1, 1]) {
    line(body, [[side * 0.20, 0.63, 1.01], [side * 0.31, 0.90, 0.86], [side * 0.33, 1.12, 0.83]], 0.052, "#bd957f", "Patient arm", "Resting arm with visible skin access. Click the IV attachment to inspect its securement.");
    ellipsoid(body, [side * 0.33, 1.19, 0.82], [0.05, 0.035, 0.085], skin, "Patient hand", "Simulated resting hand.");
    ellipsoid(body, [side * 0.11, 1.60, 0.75], [0.12, 0.075, 0.43], cover, "Covered patient leg", "Modest draping follows the original bed; the mattress and room geometry are unchanged.");
    ellipsoid(body, [side * 0.11, 2.04, 0.76], [0.065, 0.05, 0.11], skin, "Patient foot", "Illustrative resting foot within the existing bed footprint.");
  }
  const attachments = new THREE.Group(); root.add(attachments);
  for (const [id, at] of Object.entries(PATIENT_ANCHORS)) {
    const g = new THREE.Group(); g.position.copy(v(at));
    label(g, { ng: "NG tube fixation", iv: "IV securement", oxygen: "Respiratory interface", strap: "Respiratory strap contact", ecg: "ECG electrode", urinary: "Urinary catheter securement" }[id], "Illustrative attachment on the shared patient. Inspect its materials, conventional/proposed arrangement and clinical limitations in APIS.", `apis:${id}`);
    const geometry = id === "ecg" ? new THREE.CylinderGeometry(0.025, 0.025, 0.008, 20) : new THREE.BoxGeometry(id === "oxygen" ? 0.08 : 0.065, 0.008, 0.045);
    g.add(new THREE.Mesh(geometry, material(id === "oxygen" ? "#a9cad7" : "#ece8dc")));
    if (id === "oxygen") { const cushion = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), material("#a9cad7")); cushion.scale.set(0.05, 0.017, 0.05); g.add(cushion); }
    attachments.add(g);
  }
  const routes = new THREE.Group(); root.add(routes);
  const note = "Illustrative external route, not a validated clinical circuit, line length or bend-radius specification. Colors distinguish this diagram only. Primary securement and clinical review remain necessary.";
  // Original ventilator circuit endpoints from kit.py, after its 180-degree placement rotation.
  const vent = room.label === "W1" ? [1.5, -0.2] : [1.3, 0.5];
  for (const side of [-1, 1]) {
    const end = [-vent[0] - 0.6 + 0.05 * side, vent[1] + 1.0, 0.85];
    line(routes, [end, [-1.05, vent[1] + 0.9, 1.02 + side * 0.025], [-0.63, 0.35 + side * 0.035, 1.16], [-0.28, 0.27 + side * 0.035, 1.28], [side * 0.018, 0.35, PATIENT_ANCHORS.oxygen[2] + 0.01]], 0.012, "#b5cbd1", "Respiratory circuit extension", `${note} Joins the existing ventilator's modeled tubing at its terminal end; PACS never changes ventilator settings.`, "apis:oxygen");
  }
  const pole = [-1.15, -0.55]; // both room-specific layouts in icu_spec.json override the default pole position
  const ivEnd = [-pole[0] - 0.8, pole[1] + 0.5, 0.75];
  line(routes, [ivEnd, [0.55, 0.18, 0.88], [0.54, 0.78, 0.91], [0.45, 1.04, 0.89], PATIENT_ANCHORS.iv], 0.005, "#668fbb", "IV extension route", `${note} Separate from feeding and respiratory lines; no infusion rate is changed.`, "apis:iv");
  line(routes, [PATIENT_ANCHORS.ng, [0.20, 0.30, 1.31], [0.42, 0.42, 1.19], [0.60, 0.66, 0.97], [0.61, 0.93, 0.89]], 0.005, "#cbaa67", "Enteral feeding tube route", `${note} Ends at a labeled demonstration connector, not an IV pump. This is not a complete feeding circuit.`, "apis:ng");
  ellipsoid(routes, [0.61, 0.93, 0.89], [0.016, 0.016, 0.028], material("#9c7e44"), "Enteral demonstration connector", "Separate, capped schematic endpoint. Not connected to an IV system or feeding source.");
  const monitorMeshes = room.parts.cfg_kit_monitor || [];
  room.root.updateMatrixWorld(true);
  const monitorBox = new THREE.Box3(); monitorMeshes.forEach(o => monitorBox.expandByObject(o));
  const monitorPoint = root.worldToLocal(monitorBox.getCenter(new THREE.Vector3()));
  const endEcg = [monitorPoint.x, monitorPoint.z, Math.max(1.1, monitorPoint.y - 0.1)];
  line(routes, [PATIENT_ANCHORS.ecg, [-0.36, 0.69, 1.04], [-0.48, 0.1, 1.16], [endEcg[0], endEcg[1], 1.25], endEcg], 0.004, "#617079", "ECG lead route", `${note} Routed toward the monitor support and then upward to the existing monitor; no actual signal is acquired.`, "apis:ecg");
  line(routes, [PATIENT_ANCHORS.urinary, [-0.43, 1.4, 0.8], [-0.58, 1.52, 0.62], [-0.58, 1.68, 0.42]], 0.006, "#a492bd", "Urinary drainage route", `${note} Descends to a bag below the bladder and above the floor, outside moving rail geometry; no dependent loop is added.`, "apis:urinary");
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.055), material("#d9cfaa")); bag.position.copy(v([-0.58, 1.68, 0.30]));
  label(bag, "Simulated urinary drainage bag", "Diagram location below the bladder and off the floor, associated with the bed base rather than a moving side rail. Mounting and drainage require device-specific clinical review.", "apis:urinary"); routes.add(bag);
  const patient = { root, body, routes, attachments, anchors: PATIENT_ANCHORS, worldAnchor(id) { return root.localToWorld(v(PATIENT_ANCHORS[id])); } };
  room.patient = patient; return patient;
}
