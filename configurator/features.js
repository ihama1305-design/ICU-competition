// The feature registry (features.json) against the room on show: the objects each entry links to, the entry an object in
// the room belongs to, and the markers Explore features puts over them. Like Clinical view, it moves nothing.
import * as THREE from "three";

import { parseObject } from "./feature-links.js";

const shown = o => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };

export class Features {
  /**
   * data: features.json. env: stage, placement, choice(groupId) for what the room shows now,
   * and layer, the element Explore's markers go in; onPick(id) opens an entry's card from its marker.
   */
  constructor(data, env) {
    this.data = data; this.env = env;
    this.entries = data.features;
    this.byId = new Map(this.entries.map(f => [f.id, f]));
    this.links = new Map(this.entries.map(f => [f.id, f.objects.map(parseObject)]));
    this.on = false; this.filter = null; // Explore features, and the group it shows (null: all)
    this.markers = new Map(); // id -> { el, point }
  }

  get room() { return this.env.stage.current; }
  get(id) { return this.byId.get(id); }
  partsOf(id) { return this.entries.filter(f => f.parent === id); }
  groupLabel(id) { return this.data.groups.find(g => g.id === id)?.label ?? id; }
  /** What an entry says in this room: its `byRoom` lines over its own. */
  text(f, key) { return f.byRoom?.[this.room?.label]?.[key] ?? f[key]; }

  holds(link) { return Object.entries(link.when).every(([g, vs]) => vs.includes(this.env.choice(g))); }

  /** The objects one link stands for in the room on show, shown ones only. */
  resolve(link) {
    const room = this.room;
    if (!room || !this.holds(link)) return [];
    let out = [];
    if (link.kind === "addon") out = room.addons?.[link.arg] ? [room.addons[link.arg]] : [];
    else if (link.kind === "part") out = room.parts[link.arg] || [];
    else if (link.kind === "placed") out = this.env.placement.list(room.label).filter(p => p.type === link.arg && p.node).map(p => p.node);
    else if (link.kind === "node") out = room.root.getObjectsByProperty("name", link.arg);
    else if (link.kind === "switch") out = room.front?.plate ? [room.front.plate] : [];
    else if (link.kind === "lights") out = this.lights(room);
    return out.filter(shown);
  }

  /** The ceiling lights of the scheme in use: the panels from the model, or the cove, slots or downlights drawn for it. */
  lights(room) {
    const f = room.fixtures || {};
    return [...(room.parts.cfg_panels || []), ...(f.cove || []), ...(f.slot || []), ...(f.discs || [])];
  }

  /** Everything an entry stands for in the room now. A feature made of parts is all of its parts. */
  objects(id) {
    const own = this.links.get(id).flatMap(l => this.resolve(l));
    return [...own, ...this.partsOf(id).flatMap(p => this.objects(p.id))];
  }

  /** Whether an entry has anything in the room now. */
  present(id) { return this.objects(id).length > 0; }

  /** The keys an object answers to: for a link of each kind that could name it. */
  keysOf(node) {
    const room = this.room, keys = [];
    if (node.name?.startsWith("addon_")) keys.push(`addon:${node.name.slice(6)}`);
    if (node.name) keys.push(`node:${node.name}`);
    const placed = node.userData.itemInfo?.action?.startsWith("placed:") ? this.env.placement.find(Number(node.userData.itemInfo.action.slice(7))) : null;
    if (placed) keys.push(`placed:${placed.entry.type}`);
    if (room.front && [room.front.plate, room.front.body, room.front.led].includes(node)) keys.push("switch");
    if (this.lights(room).includes(node)) keys.push("lights");
    return keys;
  }

  /** The entry a clicked object belongs to, or null. The most specific wins: a part before the feature it's part of. */
  at(object) {
    const room = this.room;
    if (!room) return null;
    const match = key => {
      const hits = this.entries.filter(f => this.links.get(f.id).some(l => (l.arg ? `${l.kind}:${l.arg}` : l.kind) === key && this.holds(l)));
      return hits.find(f => f.parent) || hits[0] || null;
    };
    for (let n = object; n && n !== room.root; n = n.parent) {
      for (const key of this.keysOf(n)) { const f = match(key); if (f) return f; }
    }
    const top = this.env.stage.topName(object, room.root);
    return top ? match(`part:${top}`) : null;
  }

