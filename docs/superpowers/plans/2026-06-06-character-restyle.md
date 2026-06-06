# Cute Character Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the six office agents' flat, near-identical sprites with cute round-faced, big-eyed characters that are each visually distinct (hair, outfit, face, skin tone), lit with a 4-tone skin ramp + Medium directional depth shading + outline + hair specular, and grounded with a floor contact shadow.

**Architecture:** A committed dev-only Python generator (`py/gen_sprites.py`, never run at runtime) builds and width-validates the sprite grids and emits a JS block that is pasted into [js/app.js](../../../js/app.js). The runtime change is confined to two functions: `drawSprite` gains a `skinColor` param, an expanded color map, and a memoized procedural depth pass; `drawAgent` passes `skinColor` and draws a contact-shadow ellipse. No arm animation; the existing leg walk-cycle is untouched.

**Tech Stack:** Plain HTML + vanilla canvas JS + vendored jQuery (DOM/ajax only), fed by Python hook scripts. **No build step, no framework, no bundler, no JS test runner** (CLAUDE.md §1). Python 3 (stdlib only) renders PNG previews and emits sprite grids.

**Spec:** [docs/superpowers/specs/2026-06-06-character-restyle-design.md](../specs/2026-06-06-character-restyle-design.md)

**Testing reality:** This project has no JS unit-test harness and `node` is not installed. "Tests" therefore mean: (a) the Python generator's `assert` width/char/uniform-size checks (red/green), (b) rendered PNG previews inspected with the Read tool (CLAUDE.md §7), and (c) loading `office.html` in the browser and confirming no blank canvas / console errors. The plan uses these as its verification gates.

**Reference artifacts already in the repo (validated this session):** `__cute_preview.py` contains the working front-view (down-facing) generator for all six characters with depth + skin ramp + contact shadow — Task 1 promotes it to `py/gen_sprites.py`. `__cute_preview.png` is its approved render. All `__*` files are deleted in Task 9 before the final commit (CLAUDE.md §7/§10).

---

## File Structure

- **Create** `py/gen_sprites.py` — the committed sprite generator (front + back views, leg frames, width validation, PNG render mode, and `--emit` JS-block mode). Sole source of truth for the sprite grids.
- **Modify** `js/app.js`:
  - Replace the sprite-data block (lines ~1035–1502: `LEGS_B_*`, the twelve `*_BD`/`*_BU` grids, and `SPRITES_*2`) with the generator's emitted block.
  - `drawSprite` (lines 982–1027): add `skinColor` param + expanded color map + memoized `depthProcess` + a `blendHex` helper; blit from the processed buffer.
  - `drawAgent` (lines ~1795–1830): pass `agent.skinColor` to `drawSprite`; draw a contact-shadow ellipse before the sprite (skip when seated).
  - The six agent objects (lines 1508–1579): add a `skinColor` field to each.
- **Reference only (no runtime use):** `docs/superpowers/specs/2026-06-06-character-restyle-design.md`.

Each task below is self-contained and leaves the repo in a known state.

---

## Task 1: Promote the validated generator to `py/gen_sprites.py`

**Files:**
- Create: `py/gen_sprites.py` (from existing `__cute_preview.py`)

- [ ] **Step 1: Copy the validated front-view generator into place**

`__cute_preview.py` already generates all six **down-facing** characters with the round head, big eyes, per-character hair/outfit/features, the 4-tone skin ramp (`L/d/D`), Medium depth pass, outline, hair specular, and contact shadow — and it width-validates every grid before rendering. Copy it verbatim to the permanent path:

Run:
```powershell
Copy-Item __cute_preview.py py\gen_sprites.py
```

- [ ] **Step 2: Run it to confirm it still generates + validates**

Run:
```powershell
python py\gen_sprites.py
```
Expected: prints `wrote __cute_preview.png ... -> Jamesmie Manager Reader Coder Searcher Writer` and exits 0 (the `validate()` width/char asserts pass for all six). If any `WIDTH`/`CHAR` line prints, fix that grid before continuing.

- [ ] **Step 3: Inspect the render to confirm the six fronts are correct**

Read `__cute_preview.png`. Confirm: six distinct cute characters, round heads, big sparkly eyes, correct hair/outfit/accessories per the spec §3 look sheet, skin ramp visible, grounded by a contact shadow.

