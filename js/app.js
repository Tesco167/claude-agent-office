// ============================================================
// CONSTANTS
// ============================================================
const W = 900, H = 560;
const S = 3; // pixel art scale: 1 unit = S canvas px

const canvas = $('#office')[0];
const ctx    = canvas.getContext('2d');

const DPR = window.devicePixelRatio || 1;
// Canvas is sized after HEADER_H is known (see ROOM LAYOUT) — the header strip is
// cropped off the top, so the drawable height is H - HEADER_H.

// ============================================================
// COLORS
// ============================================================
const C = {
  headerBg:     '#0d0d1a',
  wallOuter:    '#1a1a2e',
  wallHighlight:'#3d3d5c',
  bossFloor:    '#2a1f3d',
  devFloor:     '#1e2a2e',
  opsFloor:     '#1a2218',
  loungeFloor:  '#2e2415',
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
  brand:        '#C41230',
  gold:         '#ffd700',
  amber:        '#d97706',
  purple:       '#7c3aed',
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
  writerTeal:   '#14b8a6',
  managerIndigo:'#6366f1',
};

// ============================================================
// ROOM LAYOUT
// ============================================================
const HEADER_H = 40;
const ROOM_W = 450;
const ROOM_H = 260;

// Header removed: crop its strip from the canvas. World coordinates keep the
// HEADER_H offset (rooms live at y≥HEADER_H); draw() shifts everything up by
// HEADER_H so the rooms fill the top. Set size BEFORE scale — resizing a canvas
// resets its 2D transform.
const VIEW_H = H - HEADER_H;
canvas.width  = W * DPR;
canvas.height = VIEW_H * DPR;
canvas.style.width  = W + 'px';
canvas.style.height = VIEW_H + 'px';
ctx.scale(DPR, DPR);

const ROOMS = {
  boss:   { x: 0,      y: HEADER_H,           w: ROOM_W, h: ROOM_H, floor: C.bossFloor,   label: 'BOSS ROOM' },
  dev:    { x: ROOM_W, y: HEADER_H,           w: ROOM_W, h: ROOM_H, floor: C.devFloor,    label: 'DEV ROOM' },
  ops:    { x: 0,      y: HEADER_H + ROOM_H,  w: ROOM_W, h: ROOM_H, floor: C.opsFloor,    label: 'OPS ROOM' },
  lounge: { x: ROOM_W, y: HEADER_H + ROOM_H,  w: ROOM_W, h: ROOM_H, floor: C.loungeFloor, label: 'LOUNGE' },
};
const WALL = 8;
const DOOR_W = 28;

const WORK_POS = {
  jamesmie: { x: 100, y: 165 },  // in front of boss desk (desk front at y=155)
  reader:   { x: 535, y: 158 },  // in front of reader desk (desk front at y=150)
  coder:    { x: 130, y: 410 },  // in front of ops desk (Editor, shifted right)
  searcher: { x: 700, y: 158 },  // in front of dev (mid) desk (swapped with Coder)
};
// "In-chair" point behind each desk: agent walks here to sit and work.
// "In-chair" point — centered on each desk's MONITOR so agent, chair, and
// screen line up. Agent faces up (back to viewer) here, overlapping the screen.
const SIT_POS = {
  manager:  { x: 315, y: 138 },  // monitor 297..333 (top-wall workstation, desk 90..140)
  jamesmie: { x: 74,  y: 150 },  // monitor 57..91
  reader:   { x: 510, y: 148 },  // monitor 492..528
  coder:    { x: 115, y: 400 },  // ops desk (Editor, shifted right) — monitor 97..133
  searcher: { x: 680, y: 148 },  // dev mid desk (swapped with Coder) — monitor 662..698
  writer:   { x: 803, y: 148 },  // monitor 785..821
};

// After finishing work, agents stay seated this long before wandering off —
// prevents pacing back and forth when tool calls arrive in bursts.
const DESK_LINGER_MS = 300000;  // 5 minutes
const QUEUE_SPOTS = {
  coffee: [
    { x: 855, y: 355 },  // slot 0 — at the machine (brewing)
    { x: 855, y: 385 },  // slot 1 — first in line
    { x: 855, y: 415 },  // slot 2 — second in line
  ],
  sofa: [
    { x: 645, y: 442 },  // slot 0 — left seat (centered sofa)
    { x: 705, y: 442 },  // slot 1 — right seat
  ],
};
const queues = { coffee: [], sofa: [] };  // arrays of agent keys; index = slot

const joinQueue = (name, key) => {
  const q = queues[name];
  if (q.includes(key)) return q.indexOf(key);
  if (q.length >= QUEUE_SPOTS[name].length) return -1;  // full
  q.push(key);
  return q.length - 1;
};

const leaveQueue = (name, key) => {
  const q = queues[name];
  const i = q.indexOf(key);
  if (i !== -1) q.splice(i, 1);  // everyone behind shifts forward by index
};

const leaveAllQueues = (key) => {
  leaveQueue('coffee', key);
  leaveQueue('sofa', key);
};

const queueSlotPos = (name, key) => {
  const i = queues[name].indexOf(key);
  return i === -1 ? null : QUEUE_SPOTS[name][i];
};
const WALK = { x: 15, y: 55, maxX: 885, maxY: 545 };

// Floor-standing furniture agents must walk AROUND. Boxes mirror the exact
// positions drawn in drawAllFurniture(). Excluded on purpose: wall-mounted
// decor (whiteboards, TVs, wall monitor panels, top-wall bookshelf), flat rugs,
// and chairs (agents need to walk onto their chair to sit).
const NAV_OBSTACLES = [
  // ── BOSS ──
  { x: 260, y: 52,  w: 120, h: 20 },   // bookshelf (top wall ledge)
  { x: 25,  y: 100, w: 150, h: 55 },   // Jamesmie / boss desk
  { x: 410, y: 52,  w: 20,  h: 20 },   // corner plant
  { x: 30,  y: 235, w: 90,  h: 30 },   // guest sofa
  { x: 50,  y: 272, w: 50,  h: 18 },   // coffee table
  { x: 195, y: 135, w: 30,  h: 60 },   // cabinet
  { x: 250, y: 90,  w: 130, h: 50 },   // manager desk (top wall)
  // ── DEV ──
  { x: 480, y: 100, w: 95,  h: 50 },   // reader desk
  { x: 650, y: 100, w: 95,  h: 50 },   // dev mid desk (Searcher, swapped)
  { x: 773, y: 100, w: 95,  h: 50 },   // writer desk
  { x: 855, y: 58,  w: 28,  h: 55 },   // server rack
  { x: 858, y: 260, w: 26,  h: 30 },   // fridge
  { x: 480, y: 260, w: 48,  h: 24 },   // crates
  // ── OPS ──
  { x: 85,  y: 355, w: 95,  h: 50 },   // ops desk (Editor, shifted right)
  { x: 405, y: 318, w: 28,  h: 120 },  // server racks (stacked)
  // ── LOUNGE ──
  { x: 615, y: 400, w: 120, h: 38 },   // sofa
  { x: 648, y: 450, w: 55,  h: 30 },   // coffee table
  { x: 855, y: 318, w: 28,  h: 28 },   // coffee machine
  { x: 464, y: 360, w: 24,  h: 110 },  // bookshelf
  { x: 466, y: 316, w: 20,  h: 20 },   // plant
  // ── added décor (mirror drawAllFurniture; flat rugs excluded) ──
  // boss
  { x: 405, y: 262, w: 20,  h: 20 },   // corner plant
  { x: 150, y: 262, w: 24,  h: 24 },   // crate
  { x: 180, y: 268, w: 18,  h: 18 },   // crate
  // dev
  { x: 458, y: 196, w: 28,  h: 52 },   // filing cabinet
  { x: 820, y: 178, w: 20,  h: 20 },   // plant
  // ops
  { x: 40,  y: 330, w: 30,  h: 58 },   // cabinet
  { x: 20,  y: 488, w: 28,  h: 55 },   // server bank (bottom-left)
  { x: 51,  y: 488, w: 28,  h: 55 },   // server bank
  { x: 82,  y: 488, w: 28,  h: 55 },   // server bank
  { x: 360, y: 320, w: 20,  h: 20 },   // plant
  // lounge
  { x: 512, y: 320, w: 20,  h: 20 },   // plant
  { x: 560, y: 520, w: 20,  h: 20 },   // plant
];

const isInsideObstacle = (x, y, pad = 10) => {
  return NAV_OBSTACLES.some(o =>
    x >= o.x - pad && x <= o.x + o.w + pad &&
    y >= o.y - pad && y <= o.y + o.h + pad
  );
};

const pathBlocked = (x1, y1, x2, y2, steps = 8) => {
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isInsideObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 8)) return true;
  }
  return false;
};

// ============================================================
// NAV GRID + PATHFINDING
// Agents route around furniture on a coarse walkable grid (BFS), then the path
// is simplified to a few line-of-sight waypoints. This keeps them inside the
// open corridors instead of clipping through desks/sofas on long trips.
// ============================================================
const NAV_CELL = 10;          // grid resolution (px)
const NAV_PAD  = 7;           // keep cell centers this clear of furniture
let NAV_W = 0, NAV_H = 0, NAV_GRID = null;

