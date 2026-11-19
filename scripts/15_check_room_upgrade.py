"""The room upgrade, checked in a browser: the compact chair, the four themes on one base, the floor areas, the Research tabs.

    python scripts/15_check_room_upgrade.py [--software] [--shots DIR]

A few minutes, where 08_check_configurator.py takes an hour: this covers only what the upgrade added or changed, on the
published copy in configurator/, served under /ICU-competition/ as GitHub Pages serves it.

  - a link with no code opens today's room, every option at its default, as it always did (Hassan, 19 November 2026);
    a theme button brings the proposal; Reset the room and Before / after still go to today's room. Every later section
    that opens a page with no link and tests the chair, the ceiling border or the fittings puts a theme on first
  - both rooms, all four themes: one chair, the same size in the same bay, and neither of the model's chairs left under it;
    the layout check finds nothing against the chair or the fittings
  - an old link still opens today's seating, and comes back out as the same link; each theme survives a link and a reload
  - all seven modes, the three patient states: nothing moves the chair or rewrites the design
  - a theme chosen during Clinical or Emergency waits, says so, and is applied when the mode ends
  - the room safety scan covers the room's own seating, and finds a thing put on the chair
  - the floor areas are drawn from the layout check's own areas, each named in words
  - the Research tabs: three, by mouse and by keyboard, with named sources; a card without research has none
  - Low and High quality; repeated theme and room changes hold the renderer's memory steady; a tablet-size screen

By default the browser draws with the machine's GPU where headless Chromium allows it. --software uses the software
renderer the other checks use. Which one drew is printed: nothing here was run on a real phone, tablet or screen reader.
--shots DIR saves the handoff's pictures there: four themes from one camera at one time, the floor areas, the chair.
"""
import functools, http.server, json, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOFTWARE = "--software" in sys.argv
SHOTS = sys.argv[sys.argv.index("--shots") + 1] if "--shots" in sys.argv else None
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] if SOFTWARE else ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-gpu"]
OLD_LINK = "1003086304300000100020000000000000010000000111110011"  # the configuration supplied with the brief: W1, made before this upgrade
THEMES = ["future", "calm", "desert", "family"]
MODES = ["comfort", "privacy", "clinical", "family", "cleaning", "emergency"]
HIDE = "body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }"
fails = []


def check(ok, what):
    print(("PASS " if ok else "FAIL ") + what, flush=True)
    if not ok:
        fails.append(what)


class Pages(http.server.SimpleHTTPRequestHandler):
    """The repository, served under /ICU-competition/ and nowhere else, as Pages serves it."""

    def translate_path(self, path):
        if not path.startswith("/ICU-competition/"):
            return os.path.join(ROOT, "__nothing_here__")
        return super().translate_path(path[len("/ICU-competition"):])

    def log_message(self, *a):
        pass


class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256  # the page asks for some sixty modules at once: the default queue of five resets connections


