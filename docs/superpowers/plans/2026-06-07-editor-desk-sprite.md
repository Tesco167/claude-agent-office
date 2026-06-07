# Editor Workstation Sprite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Editor (`coder`) procedural gaming desk + chair with the baked top-down PNG station, with all 3 monitors + the gaming PC case glowing always and flowing code animating only while the Editor is seated.

**Architecture:** The station art (monitors + keyboard + chair + PC case) is a keyed-to-transparent PNG drawn as static furniture in `_sceneCache` (same pattern as the Jamesmie/Manager desks). The Editor's monitor glow + animated code is pulled OUT of the static `drawDetails` cache into a NEW per-frame function `drawEditorScreens()` called inside `draw()`, because it now animates and depends on agent state. `sceneState()` is extended so the render loop stays awake while the Editor is seated.

**Tech Stack:** Plain vanilla canvas 2D JS (`js/app.js`, arrow functions only), a throwaway Python stdlib script for image keying + preview (no PIL/Node — `node` is not installed). No build step, no framework.

**Verification method (per CLAUDE.md §6, NOT a unit-test framework — there is none):** render a PNG and *view it* for sprite art; run `.\start.ps1` and watch the live canvas for animation/positions; confirm the page renders (a `const` collision or bad sprite grid silently blanks the page).

---

## File Structure

