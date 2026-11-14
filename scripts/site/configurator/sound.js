// Demo sound: the only file on the site that names an audio API. Check 12 holds every other file to that, and forbids
// capture and speech recognition everywhere, this file included. Playback only, synthesized here: no audio files, no
// third-party sounds, no speech. Nothing plays until the visitor presses Play demo sound, and nothing here ever listens.
//
// It is quiet and unmistakable. The master level is capped low, and no sound imitates a medical alarm: alarms sit at
// 800 Hz to 3.15 kHz in repeated bursts (Darbyshire and Young, Crit Care 2013), so every tone here is a single soft note
// under 600 Hz, at uneven intervals. Everything heard is also shown on screen, and each scene ends by itself.
import { FITTINGS, SOURCES, sourceLevel } from "./acoustic.js";

const CAP = 0.12;    // the loudest the master ever gets, of full scale
const FADE = 0.35;   // seconds, in and out
let ctx = null, master = null, noise = null;
let scene = null;    // { name, nodes, timers, end }

const level = dB => 10 ** ((dB - 60) / 20); // a source's illustrative level as a gain, relative to 60 dBA
const ALL_ON = Object.fromEntries(Object.keys(FITTINGS).map(k => [k, true]));
const sourceById = id => SOURCES.find(s => s.id === id);

function start() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // two seconds of white noise, shared by every noisy source
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") ctx.resume();
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
  master.gain.linearRampToValueAtTime(CAP, ctx.currentTime + FADE);
}

/** A looped noise through a filter, into a gain the scene can turn up and down. */
function noiseVoice(type, freq, q = 0.7) {
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = noise; src.loop = true;
  filter.type = type; filter.frequency.value = freq; filter.Q.value = q;
  gain.gain.value = 0;
  src.connect(filter).connect(gain).connect(master);
  src.start();
  scene.nodes.push(src);
  return gain;
}

/** One soft note: a sine that rises over 40 ms and dies away. */
function note(freq, gain, at, length = 0.45) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.value = Math.min(freq, 590);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  o.connect(g).connect(master);
  o.start(at); o.stop(at + length + 0.05);
}

/** A thud: low noise that stops quickly. Softer and slower with a soft-close door. */
function thud(gain, at, soft) {
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise;
  filter.type = "lowpass"; filter.frequency.value = soft ? 110 : 180;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + (soft ? 0.25 : 0.01));
  g.gain.exponentialRampToValueAtTime(0.0001, at + (soft ? 0.9 : 0.35));
  src.connect(filter).connect(g).connect(master);
  src.start(at); src.stop(at + 1);
}

const later = (ms, fn) => { const t = setTimeout(fn, ms); scene.timers.push(t); return t; };

/**
 * The noisy room, then the same room with the fittings: about nine seconds each. onEvent(sourceId) is called as each
 * sound starts, so the page can show it; onPart("without" | "with") as each half starts; onEnd() when it's over.
 */
function noisyRoom({ onEvent, onPart, onEnd }) {
  const fans = noiseVoice("lowpass", 260), vent = noiseVoice("bandpass", 520, 0.9), talk = noiseVoice("bandpass", 900, 0.6);
  const HALF = 9000;
  const part = (on, offset) => {
    const lv = id => level(sourceLevel(sourceById(id), on));
    later(offset, () => {
      onPart(Object.keys(on).length ? "with" : "without");
      const t = ctx.currentTime;
      fans.gain.setTargetAtTime(lv("fans") * 0.7, t, 0.3);
      talk.gain.setTargetAtTime(0, t, 0.2);
    });
    // the ventilator breathes in every four seconds or so
    for (let k = 0; k < 2; k++) later(offset + 600 + k * 4200, () => {
      onEvent("ventilator");
      const t = ctx.currentTime;
      vent.gain.cancelScheduledValues(t);
      vent.gain.setTargetAtTime(lv("ventilator") * 0.9, t, 0.5);
      vent.gain.setTargetAtTime(0.0001, t + 1.6, 0.6);
    });
    // the monitor and the pumps: single soft notes, never in a pattern
    for (const [ms, id, f] of [[1300, "monitor", 523], [3700, "pumps", 392], [5600, "monitor", 494], [7900, "pumps", 370]]) {
      later(offset + ms, () => { onEvent(id); note(f, lv(id) * 0.5, ctx.currentTime); });
    }
    // talk going past in the corridor: bursts of filtered noise, like voices through a wall, with no words
    later(offset + 2200, () => {
      onEvent("corridor");
      const t = ctx.currentTime, g = lv("corridor") * 0.6;
      for (let i = 0; i < 12; i++) talk.gain.setTargetAtTime(Math.random() < 0.3 ? 0.0001 : g * (0.5 + Math.random() * 0.5), t + i * 0.22, 0.05);
      talk.gain.setTargetAtTime(0.0001, t + 2.8, 0.2);
    });
    later(offset + 6600, () => { onEvent("door"); thud(lv("door") * 0.9, ctx.currentTime, !!on.softClose); });
  };
  part({}, 0);
  part(ALL_ON, HALF);
  later(2 * HALF, () => onEnd());
}

