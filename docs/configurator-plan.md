# Room configurator: plan

**Status: awaiting approval. No code has been written.** Read with `docs/room-configurator-brief.md`.

## 1. Decisions

| Question | Decision |
|---|---|
| Slider | Swipe carousel |
| Rooms | W1 by default, with a switch to W3 |
| Toys | In the Paediatric Play theme, and each item available by itself |
| Patio on isolation room | Allowed, with a warning |
| Fish tank | Sealed tank by default, digital screen as the alternative |
| Bed view (added, see 2.1) | Side-on in both rooms. W1 keeps its head on the north wall, moved to the drawn bed circle. W3 is turned to match, in the configurator only |

## 2. What exploring changed

### 2.1 The bed does not face the window

| | W1 (`room04`) | W3 (`room02`) |
|---|---|---|
| Area | 37.58 m² | 34.19 m² |
| Bounds | x 7.21–18.06, y 27.13–31.61 | x 5.26–14.74, y 18.13–22.40 |
| Bed head as modelled | (12.82, 30.26), foot south | (7.06, 20.26), foot east |
| Window from the bed | 69–106° to the patient's right, 5–6 m away | Behind the patient |
| Straight ahead | South party wall, 0.8 m past the foot | The glazed front, 5.5 m past the foot |
| Existing TV | East wall, 83° left, 5.3 m away, partly inside the south wall | North wall, 73° left, 2.2 m away |

The side-on layout, for the configurator:

- **W1:** bed head at (11.2, 30.26), foot south, built in phase 1. Its centre (11.2, 29.16) is inside the drawn bed circle (centre 11.50, 29.99, 2.69 m across), not on it. The TV goes on the south wall (usable x 9.69–12.63), straight ahead. The window is about 4.3 m to the right.
- **W3:** bed head at (10.31, 21.05), foot south, 1.35 m off the north wall, built in phase 2. x comes from W3's drawn bed circle (centre 10.31, 20.7) and lines up with the flat 1.8 m of south wall, which holds a 1.75 m feature panel. The TV goes on the south wall, 0.7 m past the foot. The window is to the right, as in W1. Exact positions get tuned by looking at them.
- **Two bed views:** "From the bed" looks ahead at the TV and ceiling. "Head turned" looks at the window and palms. No single natural view holds both, since they are about 90° apart. "Palms visible from the bed view" is met by the second one.
- **Blinds default to up.** The current render has them more than half down, which would hide the palms.

W3's hero render, the walkthrough and the downloads keep the as-modelled W3 bed.

### 2.2 The shell can't be recoloured per room yet

- `walls`, `ceiling_rooms`, `front_glazing`, `curtains`, `facade_*`, `skirting`, `room_feature_walls` and others are single floor-wide meshes (`02_build_scene.py`). `floor_rooms` is one mesh made of separate islands.
- Room polygons live only in memory in 02. `spaces` in `build/scene_index.json` is just a count.
- Room ids like `room04` are `spaces` indices. They have gaps and shift if the plan changes, so nothing may hard-code them. Labels W1–W8 and E1–E8 are computed only inside `04_export.py`.
- The drawings are present in `input/drawings/` and `bpy` 5.2.3 and Playwright work, so the Blender route is available. The `icu.glb.gz` fallback isn't needed.

### 2.3 The generic kit misfits W1 and E1, which would show in the new render

- **W1:** the recliner is about 0.7 m² outside the room, in the observation nook. The bed foot touches the slanted wall. The feature panel overlaps the toilet door, and the TV is about 28% inside the south wall.
- **E1:** no TV or panel at all, because the ray finds no wall. The visitor chair is about 0.25 m² outside the room.
- There is no code difference between room types. Ante rooms and toilets have no objects, and toilet fittings are unmodelled (`REPORT.md`).

### 2.4 W1's front isn't what the brief describes

- W1's glazed front is the **inner door to the ante room** (1.85 m wide, glass leaf plus fixed pane). The ante's corridor side is a 1.86 m opening with no leaf found, so it builds as fixed glass.
- The model's fronts are a swing leaf plus a panel (`REPORT.md`, medium confidence), not an existing sliding door. So a sliding front is part of the proposal, and the copy will say "glazed front", not "existing sliding".
- Smart glass, blinds and the frosted band apply to the inner front in W1 and the corridor front in W3. The door leaf already has a frosted band at z 1.2–1.5.
- The inner door is about 3 m east of the bed. The only line through it to the bed is a shallow diagonal, about (19.3, 28.3) to (12.8, 29.2), and it crosses the door rail at z 1.05 and the frosted band. That shot needs testing, so phase 1 adds a second camera as a backup.

