import assert from "node:assert/strict";
import { PacsSimulation, GUIDE, NIGHT_LINE } from "./site/configurator/pacs-state.js";
import { afterDark, sunTimes } from "./site/configurator/solar.js";
import { RoomModes, modeText } from "./site/configurator/modes.js";
import { STEPS, CAVEAT } from "./site/configurator/guide.js";
import { ATTACHMENTS } from "./site/configurator/apis-data.js";
import { readFileSync } from "node:fs";
import * as Q from "./site/configurator/quality.js";
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
assert.ok(GUIDE.filter(step => step[4]).every(step => /after sunset/i.test(step[4]) && /blinds stay/.test(step[4])));
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

// ---------------------------------------------------------------- plain English: one idea per step, about 20 words, and the safety meanings kept
const words = text => text.trim().split(/\s+/).length;
const steps = [...STEPS.map(s => ["tour", s.title, s.text]), ...GUIDE.flatMap(g => [["PACS", g[0], g[1]], ...(g[4] ? [["PACS after dark", g[0], g[4]]] : [])]), ...ATTACHMENTS.map(a => ["APIS", a.title, a.proposed])];
for (const [where, title, text] of steps) assert.ok(words(text) <= 24, `${where} "${title}" has ${words(text)} words: ${text}`);
const tourText = STEPS.map(s => s.text).join(" "), pacsText = GUIDE.map(g => g[1]).join(" ");
// the caveats every step used to repeat are one fixed line under the captions, on the tour's card and PACS's
assert.equal(CAVEAT, "Simulated demo. A nurse approves every change.");
for (const [where, title, text] of steps) assert.ok(!/simulated|approves every change/i.test(text), `${where} "${title}" repeats the fixed caveat: ${text}`);
assert.ok(/not a compliance check/.test(tourText), "the tour keeps 'not a compliance check' on Clinical view, its own subject");
assert.ok(/never touches medical equipment or alarms/.test(GUIDE[9][1]), "PACS keeps hands-off alarms on its clinical-safety step");
assert.ok(/doesn't diagnose/.test(pacsText) && /don't prove comfort/.test(GUIDE[3][1]) && /don't prove comfort/.test(GUIDE[3][4]), "PACS still says it doesn't diagnose and stable numbers don't prove comfort");
console.log(`PASS plain English: ${steps.length} tour, PACS and APIS steps at most 24 words, the caveats in one fixed line, 'not a compliance check' and hands-off alarms kept`);
// ---------------------------------------------------------------- graphics quality: the pixel budget, the starting tier and Auto's choice
const near = (a, b) => Math.abs(a - b) < 1e-9;
assert.ok(near(Q.pixelRatio(2, 1440, 900, "high"), Math.sqrt(3.6e6 / (1440 * 900))), "1440 x 900 @2x is capped to 3.6 million pixels");
assert.equal(Q.pixelRatio(2, 2560, 1440, "high"), 1); // a big laptop screen draws one pixel per CSS pixel, never fewer
assert.equal(Q.pixelRatio(3, 390, 844, "low"), 1.5); assert.equal(Q.pixelRatio(3, 390, 844, "high"), 2);
assert.equal(Q.pixelRatio(2, 800, 600, "high", 1.25), 1.25); // a stepped-down limit holds
assert.equal(Q.startTier("auto", null), "high"); assert.equal(Q.startTier("auto", "low"), "low"); assert.equal(Q.startTier("low", "high"), "low");
assert.equal(Q.startTier("auto", null, true), "low", "a phone or tablet never starts heavier than before: Low until measured");
assert.equal(Q.startTier("auto", "high", true), "high"); assert.equal(Q.startTier("high", null, true), "high"); // measured, or chosen
const inlineStart = new Function(`return ${/startTier: (\(choice[^\n]*\)),\n/.exec(readFileSync(new URL("./viewer_template.html", import.meta.url), "utf8"))[1]}`)();
for (const c of ["auto", "high", "low"]) for (const m of [null, "high", "low"]) for (const h of [false, true]) assert.equal(inlineStart(c, m, h), Q.startTier(c, m, h), "the walkthrough starts the same way");
for (const current of ["high", "low"]) {
  assert.equal(Q.pickTier(4, current), "high", `a device that draws a frame in 4 ms at ${current} gets High`);
  assert.equal(Q.pickTier(400, current), "low", `a device that takes 400 ms a frame at ${current} gets Low`);
  let seenLow = false; // slower never picks a higher tier
  for (let ms = 1; ms <= 600; ms += 0.5) { const t = Q.pickTier(ms, current); assert.ok(t === "high" || t === "low"); if (t === "low") seenLow = true; else assert.ok(!seenLow, `${current}: ${ms} ms went back to High`); }
}
// what the M5 laptop measured on 10 November (High, 1440 x 900 @2x: 16 ms walkthrough, 21 ms configurator) keeps High,
// and so do REPORT.md's figures for it (22 ms by default, 28 ms with the heaviest options); its 13 ms on Low steps back up
for (const ms of [16, 21, 22, 28]) assert.equal(Q.pickTier(ms, "high"), "high", `${ms} ms on High keeps High`);
assert.equal(Q.pickTier(13, "low"), "high");
// no flip-flopping between visits: on the M5, Low cost 0.38 to 0.73 of High. A device that steps up stays up next time, and
// one that drops stays down
for (const share of [0.38, 0.5, 0.64, 0.73]) for (let ms = 1; ms <= 600; ms += 0.5) {
  if (Q.pickTier(ms, "low") === "high") assert.equal(Q.pickTier(ms / share, "high"), "high", `${ms} ms on Low stepped up, so ${ms / share} ms on High must keep it`);
  if (Q.pickTier(ms, "high") === "low") assert.equal(Q.pickTier(ms * share, "low"), "low", `${ms} ms on High dropped, so ${ms * share} ms on Low must keep it`);
}
// a phone or tablet is stepped down, never up, so it never starts heavier than it did before Auto
for (let ms = 1; ms <= 600; ms += 0.5) assert.equal(Q.pickTier(ms, "low", true), "low", `a phone on Low at ${ms} ms stays Low`);
assert.equal(Q.pickTier(400, "high", true), "low"); assert.equal(Q.pickTier(16, "high", true), "high"); // chosen High, then Auto: only down
// the walkthrough's copy: same decisions and the same pixel budget
const tpl = readFileSync(new URL("./viewer_template.html", import.meta.url), "utf8"), mod = readFileSync(new URL("./site/configurator/quality.js", import.meta.url), "utf8");
const body = (text, re) => { const m = re.exec(text); assert.ok(m, `found ${re}`); return m[1].split("\n").filter(l => !/^\s*\/\//.test(l)).join("\n"); };
const inline = new Function("medianMs", "current", "isHandheld = false", body(tpl, /pickTier\(medianMs, current, isHandheld = false\) \{\n([\s\S]*?)\n    \},/));
assert.equal(body(tpl, /pickTier\(medianMs, current, isHandheld = false\) \{\n([\s\S]*?)\n    \},/).replace(/\s+/g, " ").trim(), body(mod, /export function pickTier\(medianMs, current, isHandheld = false\) \{\n([\s\S]*?)\n\}/).replace(/\s+/g, " ").trim(), "the walkthrough's pickTier is the same code as quality.js's");
for (const current of ["high", "low"]) for (const h of [false, true]) for (let ms = 1; ms <= 600; ms += 1.5) assert.equal(inline(ms, current, h), Q.pickTier(ms, current, h));
const budget = Number(/PIXEL_BUDGET = ([\d.e]+)/.exec(tpl)[1]);
assert.equal(budget, Q.PIXEL_BUDGET, "the same pixel budget");
const ratioInline = new Function("PIXEL_BUDGET", `return ${/pixelRatio: (\(dpr[^\n]*\)\)),\n/.exec(tpl)[1]}`)(budget);
for (const [dpr, w, h, t, lim] of [[2, 1440, 900, "high"], [2, 2560, 1440, "high"], [3, 390, 844, "low"], [2, 800, 600, "high", 1.25], [1, 1920, 1080, "high"]]) assert.equal(ratioInline(dpr, w, h, t, lim), Q.pixelRatio(dpr, w, h, t, lim));
console.log("PASS graphics quality: a 3.6 megapixel budget, Auto starts where it measured last, and its choice is monotonic, keeps a fast laptop on High, doesn't flip-flop, never steps a phone up and is the same in the walkthrough");
