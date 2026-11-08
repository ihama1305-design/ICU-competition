# Walk the SSMC ICU

A realistic, walkable 3D model of the existing ICU at Sheikh Shakhbout Medical City (Tower D, 4th floor, Part a), built for the SSMC ICU Interior Design Student Competition. The walls, doors, glazing and joinery are read straight from the vector CAD layers of the as-built record drawing. The 16 patient rooms are furnished with a typical ICU kit, and the scene is rendered with Blender Cycles.

**[Open the site](https://ihama1305-design.github.io/ICU-competition/)** · **[Walk through the model](https://ihama1305-design.github.io/ICU-competition/viewer/)** · **[Configure a room](https://ihama1305-design.github.io/ICU-competition/configurator/)** · **[See the ventilation plan](https://ihama1305-design.github.io/ICU-competition/ventilation/)** · **[Read the report](REPORT.md)**

The model and walkthrough show the floor as built, as a starting point for a redesign. The configurator is a design proposal built on top of it. All of it is independent student work, not made or endorsed by SSMC. Furnishings and finishes are assumed; [REPORT.md](REPORT.md) separates what is measured from what is assumed.

![Patient room](renders/room_entry.png)

## Walk through it

The [walkthrough](https://ihama1305-design.github.io/ICU-competition/viewer/) runs in the browser. Drag **Place person** onto any open floor spot and your view drops to their eye level.

- <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> to walk, <kbd>Shift</kbd> to run, drag or arrow keys to look. Phones get on-screen arrows.
- <kbd>V</kbd> shows the person from behind.
- Walls, counters and the facade stop you. Doors and glass fronts let you through.
- The plan in the corner shows where you are. Click it to jump.
- Click anything to name it and see how sure the model is about it. Rooms W1 and W3 are marked **configurable**, and their card links to that room in the configurator.
- If the browser can't draw 3D (no WebGL 2, or too old for the way the page loads its 3D code), this page and the configurator say so and link to the pictures, instead of loading for ever.

## Configure a room

The [configurator](https://ihama1305-design.github.io/ICU-competition/configurator/) lets you spec one room the way you'd spec a car. Everything on it is a proposal, not the room as built.

- **Rooms:** isolation room W1 with its ante room, or standard room W3.
- **Views:** Overview, Family zone, Entrance, From the bed, Head turned, Window and Dollhouse. Drag to look around, or press <kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> and <kbd>+</kbd> <kbd>-</kbd>. There's also a cinematic tour that starts and ends at the Dollhouse.
- **Patient view:** the camera moves to the pillow and stays there. Drag or use the arrow keys to turn your head, as far as a head can turn, from your own body up to the ceiling. <kbd>+</kbd> <kbd>-</kbd> narrow or widen what you take in. **Return**, or <kbd>Esc</kbd>, goes back to the view you came from.
- **Room modes:** Standard, Comfort, Clinical and Emergency-ready, in a bar over the room on every screen size. A mode is a scene laid over the room as configured: it never changes a choice, the link or the summary, and Standard puts back exactly what was there. Comfort warms and dims the lights and lowers the blinds over about two seconds. Clinical turns the light up and the examination task light on. Emergency-ready, started by staff, sets full light and the task light, turns the TV and aquarium screen off and clears the glazed front, and its Exit goes back to the mode before it. A chip says clinical alarms are unaffected, and none of this touches the monitor or any medical device. Changing the room's design ends a mode, and PACS, which keeps its own scene, closes when a mode starts.
- **Themes:** Calm Clinical, Desert Sanctuary and Family Suite. Anything can still be changed afterwards.
- **Options:** paint, feature walls, floors, a sky ceiling, four lighting schemes, an examination task light on its own switch, smart glass, blinds, TV, seating, an aquarium, a patio and palms. It's an adult ICU room, so there are no toys or games console. Earlier links that set them still open, without those items.
- **Day and night:** the sun follows a real path at Abu Dhabi's latitude.
- **Clinical view:** a toggle under the views, which the Clinical and Emergency-ready modes also turn on. It labels the bed, monitor (with its simulated readings), infusion pumps, ventilator, ceiling pendant, examination light, IV pole, the wall controls and anything you've placed. It also hatches keep-clear areas for care beside the bed and at its foot, clipped to the open floor, so whatever stands in them shows. Nothing moves, and the areas carry no dimensions: they're illustrative, not a clinical or compliance check.
- **Place items:** drag a bedside tablet arm, privacy screen, hand-rub dispenser, waste bins, sharps box or compact family chair from the panel onto the room. Floor items stand on open floor, and the dispenser and sharps box hang on a wall at about 1.2 and 1.35 m. You can also choose an item and then click or tap where it goes, and from the keyboard Enter puts it in view. Drag a placed item to move it, and click it to turn or remove it; with its card focused, the arrow keys move it, R turns it and Delete removes it. Placed items go into the link, saved rooms and the summary. Where they go is up to you: staff access, clearances and infection-control positions aren't checked, and each card says so.
- **Saved rooms:** give the room a name and save it, then open, update or delete it later. **Reset the room** puts every choice back to its default. Saved rooms are kept in this browser only and never sent anywhere. If the browser refuses storage, Save says so and nothing else changes.
- **Share:** the link holds the exact room. The summary lists every choice with its clinical notes, and you can save an image.

- **Tune it in:** answer a few questions for an editable comfort and furnishing draft. The panel shows what changed and why, with before-and-after and undo. It never changes the room or recommends care, and answers stay out of links.

To add an option, edit [`scripts/site/configurator/options.json`](scripts/site/configurator/options.json). A new kind of effect also needs a handler in `main.js`. Never renumber a `code` there: share links depend on them.

## Adaptive Patient Interface System (APIS)

Open **Configure a room → Explore APIS**. APIS is an additive educational feature in the existing Three.js configurator, built around the existing W1 and W3 bed metadata. It does not modify the Blender files, exported room geometry, dimensions, room options, patient-profile answers or share-code format. The separate WASD walkthrough remains intact.

- Six selectable attachment examples: NG feeding tube, IV securement, respiratory interface, respiratory strap contact, ECG electrode and urinary catheter securement. Enable the bedside markers to click them in the room, or select an example by keyboard in APIS.
- Opening an attachment focuses the room camera and shows a rotatable 3D schematic. Compare conventional/proposed arrangements, explode the layers and select a layer to highlight its purpose. Closing APIS or pressing Escape restores the room view.
- The material library distinguishes soft silicone adhesive, silicone-contact multilayer foam, molded silicone elastomer and TPE. Foam's absorbent layer is polyurethane; the four materials are not interchangeable.
- The tubing tab compares illustrative line routes during bed movement and patient turning. It addresses clutter, snagging, tension, bends, displacement concerns and access during repositioning. It does not alter the modeled bed or calculate forces, flow, pressure or safety.
- Established material uses and clinical principles are distinguished from experimental APIS external guides. IV sterile dressings and ECG conductive contacts are retained; external guides are shown away from skin. Added padding may increase pressure or compromise fit. Benefits are conditional design intentions, not measured APIS outcomes.

Clinical references appear beside the examples: the [2025 International Guideline](https://www.internationalguideline.com/drpi), CDC guidance for [IV devices](https://www.cdc.gov/infection-control/hcp/intravascular-catheter-related-infections/summary-recommendations.html) and [urinary catheters](https://www.cdc.gov/infection-control/hcp/cauti/summary-of-recommendations.html), and manufacturer material information. The supplied feature brief ended mid-sentence; APIS conservatively preserves device fit, function, securement, inspection and device-specific instructions. These are schematic adult-scale examples, not pediatric device selection or clinical instructions.

Source files: `scripts/site/configurator/apis.js`, `apis-data.js` and `apis.css`, with small integration points in `main.js` and `configurator.template.html`. The existing `06_build_site.py` publishes them. The committed `configurator/` copies are kept in sync so the static site can run without rebuilding Blender. No new runtime package or backend is needed.

The inspected checkout contains patient bed views, general room views, clickable equipment, patient comfort profiles and profile before/after comparison. A dedicated emergency mode or a view explicitly named “clinical” was not present in this checkout; APIS does not remove or replace any existing control.

The focused browser check is `node scripts/11_check_apis.mjs` (install Playwright with `npm install --prefix build/apis-tools playwright`; uses installed Chrome/Edge when available). It serves the site under a repository subpath and writes review screenshots to `build/shots/`.

Verification performed: W1 and W3 attachment interactions, real bedside-marker clicks, layer comparisons/highlights/explosion, material and routing views, camera/ceiling restoration, all existing camera presets, themes, day/night, profile before/after and undo, summary, tour, share-code reload, mobile overflow and keyboard focus, plus original walkthrough movement and object picking. The final NG illustration received a focused rerun. Browser checks found no uncaught JavaScript errors or missing local assets. Source/published copies, JavaScript syntax and whitespace checks passed. The full Blender/Python pipeline was not rerun: this environment has no installed Python, and the required intermediate build inputs are absent. The room model was not rebuilt.

## Physiological Adaptive Comfort System (PACS)

Open **Configure a room → PHYSIOLOGICAL ADAPTIVE MODE**, or **START PHYSIOLOGICAL ADAPTIVE DEMO** for the approximately 77-second presentation. PACS runs in the same Three.js room and renderer; there is no separate replacement scene, backend, medical-device connection or real clinical notification.

- **Three scenarios:** Stable Patient starts at HR 78 bpm, BP 118/76 mmHg, RR 16/min and SpO₂ 98%. Possible Discomfort illustrates HR increasing toward 105 over 12 seconds, alongside other scripted changes; it prompts assessment, not a diagnosis. Clinical Deterioration activates an independently scripted warning and a simulated team notification. No emergency thresholds are calculated from these values. Scenario selection loads a new scripted case and starting environment; it is not a physiological trigger for automatic environmental changes.
- **Clinical oversight:** A simulated clinical review and explicit nurse approval are required for selected recommendations. Rejecting applies no new adjustment. Revising an in-progress proposal cancels its remaining animation and requires fresh approval; withdrawing clinical review also cancels it. Preferences invalidate old approval. Clinical warnings cancel pending comfort animation, restore entry lighting for assessment, and block new recommendations. Acknowledging the alert leaves it active. Oxygen, ventilator, medication, infusion and medical-alarm controls are not changed.
- **Room response:** The existing patient monitor receives a temporary simulated display; existing ceiling/ambient lights and blinds respond smoothly. The existing sound indicator reflects a simulated nonessential-audio setting; no sound plays, no microphone is used, and alarm volume is never controlled. Exiting restores original monitor materials, lighting, blinds, sound-indicator color, camera, options and share state.
- **Preferences and feedback:** A separate fictional comfort profile records lighting, color, audio, blinds and a preferred temperature range. Hospital-approved temperature limits are absent, so temperature is review-only. Brightness percentages describe rendered light output, not comfort, stress, measured illuminance or approved hospital limits. HRV is unavailable, movement observations are scripted, and sleep is not inferred. Patient improvement/no improvement/unable-to-respond feedback remains independent of physiological readings.
- **Comparison and presentation:** Before/after uses a locked camera. Conventional ICUs retain their monitoring and manual controls; the proposed innovation is integration and oversight. The guided presentation has Next, Previous, Pause/Resume, Restart and Exit; nurse approval is explicitly role-played in presentation mode. The alert remains active at the end.

### Shared patient, line organization and click labels

A clothed adult-scale patient figure follows the existing bed and raised backrest. `patient.js` supplies shared attachment landmarks to APIS and PACS, avoiding duplicate attachment geometry. External extensions meet the existing modeled respiratory and IV tubing; ECG, enteral and urinary routes are separately labeled and visually organized. The enteral endpoint is a separate capped schematic connector, never an IV connection. Urinary drainage descends to a bag below the illustrated bladder and above the floor. These are illustrative routes, not validated circuit lengths, securement, bend radii or clinical placement instructions.

Every new patient component, attachment, tube route and PACS connection has click-to-inspect information through the existing object card. Attachment cards link to APIS. PACS temporarily hides APIS inspection markers and restores their previous visibility on exit. Conceptual information connections run above the physical tubing and can be hidden; **Patient & line routes** provides a clear inspection view. Original room dimensions, bed geometry, equipment, WASD walkthrough, comfort profiles and their comparisons remain intact.

Sources linked in the dashboard include [SCCM PADIS](https://www.sccm.org/clinical-resources/guidelines/guidelines/guidelines-for-the-prevention-and-management-of-pa), [NICE CG103](https://www.nice.org.uk/guidance/cg103/chapter/Recommendations) and [CDC environmental air guidance](https://www.cdc.gov/infection-control/hcp/environmental-control/air.html). They support assessment and environmental-care principles; they do not establish clinical effectiveness of PACS. Automated discomfort inference, physiological comfort prediction, AI personalization and HRV-triggered automation are labeled experimental and are not implemented as clinical decision algorithms.

PACS source is split into `pacs-state.js` (scenarios and approval rules), `pacs-scene.js` (reversible room bindings), `pacs.js` (dashboard and presentation), `pacs.css`, and shared `patient.js`, under `scripts/site/configurator/`. The existing site build copies these into `configurator/`; published copies are synchronized. Tests: `node scripts/12_check_pacs_state.mjs`, `node scripts/13_check_pacs.mjs`, and `node scripts/13_check_pacs.mjs --extended-only`. Browser screenshots are saved in `build/shots/`.

Verification performed: PACS state/approval rules; W1 and W3 monitor displays, lighting/blinds, selected adjustments, rejection, independent feedback, preference invalidation, clinical alert priority, reset, same-camera comparison, and exact room/camera/share restoration. Manual presentation navigation, mobile layout, preference dialogs and Escape handling passed. The automatic 11-step presentation completed in 77.4 seconds on the final run (79.7 seconds on the earlier run), with the alert still active. Browser checks verified patient click labels, interruption of an actual lighting/blind transition by a scripted warning, and cancellation when a proposal is revised/rejected or clinical review is withdrawn. The full APIS regression also passed after patient integration: all six examples in both rooms, real bedside-marker clicks, layers/materials/routing, original views, themes, day/night, profiles and comparisons, summary, tour, sharing, mobile controls, and original WASD/object picking. No uncaught browser errors or missing local assets were reported. Source/published parity, JavaScript syntax and whitespace checks passed. Original model assets and dimensions were unchanged; the Blender/Python rebuild was not run.

## Ventilation concept

The [ventilation plan](https://ihama1305-design.github.io/ICU-competition/ventilation/) shows supply, return and exhaust grilles for the floor, with the air-change and pressure basis for each kind of room. **It's concept work, not SSMC's mechanical design:** the drawings show no grilles, ducts or air data. The grilles are hidden in the walkthrough, the renders and the configurator for now, so the plan is the only place they show. The model still builds them, hidden, from the same list.

## Renders

| | |
|---|---|
| ![Whole floor](renders/aerial.png) | ![West wing cutaway](renders/aerial_close.png) |
| The whole floor with the ceiling off | Close cutaway of the west wing |
| ![Bedside](renders/bedside.png) | ![Nurse station](renders/corridor.png) |
| At the bedside (made-up readings, each screen marked SIMULATED) | The central nurse station from the corridor |
| ![Observation window](renders/observation.png) | ![Top view](renders/plan.png) |
| Into a patient room through an observation window | Top view |
| ![Isolation room](renders/iso_room.png) | ![Bed and window](renders/iso_window.png) |
| Isolation room W1 along its length | W1's bed, with the window beside the patient |

## Files

| File | What it is |
|---|---|
| [`downloads/icu.blend`](downloads/icu.blend) | Editable Blender 5.2 scene with collections Shell, Ceiling, Facade, Doors, Glazing, Joinery, Equipment, Lights, Cameras |
| [`downloads/icu.glb`](downloads/icu.glb) | The same model for other 3D tools (metres, Y-up, flat colours) |
| [`renders/`](renders/) | Full-size Cycles renders |
| [`REPORT.md`](REPORT.md) | How it was built, what is accurate and what is assumed |
| [`spec/icu_spec.json`](spec/icu_spec.json) | Every height, material, equipment position, light and camera ([field guide](spec/icu_spec.README.md)) |
| [`scripts/`](scripts/) | The pipeline, from drawing to website |
| `index.html`, `viewer/`, `configurator/`, `ventilation/`, `assets/` | The published website, served from the repo root. It is generated, so edit `scripts/site/` and rebuild instead |
| [`docs/`](docs/) | The configurator's brief and build plan |

## Rebuild

```bash
python3.13 -m venv .venv && .venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m playwright install chromium
scripts/run_all.sh            # about 20 minutes on an M-series Mac, most of it testing; --preview for quick renders
```

The pipeline runs 01 extract plan, 02 Blender scene, 09 fixture check, 10 ventilation plan, 03 renders, 04 GLB and viewer, 05 viewer test, 07 configurator rooms, 06 website, then 08 configurator test. 07 has to come before 06, which publishes what it writes. 05 and 08 need a network connection, because Three.js comes from a CDN.

Change a number in `spec/icu_spec.json` and run `scripts/run_all.sh` again. A rebuild replaces `output/icu.blend`, so save your own Blender edits under another name.

## The drawings are not in this repo

`input/` is git-ignored, because the SSMC record drawings were shared with competition entrants and this repo is public. To rebuild, put the four PDFs from *SSMC ICU Design Competition - Reference Drawings v1.zip* in `input/drawings/`.
