# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. It doubles as the project SOP — read it top to bottom before making changes.

---

## 1. What this project is

A **live visualization dashboard** that animates a pixel-art office whose agents react to real Claude Code tool calls in real time. As you (Claude Code) use tools, characters walk to their desks, work, narrate, and report — a literal picture of the session that produced them.

There is **no build step, no framework, no package manager**. Plain HTML + vanilla canvas JS + a vendored jQuery file, fed by a Python hook script. If you find yourself reaching for npm/webpack/a bundler, stop — that's not this project.

---

## 2. Running the project

```powershell
# Start server + open browser (kills port 8765 first, then serves the repo root)
.\start.ps1

# Or via VSCode: F5 (uses .vscode/launch.json → PowerShell → start.ps1)
```

Server runs at `http://localhost:8765/office.html`.

`start.ps1` (see [start.ps1](start.ps1)): kills anything already on port 8765, launches `python -m http.server 8765` as a background job rooted at the **repo root**, waits 1s, probes the URL, then opens the browser. `Ctrl+C` stops it. It serves from `$ScriptDir` (the repo root, since `start.ps1` lives there), which is why `./agent-events.json`, `css/`, and `js/` resolve correctly from `office.html`.

Requirements: Python 3 on `PATH`. `node` is **not installed** (this matters for the visual workflow — see §7).

---

## 3. Project layout

```
office.html              — 13-line markup shell; loads css/style.css, jQuery, then js/app.js
css/style.css            — page chrome (dark bg, centered pixelated canvas, neon border)
js/app.js                — the entire app: sprites, room, state machine, polling (~2700 lines)
js/jquery-3.7.1.min.js   — vendored jQuery (DOM select + $.getJSON polling ONLY)
py/log-event.py          — Claude Code hook script; writes agent-events.json to the repo root
start.ps1                — dev server launcher
agent-events.json        — runtime state at the repo root (gitignored, created at runtime)
.claude/settings.json    — project permissions + additionalDirectories
.vscode/launch.json      — F5 → runs start.ps1
docs/superpowers/        — design specs + implementation plans (see §6)
```

Everything user-facing lives in three files: `office.html`, `css/style.css`, `js/app.js`. Almost all real work happens in `js/app.js`.

---

## 4. Architecture

### Data flow

```
Claude Code hooks → py/log-event.py → agent-events.json ← office.html (polls every 500ms)
```

1. **`py/log-event.py`** ([py/log-event.py](py/log-event.py)) — receives the hook JSON on stdin, maps the tool to an office agent, and **atomically** rewrites `agent-events.json` (write to `.tmp`, then `os.replace`). It resolves `agent-events.json` to its parent dir (the repo root) because the script lives in `py/` but the browser fetches `./agent-events.json` from the root. The script **always exits 0** and swallows all exceptions, so a hook failure never blocks your tools. Called in **four modes** (argv[1]):
   - `pre`  — tool about to run → sets `current` (status `active`), appends to `events`, and captures the assistant's accompanying narration into `writer_message`.
   - `post` — tool finished → flips `current.status` to `done`, sets `last_completed`.
   - `user` — user submitted a prompt → sets `user_message`.
   - `stop` — turn ended → reads the final assistant text from the transcript into `assistant_response`.

2. **`agent-events.json`** — shared state between hook and browser. Keys:
   | Key | Written by | Drives |
   |-----|-----------|--------|
   | `current` | pre/post | the active worker's status |
   | `last_completed` | post | done-flash |
   | `events` | pre | rolling last-10 task feed (each `{agent, label, detail, ts}`) |
   | `user_message` | user | Jamesmie walks to center & speaks |
   | `writer_message` | pre | Writer voices the in-flight narration |
   | `assistant_response` | stop | Manager reports the final summary to Jamesmie |

