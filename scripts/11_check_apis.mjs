// Focused integration checks; run from the repo root with Node 20+.
// npm install --prefix build/apis-tools playwright
// Optional: --regression-only for existing controls; --detail-only for NG and walkthrough checks.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "build/apis-tools/package.json"));
const { chromium } = require("playwright");
const SHOTS = path.join(ROOT, "build/shots");
const detailOnly = process.argv.includes("--detail-only");
await fs.mkdir(SHOTS, { recursive: true });
const read = file => fs.readFile(path.join(ROOT, file), "utf8");
for (const name of ["apis.js", "apis-data.js", "apis.css"]) assert.equal(await read(`configurator/${name}`), await read(`scripts/site/configurator/${name}`), `${name}: generated copy matches source`);
assert.equal(await read("configurator/index.html"), await read("scripts/site/configurator.template.html"));
assert.equal((await read("configurator/main.js")).replace(/const SITE = .*;/, "SITE"), (await read("scripts/site/configurator/main.js")).replace(/const SITE = .*;/, "SITE"));
console.log("PASS source / published-file parity");

const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp" };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/ICU-competition/")) { res.writeHead(404); res.end(); return; }
    let file = path.resolve(ROOT, decodeURIComponent(url.pathname.slice("/ICU-competition/".length)));
    if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); res.end(); return; }
    if ((await fs.stat(file)).isDirectory()) file = path.join(file, "index.html");
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream" }); res.end(await fs.readFile(file));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}/ICU-competition`;
let browser, page;
const errors = [], missing = [];
const ready = async pg => {
  await pg.goto(`${base}/configurator/?tier=low`);
  await pg.waitForFunction(() => window.__configReady || window.__configErrors?.length, null, { timeout: 180000 });
  assert.deepEqual(await pg.evaluate(() => window.__configErrors), []);
};
const monitor = pg => {
  pg.on("pageerror", e => errors.push(String(e)));
  pg.on("response", r => { if (r.url().startsWith(base) && r.status() >= 400) missing.push(`${r.status()} ${r.url()}`); });
};
const near = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) < 0.001;
try {
  const chrome = "C:/Program Files/Google/Chrome/Application/chrome.exe";
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  let executablePath = process.env.APIS_BROWSER;
  if (!executablePath && process.platform === "win32") {
    for (const candidate of [chrome, edge]) { try { await fs.access(candidate); executablePath = candidate; break; } catch {} }
  }
  browser = await chromium.launch({ executablePath, headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" }); monitor(page);
  await ready(page);
  for (const room of (process.argv.includes("--regression-only") ? [] : detailOnly ? ["W1"] : ["W1", "W3"])) {
    await page.evaluate(room => window.__config.room(room), room);
    await page.evaluate(() => window.__config.camera("dollhouse", { instant: true }));
    const before = await page.evaluate(() => ({ code: window.__config.code(), eye: window.__config.eye(), parts: window.__config.partNames(), selected: window.__config.selected() }));
    await page.locator("#openApis").click();
    assert.equal(await page.locator("#apisDialog").evaluate(d => d.open), true);
    const inspect = await page.evaluate(() => window.__config.apis());
    assert.equal(inspect.markers, 6); assert.equal(inspect.detailAvailable, true);
    for (const id of (detailOnly ? ["ng"] : ["ng", "iv", "oxygen", "strap", "ecg", "urinary"])) {
      await page.locator(`[data-attachment="${id}"]`).click();
      assert.equal(await page.evaluate(() => window.__config.apis().attachment), id);
      await page.locator("#apisConventional").click();
      const conventional = await page.locator("#apisLayers button").allTextContents();
      await page.locator("#apisProposed").click();
      const proposed = await page.locator("#apisLayers button").allTextContents();
      assert.notDeepEqual(conventional, proposed);
      const limit = await page.locator("#apisLimit").textContent(); assert.ok(limit.length > 90);
      if (id === "ecg") assert.match(limit, /insulating/);
      if (id === "iv") assert.match(limit, /sterile dressing/);
      if (id === "urinary") assert.match(limit, /below bladder/);
      await page.locator("#apisExplode").click(); assert.equal(await page.evaluate(() => window.__config.apis().exploded), true);
      await page.locator("#apisLayers button").nth(1).click(); assert.equal(await page.locator("#apisLayers button").nth(1).getAttribute("aria-pressed"), "true");
      await page.locator("#apisCanvas").focus(); await page.keyboard.press("ArrowRight");
      if (detailOnly) await page.screenshot({ path: path.join(SHOTS, "apis_feeding_tube.png"), fullPage: true });
      if (room === "W1" && id === "strap") await page.screenshot({ path: path.join(SHOTS, "apis_layers.png"), fullPage: true });
      await page.locator("#apisExplode").click();
    }
    await page.locator('[data-mode="materials"]').click(); assert.equal(await page.locator(".apis-material-card").count(), 4);
    await page.locator('[data-mode="routing"]').click();
    const beforeRoute = await page.locator("#apisRouteDiagram").innerHTML();
    await page.locator("#apisMovement").fill("80"); await page.locator("#apisTurn").check();
    assert.notEqual(await page.locator("#apisRouteDiagram").innerHTML(), beforeRoute);
    assert.match(await page.locator("#apisRouteConcerns").textContent(), /Position changed/);
    await page.locator("#apisRouteBefore").click(); assert.match(await page.locator("#apisRouteConcerns").textContent(), /Crossing/);
    await page.locator("#apisRouteAfter").click();
    if (room === "W1") await page.screenshot({ path: path.join(SHOTS, "apis_routing.png"), fullPage: true });
    await page.locator("#apisResetMovement").click(); assert.equal(await page.locator("#apisMovement").inputValue(), "0");
    await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__config.apis().active);
    const after = await page.evaluate(() => ({ code: window.__config.code(), eye: window.__config.eye(), parts: window.__config.partNames(), selected: window.__config.selected(), ceiling: window.__config.state().ceiling }));
    assert.equal(after.code, before.code); assert.deepEqual(after.selected, before.selected); assert.deepEqual(after.parts, before.parts);
    assert.ok(near(after.eye, before.eye), "Closing APIS restores the camera"); assert.equal(after.ceiling, false);
    assert.equal(await page.evaluate(() => document.activeElement.id), "openApis");
    console.log(`PASS ${room}: ${detailOnly ? "corrected feeding-tube example" : "six examples"}, 3D layers, materials, routing, Escape, camera and room-state restoration`);
    // Exercise real raycasting of a bedside marker, not just the modal's navigation buttons.
    const meta = JSON.parse(await read(`assets/model/room_${room.toLowerCase()}.json`));
    const { head, foot } = meta.bed, x = head[0] + foot[1] * 0.14 + foot[0] * 0.47, y = head[1] - foot[0] * 0.14 + foot[1] * 0.47;
    await page.evaluate(({ x, y }) => window.__config.lookFrom([x + 0.1, y + 0.2, 2.3], [x, y, 1.33]), { x, y });
    const pt = await page.evaluate(() => window.__config.apisPoint("ng"));
    await page.mouse.click(pt.x, pt.y); await page.waitForFunction(() => window.__config.apis().active);
    assert.equal(await page.evaluate(() => window.__config.apis().attachment), "ng");
    await page.locator("#apisClose").click(); await page.waitForFunction(() => !window.__config.apis().active);
    await page.locator("#apisMarkers").uncheck();
    assert.equal(await page.evaluate(() => window.__config.apis().enabled), false);
    for (const view of await page.evaluate(() => window.__config.views())) {
      await page.evaluate(view => window.__config.camera(view, { instant: true }), view);
      assert.equal(await page.evaluate(() => window.__config.state().view), view);
    }
    console.log(`PASS ${room}: real marker click, marker toggle and all existing camera views`);
  }
  if (!detailOnly) {
  await page.evaluate(() => { window.__config.theme("desert"); window.__config.time(21); });
  assert.equal(await page.evaluate(() => window.__config.state().night), true);
  const selections = await page.evaluate(() => window.__config.selected());
  await page.locator("#openProfile").click();
  // "Child or teen" left the form when the room became adult ICU only; visiting children still make a room idea
  await page.locator('[name="patientType"]').selectOption("adult");
  await page.locator('[name="children"]').selectOption("yes");
  await page.locator('#profileForm button[type="submit"]').click();
  await page.locator("#profileCompare").click();
  assert.deepEqual(await page.evaluate(() => window.__config.selected()), selections);
  await page.locator("#profileCompare").click(); await page.locator("#profileUndo").click();
  assert.deepEqual(await page.evaluate(() => window.__config.selected()), selections);
  await page.locator("#openSummary").click();
  // The existing summary waits for an asynchronously captured room image.
  await page.waitForFunction(() => document.getElementById("summaryBody").textContent.length > 100, null, { timeout: 60000 });
  await page.locator("#closeSummary").click();
  // Review the shared patient after PACS integration without changing the original profile/option checks.
  if (await page.locator("#openPacs").count()) {
    await page.locator("#openPacs").click();
    await page.locator('[data-pacs-view="patient"]').click();
    await page.locator("#pacsConnections").click();
    await page.screenshot({ path: path.join(SHOTS, "pacs_patient_routes.png") });
    await page.locator("#pacsExit").click();
  }
  await page.evaluate(() => window.__config.startTour()); assert.equal(await page.evaluate(() => window.__config.tour().running), true);
  await page.locator("#openApis").click(); assert.equal(await page.evaluate(() => window.__config.tour().running), false); await page.locator("#apisClose").click();
  const code = await page.evaluate(() => window.__config.code()); await page.reload(); await page.waitForFunction(() => window.__configReady, null, { timeout: 180000 });
  assert.equal(await page.evaluate(() => window.__config.code()), code);
  assert.deepEqual(await page.evaluate(() => window.__configErrors), []);
  console.log("PASS existing themes, day/night, profile comparison and undo, summary, tour and share-code reload");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#sheet").click(); await page.locator("#openApis").click();
  for (const mode of ["attachments", "routing", "materials"]) {
    await page.locator(`[data-mode="${mode}"]`).click();
    assert.equal(await page.locator("#apisDialog").evaluate(d => d.scrollWidth <= d.clientWidth + 1), true, `mobile ${mode}: no horizontal overflow`);
  }
  await page.locator('[data-mode="attachments"]').click(); await page.screenshot({ path: path.join(SHOTS, "apis_mobile.png"), fullPage: true });
  await page.locator("#apisLayers button").nth(1).click();
  assert.equal(await page.locator("#apisLayers button").nth(1).evaluate(b => b === document.activeElement), true, "Layer selection retains keyboard focus");
  await page.keyboard.press("Escape"); await page.waitForFunction(() => !window.__config.apis().active);
  console.log("PASS mobile layout, all tabs and Escape");
  }
  await page.close(); page = await browser.newPage({ viewport: { width: 1366, height: 820 } }); monitor(page);
  await page.goto(`${base}/viewer/`); await page.waitForFunction(() => window.__viewerReady, null, { timeout: 180000 });
  const spec = JSON.parse(await read("spec/icu_spec.json"));
  const corridor = spec.cameras.corridor_eye || [22.3, 27];
  const walkTarget = await page.evaluate(([x, y]) => {
    window.__view("first"); window.__teleport(x, y);
    const target = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].find(([tx, ty]) => window.__pathClear(x, y, tx, ty));
    if (target) window.__face(...target);
    return target;
  }, corridor);
  assert.ok(walkTarget, "Find an unobstructed corridor direction before testing movement");
  const walkBefore = await page.evaluate(() => window.__walker());
  await page.locator("#c").focus(); await page.keyboard.down("w");
  // Software WebGL can take several seconds per frame: wait for movement, not a timer.
  try { await page.waitForFunction(before => { const p = window.__walker(); return Math.hypot(p[0] - before[0], p[1] - before[1]) > 0.1; }, walkBefore, { timeout: 60000 }); }
  finally { await page.keyboard.up("w"); }
  const walkAfter = await page.evaluate(() => window.__walker());
  assert.ok(Math.hypot(walkAfter[0] - walkBefore[0], walkAfter[1] - walkBefore[1]) > 0.1);
  assert.ok(await page.evaluate(() => window.__pick(683, 470)));
  assert.deepEqual(await page.evaluate(() => window.__viewerErrors), []);
  console.log("PASS original walkthrough: WASD movement and clickable objects");
  assert.deepEqual(errors, []); assert.deepEqual(missing, []);
  console.log("PASS no uncaught browser errors or missing local assets; screenshots in build/shots/");
} catch (error) {
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(SHOTS, "apis_failure.png"), timeout: 10000 }).catch(() => {});
  console.error("Browser errors:", errors, "Missing assets:", missing);
  throw error;
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
