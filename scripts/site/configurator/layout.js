// Is the room's layout clear? One check, used by the Future ICU fittings now and by the room safety scan later: no two solid
// things overlap, and nothing solid stands in a keep-clear area, a door's way, the wardrobe's front or the walking route to the
// bed. Data only, with no Three.js: it works on boxes and areas in the model's plan metres, so the checks can run it in Node.
// The areas are this model's own, set as data and illustrative: a clean result means "no modelled conflict found", never
// that a room is safe, and it isn't a compliance check.

/** How deep the area in front of a door, and in front of the wardrobe, is taken to be, in metres. Illustrative. */
export const DOOR_DEPTH = 0.9, WARDROBE_REACH = 0.6;
/** Half the width of the walking route from the door to the bed. Illustrative. */
export const ROUTE_HALF = 0.35;
/** The walking route from the room's door to the bed's side, per room, in plan metres: clear of the furniture as modelled. */
export const ROUTES = {
  W1: [[16.56, 29.1], [15.4, 30.1], [13.0, 30.2], [12.8, 29.9]],
  W3: [[14.3, 20.7], [12.9, 20.9], [11.95, 20.75]],
};

/** Two boxes [x0, y0, z0, x1, y1, z1] overlap by more than `tol` metres on every axis. */
export const boxesOverlap = (a, b, tol = 0.01) =>
  a[3] - b[0] > tol && b[3] - a[0] > tol && a[4] - b[1] > tol && b[4] - a[1] > tol && a[5] - b[2] > tol && b[5] - a[2] > tol;

/** Whether a point is inside a polygon of [x, y] corners. */
export function inPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** A rectangle as a polygon: `length` along a wall from a to b, `depth` into the room on the side `into` points. */
export function strip(a, b, depth) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len;
  return [a, b, [b[0] + nx * depth, b[1] + ny * depth], [a[0] + nx * depth, a[1] + ny * depth]];
}

/** A route as a chain of rectangles, `half` either side of each leg, with a square at each bend. */
export function corridor(points, half = ROUTE_HALF) {
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], len = Math.hypot(bx - ax, by - ay), nx = (-(by - ay) / len) * half, ny = ((bx - ax) / len) * half;
    out.push([[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]]);
  }
  for (const [x, y] of points.slice(1, -1)) out.push([[x - half, y - half], [x + half, y - half], [x + half, y + half], [x - half, y + half]]);
  return out;
}

/** How much of a box's footprint lies in an area, in square metres, sampled every `step`: 0 when it's clear. */
export function intrusion(box, area, step = 0.05) {
  const [z0, z1] = area.z || [0, 2.1];
  if (box[5] <= z0 || box[2] >= z1) return 0;
  const polys = area.polys || [area.poly];
  let n = 0;
  for (let x = box[0] + step / 2; x < box[3]; x += step) {
    for (let y = box[1] + step / 2; y < box[4]; y += step) {
      if (area.within && !inPolygon(x, y, area.within)) continue;
      if (polys.some(p => inPolygon(x, y, p))) n += 1;
    }
  }
  return n * step * step;
}

/**
 * The check. `solids`: [{ id, label, boxes: [[x0, y0, z0, x1, y1, z1], ...], fitting? }]: an object is the boxes of its
 * parts, so the space under a pendant's arm isn't counted as full. `areas`: [{ id, label, kind, poly or polys, z?, within? }].
 * `mounted`: pairs of ids meant to touch, like the monitor on its pendant. Returns what it found, overlaps first:
 * { level: "overlap" | "clearance", a, b, kind, size }: an overlap is two solid things in one place, and a clearance is a
 * solid thing in an area that should stay clear. An empty list means no modelled conflict was found.
 */
export function checkLayout({ solids, areas = [], mounted = [], tol = 0.01, minArea = 0.005 }) {
  const meant = new Set(mounted.flatMap(([a, b]) => [`${a}|${b}`, `${b}|${a}`]));
  const found = [];
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      if (meant.has(`${a.id}|${b.id}`)) continue;
      let size = 0;
      for (const p of a.boxes) for (const q of b.boxes) if (boxesOverlap(p, q, tol)) {
        size = Math.max(size, Math.min(p[3], q[3]) - Math.max(p[0], q[0]), Math.min(p[4], q[4]) - Math.max(p[1], q[1]));
      }
      if (size) found.push({ level: "overlap", a: a.id, b: b.id, kind: "solid", size: +size.toFixed(3), fitting: !!(a.fitting || b.fitting) });
    }
  }
  for (const s of solids) {
    if (s.wall) continue; // on the wall above head height or flush with it: it takes no floor
    for (const area of areas) {
      const size = s.boxes.reduce((sum, b) => sum + intrusion(b, area), 0);
      if (size >= minArea) found.push({ level: "clearance", a: s.id, b: area.id, kind: area.kind, size: +size.toFixed(3), fitting: !!s.fitting });
    }
  }
  return found.sort((p, q) => (p.level === q.level ? q.size - p.size : p.level === "overlap" ? -1 : 1));
}

/**
 * The room safety scan's suggestion: the nearest spot, within `maxR` metres, where an item would neither overlap anything
 * solid nor stand in an area, trying rings of positions `step` apart around where it is. The item stays on the walkable floor
 * (`within`). Returns { dx, dy } to move it by, or null if nothing near is clear. The visitor moves it: this only points.
 */
export function suggestSpot({ item, solids, areas = [], mounted = [], within, step = 0.15, maxR = 2.4 }) {
  const others = solids.filter(s => s.id !== item.id);
  const fits = (dx, dy) => {
    const boxes = item.boxes.map(b => [b[0] + dx, b[1] + dy, b[2], b[3] + dx, b[4] + dy, b[5]]);
    if (within && !boxes.every(b => [[b[0], b[1]], [b[3], b[1]], [b[3], b[4]], [b[0], b[4]]].every(([x, y]) => inPolygon(x, y, within)))) return false;
    const moved = { ...item, boxes };
    return !checkLayout({ solids: [...others, moved], areas, mounted }).some(f => f.a === item.id || f.b === item.id);
  };
  if (fits(0, 0)) return { dx: 0, dy: 0 };
  for (let r = step; r <= maxR + 1e-9; r += step) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / step));
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 2 * Math.PI, dx = +(r * Math.cos(t)).toFixed(3), dy = +(r * Math.sin(t)).toFixed(3);
      if (fits(dx, dy)) return { dx, dy };
    }
  }
  return null;
}