const navBuild = () => {
  NAV_W = Math.ceil(W / NAV_CELL);
  NAV_H = Math.ceil(H / NAV_CELL);
  NAV_GRID = new Uint8Array(NAV_W * NAV_H);
  for (let r = 0; r < NAV_H; r++) {
    for (let c = 0; c < NAV_W; c++) {
      const x = c * NAV_CELL + NAV_CELL / 2;
      const y = r * NAV_CELL + NAV_CELL / 2;
      const ok = x >= WALK.x && x <= WALK.maxX && y >= WALK.y && y <= WALK.maxY &&
                 !isInsideObstacle(x, y, NAV_PAD);
      NAV_GRID[r * NAV_W + c] = ok ? 1 : 0;
    }
  }
};
const navWalkable = (c, r) => {
  return c >= 0 && r >= 0 && c < NAV_W && r < NAV_H && NAV_GRID[r * NAV_W + c] === 1;
};
const navNearest = (c, r) => {     // closest walkable cell to a (possibly blocked) cell
  if (navWalkable(c, r)) return [c, r];
  for (let rad = 1; rad < 40; rad++) {
    for (let dc = -rad; dc <= rad; dc++) {
      for (let dr = -rad; dr <= rad; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
        if (navWalkable(c + dc, r + dr)) return [c + dc, r + dr];
      }
    }
  }
  return [c, r];
};
const NAV_DIRS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const navLOS = (a, b) => {         // straight line clear of furniture?
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isInsideObstacle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, NAV_PAD)) return false;
  }
  return true;
};
const navSimplify = (pts) => {     // string-pull: keep only line-of-sight corners
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !navLOS(pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
};
const navPath = (from, to) => {
  if (!NAV_GRID) navBuild();
  const [sc, sr] = navNearest(Math.floor(from.x / NAV_CELL), Math.floor(from.y / NAV_CELL));
  const [gc, gr] = navNearest(Math.floor(to.x / NAV_CELL),   Math.floor(to.y / NAV_CELL));
  const start = sr * NAV_W + sc, goal = gr * NAV_W + gc;
  const prev = new Int32Array(NAV_W * NAV_H).fill(-1);
  const seen = new Uint8Array(NAV_W * NAV_H);
  const q = [start]; seen[start] = 1; let head = 0, found = false;
  while (head < q.length) {
    const cur = q[head++];
    if (cur === goal) { found = true; break; }
    const cc = cur % NAV_W, cr = (cur / NAV_W) | 0;
    for (const [dc, dr] of NAV_DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (!navWalkable(nc, nr)) continue;
      if (dc && dr && (!navWalkable(cc + dc, cr) || !navWalkable(cc, cr + dr))) continue; // no corner cut
      const ni = nr * NAV_W + nc;
      if (seen[ni]) continue;
      seen[ni] = 1; prev[ni] = cur; q.push(ni);
    }
  }
  if (!found) return null;
  const cells = [];
  for (let cur = goal; cur !== -1; cur = prev[cur]) cells.push(cur);
  cells.reverse();
  const pts = cells.map(i => ({
    x: (i % NAV_W) * NAV_CELL + NAV_CELL / 2,
    y: ((i / NAV_W) | 0) * NAV_CELL + NAV_CELL / 2,
  }));
  return navSimplify(pts);
};

const getWaypoint = (from, to) => {
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
};

// ============================================================
// DRAW HELPERS
// ============================================================
const rect = (x, y, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

const glow = (x, y, r, color) => {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
};

// Cinematic bloom for an emissive surface (screen, lamp, sign): a soft wide
// halo (normal blend) plus a brighter additive core, so light feels like it
// spills out and lifts the surrounding pixels instead of sitting flat.
const bloom = (x, y, r, color, strength = 1) => {
  ctx.save();
  ctx.globalAlpha = 0.55 * strength;
  glow(x, y, r, color);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5 * strength;
  glow(x, y, r * 0.5, color);
  ctx.restore();
};

// Small additive point-light for LEDs / status indicators (one cheap fill).
// Color should carry its own alpha (e.g. 'rgba(34,197,94,0.9)').
const spark = (x, y, r, color) => {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(x, y, r, color);
  ctx.restore();
};

const drawText = (str, x, y, opts = {}) => {
  ctx.save();
  ctx.font = `${opts.weight || 'normal'} ${opts.size || 13}px ${"'Leelawadee UI','Tahoma',sans-serif"}`;
  ctx.fillStyle = opts.color || C.white;
  ctx.textAlign = opts.align || 'center';
  ctx.textBaseline = opts.baseline || 'middle';
  if (opts.shadow) {
    ctx.shadowColor = opts.shadow;
    ctx.shadowBlur = opts.shadowBlur || 8;
  }
  ctx.fillText(str, x, y);
  ctx.restore();
};

// grounded contact shadow under an object — soft penumbra + darker core, offset down-right
// (opposite the top-left key light) so pieces sit on the floor instead of floating.
const shadow = (x, y, w, h) => {
  ctx.save();
  rect(x + 3, y + 6, w, h, 'rgba(0,0,0,0.36)');
  rect(x + 4, y + 7, w - 2, h - 2, 'rgba(0,0,0,0.42)');
  ctx.restore();
};

// faux-3D bevel: light top/left edge, dark bottom/right edge.
const bevel = (x, y, w, h, light = 'rgba(255,255,255,0.22)', dark = 'rgba(0,0,0,0.46)') => {
  rect(x, y, w, 2, light);
  rect(x, y, 2, h, light);
  rect(x, y + h - 2, w, 2, dark);
  rect(x + w - 2, y, 2, h, dark);
};

// Executive boss desk (Jamesmie) — richer than the plain top-down desk: green
// leather pad, gold trim/nameplate w/ crown, document tray, desk lamp, monitor.
// Monitor screen CONTENT (code lines) + keyboard + mug are layered on later by
// drawDetails(); this draws the furniture + accessories beneath them.
const drawBossDesk = (x, y, w, h) => {
  const base = '#4a3322';
  shadow(x, y, w, h);
  rect(x, y, w, h, base);
  rect(x, y, w, Math.round(h / 2), shadeHex(base, 1.12));        // top-down sheen
  for (let i = 1; i < 5; i++) rect(x + 8, y + Math.round(i * h / 5), w - 16, 1, 'rgba(0,0,0,0.10)');
  rect(x + 6, y + 4, w - 12, 1, 'rgba(255,255,255,0.06)');
  // amber edge + corner brackets (classy, not a neon border)
  rect(x, y, w, 2, 'rgba(212,160,23,0.85)');
  rect(x, y + h - 2, w, 2, 'rgba(0,0,0,0.35)');
  rect(x, y, 10, 2, '#d4a017');         rect(x, y, 2, 8, '#b5891a');
  rect(x + w - 10, y, 10, 2, '#d4a017'); rect(x + w - 2, y, 2, 8, '#b5891a');
  rect(x, y, 2, h, 'rgba(0,0,0,0.18)');  rect(x + w - 2, y, 2, h, 'rgba(0,0,0,0.28)');
  // green leather desk pad (distinct from the dark monitor)
  const bx = x + 21, by = y + 6, bw = 60, bh = 44;
  rect(bx, by, bw, bh, '#16261c'); rect(bx + 2, by + 2, bw - 4, bh - 4, '#1d3326');
  rect(bx + 1, by + 1, 2, 2, '#caa106');      rect(bx + bw - 3, by + 1, 2, 2, '#caa106');
  rect(bx + 1, by + bh - 3, 2, 2, '#caa106'); rect(bx + bw - 3, by + bh - 3, 2, 2, '#caa106');
  rect(bx + 2, by + 2, bw - 4, 1, 'rgba(255,255,255,0.05)');
  // monitor bezel (screen content added by drawDetails)
  rect(x + 28, y + 5, 40, 28, '#0c0c12'); rect(x + 30, y + 7, 36, 24, '#0f2035');
  rect(x + 30, y + 7, 36, 1, 'rgba(255,255,255,0.10)');
  rect(x + 45, y + 33, 8, 4, '#3a3a44'); rect(x + 41, y + 37, 16, 2, '#2a2a33');
  // gold pen on the pad
  rect(x + 33, y + 46, 26, 2, '#caa106'); rect(x + 33, y + 46, 4, 2, '#888');
  // document tray + papers (top-right)
  rect(x + 91, y + 6, 30, 24, '#2a2a33'); rect(x + 93, y + 4, 26, 18, '#e8e0cc');
  for (let i = 0; i < 3; i++) rect(x + 96, y + 7 + i * 4, 18, 1, 'rgba(60,60,80,0.45)');
  rect(x + 93, y + 23, 26, 5, '#cfc7b0');
  // desk lamp + warm pool (top-right corner)
  bloom(x + 133, y + 14, 30, 'rgba(255,205,120,0.95)', 1.0);
  rect(x + 127, y + 6, 4, 16, '#2a2a2a'); rect(x + 125, y + 21, 8, 4, '#1a1a1a');
  rect(x + 126, y + 4, 12, 5, '#3a3a3a'); rect(x + 128, y + 8, 8, 2, '#ffe6a0');
  // nameplate (front-center): gold plate, engraving, crown
  const nx = x + 77, ny = y + 40, nw = 56, nh = 10;
  rect(nx, ny, nw, nh, '#8a6d10'); rect(nx + 1, ny + 1, nw - 2, nh - 2, '#e8c33a');
  rect(nx + 1, ny + 1, nw - 2, 1, 'rgba(255,255,255,0.5)');
  rect(nx + 13, ny + 3, nw - 17, 4, '#4a3a08');
  for (let tx = nx + 15; tx < nx + nw - 5; tx += 4) rect(tx, ny + 4, 2, 2, '#caa106');
  const cwx = nx + 3;
  rect(cwx, ny + 4, 8, 4, '#ffd700');
  rect(cwx, ny + 2, 2, 2, '#ffd700'); rect(cwx + 3, ny + 2, 2, 2, '#ffd700'); rect(cwx + 6, ny + 2, 2, 2, '#ffd700');
};

// Manager workstation desk — as detailed as the boss desk but a distinct cool
// "ops manager" theme: graphite surface, brushed-steel trim, indigo felt pad,
// a desk planner/calendar (he assigns the team), pen cup, a COOL blue task lamp,
// and a silver nameplate with an indigo badge (no crown — he's not the boss).
// Monitor screen CONTENT + keyboard + mug are layered on by drawDetails().
const drawManagerDesk = (x, y, w, h) => {
  const base = '#2c2940';                 // cool graphite (vs boss warm walnut)
  shadow(x, y, w, h);
  rect(x, y, w, h, base);
  rect(x, y, w, Math.round(h / 2), shadeHex(base, 1.14));       // top-down sheen
  for (let i = 1; i < 5; i++) rect(x + 8, y + Math.round(i * h / 5), w - 16, 1, 'rgba(0,0,0,0.10)');
  rect(x + 6, y + 4, w - 12, 1, 'rgba(255,255,255,0.05)');
  // brushed-steel edge + corner brackets (cool silver, vs boss gold)
  rect(x, y, w, 2, 'rgba(174,182,204,0.85)');
  rect(x, y + h - 2, w, 2, 'rgba(0,0,0,0.35)');
  rect(x, y, 10, 2, '#c4ccde');          rect(x, y, 2, 8, '#8088a0');
  rect(x + w - 10, y, 10, 2, '#c4ccde'); rect(x + w - 2, y, 2, 8, '#8088a0');
  rect(x, y, 2, h, 'rgba(0,0,0,0.18)');  rect(x + w - 2, y, 2, h, 'rgba(0,0,0,0.28)');
  // indigo felt desk pad (distinct from boss green leather) + silver studs
  const bx = x + 42, by = y + 6, bw = 48, bh = 42;
  rect(bx, by, bw, bh, '#1d1d36'); rect(bx + 2, by + 2, bw - 4, bh - 4, '#2a2a52');
  rect(bx + 2, by + 2, bw - 4, 1, 'rgba(255,255,255,0.05)');
  for (const sx of [bx + 1, bx + bw - 3]) for (const sy of [by + 1, by + bh - 3]) rect(sx, sy, 2, 2, '#aeb6cc');
  // monitor bezel (screen content added by drawDetails at 297,99)
  rect(x + 43, y + 5, 44, 30, '#0c0c12');
  rect(x + 45, y + 7, 40, 26, '#16202e');
  rect(x + 47, y + 9, 36, 22, '#0f2035');
  rect(x + 47, y + 9, 36, 1, 'rgba(255,255,255,0.10)');
  rect(x + 61, y + 35, 8, 4, '#3a3a44'); rect(x + 57, y + 39, 16, 2, '#2a2a33');   // stand + foot
  // desk planner / calendar (left) — the Manager organizes the team
  const px = x + 10, py = y + 8, pw = 26, ph = 32;
  rect(px, py, pw, ph, '#15151f'); rect(px + 1, py + 1, pw - 2, ph - 2, '#e9e6f2');
  rect(px + 1, py + 1, pw - 2, 6, C.managerIndigo);                                  // indigo header band
  for (let i = 0; i < 4; i++) rect(px + 3, py + 11 + i * 6, pw - 6, 1, 'rgba(70,70,100,0.45)');
  rect(px + 3, py + 11, 3, 3, '#22c55e'); rect(px + 3, py + 23, 3, 3, '#22c55e');    // done
  rect(px + 3, py + 17, 3, 3, '#e11d48');                                            // pending
  // pen cup with colored pens (right)
  rect(x + 96, y + 12, 11, 12, '#23232f'); rect(x + 96, y + 12, 11, 2, '#34343e');
  rect(x + 98, y + 6, 1, 8, '#e11d48'); rect(x + 101, y + 5, 1, 9, '#3b82f6'); rect(x + 104, y + 7, 1, 7, '#22c55e');
  // desk lamp with a COOL blue pool (right corner) — vs boss warm amber
  bloom(x + 116, y + 16, 26, 'rgba(120,170,255,0.95)', 0.95);
  rect(x + 110, y + 8, 4, 16, '#2a2a32'); rect(x + 108, y + 22, 8, 4, '#1a1a20');
  rect(x + 108, y + 5, 12, 5, '#3a3a46'); rect(x + 110, y + 9, 8, 2, '#bcdcff');
  // nameplate (front-center): brushed silver, engraving, indigo badge (no crown)
  const nx = x + 37, ny = y + 40, nw = 56, nh = 9;
  rect(nx, ny, nw, nh, '#3a3f52'); rect(nx + 1, ny + 1, nw - 2, nh - 2, '#aeb6cc');
  rect(nx + 1, ny + 1, nw - 2, 1, 'rgba(255,255,255,0.5)');
  rect(nx + 13, ny + 3, nw - 17, 3, '#2b2f40');
  for (let tx = nx + 15; tx < nx + nw - 5; tx += 4) rect(tx, ny + 4, 2, 1, '#5a6480');
  rect(nx + 3, ny + 3, 7, 4, C.managerIndigo); rect(nx + 4, ny + 2, 5, 1, shadeHex(C.managerIndigo, 1.4));
};

const drawChairTopDown = (x, y, color) => {
  shadow(x, y, 22, 22);
  rect(x, y, 22, 7, shadeHex(color, 0.55));         // backrest seen from top
  rect(x + 1, y + 1, 20, 2, 'rgba(255,255,255,0.20)');  // backrest top highlight
  rect(x, y + 6, 22, 16, color);                    // seat
  rect(x + 2, y + 8, 18, 11, 'rgba(0,0,0,0.22)');   // seat dish
  rect(x + 2, y + 8, 18, 2, 'rgba(255,255,255,0.14)');  // dish front highlight
  bevel(x, y + 6, 22, 16, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.35)');
};

const drawPlantTopDown = (x, y) => {
  shadow(x, y, 20, 20);
  rect(x + 4, y + 12, 12, 8, '#6b4a2a');            // pot
  rect(x + 4, y + 18, 12, 2, 'rgba(0,0,0,0.30)');   // pot base shadow
  rect(x + 4, y + 12, 12, 2, '#8a6038');            // pot rim
  rect(x + 2, y, 16, 13, C.plantDark);              // foliage
  rect(x + 4, y + 1, 5, 5, C.plantLight);
  rect(x + 11, y + 2, 5, 5, C.plantLight);
  rect(x + 7, y + 7, 5, 5, C.plantLight);
  rect(x + 3, y + 2, 4, 4, shadeHex(C.plantLight, 1.3));   // bright leaf tip
  rect(x + 12, y + 1, 3, 3, shadeHex(C.plantLight, 1.3));
  rect(x + 6, y + 4, 2, 2, 'rgba(255,255,255,0.20)');      // specular
};

const drawBookshelfTopDown = (x, y, w, h) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.bookshelf);
  const bw = Math.floor((w - 12) / 4);
  const colors = ['#8b1a1a', '#1a4a8b', '#1a7a1a', '#8b6a1a'];
  for (let i = 0; i < 4; i++) {
    const bx = x + 4 + i * (bw + 1);
    rect(bx, y + 3, bw, h - 6, colors[i]);
    rect(bx, y + 3, bw, 2, 'rgba(255,255,255,0.18)');   // book top highlight
    rect(bx + Math.floor(bw / 2), y + 3, 1, h - 6, 'rgba(0,0,0,0.25)'); // spine split
  }
  bevel(x, y, w, h, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.35)');
};

// Gamer workstation — detailed to match the boss desk: carbon-fibre surface,
// stitched desk mat, metal frame + corner brackets, cable grommets, a headset
// stand, sticky note + pen, and an RGB front edge with underglow. The monitor +
// screen content + keyboard + mug are layered on later (drawAllFurniture/Details).
const drawGamingDeskTopDown = (x, y, w, h) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.deskGaming);
  // carbon-fibre grain
  for (let gy = y + 4; gy < y + h - 4; gy += 4) rect(x + 4, gy, w - 8, 1, 'rgba(0,0,0,0.10)');
  // stitched desk mat
  rect(x + 6, y + 6, w - 12, h - 12, '#20203a');
  rect(x + 6, y + 6, w - 12, 1, 'rgba(255,255,255,0.06)');
  bevel(x + 6, y + 6, w - 12, h - 12, 'rgba(120,120,200,0.18)', 'rgba(0,0,0,0.30)');
  // metal frame + bright corner brackets
  rect(x, y, w, 3, '#4d4d8a');
  rect(x, y, 3, h, '#4d4d8a');
  rect(x, y, 8, 3, '#6a6ab0'); rect(x + w - 8, y, 8, 3, '#6a6ab0');
  rect(x, y, 3, 8, '#6a6ab0'); rect(x + w - 3, y, 3, 8, '#6a6ab0');
  if (w > 80) {   // accessories on the free right side of a full-size workstation
    // cable grommets along the back edge
    rect(x + 58, y + 5, 5, 4, '#15151f'); rect(x + 59, y + 6, 3, 2, '#000');
    rect(x + 70, y + 5, 5, 4, '#15151f'); rect(x + 71, y + 6, 3, 2, '#000');
    // headset stand (post + headband + ear cups)
    rect(x + 80, y + 8, 2, 16, '#3a3a4a');
    rect(x + 76, y + 7, 10, 2, '#4a4a5a');
    rect(x + 76, y + 7, 2, 5, '#4a4a5a'); rect(x + 84, y + 7, 2, 5, '#4a4a5a');
    rect(x + 75, y + 10, 3, 4, '#22c55e'); rect(x + 84, y + 10, 3, 4, '#22c55e');
    // sticky note + pen
    rect(x + 64, y + 34, 9, 9, '#ffe14d'); rect(x + 64, y + 34, 9, 1, 'rgba(255,255,255,0.4)');
    rect(x + 58, y + 44, 18, 2, '#cfcfe0'); rect(x + 58, y + 44, 4, 2, '#e11d48');
  }
  // RGB front edge + underglow
  rect(x + 2, y + h - 3, w - 4, 3, C.purple);
  rect(x + 2, y + h - 3, 10, 3, '#22c55e');
  rect(x + w - 14, y + h - 3, 10, 3, '#3b82f6');
  spark(x + 7,     y + h - 1, 8, 'rgba(34,197,94,0.8)');
  spark(x + w - 9, y + h - 1, 8, 'rgba(59,130,246,0.8)');
  spark(x + w / 2, y + h - 1, 9, 'rgba(124,58,237,0.7)');
};

// Ordinary wooden workstation — detailed and unique per `v`:
//  0 = walnut + book stack + reading lamp, 1 = oak + papers + magnifier + pen,
//  2 = cherry + open notebook + pen holder + small plant.
// Monitor / keyboard / mug are layered on later (drawAllFurniture / drawDetails).
const WORK_WOODS = ['#3d2b1a', '#6a4e2e', '#5a2d28'];   // walnut / oak / cherry
const WORK_PADS  = ['#16261c', '#2a2418', '#1d2630'];   // leather pad tone per desk
const drawWorkDesk = (x, y, w, h, v) => {
  const wood = WORK_WOODS[v], pad = WORK_PADS[v];
  shadow(x, y, w, h);
  rect(x, y, w, h, wood);
  rect(x, y, w, Math.round(h / 2), shadeHex(wood, 1.14));   // top-down sheen
  for (let i = 1; i < 5; i++) rect(x + 8, y + Math.round(i * h / 5), w - 16, 1, 'rgba(0,0,0,0.10)');  // grain
  rect(x + 6, y + 4, w - 12, 1, 'rgba(255,255,255,0.06)');
  rect(x, y, w, 2, shadeHex(wood, 1.5));                    // bright back edge
  bevel(x, y, w, h, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.34)');
  // leather desk pad (under the keyboard) with corner studs
  const bx = x + 13, by = y + 30, bw = 34, bh = 17;
  rect(bx, by, bw, bh, pad); rect(bx + 2, by + 2, bw - 4, bh - 4, shadeHex(pad, 1.25));
  rect(bx + 2, by + 2, bw - 4, 1, 'rgba(255,255,255,0.06)');
  for (const sx of [bx + 1, bx + bw - 3]) for (const sy of [by + 1, by + bh - 3]) rect(sx, sy, 2, 2, '#8a6d10');
  if (v === 0) {            // Reader — stacked books + reading lamp
    const cols = ['#8b1a1a', '#1a4a8b', '#1a7a1a'];
    for (let i = 0; i < 3; i++) {
      rect(x + 58, y + 40 - i * 5, 18, 5, cols[i]);
      rect(x + 58, y + 40 - i * 5, 18, 1, 'rgba(255,255,255,0.20)');
    }
    rect(x + 82, y + 8, 2, 14, '#2a2a2a'); rect(x + 78, y + 6, 10, 5, '#3a3a3a'); rect(x + 80, y + 10, 6, 2, '#ffe6a0');
    bloom(x + 83, y + 12, 14, 'rgba(255,205,120,0.9)', 0.7);
  } else if (v === 1) {     // Searcher — papers + magnifier + pen
    rect(x + 57, y + 32, 22, 14, '#d8d0bc'); rect(x + 59, y + 30, 22, 14, '#e8e0cc');
    for (let i = 0; i < 3; i++) rect(x + 62, y + 33 + i * 4, 16, 1, 'rgba(60,60,80,0.45)');
    rect(x + 74, y + 8, 8, 2, '#cfcfe0'); rect(x + 74, y + 10, 2, 2, '#cfcfe0'); rect(x + 80, y + 10, 2, 2, '#cfcfe0');
    rect(x + 74, y + 14, 8, 2, '#cfcfe0'); rect(x + 81, y + 15, 5, 2, '#8a8a96');
    rect(x + 76, y + 10, 4, 4, 'rgba(120,160,240,0.5)');
    rect(x + 58, y + 44, 18, 2, '#caa106');
  } else {                  // Writer — open notebook + pen holder + small plant
    rect(x + 56, y + 33, 24, 13, '#cfc7b0'); rect(x + 56, y + 33, 12, 13, '#e8e0cc'); rect(x + 68, y + 33, 12, 13, '#ddd5be');
    rect(x + 67, y + 33, 1, 13, 'rgba(0,0,0,0.25)');
    for (let i = 0; i < 3; i++) rect(x + 70, y + 36 + i * 3, 8, 1, 'rgba(60,60,80,0.4)');
    rect(x + 84, y + 30, 6, 8, '#3a3a44'); rect(x + 85, y + 26, 1, 5, '#e11d48'); rect(x + 87, y + 25, 1, 6, '#3b82f6');
    rect(x + 80, y + 8, 8, 5, '#6b4a2a'); rect(x + 79, y + 3, 10, 6, '#1a3a1a'); rect(x + 81, y + 4, 3, 3, '#2d6b2d'); rect(x + 85, y + 4, 2, 2, '#3d8b3d');
  }
};

// Normal swivel office chair (top-down) — for the wooden work desks.
const drawOfficeChair = (x, y, base = '#33333c') => {
  const body = base, seat = shadeHex(base, 1.18), arm = shadeHex(base, 0.6);
  shadow(x, y, 24, 24);
  rect(x, y, 24, 7, body);                        // backrest
  rect(x + 1, y + 1, 22, 2, 'rgba(255,255,255,0.15)');
  rect(x, y + 6, 24, 16, seat);                   // seat
  rect(x + 2, y + 8, 20, 11, 'rgba(0,0,0,0.22)');
  rect(x + 2, y + 8, 20, 2, 'rgba(255,255,255,0.12)');
  rect(x - 2, y + 9, 3, 9, arm); rect(x + 23, y + 9, 3, 9, arm);   // armrests
  bevel(x, y + 6, 24, 16, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.35)');
};

