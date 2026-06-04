# Gather-Style Top-Down Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the side-view canvas in office.html with a Gather.town-style top-down pixel art office with 4 rooms, top-down character sprites, and Y-sorted depth rendering.

**Architecture:** Single file (`office.html`) — visual layer rewritten completely while hook system, event polling (`fetchEvents`), and agent state machine logic remain unchanged. Shared leg arrays combine with per-character upper arrays to build `SPRITES_*` objects keyed by `down`/`up` facing direction.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Python HTTP server (`start.ps1`)

---

## Color Key (all sprite grids)
`.` transparent · `s` skin(`#f5d5a0`) · `h` hair(per-agent) · `b` body-color(per-agent) · `l` leg(`#1a1a1a`) · `z` shoe(`#4a3520`) · `w` white · `c` crown(`#ffd700`) · `e` dark-detail(`#2d1b00`)

---

## Task 1 — Remove old visual code + setup new constants

**Files:** Modify `office.html`

- [ ] **Step 1: Remove old constants and drawing functions**

Delete these items from office.html entirely:
- Constants: `ROOM`, `FURN`, `CROWN_ROW`
- Variables: `_signGlowPhase`
- Functions: `drawRoom`, `drawSign`, `drawIMac`, `drawDesk`, `drawGamingDesk`, `drawMonitor`, `drawGamingChair`, `drawCoffeeMachine`, `drawSofa`, `drawAllFurniture`
- All sprite arrays: `JAMESMIE_UPPER`, `READER_UPPER`, `CODER_UPPER`, `SEARCHER_UPPER`, `JAMESMIE_UPPER_UP`, `LEGS_STAND`, `LEGS_WALK1`, `LEGS_WALK2`, `LEGS_SIT`, all `*_PHONE_ROWS`, `SPRITES_JAMESMIE` through `SPRITES_SEARCHER`

- [ ] **Step 2: Update `C` constants — replace old values with new palette**

Keep existing agent colors (`jamesGold`, `readerBlue`, `coderGreen`, `searchOrange`, `skin`, `hair`, `leg`, `white`, `crown`, `rgbR/G/B`). Replace the rest with:

```js
const C = {
  // Rooms
  headerBg:     '#0d0d1a',
  wallOuter:    '#1a1a2e',
  wallHighlight:'#3d3d5c',
  bossFloor:    '#2a1f3d',
  devFloor:     '#1e2a2e',
  opsFloor:     '#1a2218',
  loungeFloor:  '#2e2415',
  // Furniture
  deskWalnut:   '#3d2b1a',
  deskGaming:   '#2d2d4e',
  bookshelf:    '#2d1f0e',
  sofaBlue:     '#2d3561',
  sofaDark:     '#1e2449',
  coffeeM:      '#2d2d2d',
  rugWarm:      '#3d2a1a',
  plantDark:    '#1a3a1a',
  plantLight:   '#2d6b2d',
  serverRack:   '#1a1a2a',
  // Brand
  brand:        '#C41230',
  gold:         '#ffd700',
  amber:        '#d97706',
  purple:       '#7c3aed',
  // Agents
  skin:         '#f5d5a0',
  hair:         '#2d1b00',
  leg:          '#1a1a1a',
  shoe:         '#4a3520',
  white:        '#ffffff',
  crown:        '#ffd700',
  jamesGold:    '#fbbf24',
  readerBlue:   '#3b82f6',
  coderGreen:   '#22c55e',
  searchOrange: '#f97316',
};
```

- [ ] **Step 3: Add room geometry constants**

Replace `ROOM`, `FURN`, `WALK`, `WORK_POS`, `IDLE_POS`, `CENTER_POS` with:

```js
const S = 3;
const HEADER_H = 40;
const ROOM_W = 450;
const ROOM_H = 260; // (560 - 40) / 2

const ROOMS = {
  boss:   { x: 0,      y: HEADER_H,           w: ROOM_W, h: ROOM_H, floor: C.bossFloor,   label: 'BOSS ROOM' },
  dev:    { x: ROOM_W, y: HEADER_H,           w: ROOM_W, h: ROOM_H, floor: C.devFloor,    label: 'DEV ROOM' },
  ops:    { x: 0,      y: HEADER_H + ROOM_H,  w: ROOM_W, h: ROOM_H, floor: C.opsFloor,    label: 'OPS ROOM' },
  lounge: { x: ROOM_W, y: HEADER_H + ROOM_H,  w: ROOM_W, h: ROOM_H, floor: C.loungeFloor, label: 'LOUNGE' },
};
const WALL = 8;
const DOOR_W = 28;

const WORK_POS = {
  jamesmie: { x: 120, y: 110 },
  reader:   { x: 555, y: 140 },
  coder:    { x: 720, y: 140 },
  searcher: { x: 110, y: 390 },
};
const IDLE_POS = {
  coffee: { x: 840, y: 340 },
  sofa:   { x: 585, y: 415 },
};
const CENTER_POS = { x: 450, y: 300 };
const WALK = { x: 15, y: 55, maxX: 885, maxY: 545 };
```

