// The spec sheet: every choice, with the notes that go with them.
import { el, noteElement } from "./panel.js";

export function summaryContent(data, selected, room, { roomLabel, picture, code, theme }) {
  const box = el("div", { className: "summary" });
  box.append(el("img", { src: picture, alt: "The current view of the room" }));
  const list = () => el("dl", { className: "spec" });
  const row = (dl, k, v) => dl.append(el("dt", { textContent: k }), el("dd", { textContent: v }));
  const about = list();
  row(about, "Room", roomLabel);
  row(about, "Theme", theme || "Your own combination");
  box.append(about);
  const notes = [];
  for (const section of data.sections) {
    const spec = list();
    for (const g of section.groups) {
      const needs = g.requires;
      if (needs && !Object.entries(needs).every(([k, v]) => selected[k] === v)) continue;
      const option = g.options.find(o => o.id === selected[g.id]);
      row(spec, g.label, option ? option.label : `Custom colour ${selected[`${g.id}:custom`]}`);
      for (const n of [g.note, option?.note].flat()) {
        if (n?.clinical && (!n.rooms || n.rooms.includes(room))) notes.push(n);
      }
    }
    box.append(el("div", {}, el("h3", { textContent: section.label }), spec));
  }
  if (notes.length) {
    const list = el("div", { className: "notes" }, el("h3", { textContent: "Clinical notes" }));
    notes.forEach(n => list.append(noteElement(n)));
    box.append(list);
  }
  box.append(el("p", { className: "note" }, "Spec code: ", el("span", { className: "code", textContent: code })));
  box.append(el("p", { className: "note", textContent: "This is a proposal, not the room as built. Independent student work for the SSMC ICU Interior Design Student Competition. It isn't made or endorsed by Sheikh Shakhbout Medical City, and it isn't for clinical or construction use." }));
  return box;
}
