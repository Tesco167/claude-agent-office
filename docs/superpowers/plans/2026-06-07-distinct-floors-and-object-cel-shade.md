# Distinct per-room floors + bold object cel-shade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the 4 rooms a distinct floor *material* (tile / metal grate / wood
planks) via an offscreen cache, and bring bold "toon" cel-shading + grounded contact shadows
to every scene object.

**Architecture:** Reuse the two depth helpers that already exist —
`shadow(x,y,w,h)` ([js/app.js:365](../../../js/app.js)) is the contact shadow and
`bevel(x,y,w,h,light,dark)` ([js/app.js:373](../../../js/app.js)) is the cel-edge — by
**strengthening them to bold-toon levels and auditing every furniture/decor function to call
both** (DRY; no new duplicate helpers → avoids a `const` collision that would blank the page,
CLAUDE.md §5). Floors get three new procedural renderers drawn **once into an offscreen
`<canvas>` and blitted each frame** (perf — the rAF loop must not run per-tile loops, CLAUDE.md §8).

**Tech Stack:** Vanilla 2D canvas in `js/app.js` (arrow fns only, no jQuery growth, no build
step — CLAUDE.md §1/§5). Python 3 stdlib (`zlib`/`struct`) for the §6 PNG-preview harness.

**Verification model (no test framework — CLAUDE.md §6/§9):** (a) render a `__*.png` preview
of the proposed helpers + floors and **Read** it before touching `app.js`; (b) the live page
renders without a `const` collision / width error after each integration; (c) user checkpoints
on the live look. There are no unit tests by design (no node/framework).

**Spec:** [docs/superpowers/specs/2026-06-07-distinct-floors-and-object-cel-shade-design.md](../specs/2026-06-07-distinct-floors-and-object-cel-shade-design.md)

---

## File structure

- `py/__depth_preview.py` — **CREATE (throwaway)**. Pure-stdlib PNG harness that replicates
  `shadeHex`/`rect`/`bevel`/`shadow` + the 3 floor renderers + 4 sample objects, rendered to
  `__depth_preview.png`. Validates the look before integration; **deleted before commit**.
- `__depth_preview.png` — generated preview (gitignored `__*`, deleted before commit).
- `js/app.js` — **MODIFY**:
  - `shadow` (~L365) + `bevel` (~L373): strengthen to bold-toon.
  - furniture/decor draw fns (~L380–L970): audit so every 3D object calls `shadow()`+`bevel()`.
  - `drawFloors` (~L2881): replace with cache-backed dispatcher; add `FLOOR_STYLE`,
    `TILE_OPTS`, `floorTile`/`floorGrate`/`floorPlank`, `buildFloorCache`.

---

## Task 1: PNG-preview harness — proposed helpers + floors + sample objects (§6 gate)

**Files:** Create `py/__depth_preview.py`.

This validates the **bold `shadow`/`bevel`** and the **4 floor materials** as one image before
any `app.js` edit. The floor renderers here are the exact algorithms ported to `app.js` in
Task 3, so getting them right here de-risks integration.

- [ ] **Step 1 — Write the harness.** Create `py/__depth_preview.py` with this exact content:

```python
# py/__depth_preview.py — THROWAWAY §6 preview. Delete before commit (CLAUDE.md §6/§7).
# Mirrors js/app.js shadeHex/rect/bevel/shadow + the 3 floor renderers + sample objects,
# so the bold-toon look and the 4 floor materials can be eyeballed before integration.
import zlib, struct

CW, CH = 900, 560
canvas = [(12, 12, 20)] * (CW * CH)            # dark page bg

def shade(hexs, f):                            # == app.js shadeHex (returns rgb tuple)
    n = int(hexs[1:], 16)
    return (min(255, round(((n >> 16) & 255) * f)),
            min(255, round(((n >> 8) & 255) * f)),
            min(255, round((n & 255) * f)))

def _rgba(c):                                  # parse '#rrggbb' or 'rgba(r,g,b,a)' -> (r,g,b,a)
    if isinstance(c, tuple):
        return (c[0], c[1], c[2], 1.0)
    if c.startswith('rgba'):
        p = c[c.index('(') + 1:c.index(')')].split(',')
        return (int(p[0]), int(p[1]), int(p[2]), float(p[3]))
    n = int(c[1:], 16)
    return ((n >> 16) & 255, (n >> 8) & 255, n & 255, 1.0)

def rect(x, y, w, h, color):                   # == app.js rect (with alpha compositing)
    r, g, b, a = _rgba(color)
    x, y, w, h = int(x), int(y), int(w), int(h)
    for yy in range(max(0, y), min(CH, y + h)):
        row = yy * CW
        for xx in range(max(0, x), min(CW, x + w)):
            i = row + xx
            if a >= 1.0:
                canvas[i] = (r, g, b)
            else:
                d = canvas[i]
                canvas[i] = (round(d[0] + (r - d[0]) * a),
                             round(d[1] + (g - d[1]) * a),
                             round(d[2] + (b - d[2]) * a))

# ---- PROPOSED BOLD helpers (mirror these exact values into app.js in Task 2) ----
def shadow(x, y, w, h):                         # grounded contact shadow (down-right, soft-ish)
    rect(x + 3, y + 6, w, h, 'rgba(0,0,0,0.28)')        # penumbra
    rect(x + 4, y + 7, w - 2, h - 2, 'rgba(0,0,0,0.30)')# darker core

def bevel(x, y, w, h, light='rgba(255,255,255,0.22)', dark='rgba(0,0,0,0.46)'):
    rect(x, y, w, 2, light)                             # top
    rect(x, y, 2, h, light)                             # left
    rect(x, y + h - 2, w, 2, dark)                      # bottom
    rect(x + w - 2, y, 2, h, dark)                      # right

# ---- FLOOR RENDERERS (ported verbatim to app.js Task 3; here g is ignored, draws to canvas) ----
WALL = 8
def floor_bounds(r):
    return (r['x'] + WALL, r['y'] + 28, r['x'] + r['w'] - WALL, r['y'] + r['h'] - WALL)

def floorTile(r, o):
    x0, y0, x1, y1 = floor_bounds(r); base = r['floor']; t = o['tile']
    rect(x0, y0, x1 - x0, y1 - y0, base)
    hi, sh, grout = shade(base, o['hi']), shade(base, 0.82), shade(base, o['grout'])
    ty = y0
    while ty < y1:
        tx = x0
        while tx < x1:
            tw, th = min(t, x1 - tx), min(t, y1 - ty)
            rect(tx, ty, tw, 1, hi)                     # tile top sheen
            rect(tx, ty, 1, th, hi)                     # tile left sheen
            rect(tx, ty + th - 1, tw, 1, sh)            # tile bottom shade
            tx += t
        ty += t
    gx = x0                                             # grout grid (drawn over sheen)
    while gx <= x1:
        rect(gx, y0, 1, y1 - y0, grout); gx += t
    gy = y0
    while gy <= y1:
        rect(x0, gy, x1 - x0, 1, grout); gy += t

def floorPlank(r):
    x0, y0, x1, y1 = floor_bounds(r); base = r['floor']; ph = 14
    seam = shade(base, 0.58); top = shade(base, 1.28)
    py = y0; i = 0
    while py < y1:
        h2 = min(ph, y1 - py)
        tone = shade(base, 1.12 if i % 2 else 0.94)
        rect(x0, py, x1 - x0, h2, tone)                 # plank
        rect(x0, py, x1 - x0, 1, top)                   # plank top highlight
        rect(x0, py + h2 - 1, x1 - x0, 1, seam)         # seam shadow
        grain = shade(tone if isinstance(tone, str) else base, 0.85)
        gx = x0 + ((i * 37) % 60)
        while gx < x1:                                  # grain streaks
            rect(gx, py + 3, 1, h2 - 5, 'rgba(0,0,0,0.18)'); gx += 80
        py += ph; i += 1

def floorGrate(r):
    x0, y0, x1, y1 = floor_bounds(r); base = shade(r['floor'], 1.12); p = 30
    hi, sh, seam, bolt = shade('#%02x%02x%02x' % base, 1.5), shade('#%02x%02x%02x' % base, 0.6), \
        shade('#%02x%02x%02x' % base, 0.45), shade('#%02x%02x%02x' % base, 0.4)
    rect(x0, y0, x1 - x0, y1 - y0, base)
    py = y0
    while py < y1:
        px = x0
        while px < x1:
            pw, h2 = min(p, x1 - px), min(p, y1 - py)
            rect(px + 1, py + 1, pw - 2, 1, hi)         # bevel top
            rect(px + 1, py + 1, 1, h2 - 2, hi)         # bevel left
            rect(px + 1, py + h2 - 2, pw - 2, 1, sh)    # bevel bottom
            rect(px + pw - 2, py + 1, 1, h2 - 2, sh)    # bevel right
            for bx in (px + 3, px + pw - 4):
                for by in (py + 3, py + h2 - 4):
                    rect(bx, by, 2, 2, bolt)            # corner bolts
            px += p
        py += p
    gx = x0
    while gx <= x1:
        rect(gx, y0, 1, y1 - y0, seam); gx += p
    gy = y0
    while gy <= y1:
        rect(x0, gy, x1 - x0, 1, seam); gy += p

# ---- four rooms (same geometry as app.js ROOMS) ----
ROOMS = {
    'boss':   {'x': 0,   'y': 40,  'w': 450, 'h': 260, 'floor': '#2a1f3d'},
    'dev':    {'x': 450, 'y': 40,  'w': 450, 'h': 260, 'floor': '#1e2a2e'},
    'ops':    {'x': 0,   'y': 300, 'w': 450, 'h': 260, 'floor': '#1a2218'},
    'lounge': {'x': 450, 'y': 300, 'w': 450, 'h': 260, 'floor': '#2e2415'},
}
TILE_OPTS = {'boss': {'tile': 40, 'hi': 1.22, 'grout': 0.60},
             'dev':  {'tile': 28, 'hi': 1.16, 'grout': 0.70}}
floorTile(ROOMS['boss'], TILE_OPTS['boss'])
floorTile(ROOMS['dev'],  TILE_OPTS['dev'])
floorGrate(ROOMS['ops'])
floorPlank(ROOMS['lounge'])

# ---- sample objects on each floor: base + sheen + bevel + shadow (bold) ----
def sample_desk(x, y):
    base = '#3d2b1a'
    shadow(x, y, 95, 50)
    rect(x, y, 95, 50, base)
    rect(x, y, 95, 25, '#%02x%02x%02x' % shade(base, 1.14))   # top-down sheen
    bevel(x, y, 95, 50)
def sample_rack(x, y):
    base = '#1a1a2a'
    shadow(x, y, 28, 55)
    rect(x, y, 28, 55, base)
    bevel(x, y, 28, 55)
def sample_sofa(x, y):
    shadow(x, y, 120, 38)
    rect(x, y, 120, 38, '#2d3561')
    rect(x + 6, y + 6, 108, 30, '#1e2449')
    bevel(x, y, 120, 38)
sample_desk(60, 90); sample_rack(360, 100)        # boss / dev area
sample_sofa(600, 360); sample_rack(60, 360)       # lounge / ops area

def write_png(path):
    raw = bytearray()
    for y in range(CH):
        raw.append(0)
        for x in range(CW):
            raw += bytes(canvas[y * CW + x])
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', CW, CH, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))

write_png('__depth_preview.png')
print('wrote __depth_preview.png')
```