- [ ] **Step 4: Commit**

```powershell
git add py/gen_sprites.py
git commit -m "feat: add cute-sprite generator (front views) as a dev tool"
```

---

## Task 2: Add back (up-facing) view generation

The app draws an `up` view when an agent walks up or sits at a desk (back to viewer). It is the hair silhouette from behind — **no face, no eyes, no glasses/mustache/goatee/freckles** — keeping only crown / beret / headphones, plus the back of the outfit and any long-hair drape.

**Files:**
- Modify: `py/gen_sprites.py`

- [ ] **Step 1: Refactor hair-building into a shared helper**

In `make_head`, the hair dome + side-framing + spikes/bumpy/part logic currently runs inline. Extract it into a helper so the back view reuses the exact same silhouette. Add above `make_head`:

```python
def build_hair(g, opt):
    """Fill hair ('h') around the already-stamped face skin per the hairstyle.
    Mutates g (a HEADH x W list-of-lists). Returns nothing."""
    style=opt.get('hair','bob')
    P=HSTYLE.get(style, dict(fw=2, fb=18, cap_row=10))
    orx,ory,ocy = (14.6,13.8,12.2) if P.get('big') else (12.7,12.7,12.0)
    for r in range(HEADH):
        for c in range(W):
            if g[r][c]=='.' and r<=P['cap_row'] and ((c-cx)/orx)**2+((r-ocy)/ory)**2<=1.0:
                g[r][c]='h'
    def face_edges(r):
        cols=[c for c in range(W) if g[r][c]=='s']
        return (min(cols),max(cols)) if cols else None
    for r in range(P['cap_row'], P['fb']+1):
        ed=face_edges(r)
        if not ed: continue
        L,R=ed
        for k in range(1,P['fw']+1):
            if 0<=L-k<W and g[r][L-k]=='.': g[r][L-k]='h'
            if 0<=R+k<W and g[r][R+k]=='.': g[r][R+k]='h'
    def hair_top(c):
        for r in range(HEADH):
            if g[r][c]=='h': return r
        return None
    if P.get('spikes'):
        for c,up in [(8,2),(11,3),(14,2),(17,3),(20,2),(23,3),(26,2)]:
            t=hair_top(c)
            if t is not None:
                for k in range(1,up+1):
                    if t-k>=0: g[t-k][c]='h'
    if P.get('bumpy'):
        for c in range(5,31,2):
            t=hair_top(c)
            if t is not None and t-1>=0: g[t-1][c]='h'
        for r in range(8,P['fb'],2):
            ed=face_edges(r)
            if not ed: continue
            L,R=ed
            ll=L-P['fw']-1; rr=R+P['fw']+1
            if 0<=ll<W and g[r][ll]=='.': g[r][ll]='h'
            if 0<=rr<W and g[r][rr]=='.': g[r][rr]='h'
    if P.get('part'):
        for r in range(0,10):
            if g[r][13]=='h': g[r][13]='H'
    return P
```

Then in `make_head`, replace the inlined hair block (the dome cap + side-framing + spikes + bumpy + part code) with a single call right after the face-skin ellipse is stamped:

```python
    P=build_hair(g, opt)
```

Run `python py\gen_sprites.py` and Read `__cute_preview.png` — the six fronts must look **identical to Task 1** (pure refactor, no visual change).

- [ ] **Step 2: Add the back-head + back-body generators**

Add after `make_head`:

