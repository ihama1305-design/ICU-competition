// The option groups, built from options.json. Nothing here knows what any option does.

export const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  kids.forEach(k => n.append(k));
  return n;
};

export function noteElement(note) {
  const p = el("p", { className: "clinical" }, note.text);
  if (note.sources?.length) {
    const s = el("span", { className: "sources" }, "Sources: ");
    note.sources.forEach((src, i) => {
      s.append(el("a", { href: src.url, target: "_blank", rel: "noopener", textContent: src.label }));
      if (i < note.sources.length - 1) s.append("; ");
    });
    p.append(" ", s);
  }
  return p;
}

export class Panel {
  /** onSet(groupId, optionId, customValue) is called when someone chooses something. */
  constructor(root, data, onSet) {
    this.groups = new Map();
    data.sections.forEach((section, index) => {
      const summary = el("summary", {},
        el("span", { className: "section-mark", textContent: String(index + 1).padStart(2, "0"), ariaHidden: "true" }),
        el("span", { className: "section-title", textContent: section.label }));
      const details = el("details", { className: "section", name: "options" }, summary);
      for (const group of section.groups) details.append(this.buildGroup(group, onSet));
      root.append(details);
    });
    // `name` makes these exclusive in current browsers; this click handler keeps the same behavior elsewhere.
    root.addEventListener("click", e => {
      const current = e.target.closest("details.section > summary")?.parentElement;
      if (!current) return;
      requestAnimationFrame(() => {
        if (current.open) root.querySelectorAll("details.section[open]").forEach(other => { if (other !== current) other.open = false; });
      });
    });
  }

  buildGroup(group, onSet) {
    const labelId = `g-${group.id}`;
    const current = el("span", { className: "current" });
    const head = el("h3", { id: labelId }, group.label, " ", current);
    const list = el("div", { className: group.control === "swatches" ? "swatches" : "grid", role: "group" });
    list.setAttribute("aria-labelledby", labelId);
    const buttons = new Map();
    for (const o of group.options) {
      const b = el("button", { type: "button" });
      if (group.control === "swatches") {
        b.className = "swatch";
        b.style.setProperty("--swatch", o.swatch);
        b.setAttribute("aria-label", o.label);
        b.title = o.label;
      } else {
        b.textContent = o.label;
      }
      b.addEventListener("click", () => onSet(group.id, o.id));
      buttons.set(o.id, b);
      list.append(b);
    }
    let picker = null;
    const body = el("div", { className: "group" }, head, list);
    if (group.custom) {
      picker = el("input", { type: "color", value: "#ecd9c6", id: `pick-${group.id}` });
      const lab = el("label", { className: "custom", htmlFor: picker.id }, picker, "Custom colour");
      picker.addEventListener("input", () => onSet(group.id, "custom", picker.value));
      body.append(lab);
    }
    const notes = el("div", { className: "notes" });
    body.append(notes);
    this.groups.set(group.id, { group, body, buttons, current, notes, picker });
    return body;
  }

  /** Show what's selected, which groups apply, and the notes that go with them. */
  sync(selected, room) {
    const context = { ...selected, room };
    for (const [id, g] of this.groups) {
      const needs = g.group.requires;
      g.body.hidden = !!needs && !Object.entries(needs).every(([k, v]) => context[k] === v);
      const value = selected[id];
      g.buttons.forEach((b, oid) => b.setAttribute("aria-pressed", String(oid === value)));
      const option = g.group.options.find(o => o.id === value);
      g.current.textContent = g.group.control === "swatches" ? (option ? option.label : "Custom") : "";
      if (g.picker && !option) g.picker.value = selected[`${id}:custom`] || g.picker.value;
      const notes = [g.group.note, option?.note].flat().filter(note => note && (!note.rooms || note.rooms.includes(room)));
      if (notes.some((n, i) => n !== g.shown?.[i]) || notes.length !== (g.shown?.length || 0)) { // left alone if unchanged, so a focused link keeps its focus
        g.notes.replaceChildren(...notes.map(noteElement));
        g.shown = notes;
      }
    }
  }
}
