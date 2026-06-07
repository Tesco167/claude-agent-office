# CLAUDE.md

Project SOP for Claude Code. Read before changing anything.

---

## ⚡ Operating rules — สำคัญที่สุด, อ่านก่อนเสมอ

**ทำงานแบบประหยัด token:**
1. อ่านเฉพาะไฟล์ที่จำเป็น
2. ถ้าต้องการ context เพิ่ม ให้ถามชื่อไฟล์ก่อน (อย่าไล่อ่านทั้ง repo)
3. ห้ามสรุปยาว
4. ตอบเฉพาะสิ่งที่เกี่ยวกับ task
5. แสดงเฉพาะ code diff หรือไฟล์ที่ต้องแก้
6. หลังจบงาน ให้สรุปสั้น ๆ ว่าแก้อะไรไป

**แบ่งงานตามโมเดล:** 🧠 **Opus = คิด/วางแผน** (ออกแบบ, ตัดสินใจสถาปัตยกรรม, เขียน spec/plan, ตรวจทาน) · 🔧 **Sonnet/Haiku = ดำเนินการ** (แก้โค้ด, รันคำสั่ง, งาน mechanical ตามแผน — มอบผ่าน subagent ตั้ง `model: sonnet`/`haiku`). แผนชัดเมื่อไรให้ผลักงานดำเนินการไปยังโมเดลที่เล็กกว่า.

---

## 1. What this is

Live dashboard: a pixel-art office whose agents react to real Claude Code tool calls in real time. **No build step, no framework, no package manager** — plain HTML + vanilla canvas JS + vendored jQuery, fed by a Python hook. Don't reach for npm/webpack/bundlers.

---

## 2. Run it

```powershell
.\start.ps1     # dev: kills port 8765, serves repo root, opens browser; Ctrl+C stops. (or F5 in VSCode)
```
Serves `http://localhost:8765/office.html`. Needs Python 3 on `PATH`; **`node` is not installed** (matters for §6).

**Auto-start at login (optional):** `.\install-autostart.ps1` registers a per-user AtLogOn task `SorKhonKaenOffice` (no Admin); `.\uninstall-autostart.ps1` removes it + stops the server.
- `serve.ps1` = silent, non-blocking launcher the task runs: reuses a live server on 8765 (or kills a stale listener + restarts), runs `py/serve.py` via `pythonw.exe` (no console window, survives the launcher exiting), opens the browser. Use `start.ps1` for interactive dev, `serve.ps1` for silent background.
- **Why `py/serve.py`, not `pythonw -m http.server`:** under `pythonw` the std handles are dead, so http.server's per-request logger aborts every response (`ERR_EMPTY_RESPONSE`). `py/serve.py` silences logging, then serves. `serve.ps1` also **quotes** the script path — repo path has spaces and `Start-Process -ArgumentList` won't auto-quote on PS 5.1.
- Task is per-user (`LogonType=Interactive`, no stored password), runs only while logged on. Test without logging out: `Start-ScheduledTask SorKhonKaenOffice`.

---

## 3. Layout

```
office.html              13-line shell; loads css/style.css, jQuery, js/app.js
css/style.css            page chrome (17 lines; dark, pixelated, neon border)
js/app.js                the whole app: sprites, room, state machine, polling (~2700 lines)
js/jquery-3.7.1.min.js   vendored jQuery (DOM select + $.getJSON poll ONLY)
py/log-event.py          hook script; writes agent-events.json to repo root
py/serve.py              windowless HTTP server (silences logging), run by serve.ps1
start.ps1                dev launcher (interactive, blocks)
serve.ps1                silent launcher (pythonw, no window) for autostart
install/uninstall-autostart.ps1   register / remove the AtLogOn task
assets/                  PNG sprite art: keyed *-topdown.png (desks/chair/sofa/table, loaded by app.js)
                         + Object/ & Room/ source art (kept for re-cutting) + <photoDir>/front,back.png per agent
agent-events.json        runtime state at repo root (gitignored)
.claude/settings.json    permissions + additionalDirectories
docs/superpowers/        specs + plans (see §5)
```
Almost all real work is in `js/app.js`.

---

## 4. Architecture

Data flow: `Claude Code hooks → py/log-event.py → agent-events.json ← office.html (polls 500ms)`

**`py/log-event.py`** — reads hook JSON on stdin, maps tool→agent, **atomically** rewrites `agent-events.json` (write `.tmp` → `os.replace`) in the repo root (its parent dir). **Always exits 0** and swallows errors, so it never blocks tools. Four modes (argv[1]):
- `pre` — tool starting → set `current` (active), append to `events`, capture narration → `writer_message`
- `post` — tool done → `current.status = done`, set `last_completed`
- `user` — prompt submitted → set `user_message`
- `stop` — turn ended → final assistant text → `assistant_response`

