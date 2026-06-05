# Office Redesign — Design Spec

**Date:** 2026-06-05
**Approach:** B (Full redesign, no architecture refactor)

## Goal

The office visualization feels empty and the agents look static. This redesign:

1. **Sitting** — agents sit *behind* their desk when working (desk occludes legs).
2. **Jamesmie flow** — rework the user-message flow into a delegation sequence with a thinking phase.
3. **Queue** — agents queue at shared spots (coffee machine, sofa) instead of overlapping.
4. **Furniture** — fill each room with theme-appropriate furniture.
5. **Writer** — a 5th agent that animates when Claude writes its text reply, showing the real response text.

All work stays within the existing render pipeline and state-machine architecture — no unified Y-sort refactor.

---

## Component 1 — Sitting Mechanic (Option A)

When an agent is in the `working` state it should look like it is *sitting at its desk*, with the desk hiding the lower body.

### New data

```js
// "In-chair" point behind the desk that the agent walks to before working.
const SIT_POS = {
  jamesmie: { x, y },
  reader:   { x, y },
  coder:    { x, y },
  searcher: { x, y },
  writer:   { x, y },
};

// Lower portion of each desk, redrawn on top of a sitting agent to hide the legs.
const DESK_FRONTS = {
  jamesmie: { x, y, w, h, color },
  reader:   { x, y, w, h, color },
  coder:    { x, y, w, h, color },
  searcher: { x, y, w, h, color },
  writer:   { x, y, w, h, color },
};
```

`SIT_POS` replaces `WORK_POS` as the destination for the `walking_to_desk` → `working` transition. The agent walks to the chair position behind the desk rather than in front of it.

### Render change

`draw()` gains one overlay pass after agents are drawn:

```
1. drawAllRooms()
2. drawAllFurniture()
3. draw agents (Y-sorted)        ← unchanged
4. drawDeskFronts()              ← NEW: redraw DESK_FRONTS only for agents whose state === 'working'
5. drawHeader()
```

`drawDeskFronts()` iterates agents, and for each one in `working` state draws its `DESK_FRONTS` rectangle on top. This occludes the legs, producing the seated look. Desk fronts are **not** drawn when the desk is empty, so the static furniture image is unchanged when nobody is working.

### Working pose

While `working`, the agent:
- faces **down** (toward viewer),
- holds the `stand` frame (walk animation paused),
- shows a `💻` bubble.

This reuses the existing pause logic already applied to `idle_chill` / `idle_phone`.

---

## Component 2 — Jamesmie Flow

Jamesmie represents *the user*. When the user submits a prompt, Jamesmie receives it, thinks, and delegates to the team. This replaces the old "walk to center and speak" behavior.

### Sequence

```
user submits prompt  (log-event.py user → user_message event)
   │  phase: walking_desk
   ▼  Jamesmie walks to SIT_POS.jamesmie and sits
   │  phase: speaking          (~3.0s)
   ▼  💬 speaks the user's message text  ("your voice")
   │  phase: thinking          (~2.0s)
   ▼  💭 thinking bubble, animated dots: "." → ".." → "..."
   │  phase: dispatch          (~1.5s)
   ▼  📋 "สั่งงาน!" + faces toward the team
   │  phase: working
   ▼  Jamesmie remains seated in `working` state
```

Order is fixed: **speak → think → dispatch**.

### Notes

- Worker agents (Reader / Coder / Searcher / Writer) still activate from **real tool-call events** arriving on the event queue. Jamesmie's "dispatch" gesture is a cosmetic flourish — it does not control the workers, because tool-call timing is asynchronous.
- If a tool call arrives while Jamesmie is mid-thinking, the relevant worker starts immediately (no waiting on Jamesmie).
- Long messages (> 40 chars) are truncated with `…`, as today.
- The thinking bubble cycles its dot count on a timer.

---

## Component 3 — Queue System

Shared idle destinations (coffee machine, sofa) currently let multiple agents stack on one point. Replace single points with ordered slots.

### New data

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