// Desk monitor (bezel + screen base). Screen CONTENT + glow are layered by
// drawDetails(); this is the physical panel with a lifted bezel + top sheen.
const drawDeskMonitor = (mx, my, screenCol) => {
  shadow(mx, my, 40, 28);
  rect(mx - 1, my - 1, 42, 30, '#0c0c12');          // outer bezel rim
  rect(mx, my, 40, 28, '#1a2a3a');                  // bezel
  rect(mx + 2, my + 2, 36, 24, screenCol);          // screen base
  rect(mx + 2, my + 2, 36, 1, 'rgba(255,255,255,0.12)');  // bezel top sheen
  rect(mx, my, 2, 28, 'rgba(255,255,255,0.06)');    // left edge light
};

const drawGamingChairTopDown = (x, y, base = '#2d2d4e') => {
  const headrest = shadeHex(base, 1.5), back = shadeHex(base, 0.55),
        cushion = shadeHex(base, 1.18), headHi = shadeHex(base, 1.85);
  shadow(x, y, 26, 28);
  rect(x, y, 26, 7, headrest);                         // headrest (bright accent)
  rect(x, y + 6, 26, 22, back);                        // seat back
  rect(x + 3, y + 9, 20, 16, cushion);                 // cushion
  rect(x + 3, y + 9, 20, 2, 'rgba(255,255,255,0.10)');
  rect(x + 9, y + 1, 8, 4, headHi);                    // headrest hi
  bevel(x, y, 26, 28);
};

const drawServerRackTopDown = (x, y) => {
  shadow(x, y, 28, 55);
  rect(x, y, 28, 55, C.serverRack);
  rect(x, y, 28, 2, shadeHex(C.serverRack, 1.7));      // top edge sheen
  rect(x, y, 2, 55, shadeHex(C.serverRack, 1.4));      // left light edge
  bevel(x, y, 28, 55, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.4)');
  const lights = ['#22c55e', '#22c55e', '#f59e0b', '#22c55e', '#ef4444'];
  const ledGlow = ['rgba(34,197,94,0.9)', 'rgba(34,197,94,0.9)', 'rgba(245,158,11,0.9)',
                   'rgba(34,197,94,0.9)', 'rgba(239,68,68,0.9)'];
  for (let i = 0; i < 5; i++) {
    rect(x + 3, y + 4 + i * 10, 22, 7, '#13294a');     // unit
    rect(x + 3, y + 4 + i * 10, 22, 1, '#24406e');     // unit top highlight
    rect(x + 4, y + 5 + i * 10, 14, 1, 'rgba(255,255,255,0.10)');
    rect(x + 5, y + 6 + i * 10, 6, 3, '#0a1830');      // vent slot
    rect(x + 20, y + 6 + i * 10, 4, 3, lights[i]);     // status LED
    spark(x + 22, y + 7 + i * 10, 6, ledGlow[i]);      // LED glow
  }
};

const drawSofaTopDown = (x, y, w, h) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, C.sofaBlue);
  rect(x + 6, y + 6, w - 12, h - 8, C.sofaDark);       // seat area
  rect(x + 6, y + 6, w - 12, 2, 'rgba(255,255,255,0.10)');  // seat front highlight
  // cushion seams (2-3 cushions)
  const n = w > 100 ? 3 : 2;
  for (let i = 1; i < n; i++) rect(x + 6 + Math.round(i * (w - 12) / n), y + 6, 2, h - 8, 'rgba(0,0,0,0.28)');
  rect(x, y, w, 6, C.sofaBlue);                        // backrest
  rect(x, y, w, 2, 'rgba(255,255,255,0.14)');          // backrest top highlight
  rect(x, y, 6, h, C.sofaDark);                        // arm L
  rect(x, y, 6, 2, 'rgba(255,255,255,0.10)');
  rect(x + w - 6, y, 6, h, C.sofaDark);                // arm R
  rect(x + w - 6, y, 6, 2, 'rgba(255,255,255,0.10)');
  rect(x, y + h - 2, w, 2, 'rgba(0,0,0,0.30)');        // base shadow
  bevel(x, y, w, h);
};

const drawCoffeeMachineTopDown = (x, y) => {
  shadow(x, y, 28, 28);
  rect(x, y, 28, 28, C.coffeeM);
  bevel(x, y, 28, 28, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.35)');
  rect(x + 4, y + 4, 20, 10, '#0d0d0d');               // display panel
  rect(x + 6, y + 6, 9, 3, '#22c55e');                 // display readout
  spark(x + 10, y + 7, 7, 'rgba(34,197,94,0.85)');     // readout glow
  rect(x + 10, y + 17, 8, 7, '#f5f0e0');               // cup
  rect(x + 10, y + 17, 8, 2, '#ffffff');
  rect(x + 12, y + 19, 4, 4, '#6b3a2a');               // coffee
  rect(x + 22, y + 9, 4, 4, C.amber);                  // button
  spark(x + 24, y + 11, 6, 'rgba(217,119,6,0.85)');    // button glow
};

const drawWhiteboardTopDown = (x, y, w) => {
  shadow(x, y, w, 18);
  rect(x, y, w, 18, '#e8e8e8');
  bevel(x, y, w, 18);
  rect(x + 2, y + 2, w - 4, 14, '#f8f8f8');
  rect(x + 6,  y + 5, 18, 2, '#2d6b8b');
  rect(x + 28, y + 8, 24, 2, '#8b1a1a');
  rect(x + 6,  y + 11, 30, 2, '#1a7a1a');
  rect(x + w - 22, y + 5, 16, 8, '#444');
};

const drawCabinetTopDown = (x, y, w, h) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, '#3a3a4a');
  const dh = (h - 9) / 2;
  rect(x + 3, y + 3, w - 6, dh, '#2a2a38');
  rect(x + 3, y + 3, w - 6, 1, 'rgba(255,255,255,0.10)');       // drawer 1 top light
  rect(x + 3, y + 6 + dh, w - 6, dh, '#2a2a38');
  rect(x + 3, y + 6 + dh, w - 6, 1, 'rgba(255,255,255,0.10)');  // drawer 2 top light
  rect(x + w / 2 - 3, y + 6, 6, 2, '#aaa');                     // handle 1
  rect(x + w / 2 - 3, y + 8 + dh, 6, 2, '#aaa');                // handle 2
  bevel(x, y, w, h, 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.35)');
};

const drawFridgeTopDown = (x, y) => {
  shadow(x, y, 26, 30);
  rect(x, y, 26, 30, '#d8dde2');
  rect(x, y, 26, 2, 'rgba(255,255,255,0.45)');         // top sheen
  rect(x + 2, y + 2, 22, 12, '#c0c8d0');
  rect(x + 2, y + 2, 22, 1, 'rgba(255,255,255,0.30)');
  rect(x + 2, y + 16, 22, 12, '#c0c8d0');
  rect(x + 2, y + 16, 22, 1, 'rgba(255,255,255,0.30)');
  rect(x + 20, y + 5, 3, 6, '#888');                   // handle upper
  rect(x + 20, y + 18, 3, 6, '#888');                  // handle lower
  rect(x, y, 2, 30, 'rgba(255,255,255,0.18)');         // left light edge
  rect(x + 24, y, 2, 30, 'rgba(0,0,0,0.20)');          // right shade
};

// Wall-mounted OLED TV — slim panel whose emissive face points UP (north), so
// the lounge sofa (which faces south) watches it. Cool light spills out across
// the floor toward the couch (the bloom is centered on the screen's top edge).
const drawOledTVTopDown = (x, y, w) => {
  shadow(x, y, w, 15);
  rect(x + w / 2 - 14, y + 13, 28, 4, '#050506');          // slim wall bracket
  rect(x, y, w, 15, '#0a0a0c');                            // ultra-thin bezel
  rect(x + 2, y + 2, w - 4, 9, '#101018');
  rect(x + 4, y + 3, w - 8, 6, '#163a72');                 // emissive screen face
  rect(x + 4, y + 3, w - 8, 2, '#2f6fc8');                 // content bands
  rect(x + 4, y + 5, w - 8, 1, '#5aa0f0');                 // bright scan line
  rect(x + 4, y + 7, w - 8, 2, '#0f2a55');                 // darker lower band
  rect(x + 4, y + 3, w - 8, 1, 'rgba(255,255,255,0.22)');  // top edge sheen
  bevel(x, y, w, 15, 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.45)');
  bloom(x + w / 2, y + 2, w * 0.62, 'rgba(120,170,255,0.7)', 1.0);  // spill toward sofa
  bloom(x + w / 2, y - 10, w * 0.5, 'rgba(120,170,255,0.5)', 0.6);
};

const drawMonitorPanelTopDown = (x, y, w) => {
  shadow(x, y, w, 18);
  rect(x, y, w, 18, '#0a1a0a');
  bevel(x, y, w, 18);
  const cw = (w - 8) / 4;
  for (let i = 0; i < 4; i++) {
    rect(x + 4 + i * cw, y + 4, cw - 3, 10, '#0a2a0a');
    rect(x + 6 + i * cw, y + 7, 6, 2, '#22c55e');
    spark(x + 9 + i * cw, y + 8, 7, 'rgba(34,197,94,0.7)');
  }
};

const drawCrateTopDown = (x, y, s) => {
  shadow(x, y, s, s);
  rect(x, y, s, s, '#5a4326');
  bevel(x, y, s, s);
  rect(x + 2, y + 2, s - 4, s - 4, '#6b4f2d');
  rect(x, y + s / 2 - 1, s, 2, '#3a2a16');
  rect(x + s / 2 - 1, y, 2, s, '#3a2a16');
};

const drawCoffeeTableTopDown = (x, y, w, h) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, '#3a2a1a');
  rect(x + 4, y + 4, w - 8, h - 8, '#4a3a2a');         // table top
  rect(x + 4, y + 4, w - 8, 1, 'rgba(255,255,255,0.10)');   // top sheen
  rect(x + 4, y + Math.round(h / 2), w - 8, 1, 'rgba(0,0,0,0.15)');  // grain
  bevel(x, y, w, h, 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.30)');
};

const drawRugTopDown = (x, y, w, h) => {
  ctx.save();
  ctx.globalAlpha = 0.5;
  rect(x, y, w, h, C.rugWarm);
  ctx.strokeStyle = '#5a3f28';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 4, y + 4, w - 8, h - 8);
  ctx.restore();
};

// ============================================================
// DECOR (non-blocking — never added to NAV_OBSTACLES)
// ============================================================
// A wall window looking out on a night skyline. Lit-window pattern is derived
// from coords (no per-frame RNG) so it doesn't flicker.
const drawWindow = (x, y, w, h) => {
  rect(x - 2, y - 2, w + 4, h + 4, '#2a2a3a');           // frame
  rect(x, y, w, h, '#0a1430');                           // glass
  rect(x, y, w, Math.round(h * 0.55), '#10204a');        // sky band
  rect(x + w - 12, y + 4, 6, 6, '#e8e8d0');              // moon
  rect(x + w - 11, y + 5, 4, 4, '#fff8e0');
  for (const [sx, sy] of [[8,5],[18,8],[30,4],[44,7],[14,14],[52,5]]) {
    if (x + sx < x + w - 14) rect(x + sx, y + sy, 1, 1, '#cfd8ff');   // stars
  }
  const bh = [14, 20, 11, 17, 13, 22, 16];
  let bx = x + 3, i = 0;
  while (bx < x + w - 5 && i < bh.length) {
    const by = y + h - bh[i];
    rect(bx, by, 8, bh[i], '#070b18');                   // building
    for (let wy = by + 2; wy < y + h - 2; wy += 4)
      for (let wx = bx + 1; wx < bx + 7; wx += 3)
        rect(wx, wy, 1, 2, (wx + wy) % 5 ? '#ffd45a' : '#3a4a6a');   // lit windows
    bx += 10; i++;
  }
  rect(x, y, w, 1, 'rgba(255,255,255,0.15)');
  rect(x + Math.round(w / 2), y, 1, h, '#2a2a3a');       // mullions
  rect(x, y + Math.round(h / 2), w, 1, '#2a2a3a');
  bloom(x + w / 2, y + h / 2, w * 0.7, 'rgba(120,150,225,0.3)', 0.7);  // moonlight spill
};

// How long a flowing message bubble must stay up to scroll its full text exactly
// once (one marquee pass). Text that fits the strip doesn't scroll → a fixed,
// readable minimum. Mirrors the geometry/speed used by drawFlowBubble().
const FLOW_SPEED = 0.05;       // px/ms — MUST match drawFlowBubble's scroll rate
const FLOW_INNER = 192;        // BW(210) - PAD*2(18) — visible inner strip width
const FLOW_GAP   = 44;         // trailing gap (drawFlowBubble period = textW + 44)
const FLOW_MIN_DWELL = 3000;   // min readable dwell for non-scrolling text
const flowDwellMs = (text) => {
  ctx.save();
  ctx.font = '11px "Leelawadee UI","Tahoma",sans-serif';
  const tw = ctx.measureText(text || '').width;
  ctx.restore();
  if (tw <= FLOW_INNER) return FLOW_MIN_DWELL;          // fits — no scroll
  return Math.max(FLOW_MIN_DWELL, (tw + FLOW_GAP) / FLOW_SPEED);
};

// Framed wall art / poster.
const drawWallArt = (x, y, w, h, col) => {
  shadow(x, y, w, h);
  rect(x, y, w, h, '#3a2a1a');
  rect(x + 2, y + 2, w - 4, h - 4, col);
  rect(x + 2, y + 2, w - 4, 2, 'rgba(255,255,255,0.22)');
  rect(x + 4, y + h - 7, w - 8, 3, 'rgba(255,255,255,0.25)');
  rect(x + 5, y + 5, 4, 4, 'rgba(255,255,255,0.30)');
};

// Soft glowing sign strip (uses the round radial glow, not a boxy halo).
const drawNeonSign = (x, y, w, col, glowCol) => {
  bloom(x + w / 2, y + 2, w * 0.85, glowCol, 1.0);
  rect(x, y, w, 3, col);
  rect(x, y, w, 1, 'rgba(255,255,255,0.6)');
};

// Per-room ceiling light pool — drawn under furniture to tint the floor.
const drawAmbient = () => {
  const pools = [
    { r: 'boss',   col: 'rgba(150,110,230,0.16)' },
    { r: 'dev',    col: 'rgba(70,150,130,0.15)'  },
    { r: 'ops',    col: 'rgba(90,170,90,0.13)'   },
    { r: 'lounge', col: 'rgba(220,160,90,0.16)'  },
  ];
  for (const p of pools) {
    const rm = ROOMS[p.r];
    glow(rm.x + rm.w / 2, rm.y + rm.h / 2 - 10, rm.w * 0.5, p.col);
  }
};

const drawAllRooms = () => {
  for (const r of Object.values(ROOMS)) {
    rect(r.x, r.y, r.w, r.h, r.floor);
  }
  ctx.strokeStyle = C.wallOuter;
  ctx.lineWidth = WALL;
  ctx.strokeRect(WALL / 2, HEADER_H + WALL / 2, W - WALL, 520 - WALL);

  const vx = ROOM_W;
  const vDoor1Y = HEADER_H + ROOM_H / 2;
  const vDoor2Y = HEADER_H + ROOM_H + ROOM_H / 2;
  ctx.fillStyle = C.wallOuter;
  rect(vx - WALL / 2, HEADER_H, WALL, vDoor1Y - DOOR_W / 2 - HEADER_H);
  rect(vx - WALL / 2, vDoor1Y + DOOR_W / 2, WALL, vDoor2Y - DOOR_W / 2 - vDoor1Y - DOOR_W / 2);
  rect(vx - WALL / 2, vDoor2Y + DOOR_W / 2, WALL, HEADER_H + 520 - vDoor2Y - DOOR_W / 2);

  const hy2 = HEADER_H + ROOM_H;
  const hDoor1X = ROOM_W / 2;
  const hDoor2X = ROOM_W + ROOM_W / 2;
  ctx.fillStyle = C.wallOuter;
  rect(0, hy2 - WALL / 2, hDoor1X - DOOR_W / 2, WALL);
  rect(hDoor1X + DOOR_W / 2, hy2 - WALL / 2, hDoor2X - DOOR_W / 2 - hDoor1X - DOOR_W / 2, WALL);
  rect(hDoor2X + DOOR_W / 2, hy2 - WALL / 2, W - hDoor2X - DOOR_W / 2, WALL);

  ctx.strokeStyle = C.wallHighlight;
  ctx.lineWidth = 1;
  ctx.strokeRect(WALL, HEADER_H + WALL, W - WALL * 2, 520 - WALL * 2);

  for (const r of Object.values(ROOMS)) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawText(r.label, r.x + r.w / 2, r.y + 18, { size: 10, color: C.white, align: 'center' });
    ctx.restore();
  }
};

