// The clinician workstation's panel: a made-up dashboard for the care team, in the options panel's place as the bed panel
// is. Nurse view and Doctor view show the same patient differently; a task shows what it needs and lights where that is in
// the room; Done ticks it off here and on the staff panel. Hands-free buttons stand in for spoken commands. In
// Emergency-ready it shows where the emergency equipment is and the clear route to the bed. It opens PACS as it is.
// SIMULATED throughout: no name, no diagnosis, nothing listens, nothing is said aloud about the patient, and nothing here
// changes an alarm, a device or a setting. The data is wall-data.js.
import { el } from "./panel.js";
import {
  EMERGENCY, EQUIPMENT, HANDOVER, HANDS_FREE, HANDS_FREE_NOTE, OBS, OBS_NOTE, OVERVIEW, PLAN, SECTION_TITLES, STATION_VIEWS,
  SUPPLIES, TASKS,
} from "./wall-data.js";

const button = (text, cls = "outline-action") => el("button", { type: "button", className: cls, textContent: text });
/** An element with ARIA attributes, set as attributes so every browser has them. */
const aria = (node, attrs) => { for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };

export class Station {
  /**
   * root: the panel. api (main.js): light(where, { frame }) lights a place in the room (null: none); route(on) marks the clear
   * route on the floor; changed() redraws the wall's screens; pacs() opens PACS; say(text).
   */
  constructor(root, api) {
    this.root = root; this.api = api;
    this.view = "nurse"; this.task = null; this.done = new Set(); this.emergency = false; this.lit = null;
    this.views = root.querySelector("#stationViews");
    this.views.addEventListener("click", e => { const b = e.target.closest("button[data-view]"); if (b) this.setView(b.dataset.view); });
    this.body = root.querySelector("#stationBody");
    this.urgent = root.querySelector("#stationEmergency");
    const hands = root.querySelector("#stationHands");
    hands.replaceChildren(el("p", { className: "acoustic-sub", id: "stationHandsTitle", textContent: "Hands-free" }),
      aria(el("div", { className: "station-say" }, ...HANDS_FREE.map(h => {
        const b = button(`“${h.says}”`); b.dataset.say = h.id; b.title = h.does; return b;
      })), { role: "group", "aria-labelledby": "stationHandsTitle" }),
      el("p", { className: "note", textContent: HANDS_FREE_NOTE }));
    hands.addEventListener("click", e => { const b = e.target.closest("button[data-say]"); if (b) this.command(b.dataset.say); });
    root.querySelector("#stationPacs").addEventListener("click", () => this.api.pacs());
    this.render();
  }