```python
def make_back(opt):
    """Up/back view: full hair silhouette, no face. Keep crown/beret/headphones."""
    g=[['.']*W for _ in range(HEADH)]
    # temporary face ellipse so build_hair frames correctly, then fill it with hair
    fcy,frx,fry = 15.5, 11.0, 10.8
    for r in range(HEADH):
        for c in range(W):
            if r>=9 and ((c-cx)/frx)**2+((r-fcy)/fry)**2<=1.0: g[r][c]='s'
    build_hair(g, opt)
    for r in range(HEADH):                 # back of head: skin area becomes hair
        for c in range(W):
            if g[r][c]=='s': g[r][c]='h'
    # accessories visible from behind only
    if opt.get('headphones'):
        orx,ory,ocy = 12.7,12.7,12.0
        for c in range(5,31):
            x=(c-cx)/orx
            if abs(x)<=1.0:
                br=int(round(ocy-ory*math.sqrt(max(0.0,1-x*x))))+1
                for bb,col in ((br,'P'),(br+1,'p')):
                    if 0<=bb<HEADH and g[bb][c] in 'h.': g[bb][c]=col
        for ux in (4,31):
            for dy in range(-3,4):
                for dx in range(-2,3):
                    if (dx/2.2)**2+(dy/3.2)**2<=1.0 and 0<=15+dy<HEADH: g[15+dy][ux]='p'
            for dy in range(-2,3):
                if 0<=15+dy<HEADH: g[15+dy][ux]='G'
    if opt.get('beret'):
        for r in range(0,8):
            for c in range(W):
                if g[r][c]=='h': g[r][c]='q'
        for c in range(W):
            if g[3][c]=='q' and c<cx: g[3][c]='Q'
        for r in range(1,HEADH-1):
            for c in range(W):
                if g[r][c]=='q' and g[r+1][c]=='h': g[r+1][c]='g'
        g[0]=list('................bb..................')
    if opt.get('crown'):
        g[0]=list('...........c..c..c..c..c............')
        g[1]=list('...........ccccccccccccc............')
    return g

def make_body_back(outfit, hairstyle):
    """Back of the torso: plain shirt + hood/scarf-from-behind + long-hair drape."""
    g=[['.']*W for _ in range(13)]
    bounds={0:(14,21),1:(13,22),2:(12,23),3:(12,23),4:(12,23),5:(12,23),6:(12,23),7:(13,22),8:(13,22)}
    for r,(a,b) in bounds.items():
        for c in range(a,b+1): g[r][c]='b'
    for r in (3,4,5): g[r][9]='s'; g[r][26]='s'
    g[4][12]='k'; g[5][12]='k'; g[4][22]='B'; g[5][22]='B'
    g[9]=list('............llll...llll.............')
    g[10]=list('............llll...llll.............')
    g[11]=list('............zzzz...zzzz.............')
    g[12]=list('............zzzzz.zzzzz.............')
    if outfit=='hoodie':                  # hood bunched at the back of the neck
        for c in range(11,25): g[0][c]='k'
        for c in range(12,24): g[1][c]='k'
    elif outfit=='scarf':                 # scarf wrap visible from behind
        for c in range(12,24): g[0][c]='r'
        for c in range(11,25): g[1][c]='r'
    if hairstyle=='long':
        for r in range(0,9):
            cols=(5,6,7,8,27,28,29,30) if r<6 else (5,6,7,28,29,30)
            for c in cols:
                if g[r][c]=='.': g[r][c]='h'
    elif hairstyle=='wavy':
        for r in range(0,5):
            for c in (6,7,28,29):
                if g[r][c]=='.': g[r][c]='h'
    return g
```

- [ ] **Step 3: Render a back-view sheet to verify**

Temporarily point the renderer at the back views by adding a second output. At the bottom of the file, just before the existing `canvas,CW,CH=build(); write_png('__cute_preview.png',...)`, add a helper that renders backs (reuse `render_cells` + the compositing in `build`, but build grids from `make_back`/`make_body_back`). The simplest approach: duplicate `build()` as `build_back()` swapping `make_head(opt)`→`make_back(opt)` and `make_body(outfit,hairstyle)`→`make_body_back(outfit,hairstyle)`, then:

```python
cb,cbw,cbh=build_back(); write_png('__back_preview.png',cb,cbw,cbh)
print('wrote __back_preview.png')
```

Run `python py\gen_sprites.py`, then Read `__back_preview.png`. Confirm: six backs-of-heads with the correct hair silhouettes (short/long/wild/etc.), crown on Jamesmie, beret on Writer, headphone band on Coder, hood/scarf bumps, long-hair drape on Reader — and **no faces**.

- [ ] **Step 4: Commit**

```powershell
git add py/gen_sprites.py
git commit -m "feat: add back (up-facing) view generation to gen_sprites"
```

---

## Task 3: Split head+torso from legs and assemble uniform frames