server = Server(("127.0.0.1", 0), functools.partial(Pages, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
BASE = f"http://127.0.0.1:{server.server_address[1]}/ICU-competition"
C = "window.__config"


def open_page(b, tail="", width=1366, height=820, **kw):
    ctx = b.new_context(viewport={"width": width, "height": height}, **kw)
    pg = ctx.new_page()
    pg.errs, pg.missing = [], []
    pg.on("console", lambda m: pg.errs.append(m.text) if m.type == "error" else None)
    pg.on("pageerror", lambda e: pg.errs.append(str(e)))
    pg.on("requestfailed", lambda r: pg.missing.append(f"failed {r.url}"))
    pg.on("response", lambda r: pg.missing.append(f"{r.status} {r.url}") if r.status >= 400 and r.url.startswith(BASE) else None)
    pg.goto(f"{BASE}/configurator/{tail}")
    pg.wait_for_function("() => window.__configReady || (window.__configErrors || []).length", timeout=300000)
    if not pg.evaluate("() => !!window.__configReady"):
        raise SystemExit(f"the page didn't load: {pg.evaluate('() => window.__configErrors')} {pg.errs[:3]} {pg.missing[:3]}")
    return ctx, pg


def still(pg, ms=250):
    pg.wait_for_function(f"() => !{C}.state().moving", timeout=120000)
    pg.evaluate("() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))")
    pg.wait_for_timeout(ms)


def chair_box(pg):
    return pg.evaluate(f"""() => {{ const s = {C}.layoutInputs().solids.find(x => x.id === 'addon:compactChair'); if (!s) return null;
      return s.boxes.reduce((m, b) => [Math.min(m[0], b[0]), Math.min(m[1], b[1]), Math.max(m[2], b[3]), Math.max(m[3], b[4]), Math.max(m[4], b[5])], [99, 99, 0, 0, 0]).map(v => +v.toFixed(3)); }}""")


def solids(pg):
    return pg.evaluate(f"() => {C}.layoutInputs().solids.map(s => s.id)")


def proposal(pg, theme="calm"):
    """A page opened with no link shows today's room, so a section that tests the upgrade's chair, ceiling border or
    fittings puts a theme on first, as a visitor would with the theme buttons."""
    pg.evaluate(f"() => {C}.theme('{theme}')")
    still(pg)


def pressed(pg):
    return pg.evaluate("() => [...document.querySelectorAll('#themes button[aria-pressed=true]')].map(b => b.dataset.value)")


def clean(pg, what):
    errs = pg.errs + pg.evaluate("() => window.__configErrors || []")
    check(not errs and not pg.missing, f"{what}: no errors, and every file found under /ICU-competition/ {(errs + pg.missing)[:3]}")


with sync_playwright() as p:
    b = p.chromium.launch(args=ARGS)

    # ---------------------------------------------------------------- where the page starts, and where today's room still is
    ctx, pg = open_page(b)
    renderer = pg.evaluate("() => { const g = document.createElement('canvas').getContext('webgl2'), e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown'; }")
    print(f"  drawn by: {renderer}{' (software, as asked)' if SOFTWARE else ''}", flush=True)
    data = pg.evaluate(f"() => {C}.options()")
    defaults = {g["id"]: g["default"] for s in data["sections"] for g in s["groups"]}
    base = data["themeBase"]
    st = pg.evaluate(f"() => ({{ room: {C}.state().room, theme: {C}.currentTheme(), sel: {C}.selected(), chair: {C}.addonShown('compactChair') }})")
    check(st["room"] == "W1" and st["theme"] is None and "start" not in base and st["sel"] == defaults and not st["chair"] and "part:cfg_kit_recliner" in solids(pg) and "part:cfg_kit_visitor_chair" in solids(pg)
          and not pressed(pg) and "Today's room" in pg.inner_text("#themeNote"),
          f"a visit with no link opens W1 on today's room, as it always did: every default, the recliner and the visitor chair, no compact chair, no theme pressed, and the note says today's room {st['room'], st['theme'], pressed(pg)}")
    pg.click("#themes button[data-value='calm']")
    still(pg)
    st = pg.evaluate(f"() => ({{ theme: {C}.currentTheme(), sel: {C}.selected(), chair: {C}.addonShown('compactChair') }})")
    check(st["theme"] == "calm" and st["sel"]["seating"] == "compact" and st["chair"] and pressed(pg) == ["calm"] and "part:cfg_kit_recliner" not in solids(pg) and "part:cfg_kit_visitor_chair" not in solids(pg)
          and "Today's room" not in pg.inner_text("#themeNote"),
          f"picking Calm Clinical brings the proposal: the compact chair in place of today's two, its button pressed, and its own note {st['theme'], pressed(pg)}")
    pg.click("#compareToggle")
    still(pg)
    cmp_ = pg.evaluate(f"() => ({{ on: {C}.comparing(), sel: {C}.selected(), chair: {C}.addonShown('compactChair') }})")
    check(cmp_["on"] and cmp_["sel"] == defaults and not cmp_["chair"] and "part:cfg_kit_recliner" in solids(pg) and "part:cfg_kit_visitor_chair" in solids(pg),
          "Before / after shows today's room: every default, the recliner and the visitor chair, and no compact chair")
    pg.click("#compareToggle")
    still(pg)
    check(pg.evaluate(f"() => {C}.currentTheme()") == "calm" and pg.evaluate(f"() => {C}.addonShown('compactChair')"), "and back to the proposal, exactly")
    pg.evaluate("() => document.getElementById('resetRoom').click()")
    still(pg)
    check(pg.evaluate(f"() => {C}.selected()") == defaults and pg.evaluate(f"() => {C}.currentTheme()") is None and "Today's room" in pg.inner_text("#themeNote"),
          "Reset the room still goes to every default, and the note calls it today's room")
    clean(pg, "the start")
    ctx.close()

    # ---------------------------------------------------------------- both rooms, all four themes
    ctx, pg = open_page(b, "?room=W3", 1600, 1000)
    codes, mem = {}, []
    for room in ["W3", "W1"]:
        pg.evaluate(f"() => {C}.room('{room}')")
        still(pg, 600)
        boxes = {}
        for t in THEMES:
            pg.click(f"#themes button[data-value='{t}']")
            still(pg)
            sel, lay, ids = pg.evaluate(f"() => {C}.selected()"), pg.evaluate(f"() => {C}.layout()"), solids(pg)
            check(pg.evaluate(f"() => {C}.currentTheme()") == t and all(sel[g] == o for g, o in base["sets"].items()), f"{room}: {t} applies, with the whole shared base")
            check("addon:compactChair" in ids and "part:cfg_kit_recliner" not in ids and "part:cfg_kit_visitor_chair" not in ids and "addon:sofa" not in ids,
                  f"{room} {t}: one chair, and neither of the model's chairs nor the sofa-bed left with it")
            mine = [f for f in lay["findings"] if "compactChair" in f["a"] + f["b"]]
            fit = [f for f in lay["findings"] if f["fitting"]]
            other = [f for f in lay["findings"] if f["level"] == "overlap" and not (f["a"].startswith("part:") and f["b"].startswith("part:"))]
            check(not mine and not fit and not other, f"{room} {t}: no modelled conflict found for the chair or any fitting, and nothing overlaps but the model's own kit {(mine + fit + other)[:2]}")
            check({"clearRight", "clearLeft", "clearFoot", "route", "wardrobe", "desk"} <= set(lay["areas"]) and any(a.startswith("door") for a in lay["areas"]), f"{room} {t}: the check has every area, the desk's standing room among them")
            boxes[t] = chair_box(pg)
            if room == "W3":
                codes[t] = pg.evaluate(f"() => {C}.code()")
        check(len({json.dumps(v) for v in boxes.values()}) == 1 and boxes["calm"][4] == 0.92, f"{room}: the same chair in the same bay in every theme, 92 cm high {boxes['calm']}")
        # the chair's keep-clear result, against what today's two chairs had
        pg.evaluate(f"() => {C}.set('seating', 'chairs')")
        still(pg)
        today = [f for f in pg.evaluate(f"() => {C}.layout().findings") if f["level"] == "clearance" and ("recliner" in f["a"] or "visitor_chair" in f["a"])]
        check(len(today) >= 1 and "addon:compactChair" not in solids(pg), f"{room}: today's recliner stands in a keep-clear area in this model, and the compact chair is gone when it's chosen {[(f['a'][9:], f['b'], f['size']) for f in today]}")
        pg.click("#themes button[data-value='calm']")
        still(pg)
        mem.append(pg.evaluate(f"() => {C}.memory()"))
    # round and round: the renderer holds no more after three more turns of every theme in both rooms
    for _ in range(3):
        for room in ["W3", "W1"]:
            pg.evaluate(f"() => {C}.room('{room}')")
            still(pg, 100)
            for t in THEMES:
                pg.evaluate(f"() => {C}.theme('{t}')")
            pg.evaluate(f"() => {C}.theme('calm')")
    still(pg, 400)
    after = pg.evaluate(f"() => {C}.memory()")
    check(after["geometries"] <= mem[-1]["geometries"] + 4 and after["textures"] <= mem[-1]["textures"] + 6, f"three more turns of every theme in both rooms: the renderer holds about what it did {mem[-1]} -> {after}")
    clean(pg, "the themes")
    ctx.close()

    # ---------------------------------------------------------------- links: the old one, and each theme's own
    ctx, pg = open_page(b, f"#c={OLD_LINK}")
    old = pg.evaluate(f"() => ({{ sel: {C}.selected(), room: {C}.state().room, chair: {C}.addonShown('compactChair'), code: {C}.code(), status: document.getElementById('roomStatus').textContent }})")
    check(old["sel"]["seating"] == "chairs" and not old["chair"] and "part:cfg_kit_recliner" in solids(pg) and "didn't work" not in old["status"], f"the supplied link opens {old['room']} with the seating it was made with: the recliner and chair, and no compact chair")
    check(old["code"] == OLD_LINK, f"and comes back out as the same link, character for character {old['code']}")
    clean(pg, "the old link")
    ctx.close()
    for t in THEMES:
        ctx, pg = open_page(b, f"#c={codes[t]}")
        got = pg.evaluate(f"() => ({{ theme: {C}.currentTheme(), room: {C}.state().room, chair: {C}.addonShown('compactChair'), code: {C}.code() }})")
        check(got["theme"] == t and got["room"] == "W3" and got["chair"] and got["code"] == codes[t], f"{t}: its link opens the same theme in W3 after a reload, with the chair, and gives the same link back")
        ctx.close()

    # ---------------------------------------------------------------- modes, patient states, and a theme chosen during care
    ctx, pg = open_page(b, "?room=W3")
    proposal(pg)
    box, code = chair_box(pg), pg.evaluate(f"() => {C}.code()")
    check(box is not None, f"W3 on Calm Clinical: the chair is in its bay before the modes start {box}")
    for m in MODES:
        pg.evaluate(f"() => {C}.setMode('{m}', {{ instant: true }})")
        still(pg, 120)
        check(pg.evaluate(f"() => {C}.mode().current") == m and chair_box(pg) == box and pg.evaluate(f"() => {C}.code()") == code, f"{m}: the mode goes on, the chair stays in its bay, and the design's link doesn't change")
    pg.evaluate(f"() => {C}.setMode('standard', {{ instant: true }})")
    still(pg, 120)
    check(pg.evaluate(f"() => {C}.currentTheme()") == "calm" and chair_box(pg) == box, "back to As set: the same room")
    for s in ["sedated", "recovering", "awake"]:
        pg.evaluate(f"() => {C}.setPatientState('{s}', {{ instant: true }})")
        still(pg, 120)
        check(pg.evaluate(f"() => {C}.patientState().state") == s and chair_box(pg) == box and pg.evaluate(f"() => {C}.code()") == code, f"{s}: the patient's state changes nothing about the chair or the design")
    pg.click("#modeBar button[data-mode='clinical']")
    still(pg)
    cl = pg.evaluate(f"() => {C}.clinical()")
    names = [a["text"] for a in cl["areas"]]
    check(cl["on"] and cl["zones"] and names == ["Keep clear for care", "Door approach", "Route from the door to the bed", "Reach in front of the wardrobe", "Standing room at the desk", "Chair bay · no modelled conflict found"],
          f"Clinical draws and names every floor area, and the chair's bay says what the check found {names}")
    pg.click("#themes button[data-value='desert']")
    still(pg, 150)
    pend = pg.evaluate(f"() => ({{ p: {C}.pendingTheme(), theme: {C}.currentTheme(), mode: {C}.mode().current, marked: !!document.querySelector(\"#themes button[data-value='desert'][data-pending]\") }})")
    check(pend["theme"] == "calm" and pend["mode"] == "clinical" and pend["p"]["theme"] == "desert" and "Clinical is on" in pend["p"]["note"] and "waits" in pend["p"]["note"] and pend["marked"] and pg.is_visible("#themeWaiting"),
          f"a theme chosen during Clinical waits: the mode stays, the room is unchanged, and a note says so {pend['p']['note']!r}")
    pg.click("#modeBar button[data-mode='emergency']")
    still(pg, 150)
    pg.click("#leaveEmergency")
    still(pg, 150)
    check(pg.evaluate(f"() => {C}.mode().current") == "clinical" and pg.evaluate(f"() => {C}.pendingTheme().theme") == "desert" and pg.evaluate(f"() => {C}.currentTheme()") == "calm", "through Emergency and back to Clinical, it is still waiting")
    pg.click("#modeBar button[data-mode='standard']")
    still(pg, 300)
    check(pg.evaluate(f"() => {C}.currentTheme()") == "desert" and pg.evaluate(f"() => {C}.pendingTheme().theme") is None and not pg.is_visible("#themeWaiting") and chair_box(pg) == box, "as the mode ends the theme is applied, the note goes, and the chair hasn't moved")
    pg.click("#modeBar button[data-mode='emergency']")
    still(pg, 150)
    pg.click("#themes button[data-value='family']")
    still(pg, 150)
    check(pg.evaluate(f"() => {C}.mode().current") == "emergency" and pg.evaluate(f"() => {C}.currentTheme()") == "desert" and "Emergency is on" in pg.evaluate(f"() => {C}.pendingTheme().note"), "a theme chosen during Emergency waits too, and Emergency stays on")
    pg.click("#leaveEmergency")
    still(pg, 300)
    check(pg.evaluate(f"() => {C}.currentTheme()") == "family" and pg.evaluate(f"() => {C}.mode().current") == "standard", "leaving Emergency applies it")
    clean(pg, "modes and states")
    ctx.close()

    # ---------------------------------------------------------------- the scan and the floor areas
    for room in ["W3", "W1"]:
        ctx, pg = open_page(b, f"?room={room}")
        proposal(pg)
        pg.evaluate("() => document.getElementById('runScan').click()")
        sc = pg.evaluate(f"() => {C}.scan()")
        check("No items placed" in pg.inner_text("#scanResults") and [(f["fixed"], f["level"]) for f in sc["fixed"]] == [("compactChair", None)] and "No modelled conflict found" in pg.inner_text("#scanFixed") and pg.is_visible("#scanFixedTitle"),
              f"{room}: with nothing placed the scan says so, and lists the room's own chair: no modelled conflict found")
        pg.click("#scanFixed button")
        still(pg, 200)
        detail = pg.inner_text("#scanDetail")
        check("not a clinical or compliance finding" in detail and "safe" not in detail.lower(), f"{room}: its explanation claims no more than a model result {detail!r}")
        bx = chair_box(pg)
        pg.evaluate(f"() => {C}.placeAt('bins', {(bx[0] + bx[2]) / 2}, {(bx[1] + bx[3]) / 2})")
        levels = pg.evaluate(f"() => {C}.runScan()")
        sc = pg.evaluate(f"() => {C}.scan()")
        check(levels == ["overlap"] and sc["fixed"][0]["level"] == "overlap" and "waste bins" in " ".join(sc["fixed"][0]["why"]), f"{room}: bins put on the chair are found, on both: an overlap, named {sc['fixed'][0]['why']}")
        pg.evaluate("() => document.getElementById('clinicalToggle').click()")
        still(pg, 200)
        check("Chair bay · an overlap" in [a["text"] for a in pg.evaluate(f"() => {C}.clinical().areas")], f"{room}: and the bay's name on the floor says an overlap, in words")
        clean(pg, f"{room}'s scan")
        ctx.close()

    # ---------------------------------------------------------------- the Research tabs
    ctx, pg = open_page(b, "?room=W3", 1366, 820)
    proposal(pg)
    pg.evaluate("() => document.querySelector('#featureList button[data-feature=\"compactChair\"]').click()")
    still(pg, 300)
    tabs = pg.evaluate("() => [...document.querySelectorAll('#research [role=tab]')].map(t => ({ text: t.textContent, on: t.getAttribute('aria-selected'), h: t.getBoundingClientRect().height }))")
    check(pg.is_visible("#research") and [t["text"] for t in tabs] == ["Features", "Benefits", "Evidence and limits"] and tabs[0]["on"] == "true" and all(t["h"] >= 34 for t in tabs), f"the chair's card has three tabs, Features first, each tall enough to tap {tabs}")
    check(pg.locator("#researchFeatures li").count() >= 3 and pg.is_visible("#researchPanelFeatures") and not pg.is_visible("#researchPanelBenefits") and "66 cm wide" in pg.inner_text("#researchFeatures"), "Features: what it is, in the model, its states")
    pg.click("#researchTabBenefits")
    check(pg.is_visible("#researchPanelBenefits") and not pg.is_visible("#researchPanelFeatures") and pg.locator("#researchBenefits dt").all_inner_texts() == ["Patient and family", "Staff", "Cleaning and upkeep"] and "None of it has been measured or shown" in pg.inner_text("#researchPanelBenefits"),
          "Benefits: for the patient and family, for staff, for cleaning, and said to be intentions")
    pg.keyboard.press("ArrowRight")
    ev = pg.evaluate("() => ({ focus: document.activeElement.id, kinds: [...document.querySelectorAll('#researchEvidence .research-kind')].map(k => k.textContent), links: [...document.querySelectorAll('#researchEvidence a')].map(a => a.href), text: document.getElementById('researchPanelEvidence').innerText })")
    check(ev["focus"] == "researchTabEvidence" and pg.is_visible("#researchPanelEvidence") and {"Guideline", "Hospital policy", "Original proposal"} <= set(ev["kinds"]) and len(ev["links"]) >= 5 and all(u.startswith("https://") for u in ev["links"]),
          f"the right arrow moves to Evidence and limits: each source named, with its kind and its address {ev['kinds']}")
    check(all(w in ev["text"] for w in ["Used here for:", "Supports:", "Doesn't show:", "Still to be validated:", "This entry's limits", "Read on 18 November 2026"]) and "not an approved product" in ev["text"], "each source says what it is used for, what it supports and what it doesn't show, with the card's own limits and what is still to be validated")
    card = pg.evaluate("() => { const r = document.getElementById('objectCard').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; }")
    check(card[0] >= 0 and card[1] >= 0 and card[2] <= card[4] and card[3] <= card[5], f"the card stays on screen as it grows {card}")
    check(pg.evaluate(f"() => {C}.card().buttons") [:2] == ["Show the areas on the floor", "Run the room safety scan"], "its two actions: show the floor areas, and run the scan")
    pg.click("#objectAction")
    still(pg, 400)
    check(pg.evaluate(f"() => {C}.clinical().on") and pg.evaluate(f"() => {C}.state().view") == "dollhouse", "Show the areas on the floor turns the labels on and looks from above")
    pg.evaluate("() => document.querySelector('#featureList button[data-feature=\"soundSensor\"]').click()")
    still(pg, 200)
    check(not pg.is_visible("#research") and pg.evaluate(f"() => {C}.card().open"), "a card with no research has no tabs, and is as it was")
    researched = pg.evaluate(f"() => {C}.options() && [...document.querySelectorAll('#featureList button')].map(b => b.dataset.feature)")
    for fid in ["circulation", "ceilingTray", "ceilingPendant", "wardrobe", "privacy", "acousticComfort", "workstation", "orientation"]:
        pg.evaluate(f"() => document.querySelector('#featureList button[data-feature=\"{fid}\"]').click()")
        pg.wait_for_timeout(120)
        n = pg.evaluate("() => ({ shown: !document.getElementById('research').hidden, feats: document.querySelectorAll('#researchFeatures li').length, srcs: document.querySelectorAll('#researchEvidence li').length })")
        check(fid in researched and n["shown"] and n["feats"] >= 3 and n["srcs"] >= 3, f"{fid}: its card has the three tabs filled {n}")
    clean(pg, "the cards")
    ctx.close()

    # ---------------------------------------------------------------- Low quality, and a tablet-size screen with touch
    ctx, pg = open_page(b, "?room=W3&tier=low")
    proposal(pg)
    q = pg.evaluate(f"() => {C}.quality()")
    check(q["tier"] == "low" and not q["composer"] and pg.evaluate(f"() => {C}.addonShown('compactChair')") and pg.evaluate(f"() => {C}.addonShown('ceilingTray')") and pg.evaluate(f"() => {C}.addonShown('curtainTrack')"),
          "Low quality: no bloom, and the chair, the ceiling border and the curtain's track are all there")
    pg.evaluate("() => document.getElementById('clinicalToggle').click()")
    still(pg, 200)
    check(len(pg.evaluate(f"() => {C}.clinical().areas")) == 6, "and the floor areas draw on Low")
    clean(pg, "Low quality")
    ctx.close()
    ctx, pg = open_page(b, "?room=W3", 1024, 768, has_touch=True)
    proposal(pg)
    pg.evaluate("() => document.querySelector('#featureList button[data-feature=\"compactChair\"]').click()")
    still(pg, 300)
    pg.tap("#researchTabEvidence")
    card = pg.evaluate("() => { const r = document.getElementById('objectCard').getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom, innerWidth, innerHeight]; }")
    check(pg.is_visible("#researchPanelEvidence") and card[0] >= 0 and card[1] >= 0 and card[2] <= card[4] and card[3] <= card[5], f"at 1024 by 768 with touch emulated, a tap changes the tab and the card stays on screen {card}")
    clean(pg, "the tablet-size screen")
    ctx.close()

    # ---------------------------------------------------------------- the handoff's pictures
    if SHOTS:
        os.makedirs(SHOTS, exist_ok=True)
        ctx, pg = open_page(b, "?room=W3&tier=high", 1600, 1000)
        style = pg.add_style_tag(content=HIDE)
        for t in THEMES:
            pg.evaluate(f"() => {{ const c = {C}; c.theme('{t}'); c.time(c.stops.afternoon); c.camera('across', {{ instant: true }}); }}")
            still(pg, 1500)
            pg.screenshot(path=os.path.join(SHOTS, f"w3-theme-{t}.jpg"), type="jpeg", quality=90)
        pg.evaluate(f"() => {{ const c = {C}; c.theme('calm'); c.time(c.stops.afternoon); document.getElementById('clinicalToggle').click(); c.camera('dollhouse', {{ instant: true }}); c.orbit(0, -2); c.zoomOut(0.5); }}")  # straight down, close
        pg.evaluate("([el, css]) => { el.textContent = css; }", [style, HIDE + " #clinicalLabels, #clinicalLabels * { visibility: visible !important; }"])
        still(pg, 1500)
        pg.screenshot(path=os.path.join(SHOTS, "w3-circulation.jpg"), type="jpeg", quality=90)
        pg.evaluate("([el, css]) => { el.textContent = css; document.getElementById('clinicalToggle').click(); }", [style, HIDE])
        bx = chair_box(pg)
        cx, cy = (bx[0] + bx[2]) / 2, (bx[1] + bx[3]) / 2
        pg.evaluate(f"() => {C}.lookFrom([{cx + 1.5}, {cy - 0.95}, 1.15], [{cx}, {cy}, 0.45])")
        still(pg, 1200)
        pg.screenshot(path=os.path.join(SHOTS, "w3-chair-detail.jpg"), type="jpeg", quality=90)
        for name, seating in [("after-compact-chair", "compact"), ("before-todays-chairs", "chairs")]:
            pg.evaluate(f"() => {{ const c = {C}; c.theme('calm'); c.set('seating', '{seating}'); c.camera('overview', {{ instant: true }}); }}")
            still(pg, 1200)
            pg.screenshot(path=os.path.join(SHOTS, f"w3-seating-{name}.jpg"), type="jpeg", quality=90)
        pg.evaluate("([el]) => { el.textContent = ''; }", [style])
        pg.evaluate(f"() => {{ {C}.theme('calm'); {C}.camera('overview', {{ instant: true }}); document.querySelector('#featureList button[data-feature=\"compactChair\"]').click(); document.getElementById('researchTabEvidence').click(); }}")
        still(pg, 800)
        pg.screenshot(path=os.path.join(SHOTS, "w3-chair-card-evidence.jpg"), type="jpeg", quality=90)
        ctx.close()
        ctx, pg = open_page(b, "?room=W1&tier=high", 1600, 1000)
        pg.add_style_tag(content=HIDE)
        pg.evaluate(f"() => {{ const c = {C}; c.theme('calm'); c.time(c.stops.afternoon); c.camera('across', {{ instant: true }}); }}")
        still(pg, 1500)
        pg.screenshot(path=os.path.join(SHOTS, "w1-theme-calm.jpg"), type="jpeg", quality=90)
        ctx.close()
        print(f"  pictures saved to {os.path.relpath(SHOTS, ROOT)}/, drawn by {renderer}", flush=True)
    b.close()

server.shutdown()
if fails:
    print(f"\n{len(fails)} failed:")
    for f in fails:
        print("  " + f)
    raise SystemExit(1)
print(f"\nPASS the room upgrade: every check, drawn by {renderer}{' (software)' if SOFTWARE else ''}. Not run on a real phone, tablet, Safari, Firefox or screen reader.")
