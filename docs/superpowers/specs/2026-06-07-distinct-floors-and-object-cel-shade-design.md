# Distinct per-room floors + bold cel-shaded objects

**Date:** 2026-06-07
**Status:** Approved (brainstorm) — → writing-plans
**Topic:** Give each of the 4 rooms a distinct floor *material* (not just a tint), and bring
bold toon cel-shading + contact shadows to every scene object for a clear 3D read.

> **Relationship to prior work:** This completes spec
> [2026-06-06-hires-cel-shade-design.md](2026-06-06-hires-cel-shade-design.md) §7 / Phases 3–4
> ("Plan B": cel-shade scene objects + drop shadows), which was deferred and never planned.
> It **also adds a new feature not in that spec** — distinct floor materials per room (the
> old spec said "preserve room tints"). Characters (Phases 0–2) are already done on this
> branch (`feat/hires-cel-shade-characters`).

---

## 1. Problem & goal

Current state (from `js/app.js`):
- **Floors** — each room is one flat `rect()` fill of its `floor` color
  ([app.js drawAllRooms ~L857](../../../js/app.js)) plus a single faint white grid that is
  **identical in all four rooms** ([drawFloors ~L2881](../../../js/app.js)). So the floors
  differ only by base color; the pattern/material is the same everywhere.
- **Objects** — furniture uses `shadeHex()` for a few light edges inconsistently and has **no
  contact shadow**, so pieces read flat and ungrounded.

Goal (locked in brainstorm):
1. **4 distinct floor materials**, one per room — visibly different surfaces, not just tints.
2. **Bold "toon" cel-shading on every object** — flat highlight band (top/left) + flat shadow
   band (bottom/right), one consistent light direction (top-left), matching the characters.
3. **A soft contact shadow under every 3D object** so it sits on the floor.

## 2. Locked decisions (from brainstorming)

- **Floors:** distinct **material** per room (not just color) — chosen over "same tile, recolor
  only" and "color-only".
- **Cel-shade strength:** **bold toon** (punchy flat highlight/shadow bands + dark contact
  shadow) — chosen over subtle/medium.
- **Scope:** **all objects** get cel edges **and** a contact shadow (not "major furniture only",
  not "edges without shadow").
- **Implementation:** floors are **pre-rendered once to an offscreen canvas and blitted** each
  frame (perf); cel-edges + contact-shadow are **shared helpers called inside the existing
  furniture functions** — NOT a from-scratch rewrite of every function.
- **Light direction:** top-left (same as the characters' `shade_*` and existing furniture
  sheen), so highlights land on top/left edges and shadows on bottom/right.

## 3. Floor design — 4 materials

Base colors are unchanged (already distinct & theme-matched); the **material/pattern** is new.
All tones derive from the room's `floor` color via `shadeHex` so themes stay coherent.

| room | pos | base | material |
|------|-----|------|----------|
| `boss` | top-L | `#2a1f3d` purple | **ceramic tile** — large tiles, darker grout lines, 1px top-left highlight per tile |
| `dev` | top-R | `#1e2a2e` teal | **ceramic tile** — *smaller* tiles than boss, teal grout (same renderer, different tile size + grout tone, so boss≠dev at a glance) |
| `ops` | bot-L | `#1a2218` green | **raised metal floor / grate** — square panels, beveled (light top-left / dark bottom-right) edges, small bolt dots at panel corners (server-room theme) |
| `lounge` | bot-R | `#2e2415` brown | **wood planks** — horizontal planks, dark seam between rows, alternating per-plank shade, faint grain streaks |

> Note: the reference image shows the bottom-left (green) room as plain tile. We deliberately
> make `ops` a metal grate instead — it's the server/rack room, so a distinct industrial floor
> reads better. (User can revert it to green tile after the PNG preview if preferred.)

**Architecture — offscreen floor cache:**
- New `FLOOR_STYLE = { boss:'tile', dev:'tile', ops:'grate', lounge:'plank' }`.
- New renderers `floorTile(g, room, opts)`, `floorGrate(g, room)`, `floorPlank(g, room)` that
  draw into a 2D context `g`, clipped to the room's **inner** rect (same bounds the current
  grid uses: `x+WALL … x+w-WALL`, `y+28 … y+h-WALL`).
- `drawFloors()` is replaced: on first call it lazily builds **one offscreen canvas** the size
  of the world, renders each room's floor into it once via the matching renderer, then every
  frame just `ctx.drawImage(floorCanvas, …)`. So the per-frame cost is ~1 blit, not hundreds of
  `fillRect`s. (The base-color fill in `drawAllRooms` stays as the backstop / under the cache.)
- Cache is built at the current world scale (the `K`/`SZ=3` scale already in place); since the
  layout is static it is built once. If a global scale knob changes, rebuild is a one-liner
  (invalidate the cached canvas).

## 4. Object cel-shade design — two shared helpers

Both live with the other DRAW HELPERS (near `rect`/`glow`/`shadeHex`, ~L316–L340) and reuse
the existing `shadeHex`.

