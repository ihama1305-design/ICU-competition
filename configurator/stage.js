// The renderer, the scene and the rooms in it.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

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

const SEE_THROUGH = /^(cfg_facade_glass|ante_glazing|observation_windows|lobby_screen)/;
const CEILING = /^(cfg_ceiling($|_\d)|ceiling_rooms|ceiling_grid|ceiling_panels|cfg_panels)/; // hidden in the dollhouse; the toilet's stays, it's an empty room

export class Stage {
  constructor(canvas, tier) {
    this.tier = tier;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: tier === "low" });
    const r = this.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, tier === "low" ? 1.5 : 2));
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
    this.rooms = new Map(); this.current = null; this.ceilingOn = true;
    this.textures = new THREE.TextureLoader();
    // cheap glass for everything but the room's own front
    this.pane = new THREE.MeshStandardMaterial({ color: "#d9e8ea", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, depthWrite: false });
    if (tier !== "low") {
      // bright strips go above 1 in this HDR buffer, so a threshold at 1 blooms the lights and little else
      const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(r, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, 0.55, 1.25);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio());
    this.composer?.setSize(w, h);
  }

  setBloom(strength) {
    if (!this.bloom) return;
    this.bloom.strength = strength;
    this.bloom.enabled = strength > 0.01;
  }

  draw() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
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
    window.__configStage = "fetching room data";
    const metaRes = await fetch(`${MODEL}${stem}.json`);
    if (!metaRes.ok) throw new Error(`${stem}.json: HTTP ${metaRes.status}`);
    const meta = await metaRes.json();
    window.__configStage = "downloading model";
    const buf = await fetchGz(MODEL + meta.glb, onProgress);
    window.__configStage = "parsing model";
    const gltf = await new GLTFLoader().parseAsync(buf, "");
    window.__configStage = "preparing materials";
    const root = gltf.scene;
    const ao = { cfg_paint_walls: meta.ao.walls, cfg_floor: meta.ao.floor, cfg_ceiling: meta.ao.ceiling };
    const room = { label, meta, root, ceiling: [], ceilingExtras: [], ceilingFixtures: [], parts: {}, anchors: {} };
    root.traverse(n => {
      if (n.name.startsWith("anchor_")) room.anchors[n.name.slice(7)] = n;
      if (!n.isMesh) return;
      const top = this.topName(n, root);
      (room.parts[top] ||= []).push(n);
      if (CEILING.test(top)) room.ceiling.push(n);
      if (top === "cfg_front_glass") {
        return; // FrontGlass gives this its material
      }
      const see = SEE_THROUGH.test(top) || n.material.name === "glass";
      if (see) {
        n.material = this.pane;
      } else {
        n.castShadow = !/^(ceiling_panels|cfg_panels|cfg_tv_screen|cfg_cut_caps)/.test(top);
        n.receiveShadow = true;
        n.material.side = THREE.FrontSide;
        if (/frost/.test(n.material.name)) { n.material.transparent = true; n.material.opacity = 0.72; n.material.depthWrite = false; n.castShadow = false; n.material.side = THREE.DoubleSide; if (this.tier === "low") n.material.transmission = 0; n.renderOrder = 2; }
        if (ao[top]) { n.material.aoMap = this.aoTexture(ao[top]); n.material.aoMapIntensity = 1; n.material.needsUpdate = true; }
        if (n.material.name === "facade_metal") { n.material.metalness = 0.2; n.material.roughness = 0.6; } // no reflections to give metal its colour here
        if (n.material.name === "led_panel") { n.material.emissive = new THREE.Color("#fff3e2"); n.material.emissiveIntensity = 2.2; if (top === "cfg_panels" || top === "cfg_kit_exam_light") n.material = n.material.clone(); if (top === "cfg_kit_exam_light") n.material.emissiveIntensity = 0.55; }
        if (n.material.metalness > 0.5) n.material.roughness = Math.max(n.material.roughness, 0.42); // polished metal glints past the bloom threshold
        if (top === "cfg_blinds") { n.material.side = THREE.DoubleSide; n.material.color.set("#e9e4d8"); }
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
    this.renderer.shadowMap.needsUpdate = true;
  }

  setCeiling(on) {
    this.ceilingOn = on;
    this.refreshCeiling();
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** The ceiling and what's fixed to it: hidden in the dollhouse, and each fixture only with its own scheme. */
  refreshCeiling() {
    const room = this.current;
    if (!room) return;
    room.ceiling.forEach(n => { n.visible = this.ceilingOn && n.userData.schemeOn !== false; });
    room.ceilingFixtures.forEach(n => { n.visible = this.ceilingOn && n.userData.schemeOn === true; });
    room.ceilingExtras.forEach(n => { n.visible = this.ceilingOn && room.addons?.sky === n && n.userData.schemeOn === true; });
  }
}