  /** Where an entry's marker hangs: over its first linked object, or under it if that's on the ceiling. */
  anchor(id) {
    const first = this.links.get(id).map(l => this.resolve(l)).find(list => list.length) || this.objects(id);
    if (!first.length) return null;
    const box = new THREE.Box3();
    first.forEach(o => box.expandByObject(o));
    if (box.isEmpty()) return null;
    const c = box.getCenter(new THREE.Vector3()), H = this.room.meta.ceiling;
    c.y = box.max.y > H - 0.3 ? box.min.y - 0.25 : Math.min(box.max.y + 0.08, H - 0.3);
    return c;
  }

  // ---------------------------------------------------------------- Explore features: a marker on everything registered

  /** The entries Explore shows now: those of its group (or all), with something in the room. */
  marked() { return this.entries.filter(f => (!this.filter || f.group === this.filter) && this.links.get(f.id).length && this.present(f.id)); }

  /** The groups with something to show in this room, for the filter. */
  groupsHere() { return this.data.groups.filter(g => this.entries.some(f => f.group === g.id && this.links.get(f.id).length && this.present(f.id))); }

  set(on, filter = this.filter) {
    this.on = on; this.filter = filter;
    this.env.layer.hidden = !on;
    this.refresh();
  }

  /** Build the markers for the room as it is: called when the room, its choices or its placed items change. */
  refresh() {
    const layer = this.env.layer;
    if (!this.on) { layer.replaceChildren(); this.markers.clear(); return; }
    const want = this.marked(), keep = new Set(want.map(f => f.id));
    for (const [id, m] of this.markers) if (!keep.has(id)) { m.el.remove(); this.markers.delete(id); }
    for (const f of want) {
      let m = this.markers.get(f.id);
      if (!m) {
        const el = document.createElement("button");
        el.type = "button"; el.tabIndex = -1; // the panel's Features list is the way in by keyboard
        el.className = "feature-marker"; el.dataset.feature = f.id; el.dataset.group = f.group;
        el.textContent = f.name;
        el.addEventListener("click", () => this.env.onPick(f.id, el));
        layer.append(el);
        m = { el, point: null };
        this.markers.set(f.id, m);
      }
      m.point = this.anchor(f.id);
    }
  }

  /** After each draw: put each marker over its object, and hide any that's behind the camera or off the free part of the screen. */
  update(camera, visibleWidth) {
    if (!this.on) return;
    const v = new THREE.Vector3(), w = innerWidth, h = innerHeight, placed = [];
    // nearest the top of the screen first; one that would cover a mark already placed moves up above it
    const order = [...this.markers.values()].map(m => {
      if (!m.point) return { m, off: true };
      v.copy(m.point).project(camera);
      const x = ((v.x + 1) / 2) * w, y = ((1 - v.y) / 2) * h;
      return { m, x, y, off: v.z > 1 || x < 8 || x > visibleWidth - 8 || y < 8 || y > h - 8 };
    }).sort((a, b) => (a.y ?? 0) - (b.y ?? 0));
    for (const o of order) {
      o.m.el.hidden = o.off;
      if (o.off) continue;
      o.m.w ||= o.m.el.offsetWidth; o.m.h ||= o.m.el.offsetHeight;
      const box = () => ({ l: o.x - o.m.w / 2, r: o.x + o.m.w / 2, t: o.y - 8 - o.m.h, b: o.y - 8 });
      let lift = 0, b = box();
      for (let tries = 0; tries < 6; tries++) {
        const hit = placed.find(p => b.l < p.r && b.r > p.l && b.t - lift < p.b && b.b - lift > p.t);
        if (!hit) break;
        lift = b.b - hit.t + 4;
      }
      o.m.el.style.setProperty("--lead", `${8 + lift}px`);
      o.m.el.style.transform = `translate(${Math.round(o.x)}px, ${Math.round(o.y - lift)}px) translate(-50%, calc(-100% - 8px))`;
      placed.push({ l: b.l, r: b.r, t: b.t - lift, b: b.b - lift });
    }
  }

  /** For the check: the markers on show, as { id, x, y } at their middles, where a click lands. */
  showing() {
    return [...this.markers].filter(([, m]) => !m.el.hidden).map(([id, m]) => { const r = m.el.getBoundingClientRect(); return { id, x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  }
}