3. **`js/app.js`** — the canvas game loop (`requestAnimationFrame`). Structure, top to bottom:
   - Color palette `C`, room/desk geometry (`ROOMS`, desk boxes), position constants.
   - Furniture/decor drawing (static per frame; decor is **never** added to `NAV_OBSTACLES`).
   - Pixel-art sprite system: color-keyed character grids drawn cell-by-cell at integer scale.
   - The `agents` object (the roster — see §5).
   - Agent state machine + pathfinder + per-frame `loop`.
   - At the very bottom: the initial `$.getJSON` seed and `setInterval(fetchEvents, 500)`, then `requestAnimationFrame(loop)`.

   On the **initial seed**, the poller records the latest timestamps as a baseline so the backlog in `agent-events.json` doesn't replay on page load. Thereafter `fetchEvents` (every 500ms) diffs against those timestamps and only reacts to fresh events.

### The roster (6 agents)

Defined in the `agents` object in [js/app.js](js/app.js). Each agent has a `home` room (`boss` / `dev` / `ops`), a color, sprite set, and a state-machine slot.

| Agent (key) | Display name | Color | Triggered by / role |
|-------------|--------------|-------|---------------------|
| `jamesmie` | Jamesmie | Gold (crown) | `user_message` — walks to center, speaks the user's prompt |
| `manager` | Manager | Indigo | `assistant_response` — relays the final summary to Jamesmie |
| `writer` | Writer | Teal | `writer_message` — voices the in-flight narration |
| `reader` | Reader | Blue | `Read`, `Glob`, `Grep` |
| `coder` | **Editor** | Green | `Edit`, `Write`, `NotebookEdit` (gets a detail second line) |
| `searcher` | Searcher | Orange | `Bash`, `WebSearch`, `WebFetch` |

Note the **key vs. name mismatch**: the object key is `coder` but the display name is `Editor`. Tool→agent mapping lives in `TOOL_TO_AGENT` in [py/log-event.py](py/log-event.py); the agent objects live in `js/app.js`. **If you change the roster, update both files.**

### Agent state machine

- **Idle:** `idle_wander` → `idle_phone` / `idle_coffee` / `idle_chill` / `idle_chat` → back to idle. Agents wander their home room, queue at the coffee machine / sofa, and chat.
- **Tool-triggered (reader/coder/searcher):** `walking_to_desk` → `working` → `done_flash` → idle.
- **Jamesmie flow:** walks to `CENTER_POS`, speaks the user message, returns to desk.
- **Writer / Manager flows:** voice narration / report the summary, then return to idle.

### Key constants in js/app.js

- `WORK_POS` — where an activated agent stands at its desk.
- `SIT_POS` — seated position (at the monitor) per agent.
- `QUEUE_SPOTS` — coffee-machine / sofa queue slots for idle agents.
- `NAV_OBSTACLES` — furniture boxes the pathfinder routes around. **Decor is deliberately excluded** so agents can overlap it visually.
- `ROOMS` — room rectangles that bound each agent's wandering.

---

## 5. Coding conventions (js/app.js)

- **Arrow functions everywhere.** `const name = (...) => {}`, no `function` declarations. All definitions sit above the top-level init calls at the bottom of the file, so lack of hoisting is fine — **keep new top-level/init calls at the bottom.**
- **jQuery is DOM/ajax only.** Canvas rendering is pure vanilla 2D context. jQuery appears at exactly three spots: `$('#office')[0]` for the canvas, the initial `$.getJSON('./agent-events.json', { _: Date.now() })` seed, and the 500ms poll. Don't grow its footprint.
- **Watch for `const` name collisions** when adding sprite arrays — a duplicate identifier throws a `SyntaxError` that **blanks the entire page** (no canvas, no error visible to a casual look). After adding sprites, sanity-check the page actually renders.
- **Sprite grids must be exact width.** Validate every row is the expected number of cells before integrating — an off-by-one row silently corrupts the character.
- Keep edits **small and surgical** in this file — it's one ~2700-line module and easy to break.

CSS lives in [css/style.css](css/style.css) (17 lines; dark theme, `image-rendering: pixelated`, neon border). `office.html` is a fixed 13-line shell — you should almost never need to touch it.

---

## 6. Planning workflow (docs/superpowers/)

Non-trivial features are designed before they're built. Two folders:

- `docs/superpowers/specs/`  — **design docs** (the "what" and "why"), named `YYYY-MM-DD-<topic>-design.md`.
- `docs/superpowers/plans/`  — **implementation plans** (the "how", step by step), named `YYYY-MM-DD-<topic>.md`.

