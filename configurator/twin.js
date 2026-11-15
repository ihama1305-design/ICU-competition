// The digital twin's panel: the room health dashboard in five separate parts, and the systems, each read in words and lit in
// the room when chosen. It reads the room as it is (twin-data.js twinRead): main.js asks it to draw again whenever the room
// changes, so a change of mode shows here at once. It changes nothing: no choice, link, mode or device.
import { el } from "./panel.js";
import { HEALTH, STATES, TWIN_SYSTEMS, TWIN_TEXT } from "./twin-data.js";

const aria = (node, attrs) => { for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); return node; };

export class Twin {
  /** root: the panel. api (main.js): read() gives twinRead()'s result for the room now; light(systemId or null); say(text). */
  constructor(root, api) {
    this.root = root; this.api = api; this.system = null; this.last = null;
    root.querySelector("#twinIntro").textContent = TWIN_TEXT.intro;
    root.querySelector("#twinLimits").textContent = TWIN_TEXT.limits;
    this.health = root.querySelector("#twinHealth");
    this.detail = root.querySelector("#twinDetail");
    this.systems = root.querySelector("#twinSystems");
    this.systems.replaceChildren(...TWIN_SYSTEMS.map(s => {
      const b = el("button", { type: "button", textContent: s.label });
      b.dataset.system = s.id; b.setAttribute("aria-pressed", "false");
      return b;
    }));
    this.systems.addEventListener("click", e => { const b = e.target.closest("button[data-system]"); if (b) this.choose(b.dataset.system); });
  }

  /** Draw it all again from the room as it is now. */
  render() {
    const t = this.api.read();
    this.last = t;
    this.health.replaceChildren(...t.health.map(h => aria(el("section", { className: `twin-part twin-${h.state}${h.red ? " twin-red" : ""}` },
      el("h4", { id: `twin-h-${h.id}`, textContent: h.label }),
      el("p", { className: "twin-state", textContent: STATES[h.state] }),
      el("ul", {}, ...h.lines.map(x => el("li", { textContent: x })))), { "aria-labelledby": `twin-h-${h.id}` })));
    this.systems.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.system === this.system)));
    const s = this.system && t.systems[this.system];
    this.detail.hidden = !s;
    if (s) this.detail.replaceChildren(el("h4", { textContent: s.label }), el("ul", {}, ...s.lines.map(x => el("li", { textContent: x }))));
  }

  /** Choose a system: its state in words, and it lit in the room. Choosing it again lets it go. */
  choose(id, { toggle = true } = {}) {
    this.system = toggle && this.system === id ? null : id;
    this.render();
    this.api.light(this.system);
    const s = this.system && this.last.systems[this.system];
    this.api.say(s ? `${s.label}: ${s.lines[0]}` : "No system chosen.");
  }

  inspect() {
    return { system: this.system, health: this.last?.health.map(h => [h.id, h.state]) ?? [], parts: [...this.health.querySelectorAll("h4")].map(h => h.textContent), detail: this.detail.hidden ? null : this.detail.textContent };
  }
}

export { HEALTH };
