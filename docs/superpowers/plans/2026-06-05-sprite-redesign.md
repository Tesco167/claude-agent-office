# Sprite Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign agents in office.html to look like Stardew Valley pixel-art characters — per-agent unique sprites, correct chat positioning, furniture collision avoidance, and better size balance.

**Architecture:** All changes in `office.html`. Shared leg arrays (LEGS_STAND/WALK1/WALK2/SIT) combine with per-character UPPER arrays (16 rows each) to build a `SPRITES` object keyed by agent name. State machine gains `idle_chat_walk` and `idle_chat` states; movement gains one-waypoint obstacle avoidance for idle wandering.

**Tech Stack:** Vanilla JS, HTML5 Canvas, Python HTTP server (no build step)

---

## Color Key Reference

All sprite grids use these single-character color codes:
- `.` transparent  `s` skin(`#f5d5a0`)  `h` hair(per-agent)  `b` body-color(per-agent)
- `l` leg(`#1a1a1a`)  `z` shoe(`#4a3520`)  `w` white(`#ffffff`)  `c` crown(`#ffd700`)  `e` dark-detail(`#2d1b00`)

---

## Task 1 — Scale S=2→3 and update drawSprite

**Files:** Modify `office.html`

- [ ] **Step 1: Change S constant**

Find `const S = 2;` and change to:
```js
const S = 3;
```

- [ ] **Step 2: Add shoe color to C constants**

After `jamesGold: '#fbbf24',` add:
```js
  shoe:         '#4a3520',
```

- [ ] **Step 3: Update drawSprite signature and colorMap**

Replace:
```js
function drawSprite(grid, cx, cy, bodyColor, facingLeft = false) {
  const colorMap = {
    's': C.skin, 'h': C.hair, 'b': bodyColor,
    'l': C.leg,  'w': C.white, 'c': C.crown, 'e': '#2d1b00',
  };
```
With:
```js
function drawSprite(grid, cx, cy, bodyColor, facingLeft = false, hairColor = null) {
  const colorMap = {
    's': C.skin, 'h': hairColor || C.hair, 'b': bodyColor,
    'l': C.leg,  'w': C.white, 'c': C.crown, 'e': '#2d1b00',
    'z': C.shoe,
  };
```

- [ ] **Step 4: Run app and verify it still renders (agents will look the same but larger)**

```powershell
.\start.ps1
```
Expected: four agents visible and animated, sprites ~1.5× bigger than before.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: scale sprites S=2→3, add shoe color, update drawSprite"
```

---

## Task 2 — Shared leg arrays

**Files:** Modify `office.html` — add arrays just before the `// Walk cycle` comment

- [ ] **Step 1: Delete the old global sprite arrays**

Remove these five arrays entirely (they will be replaced):
```
SPR_STAND, SPR_WALK1, SPR_WALK2, SPR_SIT, SPR_PHONE
```
Also remove:
```js
const WALK_FRAMES = [SPR_STAND, SPR_WALK1, SPR_STAND, SPR_WALK2];
```

- [ ] **Step 2: Add shared leg arrays in their place**

```js
// ============================================================
// SHARED LEG ARRAYS (rows 16-23 of every sprite)
// ============================================================
const LEGS_STAND = [
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....zz..zz......',
  '...zzz..zzz.....',
];

const LEGS_WALK1 = [
  '...lll...ll.....',
  '..llll...ll.....',
  '..lll....ll.....',
  '..lll.....ll....',
  '..zz......ll....',
  '..zzz......ll...',
  '..zzz......zz...',
  '..zzz......zzz..',
];

const LEGS_WALK2 = [
  '....ll...lll....',
  '....ll...llll...',
  '....ll....lll...',
  '....ll.....ll...',
  '....ll.....zz...',
  '...ll......zzz..',
  '..zz.......zzz..',
  '..zzz......zzz..',
];

const LEGS_SIT = [
  '....llllll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....ll..ll......',
  '....zz..zz......',
  '...zzz..zzz.....',
];
```