- [ ] **Step 2 — Render.** Run: `py py/__depth_preview.py`
  Expected: prints `wrote __depth_preview.png`, no traceback.

- [ ] **Step 3 — View.** Read `__depth_preview.png`. Expected: four visibly distinct floors
  (purple large tiles / teal small tiles / green metal-grate-with-bolts / brown wood planks),
  and the sample objects read 3D — a clear top-left highlight, bottom-right shadow, and a
  grounded contact shadow under each.

- [ ] **Step 4 — Iterate** the constants (`shadow`/`bevel` alphas+offsets; `TILE_OPTS`; plank
  `ph`/tones; grate `p`/bolts) and re-render (Steps 2–3) until: floors are clearly different,
  shading is **bold but not muddy**, grout/seams are visible but subtle. **Acceptance:** you'd
  ship this look. (No commit — `__*` is throwaway; the validated constants flow into Tasks 2–3.)

---

## Task 2: Strengthen `shadow`/`bevel` and audit every object (spec Phase 1)

**Files:** Modify `js/app.js` — `shadow` (~L365), `bevel` (~L373), and the furniture/decor draw
fns between ~L380 and ~L970.

- [ ] **Step 1 — Replace `shadow`** with the validated bold version (mirror Task 1's `shadow`):

```js
// grounded contact shadow under an object — soft penumbra + darker core, offset down-right
// (opposite the top-left key light) so pieces sit on the floor instead of floating.
const shadow = (x, y, w, h) => {
  ctx.save();
  rect(x + 3, y + 6, w, h, 'rgba(0,0,0,0.28)');
  rect(x + 4, y + 7, w - 2, h - 2, 'rgba(0,0,0,0.30)');
  ctx.restore();
};
```

- [ ] **Step 2 — Strengthen `bevel` defaults** to bold-toon (mirror Task 1's `bevel`):

```js
// faux-3D bevel: light top/left edge, dark bottom/right edge (bold toon).
const bevel = (x, y, w, h, light = 'rgba(255,255,255,0.22)', dark = 'rgba(0,0,0,0.46)') => {
  rect(x, y, w, 2, light);
  rect(x, y, 2, h, light);
  rect(x, y + h - 2, w, 2, dark);
  rect(x + w - 2, y, 2, h, dark);
};
```

- [ ] **Step 3 — Audit: every 3D object calls `shadow()` AND `bevel()`.** Walk each draw fn and
  ensure it grounds + bevels. From the current code, these already call both (leave as-is, they
  inherit the stronger look): `drawBookshelfTopDown`, `drawChairTopDown`, `drawGamingDeskTopDown`,
  `drawWorkDesk`, `drawOfficeChair`, `drawCabinetTopDown`, `drawCoffeeMachineTopDown`. These call
  `shadow()` but use **hand-rolled edge rects instead of `bevel()`** — add a `bevel(x,y,w,h)` call
  right after their base fill (do NOT remove their existing decorative edges; bevel sits on top):
  - `drawBossDesk` (~L384) — after `rect(x,y,w,h,base)` add `bevel(x, y, w, h);`
  - `drawManagerDesk` (~L433) — after `rect(x,y,w,h,base)` add `bevel(x, y, w, h);`
  - `drawServerRackTopDown` (~L636) — it already has `bevel(...)`; leave it.
  - `drawSofaTopDown` (~L655) — after the base/backrest block add `bevel(x, y, w, h);`
  - `drawWhiteboardTopDown` (~L686) — after `rect(x,y,w,18,'#e8e8e8')` add `bevel(x, y, w, 18);`

- [ ] **Step 4 — Add `shadow()` to objects missing it.** `drawDeskMonitor` (~L617) and
  `drawGamingChairTopDown` (~L625) draw a body but no ground shadow. Add at the top of each fn:
  - `drawDeskMonitor(mx, my, screenCol)` → first line: `shadow(mx, my, 40, 28);`
  - `drawGamingChairTopDown(x, y, base)` → after the tone consts, before the first `rect`:
    it already calls `shadow(x, y, 26, 28)` — confirm present; if so leave it.
  `drawPlantTopDown` already calls `shadow`; its foliage uses explicit highlights (keep).

- [ ] **Step 5 — Verify the page renders.** Ensure the server is up (`./start.ps1` if needed)
  and load `http://localhost:8765/office.html`. Expected: page is **not blank** (blank = a
  `const` collision or width error — CLAUDE.md §5). Objects now read with stronger top-left
  highlight / bottom-right shadow and a grounded shadow under each.

- [ ] **Step 6 — Checkpoint (USER).** Confirm the bold object depth looks right in the live app
  before moving to floors. Iterate Steps 1–2 alphas if too strong/weak.

- [ ] **Step 7 — Commit.**

```bash
git add js/app.js
git commit -m "feat: bold cel-shade + grounded contact shadows on all scene objects"
```

---

## Task 3: Distinct per-room floor materials via offscreen cache (spec Phase 2)

**Files:** Modify `js/app.js` — add the floor renderers + cache near the other draw helpers
(after `shadeHex`/`bevel`, before `drawAllRooms`), and replace `drawFloors` (~L2881).

- [ ] **Step 1 — Add `FLOOR_STYLE`, `TILE_OPTS`, and the three renderers.** Insert this block
  just above `drawAllRooms` (~L856). The renderers take an explicit context `g` (the offscreen
  context) and use `g.fillStyle`/`g.fillRect` — they must NOT use the global `rect()` (which is
  bound to the main `ctx`). Paste the **validated** constants from Task 1:

```js
// ── Per-room floor materials (rendered once into an offscreen cache, blitted each frame) ──
const FLOOR_STYLE = { boss: 'tile', dev: 'tile', ops: 'grate', lounge: 'plank' };
const TILE_OPTS = {
  boss: { tile: 40, hi: 1.22, grout: 0.60 },   // large purple tiles
  dev:  { tile: 28, hi: 1.16, grout: 0.70 },   // smaller teal tiles
};
const _floorBounds = (r) => [r.x + WALL, r.y + 28, r.x + r.w - WALL, r.y + r.h - WALL];

const floorTile = (g, r, o) => {
  const [x0, y0, x1, y1] = _floorBounds(r), base = r.floor, t = o.tile;
  const hi = shadeHex(base, o.hi), sh = shadeHex(base, 0.82), grout = shadeHex(base, o.grout);
  g.fillStyle = base; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let ty = y0; ty < y1; ty += t) for (let tx = x0; tx < x1; tx += t) {
    const tw = Math.min(t, x1 - tx), th = Math.min(t, y1 - ty);
    g.fillStyle = hi; g.fillRect(tx, ty, tw, 1); g.fillRect(tx, ty, 1, th);   // top+left sheen
    g.fillStyle = sh; g.fillRect(tx, ty + th - 1, tw, 1);                      // bottom shade
  }
  g.fillStyle = grout;
  for (let tx = x0; tx <= x1; tx += t) g.fillRect(tx, y0, 1, y1 - y0);
  for (let ty = y0; ty <= y1; ty += t) g.fillRect(x0, ty, x1 - x0, 1);
};

const floorPlank = (g, r) => {
  const [x0, y0, x1, y1] = _floorBounds(r), base = r.floor, ph = 14;
  const seam = shadeHex(base, 0.58), top = shadeHex(base, 1.28);
  let i = 0;
  for (let py = y0; py < y1; py += ph, i++) {
    const h2 = Math.min(ph, y1 - py), tone = shadeHex(base, i % 2 ? 1.12 : 0.94);
    g.fillStyle = tone; g.fillRect(x0, py, x1 - x0, h2);
    g.fillStyle = top;  g.fillRect(x0, py, x1 - x0, 1);
    g.fillStyle = seam; g.fillRect(x0, py + h2 - 1, x1 - x0, 1);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let gx = x0 + ((i * 37) % 60); gx < x1; gx += 80) g.fillRect(gx, py + 3, 1, h2 - 5);
  }
};

const floorGrate = (g, r) => {
  const [x0, y0, x1, y1] = _floorBounds(r), base = shadeHex(r.floor, 1.12), p = 30;
  const hi = shadeHex(base, 1.5), sh = shadeHex(base, 0.6), seam = shadeHex(base, 0.45),
        bolt = shadeHex(base, 0.4);
  g.fillStyle = base; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let py = y0; py < y1; py += p) for (let px = x0; px < x1; px += p) {
    const pw = Math.min(p, x1 - px), h2 = Math.min(p, y1 - py);
    g.fillStyle = hi; g.fillRect(px + 1, py + 1, pw - 2, 1); g.fillRect(px + 1, py + 1, 1, h2 - 2);
    g.fillStyle = sh; g.fillRect(px + 1, py + h2 - 2, pw - 2, 1); g.fillRect(px + pw - 2, py + 1, 1, h2 - 2);
    g.fillStyle = bolt;
    for (const bx of [px + 3, px + pw - 4]) for (const by of [py + 3, py + h2 - 4]) g.fillRect(bx, by, 2, 2);
  }
  g.fillStyle = seam;
  for (let px = x0; px <= x1; px += p) g.fillRect(px, y0, 1, y1 - y0);
  for (let py = y0; py <= y1; py += p) g.fillRect(x0, py, x1 - x0, 1);
};

// Built once: render every room's floor into an offscreen canvas at device resolution.
let _floorCache = null;
const buildFloorCache = () => {
  const fc = document.createElement('canvas');
  fc.width = W * DPR; fc.height = H * DPR;
  const g = fc.getContext('2d');
  g.scale(DPR, DPR);
  for (const [k, r] of Object.entries(ROOMS)) {
    const style = FLOOR_STYLE[k];
    if (style === 'tile') floorTile(g, r, TILE_OPTS[k]);
    else if (style === 'plank') floorPlank(g, r);
    else if (style === 'grate') floorGrate(g, r);
  }
  _floorCache = fc;
};
```

- [ ] **Step 2 — Replace `drawFloors`** (~L2881) with the cache blit (delete the old grid loop):

```js
const drawFloors = () => {
  if (!_floorCache) buildFloorCache();
  // source is W*DPR×H*DPR, dest is W×H user units → 1:1 crisp through the DPR transform.
  ctx.drawImage(_floorCache, 0, 0, W, H);
};
```

- [ ] **Step 3 — Verify the page renders.** Reload `http://localhost:8765/office.html`.
  Expected: page not blank; all four floors show distinct materials (no uniform grid); the base
  `rect(r.x,r.y,r.w,r.h,r.floor)` in `drawAllRooms` still fills behind the cache as a backstop;
  furniture/agents draw on top correctly (floor under ambient/furniture, per `draw()` order).

- [ ] **Step 4 — Checkpoint (USER).** Confirm the 4 floors look distinct and good in the live
  app. Specifically confirm the `ops` metal-grate choice (vs the reference's green tile) — if the
  user prefers tile, set `FLOOR_STYLE.ops = 'tile'` and add `ops` to `TILE_OPTS`
  (`{ tile: 32, hi: 1.18, grout: 0.66 }`) and re-verify. Iterate tile size / plank height /
  grate panel size to taste.

- [ ] **Step 5 — Commit.**

```bash
git add js/app.js
git commit -m "feat: distinct per-room floor materials (tile/grate/plank) via offscreen cache"
```

---

## Task 4: Whole-scene polish + cleanup (spec Phase 3)

**Files:** Modify `js/app.js` (tuning only); delete `py/__depth_preview.py` + `__depth_preview.png`.

- [ ] **Step 1 — Review the full live scene.** Reload `office.html`; trigger a tool call (or seed
  `agent-events.json`) so an agent walks/sits. Check: floors + objects + agents read as one
  cohesive cel-shaded scene; contact shadows don't bleed onto walls/doorways; floor grout/seams
  aren't visually noisy under furniture; nothing flickers (cache built once).

- [ ] **Step 2 — Tune by eye** any of: `shadow`/`bevel` alphas (Task 2), `TILE_OPTS`/plank/grate
  constants (Task 3). Re-verify live. **Acceptance:** user signs off on the whole scene.

- [ ] **Step 3 — Delete the throwaway artifacts** (CLAUDE.md §6/§7 — never commit `__*`):

```powershell
Remove-Item py/__depth_preview.py, __depth_preview.png -ErrorAction SilentlyContinue
```

- [ ] **Step 4 — Confirm clean tree + commit any final tuning.**

```bash
git status   # expect: no __* files, no agent-events.json staged
git add js/app.js
git commit -m "polish: tune floor + object cel-shade strength across the scene"
```

---

## Self-review notes (author)

- **Spec coverage:** spec §3 (4 floor materials + offscreen cache) → Task 1 (validate) + Task 3
  (integrate); spec §4 (bold cel edges + contact shadow on all objects) → Task 1 (validate) +
  Task 2 (strengthen `bevel`/`shadow` + audit); spec §6 (PNG pipeline) → Task 1; spec §7
  (verification) → live-render + user checkpoints in every task; spec §8 phasing → Tasks 2/3/4.
- **Deviation from spec helper names (intentional, DRY):** the spec named new `celEdges` /
  `contactShadow` helpers; the codebase already has equivalents — `bevel()` (cel-edge) and
  `shadow()` (contact shadow) — called by most furniture. Reusing + strengthening them avoids a
  duplicate-`const` collision (which silently blanks the page, CLAUDE.md §5) and is DRY. Same
  visual result, less risk. Noted so the executor doesn't add new helpers.
- **No placeholders:** every code step has complete, runnable code; the floor renderers in Task 1
  (Python) and Task 3 (JS) are the same algorithm, so Task 1's PNG faithfully previews Task 3.
- **Type/name consistency:** `floorTile`/`floorPlank`/`floorGrate`, `FLOOR_STYLE`, `TILE_OPTS`,
  `_floorBounds`, `_floorCache`, `buildFloorCache` are used identically across Steps; the
  renderers take `(g, r[, o])` everywhere; `shadow`/`bevel` signatures are unchanged (only their
  bodies/defaults change) so all ~20 existing call sites keep working.
- **No tests by design** (no node/framework — CLAUDE.md §1/§6): verification is render-PNG +
  live-page-renders + user checkpoint, the project's established path.
- **Perf:** floors blit from a cache built once (no per-frame tile loops); contact shadows are
  ~2 cheap rects/object. The rAF loop cost is ~1 `drawImage` + the existing furniture draws.
