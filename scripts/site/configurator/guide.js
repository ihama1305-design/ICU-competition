// The guided tour: a few captioned steps through what the configurator does, for someone seeing it for the first time.
// Each step sets up the room through `api` (main.js); Previous, Pause, Next and Exit are always there, and Exit puts the
// room back exactly as it was before the tour started.

export const STEPS = [
  {
    title: "An isolation room, as a design proposal",
    text: "Room W1, built on the as-built model of SSMC's fourth-floor ICU. The walls, door and glazing come from the drawing; the furnishings and finishes are proposals, not the room as built.",
    run: async a => { await a.room("W1"); a.theme("calm"); a.time("afternoon"); a.camera("dollhouse"); },
  },
  {
    title: "Today's room, tidied up",
    text: "Calm Clinical keeps the as-built kit: the bed, ceiling pendant, monitor, pumps and ventilator. Every screen's readings are marked SIMULATED.",
    run: async a => { a.camera("overview"); },
  },
  {
    title: "What the patient sees",
    text: "Patient view stays at the pillow and turns only as far as a head can, from the bed up to the ceiling. The patient figure is a teaching model, not a person.",
    run: async a => { a.camera("patient"); },
  },
  {
    title: "Comfort mode",
    text: "The lights warm and dim and the blinds lower, over about two seconds. The task light, the monitor and clinical alarms are unaffected.",
    run: async a => { a.camera("overview"); a.mode("comfort"); },
  },
  {
    title: "Clinical mode and Clinical view",
    text: "Full, neutral light and the examination task light, with labels on the kit and hatched keep-clear areas for care around the bed. Illustrative, without dimensions: not a compliance check.",
    run: async a => { a.mode("clinical"); },
  },
  {
    title: "Emergency-ready",
    text: "Started by staff: full light and the task light, the TV and aquarium screen off, the glazed front clear. Medical devices and alarms are not changed.",
    run: async a => { a.mode("emergency"); },
  },
  {
    title: "Placing items",
    text: "Visitors drag items like a privacy screen or a hand-rub dispenser from the panel onto the room, wherever they like. Nothing checks staff access or infection-control positions.",
    run: async a => { a.mode("standard"); a.camera("overview", true); a.place(["screen", "rub"]); },
  },
  {
    title: "Themes and the time of day",
    text: "A theme is a starting point: anything can be changed after. The sun follows its real path at Abu Dhabi's latitude, here at sunset in Desert Sanctuary.",
    run: async a => { a.theme("desert"); a.time("sunset"); a.camera("family"); },
  },
  {
    title: "Simulated monitoring and attachments",
    text: "Two demonstrations go further: the Physiological Adaptive Comfort System, with simulated readings and nurse approval before any change, and the Adaptive Patient Interface System, on attachments and lines. Open either below, or exit to explore.",
    run: async a => { a.camera("overview"); },
    links: [["pacs", "Open the PACS demo"], ["apis", "Explore APIS"]],
  },
];

const HOLD_MS = 9000; // long enough to read a step, at an unhurried pace

export class GuidedTour {
  constructor(api, ui) {
    this.api = api; this.ui = ui;
    this.at = -1; this.playing = false; this.timer = 0; this.token = 0; this.snapshot = null;
    ui.prev.addEventListener("click", () => this.go(this.at - 1));
    ui.next.addEventListener("click", () => (this.at >= STEPS.length - 1 ? this.exit() : this.go(this.at + 1)));
    ui.play.addEventListener("click", () => this.setPlaying(!this.playing));
    ui.exit.addEventListener("click", () => this.exit());
  }

  get running() { return this.at >= 0; }

  start() {
    if (this.running) return;
    this.snapshot = this.api.snapshot();
    this.ui.card.hidden = false;
    this.api.shown(true);
    this.go(0);
    this.setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches); // with reduced motion, it waits for Next
    this.ui.next.focus({ preventScroll: true });
  }

  async go(i) {
    if (i < 0 || i >= STEPS.length) return;
    this.at = i;
    const token = ++this.token, step = STEPS[i];
    this.ui.count.textContent = `${i + 1} of ${STEPS.length}`;
    this.ui.title.textContent = step.title;
    this.ui.text.textContent = step.text;
    this.ui.prev.disabled = i === 0;
    this.ui.next.textContent = i === STEPS.length - 1 ? "Finish" : "Next";
    this.ui.links.replaceChildren(...(step.links || []).map(([id, label]) => {
      const b = document.createElement("button");
      b.type = "button"; b.className = "outline-action"; b.textContent = label;
      b.addEventListener("click", () => { this.exit(); this.api.open(id); });
      return b;
    }));
    this.ui.bar.style.setProperty("--done", `${((i + 1) / STEPS.length) * 100}%`);
    this.api.say(`Step ${i + 1} of ${STEPS.length}: ${step.title}.`);
    this.schedule();
    // a later step, or Exit, supersedes this one partway through
    try { await step.run(this.api, () => token !== this.token); } catch (err) { this.api.fail(err); }
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.playing || !this.running) return;
    this.timer = setTimeout(() => (this.at >= STEPS.length - 1 ? this.setPlaying(false) : this.go(this.at + 1)), HOLD_MS);
  }

  setPlaying(on) {
    this.playing = on;
    this.ui.play.textContent = on ? "Pause" : "Play";
    this.ui.play.setAttribute("aria-pressed", String(!on));
    this.schedule();
  }

  /** Someone took the view into their own hands: the tour waits for them. */
  pause() { if (this.running && this.playing) this.setPlaying(false); }

  exit() {
    if (!this.running) return;
    clearTimeout(this.timer);
    this.token++;
    this.at = -1; this.playing = false;
    this.ui.card.hidden = true;
    this.api.shown(false);
    this.api.restore(this.snapshot);
    this.snapshot = null;
    this.api.say("Guided tour ended. The room is back as it was.");
  }
}