The runtime combines a static head+torso grid with swappable leg frames (`[...CHAR_BD, ...LEGS_*]`). The generator must emit the same shape: per-character `*_BD`/`*_BU` (head+torso) plus shared cute leg frames, and **every assembled frame must be the same height and 36 wide**.

**Files:**
- Modify: `py/gen_sprites.py`

- [ ] **Step 1: Define the three shared cute leg frames**

The current `make_body` returns 13 rows (rows 0–8 torso, rows 9–12 legs). Split them: head+torso = head(26) + torso(9) = 35 rows; legs = 4 rows. Add near the top of the file:

```python
LEGS_CUTE = {
 'stand':['............llll...llll.............','............llll...llll.............',
          '............zzzz...zzzz.............','............zzzzz.zzzzz.............'],
 'walk1':['.............lllll..ll..............','.............lllll..ll..............',
          '.............zzzzz..zz..............','..............zzzz.zzz..............'],
 'walk2':['.............ll..lllll..............','.............ll..lllll..............',
          '.............zz..zzzzz..............','..............zzz.zzzz..............'],
}
```

- [ ] **Step 2: Make `make_body`/`make_body_back` return torso-only (9 rows)**

In both functions, delete the four leg lines (`g[9]=...` through `g[12]=...`) and change the grid height from 13 to 9 (`for _ in range(9)`), and drop the `if hairstyle=='long'` drape rows that referenced rows ≥6 of the 13-row body — re-add the drape onto the 9-row torso using the same column sets but `range(0,9)`/`range(0,5)` over the 9 rows (the drape already fits 0–8). Result: each returns exactly 9 rows.

- [ ] **Step 3: Add an `assemble()` that builds full frames and asserts uniform size**

Add:

```python
def assemble(name, opt, outfit, hairstyle):
    """Return dict: {'BD':rows, 'BU':rows, 'legs ok'} as joined 36-wide strings (head+torso, 35 rows)."""
    bd=[''.join(r) for r in make_head(opt)+make_body(outfit,hairstyle)]
    bu=[''.join(r) for r in make_back(opt)+make_body_back(outfit,hairstyle)]
    for tag,grid in (('BD',bd),('BU',bu)):
        if not validate(grid, f'{name}.{tag}'): raise SystemExit('grid errors')
        assert len(grid)==35, f'{name}.{tag} height {len(grid)} != 35'
    return bd,bu

def all_frames_uniform():
    """Assert every assembled full frame (head+torso+each leg variant) is 39x36."""
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        bd,bu=assemble(name,opt,outfit,hairstyle)
        for top in (bd,bu):
            for lk in ('stand','walk1','walk2'):
                full=top+LEGS_CUTE[lk]
                assert len(full)==39, f'{name} {lk} height {len(full)}'
                for i,row in enumerate(full):
                    assert len(row)==36, f'{name} {lk} r{i} width {len(row)}'
    print('all frames uniform: 39x36')
```

- [ ] **Step 4: Run the uniformity check**

Add `all_frames_uniform()` near the bottom (before the PNG writes) and run:
```powershell
python py\gen_sprites.py
```
Expected: prints `all frames uniform: 39x36`. Fix any assertion failure before continuing.

- [ ] **Step 5: Commit**

```powershell
git add py/gen_sprites.py
git commit -m "feat: split torso/legs and assert uniform 39x36 frames in gen_sprites"
```

---

## Task 4: Add `--emit` mode that prints the JS sprite block

**Files:**
- Modify: `py/gen_sprites.py`

- [ ] **Step 1: Add the emitter**

Add:

```python
def js_array(name, rows):
    body=',\n'.join("  '"+r+"'" for r in rows)
    return f'const {name} = [\n{body}\n];\n'

def emit_js():
    out=[]
    out.append('// ============================================================')
    out.append('// CUTE SPRITES (36-wide, spriteScale 1) — generated by py/gen_sprites.py.')
    out.append('// DO NOT hand-edit; rerun: python py/gen_sprites.py --emit')
    out.append('// ============================================================')
    for lk,const in (('stand','LEGS_CUTE_STAND'),('walk1','LEGS_CUTE_WALK1'),('walk2','LEGS_CUTE_WALK2')):
        out.append(js_array(const, LEGS_CUTE[lk]))
    sprites=[]
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        u=name.upper()
        a,b=assemble(name,opt,outfit,hairstyle)
        out.append(js_array(f'{u}_BD', a))
        out.append(js_array(f'{u}_BU', b))
        sprites.append(
            f'const SPRITES_{u}2 = {{\n'
            f'  down: {{ stand: [...{u}_BD, ...LEGS_CUTE_STAND], walk1: [...{u}_BD, ...LEGS_CUTE_WALK1], walk2: [...{u}_BD, ...LEGS_CUTE_WALK2] }},\n'
            f'  up:   {{ stand: [...{u}_BU, ...LEGS_CUTE_STAND], walk1: [...{u}_BU, ...LEGS_CUTE_WALK1], walk2: [...{u}_BU, ...LEGS_CUTE_WALK2] }},\n'
            f'}};\n')
    out.extend(sprites)
    return '\n'.join(out)
```

Note the generated `SPRITES_<U>2` names match the existing constants the agents already reference (`SPRITES_MANAGER2`, etc.), so the agent objects need no change for the sprite wiring.

- [ ] **Step 2: Add a CLI switch**

Wrap the bottom-of-file render calls so `--emit` writes the JS block instead of PNGs:

```python
import sys
if '--emit' in sys.argv:
    all_frames_uniform()
    with open('__sprites_block.js','w',encoding='utf-8') as f:
        f.write(emit_js())
    print('wrote __sprites_block.js')
else:
    all_frames_uniform()
    canvas,CW,CH=build(); write_png('__cute_preview.png',canvas,CW,CH); print('wrote __cute_preview.png')
    cb,cbw,cbh=build_back(); write_png('__back_preview.png',cb,cbw,cbh); print('wrote __back_preview.png')
```

- [ ] **Step 3: Emit and eyeball the JS block**

Run:
```powershell
python py\gen_sprites.py --emit
```
Expected: `wrote __sprites_block.js`. Read the first ~40 lines of `__sprites_block.js`: confirm `LEGS_CUTE_STAND`/`WALK1`/`WALK2`, then `JAMESMIE_BD`/`JAMESMIE_BU` etc., then six `SPRITES_<U>2` objects. Every grid row is a 36-char quoted string.

- [ ] **Step 4: Commit**

```powershell
git add py/gen_sprites.py
git commit -m "feat: add --emit mode to gen_sprites (JS sprite block)"
```

---

## Task 5: Add `skinColor`, the expanded color map, and the memoized depth pass to `drawSprite`

This makes the new color keys (`L/D/p/P/q/Q/r/R`) resolve and applies the Medium directional shading + rim + hair specular + outline. Do this **before** swapping the grids (Task 8) so the new keys never render as magenta.

**Files:**
- Modify: `js/app.js` (`shadeHex` is at 974–980; `drawSprite` at 982–1027)

- [ ] **Step 1: Add a `blendHex` helper and shading constants**

Immediately after `shadeHex` (after line 980) insert:

```javascript
// Linear blend from hex toward target hex by t in [0,1] (used for hair specular).
const blendHex = (hex, target, t) => {
  const a = parseInt(hex.slice(1), 16), b = parseInt(target.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
};

// Depth-shading knobs (spec §5, "Medium").
const SHADE_HI = 1.18, SHADE_LO = 0.66, SHADE_SPEC = 0.55;
const OUTLINE_COLOR = '#0a0a16';
const FORM_KEYS = new Set(['s', 'h', 'H', 'b', 'B', 'k', 'd', 'D', 'L', 'l', 'z']);
const HAIR_KEYS = new Set(['h', 'H']);
const _depthCache = new Map();   // grid(array ref) -> Map(`${body}|${hair}|${skin}` -> color buffer)
```

- [ ] **Step 2: Add the color-map builder and `depthProcess`**

Right after the constants from Step 1, insert:

```javascript
const buildColorMap = (bodyColor, hairColor, skinColor) => {
  const hair = hairColor || C.hair;
  const skin = skinColor || C.skin;
  return {
    's': skin, 'h': hair, 'b': bodyColor,
    'l': C.leg, 'w': C.white, 'c': C.crown, 'e': '#241405', 'z': C.shoe,
    'd': shadeHex(skin, 0.84), 'D': shadeHex(skin, 0.70), 'L': shadeHex(skin, 1.12),
    'm': '#c47b6a', 'g': '#222222', 'G': '#9aa0a8', 'i': '#f7f7f7',
    'H': shadeHex(hair, 0.72), 'k': shadeHex(bodyColor, 0.66), 'B': shadeHex(bodyColor, 1.28),
    'p': '#5a5e63', 'P': '#c0c4c8', 'q': '#3a3d44', 'Q': '#56595f',
    'r': '#a23b3b', 'R': '#c05a5a',
  };
};

// Build (once per grid+colors, memoized) a rows×cols buffer of CSS colors with the
// Medium directional gradient + edge rim + hair specular + 1px outline baked in.
const depthProcess = (grid, bodyColor, hairColor, skinColor) => {
  let perGrid = _depthCache.get(grid);
  if (!perGrid) { perGrid = new Map(); _depthCache.set(grid, perGrid); }
  const key = `${bodyColor}|${hairColor}|${skinColor}`;
  const hit = perGrid.get(key);
  if (hit) return hit;

  const cmap = buildColorMap(bodyColor, hairColor, skinColor);
  const rows = grid.length, cols = grid[0].length;
  const filled = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && grid[r][c] !== '.';
  const buf = Array.from({ length: rows }, () => new Array(cols).fill(null));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ch = grid[r][c];
      if (ch === '.') continue;
      let col = cmap[ch] || '#ff00ff';
      if (FORM_KEYS.has(ch)) {
        const t = ((c / (cols - 1)) + (r / (rows - 1))) / 2;
        let f = SHADE_HI + (SHADE_LO - SHADE_HI) * t;
        if (!filled(r + 1, c) || !filled(r, c + 1)) f *= 0.80;
        else if (!filled(r - 1, c) || !filled(r, c - 1)) f *= 1.10;
        col = shadeHex(col, f);
      }
      if (HAIR_KEYS.has(ch) && r < rows * 0.32 && c > cols * 0.18 && c < cols * 0.58 && !filled(r - 1, c)) {
        col = blendHex(col, '#ffffff', SHADE_SPEC);
      }
      buf[r][c] = col;
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== '.') continue;
      let touch = false;
      for (let dr = -1; dr <= 1 && !touch; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if ((dr || dc) && filled(r + dr, c + dc)) { touch = true; break; }
        }
      }
      if (touch) buf[r][c] = OUTLINE_COLOR;
    }
  }
  perGrid.set(key, buf);
  return buf;
};
```

- [ ] **Step 3: Rewrite `drawSprite` to take `skinColor` and blit the processed buffer**

Replace the entire current `drawSprite` (lines 982–1027) with:

```javascript
const drawSprite = (grid, cx, cy, bodyColor, facingLeft = false, hairColor = null, skinColor = null, scale = S) => {
  const buf = depthProcess(grid, bodyColor, hairColor, skinColor);
  const rows = grid.length, cols = grid[0].length;
  const sprW = cols * scale;
  const px = i => Math.round(i * scale);
  ctx.save();
  if (facingLeft) { ctx.translate(cx + sprW, cy); ctx.scale(-1, 1); }
  else { ctx.translate(cx, cy); }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const col = buf[r][c];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(px(c), px(r), px(c + 1) - px(c), px(r + 1) - px(r));
    }
  }
  ctx.restore();
};
```

- [ ] **Step 4: Verify the page still renders (old grids, new shading)**

The single caller (line ~1830) still passes 7 args (no `skinColor`); JS fills the new param with `undefined` → `null` default, so it stays valid. Start the server and load the page:

```powershell
.\start.ps1
```
Open `http://localhost:8765/office.html`. Expected: page renders (no blank canvas, no console errors); the existing characters now show subtle directional shading + a dark outline. `Ctrl+C` to stop.

- [ ] **Step 5: Commit**

```powershell
git add js/app.js
git commit -m "feat: add skinColor param + memoized depth/skin shading to drawSprite"
```

---

## Task 6: Pass `skinColor` and draw a contact shadow in `drawAgent`

**Files:**
- Modify: `js/app.js` (`drawAgent`, around lines 1819–1830)

- [ ] **Step 1: Draw the contact-shadow ellipse before the sprite**