const queues = { coffee: [], sofa: [] };  // arrays of agent keys, index = slot
```

### Logic

- `joinQueue(name, agentKey)` → appends the agent and returns its slot index, or `-1` if full.
- When an agent wants coffee/sofa, it calls `joinQueue`. If full (`-1`), it picks a different idle state instead (wander / phone).
- The agent walks to `QUEUE_SPOTS[name][slot]`. Slot 0 at coffee shows `☕` (brewing); sofa slots show `😴`.
- `leaveQueue(name, agentKey)` removes the agent and **shifts everyone behind forward** (slot 1 → 0, 2 → 1); they walk to their new slot.

### Interrupt cleanup

If an agent is interrupted by a tool call while queued, `_activateAgent` must call `leaveQueue` for any queue the agent is in, so the slot is freed and the line advances. Without this, slots leak.

---

## Component 4 — Furniture per Room

Each 450×260 room gets theme-appropriate furniture. Every solid (blocking) addition must also be added to `NAV_OBSTACLES` so pathfinding routes around it. Place items against walls and in corners to keep main walkways clear.

### BOSS ROOM (Jamesmie) — executive

- Whiteboard on the top wall (chart / arrow marks).
- Small guest sofa + coffee table, lower-left corner.
- Filing cabinet beside the boss desk.
- Rug under the boss desk.

### DEV ROOM (Reader + Coder + **Writer**) — dev

- Whiteboard with code / diagram on the top wall.
- Mini-fridge + snack cabinet, lower-right corner.
- Server boxes / crates, lower-left corner.
- One additional plant.
- **Third desk (right side)** for the Writer agent + chair.

### OPS ROOM (Searcher) — server room

- Second workstation desk (empty) + chair.
- One or two extra server racks on the right wall.
- Monitoring panel (green status screen) on the top wall.
- Cable boxes / equipment crates in a lower corner.

### LOUNGE — relaxation (already has coffee + sofa)

- Large TV mounted on the top wall.
- Bookshelf on the left wall.
- One additional large plant.
- Rug under the sofa (exists) + expanded seating.

---

## Component 5 — Writer Agent (5th)

A new agent that animates when Claude finishes writing a text reply.

### Identity

- **Color:** Teal/Cyan `#14b8a6` (distinct from gold / blue / green / orange).
- **Sprite:** new sprite built on the existing pattern — `down` and `up` facings, `stand` / `walk1` / `walk2` frames, unique hair/body colors.
- **Desk:** third desk in DEV ROOM (right side); add `SIT_POS.writer` and `DESK_FRONTS.writer`.

### Trigger

- New Claude Code hook: `Stop` → `python log-event.py stop`.
- `log-event.py stop` reads the hook JSON on stdin, takes `transcript_path`, parses the JSONL transcript, and extracts the **latest assistant text message**. It writes that text to `agent-events.json` under a new key `assistant_response` (with a timestamp), atomically, exactly like the other modes. Errors are swallowed and exit is always 0 (consistent with current behavior).

### Flow

```
assistant_response event
   ▼ Writer walks to SIT_POS.writer and sits
   │ ✍️  (typing ~1.5s)
   ▼ 💬 shows the real reply text (truncated as needed) (~3.5s)
   ▼ back to idle
```

The browser polls `assistant_response` alongside `user_message`, dedupes by timestamp (same pattern as `_lastJamesmieTs`), and triggers the Writer.

---

## Files Touched

| File | Change |
|------|--------|
| `office.html` | Sitting overlay, Jamesmie flow rework, queue system, furniture, Writer agent + sprite + polling |
| `log-event.py` | New `stop` mode: parse transcript, write `assistant_response` |
| `.claude/settings.json` | Add `Stop` hook |
| `agent-events.json` | New `assistant_response` key (runtime data, no schema file) |

## Out of Scope (YAGNI)

- Unified Y-sort render refactor (Approach C) — rejected as too risky.
- Per-tool sub-animations beyond walk/sit/done.
- Persisting queue or seat state across page reloads.