const drawAllFurniture = () => {
  // ── BOSS ROOM ──
  const br = ROOMS.boss;
  drawRugTopDown(150, 170, 120, 72);       // center accent rug — drawn first so the cabinet sits ON TOP
  drawBookshelfTopDown(br.x + 260, br.y + WALL + 4, 120, 20);
  drawBossDesk(br.x + 25, br.y + 60, 150, 55);          // executive desk (monitor, nameplate, lamp…)
  drawChairTopDown(br.x + 63, br.y + 118, '#4a3a2a');   // work chair under SIT_POS.jamesmie (x74)
  drawPlantTopDown(br.x + ROOM_W - 40, br.y + WALL + 6);
  // boss extras
  drawRugTopDown(br.x + 20, br.y + 55, 165, 65);
  drawWhiteboardTopDown(br.x + 40, br.y + WALL + 4, 110);
  drawSofaTopDown(br.x + 30, br.y + 195, 90, 30);
  drawCoffeeTableTopDown(br.x + 50, br.y + 232, 50, 18);
  drawCabinetTopDown(br.x + 195, br.y + 95, 30, 60);
  // Manager workstation (boss room, top wall) — detailed cool-themed desk
  drawManagerDesk(250, 90, 130, 50);
  drawChairTopDown(304, 142, '#2c2940');   // under SIT_POS.manager (x315) — matches manager desk
  // boss extras — fill open floor (nav boxes mirror these; clear of door corridors)
  drawCrateTopDown(150, 262, 24);          // crate cluster (bottom-left, left of door)
  drawCrateTopDown(180, 268, 18);
  drawPlantTopDown(405, 262);              // bottom-right corner plant

  // ── DEV ROOM ──
  const dr = ROOMS.dev;
  drawWorkDesk(dr.x + 30, dr.y + 60, 95, 50, 0);   // Reader — walnut + books + lamp
  drawDeskMonitor(dr.x + 40, dr.y + 67, '#0f2035');
  drawOfficeChair(dr.x + 48, dr.y + 110, WORK_WOODS[0]);   // reader chair (walnut, matches desk)
  drawWorkDesk(dr.x + 200, dr.y + 60, 95, 50, 1);  // Searcher — oak + papers + magnifier
  drawDeskMonitor(dr.x + 210, dr.y + 67, '#0f2035');
  drawOfficeChair(dr.x + 218, dr.y + 110, WORK_WOODS[1]);  // Searcher chair (oak, matches desk)
  drawWorkDesk(dr.x + 323, dr.y + 60, 95, 50, 2);  // Writer — cherry + notebook + plant
  drawDeskMonitor(dr.x + 333, dr.y + 67, '#0f2035');
  drawOfficeChair(dr.x + 341, dr.y + 110, WORK_WOODS[2]);  // writer chair (cherry, matches desk)
  drawServerRackTopDown(dr.x + ROOM_W - 45, dr.y + WALL + 10);
  // dev extras
  drawWhiteboardTopDown(dr.x + 110, dr.y + WALL + 4, 120);
  drawFridgeTopDown(dr.x + ROOM_W - 42, dr.y + ROOM_H - 40);
  drawCrateTopDown(dr.x + 30, dr.y + ROOM_H - 40, 24);
  drawCrateTopDown(dr.x + 58, dr.y + ROOM_H - 36, 20);
  // more dev extras
  drawRugTopDown(500, 175, 120, 66);       // floor rug (flat, walkable)
  drawCabinetTopDown(458, 196, 28, 52);    // filing cabinet (left wall, below door)
  drawPlantTopDown(820, 178);              // right-center plant

  // ── OPS ROOM ──
  const or = ROOMS.ops;
  drawGamingDeskTopDown(or.x + 85, or.y + 55, 95, 50);
  drawDeskMonitor(or.x + 95, or.y + 62, '#001a00');
  drawGamingChairTopDown(or.x + 102, or.y + 105, C.deskGaming);  // ops chair — Editor (matches gaming desk)
  rect(or.x + 170, or.y + WALL + 6, 60, 20, '#111');
  rect(or.x + 172, or.y + WALL + 8, 56, 16, '#001a00');
  rect(or.x + 260, or.y + WALL + 6, 60, 20, '#111');
  rect(or.x + 262, or.y + WALL + 8, 56, 16, '#001a00');
  // ops extras: extra racks + monitoring + crates
  drawServerRackTopDown(or.x + ROOM_W - 45, or.y + WALL + 10);
  drawServerRackTopDown(or.x + ROOM_W - 45, or.y + WALL + 75);
  drawMonitorPanelTopDown(or.x + 340, or.y + WALL + 4, 95);
  // more ops extras — fill the big open floor
  drawRugTopDown(120, 438, 150, 80);       // floor rug (flat, walkable)
  drawCabinetTopDown(40, 330, 30, 58);     // cabinet (top-left wall)
  // server bank — bottom-left corner (nav boxes mirror these)
  drawServerRackTopDown(20, 488);
  drawServerRackTopDown(51, 488);
  drawServerRackTopDown(82, 488);
  drawPlantTopDown(360, 320);              // plant near monitor wall

  // ── LOUNGE ──
  const lg = ROOMS.lounge;
  drawRugTopDown(lg.x + 160, lg.y + 85, 130, 90);
  drawSofaTopDown(lg.x + 165, lg.y + 100, 120, 38);
  drawCoffeeTableTopDown(lg.x + 198, lg.y + 150, 55, 30);
  drawCoffeeMachineTopDown(lg.x + ROOM_W - 45, lg.y + WALL + 10);
  drawPlantTopDown(lg.x + WALL + 8, lg.y + WALL + 8);
  // lounge extras — OLED TV on the bottom wall, facing up toward the sofa
  drawOledTVTopDown(lg.x + 150, lg.y + ROOM_H - WALL - 17, 150);
  drawBookshelfTopDown(lg.x + WALL + 6, lg.y + 60, 24, 110);
  // more lounge extras
  drawPlantTopDown(512, 320);              // top-left plant
  drawPlantTopDown(560, 520);              // bottom plant
};

// Darken/lighten a #rrggbb hex by a factor (clamped to 0..255).
const shadeHex = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

