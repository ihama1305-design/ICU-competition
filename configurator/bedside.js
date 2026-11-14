// The bedside screens: the communication board with its nurse-side list, the comfort passport, family connection, and the
// staff view. They follow the patient's state (patient-states.js). Everything is SIMULATED: no request leaves this page,
// nothing listens, no photograph or voice is used, and no alarm, device or clinical setting is changed.
import { APPLY, APPLY_WORDS, BOARD, CLINICIAN, DWELL_MS, FAMILY, MESSAGE, OFFERS, PASSPORT, SCAN_MS, STAFF, STATES, STATE_ORDER } from "./patient-states.js";

const KEY = "adaptiveIcu.passport";
const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); kids.forEach(k => n.append(k)); return n; };
const button = (text, cls = "outline-action") => el("button", { type: "button", className: cls, textContent: text });
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A drawn placeholder photograph: shapes, never a real person's picture. */
function drawPhoto(kind) {
  const c = el("canvas", { width: 160, height: 120, className: "family-photo" }), g = c.getContext("2d");
  const sky = { beach: ["#9fd0e0", "#f2e3c2"], garden: ["#cfe6c8", "#7fae6b"], home: ["#f3e2cf", "#d9b99a"] }[kind];
  const grad = g.createLinearGradient(0, 0, 0, 120); grad.addColorStop(0, sky[0]); grad.addColorStop(1, sky[1]);
  g.fillStyle = grad; g.fillRect(0, 0, 160, 120);
  if (kind === "beach") { g.fillStyle = "#5fa7c2"; g.fillRect(0, 70, 160, 14); g.fillStyle = "#f4d58d"; g.beginPath(); g.arc(128, 26, 12, 0, 7); g.fill(); }
  if (kind === "garden") { g.fillStyle = "#e58fa0"; for (const [x, y] of [[20, 96], [38, 102], [140, 98]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } }
  if (kind === "home") { g.fillStyle = "#b98a64"; g.fillRect(0, 92, 160, 28); g.fillStyle = "#ffffffaa"; g.fillRect(104, 18, 40, 34); }
  // two or three figures, as simple shapes
  const people = kind === "home" ? [[54, "#6b5b8a"], [86, "#c46d4f"], [118, "#4f7f8a"]] : [[64, "#c46d4f"], [96, "#4f7f8a"]];
  for (const [x, colour] of people) {
    g.fillStyle = colour; g.beginPath(); g.ellipse(x, 104, 13, 26, 0, Math.PI, 0); g.fill();
    g.fillStyle = "#d9a98a"; g.beginPath(); g.arc(x, 70, 9, 0, 7); g.fill();
  }
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", `Drawn placeholder: a family photograph at ${kind === "home" ? "home" : `the ${kind}`}`);
  return c;
}

/** A voice message drawn as a waveform: shown, never played. */
function drawWave() {
  const c = el("canvas", { width: 240, height: 40, className: "family-wave" }), g = c.getContext("2d");
  g.fillStyle = "#0b6d75";
  for (let i = 0; i < 60; i++) { const a = 4 + Math.abs(Math.sin(i * 0.7) * Math.sin(i * 0.23)) * 15; g.fillRect(i * 4, 20 - a, 2, a * 2); }
  c.setAttribute("role", "img"); c.setAttribute("aria-label", "A voice message, drawn as a waveform. Shown, not played.");
  return c;
}

export class Bedside {
  /**
   * root: the panel's element. api (main.js): state(), time(), say(text), notice() before a request goes up, music(on, ui),
   * scene(on), familyLines(on), quiet(on), noise() as text, open(tab), close().
   */
  constructor(root, api) {
    this.root = root; this.api = api;
    this.tab = "board"; this.input = "touch";
    this.requests = []; this.scanAt = -1; this.scanTimer = 0; this.scanLeft = 0; this.dwell = null;
    this.values = this.load(); this.allow = Object.fromEntries(FAMILY.map(f => [f.id, f.staffAllow]));
    this.familyOn = { scene: false, lines: false, call: false, message: false, music: false };
    this.reminder = true; this.quiet = false;
    this.panes = {};
    for (const id of ["board", "passport", "family", "staff"]) this.panes[id] = root.querySelector(`#pane-${id}`);
    root.querySelector("#bedsideTabs").addEventListener("click", e => { const b = e.target.closest("button[data-tab]"); if (b) this.show(b.dataset.tab); });
    root.querySelector("#quietNow").addEventListener("change", e => this.setQuiet(e.target.checked));
    this.buildBoard(); this.buildPassport(); this.buildFamily(); this.buildStaff();
    this.refresh();
  }

  get state() { return this.api.state(); }

  /** Show one screen. */
  show(tab) {
    this.tab = tab;
    this.root.querySelectorAll("#bedsideTabs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.tab === tab)));
    for (const [id, p] of Object.entries(this.panes)) p.hidden = id !== tab;
    if (tab !== "board") this.stopScan();
    else if (this.input === "switch") this.startScan();
  }

  /** The patient's state changed, or the panel opened: what's offered, and the words that say why. */
  refresh() {
    const s = this.state, offer = OFFERS[s];
    this.root.querySelector("#bedsideState").textContent = `Patient: ${STATES[s].long}. ${offer.note}`;
    this.renderBoard(); this.renderApply(); this.renderFamily(); this.renderStaff();
  }

  // ---------------------------------------------------------------- the communication board
  buildBoard() {
    const p = this.panes.board;
    const inputs = el("div", { className: "seg seg3 board-inputs", role: "group" });
    inputs.setAttribute("aria-label", "How the patient chooses");
    for (const [id, label] of [["touch", "Touch"], ["switch", "Single switch"], ["gaze", "Gaze"]]) {
      const b = button(label, ""); b.dataset.input = id; b.setAttribute("aria-pressed", String(id === "touch"));
      inputs.append(b);
    }
    inputs.addEventListener("click", e => { const b = e.target.closest("button[data-input]"); if (b) this.setInput(b.dataset.input); });
    this.boardEl = el("div", { className: "board" });
    this.boardEl.addEventListener("click", e => { const b = e.target.closest("button[data-request]"); if (b && this.input !== "switch") this.ask(b.dataset.request); });
    this.boardEl.addEventListener("pointerover", e => { const b = e.target.closest("button[data-request]"); if (b && this.input === "gaze") this.startDwell(b); });
    this.boardEl.addEventListener("pointerout", e => { const b = e.target.closest("button[data-request]"); if (b && this.dwell?.b === b && !b.contains(e.relatedTarget)) this.stopDwell(); });
    this.boardEl.addEventListener("focusin", e => { const b = e.target.closest("button[data-request]"); if (b && this.input === "gaze") this.startDwell(b); });
    this.boardEl.addEventListener("focusout", () => { if (this.input === "gaze") this.stopDwell(); });
    this.switchBtn = button("Press the switch", "switch-press"); this.switchBtn.hidden = true;
    this.switchBtn.addEventListener("click", () => this.pressSwitch());
    this.inputNote = el("p", { className: "note", role: "status" });
    this.closedNote = el("p", { className: "board-closed" });
    this.list = el("ul", { className: "requests" });
    this.listEmpty = el("p", { className: "note", textContent: "No requests waiting." });
    p.append(
      el("p", { className: "note", textContent: "For a patient who can't speak. Each request goes to a simulated nurse-side list, with the time, and stays until a nurse acknowledges it." }),
      inputs, this.inputNote, this.closedNote, this.boardEl, this.switchBtn,
      el("h3", { textContent: "Nurse station · SIMULATED" }), this.listEmpty, this.list,
      el("p", { className: "note", textContent: "It does not replace a certified nurse-call system: a real one is wired, tested and maintained to its own standard. Nothing leaves this page." }),
    );
  }

  renderBoard() {
    const offer = OFFERS[this.state].board, items = offer === "simple" ? BOARD.filter(b => b.simple) : BOARD;
    this.closedNote.hidden = !!offer;
    this.closedNote.textContent = offer ? "" : "Not offered while the patient is sedated: staff watch for signs instead.";
    this.boardEl.hidden = !offer;
    this.boardEl.classList.toggle("simple", offer === "simple");
    this.boardEl.replaceChildren(...items.map(b => { const n = button(b.label, "board-button"); n.dataset.request = b.id; return n; }));
    this.root.querySelector(".board-inputs").hidden = !offer;
    this.setInput(offer ? this.input : "touch", true);
  }

  setInput(id, quietly = false) {
    this.input = id;
    this.root.querySelectorAll(".board-inputs button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.input === id)));
    this.stopScan(); this.stopDwell();
    this.switchBtn.hidden = id !== "switch" || this.boardEl.hidden;
    this.inputNote.textContent = {
      touch: "Touch: press a request.",
      switch: "Single switch, simulated: the highlight steps through the requests, and pressing the switch chooses the one lit.",
      gaze: "Gaze, simulated: rest the pointer on a request, or move focus to it, as a look would, and it's chosen after a moment.",
    }[id];
    if (id === "switch" && !this.switchBtn.hidden && this.tab === "board" && !this.root.hidden) this.startScan();
    if (!quietly) this.api.say(this.inputNote.textContent);
  }

  /** The switch's highlight steps through the requests. It stops after two rounds with no press: nothing runs for ever. */
  startScan() {
    this.stopScan();
    const buttons = [...this.boardEl.querySelectorAll("button")];
    if (!buttons.length) return;
    this.scanLeft = buttons.length * 2;
    const step = () => {
      buttons.forEach(b => b.classList.remove("scan"));
      if (this.scanLeft-- <= 0) { this.scanAt = -1; this.inputNote.textContent = "Scanning paused. Press the switch to start again."; this.scanTimer = 0; return; }
      this.scanAt = (this.scanAt + 1) % buttons.length;
      buttons[this.scanAt].classList.add("scan");
      this.scanTimer = setTimeout(step, SCAN_MS);
    };
    this.scanAt = -1;
    step();
  }
  stopScan() { clearTimeout(this.scanTimer); this.scanTimer = 0; this.scanAt = -1; this.boardEl?.querySelectorAll(".scan").forEach(b => b.classList.remove("scan")); }
  pressSwitch() {
    const lit = this.boardEl.querySelector(".scan");
    if (!lit) { this.startScan(); this.inputNote.textContent = "Scanning: press the switch when the request you want is lit."; return; }
    this.stopScan();
    this.ask(lit.dataset.request);
  }

  /** A look held on a request chooses it. The fill shows the wait; with reduced motion the words do. */
  startDwell(b) {
    this.stopDwell();
    b.classList.add("dwell");
    b.style.setProperty("--dwell-ms", `${reduced() ? 0 : DWELL_MS}ms`);
    if (reduced()) this.inputNote.textContent = `Looking at "${b.textContent}"…`;
    this.dwell = { b, timer: setTimeout(() => { this.stopDwell(); this.ask(b.dataset.request); }, DWELL_MS) };
  }
  stopDwell() { if (!this.dwell) return; clearTimeout(this.dwell.timer); this.dwell.b.classList.remove("dwell"); this.dwell = null; }

  /** A request goes on the nurse-side list with the room's time, and stays until acknowledged. */
  ask(id) {
    const item = BOARD.find(b => b.id === id);
    if (!item) return;
    this.api.notice();
    const time = this.api.time(), had = this.requests.find(r => r.id === id);
    if (had) { had.time = time; had.again = true; } else this.requests.push({ id, label: item.label, time });
    this.renderRequests();
    this.api.say(`Simulated request at the nurse station: ${item.label}, at ${time}.`);
  }
  renderRequests() {
    this.listEmpty.hidden = this.requests.length > 0;
    this.list.replaceChildren(...this.requests.map(r => {
      const ack = button("Acknowledge");
      ack.setAttribute("aria-label", `Acknowledge: ${r.label}`);
      ack.addEventListener("click", () => {
        this.requests = this.requests.filter(x => x !== r);
        this.renderRequests();
        this.api.say(`Acknowledged: ${r.label}.`);
        (this.list.querySelector("button") || this.boardEl.querySelector("button") || this.root.querySelector("#bedsideTitle")).focus({ preventScroll: true });
      });
      return el("li", {}, el("span", { className: "request-time", textContent: r.time }), el("span", { textContent: `${r.label}${r.again ? " (asked again)" : ""}` }), ack);
    }));
  }

  // ---------------------------------------------------------------- the comfort passport
  load() {
    const sample = Object.fromEntries(PASSPORT.map(p => [p.id, p.value]));
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved && typeof saved === "object") { this.savedFrom = true; return { ...sample, ...Object.fromEntries(PASSPORT.filter(p => saved[p.id] in p.options).map(p => [p.id, saved[p.id]])) }; }
    } catch { /* storage refused: the sample it is */ }
    this.savedFrom = false;
    return sample;
  }

  buildPassport() {
    const p = this.panes.passport;
    this.passportStatus = el("p", { className: "note", role: "status", textContent: this.savedFrom ? "Showing the passport saved in this browser." : "A sample passport, for a made-up patient. No name is used." });
    const form = el("div", { className: "passport-form" });
    for (const pref of PASSPORT) {
      const sel = el("select", { id: `pp-${pref.id}` });
      for (const [v, label] of Object.entries(pref.options)) sel.append(el("option", { value: v, textContent: label }));
      sel.value = this.values[pref.id];
      sel.addEventListener("change", () => { this.values[pref.id] = sel.value; this.passportStatus.textContent = "Changed here. Save it to keep it in this browser."; });
      form.append(el("label", { htmlFor: sel.id }, el("span", { textContent: pref.shownOnly ? `${pref.label} (shown, not applied)` : pref.label }), sel));
    }
    const save = button("Save in this browser"), reset = button("Restore the sample");
    save.addEventListener("click", () => {
      try { localStorage.setItem(KEY, JSON.stringify(this.values)); this.passportStatus.textContent = "Saved in this browser only. Nothing was sent anywhere."; }
      catch { this.passportStatus.textContent = "This browser won't let the page save, so nothing was saved."; }
      this.api.say(this.passportStatus.textContent);
    });
    reset.addEventListener("click", () => {
      try { localStorage.removeItem(KEY); } catch { /* nothing was saved */ }
      for (const pref of PASSPORT) { this.values[pref.id] = pref.value; p.querySelector(`#pp-${pref.id}`).value = pref.value; }
      this.passportStatus.textContent = "Back to the sample. Anything saved in this browser was removed.";
      this.api.say(this.passportStatus.textContent);
    });
    const clinician = el("dl", { className: "object-rows" });
    for (const c of CLINICIAN) clinician.append(el("dt", { textContent: c.label }), el("dd", { textContent: c.value }));
    this.applyTable = el("table", { className: "apply-table" });
    p.append(
      el("p", { className: "note", textContent: "What the patient would like, recorded with them or their family. It's its own record: Tune it in and PACS keep theirs." }),
      el("h3", { textContent: "The patient's preferences" }), form,
      el("div", { className: "profile-buttons" }, save, reset), this.passportStatus,
      el("h3", { textContent: "Set by the care team" }), clinician,
      el("h3", { textContent: "In each patient state" }), this.applyTable,
    );
  }

  renderApply() {
    const s = this.state, head = el("tr", {}, el("th", { scope: "col", textContent: "Preference" }), ...STATE_ORDER.map(id => {
      const th = el("th", { scope: "col", textContent: id === s ? `${STATES[id].label} (now)` : STATES[id].label });
      if (id === s) th.className = "now";
      return th;
    }));
    const rows = PASSPORT.map(pref => el("tr", {}, el("th", { scope: "row", textContent: pref.label }), ...STATE_ORDER.map(id => {
      const [word, why] = APPLY[pref.id][id];
      const td = el("td", {}, el("strong", { textContent: APPLY_WORDS[word] }), el("span", { textContent: ` ${why}` }));
      td.dataset.apply = word;
      if (id === s) td.className = "now";
      return td;
    })));
    this.applyTable.replaceChildren(el("thead", {}, head), el("tbody", {}, ...rows));
  }

  // ---------------------------------------------------------------- family connection
  buildFamily() {
    const p = this.panes.family;
    this.familyNote = el("p", { className: "note" });
    const photos = el("figure", { className: "family-photos" }, drawPhoto("beach"), drawPhoto("garden"), drawPhoto("home"),
      el("figcaption", { className: "note", textContent: "Drawn placeholders. No photograph is uploaded or stored." }));
    this.familyRows = el("ul", { className: "family-list" });
    this.callBox = el("div", { className: "family-call", hidden: true });
    this.messageBox = el("div", { className: "family-message", hidden: true }, drawWave(),
      el("p", { textContent: `“${MESSAGE}”` }), el("p", { className: "note", textContent: "Shown, not played: there's no real voice to use. A real message would be recorded by family and checked by staff." }));
    this.musicCaption = el("p", { className: "note", role: "status" });
    this.photos = photos;
    p.append(this.familyNote, photos, this.familyRows, this.messageBox, this.callBox, this.musicCaption);
  }

  /** Whether an item can be used now: not during Quiet now, and for a sedated patient only if staff allow it. */
  allowed(id) { return !this.quiet && (this.state !== "sedated" || this.allow[id]); }

  renderFamily() {
    const sedated = this.state === "sedated";
    this.familyNote.textContent = this.quiet ? "Quiet now is on: all stimulation is off. Staff turn it off again."
      : sedated ? "The patient is sedated or unresponsive, so only what staff allow is offered." : "The patient and family choose. Staff can turn everything off with Quiet now.";
    this.photos.hidden = !this.allowed("photos");
    this.familyRows.replaceChildren(...FAMILY.map(f => {
      const ok = this.allowed(f.id), li = el("li", {}, el("strong", { textContent: f.label }), el("span", { className: "note", textContent: f.what }));
      if (sedated) {
        const box = el("input", { type: "checkbox", id: `allow-${f.id}`, checked: this.allow[f.id], disabled: this.quiet });
        box.addEventListener("change", () => { this.allow[f.id] = box.checked; if (!box.checked) this.stopFamily(f.id); this.renderFamily(); this.api.say(`${f.label}: ${box.checked ? "allowed" : "not allowed"} by staff.`); });
        li.append(el("label", { className: "staff-allow", htmlFor: box.id }, box, " Staff allow"));
      }
      const act = this.familyAction(f.id);
      if (act) { act.disabled = !ok; li.append(act); }
      return li;
    }));
  }

  familyAction(id) {
    const on = this.familyOn;
    const toggle = (key, offText, onText, run) => { const b = button(on[key] ? onText : offText); b.setAttribute("aria-pressed", String(!!on[key])); b.addEventListener("click", () => { on[key] = !on[key]; run(on[key]); this.renderFamily(); }); return b; };
    if (id === "message") return toggle("message", "Show the message", "Hide the message", v => { this.messageBox.hidden = !v; this.api.say(v ? `Voice message, shown and not played: ${MESSAGE}` : "Message hidden."); });
    if (id === "call") return toggle("call", "Start a simulated call", "End the call", v => this.call(v));
    if (id === "scene") return toggle("scene", "Show on the TV", "Take it off the TV", v => this.api.scene(v));
    if (id === "orientation") return toggle("lines", "Add to the orientation screen", "Take off the orientation screen", v => this.api.familyLines(v));
    if (id === "music") {
      const b = button(on.music ? "Mute demo sound" : "Play familiar music");
      b.id = "familyMusic";
      b.className = on.music ? "outline-action mute-sound" : "outline-action";
      b.addEventListener("click", () => {
        if (on.music) this.api.music(false);
        else { on.music = true; this.api.music(true, { caption: this.musicCaption, done: () => { on.music = false; this.renderFamily(); } }); }
        this.renderFamily();
        this.familyRows.querySelector("#familyMusic")?.focus({ preventScroll: true }); // Mute is where Play was
      });
      return b;
    }
    return null;
  }

  call(on) {
    this.callBox.hidden = !on;
    if (on) {
      const c = drawPhoto("home"); c.classList.add("call-picture");
      this.callBox.replaceChildren(el("p", { className: "call-kicker", textContent: "Video call · SIMULATED" }), c,
        el("p", { className: "note", textContent: "No camera, microphone or call is used. A real call would need the hospital's approved system and staff to set it up." }));
    }
    this.api.say(on ? "Simulated video call shown. No camera or microphone is used." : "Simulated call ended.");
  }

  /** Stop one family item, or (with no id) every one: for Quiet now, a state change, or staff turning it off. */
  stopFamily(id) {
    const all = !id, on = this.familyOn;
    if ((all || id === "message") && on.message) { on.message = false; this.messageBox.hidden = true; }
    if ((all || id === "call") && on.call) { on.call = false; this.callBox.hidden = true; }
    if ((all || id === "scene") && on.scene) { on.scene = false; this.api.scene(false); }
    if ((all || id === "orientation") && on.lines) { on.lines = false; this.api.familyLines(false); }
    if ((all || id === "music") && on.music) { on.music = false; this.api.music(false); }
  }

  /** Staff's Quiet now: every stimulation off, sound included, until staff turn it off. */
  setQuiet(on) {
    this.quiet = on;
    this.root.querySelector("#quietNow").checked = on;
    if (on) this.stopFamily();
    this.api.quiet(on);
    this.renderFamily();
    this.api.say(on ? "Quiet now: the TV, the aquarium screen, family connection and demo sound are off. Staff turn it off again." : "Quiet now is off.");
  }

  // ---------------------------------------------------------------- what staff see
  buildStaff() {
    this.staffBox = el("div", { className: "staff-view" });
    this.panes.staff.append(el("p", { className: "note", textContent: "What staff see beside the room. SIMULATED: nothing is measured or monitored." }), this.staffBox);
  }

  renderStaff() {
    const dismiss = button("Dismiss");
    dismiss.addEventListener("click", () => { this.reminder = false; this.renderStaff(); this.api.say("Reminder dismissed by staff."); this.root.querySelector('#bedsideTabs button[data-tab="staff"]').focus({ preventScroll: true }); }); // the button goes: focus stays in the panel
    const rem = this.reminder ? el("div", { className: "staff-reminder" }, el("p", { textContent: STAFF.reminder }), dismiss) : el("p", { className: "note", textContent: "Positioning reminder dismissed. It comes back when the patient is next sedated." });
    this.staffBox.replaceChildren(rem, el("p", { textContent: STAFF.lines }), el("p", { textContent: this.api.noise() }),
      el("p", { className: "note", textContent: this.state === "sedated" ? "While the patient is sedated, comfort is set by staff." : "The patient can use their own controls; staff can still set comfort." }));
  }

  /** The state changed: family items a sedated patient isn't allowed stop, and a sedated patient's reminder comes back. */
  stateChanged(was) {
    if (this.state === "sedated") { for (const f of FAMILY) if (!this.allow[f.id]) this.stopFamily(f.id); if (was !== "sedated") this.reminder = true; }
    this.refresh();
  }

  /** The panel closed: the switch's highlight and any look in progress stop. */
  closed() { this.stopScan(); this.stopDwell(); }

  /** For the check. */
  inspect() {
    return { tab: this.tab, input: this.input, requests: this.requests.map(r => ({ ...r })), board: [...this.boardEl.querySelectorAll("button")].map(b => b.textContent), scanning: !!this.scanTimer,
      values: { ...this.values }, quiet: this.quiet, allow: { ...this.allow }, family: { ...this.familyOn }, reminder: this.reminder };
  }
}
