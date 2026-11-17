// When someone comes in: who arrives in the demos, what each wears, and the walk along the route from the door to the
// bedside (layout.js ROUTES). Data and plain arithmetic only, with no Three.js, so check 14 can read it in Node.
// SIMULATED throughout: the demo plays a badge tapped at the door, and a plain figure stands in for the person. Nothing
// recognises anyone: no camera, no face or voice recognition and no tracking. A badge only wakes screens that staff could
// open by hand. The light and the room's mode change only when a person chooses, and the demo says when it plays that person.

/** Who can come in. `top` and `legs` are the figure's clothes; `pass` is what they tap at the door. */
export const ARRIVALS = {
  nurse: { label: "Nurse", pass: "a staff badge", top: "#3d8fa3", legs: "#2f6f80", badge: "#f4f6f5" },
  doctor: { label: "Doctor", pass: "a staff badge", top: "#eef0ee", legs: "#39485c", badge: "#3d8fa3" },
  family: { label: "Family visitor", pass: "a visitor's pass", top: "#c9925f", legs: "#59626c", badge: "#f2c14e" },
};
export const ARRIVAL_ORDER = ["nurse", "doctor", "family"];

export const ARRIVAL_TEXT = {
  figure: "A plain figure standing in for a person in this demo. Nothing recognises anyone: the demo plays a badge tapped at the door.",
  limits: "Simulated: the demo plays the badge, and a plain figure stands in for the person. Nothing recognises anyone: no camera, no face or voice recognition and no tracking.",
};

/**
 * Where the room is watched from while someone comes in, per room, in plan metres: high in the corner at the window end,
 * looking back toward the door, so the door, the route, the bed and the staff panel are in one picture, over the equipment.
 * Not one of the room's views: the demo stands here and puts the view back when it ends.
 */
export const ARRIVAL_VIEW = {
  W1: { eye: [8.3, 27.5, 2.6], look: [14.0, 30.3, 0.4] },
  W3: { eye: [7.4, 18.5, 2.6], look: [13.1, 21.3, 0.4] },
};

/** A calm walking pace in metres a second, the length of one step, and how far a leg and an arm swing, in radians. */
export const WALK = { speed: 1.1, stride: 0.62, leg: 0.5, arm: 0.32, settle: 0.7 };

/** A route's length in metres. */
export const routeLength = points => points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);

/** The point `d` metres along a route, clamped to its ends. */
export function pointAt(points, d) {
  let left = Math.max(0, d);
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i], len = Math.hypot(bx - ax, by - ay);
    if (left <= len || i === points.length - 1) { const t = Math.min(1, left / len); return [ax + (bx - ax) * t, ay + (by - ay) * t]; }
    left -= len;
  }
  return [...points[0]];
}

/**
 * Where a walker is `d` metres along a route, and which way they face: { x, y, heading }, heading in radians from east
 * toward north. The heading looks a little behind and ahead, so a bend is turned through, not snapped. Over the last
 * `WALK.settle` metres they turn toward `face` (the bed), if one is given, and end facing it.
 */
export function along(points, d, face = null) {
  const length = routeLength(points), at = Math.min(length, Math.max(0, d));
  const [x, y] = pointAt(points, at), [bx, by] = pointAt(points, Math.max(0, at - 0.25)), [fx, fy] = pointAt(points, Math.min(length, at + 0.25));
  let heading = Math.atan2(fy - by, fx - bx);
  if (face) {
    const k = Math.min(1, Math.max(0, (at - (length - WALK.settle)) / WALK.settle));
    if (k > 0) {
      const want = Math.atan2(face[1] - y, face[0] - x);
      let turn = want - heading;
      while (turn > Math.PI) turn -= 2 * Math.PI;
      while (turn < -Math.PI) turn += 2 * Math.PI;
      heading += turn * k * k * (3 - 2 * k);
    }
  }
  return { x, y, heading };
}

/** How long a walk of `length` metres takes, in seconds: the pace, and a moment to start and to stop. */
export const walkTime = length => length / WALK.speed + 0.8;

/** How far along a walker is `t` seconds into a walk of `length` metres: away from standing, and back to it. */
export function walked(length, t) {
  const u = Math.min(1, Math.max(0, t / walkTime(length)));
  return length * u * u * (3 - 2 * u);
}
