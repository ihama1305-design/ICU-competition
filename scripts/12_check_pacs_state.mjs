import assert from "node:assert/strict";
import { PacsSimulation, GUIDE, NIGHT_LINE } from "./site/configurator/pacs-state.js";
import { afterDark, sunTimes } from "./site/configurator/solar.js";
import { RoomModes, modeText } from "./site/configurator/modes.js";
const s = new PacsSimulation();
assert.deepEqual(s.readings(), { hr: 78, sys: 118, dia: 76, rr: 16, spo2: 98, hrv: null });
s.setScenario("possible"); assert.equal(s.readings(6).hr, 92); assert.equal(s.readings(12).hr, 105);
assert.equal(s.recommend(), false); assert.equal(s.approve(), null);
s.review(true); assert.equal(s.recommend(), true);
const before = { ...s.environment }; s.reject(); assert.deepEqual(s.environment, before); assert.equal(s.approve(), null);
s.recommend(); s.selection = { lighting: false, blinds: true, audio: false, temperature: true };
const result = s.approve(); assert.equal(result.light, before.light); assert.equal(result.blinds, 0.5); assert.equal(result.temperature, 23);
assert.equal(s.setFeedback("unable"), true); assert.equal(s.readings(12).hr, 105);
s.review(false); assert.equal(s.approval, "none"); assert.equal(s.feedback, null); assert.equal(s.approve(), null);
s.review(true); s.recommend(); s.raiseWarning(); assert.equal(s.approve(), null); assert.equal(s.recommend(), false);
s.acknowledge(); assert.equal(s.warning, true); assert.equal(s.approval, "suspended");
s.setScenario("possible"); s.review(true); s.recommend();
assert.equal(s.setPreferences({ ...s.preferences, tempMin: 25, tempMax: 20 }), false);
assert.equal(s.setPreferences({ ...s.preferences, lighting: "dim" }), true); assert.equal(s.approve(), null); assert.equal(s.reviewed, false);
s.setScenario("deterioration"); assert.equal(s.warning, true); assert.equal(s.readings(0).spo2, 97); // alert is scripted, not a saturation threshold
assert.equal(s.setFeedback("improved"), false);
s.setScenario("stable"); assert.equal(s.warning, false); assert.equal(s.approval, "none");
assert.equal(GUIDE.length * 7, 77);
console.log("PASS PACS scenarios/readings, selected-only approval, reject, stale approval invalidation, warning priority, persistent acknowledgment, feedback independence, temperature review-only and 77-second guide definition");

// ---------------------------------------------------------------- night-aware comfort: after sunset only the lighting changes
const SITE = { latitude_deg: 24.45, declination_deg: -2.5, north_offset_deg: 0 }; // as main.js and the spec
const { sunrise, sunset } = sunTimes(SITE);
assert.ok(Math.abs(sunrise - 6.02) < 0.02 && Math.abs(sunset - 17.98) < 0.02, `sunrise ${sunrise} and sunset ${sunset} at the modelled date`);
for (const [hour, dark] of [[6, true], [6.1, false], [8.5, false], [12, false], [15.53, false], [17.75, false], [17.95, false], [18.0, true], [18.4, true], [21, true], [22, true]]) {
  assert.equal(afterDark(hour, SITE), dark, `afterDark(${hour})`);
}
// PACS by day still offers the blinds; after dark it leaves them where the room had them, whatever is selected
const day = new PacsSimulation({ blinds: 0.2 });
assert.equal(day.dark, false); assert.equal(day.selection.blinds, true); assert.equal(day.environment.blinds, 0.5); // stable case: the recorded preference
const night = new PacsSimulation({ blinds: 0.2 }, { dark: true });
assert.equal(night.selection.blinds, false); assert.equal(night.environment.blinds, 0.2); assert.equal(night.preferred().blinds, 0.2);
assert.equal(night.environment.light, 0.65); // lighting still follows the recorded preference
night.setScenario("possible"); night.review(true); night.recommend();
night.selection = { lighting: true, blinds: true, audio: false, temperature: false }; // even if blinds were ticked somehow
const nightResult = night.approve();
assert.equal(nightResult.blinds, 0.2); assert.equal(nightResult.light, 0.65); assert.equal(nightResult.kelvin, 3000);
assert.ok(night.log.some(line => /After sunset/.test(line)) && /no daylight/.test(NIGHT_LINE));
assert.ok(GUIDE.filter(step => step[4]).every(step => /After sunset/.test(step[4]) && !/blinds move/.test(step[4])));
// Comfort mode: by day the blinds lower; after dark they're left as configured and the note says why
const fakeRoom = dark => {
  const log = { blinds: [], restored: [], light: null };
  const api = {
    isDark: () => dark.value, baseLight: () => ({ kelvin: 4000, level: 1 }), setLight: look => { log.light = look; },
    blindsNow: () => 0.3, configuredBlinds: () => 0.3, setBlinds: level => log.blinds.push(level), restore: ids => log.restored.push(...ids),
    screens: () => {}, glassClear: () => {}, glassPrivate: () => {}, overlay: () => {}, beforeChange: () => {}, changed: () => {},
  };
  return { api, log };
};
const clock = { value: false }, byDay = fakeRoom(clock), modes = new RoomModes(byDay.api);
modes.set("comfort", { instant: true });
assert.deepEqual(byDay.log.blinds, [1]); assert.deepEqual(byDay.log.light, { kelvin: 2700, level: 0.35 }); assert.equal(modes.dark, false);
assert.equal(modeText("comfort", false).why, "");
clock.value = true; byDay.log.blinds.length = 0; byDay.log.restored.length = 0;
assert.equal(modes.timeChanged(), true); // crossing sunset sets Comfort again
assert.deepEqual(byDay.log.blinds, []); assert.ok(byDay.log.restored.includes("blinds")); assert.deepEqual(byDay.log.light, { kelvin: 2700, level: 0.35 });
assert.equal(modes.dark, true); assert.equal(modes.timeChanged(), false); // and only when it's crossed
const nightText = modeText("comfort", true);
assert.ok(/after sunset/i.test(nightText.why) && /blinds stay/.test(nightText.why) && !/blinds lower/.test(nightText.note) && /alarms are unaffected/.test(nightText.note));
modes.set("privacy", { instant: true }); assert.deepEqual(byDay.log.blinds, [0.5]); // Privacy's blinds are for privacy, so they still lower after dark
assert.equal(modeText("privacy", true).why, "");
console.log("PASS night-aware comfort: sunrise/sunset from the solar hour, PACS and Comfort leave the blinds alone after dark and say why, Privacy unchanged");
