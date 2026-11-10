// The guided tour: a few captioned steps through what the configurator does, for someone seeing it for the first time.
// Each step sets up the room through `api` (main.js); Previous, Pause, Next, Restart and Exit are always there. Exit puts the
// room back exactly as it was before the tour started, and Restart does the same before playing from the first step.

export const STEPS = [
  {
    title: "An isolation room, as a design proposal",
    text: "Room W1. Its walls, door and glass match the hospital's drawing; the furniture and finishes are our proposal.",
    run: async a => { await a.room("W1"); a.theme("calm"); a.time("afternoon"); a.camera("dollhouse"); },
  },
  {
    title: "The equipment stays",
    text: "The Calm Clinical theme keeps the real bed, monitor, pumps and ventilator.",
    run: async a => { a.camera("overview"); },
  },
  {
    title: "What the patient sees",
    text: "Patient view looks out from the pillow, and turns only as far as a patient's head could.",
    run: async a => { a.camera("patient"); },
  },
  {
    title: "Comfort mode",
    text: "The lights turn warm and dim, and by day the blinds lower.",
    run: async a => { a.camera("overview"); a.mode("comfort"); },
  },
  {
    title: "Clinical mode and Clinical view",
    text: "Bright light for care, labels on the equipment and shaded areas to keep clear. A sketch, not a compliance check.",
    run: async a => { a.mode("clinical"); },
  },
  {
    title: "Emergency-ready",
    text: "Staff start it: full light, screens off and the glass front clear.",
    run: async a => { a.mode("emergency"); },
  },
  {
    title: "Placing items",
    text: "Drag items such as a privacy screen or hand-gel dispenser into the room. Nothing checks where they go.",
    run: async a => { a.mode("standard"); a.camera("overview", true); a.place(["screen", "rub"]); },
  },
  {
    title: "Themes and the time of day",
    text: "Desert Sanctuary at sunset. The sun follows its real path over Abu Dhabi.",
    run: async a => { a.theme("desert"); a.time("sunset"); a.camera("family"); },
  },
  {
    title: "Two deeper demos",
    text: "PACS links the monitor to the room's comfort, and APIS shows how tubes and lines attach. Open either below.",
    run: async a => { a.camera("overview"); },
    links: [["pacs", "Open the PACS demo"], ["apis", "Explore APIS"]],
  },
];

// The safety caveats every step would otherwise repeat, said once in a fixed line under the captions (and under PACS's demo)
export const CAVEAT = "Simulated demo. A nurse approves every change.";

const HOLD_MS = 9000; // long enough to read a step, at an unhurried pace

export class GuidedTour {
  constructor(api, ui) {
    this.api = api; this.ui = ui;
    this.at = -1; this.playing = false; this.timer = 0; this.token = 0; this.snapshot = null;
    ui.prev.addEventListener("click", () => this.go(this.at - 1));
    ui.next.addEventListener("click", () => (this.at >= STEPS.length - 1 ? this.exit() : this.go(this.at + 1)));
    ui.play.addEventListener("click", () => this.setPlaying(!this.playing));
    ui.exit.addEventListener("click", () => this.exit());
    ui.restart.addEventListener("click", () => this.restart());
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

  /** Back to the first step from wherever the tour is, with the room as it was before it started, and playing again. */
  async restart() {
    if (!this.running) { this.start(); return; }
    clearTimeout(this.timer);
    const token = ++this.token; // a step still setting up stops here
    // the steps lay modes and placed items over the room; put it back first, so step one starts where the tour first did
    try { await this.api.restore(this.snapshot); } catch (err) { this.api.fail(err); }
    if (token !== this.token || !this.running) return; // exited, or restarted again, meanwhile
    this.api.say("Guided tour restarted from the first step.");
    this.go(0);
    this.setPlaying(!matchMedia("(prefers-reduced-motion: reduce)").matches);
    this.ui.next.focus({ preventScroll: true });
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
