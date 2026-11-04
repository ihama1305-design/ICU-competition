// Sun, sky and night. The sun follows a real path at the site's latitude, on the one date whose path passes through
// the spec's sun (azimuth 250, elevation 32), so at about 15:32 the light comes from where it does in the renders.
import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";

const rad = d => (d * Math.PI) / 180;
const deg = r => (r * 180) / Math.PI;

/** Solar time in hours -> elevation and azimuth in degrees, azimuth clockwise from the model's north. */
export function sunAt(hour, site) {
  const lat = rad(site.latitude_deg), dec = rad(site.declination_deg), h = rad((hour - 12) * 15);
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(h));
  const az = Math.atan2(-Math.cos(dec) * Math.sin(h), Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.cos(h) * Math.sin(lat));
  return { elevation: deg(el), azimuth: (deg(az) + site.north_offset_deg + 360) % 360 };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Daylight {
  constructor(scene, site, W2T) {
    this.scene = scene; this.site = site; this.W2T = W2T;
    this.centre = new THREE.Vector3();
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 5; u.rayleigh.value = 1.1; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    scene.add(this.sky);

    // over the sky as the sun goes down: a plain gradient, dark enough for the room's own lighting to read
    this.nightMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, toneMapped: false,
      uniforms: { fade: { value: 0 }, low: { value: new THREE.Color("#1a2a38") }, high: { value: new THREE.Color("#04080f") } },
      vertexShader: "varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 d;\nuniform float fade;\nuniform vec3 low, high;\nvoid main() {\n  gl_FragColor = vec4(mix(low, high, smoothstep(-0.02, 0.45, d.y)), fade);\n  #include <colorspace_fragment>\n}",
    });
    this.night = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 16), this.nightMat);
    this.night.renderOrder = -1;
    scene.add(this.night);

    this.ground = new THREE.Mesh(new THREE.CircleGeometry(3000, 48), new THREE.MeshStandardMaterial({ color: "#c2ae8c", roughness: 1, envMapIntensity: 0 }));
    this.groundColour = this.ground.material.color.clone();
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -18;
    scene.add(this.ground);

    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    const c = this.sun.shadow.camera;
    c.left = -16; c.right = 16; c.top = 16; c.bottom = -16; c.near = 1; c.far = 160;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xdfeaf2, 0xbcae97, 1);
    scene.add(this.hemi);
  }

  setCentre(x, y) { this.centre.copy(this.W2T(x, y, 1.4)); }

  /** Returns how far into the day it is, 0 at night to 1 in full daylight. */
  apply(hour) {
    const { elevation: el, azimuth: az } = sunAt(hour, this.site);
    const e = rad(el), a = rad(az);
    const to = this.W2T(Math.cos(e) * Math.sin(a), Math.cos(e) * Math.cos(a), Math.sin(e)).normalize();
    this.sky.material.uniforms.sunPosition.value.copy(to);
    const day = smooth(-4, 14, el), lit = smooth(0, 8, el);
    this.nightMat.uniforms.fade.value = 1 - smooth(-7, 3, el);
    this.night.visible = this.nightMat.uniforms.fade.value > 0.001;
    this.sky.visible = this.nightMat.uniforms.fade.value < 0.999;

    this.sun.intensity = 3.4 * lit;
    this.sun.color.setHSL(0.09, 0.9 * (1 - smooth(4, 30, el)), 0.5 + 0.5 * smooth(4, 30, el));
    this.sun.position.copy(this.centre).addScaledVector(to, 70);
    this.sun.target.position.copy(this.centre);
    this.sun.target.updateMatrixWorld();

    this.ground.material.color.copy(this.groundColour).multiplyScalar(0.05 + 0.95 * day); // the room's hemisphere light mustn't light up the desert at night
    this.hemi.intensity = 0.42 + 1.3 * day;
    this.scene.environmentIntensity = 0.3 + 0.4 * day;
    return day;
  }
}
