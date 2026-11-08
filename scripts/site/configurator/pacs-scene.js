import * as THREE from "three";
import { ensurePatient } from "./patient.js";
import { autoKelvin } from "./lights.js";
const color = "#51b7b5";
const tag = (o, title, description) => { o.userData.itemInfo = { title, description }; return o; };
export class PacsRoom {
  constructor(stage, lighting, relight, invalidate, getHour) { Object.assign(this, { stage, lighting, relight, invalidate, getHour }); this.active = false; }
  enter(room) {
    this.room = room; ensurePatient(room); this.active = true; this.current = null;
    this.blinds = room.root.getObjectByName("cfg_blinds");
    this.blindState = { scale: this.blinds?.scale.clone(), parts: (room.parts.cfg_blinds || []).map(n => ({ n, visible: n.visible, color: n.material.color.clone() })) };
    this.previousComfort = this.lighting.comfort;
    this.materials = [];
    const c = document.createElement("canvas"); c.width = 640; c.height = 440;
    this.canvas = c; this.texture = new THREE.CanvasTexture(c); this.texture.colorSpace = THREE.SRGBColorSpace; this.texture.flipY = false;
    for (const mesh of room.parts.cfg_kit_monitor || []) {
      const original = mesh.material;
      const list = [original].flat().map(m => {
        if (!m.name.startsWith("screen_monitor")) return m;
        const copy = m.clone(); copy.map = this.texture; copy.emissiveMap = this.texture; copy.color.set("#ffffff"); copy.emissive.set("#ffffff"); copy.emissiveIntensity = 0.8;
        return copy;
      });
      if (list.some((m, i) => m !== [original].flat()[i])) { mesh.material = Array.isArray(original) ? list : list[0]; this.materials.push({ mesh, original, copies: list.filter((m, i) => m !== [original].flat()[i]) }); }
    }
    this.root = new THREE.Group(); this.root.name = "pacs_connections"; room.root.add(this.root);
    this.nodes = {};
    const centre = name => { const b = new THREE.Box3(); (room.parts[name] || []).forEach(o => b.expandByObject(o)); return b.isEmpty() ? null : b.getCenter(new THREE.Vector3()); };
    const monitor = centre("cfg_kit_monitor");
    const light = room.meta.panels?.[0];
    const comfortControl = (room.parts.addon_ventilation || []).find(n => n.userData.itemInfo?.title === "Room comfort control");
    const targets = {
      monitor, patient: room.patient.worldAnchor("ecg"),
      lights: light ? new THREE.Vector3(light[0], room.meta.ceiling - 0.08, -light[1]) : centre("cfg_panels"),
      blinds: centre("cfg_blinds"), control: comfortControl ? comfortControl.getWorldPosition(new THREE.Vector3()) : null,
      audio: centre("addon_soundSensor"),
    };
    const titles = { monitor: "PACS · existing patient monitor", patient: "PACS · patient preferences and feedback", lights: "PACS · ceiling and ambient lighting", blinds: "PACS · motorized blind demonstration", control: "PACS · environmental control interface", audio: "PACS · nonessential noise management" };
    for (const [id, point] of Object.entries(targets)) {
      if (!point) continue;
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.055, 16, 12), new THREE.MeshBasicMaterial({ color })); node.position.copy(point);
      if (id === "monitor") node.position.y += 0.3;
      tag(node, titles[id], "Conceptual PACS connection. Simulated readings, patient preferences and nurse oversight support selected environmental recommendations; no medical-device or building-system command is sent.");
      this.root.add(node); this.nodes[id] = node;
    }
    const box = new THREE.Box3(); (room.parts.cfg_kit_monitor || []).forEach(o => box.expandByObject(o));
    this.highlight = new THREE.Box3Helper(box.expandByScalar(0.035), color); this.highlight.raycast = () => {}; this.root.add(this.highlight);
    // An ordered overhead bus keeps connection overlays away from the patient's physical tubing.
    if (monitor) {
      const hub = monitor.clone(); hub.y = room.meta.ceiling - 0.28;
      for (const [id, node] of Object.entries(this.nodes)) {
        if (id === "monitor") continue;
        const destination = node.position.clone(), overhead = destination.clone(); overhead.y = hub.y;
        const points = [this.nodes.monitor.position, hub, overhead, destination];
        const curve = new THREE.CurvePath();
        for (let i = 1; i < points.length; i++) if (points[i - 1].distanceTo(points[i]) > 0.001) curve.add(new THREE.LineCurve3(points[i - 1].clone(), points[i].clone()));
        const link = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.006, 5, false), new THREE.MeshBasicMaterial({ color: "#7da9ad" }));
        tag(link, `PACS conceptual link · ${id}`, "An information-flow overlay, not a physical tube, cable or actual network connection. Toggle Connections to hide it."); this.root.add(link);
      }
    }
    this.invalidate();
    return { light: 1, kelvin: this.lighting.params.kelvin === "auto" ? autoKelvin(this.getHour()) : this.lighting.params.kelvin, blinds: this.blindState.parts.some(p => p.visible) ? this.blinds?.scale.y ?? 0 : 0, temperature: Number(document.getElementById("demoTemp").value) };
  }
  apply(env) {
    if (!this.active) return;
    this.current = { ...env };
    this.lighting.comfort = { level: env.light, kelvin: env.kelvin }; this.relight();
    if (this.blinds) this.blinds.scale.y = Math.max(0.001, env.blinds);
    for (const { n } of this.blindState.parts) { n.visible = env.blinds > 0.005; n.material.color.set("#e9e4d8"); }
    const quiet = env.audio < 0.05;
    for (const n of this.room.parts.addon_soundSensor || []) if (n.material?.name === "sound_indicator") {
      if (!this.soundMaterial) this.soundMaterial = { material: n.material, color: n.material.color.clone() };
      n.material.color.set(quiet ? "#55b985" : "#e6a342");
    }
    this.stage.renderer.shadowMap.needsUpdate = true; this.invalidate();
  }
  readings(values, warning, acknowledged) {
    const key = JSON.stringify([values, warning, acknowledged]); if (key === this.readingKey) return; this.readingKey = key;
    const g = this.canvas.getContext("2d"); g.fillStyle = "#091c23"; g.fillRect(0, 0, 640, 440);
    g.fillStyle = "#a8d6d7"; g.font = "bold 24px sans-serif"; g.fillText("SIMULATED PATIENT MONITOR", 20, 38);
    const cells = [["HR", values.hr, "bpm", "#8bdfb6"], ["BP", `${values.sys}/${values.dia}`, "mmHg", "#e5ca8b"], ["RR", values.rr, "/min", "#b9b1e5"], ["SpO2", values.spo2, "%", "#8bcce0"]];
    cells.forEach(([name, value, unit, tint], i) => { const x = 22 + (i % 2) * 310, y = 88 + Math.floor(i / 2) * 128; g.fillStyle = tint; g.font = "22px sans-serif"; g.fillText(name, x, y); g.font = "bold 50px sans-serif"; g.fillText(String(value), x, y + 54); g.font = "17px sans-serif"; g.fillText(unit, x, y + 79); });
    g.fillStyle = warning ? "#fbada1" : "#99c5c5"; g.font = "bold 22px sans-serif";
    g.fillText(warning ? "SCRIPTED CLINICAL ALERT ACTIVE" : "Illustrative readings — no clinical targets", 20, 380);
    g.font = "17px sans-serif"; g.fillText(warning && acknowledged ? "Seen in demo; alert remains active" : "No treatment or medical-alarm control", 20, 412);
    this.texture.needsUpdate = true;
    this.highlight.material.color.set(warning ? "#e57560" : color);
    this.nodes.monitor?.material.color.set(warning ? "#e57560" : color); this.invalidate();
  }
  connections(on) { if (this.root) { this.root.children.forEach(o => { o.visible = on || o === this.highlight || o === this.nodes.monitor; }); this.invalidate(); } }
  exit() {
    if (!this.active) return;
    this.active = false; this.lighting.comfort = this.previousComfort;
    if (this.blinds && this.blindState.scale) this.blinds.scale.copy(this.blindState.scale);
    this.blindState.parts.forEach(({ n, visible, color }) => { n.visible = visible; n.material.color.copy(color); });
    this.materials.forEach(({ mesh, original, copies }) => { mesh.material = original; copies.forEach(m => m.dispose()); }); this.texture.dispose();
    if (this.soundMaterial) this.soundMaterial.material.color.copy(this.soundMaterial.color);
    this.soundMaterial = null; this.readingKey = null;
    this.root.removeFromParent(); this.root.traverse(o => { o.geometry?.dispose(); if (o.material) [o.material].flat().forEach(m => m.dispose()); });
    this.relight(); this.stage.renderer.shadowMap.needsUpdate = true; this.invalidate();
  }
}