- **`assets/editor-desk-topdown.png`** (create) — the reference art with its dark floor background flood-filled to transparency. The single source of the station sprite.
- **`__prep_editor_desk.py`** (create, throwaway — deleted before commit) — stdlib script: keys the background, writes the PNG, and renders a measurement preview (grid + axis labels) so the on-canvas monitor/chair coordinates can be read off.
- **`js/app.js`** (modify) — the whole app. Edits in 5 regions:
  - `EDITOR_DESK_IMG` + `drawEditorDesk()` (new, near the other `*_DESK_IMG` defs ~line 435–530).
  - Ops room draw block (replace [app.js:1136-1138](../../js/app.js#L1136)).
  - `drawChairBack` early-return for `coder` (~line 3187).
  - `drawDetails` — remove the ops screen entry + hoist the `CODE` palette to module scope (~line 3242).
  - New `drawEditorScreens()` + call in `draw()` + `sceneState()` anim extension + decode-redraw list (~line 3361).
  - Position constants: `WORK_POS.coder`, `SIT_POS.coder`, `SEAT_APPROACH.coder`, `NAV_OBSTACLES` ops box.

---

## Task 1: Prep the station PNG (key background + measurement preview)

**Files:**
- Create: `__prep_editor_desk.py` (throwaway)
- Create: `assets/editor-desk-topdown.png`

- [ ] **Step 1: Write the prep script**

Create `__prep_editor_desk.py`. It (a) reads the source PNG via the stdlib `zlib`/`struct` PNG decoder pattern already used in this repo's visual workflow, (b) flood-fills the background from the four edges to transparent (a pixel is "background" if its RGB is within tolerance of the corner color — this preserves dark pixels INSIDE the art, e.g. monitor bezels), (c) writes `assets/editor-desk-topdown.png`, and (d) renders `__editor_preview.png`: the keyed sprite scaled to a target on-canvas width of 140px, composited on a mid-grey field, with a 10px grid and axis labels in the OPS-room coordinate frame (station top-left placed at world `(60, 336)` = `or.x+60, or.y+36`).

```python
import zlib, struct

def read_png(path):
    with open(path, 'rb') as f: data = f.read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n'
    pos, w, h, idat = 8, 0, 0, b''
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]; chunk = data[pos+8:pos+8+ln]
        if typ == b'IHDR':
            w, h, bit, col = *struct.unpack('>II', chunk[:8]), chunk[8], chunk[9]
            assert bit == 8 and col == 6, f'need 8-bit RGBA, got bit={bit} col={col}'
        elif typ == b'IDAT': idat += chunk
        elif typ == b'IEND': break
        pos += 12 + ln
    raw = zlib.decompress(idat)
    px = [[None]*w for _ in range(h)]
    stride = w*4 + 1; prev = bytearray(w*4)
    def paeth(a,b,c):
        p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
        return a if pa<=pb and pa<=pc else (b if pb<=pc else c)
    for y in range(h):
        ft = raw[y*stride]; line = bytearray(raw[y*stride+1:y*stride+1+w*4])
        for i in range(w*4):
            a = line[i-4] if i>=4 else 0; b = prev[i]; c = prev[i-4] if i>=4 else 0
            if ft==1: line[i]=(line[i]+a)&255
            elif ft==2: line[i]=(line[i]+b)&255
            elif ft==3: line[i]=(line[i]+((a+b)>>1))&255
            elif ft==4: line[i]=(line[i]+paeth(a,b,c))&255
        for x in range(w): px[y][x]=tuple(line[x*4:x*4+4])
        prev = line
    return w, h, px

def write_png(path, w, h, px):
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w): raw += bytes(px[y][x])
    def chunk(typ, data):
        return struct.pack('>I', len(data)) + typ + data + struct.pack('>I', zlib.crc32(typ+data)&0xffffffff)
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    out = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(bytes(raw),9)) + chunk(b'IEND', b'')
    with open(path,'wb') as f: f.write(out)

SRC = 'assets/Object/Computer Desk/Editor/editor_desk_and_chair.png'
w, h, px = read_png(SRC)
bg = px[0][0]
TOL = 34
def is_bg(p): return abs(p[0]-bg[0])<=TOL and abs(p[1]-bg[1])<=TOL and abs(p[2]-bg[2])<=TOL
# flood fill from the four edges
from collections import deque
seen = [[False]*w for _ in range(h)]; q = deque()
for x in range(w):
    for yy in (0, h-1):
        if is_bg(px[yy][x]) and not seen[yy][x]: seen[yy][x]=True; q.append((x,yy))
for y in range(h):
    for xx in (0, w-1):
        if is_bg(px[y][xx]) and not seen[y][xx]: seen[y][xx]=True; q.append((xx,y))
while q:
    x,y = q.popleft()
    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
        nx,ny = x+dx, y+dy
        if 0<=nx<w and 0<=ny<h and not seen[ny][nx] and is_bg(px[ny][nx]):
            seen[ny][nx]=True; q.append((nx,ny))
for y in range(h):
    for x in range(w):
        if seen[y][x]: px[y][x] = (0,0,0,0)
write_png('assets/editor-desk-topdown.png', w, h, px)
print('NATURAL', w, h, 'aspect', round(h/w, 3))
```

- [ ] **Step 2: Run it**

Run: `py __prep_editor_desk.py`
Expected: prints `NATURAL <w> <h> aspect <r>` and writes `assets/editor-desk-topdown.png`. **Record the printed `NATURAL w h`** — Task 2 needs the aspect.

- [ ] **Step 3: View the keyed sprite — REQUIRED (§6)**

Read `assets/editor-desk-topdown.png` with the Read tool. Confirm: background fully transparent (no dark floor halo), and monitors/keyboard/chair/PC case fully intact (the flood fill did NOT eat interior dark pixels). If a halo remains, lower `TOL`; if interior pixels were eaten, raise `TOL`, re-run, re-view. Iterate until clean.

- [ ] **Step 4: View the measurement preview**

Read `__editor_preview.png` (if you added the grid render in Step 1; if not, skip — Task 2/3 can measure in-browser instead). Record, in the OPS-room world frame with station top-left at `(60, 336)` and on-canvas width 140: the on-canvas station height, the 3 monitor screen rects `{x,y,w,h}`, the gaming PC-case center, and the chair-seat center. These feed Tasks 2–3.

- [ ] **Step 5: No commit yet** — the PNG is committed together with the code in Task 4. Leave `__prep_editor_desk.py` in place (deleted in Task 4).

---

## Task 2: Draw the station sprite + retune Editor positions (static result)

**Files:**
- Modify: `js/app.js` — add `EDITOR_DESK_IMG` + `drawEditorDesk` (~after line 530); replace [app.js:1136-1138](../../js/app.js#L1136); `WORK_POS.coder` ([app.js:89](../../js/app.js#L89)); `SIT_POS.coder` ([app.js:99](../../js/app.js#L99)); `SEAT_APPROACH.coder` ([app.js:117](../../js/app.js#L117)); ops `NAV_OBSTACLES` box ([app.js:184](../../js/app.js#L184)); decode-redraw list ([app.js:3361](../../js/app.js#L3361)); `drawChairBack` ([app.js:3187](../../js/app.js#L3187)).

- [ ] **Step 1: Add the image + draw function**

Insert after the manager-desk block (after line 530), mirroring the `MANAGER_DESK_IMG`/`drawManagerDesk` pattern. `STATION_X/Y/W` are the placement constants (tune in Step 6). The fallback redraws the OLD procedural pieces at their original coordinates so a missing/late PNG still looks right:

```js
// Editor (coder) station. Primary path: the keyed top-down sprite
// (assets/editor-desk-topdown.png — triple monitors, RGB keyboard, gaming chair,
// gaming PC case; dark floor flood-filled to transparency, source at
// assets/Object/Computer Desk/Editor/). Drawn aspect-preserved at STATION_W with a
// grounded contact shadow. Falls back to the procedural gaming desk + monitor +
// chair until the sprite decodes (or if the file is ever missing). The monitor
// GLOW + flowing code is layered live per-frame by drawEditorScreens(), NOT here.
const EDITOR_DESK_IMG = new Image();
EDITOR_DESK_IMG.src = 'assets/editor-desk-topdown.png';
const STATION_X = 60, STATION_Y = 36, STATION_W = 140;   // ops-room-relative top-left + width (tuned Step 6)
const drawEditorDesk = (ox, oy) => {
  const x = ox + STATION_X, y = oy + STATION_Y;
  if (EDITOR_DESK_IMG.complete && EDITOR_DESK_IMG.naturalWidth) {
    const dh = Math.round(STATION_W * EDITOR_DESK_IMG.naturalHeight / EDITOR_DESK_IMG.naturalWidth);
    drawSpriteShadowed(EDITOR_DESK_IMG, x, y, STATION_W, dh);
    return;
  }
  // procedural fallback — original gaming desk + monitor + chair
  drawGamingDeskTopDown(ox + 85, oy + 55, 95, 50);
  drawDeskMonitor(ox + 95, oy + 62, '#001a00');
  drawGamingChairTopDown(ox + 102, oy + 105, C.deskGaming);
};
```

- [ ] **Step 2: Replace the ops draw block**

In the OPS ROOM section, replace these three lines ([app.js:1136-1138](../../js/app.js#L1136)):

```js
  drawGamingDeskTopDown(or.x + 85, or.y + 55, 95, 50);
  drawDeskMonitor(or.x + 95, or.y + 62, '#001a00');
  drawGamingChairTopDown(or.x + 102, or.y + 105, C.deskGaming);  // ops chair — Editor (matches gaming desk)
```

with:

```js
  drawEditorDesk(or.x, or.y);   // Editor station (PNG; fallback = gaming desk+monitor+chair)
```

- [ ] **Step 3: Register the sprite for cache rebuild**

In the decode-redraw list ([app.js:3361](../../js/app.js#L3361)) add `EDITOR_DESK_IMG`:

```js
[JAMESMIE_DESK_IMG, MANAGER_DESK_IMG, MANAGER_CHAIR_IMG, SOFA_IMG, TABLE_IMG, EDITOR_DESK_IMG].forEach(img =>
  img.addEventListener('load', () => { _sceneCache = null; }));
```

- [ ] **Step 4: Stop drawing a chair over the seated Editor**

The chair is baked into the PNG, so `drawChairBack` must not draw a procedural chair for `coder`. Add an early return right after the manager block in `drawChairBack` ([app.js:3200](../../js/app.js#L3200), just before `const sp = SIT_POS[key];`):

```js
  if (key === 'coder') return;   // chair is baked into the editor station sprite
```

(Leaving the `coder: C.deskGaming` entry in `DESK_BASE` is harmless now, but remove it for clarity.)

- [ ] **Step 5: Retune the Editor's positions to the baked chair**

The agent must sit in the baked chair (front/bottom of the station), not on the monitors. Set these from the measured chair-seat center (Task 1 Step 4); starting values:

```js
// WORK_POS.coder  — stand in front of the chair before sitting
  coder:    { x: 130, y: 470 },
// SIT_POS.coder   — centered on the baked chair seat (agent faces up, into the monitors)
  coder:    { x: 130, y: 452 },
// SEAT_APPROACH.coder — clear floor directly in front of the seat
  coder:    { x: 130, y: 488 },
```

And grow the ops `NAV_OBSTACLES` box ([app.js:184](../../js/app.js#L184)) to cover the station's desk+monitor+PC mass (NOT the chair seat — agents walk onto the chair):

```js
  { x: 60,  y: 336, w: 140, h: 95 },   // ops Editor station (desk + monitors + PC case)
```

- [ ] **Step 6: Verify in the browser — REQUIRED**

Run `.\start.ps1`, open `http://localhost:8765/office.html`. Confirm:
1. Page renders (no blank screen → no `const` collision).
2. The Editor station shows the new art, transparent background over the green ops floor, with a grounded shadow — no clipping into walls/racks.
3. The Editor agent (trigger an `Edit`/`Write`, or watch idle_desk) walks up and sits **in the chair**, facing the monitors, not floating on the screens.
4. Other agents path AROUND the station (no walking through the desk).

Adjust `STATION_X/Y/W` and the `coder` positions until correct. Screenshot or describe the result.

---

## Task 3: Live glowing monitors + flowing code when seated

**Files:**
- Modify: `js/app.js` — hoist `CODE` palette to module scope + remove ops entry from `drawDetails` ([app.js:3242-3244](../../js/app.js#L3242)); add `EDITOR_MONITORS`/`EDITOR_PC`/`editorSeated`/`drawEditorScreens` (near `drawDetails`); call in `draw()` ([app.js:3448](../../js/app.js#L3448)); extend `sceneState()` ([app.js:3383](../../js/app.js#L3383)).

- [ ] **Step 1: Hoist the CODE palette + drop the static ops screen**

In `drawDetails`, the ops entry currently bakes a static green terminal into the cache — remove it (the live function replaces it). Move the `CODE` palette to module scope so both functions share it.

Add at module scope just above `drawDetails` (~line 3234):

```js
const CODE = ['#e06c75', '#61afef', '#98c379', '#c678dd', '#e5c07b'];
```

In `drawDetails`, delete the local `const CODE = [...]` line ([app.js:3244](../../js/app.js#L3244)) and delete the ops SCREENS entry ([app.js:3242](../../js/app.js#L3242)):

```js
    { x: 97,  y: 364, w: 36, h: 24, k: 'term' },  // ops 1 (Editor, shifted right)   <-- DELETE THIS LINE
```

- [ ] **Step 2: Add the live screen renderer**

Insert after `drawDetails` (~line 3290). Coordinates come from the Task 1 measurement (or in-browser tuning); starting values assume the station at `(60,336)` width 140 — **tune in Step 5**:

```js
// Editor station monitors, drawn LIVE per-frame (not in the static scene cache):
// all 3 screens + the gaming PC case glow always; scrolling code/term lines run
// only while the Editor is seated. Called from draw() after the cache blit, before
// agents, so the seated agent renders in front of his chair while the monitors
// (above/behind him) stay visible.
const EDITOR_MONITORS = [
  { x: 92,  y: 352, w: 30, h: 22, k: 'code' },  // left screen
  { x: 126, y: 350, w: 32, h: 24, k: 'code' },  // center screen
  { x: 162, y: 352, w: 30, h: 22, k: 'term' },  // right screen
];
const EDITOR_PC = { x: 196, y: 392, r: 30 };     // gaming PC case RGB glow point
const editorSeated = () => {
  const ag = agents.coder;
  return ag.state === 'working' || ag.state === 'desk_linger'
      || (ag.state === 'idle_desk' && ag._deskArrived);
};
const drawEditorScreens = () => {
  bloom(EDITOR_PC.x, EDITOR_PC.y, EDITOR_PC.r, 'rgba(80,230,160,0.7)', 0.5);  // PC case — always
  const flow = editorSeated();
  const t = performance.now() / 1000;
  for (const m of EDITOR_MONITORS) {
    bloom(m.x + m.w / 2, m.y + m.h / 2, m.w * 1.15,
          m.k === 'term' ? 'rgba(60,230,130,0.7)' : 'rgba(110,165,255,0.7)', 0.55);  // glow — always
    if (!flow) continue;                            // idle → baked screen art + glow only
    ctx.save();
    ctx.beginPath(); ctx.rect(m.x, m.y, m.w, m.h); ctx.clip();   // scroll within the screen
    const span = m.h + 6, off = (t * 16) % span;    // 16 px/sec scroll
    for (let i = -1; i < m.h / 5 + 1; i++) {
      const ly = m.y + ((i * 5 - Math.floor(off)) % span + span) % span;
      const seed = ((i * 7 + m.x) % 5 + 5) % 5;
      if (m.k === 'term') rect(m.x + 2, ly, (seed % 2 ? 10 : 18), 2, '#1aff6a');
      else rect(m.x + 2, ly, 6 + seed * 6, 2, CODE[seed]);
    }
    ctx.restore();
  }
};
```

- [ ] **Step 3: Call it per-frame in draw()**

In `draw()` ([app.js:3448](../../js/app.js#L3448)), right after the scene-cache blit and BEFORE the agent loop:

```js
  ctx.drawImage(_sceneCache, 0, 0, W, H);   // entire static scene in one blit
  drawEditorScreens();                       // live monitor glow + flowing code (under agents)
  const sorted = Object.entries(agents).sort((a, b) => a[1].pos.y - b[1].pos.y);
```

- [ ] **Step 4: Keep the loop awake while the Editor is seated**

`working` already triggers `anim` via `BUSY_STATES`, but `desk_linger`/`idle_desk` do not, so the scroll would freeze when he stops working. In `sceneState()` ([app.js:3383](../../js/app.js#L3383)), inside the agent loop, after the existing `anim` line add:

```js
    if (k === 'coder' && (a.state === 'desk_linger' || (a.state === 'idle_desk' && a._deskArrived))) anim = true;
```

> **GPU note (intended trade-off):** this keeps the render loop at 60fps for the full `DESK_LINGER_MS` (5 min) seated window after each work burst, per the "flowing code whenever seated" requirement. If GPU at rest matters more, drop this line — then code flows only during active `working` and the screens go static-but-glowing the moment work pauses.

- [ ] **Step 5: Verify in the browser — REQUIRED**

Run `.\start.ps1`. Confirm:
1. All 3 monitors + the PC case glow at all times (even when the Editor is away).
2. The 3 glow/screen rects sit exactly over the baked monitors (tune `EDITOR_MONITORS`/`EDITOR_PC` if offset).
3. Trigger an `Edit`/`Write` (or watch the Editor work): code/term lines **scroll** on all 3 screens while he is seated, and stop (static art + glow) once he leaves.
4. FPS holds ~60 while seated; the readout shows `idle` when nothing is animating and the Editor is away.

---

## Task 4: Final verification + cleanup + commit

**Files:**
- Delete: `__prep_editor_desk.py`, `__editor_preview.png`, any other `__*` artifacts.
- Commit: `assets/editor-desk-topdown.png` + `js/app.js` + the spec/plan docs.

- [ ] **Step 1: Pre-commit checklist (CLAUDE.md §9)**

Confirm each: sprite rendered + viewed (Task 1); page renders, no `const` collision; roster unchanged (`coder` key / "Editor" name intact — no `TOOL_TO_AGENT`/`agents` change needed); no build tool/framework added, jQuery footprint unchanged; `agent-events.json` and `__*` NOT staged.

- [ ] **Step 2: Delete throwaway artifacts**

```powershell
Remove-Item __prep_editor_desk.py, __editor_preview.png -ErrorAction SilentlyContinue
```

- [ ] **Step 3: Stage + verify nothing forbidden is staged**

Run: `git add assets/editor-desk-topdown.png js/app.js docs/superpowers/specs/2026-06-07-editor-desk-sprite-design.md docs/superpowers/plans/2026-06-07-editor-desk-sprite.md`
Run: `git status`
Expected: `agent-events.json` and `__*` files do NOT appear in staged changes.

- [ ] **Step 4: Commit (only after the user confirms — CLAUDE.md §7)**

```bash
git commit -m "feat: editor station sprite with live glowing animated monitors"
```

---

## Self-Review (completed during planning)

- **Spec coverage:** full image base (Task 2) ✓; glow on 3 monitors + PC case always (Task 3 Step 2) ✓; flowing code when seated (Task 3 Steps 2,4) ✓; static-but-glowing when not seated (Task 3 Step 2 `if (!flow) continue`) ✓; gaming PC case kept + glowing (Task 3 `EDITOR_PC`) ✓; background keyed transparent (Task 1) ✓; fallback preserved (Task 2 Step 1) ✓; positions/nav retuned (Task 2 Step 5) ✓; decode-redraw + page-render checks (Tasks 2–3) ✓.
- **Type/name consistency:** `EDITOR_DESK_IMG`, `drawEditorDesk(ox,oy)`, `STATION_X/Y/W`, `EDITOR_MONITORS`, `EDITOR_PC`, `editorSeated`, `drawEditorScreens`, module-level `CODE` — used consistently across tasks. `coder` is the agent key throughout.
- **Known visual unknowns:** exact monitor/chair pixel coords depend on the keyed art's real proportions; resolved by the §6 view + browser-tuning loops in Task 1 Step 4 and Tasks 2–3 Step 5/6 (the project's defined verification method, not placeholders).
