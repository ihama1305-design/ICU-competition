# ICU room configurator: Claude Code brief

> **How to use this.** Save this file in the repo as `docs/room-configurator-brief.md`. Open Claude Code in the repo, switch to plan mode, and send:
>
> `Read @docs/room-configurator-brief.md and the files it points to. Ask me the questions in section 7, then write the plan to docs/configurator-plan.md. Don't write code until I approve the plan.`
>
> Between phases, run `/clear` and start the next one with:
> `Read @docs/room-configurator-brief.md and @docs/configurator-plan.md, then do phase N.`

---

## 1. What I want

Two additions to the ICU-competition site. Both are a **proposed redesign**, not the as-built floor:

1. **A render slider** on the home page that slides from the current hero render (standard room W3) to a new render of an **isolation room** (W1, with its ante room).
2. **A room configurator page** where you spec an ICU isolation room the way you spec an Aston Martin: a large 3D room you can see from set angles and orbit, curated style themes, individual options that update live, day and night lighting, and a summary you can share.

## 2. What already exists (read before planning)

- `README.md`, `REPORT.md`, `spec/icu_spec.README.md`: how the model is built and what is measured vs assumed.
- **Pipeline:** `spec/icu_spec.json` → `scripts/run_all.sh` → 01 extract plan → 02 Blender scene (bpy 5.2; `kit.py` builds the room kit) → 03 Cycles renders → 04 GLB + viewer → 05 headless viewer test → 06 website.
- **Walkthrough:** `scripts/viewer_template.html`. Three.js 0.170.0 from jsDelivr through an import map, no bundler, loads `assets/model/icu.glb.gz` with `DecompressionStream`, `NeutralToneMapping`. Reuse this setup.
- **Site:** `scripts/site/index.template.html` + `styles.css`, built by `06_build_site.py` into the repo root (GitHub Pages serves `main` from the root). `index.html`, `viewer/` and `assets/` are **generated: edit the templates and rebuild, never the outputs.**
- **Isolation rooms are W1 and E1** (ante room + toilet; see the room labels in `04_export.py`). The hero room is W3 (`cameras.hero_room_label`).
- A full rebuild needs the SSMC drawings in `input/drawings/`. They are git-ignored and must never be committed. If they're missing on this machine, stop and tell me before choosing a fallback.
- **Design language:** teal accent on cool neutrals, IBM Plex Sans and Mono, the motion tokens at the top of the viewer CSS, light and dark themes, `prefers-reduced-motion`. New pages must look like they belong to this site.

Use a subagent to map the pipeline (especially how 02 and `kit.py` name objects, and how 04 exports them) so the exploration doesn't fill the main context.

## 3. Render slider (home page)

- Add Cycles cameras for isolation room W1 to the spec, framed like `room_entry`. At minimum: one view from the ante room through the inner door into the room. Render them in 03 and publish them through 06 like the other renders (WebP srcset, alt text, link to full size).
- Replace the single hero figure with a slider: **Standard room (W3) ↔ Isolation room (W1)**. Drag or swipe, arrow keys, and two labelled tabs. CSS scroll-snap or a small vanilla script, no library. The caption changes with the slide.
- Default to a swipe carousel. The alternative is a before/after wipe with a draggable divider (see section 7).

## 4. Configurator page (`/configurator/`)

### 4.1 The experience: borrow from car configurators

Copy the behaviour of Aston Martin's and Porsche's configurators, not their branding:

- **Stage and panel.** The 3D room fills the screen. Options sit in a side panel on desktop and a bottom sheet on phones. Every change shows instantly in 3D.
- **Set camera angles plus free orbit**, with smooth eased moves between them:
  - Entrance, through the glazed front
  - Patient's eye view from the bed: what they look at all day (ceiling, TV, window)
  - Family zone
  - Window / patio
  - Overhead "dollhouse" with the ceiling removed
  - Orbit is clamped so the camera never passes through walls or below the floor.
- **Curated themes, then bespoke.** Aston offers designer-curated interior packages and lets you customise from there. Do the same with 4 themes that each set many options at once; after applying one, any option can still be changed:
  - *Calm Clinical*: today's room, tidied up
  - *Desert Sanctuary*: sand and warm-white walls, light timber, a mashrabiya-pattern feature wall
  - *Paediatric Play*: brighter accents, toy shelf, play mat, fish tank, sky ceiling
  - *Family Suite*: sofa-bed, larger TV, warm cove lighting, patio
