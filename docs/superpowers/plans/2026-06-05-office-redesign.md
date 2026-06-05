# Office Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the office visualization feel full and alive — agents sit at desks when working, Jamesmie delegates with a thinking phase, agents queue at shared spots, rooms get themed furniture, and a 5th "Writer" agent animates the assistant's text reply.

**Architecture:** Stay within the existing single-file canvas game loop (`office.html`) and the Python hook (`log-event.py`). No render-pipeline refactor. Sitting is achieved with a desk-front overlay pass drawn after agents. The Writer is triggered by a new `Stop` hook that parses the transcript for the latest assistant text.

**Tech Stack:** Plain HTML5 Canvas + vanilla JS (`office.html`), Python 3 stdlib (`log-event.py`), JSON file as shared state (`agent-events.json`), Claude Code hooks (global `~/.claude/settings.json`).

**Spec:** `docs/superpowers/specs/2026-06-05-office-redesign-design.md`

---

## Testing Note

This project has **no automated test framework** for the canvas UI — verification is **visual** (run the app, observe behavior). `log-event.py` is pure logic and **is** unit-tested with a standalone Python script (Task 1).

**To run the app for visual checks:**
```powershell
.\start.ps1
# opens http://localhost:8765/office.html
```

**To simulate an event without real Claude hooks**, edit `agent-events.json` directly (the browser polls it every 500ms). Each task below gives the exact JSON to paste.

**Commit cadence:** commit after each task's verification passes.

---

## File Structure

