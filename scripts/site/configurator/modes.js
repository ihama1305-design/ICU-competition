// Room modes: scenes laid over the room as it's configured. A mode never changes a choice, the share link or the summary,
// and leaving it puts back exactly what was there. No mode touches the monitor, a medical device or an alarm.

export const MODES = {
  standard: {
    label: "Standard",
    note: "",
    say: "Standard: the room as configured.",
  },
  comfort: {
    label: "Comfort",
    light: { kelvin: 2700, level: 0.35 },
    blinds: 1,
    note: "Comfort: the room lights warm and dim, and the blinds lower. The task light, the monitor and clinical alarms are unaffected.",
    say: "Comfort mode. The room lights warm and dim, and the blinds lower. Clinical alarms are unaffected.",
  },
  privacy: {
    label: "Privacy",
    blinds: 0.5,
    privateFront: true,
    note: "Privacy: smart glass on the glazed front turns opaque (a curtain or blinds front is already closed) and the window blinds lower halfway. Staff can end it at any moment, and Emergency-ready clears the glass.",
    say: "Privacy mode. The glazed front turns opaque and the blinds lower halfway. Staff can end it at any moment.",
  },
  clinical: {
    label: "Clinical",
    light: { kelvin: 4000, level: 1 },
    task: true,
    overlay: true,
    note: "Clinical: full, neutral room light, the examination task light on, and Clinical view's labels and keep-clear areas.",
    say: "Clinical mode. Full, neutral light and the examination task light on.",
  },
  emergency: {
    label: "Emergency-ready",
    light: { kelvin: 4000, level: 1 },
    task: true,
    screensOff: true,
    glassClear: true,
    overlay: true,
    note: "Emergency-ready, started by staff: room lights full, task light on, the TV and aquarium screen off, the glazed front clear. The monitor keeps running, and clinical alarms and medical devices are not changed.",
    say: "Emergency-ready. Lights full, task light on, screens off, the glass clear. Clinical alarms and medical devices are not changed.",
  },
};

const MODE_MS = 1800;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const mix = (a, b, k) => a + (b - a) * k;

/**
 * Runs the modes against the room through `api`, which main.js provides:
 * baseLight() and the room's light as configured, as { kelvin, level }; setLight(look, task) lays a look over it (null for none);
 * blindsNow(), configuredBlinds() and setBlinds(level); restore(groupIds) re-applies the configured choices;
 * screens(on), glassClear(), glassPrivate(), overlay(on) for Clinical view; beforeChange() closes anything that holds its own scene, like PACS; changed(name) updates the page.
 */
export class RoomModes {
  constructor(api) {
    this.api = api;
    this.current = "standard";
    this.before = "standard"; // where leaving Emergency-ready goes back to
    this.look = null; // the light look laid over the room now, if any
    this.tween = null;
  }

  get easing() { return !!this.tween; }

  set(name, { instant = false } = {}) {
    const to = MODES[name];
    if (!to) return;
    const api = this.api;
    api.beforeChange();
    if (name === "emergency" && this.current !== "emergency") this.before = this.current;
    this.current = name;
    // put back what the last mode changed, then lay this one on top. The light and blinds ease; switches don't
    api.restore(["front", "switch", "tvplay"]);
    api.screens(true);
    if (to.screensOff) api.screens(false);
    if (to.glassClear) api.glassClear();
    if (to.privateFront) api.glassPrivate();
    api.overlay(!!to.overlay); // Clinical view's labels and keep-clear areas
    const fromLight = this.look || api.baseLight(), toLight = to.light || api.baseLight();
    const fromBlinds = api.blindsNow(), toBlinds = to.blinds ?? api.configuredBlinds();
    this.tween = { start: performance.now(), fromLight, toLight, fromBlinds, toBlinds, task: !!to.task, keep: !!to.light, ownBlinds: to.blinds !== undefined };
    if (instant || reduced()) this.finish();
    else this.step(0);
    api.changed(name);
  }

  /** Back to Standard at once: something else is about to change the room. */
  leave() {
    if (this.current === "standard" && !this.tween) return false;
    this.set("standard", { instant: true });
    return true;
  }

  /** Out of Emergency-ready, to the mode before it. */
  exitEmergency() { this.set(this.current === "emergency" ? this.before : this.current); }

  step(k) {
    const tw = this.tween;
    this.look = { kelvin: mix(tw.fromLight.kelvin, tw.toLight.kelvin, k), level: mix(tw.fromLight.level, tw.toLight.level, k) };
    this.api.setLight(this.look, tw.task);
    if (tw.fromBlinds !== tw.toBlinds) this.api.setBlinds(mix(tw.fromBlinds, tw.toBlinds, k));
  }

  finish() {
    const tw = this.tween;
    this.tween = null;
    this.look = tw.keep ? { ...tw.toLight } : null;
    this.api.setLight(this.look, tw.task);
    // a mode's own blinds level stays; otherwise the configured choice comes back as it was, blackout and all
    if (tw.ownBlinds) this.api.setBlinds(tw.toBlinds);
    else this.api.restore(["blinds"]);
  }

  /** Returns true while a mode is easing in or out. */
  update(now) {
    const tw = this.tween;
    if (!tw) return false;
    // now is when this frame began, which can be earlier than the click that set start
    const t = Math.max(0, Math.min(1, (now - tw.start) / MODE_MS));
    this.step(ease(t));
    if (t >= 1) this.finish();
    return true;
  }
}
