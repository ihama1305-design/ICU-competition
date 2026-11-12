// The look-around hint: one line over the room that says it can be moved, for someone who has never used a 3D view.
// It arrives once the room is drawn and leaves the first time the visitor looks around. The page's CSS keeps it out of the
// way while a tour, PACS or placing an item has the room, and brings it back afterwards if they still haven't looked
// (configurator.css, .look-hint).

/** What it says, by how the visitor is working. Each names the two things the room answers to: looking, and moving closer. */
export const HINT_TEXT = {
  mouse: "Drag to look around. Scroll to move closer.",
  touch: "Drag to look around. Pinch to move closer.",
  keys: "Arrow keys look around. Plus and minus move closer.",
};

// Remembered for this visit, in this tab. Someone going back and forth between the home page's pictures and the room isn't
// told twice, and a new tab starts fresh, so the next person at a shared laptop is told again. A browser that refuses
// storage, as private browsing can, simply doesn't remember.
const LOOKED = "icu-looked-around";
const lookMemory = {
  /** Has this visitor already shown they can look around? If so, the hint isn't offered. */
  seen: () => { try { return sessionStorage.getItem(LOOKED) === "1"; } catch { return false; } },
  /** Called once, the first time they drag, zoom or look around with the keys. */
  remember: () => { try { sessionStorage.setItem(LOOKED, "1"); } catch { /* not remembered */ } },
};

export class LookHint {
  /** `el` is the line over the room; `touch` is true where the main pointer is a finger. */
  constructor(el, touch) {
    this.el = el; this.touch = touch;
    this.done = lookMemory.seen();
  }

  say(how) { this.el.textContent = HINT_TEXT[how]; this.el.dataset.how = how; }

  /** The room is drawn: say how to look around, unless this visitor already knows. */
  offer() {
    if (this.done) return;
    this.say(this.touch ? "touch" : "mouse");
    this.el.hidden = false;
  }

  /** The room took the keyboard's focus: the same hint, in keys. */
  keys() { if (!this.done && !this.el.hidden) this.say("keys"); }

  /** They looked around, so the hint has done its job. */
  looked() {
    if (this.done) return;
    this.done = true;
    this.el.hidden = true;
    lookMemory.remember();
  }
}