- [ ] **Step 3: Commit**
```bash
git add office.html
git commit -m "feat: add shared leg arrays, remove old global sprites"
```

---

## Task 3 — Jamesmie sprites

**Files:** Modify `office.html` — add after the leg arrays

- [ ] **Step 1: Add JAMESMIE_UPPER (rows 0-15)**

```js
// ============================================================
// JAMESMIE — black hair, gold suit, white V-collar
// ============================================================
const JAMESMIE_UPPER = [
  '....hhhhhh......',  // 0 hair
  '....hsssssh.....',  // 1 face
  '....hse.esh.....',  // 2 two eyes
  '....hsssssh.....',  // 3
  '....hss.ssh.....',  // 4 mouth
  '....hhhhhhh.....',  // 5 chin
  '.....wwwww......',  // 6 white collar
  '....bwwwwwb.....',  // 7 suit with collar
  '...bbbbbbbbb....',  // 8 shoulders
  '..bbbbbbbbbb....',  // 9 arms
  '..bbbbbbbbbb....',  // 10
  '...bbbbbbbbb....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '....bbbbbbb.....',  // 14
  '....lllllll.....',  // 15 belt
];
```

- [ ] **Step 2: Add JAMESMIE phone arm rows and SPRITES_JAMESMIE**

```js
const JAMESMIE_PHONE_ROWS = [
  '...bbbbbbbbb....',
  '..bbbbbbbbbbs...',
  '..bbbbbbbbbbs...',
  '..bbbbbbbbbbs...',
];

const SPRITES_JAMESMIE = {
  stand: [...JAMESMIE_UPPER, ...LEGS_STAND],
  walk1: [...JAMESMIE_UPPER, ...LEGS_WALK1],
  walk2: [...JAMESMIE_UPPER, ...LEGS_WALK2],
  sit:   [...JAMESMIE_UPPER, ...LEGS_SIT],
  phone: [
    ...JAMESMIE_UPPER.slice(0, 8),
    ...JAMESMIE_PHONE_ROWS,
    ...JAMESMIE_UPPER.slice(12),
    ...LEGS_STAND,
  ],
};
```

- [ ] **Step 3: Commit**
```bash
git add office.html
git commit -m "feat: add Jamesmie per-agent sprites"
```

---

## Task 4 — Reader sprites

**Files:** Modify `office.html`

- [ ] **Step 1: Add READER_UPPER**

```js
// ============================================================
// READER — auburn hair flowing past shoulders, blue cardigan
// ============================================================
const READER_UPPER = [
  '....hhhhhh......',  // 0 hair top
  '....hsssssh.....',  // 1 face
  '....hse.esh.....',  // 2 two eyes
  '....hsssssh.....',  // 3
  '....hss.ssh.....',  // 4 mouth
  '....hhhhhhh.....',  // 5 chin
  '...hh.wwww.hh...',  // 6 white collar + hair strands
  '..hhbbbbbbbhh...',  // 7 hair along shoulders
  '..hbbbbbbbbhh...',  // 8 hair tapering
  '....bbbbbbbb....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '....bbbbbbb.....',  // 14
  '....lllllll.....',  // 15
];
```

- [ ] **Step 2: Add READER phone rows and SPRITES_READER**

```js
const READER_PHONE_ROWS = [
  '....bbbbbbbbbbs.',
  '....bbbbbbbbbs..',
];

const SPRITES_READER = {
  stand: [...READER_UPPER, ...LEGS_STAND],
  walk1: [...READER_UPPER, ...LEGS_WALK1],
  walk2: [...READER_UPPER, ...LEGS_WALK2],
  sit:   [...READER_UPPER, ...LEGS_SIT],
  phone: [
    ...READER_UPPER.slice(0, 9),
    ...READER_PHONE_ROWS,
    ...READER_UPPER.slice(11),
    ...LEGS_STAND,
  ],
};
```