- [ ] **Step 4: Run app — verify no crash**

```powershell
.\start.ps1
```
Expected: page loads, canvas is black/blank. No JS errors in browser console.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "refactor: remove side-view visual code, add top-down constants"
```

---

## Task 2 — Header bar + 4 rooms + walls + doorways

**Files:** Modify `office.html`

- [ ] **Step 1: Add `drawHeader()` function**

```js
function drawHeader() {
  rect(0, 0, W, HEADER_H, C.headerBg);
  ctx.strokeStyle = C.gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, HEADER_H - 2);
  // House icon
  const hx = W / 2 - 130, hy = HEADER_H / 2;
  ctx.fillStyle = C.gold;
  ctx.beginPath();
  ctx.moveTo(hx, hy - 10); ctx.lineTo(hx - 9, hy); ctx.lineTo(hx + 9, hy);
  ctx.closePath(); ctx.fill();
  rect(hx - 6, hy, 12, 8, C.gold);
  rect(hx - 2, hy + 3, 4, 5, C.brand);
  drawText('ส. ขอนแก่น AI Office', W / 2, HEADER_H / 2, {
    size: 18, weight: 'bold', color: C.white, shadow: C.gold, shadowBlur: 10,
  });
}
```

- [ ] **Step 2: Add `drawAllRooms()` function**

```js
function drawAllRooms() {
  // Draw floors
  for (const r of Object.values(ROOMS)) {
    rect(r.x, r.y, r.w, r.h, r.floor);
  }

  // Outer walls (full border)
  ctx.strokeStyle = C.wallOuter;
  ctx.lineWidth = WALL;
  ctx.strokeRect(WALL / 2, HEADER_H + WALL / 2, W - WALL, 520 - WALL);

  // Interior vertical divider at x=ROOM_W (with doorways)
  const vx = ROOM_W;
  // Top half doorway: y=170±14
  const vDoor1Y = HEADER_H + ROOM_H / 2;
  // Bottom half doorway: y=430±14
  const vDoor2Y = HEADER_H + ROOM_H + ROOM_H / 2;
  ctx.fillStyle = C.wallOuter;
  rect(vx - WALL / 2, HEADER_H, WALL, vDoor1Y - DOOR_W / 2 - HEADER_H);
  rect(vx - WALL / 2, vDoor1Y + DOOR_W / 2, WALL, vDoor2Y - DOOR_W / 2 - vDoor1Y - DOOR_W / 2);
  rect(vx - WALL / 2, vDoor2Y + DOOR_W / 2, WALL, HEADER_H + 520 - vDoor2Y - DOOR_W / 2);

  // Interior horizontal divider at y=HEADER_H+ROOM_H (with doorways)
  const hy2 = HEADER_H + ROOM_H;
  // Left half doorway: x=225±14
  const hDoor1X = ROOM_W / 2;
  // Right half doorway: x=675±14
  const hDoor2X = ROOM_W + ROOM_W / 2;
  ctx.fillStyle = C.wallOuter;
  rect(0, hy2 - WALL / 2, hDoor1X - DOOR_W / 2, WALL);
  rect(hDoor1X + DOOR_W / 2, hy2 - WALL / 2, hDoor2X - DOOR_W / 2 - hDoor1X - DOOR_W / 2, WALL);
  rect(hDoor2X + DOOR_W / 2, hy2 - WALL / 2, W - hDoor2X - DOOR_W / 2, WALL);

  // Wall highlight lines (inner edge)
  ctx.strokeStyle = C.wallHighlight;
  ctx.lineWidth = 1;
  ctx.strokeRect(WALL, HEADER_H + WALL, W - WALL * 2, 520 - WALL * 2);

  // Room labels
  for (const r of Object.values(ROOMS)) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawText(r.label, r.x + r.w / 2, r.y + 18, {
      size: 10, color: C.white, align: 'center',
    });
    ctx.restore();
  }
}
```

- [ ] **Step 3: Update `draw()` to call new functions**

Replace the old `draw()` body with:

```js
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawAllRooms();
  drawAllFurniture();
  const sorted = Object.values(agents).sort((a, b) => a.pos.y - b.pos.y);
  for (const ag of sorted) drawAgent(ag);
  drawHeader();
}
```

Add a stub for `drawAllFurniture` so app doesn't crash:
```js
function drawAllFurniture() { /* filled in Tasks 3-6 */ }
```

- [ ] **Step 4: Run app — verify 4 colored rooms with walls**

```powershell
.\start.ps1
```
Expected: dark header with ส. ขอนแก่น title, 4 rooms in 2×2 grid with distinct floor colors, walls with doorway gaps. Agents may be invisible/crashed — fix any console errors.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: top-down 4-room layout with walls and doorways"
```

