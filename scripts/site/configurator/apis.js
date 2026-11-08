import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ATTACHMENTS, MATERIALS, SOURCES } from "./apis-data.js";
import { ensurePatient, PATIENT_ANCHORS } from "./patient.js";

const $ = id => document.getElementById(id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const btn = (text, action, cls = "") => {
  const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.className = cls;
  b.addEventListener("click", action); return b;
};
function dispose(group) {
  group.traverse(o => { o.geometry?.dispose(); if (o.material) [o.material].flat().forEach(m => m.dispose()); });
  group.clear();
}
function mesh(geometry, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
  m.position.set(x, y, z); return m;
}
const box = (w, h, d, c, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), c, x, y, z);
function tube(points, color, radius = 0.025) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 32, radius, 8, false), color);
}
function fixationStrip(color, lift = 0) {
  const positions = [], indices = [], steps = 32;
  for (let i = 0; i <= steps; i++) {
    const z = -0.36 + i * 0.72 / steps;
    const y = 0.041 + 0.09 * Math.exp(-((z / 0.1) ** 2)) + lift;
    positions.push(-0.17, y, z, 0.17, y, z);
    if (i < steps) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const strip = mesh(geometry, color); strip.material.side = THREE.DoubleSide; return strip;
}

// A separate detail scene: none of these schematic layers modifies the exported room mesh.
class DetailView {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x779395, 2.7));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(2, 5, 4); this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.01, 30);
    this.camera.position.set(2.7, 2.6, 3.8);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enablePan = false; this.controls.minDistance = 2.8; this.controls.maxDistance = 7;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.addEventListener("change", () => { this.dirty = true; });
    this.root = new THREE.Group(); this.scene.add(this.root); this.dirty = true;
    this.observer = new ResizeObserver(() => { this.dirty = true; }); this.observer.observe(canvas);
    canvas.addEventListener("keydown", e => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "-", "="].includes(e.key)) return;
      e.preventDefault();
      const off = this.camera.position.clone().sub(this.controls.target), s = new THREE.Spherical().setFromVector3(off);
      s.theta += e.key === "ArrowLeft" ? -0.15 : e.key === "ArrowRight" ? 0.15 : 0;
      s.phi = THREE.MathUtils.clamp(s.phi + (e.key === "ArrowUp" ? -0.15 : e.key === "ArrowDown" ? 0.15 : 0), 0.1, Math.PI * 0.48);
      s.radius = THREE.MathUtils.clamp(s.radius * (e.key === "-" ? 1.1 : ["+", "="].includes(e.key) ? 0.9 : 1), 2.8, 7);
      this.camera.position.copy(off.setFromSpherical(s).add(this.controls.target)); this.controls.update(); this.dirty = true;
    });
  }
  build(item, proposed, exploded, selected = -1) {
    dispose(this.root);
    const layers = proposed ? item.layers : item.conventionalLayers;
    layers.forEach((layer, i) => {
      const g = new THREE.Group(); g.userData.layer = i;
      const separate = layer.name.startsWith("Separate");
      const y = i === 0 ? 0 : 0.12 + (i - 1) * (exploded ? 0.3 : 0.09);
      if (separate) {
        // An off-skin external guide, deliberately outside the skin/dressing stack.
        const clip = mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 24, Math.PI * 1.65), layer.color, 1.04, 0.35, 0);
        clip.rotation.y = Math.PI / 2; g.add(clip);
        g.add(box(0.28, 0.06, 0.5, "#81969b", 1.04, 0.15, 0));
        g.add(tube([[0.55, 0.3, -0.4], [1.04, 0.35, 0], [1.35, 0.35, 0.5]], "#aec9ce"));
      } else if (i === 0) {
        g.add(box(1.65, 0.15, 1.2, layer.color, 0, -0.04, 0));
      } else if (item.id === "ng") {
        if (i === 1) g.add(tube([[-0.85, 0.08, 0], [-0.25, 0.08, 0], [0.4, 0.08, 0], [0.85, 0.12, 0.16]], layer.color, 0.045));
        else g.add(fixationStrip(layer.color, (i - 2) * 0.008));
        if (exploded) g.position.y = i * 0.25;
      } else if (item.kind === "mask") {
        const ring = mesh(new THREE.TorusGeometry(i === 1 ? 0.38 : 0.43, i === 1 ? 0.075 : 0.04, 12, 48), layer.color, 0, y, 0);
        ring.rotation.x = Math.PI / 2; ring.scale.y = 1.25; g.add(ring);
        if (i === 2) g.add(tube([[0, y, -0.45], [0, y + 0.1, -0.65], [0.4, y + 0.2, -0.8]], "#aec9ce", 0.06));
      } else if (/tube|retainer|Catheter and/.test(layer.name)) {
        g.add(tube([[-0.85, y, 0], [-0.25, y + 0.025, 0], [0.4, y, 0.05], [0.85, y + 0.04, 0.4]], layer.color, 0.045));
        if (item.id !== "ng") g.add(box(0.32, 0.09, 0.36, layer.color, 0, y, 0));
      } else if (item.kind === "electrode") {
        g.add(mesh(new THREE.CylinderGeometry(i === 1 ? 0.32 : 0.42, i === 1 ? 0.32 : 0.42, 0.05, 48), layer.color, 0, y, 0));
        if (i === 2) { g.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.09, 24), "#627f88", 0, y + 0.07)); g.add(tube([[0, y + 0.12, 0], [0.3, y + 0.15, -0.25], [0.9, y + 0.1, -0.4]], "#627f88")); }
      } else {
        const strap = /strap/.test(layer.name), film = /transparent/.test(layer.name);
        const m = box(strap ? 1.5 : 0.92, /foam/.test(layer.name) ? 0.1 : 0.035, strap ? 0.23 : 0.72, layer.color, 0, y, 0);
        if (film) { m.material.transparent = true; m.material.opacity = 0.4; m.material.depthWrite = false; }
        g.add(m);
      }
      g.traverse(o => { if (o.material && selected >= 0 && i !== selected) { o.material.transparent = true; o.material.opacity = 0.2; } });
      this.root.add(g);
    });
    this.controls.target.set(0.15, exploded ? 0.45 : 0.18, 0); this.controls.update(); this.dirty = true;
  }
  draw() {
    if (!this.dirty) return;
    const { width, height } = this.canvas.getBoundingClientRect(); if (!width || !height) return;
    this.renderer.setSize(width, height, false); this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera); this.dirty = false;
  }
}