  // ---------------------------------------------------------------- what it shows
  render() {
    this.views.querySelectorAll("button[data-view]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.view === this.view)));
    this.views.hidden = this.emergency;
    this.urgent.hidden = !this.emergency;
    if (this.emergency) { this.renderEmergency(); this.body.replaceChildren(); return; }
    this.body.replaceChildren(...STATION_VIEWS[this.view].sections.map(id => this.section(id)));
  }

  section(id) {
    const s = el("section", { className: `station-section station-${id}` }, el("h3", { textContent: SECTION_TITLES[id] }));
    const list = items => el("ul", { className: "station-list" }, ...items.map(x => (x instanceof Node ? x : el("li", { textContent: x }))));
    const show = (where, label) => { const b = button("Show", "station-show"); b.dataset.where = where; b.setAttribute("aria-label", `Show ${label} in the room`); b.addEventListener("click", () => this.light(where, label)); return b; };
    if (id === "overview") s.append(list(OVERVIEW));
    if (id === "plan") s.append(list(PLAN));
    if (id === "handover") s.append(list(HANDOVER));
    if (id === "obs") {
      s.append(el("dl", { className: "station-obs" }, ...OBS.flatMap(o => [el("dt", { textContent: o.label }), el("dd", { textContent: `${o.value} ${o.unit}` })])),
        el("p", { className: "note", textContent: `SIMULATED. ${OBS_NOTE}` }));
    }
    if (id === "equipment") s.append(list(EQUIPMENT.map(e => el("li", {}, el("span", { textContent: `${e.label}: ${e.status}` }), show(e.where, e.label.toLowerCase())))), el("p", { className: "note", textContent: "Statuses are part of the demo: none is read from a device." }));
    if (id === "supplies") s.append(list(SUPPLIES.map(x => el("li", {}, el("span", { textContent: `${x.label}: ${x.whereText}` }), ...(x.where ? [show(x.where, x.label.toLowerCase())] : [])))));
    if (id === "tasks") {
      const picks = aria(el("div", { className: "station-tasks" }, ...TASKS.map(t => {
        const b = button(`${this.done.has(t.id) ? "✓ " : ""}${t.label}`, "station-task");
        b.dataset.task = t.id; b.setAttribute("aria-pressed", String(this.task === t.id));
        b.addEventListener("click", () => this.choose(t.id));
        return b;
      })), { role: "group", "aria-label": "Care tasks" });
      s.append(picks);
      const t = TASKS.find(x => x.id === this.task);
      if (t) {
        const done = button(this.done.has(t.id) ? "Not done after all" : "Done", this.done.has(t.id) ? "outline-action" : "station-done");
        done.addEventListener("click", () => this.toggleDone(t.id));
        s.append(aria(el("div", { className: "station-detail" },
          el("p", { className: "station-due", textContent: this.done.has(t.id) ? "Done ✓" : t.due }),
          el("p", { className: "acoustic-sub", textContent: "What it needs" }), list(t.needs),
          el("p", { className: "station-where", textContent: `Lit in the room: ${t.whereText.toLowerCase()}.` }), done), { role: "region", "aria-label": t.label }));
      }
    }
    return s;
  }

  renderEmergency() {
    const e = EMERGENCY, items = e.items.map(it => {
      const b = button("Show", "station-show"); b.dataset.where = it.where;
      b.setAttribute("aria-label", `Show the ${it.label.toLowerCase()} in the room`);
      b.addEventListener("click", () => this.light(it.where, it.label.toLowerCase()));
      return el("li", {}, el("span", {}, el("strong", { textContent: it.label }), ` · ${it.whereText}`), b);
    });
    this.urgent.replaceChildren(el("h3", { textContent: e.title }), el("ul", { className: "station-list" }, ...items),
      el("p", { textContent: e.route }), el("p", { className: "station-caveat", textContent: e.caveat }));
  }

  // ---------------------------------------------------------------- what it does
  setView(id, { quietly = false } = {}) {
    if (!STATION_VIEWS[id]) return;
    this.view = id;
    this.render();
    this.api.changed();
    if (!quietly) this.api.say(`${STATION_VIEWS[id].label}: the same made-up patient, ${id === "nurse" ? "care tasks first" : "observations and the plan first"}.`);
  }

  /** Choose a task: the station shows what it needs and lights where that is. Choosing it again lets it go. */
  choose(id, { focus = true } = {}) {
    const t = TASKS.find(x => x.id === id);
    if (!t) return;
    this.task = this.task === id && focus ? null : id;
    this.render();
    if (this.task) this.light(t.where, t.label.toLowerCase(), { quietly: true }); else this.light(null);
    this.api.changed();
    this.api.say(this.task ? `${t.label}. It needs: ${t.needs.join(", ")}. ${t.whereText}, lit in the room.` : `${t.label}: let go.`);
    if (focus) this.body.querySelector(`button[data-task="${id}"]`)?.focus({ preventScroll: true });
  }

  /** Done, or not done after all: a person presses it, never a timer. */
  toggleDone(id, { focus = true } = {}) {
    if (this.done.has(id)) this.done.delete(id); else this.done.add(id);
    this.render();
    this.api.changed();
    const t = TASKS.find(x => x.id === id);
    this.api.say(this.done.has(id) ? `${t.label}: done, ticked off here and on the staff panel.` : `${t.label}: not done after all.`);
    if (focus) this.body.querySelector(".station-detail button")?.focus({ preventScroll: true });
  }

  light(where, label, { quietly = false } = {}) {
    this.lit = where;
    this.api.light(where);
    if (where && !quietly) this.api.say(`Lit in the room: the ${label}.`);
  }

  /** A hands-free command: the station answers on its screen. Nothing listens, and nothing about the patient is said aloud. */
  command(id) {
    if (id === "tasks") { if (this.view !== "nurse") this.setView("nurse", { quietly: true }); this.body.querySelector(".station-tasks button")?.focus({ preventScroll: true }); this.api.say("Showing the care tasks on the station."); return; }
    if (id === "next") {
      const next = TASKS.find(t => !this.done.has(t.id) && t.id !== this.task) || TASKS.find(t => !this.done.has(t.id));
      if (!next) { this.api.say("Every task is done."); return; }
      if (this.view !== "nurse") this.setView("nurse", { quietly: true });
      this.choose(next.id, { focus: false });
      return;
    }
    if (id === "dressings") { const s = SUPPLIES[0]; this.light(s.where, "workstation's left cupboard", { quietly: true }); this.api.say(`Dressings: ${s.whereText.toLowerCase()}, lit in the room.`); return; }
    if (id === "handover") { this.task = null; this.light(null); this.render(); this.api.changed(); this.body.querySelector(".station-handover h3")?.scrollIntoView({ block: "nearest" }); this.api.say("The handover note is on the station's screen. It isn't read aloud."); }
  }

  /** Emergency-ready started or ended: the emergency view, with the route on the floor and the emergency equipment lit. */
  setEmergency(on) {
    if (this.emergency === on) return;
    this.emergency = on;
    this.task = on ? null : this.task;
    this.render();
    this.api.route(on);
    this.light(on ? "emergency" : null, "emergency equipment", { quietly: true });
    this.api.changed();
  }

  /** Another room is another made-up patient: no task chosen, nothing ticked. The view stays as the visitor left it. */
  reset() { this.task = null; this.done = new Set(); this.lit = null; this.render(); }

  /** For main.js: put the station back as it was (a demo ends), or start fresh. */
  snapshot() { return { view: this.view, task: this.task, done: [...this.done] }; }
  restore(s) { if (!s) return; this.view = s.view; this.task = s.task; this.done = new Set(s.done); this.render(); this.api.changed(); }
  inspect() { return { view: this.view, task: this.task, done: [...this.done], emergency: this.emergency, lit: this.lit, sections: [...this.body.querySelectorAll("h3")].map(h => h.textContent) }; }
}
