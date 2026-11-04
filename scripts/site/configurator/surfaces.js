// Finishes for the walls, floor and ceiling, all drawn here from a seeded generator: no image files, nothing to license,
// and the same room for everyone. A texture is only drawn the first time it's chosen.
import * as THREE from "three";

function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texture(w, h, draw, { data = false } = {}) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function speckle(g, w, h, rnd, count, colours, min, max) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colours[Math.floor(rnd() * colours.length)];
    const s = min + rnd() * (max - min);
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
}

function drawPlanks(g, w, h, { base, dark, planks, vertical, seed }) {
  const rnd = random(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const across = vertical ? w : h, along = vertical ? h : w, pw = across / planks;
  for (let p = 0; p < planks; p++) {
    const shade = rnd() * 0.16;
    const x0 = p * pw;
    const rect = (a, b, la, lb) => (vertical ? g.fillRect(a, b, la, lb) : g.fillRect(b, a, lb, la));
    g.fillStyle = `rgba(70, 42, 18, ${shade})`;
    rect(x0, 0, pw, along);
    for (let i = 0; i < 46; i++) {
      g.fillStyle = `rgba(70, 42, 18, ${0.03 + rnd() * 0.08})`;
      rect(x0 + rnd() * pw, rnd() * along, 1 + rnd() * 2, 40 + rnd() * along * 0.5);
    }
    g.fillStyle = dark;
    rect(x0, 0, 2, along);
    if (!vertical) { g.fillRect(rnd() * along, x0, 2, pw); }
  }
}

function drawDunes(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, "#9fc4d8"); sky.addColorStop(0.7, "#f1dcc0"); sky.addColorStop(1, "#f6c99a");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255, 244, 220, 0.9)";
  g.beginPath(); g.arc(w * 0.7, h * 0.42, h * 0.055, 0, 7); g.fill();
  const layers = [["#e6bd8f", 0.5, 0.05, 1.6, 0.4], ["#d9a673", 0.58, 0.07, 1.1, 1.9], ["#c98f5c", 0.68, 0.08, 1.4, 3.1], ["#b57a4a", 0.8, 0.07, 0.9, 5.2]];
  for (const [colour, y, amp, freq, phase] of layers) {
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) {
      const t = x / w;
      g.lineTo(x, h * (y + amp * Math.sin(t * Math.PI * 2 * freq + phase) + amp * 0.35 * Math.sin(t * Math.PI * 5 * freq + phase * 2)));
    }
    g.lineTo(w, h); g.fill();
  }
}

function drawSea(g, w, h) {
  const sky = g.createLinearGradient(0, 0, 0, h * 0.5);
  sky.addColorStop(0, "#bfe0ea"); sky.addColorStop(1, "#f4efe0");
  g.fillStyle = sky; g.fillRect(0, 0, w, h);
  const layers = [["#8fcfd0", 0.5, 0.012, 4, 0.2], ["#62b6bb", 0.58, 0.018, 3, 1.4], ["#3f9ca6", 0.67, 0.024, 2.4, 2.8], ["#2a8592", 0.77, 0.03, 1.8, 4.4], ["#1c6d7c", 0.88, 0.034, 1.4, 0.9]];
  for (const [colour, y, amp, freq, phase] of layers) {
    g.fillStyle = colour;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * (y + amp * Math.sin((x / w) * Math.PI * 2 * freq + phase)));
    g.lineTo(w, h); g.fill();
  }
  const rnd = random(11);
  g.strokeStyle = "rgba(255, 255, 255, 0.35)"; g.lineWidth = 2;
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w, y = h * (0.55 + rnd() * 0.42), l = 20 + rnd() * 60;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y - 4, x + l, y); g.stroke();
  }
}

/** The lattice of an eight-pointed star repeated on a square grid. Drawn light on `back` for colour, or white on black for relief. */
function drawLattice(g, s, back, wood, line) {
  g.fillStyle = back; g.fillRect(0, 0, s, s);
  g.strokeStyle = wood; g.lineWidth = line; g.lineJoin = "miter";
  const star = (cx, cy, r) => {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8 + Math.PI / 8, rr = i % 2 ? r * 0.56 : r;
      g[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath(); g.stroke();
  };
  for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s], [s / 2, s / 2]]) star(x, y, s * 0.31);
  g.beginPath();
  for (const [ax, ay, bx, by] of [[0, s / 2, s * 0.24, s / 2], [s, s / 2, s * 0.76, s / 2], [s / 2, 0, s / 2, s * 0.24], [s / 2, s, s / 2, s * 0.76]]) { g.moveTo(ax, ay); g.lineTo(bx, by); }
  g.stroke();
}