**`agent-events.json`** keys: `current` (active worker) · `last_completed` (done-flash) · `events` (rolling last-10 feed, `{agent,label,detail,ts}`) · `user_message` (Jamesmie speaks) · `writer_message` (Writer narrates) · `assistant_response` (Manager reports summary).

**`js/app.js`** — canvas `requestAnimationFrame` loop. Top→bottom: palette `C` + geometry (`ROOMS`, desks) → furniture/decor → pixel-art sprite system → `agents` roster → state machine + pathfinder + `loop` → **bottom:** `$.getJSON` seed, `setInterval(fetchEvents, 500)`, `requestAnimationFrame(loop)`. **Keep init calls at the bottom.** On initial seed the poller records the latest timestamps as a baseline so the backlog doesn't replay on load; afterward it only reacts to fresher events.

**Image assets (PNG sprites).** Desks/chair/sofa/table are keyed top-down PNGs (`assets/*-topdown.png`) drawn aspect-preserved via `drawSpriteShadowed(...)`, **each guarded by `IMG.complete && IMG.naturalWidth` with a procedural fallback** — so the procedural desk/furniture code is *not* dead, it's the not-yet-loaded path. Characters: any agent with a `photoDir` gets `assets/<photoDir>/front.png`+`back.png` async-loaded by `loadPhotoSprites()` (bottom init), swapping from procedural `SPRITES_*2` once both resolve. Add a character = drop the two PNGs in `assets/<Name>/` + set `photoDir`.

**Roster (6 agents)** — in the `agents` object; each has a `home` room (`boss`/`dev`/`ops`), color, sprites, state slot. Tool→agent map is `TOOL_TO_AGENT` (py).

| key | name | trigger |
|-----|------|---------|
| `jamesmie` | Jamesmie | `user_message` — walks to center, speaks the prompt |
| `manager` | Manager | `assistant_response` — relays the final summary |
| `writer` | Writer | `writer_message` — voices the narration |
| `reader` | Reader | `Read`, `Glob`, `Grep` |
| `coder` | **Editor** | `Edit`, `Write`, `NotebookEdit` |
| `searcher` | Searcher | `Bash`, `WebSearch`, `WebFetch` |

⚠️ **key `coder` ≠ display name `Editor`.** Change the roster → update **both** `TOOL_TO_AGENT` (py) **and** `agents` (js).

**State machine:** idle (`idle_wander` → phone/coffee/chill/chat → idle) · tool-triggered (`walking_to_desk` → `working` → `done_flash` → idle) · Jamesmie/Writer/Manager each have a speak-then-return flow.

**Key constants:** `WORK_POS` (stand at desk) · `SIT_POS` (at monitor) · `QUEUE_SPOTS` (coffee/sofa) · `NAV_OBSTACLES` (pathfinder boxes — **decor deliberately excluded** so agents overlap it) · `ROOMS` (wander bounds).

---

## 5. Conventions & planning

**`js/app.js`:**
- **Arrow functions only**, no `function` declarations; all defs sit above the bottom init calls.
- **jQuery = DOM/ajax only** (3 spots: canvas select, seed, poll). Don't grow it. Canvas is pure vanilla 2D.
- ⚠️ **`const` name collisions** (e.g. duplicate sprite arrays) throw a `SyntaxError` that **silently blanks the whole page** — verify it renders after adding sprites.
- ⚠️ **Sprite grids must be exact width** — an off-by-one row corrupts the character.
- ⚠️ **Almost nothing here is truly "dead code."** Sprite grids are used via **spread** (`[...JAMESMIE_BD, ...LEGS_CUTE_STAND]`) and PNG desks fall back to procedural draws — so "unused identifier" scans false-flag live constants (a ref-counter regex that ignores a leading `.` also hides `...spread`). Deleting a spread-only const → `ReferenceError` → **blank page**. Verify against spread + fallback paths before removing.
- Keep edits small; it's one ~2700-line module.

**Planning** (`docs/superpowers/`): substantial changes (new agent, flow, redesign) get a spec (`specs/YYYY-MM-DD-<topic>-design.md`) and plan (`plans/YYYY-MM-DD-<topic>.md`) **first** — skills `brainstorming` → `writing-plans` → `executing-plans`. Small fixes don't.

---

## 6. Visual workflow (REQUIRED for new sprites/furniture)

