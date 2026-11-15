// The smart clinical wall and Transform my environment, in the room: what the staff panel, the patient wall, the TV on it,
// the ceiling above the bed and the workstation's two screens show. wall-data.js holds the words and wallFor(), the rule
// that keeps them in step with the room's mode and the patient's state; main.js calls apply() after anything changes.
// Everything is drawn in code, only when it changes, and every reading is made up and marked SIMULATED.
import * as THREE from "three";
import { FIT } from "./fittings-data.js";
import { PAINT } from "./fittings.js";
import {
  CARE_TEAM, DAY_PLAN, STRIP_TEXT, EMERGENCY, EQUIPMENT, HANDOVER, OBS, OBS_NOTE, OVERVIEW, PLAN, SCENE_MS, SCENES, SECTION_TITLES,
  STATION_VIEWS, TASKS, WALL_BUTTONS,
} from "./wall-data.js";

const { simulated, heading, line, trace, INK, DIM, BG } = PAINT;
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/** Draw again on a screen's own canvas, from the background up. */
function repaint(texture, draw) {
  const c = texture.image, g = c.getContext("2d");
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = BG; g.fillRect(0, 0, c.width, c.height);
  draw(g, c.width, c.height);
  texture.needsUpdate = true;
}
const screenOf = (node, id) => { let s = null; node?.traverse(n => { if (n.userData.screen === id) s = n; }); return s; };

// ---------------------------------------------------------------- the seven scenes, drawn in code