/** A restful sound for a patient it suits: a slow, low chord and a soft swell, about thirty seconds. */
function restful({ onPart, onEnd }) {
  onPart("restful");
  const swell = noiseVoice("lowpass", 420), t = ctx.currentTime, LENGTH = 30;
  for (let s = 0; s < LENGTH; s += 7.5) {
    swell.gain.setTargetAtTime(0.05, t + s, 1.6);
    swell.gain.setTargetAtTime(0.012, t + s + 3.8, 1.8);
  }
  for (const [f, g] of [[196, 0.05], [247, 0.035], [294, 0.03]]) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = "sine"; o.frequency.value = f;
    og.gain.setValueAtTime(0, t);
    og.gain.linearRampToValueAtTime(g, t + 4);
    og.gain.setValueAtTime(g, t + LENGTH - 4);
    og.gain.linearRampToValueAtTime(0, t + LENGTH);
    o.connect(og).connect(master);
    o.start(t); o.stop(t + LENGTH + 0.1);
    scene.nodes.push(o);
  }
  later(LENGTH * 1000, () => onEnd());
}

/**
 * Familiar music, as family might choose it: here an original slow tune, made up for this page, not a recording of anything.
 * Soft triangle notes on a pentatonic scale, all under 600 Hz, legato, about twenty-four seconds.
 */
function music({ onPart, onEnd }) {
  onPart("music");
  const tune = [[294, 1], [330, 1], [392, 2], [330, 1], [294, 1], [262, 2], [294, 1], [330, 1], [392, 1], [440, 1], [392, 3],
    [330, 1], [392, 1], [440, 2], [392, 1], [330, 1], [294, 2], [262, 1], [294, 1], [330, 1], [294, 4]];
  const beat = 0.62, t0 = ctx.currentTime + 0.1;
  let at = t0;
  for (const [f, n] of tune) {
    const o = ctx.createOscillator(), g = ctx.createGain(), len = n * beat;
    o.type = "triangle"; o.frequency.value = Math.min(f, 590);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.07, at + 0.08);
    g.gain.setTargetAtTime(0.04, at + 0.1, 0.3);
    g.gain.setTargetAtTime(0.0001, at + len - 0.05, 0.12);
    o.connect(g).connect(master);
    o.start(at); o.stop(at + len + 0.4);
    scene.nodes.push(o);
    at += len;
  }
  // a low, held note under it
  const bass = ctx.createOscillator(), bg = ctx.createGain();
  bass.type = "sine"; bass.frequency.value = 147;
  bg.gain.setValueAtTime(0, t0); bg.gain.linearRampToValueAtTime(0.035, t0 + 2); bg.gain.setValueAtTime(0.035, at - 2); bg.gain.linearRampToValueAtTime(0, at);
  bass.connect(bg).connect(master); bass.start(t0); bass.stop(at + 0.1); scene.nodes.push(bass);
  later((at - ctx.currentTime) * 1000 + 300, () => onEnd());
}

const SCENES = { noisy: noisyRoom, restful, music };

/**
 * Play a scene: "noisy" (the room without, then with, the fittings), "restful", or "music" (family connection's familiar music). Only ever called from a press on
 * Play demo sound, so a browser's autoplay rule and this site's agree. Replaces any scene already playing.
 */
export function playSound(name, { onEvent = () => {}, onPart = () => {}, onEnd = () => {} } = {}) {
  stopSound();
  start();
  scene = { name, nodes: [], timers: [] };
  const mine = scene;
  SCENES[name]({ onEvent: id => { if (scene === mine) onEvent(id); }, onPart: p => { if (scene === mine) onPart(p); }, onEnd: () => { if (scene === mine) { stopSound(); onEnd(); } } });
}

/** Silence, at once and for certain: on Mute, on Esc, when the tab is hidden, for Emergency-ready, a notice or an alarm. */
export function stopSound() {
  if (!scene) return false;
  const s = scene;
  scene = null;
  s.timers.forEach(clearTimeout);
  const t = ctx.currentTime;
  master.gain.cancelScheduledValues(t);
  master.gain.setValueAtTime(master.gain.value, t);
  master.gain.linearRampToValueAtTime(0, t + 0.12);
  for (const n of s.nodes) { try { n.stop(t + 0.15); } catch { /* already stopped */ } }
  setTimeout(() => { if (!scene && ctx.state === "running") ctx.suspend(); }, 250);
  return true;
}

/** For the page and its check: whether anything is playing, which scene, and whether a sound engine was ever made. */
export const soundState = () => ({ playing: scene?.name ?? null, made: !!ctx, cap: CAP });
