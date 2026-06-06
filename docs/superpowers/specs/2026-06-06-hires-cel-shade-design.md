# Hi-res cel-shaded 3D characters + scene depth

**Date:** 2026-06-06
**Status:** Approved — scope confirmed (hi-res chars + TARGET-quality scene assets); → writing-plans
**Topic:** Upgrade the six agents to higher-resolution, cel-shaded 3D sprites
(reference-quality hair/clothing/skin), fix front/back parity & the seated "ghost"
read, and bring the same cel-shaded 3D depth to scene objects.

> Builds on [2026-06-06-character-restyle-design.md](2026-06-06-character-restyle-design.md)
> (the current 36×39 cute sprites). Keeps that style's DNA (big-head chibi, top-left
> light) but raises detail and resolution to match the user's reference sheet.

---

## 1. Problem & goal

The current sprites are 36×39 px (`spriteScale 1`). At that size the back-facing view
reads as a flat featureless blob ("transparent/ghost"), hair has no lock detail, and
clothing/skin lack volume. The user supplied a reference sheet (6 chars, front+back) at
clearly higher detail: stranded hair with highlights, dimensional faces, role-based
clothing with folds/drawstrings/skirt/shoes, varied natural skin tones, cohesive team palette.

Goal:
1. **Hi-res, detailed sprites** approaching the reference — enlarge the sprite canvas.
2. **Cel-shaded 3D everywhere** — hair (per-style locks), clothing (rounded volume),
   skin (multi-tone), in one consistent lighting language (top-left-front).
3. **Front == back size**, natural per-style hairline (no flat forehead cut, no dark stripe).
4. **Cohesive, ref-quality scene** — seated agents read solid (not merged into the chair);
   furniture / props / rooms are upgraded to the reference scene's detail level; every
   piece has a drop shadow; objects get the same cel-shaded 3D treatment.

## 2. Locked decisions (from brainstorming)

- **Resolution:** enlarge the sprite canvas to reach reference detail. **Locked: `SZ=3`**
  (108×117 px) via the Phase 0 prototype + a **responsive canvas** (render the scene at higher
  internal resolution, scale-to-fit the viewport) so the larger sprites fit any screen crisply.
- **Roster unchanged:** keep the six agents and the `TOOL_TO_AGENT` mapping
  (Jamesmie / Manager / Reader / Editor(`coder`) / Searcher / Writer). Only their *look* changes.
- **Hair highlights are colored, not white** — a lightened hair tone (white-blend ≈ 0.17),
  no near-white specular tier (it read as "white rings", rejected).
- **Replaces** the earlier "scene lighting overlay (vignette + light pools)" idea →
  instead **cel-shade scene objects** for depth (user decision).

## 3. Validated direction (prototyped at 36 px)

The shading approach below was prototyped in [py/gen_sprites.py](../../../py/gen_sprites.py)
and approved via the §6/§7 PNG workflow (`__cute_preview.png`, `__back_preview.png`):

- **Hair** — `shade_hair(g, style)`: treat the head-hair mass as a sphere, ramp 4 flat
  tones (`j`/`h`/`H`/`x`) by surface normal (light upper-left-front), modulated by lock
  ridges fanning from the crown. Per-style params (lock count, crown/part offset, ridge
  depth) so short/sidepart/long/spiky/wild/wavy each flow differently. Over-shoulder
  drape gets a top-lit vertical-ridge ramp. Fringe tips touching the face are lifted out
  of deep shadow so the hairline isn't a hard dark stripe.
- **Front hairline** — `fringe(g, style)`: per-style bang depth profile over the forehead
  (swept / center-part / jagged / messy / wavy / rounded) instead of one flat cut.
- **Clothing** — `shade_body(g)`: cel-shade torso (`b`) as a left-front-lit cylinder into
  `B`/`b`/`k`/`n`; outfit-detail cells keep their flat colors.
- **Skin** — existing 4-tone ramp (`L`/`s`/`d`/`D`) kept; under-hair contact softened
  (`D`→`d`) so it doesn't double the dark forehead line.
- **Parity** — back torso bounds set equal to front.

These algorithms carry forward; Phase 0 re-tunes their constants for the larger canvas.

## 4. Per-character look (unchanged identities, ref-upgraded)

Same identities/roles as the prior spec §3 (crown/robe, tie+square-glasses, long+round-glasses,
hoodie+headphones, wild+jacket, beret+scarf). Upgrades per the reference:
- Hair: stranded locks + colored highlight + per-style hairline (§3).
- Clothing: role-readable, with folds/drawstrings/collar; cohesive team palette.
- **Skin tones deliberately varied & natural** (ref lists 5: light-yellow / fair / olive /
  tan / deep) — assign one per agent.
- Front **and** back views, plus the existing 3-frame leg walk-cycle.

