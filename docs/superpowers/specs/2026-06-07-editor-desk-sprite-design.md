# Editor Workstation Sprite — Design

**Date:** 2026-06-07
**Topic:** Replace the Editor (`coder`) procedural desk + chair with a baked top-down PNG station, keeping the live monitor feature.

---

## Goal

Swap the Editor's procedural gaming desk + chair for the hand-crafted reference art
`assets/Object/Computer Desk/Editor/editor_desk_and_chair.png` — a full top-down station
(triple curved monitors, RGB keyboard, gaming chair, gaming PC case) — while preserving the
dashboard's core feature: monitors that react to real Claude Code tool calls.

## Decided behaviour (from brainstorming)

- **Base:** the full reference image is the Editor's station sprite (monitors + keyboard + chair + gaming PC case).
- **Monitors glow always.** All 3 screens + the gaming PC case carry an ambient bloom/RGB glow at all times.
- **Animated code only when seated.** When the Editor is seated/working, flowing code/terminal content
  is overlaid on the 3 screens (reuse the existing code-stream renderer). When *not* seated, the screens
  stay as the baked art but still glow.
- **Gaming PC case** stays (it is a gaming tower, not a server rack) and glows too.
- **Background keyed to transparency** via edge flood-fill (same convention as the Jamesmie/Manager desks),
  so the station floats over the real ops grate floor — no baked floor patch.

## Image prep (Python, per CLAUDE.md §6)

1. Source: `assets/Object/Computer Desk/Editor/editor_desk_and_chair.png`.
2. Edge flood-fill the dark tiled-floor background → transparent (preserves interior dark pixels of the art).
3. Keep monitors + keyboard + gaming chair + gaming PC case.
4. Save processed → `assets/editor-desk-topdown.png` (matches `*-topdown.png` naming).
5. Render a preview PNG with the stdlib encoder and **view it** before integrating; iterate.

## Rendering changes (`js/app.js`) — follow the Jamesmie/Manager PNG pattern

- Add `EDITOR_DESK_IMG = new Image()` + `drawEditorDesk(x, y, w, h)`:
  - If decoded: `drawSpriteShadowed` aspect-preserved at the chosen width.
  - **Fallback** until decode / if missing: existing `drawGamingDeskTopDown(...)` + `drawGamingChairTopDown(...)`.
- Replace the ops desk + chair draw calls at [app.js:1136-1138](../../js/app.js#L1136) with a single `drawEditorDesk(...)`.
  Drop the separate chair call (chair is baked into the image).
- Remove `coder` from `drawChairBack`'s `DESK_BASE` map — the chair is baked, so the seated agent renders on top of it (no procedural chair-back).
- Define 3 monitor screen-rects + a gaming-PC-case glow point positioned over the new sprite:
  - **Always:** bloom/glow on all 3 monitors + PC case (cyan / RGB accent).
  - **Seated** (`working` / `desk_linger` / `idle_desk` arrived): animated flowing code overlaid on the 3 screens.
- Retune `WORK_POS.coder`, `SIT_POS.coder`, and the ops `NAV_OBSTACLES` box to the new (larger) station footprint.
- Add `EDITOR_DESK_IMG` to the decode→redraw list at [app.js:3361](../../js/app.js#L3361) so the scene cache refreshes on load.

## Out of scope

- No change to other desks, roster, hooks, or the tool→agent mapping (`coder` key / "Editor" display name stay).
- No build tooling; jQuery footprint unchanged.

## Verification (per CLAUDE.md §6 / §9)

- Rendered + viewed preview PNG; `__*` artifacts deleted before commit.
- Page renders (no `const` collision, no sprite-width error).
- Editor sits aligned in the baked chair; screens animate **only** when working; glow persists when idle.
- `agent-events.json` / `__*` not staged; conventional-commit message.