### 2.5 Nothing exists outside the facade

- There is only a 400 m ground box at z = −18, the slab overhang (0.73 m past the glass), fins and sky. No terrace, upper floors or neighbours. The patio and palms are all new, and all proposal.
- **Mullion spacing is 1.125 m, so one bay can't pass a bed.** The patio spans **three bays** (3.375 m), which gives about 1.7 m clear with one sliding leaf. My assumption for the target is at least 1.4 m clear for a bed.
- The sheet says `+24.000 FFL`, but that datum is unverified. Palm crowns at window height imply trees about 18–24 m tall, which is near the top of a date palm's range. It reads fine visually, and I'll note it in `REPORT.md`.

### 2.6 Sun and compass

- The spec's sun (azimuth 250°, elevation 32°) lies on a real path at latitude 24.45° N at about **15:30 solar time, at declination −2.5°** (mid-March or late September). The slider uses that one date, so it passes exactly through the sun in the renders. I'll add an **Afternoon** stop there, alongside the brief's morning, midday, sunset and night.
- W1 and W3's facade normal is 282° in the model frame, so **no direct sun enters before about 12:30**. Morning and midday show sky light only. That is correct, not a bug.
- "+y north" is a frame label. True north isn't in the spec, and the sheet's key plan suggests the tower is drawn rotated, so the true bearing isn't established. The sun path follows the renders' convention. I'll add `lighting.north_offset_deg` (default 0) so one number can correct it later, and say so in `REPORT.md`.

### 2.7 Things in the brief to correct

- **Local `main` is 3 commits behind `origin/main`.** PR #6 (teal palette, Plex in the viewer, motion tokens) is merged but not pulled, so the brief's design language is on GitHub and not in this checkout. Phase 1 pulls first.
- **There are two styles.** The home page uses system fonts, serif headings and no dark theme. The viewer uses IBM Plex with light and dark. Both share the teal and the motion tokens. The slider follows `scripts/site/styles.css`. The configurator follows the viewer's CSS.
- **The slider isn't a proposal.** Both renders show the floor as built with the assumed kit, and the home page says so. Slider captions stay in that voice. Only the configurator is labelled a design proposal.
- **The delirium note overstates the evidence.** The study is Spies et al., *Critical Care Medicine* 2024: a pilot of 74 patients, not randomised, with 46% delirium against 76%. The redesign was a bundle, not lighting alone. A larger randomised trial of dynamic light alone (Simons et al., *Lancet Respiratory Medicine* 2016, 734 patients) found no reduction: 38% against 33%. Proposed copy: *"The evidence is mixed. A small pilot of redesigned rooms that included dynamic lighting saw less delirium, but a larger randomised trial of dynamic light alone did not."* I read these through secondary sources, so I'll check the papers before publishing. The other notes in 4.3 get checked against the brief's references when they are written.
- **4.2 is missing options the themes need:** a sofa-bed for Family Suite and an accent colour for Paediatric Play. Both get added as options. "No feature wall" is added too.
- `spec/icu_spec.json:373` and `:492` say +X is the patient's left. The code makes it their right. Comments get fixed in phase 1.

### 2.8 Traps in the verification steps

