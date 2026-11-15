// The bed panel and what it shows in the room: the pressure map on the mattress, and each line's slack by its clip. The data
// is bed.js. Like the room modes it changes no choice, link or summary. SIMULATED throughout: nothing is measured, no injury
// is predicted, and nothing moves a patient or touches a line or device.
import * as THREE from "three";
import { el } from "./panel.js";
import {
  BANDS, DEFAULT_MINUTES, DEFAULT_POSITION, GRID, LINES, LINES_TEXT, MAT, MOVE_CHECK, PLAN, POSITIONS, POSITION_ORDER,
  PRESSURE_TEXT, SLACK, SLACK_BY, TIMES, bandOf, pressureMap, sustained, timeLabel,
} from "./bed.js";

const BEDDING = /^(mattress|sheet|blanket)/; // the bed's soft top: the map lies on it, under the patient
const CELL = 16; // texture pixels a grid cell

/** Draw the map in grid space: `i` across the bed from the patient's right, `j` down it from the head, `cell` pixels a cell. */
function drawGrid(g, cell, values, marked, { grid = true, alpha = 1 } = {}) {
  const { cols, rows } = GRID;
  g.globalAlpha = alpha;
  g.fillStyle = "#eef2f1"; g.fillRect(0, 0, cols * cell, rows * cell);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const b = bandOf(values[j * cols + i]);
    if (!b) continue;
    g.fillStyle = b.colour; g.fillRect(i * cell, j * cell, cell, cell);
  }
  g.globalAlpha = 1;
  if (grid) { // the sensor grid's lines
    g.strokeStyle = "rgba(40, 70, 78, 0.28)"; g.lineWidth = Math.max(1, cell / 16);
    g.beginPath();
    for (let i = 0; i <= cols; i++) { g.moveTo(i * cell, 0); g.lineTo(i * cell, rows * cell); }
    for (let j = 0; j <= rows; j++) { g.moveTo(0, j * cell); g.lineTo(cols * cell, j * cell); }
    g.stroke();
  }
  // a place under sustained pressure: a dashed ring round it, in a dark line that holds against every band
  const cw = MAT.width / cols, ch = (MAT.to - MAT.from) / rows;
  g.setLineDash([cell * 0.45, cell * 0.3]); g.lineWidth = Math.max(2, cell / 6); g.strokeStyle = "#1d2f35";
  for (const r of marked) {
    const cx = (r.x + MAT.width / 2) / cw * cell, cy = (r.d - MAT.from) / ch * cell;
    g.beginPath(); g.arc(cx, cy, Math.max(r.r / cw * cell * 1.15, cell * 1.1), 0, Math.PI * 2); g.stroke();
  }
  g.setLineDash([]);
}

export class BedView {
  /** `root` is the panel; `layer` holds the line labels over the room; `api` is main.js's: say, invalidate, tab, staff. */
  constructor(root, { layer, api }) {
    this.root = root; this.layer = layer; this.api = api;
    this.position = DEFAULT_POSITION; this.minutes = DEFAULT_MINUTES; this.dismissed = false;
    this.tab = "pressure"; this.pending = null; this.room = null; this.mapOn = false; this.marksOn = false;
    this.marks = new Map(); // line id -> { el, point }
    this.ghosted = new Map(); // patient material -> what it was
    this.ghostOrder = new Map(); // patient mesh -> its draw order
    this.build();
  }