For a substantial change (new agent, new flow, scene redesign), **write/update the spec and plan first**, then implement. The superpowers skills (`brainstorming` → `writing-plans` → `executing-plans`) are the intended path for this. Small fixes don't need a doc.

---

## 7. Visual development workflow (REQUIRED)

**Before integrating any new visual object (sprite, character, furniture piece) into the canvas, render a preview PNG and look at it.** Pixel-art mistakes — wrong proportions, merged colors, off-by-one grids, ugly shading — are invisible in code and only obvious in an image. Do not commit blind.

Workflow:
1. Build the object's grid/draw logic in a **throwaway Python script**.
2. Render it to a PNG with the **pure-stdlib encoder** (`zlib` + `struct`, no PIL/Node) — replicate the same color map / `shadeHex` / scale the real code uses.
3. **Read the PNG** to inspect it. Iterate until it looks right.
4. Only then port the validated grids into `js/app.js` (generate the JS to a temp file and splice it in to avoid transcription errors).
5. **Delete temp `__*.png` / `__*_gen.txt` files before committing.**

Why this exists: `node` is **not installed**, so the browser canvas can't be inspected headlessly. The Python PNG render is the only way you (the agent) can actually *see* a sprite. The human verifies the live page in the browser afterward.

---

## 8. Git & commit SOP

- **Branching:** feature work happens on a branch (e.g. `feat/office-redesign`); `main` is the integration branch. PRs target `main`.
- **Conventional commits** — match the existing history:
  - `feat:` new behavior · `fix:` bug fix · `perf:` performance · `docs:` documentation · `chore:` tooling/meta.
  - Subject in imperative mood, lower-case, no trailing period. Example: `feat: give Manager's monitor live screen content like the others`.
- **Commit/push only when asked.** When you do, never amend published commits; prefer new commits.
- **`agent-events.json` is gitignored** (runtime state) — never commit it. Temp `__*` render artifacts must be deleted, not committed.
- Use the `superpowers:finishing-a-development-branch` skill when a branch is done to decide merge/PR/cleanup.

---

## 9. Hook configuration

Hooks wire your tool calls into the visualization. The script always exits 0 and ignores errors, so it can't block tools — **except** a *missing* file makes the hook exit non-zero, which blocks every subsequent tool until restart. **If you ever move `py/log-event.py`, update the hook paths in settings *before* moving it** (the live session keeps calling the old path).

To wire it up, add to your Claude Code settings (use the **absolute** path to `py/log-event.py`; relative paths resolve against Claude Code's cwd, not this folder):

```json
{
  "hooks": {
    "PreToolUse":        [{"matcher": "*", "hooks": [{"type": "command", "command": "python py/log-event.py pre"}]}],
    "PostToolUse":       [{"matcher": "*", "hooks": [{"type": "command", "command": "python py/log-event.py post"}]}],
    "UserPromptSubmit":  [{"hooks": [{"type": "command", "command": "python py/log-event.py user"}]}],
    "Stop":              [{"hooks": [{"type": "command", "command": "python py/log-event.py stop"}]}]
  }
}
```

`.claude/settings.json` currently holds **permissions + `additionalDirectories`** only; the hook block above may live in your user/local settings.

### Performance note

`last_assistant_text()` (used by `pre` and `stop`) **tail-reads** the transcript from the end in a widening window rather than loading the whole file. This runs on *every* `PreToolUse`, so a full `read_text()` would re-load a multi-MB transcript on each tool call and bog the machine down. Preserve the tail-read behavior if you touch that function.

---

## 10. Quick checklist before you commit

- [ ] New sprite/furniture? Rendered a PNG and looked at it (§7); temp `__*` files deleted.
- [ ] Touched the roster? Updated **both** `TOOL_TO_AGENT` (py) and `agents` (js).
- [ ] Page still renders (no `const` collision / sprite-width `SyntaxError`)? — verify in the browser.
- [ ] Did NOT add a build tool, framework, or grow jQuery's footprint.
- [ ] `agent-events.json` and `__*` artifacts not staged.
- [ ] Commit message follows the conventional-commit format (§8).
