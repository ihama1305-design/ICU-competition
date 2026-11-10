// Deterministic teaching scenarios. No device input, clinical thresholds or diagnostic inference.
export const SCENARIOS = {
  stable: { label: "1. STABLE PATIENT", from: [78, 118, 76, 16, 98], to: [78, 118, 76, 16, 98], duration: 0, warning: false },
  possible: { label: "2. POSSIBLE DISCOMFORT", from: [78, 118, 76, 16, 98], to: [105, 132, 84, 19, 97], duration: 12, warning: false },
  deterioration: { label: "3. CLINICAL DETERIORATION", from: [105, 132, 84, 19, 97], to: [128, 100, 64, 30, 88], duration: 7, warning: true },
};
export const WORKFLOW = ["Patient monitor", "Physiological trend", "Clinical safety check", "Patient preferences", "Comfort recommendation", "Nurse approval", "Environmental adjustment", "Patient feedback"];
export const SOURCES = [
  { title: "SCCM PADIS: assessment and sleep-supportive practices", url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/guidelines-for-the-prevention-and-management-of-pa", note: "Physiological readings can prompt further assessment; they do not establish pain. Light/noise reduction and multicomponent sleep practices have conditional recommendations with limited evidence. This does not validate PACS." },
  { title: "NICE CG103: person-centered care and sleep hygiene", url: "https://www.nice.org.uk/guidance/cg103/chapter/Recommendations", note: "Supports individualized assessment and reducing avoidable disturbance during sleep. Preferences do not replace clinical assessment." },
  { title: "CDC: environmental air controls", url: "https://www.cdc.gov/infection-control/hcp/environmental-control/air.html", note: "Ventilation, humidity, temperature and pressure requirements are facility- and area-specific. No hospital-approved PACS temperature limits were supplied; temperature remains review-only." },
];
export const GUIDE = [
  ["Meet the patient monitor", "The highlighted object is the existing bedside monitor, with clearly labeled simulated readings.", "stable", "monitor"],
  ["Monitoring already matters", "Conventional ICUs monitor physiology and provide environmental controls. This proposal explores their integration.", "stable", "monitor"],
  ["Connect the environment", "Physiological Adaptive Mode links the monitor, patient preferences and environmental controls through clinical oversight.", "stable", "overview"],
  ["Maintain a preferred environment", "Stable simulated readings accompany the recorded lighting, blinds and quiet preferences. Stable readings do not prove comfort.", "stable", "overview", "Stable simulated readings accompany the recorded lighting and quiet preferences. After sunset the blinds stay as they are. Stable readings do not prove comfort."],
  ["Notice a trend", "Heart rate rises from 78 toward 105 bpm over this scripted event. Multiple medical explanations remain possible; discomfort is not diagnosed.", "possible", "monitor"],
  ["Assess before recommending", "This demonstration is scripted without warning conditions. A simulated clinical review precedes selected comfort recommendations.", "possible", "overview"],
  ["Show nurse oversight", "The presentation now role-plays a nurse approving lighting, blinds and nonessential-audio changes. Manual mode requires an explicit approval click.", "possible", "overview"],
  ["See the room respond", "The existing lights and blinds move to the selected preferences. Reassess with the patient; physiology is not proof of benefit.", "possible", "window", "The existing lights move to the selected preferences. After sunset the blinds stay as they are. Reassess with the patient; physiology is not proof of benefit."],
  ["Clinical deterioration", "An independently scripted clinical alert is now active. The simulated team is notified, and pending comfort changes are cancelled.", "deterioration", "monitor"],
  ["Clinical safety takes priority", "Acknowledgment records that this simulated alert was seen. It stays active; equipment settings and medical alarms are never controlled by PACS.", "deterioration", "overview"],
  ["The proposed integration", "Our Adaptive ICU goes beyond monitoring the patient. It explores how physiological information and patient preferences can help the surrounding environment respond to individual comfort needs.", "deterioration", "overview"],
];
// Between sunset and sunrise there's no daylight or glare for the blinds to manage, so PACS adjusts only the lighting.
export const NIGHT_LINE = "After sunset: the blinds stay as they are, because there's no daylight to block. Only the lighting is adjusted.";
export const LIGHT_LEVELS = { bright: 1, moderate: 0.65, dim: 0.35 };
export const BLIND_LEVELS = { open: 0, partial: 0.5, closed: 1 };
export class PacsSimulation {
  constructor(baseline = {}, { dark = false } = {}) {
    this.baseline = { light: 1, kelvin: 4000, blinds: 0, audio: 0.35, temperature: 23, ...baseline };
    this.dark = !!dark; // after sunset at the room's solar hour: the blinds are left as they are
    this.preferences = { lighting: "moderate", color: "warm", audio: "quiet", blinds: "partial", tempMin: 22, tempMax: 24 };
    this.log = []; this.setScenario("stable");
  }
  record(message) { this.log.push(message); this.log = this.log.slice(-16); }
  preferred() {
    const p = this.preferences;
    return { ...this.baseline, light: LIGHT_LEVELS[p.lighting], kelvin: p.color === "warm" ? 3000 : 4000, blinds: this.dark ? this.baseline.blinds : BLIND_LEVELS[p.blinds], audio: p.audio === "quiet" ? 0 : 0.15 };
  }
  setScenario(id) {
    if (!SCENARIOS[id]) throw new Error("Unknown PACS scenario");
    this.scenario = id; this.seconds = 0; this.warning = SCENARIOS[id].warning;
    this.acknowledged = false; this.reviewed = false; this.approval = "none"; this.feedback = null;
    this.selection = { lighting: true, blinds: !this.dark, audio: false, temperature: false };
    this.environment = id === "stable" ? this.preferred() : { ...this.baseline };
    this.before = { ...this.environment };
    this.record(`New simulated case: ${SCENARIOS[id].label}.`);
    if (this.dark) this.record("After sunset: blinds left as they are; only lighting can be adjusted.");
    if (this.warning) this.raiseWarning();
  }
  readings(seconds = this.seconds) {
    const s = SCENARIOS[this.scenario], k = s.duration ? Math.min(1, Math.max(0, seconds / s.duration)) : 1;
    const [hr, sys, dia, rr, spo2] = s.from.map((v, i) => Math.round(v + (s.to[i] - v) * k));
    return { hr, sys, dia, rr, spo2, hrv: null };
  }
  raiseWarning() {
    this.warning = true; this.reviewed = false; this.approval = "suspended";
    this.record("Scripted existing clinical alert active. Simulated clinical team notified in this page only.");
  }
  acknowledge() { if (this.warning) { this.acknowledged = true; this.record("Simulated alert acknowledged; alert remains active. No alarm was silenced."); } }
  review(on) {
    this.reviewed = !!on && !this.warning;
    if (!this.reviewed && !this.warning) { this.approval = "none"; this.feedback = null; }
  }
  recommend() {
    if (this.warning || !this.reviewed) return false;
    this.approval = "pending"; this.feedback = null; this.record("Selected environmental changes recommended; awaiting nurse approval."); return true;
  }
  approve() {
    if (this.warning || !this.reviewed || this.approval !== "pending" || !Object.values(this.selection).some(Boolean)) return null;
    const target = { ...this.environment }, pref = this.preferred();
    if (this.selection.lighting) { target.light = pref.light; target.kelvin = pref.kelvin; }
    if (this.selection.blinds && !this.dark) target.blinds = pref.blinds;
    if (this.selection.audio) target.audio = pref.audio;
    // Temperature is a review request only: no approved site envelope or HVAC integration exists.
    this.environment = target; this.approval = "approved";
    this.record("Simulated nurse approved selected changes. Temperature remains review-only; alarms and treatment are unchanged.");
    return { ...target };
  }
  reject() { if (!this.warning) { this.approval = "rejected"; this.record("Nurse rejected the proposal. No environmental adjustment applied."); } }
  setPreferences(input) {
    if (!Object.hasOwn(LIGHT_LEVELS, input.lighting) || !["warm", "neutral"].includes(input.color) || !["quiet", "calming", "selected"].includes(input.audio) || !Object.hasOwn(BLIND_LEVELS, input.blinds)) return false;
    const min = Number(input.tempMin), max = Number(input.tempMax);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min < 18 || max > 28 || min > max) return false;
    this.preferences = { ...input, tempMin: min, tempMax: max };
    // Changing the proposal invalidates consent; cannot reuse an earlier nurse approval.
    if (!this.warning) this.approval = "none";
    this.feedback = null; this.record("Comfort preferences updated. A new adjustment requires a new clinical review and approval.");
    this.reviewed = false; return true;
  }
  setFeedback(value) {
    if (this.approval !== "approved" || this.warning || !["improved", "unchanged", "unable"].includes(value)) return false;
    this.feedback = value; this.record({ improved: "Patient reports improvement (scripted feedback).", unchanged: "No improvement reported; further comfort and clinical assessment requested.", unable: "Patient unable to respond; clinical assessment required. No comfort inference made." }[value]); return true;
  }
}
