import * as THREE from "three";
import { PacsSimulation, SCENARIOS, WORKFLOW, SOURCES, GUIDE, NIGHT_LINE } from "./pacs-state.js";
import { PacsRoom } from "./pacs-scene.js";
import { CAVEAT } from "./guide.js";
const $ = id => document.getElementById(id);
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const copy = value => ({ ...value });
const setText = (id, value) => { if ($(id).textContent !== value) $(id).textContent = value; };
export class PACS {
  constructor({ stage, lighting, rig, controls, relight, invalidate, stopTour, getState, isDark = () => false, closeApis, restoreApisMarkers }) {
    Object.assign(this, { stage, rig, controls, invalidate, stopTour, getState, isDark, closeApis, restoreApisMarkers });
    this.visual = new PacsRoom(stage, lighting, relight, invalidate, () => getState().hour); this.active = false; this.guide = null; this.mount();
  }
  mount() {
    const entry = document.createElement("section"); entry.className = "pacs-entry";
    entry.innerHTML = `<p class="pacs-kicker">Adaptive ICU · monitoring + environment</p><h2>Physiological Adaptive Comfort System</h2><button type="button" id="openPacs" class="pacs-primary">PHYSIOLOGICAL ADAPTIVE MODE</button><button type="button" id="startPacsGuide">START PHYSIOLOGICAL ADAPTIVE DEMO</button><p class="note">Three simulated scenarios in this room. Patient preferences and clinical oversight come first.</p>`;
    ($("demos") || $("panelBody")).prepend(entry); // its place in the panel is the template's #demos
    const panel = document.createElement("aside"); panel.id = "pacsPanel"; panel.hidden = true; panel.setAttribute("aria-labelledby", "pacsTitle");
    panel.innerHTML = `<header><p class="pacs-kicker">Nurse dashboard · PACS · simulated data only</p><h2 id="pacsTitle">Physiological Adaptive Mode</h2><button type="button" id="pacsExit">EXIT ADAPTIVE MODE</button></header>
      <div class="pacs-scroll"><p class="pacs-scope">Experimental comfort-support concept. Vital signs alone cannot diagnose pain, anxiety, stress or discomfort.</p>
      <div id="pacsScenarios" role="group" aria-label="Simulation scenario">${Object.entries(SCENARIOS).map(([id, s]) => `<button type="button" data-scenario="${id}" aria-pressed="false">${s.label}</button>`).join("")}</div>
      <p class="pacs-small">Scenario buttons load a new scripted case and its starting environment. They are not automated physiological triggers; recommendations within a case require approval.</p>
      <div id="pacsAlert" role="alert" hidden><strong>Potential clinical deterioration detected.</strong><p>Clinical assessment takes priority over environmental comfort adjustments.</p><p>Scripted existing clinical alert: ACTIVE. Simulated clinical team notified in this page only.</p><button type="button" id="pacsAcknowledge">ACKNOWLEDGE SIMULATED ALERT</button><p id="pacsAckStatus">Acknowledgment never silences or dismisses a medical alarm.</p></div>
      <section class="pacs-monitor" aria-labelledby="pacsMonitorTitle"><h3 id="pacsMonitorTitle">Patient monitor <span>SIMULATED</span></h3><div class="pacs-vitals"><div>HR <strong id="pacsHr">78</strong><small>bpm</small></div><div>BP <strong id="pacsBp">118/76</strong><small>mmHg</small></div><div>RR <strong id="pacsRr">16</strong><small>breaths/min</small></div><div>SpO₂ <strong id="pacsSpo2">98</strong><small>%</small></div></div><svg id="pacsTrend" viewBox="0 0 320 74" role="img" aria-label="Scripted heart-rate trend, not an ECG waveform"></svg><p class="pacs-small">Illustrative values, not universal targets. HRV: unavailable; not inferred from HR.</p></section>
      <p id="pacsMessage" class="pacs-message" role="status"></p><p id="pacsNight" class="pacs-night" hidden></p><p id="pacsObservation" class="pacs-small"></p>
      <div class="pacs-actions"><button type="button" id="pacsPreferences">PATIENT PREFERENCES</button><button type="button" id="pacsResponse">VIEW SYSTEM RESPONSE</button></div>
      <section aria-labelledby="pacsSettingsTitle"><h3 id="pacsSettingsTitle">Environmental settings <span>VISUAL DEMO</span></h3><dl id="pacsSettings"></dl><div class="pacs-volume" aria-hidden="true"><span id="pacsVolume"></span></div><p class="pacs-small">Audio level is a visual demonstration; no audio plays or is recorded. Clinical alarm volume is never controlled.</p></section>
      <section id="pacsRecommendations" aria-labelledby="pacsRecTitle" hidden><h3 id="pacsRecTitle">Consider a patient comfort assessment.</h3><p id="pacsRecContext" class="pacs-small"></p>
        <label><input type="checkbox" id="pacsReviewed"> Simulated clinical review completed; no warning conditions present. Check preferences and patient report.</label>
        <fieldset id="pacsChoices"><legend>Select recommendations</legend><label><input type="checkbox" data-choice="lighting" checked> Adjust excessive lighting to the recorded preference</label><label><input type="checkbox" data-choice="blinds" checked> Adjust blinds to the recorded glare preference</label><label><input type="checkbox" data-choice="audio"> Reduce nonessential noise / offer preferred audio</label><label><input type="checkbox" data-choice="temperature"> Review preferred temperature range (no HVAC change)</label></fieldset>
        <p id="pacsApprovalStatus" role="status"></p><div class="pacs-actions"><button type="button" id="pacsApprove">APPROVE ADJUSTMENT</button><button type="button" id="pacsReject">REJECT ADJUSTMENT</button><button type="button" id="pacsReviewPreferences">REVIEW PATIENT PREFERENCES</button></div>
      </section>
      <section id="pacsFeedback" hidden><h3>Comfort reassessment recommended.</h3><div class="pacs-feedback"><button type="button" data-feedback="improved">PATIENT REPORTS IMPROVEMENT</button><button type="button" data-feedback="unchanged">NO IMPROVEMENT REPORTED</button><button type="button" data-feedback="unable">PATIENT UNABLE TO RESPOND</button></div><p id="pacsFeedbackStatus" role="status"></p></section>
      <section><h3>Same-camera comparison</h3><div class="pacs-actions"><button type="button" id="pacsBefore" aria-pressed="false">BEFORE · fixed settings</button><button type="button" id="pacsAfter" aria-pressed="true">AFTER · proposed integration</button><button type="button" id="pacsCameraResume" hidden>Resume camera controls</button></div><p id="pacsCompareNote" class="pacs-small">Conventional ICUs have monitoring and environmental controls. PACS proposes their integration; before settings remain fixed until manually adjusted.</p></section>
      <details><summary>Workflow and clinical guardrails</summary><ol id="pacsWorkflow">${WORKFLOW.map((name, i) => `<li data-step="${i}">${name}</li>`).join("")}</ol><label><input type="checkbox" id="pacsWarning"> Inject a scripted clinical-warning condition</label><p>Warning status is a scenario input, never a numerical threshold invented by PACS. New comfort adjustments stop immediately. Oxygen, ventilation, medication and infusion settings are unchanged; medical alarms are never suppressed, replaced or delayed.</p></details>
      <details><summary>Evidence and experimental status</summary><p><strong>Established principles:</strong> clinical monitoring, patient comfort assessment, patient-centered environments and sleep-supportive light/noise practices.</p><p><strong>Proposed integration:</strong> trends, preferences, clinical review and selected environmental recommendations.</p><p><strong>Experimental and not implemented as clinical inference:</strong> automated discomfort detection, comfort prediction, AI personalization and HRV-driven automation. No validated stress score or comfort percentage is displayed.</p>${SOURCES.map(s => `<p><a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.title}</a><br>${s.note}</p>`).join("")}</details>
      <details><summary>Simulation activity</summary><ol id="pacsLog"></ol></details>
      <button type="button" id="pacsReset">RESET SIMULATION</button><button type="button" id="pacsGuideStart">START PHYSIOLOGICAL ADAPTIVE DEMO</button>
      </div>`;
    document.body.append(panel);
    const tools = document.createElement("div"); tools.id = "pacsTools"; tools.hidden = true; tools.setAttribute("role", "group"); tools.setAttribute("aria-label", "PACS room view controls");
    tools.innerHTML = `<button type="button" data-pacs-view="monitor">Patient monitor</button><button type="button" data-pacs-view="patient">Patient & line routes</button><button type="button" data-pacs-view="bed">Patient perspective</button><button type="button" data-pacs-view="overview">Clinical overview</button><button type="button" data-pacs-view="window">Window / blinds</button><button type="button" id="pacsConnections" aria-pressed="true">Connections</button><span>Teal links = conceptual information flow. Click objects for labels.</span>`; document.body.append(tools);
    const guide = document.createElement("aside"); guide.id = "pacsGuide"; guide.hidden = true; guide.setAttribute("aria-labelledby", "pacsGuideTitle");
    guide.innerHTML = `<p class="pacs-kicker">Guided presentation · approximately 77 seconds</p><h3 id="pacsGuideTitle"></h3><p id="pacsGuideText"></p><p id="pacsGuideCaveat" class="pacs-small">${CAVEAT}</p><progress id="pacsGuideProgress" max="77" value="0" aria-label="Presentation progress"></progress><div class="pacs-actions"><button type="button" id="pacsPrevious">PREVIOUS</button><button type="button" id="pacsNext">NEXT</button><button type="button" id="pacsGuidePause">PAUSE</button><button type="button" id="pacsRestart">RESTART</button><button type="button" id="pacsGuideExit">EXIT</button></div>`; document.body.append(guide);
    const profile = document.createElement("dialog"); profile.id = "pacsProfile"; profile.setAttribute("aria-labelledby", "pacsProfileTitle");
    profile.innerHTML = `<form id="pacsProfileForm"><h2 id="pacsProfileTitle">PATIENT COMFORT PROFILE</h2><p>Fictional preferences for this demonstration. These stay in this page session and do not change the existing patient comfort profiles or share links.</p><label>Lighting<select name="lighting"><option value="bright">Bright</option><option value="moderate">Moderate</option><option value="dim">Dim</option></select></label><label>Light color<select name="color"><option value="warm">Warm</option><option value="neutral">Neutral</option></select></label><label>Audio<select name="audio"><option value="quiet">Quiet</option><option value="calming">Calming sounds</option><option value="selected">Patient-selected audio</option></select></label><label>Blinds<select name="blinds"><option value="open">Open</option><option value="partial">Partially closed</option><option value="closed">Closed</option></select></label><fieldset><legend>Preferred temperature range · °C</legend><label>Minimum<input name="tempMin" type="number" min="18" max="28" step="0.5" required></label><label>Maximum<input name="tempMax" type="number" min="18" max="28" step="0.5" required></label></fieldset><p class="pacs-small">18–28 °C is the existing demo input range, not an approved hospital operating range. No approved site limits are supplied: temperature stays a review request. Light levels are normalized visual settings, not measured lux. Clinical requirements take priority.</p><p id="pacsProfileError" role="alert"></p><div class="pacs-actions"><button type="submit">Save simulated preferences</button><button type="button" id="pacsProfileClose">Cancel</button></div></form>`; document.body.append(profile);
    $("openPacs").addEventListener("click", () => this.open());
    for (const id of ["startPacsGuide", "pacsGuideStart"]) $(id).addEventListener("click", () => this.startGuide());
    $("pacsExit").addEventListener("click", () => this.exit());
    $("pacsScenarios").addEventListener("click", e => { const b = e.target.closest("[data-scenario]"); if (b) { this.stopGuide(); this.scenario(b.dataset.scenario); } });
    $("pacsResponse").addEventListener("click", () => { this.stopGuide(); this.showResponse(); });
    $("pacsReviewed").addEventListener("change", e => { this.stopGuide(); this.cancelAdjustment(); this.sim.review(e.target.checked); if (this.sim.reviewed) this.sim.recommend(); this.render(); });
    $("pacsChoices").addEventListener("change", e => { if (!e.target.dataset.choice) return; this.stopGuide(); this.cancelAdjustment(); this.sim.selection[e.target.dataset.choice] = e.target.checked; if (this.sim.approval === "approved") this.sim.approval = "pending"; this.sim.feedback = null; this.render(); });
    $("pacsApprove").addEventListener("click", () => this.approve());
    $("pacsReject").addEventListener("click", () => { this.stopGuide(); this.cancelAdjustment(); this.sim.reject(); this.render(); });
    $("pacsAcknowledge").addEventListener("click", () => { this.sim.acknowledge(); this.render(); });
    $("pacsWarning").addEventListener("change", () => this.warning());
    $("pacsFeedback").addEventListener("click", e => { const b = e.target.closest("[data-feedback]"); if (b) { this.sim.setFeedback(b.dataset.feedback); this.render(); } });
    for (const id of ["pacsPreferences", "pacsReviewPreferences"]) $(id).addEventListener("click", () => this.openPreferences());
    $("pacsProfileClose").addEventListener("click", () => profile.close());
    $("pacsProfileForm").addEventListener("submit", e => { e.preventDefault(); if (!this.sim.setPreferences(Object.fromEntries(new FormData(e.currentTarget)))) { $("pacsProfileError").textContent = "Enter a minimum no greater than the maximum within the demo input range."; return; } this.transition = null; this.sim.environment = copy(this.visual.current); this.unlockCamera(); profile.close(); this.render(); });
    $("pacsReset").addEventListener("click", () => this.reset());
    $("pacsBefore").addEventListener("click", () => this.compare("before")); $("pacsAfter").addEventListener("click", () => this.compare("after"));
    $("pacsCameraResume").addEventListener("click", () => this.unlockCamera());
    tools.addEventListener("click", e => { const b = e.target.closest("[data-pacs-view]"); if (b) this.view(b.dataset.pacsView); });
    $("pacsConnections").addEventListener("click", e => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", String(on)); this.visual.connections(on); });
    $("pacsPrevious").addEventListener("click", () => this.guideStep(this.guide.index - 1, true)); $("pacsNext").addEventListener("click", () => this.guideStep(this.guide.index + 1, true));
    $("pacsRestart").addEventListener("click", () => this.startGuide()); $("pacsGuideExit").addEventListener("click", () => this.stopGuide());
    $("pacsGuidePause").addEventListener("click", () => { this.guide.paused = !this.guide.paused; $("pacsGuidePause").textContent = this.guide.paused ? "RESUME" : "PAUSE"; });
    addEventListener("keydown", e => { if (e.key === "Escape" && this.active && !profile.open) this.exit(); });
    document.addEventListener("visibilitychange", () => { this.lastTick = performance.now(); });
    new ResizeObserver(() => { if (this.active) dispatchEvent(new Event("resize")); }).observe(panel);
  }
  open() {
    if (this.active || !this.stage.current) return;
    this.apisMarkerState = this.closeApis(); this.stopTour(); this.returnFocus = document.activeElement;
    this.snapshot = { position: this.stage.camera.position.clone(), target: this.controls.target.clone(), view: this.rig.view, hfov: this.rig.hfov, ceiling: this.stage.ceilingOn, interrupted: !!this.rig.tween };
    this.rig.tween = null; this.controls.enabled = true;
    const baseline = this.visual.enter(this.stage.current); this.sim = new PacsSimulation(baseline, { dark: this.isDark() });
    this.active = true; this.lastTick = performance.now(); this.lastDisplay = 0; this.transition = null; this.comparison = "after";
    $("pacsPanel").hidden = false; $("pacsTools").hidden = false; document.body.classList.add("pacs-active");
    $("objectCard").hidden = true; $("pacsConnections").setAttribute("aria-pressed", "true");
    this.visual.apply(this.sim.environment); dispatchEvent(new Event("resize")); this.view("overview"); this.render(); $("pacsExit").focus();
  }
  exit() {
    if (!this.active) return;
    this.stopGuide(); this.transition = null; this.unlockCamera(); this.active = false; $("pacsProfile").close();
    this.visual.exit(); this.rig.tween = null;
    const s = this.snapshot; this.rig.view = s.view; this.rig.hfov = s.hfov; this.rig.limits(s.view === "dollhouse");
    this.stage.camera.position.copy(s.position); this.controls.target.copy(s.target); this.controls.enabled = true; this.controls.update(); this.stage.setCeiling(s.ceiling);
    $("pacsPanel").hidden = true; $("pacsTools").hidden = true; document.body.classList.remove("pacs-active"); $("objectCard").hidden = true;
    dispatchEvent(new Event("resize")); if (s.interrupted) this.rig.go(s.view, { instant: true });
    this.restoreViewState?.(s.view);
    this.restoreApisMarkers(this.apisMarkerState);
    this.returnFocus?.focus({ preventScroll: true }); this.invalidate();
  }
  scenario(id) {
    this.transition = null; this.unlockCamera(); this.sim.setScenario(id); this.comparison = "after"; this.responseOpen = id === "possible";
    this.visual.apply(this.sim.environment); this.lastTick = performance.now(); this.render();
  }
  reset() { this.stopGuide(); this.sim = new PacsSimulation(this.sim.baseline, { dark: this.sim.dark }); this.scenario("stable"); this.render(); }
  cancelAdjustment() {
    if (!this.transition) return;
    this.transition = null;
    this.sim.environment = copy(this.visual.current);
  }
  showResponse() { this.cancelAdjustment(); this.responseOpen = true; this.sim.recommend(); this.render(); $("pacsRecommendations").scrollIntoView({ behavior: reduced() ? "instant" : "smooth", block: "nearest" }); }
  approve() {
    const target = this.sim.approve(); if (!target) return;
    this.comparison = "after"; this.transition = { from: copy(this.visual.current), to: target, elapsed: 0 }; this.render();
  }
  warning() {
    this.stopGuide();
    this.transition = null; this.unlockCamera(); this.sim.raiseWarning(); this.comparison = "after";
    // Cancel any pending dimming and restore entry lighting for this assessment demonstration.
    this.sim.environment = { ...this.visual.current, light: this.sim.baseline.light, kelvin: this.sim.baseline.kelvin };
    this.visual.apply(this.sim.environment); this.render();
  }
  openPreferences() {
    this.stopGuide();
    for (const [key, value] of Object.entries(this.sim.preferences)) $("pacsProfileForm").elements[key].value = value;
    $("pacsProfileError").textContent = ""; $("pacsProfile").showModal();
  }
  view(name) {
    if (this.compareCamera) return;
    if (name === "patient") {
      this.rig.go("overview", { instant: true });
      const root = this.stage.current.patient.root;
      this.stage.camera.position.copy(root.localToWorld(new THREE.Vector3(1.25, 1.85, 2.15)));
      this.controls.target.copy(root.localToWorld(new THREE.Vector3(0, 1.0, 0.85))); this.controls.update(); this.invalidate(); return;
    }
    if (name !== "monitor") { this.rig.go(name); return; }
    this.rig.go("overview", { instant: true });
    const target = this.visual.nodes.monitor.position.clone(); target.y -= 0.25;
    const bed = this.stage.current.patient.worldAnchor("ecg");
    const direction = bed.clone().sub(target); direction.y = 0.25; direction.normalize();
    this.stage.camera.position.copy(target).addScaledVector(direction, 1.25); this.controls.target.copy(target); this.controls.update(); this.invalidate();
  }
  compare(which) {
    if (this.sim.warning || this.transition || (this.sim.scenario !== "stable" && this.sim.approval !== "approved")) return;
    this.stopGuide();
    if (!this.compareCamera) this.compareCamera = { position: this.stage.camera.position.clone(), target: this.controls.target.clone() };
    this.rig.tween = null; this.controls.enabled = false; this.comparison = which;
    this.visual.apply(which === "before" ? this.sim.baseline : this.sim.environment); this.render();
  }
  unlockCamera() { this.compareCamera = null; this.controls.enabled = true; $("pacsCameraResume").hidden = true; }
  startGuide() { this.open(); this.reset(); this.guide = { index: 0, elapsed: 0, paused: false, total: 0 }; $("pacsGuidePause").disabled = false; $("pacsGuide").hidden = false; this.guideStep(0, true); }
  stopGuide() { this.guide = null; $("pacsGuide").hidden = true; }
  guideStep(index, rebuild = false) {
    if (!this.guide) return;
    index = Math.max(0, Math.min(GUIDE.length - 1, index));
    this.guide.index = index; this.guide.elapsed = 0; this.guide.total = index * 7;
    $("pacsGuideProgress").value = index * 7; $("pacsGuidePause").disabled = false;
    // Reconstruct earlier steps when judges use Previous/Next; do not leave stale alarms or approval behind.
    if (rebuild) {
      this.scenario(index < 4 ? "stable" : index < 8 ? "possible" : "deterioration");
      if (index >= 5 && index < 8) { this.sim.seconds = 12; this.sim.review(true); this.sim.recommend(); this.responseOpen = true; }
      if (index >= 6 && index < 8) { this.sim.selection.audio = true; const target = this.sim.approve(); this.visual.apply(target); }
    } else {
      if (index === 4) this.scenario("possible");
      if (index === 5) { this.sim.review(true); this.sim.recommend(); this.responseOpen = true; }
      if (index === 6) { this.sim.selection.audio = true; this.approve(); }
      if (index === 8) this.scenario("deterioration");
    }
    if (index === 9) this.sim.acknowledge();
    $("pacsGuideTitle").textContent = `${index + 1} / ${GUIDE.length} · ${GUIDE[index][0]}`; $("pacsGuideText").textContent = (this.sim.dark && GUIDE[index][4]) || GUIDE[index][1];
    $("pacsPrevious").disabled = index === 0; $("pacsNext").disabled = index === GUIDE.length - 1; $("pacsGuidePause").textContent = this.guide.paused ? "RESUME" : "PAUSE";
    this.view(GUIDE[index][3]); this.render();
  }
  render() {
    if (!this.active) return;
    const s = this.sim, readings = s.readings(), p = s.preferences;
    this.lastReadingsKey = JSON.stringify(readings);
    $("pacsScenarios").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.scenario === s.scenario)));
    $("pacsHr").textContent = readings.hr; $("pacsBp").textContent = `${readings.sys}/${readings.dia}`; $("pacsRr").textContent = readings.rr; $("pacsSpo2").textContent = readings.spo2;
    this.visual.readings(readings, s.warning, s.acknowledged);
    const scenario = SCENARIOS[s.scenario];
    const points = Array.from({ length: 25 }, (_, i) => { const second = Math.min(s.seconds, scenario.duration) * i / 24, hr = s.readings(second).hr; return `${8 + i * 12.5},${58 - (hr - 70) * 0.68}`; }).join(" ");
    $("pacsTrend").innerHTML = `<text x="8" y="12">HR · scripted trend (${Math.min(scenario.duration, Math.floor(s.seconds))} s)</text><polyline points="${points}" fill="none" stroke="${s.warning ? "#e67c69" : "#53b7ab"}" stroke-width="2.5"/><text x="8" y="71">${scenario.from[0]} bpm</text><text x="265" y="71">${readings.hr} bpm</text>`;
    const preferred = s.preferred(), matches = ["light", "kelvin", "blinds", "audio"].every(k => s.environment[k] === preferred[k]) && s.environment.temperature >= p.tempMin && s.environment.temperature <= p.tempMax;
    setText("pacsMessage", s.warning ? "Clinical assessment takes priority. New comfort recommendations are suspended." : s.scenario === "stable" && matches ? "Patient monitoring is stable. Current environmental settings match the patient's recorded comfort preferences. Stable vital signs do not prove comfort." : s.scenario === "stable" ? "Patient monitoring is stable. Recorded preferences require review before adjustment; stable vital signs do not prove comfort." : "Physiological change detected. Consider a patient comfort assessment; these changes do not establish discomfort, pain or anxiety.");
    $("pacsObservation").textContent = s.scenario === "stable" ? "Scripted observation: resting position; patient reports comfortable at scenario start. Sleep state is not measured." : "Scripted movement: repositioning observed; cause unknown. Patient report and clinical assessment are needed. No sleep-stage inference.";
    $("pacsAlert").hidden = !s.warning; $("pacsAcknowledge").disabled = s.acknowledged;
    setText("pacsAckStatus", s.acknowledged ? "Acknowledged in the demonstration. Clinical alert remains ACTIVE; no real alarm was silenced." : "Acknowledgment never silences or dismisses a medical alarm.");
    $("pacsRecommendations").hidden = !this.responseOpen && s.scenario !== "possible";
    setText("pacsRecTitle", s.warning ? "Comfort adjustments suspended." : "Consider a patient comfort assessment.");
    setText("pacsRecContext", s.warning ? "A scripted clinical warning is active. Clinical assessment takes priority." : s.scenario === "stable" ? "Stable readings do not establish comfort. Review patient preferences and reported comfort before considering changes. This case is scripted without warning conditions." : "Physiological change detected. Several medical explanations remain possible. This case is scripted without warning conditions unless the warning control is enabled.");
    $("pacsReviewed").checked = s.reviewed; $("pacsReviewed").disabled = s.warning;
    $("pacsChoices").disabled = s.warning;
    $("pacsChoices").querySelectorAll("input").forEach(input => { input.checked = s.selection[input.dataset.choice]; });
    $("pacsChoices").querySelector('[data-choice="blinds"]').disabled = s.dark; // after sunset only the lighting changes
    $("pacsNight").hidden = !s.dark; setText("pacsNight", s.dark ? NIGHT_LINE : "");
    $("pacsApprovalStatus").textContent = s.warning ? "SUSPENDED · clinical warning active" : s.approval === "approved" ? "Simulated nurse approval recorded. Comfort reassessment recommended." : s.approval === "rejected" ? "REJECTED · settings unchanged by this proposal" : s.approval === "pending" ? "Environmental adjustment recommended. Awaiting nurse approval for selected options." : "Clinical review and selected recommendations are required before approval.";
    $("pacsApprove").disabled = s.warning || s.approval !== "pending" || !Object.values(s.selection).some(Boolean); $("pacsReject").disabled = s.warning || s.approval !== "pending";
    $("pacsResponse").disabled = s.warning; $("pacsWarning").checked = s.warning; $("pacsWarning").disabled = s.warning;
    $("pacsFeedback").hidden = s.approval !== "approved" || s.warning;
    $("pacsFeedbackStatus").textContent = { improved: "Patient reports improvement. This is scripted feedback, not evidence that PACS caused benefit.", unchanged: "No improvement reported. Further comfort and clinical assessment is recommended.", unable: "Patient unable to respond. Clinical assessment is needed; vital signs are not used to infer comfort." }[s.feedback] || "Record patient feedback independently of physiological trends.";
    $("pacsFeedback").querySelectorAll("[data-feedback]").forEach(b => b.setAttribute("aria-pressed", String(s.feedback === b.dataset.feedback)));
    for (const which of ["before", "after"]) { const b = $(which === "before" ? "pacsBefore" : "pacsAfter"); b.disabled = s.warning || !!this.transition || (s.scenario !== "stable" && s.approval !== "approved"); b.setAttribute("aria-pressed", String(this.comparison === which)); }
    $("pacsCameraResume").hidden = !this.compareCamera;
    $("pacsTools").querySelectorAll("[data-pacs-view]").forEach(b => { b.disabled = !!this.compareCamera; });
    $("pacsCompareNote").textContent = this.compareCamera ? `${this.comparison.toUpperCase()} · camera locked at the same position for both views. Conventional settings remain fixed unless manually adjusted; monitoring is present in both.` : "Conventional ICUs have monitoring and environmental controls. PACS proposes their integration; before settings remain fixed until manually adjusted.";
    const step = s.warning ? 2 : s.feedback ? 7 : s.approval === "approved" ? 6 : s.approval === "pending" ? 5 : s.reviewed ? 4 : s.scenario === "possible" ? 2 : 0;
    $("pacsWorkflow").querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-current", i === step ? "step" : "false"));
    $("pacsLog").replaceChildren(...s.log.map(text => { const li = document.createElement("li"); li.textContent = text; return li; }));
    this.renderEnvironment();
  }
  renderEnvironment() {
    const e = this.visual.current || this.sim.environment;
    $("pacsSettings").innerHTML = `<dt>Lighting</dt><dd>${Math.round(e.light * 100)}% of demo output · ${Math.round(e.kelvin)} K</dd><dt>Blinds</dt><dd>${Math.round(e.blinds * 100)}% lowered</dd><dt>Room temperature</dt><dd>${e.temperature} °C simulated · review only</dd><dt>Preferred temperature</dt><dd>${this.sim.preferences.tempMin}–${this.sim.preferences.tempMax} °C · not an approved site limit</dd><dt>Nonessential audio</dt><dd>${Math.round(e.audio * 100)}% simulated level</dd><dt>Preference</dt><dd>${{ quiet: "Quiet", calming: "Offer calming sounds", selected: "Offer patient-selected audio" }[this.sim.preferences.audio]}</dd>`;
    $("pacsVolume").style.width = `${e.audio * 100}%`;
  }
  update(now) {
    if (!this.active) return false;
    const dt = document.hidden ? 0 : Math.max(0, (now - this.lastTick) / 1000); this.lastTick = now;
    let changed = false;
    if (!this.guide?.paused) this.sim.seconds = Math.min(SCENARIOS[this.sim.scenario].duration, this.sim.seconds + dt);
    if (this.transition && !this.sim.warning && !this.guide?.paused) {
      const tr = this.transition; tr.elapsed += dt;
      const k = reduced() ? 1 : Math.min(1, tr.elapsed / 2.4), t = k * k * (3 - 2 * k);
      this.visual.apply(Object.fromEntries(Object.keys(tr.to).map(key => [key, tr.from[key] + (tr.to[key] - tr.from[key]) * t])));
      this.renderEnvironment(); changed = true;
      if (k === 1) { this.transition = null; this.render(); }
    }
    if (this.guide && !this.guide.paused) {
      this.guide.elapsed += dt; this.guide.total = this.guide.index * 7 + this.guide.elapsed;
      $("pacsGuideProgress").value = Math.min(77, this.guide.total);
      while (this.guide.elapsed >= 7 && !this.guide.paused) {
        if (this.guide.index < GUIDE.length - 1) { const carry = this.guide.elapsed - 7; this.guideStep(this.guide.index + 1); this.guide.elapsed = carry; }
        else { this.guide.paused = true; this.guide.total = 77; $("pacsGuideProgress").value = 77; $("pacsGuidePause").textContent = "COMPLETE"; $("pacsGuidePause").disabled = true; }
      }
    }
    if (this.compareCamera) { this.stage.camera.position.copy(this.compareCamera.position); this.controls.target.copy(this.compareCamera.target); this.stage.camera.lookAt(this.controls.target); }
    if (now - this.lastDisplay > 500) { if (this.lastReadingsKey !== JSON.stringify(this.sim.readings())) this.render(); this.lastDisplay = now; }
    return changed;
  }
  inspect() {
    return { active: this.active, dark: this.sim?.dark, scenario: this.sim?.scenario, readings: this.sim?.readings(), warning: this.sim?.warning, approval: this.sim?.approval, acknowledged: this.sim?.acknowledged, feedback: this.sim?.feedback, environment: this.visual.current, preferences: this.sim?.preferences, transitioning: !!this.transition, comparison: this.comparison, cameraLocked: !!this.compareCamera, guide: this.guide ? { ...this.guide } : null, monitorMaterials: this.visual.materials?.length || 0, connections: Object.keys(this.visual.nodes || {}), patient: !!this.stage.current?.patient, physical: { blindScale: this.visual.blinds?.scale.y, lightLevel: this.visual.lighting.comfort?.level ?? 1, lightIntensity: this.visual.lighting.rects.map(l => l.intensity) } };
  }
}
