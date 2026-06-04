# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the project

```powershell
# Start server + open browser (kills port 8765 first, then starts Python HTTP server)
.\start.ps1

# Or via VSCode: F5 (uses .vscode/launch.json → PowerShell → start.ps1)
```

Server runs at `http://localhost:8765/office.html`. No build step — all code is plain HTML/JS/Python.

## Architecture

This is a **live visualization dashboard** that animates pixel-art office agents reacting to real Claude Code tool calls in real time.

### Data flow

```
Claude Code hooks → log-event.py → agent-events.json ← office.html (polls every 500ms)
```

1. **`log-event.py`** — Claude Code hook script. Receives JSON on stdin, maps tool names to agents, writes to `agent-events.json` atomically. Called in three modes (argv[1]):
   - `pre` — tool about to execute → sets `current` with `status: active`
   - `post` — tool finished → sets `last_completed`
   - `user` — user sent a message → sets `user_message` (triggers Jamesmie to walk to center and speak)

2. **`agent-events.json`** — shared state between hook and browser. Three keys: `current`, `last_completed`, `user_message`.

3. **`office.html`** — single-file canvas game loop (`requestAnimationFrame`). Separated into:
   - Room + furniture drawing (static per frame)
   - Pixel-art sprite system: 16×24 character grid, S=2 scale, color-keyed characters (`s`=skin, `h`=hair, `b`=body color, `l`=leg, etc.)
   - Agent state machine: `idle_wander` → `idle_phone` / `idle_coffee` / `idle_chill` / `idle_chat` → back to idle
   - Tool-triggered flow: `walking_to_desk` → `working` → `done_flash` → idle
   - Jamesmie special flow: walks to `CENTER_POS`, speaks the user message, returns to desk

### Agent → tool mapping

| Agent | Color | Triggered by |
|-------|-------|-------------|
| Jamesmie | Gold (crown) | `user_message` events |
| Reader | Blue | `Read`, `Glob`, `Grep` |
| Coder | Green | `Edit`, `Write`, `NotebookEdit` |
| Searcher | Orange | `Bash`, `WebSearch`, `WebFetch` |

### Key constants in office.html

- `FURN` — furniture bounding boxes
- `WORK_POS` — desk positions agents walk to when activated
- `IDLE_POS` — coffee machine and sofa positions for idle states
- `CENTER_POS` — where Jamesmie walks to announce user messages
- `WALK_FRAMES` — 4-frame walk cycle: `[stand, walk1, stand, walk2]`

## Hook configuration

To wire `log-event.py` into Claude Code, add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "python log-event.py pre"}]}],
    "PostToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": "python log-event.py post"}]}],
    "UserPromptSubmit": [{"hooks": [{"type": "command", "command": "python log-event.py user"}]}]
  }
}
```

The script always exits 0 (never blocks tool execution) and silently ignores errors.