- **Time of day.** A Day / Night toggle plus a time slider (morning, midday, sunset, night). Sun from the west-south-west (azimuth 250° in the spec, matching the renders) at Abu Dhabi's latitude. Night needs a dark exterior so the interior lighting reads.
- **Cinematic tour.** One button that eases through the camera presets.
- **Summary and share.** A spec sheet listing every chosen option, a short spec code in the URL hash that restores the exact configuration on load, and a "save image" PNG of the current view.

### 4.2 Options

Make it data-driven: one file (`scripts/site/configurator/options.json` or a JS module) defines the categories, options, themes, and which mesh, material or object each option changes. Adding an option should mean editing data, not code.

| Category | Options |
|---|---|
| Walls | Paint colour: about 10 curated, wipeable-finish colours plus a custom picker. Feature wall: wood-look, acoustic fabric panel, printed mural (dunes or sea), mashrabiya screen |
| Floor and ceiling | 3–4 vinyl looks. Ceiling: plain, or a "sky" printed panel above the bed |
| Lighting | Schemes: cove (indirect LED around the ceiling edge), recessed downlights, linear slot, circadian tunable white. Colour temperature 2700 / 3000 / 4000 K or "circadian (auto)". Bed reading light. Low amber floor-level night light for nurse rounds. Each scheme must read clearly at night |
| Privacy | Keep the existing sliding glass front. Options: switchable smart glass (PDLC) with a wall switch that fades clear ↔ opaque in about 300 ms, integral blinds between the glass, frosted band. Choosing smart glass removes the privacy curtain |
| Entertainment | TV: size options; off, or on with a looping placeholder video (original or generated, never copyrighted footage). Placed on the patient's eye line from the bed. Gaming console with controller |
| Children | Toy shelf, soft toys, play mat in the family zone |
| Fish tank | Wall-recessed, sealed aquarium with simple animated fish; or a "digital aquarium" screen |
| Window and outside | Two palm trees visible from the bed view (date palms): in planters on the terrace when the patio is on, otherwise tall crowns rising outside at window height, since the room is on the 4th floor. Low desert planting. Roller or motorised blackout blinds |
| Patio | Small shaded balcony beyond one facade bay: a sliding door wide enough for a bed or wheelchair, pergola or shade sail (UAE sun), glass balustrade, planters with palms, one chair |
| Room | Isolation room W1 with ante room by default; a switch to standard room W3 |

### 4.3 Clinical sense checks

Show these as short notes in the panel and on the summary. Flag, don't block:

- **Smart glass** has real ICU precedent on sliding fronts: staff can see in when needed, and replacing cubicle curtains makes rooms easier to clean between patients.
- **Isolation doors** need bottom seals so the room holds its pressure. Note that the front is isolation-rated.
- **Patio on an isolation room:** an outside door works against the pressure regime. Allow it with a warning and note it suits standard rooms best.
- **Fish tank and plants:** infection-control teams often restrict open water and potted soil near critically ill patients. Default to a sealed tank serviced from outside the room (or the digital version), and keep live plants outside the glass.
- **Circadian lighting:** a study of redesigned ICU rooms with dynamic lighting found less delirium. Mention it on the circadian option.

### 4.4 Technical approach

