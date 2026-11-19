// The compact visitor chair: how big it is and where it stands (chair.js draws it). Data only, with no Three.js, so the
// checks can read it in Node. Plan metres: x east, y north.
//
// The sizes are a student's design assumptions, chosen to sit inside the range of ordinary guest armchairs and then fitted to
// the floor measured in each room model. No product was measured and nothing here is a specification.

/** The chair's outside size in metres, its seat and arm heights, and the gap left open between seat and back for a cloth. */
export const CHAIR = { width: 0.66, depth: 0.64, height: 0.92, seat: 0.46, arm: 0.65, seatWidth: 0.5, seatDepth: 0.5, cleanGap: 0.04 };

/**
 * The chair's bay, per room: its centre, and the way the seat faces in degrees anticlockwise from east. By the window on
 * the far side of the bed from the door, turned a little toward the bed head. Measured against each room model so the
 * chair stands on the open floor, outside the keep-clear areas round the bed, the door's approach, the wardrobe's front
 * and the walking route (14_check_features.mjs runs layout.js on both).
 */
export const CHAIR_BAY = {
  W1: { at: [8.84, 28.98], faces: 0 }, // square to the room: the floor by this window is narrower, and a turned chair would cross its edge
  W3: { at: [6.9, 19.9], faces: 10 },
};

/** How far the bay's floor marking stands outside the chair, in metres. Drawn only with the circulation overlay. */
export const BAY_MARGIN = 0.1;

/** The four corners of a rectangle `w` wide and `d` deep centred on `at`, its depth along the way it `faces`. */
export function turned(at, faces, w, d) {
  const t = (faces * Math.PI) / 180, fx = Math.cos(t), fy = Math.sin(t), sx = -fy, sy = fx;
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => [at[0] + (fx * a * d) / 2 + (sx * c * w) / 2, at[1] + (fy * a * d) / 2 + (sy * c * w) / 2]);
}

/** The chair's footprint in its bay, as a polygon, and the bay's marking a margin outside it. */
export const chairFootprint = label => turned(CHAIR_BAY[label].at, CHAIR_BAY[label].faces, CHAIR.width, CHAIR.depth);
export const bayOutline = label => turned(CHAIR_BAY[label].at, CHAIR_BAY[label].faces, CHAIR.width + 2 * BAY_MARGIN, CHAIR.depth + 2 * BAY_MARGIN);

/** The footprint as the layout check takes it: one box [x0, y0, z0, x1, y1, z1] round the turned chair. */
export function chairBox(label) {
  const p = chairFootprint(label), xs = p.map(q => q[0]), ys = p.map(q => q[1]);
  return [Math.min(...xs), Math.min(...ys), 0, Math.max(...xs), Math.max(...ys), CHAIR.height].map(v => +v.toFixed(3));
}

/** Plain facts for the chair's card and the summary: the footprint in square metres, and the sizes as words. */
export const CHAIR_FACTS = {
  area: +(CHAIR.width * CHAIR.depth).toFixed(2),
  size: `${Math.round(CHAIR.width * 100)} cm wide, ${Math.round(CHAIR.depth * 100)} cm deep and ${Math.round(CHAIR.height * 100)} cm high, with the seat ${Math.round(CHAIR.seat * 100)} cm up`,
};