---

## Task 3 — Boss Room furniture

**Files:** Modify `office.html`

- [ ] **Step 1: Add top-down drawing helpers**

Add these after `drawText`:

```js
function shadow(x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.4;
  rect(x + 3, y + 3, w, h, '#000');
  ctx.restore();
}

function drawDeskTopDown(x, y, w, h, color) {
  shadow(x, y, w, h);
  rect(x, y, w, h, color);
  rect(x, y, w, 4, '#000000' + '44'); // top edge shadow
  rect(x, y, 4, h, '#ffffff' + '18'); // left highlight
}

function drawChairTopDown(x, y, color) {
  shadow(x, y, 22, 22);
  rect(x, y, 22, 22, color);
  rect(x + 3, y + 3, 16, 16, '#00000033');
  rect(x + 7, y + 7, 8, 8, '#00000055');
}

function drawPlantTopDown(x, y) {
  shadow(x, y, 20, 20);
  rect(x, y, 20, 20, C.plantDark);
  rect(x + 3, y + 3, 6, 6, C.plantLight);
  rect(x + 11, y + 3, 6, 6, C.plantLight);
  rect(x + 7, y + 10, 6, 6, C.plantLight);
}

function drawBookshelfTopDown(x, y, w, h) {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.bookshelf);
  for (let i = 0; i < 4; i++) {
    const bx = x + 4 + i * ((w - 8) / 4);
    const bw = (w - 12) / 4;
    const colors = ['#8b1a1a', '#1a4a8b', '#1a7a1a', '#8b6a1a'];
    rect(bx, y + 3, bw, h - 6, colors[i]);
  }
}
```

- [ ] **Step 2: Add boss room furniture to `drawAllFurniture()`**

Replace the stub:

```js
function drawAllFurniture() {
  // ── BOSS ROOM ──
  const br = ROOMS.boss;
  // Bookshelf (back wall)
  drawBookshelfTopDown(br.x + 260, br.y + WALL + 4, 120, 20);
  // Large desk
  drawDeskTopDown(br.x + 25, br.y + 60, 150, 55, C.deskWalnut);
  // iMac on desk
  rect(br.x + 55, br.y + 67, 38, 26, '#1a2a3a');
  rect(br.x + 57, br.y + 69, 34, 22, '#0f2035');
  rect(br.x + 72, br.y + 93, 8, 5, '#555');
  // Visitor chairs
  drawChairTopDown(br.x + 55, br.y + 130, '#4a3a2a');
  drawChairTopDown(br.x + 100, br.y + 130, '#4a3a2a');
  // Plant (corner)
  drawPlantTopDown(br.x + ROOM_W - 40, br.y + WALL + 6);
}
```

- [ ] **Step 3: Run app — verify boss room furniture**

Expected: Boss Room shows bookshelf on back wall, large dark walnut desk with iMac, two visitor chairs below desk, plant in top-right corner.

- [ ] **Step 4: Commit**
```bash
git add office.html
git commit -m "feat: Boss Room top-down furniture"
```

---

## Task 4 — Dev Room furniture

**Files:** Modify `office.html`

- [ ] **Step 1: Add gaming desk and server rack helpers**

```js
function drawGamingDeskTopDown(x, y, w, h) {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.deskGaming);
  rect(x, y, w, 3, '#4d4d8a');
  rect(x, y, 3, h, '#4d4d8a');
  rect(x + 2, y + h - 3, w - 4, 3, C.purple);
}

function drawGamingChairTopDown(x, y) {
  shadow(x, y, 26, 28);
  rect(x, y, 26, 28, '#8b0000');
  rect(x + 3, y + 3, 20, 20, '#1a1a1a');
  rect(x + 7, y + 7, 12, 10, '#8b0000');
}

function drawServerRackTopDown(x, y) {
  shadow(x, y, 28, 55);
  rect(x, y, 28, 55, C.serverRack);
  for (let i = 0; i < 5; i++) {
    rect(x + 3, y + 4 + i * 10, 22, 7, '#1a3a6b');
    rect(x + 20, y + 6 + i * 10, 4, 3, '#22c55e');
  }
}
```

- [ ] **Step 2: Add Dev Room furniture inside `drawAllFurniture()`**

Inside the function, after Boss Room block:

