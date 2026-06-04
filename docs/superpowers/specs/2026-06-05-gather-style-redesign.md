# Gather-Style Top-Down Redesign — Design Spec

**Date:** 2026-06-05
**File:** `office.html` (complete rewrite of visual layer only)

> This spec supersedes `2026-06-05-sprite-redesign-design.md` (side-view redesign).

---

## Goals

Replace the side-view canvas with a Gather.town-style top-down pixel art office:
- 4 distinct rooms in a 2×2 grid
- Top-down character sprites with 4-direction facing
- Depth-sorted rendering (Y-sort)
- Keep hook system, event polling, and agent state machine unchanged

---

## 1. Canvas & Room Layout

**Canvas:** 900×560px (unchanged)
**Header bar:** 40px — ป้าย ส. ขอนแก่น (top of canvas, full width)
**Play area:** 900×520px below header, divided into 2×2 grid

Each room: ~450×260px (including 8px walls)

```
┌──────────────────────┬──────────────────────┐  y=40
│   BOSS ROOM          │   DEV ROOM           │
│   Jamesmie           │   Reader + Coder     │
│   formal/private     │   open plan desks    │
├──────────────────────┼──────────────────────┤  y=300
│   OPS ROOM           │   LOUNGE             │
│   Searcher           │   sofa + coffee      │
│   open plan 1 desk   │   plants + relax     │
└──────────────────────┴──────────────────────┘  y=560
x=0                   x=450                  x=900
```

### Room floors
| Room | Floor color | Feel |
|------|-------------|------|
| Boss Room | `#2a1f3d` dark carpet | formal |
| Dev Room | `#1e2a2e` slate tile | technical |
| Ops Room | `#1a2218` dark concrete | utilitarian |
| Lounge | `#2e2415` warm wood | relaxed |

### Walls
- 8px thick, color `#1a1a2e` with 2px highlight `#3d3d5c`
- Interior wall (shared between rooms): same treatment
- **Doorways**: 28px opening at center of each shared wall — no door sprite, just gap

### Room labels
- Small text top-left corner of each room, 10px, color `#ffffff` opacity 0.4

---

## 2. Furniture (top-down view)

All furniture drawn as flat top-down shapes with a drop shadow (3px offset, 40% opacity black).

### Boss Room
- **Large desk** (120×60px) — dark walnut `#3d2b1a`, top-left area, iMac on it
- **Visitor chairs** (2×) (24×28px each) — in front of desk facing boss
- **Bookshelf** (80×18px) — against back wall, dark `#2d1f0e`
- **Plant** (20×20px) — corner, dark green `#1a3a1a` with lighter leaf `#2d6b2d`

### Dev Room
- **2 desks** (90×50px each) — dark gaming style `#2d2d4e`, side by side
- **2 iMacs** — one per desk
- **2 gaming chairs** — below each desk
- **Small shelf/rack** (30×60px) — server rack look, side wall

### Ops Room
- **1 desk** (90×50px) — same as Dev Room
- **1 iMac** — on desk
- **1 gaming chair** — below desk
- **Wall-mounted monitors** (2×) — decorative, against back wall

### Lounge
- **Sofa** (100×40px) — blue `#2d3561`, horizontal center
- **Coffee table** (50×30px) — round-ish, center of room
- **Coffee machine** (28×28px) — corner
- **2 large plants** (24×24px each) — corners
- **Rug** (120×80px) — under sofa+table, subtle warm `#3d2a1a`

---

## 3. Character Sprites (top-down)

**Grid:** 16 wide × 20 tall, S=3 → **48×60px** per character on canvas

**2 sprite sets per character:**
- `facing_down`: stand, walk1, walk2 — used for down + left + right (left mirrors right via existing `facingLeft` flag in drawSprite)
- `facing_up`: stand, walk1, walk2 — used when moving upward (shows back of head)

**Total:** 6 sprite arrays per character × 4 characters = 24 arrays

### Color keys
Same as side-view: `.` `s` `h` `b` `l` `z` `w` `c` `e` (shoe `z='#4a3520'`)

