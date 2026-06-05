# Design — Live-target walking, full-message dwell, and Writer fix

Date: 2026-06-06
Scope: `office.html` agent state machine (no hook/data changes)

## Problem

Three behaviour issues observed in the live office:

1. **Jamesmie** relays the user's message by walking to a *hardcoded* point beside
   the Manager desk (`MGR_MEET`), not to the Manager character — if the Manager
   has wandered off, Jamesmie talks to an empty chair. He also leaves after a
   fixed `4500ms`, so a long message is cut off before it finishes scrolling.
2. **Manager** reports the final summary by capturing Jamesmie's position *once*
   and walking to that stale point; leaves after a fixed `6000ms`, cutting long
   reports off mid-scroll.
3. **Writer** never shows a clean narration bubble over its head. Data flow
   (`writer_message`) and rendering (`drawFlowBubble`) are both correct; the bug
   is that a narration update arriving *while the Writer is still walking to its
   desk* force-flips it to the `showing` phase mid-walk, freezing it at a random
   spot instead of presenting cleanly at the desk.

## Decisions (from brainstorming)

- "Wait for the message to finish" = wait for the marquee to scroll **one full
  pass** of the text, then return. Short text that doesn't scroll uses a minimum
  readable dwell.
- When the target character is moving, the walker **chases until it reaches**
  the target (re-aim the destination every frame), rather than aiming at a frozen
  snapshot.
- Writer's narration **should show** (currently broken) — present it cleanly at
  the desk.

## Design

### Shared helper: full-pass dwell

`flowDwellMs(text)` returns how long a flow bubble must stay up to scroll once:

```
const FLOW_SPEED = 0.05;      // px/ms — matches drawFlowBubble
const FLOW_INNER = 192;       // BW(210) - PAD*2(18)
const FLOW_GAP   = 44;        // trailing gap used in drawFlowBubble's period
const FLOW_MIN   = 3000;      // min readable dwell for non-scrolling text
function flowDwellMs(text) {
  const tw = measureFlowText(text);          // ctx.measureText at the bubble font
  if (tw <= FLOW_INNER) return FLOW_MIN;     // fits — no scroll
  return Math.max(FLOW_MIN, (tw + FLOW_GAP) / FLOW_SPEED);
}
```

Measured once when the speaking/reporting/showing phase begins; stored on the
agent (e.g. `_speakDwell`) and compared against the phase timer.

### 1. Jamesmie → live Manager

- Replace the fixed `MGR_MEET` destination with a point offset to the Manager's
  **current** position, recomputed each frame: stand ~32px to the Manager's left.
- `to_mgr` phase: `moveToward(jam, managerStandPoint(), dt)` with the target
  recomputed every frame (chase). On arrival → `speaking`, show relay, set
  `_speakDwell = flowDwellMs(text)`.
- `speaking` phase: return to idle when `_jTimer > _speakDwell` (was `4500`).
- Keep the existing Manager "receives → thinks" `_briefTimer` cue.

### 2. Manager → live Jamesmie

- Replace the one-shot `_rTarget` snapshot with a per-frame recomputed point
  ~38px from Jamesmie's **current** position; chase until reached.
- Still freeze Jamesmie into `listening` (stand still to receive), unless he is
  mid-relay (`jamesmie_flow`).
- `reporting` phase: return when `_rTimer > _reportDwell` where
  `_reportDwell = flowDwellMs(text)` (was `6000`). Release Jamesmie as today.

### 3. Writer reliability

- In `triggerWriter`, when the Writer is already in `writer_flow` **and still in
  the `walking_desk` phase**, do NOT flip to `showing`. Just update the pending
  text (`_wMsg`) and keep walking. Only the `desk_linger` / `working` (seated)
  cases show in place.
- `walking_desk` → on arrival set `showing`, `flowMsg = _wMsg`, and
  `_wDwell = flowDwellMs(_wMsg)`.
- `showing` phase: settle to `desk_linger` when `_wTimer > _wDwell` (was `5000`).

## Out of scope

- No changes to `log-event.py` or the event schema.
- No new furniture/sprite art (no visual-preview workflow needed).

## Verification

Human verifies in the browser (`http://localhost:8765/office.html`):
- Send a long message → Jamesmie walks to wherever the Manager currently stands,
  and the full message scrolls once before he leaves.
- On task completion → Manager walks to wherever Jamesmie currently stands and
  the full report scrolls once.
- During tool activity → the Writer shows its narration bubble cleanly above its
  head at the writer desk.