```js
  // ── DEV ROOM ──
  const dr = ROOMS.dev;
  // Reader's desk (left)
  drawGamingDeskTopDown(dr.x + 30, dr.y + 60, 95, 50);
  rect(dr.x + 40, dr.y + 67, 40, 28, '#1a2a3a');
  rect(dr.x + 42, dr.y + 69, 36, 24, '#0f2035');
  drawGamingChairTopDown(dr.x + 45, dr.y + 125);
  // Coder's desk (right)
  drawGamingDeskTopDown(dr.x + 200, dr.y + 60, 95, 50);
  rect(dr.x + 210, dr.y + 67, 40, 28, '#1a2a3a');
  rect(dr.x + 212, dr.y + 69, 36, 24, '#0f2035');
  drawGamingChairTopDown(dr.x + 215, dr.y + 125);
  // Server rack (right wall)
  drawServerRackTopDown(dr.x + ROOM_W - 45, dr.y + WALL + 10);
```

- [ ] **Step 3: Run app — verify Dev Room**

Expected: two gaming desks side by side with iMacs, two gaming chairs below, server rack on right wall.

- [ ] **Step 4: Commit**
```bash
git add office.html
git commit -m "feat: Dev Room top-down furniture"
```

---

## Task 5 — Ops Room + Lounge furniture

**Files:** Modify `office.html`

- [ ] **Step 1: Add lounge furniture helpers**

```js
function drawSofaTopDown(x, y, w, h) {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.sofaBlue);
  rect(x + 4, y + 4, w - 8, h - 8, C.sofaDark);
  rect(x, y, w, 6, C.sofaBlue);           // back cushion
  rect(x, y, 6, h, C.sofaDark);           // left arm
  rect(x + w - 6, y, 6, h, C.sofaDark);   // right arm
}

function drawCoffeeMachineTopDown(x, y) {
  shadow(x, y, 28, 28);
  rect(x, y, 28, 28, C.coffeeM);
  rect(x + 4, y + 4, 20, 12, '#1a1a1a');
  rect(x + 10, y + 18, 8, 6, '#f5f0e0');
  rect(x + 13, y + 20, 4, 4, '#6b3a2a');  // coffee cup
  rect(x + 22, y + 10, 4, 4, C.amber);    // indicator light
}

function drawCoffeeTableTopDown(x, y, w, h) {
  shadow(x, y, w, h);
  rect(x, y, w, h, '#3a2a1a');
  rect(x + 4, y + 4, w - 8, h - 8, '#4a3a2a');
}

function drawRugTopDown(x, y, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  rect(x, y, w, h, C.rugWarm);
  ctx.strokeStyle = '#5a3f28';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.restore();
}
```

- [ ] **Step 2: Add Ops Room + Lounge furniture inside `drawAllFurniture()`**

```js
  // ── OPS ROOM ──
  const or = ROOMS.ops;
  drawGamingDeskTopDown(or.x + 25, or.y + 55, 95, 50);
  rect(or.x + 35, or.y + 62, 40, 28, '#1a2a3a');
  rect(or.x + 37, or.y + 64, 36, 24, '#001a00');  // green terminal tint
  drawGamingChairTopDown(or.x + 40, or.y + 120);
  // Wall monitors (decorative)
  rect(or.x + 170, or.y + WALL + 6, 60, 20, '#111');
  rect(or.x + 172, or.y + WALL + 8, 56, 16, '#001a00');
  rect(or.x + 260, or.y + WALL + 6, 60, 20, '#111');
  rect(or.x + 262, or.y + WALL + 8, 56, 16, '#001a00');

  // ── LOUNGE ──
  const lg = ROOMS.lounge;
  // Rug
  drawRugTopDown(lg.x + 60, lg.y + 80, 130, 90);
  // Sofa
  drawSofaTopDown(lg.x + 65, lg.y + 85, 120, 38);
  // Coffee table
  drawCoffeeTableTopDown(lg.x + 95, lg.y + 135, 55, 30);
  // Coffee machine (corner)
  drawCoffeeMachineTopDown(lg.x + ROOM_W - 45, lg.y + WALL + 10);
  // Plants
  drawPlantTopDown(lg.x + WALL + 8, lg.y + WALL + 8);
  drawPlantTopDown(lg.x + ROOM_W - 38, lg.y + ROOM_H - 38);
```

- [ ] **Step 3: Run app — verify Ops + Lounge**

Expected: Ops Room has a single gaming desk with green terminal iMac and two wall monitors. Lounge has warm rug, sofa, coffee table, coffee machine in corner, two plants.

- [ ] **Step 4: Commit**
```bash
git add office.html
git commit -m "feat: Ops Room and Lounge top-down furniture"
```

---

## Task 6 — Top-down sprite definitions

**Files:** Modify `office.html`

- [ ] **Step 1: Add shared leg arrays (rows 15-19) and body upper (rows 5-14)**