| File | Responsibility | Change type |
|------|----------------|-------------|
| `log-event.py` | Hook entry; maps events → `agent-events.json`. Add `stop` mode + transcript parse. | Modify |
| `test_log_event.py` | Standalone unit test for transcript parsing. | Create |
| `~/.claude/settings.json` | Global hook config. Add `Stop` hook. | Modify |
| `office.html` | All visualization: agents, sprites, furniture, render loop, polling. | Modify (the bulk) |
| `agent-events.json` | Runtime shared state. Gains `assistant_response` key at runtime (no code change needed — it's written by `log-event.py`). | Runtime only |

---

## Task 1: `log-event.py` — `stop` mode + transcript parsing

Add a `stop` mode that reads the `Stop` hook payload, finds the latest assistant text message in the transcript, and writes it to `agent-events.json` under `assistant_response`.

**Files:**
- Modify: `log-event.py`
- Create: `test_log_event.py`

- [ ] **Step 1: Write the failing test**

Create `test_log_event.py`:

```python
import json, os, tempfile, importlib.util
from pathlib import Path

# Load log-event.py as a module (filename has a hyphen)
spec = importlib.util.spec_from_file_location(
    "log_event", str(Path(__file__).parent / "log-event.py"))
log_event = importlib.util.module_from_spec(spec)
spec.loader.exec_module(log_event)


def _write_transcript(lines):
    fd, path = tempfile.mkstemp(suffix=".jsonl")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        for obj in lines:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    return path


def test_extracts_last_assistant_text():
    path = _write_transcript([
        {"type": "user", "message": {"content": "hi"}},
        {"type": "assistant", "message": {"content": [
            {"type": "text", "text": "first reply"},
        ]}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {}},
            {"type": "text", "text": "สวัสดีครับ ทำเสร็จแล้ว"},
        ]}},
    ])
    assert log_event.last_assistant_text(path) == "สวัสดีครับ ทำเสร็จแล้ว"
    os.unlink(path)


def test_returns_none_when_no_assistant_text():
    path = _write_transcript([
        {"type": "user", "message": {"content": "hi"}},
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "name": "Read", "input": {}},
        ]}},
    ])
    assert log_event.last_assistant_text(path) is None
    os.unlink(path)


def test_missing_file_returns_none():
    assert log_event.last_assistant_text("/no/such/file.jsonl") is None


if __name__ == "__main__":
    test_extracts_last_assistant_text()
    test_returns_none_when_no_assistant_text()
    test_missing_file_returns_none()
    print("ALL PASS")
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```powershell
python test_log_event.py
```
Expected: FAIL — `AttributeError: module 'log_event' has no attribute 'last_assistant_text'`

- [ ] **Step 3: Add `last_assistant_text` to `log-event.py`**

Insert this function after `extract_label` (before `atomic_write`):

```python
def last_assistant_text(transcript_path):
    """Return the latest assistant text message from a JSONL transcript, or None."""
    try:
        lines = Path(transcript_path).read_text(encoding='utf-8').splitlines()
    except Exception:
        return None
    for ln in reversed(lines):
        try:
            obj = json.loads(ln)
        except Exception:
            continue
        if obj.get('type') != 'assistant':
            continue
        content = obj.get('message', {}).get('content', [])
        if not isinstance(content, list):
            continue
        texts = [c.get('text') for c in content
                 if isinstance(c, dict) and c.get('type') == 'text' and c.get('text')]
        if texts:
            return texts[-1]
    return None
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```powershell
python test_log_event.py
```
Expected: `ALL PASS`

- [ ] **Step 5: Add the `stop` mode handler**

In `main()`, add this block immediately after the `if mode == 'user':` block (after its `sys.exit(0)`):

```python
    if mode == 'stop':
        transcript_path = payload.get('transcript_path', '')
        text = last_assistant_text(transcript_path)
        if text:
            existing['assistant_response'] = {'text': text[:200], 'timestamp': ts}
            atomic_write(events_path, existing)
        sys.exit(0)
```

- [ ] **Step 6: Manually verify `stop` mode end-to-end**

Run (PowerShell) — feeds a fake Stop payload pointing at a temp transcript:

```powershell
$t = New-TemporaryFile
@'
{"type":"assistant","message":{"content":[{"type":"text","text":"งานเสร็จแล้วครับ"}]}}
'@ | Out-File -FilePath $t.FullName -Encoding utf8
$payload = @{ transcript_path = $t.FullName } | ConvertTo-Json -Compress
$payload | python log-event.py stop
python -c "import json;print(json.load(open('agent-events.json',encoding='utf-8')).get('assistant_response'))"
```
Expected: prints a dict like `{'text': 'งานเสร็จแล้วครับ', 'timestamp': <number>}`

- [ ] **Step 7: Commit**

```powershell
git add log-event.py test_log_event.py
git commit -m "feat: log-event.py stop mode parses transcript for assistant reply"
```

---

## Task 2: Wire the `Stop` hook

Register the new mode in the global hook config so Claude Code calls it when a response finishes.

**Files:**
- Modify: `~/.claude/settings.json` (the `hooks` object)

- [ ] **Step 1: Add the `Stop` hook entry**

In `~/.claude/settings.json`, inside the `"hooks"` object (sibling of `PreToolUse`/`PostToolUse`/`UserPromptSubmit`), add:

```json
"Stop": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "python \"C:\\Users\\rapheephat_ju\\Workspace\\ส. ขอนแก่น\\Project\\Claude Agent Office\\log-event.py\" stop"
      }
    ]
  }
]
```

Match the exact `command` path format used by the existing `UserPromptSubmit` hook (absolute path, `stop` argument).

- [ ] **Step 2: Verify JSON is valid**

Run:
```powershell
python -c "import json,os;json.load(open(os.path.expanduser('~/.claude/settings.json'),encoding='utf-8'));print('valid')"
```
Expected: `valid`

- [ ] **Step 3: Note for user**

The `Stop` hook only fires on the **next** Claude Code session start (settings load at startup). Visual end-to-end verification of the Writer (Task 8) can be done by manually writing `assistant_response` to `agent-events.json` until then.

No commit (global settings file is outside the repo).

---

## Task 3: Sitting mechanic (existing 4 agents)

Make agents sit *behind* their desks when `working`: walk to a chair point, face down, pause animation, and let a desk-front overlay hide their legs.

**Files:**
- Modify: `office.html` (constants near `WORK_POS`; `draw()`; `drawAgent` working pose)

- [ ] **Step 1: Add `SIT_POS` and `DESK_FRONTS` constants**

In `office.html`, immediately after the `WORK_POS` definition (around line 111), add:

```js
// "In-chair" point behind each desk: agent walks here to sit and work.
const SIT_POS = {
  jamesmie: { x: 100, y: 150 },  // boss desk 25..175 x, 100..155 y
  reader:   { x: 527, y: 148 },  // dev desk 480..575 x, 100..150 y
  coder:    { x: 697, y: 148 },  // dev desk 650..745 x, 100..150 y
  searcher: { x: 72,  y: 400 },  // ops desk 25..120 x, 355..405 y
};

// Lower band of each desk, redrawn over a sitting agent to occlude the legs.
const DESK_FRONTS = {
  jamesmie: { x: 25,  y: 138, w: 150, h: 22, color: C.deskWalnut },
  reader:   { x: 480, y: 132, w: 95,  h: 22, color: C.deskGaming },
  coder:    { x: 650, y: 132, w: 95,  h: 22, color: C.deskGaming },
  searcher: { x: 25,  y: 387, w: 95,  h: 22, color: C.deskGaming },
};
```

- [ ] **Step 2: Point activation at `SIT_POS` instead of `WORK_POS`**

In `_activateAgent` (around line 858), change the target line from:

```js
    ag.targetPos = { x: WORK_POS[agentKey].x, y: WORK_POS[agentKey].y };
```
to:
```js
    const dest = SIT_POS[agentKey] || WORK_POS[agentKey];
    ag.targetPos = { x: dest.x, y: dest.y };
```

- [ ] **Step 3: Force "down" facing + paused animation while working**

In `drawAgent` (around line 747), replace the facing/grid block:

```js
  const facing = (agent._lastDY < 0) ? 'up' : 'down';
  const spr = agent.sprites[facing];

  let grid;
  if (agent.state === 'idle_chill' || agent.state === 'idle_phone') {
    grid = spr.stand;
  } else {
    const wf = [spr.stand, spr.walk1, spr.stand, spr.walk2];
    grid = wf[agent.frameIdx];
  }
```
with:
```js
  let facing = (agent._lastDY < 0) ? 'up' : 'down';
  if (agent.state === 'working') facing = 'down';
  const spr = agent.sprites[facing];

  let grid;
  if (agent.state === 'idle_chill' || agent.state === 'idle_phone' || agent.state === 'working') {
    grid = spr.stand;
  } else {
    const wf = [spr.stand, spr.walk1, spr.stand, spr.walk2];
    grid = wf[agent.frameIdx];
  }
```

- [ ] **Step 4: Add the desk-front overlay pass**

Add this function just before `function draw()` (around line 1119):

```js
function drawDeskFronts() {
  for (const [key, ag] of Object.entries(agents)) {
    if (ag.state !== 'working') continue;
    const d = DESK_FRONTS[key];
    if (!d) continue;
    rect(d.x, d.y, d.w, d.h, d.color);
    rect(d.x, d.y, d.w, 3, 'rgba(255,255,255,0.08)');  // top highlight edge
  }
}
```

Then in `draw()`, insert the call between the agent loop and `drawHeader()`:

```js
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawAllRooms();
  drawAllFurniture();
  const sorted = Object.values(agents).sort((a, b) => a.pos.y - b.pos.y);
  for (const ag of sorted) drawAgent(ag);
  drawDeskFronts();        // NEW
  drawHeader();
}
```

- [ ] **Step 5: Set the `💻` working bubble**

In `update(dt)`, find the `walking_to_desk` → `working` transition (around line 1060) and set a working bubble when work begins:

```js
    if (ag.state === 'walking_to_desk') {
      const arrived = moveToward(ag, ag.targetPos, dt);
      if (arrived) {
        ag._pendingComplete = false;
        ag.state = 'working';
        ag._workTimer = 1800;
        ag.speechText = '💻';
        ag.speechTimer = 1800;
      }
    }
```

- [ ] **Step 6: Visual verification**

Run `.\start.ps1`. In another terminal, simulate Reader working by writing to `agent-events.json`:

```powershell
python -c "import json,time;p='agent-events.json';d=json.load(open(p,encoding='utf-8'));ts=int(time.time()*1000);d.setdefault('events',[]).append({'agent':'reader','label':'📖 test.js','ts':ts});json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)"
```
Expected in browser: Reader walks up to the dev desk, faces down, stops animating, shows `💻`, and the desk redraws over its legs so it looks seated. After ~3s it returns to idle (legs reappear, desk-front gone).

Repeat for `coder`, `searcher` (and `jamesmie` via Task 4). Fine-tune `SIT_POS`/`DESK_FRONTS` y-values by eye if legs peek out or the head is hidden.

- [ ] **Step 7: Commit**

```powershell
git add office.html
git commit -m "feat: sitting mechanic — desk-front overlay hides legs while working"
```

---

## Task 4: Jamesmie delegation flow (speak → think → dispatch)

Replace the walk-to-center behavior with: walk to own desk, sit, speak the user's message, show a thinking bubble, show a dispatch gesture, then remain working.

**Files:**
- Modify: `office.html` (`triggerJamesmie`, the Jamesmie active-flow block in `update`)

- [ ] **Step 1: Rework `triggerJamesmie`**

Replace the body of `triggerJamesmie` (around line 829) with:

```js
function triggerJamesmie(text, ts) {
  if (!ts || ts <= _lastJamesmieTs) return;
  const jam = agents.jamesmie;
  if (jam.state === 'working' || jam.state === 'walking_to_desk') return;
  _lastJamesmieTs = ts;

  const truncated = text.length > 40 ? text.slice(0, 39) + '…' : text;
  jam.state = 'jamesmie_flow';
  jam._jMsg = truncated;
  jam._jPhase = 'walking_desk';
  jam._jTimer = 0;
  jam.targetPos = { ...SIT_POS.jamesmie };
  jam.speechText = '';
  jam.taskLabel = '';
  jam._idleInit = false;
}
```

- [ ] **Step 2: Replace the Jamesmie active-flow block in `update`**

Replace the entire `if (jam.state === 'jamesmie_stand') { ... }` block (around lines 1079–1116) with:

```js
  // ---- JAMESMIE DELEGATION FLOW ----
  const jam = agents.jamesmie;
  if (jam.state === 'jamesmie_flow') {
    jam._jTimer += dt;

    if (jam._jPhase === 'walking_desk') {
      const arrived = moveToward(jam, SIT_POS.jamesmie, dt);
      if (arrived) {
        jam._jPhase = 'speaking';
        jam._jTimer = 0;
        jam._lastDY = 1;               // face down (seated)
        jam.speechText = jam._jMsg;    // your voice
        jam.speechTimer = 3000;
      }
    }
    else if (jam._jPhase === 'speaking') {
      if (jam._jTimer > 3000) {
        jam._jPhase = 'thinking';
        jam._jTimer = 0;
        jam._thinkDots = 0;
        jam.speechText = '💭';
      }
    }
    else if (jam._jPhase === 'thinking') {
      // animate dots: . .. ...
      jam._thinkDots = (jam._thinkDots || 0) + dt;
      const n = 1 + (Math.floor(jam._thinkDots / 400) % 3);
      jam.speechText = '💭' + '.'.repeat(n);
      jam.speechTimer = 500;
      if (jam._jTimer > 2000) {
        jam._jPhase = 'dispatch';
        jam._jTimer = 0;
        jam.taskLabel = '📋 สั่งงาน!';
        // face toward the team (dev room is to the right)
        jam.facingLeft = false;
      }
    }
    else if (jam._jPhase === 'dispatch') {
      if (jam._jTimer > 1500) {
        jam._jPhase = null;
        jam.taskLabel = '';
        jam.speechText = '';
        jam.state = 'working';   // settle into seated working pose
        jam._workTimer = 4000;
      }
    }
  }
```

- [ ] **Step 3: Visual verification**

Run `.\start.ps1`. Simulate a user message:

```powershell
python -c "import json,time;p='agent-events.json';d=json.load(open(p,encoding='utf-8'));d['user_message']={'text':'ช่วย refactor ระบบ login หน่อย','timestamp':int(time.time()*1000)};json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)"
```
Expected sequence in browser: Jamesmie walks to the boss desk and sits (legs hidden by desk-front) → 💬 shows the message ~3s → 💭 with animating dots ~2s → `📋 สั่งงาน!` label ~1.5s → settles into seated working pose → returns to idle after the work timer.

- [ ] **Step 4: Commit**

```powershell
git add office.html
git commit -m "feat: Jamesmie delegation flow — speak, think, dispatch at desk"
```

---

## Task 5: Queue system (coffee + sofa)

Replace single shared idle points with ordered slots so agents line up instead of overlapping.

**Files:**
- Modify: `office.html` (constants; `idle_coffee` / `idle_chill` handlers; `_activateAgent` cleanup)

- [ ] **Step 1: Add queue data + helpers**

After the `IDLE_POS` definition (around line 115), add:

```js
const QUEUE_SPOTS = {
  coffee: [
    { x: 855, y: 355 },  // slot 0 — at the machine (brewing)
    { x: 855, y: 385 },  // slot 1 — first in line
    { x: 855, y: 415 },  // slot 2 — second in line
  ],
  sofa: [
    { x: 545, y: 428 },  // slot 0 — left seat
    { x: 595, y: 428 },  // slot 1 — right seat
  ],
};
const queues = { coffee: [], sofa: [] };  // arrays of agent keys; index = slot

function joinQueue(name, key) {
  const q = queues[name];
  if (q.includes(key)) return q.indexOf(key);
  if (q.length >= QUEUE_SPOTS[name].length) return -1;  // full
  q.push(key);
  return q.length - 1;
}

function leaveQueue(name, key) {
  const q = queues[name];
  const i = q.indexOf(key);
  if (i !== -1) q.splice(i, 1);  // everyone behind shifts forward by index
}

function leaveAllQueues(key) {
  leaveQueue('coffee', key);
  leaveQueue('sofa', key);
}

function queueSlotPos(name, key) {
  const i = queues[name].indexOf(key);
  return i === -1 ? null : QUEUE_SPOTS[name][i];
}
```

- [ ] **Step 2: Rewrite the `idle_coffee` handler**

Replace the entire `else if (ag.state === 'idle_coffee') { ... }` block (around lines 984–1007) with:

```js
    else if (ag.state === 'idle_coffee') {
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 5000 + Math.random() * 8000;
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
```

- [ ] **Step 3: Rewrite the `idle_chill` handler to use the sofa queue**

Replace the entire `else if (ag.state === 'idle_chill') { ... }` block (around lines 1009–1032) with:

```js
    else if (ag.state === 'idle_chill') {
      if (!ag._idleInit) {
        ag._idleInit = true;
        ag.idleDuration = 7000 + Math.random() * 10000;
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
      const atSofa = moveToward(ag, ag.targetPos, dt);
      if (atSofa && !ag._sofaArrived) {
        ag._sofaArrived = true;
        ag.speechText = '😴';
        ag.speechTimer = ag.idleDuration;
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
```

- [ ] **Step 4: Add the `_agentKey` helper**

Agents are stored in the `agents` object but each agent doesn't know its own key. Add this helper after the `agents` object definition (around line 674):

```js
const _agentKeyCache = new Map();
function _agentKey(ag) {
  if (_agentKeyCache.has(ag)) return _agentKeyCache.get(ag);
  for (const [k, v] of Object.entries(agents)) {
    if (v === ag) { _agentKeyCache.set(ag, k); return k; }
  }
  return null;
}
```

- [ ] **Step 5: Free queue slots when an agent is activated by a tool**

In `_activateAgent` (around line 849), add a cleanup call right after fetching the agent:

```js
function _activateAgent(agentKey, label, ts) {
  const ag = agents[agentKey];
  if (!ag || ts <= ag.lastEventTs) return;
  leaveAllQueues(agentKey);          // NEW: free any queue slot before working
  ag._coffeeArrived = false;
  ag._sofaArrived = false;
  ag.lastEventTs = ts;
  // ... rest unchanged
```

Also add the same cleanup at the start of `triggerJamesmie` (after the early-returns, before setting state) so Jamesmie frees slots too:

```js
  _lastJamesmieTs = ts;
  leaveAllQueues('jamesmie');        // NEW
```

- [ ] **Step 6: Visual verification**

Run `.\start.ps1` and watch idle agents. Over time multiple agents should head for coffee — they must form a vertical line at x≈855 (slots y=355/385/415), not stack on one spot. The front agent shows `☕`. When it leaves, the next shifts forward. The sofa should seat at most 2 (left/right), no overlap. If a tool event fires for a queued agent, it should leave cleanly and the line should advance.

- [ ] **Step 7: Commit**

```powershell
git add office.html
git commit -m "feat: slot-based queue for coffee and sofa, with interrupt cleanup"
```

---

## Task 6: Furniture per room + NAV_OBSTACLES

Fill the four rooms with themed furniture and register solid pieces as navigation obstacles. Build on existing draw helpers; add new ones only where needed.

**Files:**
- Modify: `office.html` (new draw helpers; `drawAllFurniture`; `NAV_OBSTACLES`)

- [ ] **Step 1: Add new furniture draw helpers**

After `drawCoffeeMachineTopDown` (around line 276), add:

```js
function drawWhiteboardTopDown(x, y, w) {
  shadow(x, y, w, 18);
  rect(x, y, w, 18, '#e8e8e8');
  rect(x + 2, y + 2, w - 4, 14, '#f8f8f8');
  // scribbles
  rect(x + 6,  y + 5, 18, 2, '#2d6b8b');
  rect(x + 28, y + 8, 24, 2, '#8b1a1a');
  rect(x + 6,  y + 11, 30, 2, '#1a7a1a');
  rect(x + w - 22, y + 5, 16, 8, '#444');  // a box/diagram
}

function drawCabinetTopDown(x, y, w, h) {
  shadow(x, y, w, h);
  rect(x, y, w, h, '#3a3a4a');
  rect(x + 3, y + 3, w - 6, (h - 9) / 2, '#2a2a38');
  rect(x + 3, y + 6 + (h - 9) / 2, w - 6, (h - 9) / 2, '#2a2a38');
  rect(x + w / 2 - 2, y + 6, 4, 3, '#888');  // handle
}

function drawFridgeTopDown(x, y) {
  shadow(x, y, 26, 30);
  rect(x, y, 26, 30, '#d8dde2');
  rect(x + 2, y + 2, 22, 12, '#c0c8d0');
  rect(x + 2, y + 16, 22, 12, '#c0c8d0');
  rect(x + 20, y + 5, 3, 6, '#888');  // handle
}

function drawTVTopDown(x, y, w) {
  shadow(x, y, w, 20);
  rect(x, y, w, 20, '#0a0a0a');
  rect(x + 3, y + 3, w - 6, 14, '#1a2a4a');
  rect(x + 6, y + 6, w - 12, 8, '#2d4a7a');
}

function drawMonitorPanelTopDown(x, y, w) {
  shadow(x, y, w, 18);
  rect(x, y, w, 18, '#0a1a0a');
  for (let i = 0; i < 4; i++) {
    rect(x + 4 + i * ((w - 8) / 4), y + 4, (w - 8) / 4 - 3, 10, '#0a2a0a');
    rect(x + 6 + i * ((w - 8) / 4), y + 7, 6, 2, '#22c55e');
  }
}

function drawCrateTopDown(x, y, s) {
  shadow(x, y, s, s);
  rect(x, y, s, s, '#5a4326');
  rect(x + 2, y + 2, s - 4, s - 4, '#6b4f2d');
  rect(x, y + s / 2 - 1, s, 2, '#3a2a16');
  rect(x + s / 2 - 1, y, 2, s, '#3a2a16');
}
```

- [ ] **Step 2: Add furniture to each room in `drawAllFurniture`**

In `drawAllFurniture` (around line 347), add the following at the end of each room's section.

BOSS ROOM — after the existing plant line:
```js
  // boss extras
  drawRugTopDown(br.x + 20, br.y + 55, 165, 65);
  drawWhiteboardTopDown(br.x + 40, br.y + WALL + 4, 110);
  drawSofaTopDown(br.x + 30, br.y + 195, 90, 30);
  drawCoffeeTableTopDown(br.x + 50, br.y + 232, 50, 18);
  drawCabinetTopDown(br.x + 195, br.y + 95, 30, 60);
```

DEV ROOM — after the server rack line:
```js
  // dev extras
  drawWhiteboardTopDown(dr.x + 110, dr.y + WALL + 4, 120);
  drawFridgeTopDown(dr.x + ROOM_W - 42, dr.y + ROOM_H - 40);
  drawCrateTopDown(dr.x + 30, dr.y + ROOM_H - 40, 24);
  drawCrateTopDown(dr.x + 58, dr.y + ROOM_H - 36, 20);
  drawPlantTopDown(dr.x + 150, dr.y + ROOM_H - 36);
```

OPS ROOM — after the two wall screens:
```js
  // ops extras: second workstation + extra racks + monitoring + crates
  drawGamingDeskTopDown(or.x + 170, or.y + 55, 95, 50);
  rect(or.x + 180, or.y + 62, 40, 28, '#1a2a3a');
  rect(or.x + 182, or.y + 64, 36, 24, '#001a00');
  drawGamingChairTopDown(or.x + 185, or.y + 120);
  drawServerRackTopDown(or.x + ROOM_W - 45, or.y + WALL + 10);
  drawServerRackTopDown(or.x + ROOM_W - 45, or.y + WALL + 75);
  drawMonitorPanelTopDown(or.x + 340, or.y + WALL + 4, 95);
  drawCrateTopDown(or.x + 300, or.y + ROOM_H - 38, 24);
```

LOUNGE — after the second plant line:
```js
  // lounge extras
  drawTVTopDown(lg.x + 120, lg.y + WALL + 4, 130);
  drawBookshelfTopDown(lg.x + WALL + 6, lg.y + 60, 24, 110);
  drawPlantTopDown(lg.x + 250, lg.y + ROOM_H - 38);
```

- [ ] **Step 3: Register new solid obstacles in `NAV_OBSTACLES`**

Append these entries to the `NAV_OBSTACLES` array (around line 119) — coordinates are absolute (room offset already applied):

```js
  // boss extras
  { x: 30,  y: 235, w: 90,  h: 30 },   // boss guest sofa
  { x: 195, y: 135, w: 30,  h: 60 },   // boss cabinet
  // dev extras
  { x: 858, y: 300, w: 26,  h: 30 },   // dev fridge
  { x: 480, y: 300, w: 52,  h: 24 },   // dev crates
  // ops extras
  { x: 195, y: 410, w: 95,  h: 50 },   // ops second desk + chair
  { x: 855, y: 350, w: 28,  h: 55 },   // ops extra rack (lower)
  { x: 855, y: 425, w: 28,  h: 55 },   // ops extra rack
  // lounge extras
  { x: 464, y: 360, w: 24,  h: 110 },  // lounge bookshelf
```

Note: confirm the ops racks at x≈855 don't collide with the coffee queue (lounge is x≥450, ops is x<450 — these ops racks belong in the OPS room at `or.x + ROOM_W - 45 = 0 + 405 = 405`). **Correction:** ops room `or.x = 0`, so `or.x + ROOM_W - 45 = 405`. Update the two ops rack obstacles to `x: 405`:

```js
  { x: 405, y: 350, w: 28,  h: 55 },   // ops extra rack (lower)
  { x: 405, y: 425, w: 28,  h: 55 },   // ops extra rack
```
And the `drawServerRackTopDown` calls in Step 2 use `or.x + ROOM_W - 45` which already equals 405 — consistent.

- [ ] **Step 4: Visual verification**

Run `.\start.ps1`. Each room should look fuller: boss has whiteboard + guest sofa + cabinet + rug; dev has whiteboard + fridge + crates + plant + (Writer's desk comes in Task 7); ops has a second workstation + extra racks + monitoring panel; lounge has a TV + bookshelf + extra plant. Let several idle agents wander for ~30s and confirm they route **around** the new furniture (no walking through the sofa, cabinet, fridge, racks, or bookshelf).

- [ ] **Step 5: Commit**

```powershell
git add office.html
git commit -m "feat: themed furniture for all rooms + nav obstacles"
```

---

## Task 7: Writer agent — sprite, data, desk

Add the 5th agent (teal), its sprite, its third desk in the dev room, and its sit/desk-front entries.

**Files:**
- Modify: `office.html` (color; sprite parts; sprite set; `agents`; `SIT_POS`/`DESK_FRONTS`; `drawAllFurniture` dev desk)

- [ ] **Step 1: Add the Writer color**

In the `C` color object (around line 87), add after `searchOrange`:

```js
  writerTeal:   '#14b8a6',
```

- [ ] **Step 2: Add Writer sprite parts**

After `SEARCHER_UPPER_UP` (around line 595), add:

```js
const WRITER_UPPER_DOWN = [
  '.....hhhhh......',  // 0 short neat hair
  '....hssssshh....',  // 1
  '....hse.esh.....',  // 2 eyes
  '....hsssssh.....',  // 3
  '.....sssss......',  // 4 neck
  '....wbbbbbw.....',  // 5 collar
  '...bbbbbbbbb....',  // 6 shoulders
  '..sbbbbbbbbs....',  // 7 hands
  '....bbbbbbb.....',  // 8
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14
];

const WRITER_UPPER_UP = [
  '.....hhhhh......',  // 0
  '....hhhhhhh.....',  // 1
  '....hhhhhh......',  // 2 back of head
  '....hhhhhh......',  // 3
  '.....sssss......',  // 4 neck
  '....bbbbbbb.....',  // 5
  '...bbbbbbbbb....',  // 6
  '..sbbbbbbbbs....',  // 7
  '....bbbbbbb.....',  // 8
  '....bbbbbbb.....',  // 9
  '....bbbbbbb.....',  // 10
  '....bbbbbbb.....',  // 11
  '....bbbbbbb.....',  // 12
  '....bbbbbbb.....',  // 13
  '.....lllll......',  // 14
];

const SPRITES_WRITER = {
  down: { stand: [...WRITER_UPPER_DOWN, ...LEGS_TD_STAND], walk1: [...WRITER_UPPER_DOWN, ...LEGS_TD_WALK1], walk2: [...WRITER_UPPER_DOWN, ...LEGS_TD_WALK2] },
  up:   { stand: [...WRITER_UPPER_UP,   ...LEGS_TD_STAND], walk1: [...WRITER_UPPER_UP,   ...LEGS_TD_WALK1], walk2: [...WRITER_UPPER_UP,   ...LEGS_TD_WALK2] },
};
```

- [ ] **Step 3: Add the Writer agent object**

In the `agents` object (around line 674), add after `searcher`:

```js
  writer: {
    name: 'Writer', color: C.writerTeal,
    hairColor: '#0f3a35', sprites: SPRITES_WRITER, _lastDY: 1,
    _chatPhrase: '', _chatMidX: 0, _waypoint: null,
    pos: { x: 600, y: 250 }, targetPos: null,
    speed: 85, state: 'idle_wander',
    frameIdx: 0, frameTimer: 0,
    idleTimer: 0, idleDuration: 5000 + Math.random() * 10000,
    facingLeft: false,
    taskLabel: '', speechText: '', speechTimer: 0,
    lastEventTs: 0, lastCompletedTs: 0,
  },
```

- [ ] **Step 4: Add Writer to `SIT_POS` and `DESK_FRONTS`**

In `SIT_POS` (Task 3) add:
```js
  writer:   { x: 820, y: 148 },  // dev third desk 773..868 x, 100..150 y
```
In `DESK_FRONTS` add:
```js
  writer:   { x: 773, y: 132, w: 95,  h: 22, color: C.deskGaming },
```

- [ ] **Step 5: Draw the Writer's third desk in the dev room**

In `drawAllFurniture`, in the DEV ROOM section, add a third gaming desk + chair:

```js
  drawGamingDeskTopDown(dr.x + 323, dr.y + 60, 95, 50);  // 450+323=773
  rect(dr.x + 333, dr.y + 67, 40, 28, '#1a2a3a');
  rect(dr.x + 335, dr.y + 69, 36, 24, '#0f2035');
  drawGamingChairTopDown(dr.x + 338, dr.y + 125);
```

And register the desk in `NAV_OBSTACLES`:
```js
  { x: 773, y: 100, w: 95, h: 50 },   // writer desk (dev third)
```

- [ ] **Step 6: Visual verification**

Run `.\start.ps1`. A teal "Writer" agent should appear, wandering and idling like the others, with a third desk visible on the right side of the dev room. Simulate Writer working to confirm sit/occlusion:

```powershell
python -c "import json,time;p='agent-events.json';d=json.load(open(p,encoding='utf-8'));d['assistant_response']={'text':'ทดสอบ','timestamp':int(time.time()*1000)};json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)"
```
(The full Writer flow is wired in Task 8 — for now just confirm the agent and desk render and that the agent can sit at `SIT_POS.writer` with the desk-front hiding its legs once Task 8 makes it walk there.)

- [ ] **Step 7: Commit**

```powershell
git add office.html
git commit -m "feat: add Writer agent (5th) with sprite and third dev desk"
```

---

## Task 8: Writer trigger flow + polling

Poll `assistant_response` from `agent-events.json` and run the Writer's animation: walk to desk, type, show the real reply text, return to idle.

**Files:**
- Modify: `office.html` (a `triggerWriter` function; `fetchEvents`; a Writer flow block in `update`)

- [ ] **Step 1: Add `_lastWriterTs` and `triggerWriter`**

After the `_lastJamesmieTs` declaration / `triggerJamesmie` function (around line 844), add:

```js
let _lastWriterTs = 0;

function triggerWriter(text, ts) {
  if (!ts || ts <= _lastWriterTs) return;
  const w = agents.writer;
  if (w.state === 'working' || w.state === 'walking_to_desk' || w.state === 'writer_flow') return;
  _lastWriterTs = ts;
  leaveAllQueues('writer');
  const truncated = text.length > 40 ? text.slice(0, 39) + '…' : text;
  w.state = 'writer_flow';
  w._wMsg = truncated;
  w._wPhase = 'walking_desk';
  w._wTimer = 0;
  w.targetPos = { ...SIT_POS.writer };
  w.speechText = '';
  w.taskLabel = '';
  w._idleInit = false;
}
```

- [ ] **Step 2: Poll `assistant_response` in `fetchEvents`**

In `fetchEvents` (around line 910), after the `if (data.user_message) { ... }` block, add:

```js
    if (data.assistant_response) {
      triggerWriter(data.assistant_response.text, data.assistant_response.timestamp);
    }
```

- [ ] **Step 3: Add the Writer flow block in `update`**

After the Jamesmie flow block (end of `update`, around line 1116), add:

```js
  // ---- WRITER FLOW ----
  const wrt = agents.writer;
  if (wrt.state === 'writer_flow') {
    wrt._wTimer += dt;

    if (wrt._wPhase === 'walking_desk') {
      const arrived = moveToward(wrt, SIT_POS.writer, dt);
      if (arrived) {
        wrt._wPhase = 'typing';
        wrt._wTimer = 0;
        wrt._lastDY = 1;            // face down (seated)
        wrt.speechText = '✍️';
        wrt.speechTimer = 1500;
      }
    }
    else if (wrt._wPhase === 'typing') {
      if (wrt._wTimer > 1500) {
        wrt._wPhase = 'replying';
        wrt._wTimer = 0;
        wrt.speechText = wrt._wMsg;   // real reply text
        wrt.speechTimer = 3500;
      }
    }
    else if (wrt._wPhase === 'replying') {
      if (wrt._wTimer > 3500) {
        wrt._wPhase = null;
        wrt.speechText = '';
        wrt.state = 'idle_wander';
        wrt.targetPos = null;
        wrt._idleInit = false;
        wrt.idleTimer = 0;
      }
    }
  }
```

- [ ] **Step 4: Keep the Writer seated (desk-front) during the reply phases**

The desk-front overlay only triggers on `state === 'working'`. To occlude the Writer's legs while typing/replying, update `drawDeskFronts` (Task 3) to also cover agents in the writer/jamesmie seated phases:

```js
function drawDeskFronts() {
  for (const [key, ag] of Object.entries(agents)) {
    const seated =
      ag.state === 'working' ||
      (ag.state === 'writer_flow' && ag._wPhase && ag._wPhase !== 'walking_desk') ||
      (ag.state === 'jamesmie_flow' && ag._jPhase && ag._jPhase !== 'walking_desk');
    if (!seated) continue;
    const d = DESK_FRONTS[key];
    if (!d) continue;
    rect(d.x, d.y, d.w, d.h, d.color);
    rect(d.x, d.y, d.w, 3, 'rgba(255,255,255,0.08)');
  }
}
```

Also force the seated facing in `drawAgent` for these phases — update the working-facing line (Task 3 Step 3):

```js
  let facing = (agent._lastDY < 0) ? 'up' : 'down';
  if (agent.state === 'working' || agent.state === 'writer_flow' || agent.state === 'jamesmie_flow') facing = 'down';
  const spr = agent.sprites[facing];

  let grid;
  if (agent.state === 'idle_chill' || agent.state === 'idle_phone' ||
      agent.state === 'working' || agent.state === 'writer_flow' || agent.state === 'jamesmie_flow') {
    grid = spr.stand;
  } else {
    const wf = [spr.stand, spr.walk1, spr.stand, spr.walk2];
    grid = wf[agent.frameIdx];
  }
```

Note: during `walking_desk` the agent is still moving, so the `stand` frame is acceptable (it just won't animate the walk for that ~1s) — or leave walking_desk out by checking `_wPhase`/`_jPhase`. Keep it simple: the above pauses animation for the whole seated flow, which reads fine.

- [ ] **Step 5: Visual verification (full Writer flow)**

Run `.\start.ps1`. Simulate an assistant reply:

```powershell
python -c "import json,time;p='agent-events.json';d=json.load(open(p,encoding='utf-8'));d['assistant_response']={'text':'แก้ไขเสร็จแล้วครับ ลองทดสอบดูได้เลย','timestamp':int(time.time()*1000)};json.dump(d,open(p,'w',encoding='utf-8'),ensure_ascii=False)"
```
Expected: the teal Writer walks to its dev desk, sits (legs hidden) → ✍️ ~1.5s → 💬 shows the real reply text ~3.5s → returns to idle.

- [ ] **Step 6: End-to-end with real hooks (after restarting Claude Code)**

Restart Claude Code so the `Stop` hook loads. Send any message and let Claude reply. Confirm the Writer animates the actual reply automatically, and that `agent-events.json` gains a fresh `assistant_response` after each turn.

- [ ] **Step 7: Commit**

```powershell
git add office.html
git commit -m "feat: Writer flow — animate assistant reply from Stop hook"
```

---

## Task 9: Final integration pass

Confirm all five features coexist without regressions.

**Files:** none (verification only)

- [ ] **Step 1: Full visual sweep**

Run `.\start.ps1` and over ~2 minutes confirm:
- Idle agents wander, queue at coffee (line of up to 3) and sofa (up to 2), and chat — no overlapping stacks.
- Triggering a tool event makes the right agent walk to its desk and **sit** (desk hides legs), show `💻`, then flash `✅ Done`.
- A `user_message` runs Jamesmie's speak → think → dispatch at the boss desk.
- An `assistant_response` runs the Writer's type → reply at the dev desk.
- All rooms look full; pathfinding avoids all furniture.

- [ ] **Step 2: Regression check on event queue**

Fire several tool events in quick succession (paste the Task 3 snippet 3× with different agents). Confirm the existing `_animQueue` still serializes them (one activation every ~2.8s) and no agent gets stuck seated.

- [ ] **Step 3: Final commit (if any tweaks were made)**

```powershell
git add -A
git commit -m "chore: office redesign integration tweaks"
```

---

## Self-Review Notes

- **Spec coverage:** Sitting (Task 3), Jamesmie flow (Task 4), Queue (Task 5), Furniture (Task 6), Writer (Tasks 1,2,7,8). All five spec components mapped.
- **`SIT_POS`/`DESK_FRONTS` coordinates** are starting values derived from current desk geometry; the plan instructs visual fine-tuning (Task 3 Step 6) since exact pixel alignment depends on the sprite. This is expected for a canvas layout, not a placeholder.
- **Type/name consistency:** `joinQueue`/`leaveQueue`/`leaveAllQueues`/`queueSlotPos`/`_agentKey` used consistently across Tasks 5/7/8. `assistant_response` key consistent across `log-event.py` (Task 1), polling (Task 8). `writer_flow`/`_wPhase`/`jamesmie_flow`/`_jPhase` states consistent across Tasks 4/7/8.