const DRAW = {
  wood: () => texture(1024, 1024, (g, w, h) => drawPlanks(g, w, h, { base: "#b9875a", dark: "rgba(50, 28, 12, 0.5)", planks: 6, vertical: true, seed: 3 })),
  fabric: () => texture(1024, 1024, (g, w, h) => {
    const rnd = random(5);
    g.fillStyle = "#6f8f90"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) { g.fillStyle = `rgba(255, 255, 255, ${0.02 + rnd() * 0.05})`; g.fillRect(0, y, w, 1); }
    for (let x = 0; x < w; x += 3) { g.fillStyle = `rgba(20, 45, 50, ${0.02 + rnd() * 0.05})`; g.fillRect(x, 0, 1, h); }
    g.fillStyle = "rgba(20, 40, 45, 0.5)"; g.fillRect(0, 0, 5, h); g.fillRect(0, 0, w, 5); // the seam between panels
  }),
  dunes: () => texture(1400, 1200, drawDunes),
  sea: () => texture(1400, 1200, drawSea),
  mashrabiya: () => texture(512, 512, (g, w) => drawLattice(g, w, "#efe6d6", "#b08a5a", 11)),
  mashrabiya_bump: () => texture(512, 512, (g, w) => drawLattice(g, w, "#222222", "#ffffff", 11), { data: true }),
  sand: () => texture(1024, 1024, (g, w, h) => {
    g.fillStyle = "#bba88c"; g.fillRect(0, 0, w, h);
    speckle(g, w, h, random(7), 9000, ["rgba(255,255,255,0.10)", "rgba(70,50,30,0.09)", "rgba(120,90,60,0.08)"], 1, 3);
  }),
  oak: () => texture(1024, 1024, (g, w, h) => drawPlanks(g, w, h, { base: "#d3bb96", dark: "rgba(80, 55, 30, 0.35)", planks: 8, vertical: false, seed: 9 })),
  terrazzo: () => texture(1024, 1024, (g, w, h) => {
    const rnd = random(13);
    g.fillStyle = "#d4d0c8"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = ["#a79f92", "#8b8d8a", "#ece7dc", "#c29f7c", "#6f7a7c"][Math.floor(rnd() * 5)];
      const x = rnd() * w, y = rnd() * h, r = 2 + rnd() * 9, a = rnd() * 6.3;
      g.beginPath();
      for (let k = 0; k < 5; k++) { const q = a + (k * 6.28) / 5, rr = r * (0.6 + rnd() * 0.6); g[k ? "lineTo" : "moveTo"](x + Math.cos(q) * rr, y + Math.sin(q) * rr); }
      g.fill();
    }
  }),
  slate: () => texture(1024, 1024, (g, w, h) => {
    const rnd = random(17);
    g.fillStyle = "#8e9aa0"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 140;
      const c = g.createRadialGradient(x, y, 0, x, y, r);
      const tone = rnd() > 0.5 ? "255,255,255" : "30,45,55";
      c.addColorStop(0, `rgba(${tone},0.06)`); c.addColorStop(1, `rgba(${tone},0)`);
      g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, rnd, 5000, ["rgba(255,255,255,0.05)", "rgba(20,30,40,0.06)"], 1, 2);
  }),
  sky: () => texture(1400, 1000, (g, w, h) => {
    const rnd = random(23);
    const s = g.createLinearGradient(0, 0, w, h);
    s.addColorStop(0, "#7fbce6"); s.addColorStop(1, "#c4e3f4");
    g.fillStyle = s; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const cx = rnd() * w, cy = rnd() * h, size = 40 + rnd() * 90;
      for (let k = 0; k < 14; k++) {
        const x = cx + (rnd() - 0.5) * size * 2.4, y = cy + (rnd() - 0.5) * size * 0.8, r = size * (0.3 + rnd() * 0.5);
        const c = g.createRadialGradient(x, y, 0, x, y, r);
        c.addColorStop(0, "rgba(255,255,255,0.55)"); c.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  }),
};

const made = new Map();
function make(name) {
  if (!made.has(name)) made.set(name, DRAW[name]());
  return made.get(name);
}

/** A repeat of one drawn texture for this surface. Shares the image; only the scale is its own. */
export function drawn(name, repeatX = 1, repeatY = 1) {
  const t = make(name).clone();
  t.repeat.set(repeatX, repeatY);
  t.needsUpdate = true;
  return t;
}

// how each look is laid onto a surface: `tile` is the metres one copy of the texture covers; no tile stretches it over the whole surface
const LOOKS = {
  feature: {
    wood: { map: "wood", tile: [1.2, 2.4], roughness: 0.5 },
    fabric: { map: "fabric", tile: [0.6, 1.2], roughness: 0.95 },
    dunes: { map: "dunes", roughness: 0.75 },
    sea: { map: "sea", roughness: 0.75 },
    mashrabiya: { map: "mashrabiya", bump: "mashrabiya_bump", tile: [0.45, 0.45], roughness: 0.6 },
  },
  floor: {
    sand: { map: "sand", tile: [1.2, 1.2], roughness: 0.42 },
    oak: { map: "oak", tile: [2.4, 2.4], roughness: 0.46 },
    terrazzo: { map: "terrazzo", tile: [1.1, 1.1], roughness: 0.3 },
    slate: { map: "slate", tile: [1.6, 1.6], roughness: 0.5 },
  },
};

/** Put a look on a room's surface. Returns false if the surface should be hidden. */
export function applyLook(room, target, lookName) {
  const look = LOOKS[target][lookName];
  const part = target === "feature" ? "cfg_feature_wall" : "cfg_floor";
  const meshes = room.parts[part] || [];
  if (!look) {
    meshes.forEach(n => { n.visible = false; });
    return;
  }
  const m = room.meta;
  const size = target === "feature" ? [m.feature.length, m.feature.height] : [m.room[2] - m.room[0], m.room[3] - m.room[1]];
  const rx = look.tile ? size[0] / look.tile[0] : 1, ry = look.tile ? size[1] / look.tile[1] : 1;
  for (const n of meshes) {
    n.visible = true;
    const mat = n.material;
    mat.map?.dispose();
    mat.bumpMap?.dispose();
    mat.map = drawn(look.map, rx, ry);
    mat.bumpMap = look.bump ? drawn(look.bump, rx, ry) : null;
    mat.bumpScale = 3;
    mat.color.set(0xffffff);
    mat.roughness = look.roughness;
    mat.metalness = 0;
    mat.needsUpdate = true;
  }
}
