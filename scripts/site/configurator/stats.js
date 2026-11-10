// ?stats=1: a small readout for finding out why a device is slow. The GPU's name, the quality tier, pixels per CSS pixel,
// the canvas's size in pixels and the median time to draw a frame. Every few seconds it times five draws, each followed by
// a one-pixel read so the GPU's work is counted, the same way perf_baseline.py does. Nothing is sent anywhere: the visitor
// copies it and sends it themselves. The walkthrough has its own copy of this (it's also a single offline file).

const median = list => { const s = [...list].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : 0; };

/** `draw()` draws one frame; `tier()` names the quality tier; `ready()` is true once the page has drawn its first frame. */
export function showStats({ renderer, draw, tier, ready, page }) {
  const box = document.createElement("section");
  box.id = "stats"; box.className = "stats"; box.setAttribute("aria-label", "Graphics readout");
  box.innerHTML = '<pre id="statsText"></pre><button type="button" id="statsCopy">Copy</button>';
  document.body.append(box);
  const gl = renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
  const gpu = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  const px = new Uint8Array(4);
  let ms = null, frames = 0;
  const text = () => {
    const c = renderer.domElement;
    return [
      `${page} · ?stats=1`,
      `GPU: ${gpu}`,
      `Quality: ${tier()}`,
      `Pixel ratio: ${renderer.getPixelRatio().toFixed(2)} (device ${devicePixelRatio})`,
      `Canvas: ${c.width} × ${c.height} = ${(c.width * c.height / 1e6).toFixed(2)} M pixels`,
      `Window: ${innerWidth} × ${innerHeight}`,
      `Draw: ${ms === null ? "timing…" : `${ms.toFixed(1)} ms median of ${frames} (draw + GPU finish)`}`,
    ].join("\n");
  };
  const show = () => { document.getElementById("statsText").textContent = text(); };
  const measure = async () => {
    if (!ready() || document.hidden || gl.isContextLost()) return;
    const times = [];
    for (let i = 0; i < 6; i++) {
      await new Promise(requestAnimationFrame);
      const t0 = performance.now(); draw(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      if (i) times.push(performance.now() - t0); // the first is a warm-up
      if (times.at(-1) > 500) break; // a very slow device: one frame says enough
    }
    ms = median(times); frames = times.length;
    show();
  };
  document.getElementById("statsCopy").addEventListener("click", async e => {
    try { await navigator.clipboard.writeText(text()); e.target.textContent = "Copied"; } catch { e.target.textContent = "Select and copy"; }
  });
  show();
  setInterval(show, 1000);
  const loop = async () => { await measure(); setTimeout(loop, 3000); }; // one timing at a time, however slow the device
  setTimeout(loop, 1500);
  window.__stats = () => ({ text: text(), ms });
}