  // ---------------------------------------------------------------- the panel
  build() {
    const r = this.root;
    this.tabs = r.querySelector("#bedTabs");
    this.tabs.addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) this.show(b.dataset.tab); });
    // the position, shared by both tabs: a move asks for the line check first
    this.positions = r.querySelector("#bedPositions");
    this.positions.replaceChildren(...POSITION_ORDER.map(id => {
      const b = el("button", { type: "button", textContent: POSITIONS[id].short });
      b.dataset.position = id; b.title = POSITIONS[id].label;
      return b;
    }));
    this.positions.addEventListener("click", e => { const b = e.target.closest("button[data-position]"); if (b) this.ask(b.dataset.position); });
    this.check = r.querySelector("#bedCheck");
    this.checkConfirm = el("button", { type: "button", className: "bed-confirm", textContent: MOVE_CHECK.confirm });
    this.checkCancel = el("button", { type: "button", className: "outline-action", textContent: MOVE_CHECK.cancel });
    this.checkTo = el("p", { className: "bed-check-to" });
    this.check.replaceChildren(el("h3", { id: "bedCheckTitle", textContent: MOVE_CHECK.title }), this.checkTo, el("p", { textContent: MOVE_CHECK.text }),
      el("div", { className: "bed-check-actions" }, this.checkConfirm, this.checkCancel));
    this.checkConfirm.addEventListener("click", () => this.confirm());
    this.checkCancel.addEventListener("click", () => this.cancel());
    this.check.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); this.cancel(); } });
    this.where = r.querySelector("#bedWhere");

    // the pressure map
    const p = r.querySelector("#pane-pressure");
    this.canvas = el("canvas", { className: "bed-map" });
    this.canvas.setAttribute("role", "img");
    this.legend = el("ul", { className: "acoustic-legend bed-legend" });
    this.legend.setAttribute("aria-label", "The pressure map's colours");
    this.legend.append(...BANDS.map(b => el("li", {}, el("span", { className: "swatch" }), b.label)), el("li", { className: "bed-legend-mark" }, el("span", { className: "swatch ring" }), "Sustained"));
    this.legend.querySelectorAll(".swatch:not(.ring)").forEach((s, i) => { s.style.background = BANDS[i].colour; });
    this.times = el("div", { className: "seg seg3 bed-times" });
    this.times.setAttribute("role", "group"); this.times.setAttribute("aria-labelledby", "bedTimeTitle");
    this.times.replaceChildren(...TIMES.map(t => { const b = el("button", { type: "button", textContent: t.label }); b.dataset.minutes = String(t.minutes); return b; }));
    this.times.addEventListener("click", e => { const b = e.target.closest("button[data-minutes]"); if (b) this.setMinutes(Number(b.dataset.minutes)); });
    this.marked = el("p", { className: "bed-marked" });
    this.marked.setAttribute("aria-live", "polite");
    this.reminderBox = el("div", { className: "staff-reminder bed-reminder" });
    p.append(
      el("div", { className: "bed-map-wrap" }, el("span", { className: "bed-axis top", textContent: "Patient's left" }), el("span", { className: "bed-axis head", textContent: "Head" }), this.canvas, el("span", { className: "bed-axis foot", textContent: "Feet" }), el("span", { className: "bed-axis bottom", textContent: "Patient's right" })),
      this.legend,
      el("p", { id: "bedTimeTitle", className: "acoustic-sub", textContent: "Time in this position · SIMULATED" }), this.times,
      this.marked, this.reminderBox,
      el("p", { className: "acoustic-note", textContent: `${PLAN.note} ${PRESSURE_TEXT.limits}` }));

    // the lines
    const l = r.querySelector("#pane-lines");
    this.lineList = el("ul", { className: "bed-lines" });
    this.lineList.setAttribute("aria-label", "Each line's slack");
    l.append(this.lineList, el("p", { className: "acoustic-note", textContent: `${LINES_TEXT.clips} ${LINES_TEXT.limits}` }));
    this.render();
  }

  /** Show a tab, and what it shows in the room. */
  show(tab = this.tab) {
    this.tab = tab;
    this.tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    for (const id of ["pressure", "lines"]) this.root.querySelector(`#pane-${id}`).hidden = id !== tab;
    this.api.tab(tab);
  }

  /** A move: first the line check, which a person confirms. */
  ask(position, { focus = true } = {}) {
    if (position === this.position) { this.cancel(); return; }
    this.pending = position;
    this.checkTo.textContent = `Move to: ${POSITIONS[position].label}.`;
    this.check.hidden = false;
    this.positions.querySelectorAll("button").forEach(b => b.classList.toggle("pending", b.dataset.position === position));
    if (focus) this.checkConfirm.focus({ preventScroll: true });
    this.api.say(`${MOVE_CHECK.title}. ${MOVE_CHECK.text}`);
  }
  confirm() {
    if (!this.pending) return;
    this.setPosition(this.pending);
    this.api.say(`Lines checked by staff. ${POSITIONS[this.position].label}: shown on the map and the line list. The bed and the figure don't move.`);
    this.positions.querySelector(`button[data-position="${this.position}"]`)?.focus({ preventScroll: true });
  }
  cancel() {
    const had = this.pending;
    this.pending = null; this.check.hidden = true;
    this.positions.querySelectorAll("button").forEach(b => b.classList.remove("pending"));
    if (had) { this.positions.querySelector(`button[data-position="${had}"]`)?.focus({ preventScroll: true }); this.api.say("Move cancelled. Nothing changed."); }
  }
  /** Straight to a position, as a demo does once its line check is said. A new position starts its time again. */
  setPosition(position, minutes = TIMES[0].minutes) {
    this.pending = null; this.check.hidden = true;
    this.positions.querySelectorAll("button").forEach(b => b.classList.remove("pending"));
    this.position = position; this.minutes = minutes; this.dismissed = false;
    this.render(); this.api.staff();
  }
  setMinutes(m) {
    this.minutes = m; this.dismissed = false;
    this.render(); this.api.staff();
    this.api.say(`Time in this position: ${timeLabel(m)}, simulated. ${this.markedText()}`);
  }

  /** The positioning reminder: a position held past the plan's interval, until staff dismiss it. Shared with the staff view. */
  due() { return this.minutes >= PLAN.interval && !this.dismissed; }
  reminderState() { return this.minutes < PLAN.interval ? "none" : this.dismissed ? "dismissed" : "due"; }
  dismiss() { this.dismissed = true; this.render(); this.api.staff(); this.api.say("Reminder dismissed by staff."); }
  /** The patient is sedated again: a reminder dismissed before comes back, if the position is still past its interval. */
  remind() { if (this.dismissed) { this.dismissed = false; this.render(); this.api.staff(); } }

  markedText() {
    const m = sustained(this.position, this.minutes);
    return m.length ? `Marked as sustained pressure, a higher load held past the plan's interval: ${m.map(r => r.label.toLowerCase()).join(", ")}.`
      : this.minutes < PLAN.interval ? "Nothing marked: the position hasn't been held past the plan's interval." : "Nothing marked: no higher load here.";
  }

  render() {
    const pos = POSITIONS[this.position], values = pressureMap(this.position), marked = sustained(this.position, this.minutes);
    this.positions.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.position === this.position)));
    this.times.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.minutes) === this.minutes)));
    this.where.textContent = `${pos.label}, for ${timeLabel(this.minutes)} · SIMULATED. ${PRESSURE_TEXT.still}`;
    // the panel's map, on its side: the head on the left, the patient's left at the top
    const { cols, rows } = GRID, dpr = Math.min(2, devicePixelRatio || 1), cell = 10;
    const w = rows * cell, h = cols * cell;
    this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    this.canvas.style.aspectRatio = `${w} / ${h}`;
    const g = this.canvas.getContext("2d");
    g.setTransform(0, -dpr, dpr, 0, 0, h * dpr); // grid i (across) runs up the canvas, grid j (down the bed) runs right
    drawGrid(g, cell, values, marked);
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.canvas.setAttribute("aria-label", `Simulated pressure map, ${pos.label.toLowerCase()}. ${this.markedText()}`);
    this.marked.textContent = this.markedText();
    if (this.due()) {
      const b = el("button", { type: "button", className: "outline-action", textContent: "Dismiss" });
      b.addEventListener("click", () => { this.dismiss(); this.times.querySelector('button[aria-pressed="true"]')?.focus({ preventScroll: true }); });
      this.reminderBox.replaceChildren(el("p", { textContent: PRESSURE_TEXT.reminder }), b);
      this.reminderBox.hidden = false;
    } else {
      this.reminderBox.replaceChildren();
      this.reminderBox.hidden = true;
    }
    // the lines' slack, by this position
    this.lineList.replaceChildren(...LINES.map(line => {
      const [status, why] = SLACK_BY[this.position][line.id], s = SLACK[status];
      const li = el("li", { className: `bed-line slack-${status}` },
        el("span", { className: "swatch" }), el("span", { className: "bed-line-name", textContent: line.label }),
        el("span", { className: "bed-line-status", textContent: `${s.mark} ${s.label}` }), el("span", { className: "bed-line-why", textContent: why }));
      li.dataset.line = line.id; li.querySelector(".swatch").style.background = line.colour;
      return li;
    }));
    if (this.mapOn) this.paintRoomMap();
    this.labelMarks();
    this.api.invalidate();
  }

  // ---------------------------------------------------------------- in the room
  /** The map on the mattress, and the patient figure faint so it shows. */
  setMap(on, room) {
    if (this.room && this.room !== room) { this.hideMap(this.room); this.setMarks(false); }
    this.room = room; this.mapOn = on;
    if (!on) { this.hideMap(room); return; }
    this.drape(room);
    this.paintRoomMap();
    room.bedMap.visible = true;
    this.ghost(room, true);
  }
  hideMap(room) {
    if (room?.bedMap) room.bedMap.visible = false;
    this.ghost(room, false);
  }

  /** A grid of points over the mattress, each dropped onto the bedding below it: the map lies on whatever shape the bed has. */
  drape(room) {
    if (room.bedMap) return;
    const patient = room.patient, frame = new THREE.Group();
    frame.position.copy(patient.root.position); frame.rotation.copy(patient.root.rotation);
    room.root.add(frame); frame.updateMatrixWorld(true);
    const soft = [];
    for (const n of room.parts.cfg_kit_bed || []) n.traverse(m => { if (m.isMesh && [m.material].flat().some(x => BEDDING.test(x.name))) soft.push(m); });
    const { cols, rows } = GRID, ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
    const pos = [], uv = [], index = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
      const x = -MAT.width / 2 + (i / cols) * MAT.width, d = MAT.from + (j / rows) * (MAT.to - MAT.from);
      ray.set(frame.localToWorld(new THREE.Vector3(x, 2.2, d)), down);
      const hit = ray.intersectObjects(soft, false)[0];
      const y = hit ? frame.worldToLocal(hit.point.clone()).y + 0.008 : 0.7;
      pos.push(x, y, d); uv.push(i / cols, 1 - j / rows);
    }
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, e = c + 1;
      index.push(a, c, b, b, c, e);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(index); geo.computeVertexNormals();
    this.texCanvas = document.createElement("canvas");
    this.texCanvas.width = cols * CELL; this.texCanvas.height = rows * CELL;
    const tex = new THREE.CanvasTexture(this.texCanvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.94, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    mesh.renderOrder = 3; mesh.raycast = () => {};
    frame.add(mesh); frame.name = "bed_pressure_map";
    room.bedMap = frame; room.bedMapTexture = tex;
  }
  paintRoomMap() {
    const room = this.room;
    if (!room?.bedMap) return;
    const g = this.texCanvas.getContext("2d");
    drawGrid(g, CELL, pressureMap(this.position), sustained(this.position, this.minutes));
    room.bedMapTexture.needsUpdate = true;
  }
  /** The patient figure, faint (or back as it was), so the map under it shows. Its lines and attachments stay as they are. */
  ghost(room, on) {
    if (on && !this.ghosted.size && room?.patient) {
      room.patient.body.traverse(n => {
        if (!n.isMesh) return;
        this.ghostOrder.set(n, n.renderOrder); n.renderOrder = 5; // drawn after the map, so the figure shows faintly over it
        for (const m of [n.material].flat()) if (!this.ghosted.has(m)) {
          this.ghosted.set(m, { transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
          Object.assign(m, { transparent: true, opacity: 0.2, depthWrite: false }); m.needsUpdate = true;
        }
      });
    } else if (!on && this.ghosted.size) {
      for (const [m, was] of this.ghosted) { Object.assign(m, was); m.needsUpdate = true; }
      for (const [n, order] of this.ghostOrder) n.renderOrder = order;
      this.ghosted.clear(); this.ghostOrder.clear();
    }
  }

  /** A label by each line's clip with its slack, while the Lines tab is open. */
  setMarks(on, room = this.room) {
    this.marksOn = on; this.room = room;
    this.layer.hidden = !on;
    this.layer.replaceChildren(); this.marks.clear();
    if (!on || !room?.addons?.lineClips) return;
    room.root.updateMatrixWorld(true);
    for (const clip of room.addons.lineClips.children) {
      const line = LINES.find(l => l.id === clip.userData.line);
      if (!line) continue;
      const span = el("span", { className: "acoustic-mark bed-mark" });
      span.dataset.line = line.id;
      this.layer.append(span);
      this.marks.set(line.id, { el: span, point: clip.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.07, 0)) });
    }
    this.labelMarks();
  }
  labelMarks() {
    for (const [id, m] of this.marks) {
      const [status] = SLACK_BY[this.position][id], line = LINES.find(l => l.id === id);
      m.el.textContent = `${line.label} · ${SLACK[status].label}`;
      m.el.className = `acoustic-mark bed-mark slack-${status}`;
      m.w = 0; // its width changes with its words
    }
  }
  /** After each draw: each label over its clip, moved up out of another's way, hidden off the free part of the screen. */
  update(camera, visibleWidth) {
    if (!this.marksOn) return;
    const v = new THREE.Vector3(), w = innerWidth, h = innerHeight, placed = [];
    const order = [...this.marks.values()].map(m => {
      v.copy(m.point).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      return { m, x, y, off: v.z > 1 || x < 8 || x > visibleWidth - 8 || y < 8 || y > h - 8 };
    }).sort((a, b) => a.y - b.y);
    for (const o of order) {
      o.m.el.hidden = o.off;
      if (o.off) continue;
      o.m.w ||= o.m.el.offsetWidth; o.m.h ||= o.m.el.offsetHeight;
      const b = { l: o.x - o.m.w / 2, r: o.x + o.m.w / 2, t: o.y - o.m.h, b: o.y };
      let lift = 0;
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => b.l < p.r && b.r > p.l && b.t - lift < p.b && b.b - lift > p.t);
        if (!hit) break;
        lift = b.b - hit.t + 3;
      }
      o.m.el.style.transform = `translate(${Math.round(o.x)}px, ${Math.round(o.y - lift)}px) translate(-50%, -100%)`;
      placed.push({ l: b.l, r: b.r, t: b.t - lift, b: b.b - lift });
    }
  }

  /** For the check: where a named place of this position is on the mattress map, in the room, or null with the map hidden. */
  pointOf(id) {
    const r = POSITIONS[this.position].regions.find(x => x.id === id), map = this.room?.bedMap;
    if (!r || !map?.visible) return null;
    const pos = map.children[0].geometry.attributes.position, { cols, rows } = GRID;
    const i = Math.round((r.x + MAT.width / 2) / MAT.width * cols), j = Math.round((r.d - MAT.from) / (MAT.to - MAT.from) * rows);
    const k = j * (cols + 1) + i;
    map.updateMatrixWorld(true);
    return map.localToWorld(new THREE.Vector3(pos.getX(k), pos.getY(k), pos.getZ(k)));
  }

  /** What a demo puts back as it ends. */
  snapshot() { return { position: this.position, minutes: this.minutes, dismissed: this.dismissed, tab: this.tab }; }
  restore(s) {
    if (!s) return;
    this.pending = null; this.check.hidden = true;
    this.positions.querySelectorAll("button").forEach(b => b.classList.remove("pending"));
    Object.assign(this, { position: s.position, minutes: s.minutes, dismissed: s.dismissed, tab: s.tab });
    this.render(); this.api.staff();
  }

  inspect() {
    return {
      tab: this.tab, position: this.position, minutes: this.minutes, due: this.due(), dismissed: this.dismissed, pending: this.pending,
      marked: sustained(this.position, this.minutes).map(r => r.id), lines: Object.fromEntries(LINES.map(l => [l.id, SLACK_BY[this.position][l.id][0]])),
      map: !!this.room?.bedMap?.visible, ghost: this.ghosted.size > 0,
      marks: [...this.marks].filter(([, m]) => !m.el.hidden).map(([id, m]) => ({ id, text: m.el.textContent })),
    };
  }
}