- **Geometry.** Prefer a new pipeline step (for example `scripts/07_export_room.py`) that exports a single-room GLB from the Blender scene: W1 plus its ante room plus one facade bay, and W3 for the room switch. Give every configurable surface its own clearly named mesh (paint walls, feature wall, floor, ceiling, front glass, facade glass), and add empties as anchors for add-ons (TV, console, toys, aquarium, patio, palms). If the drawings aren't available, fall back to isolating the room from `assets/model/icu.glb.gz` by node name (`roomNN_*`) plus a clipping box, and say so in the plan.
- **Add-on objects.** Build them procedurally (in the style of `kit.py`, or in Three.js), or use CC0 models only, recording the source and licence in `REPORT.md`.
- **Materials.** `MeshPhysicalMaterial` with transmission for glass. Opaque smart glass: transmission down, roughness up, slight milky tint.
- **Lighting.** Day: the Sky addon plus a directional sun with shadows. Cove and slot lights: `RectAreaLight` (call `RectAreaLightUniformsLib.init()`) plus emissive strips with selective bloom so the glow is visible. Downlights: `SpotLight`. Start from the viewer's `NeutralToneMapping`; try AgX if it matches the Cycles renders better.
- **Stack.** The same Three.js 0.170.0 import map, ES modules, no bundler. Template at `scripts/site/configurator.template.html`, built into `configurator/index.html` by `06_build_site.py` (or a new step). Link it from the home nav and the hero.
- **Performance.** Initial download under about 15 MB, pixel ratio capped at 2, add-ons lazy-loaded. Smooth on a laptop's integrated GPU and usable on a recent phone.
- **Accessibility.** Every control reachable by keyboard with visible focus and a screen-reader label. Respect reduced motion, including the camera moves and the tour.

## 5. Working agreement

- **Plan mode first.** Explore, ask me section 7, write `docs/configurator-plan.md`, and wait for approval.
- **Phases**, each on its own branch with a PR:
  1. Isolation render + home slider
  2. Room GLB, configurator shell, camera presets, day/night
  3. Walls, floor, ceiling, lighting schemes, smart glass, palms
  4. TV, console, toys, aquarium, patio, themes, summary and share code
  5. Polish, tests, README / REPORT / site copy
- Keep the "independent student work, not endorsed by SSMC" disclaimers. Label everything in the configurator as a design proposal, and leave the as-built accuracy claims as they are.
- Never commit `input/` or the drawings.

## 6. How to verify: show me evidence, not "done"

- Add `scripts/08_check_configurator.py` in the style of `05_check_viewer.py`: headless Chromium with SwiftShader, wait for `window.__configReady`, then apply each theme, day and night, smart glass clear and opaque, and patio on and off. Fail on any console error. Save screenshots to `build/shots/config_*.png`, including a 390×844 phone view.
- Open those screenshots yourself and check they show what the step claims: cove lights visibly glowing at night, the glass actually opaque, palms visible from the bed view.
- Round-trip test: set options → read the spec code → reload with it → same state.
- Run `scripts/run_all.sh --preview` (or the narrowest steps that cover the change) and confirm the site builds with no unfilled placeholders.
- Run `/code-review` on the diff before each PR.
- End each phase by listing the commands you ran with their results, plus the screenshots.

## 7. Questions to ask me before building

Defaults in brackets. If I say "go with the defaults", use them.

1. Slider: swipe carousel, or before/after wipe? [carousel]
2. Configurator room: isolation W1 only, or a switch to standard W3? [both, W1 by default]
3. Children's toys: part of a paediatric theme, or general family items? [paediatric theme, plus individual options]
4. Patio on the isolation room: allow with a warning, or standard rooms only? [allow with a warning]
5. Fish tank: sealed real tank, digital screen, or both? [both, sealed by default]

## Done when

- The home page slides between the W3 and W1 renders on desktop and phone.
- `/configurator/` loads; every option in 4.2 changes the 3D room live; themes apply; day and night show each lighting scheme; the smart-glass switch works; palms are visible from the bed view; a spec code reloads the same room.
- `08_check_configurator.py` passes, and README and REPORT describe the new pages.

## References (fetch if useful)

- Aston Martin configurator (curated themes, zoom, cinematic views): https://www.carmag.co.za/news/aston-martin-range-updated-as-new-game-inspired-configurator-launches/
- Aston Martin configurator (studio vs scenic backdrops, day and night, 360° view): https://www.autodevot.com/?p=49815
- Switchable glass replacing curtains in an ICU: https://healthcaredesignmagazine.com/news/memorial-sloan-kettering-cancer-center-intensive-care-unit-new-york-ny/1683/
- ICU sliding doors, smart glass and isolation seals: https://stanleyaccess.com/node/2536
- Switchable-glass ICU sliding door product: https://assaabloyentrance.com/nz/en/documents/health/NZ-SL-Hygienic-ICU-BROCHURE.pdf
- ICU design, dynamic lighting and delirium: https://www.hfmmagazine.com/design-features-influencing-circadian-rhythm