- [ ] **Step 3: Commit**
```bash
git add office.html
git commit -m "feat: add Reader per-agent sprites"
```

---

## Task 5 — Coder sprites

**Files:** Modify `office.html`

- [ ] **Step 1: Add CODER_UPPER**

```js
// ============================================================
// CODER — dark blue spiky hair, green hoodie
// ============================================================
const CODER_UPPER = [
  '...h..hhh..h....',  // 0 three spiky tips
  '...hhhhhhhh.....',  // 1 hair base
  '....hsssssh.....',  // 2 face
  '....hse.esh.....',  // 3 two eyes
  '....hsssssh.....',  // 4
  '....hss.ssh.....',  // 5 mouth
  '....hhhhhhh.....',  // 6 chin
  '....bbbbbb......',  // 7 hoodie collar (narrow)
  '...bbbbbbbb.....',  // 8 hoodie widens
  '..bbbbbbbbbb....',  // 9 full hoodie shoulder
  '..bbbbbbbbbb....',  // 10
  '...bbbbbbbbb....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '....bbbbbbb.....',  // 14
  '....lllllll.....',  // 15
];
```

- [ ] **Step 2: Add CODER phone rows and SPRITES_CODER**

```js
const CODER_PHONE_ROWS = [
  '..bbbbbbbbbb....',
  '..bbbbbbbbbbbs..',
  '..bbbbbbbbbbbs..',
  '...bbbbbbbbb....',
];

const SPRITES_CODER = {
  stand: [...CODER_UPPER, ...LEGS_STAND],
  walk1: [...CODER_UPPER, ...LEGS_WALK1],
  walk2: [...CODER_UPPER, ...LEGS_WALK2],
  sit:   [...CODER_UPPER, ...LEGS_SIT],
  phone: [
    ...CODER_UPPER.slice(0, 9),
    ...CODER_PHONE_ROWS,
    ...CODER_UPPER.slice(13),
    ...LEGS_STAND,
  ],
};
```

- [ ] **Step 3: Commit**
```bash
git add office.html
git commit -m "feat: add Coder per-agent sprites"
```

---

## Task 6 — Searcher sprites

**Files:** Modify `office.html`

- [ ] **Step 1: Add SEARCHER_UPPER**

```js
// ============================================================
// SEARCHER — burgundy asymmetric hair, orange jacket + lapels
// ============================================================
const SEARCHER_UPPER = [
  '....hhhhhh.h....',  // 0 hair + right spike
  '....hssssshh....',  // 1 face + right hair bump
  '....hsssssh.....',  // 2
  '....hse.esh.....',  // 3 two eyes
  '....hsssssh.....',  // 4
  '....hssessh.....',  // 5 mouth dot
  '....hhhhhhh.....',  // 6 chin
  '.....sssss......',  // 7 neck
  '..wbbbbbbbbw....',  // 8 jacket with white lapels
  '..wbbbbbbbbw....',  // 9
  '...bbbbbbbbb....',  // 10 lapels close
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '....bbbbbbb.....',  // 14
  '....lllllll.....',  // 15
];
```

- [ ] **Step 2: Add SEARCHER phone rows and SPRITES_SEARCHER**

```js
const SEARCHER_PHONE_ROWS = [
  '..wbbbbbbbbw....',
  '..wbbbbbbbbbbs..',
  '..wbbbbbbbbbbs..',
  '...bbbbbbbbb....',
];

const SPRITES_SEARCHER = {
  stand: [...SEARCHER_UPPER, ...LEGS_STAND],
  walk1: [...SEARCHER_UPPER, ...LEGS_WALK1],
  walk2: [...SEARCHER_UPPER, ...LEGS_WALK2],
  sit:   [...SEARCHER_UPPER, ...LEGS_SIT],
  phone: [
    ...SEARCHER_UPPER.slice(0, 8),
    ...SEARCHER_PHONE_ROWS,
    ...SEARCHER_UPPER.slice(12),
    ...LEGS_STAND,
  ],
};
```