### Top-down sprite structure (facing down = toward viewer)
```
rows 0-1:   hair top (widest, most visible from above)
rows 2-4:   face (small, angled perspective)
rows 5-8:   shoulders + arms (widest part of body)
rows 9-14:  torso + waist
rows 15-17: legs
rows 18-19: feet/shoes
```

### Per-character identity
| Agent | hairColor | bodyColor | Distinctive feature |
|-------|-----------|-----------|---------------------|
| Jamesmie | `#1a0a00` | `C.jamesGold` | Crown row prepended (up/down facing) |
| Reader | `#8b4513` | `C.readerBlue` | Hair extends past shoulders (rows 6-8) |
| Coder | `#1a237e` | `C.coderGreen` | Spiky hair top, hood on shoulders |
| Searcher | `#6b0f1a` | `C.searchOrange` | Asymmetric hair spike right side |

For `left`/`right` facing: sprite grid is mirrored (use `facingLeft` flag in drawSprite — existing logic).

For `up` facing (away from viewer): hair visible, no face rows (replaced with back-of-head).

### Name label
Floating 12px text above sprite center, color `#ffffff`, with colored dot (agent.color) to left.
Speech bubbles position adjusted for top-down (above sprite, same logic as before).

---

## 4. Agent Positions

New `WORK_POS` (feet position, center-bottom of sprite):

```js
const WORK_POS = {
  jamesmie: { x: 170, y: 200 },   // Boss Room — behind large desk
  reader:   { x: 560, y: 190 },   // Dev Room — left desk
  coder:    { x: 720, y: 190 },   // Dev Room — right desk
  searcher: { x: 170, y: 460 },   // Ops Room — desk
};

const IDLE_POS = {
  coffee: { x: 790, y: 490 },     // Lounge — coffee machine
  sofa:   { x: 680, y: 430 },     // Lounge — sofa center
};

const CENTER_POS = { x: 450, y: 300 };  // doorway intersection

const WALK = { x: 30, y: 80, maxX: 870, maxY: 530 };
```

---

## 5. Rendering Pipeline

Each frame in `draw()`:

1. **Clear canvas**
2. **Header bar** — ป้าย ส. ขอนแก่น (existing `drawSign()` adapted)
3. **Room floors** — 4 filled rects
4. **Room walls** — outer border + interior cross walls + doorway gaps
5. **Furniture** — draw shadow first (offset filled rect, 40% alpha), then furniture surface. Order: back furniture before front.
6. **Room labels** — text overlay
7. **Y-sort agents** — `Object.values(agents).sort((a,b) => a.pos.y - b.pos.y)`
8. **Draw each agent** — sprite + name label + bubbles

---

## 6. Navigation & Collision

`NAV_OBSTACLES` = furniture bounding boxes (same approach as side-view spec).

Pathfinding: same waypoint system — `getWaypoint()` finds nearest clear corner of blocking furniture, stored in `agent._waypoint`, handled in `moveToward()`.

Doorways are open gaps — agents can pass between rooms through doorway centers freely.

---

## 7. Code Cleanup

Remove from office.html:
- Old side-view sprite arrays: `JAMESMIE_UPPER`, `READER_UPPER`, `CODER_UPPER`, `SEARCHER_UPPER`
- Shared leg arrays: `LEGS_STAND`, `LEGS_WALK1`, `LEGS_WALK2`, `LEGS_SIT`
- Phone row arrays: `JAMESMIE_PHONE_ROWS`, etc.
- `SPRITES_JAMESMIE`, `SPRITES_READER`, `SPRITES_CODER`, `SPRITES_SEARCHER`
- Old `drawRoom()`, `drawAllFurniture()`, `drawSign()`, `drawDesk()`, `drawIMac()`, `drawGamingDesk()`, `drawGamingChair()`, `drawMonitor()`, `drawCoffeeMachine()`, `drawSofa()` functions
- `ROOM`, `FURN` constants (replaced by new room geometry)

---

## 8. Out of Scope

- Animated doors
- Per-room ambient sound
- Camera pan / zoom
- Multiplayer
- Shadow sprites for characters
- Diagonal movement
