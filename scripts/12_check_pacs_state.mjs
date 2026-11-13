import assert from "node:assert/strict";
import { PacsSimulation, GUIDE, NIGHT_LINE } from "./site/configurator/pacs-state.js";
import { afterDark, sunTimes } from "./site/configurator/solar.js";
import { RoomModes, modeText } from "./site/configurator/modes.js";
import { STEPS, CAVEAT, ENDING, ENDING_GUARD_MS, HOLD_MS, RESUME_MIN_MS, holdLeft } from "./site/configurator/guide.js";
import { ATTACHMENTS } from "./site/configurator/apis-data.js";
import { HINT_TEXT } from "./site/configurator/hint.js";
import { readFileSync } from "node:fs";
import * as Q from "./site/configurator/quality.js";
import { cueFor, LEVELS, noticeFor, QUIET, SOUNDS } from "./site/configurator/vocal.js";
import { readdirSync } from "node:fs";
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
// ---------------------------------------------------------------- the look-around hint: one short line, in the visitor's own terms
assert.deepEqual(Object.keys(HINT_TEXT), ["mouse", "touch", "keys"], "the hint has a line for a mouse, for touch and for the keyboard");
for (const [how, line] of Object.entries(HINT_TEXT)) {
  assert.ok(line.split(/\s+/).length <= 9, `the ${how} hint is at most 9 words: ${line}`);
  assert.equal(line.split(". ").length, 2, `the ${how} hint says two things: how to look, and how to move closer`);
  assert.ok(!/orbit|zoom|pan\b|rotate|dolly|camera|3D/i.test(line), `the ${how} hint has no 3D-software words: ${line}`);
}
assert.ok(/^Drag/.test(HINT_TEXT.mouse) && /Scroll/.test(HINT_TEXT.mouse) && /^Drag/.test(HINT_TEXT.touch) && /Pinch/.test(HINT_TEXT.touch) && /^Arrow keys/.test(HINT_TEXT.keys), "each hint names the gestures that its kind of visitor has");
console.log(`PASS look-around hint: ${Object.keys(HINT_TEXT).length} lines of at most 9 words, for a mouse, touch and the keyboard, with no 3D-software words`);
// ---------------------------------------------------------------- the walkthrough's line over the model: the same rules as the hint above
const walkHint = new Function(`return ${/const HINT = (\{[\s\S]*?\n\});/.exec(readFileSync(new URL("./viewer_template.html", import.meta.url), "utf8"))[1]}`)();
assert.deepEqual(Object.keys(walkHint), ["touch", "mouse"], "the walkthrough's line has words for a finger and for a mouse");
for (const [how, lines] of Object.entries(walkHint)) {
  assert.deepEqual(Object.keys(lines), ["orbit", "first", "top", "placing"], `the ${how} lines cover the three views and placing the person`);
  for (const [view, line] of Object.entries(lines)) {
    assert.ok(line.split(/\s+/).length <= 9, `the walkthrough's ${how} line for ${view} is at most 9 words: ${line}`);
    assert.equal(line.split(". ").length, view === "placing" ? 1 : 2, `the ${how} line for ${view} says ${view === "placing" ? "one thing" : "two things: how to turn or walk, and one more"}`);
    assert.ok(!/orbit|zoom|pan\b|rotate|dolly|camera|3D|first person/i.test(line), `the ${how} line for ${view} has no 3D-software words: ${line}`);
    assert.ok(how === "touch" ? !/click|scroll|keys?\b/i.test(line) : !/tap|pinch|stick/i.test(line), `the ${how} line for ${view} names only what that visitor has: ${line}`);
  }
}
assert.ok(/stick/.test(walkHint.touch.first) && /Pinch/.test(walkHint.touch.orbit) && /^Tap/.test(walkHint.touch.placing) && /Scroll/.test(walkHint.mouse.orbit) && /^Click/.test(walkHint.mouse.placing), "each line names the gesture its visitor would use");
console.log(`PASS walkthrough hint: ${Object.values(walkHint).flatMap(Object.values).length} lines of at most 9 words, for a finger and a mouse, in each view and while placing, with no 3D-software words`);
// ---------------------------------------------------------------- the guided tour's wait: what Play gives a step that was paused
// held so far (ms) -> what it still waits (ms)
for (const [held, left] of [[0, HOLD_MS], [1, HOLD_MS - 1], [2000, 7000], [HOLD_MS - RESUME_MIN_MS, RESUME_MIN_MS], [8900, RESUME_MIN_MS], [HOLD_MS, RESUME_MIN_MS], [60000, RESUME_MIN_MS]]) {
  assert.equal(holdLeft(held), left, `a step held for ${held} ms still waits ${left} ms`);
}
for (let held = 0, last = Infinity; held <= 2 * HOLD_MS; held += 250) {
  const left = holdLeft(held);
  assert.ok(left > 0 && left <= HOLD_MS, `the wait after ${held} ms is within the bar: ${left}`);
  assert.ok(left <= last, `holding a step longer never makes it wait longer (${held} ms)`);
  last = left;
}
assert.ok(RESUME_MIN_MS > 0 && RESUME_MIN_MS < HOLD_MS, "the least wait after Play is shorter than a full step");
console.log(`PASS guided tour wait: a new step waits ${HOLD_MS / 1000} s, a paused one carries on from where it stopped, and Play always leaves at least ${RESUME_MIN_MS / 1000} s`);
// ---------------------------------------------------------------- the guided tour's ending: what Finish leaves on the card
assert.ok(words(ENDING.text) <= 24, `the tour's ending is as short as a step: ${words(ENDING.text)} words`);
assert.ok(/undone/.test(ENDING.text), "the ending says the tour's changes are undone, since Finish puts the room back");
assert.ok(/theme/.test(ENDING.text) && /time of day/.test(ENDING.text) && /room mode/.test(ENDING.text), "the ending names things to try that are on the screen: a theme, a time of day, a room mode");
assert.ok(!/simulated|approves every change/i.test(ENDING.text), "the ending repeats no caveat: it shows no demo");
for (const label of [ENDING.go, ENDING.again]) assert.ok(words(label) <= 3 && !/finish|exit|close/i.test(label), `the ending's button says what happens next, in at most three words: ${label}`);
assert.ok(ENDING_GUARD_MS >= 500 && ENDING_GUARD_MS <= 1000, "the ending's buttons wait out a double click on Finish, and no longer than a second");
// the patient's view faces the television, so its step turns the screen on; the theme's step stays where the step before stood
assert.ok(/a\.option\("tvplay", "orientation"\)/.test(String(STEPS[2].run)) && /screen shows the day and time/.test(STEPS[2].text), "the Patient view step turns on the screen it faces, and says what it shows");
assert.ok(/a\.camera\("overview"\)/.test(String(STEPS[7].run)) && !/family/.test(String(STEPS[7].run)), "the theme's step faces the window, from Overview");
console.log(`PASS guided tour ending: "${ENDING.title}" in ${words(ENDING.text)} words, two next steps, a ${ENDING_GUARD_MS} ms guard, and steps 3 and 8 show their subject`);
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
// what the M5 laptop measured on 10 November keeps High (High, 1440 x 900 @2x: Auto's own timing read 16 ms in the walkthrough
// and 12 ms in the configurator, whose two-draw timer read 21 ms), and so do REPORT.md's whole-frame figures for it (14 ms by
// default, 15 ms at the heaviest); its 13 ms on Low steps back up
for (const ms of [12, 14, 15, 16, 21]) assert.equal(Q.pickTier(ms, "high"), "high", `${ms} ms on High keeps High`);
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
// ---------------------------------------------------------------- clean air: one list of rows, on the plan page and on the comfort control's card
const icuSpec = JSON.parse(readFileSync(new URL("../spec/icu_spec.json", import.meta.url), "utf8"));
const clean = icuSpec.ventilation.clean_air.rows;
for (const copy of ["./site/configurator/options.json", "../configurator/options.json"]) {
  assert.deepEqual(JSON.parse(readFileSync(new URL(copy, import.meta.url), "utf8")).cleanAir.rows, clean, `${copy}: the comfort control card's clean-air rows are the spec's, which the plan page is built from`);
}
const htmlEsc = t => t.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#x27;");
const planPage = readFileSync(new URL("../ventilation/index.html", import.meta.url), "utf8");
for (const r of clean) {
  assert.ok(r.label && r.basis, `${r.id} has a label and a basis`);
  for (const k of ["isolation", "patient"]) assert.ok(words(r[k]) <= 20, `clean air "${r.label}" (${k}) has ${words(r[k])} words: ${r[k]}`);
  assert.ok(planPage.includes(`data-row="${r.id}"`) && planPage.includes(htmlEsc(r.isolation)) && planPage.includes(htmlEsc(r.patient)) && planPage.includes(htmlEsc(r.basis)), `the published plan page has the "${r.label}" row as the spec words it`);
}
const cleanRow = id => clean.find(r => r.id === id);
// what the layer is: two filter stages, a HEPA-filtered isolation exhaust, and UV-C as an extra that replaces nothing
assert.ok(/MERV 8\b/.test(cleanRow("supply_filters").isolation) && /MERV 14\b/.test(cleanRow("supply_filters").isolation));
assert.ok(/HEPA/.test(cleanRow("leaving_air").isolation) && /None is recirculated/.test(cleanRow("leaving_air").isolation) && !/HEPA/.test(cleanRow("leaving_air").patient));
assert.ok(/replaces neither the filter nor the air changes/.test(cleanRow("uvc_exhaust").isolation), "UV-C is an extra, never instead of the filter or the air changes");
// what it isn't: nothing is fogged, ionised or released into the room, and those words appear only in the row that rules them out
const proposed = clean.filter(r => r.id !== "not_proposed").map(r => `${r.label} ${r.isolation} ${r.patient}`).join(" ");
assert.ok(!/fogg|ozone|ionis|ioniz|photocatal|plasma|peroxide/i.test(proposed), "no row proposes fogging, ozone or ionisers");
assert.ok(/Fogging, ozone, ionisers/.test(cleanRow("not_proposed").isolation) && /CDC 2003/.test(cleanRow("not_proposed").basis));
// what wasn't read is marked assumed, and nothing quotes a HEPA efficiency or a lamp dose, which no source read here gives
assert.equal(cleanRow("not_designed").basis, "Assumed"); assert.ok(/assumed/i.test(cleanRow("leaving_air").basis));
assert.ok(!/99\.9|mJ|µW|mW\/|W\/m/.test(JSON.stringify(clean)), "no HEPA efficiency or UV dose is quoted");
console.log(`PASS clean air: ${clean.length} rows, the same on the plan page and the comfort control's card, at most 20 words a cell; filters and a HEPA exhaust with UV-C as an extra; no fogging, ozone or ionisers; the unread marked assumed`);
// ---------------------------------------------------------------- the vocal-distress cue: the rule, the notice's words, the limits, and no microphone
// The rule is a judgement (vocal.js cueFor), so this pins only what any version must keep: a call for help is never ignored,
// groans can only add urgency, there is a notice by the third, and nothing else raises one.
const urgency = level => ({ soon: 1, now: 2 })[level] ?? 0;
assert.ok(urgency(cueFor("call", 0)) > 0, "a call for help raises a notice at once");
let mostUrgent = 0;
for (let n = 1; n <= 6; n++) {
  const level = cueFor("groan", n) ?? null;
  assert.ok(level === null || Object.hasOwn(LEVELS, level), `cueFor("groan", ${n}) is "now", "soon" or null, not ${JSON.stringify(level)}`);
  assert.ok(urgency(level) >= mostUrgent, `${n} groans are never less urgent than ${n - 1}`);
  mostUrgent = urgency(level);
}
assert.ok(urgency(cueFor("groan", 3)) > 0, "by the third groan in a minute there is a notice");
for (const other of ["alarm", "talk", "", undefined]) assert.equal(urgency(cueFor(other, 3)), 0, `only a groan or a call for help raises a notice, not ${JSON.stringify(other)}`);
// the notice asks for a look through the glass and leaves going in to the nurse, whatever was heard
for (const sound of Object.keys(SOUNDS)) for (const level of Object.keys(LEVELS)) {
  const n = noticeFor(sound, level, "Isolation room W1", "3:32 pm");
  for (const line of Object.values(n)) assert.ok(words(line) <= 24, `the ${sound}/${level} notice has a ${words(line)}-word line: ${line}`);
  assert.ok(n.heard.startsWith("Isolation room W1: ") && n.heard.includes(SOUNDS[sound]), "it names the room and what was heard");
  assert.ok(/through the glass/.test(n.ask) && /You decide whether to go in\.$/.test(n.ask) && !/enter|go in now|must/i.test(n.ask.replace("You decide whether to go in.", "")), `it asks for a look, not an entry: ${n.ask}`);
  assert.ok(/No audio was captured or stored/.test(n.meta) && /no alarm or device was changed/.test(n.meta) && /3:32 pm/.test(n.meta));
}
assert.ok(/now\.$/.test(LEVELS.now.ask) && /when you can\.$/.test(LEVELS.soon.ask) && LEVELS.now.colour !== LEVELS.soon.colour && ![LEVELS.now.colour, LEVELS.soon.colour].includes(QUIET), "the two levels differ in words as well as colour");
// the sensor's card states the limits, and so does the option's note; its share-link codes are untouched
const cfgOptions = JSON.parse(readFileSync(new URL("./site/configurator/options.json", import.meta.url), "utf8"));
const limitText = cfgOptions.vocalCue.rows.map(r => r.text).join(" "), soundGroup = cfgOptions.sections.flatMap(sec => sec.groups).find(g => g.id === "soundSensor");
for (const text of [limitText, soundGroup.note.text]) {
  assert.ok(/[Vv]entilated or sedated patients may make no sound/.test(text) && /[Aa]larms/.test(text) && /classified on the device/.test(text) && /stored/.test(text) && /no microphone/i.test(text), `the four limits are stated: ${text}`);
}
for (const r of cfgOptions.vocalCue.rows) assert.ok(words(r.text) <= 20, `limit "${r.label}" has ${words(r.text)} words`);
assert.equal(soundGroup.code, 31); assert.deepEqual(soundGroup.options.map(o => [o.id, o.code]), [["on", 0], ["off", 1]]); assert.equal(soundGroup.default, "on");
// nothing on the site can listen: no audio or speech API is named in any page or module
const siteDir = new URL("./site/", import.meta.url), listening = /getUserMedia|mediaDevices|MediaRecorder|MediaStream|AudioContext|AudioWorklet|SpeechRecognition|<audio|new Audio\(/;
const sources = [...readdirSync(new URL("configurator/", siteDir)).filter(f => /\.(js|css)$/.test(f)).map(f => `configurator/${f}`), "configurator.template.html", "index.template.html", "ventilation.template.html"];
for (const f of sources) assert.ok(!listening.test(readFileSync(new URL(f, siteDir), "utf8")), `${f} names no audio or speech API`);
assert.ok(!listening.test(readFileSync(new URL("./viewer_template.html", import.meta.url), "utf8")), "nor does the walkthrough");
console.log(`PASS vocal-distress cue: a call always raises a notice, groans only add urgency (${[1, 2, 3].map(n => cueFor("groan", n) ?? "none").join(", ")}), the notice asks for a look and leaves going in to the nurse, four limits on the card and the option, codes unchanged, and no audio API in ${sources.length + 1} files`);