- [ ] **Step 3: Commit**
```bash
git add office.html
git commit -m "feat: add Searcher per-agent sprites"
```

---

## Task 7 — Wire per-agent sprites into agents and drawAgent

**Files:** Modify `office.html`

- [ ] **Step 1: Add hairColor and sprites to each agent object**

In the `agents` const, add `hairColor` and `sprites` after the `color` field of each agent:

```js
jamesmie: {
  name: 'Jamesmie', color: C.jamesGold,
  hairColor: '#1a0a00', sprites: SPRITES_JAMESMIE,
  // ... rest unchanged
},
reader: {
  name: 'Reader', color: C.readerBlue,
  hairColor: '#8b4513', sprites: SPRITES_READER,
  // ... rest unchanged
},
coder: {
  name: 'Coder', color: C.coderGreen,
  hairColor: '#1a237e', sprites: SPRITES_CODER,
  // ... rest unchanged
},
searcher: {
  name: 'Searcher', color: C.searchOrange,
  hairColor: '#6b0f1a', sprites: SPRITES_SEARCHER,
  // ... rest unchanged
},
```

- [ ] **Step 2: Update drawAgent to use agent.sprites**

Replace the `let grid; if ...` block and both `drawSprite` calls inside `drawAgent`:

```js
function drawAgent(agent) {
  const sprW = 16 * S;
  const sprH = 24 * S;
  const x = Math.round(agent.pos.x - sprW / 2);
  const y = Math.round(agent.pos.y - sprH);

  let grid;
  if (agent.state === 'idle_chill') {
    grid = agent.sprites.sit;
  } else if (agent.state === 'idle_phone') {
    grid = agent.sprites.phone;
  } else {
    const wf = [agent.sprites.stand, agent.sprites.walk1,
                agent.sprites.stand, agent.sprites.walk2];
    grid = wf[agent.frameIdx];
  }

  if (agent.name === 'Jamesmie') {
    const crownGrid = [CROWN_ROW, CROWN_ROW, ...grid.slice(0, 22)];
    drawSprite(crownGrid, x, y - S * 2, agent.color, agent.facingLeft, agent.hairColor);
  } else {
    drawSprite(grid, x, y, agent.color, agent.facingLeft, agent.hairColor);
  }

  drawText(agent.name, agent.pos.x, agent.pos.y + 8, {
    size: 10, color: '#aaa', align: 'center',
  });

  if (agent.taskLabel)  drawBubble(agent, agent.taskLabel, true);
  if (agent.speechText) drawBubble(agent, agent.speechText, false);
}
```

- [ ] **Step 3: Run app and verify all four agents render with distinct looks**

```powershell
.\start.ps1
```
Expected: Jamesmie has crown + black hair + gold suit; Reader has auburn hair flowing past shoulders + blue outfit; Coder has spiky blue hair + green hoodie; Searcher has asymmetric red hair + orange jacket with white lapels.

- [ ] **Step 4: Fine-tune WORK_POS and IDLE_POS if agents appear misaligned at desks**

Adjust these constants by ±10–20px until agents look correctly positioned at their desks and at coffee/sofa:
```js
const WORK_POS = {
  jamesmie: { x: 100, y: 185 },
  reader:   { x: 270, y: 175 },
  coder:    { x: 430, y: 175 },
  searcher: { x: 60,  y: 480 },
};
const IDLE_POS = {
  coffee: { x: 595, y: 195 },
  sofa:   { x: 460, y: 440 },
};
```

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: wire per-agent sprites, distinct character appearances"
```

---

## Task 8 — Chat positioning (agents stand side-by-side, not overlapping)

**Files:** Modify `office.html`

- [ ] **Step 1: Add `_chatPhrase`, `_chatMidX`, `_waypoint` to each agent object**

In each agent definition, add after `lastCompletedTs: 0,`:
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
      const dist = Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y);
      if (dist < 80 && Math.random() < 0.30) {
        const phrase = CHAT_PHRASES[Math.floor(Math.random() * CHAT_PHRASES.length)];
        const midX = (a.pos.x + b.pos.x) / 2;
        const midY = (a.pos.y + b.pos.y) / 2;

        a.state = 'idle_chat_walk';
        a.targetPos = { x: midX - 24, y: midY };
        a._chatPhrase = phrase;
        a._chatMidX = midX;
        a.speechText = '';

        b.state = 'idle_chat_walk';
        b.targetPos = { x: midX + 24, y: midY };
        b._chatPhrase = '😄';
        b._chatMidX = midX;
        b.speechText = '';
      }
    }
  }
}
```

