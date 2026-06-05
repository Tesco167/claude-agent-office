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

## Visual development workflow (REQUIRED)

**Before integrating any new visual object (sprite, character, furniture piece) into `office.html`, render a preview image first and look at it.** Do not commit blind — pixel-art mistakes (wrong proportions, merged colors, off-by-one grids, ugly shading) are invisible in code and only obvious in an image.

Workflow:
1. Build the object's grid/draw logic in a throwaway Python script.
2. Render it to a PNG using the pure-stdlib encoder (`zlib` + `struct`, no PIL/Node needed) — replicate the same color map / `shadeHex` / scale the real code uses.
3. Read the PNG to inspect it. Iterate on the art until it looks right.
4. Only then port the validated grids into `office.html` (generate the JS to a temp file and splice it in to avoid transcription errors).
5. Delete temp `__*.png` / `__*_gen.txt` files before committing.

Notes:
- `node` is **not installed**, so the browser canvas can't be inspected headlessly. The Python PNG render is how you (the agent) actually see sprites; the human verifies the live page in the browser.
- Always validate every sprite grid row is the exact expected width before integrating.
- Watch for `const` name collisions when adding sprite arrays — duplicate identifiers throw a `SyntaxError` that blanks the whole page.

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