`drawAgent` computes `sprW` at line ~1820 and `seated` at line ~1799, and calls `drawSprite` at line ~1830. Insert this block immediately **before** the `drawSprite(...)` call:

```javascript
  // Floor contact shadow grounds the character (skip when seated — feet are under the desk).
  if (!seated) {
    const shW = sprW * 0.30;
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, shW);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(agent.pos.x, agent.pos.y);
    ctx.scale(1, 0.34);          // flatten into an oval
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, shW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
```

- [ ] **Step 2: Pass `skinColor` to `drawSprite`**

Change the `drawSprite` call (line ~1830) from:

```javascript
  drawSprite(grid, x, y - bob, agent.color, agent.facingLeft, agent.hairColor, sc);
```
to:
```javascript
  drawSprite(grid, x, y - bob, agent.color, agent.facingLeft, agent.hairColor, agent.skinColor, sc);
```

- [ ] **Step 3: Verify in the browser**

`.\start.ps1`, open the page. Expected: each non-seated character now has a soft dark oval under its feet; seated agents at desks have none. No console errors. `Ctrl+C`.

- [ ] **Step 4: Commit**

```powershell
git add js/app.js
git commit -m "feat: draw floor contact shadow + pass skinColor in drawAgent"
```

---

## Task 7: Add per-agent `skinColor`

**Files:**
- Modify: `js/app.js` (agent objects, lines 1508–1579)

- [ ] **Step 1: Add `skinColor` to each of the six agents**

On each agent's `hairColor:` line, append `skinColor` with the spec §3 value:

- `manager` (line 1510): `hairColor: '#1a1a2e', skinColor: '#c68642', sprites: ...`
- `jamesmie` (1522): `hairColor: '#1a0a00', skinColor: '#f5d5a0', sprites: ...`
- `reader` (1534): `hairColor: '#8b4513', skinColor: '#ffe0bd', sprites: ...`
- `coder` (1546): `hairColor: '#1a237e', skinColor: '#8d5524', sprites: ...`
- `searcher` (1558): `hairColor: '#6b0f1a', skinColor: '#e0ac69', sprites: ...`
- `writer` (1570): `hairColor: '#0f3a35', skinColor: '#d9b38c', sprites: ...`

- [ ] **Step 2: Verify**

`.\start.ps1`, open the page. Expected: characters render with their distinct skin tones in the shading (still the *old* sprite shapes until Task 8). No console errors. `Ctrl+C`.

- [ ] **Step 3: Commit**

```powershell
git add js/app.js
git commit -m "feat: give each agent a distinct skinColor"
```

---

## Task 8: Splice the generated cute sprites into `js/app.js`

**Files:**
- Modify: `js/app.js` (replace the sprite-data block, lines ~1035–1502)

- [ ] **Step 1: Regenerate the JS block**

```powershell
python py\gen_sprites.py --emit
```
Confirms `wrote __sprites_block.js` and (via `all_frames_uniform()`) that every frame is 39×36.

- [ ] **Step 2: Replace the old sprite-data block**

In `js/app.js`, delete from `const LEGS_B_STAND = [` (line ~1035) through the closing `};` of `SPRITES_WRITER2` (line ~1502) — i.e. the old `LEGS_B_*`, all twelve `*_BD`/`*_BU` grids, and all six `SPRITES_*2` objects. Paste the entire contents of `__sprites_block.js` in their place. The agent objects already reference `SPRITES_MANAGER2`…`SPRITES_WRITER2`, which the emitted block redefines, so no other wiring changes.

Keep the preceding `CHIBI XL SPRITES` comment line or let the generated header replace it — ensure no duplicate/parallel `const` of the same name remains (a duplicate `const` is a `SyntaxError` that blanks the page, CLAUDE.md §5).

- [ ] **Step 3: Verify the full restyle in the browser**

`.\start.ps1`, open `http://localhost:8765/office.html`. Confirm against the spec:
- Page renders — **no blank canvas**, no console `SyntaxError`/`ReferenceError`.
- All six agents are the cute round-faced big-eyed style and are **visually distinct** (Jamesmie crown, Manager glasses+mustache+tie, Reader long hair+round glasses+freckles+cardigan, Coder headphones+hoodie+spiky, Searcher wild hair+jacket, Writer beret+scarf).
- Each has its distinct skin tone + 4-tone skin ramp + outline + soft top-left lighting + floor contact shadow.
- Walk an agent (trigger a tool) — the leg walk-cycle still plays; seated agents at desks show the back (up) view with no contact shadow.