`node` isn't installed, so the canvas can't be inspected headlessly — **render a preview PNG and look at it before integrating.** Pixel-art errors (proportions, merged colors, off-by-one grids) are invisible in code.
1. Build the grid in a throwaway Python script. ⚠️ On this Windows box the Bash tool **mangles `python <<'PY'` here-docs** (backticks + regex char-classes get corrupted → `PatternError`) — write the script to a temp `.py` file and run `python file.py`, then delete it.
2. Render to PNG with the pure-stdlib encoder (`zlib` + `struct`, no PIL/Node), same color map / `shadeHex` / scale as the real code.
3. **Read the PNG**, iterate until right.
4. Port validated grids into `js/app.js` (via a temp file, to avoid transcription errors).
5. **Delete `__*.png` / `__*_gen.txt` before committing.**

⚠️ **`.gitignore` only auto-ignores `__pycache__/`, `__*.png`, `__*_gen.txt` — NOT `__*.py`.** Throwaway probe/verify/analyzer scripts (`__*.py`) show up as untracked and must be deleted by hand; running them also leaves orphaned bytecode in `__pycache__/` (clean with `rm -rf __pycache__/`).

**Keying source art → transparent sprite.** The `assets/*-topdown.png` sprites are cut from hand-drawn source art (`assets/Object/...`) by keying the background to transparency via **edge flood-fill** — flood from the image borders inward. ⚠️ **Do NOT use a global hue/color-key:** the background tint also appears *inside* the art (dark monitor bezels, chair shadow, wood grain), so a color-key punches holes in the sprite; flood-fill only removes the contiguous outer region and preserves interior pixels. Probe the corner color + tolerance first (that's what the `__probe_*.py` scratch scripts were for). Same convention for every desk/chair/sofa/table. **Keep the source under `assets/Object/`** so the sprite can be re-cut; output is loaded aspect-preserved + drawn through `drawSpriteShadowed` (see §4).

---

## 7. Git & commits

- Feature work on a branch; PRs target `main`.
- **Conventional commits:** `feat:` / `fix:` / `perf:` / `docs:` / `chore:`, imperative, lower-case, no trailing period.
- **Commit/push only when asked**; never amend published commits.
- Never stage `agent-events.json` (gitignored) or `__*` artifacts.
- Branch done → skill `superpowers:finishing-a-development-branch`.

---

## 8. Hooks

Wire tool calls into the viz. Use the **absolute** path to `py/log-event.py` (relative paths resolve against Claude Code's cwd). The script exits 0 so it can't block tools — **except a *missing* file makes it exit non-zero and blocks every tool until restart, so update hook paths *before* moving the script.**

```json
{"hooks": {
  "PreToolUse":       [{"matcher":"*","hooks":[{"type":"command","command":"python py/log-event.py pre"}]}],
  "PostToolUse":      [{"matcher":"*","hooks":[{"type":"command","command":"python py/log-event.py post"}]}],
  "UserPromptSubmit": [{"hooks":[{"type":"command","command":"python py/log-event.py user"}]}],
  "Stop":             [{"hooks":[{"type":"command","command":"python py/log-event.py stop"}]}]
}}
```
`.claude/settings.json` holds only permissions + `additionalDirectories`; the hook block lives in user/local settings.

⚠️ **Perf:** `last_assistant_text()` (used by `pre` + `stop`) **tail-reads** the transcript from the end in a widening window. It runs on every `PreToolUse`, so a full `read_text()` would reload a multi-MB file each call — keep the tail-read.

---

## 9. Pre-commit checklist

- [ ] New sprite/furniture → rendered + viewed a PNG (§6); `__*` deleted
- [ ] Roster changed → updated **both** `TOOL_TO_AGENT` (py) and `agents` (js)
- [ ] Page still renders (no `const` collision / sprite-width error)
- [ ] No build tool/framework added; jQuery footprint unchanged
- [ ] `agent-events.json` / `__*` not staged
- [ ] Commit message is conventional-commit format

---

## 10. Art direction — north star

Target: **a high-detail, top-down 3/4 isometric pixel-art IT office** — premium handcrafted, cozy cyber-tech, warm ambient light with subtle neon accents, professional indie-game quality; a software company that feels alive and organized. Use when designing rooms/props/lighting/sprites (render-and-view per §6).

**Want to see:** neon signage · server rack · multiple workstations · warm interior · detailed props · modular, story-rich rooms.

**Refs:** Game Dev Tycoon · Software Inc · Project Highrise · The Red Strings Club · Dave the Diver · pixel-art tycoon games.