function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function sky(g, w, h, top, bottom, to = 1) { const l = g.createLinearGradient(0, 0, 0, h * to); l.addColorStop(0, top); l.addColorStop(1, bottom); g.fillStyle = l; g.fillRect(0, 0, w, h); }
/** A filled skyline from the bottom: the height at each x from `at(x)`, in canvas pixels. */
function ground(g, w, h, colour, at) { g.fillStyle = colour; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 4) g.lineTo(x, at(x)); g.lineTo(w, h); g.fill(); }
function clouds(g, w, h, rnd, n, alpha = 0.75, band = [0.08, 0.45]) {
  for (let i = 0; i < n; i++) {
    const cx = rnd() * w, cy = h * (band[0] + rnd() * (band[1] - band[0])), s = w * (0.04 + rnd() * 0.05);
    g.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(cx + (k - 2) * s * 0.7, cy - Math.sin(k / 4 * Math.PI) * s * 0.45, s * 0.75, s * 0.5, 0, 0, 7); g.fill(); }
  }
}
function conifer(g, x, base, height, colour) {
  g.fillStyle = colour;
  for (let k = 0; k < 3; k++) { const top = base - height * (0.45 + k * 0.27), wide = height * (0.36 - k * 0.08); g.beginPath(); g.moveTo(x, top - height * 0.2); g.lineTo(x + wide, base - height * k * 0.27); g.lineTo(x - wide, base - height * k * 0.27); g.fill(); }
}
function stars(g, w, h, rnd, n, to = 1) {
  for (let i = 0; i < n; i++) { const r = 0.6 + rnd() * rnd() * 2.4; g.fillStyle = `rgba(255, 252, 235, ${0.45 + rnd() * 0.55})`; g.beginPath(); g.arc(rnd() * w, rnd() * h * to, r * w / 1024, 0, 7); g.fill(); }
}
function moon(g, x, y, r, back) { g.fillStyle = "#eef0e2"; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.fillStyle = back; g.beginPath(); g.arc(x + r * 0.42, y - r * 0.2, r * 0.92, 0, 7); g.fill(); }
function sun(g, x, y, r, colour = "#fff4d2") {
  const glow = g.createRadialGradient(x, y, r * 0.5, x, y, r * 4); glow.addColorStop(0, "rgba(255, 246, 214, 0.55)"); glow.addColorStop(1, "rgba(255, 246, 214, 0)");
  g.fillStyle = glow; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  g.fillStyle = colour; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
/** Leaves or blossom round the edges of a ceiling picture, with the sky between them. */
function canopy(g, w, h, rnd, colours, n) {
  for (let i = 0; i < n; i++) {
    const side = i % 4, t = rnd(), d = rnd() * rnd() * 0.32;
    const x = side === 0 ? t * w : side === 1 ? w * (1 - d) : side === 2 ? t * w : w * d, y = side === 0 ? h * d : side === 1 ? t * h : side === 2 ? h * (1 - d) : t * h;
    g.fillStyle = colours[Math.floor(rnd() * colours.length)]; g.globalAlpha = 0.75 + rnd() * 0.25;
    g.beginPath(); g.ellipse(x, y, w * (0.02 + rnd() * 0.035), w * (0.015 + rnd() * 0.025), rnd() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1;
}

const WALL_SCENES = {
  forest(g, w, h) {
    const rnd = seeded(11);
    sky(g, w, h, "#cfe2e6", "#eef2e2", 0.7); sun(g, w * 0.72, h * 0.2, h * 0.05);
    ground(g, w, h, "#a9c2ae", x => h * (0.5 + 0.04 * Math.sin(x / w * 5)));
    for (let x = -20; x < w + 20; x += w / 26) conifer(g, x + rnd() * 20, h * (0.62 + rnd() * 0.04), h * (0.22 + rnd() * 0.1), "#7c9f80");
    ground(g, w, h, "#5d8762", x => h * (0.66 + 0.03 * Math.sin(x / w * 7 + 1)));
    for (let x = -30; x < w + 30; x += w / 14) conifer(g, x + rnd() * 30, h * (0.86 + rnd() * 0.05), h * (0.36 + rnd() * 0.16), "#3f6b4a");
    g.fillStyle = "rgba(255, 250, 225, 0.12)"; // light coming through
    for (let i = 0; i < 4; i++) { const x = w * (0.35 + i * 0.12); g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w * 0.05, 0); g.lineTo(x - w * 0.1, h); g.lineTo(x - w * 0.18, h); g.fill(); }
    ground(g, w, h, "#4d7a4f", x => h * (0.92 + 0.02 * Math.sin(x / w * 9)));
  },
  ocean(g, w, h) {
    const rnd = seeded(21);
    sky(g, w, h, "#8cc8e6", "#e8f4f6", 0.55); sun(g, w * 0.3, h * 0.22, h * 0.045); clouds(g, w, h, rnd, 4, 0.7, [0.08, 0.3]);
    const sea = g.createLinearGradient(0, h * 0.52, 0, h * 0.85); sea.addColorStop(0, "#3b8db3"); sea.addColorStop(1, "#1f6a8c");
    g.fillStyle = sea; g.fillRect(0, h * 0.52, w, h * 0.4);
    g.strokeStyle = "rgba(255, 255, 255, 0.35)"; g.lineWidth = Math.max(2, h / 300);
    for (let i = 0; i < 9; i++) { const y = h * (0.56 + i * 0.035); g.beginPath(); for (let x = 0; x <= w; x += 8) g.lineTo(x, y + Math.sin(x / w * 18 + i) * h * 0.004); g.stroke(); }
    ground(g, w, h, "#f2f6f4", x => h * (0.83 + 0.025 * Math.sin(x / w * 4 + 0.5)));
    ground(g, w, h, "#e9d6aa", x => h * (0.85 + 0.025 * Math.sin(x / w * 4 + 0.5)));
  },
  mountains(g, w, h) {
    const rnd = seeded(31);
    sky(g, w, h, "#a9c6e0", "#eef2f4", 0.6); clouds(g, w, h, rnd, 3, 0.6, [0.06, 0.22]);
    const range = (base, amp, colour, snow, seed) => {
      const r = seeded(seed), peaks = [];
      for (let x = -w * 0.1; x < w * 1.1; x += w * (0.12 + r() * 0.1)) peaks.push([x, h * (base - amp * (0.4 + r() * 0.6))]);
      g.fillStyle = colour; g.beginPath(); g.moveTo(-10, h);
      for (let i = 0; i < peaks.length; i++) { g.lineTo(...peaks[i]); if (i + 1 < peaks.length) g.lineTo((peaks[i][0] + peaks[i + 1][0]) / 2, h * base); }
      g.lineTo(w + 10, h); g.fill();
      if (snow) { g.fillStyle = "#f6f8fa"; for (const [x, y] of peaks) { const s = h * amp * 0.18; g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.9, y + s); g.lineTo(x - s * 0.9, y + s); g.fill(); } }
    };
    range(0.55, 0.32, "#b9c6d6", true, 3); range(0.66, 0.28, "#7c8fa6", true, 5); range(0.78, 0.18, "#5d7a66", false, 7);
    const lake = g.createLinearGradient(0, h * 0.8, 0, h); lake.addColorStop(0, "#7fa9c6"); lake.addColorStop(1, "#5f8fb0");
    g.fillStyle = lake; g.fillRect(0, h * 0.8, w, h * 0.12);
    ground(g, w, h, "#4f6b4a", x => h * (0.9 + 0.03 * Math.sin(x / w * 6)));
  },
  desert(g, w, h) {
    sky(g, w, h, "#6fb2d6", "#f4dcb4", 0.7); sun(g, w * 0.62, h * 0.28, h * 0.06);
    [["#e2bb8a", 0.55, 0.05, 2, 0.1], ["#d3a26e", 0.68, 0.07, 1, 1.4], ["#bd8655", 0.82, 0.07, 1, 2.2]].forEach(([colour, y, amp, waves, phase]) =>
      ground(g, w, h, colour, x => h * (y + amp * Math.sin((x / w) * Math.PI * 2 * waves + phase))));
  },
  garden(g, w, h) {
    const rnd = seeded(41);
    sky(g, w, h, "#bfe0f0", "#f1f6e8", 0.5); clouds(g, w, h, rnd, 3, 0.65, [0.06, 0.2]);
    ground(g, w, h, "#4f7f4a", x => h * (0.42 + 0.02 * Math.sin(x / w * 12)));
    g.fillStyle = "#7fae6b"; g.fillRect(0, h * 0.56, w, h * 0.44);
    g.fillStyle = "#e3d3b5"; g.beginPath(); g.moveTo(w * 0.47, h * 0.56); g.lineTo(w * 0.53, h * 0.56); g.lineTo(w * 0.68, h); g.lineTo(w * 0.32, h); g.fill();
    const bloom = ["#e58fa0", "#f2c14e", "#ffffff", "#a98ad8", "#f08a5a"];
    for (let i = 0; i < 260; i++) { const x = rnd() * w, y = h * (0.6 + rnd() * 0.38); if (Math.abs(x - w / 2) < (y / h - 0.5) * w * 0.4) continue; g.fillStyle = bloom[i % 5]; g.beginPath(); g.arc(x, y, h * (0.006 + rnd() * 0.008), 0, 7); g.fill(); }
    for (const [x, s] of [[0.16, 1], [0.84, 0.85]]) { g.fillStyle = "#7a5a3a"; g.fillRect(w * x - h * 0.012, h * 0.3, h * 0.024, h * 0.3); g.fillStyle = "#5f9a58"; g.beginPath(); g.arc(w * x, h * 0.27, h * 0.15 * s, 0, 7); g.fill(); g.fillStyle = "#6fae66"; g.beginPath(); g.arc(w * x - h * 0.05, h * 0.23, h * 0.09 * s, 0, 7); g.fill(); }
  },
  clearSky(g, w, h) {
    const rnd = seeded(51);
    sky(g, w, h, "#4f9fd6", "#cfeaf6"); sun(g, w * 0.8, h * 0.18, h * 0.05); clouds(g, w, h, rnd, 6, 0.8, [0.2, 0.8]);
  },
  nightSky(g, w, h) {
    const rnd = seeded(61);
    sky(g, w, h, "#0b1530", "#2a3550");
    g.fillStyle = "rgba(200, 210, 255, 0.05)"; g.beginPath(); g.ellipse(w * 0.5, h * 0.4, w * 0.6, h * 0.08, -0.35, 0, 7); g.fill(); // the Milky Way, faintly
    stars(g, w, h, rnd, 260, 0.85); moon(g, w * 0.78, h * 0.2, h * 0.05, "#0f1a36");
    ground(g, w, h, "#0a0f1c", x => h * (0.86 + 0.04 * Math.sin(x / w * 5 + 2)));
  },
};
/** The ceiling above the bed, seen from the pillow: sky, with leaves or blossom round the edge where the scene has them. */
const CEILING_SCENES = {
  forest: (g, w, h) => { sky(g, w, h, "#d6e8ec", "#bcd6e2"); clouds(g, w, h, seeded(12), 3, 0.6, [0.3, 0.7]); canopy(g, w, h, seeded(13), ["#3f6b4a", "#5d8762", "#7c9f80", "#2f5a3c"], 900); },
  ocean: (g, w, h) => { sky(g, w, h, "#8cc8e6", "#cfe8f2"); clouds(g, w, h, seeded(22), 5, 0.75, [0.1, 0.9]); },
  mountains: (g, w, h) => { sky(g, w, h, "#9fbfdc", "#dfe9f1"); clouds(g, w, h, seeded(32), 4, 0.7, [0.1, 0.9]); },
  desert: (g, w, h) => { sky(g, w, h, "#7fbbdc", "#f2dcba"); sun(g, w * 0.7, h * 0.35, h * 0.06); },
  garden: (g, w, h) => { sky(g, w, h, "#bfe0f0", "#e4f1f4"); clouds(g, w, h, seeded(42), 3, 0.7, [0.3, 0.7]); canopy(g, w, h, seeded(43), ["#f2b6c4", "#e58fa0", "#fbe3e8", "#6fae66"], 700); },
  clearSky: (g, w, h) => { sky(g, w, h, "#4f9fd6", "#a8d6f0"); clouds(g, w, h, seeded(52), 6, 0.8, [0.05, 0.95]); },
  nightSky: (g, w, h) => { sky(g, w, h, "#0b1530", "#16213d"); stars(g, w, h, seeded(62), 320); },
};
/** Draw a scene on a canvas: `part` is "wall" or "ceiling". */
export function drawScene(g, w, h, id, part = "wall") {
  (part === "ceiling" ? CEILING_SCENES : WALL_SCENES)[id]?.(g, w, h);
}

// ---------------------------------------------------------------- what each screen shows

function staffObs(g, w, h, hour) {
  heading(g, "Observations", 40, 60);
  line(g, clockOf(hour), w - 200, 60, 26, DIM);
  OBS.filter(o => o.trace).forEach((o, i) => {
    const y = 88 + i * 112;
    line(g, o.short || o.label, 40, y + 40, 26, INK);
    trace(g, 190, y + 4, w - 450, 80, o.colour, o.trace);
    g.font = "600 64px system-ui, sans-serif"; g.fillStyle = o.colour; g.textBaseline = "alphabetic"; g.fillText(o.value, w - 230, y + 70);
    line(g, o.unit, w - 230 + g.measureText(o.value).width + 8, y + 70, 24, DIM);
  });
  OBS.filter(o => !o.trace).forEach((o, i) => {
    const x = 40 + i * 330, y = 440;
    line(g, o.short || o.label, x, y, 26, INK);
    g.font = "600 52px system-ui, sans-serif"; g.fillStyle = o.colour; g.fillText(o.value, x, y + 58);
    line(g, o.unit, x + g.measureText(o.value).width + 8, y + 58, 22, DIM);
  });
  line(g, OBS_NOTE, 40, h - 22, 19);
  simulated(g, w, h);
}
function staffTasks(g, w, h, done) {
  heading(g, "Care tasks", 40, 60);
  TASKS.slice(0, 5).forEach((t, i) => {
    const y = 92 + i * 56, ok = done.has(t.id);
    g.strokeStyle = ok ? "#5fd38d" : DIM; g.lineWidth = 3; g.strokeRect(44, y, 28, 28);
    if (ok) { g.strokeStyle = "#5fd38d"; g.lineWidth = 5; g.beginPath(); g.moveTo(49, y + 14); g.lineTo(56, y + 22); g.lineTo(68, y + 6); g.stroke(); }
    line(g, t.label.length > 24 ? `${t.label.slice(0, 23)}…` : t.label, 88, y + 24, 26, ok ? DIM : INK);
  });
  heading(g, "Equipment", 560, 60);
  EQUIPMENT.forEach((e, i) => { const y = 92 + i * 56; g.fillStyle = "#5fd38d"; g.beginPath(); g.arc(574, y + 14, 9, 0, 6.283); g.fill(); line(g, e.label, 596, y + 22, 26, INK); line(g, e.status, 596, y + 46, 18); });
  line(g, "Statuses are part of the demo, not read from a device.", 40, h - 22, 19);
  simulated(g, w, h);
}
function staffEmergency(g, w, h) {
  g.fillStyle = "#3a1d12"; g.fillRect(0, 0, w, 88);
  heading(g, EMERGENCY.title, 40, 60, 32);
  EMERGENCY.items.forEach((it, i) => { const y = 130 + i * 96; line(g, it.label, 40, y, 28, INK); line(g, it.whereText.length > 64 ? `${it.whereText.slice(0, 63)}…` : it.whereText, 40, y + 36, 21); });
  line(g, "Not a validated emergency protocol.", 40, h - 22, 19, "#f2c14e");
  simulated(g, w, h);
}
/** A screen resting: the time, and what it's for. Nothing about the patient. */
function standby(g, w, h, text, hour) {
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, "#13252c"); bg.addColorStop(1, "#0c181d");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.textAlign = "center"; g.textBaseline = "middle";
  if (hour !== undefined) { g.font = "300 120px system-ui, sans-serif"; g.fillStyle = "#6f8f9a"; g.fillText(clockOf(hour), w / 2, h / 2 - 30); }
  g.font = "500 30px system-ui, sans-serif"; g.fillStyle = "#56717b";
  g.fillText(text, w / 2, hour !== undefined ? h / 2 + 70 : h / 2); g.textAlign = "start";
}
const clockOf = hour => { const m = Math.round(hour * 60), hh = Math.floor(m / 60) % 24, mm = m % 60; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, "0")} ${hh < 12 ? "am" : "pm"}`; };

/** The strip's canvas (fittings.js, 1600 by 200) and its buttons' size, gap and margin, in its pixels. */
const STRIP = { w: 1600, h: 200, button: 250, gap: 24, pad: 22 };
/** The strip over the TV. Patient: the care team by role, the plan, and the two buttons; Clinical: one calm line. */
function patientStrip(g, w, h, st) {
  g.fillStyle = "#f3eee4"; g.fillRect(0, 0, w, h); // light, like the orientation screen by day, so it reads from the pillow
  const ink = "#16282e", soft = "#4f6369";
  if (st.wall === "clinical" || st.wall === "family") {
    g.font = "600 56px system-ui, sans-serif"; g.fillStyle = ink; g.textBaseline = "middle";
    g.fillText(st.wall === "family" ? "Family visit · your family is with you" : "Your care team is with you", 48, h / 2);
    mark(g, w - 40);
    return;
  }
  const buttons = st.prompts ? WALL_BUTTONS : [], bw = STRIP.button, room = w - buttons.length * (bw + STRIP.gap) - STRIP.gap - 40;
  // two rows, each cut to whole items that fit: the care team by role, then the day's plan
  const row = (label, items, y) => {
    g.font = `600 ${STRIP_TEXT.size}px system-ui, sans-serif`; g.fillStyle = ink; g.fillText(label, 40, y);
    const x = 40 + g.measureText(`${label} `).width;
    g.font = `400 ${STRIP_TEXT.size}px system-ui, sans-serif`; g.fillStyle = soft;
    let text = "";
    for (const item of items) { const next = text ? `${text} · ${item}` : item; if (x + g.measureText(next).width > room) break; text = next; }
    g.fillText(text, x, y);
  };
  g.textBaseline = "alphabetic";
  row("Your team", CARE_TEAM, 86);
  row("Today", DAY_PLAN, 164);
  mark(g, room + 40);
  buttons.forEach((b, i) => {
    const x = w - (buttons.length - i) * (bw + STRIP.gap), y = STRIP.pad;
    g.fillStyle = "#0b6d75"; roundRect(g, x, y, bw, h - 2 * STRIP.pad, 22); g.fill();
    g.fillStyle = "#ffffff"; g.font = "600 34px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    const words = b.label.split(" "), half = Math.ceil(words.length / 2), lines = words.length > 2 ? [words.slice(0, half).join(" "), words.slice(half).join(" ")] : [b.label];
    lines.forEach((t, k) => g.fillText(t, x + bw / 2, h / 2 + (k - (lines.length - 1) / 2) * 40));
    g.textAlign = "start";
  });
}
/** The strip's own SIMULATED mark, small, in its top corner, ending at x: the team and the plan are samples. */
function mark(g, right) {
  g.font = "600 18px system-ui, sans-serif"; g.textBaseline = "middle";
  const tw = g.measureText("SIMULATED").width;
  g.fillStyle = "#f2c14e"; g.fillRect(right - tw - 16, 6, tw + 16, 26);
  g.fillStyle = "#1a1a1a"; g.fillText("SIMULATED", right - tw - 8, 19.5);
  g.textBaseline = "alphabetic";
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

/** The workstation's screen on the desk: the view chosen, or Emergency. */
function deskScreen(g, w, h, s) {
  if (s.emergency) { staffEmergency(g, w, h); return; }
  const v = STATION_VIEWS[s.view];
  heading(g, `Clinician workstation · ${v.label}`, 32, 54, 30);
  v.sections.slice(0, 4).forEach((id, i) => {
    const x = 32 + (i % 2) * 392, y = 84 + Math.floor(i / 2) * 176;
    g.fillStyle = "#1d3340"; g.fillRect(x, y, 372, 160);
    line(g, SECTION_TITLES[id], x + 16, y + 36, 26, INK);
    const rows = id === "overview" ? OVERVIEW : id === "tasks" ? TASKS.map(t => `${s.done.has(t.id) ? "✓" : "○"} ${t.label}`) : id === "equipment" ? EQUIPMENT.map(e => `${e.label}: ${e.status}`)
      : id === "obs" ? OBS.map(o => `${o.short || o.label} ${o.value} ${o.unit}`) : id === "plan" ? PLAN : id === "handover" ? HANDOVER : ["See the station's panel"];
    rows.slice(0, 3).forEach((r, k) => line(g, r.length > 30 ? `${r.slice(0, 29)}…` : r, x + 16, y + 74 + k * 32, 20));
  });
  line(g, "No name, no diagnosis: a made-up patient.", 32, h - 24, 20);
  simulated(g, w, h);
}
/** The screen on the arm: the task chosen, with what it needs and where that is; otherwise the handover. */
function armScreen(g, w, h, s) {
  const t = TASKS.find(x => x.id === s.task);
  if (s.emergency) { heading(g, "Clear route to the bed", 32, 56, 30); line(g, "Marked on the floor, with the keep-clear areas.", 32, 110, 24, INK); line(g, "Illustrative, not a protocol.", 32, 150, 22); simulated(g, w, h); return; }
  if (!t) { heading(g, "Handover", 32, 56, 32); HANDOVER.forEach((x, i) => line(g, x, 32, 120 + i * 52, 26, INK)); simulated(g, w, h); return; }
  heading(g, t.label.length > 30 ? `${t.label.slice(0, 29)}…` : t.label, 32, 56, 30);
  line(g, s.done.has(t.id) ? "Done ✓" : t.due, 32, 96, 22, s.done.has(t.id) ? "#5fd38d" : DIM);
  t.needs.forEach((n, i) => line(g, `• ${n}`, 32, 150 + i * 44, 24, INK));
  line(g, t.whereText, 32, h - 64, 22, "#3fc1c9");
  simulated(g, w, h);
}

/** Which of the wall's buttons a click on the strip landed on, from where on the strip (its uv): the bedside screen it opens. */
export function buttonAt(mesh, uv) {
  const buttons = mesh?.userData.screen === "strip" && mesh.visible ? mesh.userData.buttons || [] : [];
  if (!buttons.length || !uv) return null;
  const x = uv.x * STRIP.w, y = (1 - uv.y) * STRIP.h;
  const i = buttons.findIndex((_, k) => { const x0 = STRIP.w - (buttons.length - k) * (STRIP.button + STRIP.gap); return x >= x0 && x <= x0 + STRIP.button; });
  return i >= 0 && y >= STRIP.pad && y <= STRIP.h - STRIP.pad ? buttons[i].tab : null;
}

/** Family connection on the TV in Family visit: drawn placeholder photographs and a message, never a real person's. */
function familyScreen(g, w, h) {
  g.fillStyle = "#f3eee4"; g.fillRect(0, 0, w, h);
  const ink = "#16282e", soft = "#4f6369";
  g.textBaseline = "alphabetic";
  g.font = "600 56px system-ui, sans-serif"; g.fillStyle = ink; g.fillText("Family connection", 48, 86);
  g.font = "400 30px system-ui, sans-serif"; g.fillStyle = soft; g.fillText("Photos and a message from home, shared by family", 48, 132);
  [["#9fd0e0", "#f2e3c2"], ["#cfe6c8", "#7fae6b"], ["#f3e2cf", "#d9b99a"]].forEach(([top, bottom], i) => {
    const x = 48 + i * 296, y = 170, pw = 268, ph = 200;
    const l = g.createLinearGradient(0, y, 0, y + ph); l.addColorStop(0, top); l.addColorStop(1, bottom);
    g.fillStyle = l; g.fillRect(x, y, pw, ph);
    for (const [k, colour] of [[0.38, "#c46d4f"], [0.62, "#4f7f8a"]]) { // two figures, as simple shapes
      g.fillStyle = colour; g.beginPath(); g.ellipse(x + pw * k, y + ph * 0.92, 26, 52, 0, Math.PI, 0); g.fill();
      g.fillStyle = "#d9a98a"; g.beginPath(); g.arc(x + pw * k, y + ph * 0.52, 18, 0, 7); g.fill();
    }
  });
  g.font = "400 28px system-ui, sans-serif"; g.fillStyle = ink; g.fillText("“We'll see you at four. Love from all of us.”", 48, 430);
  g.font = "400 22px system-ui, sans-serif"; g.fillStyle = soft; g.fillText("Drawn placeholders: no real photograph, voice or name.", 48, 476);
  mark(g, w - 32);
}

// ---------------------------------------------------------------- the planes a scene shows on

function scenePlane(w, h, canvasW) {
  const c = document.createElement("canvas"); c.width = canvasW; c.height = Math.round(canvasW * h / w);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, toneMapped: false, depthWrite: false }));
  m.userData.texture = t;
  return m;
}
/** The ceiling picture: in the tray's sky when the tray is on, otherwise where the printed sky goes (addons.js sky). */
function ceilingRect(room, trayOn) {
  if (trayOn) { const [x0, y0, x1, y1] = FIT[room.label].tray.sky; return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 }; }
  const m = room.meta, f = m.bed.foot;
  return { cx: m.bed.head[0] + f[0] * 1.2, cy: m.bed.head[1] + f[1] * 1.2, w: 3.0, h: 2.2 };
}

/**
 * The wall in one room. apply() is called with the state from wallFor() and what else the screens show; it redraws only
 * what changed. update(now) eases a scene in or out and returns true while it moves.
 */
export class WallView {
  constructor() { this.fades = new Set(); }

  /**
   * room: the room on show. st: wallFor()'s result. extra: { hour, done (a Set of task ids), task, view, tv (the TV's own
   * choice: "off", "on" or "orientation"), setTv(playing), restoreTv() }. instant: no easing.
   */
  apply(room, st, extra, { instant = false } = {}) {
    if (!room) return;
    const a = room.addons || {}, on = id => !!a[id]?.userData.schemeOn;
    const w = room.wallState ||= { key: {} }, key = w.key, now = performance.now(), quick = instant || reduced();
    const draw = (name, value, fn) => { const k = JSON.stringify(value); if (key[name] === k) return false; key[name] = k; fn(); return true; };

    // the staff panel: clinical, Emergency, or a dark standby that shows nothing about the patient
    if (on("staffPanel")) {
      const left = screenOf(a.staffPanel, "staffLeft"), right = screenOf(a.staffPanel, "staffRight");
      const mode = st.staff === "clinical" ? (st.emergency ? "emergency" : "clinical") : "standby";
      draw("staffLeft", [mode, Math.round(extra.hour * 60)], () => repaint(left.material.map, (g, W, H) => (mode === "standby" ? standby(g, W, H, "Staff panel · standby", extra.hour) : staffObs(g, W, H, extra.hour))));
      draw("staffRight", [mode, [...extra.done]], () => repaint(right.material.map, (g, W, H) => (mode === "standby" ? standby(g, W, H, "Shows observations in Clinical") : mode === "emergency" ? staffEmergency(g, W, H) : staffTasks(g, W, H, extra.done))));
    }
    // the workstation's two screens
    if (on("workstation")) {
      const desk = screenOf(a.workstation, "desk"), arm = screenOf(a.workstation, "arm"), s = { ...extra, emergency: st.emergency };
      draw("desk", [st.emergency, extra.view, [...extra.done]], () => repaint(desk.material.map, (g, W, H) => deskScreen(g, W, H, s)));
      draw("arm", [st.emergency, extra.task, [...extra.done]], () => repaint(arm.material.map, (g, W, H) => armScreen(g, W, H, s)));
    }

    // the patient wall: its strip, its buttons and the scene across it. Without the wall, a scene goes on the TV alone
    const wallOn = on("patientWall"), tv = a.tv?.userData;
    const strip = wallOn ? screenOf(a.patientWall, "strip") : null;
    if (strip) {
      const showStrip = st.patient === "info" || st.patient === "orientation" || st.patient === "family" || (st.patient === "scene" && st.wall === "patient");
      strip.visible = showStrip; strip.userData.bezel.visible = showStrip && !st.scene;
      if (showStrip) draw("strip", [st.wall, st.prompts], () => repaint(strip.material.map, (g, W, H) => patientStrip(g, W, H, st)));
      strip.userData.buttons = st.prompts && st.wall === "patient" ? WALL_BUTTONS : []; // clicked in the room, they open the bedside screens
    }
    const sceneOn = !!st.scene;
    // the scene pictures are built the first time a scene is shown, not before
    if (wallOn && (sceneOn || w.wallScene)) {
      const pw = a.patientWall, f = FIT[room.label].patient, W = f.x[1] - f.x[0] - 0.06, H = 1.29;
      if (!w.wallScene) { w.wallScene = scenePlane(W, H, 1024); w.wallScene.position.set(0, 0.675, 0.034); w.wallScene.name = "wall_scene"; w.wallScene.userData.pickable = true; pw.add(w.wallScene); }
      this.show(w.wallScene, sceneOn, st.scene, "wall", now, quick);
    } else if (w.wallScene) this.show(w.wallScene, false, null, "wall", now, true);
    // the ceiling above the bed
    const tray = on("ceilingTray"), rect = ceilingRect(room, tray), H = room.meta.ceiling;
    if ((st.ceiling || w.ceilingScene) && (!w.ceilingScene || w.ceilingTray !== tray)) { // in the tray's sky, or the printed sky's place: built again when the tray comes or goes
      if (w.ceilingScene) { w.ceilingScene.removeFromParent(); room.ceiling.splice(room.ceiling.indexOf(w.ceilingScene), 1); this.fades.delete(w.ceilingScene); }
      w.ceilingScene = scenePlane(rect.w, rect.h, 1024); w.ceilingTray = tray; w.ceilingScene.name = "ceiling_scene";
      w.ceilingScene.rotation.x = Math.PI / 2; w.ceilingScene.position.set(rect.cx, H - 0.008, -rect.cy); w.ceilingScene.renderOrder = 2; w.ceilingScene.userData.pickable = true;
      w.ceilingScene.userData.schemeOn = false; w.ceilingScene.visible = false;
      room.root.add(w.ceilingScene); room.ceiling.push(w.ceilingScene); // the dollhouse lifts it off with the ceiling
      key.ceiling = null;
    }
    if (w.ceilingScene) this.show(w.ceilingScene, !!st.ceiling, st.ceiling, "ceiling", now, quick);

    // the TV: on the wall it follows the switch. Alone, it shows only a scene that was chosen, and otherwise its own choice
    if (tv) {
      const cur = tv.screen.material === tv.sceneOn ? "scene" : tv.screen.material === tv.familyOn ? "family" : tv.screen.material === tv.on ? "on" : tv.screen.material === tv.orientOn ? "orientation" : "off";
      const scene = wallOn ? st.scene : st.scene && st.scene === st.ceiling ? st.scene : null;
      let want = null;
      if (st.patient === "off") want = wallOn || cur === "scene" || cur === "family" ? "off" : null;
      else if (st.patient === "family") want = "family"; // Family visit: family connection on the TV, with or without the wall
      else if (scene) want = "scene";
      else if (wallOn) want = st.patient === "info" && extra.tv === "on" ? "on" : "orientation";
      if (want === "scene") {
        tv.sceneOn ||= new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true });
        const src = wallOn ? w.wallScene : (w.tvScene ||= scenePlane(1.6, 0.9, 960));
        if (!wallOn) this.paint(w.tvScene, scene, "wall");
        const t = tv.sceneOn.map?.source === src.userData.texture.source ? tv.sceneOn.map : src.userData.texture.clone();
        if (wallOn) this.crop(t, tv.screen, w.wallScene); else { t.offset.set(0, 0); t.repeat.set(1, 1); }
        t.needsUpdate = true;
        tv.sceneOn.map = t; tv.sceneOn.needsUpdate = true;
        tv.sceneOn.opacity = wallOn ? w.wallScene.material.opacity : 1;
        if (wallOn) w.wallScene.userData.follow = tv.sceneOn; // it fades with the wall round it
        tv.screen.material = tv.sceneOn;
      } else if (want === "family") {
        if (!tv.familyOn) {
          const c = document.createElement("canvas"); c.width = 960; c.height = 540;
          const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
          familyScreen(c.getContext("2d"), c.width, c.height); t.needsUpdate = true;
          tv.familyOn = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
        }
        tv.screen.material = tv.familyOn;
      } else if (want && want !== cur) extra.setTv(want === "on" ? true : want === "off" ? false : "orientation");
      else if (!want && (cur === "scene" || cur === "family" || key.tv)) extra.restoreTv();
      key.tv = want;
    }
  }

  /** Paint a scene plane with a scene, once per scene. */
  paint(plane, id, part) {
    if (!id || plane.userData.scene === id) return;
    plane.userData.scene = id;
    const t = plane.userData.texture, c = t.image, g = c.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    drawScene(g, c.width, c.height, id, part);
    t.needsUpdate = true;
  }

  /** The part of the wall's scene behind the TV's screen, so the TV shows the same picture as the wall round it. */
  crop(t, screen, plane) {
    plane.parent.updateWorldMatrix(true, true); screen.updateWorldMatrix(true, false);
    const box = new THREE.Box3().setFromObject(screen), inv = plane.parent.matrixWorld.clone().invert();
    const a = box.min.clone().applyMatrix4(inv), b = box.max.clone().applyMatrix4(inv), p = plane.geometry.parameters;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const px0 = plane.position.x - p.width / 2, py0 = plane.position.y - p.height / 2;
    t.repeat.set((x1 - x0) / p.width, (y1 - y0) / p.height); t.offset.set((x0 - px0) / p.width, (y0 - py0) / p.height);
  }

  /** Fade a scene plane in with a scene, or out: over a share of SCENE_MS, at once with reduced motion. */
  show(plane, on, id, part, now, instant) {
    const target = on ? 1 : 0, u = plane.userData;
    if (on && u.scene !== id) { // a new picture fades in from nothing
      this.paint(plane, id, part);
      plane.material.opacity = 0;
    }
    if (u.target === target && (!on || u.shown === id)) { // already on its way: `instant` finishes it
      if (instant && u.fade) { plane.material.opacity = target; if (u.follow) u.follow.opacity = target; this.settle(plane); }
      return;
    }
    u.target = target; u.shown = on ? id : null;
    if (on) { plane.visible = true; u.schemeOn = true; }
    if (instant) { plane.material.opacity = target; if (u.follow) u.follow.opacity = target; this.settle(plane); return; }
    u.fade = { start: now, from: plane.material.opacity, to: target };
    this.fades.add(plane);
  }
  settle(plane) {
    const u = plane.userData;
    u.fade = null;
    if (u.target === 0) { plane.visible = false; u.schemeOn = false; }
    this.fades.delete(plane);
  }

  /** Once a frame: the scenes' fades. Returns true while one moves. */
  update(now) {
    if (!this.fades.size) return false;
    for (const plane of [...this.fades]) {
      const f = plane.userData.fade, t = Math.max(0, Math.min(1, (now - f.start) / (SCENE_MS * 0.75)));
      plane.material.opacity = f.from + (f.to - f.from) * ease(t);
      if (plane.userData.follow) plane.userData.follow.opacity = plane.material.opacity;
      if (t >= 1) this.settle(plane);
    }
    return true;
  }
  get easing() { return this.fades.size > 0; }
}