## 5. Pipeline (authoring)

All sprite art is **generated**, never hand-edited in `app.js` (CLAUDE.md §6):
`py/gen_sprites.py` → render `__*_preview.png`, iterate until right → `--emit` writes
`__sprites_block.js` → port the block into `js/app.js`.

- New hair tones `j` (highlight), `x` (deep hair shadow); new body tone `n` (deep);
  these are **flat** (removed from `FORM`), shaded explicitly by `shade_hair`/`shade_body`.
- The render path (`render_cells`) mirrors `app.js` `depthProcess` so previews are faithful;
  the old hair specular block is removed in both.

## 6. `app.js` integration

- **Color map** — add `j`/`x`/`n` to `buildColorMap`; remove `h`/`H`/`b`/`B`/`k` from
  `FORM_KEYS` (now flat cel tones); delete the hair-specular block in `depthProcess`.
- **Resolution** — the new sprites are larger, so update `spriteScale`/sizing and every
  position that assumes the old footprint: `WORK_POS`, `SIT_POS`, `QUEUE_SPOTS`, the
  `drawChairBack` cover box, `drawAgent` width/height + name-label anchor, and the y-sort.
- **Seated de-merge** — when seated, ensure the head reads against the chair: a thin
  contact-shadow band between head and chair-back (and/or chair-back tone shifted off the
  hair tone). No alpha — sprites stay 100% opaque.
- Keep arrow-fn style, vanilla canvas, no new jQuery (CLAUDE.md §5).

## 7. Scene assets & depth (to reference quality)

The user supplied a reference scene image as the **quality bar** for the environment
(detailed desks/monitors, server racks, sofas, rugs, plants, wall props, room tints).
Bring the scene up to that bar — not just shade what exists.

- **Asset upgrade** — raise furniture / props / decor to the reference detail level.
  Approach (decided per-asset in Phase 3, validated via §6 PNG, **no build step / vanilla
  canvas / no new deps** — CLAUDE.md §1):
  - *Hero assets* (desks, monitors, server racks, sofas, cabinets): author detailed pixel
    grids via the same generator→baked-array→pixel-draw pipeline as the characters, so they
    can carry real cel-shaded detail.
  - *Minor decor* (plants, rugs, small props): richer procedural drawing is fine.
  - **Confirmed: the reference is a TARGET** (user) — current procedural furniture is below
    the bar, so this is a full asset upgrade, not just "preserve + shade".
- **Drop shadows** — one reusable soft-ellipse ground-shadow helper; audit
  `drawAllFurniture` + `drawDecor` and add it under every piece lacking one for grounding.
- **Cel-shade objects** — multi-tone cel shading (highlight / base / shadow faces) in the
  same top-left light so the scene matches the characters' 3D look. Replaces the dropped
  lighting-overlay idea. Keep subtle; validate by eye.
- Preserve room layout, tints, labels, and the nav/obstacle map (CLAUDE.md §4) — this is a
  *visual* asset upgrade, not a relayout.

## 8. Phasing (each phase ends with a rendered-PNG checkpoint)

0. **Resolution prototype** — rebuild the generator's geometry for the new canvas size;
   render ONE agent (front+back) at the new res; **user checkpoint** to lock the size &
   confirm quality before scaling to all six. (De-risks the §10 fidelity concern.)
1. **All six sprites** — port the validated per-character art (front/back/legs) through
   `--emit`; render the full sheet; user checkpoint.
2. **Port + integrate into `app.js`** — color map/FORM sync, scale & all positions,
   seated de-merge; verify the live page renders and agents sit/walk correctly.
3. **Scene assets** — upgrade hero assets to the reference bar (generator→baked grids),
   add drop shadows under every piece; render-PNG checkpoint.
4. **Cel-shade scene objects** for 3D depth; final whole-scene checkpoint.

## 9. Testing / verification (CLAUDE.md §6, §9)

- Every visual change: render a PNG and view it before integrating; delete `__*` before commit.
- `gen_sprites.py` width/height validation must pass (all frames uniform N×W).
- After porting: page renders with no `const` collision / sprite-width error; agents
  walk, sit, flash, and the back view is solid.
- No build tool/framework/jQuery growth; `agent-events.json` untouched.

## 10. Risks & expectations

- **Fidelity:** sprites are rendered via code + hand-tuned grids, not hand-painted. We can
  get *close* to the reference and will iterate via PNG, but a pixel-perfect 1:1 match is
  **not guaranteed** (stated to and accepted by the user).
- **Resolution ripple:** enlarging the canvas touches many `app.js` constants; Phase 2 is
  the riskiest integration step — do it behind the validated sprites, verify live.
- **Scope:** this is a large redesign; phases are independently shippable so we can stop
  at any checkpoint with a working dashboard.
