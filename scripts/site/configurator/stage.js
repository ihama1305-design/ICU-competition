// The renderer, the scene and the rooms in it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";

const MODEL = "../assets/model/";
export const W2T = (x, y, z = 0) => new THREE.Vector3(x, z, -y); // model (x east, y north, z up) -> three (x, y up, -z north)

/** Download a gzipped file, reporting progress as a fraction. */
async function fetchGz(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    if (total) onProgress?.(got / total);
  }
  return new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
}

const SEE_THROUGH = /^(cfg_facade_glass|ante_glazing|observation_windows|lobby_screen|cfg_front_glass)/;
const CEILING = /^(cfg_ceiling($|_\d)|ceiling_rooms|ceiling_grid|ceiling_panels)/; // hidden in the dollhouse; the toilet's stays, it's an empty room

export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; // the room is static: redrawn only when the sun or the room changes
    RectAreaLightUniformsLib.init();
    this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.04, 8000);
    this.rooms = new Map(); this.current = null;
    // a fixed set of ceiling lights: changing how many there are makes every material recompile
    this.panels = Array.from({ length: 6 }, () => {
      const l = new THREE.RectAreaLight(0xfff0dc, 0, 0.6, 0.6);
      l.rotation.x = -Math.PI / 2;
      this.scene.add(l);
      return l;
    });
    this.textures = new THREE.TextureLoader();
    // cheap glass for everything but the room's own front
    this.pane = new THREE.MeshStandardMaterial({ color: "#d9e8ea", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false });
  }

  aoTexture(file) {
    const t = this.textures.load(MODEL + file);
    t.flipY = false;
    t.colorSpace = THREE.NoColorSpace;
    return t;
  }

  async load(label, onProgress) {
    if (this.rooms.has(label)) return this.rooms.get(label);
    const stem = `room_${label.toLowerCase()}`;
    const metaRes = await fetch(`${MODEL}${stem}.json`);
    if (!metaRes.ok) throw new Error(`${stem}.json: HTTP ${metaRes.status}`);
    const meta = await metaRes.json();
    const buf = await fetchGz(MODEL + meta.glb, onProgress);
    const gltf = await new GLTFLoader().parseAsync(buf, "");
    const root = gltf.scene;
    const ao = { cfg_paint_walls: meta.ao.walls, cfg_floor: meta.ao.floor, cfg_ceiling: meta.ao.ceiling };
    const room = { label, meta, root, ceiling: [], blinds: [], anchors: {} };
    root.traverse(n => {
      if (n.name.startsWith("anchor_")) room.anchors[n.name.slice(7)] = n;
      if (!n.isMesh) return;
      const top = this.topName(n, root);
      if (CEILING.test(top)) room.ceiling.push(n);
      if (top === "cfg_blinds") { room.blinds.push(n); n.visible = false; } // blinds default to up, so the outlook shows
      const see = SEE_THROUGH.test(top) || n.material.name === "glass";
      if (see) {
        n.material = this.pane;
      } else {
        n.castShadow = !/^(ceiling_panels|cfg_tv_screen|cfg_cut_caps)/.test(top);
        n.receiveShadow = true;
        n.material.side = THREE.FrontSide;
        if (/frost/.test(n.material.name)) { n.material.transparent = true; n.material.opacity = 0.72; n.material.depthWrite = false; n.castShadow = false; n.material.side = THREE.DoubleSide; }
        if (ao[top]) { n.material.aoMap = this.aoTexture(ao[top]); n.material.aoMapIntensity = 1; n.material.needsUpdate = true; }
        if (n.material.name === "facade_metal") { n.material.metalness = 0.2; n.material.roughness = 0.6; } // no reflections to give metal its colour here
        if (n.material.name === "led_panel") { n.material.emissive = new THREE.Color("#fff3e2"); n.material.emissiveIntensity = 2.2; }
      }
    });
    this.rooms.set(label, room);
    return room;
  }

  topName(node, root) {
    let n = node;
    while (n.parent && n.parent !== root) n = n.parent;
    return n.name;
  }

  show(room) {
    if (this.current) this.scene.remove(this.current.root);
    this.current = room;
    this.scene.add(room.root);
    this.panels.forEach((l, i) => {
      const p = room.meta.panels[i];
      l.visible = true;
      l.intensity = p ? 30 : 0;
      if (p) l.position.copy(W2T(p[0], p[1], room.meta.ceiling - 0.02));
    });
    this.renderer.shadowMap.needsUpdate = true;
  }

  setCeiling(on) { if (this.current) this.current.ceiling.forEach(n => { n.visible = on; }); this.renderer.shadowMap.needsUpdate = true; }
}