- [ ] **Step 3: Add `idle_chat_walk` and `idle_chat` handlers in the idle state machine loop**

Inside the `for (const ag of Object.values(agents))` loop that handles idle states, add after the `else if (ag.state === 'idle_chill')` block:

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
    ag.state = 'idle_wander';
    ag.targetPos = null;
    ag._chatPhrase = '';
    ag.idleTimer = 0;
  }
}
```

- [ ] **Step 4: Run app and wait for agents to wander close together**

Expected: when two agents come within ~80px of each other, they walk to positions 24px on each side of their midpoint and face each other before showing speech bubbles. No overlap.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: chat positioning — agents stand side-by-side facing each other"
```

---

## Task 9 — Collision avoidance

**Files:** Modify `office.html`

- [ ] **Step 1: Add NAV_OBSTACLES and helper functions after the `WALK` constant**

```js
const NAV_OBSTACLES = Object.values(FURN);

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
      { x: obs.x - pad,         y: obs.y - pad          },
      { x: obs.x + obs.w + pad, y: obs.y - pad          },
      { x: obs.x - pad,         y: obs.y + obs.h + pad  },
      { x: obs.x + obs.w + pad, y: obs.y + obs.h + pad  },
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

- [ ] **Step 2: Update `moveToward` to respect `agent._waypoint`**

Replace the existing `moveToward` function:

```js
function moveToward(agent, target, dt) {
  const goal = agent._waypoint || target;
  const dx = goal.x - agent.pos.x;
  const dy = goal.y - agent.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    if (agent._waypoint) {
      agent._waypoint = null;
      return false;
    }
    return true;
  }
  const step = agent.speed * dt / 1000;
  agent.pos.x += (dx / d) * Math.min(step, d);
  agent.pos.y += (dy / d) * Math.min(step, d);
  agent.facingLeft = dx < 0;
  return false;
}
```

- [ ] **Step 3: Set waypoints when idle_wander picks a destination**

In the `idle_wander` handler, replace the target-picking block:

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

- [ ] **Step 4: Run app and verify agents walk around desks**

```powershell
.\start.ps1
```
Expected: idle agents no longer walk through desk furniture. May still clip corners on rare occasions — that is acceptable.

- [ ] **Step 5: Commit**
```bash
git add office.html
git commit -m "feat: collision avoidance — agents route around furniture"
```

---

## Task 10 — Final position tuning and push

**Files:** Modify `office.html`

- [ ] **Step 1: Trigger each work state and verify positions**

In browser console, run:
```js
Object.values(agents).forEach(ag => {
  ag.state = 'working';
  ag.targetPos = null;
  ag.pos.x = WORK_POS[ag.name.toLowerCase()]?.x ?? ag.pos.x;
  ag.pos.y = WORK_POS[ag.name.toLowerCase()]?.y ?? ag.pos.y;
});
```
Check that each agent appears correctly positioned at their desk. Adjust `WORK_POS` in the source if needed.

- [ ] **Step 2: Trigger idle_coffee and idle_chill and verify**

Check agents reach coffee machine and sofa correctly. Adjust `IDLE_POS` if needed.

- [ ] **Step 3: Commit and push**
```bash
git add office.html
git commit -m "feat: sprite redesign complete — SV-style characters, chat fix, collision avoidance"
git push
```
