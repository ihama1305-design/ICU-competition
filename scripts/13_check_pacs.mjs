import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = createRequire(path.join(ROOT, "build/apis-tools/package.json"))("playwright");
const SHOTS = path.join(ROOT, "build/shots"); await fs.mkdir(SHOTS, { recursive: true });
const extendedOnly = process.argv.includes("--extended-only");
const presentationOnly = process.argv.includes("--presentation-only");
const read = f => fs.readFile(path.join(ROOT, f), "utf8");
for (const name of ["pacs.js", "pacs-state.js", "pacs-scene.js", "pacs.css", "patient.js", "apis.js", "lights.js"]) assert.equal(await read(`configurator/${name}`), await read(`scripts/site/configurator/${name}`));
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (!pathname.startsWith("/ICU-competition/")) throw new Error("subpath required");
    let file = path.resolve(ROOT, decodeURIComponent(pathname.slice(17)));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) throw new Error("outside root");
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/ICU-competition`;
let browser, page; const errors = [], missing = [];
const ui = async () => page.evaluate(() => window.__config.pacs());
const waitAnimation = () => page.waitForFunction(() => !window.__config.pacs().transitioning && !window.__config.state().moving, null, { timeout: 60000 });
const choose = async id => { await page.locator(`[data-scenario="${id}"]`).click(); };
try {
  browser = await chromium.launch({ executablePath: process.env.APIS_BROWSER || (process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : undefined), headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  page = await browser.newPage({ viewport: { width: 1440, height: 960 }, reducedMotion: "reduce" });
  page.on("pageerror", e => errors.push(String(e))); page.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) missing.push(r.url()); });
  await page.goto(`${base}/configurator/?tier=low`);
  await page.waitForFunction(() => window.__configReady || window.__configErrors?.length, null, { timeout: 180000 });
  assert.deepEqual(await page.evaluate(() => window.__configErrors), []);
  console.log("PASS boot, source copies and shared patient module");
  for (const room of (extendedOnly || presentationOnly ? [] : process.argv.includes("--scene-only") ? ["W1"] : ["W1", "W3"])) {
    await page.evaluate(r => window.__config.room(r), room);
    const original = await page.evaluate(() => ({ code: window.__config.code(), selected: window.__config.selected(), parts: window.__config.partNames(), eye: window.__config.eye() }));
    assert.equal(Object.keys(await page.evaluate(() => window.__config.patient().anchors)).length, 6);
    assert.ok((await page.evaluate(() => window.__config.patient().routes)).every(Boolean));
    await page.locator("#openPacs").click(); await waitAnimation();
    let state = await ui(); assert.equal(state.active, true); assert.equal(state.readings.hr, 78); assert.ok(state.monitorMaterials > 0); assert.ok(state.connections.includes("monitor"));
    assert.equal(state.environment.light, 0.65); assert.equal(state.environment.blinds, 0.5);
    await page.screenshot({ path: path.join(SHOTS, `pacs_${room}_stable.png`) });
    console.log(`PASS ${room} patient, labeled routes, existing monitor texture, stable preferences, lighting and blinds`);
    if (!process.argv.includes("--scene-only")) {
      await choose("possible");
      const before = (await ui()).environment; assert.equal(before.light, 1);
      assert.equal(await page.locator("#pacsApprove").isDisabled(), true);
      await page.locator("#pacsReviewed").check(); assert.equal((await ui()).approval, "pending");
      await page.locator("#pacsReject").click(); assert.deepEqual((await ui()).environment, before);
      await page.locator("#pacsResponse").click(); await page.locator('[data-choice="audio"]').check();
      await page.locator("#pacsApprove").click(); await waitAnimation();
      state = await ui(); assert.equal(state.approval, "approved"); assert.equal(state.environment.light, 0.65); assert.equal(state.environment.blinds, 0.5); assert.equal(state.environment.audio, 0); assert.equal(state.environment.temperature, 23);
      await page.locator('[data-feedback="unable"]').click(); assert.equal((await ui()).feedback, "unable");
      await page.locator("#pacsBefore").click(); const eye = await page.evaluate(() => window.__config.eye()); assert.equal((await ui()).environment.light, 1);
      await page.locator("#pacsAfter").click(); assert.deepEqual(await page.evaluate(() => window.__config.eye()), eye); assert.equal((await ui()).environment.light, 0.65);
      await page.locator("#pacsCameraResume").click();
      await page.locator("#pacsPreferences").click(); await page.locator('#pacsProfile [name="lighting"]').selectOption("dim");
      await page.locator('#pacsProfile [type="submit"]').click(); assert.equal((await ui()).approval, "none"); assert.equal((await ui()).environment.light, 0.65);
      await choose("deterioration"); assert.equal((await ui()).warning, true); assert.equal(await page.locator("#pacsResponse").isDisabled(), true);
      await page.locator("#pacsAcknowledge").click(); assert.equal((await ui()).warning, true); assert.equal((await ui()).acknowledged, true);
      assert.match(await page.locator("#pacsAckStatus").textContent(), /ACTIVE/);
      await page.screenshot({ path: path.join(SHOTS, `pacs_${room}_alert.png`) });
      await page.locator("#pacsReset").click(); assert.equal((await ui()).scenario, "stable"); assert.equal((await ui()).warning, false);
      console.log(`PASS ${room} approval/rejection, selected responses, independent feedback, same-camera comparison, preference invalidation, alert priority and reset`);
    }
    await page.locator("#pacsExit").click(); await page.waitForFunction(() => !window.__config.pacs().active);
    const restored = await page.evaluate(() => ({ code: window.__config.code(), selected: window.__config.selected(), parts: window.__config.partNames(), eye: window.__config.eye() }));
    assert.deepEqual(restored, original);
    await page.locator("#openApis").click(); assert.equal(await page.evaluate(() => window.__config.apis().active), true);
    await page.locator('[data-attachment="iv"]').click(); await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__config.apis().active);
    console.log(`PASS ${room} exact original room/camera/share restoration and APIS interoperability`);
  }
  if (!process.argv.includes("--scene-only") && !extendedOnly) {
    // Pause synchronously so the automatic clock cannot race manual-navigation assertions.
    await page.evaluate(() => { document.getElementById("startPacsGuide").click(); document.getElementById("pacsGuidePause").click(); });
    for (let i = 0; i < 11; i++) {
      await page.waitForFunction(index => window.__config.pacs().guide?.index === index, i, { timeout: 30000 });
      if (i === 6) assert.equal((await ui()).approval, "approved");
      if (i === 8) assert.equal((await ui()).warning, true);
      if (i < 10) await page.locator("#pacsNext").click();
    }
    await page.locator("#pacsPrevious").click(); assert.equal((await ui()).guide.index, 9);
    await page.locator("#pacsRestart").click(); assert.equal((await ui()).guide.index, 0); assert.equal((await ui()).warning, false);
    await page.locator("#pacsGuideExit").click(); assert.equal((await ui()).guide, null);
    await page.locator("#pacsExit").click();
    console.log("PASS guided presentation forward/back/restart/exit and role-play safety transitions");
    await page.setViewportSize({ width: 390, height: 844 }); await page.locator("#sheet").click(); await page.locator("#openPacs").click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.locator("#pacsPreferences").click(); assert.equal(await page.locator("#pacsProfile").evaluate(d => d.scrollWidth <= d.clientWidth + 1), true);
    await page.keyboard.press("Escape"); assert.equal((await ui()).active, true);
    await page.screenshot({ path: path.join(SHOTS, "pacs_mobile.png") });
    await page.keyboard.press("Escape"); assert.equal((await ui()).active, false);
    console.log("PASS mobile layout, preference dialog and nested Escape handling");
  }
  if (extendedOnly) {
    await page.locator("#openPacs").click();
    await page.locator('[data-pacs-view="patient"]').click(); await waitAnimation();
    await page.locator("#pacsConnections").click();
    await page.screenshot({ path: path.join(SHOTS, "pacs_patient_routes.png") });
    const point = await page.evaluate(() => window.__config.itemPoint("Patient head"));
    await page.mouse.click(point.x, point.y);
    assert.match(await page.locator("#objectTitle").textContent(), /Patient|Respiratory/);
    await page.locator("#closeObjectCard").click();
    await page.locator('[data-pacs-view="monitor"]').click();
    await page.screenshot({ path: path.join(SHOTS, "pacs_existing_monitor.png") });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await choose("possible"); await page.locator("#pacsReviewed").check();
    const revision = await page.evaluate(() => {
      document.getElementById("pacsApprove").click();
      const animating = window.__config.pacs().transitioning;
      document.querySelector('[data-choice="audio"]').click();
      const revised = window.__config.pacs();
      document.getElementById("pacsReject").click();
      return { animating, revised, rejected: window.__config.pacs() };
    });
    assert.equal(revision.animating, true); assert.equal(revision.revised.transitioning, false);
    assert.equal(revision.revised.approval, "pending"); assert.equal(revision.rejected.approval, "rejected");
    assert.equal(revision.rejected.environment.light, 1);
    await page.waitForTimeout(2600); assert.equal((await ui()).physical.lightLevel, 1);
    await page.locator("#pacsResponse").click();
    const revoked = await page.evaluate(() => {
      document.getElementById("pacsApprove").click();
      document.getElementById("pacsReviewed").click();
      return window.__config.pacs();
    });
    assert.equal(revoked.transitioning, false); assert.equal(revoked.approval, "none");
    console.log("PASS revising/rejecting a running adjustment and withdrawing clinical review cancel pending animation");
    await page.locator("#pacsReviewed").check();
    await page.locator("#pacsApprove").click();
    // Inject the warning during an actual non-reduced lighting/blind transition.
    await page.evaluate(() => { const input = document.getElementById("pacsWarning"); input.checked = true; input.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal((await ui()).warning, true); assert.equal((await ui()).transitioning, false);
    assert.equal((await ui()).physical.lightLevel, 1);
    const frozenBlinds = (await ui()).physical.blindScale;
    await page.waitForTimeout(2800); assert.equal((await ui()).physical.blindScale, frozenBlinds);
    console.log("PASS patient click labels, existing monitor view and clinical warning cancellation of real scene animation");
    await page.locator("#pacsReset").click();
    await page.locator("#pacsGuideStart").click();
    const start = Date.now();
    await page.waitForFunction(() => window.__config.pacs().guide?.index === 10 && window.__config.pacs().guide?.paused, null, { timeout: 100000 });
    const seconds = (Date.now() - start) / 1000;
    assert.ok(seconds >= 70 && seconds <= 95, `Guide took ${seconds} seconds`);
    assert.equal((await ui()).warning, true);
    assert.equal((await ui()).acknowledged, true);
    await page.screenshot({ path: path.join(SHOTS, "pacs_guided_demo.png") });
    console.log(`PASS automatic 11-step presentation completed in ${seconds.toFixed(1)} seconds with persistent clinical alert`);
    await page.locator("#pacsExit").click();
  }
  assert.deepEqual(errors, []); assert.deepEqual(missing, []); assert.deepEqual(await page.evaluate(() => window.__configErrors), []);
  console.log("PASS no uncaught browser errors or missing local assets");
} catch (error) {
  if (page) { console.error(await page.evaluate(() => ({ errors: window.__configErrors, stage: window.__configStage, pacs: window.__config?.pacs() })).catch(() => null)); await page.screenshot({ path: path.join(SHOTS, "pacs_failure.png"), timeout: 10000 }).catch(() => {}); }
  console.error(errors, missing); throw error;
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