`Ctrl+C`. If anything is wrong, fix the generator and re-emit/re-splice (do not hand-edit the pasted grids).

- [ ] **Step 4: Commit**

```powershell
git add js/app.js
git commit -m "feat: restyle all six agents as cute round-faced sprites"
```

---

## Task 9: Clean up temp artifacts and final verification

**Files:**
- Delete: `__cute_preview.py`, `__cute_preview.png`, `__depth_preview.py`, `__depth_preview.png`, `__faces_preview.py`, `__faces_preview.png`, `__back_preview.png`, `__sprites_block.js`

- [ ] **Step 1: Confirm no committed file references the temp artifacts**

Run:
```powershell
Select-String -Path js\app.js,py\gen_sprites.py -Pattern '__cute_preview|__sprites_block|__back_preview' -SimpleMatch
```
Expected: no matches (the runtime and the committed generator must not depend on `__*` files).

- [ ] **Step 2: Delete the throwaway artifacts (CLAUDE.md §7/§10)**

```powershell
Remove-Item -Force __cute_preview.py,__cute_preview.png,__depth_preview.py,__depth_preview.png,__faces_preview.py,__faces_preview.png,__back_preview.png,__sprites_block.js -ErrorAction SilentlyContinue
Get-ChildItem -Filter "__*" | Select-Object -ExpandProperty Name   # expect: nothing
```

- [ ] **Step 3: Final browser check + confirm clean tree**

`.\start.ps1`, open the page one last time — full restyle renders correctly, no console errors. `Ctrl+C`. Then:
```powershell
git status   # expect only intended changes; no __* files staged or present
```

- [ ] **Step 4: Commit**

```powershell
git add -A
git commit -m "chore: remove throwaway sprite-preview artifacts"
```

- [ ] **Step 5: Update the checklist in CLAUDE.md §10 reality (optional, only if asked)**

No code change required. The roster did not change, so `TOOL_TO_AGENT` (py) and the `agents` object (js) remain in sync (CLAUDE.md §4/§10). Mention to the user that `py/gen_sprites.py` is now the source of truth for sprites.

---

## Self-Review

**Spec coverage:**
- §3 look sheet (6 distinct: skin/hair/outfit/face) → Tasks 1–3 (generator) + 8 (integration); skin tones in Task 7.
- §4 round head + Python generator with 36-width/char validation → Tasks 1–4 (validation in `validate()`/`all_frames_uniform()`).
- §5 `skinColor` param + color keys + 4-tone skin ramp + Medium directional pass + rim + specular + outline + memoization → Task 5.
- §6 contact shadow, skipped when seated → Task 6.
- §7 leg-only animation unchanged; back (up) views → Task 2 (backs); legs in Task 3; `SPRITES_*2` keep `stand/walk1/walk2` in Task 4.
- §8 data flow unchanged → no task touches hooks/polling (confirmed).
- §9 page-blanking risk → generator asserts + Task 8 duplicate-`const` warning; performance via memoization (Task 5).
- §10 verification → browser checks in Tasks 5/6/7/8/9; `__*` cleanup in Task 9.

No spec requirement is left without a task.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. Task 9 Step 5 is explicitly optional and requires no code.

**Type/name consistency:** `depthProcess`, `buildColorMap`, `blendHex`, `_depthCache`, `FORM_KEYS`, `HAIR_KEYS`, `SHADE_HI/LO/SPEC`, `OUTLINE_COLOR` are defined in Task 5 and used consistently; `drawSprite`'s new `skinColor` param (Task 5) matches the updated call site (Task 6). Generated `SPRITES_<U>2` / `*_BD` / `*_BU` / `LEGS_CUTE_*` names (Task 4) match the splice target (Task 8) and the agents' existing `sprites:` references. Skin-ramp factors (0.84/0.70/1.12) and Medium knobs (1.18/0.66/0.80/1.10/0.55) match between the generator and `drawSprite`.