```js
// ============================================================
// SHARED SPRITE PARTS
// ============================================================
const LEGS_TD_STAND = [
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....zz..zz......',
  '...zzz..zzz.....',
];
const LEGS_TD_WALK1 = [
  '...lll...ll.....',
  '..llll...ll.....',
  '..lll....ll.....',
  '..zz.....ll.....',
  '..zzz....zzz....',
];
const LEGS_TD_WALK2 = [
  '....ll...lll....',
  '....ll...llll...',
  '....ll....lll...',
  '....ll....zz....',
  '...zzz....zzz...',
];
```

- [ ] **Step 2: Add per-character UPPER_DOWN arrays (rows 0-14)**

```js
// 15 rows each (0-14). Combined with LEGS_TD_* = 20 rows total.

const JAMESMIE_UPPER_DOWN = [
  '....ccccccc.....',  // 0 crown
  '....hhhhhh......',  // 1
  '....hsssssh.....',  // 2
  '....hse.esh.....',  // 3 eyes
  '....hsssssh.....',  // 4
  '.....wwwww......',  // 5 white collar
  '...bwwwwwbb.....',  // 6 suit+collar
  '..bbbbbbbbb.....',  // 7 shoulders
  '..sbbbbbbbbs....',  // 8 hands
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14 belt
];

const READER_UPPER_DOWN = [
  '....hhhhhh......',  // 0
  '...hhsssshhh....',  // 1
  '...hhse.eshhh...',  // 2 eyes
  '...hhsssshhh....',  // 3
  '...hhhhhhhh.....',  // 4
  '...hh.wwww.hh...',  // 5 collar+hair
  '..hhbbbbbbbhh...',  // 6 hair over shoulders
  '..hbbbbbbbbhh...',  // 7 hair tapering
  '....bbbbbbbb....',  // 8
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14
];

const CODER_UPPER_DOWN = [
  '...h..hhh..h....',  // 0 spiky tips
  '...hhhhhhhh.....',  // 1 hair base
  '....hsssssh.....',  // 2
  '....hse.esh.....',  // 3 eyes
  '....hsssssh.....',  // 4
  '....bbbbbb......',  // 5 hoodie collar
  '...bbbbbbbb.....',  // 6 hoodie
  '..bbbbbbbbbb....',  // 7 shoulders
  '..sbbbbbbbbs....',  // 8 hands
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14
];

const SEARCHER_UPPER_DOWN = [
  '....hhhhhh.h....',  // 0 asymmetric spike
  '....hssssshh....',  // 1
  '....hse.esh.....',  // 2 eyes
  '....hsssssh.....',  // 3
  '....hssessh.....',  // 4 mouth
  '.....sssss......',  // 5 neck
  '..wbbbbbbbbw....',  // 6 jacket lapels
  '..wbbbbbbbbw....',  // 7
  '..wsbbbbbbbw....',  // 8 hands+lapel
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14
];
```

- [ ] **Step 3: Add per-character UPPER_UP arrays (rows 0-14, back-of-head)**

```js
const JAMESMIE_UPPER_UP = [
  '....ccccccc.....',  // 0 crown visible from behind
  '....hhhhhh......',  // 1
  '....hhhhhh......',  // 2 back of head
  '....hhhhhh......',  // 3
  '....hhhhhhh.....',  // 4
  '....hhhhhh......',  // 5
  '...bbbbbbbbb....',  // 6 shoulders (no collar from back)
  '..bbbbbbbbb.....',  // 7
  '..sbbbbbbbbs....',  // 8
  '....bbbbbbb.....',  // 9-13
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '.....lllll......',  // 14
];

const READER_UPPER_UP = [
  '...hhhhhhhh.....',  // 0 wide hair from behind
  '...hhhhhhhh.....',  // 1
  '...hhhhhhhhh....',  // 2
  '...hhhhhhhh.....',  // 3
  '...hhhhhhhhh....',  // 4
  '...hh....hh.....',  // 5 hair strands
  '..hhbbbbbbbhh...',  // 6
  '..hbbbbbbbbhh...',  // 7
  '....bbbbbbbb....',  // 8
  '....bbbbbbb.....',  // 9-13
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '.....lllll......',  // 14
];

const CODER_UPPER_UP = [
  '...h..hhh..h....',  // 0 spiky tips visible from behind
  '...hhhhhhhh.....',  // 1
  '...hhhhhhhh.....',  // 2 back of head
  '...hhhhhhhh.....',  // 3
  '....hhhhhhh.....',  // 4
  '....bbbbbb......',  // 5
  '...bbbbbbbb.....',  // 6
  '..bbbbbbbbbb....',  // 7
  '..sbbbbbbbbs....',  // 8
  '....bbbbbbb.....',  // 9-13
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '.....lllll......',  // 14
];

const SEARCHER_UPPER_UP = [
  '....hhhhhh.h....',  // 0 asymmetric spike visible from behind
  '....hhhhhhhh....',  // 1
  '....hhhhhh......',  // 2 back of head
  '....hhhhhh......',  // 3
  '....hhhhhhh.....',  // 4
  '.....sssss......',  // 5 neck
  '..wbbbbbbbbw....',  // 6
  '..wbbbbbbbbw....',  // 7
  '..wsbbbbbbbw....',  // 8
  '....bbbbbbb.....',  // 9-13
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '....bbbbbbb.....',
  '.....lllll......',  // 14
];
```

