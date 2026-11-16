// Light across 24 hours: the panel with its timeline. Drag the hour, or step it by keyboard, and the room shows the plan's
// light and blinds then (day-plan.js); main.js lays the look under the room modes. Play the day runs once and stops.
import { el } from "./panel.js";
import { DAY_TEXT, PHASES, PLAY_MS_PER_HOUR, QUIET, inQuiet, lookAt, phaseAt, words } from "./day-plan.js";

const START = 6; // the timeline runs from 6 am to 6 am, so the night is in one piece
const MID = { morning: 9, afternoon: 14.5, evening: 19, night: 2 };
const at = h => (((h - START) % 24) + 24) % 24 / 24; // where an hour sits along the track, 0 to 1
const clock = h => { const x = ((h % 24) + 24) % 24, hh = Math.floor(x), mm = Math.round((x - hh) * 60) % 60, ap = hh < 12 ? "am" : "pm"; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${ap}`; };

export class DayView {
  /** `root` is the panel. `api`: hour(), setHour(h), mode() (the room mode now), say(text). */
  constructor(root, api) {
    this.root = root; this.api = api; this.playing = null;
    this.build();
  }

  build() {
    const r = this.root;
    this.track = el("div", { className: "day-track" });
    // the light through the day, as a line: higher is brighter, its colour warm to cool
    const pts = [], stops = [];
    for (let k = 0; k <= 96; k++) { const h = START + k / 4, l = lookAt(h); pts.push(`${(k / 96 * 240).toFixed(1)},${(36 - l.level * 30).toFixed(1)}`); }
    for (let k = 0; k <= 12; k++) { const h = START + k * 2, kv = lookAt(h).kelvin; stops.push(`<stop offset="${k / 12}" stop-color="${kv >= 4500 ? "#7fb4d6" : kv >= 3300 ? "#d9c27a" : "#e39550"}"/>`); }
    this.track.innerHTML = `<svg class="day-curve" viewBox="0 0 240 40" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="dayGrad">${stops.join("")}</linearGradient></defs><polyline points="${pts.join(" ")}" fill="none" stroke="url(#dayGrad)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
    const phases = el("div", { className: "day-phases" });
    for (const p of PHASES) {
      const seg = el("span", { className: `day-seg seg-${p.id}`, textContent: p.label });
      seg.style.left = `${at(p.from) * 100}%`; seg.style.width = `${((p.to - p.from) / 24) * 100}%`;
      phases.append(seg);
    }
    const quiet = el("span", { className: "day-quiet", textContent: "Quiet hours" });
    quiet.style.left = `${at(QUIET.from) * 100}%`; quiet.style.width = `${(((QUIET.to - QUIET.from + 24) % 24) / 24) * 100}%`;
    this.handle = el("div", { className: "day-handle" });
    Object.entries({ role: "slider", tabindex: "0", "aria-label": "Hour of the day", "aria-valuemin": "0", "aria-valuemax": "24" }).forEach(([k, v]) => this.handle.setAttribute(k, v));
    const ticks = el("div", { className: "day-ticks" }, ...["6 am", "noon", "6 pm", "midnight", "6 am"].map(t => el("span", { textContent: t })));
    this.track.append(phases, quiet, this.handle);
    this.jump = el("div", { className: "seg day-jump" });
    this.jump.setAttribute("role", "group"); this.jump.setAttribute("aria-label", "Go to a phase");
    this.jump.replaceChildren(...PHASES.map(p => { const b = el("button", { type: "button", textContent: p.label }); b.dataset.phase = p.id; return b; }));
    r.querySelector("#dayTimeline").replaceChildren(this.track, ticks, this.jump);
    this.now = r.querySelector("#dayNow"); this.facts = r.querySelector("#dayFacts");
    this.override = r.querySelector("#dayOverride");
    this.playBtn = r.querySelector("#dayPlay");

    // drag along the track, or click it: the hour follows the pointer
    const fromX = x => { const b = this.track.getBoundingClientRect(), k = Math.min(1, Math.max(0, (x - b.left) / b.width)); return Math.round((START + k * 24) * 4) / 4; };
    this.track.addEventListener("pointerdown", e => {
      this.stop();
      this.track.setPointerCapture(e.pointerId); this.dragging = true;
      this.set(fromX(e.clientX)); this.handle.focus({ preventScroll: true });
    });
    this.track.addEventListener("pointermove", e => { if (this.dragging) this.set(fromX(e.clientX)); });
    const end = () => { if (this.dragging) { this.dragging = false; this.announce(); } };
    this.track.addEventListener("pointerup", end); this.track.addEventListener("pointercancel", end);
    this.handle.addEventListener("keydown", e => {
      const step = { ArrowRight: 0.25, ArrowUp: 0.25, ArrowLeft: -0.25, ArrowDown: -0.25, PageUp: 1, PageDown: -1 }[e.key];
      const h = this.api.hour();
      let to = null;
      if (step) to = h + step; else if (e.key === "Home") to = START; else if (e.key === "End") to = START + 23.75;
      if (to === null) return;
      e.preventDefault(); this.stop();
      this.set(((to % 24) + 24) % 24); this.announce();
    });
    this.jump.addEventListener("click", e => { const b = e.target.closest("button[data-phase]"); if (b) { this.stop(); this.set(MID[b.dataset.phase]); this.announce(); } });
    this.playBtn.addEventListener("click", () => (this.playing ? this.stop(true) : this.play()));
  }

  /** Show an hour: the room follows (main.js), and the panel says what the plan does then. */
  set(h) { this.api.setHour(h); this.render(); }

  render() {
    const h = this.api.hour(), p = phaseAt(h), w = words(h), quiet = inQuiet(h), mode = this.api.mode();
    this.handle.style.left = `${at(h) * 100}%`;
    this.handle.setAttribute("aria-valuenow", String(Math.round(h * 100) / 100));
    this.handle.setAttribute("aria-valuetext", `${clock(h)}, ${p.label}${quiet ? ", quiet hours" : ""}`);
    this.jump.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.phase === p.id)));
    this.now.textContent = `${clock(h)} · ${p.label}${quiet ? " · Quiet hours" : ""}`;
    const row = (k, v) => [el("dt", { textContent: k }), el("dd", { textContent: v })];
    this.facts.replaceChildren(...row("Light", `${w.light[0].toUpperCase()}${w.light.slice(1)}, ${p.light}.`), ...row("Blinds", `${w.blinds[0].toUpperCase()}${w.blinds.slice(1)}, ${p.blinds}.`),
      ...(quiet ? row("Quiet hours", QUIET.note) : []));
    const staff = mode === "clinical" || mode === "emergency";
    this.override.textContent = mode === "standard" ? DAY_TEXT.override
      : staff ? `${mode === "clinical" ? "Clinical" : "Emergency"} is on: the staff override wins, and the room shows its light. The plan waits until staff end it.`
        : `${mode[0].toUpperCase()}${mode.slice(1)} mode is on, over the plan. ${DAY_TEXT.override}`;
    this.override.classList.toggle("day-overridden", mode !== "standard");
  }
  announce() { this.api.say(this.handle.getAttribute("aria-valuetext") + `. Light: ${words(this.api.hour()).light}; blinds ${words(this.api.hour()).blinds}.`); }

  /** Play the day: an hour a second from the hour shown, round to the same hour again, then stop. Reduced motion steps through the phases instead. */
  play() {
    const from = this.api.hour(), reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.playBtn.textContent = "Stop";
    this.api.say("Playing the day: the light and blinds through 24 hours. It stops by itself.");
    if (reduced) {
      const order = PHASES.map(p => MID[p.id]);
      let i = 0;
      const next = () => { if (i >= order.length) { this.set(from); this.stop(); return; } this.set(order[i++]); this.playing = { timer: setTimeout(next, 1600) }; };
      this.playing = { timer: 0 }; next();
      return;
    }
    const t0 = performance.now();
    const tick = now => {
      if (!this.playing) return;
      const k = (now - t0) / (24 * PLAY_MS_PER_HOUR);
      if (k >= 1) { this.set(from); this.stop(); return; }
      this.set((from + k * 24) % 24);
      this.playing.frame = requestAnimationFrame(tick);
    };
    this.playing = { frame: requestAnimationFrame(tick) };
  }
  stop(said = false) {
    if (!this.playing) return;
    cancelAnimationFrame(this.playing.frame); clearTimeout(this.playing.timer);
    this.playing = null; this.playBtn.textContent = "Play the day";
    this.api.say(said ? "Stopped." : `The day played through. ${this.handle.getAttribute("aria-valuetext")}.`);
  }

  inspect() { const h = this.api.hour(); return { hour: h, phase: phaseAt(h).id, quiet: inQuiet(h), words: words(h), look: lookAt(h), playing: !!this.playing, handle: this.handle.getAttribute("aria-valuetext") }; }
}
