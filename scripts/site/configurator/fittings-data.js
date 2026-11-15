// Where the Future ICU fittings go (fittings.js draws them), and the view across the room. Data only, with no Three.js, so the
// checks can read it in Node. Measured from the room models, in plan metres: x east, y north.

/**
 * Where each fitting goes, in the model's plan metres (x east, y north). A wall fitting gives its wall's line `y`, the way into
 * the room `into` (+1 north, -1 south) and its span `x` along the wall. The tray is a polygon on the ceiling, with the box the
 * printed sky fits into when both are on, and its row of small downlights by the window.
 */
export const FIT = {
  W1: {
    tray: { poly: [[9.5, 27.5], [12.55, 27.5], [12.55, 31.05], [9.5, 31.05]], sky: [9.62, 27.62, 12.43, 30.93], downlights: [[9.72, 28.0], [9.72, 28.8], [9.72, 29.6], [9.72, 30.4]] },
    staff: { x: [10.0, 12.4], y: 31.61, into: -1 },
    patient: { x: [10.1, 12.3], y: 27.14, into: 1 },
    desk: { x: [8.5, 9.48], y: 27.47, into: 1 },
    chair: [8.82, 29.07], // the visitor chair's place while the workstation is on: its own spot is in front of the desk
    cabinet: { x: [9.35, 9.95], y: 31.61, into: -1 },
  },
  W3: {
    // the south-east corner is cut along the angled wall, 20 cm off it
    tray: { poly: [[8.45, 18.6], [11.44, 18.6], [11.88, 19.26], [11.88, 21.8], [8.45, 21.8]], sky: [8.57, 18.72, 11.36, 21.68], downlights: [[8.62, 19.0], [8.62, 19.7], [8.62, 20.4], [8.62, 21.1]] },
    staff: { x: [9.1, 11.5], y: 22.388, into: -1 },
    patient: { x: [9.56, 11.06], y: 18.14, into: 1 },
    desk: { x: [6.7, 7.9], y: 18.13, into: 1 },
    chair: null, // W3's chair is clear of the desk already
    cabinet: { x: [8.45, 9.05], y: 22.391, into: -1 },
  },
};

/** The view across the room from the front toward the window, at the reference picture's angle. Appended to the views. */
export const ACROSS = {
  W1: { eye: [13.25, 28.85, 1.95], look: [7.8, 29.45, 1.0], hfov: 86 }, // far enough from the angled wall that every move to it stays in the room
  W3: { eye: [12.55, 19.8, 1.95], look: [5.9, 20.65, 1.0], hfov: 86 },
};