- [ ] **Step 4: Build SPRITES objects**

```js
const SPRITES_JAMESMIE = {
  down: {
    stand: [...JAMESMIE_UPPER_DOWN, ...LEGS_TD_STAND],
    walk1: [...JAMESMIE_UPPER_DOWN, ...LEGS_TD_WALK1],
    walk2: [...JAMESMIE_UPPER_DOWN, ...LEGS_TD_WALK2],
  },
  up: {
    stand: [...JAMESMIE_UPPER_UP, ...LEGS_TD_STAND],
    walk1: [...JAMESMIE_UPPER_UP, ...LEGS_TD_WALK1],
    walk2: [...JAMESMIE_UPPER_UP, ...LEGS_TD_WALK2],
  },
};
const SPRITES_READER = {
  down: { stand: [...READER_UPPER_DOWN, ...LEGS_TD_STAND], walk1: [...READER_UPPER_DOWN, ...LEGS_TD_WALK1], walk2: [...READER_UPPER_DOWN, ...LEGS_TD_WALK2] },
  up:   { stand: [...READER_UPPER_UP,   ...LEGS_TD_STAND], walk1: [...READER_UPPER_UP,   ...LEGS_TD_WALK1], walk2: [...READER_UPPER_UP,   ...LEGS_TD_WALK2] },
};
const SPRITES_CODER = {
  down: { stand: [...CODER_UPPER_DOWN, ...LEGS_TD_STAND], walk1: [...CODER_UPPER_DOWN, ...LEGS_TD_WALK1], walk2: [...CODER_UPPER_DOWN, ...LEGS_TD_WALK2] },
  up:   { stand: [...CODER_UPPER_UP,   ...LEGS_TD_STAND], walk1: [...CODER_UPPER_UP,   ...LEGS_TD_WALK1], walk2: [...CODER_UPPER_UP,   ...LEGS_TD_WALK2] },
};
const SPRITES_SEARCHER = {
  down: { stand: [...SEARCHER_UPPER_DOWN, ...LEGS_TD_STAND], walk1: [...SEARCHER_UPPER_DOWN, ...LEGS_TD_WALK1], walk2: [...SEARCHER_UPPER_DOWN, ...LEGS_TD_WALK2] },
  up:   { stand: [...SEARCHER_UPPER_UP,   ...LEGS_TD_STAND], walk1: [...SEARCHER_UPPER_UP,   ...LEGS_TD_WALK1], walk2: [...SEARCHER_UPPER_UP,   ...LEGS_TD_WALK2] },
};
```

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: top-down sprite definitions for all 4 agents"
```

---

## Task 7 — Wire sprites into agents + update drawAgent

**Files:** Modify `office.html`

- [ ] **Step 1: Add `hairColor`, `sprites`, `_lastDY` to each agent**

In the `agents` const, add these fields after `color`:

```js
jamesmie: { name: 'Jamesmie', color: C.jamesGold,
  hairColor: '#1a0a00', sprites: SPRITES_JAMESMIE, _lastDY: 1,
  // ... rest unchanged
},
reader: { name: 'Reader', color: C.readerBlue,
  hairColor: '#8b4513', sprites: SPRITES_READER, _lastDY: 1,
  // ... rest unchanged
},
coder: { name: 'Coder', color: C.coderGreen,
  hairColor: '#1a237e', sprites: SPRITES_CODER, _lastDY: 1,
  // ... rest unchanged
},
searcher: { name: 'Searcher', color: C.searchOrange,
  hairColor: '#6b0f1a', sprites: SPRITES_SEARCHER, _lastDY: 1,
  // ... rest unchanged
},
```

- [ ] **Step 2: Update `moveToward` to track `_lastDY`**

In `moveToward`, before computing step, add:
```js
agent._lastDY = dy;
```

- [ ] **Step 3: Replace `drawAgent` function entirely**

```js
function drawAgent(agent) {
  const sprW = 16 * S;
  const sprH = 20 * S;
  const x = Math.round(agent.pos.x - sprW / 2);
  const y = Math.round(agent.pos.y - sprH);

  const facing = (agent._lastDY < 0) ? 'up' : 'down';
  const spr = agent.sprites[facing];

  let grid;
  if (agent.state === 'idle_chill' || agent.state === 'idle_phone') {
    grid = spr.stand;
  } else {
    const wf = [spr.stand, spr.walk1, spr.stand, spr.walk2];
    grid = wf[agent.frameIdx];
  }

  drawSprite(grid, x, y, agent.color, agent.facingLeft, agent.hairColor);

  // Name label
  drawText(agent.name, agent.pos.x, y - 8, {
    size: 11, color: C.white, align: 'center', shadow: '#000', shadowBlur: 4,
  });
  ctx.save();
  ctx.fillStyle = agent.color;
  ctx.beginPath();
  ctx.arc(agent.pos.x - ctx.measureText(agent.name).width / 2 - 8, y - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (agent.taskLabel)  drawBubble(agent, agent.taskLabel, true);
  if (agent.speechText) drawBubble(agent, agent.speechText, false);
}
```

- [ ] **Step 4: Update `drawBubble` for 20-row sprite height**

In `drawBubble`, change:
```js
const by = agent.pos.y - 24 * S - 14;
```
to:
```js
const by = agent.pos.y - 20 * S - 14;
```

- [ ] **Step 5: Fix name label dot — measure text before drawText resets context**

Replace the name label block in `drawAgent` with:
```js
  const labelFont = '11px "Leelawadee UI","Tahoma",sans-serif';
  ctx.font = labelFont;
  const nameW = ctx.measureText(agent.name).width;
  drawText(agent.name, agent.pos.x, y - 8, {
    size: 11, color: C.white, align: 'center', shadow: '#000', shadowBlur: 4,
  });
  ctx.save();
  ctx.fillStyle = agent.color;
  ctx.beginPath();
  ctx.arc(agent.pos.x - nameW / 2 - 8, y - 8, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
```

- [ ] **Step 6: Run app — verify all 4 agents visible with correct looks**

```powershell
.\start.ps1
```
Expected: all 4 agents appear in their rooms with distinct hair colors and outfits, name labels with colored dots above their heads, correct top-down appearance.

- [ ] **Step 7: Commit**
```bash
git add office.html
git commit -m "feat: wire top-down sprites, update drawAgent with Y-sort and facing"
```

---

## Task 8 — Chat positioning

**Files:** Modify `office.html`

- [ ] **Step 1: Add `_chatPhrase`, `_chatMidX`, `_waypoint` to each agent**

After `_lastDY: 1,` in each agent definition, add:
```js
_chatPhrase: '', _chatMidX: 0, _waypoint: null,
```

- [ ] **Step 2: Replace `_checkChat` function**

```js
function _checkChat() {
  const idleList = Object.values(agents).filter(ag =>
    ag !== agents.jamesmie &&
    ag.state.startsWith('idle') &&
    ag.state !== 'idle_chat' &&
    ag.state !== 'idle_chat_walk'
  );
  for (let i = 0; i < idleList.length; i++) {
    for (let j = i + 1; j < idleList.length; j++) {
      const a = idleList[i], b = idleList[j];
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < 80 && Math.random() < 0.30) {
        const phrase = CHAT_PHRASES[Math.floor(Math.random() * CHAT_PHRASES.length)];
        const midX = (a.pos.x + b.pos.x) / 2;
        const midY = (a.pos.y + b.pos.y) / 2;
        a.state = 'idle_chat_walk'; a.targetPos = { x: midX - 24, y: midY };
        a._chatPhrase = phrase; a._chatMidX = midX; a.speechText = '';
        b.state = 'idle_chat_walk'; b.targetPos = { x: midX + 24, y: midY };
        b._chatPhrase = '😄'; b._chatMidX = midX; b.speechText = '';
      }
    }
  }
}
```

- [ ] **Step 3: Add `idle_chat_walk` and `idle_chat` handlers in idle state loop**

After the `else if (ag.state === 'idle_chill')` block, add:

```js
else if (ag.state === 'idle_chat_walk') {
  const arrived = moveToward(ag, ag.targetPos, dt);
  if (arrived) {
    ag.state = 'idle_chat';
    ag.speechText = ag._chatPhrase;
    ag.speechTimer = 3500;
    ag.facingLeft = ag.pos.x > ag._chatMidX;
    ag.idleTimer = 0;
  }
}
else if (ag.state === 'idle_chat') {
  if (ag.speechTimer <= 0) {
    ag.state = 'idle_wander'; ag.targetPos = null;
    ag._chatPhrase = ''; ag.idleTimer = 0;
  }
}
```

- [ ] **Step 4: Commit**
```bash
git add office.html
git commit -m "feat: chat positioning — agents walk to side-by-side positions"
```

---

## Task 9 — Collision avoidance

**Files:** Modify `office.html`

- [ ] **Step 1: Add `NAV_OBSTACLES` and helper functions after `WALK` constant**

```js
const NAV_OBSTACLES = [
  // Boss Room
  { x: 25,  y: 60,  w: 150, h: 55 },  // large desk
  { x: 55,  y: 130, w: 22,  h: 22 },  // chair 1
  { x: 100, y: 130, w: 22,  h: 22 },  // chair 2
  { x: 260, y: 44,  w: 120, h: 20 },  // bookshelf
  // Dev Room
  { x: 480, y: 60,  w: 95,  h: 50 },  // desk 1
  { x: 650, y: 60,  w: 95,  h: 50 },  // desk 2
  { x: 845, y: 50,  w: 28,  h: 55 },  // server rack
  // Ops Room
  { x: 25,  y: 355, w: 95,  h: 50 },  // desk
  // Lounge
  { x: 515, y: 385, w: 120, h: 38 },  // sofa
  { x: 545, y: 435, w: 55,  h: 30 },  // coffee table
  { x: 835, y: 310, w: 28,  h: 28 },  // coffee machine
];

function isInsideObstacle(x, y, pad = 10) {
  return NAV_OBSTACLES.some(o =>
    x >= o.x - pad && x <= o.x + o.w + pad &&
    y >= o.y - pad && y <= o.y + o.h + pad
  );
}

function pathBlocked(x1, y1, x2, y2, steps = 8) {
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isInsideObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 8)) return true;
  }
  return false;
}