// ── Per-room floor materials (rendered once into an offscreen cache, blitted each frame) ──
const FLOOR_STYLE = { boss: 'tile', dev: 'tile', ops: 'grate', lounge: 'plank' };
const TILE_OPTS = {
  boss: { tile: 40, hi: 1.22, grout: 0.60 },   // large purple tiles
  dev:  { tile: 28, hi: 1.30, grout: 0.60 },   // smaller teal tiles, higher contrast
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
    for (let gx = x0 + ((i * 37) % 60); gx < x1; gx += 80) g.fillRect(gx, py + 3, 1, Math.max(0, h2 - 5));
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

// Depth-shading knobs (spec: "Medium").
const SHADE_HI = 1.18, SHADE_LO = 0.66, SHADE_SPEC = 0.55;
const OUTLINE_COLOR = '#0a0a16';
const FORM_KEYS = new Set(['s', 'h', 'H', 'b', 'B', 'k', 'd', 'D', 'L', 'l', 'z']);
const HAIR_KEYS = new Set(['h', 'H']);
const _depthCache = new Map();   // grid(array ref) -> Map(`${body}|${hair}|${skin}` -> color buffer)

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
        const t = ((cols > 1 ? c / (cols - 1) : 0.5) + (rows > 1 ? r / (rows - 1) : 0.5)) / 2;
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


// ============================================================
// CUTE SPRITES (36-wide, spriteScale 1) — generated by py/gen_sprites.py.
// DO NOT hand-edit; rerun: python py/gen_sprites.py --emit
// ============================================================
const LEGS_CUTE_STAND = [
  '............llll...llll.............',
  '............llll...llll.............',
  '............zzzz...zzzz.............',
  '............zzzzz.zzzzz.............'
];

const LEGS_CUTE_WALK1 = [
  '.............lllll..ll..............',
  '.............lllll..ll..............',
  '.............zzzzz..zz..............',
  '..............zzzz.zzz..............'
];

const LEGS_CUTE_WALK2 = [
  '.............ll..lllll..............',
  '.............ll..lllll..............',
  '.............zz..zzzzz..............',
  '..............zzz.zzzz..............'
];

const JAMESMIE_BD = [
  '...........c..c..c..c..c............',
  '...........ccccccccccccc............',
  '..........hhhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhDDDDDDDDDDDDDDDDDDhhh......',
  '.....hhhhdssLLLLLLLLLsssssdhhhh.....',
  '.......hDsssLLLLLLLLLssssssDh.......',
  '........ssssLLLLLLLLLsssssss........',
  '.......sseiieeLLLLLLLseiieess.......',
  '.......sseiieeLLLLLLLseiieess.......',
  '.......seeeeeeesssssseeeeeees.......',
  '.......sseeeiesssssssseeeiess.......',
  '.......dseeeeesssLsssseeeeesd.......',
  '.......dsssssssssLLsssssssssd.......',
  '........ddsssssssssssssssddd........',
  '........dsssssmssssssmsssssd........',
  '.........dsssssmmmmmmsssssd.........',
  '.........ddssssssssssssssdd.........',
  '..........dddssssssssssddd..........',
  '...........dddddddddddddd...........',
  '.............dddddddddd.............',
  '............cccccccccccc............',
  '...........bcbbbbbbbbbbcb...........',
  '..........bbbbbbbbbbbbbbbb..........',
  '.........sbbbbbbbccbbbbbbbs.........',
  '.........sbbkkbbbcbbbbBbbbs.........',
  '.........sbbkbbbbbbbbbBbbbs.........',
  '..........bbbbbbbbbbbbbbbb..........',
  '...........bbbbbbbbbbbbb............',
  '............bbbbbbbbbbbb............'
];

const JAMESMIE_BU = [
  '...........c..c..c..c..c............',
  '...........ccccccccccccc............',
  '..........hhhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '..........hhhhhhhhhhhhhhhh..........',
  '...........hhhhhhhhhhhhhh...........',
  '.............hhhhhhhhhh.............',
  '..............bbbbbbbb..............',
  '.............bbbbbbbbbb.............',
  '............bbbbbbbbbbbb............',
  '.........s..bbbbbbbbbbbb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '............bbbbbbbbbbbb............',
  '.............bbbbbbbbbb.............',
  '.............bbbbbbbbbb.............'
];

const MANAGER_BD = [
  '..............hhhhhhhh..............',
  '............hHhhhhhhhhhh............',
  '..........hhhHhhhhhhhhhhhh..........',
  '.........hhhhHhhhhhhhhhhhhh.........',
  '........hhhhhHhhhhhhhhhhhhhh........',
  '.......hhhhhhHhhhhhhhhhhhhhhh.......',
  '.......hhhhhhHhhhhhhhhhhhhhhh.......',
  '......hhhhhhhHhhhhhhhhhhhhhhhh......',
  '......hhhhhhhHhhhhhhhhhhhhhhhh......',
  '......hhhDDDDDDDDDDDDDDDDDDhhh......',
  '.....hhhhdssLLLLLLLLLsssssdhhhh.....',
  '.......hDsssLLLLLLLLLssssssDh.......',
  '.......hGGGGGGGGLLLLGGGGGGGGh.......',
  '......hGssiieLLGLLLLGssiiessGh......',
  '.......GseiieeLGLLLLGseiieesG.......',
  '.......GseeeeesGGGGGGseeeeesG.......',
  '.......GseeeiesGssssGseeeiesG.......',
  '.......GsseeessGsLssGsseeessG.......',
  '.......GGGGGGGGGsLLsGGGGGGGGG.......',
  '........ddsssessssssssessddd........',
  '........dsssseeeemmeeeessssd........',
  '.........dssssssmmmmssssssd.........',
  '.........ddssssssssssssssdd.........',
  '..........dddssssssssssddd..........',
  '...........dddddddddddddd...........',
  '.............dddddddddd.............',
  '............wwwwwwwwwwww............',
  '...........bbbbwwwwwwbbbb...........',
  '..........bbbbbbbggbbbbbbb..........',
  '.........sbbbbbbbggbbbbbbbs.........',
  '.........sbbkkbbbggbbbBbbbs.........',
  '.........sbbkbbbbggbbbBbbbs.........',
  '..........bbbbbbbggbbbbbbb..........',
  '...........bbbbbbbbbbbbb............',
  '............bbbbbbbbbbbb............'
];

const MANAGER_BU = [
  '..............hhhhhhhh..............',
  '............hHhhhhhhhhhh............',
  '..........hhhHhhhhhhhhhhhh..........',
  '.........hhhhHhhhhhhhhhhhhh.........',
  '........hhhhhHhhhhhhhhhhhhhh........',
  '.......hhhhhhHhhhhhhhhhhhhhhh.......',
  '.......hhhhhhHhhhhhhhhhhhhhhh.......',
  '......hhhhhhhHhhhhhhhhhhhhhhhh......',
  '......hhhhhhhHhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '..........hhhhhhhhhhhhhhhh..........',
  '...........hhhhhhhhhhhhhh...........',
  '.............hhhhhhhhhh.............',
  '..............bbbbbbbb..............',
  '.............bbbbbbbbbb.............',
  '............bbbbbbbbbbbb............',
  '.........s..bbbbbbbbbbbb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '............bbbbbbbbbbbb............',
  '.............bbbbbbbbbb.............',
  '.............bbbbbbbbbb.............'
];

const READER_BD = [
  '..............hhhhhhhh..............',
  '............hhhhhhhhhhhh............',
  '..........hhhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhDDDDDDDDDDDDDDDDDDhhh......',
  '.....hhhhdssLLLLLLLLLsssssdhhhh.....',
  '.....hhhDsssLLLLLLLLLssssssDhhh.....',
  '.....hhhdGGsGGLLLLLLLsGGsGGdhhh.....',
  '....hhhDGsiieLGLLLLLLGsiiesGDhhh....',
  '....hhhdGeiieeGLLLLLLGeiieeGdhhh....',
  '....hhhdseeeeesGGGGGGseeeeesdhhh....',
  '....hhhdGeeeieGssssssGeeeieGdhhh....',
  '....hhhdGdeeesGssLsssGseeedGdhhh....',
  '....hhhddGGsGGsssLLsssGGsGGddhhh....',
  '.....hhhdddssssssssssssssdddhhh.....',
  '.....hhhdssssssssmmssssssssdhhh.....',
  '......hhhdssssssmmmmssssssdhhh......',
  '......hhhddssssssssssssssddhhh......',
  '.......hhhdddssssssssssdddhhh.......',
  '........hhhddddddddddddddhhh........',
  '..........hhhddddddddddhhh..........',
  '.....hhhh...bwwwwwwwwwwb...hhhh.....',
  '.....hhhh..bbbbbbkkbbbbbb..hhhh.....',
  '.....hhhh.bbbbbbbwkbbbbbbb.hhhh.....',
  '.....hhhhsbbbbbbbkkbbbbbbbshhhh.....',
  '.....hhhhsbbkkbbbwkbbbBbbbshhhh.....',
  '.....hhhhsbbkbbbbkkbbbBbbbshhhh.....',
  '.....hhh..bbbbbbbwkbbbbbbb..hhh.....',
  '.....hhh...bbbbbbbbbbbbb....hhh.....',
  '.....hhh....bbbbbbbbbbbb....hhh.....'
];

const READER_BU = [
  '..............hhhhhhhh..............',
  '............hhhhhhhhhhhh............',
  '..........hhhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '..........hhhhhhhhhhhhhhhh..........',
  '.....hhhh.....bbbbbbbb.....hhhh.....',
  '.....hhhh....bbbbbbbbbb....hhhh.....',
  '.....hhhh...bbbbbbbbbbbb...hhhh.....',
  '.....hhhhs..bbbbbbbbbbbb..shhhh.....',
  '.....hhhhs..kbbbbbbbbbBb..shhhh.....',
  '.....hhhhs..kbbbbbbbbbBb..shhhh.....',
  '.....hhh....bbbbbbbbbbbb....hhh.....',
  '.....hhh.....bbbbbbbbbb.....hhh.....',
  '.....hhh.....bbbbbbbbbb.....hhh.....'
];

const CODER_BD = [
  '...........h..hhPPPPhh.h............',
  '...........hhPPPppppPPPh..h.........',
  '........h.hPPppphhhhpppPPhh.........',
  '........hhPpphhhhhhhhhhppPh.........',
  '........hPphhhhhhhhhhhhhhpPh........',
  '.......hPphhhhhhhhhhhhhhhhpPh.......',
  '.......PphhhhhhhhhhhhhhhhhhpP.......',
  '......hphhhhhhhhhhhhhhhhhhhhph......',
  '......PhhhhhhhhhhhhhhhhhhhhhhP......',
  '......phhDDDDDDDDDDDDDDDDDDhhp......',
  '.....hhhhdssLLLLLLLLLsssssdhhhh.....',
  '.....PhhDsssLLLLLLLLLssssssDhhP.....',
  '....pphhdsssLLLLLLLLLssssssdhhpp....',
  '...pGphDssiieLLLLLLLLssiiessDhpGp...',
  '..ppGppsseiieeLLLLLLLseiieessppGpp..',
  '..ppGppsseeeeesssssssseeeeessppGpp..',
  '..ppGppsseeeiesssssssseeeiessppGpp..',
  '...pGp.dsseeessssLssssseeessd.pGp...',
  '....p..dsssssssssLLsssssssssd..p....',
  '........ddsssssssssssssssddd........',
  '........dssssssssmmssssssssd........',
  '.........dssssssmmmmssssssd.........',
  '.........ddsssssseessssssdd.........',
  '..........dddssseeeesssddd..........',
  '...........dddddddddddddd...........',
  '.............dddddddddd.............',
  '...........kkkkkkkkkkkkkk...........',
  '...........bkkbkkkkkkbkkb...........',
  '..........bbbbbbwkkwbbbbbb..........',
  '.........sbbbbbbwbbwbbbbbbs.........',
  '.........sbbkkbbwbbwbbBbbbs.........',
  '.........sbbkbbbbbbbbbBbbbs.........',
  '..........bbbbbbbbbbbbbbbb..........',
  '...........bbbbbbbbbbbbb............',
  '............bbbbbbbbbbbb............'
];

const CODER_BU = [
  '...........h..hhPPPPhh.h............',
  '...........hhPPPppppPPPh..h.........',
  '........h.hPPppphhhhpppPPhh.........',
  '........hhPpphhhhhhhhhhppPh.........',
  '........hPphhhhhhhhhhhhhhpPh........',
  '.......hPphhhhhhhhhhhhhhhhpPh.......',
  '.......PphhhhhhhhhhhhhhhhhhpP.......',
  '......hphhhhhhhhhhhhhhhhhhhhph......',
  '......PhhhhhhhhhhhhhhhhhhhhhhP......',
  '......phhhhhhhhhhhhhhhhhhhhhhp......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.....PhhhhhhhhhhhhhhhhhhhhhhhhP.....',
  '....pphhhhhhhhhhhhhhhhhhhhhhhhpp....',
  '....GhhhhhhhhhhhhhhhhhhhhhhhhhhG....',
  '....GhhhhhhhhhhhhhhhhhhhhhhhhhhG....',
  '....GhhhhhhhhhhhhhhhhhhhhhhhhhhG....',
  '....GhhhhhhhhhhhhhhhhhhhhhhhhhhG....',
  '....G..hhhhhhhhhhhhhhhhhhhhhh..G....',
  '....p..hhhhhhhhhhhhhhhhhhhhhh..p....',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '........hhhhhhhhhhhhhhhhhhhh........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '.........hhhhhhhhhhhhhhhhhh.........',
  '..........hhhhhhhhhhhhhhhh..........',
  '...........hhhhhhhhhhhhhh...........',
  '.............hhhhhhhhhh.............',
  '...........kkkkkkkkkkkkkk...........',
  '............kkkkkkkkkkkk............',
  '............bbbbbbbbbbbb............',
  '.........s..bbbbbbbbbbbb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '............bbbbbbbbbbbb............',
  '.............bbbbbbbbbb.............',
  '.............bbbbbbbbbb.............'
];

const SEARCHER_BD = [
  '.........h.hhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhDDDDDDDDDDDDDDDDDDhhhhh....',
  '....hhhhhdssLLLLLLLLLsssssdhhhhh....',
  '...hhhhhDsssLLLLLLLLLssssssDhhhhh...',
  '....hhhhdsssLLLLLLLLLssssssdhhhh....',
  '....hhhDseiieeLLLLLLLseiieesDhhh....',
  '...hhhhdseiieeLLLLLLLseiieesdhhhh...',
  '....hhhdeeeeeeesssssseeeeeeedhhh....',
  '...hhhhdseeeiesssssssseeeiesdhhhh...',
  '....hhhdseeeeesssLsssseeeeesdhhh....',
  '...hhhhdsssssssssLLsssssssssdhhhh...',
  '.....hhhddsssssssssssssssdddhhh.....',
  '....hhhhdssssssssssssssssssdhhhh....',
  '......hhhdsssssmmmmmmsssssdhhh......',
  '......hhhddsssssiiiisssssddhhh......',
  '..........dddssssssssssddd..........',
  '...........dddddddddddddd...........',
  '.............dddddddddd.............',
  '............bbkwwwwwwkbb............',
  '...........bbbkwwwwwwkbbb...........',
  '..........bbbbkwwwwwwkbbbb..........',
  '.........sbbbbkwwwwwwkbbbbs.........',
  '.........sbbkkkwwwwwwkBbbbs.........',
  '.........sbbkbkwwwwwwkBbbbs.........',
  '..........bbbbkwwwwwwkbbbb..........',
  '...........bbbbbbbbbbbbb............',
  '............bbbbbbbbbbbb............'
];

const SEARCHER_BU = [
  '.........h.hhhhhhhhhhhhhhh..........',
  '.........hhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhh........',
  '.......hhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh...',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh...',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh...',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '...hhhhhhhhhhhhhhhhhhhhhhhhhhhhhh...',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '..........hhhhhhhhhhhhhhhh..........',
  '...........hhhhhhhhhhhhhh...........',
  '.............hhhhhhhhhh.............',
  '..............bbbbbbbb..............',
  '.............bbbbbbbbbb.............',
  '............bbbbbbbbbbbb............',
  '.........s..bbbbbbbbbbbb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '.........s..kbbbbbbbbbBb..s.........',
  '............bbbbbbbbbbbb............',
  '.............bbbbbbbbbb.............',
  '.............bbbbbbbbbb.............'
];

const WRITER_BD = [
  '................bb..................',
  '...........qqqqqqqqqqqqq.q..........',
  '.........qqqqqqqqqqqqqqqqq..........',
  '.........QQQQQQQQQqqqqqqqqqq........',
  '.......qqqqqqqqqqqqqqqqqqqqq........',
  '.......qqqqqqqqqqqqqqqqqqqqqq.......',
  '.......qqqqqqqqqqqqqqqqqqqqqqq......',
  '......qqqqqqqqqqqqqqqqqqqqqqqq......',
  '......gggggggggggggggggggggggg......',
  '.....hhhhdssLLLLLLLLLsssssdhhh......',
  '.....hhhhdssLLLLLLLLLsssssdhhhh.....',
  '......hhDsssLLLLLLLLLssssssDhh......',
  '.....hhhdGGsGGLLLLLLLsGGsGGdhhh.....',
  '.....hhDGsiieLGLLLLLLGsiiesGDhh.....',
  '....hhhdGeiieeGLLLLLLGeiieeGdhhh....',
  '.....hhdseeeeesGGGGGGseeeeesdhh.....',
  '....hhhdGeeeieGssssssGeeeieGdhhh....',
  '.....hhdGseeesGssLsssGseeesGdhh.....',
  '....hhhdsGGsGGsssLLsssGGsGGsdhhh....',
  '......hhddsssssssssssssssdddhh......',
  '.....hhhdssssssssmmssssssssdhhh.....',
  '.......hhdssssssmmmmssssssdhh.......',
  '.......hhddsssssseessssssddhh.......',
  '..........dddssseeeesssddd..........',
  '...........dddddddddddddd...........',
  '.............dddddddddd.............',
  '......hh....rrrrrrrrrrrr....hh......',
  '......hh...rrrrrrrrrrrrrr...hh......',
  '......hh..bbRrrrrrrrrbbbbb..hh......',
  '......hh.sbbbbbbbbbbbbbbbbs.hh......',
  '......hh.sbbkkbbbbbbbbBbbbs.hh......',
  '.........sbbkbbbbbbbbbBbbbs.........',
  '..........bbbbbbbbbbbbbbbb..........',
  '...........bbbbbbbbbbbbb............',
  '............bbbbbbbbbbbb............'
];

const WRITER_BU = [
  '................bb..................',
  '...........qqqqqqqqqqqqq.q..........',
  '.........qqqqqqqqqqqqqqqqq..........',
  '.........QQQQQQQQQqqqqqqqqqq........',
  '.......qqqqqqqqqqqqqqqqqqqqq........',
  '.......qqqqqqqqqqqqqqqqqqqqqq.......',
  '.......qqqqqqqqqqqqqqqqqqqqqqq......',
  '......qqqqqqqqqqqqqqqqqqqqqqqq......',
  '......gggggggggggggggggggggggg......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '....hhhhhhhhhhhhhhhhhhhhhhhhhhhh....',
  '......hhhhhhhhhhhhhhhhhhhhhhhh......',
  '.....hhhhhhhhhhhhhhhhhhhhhhhhhh.....',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '.......hhhhhhhhhhhhhhhhhhhhhh.......',
  '..........hhhhhhhhhhhhhhhh..........',
  '...........hhhhhhhhhhhhhh...........',
  '.............hhhhhhhhhh.............',
  '......hh....rrrrrrrrrrrr....hh......',
  '......hh...rrrrrrrrrrrrrr...hh......',
  '......hh....bbbbbbbbbbbb....hh......',
  '......hh.s..bbbbbbbbbbbb..s.hh......',
  '......hh.s..kbbbbbbbbbBb..s.hh......',
  '.........s..kbbbbbbbbbBb..s.........',
  '............bbbbbbbbbbbb............',
  '.............bbbbbbbbbb.............',
  '.............bbbbbbbbbb.............'
];

const SPRITES_JAMESMIE2 = {
  down: { stand: [...JAMESMIE_BD, ...LEGS_CUTE_STAND], walk1: [...JAMESMIE_BD, ...LEGS_CUTE_WALK1], walk2: [...JAMESMIE_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...JAMESMIE_BU, ...LEGS_CUTE_STAND], walk1: [...JAMESMIE_BU, ...LEGS_CUTE_WALK1], walk2: [...JAMESMIE_BU, ...LEGS_CUTE_WALK2] },
};

const SPRITES_MANAGER2 = {
  down: { stand: [...MANAGER_BD, ...LEGS_CUTE_STAND], walk1: [...MANAGER_BD, ...LEGS_CUTE_WALK1], walk2: [...MANAGER_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...MANAGER_BU, ...LEGS_CUTE_STAND], walk1: [...MANAGER_BU, ...LEGS_CUTE_WALK1], walk2: [...MANAGER_BU, ...LEGS_CUTE_WALK2] },
};

const SPRITES_READER2 = {
  down: { stand: [...READER_BD, ...LEGS_CUTE_STAND], walk1: [...READER_BD, ...LEGS_CUTE_WALK1], walk2: [...READER_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...READER_BU, ...LEGS_CUTE_STAND], walk1: [...READER_BU, ...LEGS_CUTE_WALK1], walk2: [...READER_BU, ...LEGS_CUTE_WALK2] },
};

const SPRITES_CODER2 = {
  down: { stand: [...CODER_BD, ...LEGS_CUTE_STAND], walk1: [...CODER_BD, ...LEGS_CUTE_WALK1], walk2: [...CODER_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...CODER_BU, ...LEGS_CUTE_STAND], walk1: [...CODER_BU, ...LEGS_CUTE_WALK1], walk2: [...CODER_BU, ...LEGS_CUTE_WALK2] },
};

const SPRITES_SEARCHER2 = {
  down: { stand: [...SEARCHER_BD, ...LEGS_CUTE_STAND], walk1: [...SEARCHER_BD, ...LEGS_CUTE_WALK1], walk2: [...SEARCHER_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...SEARCHER_BU, ...LEGS_CUTE_STAND], walk1: [...SEARCHER_BU, ...LEGS_CUTE_WALK1], walk2: [...SEARCHER_BU, ...LEGS_CUTE_WALK2] },
};

const SPRITES_WRITER2 = {
  down: { stand: [...WRITER_BD, ...LEGS_CUTE_STAND], walk1: [...WRITER_BD, ...LEGS_CUTE_WALK1], walk2: [...WRITER_BD, ...LEGS_CUTE_WALK2] },
  up:   { stand: [...WRITER_BU, ...LEGS_CUTE_STAND], walk1: [...WRITER_BU, ...LEGS_CUTE_WALK1], walk2: [...WRITER_BU, ...LEGS_CUTE_WALK2] },
};

// ============================================================
// AGENT OBJECTS
// ============================================================
const agents = {
  manager: {
    name: 'Manager', color: C.managerIndigo, home: 'boss',
    hairColor: '#1a1a2e', skinColor: '#c68642', sprites: SPRITES_MANAGER2, spriteScale: 1, _lastDY: 1, photoDir: 'Manager',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 315, y: 268 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
  jamesmie: {
    name: 'Jamesmie', color: C.jamesGold, home: 'boss',
    hairColor: '#1a0a00', skinColor: '#f5d5a0', sprites: SPRITES_JAMESMIE2, spriteScale: 1, _lastDY: 1, photoDir: 'Jamesmie',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 100, y: 320 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
  reader: {
    name: 'Reader', color: C.readerBlue, home: 'dev',
    hairColor: '#8b4513', skinColor: '#ffe0bd', sprites: SPRITES_READER2, spriteScale: 1, _lastDY: 1, photoDir: 'Reader',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 350, y: 300 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
  coder: {
    name: 'Editor', color: C.coderGreen, home: 'ops',
    hairColor: '#1a237e', skinColor: '#8d5524', sprites: SPRITES_CODER2, spriteScale: 1, _lastDY: 1, photoDir: 'Editor',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 110, y: 470 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
  searcher: {
    name: 'Searcher', color: C.searchOrange, home: 'dev',
    hairColor: '#6b0f1a', skinColor: '#e0ac69', sprites: SPRITES_SEARCHER2, spriteScale: 1, _lastDY: 1, photoDir: 'Searcher',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 500, y: 340 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
  writer: {
    name: 'Writer', color: C.writerTeal, home: 'dev',
    hairColor: '#0f3a35', skinColor: '#d9b38c', sprites: SPRITES_WRITER2, spriteScale: 1, _lastDY: 1, photoDir: 'Writer',
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 600, y: 250 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0,
  },
};

const _agentKeyCache = new Map();
const _agentKey = (ag) => {
  if (_agentKeyCache.has(ag)) return _agentKeyCache.get(ag);
  for (const [k, v] of Object.entries(agents)) {
    if (v === ag) { _agentKeyCache.set(ag, k); return k; }
  }
  return null;
};

// ============================================================
// MOVEMENT HELPERS
// ============================================================
// Walk an agent toward `target`, routing around furniture via the nav grid.
// A path of line-of-sight waypoints is computed once per target and followed;
// the final waypoint is the exact target (which may sit on the agent's own
// desk/coffee/sofa — that final hop is allowed to land on furniture).
const moveToward = (agent, target, dt) => {
  if (!target) return false;   // nothing to move toward this frame

  // Already essentially at the destination → hold position, don't re-plan.
  // A re-plan when the target sits inside furniture (a chair/desk) can snap the
  // path's approach cell to one side of the piece and yank the agent back out,
  // then pull it in again — the "walk in/out of the chair before sitting" jitter.
  // Once we're within arrival distance, just report arrived and stay put.
  if (Math.hypot(target.x - agent.pos.x, target.y - agent.pos.y) < 5) {
    agent._navTo = null;
    return true;
  }

  // (Re)plan whenever the destination changes.
  if (!agent._navTo || agent._navTo.x !== target.x || agent._navTo.y !== target.y) {
    agent._navTo = { x: target.x, y: target.y };
    const p = navPath(agent.pos, target);
    agent._navPath = (p ? p.slice(1) : []);   // drop the start cell
    agent._navPath.push({ x: target.x, y: target.y });
    agent._navIdx = 0;
  }

  const path = agent._navPath;
  let idx = agent._navIdx;
  while (idx < path.length - 1 &&
         Math.hypot(path[idx].x - agent.pos.x, path[idx].y - agent.pos.y) < 6) idx++;
  agent._navIdx = idx;

  const wp = path[idx];
  const dx = wp.x - agent.pos.x, dy = wp.y - agent.pos.y;
  const d = Math.hypot(dx, dy);
  if (d < 4) {
    if (idx === path.length - 1) { agent._navTo = null; return true; }   // arrived
    return false;
  }
  const step = Math.min(agent.speed * dt / 1000, d);
  agent.pos.x += (dx / d) * step;
  agent.pos.y += (dy / d) * step;
  agent._lastDY = dy;                 // face actual travel direction
  agent.facingLeft = dx < 0;
  // Actually stepped this frame → drive the walk cycle. Stationary agents never
  // reach here, so their legs hold on the stand frame (no marching in place).
  agent._moving = true;
  agent._walkPhase = (agent._walkPhase || 0) + dt * 0.018;   // drives the body bob (set in drawAgent)
  agent.frameTimer += dt;
  if (agent.frameTimer >= 120) { agent.frameTimer = 0; agent.frameIdx = (agent.frameIdx + 1) % 4; }
  return false;
};

// ============================================================
// BUBBLE DRAWING
// ============================================================
const drawBubble = (agent, text_, isTask) => {
  const bx = agent.pos.x;
  const by = agent.pos.y - (agent._sprH || 20 * S) - 14;
  ctx.save();
  ctx.font = '12px "Leelawadee UI","Tahoma",sans-serif';
  const measured = ctx.measureText(text_).width;
  const tw = Math.min(measured + 16, 140);
  const th = 22;
  const bx0 = bx - tw / 2;
  const by0 = by - th / 2;

  // Bubble background
  ctx.fillStyle = isTask ? 'rgba(30,30,60,0.92)' : 'rgba(45,53,97,0.92)';
  ctx.strokeStyle = isTask ? C.amber : C.purple;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx0, by0, tw, th, 5);
  ctx.fill();
  ctx.stroke();

  // Tail
  ctx.beginPath();
  ctx.moveTo(bx - 5, by0 + th);
  ctx.lineTo(bx, by0 + th + 7);
  ctx.lineTo(bx + 5, by0 + th);
  ctx.closePath();
  ctx.fillStyle = isTask ? 'rgba(30,30,60,0.92)' : 'rgba(45,53,97,0.92)';
  ctx.fill();

  // Text
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const display = text_.length > 22 ? text_.slice(0, 21) + '…' : text_;
  ctx.fillText(display, bx, by);
  ctx.restore();
};

// Editor-only task bubble: line 1 = filename (static), line 2 = a flowing
// marquee describing what changed. Wider/taller than the normal one-line bubble.
const drawDetailBubble = (agent, line1, line2, accent) => {
  accent = accent || C.coderGreen;
  const BW = 150, BH = 34, PAD = 9;
  const cx = agent.pos.x;
  const by0 = agent.pos.y - (agent._sprH || 20 * S) - 14 - BH;  // sit above the head
  const bx0 = cx - BW / 2;
  const innerL = bx0 + PAD, innerW = BW - PAD * 2;

  ctx.save();
  // background panel
  ctx.fillStyle = 'rgba(16,18,28,0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx0, by0, BW, BH, 6);
  ctx.fill();
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(cx - 5, by0 + BH);
  ctx.lineTo(cx, by0 + BH + 7);
  ctx.lineTo(cx + 5, by0 + BH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16,18,28,0.94)';
  ctx.fill();

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  // line 1 — title (static, ellipsised to fit)
  ctx.font = 'bold 11px "Leelawadee UI","Tahoma",sans-serif';
  ctx.fillStyle = C.white;
  let l1 = line1 || '';
  while (ctx.measureText(l1).width > innerW && l1.length > 1) l1 = l1.slice(0, -2) + '…';
  ctx.fillText(l1, innerL, by0 + 11);

  // line 2 — flowing marquee, clipped to the inner strip
  ctx.font = '10px "Leelawadee UI","Tahoma",sans-serif';
  ctx.fillStyle = shadeHex(accent, 1.35);
  const ly = by0 + 24;
  const tw = ctx.measureText(line2).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerL, by0 + 17, innerW, 14);
  ctx.clip();
  if (tw <= innerW) {
    ctx.fillText(line2, innerL, ly);
  } else {
    const period = tw + 36;                 // text width + trailing gap
    const off = (_lastTs * 0.045) % period;  // ~45 px/s right-to-left scroll
    ctx.fillText(line2, innerL - off, ly);
    ctx.fillText(line2, innerL - off + period, ly);   // seamless wrap copy
  }
  ctx.restore();
  ctx.restore();
};

// Single-row flowing message bubble — for spoken/relayed messages (Jamesmie's
// relay, Writer's narration, Manager's report). One line, marquee-scrolled.
const drawFlowBubble = (agent, text, accent) => {
  accent = accent || C.purple;
  const BW = 156, BH = 22, PAD = 9;
  const cx = agent.pos.x;
  const by0 = agent.pos.y - (agent._sprH || 20 * S) - 14 - BH;  // above the head
  const bx0 = cx - BW / 2;
  const innerL = bx0 + PAD, innerW = BW - PAD * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(16,18,28,0.94)';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(bx0, by0, BW, BH, 6);
  ctx.fill();
  ctx.stroke();
  // tail
  ctx.beginPath();
  ctx.moveTo(cx - 5, by0 + BH);
  ctx.lineTo(cx, by0 + BH + 7);
  ctx.lineTo(cx + 5, by0 + BH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16,18,28,0.94)';
  ctx.fill();
  // flowing single line, clipped
  ctx.font = '11px "Leelawadee UI","Tahoma",sans-serif';
  ctx.fillStyle = shadeHex(accent, 1.35);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const ly = by0 + BH / 2 + 1;
  const tw = ctx.measureText(text).width;
  ctx.save();
  ctx.beginPath();
  ctx.rect(innerL, by0 + 3, innerW, BH - 6);
  ctx.clip();
  if (tw <= innerW) {
    ctx.fillText(text, innerL, ly);
  } else {
    const period = tw + 44;
    const off = (_lastTs * 0.05) % period;   // ~50 px/s right-to-left
    ctx.fillText(text, innerL - off, ly);
    ctx.fillText(text, innerL - off + period, ly);
  }
  ctx.restore();
  ctx.restore();
};

// ============================================================
// REAL-IMAGE SPRITES: any agent with a `photoDir` draws reference PNGs
// (assets/<photoDir>/front.png + back.png) instead of its procedural sprite.
// Each image is processed ONCE on load — drop the transparent background (edge
// flood-fill), keep the largest CONNECTED blob after a small dilation (so sketchy
// line-art hair / a crown merge in rather than fragmenting away), trim the source's
// baked-in drop shadow, then crop to the content box so the sprite anchors at the
// feet. The scene then adds one clean contact shadow.
// Result is cached on the agent as `agent.photo = {front, back, aspect}`.
// Pure vanilla canvas; no deps. Falls back to the procedural sprite if the
// files are missing or the canvas is tainted (file:// — run via start.ps1).
// To add a character: drop the two PNGs in assets/<Name>/ and give that agent
// a matching `photoDir` in the roster — no other code change needed.
// ============================================================

// Separable Chebyshev max-filter = binary dilation by r (grows a 0/1 mask outward).
const _dilateMask = (m, w, h, r) => {
  const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dx = -r; dx <= r && !v; dx++) { const xx = x + dx; if (xx >= 0 && xx < w && m[row + xx]) v = 1; }
      a[row + x] = v;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0;
      for (let dy = -r; dy <= r && !v; dy++) { const yy = y + dy; if (yy >= 0 && yy < h && a[yy * w + x]) v = 1; }
      b[y * w + x] = v;
    }
  }
  return b;
};
// Binary erosion by r = invert → dilate → invert (shrinks a mask inward).
const _erodeMask = (m, w, h, r) => {
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < inv.length; i++) inv[i] = m[i] ? 0 : 1;
  const d = _dilateMask(inv, w, h, r);
  for (let i = 0; i < d.length; i++) d[i] = d[i] ? 0 : 1;
  return d;
};

