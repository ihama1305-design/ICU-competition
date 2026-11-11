// The vocal-distress cue: what the room's sound sensor makes of a sound, and what it tells the nurse outside. A closed isolation
// door keeps the air in, and the patient's voice with it. The cue gives staff that hearing back without opening the door.
// SIMULATED: the "sounds" are the demo's two buttons. Nothing here listens, records or stores, and check 12 holds this file to that.

/** The sounds the demo can play, as the notice words them. */
export const SOUNDS = { call: "a call for help", groan: "groaning" };

/** How urgent a notice is: what it asks of the nurse, and the colour of the sensor's light. The words carry the meaning, not the colour. */
export const LEVELS = {
  now: { ask: "Look in through the glass now.", colour: "#e2574c" },
  soon: { ask: "Look in through the glass when you can.", colour: "#e6a342" },
};

/** The sensor's light with nothing to report. */
export const QUIET = "#55b985";

/**
 * Which simulated sound raises a notice for the nurse, and how urgent it is.
 * @param {"call"|"groan"} sound what the sensor "heard"
 * @param {number} groans how many groans it has heard in the last minute, counting this one (0 for a call)
 * @returns {"now"|"soon"|null} "now": look in now. "soon": look in when you can. null: no notice yet
 */
export function cueFor(sound, groans) {
  // The rule Hassan accepted on 10 November 2026: a call for help is never made to wait. One groan is worth a look when the nurse
  // can, since waiting for a second would miss a patient who only manages one; a third within a minute is worth a look now.
  // Check 12 holds any version to four things: a call for help always raises a notice, more groans never lower the
  // urgency, there is a notice by the third groan in a minute, and any other sound returns null.
  if (sound === "call") return "now";
  if (sound === "groan") return groans >= 3 ? "now" : "soon";
  return null;
}

/** The notice's lines. It asks for a look through the glass, never for an entry: the nurse decides. */
export function noticeFor(sound, level, room, time) {
  return {
    heard: `${room}: ${SOUNDS[sound]} was heard.`,
    ask: `${LEVELS[level].ask} You decide whether to go in.`,
    meta: `Heard at ${time}, room time. No audio was captured or stored, and no alarm or device was changed.`,
  };
}
