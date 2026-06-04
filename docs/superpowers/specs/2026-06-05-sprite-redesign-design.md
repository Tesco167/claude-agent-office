# Sprite Redesign — Design Spec

**Date:** 2026-06-05  
**File:** `office.html` (only file changed)

---

## Goals

1. Per-agent unique pixel art sprites (Stardew Valley style)
2. Chat positions: agents stand side-by-side, not overlapping
3. Collision avoidance: agents don't walk through furniture
4. Size balance: scale sprites up to match furniture proportions

---

## 1. Sprite Scale

Change `S` from `2` to `3`.

| | Before | After |
|---|---|---|
| Sprite canvas size | 32×48 px | 48×72 px |
| iMac monitor | 80×60 px | 80×60 px (unchanged) |
| Desk (james) | 160×80 px | 160×80 px (unchanged) |

After changing S, fine-tune `WORK_POS`, `IDLE_POS`, `CENTER_POS`, and `WALK` bounds so agents land correctly at desks and furniture.

---

## 2. Per-Agent Sprite Sets

### Architecture

Replace global sprite arrays with a per-agent structure:

```js
// OLD
const SPR_STAND = [...]
const WALK_FRAMES = [SPR_STAND, SPR_WALK1, SPR_STAND, SPR_WALK2]

// NEW
const SPRITES = {
  jamesmie: { stand, walk1, walk2, sit, phone },
  reader:   { stand, walk1, walk2, sit, phone },
  coder:    { stand, walk1, walk2, sit, phone },
  searcher: { stand, walk1, walk2, sit, phone },
}
// walkFrames = [stand, walk1, stand, walk2] derived per-agent in drawAgent
```

Each agent object gains two fields:
```js
hairColor: '#xxxxxx',   // used in drawSprite colorMap
sprites: SPRITES.key,   // reference to this agent's sprite set
```

### drawSprite signature

```js
function drawSprite(grid, cx, cy, bodyColor, facingLeft = false, hairColor = null)
```

ColorMap additions:
- `h` → `hairColor || C.hair`
- `z` → `'#4a3520'` (shoe/boot, dark brown)

### Character Designs

#### Jamesmie — Male Boss
- Hair: short, flat, black (`#1a0a00`)
- Outfit: gold suit, white V-collar (`w` pixels at neckline)
- Crown row prepended as before
- Expression: slight smile

#### Reader — Female Librarian
- Hair: long sides with two strands framing face, auburn (`#8b4513`)
  - Extra hair pixels on rows 1–3 extending down the sides of the body
- Outfit: blue cardigan, white collar
- Expression: soft smile

#### Coder — Male Programmer
- Hair: short spiky, dark blue (`#1a237e`)
  - Slightly raised pixel at top-center for spiky look
- Outfit: green hoodie, no collar (hood ridge on shoulders using `h` color)
- Expression: neutral/serious

#### Searcher — Female Explorer
- Hair: short asymmetric, burgundy red (`#6b0f1a`)
  - One-sided spike (extra `h` pixel on right side rows 0–1)
- Outfit: orange jacket, white lapels (`w` pixels on both sides of chest)
- Expression: wide smile

All characters share the same leg/shoe design: black legs (`l`), brown shoes (`z`).

Walk cycle: `[stand, walk1, stand, walk2]` — same 4-frame structure, per-agent.

---

## 3. Chat Positioning

### Problem
`_checkChat()` currently shows bubbles wherever agents happen to be standing, causing overlap.

### Solution

`_checkChat()` must also exclude `idle_chat_walk` from candidates (add to the existing `idle_chat` exclusion).

When chat triggers between agents A and B:
1. Compute midpoint between A and B
2. Set A's `targetPos` to midpoint offset left by 20px → `state = 'idle_chat_walk'`
3. Set B's `targetPos` to midpoint offset right by 20px → `state = 'idle_chat_walk'`
4. When both arrive (within 3px), show speech bubbles and set `state = 'idle_chat'`
5. Force `facingLeft` so they face each other

New states: `idle_chat_walk` (walking to chat position), `idle_chat` (standing and talking).

`idle_chat` exits after `speechTimer` expires → back to `idle_wander`.

---

## 4. Collision Avoidance

### NAV_OBSTACLES

A list of bounding boxes agents must not walk through:

```js
const NAV_OBSTACLES = [
  FURN.jamesDesk,
  FURN.readerDesk,
  FURN.coderDesk,
  FURN.searchDesk,
  FURN.coffee,
  FURN.sofa,
];
```

### Idle Wander Destination

When picking a random wander target, reject and re-roll if the point falls inside any NAV_OBSTACLE box (with 10px padding). Max 20 re-rolls before accepting anyway.

### Pathfinding (Waypoints)

When `moveToward` is called and the direct line from `agent.pos` to `targetPos` intersects an obstacle:

1. Find the intersecting obstacle
2. Choose the nearest corner of that obstacle (with 12px clearance)
3. Insert that corner as a temporary waypoint: set `agent._waypoint` to the corner
4. Move toward `_waypoint` first; when arrived, clear `_waypoint` and resume toward `targetPos`

Only one waypoint at a time. If waypoint path also intersects, skip (accept clipping on rare edge cases).

---

## 5. Position Fine-Tuning

After S=3, update these constants:

| Constant | What to adjust |
|---|---|
| `WORK_POS` | All 4 agents — feet should land just in front of their desk |
| `IDLE_POS.coffee` | Agent stands in front of coffee machine |
| `IDLE_POS.sofa` | Agent sits at sofa center |
| `CENTER_POS` | Jamesmie announcement position stays roughly center |
| `WALK` bounds | Expand slightly to account for larger sprite footprint |

Fine-tuning is done by running the app and visually adjusting until agents look correctly positioned at each station.

---

## Out of Scope

- Multi-waypoint pathfinding (A*)
- Per-agent sit/phone pose differences
- Animation frame timing changes
- Any changes to event polling, state machine logic, or hook system