const _processSprite = (img) => {
  const w = img.naturalWidth, h = img.naturalHeight;
  const oc = document.createElement('canvas'); oc.width = w; oc.height = h;
  const c = oc.getContext('2d', { willReadFrequently: true });
  c.drawImage(img, 0, 0);
  let d;
  try { d = c.getImageData(0, 0, w, h); } catch (e) { return null; }
  const p = d.data, N = w * h;
  // Backgrounds are exported transparent, so alpha alone identifies them. (The old
  // rgb>=230 "white background" rule wrongly ate light/white hair, which is line-art
  // drawn as sparse strokes over transparency — so it's gone.)
  const isBG = i => p[i * 4 + 3] < 16;
  // edge flood-fill: clear near-white background
  const seen = new Uint8Array(N), st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) {
    const i = st.pop(); if (seen[i]) continue; seen[i] = 1;
    if (!isBG(i)) continue; p[i * 4 + 3] = 0;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1);
    if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w);
  }
  // Keep the largest CONNECTED region, but first DILATE the opaque mask so that
  // sketchy line-art hair (thin strands separated by transparent gaps) and small
  // attached bits (e.g. a crown just above the head) bridge into the body's blob
  // instead of fragmenting into tiny components that get discarded. Labelling the
  // raw mask amputated all of that; truly detached marks farther than the bridge
  // distance (~6px) are still dropped.
  const op = new Uint8Array(N);
  for (let i = 0; i < N; i++) op[i] = p[i * 4 + 3] >= 16 ? 1 : 0;
  const dil = _dilateMask(op, w, h, 3);   // bridge gaps up to ~6px before labelling
  const lab = new Int32Array(N).fill(-1); let best = -1, bestN = 0, comp = 0;
  for (let s = 0; s < N; s++) {
    if (dil[s] && lab[s] === -1) {
      const id = comp++; let n = 0; const q = [s]; lab[s] = id;
      while (q.length) {
        const i = q.pop(); n++; const x = i % w, y = (i / w) | 0;
        if (x > 0 && lab[i - 1] === -1 && dil[i - 1]) { lab[i - 1] = id; q.push(i - 1); }
        if (x < w - 1 && lab[i + 1] === -1 && dil[i + 1]) { lab[i + 1] = id; q.push(i + 1); }
        if (y > 0 && lab[i - w] === -1 && dil[i - w]) { lab[i - w] = id; q.push(i - w); }
        if (y < h - 1 && lab[i + w] === -1 && dil[i + w]) { lab[i + w] = id; q.push(i + w); }
      }
      if (n > bestN) { bestN = n; best = id; }
    }
  }
  for (let i = 0; i < N; i++) if (lab[i] !== best) p[i * 4 + 3] = 0;

  // SOLIDIFY sparse line-art hair so a bright monitor behind a seated agent can't
  // shine THROUGH the hair. The source draws hair/caps as thin strokes with gaps;
  // shrunk to sprite size those gaps stay transparent and the screen bleeds through
  // (invisible over a dark wall, obvious over a lit screen — it reads as "cut").
  // Fix: CLOSE the silhouette (seal the thin sky-channels between strokes; dilate→
  // erode keeps the OUTER outline, so faces/limbs don't fatten and the leg gap stays
  // open), HOLE-FILL every region the close now encloses (any size — big interior
  // gaps included; spike-gaps still open to the sky are left alone), flood those with
  // the nearest real colour, then make the whole figure FULLY OPAQUE (no bleed).
  const CR = 4;
  const solid = new Uint8Array(N);
  for (let i = 0; i < N; i++) solid[i] = p[i * 4 + 3] >= 16 ? 1 : 0;
  const closed = _erodeMask(_dilateMask(solid, w, h, CR), w, h, CR);
  // Flood "outside" from the border through non-closed pixels; the figure (body +
  // enclosed holes) is everything the flood can't reach.
  const outside = new Uint8Array(N); const ost = [];
  const seedOut = i => { if (!closed[i] && !outside[i]) { outside[i] = 1; ost.push(i); } };
  for (let x = 0; x < w; x++) { seedOut(x); seedOut((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seedOut(y * w); seedOut(y * w + w - 1); }
  while (ost.length) {
    const i = ost.pop(), x = i % w, y = (i / w) | 0;
    if (x > 0) seedOut(i - 1); if (x < w - 1) seedOut(i + 1);
    if (y > 0) seedOut(i - w); if (y < h - 1) seedOut(i + w);
  }
  // Grassfire the nearest real colour into the filled (figure ∧ transparent) pixels.
  const done = new Uint8Array(N); done.set(solid);
  const isFill = j => !outside[j] && !solid[j];       // a figure pixel that needs colour
  const fillQ = [];
  for (let i = 0; i < N; i++) {
    if (!solid[i]) continue;
    const x = i % w, y = (i / w) | 0;
    if ((x > 0 && isFill(i - 1)) || (x < w - 1 && isFill(i + 1)) ||
        (y > 0 && isFill(i - w)) || (y < h - 1 && isFill(i + w))) fillQ.push(i);
  }
  for (let head = 0; head < fillQ.length; head++) {
    const i = fillQ[head], x = i % w, y = (i / w) | 0;
    const spread = (j) => {
      if (done[j] || !isFill(j)) return;
      done[j] = 1;
      p[j * 4] = p[i * 4]; p[j * 4 + 1] = p[i * 4 + 1]; p[j * 4 + 2] = p[i * 4 + 2];
      fillQ.push(j);
    };
    if (x > 0) spread(i - 1); if (x < w - 1) spread(i + 1);
    if (y > 0) spread(i - w); if (y < h - 1) spread(i + w);
  }
  for (let i = 0; i < N; i++) p[i * 4 + 3] = outside[i] ? 0 : 255;   // figure → fully opaque
  // trim the baked drop shadow: per column, clear the bottom-most opaque run if
  // it's too short to be a leg/shoe (= the thin shadow wing sticking out sideways)
  const minrun = Math.max(10, Math.round(h * 0.04));
  for (let x = 0; x < w; x++) {
    let yb = -1; for (let y = h - 1; y >= 0; y--) { if (p[(y * w + x) * 4 + 3] >= 40) { yb = y; break; } }
    if (yb < 0) continue;
    let run = 0, y = yb; while (y >= 0 && p[(y * w + x) * 4 + 3] >= 40) { run++; y--; }
    if (run < minrun) for (let yy = yb - run + 1; yy <= yb; yy++) p[(yy * w + x) * 4 + 3] = 0;
  }
  c.putImageData(d, 0, 0);
  // crop to the opaque content box so the sprite anchors at the feet (no margin float)
  let minx = w, miny = h, maxx = -1, maxy = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (p[(y * w + x) * 4 + 3] >= 40) {
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
  }
  if (maxx < 0) return null;
  const cw = maxx - minx + 1, ch = maxy - miny + 1;
  const crop = document.createElement('canvas'); crop.width = cw; crop.height = ch;
  crop.getContext('2d').drawImage(oc, minx, miny, cw, ch, 0, 0, cw, ch);
  return crop;
};

const _loadImg = src => new Promise((res, rej) => {
  const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(src); i.src = src;
});

const loadPhotoSprites = () => {
  Object.values(agents).filter(a => a.photoDir).forEach(agent => {
    Promise.all([_loadImg(`assets/${agent.photoDir}/front.png`),
                 _loadImg(`assets/${agent.photoDir}/back.png`)])
      .then(([f, b]) => {
        const F = _processSprite(f), B = _processSprite(b);
        if (F && B) agent.photo = {
          front: F, back: B,
          // Lock ONE shared on-screen aspect (mean of front & back) so the agent keeps
          // the same width whichever way it faces. The source PNGs are often drawn at
          // slightly different proportions; without this the body visibly "puffs up"
          // when turning around. Height still tracks the procedural grid, so it stays
          // the peers' height.
          aspect: ((F.width / F.height) + (B.width / B.height)) / 2,
        };
      })
      .catch(() => {});   // missing files / tainted canvas → keep the procedural sprite
  });
};

const drawAgent = (agent) => {
  // Seated = working, or in a flow phase past the walk to the desk.
  // While walking_desk the agent should still face its travel direction and animate.
  const seated =
    agent.state === 'working' ||
    agent.state === 'desk_linger' ||
    (agent.state === 'idle_desk'     && agent._deskArrived) ||
    (agent.state === 'writer_flow'   && agent._wPhase && agent._wPhase !== 'walking_desk') ||
    (agent.state === 'jamesmie_flow' && agent._jPhase && agent._jPhase !== 'walking_desk');

  let facing = (agent._lastDY < 0) ? 'up' : 'down';
  if (seated) facing = 'up';   // seated at desk → face the desk/monitor (back to viewer)
  const spr = agent.sprites[facing];

  let grid;
  if (seated || !agent._moving) {
    grid = spr.stand;           // stationary → hold the stand frame (legs still)
  } else {
    const wf = [spr.stand, spr.walk1, spr.stand, spr.walk2];
    grid = wf[agent.frameIdx];  // walking → cycle the legs
  }

  // Dimensions come from the chosen grid + per-sprite scale, so sprites of
  // different resolutions (e.g. high-res 24-wide at scale 2) render correctly.
  const sc = agent.spriteScale || S;
  // Agents with a processed photo draw the real PNG once it's ready; the height
  // matches the procedural sprite so they sit at the same scale as everyone else.
  const photo = agent.photo;
  const photoCanvas = photo ? (facing === 'up' ? photo.back : photo.front) : null;
  let sprW = grid[0].length * sc;
  let sprH = grid.length * sc;
  if (photoCanvas) sprW = Math.round(sprH * photo.aspect);
  agent._sprH = sprH;
  const x = Math.round(agent.pos.x - sprW / 2);
  const y = Math.round(agent.pos.y - sprH);
  // Body bob while walking — the sprite hops a couple px per step so the gait
  // reads lively instead of stiff. The name label below stays anchored.
  // Procedural pixel sprites keep a crisp integer hop (sub-pixel would blur them);
  // photo sprites have no leg frames, so they get a smooth raised-cosine bounce
  // (no cusp on footfall) + a side-to-side rock below, to read as a real gait.
  const walkP = agent._walkPhase || 0;
  const walking = agent._moving && !seated;
  const bob = !walking ? 0
    : photoCanvas ? ((1 - Math.cos(walkP * 2)) / 2) * 3.5
    : Math.round(Math.abs(Math.sin(walkP)) * 2.5);

  // Floor contact shadow grounds the character (skip when seated — feet are under the desk).
  if (!seated) {
    const shW = sprW * 0.30;
    ctx.save();
    ctx.translate(agent.pos.x, agent.pos.y);
    ctx.scale(1, 0.34);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, shW);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, shW, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (photoCanvas) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    if (walking) {                                 // gentle side-to-side rock keyed to the gait
      const sway = Math.sin(walkP) * 0.045;        // ~±2.6°, pivots at the feet so the head leads
      const footY = y + sprH - bob;
      ctx.translate(agent.pos.x, footY);
      ctx.rotate(sway);
      ctx.translate(-agent.pos.x, -footY);
    }
    ctx.drawImage(photoCanvas, x, y - bob, sprW, sprH);
    ctx.restore();
  } else {
    drawSprite(grid, x, y - bob, agent.color, agent.facingLeft, agent.hairColor, agent.skinColor, sc);
  }

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

  // Persistent "thinking" bubble above the head while actively doing something.
  // Suppressed while a flowing message bubble is up (the message replaces it).
  const busy = (agent.state === 'working' || agent.state === 'walking_to_desk' ||
               agent.state === 'jamesmie_flow' || agent.state === 'writer_flow' ||
               agent.state === 'mgr_dispatch' || agent.state === 'mgr_report') && !agent.flowMsg;
  if (busy) {
    const bob = Math.sin(_lastTs / 350 + agent.pos.x * 0.1) * 2;
    ctx.save();
    ctx.font = '15px "Leelawadee UI","Tahoma",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('💭', agent.pos.x + sprW * 0.5, y + 4 + bob);
    ctx.restore();
  }

  // Worker agents only show their task text once they've reached the desk —
  // while walking_to_desk just the 💭 thinking bubble is up.
  const atDesk = agent.state !== 'walking_to_desk';
  if (agent.taskDetail && atDesk) {
    drawDetailBubble(agent, agent.taskLabel, agent.taskDetail, agent.color);   // tools: name + flowing detail
  } else if (agent.flowMsg) {
    drawFlowBubble(agent, agent.flowMsg, agent.color);   // Jamesmie/Writer/Manager: 1-row flowing message
  } else if (agent.taskLabel && atDesk) {
    drawBubble(agent, agent.taskLabel, true);
  }
  if (agent.speechText) drawBubble(agent, agent.speechText, false);
};

