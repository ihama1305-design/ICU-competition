// The glazed front: clear, smart glass (PDLC) that fades to opaque, or blinds between the panes.
import * as THREE from "three";
import { W2T } from "./stage.js";

const FADE_MS = 300;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const CLEAR = new THREE.Color("#eaf4f4"), MILK = new THREE.Color("#f2f4f2");

function slatTexture() {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 256;
  const g = c.getContext("2d");
  g.clearRect(0, 0, 16, 256);
  for (let y = 0; y < 256; y += 32) {
    const s = g.createLinearGradient(0, y, 0, y + 26);
    s.addColorStop(0, "#f4f2ec"); s.addColorStop(1, "#c9c6bc");
    g.fillStyle = s;
    g.fillRect(0, y, 16, 26);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FrontGlass {
  constructor(tier) {
    this.mode = "clear"; this.opaque = false; this.k = 0; this.from = 0; this.start = 0; this.fading = false;
    this.room = null;
    this.materials = {};
    this.setTier(tier);
  }

  /** High: glass that bends light (transmission, an extra render pass). Low: plain see-through glass. Switchable at any time. */
  setTier(tier) {
    this.tier = tier;
    // transmission is never quite 0: reaching 0 would recompile the material partway through a fade
    this.material = this.materials[tier] ||= tier === "low"
      ? new THREE.MeshStandardMaterial({ color: CLEAR.clone(), roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false })
      : new THREE.MeshPhysicalMaterial({ color: CLEAR.clone(), roughness: 0.03, transmission: 1, thickness: 0.01, ior: 1.5, metalness: 0 });
    if (this.room) this.sync(true);
  }

  partsFor(room) {
    if (room.front) return room.front;
    const m = room.meta.front;
    (room.parts.cfg_front_glass || []).forEach(n => { n.material = this.material; n.renderOrder = 1; });
    // blinds between the panes: one sheet of slats behind the door's frames
    const slats = slatTexture();
    slats.repeat.set(1, m.height / 0.12 / 2);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(m.width - 0.06, m.height - 0.1), new THREE.MeshStandardMaterial({ map: slats, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }));
    sheet.position.copy(W2T(m.at[0], m.at[1], m.height / 2));
    sheet.rotation.y = Math.atan2(m.axis[1], m.axis[0]);
    sheet.castShadow = true;
    room.root.add(sheet);
    // the wall switch
    const a = room.anchors.switch, plate = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.016), new THREE.MeshStandardMaterial({ color: "#f4f5f3", roughness: 0.4 }));
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.004), new THREE.MeshBasicMaterial({ color: "#2fb5ad" }));
    led.position.set(0, 0.04, 0.009);
    plate.add(body, led);
    a.getWorldPosition(plate.position);
    plate.position.y = 1.2;
    const n = room.meta.front.inward;
    plate.rotation.y = Math.atan2(n[0], -n[1]);
    room.root.add(plate);
    // the frosted band blurs what's behind it, which mustn't still show the room once the glass has gone opaque
    const frost = (room.parts.cfg_front_frost || []).map(n => n.material);
    room.front = { sheet, plate, body, led, frost };
    return room.front;
  }

  setRoom(room) { this.room = room; this.sync(true); }

  set({ mode, opaque }) {
    if (mode !== undefined) this.mode = mode;
    if (opaque !== undefined) this.opaque = opaque;
    this.sync(false);
  }

  sync(instant) {
    if (!this.room) return;
    const f = this.partsFor(this.room);
    (this.room.parts.cfg_front_glass || []).forEach(n => { n.material = this.material; });
    // the frosted band bends light on High too; on Low it's plain, and 0 skips the transmission pass entirely
    if (this.tier === "low") f.frost.forEach(m => { m.transmission = 0; });
    f.sheet.visible = this.mode === "blinds";
    f.plate.visible = this.mode === "smart";
    const target = this.mode === "smart" && this.opaque ? 1 : 0;
    f.led.material.color.set(target ? "#f0a23a" : "#2fb5ad");
    if (instant || reduced()) { this.k = target; this.fading = false; this.paint(); return; }
    if (target !== this.k) { this.from = this.k; this.to = target; this.start = performance.now(); this.fading = true; }
  }

  /** Returns true while a fade is running. */
  update(now) {
    if (!this.fading) return false;
    // now is when this frame began, which can be earlier than the click that set start
    const t = Math.max(0, Math.min(1, (now - this.start) / FADE_MS));
    this.k = this.from + (this.to - this.from) * t;
    this.paint();
    if (t >= 1) this.fading = false;
    return true;
  }

  paint() {
    const m = this.material, k = this.k;
    if (this.tier !== "low") this.room?.front.frost.forEach(f => { f.transmission = Math.max(0.0005, 1 - k); });
    m.color.lerpColors(CLEAR, MILK, k);
    if (this.tier === "low") {
      m.opacity = 0.14 + (0.97 - 0.14) * k;
      m.roughness = 0.05 + 0.8 * k;
    } else {
      m.transmission = Math.max(0.0005, 1 - k);
      m.roughness = 0.03 + 0.89 * k;
    }
  }

  /** True if this hit is the wall switch. */
  isSwitch(object) { return !!this.room?.front && object === this.room.front.body && this.room.front.plate.visible; }
  switchTargets() { return this.room?.front ? [this.room.front.body] : []; }
}