export class APIS {
  constructor({ stage, rig, controls, invalidate, stopTour }) {
    Object.assign(this, { stage, rig, controls, invalidate, stopTour });
    this.enabled = false; this.active = false; this.proposed = true; this.exploded = false; this.layer = -1;
    this.item = ATTACHMENTS[0]; this.mode = "attachments"; this.movement = 0; this.turn = false;
    this.mount();
  }
  mount() {
    const entry = document.createElement("section"); entry.className = "apis-entry"; entry.setAttribute("aria-labelledby", "apisEntryTitle");
    entry.innerHTML = `<p class="apis-kicker">Adaptive ICU · patient comfort</p><h2 id="apisEntryTitle">Adaptive Patient Interface System</h2><p class="note">Explore skin contact, attachment layers and external line organization.</p><button type="button" id="openApis" class="apis-primary">Explore APIS <span aria-hidden="true">↗</span></button><label class="apis-toggle"><input type="checkbox" id="apisMarkers"> Show attachment markers in the room</label><p class="note">Illustrative attachment positions on the existing bed. Materials are device-specific; APIS hardware is a concept.</p>`;
    $("panelBody").prepend(entry);
    const dialog = document.createElement("dialog"); dialog.id = "apisDialog"; dialog.setAttribute("aria-labelledby", "apisTitle");
    dialog.innerHTML = `<div class="apis-shell">
      <header class="apis-header"><div><p class="apis-kicker">Adaptive ICU — The Adaptive Healing Room</p><h2 id="apisTitle">Adaptive Patient Interface System <span>APIS</span></h2></div><button type="button" id="apisClose" aria-label="Close APIS and return to room">Return to room ×</button></header>
      <div class="apis-tabs" role="group" aria-label="APIS exploration"><button type="button" data-mode="attachments" aria-pressed="true">01 · Skin & attachments</button><button type="button" data-mode="routing" aria-pressed="false">02 · Tubing & movement</button><button type="button" data-mode="materials" aria-pressed="false">03 · Material library</button></div>
      <p class="apis-scope">Educational design demonstration. Existing technologies and experimental APIS concepts are labeled separately. Diagrams are schematic, with exaggerated layers; no clinical performance is simulated.</p>
      <div id="apisAttachments"><nav id="apisDevices" aria-label="Choose an attachment"></nav>
        <div class="apis-workspace"><div class="apis-visual"><div class="apis-visual-head"><p class="apis-kicker">Attachment close-up</p><span id="apisVisualMode"></span></div>
          <canvas id="apisCanvas" tabindex="0" aria-label="3D schematic attachment close-up. Drag or use arrow keys to rotate; plus and minus to zoom."></canvas><p id="apisCanvasFallback" hidden>3D detail is unavailable on this device. The labeled layers, comparison and clinical notes remain available below.</p>
          <p class="apis-caption">Drag to rotate · arrow keys to rotate · + / − to zoom<br>Layers and attachment locations are illustrative, not product dimensions.</p>
          <div class="apis-toolbar"><div role="group" aria-label="Attachment arrangement"><button type="button" id="apisConventional" aria-pressed="false">Conventional</button><button type="button" id="apisProposed" aria-pressed="true">Proposed</button></div><button type="button" id="apisExplode" aria-pressed="false">Explode layers</button></div>
          <div id="apisLayers" role="group" aria-label="Highlight a material layer"></div><p id="apisLayerPurpose" class="apis-layer-purpose" aria-live="polite">Select a layer to highlight its purpose.</p>
        </div><article class="apis-notes"><p id="apisEvidenceBadge" class="apis-badge"></p><h3 id="apisDeviceTitle"></h3><p id="apisEvidence"></p><div class="apis-comparison"><div id="apisBefore"><h4>Conventional arrangement</h4><p></p></div><div id="apisAfter"><h4>Proposed arrangement</h4><p></p></div></div><h4>Potential patient benefit</h4><p id="apisBenefit"></p><div class="apis-limits"><h4>Clinical limitations</h4><p id="apisLimit"></p></div><div id="apisMaterialNote"></div><details><summary>Evidence & source notes</summary><p>Sources support the stated material roles and care principles, not clinical validation of APIS. Verify the exact device instructions and local protocol.</p><ul id="apisSources"></ul></details></article></div>
      </div>
      <div id="apisRouting" hidden><div class="apis-routing-grid"><div class="apis-route-visual"><p class="apis-badge">Experimental APIS organizer · illustrative movement</p><h3>Give each line a visible route</h3><svg id="apisRouteDiagram" viewBox="0 0 700 400" role="img" aria-labelledby="apisRouteTitle apisRouteDesc"></svg><div class="apis-toolbar" role="group" aria-label="Line arrangement"><button type="button" id="apisRouteBefore" aria-pressed="false">Unorganized example</button><button type="button" id="apisRouteAfter" aria-pressed="true">Proposed organization</button></div><label class="apis-slider" for="apisMovement">Bed-movement illustration <output id="apisMovementValue">Resting</output></label><input id="apisMovement" type="range" min="0" max="100" value="0" step="1"><label class="apis-toggle"><input id="apisTurn" type="checkbox"> Illustrate a patient turn</label><button type="button" id="apisResetMovement">Reset movement</button><p class="apis-caption">Position changes are schematic, not bed settings or a mechanical safety simulation. The room's bed geometry is unchanged.</p></div><article class="apis-notes"><h3>Support the line. Preserve the connection.</h3><p>The concept uses separate, visible channels with proposed compliant TPE inserts, mounted away from skin and moving bed mechanisms. It does not disconnect, clamp, retract or automatically release any line.</p><h4>Design concerns being illustrated</h4><ul id="apisRouteConcerns" aria-live="polite"></ul><h4>Before and after repositioning</h4><ul><li>Trace every line from the patient to its destination; preserve line-specific identification and connector access.</li><li>Review securement, movement allowance, bends and clearance from rails, hinges and wheels.</li><li>Support circuits according to their instructions. Keep urinary drainage unobstructed with the bag below the bladder and off the floor; do not add dependent loops.</li><li>Reassess skin, device position, function and all connections after movement. Stop and obtain clinical review if concerns arise.</li></ul><div class="apis-limits"><h4>What remains experimental</h4><p>Guide geometry, mounting, retention, cleaning, material compatibility and performance during movement require bench testing and clinical review. No force, pressure, flow, kink threshold, displacement prediction or safety score is calculated.</p></div><p>Line colors identify this diagram only; they are not a clinical connector standard.</p><a href="https://www.cdc.gov/infection-control/hcp/cauti/summary-of-recommendations.html" target="_blank" rel="noopener noreferrer">CDC: securement and unobstructed urinary drainage</a></article></div></div>
      <div id="apisMaterials" hidden><h3>Four materials. Four distinct roles.</h3><p>Material choice alone does not establish safety. Use the approved finished device and its instructions; no material is a universal attachment replacement.</p><div id="apisMaterialCards"></div><p class="apis-limits">APIS is a design study, not a validated medical device or care recommendation. It does not select attachments from patient profiles or claim reductions in injury, infection or tube displacement.</p></div>
    </div>`;
    document.body.append(dialog); this.dialog = dialog;
    ATTACHMENTS.forEach(item => {
      const b = btn(`${item.number}  ${item.short}`, () => this.select(item.id)); b.dataset.attachment = item.id; $("apisDevices").append(b);
    });
    MATERIALS.forEach(m => {
      const article = document.createElement("article"); article.className = "apis-material-card"; article.style.setProperty("--material", m.color);
      article.innerHTML = `<span class="apis-swatch" aria-hidden="true"></span><p class="apis-badge">${m.status}</p><h4>${m.name}</h4><p>${m.role}</p><p class="apis-limits">${m.limit}</p>`;
      const match = ATTACHMENTS.find(a => a.material === m.id);
      article.append(btn("Explore this material", () => { this.setMode("attachments"); this.select(match.id); }));
      $("apisMaterialCards").append(article);
    });
    $("openApis").addEventListener("click", () => this.open());
    $("apisMarkers").addEventListener("change", e => this.setEnabled(e.target.checked));
    $("apisClose").addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => this.restore());
    dialog.addEventListener("cancel", () => { /* Native Escape closes the modal and restores focus. */ });
    dialog.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => this.setMode(b.dataset.mode)));
    $("apisConventional").addEventListener("click", () => this.arrange(false));
    $("apisProposed").addEventListener("click", () => this.arrange(true));
    $("apisExplode").addEventListener("click", () => { this.exploded = !this.exploded; this.renderDetail(); });
    $("apisMovement").addEventListener("input", e => { this.movement = Number(e.target.value); this.renderRouting(); });
    $("apisTurn").addEventListener("change", e => { this.turn = e.target.checked; this.renderRouting(); });
    $("apisRouteBefore").addEventListener("click", () => { this.routeProposed = false; this.renderRouting(); });
    $("apisRouteAfter").addEventListener("click", () => { this.routeProposed = true; this.renderRouting(); });
    $("apisResetMovement").addEventListener("click", () => { this.movement = 0; this.turn = false; $("apisMovement").value = "0"; $("apisTurn").checked = false; this.renderRouting(); });
    this.routeProposed = true;
  }
  setRoom(room) {
    if (this.active) { this.dialog.close(); this.restore(); }
    this.room = room;
    ensurePatient(room);
    if (!room.apis) {
      const root = new THREE.Group(); root.name = "apis_attachments";
      const { head, foot } = room.meta.bed;
      root.position.set(head[0], 0, -head[1]); root.rotation.y = Math.atan2(foot[0], -foot[1]);
      const markers = new Map();
      ATTACHMENTS.forEach(item => {
        const at = PATIENT_ANCHORS[item.id];
        const g = new THREE.Group(); g.position.set(at[0], at[2], at[1]);
        g.userData.apisId = item.id; g.name = `apis_${item.id}`;
        const material = MATERIALS.find(m => m.id === item.material);
        // The shared patient owns attachment geometry and line routes. APIS adds only inspection markers.
        const bead = mesh(new THREE.SphereGeometry(0.045, 16, 12), material.color, 0, 0.13);
        bead.material.emissive.set(material.color); bead.material.emissiveIntensity = 0.35; g.add(bead);
        g.add(box(0.008, 0.12, 0.008, material.color, 0, 0.06));
        root.add(g); markers.set(item.id, g);
      });
      room.root.add(root); room.apis = { root, markers };
    }
    room.apis.root.visible = this.enabled; this.invalidate();
  }
  setEnabled(on) { this.enabled = on; $("apisMarkers").checked = on; if (this.room?.apis) this.room.apis.root.visible = on; this.invalidate(); }
  pick(object) {
    for (let n = object; n; n = n.parent) if (n.userData.apisId) { this.open(n.userData.apisId); return true; }
    return false;
  }
  open(id = this.item.id) {
    if (!this.room) return;
    this.beforeOpen?.();
    if (!this.active) {
      this.returnFocus = document.activeElement; this.stopTour();
      this.snapshot = { position: this.stage.camera.position.clone(), target: this.controls.target.clone(), view: this.rig.view, hfov: this.rig.hfov, ceiling: this.stage.ceilingOn };
      // Finish any interrupted view transition on restoration at its stable endpoint.
      this.snapshot.interrupted = !!this.rig.tween;
      this.rig.tween = null; this.controls.enabled = false; this.active = true;
      $("objectCard").hidden = true; this.setEnabled(true); this.dialog.showModal();
    }
    this.setMode("attachments"); this.select(id);
    if (!this.detail && !this.detailFailed) {
      try { this.detail = new DetailView($("apisCanvas")); this.renderDetail(); }
      catch { this.detailFailed = true; $("apisCanvas").hidden = true; $("apisCanvasFallback").hidden = false; }
    }
  }
  select(id) {
    this.item = ATTACHMENTS.find(a => a.id === id) || ATTACHMENTS[0]; this.layer = -1;
    $("apisDevices").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.attachment === this.item.id)));
    const item = this.item;
    $("apisDeviceTitle").textContent = item.title; $("apisEvidenceBadge").textContent = item.status;
    $("apisEvidence").textContent = item.evidence; $("apisBefore").querySelector("p").textContent = item.conventional;
    $("apisAfter").querySelector("p").textContent = item.proposed; $("apisBenefit").textContent = item.benefit; $("apisLimit").textContent = item.limitation;
    const material = MATERIALS.find(m => m.id === item.material);
    $("apisMaterialNote").textContent = `${material.name}: ${material.role}`;
    $("apisSources").replaceChildren(...item.sources.map(key => {
      const li = document.createElement("li"), a = document.createElement("a");
      a.textContent = SOURCES[key][0]; a.href = SOURCES[key][1]; a.target = "_blank"; a.rel = "noopener noreferrer"; li.append(a); return li;
    }));
    this.renderDetail(); if (this.active) this.focusAttachment();
  }
  focusAttachment() {
    const marker = this.room.apis.markers.get(this.item.id), target = new THREE.Vector3();
    this.room.root.updateMatrixWorld(true); marker.getWorldPosition(target);
    const { foot } = this.room.meta.bed;
    const offset = new THREE.Vector3(-foot[1] * 0.8 + foot[0] * 0.35, 0.55, -foot[0] * 0.8 - foot[1] * 0.35);
    this.focus = { start: performance.now(), from: this.stage.camera.position.clone(), fromT: this.controls.target.clone(), to: target.clone().add(offset), target };
    this.stage.setCeiling(true); this.invalidate();
  }
  restore() {
    if (!this.active) return;
    const s = this.snapshot; this.active = false; this.focus = null;
    this.stage.camera.position.copy(s.position); this.controls.target.copy(s.target); this.rig.view = s.view; this.rig.hfov = s.hfov;
    this.rig.limits(s.view === "dollhouse"); this.rig.fit(); this.controls.enabled = true; this.controls.update();
    this.stage.setCeiling(s.ceiling);
    if (s.interrupted) this.rig.go(s.view, { instant: true });
    this.returnFocus?.focus({ preventScroll: true }); this.invalidate();
  }
  arrange(proposed) { this.proposed = proposed; this.layer = -1; this.renderDetail(); }
  renderDetail() {
    const focusIndex = [...$("apisLayers").children].indexOf(document.activeElement);
    $("apisConventional").setAttribute("aria-pressed", String(!this.proposed)); $("apisProposed").setAttribute("aria-pressed", String(this.proposed));
    $("apisExplode").setAttribute("aria-pressed", String(this.exploded)); $("apisExplode").textContent = this.exploded ? "Assemble layers" : "Explode layers";
    $("apisVisualMode").textContent = this.proposed ? "Proposed · schematic" : "Conventional · schematic";
    $("apisBefore").classList.toggle("apis-selected", !this.proposed); $("apisAfter").classList.toggle("apis-selected", this.proposed);
    const layers = this.proposed ? this.item.layers : this.item.conventionalLayers;
    $("apisLayers").replaceChildren(...layers.map((l, i) => {
      const b = btn(`${i + 1}. ${l.name}`, () => { this.layer = this.layer === i ? -1 : i; this.renderDetail(); });
      b.style.setProperty("--material", l.color); b.setAttribute("aria-pressed", String(this.layer === i)); return b;
    }));
    $("apisLayerPurpose").textContent = this.layer < 0 ? "Select a layer to highlight its purpose. External guides are shown separately from skin layers." : layers[this.layer].purpose;
    if (focusIndex >= 0) $("apisLayers").children[focusIndex]?.focus({ preventScroll: true });
    this.detail?.build(this.item, this.proposed, this.exploded, this.layer);
  }
  setMode(mode) {
    this.mode = mode;
    this.dialog.querySelectorAll("[data-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    $("apisAttachments").hidden = mode !== "attachments"; $("apisRouting").hidden = mode !== "routing"; $("apisMaterials").hidden = mode !== "materials";
    if (mode === "routing") this.renderRouting(); if (this.detail) this.detail.dirty = true;
  }
  renderRouting() {
    const organized = this.routeProposed, movement = this.movement / 100, turn = this.turn ? 32 : 0;
    const x = 212 + turn, y = 150 - movement * 65;
    const colors = ["#8a641d", "#3975ad", "#167d75", "#8661aa"];
    const labels = ["Feeding", "IV", "ECG", "Urinary drainage"];
    const paths = [0, 1, 2, 3].map(i => {
      const sy = y + i * 27, end = 115 + i * 44;
      // Urinary tubing always descends to its bag; no illustrative slack loop on drainage.
      const d = i === 3 ? `M${x},${sy} C${x + 60},${sy + 35} 370,280 472,305` : organized
        ? `M${x},${sy} C${x + 55},${sy + 40} 335,${end + 40} 390,${end} S470,${end} 540,${end}`
        : `M${x},${sy} C340,${330 - i * 40} ${310 - movement * 65},${40 + i * 30} 540,${end}`;
      return `<path d="${d}" fill="none" stroke="${colors[i]}" stroke-width="5" stroke-linecap="round"/><circle cx="${x}" cy="${sy}" r="5" fill="${colors[i]}"/><text x="555" y="${i === 3 ? 310 : end + 5}" fill="${colors[i]}">${labels[i]}</text>`;
    }).join("");
    $("apisRouteDiagram").innerHTML = `<title id="apisRouteTitle">${organized ? "Proposed separated routes" : "Unorganized line example"}</title><desc id="apisRouteDesc">Illustrative patient movement changes feeding, IV, ECG and urinary line paths. This does not calculate tension or safety. The urinary bag stays below the bladder.</desc><rect x="70" y="70" width="245" height="270" rx="20" fill="#e0e9e9" stroke="#7c9399"/><path d="M85 270H300" stroke="#7c9399" stroke-width="5"/><text x="90" y="325">Existing bed · diagram only</text><g transform="translate(${turn},${-movement * 65})"><circle cx="180" cy="132" r="25" fill="#c5b3a5"/><rect x="147" y="160" width="66" height="105" rx="25" fill="#bccdd0"/><text x="110" y="292">Patient position</text></g>${organized ? '<rect x="376" y="88" width="31" height="158" rx="9" fill="#e3d8ef" stroke="#8661aa"/><text x="350" y="66">TPE guides · concept</text>' : '<text x="335" y="66">Crossing routes / snag points</text>'}${paths}<rect x="459" y="305" width="36" height="40" rx="4" fill="#eee5c8" stroke="#8661aa"/><text x="352" y="370">Drainage bag below bladder · off floor</text><path d="M65 390H650" stroke="#9baeb2" stroke-width="2"/>`;
    $("apisMovementValue").textContent = this.movement ? `Movement illustration ${this.movement}%` : "Resting";
    $("apisRouteBefore").setAttribute("aria-pressed", String(!organized)); $("apisRouteAfter").setAttribute("aria-pressed", String(organized));
    const concerns = organized ? ["Separate routes make line tracing easier in this illustration.", "Movement allowance and bend clearance still require review for every device.", "Primary securement remains in place; the guide does not prevent accidental displacement."] : ["Crossing lines can make identification and repositioning more difficult.", "Loose external tubing can snag on bed hardware or transmit a pull to an attachment.", "Tight bends and routing through moving mechanisms can compromise tubing."];
    if (movement > 0 || this.turn) concerns.push("Position changed: reassess tension, bends, connections and skin contact. The drawing cannot determine whether this arrangement is safe.");
    $("apisRouteConcerns").replaceChildren(...concerns.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
  }
  update(now) {
    if (!this.active) return false;
    let moving = false;
    if (this.focus) {
      const f = this.focus, t = reduced() ? 1 : THREE.MathUtils.clamp((now - f.start) / 650, 0, 1), k = t * t * (3 - 2 * t);
      this.stage.camera.position.lerpVectors(f.from, f.to, k); this.controls.target.lerpVectors(f.fromT, f.target, k); this.stage.camera.lookAt(this.controls.target);
      if (t === 1) this.focus = null; moving = true;
    }
    if (this.mode === "attachments") this.detail?.draw();
    return moving;
  }
  inspect() {
    return { active: this.active, enabled: this.enabled, attachment: this.item.id, proposed: this.proposed, exploded: this.exploded, mode: this.mode, markers: this.room?.apis.markers.size || 0, detailAvailable: !!this.detail };
  }
  screenPoint(id) {
    const marker = this.room?.apis.markers.get(id); if (!marker) return null;
    this.room.root.updateMatrixWorld(true); this.stage.camera.updateMatrixWorld();
    const p = marker.localToWorld(new THREE.Vector3(0, 0.13, 0)).project(this.stage.camera);
    return { x: (p.x + 1) * innerWidth / 2, y: (1 - p.y) * innerHeight / 2 };
  }
}