// ============================================================
// GAME LOOP
// ============================================================
let _lastTs = 0;

// ============================================================
// IDLE STATE MACHINE HELPERS
// ============================================================
const CHAT_PHRASES = [
  'deploy แล้วหรือยัง?', 'วันนี้ busy มาก', 'กาแฟหมดแล้ว',
  'bug อีกแล้ว...', 'เดี๋ยว PR นะ', 'lunch กันไหม?',
  'review code ด้วยนะ', 'tests ผ่านแล้ว!',
];

const _pickIdleState = () => {
  const r = Math.random();
  if (r < 0.50) return 'idle_desk';     // mostly stay & work at own desk
  if (r < 0.65) return 'idle_phone';    // at desk
  if (r < 0.82) return 'idle_coffee';   // relax in the lounge
  if (r < 0.96) return 'idle_chill';    // lounge sofa
  return 'idle_wander';                 // rare stroll in own room
};

let _chatCheckTimer = 0;

const _checkChat = () => {
  const idleList = Object.values(agents).filter(ag =>
    ag !== agents.jamesmie &&
    ag.state.startsWith('idle') &&
    ag.state !== 'idle_chat' &&
    ag.state !== 'idle_chat_walk' &&
    ag.state !== 'idle_desk'
  );
  for (let i = 0; i < idleList.length; i++) {
    for (let j = i + 1; j < idleList.length; j++) {
      const a = idleList[i], b = idleList[j];
      if (Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y) < 80 && Math.random() < 0.30) {
        const phrase = CHAT_PHRASES[Math.floor(Math.random() * CHAT_PHRASES.length)];
        const midX = (a.pos.x + b.pos.x) / 2;
        const midY = (a.pos.y + b.pos.y) / 2;
        // release any queue slots so the coffee/sofa lines don't leak
        leaveAllQueues(_agentKey(a)); leaveAllQueues(_agentKey(b));
        a._coffeeArrived = a._sofaArrived = false;
        b._coffeeArrived = b._sofaArrived = false;
        a.state = 'idle_chat_walk'; a.targetPos = { x: midX - 24, y: midY };
        a._chatPhrase = phrase; a._chatMidX = midX; a.speechText = '';
        b.state = 'idle_chat_walk'; b.targetPos = { x: midX + 24, y: midY };
        b._chatPhrase = '😄'; b._chatMidX = midX; b.speechText = '';
      }
    }
  }
};

// ============================================================
// JAMESMIE TRIGGER FLOW
// ============================================================
let _lastJamesmieTs = 0;
// Live stand points: walk to wherever the OTHER character currently is (re-aimed
// every frame so the walker chases a moving target), standing just to one side
// so the two sprites don't overlap.
const managerStandPoint = () => {
  const m = agents.manager;
  return { x: m.pos.x - 32, y: m.pos.y };
};
const jamesmieStandPoint = () => {
  const j = agents.jamesmie;
  return { x: j.pos.x - 38, y: j.pos.y };
};
// Manager's pending assignments (filled from the tool-call log via _activateAgent).
let _mgrQueue = [];
const _mgrEnqueue = (key, label) => {
  if (!agents.manager || key === 'manager' || key === 'jamesmie') return;
  _mgrQueue.push({ key, label });
  if (_mgrQueue.length > 3) _mgrQueue.shift();   // don't let the Manager fall too far behind
};

// Pull the next job off the queue and send the Manager to that worker's desk.
// Returns true if a job was started, false if the queue was empty. Called both
// when the Manager is idle and right after an assignment finishes, so a burst of
// tool calls is handled as one continuous round — no return-to-chair between jobs.
const _mgrStartJob = (mgr) => {
  while (_mgrQueue.length) {
    const job = _mgrQueue.shift();
    const target = agents[job.key];
    const sp = SIT_POS[job.key];
    if (!target || !sp) continue;
    leaveAllQueues('manager');
    mgr._coffeeArrived = mgr._sofaArrived = false;
    mgr._idleInit = false;
    mgr.speechText = '';
    mgr.state = 'mgr_dispatch';
    mgr._mPhase = 'going';
    mgr._mTimer = 0;
    mgr._mTarget = { x: sp.x, y: sp.y + 34 };   // stand in front of the worker's desk
    mgr._waypoint = getWaypoint(mgr.pos, mgr._mTarget);
    mgr._mMsg = '→ ' + target.name + ': ' + job.label;
    return true;
  }
  return false;
};

const triggerJamesmie = (text, ts) => {
  if (!ts || ts <= _lastJamesmieTs) return;
  const jam = agents.jamesmie;
  if (jam.state === 'jamesmie_flow') return;   // already relaying
  _lastJamesmieTs = ts;
  leaveAllQueues('jamesmie');
  jam._coffeeArrived = false;
  jam._sofaArrived = false;

  jam.state = 'jamesmie_flow';
  jam._jMsg = text;                  // full text — it flows in the bubble
  jam._jPhase = 'to_mgr';            // walk to the Manager FIRST, then show your message
  jam._jTimer = 0;
  jam.targetPos = managerStandPoint();   // walk to the Manager character (chased per-frame)
  jam._waypoint = getWaypoint(jam.pos, jam.targetPos);
  jam.speechText = '';
  jam.flowMsg = '';
  jam.taskLabel = '';
  jam._idleInit = false;
  // Freeze the Manager in place so Jamesmie can reach him — unless he's mid
  // dispatch/report, which must finish on its own.
  const m = agents.manager;
  if (m && m.state.startsWith('idle')) {
    m.state = 'listening';
    m.targetPos = null;
    m._idleInit = false;
    m._listeningForJam = true;
  }
};

// When a task finishes, the Manager walks over to Jamesmie and reports the
// overview as flowing text. Just flag it here; the manager update loop starts
// the walk once the Manager is free of any in-progress dispatch.
let _lastReportTs = 0;
const triggerManagerReport = (text, ts) => {
  if (!ts || ts <= _lastReportTs) return;
  const mgr = agents.manager;
  if (!mgr || !text) return;
  _lastReportTs = ts;
  mgr._reportMsg = text;       // full text — flows across the bubble
  mgr._reportPending = true;
};

// The Writer voices the assistant's INTERMEDIATE narration (the text Claude says
// between tool calls) as a flowing 1-row bubble. Called repeatedly as narration
// updates; deduped by text so the same paragraph isn't repeated.
let _lastWriterTs = 0;
let _lastWriterText = '';

const triggerWriter = (text, ts) => {
  if (!ts || ts <= _lastWriterTs) return;
  if (text === _lastWriterText) { _lastWriterTs = ts; return; }  // same narration → skip
  _lastWriterTs = ts;
  _lastWriterText = text;
  const w = agents.writer;
  leaveAllQueues('writer');
  w._coffeeArrived = false;
  w._sofaArrived = false;
  w._idleInit = false;
  w.taskLabel = '';
  w.speechText = '';
  w._wMsg = text;                 // full text — flows across the bubble
  // already heading to / seated at the desk
  if (w.state === 'writer_flow' || w.state === 'desk_linger' || w.state === 'working') {
    // still walking to the desk → keep walking, show on arrival (don't freeze mid-room)
    if (w.state === 'writer_flow' && w._wPhase === 'walking_desk') return;
    w.state = 'writer_flow';
    w._wPhase = 'showing';
    w._wTimer = 0;
    w._lastDY = 1;
    w.flowMsg = text;
    w._wDwell = flowDwellMs(text);
    return;
  }
  // otherwise walk to the writer desk first, then show
  w.state = 'writer_flow';
  w._wPhase = 'walking_desk';
  w._wTimer = 0;
  w.flowMsg = '';
  w.targetPos = { ...SIT_POS.writer };
};

// ============================================================
// EVENT POLLING
// ============================================================
const _activateAgent = (agentKey, label, ts, detail) => {
  const ag = agents[agentKey];
  if (!ag || ts <= ag.lastEventTs) return;
  leaveAllQueues(agentKey);          // free any queue slot before working
  ag._coffeeArrived = false;
  ag._sofaArrived = false;
  _mgrEnqueue(agentKey, label);      // Manager will walk over and "assign" this
  ag.lastEventTs = ts;
  ag.taskLabel = label;
  ag.taskDetail = detail || '';      // 2nd line (Editor): what changed, flowing
  ag._detailScroll = 0;              // marquee offset, reset per task
  ag.speechText = '';
  ag.speechTimer = 0;
  ag._idleInit = false;
  // Already at the desk (working or lingering)? Resume in place — no walk back.
  if (ag.state === 'working' || ag.state === 'desk_linger') {
    ag.state = 'working';
    ag._workTimer = 30000;
    ag.speechText = '💻';
    ag.speechTimer = 1800;
    return;
  }
  ag.state = 'walking_to_desk';
  const dest = SIT_POS[agentKey] || WORK_POS[agentKey];
  ag.targetPos = { x: dest.x, y: dest.y };
};

let _lastProcessedTs = 0;
let _animQueue = [];
let _animBusy = false;

// Skip historical events on page load — only animate new ones
$.getJSON('./agent-events.json', { _: Date.now() })
  .done(data => {
    if (data.events && data.events.length > 0) {
      _lastProcessedTs = Math.max(...data.events.map(e => e.ts));
    }
    // Don't replay the last stored messages on refresh — seed the guards.
    if (data.user_message)      _lastJamesmieTs = data.user_message.timestamp || 0;
    if (data.writer_message)  { _lastWriterTs   = data.writer_message.timestamp || 0;
                                _lastWriterText = data.writer_message.text || ''; }
    if (data.assistant_response) _lastReportTs  = data.assistant_response.timestamp || 0;
  })
  .fail(() => {});

const _processAnimQueue = () => {
  if (_animBusy || _animQueue.length === 0) return;
  _animBusy = true;
  const ev = _animQueue.shift();
  _activateAgent(ev.agent, ev.label, ev.ts, ev.detail);
  setTimeout(() => { _animBusy = false; _processAnimQueue(); }, 2800);
};

const fetchEvents = () => {
  $.getJSON('./agent-events.json', { _: Date.now() })
    .done(data => {
      if (data.events) {
        const fresh = data.events.filter(e => e.ts > _lastProcessedTs);
        if (fresh.length > 0) {
          _lastProcessedTs = Math.max(...fresh.map(e => e.ts));
          _animQueue.push(...fresh);
          _processAnimQueue();
        }
      }
      if (data.user_message) {
        triggerJamesmie(data.user_message.text, data.user_message.timestamp);
      }
      if (data.writer_message) {   // intermediate narration → Writer voices it (flowing)
        triggerWriter(data.writer_message.text, data.writer_message.timestamp);
      }
      if (data.assistant_response) {   // final summary → Manager reports to Jamesmie (flowing)
        triggerManagerReport(data.assistant_response.text, data.assistant_response.timestamp);
      }
    });   // .fail → silently ignore (poll retries every 500ms)
};

setInterval(fetchEvents, 500);