1. **`celEdges(x, y, w, h, base, opts?)`** — after a block's base fill, paint flat toon bands:
   - top edge: `shadeHex(base, ~1.45)` highlight, ~2px
   - left edge: `shadeHex(base, ~1.25)` highlight, ~2px
   - bottom edge: `shadeHex(base, ~0.55)` shadow, ~2–3px
   - right edge: `shadeHex(base, ~0.7)` shadow, ~2px
   `opts` can tune band thickness / factors per object. Bold by default (high contrast).

2. **`contactShadow(x, y, w, h, opts?)`** — a soft dark blob on the floor under a 3D object,
   offset slightly **down-right** (opposite the light). Implemented as a low, semi-transparent
   dark ellipse/rounded shape (e.g. radial `glow` in `rgba(0,0,0,~0.4)` flattened, or a blurred
   rounded rect), wrapped in `save/restore` so no `globalAlpha`/composite leaks. Drawn **before**
   the object body.

**Application (scope = all objects):**
- Add `contactShadow(...)` + `celEdges(...)` calls **inside each furniture/decor draw function**
  (each already knows its own footprint): desks (boss/manager/work/gaming), monitors, office/
  gaming/top-down chairs, sofas, coffee tables, cabinets, server racks, fridge, crates, plants,
  bookshelves, whiteboards, monitor panel, coffee machine, OLED TV, neon/frames as appropriate.
- **Exclude flat floor decals** — `drawRugTopDown` is a flat rug on the floor: no contact shadow
  (a rug casts none); a very subtle edge darkening is optional but not required.
- Keep each function's existing identity/colors; we are **adding depth**, not redrawing art.

## 5. `app.js` integration points

- **Replace** `drawFloors()` (~L2881) with the cache-backed dispatcher + add `FLOOR_STYLE`,
  `floorTile`/`floorGrate`/`floorPlank`, and the lazy offscreen-cache build.
- **Add** `celEdges` + `contactShadow` near the draw helpers (~L316).
- **Edit** the ~20 furniture/decor functions to call the two helpers (mechanical, one block
  each). `drawAllFurniture`/`drawDecor` call sites are unchanged (helpers live inside the
  functions), so the scene composition and the draw order in `draw()` stay intact.
- **Do not** touch room layout, labels, tints, the `NAV_OBSTACLES`/pathfinder map, the
  agents, hooks, or `agent-events.json` — purely visual.
- Conventions (CLAUDE.md §5): arrow functions only, vanilla canvas, **no new jQuery**, watch
  for `const` name collisions (would blank the page), verify the page renders after porting.

## 6. Authoring pipeline (CLAUDE.md §6 — required)

`node` isn't installed, so validate visually via PNG before integrating:
1. Build throwaway Python that replicates `celEdges`/`contactShadow` + the 4 floor renderers
   with the **same color map / `shadeHex` / scale** as `app.js`, using the stdlib `zlib`+`struct`
   PNG encoder already used by `py/gen_sprites.py`.
2. Render `__*.png` previews: (a) 2–3 sample objects with cel-edges + shadow, (b) all four floor
   materials. **Read** them and iterate until right.
3. Port the validated constants/grids into `js/app.js` (via temp file to avoid transcription
   errors). Verify the live page renders (no `const` collision / width error).
4. Delete `__*.png` / `__*_gen.*` before committing.

## 7. Verification (no test framework — CLAUDE.md §6, §9)

- Render-PNG-and-view for both the floors and the cel-shaded objects before integration.
- Live page renders (not blank), all four floors look distinct, objects read as 3D with
  grounded shadows, draw order/occlusion with agents still correct (shadows under objects,
  objects under agents).
- Perf: floors blit from cache (no per-frame tile loops); the rAF loop stays smooth.
- No build tool/framework/jQuery growth; `agent-events.json` and `__*` not staged.

## 8. Phasing (each phase ends with a PNG/live checkpoint)

1. **Helpers + object cel-shade** — `celEdges` + `contactShadow`; PNG-preview on sample
   objects; apply across all furniture/decor functions; verify live; user checkpoint.
2. **Distinct floors** — 4 renderers + offscreen cache replacing `drawFloors`; PNG-preview all
   four materials; integrate; verify live; user checkpoint.
3. **Final whole-scene polish** — review floors + objects + agents together in the live app,
   tune band/shadow strength and grout/seam tones by eye; final user checkpoint.

(Phases are independently shippable; we can stop at any checkpoint with a working dashboard.)

## 9. Risks & expectations

- **Perf:** the floor cache is the mitigation for per-frame tile cost; if anything regresses,
  the blit approach is the fallback (it should not). Contact shadows are ~20 cheap blobs/frame.
- **Fidelity:** materials are procedural pixel art, validated by eye via PNG — close to the
  reference, not a pixel-perfect 1:1 (consistent with the prior spec's stated expectation).
- **Execution model:** once this design is locked the work is mechanical — per CLAUDE.md
  operating rules, planning (Opus) then delegate the edits to a smaller model (Sonnet).