function getWaypoint(from, to) {
  for (const obs of NAV_OBSTACLES) {
    if (!pathBlocked(from.x, from.y, to.x, to.y)) continue;
    const pad = 18;
    const corners = [
      { x: obs.x - pad, y: obs.y - pad },
      { x: obs.x + obs.w + pad, y: obs.y - pad },
      { x: obs.x - pad, y: obs.y + obs.h + pad },
      { x: obs.x + obs.w + pad, y: obs.y + obs.h + pad },
    ];
    corners.sort((a, b) =>
      Math.hypot(a.x - from.x, a.y - from.y) -
      Math.hypot(b.x - from.x, b.y - from.y)
    );
    return corners[0];
  }
  return null;
}
```

- [ ] **Step 2: Replace `moveToward` to use waypoints**

```js
function moveToward(agent, target, dt) {
  agent._lastDY = target.y - agent.pos.y;
  const goal = agent._waypoint || target;
  const dx = goal.x - agent.pos.x;
  const dy = goal.y - agent.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    if (agent._waypoint) { agent._waypoint = null; return false; }
    return true;
  }
  const step = agent.speed * dt / 1000;
  agent.pos.x += (dx / d) * Math.min(step, d);
  agent.pos.y += (dy / d) * Math.min(step, d);
  agent.facingLeft = dx < 0;
  return false;
}
```

- [ ] **Step 3: Add obstacle-avoiding destination picking for `idle_wander`**

In the `idle_wander` handler, replace destination picking:

```js
if (!ag.targetPos) {
  let px, py, attempts = 0;
  do {
    px = WALK.x + Math.random() * (WALK.maxX - WALK.x);
    py = WALK.y + Math.random() * (WALK.maxY - WALK.y);
    attempts++;
  } while (isInsideObstacle(px, py) && attempts < 20);
  ag.targetPos = { x: px, y: py };
  ag._waypoint = getWaypoint(ag.pos, ag.targetPos);
  ag.idleDuration = 3000 + Math.random() * 8000;
}
```

- [ ] **Step 4: Run app — verify agents avoid furniture**

```powershell
.\start.ps1
```
Expected: agents no longer walk through desks and furniture during idle wander.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: collision avoidance — agents route around furniture"
```

---

## Task 10 — Position fine-tuning + push

**Files:** Modify `office.html`

- [ ] **Step 1: Verify each agent reaches their work position correctly**

In browser console:
```js
agents.jamesmie.state = 'walking_to_desk';
agents.jamesmie.targetPos = WORK_POS.jamesmie;
```
Repeat for `reader`, `coder`, `searcher`. Visually confirm each agent stands in front of their desk. Adjust `WORK_POS` values in source if misaligned (±10-20px).

- [ ] **Step 2: Verify idle positions**

```js
agents.reader.state = 'idle_coffee';
agents.reader._idleInit = false;
```
Confirm agent walks to coffee machine area. Check sofa position similarly. Adjust `IDLE_POS` if needed.

- [ ] **Step 3: Final push**
```bash
git add office.html
git commit -m "feat: Gather-style top-down office complete"
git push
```