- `run_all.sh:15-16` ends 03 and 04 with `|| true`, so a failed render or export still continues, and a stale GLB passes the guard. A green run proves little until this is fixed.
- `--preview` writes `*_preview.png`, but 06 reads the full names, so a new camera without a full render crashes 06.
- SwiftShader runs at about 1 frame/s, so fixed waits are unsafe (PR #6 added `settle()` for this).
- `05` opens `file://`. The configurator fetches `.gz` files, so `08` needs a server.
- Cameras are hard-coded in `02:636-655`, so a spec entry alone does nothing. `L2W` only works for the hero room, so W1 cameras use world coordinates.

## 3. Changes outside the brief, for your approval

1. **W1 and E1 get per-room kit overrides in the real scene.** The W1 render can't have a recliner in a wall. This changes the viewer, downloads and aerial renders, and one `REPORT.md` sentence ("placed the same way in every room"). The accuracy table stays as it is, since bed position and kit are already marked low confidence. E1 is the only room touched beyond what you asked for, because it has the same fault.
2. `run_all.sh` stops hiding step failures.
3. Patio over three bays, not one.
4. Reworded delirium note.
5. A second W1 camera, `iso_room`, as well as the ante view.
6. A baked ambient-occlusion map for the rooms (see 4.2).
7. Bloom by HDR threshold instead of a separate selective pass (see 4.3).
8. Sofa-bed, accent colour, no-feature-wall and Afternoon options.

## 4. Design

### 4.1 Pipeline

Run order becomes **01, 02, 03, 04, 05, 07, 06, 08**. 07 keeps the brief's number but has to run before 06 publishes.

- **Shared labels:** move the label logic from `04_export.py` into `planlib.py`, so 02, 04 and 07 agree.
- **02:** apply `kit.room_overrides` (matched by label point, like `hero_room_label`) and write each space's polygon to `build/scene_index.json`. Adding polygons changes no geometry.
- **07 `scripts/07_export_room.py`:** opens `output/icu.blend` and, for W1 and W3, writes:
  - **Clipped shell:** a box around the room, ante, toilet, nook and a corridor stub. `walls` go through `manifold3d` so cut ends are capped. Thin merged meshes use `bmesh` bisect.
  - **New skins from the polygon:** `cfg_paint_walls`, `cfg_feature_wall`, `cfg_floor`, `cfg_ceiling`, `cfg_front_glass`, `cfg_facade_glass`, `cfg_curtain`, `cfg_blinds`.
  - **Kit:** W1 as in the scene. W3 in its side-on layout, from `configurator.rooms.W3` in the spec.
  - **Anchors, as empties:** `anchor_tv`, `anchor_console`, `anchor_toys`, `anchor_playmat`, `anchor_seating`, `anchor_aquarium`, `anchor_patio`, `anchor_palm_1`, `anchor_palm_2`, `anchor_reading_light`.
  - **Sidecar `room_w1.json`:** inset polygon for the orbit clamp, camera presets, bed eye point, facade normal, patio bays and light runs.
- **Output:** `assets/model/room_w1.glb.gz` and `room_w3.glb.gz`. My estimate is under 2 MB each before the AO map, since the whole floor is 2.25 MB.
- **06:** turn the template step into a function, fix image paths for `configurator/` (generated paths are root-relative), copy the JS and data, and keep `noindex`.
- **`run_all.sh`:** check each step's real exit status with `PIPESTATUS`.

### 4.2 Why bake ambient occlusion

The renders look good because Cycles computes indirect light. Three.js in real time doesn't, so a plain export will look flat, and the look is the whole point of a car-style configurator. A baked AO map adds contact shadows and doesn't depend on paint colour or time of day, so it survives every option. Built in phase 2 for the walls, floor and ceiling only, which have clean UVs and no seams. The furniture isn't baked.

### 4.3 Front end

Same Three.js 0.170.0 import map, ES modules, no bundler.

```
scripts/site/configurator.template.html
scripts/site/configurator/
  options.json   categories, options, themes, notes, targets
  main.js        boot, render loop, test API
  stage.js       renderer, composer, room loading
  cameras.js     presets, easing, orbit clamp, tour
  sky.js         solar path, sky, sun, night
  lights.js      lighting schemes
  surfaces.js    paint, floors, ceiling, feature wall, procedural textures
  glass.js       smart glass, blinds, frosted band
  addons.js      TV, console, toys, aquarium, palms, patio
  state.js       state, spec code, URL hash
  panel.js       UI generated from options.json
```

- **Data-driven:** each option lists effects from a small fixed vocabulary (`color`, `material`, `visible`, `addon`, `lightScheme`, `glass`), plus `requires`, `removes` and `note`. Adding an option means editing data unless it needs a new kind of effect.
- **Spec code:** versioned, with explicit option ids, and new ones only ever appended, so old links keep working. An unknown code falls back to the default with a visible message.
- **No shader hitches:** all lights exist from the start and schemes only change intensity, because changing the light count recompiles shaders. `transmission` stays just above 0 for the same reason.
- **Glass:** transmission only on the front glass. Facade glass is alpha-blended, since transmission costs an extra scene pass. Phones and low-tier GPUs use opacity for the front too.
- **Bloom:** emissive strips go above 1.0 in an HDR buffer with `UnrealBloomPass` thresholded at about 1. This gives the selective look without the costly double render. Bloom scales down in daylight so the bright sky doesn't glow.
- **Rendering on demand:** frames draw only while the camera moves, something is animating, or the TV or fish are in view.
- **Orbit clamp:** on each change the camera is pulled back to the nearest point inside the inset polygon. Dollhouse is the exception. There the ceiling hides, except over the toilet, which is empty.
- **No third-party assets:** TV loop, fish, murals, mashrabiya, vinyl, wood and sky ceiling are all seeded canvas or procedural, and palms, toys and patio are procedural geometry. That means no video file, no licences and no extra download. `REPORT.md` records this.
- **Tone mapping:** Neutral. Compared in phase 2 with a Cycles render from the same camera: Neutral matches the Cycles colours, while AgX in real time washes out the feature wall and chairs.
- **Save image:** render a frame and call `toBlob` in the same tick.
- **Test API:** `window.__configReady`, `__configErrors`, and `__config` with `apply`, `state`, `code`, `load`, `setTime`, `camera`, `renderNow` and `instant`.
- **Labelling:** a persistent "Design proposal" tag in the panel and on the summary, plus the existing "independent student work, not endorsed by SSMC" text.

## 5. Phases

Each phase is its own branch off an up-to-date `main`, with a PR. If the previous PR isn't merged yet, the next branch stacks on it and the PR says so. Each phase runs `/code-review` before its PR and ends with the commands run, their results and the screenshots.

### Phase 1: Isolation render and home slider (`configurator-1-slider`)

1. `git pull --ff-only` on `main`, then branch. The brief and this plan get committed here.
2. Share the label logic. Add `kit.room_overrides` for W1 and E1. Fix the +X comments.
3. Add `cam_iso_entry` (from the ante through the inner door), `cam_iso_room` (from W1's east arm, along the room) and `cam_iso_window` (the bed and window, so the render plates stay even) to the spec and 02, with exposure entries.
4. Preview-render candidates and pick a frame. If the door rail and frosted band spoil the ante shot, hide the leaf for that camera and say so in the caption ("door open").
5. Replace the hero figure in `index.template.html` with the carousel, built with scroll-snap and a small inline script:
   - Mouse drag, swipe, arrow keys and two labelled tabs, with the caption changing per slide.
   - A drag doesn't fire the full-size link.
   - Still swipeable without JS. Reduced motion gets instant moves.
   - W1's slide loads lazily, and the existing hero entrance animation is kept.
6. Stop `run_all.sh` hiding step failures.

**Verify:**
- Full `scripts/run_all.sh`, since the kit change reaches everything downstream.
- `05` passes, no unfilled placeholders, and `iso_*` WebPs exist in `assets/img/`.
- I open the W1 renders and check nothing clips.
- Screenshots of both slides at 1280 px and 390 px, and tabs, arrow keys and drag exercised in a browser.

### Phase 2: Room GLB, shell, cameras, day and night (`configurator-2-shell`)

1. Write polygons to the scene index. Build `07_export_room.py` with W1 and W3, including W3's side-on layout, and the AO bake.
2. Build the template and `stage.js`, `cameras.js`, `sky.js`, plus a panel shell with room switch, camera presets and time controls.
3. Seven presets: Overview, Family zone (added in phase 4 to look at the family zone, not from it), Entrance, From the bed, Head turned, Window, Dollhouse. Orbit clamp. Family zone is W1's east arm (x 14–18, y 28.75–31.61) and W3's east side.
4. Solar path, Day/Night toggle, time slider and dark exterior at night.
5. Build through 06. Add nav and hero links.
6. First version of `08_check_configurator.py`: HTTP server under an `/ICU-competition/` prefix to catch absolute paths, SwiftShader flags from `05`, no fixed waits. Add `07` and `08` to `run_all.sh`.

**Verify:**
- `07`, `06` and `08` pass.
- Screenshots of every preset in both rooms, and every time stop. I check the sun patch matches the Cycles render at Afternoon, and that morning has none.
- The clamp test orbits and zooms out from each view and asserts the camera stays inside. Every route between views is also checked point by point, since SwiftShader is too slow to sample a real move.
- `08` asserts the initial download is under 15 MB.

### Phase 3: Surfaces, lighting, smart glass, palms (`configurator-3-surfaces`)

1. Options engine and `panel.js`, generated from `options.json`.
2. Paint colours and custom picker, feature walls, vinyl floors, sky ceiling.
3. Cove, downlight, slot and circadian schemes. Colour temperature, reading light, amber night light.
4. Smart glass (300 ms fade, wall switch, curtain removed), integral blinds, frosted band, facade blinds.
5. Palms and low planting. Clinical notes for smart glass, isolation seals and circadian lighting, each checked against its source as written.

**Verify:**
- Night screenshots for each scheme, with the cove visibly glowing.
- Smart glass clear and opaque, with the glass actually opaque.
- Palms visible in "Head turned" in both rooms, with blinds up.

### Phase 4: Add-ons, themes, summary, share (`configurator-4-addons`)

1. TV sizes on the eye line with the canvas loop. Console and controller.
2. Toys, play mat, seating options including the sofa-bed.
3. Sealed tank with animated fish, digital aquarium, and the infection-control note.
4. Patio over three bays: door, shade, balustrade, planters, palms on the terrace, the chair, and the W1 warning.
5. The four themes. Any option stays editable after applying one.
6. Summary sheet with notes, spec code in the hash, save image, cinematic tour.

**Verify:**
- Every theme in both rooms, day and night, with screenshots.
- Round trip: all themes plus 20 seeded random configurations, each set, encoded, reloaded and compared for the same state.
- `08` loops over every option in `options.json` and fails if toggling it changes no pixels. This covers "every option changes the room" and any option added later.

### Phase 5: Polish, tests, docs (`configurator-5-polish`)

1. Keyboard and screen-reader pass, visible focus, and reduced motion for camera moves and the tour.
2. Bottom sheet tuned on a phone viewport, using `visual-qa`.
3. Frame-time logging on real hardware, then tuning.
4. Update `README.md`, `REPORT.md` (no third-party assets, sun assumptions, palm height, kit overrides) and site copy.
5. Final check of every clinical note against its source.

**Verify:** full `scripts/run_all.sh` passes, including `08`, and every "Done when" item in the brief is checked with evidence.

## 6. Limits and risks

- **Phone and integrated-GPU smoothness can't be proven here.** SwiftShader checks layout and correctness, not speed. This machine's M5 outperforms a typical integrated GPU, so frame times from it are only a best case. I'll report those numbers as that. A real phone test needs you, on the deployed page.
- **SwiftShader may be too slow for transmission plus bloom on every option.** The per-option loop can run at low resolution and low tier, with full-quality screenshots for the theme, day/night and glass checks.
- **The kit is low-poly.** The bed and recliner are visibly blocky, as the current hero render shows. Materials and AO help, but this won't look like a car configurator's scanned model. Better kit models would be a separate piece of work.
- **The patio is a concept.** It shows no structure, and it doesn't address fall risk for delirious patients, wind or dust. I'd add a one-line note on fall risk to the patio warning, unless you'd rather not.
- **`docs/` is public.** GitHub Pages serves the repo root, so the brief and this plan will be reachable once committed. Neither contains drawings.

## 6a. Open issue: the page sometimes didn't start in the check

Three times in about a dozen runs of `08`, always on its first page, the page stayed on "Loading the room…". The third time, the load-stage marker showed `main.js` had never started, with nothing still downloading. A stalled download, system sleep, display sleep and plain repetition (22 clean loads) are ruled out. A failed module request fits but isn't proven. `08` now logs failed URLs, its test server accepts more connections at once, and it retries once and says so. The page itself now shows an error if a script can't load, instead of loading for ever. If `RETRY` appears in an `08` log, read the failed URL it prints.

## 7. What the clinical notes can claim

Checked in phase 3 against the published abstracts, the door makers' own pages and CDC guidance.

- **Smart glass:** the brief's "easier to clean between patients" isn't used. The one article that might support it (Healthcare Design, on Memorial Sloan Kettering) refuses automated access, and nothing else read says so. The note says what the sources do: door makers sell switchable glass for ICU sliding doors, and CDC counts curtain edges as high-touch surfaces. If you can open that article and it supports the claim, it can go back.
- **Isolation seals:** confirmed by Stanley Access: a seal along the bottom, tested against positive and negative pressure.
- **Delirium:** both papers confirmed from their abstracts. Spies et al. (PMID 38112493): prospective observational pilot, 74 patients, 46% against 76%, p = 0.017. Simons et al. (PMID 26895652): randomised, 734 patients, 38% against 33%, p = 0.16, stopped early for futility.
- **Plants:** CDC says not to allow fresh or dried flowers or potted plants in patient-care areas for immunosuppressed patients. It doesn't restrict them for immunocompetent patients, so the note is limited to the immunosuppressed.
- **Fish tanks:** CDC is firmer than the brief assumes: "Avoid placing decorative fountains and fish tanks in patient-care areas" (Category IB), and restrict "fish in tanks" from patient-care and isolation areas. So, decided at phase 4: the digital aquarium is what the themes use, and the sealed tank stays an option carrying this note.

## 8. Sources for the delirium note

- [HFM: design features influencing circadian rhythm](https://www.hfmmagazine.com/design-features-influencing-circadian-rhythm) (Spies et al.)
- [Medical Dialogues: modified ICU design with dynamic lighting](https://medicaldialogues.in/critical-care/news/modified-icu-design-integrating-dynamic-lighting-system-may-reduce-delirium-severity-122743) (Spies et al.)
- [The Bottom Line: dynamic light application therapy trial](https://www.thebottomline.org.uk/summaries/icm/dynamic-light-application-therapy-to-reduce-the-incidence-and-duration-of-delirium-in-intensive-care-patients-a-randomised-controlled-trial/) (Simons et al.)
