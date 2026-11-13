// Outlines for the feature cards: a soft tint and the edges of each mesh, drawn in the scene itself. The only post-processing
// (bloom) runs on High alone, so an outline pass would vanish on Low; this looks the same on both. Each outline is a child
// of the mesh it outlines, so it follows the mesh as it moves or hides, and it never answers a click.
import * as THREE from "three";

const edges = new WeakMap(); // geometry -> its edges, worked out once
const edgesOf = geometry => {
  if (!edges.has(geometry)) edges.set(geometry, new THREE.EdgesGeometry(geometry, 30));
  return edges.get(geometry);
};
const look = (opacity, edge) => ({
  fill: new THREE.MeshBasicMaterial({ color: "#3fc1c9", transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false }),
  line: new THREE.LineBasicMaterial({ color: "#22a7b0", transparent: true, opacity: edge, toneMapped: false }),
});
// strong: the object under the pointer, or the one whose card is open. soft: everything Explore features marks
const LOOKS = { strong: look(0.2, 1), soft: look(0.09, 0.55) };

export class Highlight {
  constructor() { this.sets = new Map(); } // key -> the outline objects it added

  /** Outline every mesh under `roots` under this key, replacing what the key outlined before. */
  show(key, roots, strength = "strong") {
    this.clear(key);
    const meshes = [], added = [], m = LOOKS[strength];
    for (const r of roots) r.traverse(n => { if (n.isMesh && !n.isInstancedMesh && !n.userData.outline && n.geometry?.attributes.position) meshes.push(n); });
    for (const n of meshes) {
      const fill = new THREE.Mesh(n.geometry, m.fill), line = new THREE.LineSegments(edgesOf(n.geometry), m.line);
      for (const o of [fill, line]) {
        o.userData.outline = true;
        o.raycast = () => {};
        o.castShadow = o.receiveShadow = false;
        o.renderOrder = 20;
        o.matrixAutoUpdate = false; // a child at the mesh's own origin: its matrix is the identity
        n.add(o);
        added.push(o);
      }
    }
    this.sets.set(key, added);
    return added.length > 0;
  }

  clear(key) {
    const had = this.sets.get(key);
    had?.forEach(o => o.removeFromParent());
    this.sets.delete(key);
    return !!had?.length;
  }

  has(key) { return !!this.sets.get(key)?.length; }
}