const update = (dt) => {
  for (const ag of Object.values(agents)) {
    // Legs animate only while actually walking. moveToward() sets _moving=true on
    // a real step (and advances the walk frame there); reset it here each frame so
    // a stationary agent holds the stand frame instead of marching in place.
    ag._moving = false;
    // Tick speech bubble timer
    if (ag.speechTimer > 0) {
      ag.speechTimer -= dt;
      if (ag.speechTimer <= 0) ag.speechText = '';
    }
    // Tick task label done-flash timer
    if (ag._doneTimer !== undefined && ag._doneTimer > 0) {
      ag._doneTimer -= dt;
      if (ag._doneTimer <= 0) {
        ag._doneTimer = 0;
        ag.taskLabel = '';
        ag.taskDetail = '';
        ag.state = 'desk_linger';        // stay seated to avoid pacing back and forth
        ag._lingerTimer = DESK_LINGER_MS;
        ag.targetPos = null;
        ag.idleTimer = 0;
      }
    }
  }
  // ---- IDLE STATE MACHINE ----
  for (const ag of Object.values(agents)) {
    if (!ag.state.startsWith('idle')) continue;
    ag.idleTimer += dt;

    if (ag.state === 'idle_wander') {
      if (!ag.targetPos) {
        // Wander only within the agent's home room (coffee/sofa states still visit the lounge).
        const rm = ROOMS[ag.home] || ROOMS.dev;
        const m = 16;
        const x0 = rm.x + WALL + m, x1 = rm.x + rm.w - WALL - m;
        const y0 = rm.y + 30, y1 = rm.y + rm.h - WALL - m;
        let px, py, attempts = 0;
        do {
          px = x0 + Math.random() * (x1 - x0);
          py = y0 + Math.random() * (y1 - y0);
          attempts++;
        } while (isInsideObstacle(px, py) && attempts < 20);
        ag.targetPos = { x: px, y: py };
        ag._waypoint = getWaypoint(ag.pos, ag.targetPos);
        ag.idleDuration = 28000 + Math.random() * 6000;
      }
      const arrived = moveToward(ag, ag.targetPos, dt);
      if (arrived || ag.idleTimer > ag.idleDuration) {
        ag.idleTimer = 0;
        ag.targetPos = null;
        ag.state = _pickIdleState();
      }
    }

    else if (ag.state === 'idle_desk') {
      // relax at own desk: walk there, sit, show a chill emoji
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 28000 + Math.random() * 6000;
        const sp = SIT_POS[_agentKey(ag)];
        ag.targetPos = sp ? { x: sp.x, y: sp.y } : null;
        ag._deskEmoji = ['☕', '🎮', '😌', '🎧', '📖'][Math.floor(Math.random() * 5)];
      }
      if (!ag.targetPos) { ag._idleInit = false; ag.idleTimer = 0; ag.state = 'idle_wander'; continue; }
      const atDesk = moveToward(ag, ag.targetPos, dt);
      if (atDesk) {
        ag._lastDY = 1;            // face down (seated)
        if (!ag._deskArrived) {
          ag._deskArrived = true;
          ag.speechText = ag._deskEmoji;
          ag.speechTimer = ag.idleDuration;
        }
        if (ag.idleTimer > ag.idleDuration) {
          ag._idleInit = false;
          ag._deskArrived = false;
          ag.idleTimer = 0;
          ag.targetPos = null;
          ag.speechText = '';
          ag.state = 'idle_wander';
        }
      }
    }

    else if (ag.state === 'idle_phone') {
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 28000 + Math.random() * 6000;
        ag.speechText = '📱';
        ag.speechTimer = ag.idleDuration;
      }
      if (ag.idleTimer > ag.idleDuration) {
        ag._idleInit = false;
        ag.idleTimer = 0;
        ag.state = _pickIdleState();
      }
    }

    else if (ag.state === 'idle_coffee') {
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 28000 + Math.random() * 6000;
        const slot = joinQueue('coffee', _agentKey(ag));
        if (slot === -1) {              // queue full → do something else
          ag._idleInit = false;
          ag.idleTimer = 0;
          ag.targetPos = null;
          ag.state = 'idle_wander';
          continue;
        }
      }
      const spot = queueSlotPos('coffee', _agentKey(ag));
      if (spot) ag.targetPos = { x: spot.x, y: spot.y };
      if (!ag.targetPos) {            // dropped from queue → recover
        ag._idleInit = false; ag._coffeeArrived = false;
        ag.idleTimer = 0; ag.state = 'idle_wander'; continue;
      }
      const atSpot = moveToward(ag, ag.targetPos, dt);
      const atFront = queues.coffee.indexOf(_agentKey(ag)) === 0;
      if (atSpot && atFront && !ag._coffeeArrived) {
        ag._coffeeArrived = true;
        ag.speechText = '☕';
        ag.speechTimer = ag.idleDuration;
      }
      if (ag.idleTimer > ag.idleDuration) {
        leaveQueue('coffee', _agentKey(ag));
        ag._idleInit = false;
        ag._coffeeArrived = false;
        ag.idleTimer = 0;
        ag.targetPos = null;
        ag.state = _pickIdleState();
      }
    }

    else if (ag.state === 'idle_chill') {
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 28000 + Math.random() * 6000;
        const slot = joinQueue('sofa', _agentKey(ag));
        if (slot === -1) {
          ag._idleInit = false;
          ag.idleTimer = 0;
          ag.targetPos = null;
          ag.state = 'idle_wander';
          continue;
        }
      }
      const spot = queueSlotPos('sofa', _agentKey(ag));
      if (spot) ag.targetPos = { x: spot.x, y: spot.y };
      if (!ag.targetPos) {            // dropped from queue → recover
        ag._idleInit = false; ag._sofaArrived = false;
        ag.idleTimer = 0; ag.state = 'idle_wander'; continue;
      }
      const atSofa = moveToward(ag, ag.targetPos, dt);
      if (atSofa) {
        ag._lastDY = 1;   // sit facing out (toward the viewer)
        if (!ag._sofaArrived) {
          ag._sofaArrived = true;
          ag.speechText = '😴';
          ag.speechTimer = ag.idleDuration;
        }
      }
      if (ag.idleTimer > ag.idleDuration) {
        leaveQueue('sofa', _agentKey(ag));
        ag._idleInit = false;
        ag._sofaArrived = false;
        ag.idleTimer = 0;
        ag.targetPos = null;
        ag.state = _pickIdleState();
      }
    }

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
  }

  // ---- CHAT PROXIMITY CHECK (every 2s) ----
  _chatCheckTimer += dt;
  if (_chatCheckTimer > 2000) {
    _chatCheckTimer = 0;
    _checkChat();
  }
  // ---- ACTIVE TOOL STATES ----
  for (const ag of Object.values(agents)) {
    if (ag.state === 'walking_to_desk') {
      const arrived = moveToward(ag, ag.targetPos, dt);
      if (arrived) {
        ag._pendingComplete = false;
        ag.state = 'working';
        ag._workTimer = 30000;
        ag.speechText = '💻';
        ag.speechTimer = 1800;
      }
    }
    if (ag.state === 'working' && ag._workTimer > 0) {
      ag._workTimer -= dt;
      if (ag._workTimer <= 0) {
        ag.state = 'done_flash';
        ag.taskLabel = '✅ Done';
        ag._doneTimer = 1200;
      }
    }
    // 'done_flash' state: _doneTimer handled in the timer tick block above
    if (ag.state === 'desk_linger') {
      ag._lingerTimer -= dt;
      if (ag._lingerTimer <= 0) {
        ag.state = 'idle_wander';
        ag.targetPos = null;
        ag.idleTimer = 0;
      }
    }
  }
  // ---- JAMESMIE RELAY FLOW (walks to Manager, relays your message) ----
  const jam = agents.jamesmie;
  if (jam.state === 'jamesmie_flow') {
    jam._jTimer += dt;

    if (jam._jPhase === 'to_mgr') {
      const tgt = managerStandPoint();   // chase the Manager's live position
      jam.targetPos = tgt;
      const arrived = moveToward(jam, tgt, dt);
      if (arrived) {
        jam._jPhase = 'speaking';
        jam._jTimer = 0;
        const m0 = agents.manager;
        jam.facingLeft = m0 ? (m0.pos.x < jam.pos.x) : false;   // face the Manager
        jam.flowTitle = '📩 ข้อความจากคุณ'; // only NOW the message appears (after reaching Manager)
        jam.flowMsg = jam._jMsg;         // relay your words — flows across the bubble
        jam._speakDwell = flowDwellMs(jam._jMsg);   // stay until it scrolls one full pass
        jam.speechText = '';
        const m = agents.manager;        // manager "receives" → thinks
        if (m) { m._briefTimer = 2600; }
      }
    }
    else if (jam._jPhase === 'speaking') {
      if (jam._jTimer > (jam._speakDwell || 4500)) {
        jam._jPhase = null;
        jam.flowMsg = '';
        jam.flowTitle = '';
        jam.targetPos = null;
        jam.state = 'idle_wander';     // back to wandering the boss room
        jam._idleInit = false;
        jam.idleTimer = 0;
        const m = agents.manager;       // release the Manager back to wandering
        if (m && m._listeningForJam) {
          m._listeningForJam = false;
          if (m.state === 'listening') {
            m.state = 'idle_wander';
            m._idleInit = false;
            m.idleTimer = 0;
          }
        }
      }
    }
  }

  // ---- MANAGER DISPATCH FLOW (walks to each worker and assigns from the log) ----
  const mgr = agents.manager;
  if (mgr) {
    if (mgr._briefTimer > 0) {         // just briefed by Jamesmie → thinking
      mgr._briefTimer -= dt;
      mgr.speechText = '💭';
      mgr.speechTimer = 200;
    }
    // ---- TASK-DONE REPORT: walk to Jamesmie and report the overview ----
    // Start only when free of an in-progress dispatch (let the current assignment finish).
    if (mgr._reportPending && mgr.state !== 'mgr_report' && mgr.state !== 'mgr_dispatch') {
      mgr._reportPending = false;
      const jam2 = agents.jamesmie;
      leaveAllQueues('manager');
      mgr._coffeeArrived = mgr._sofaArrived = false;
      mgr._idleInit = false;
      mgr.taskLabel = '';
      mgr.speechText = '';
      mgr.state = 'mgr_report';
      mgr._rPhase = 'going';
      mgr._rTimer = 0;
      // walk to the Jamesmie character (chased per-frame); freeze him to listen
      mgr._rTarget = jamesmieStandPoint();
      mgr._waypoint = getWaypoint(mgr.pos, mgr._rTarget);
      if (jam2.state !== 'jamesmie_flow') {
        jam2.state = 'listening';
        jam2.targetPos = null;
        jam2._idleInit = false;
      }
    }
    if (mgr.state === 'mgr_report') {
      mgr._rTimer += dt;
      const jam2 = agents.jamesmie;
      if (mgr._rPhase === 'going') {
        const tgt = jamesmieStandPoint();     // chase Jamesmie's live position
        mgr._rTarget = tgt;
        const arr = moveToward(mgr, tgt, dt);
        if (arr || mgr._rTimer > 7000) {     // arrived (or give up walking) → report
          mgr._rPhase = 'reporting';
          mgr._rTimer = 0;
          mgr.facingLeft = (jam2.pos.x < mgr.pos.x);
          mgr.flowTitle = '📋 สรุปงานเสร็จ';
          mgr.flowMsg = mgr._reportMsg;       // overview — flows across the bubble
          mgr._reportDwell = flowDwellMs(mgr._reportMsg);   // stay until it scrolls once
          jam2.speechText = '👂';
          jam2.speechTimer = mgr._reportDwell + 500;
        }
      } else if (mgr._rPhase === 'reporting') {
        if (jam2.state === 'listening') jam2.facingLeft = (mgr.pos.x < jam2.pos.x);  // face the boss
        if (mgr._rTimer > (mgr._reportDwell || 6000)) {
          mgr._rPhase = null;
          mgr.flowMsg = '';
          mgr.flowTitle = '';
          mgr.state = 'idle_wander';
          mgr._idleInit = false;
          mgr.idleTimer = 0;
          mgr.targetPos = null;
          if (jam2.state === 'listening') {   // release Jamesmie back to wandering
            jam2.state = 'idle_wander';
            jam2._idleInit = false;
            jam2.idleTimer = 0;
            jam2.speechText = '';
          }
        }
      }
    } else if (mgr.state === 'mgr_dispatch') {
      mgr._mTimer += dt;
      if (mgr._mPhase === 'going') {
        const arr = moveToward(mgr, mgr._mTarget, dt);
        if (arr) { mgr._mPhase = 'assigning'; mgr._mTimer = 0; mgr.taskLabel = mgr._mMsg; }
      } else if (mgr._mPhase === 'assigning') {
        if (mgr._mTimer > 1700) {
          // Drain the queue in ONE outing: if more jobs are waiting, walk straight
          // to the next worker instead of returning to idle (which would bounce the
          // Manager back toward his chair and out again — the "in/out of chair" jitter).
          mgr.taskLabel = '';
          if (!_mgrStartJob(mgr)) {
            mgr._mPhase = null;
            mgr.targetPos = null;
            mgr.state = 'idle_wander';   // queue empty → home-confined wander back to the boss room
            mgr._idleInit = false;
            mgr.idleTimer = 0;
          }
        }
      }
    } else if (mgr.state.startsWith('idle') && _mgrQueue.length) {
      _mgrStartJob(mgr);
    }
  }

  // ---- WRITER FLOW ----
  const wrt = agents.writer;
  if (wrt.state === 'writer_flow') {
    wrt._wTimer += dt;

    if (wrt._wPhase === 'walking_desk') {
      const arrived = moveToward(wrt, SIT_POS.writer, dt);
      if (arrived) {
        wrt._wPhase = 'showing';
        wrt._wTimer = 0;
        wrt._lastDY = 1;            // seated, facing the desk
        wrt.flowMsg = wrt._wMsg;    // narration flows 1-row above the head
        wrt._wDwell = flowDwellMs(wrt._wMsg);   // stay until it scrolls one full pass
      }
    }
    else if (wrt._wPhase === 'showing') {
      if (wrt._wTimer > (wrt._wDwell || 5000)) {     // shown long enough → settle at the desk
        wrt._wPhase = null;
        wrt.flowMsg = '';
        wrt.state = 'desk_linger';       // linger at desk like the others
        wrt._lingerTimer = DESK_LINGER_MS;
        wrt.targetPos = null;
        wrt._idleInit = false;
        wrt.idleTimer = 0;
      }
    }
  }
};

// When an agent is seated (facing the desk, back to viewer), draw the chair
// back OVER its lower body — so the chair occludes the legs from the front,
// aligned with the screen the agent is working at. Called per-agent from the
// depth-sorted draw loop, immediately after the seated agent is drawn, so it
// covers ONLY that agent's legs — agents drawn later (walking in front) render
// on top of the chair and stay visible.
const drawChairBack = (key, ag) => {
  const seated =
    ag.state === 'working' ||
    ag.state === 'desk_linger' ||
    (ag.state === 'idle_desk'   && ag._deskArrived) ||
    (ag.state === 'writer_flow' && ag._wPhase && ag._wPhase !== 'walking_desk');
  if (!seated) return;
  const sp = SIT_POS[key];
  if (!sp) return;
  // Each chair-back is tinted to its own desk's base color — derive a 4-tone
  // palette (body / cushion / top trim / seam) from the desk hue, the same way
  // the manager chair does. jamesmie keeps the warm wood backrest.
  const DESK_BASE = {
    reader:   WORK_WOODS[0],   // walnut
    searcher: WORK_WOODS[1],   // oak
    writer:   WORK_WOODS[2],   // cherry
    coder:    C.deskGaming,    // gaming desk (cool indigo)
    manager:  '#2c2940',       // manager desk
  };
  const base = DESK_BASE[key];
  const C4 = base
    ? [base, shadeHex(base, 1.18), shadeHex(base, 1.5), shadeHex(base, 0.6)]
    : ['#3a2c1a', '#4a3a26', '#6a5240', '#52402c'];   // jamesmie — wood
  const cw = 34, x = Math.round(sp.x - cw / 2), y = Math.round(sp.y - 13), h = 24;
  shadow(x, y, cw, h);
  rect(x, y, cw, h, C4[0]);                 // chair body
  rect(x + 3, y + 2, cw - 6, h - 5, C4[1]); // cushion
  rect(x + 3, y, cw - 6, 3, C4[2]);         // top trim
  rect(x + cw / 2 - 2, y + 4, 4, h - 8, C4[3]); // center seam
};

// Subtle tiled floor per room — drawn over the floor fill, under furniture.
const drawFloors = () => {
  if (!_floorCache) buildFloorCache();
  // source is W*DPR×H*DPR, dest is W×H user units → 1:1 crisp through the DPR transform.
  ctx.drawImage(_floorCache, 0, 0, W, H);
};

// Screen content + glow, desk accessories, and wall decor — over furniture, under agents.
const drawDetails = () => {
  const SCREENS = [
    { x: 57,  y: 109, w: 34, h: 22, k: 'code' },  // boss (Jamesmie)
    { x: 297, y: 99,  w: 36, h: 22, k: 'code' },  // manager
    { x: 492, y: 109, w: 36, h: 24, k: 'code' },  // dev 1
    { x: 662, y: 109, w: 36, h: 24, k: 'code' },  // dev 2
    { x: 785, y: 109, w: 36, h: 24, k: 'code' },  // dev 3 (writer)
    { x: 97,  y: 364, w: 36, h: 24, k: 'term' },  // ops 1 (Editor, shifted right)
  ];
  const CODE = ['#e06c75', '#61afef', '#98c379', '#c678dd', '#e5c07b'];
  for (const s of SCREENS) {
    // Screen glow at half strength/spread (was r*1.6 @ 1.05).
    bloom(s.x + s.w / 2, s.y + s.h / 2, s.w * 1.15,
          s.k === 'term' ? 'rgba(60,230,130,0.7)' : 'rgba(110,165,255,0.7)', 0.52);
    if (s.k === 'term') {
      for (let i = 0; i < 4; i++) rect(s.x + 3, s.y + 3 + i * 5, (i % 2 ? 12 : 22), 2, '#1aff6a');
    } else {
      for (let i = 0; i < 5; i++) rect(s.x + 3, s.y + 3 + i * 4, 8 + (i * 11 % 22), 2, CODE[i % 5]);
    }
    // keyboard + mug on the desk in front of the screen
    const kcx = s.x + s.w / 2, ky = s.y + s.h + 3;
    rect(kcx - 13, ky, 26, 8, '#15151f');
    for (let rr = 0; rr < 2; rr++) for (let cc = 0; cc < 6; cc++) rect(kcx - 11 + cc * 4, ky + 2, 2, 2, '#3a3a4a');
    rect(s.x + s.w + 3, s.y + 4, 6, 6, '#d05a3a');           // mug
    rect(s.x + s.w + 4, s.y + 5, 4, 3, '#f0e0c0');
  }

  // wall decor: clocks + a framed poster
  const clock = (x, y) => {
    rect(x, y, 14, 14, '#15151a'); rect(x + 1, y + 1, 12, 12, '#e8e8e8');
    rect(x + 6, y + 3, 2, 4, '#15151a'); rect(x + 7, y + 7, 4, 2, '#15151a');
  };
  const frame = (x, y, w, h, col) => {
    rect(x, y, w, h, '#3a2a1a'); rect(x + 2, y + 2, w - 4, h - 4, col);
    rect(x + 2, y + 2, w - 4, 2, 'rgba(255,255,255,0.22)');
  };
  clock(ROOMS.boss.x + 200, ROOMS.boss.y + WALL + 4);
  clock(ROOMS.dev.x + 300, ROOMS.dev.y + WALL + 6);
  frame(ROOMS.lounge.x + 36, ROOMS.lounge.y + WALL + 4, 30, 22, '#2d6b8b');
  frame(ROOMS.ops.x + 130, ROOMS.ops.y + WALL + 4, 26, 20, '#6b2d6b');
};

// Wall + surface decor (all non-blocking). Drawn over furniture, under agents.
const drawDecor = () => {
  // ── windows on outer walls (night skyline) ──
  drawWindow(152, 48, 46, 26);     // boss
  drawWindow(466, 48, 64, 26);     // dev

  // ── framed wall art / posters ──
  drawWallArt(224, 50, 28, 20, '#2d5b8b');   // boss
  drawWallArt(700, 50, 26, 20, '#7a3a8b');   // dev
  drawWallArt(782, 50, 26, 20, '#3a7a5b');   // dev
  drawWallArt(540, 312, 26, 20, '#8b6a2d');  // lounge
  drawWallArt(30,  306, 28, 20, '#2d6b6b');  // ops

  // ── subtle neon accent under each room label (theme color) ──
  const NEON = [
    ['boss',   '#ffd700', 'rgba(255,215,0,0.5)'],
    ['dev',    '#22c55e', 'rgba(34,197,94,0.5)'],
    ['ops',    '#34d36a', 'rgba(34,197,94,0.5)'],
    ['lounge', '#f0a850', 'rgba(240,168,80,0.5)'],
  ];
  for (const [k, col, g] of NEON) {
    const rm = ROOMS[k];
    drawNeonSign(rm.x + rm.w / 2 - 22, rm.y + 27, 44, col, g);
  }

  // ── sticky notes on the whiteboards ──
  const NOTE = ['#ffe14d', '#ff8fb0', '#7fe0ff'];
  [[52, 56], [66, 55], [80, 57]].forEach(([nx, ny], i) => rect(nx, ny, 7, 7, NOTE[i]));     // boss
  [[572, 56], [588, 55], [604, 57]].forEach(([nx, ny], i) => rect(nx, ny, 7, 7, NOTE[i]));  // dev

  // ── energy-drink cans on the dev desks ──
  const CAN = ['#e11d48', '#22c55e', '#3b82f6'];
  [560, 730, 853].forEach((cx, i) => {       // reader / coder / writer desk corners
    rect(cx, 140, 5, 9, CAN[i]); rect(cx, 140, 5, 2, 'rgba(255,255,255,0.4)');
  });

  // ── ops floor cables snaking out of the racks ──
  rect(360, 360, 46, 3, 'rgba(8,8,12,0.7)');
  rect(360, 402, 46, 2, 'rgba(8,8,12,0.7)');
  rect(356, 360, 6, 44, 'rgba(8,8,12,0.7)');
};

const draw = () => {
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  ctx.translate(0, -HEADER_H);   // header cropped → shift the whole world up
  drawAllRooms();
  drawFloors();
  drawAmbient();
  drawAllFurniture();
  drawDecor();
  drawDetails();
  const sorted = Object.entries(agents).sort((a, b) => a[1].pos.y - b[1].pos.y);
  for (const [key, ag] of sorted) {
    drawAgent(ag);
    drawChairBack(key, ag);   // cover this agent's legs only; later agents render on top
  }
  ctx.restore();
};

const loop = (ts) => {
  const dt = Math.min(ts - _lastTs, 100);
  _lastTs = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
};

loadPhotoSprites();    // async — agents with a photoDir swap to their real PNGs once ready
requestAnimationFrame(ts => { _lastTs = ts; requestAnimationFrame(loop); });
