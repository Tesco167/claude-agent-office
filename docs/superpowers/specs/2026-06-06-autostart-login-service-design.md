# Design — Auto-start the office server at login (per-user, silent)

Date: 2026-06-06
Scope: new PowerShell scripts at repo root (no changes to `office.html` / `js` / `py`)

## Problem

The only way to run the dashboard today is `start.ps1`, which runs the server as a
PowerShell `Start-Job` and **blocks on `Wait-Job`**. The server dies when the
console is closed or `Ctrl+C`'d, so it has to be re-launched manually every time.
The user wants it to come up by itself — "run as a service".

## Decisions (from brainstorming)

- **Trigger = at login**, per-user. Not a true system Windows Service (no boot-time
  start, no Admin). The server runs only while the user is logged on.
- **Open the browser** to `office.html` automatically when it starts.
- **Silent** — no visible PowerShell/console window for the server.
- Mechanism = **Task Scheduler** (`Register-ScheduledTask`, AtLogOn), chosen over a
  Startup-folder VBScript or an `HKCU\...\Run` key because it is the standard,
  manageable, no-Admin path with restart-on-failure and a GUI to inspect/disable.
- `start.ps1` is **left unchanged** — it stays the interactive dev launcher
  (visible console, `Ctrl+C` to stop, live logs). The new silent path is separate.

## Design

### Files added (repo root, alongside `start.ps1`)

| File | Role |
|------|------|
| `py/serve.py` | Windowless HTTP server: silences request logging, serves the repo root on 8765. |
| `serve.ps1` | Silent, **non-blocking** launcher: ensure server on 8765 → open browser → exit. |
| `install-autostart.ps1` | Register the per-user AtLogOn scheduled task. |
| `uninstall-autostart.ps1` | Unregister the task **and** stop the running server. |

### `py/serve.py`

A standalone HTTP server instead of `-m http.server`, because **`pythonw -m http.server`
cannot serve a single request when run detached**: with no console its std handles are
unusable, and http.server's per-request logger aborts the response mid-flight — the socket
still binds (so the port *looks* like it's listening), but every request returns
`ERR_EMPTY_RESPONSE`. The script:

- `os.chdir` to the repo root (computed from `__file__`, so it does not depend on the
  launcher's working directory) so `SimpleHTTPRequestHandler` serves the right files.
- Reassigns `sys.stdout = sys.stderr = open(os.devnull, "w")` so request logging is a
  harmless no-op (this is the fix for the empty-response bug).
- Serves with `ThreadingHTTPServer` (matches `python -m http.server`: threaded +
  `allow_reuse_address`) on port 8765.

### `serve.ps1`

Mirrors `start.ps1`'s port logic but does not block and uses a windowless server:

1. Probe `http://localhost:8765/office.html`. If a live server already answers →
   skip starting, just open the browser (reuse).
2. Otherwise kill any stale **listeners** on 8765 (same filter as `start.ps1`:
   `Get-NetTCPConnection -State Listen`, `OwningProcess > 0`).
3. Start the server **detached and windowless** via `py/serve.py`:
   `Start-Process pythonw.exe -ArgumentList '"<abs>\py\serve.py"' -WorkingDirectory $ScriptDir`.
   `pythonw.exe` has no console window and the process survives `serve.ps1` exiting.
   Confirmed present at `...\Python313\pythonw.exe`.
   - The script path **must be quoted** inside the argument string — the repo path
     contains spaces and `Start-Process -ArgumentList` does not auto-quote on Windows
     PowerShell 5.1, so an unquoted path splits at the spaces and the server never starts.
   - **Fallback** (guard): if `pythonw.exe` is not found, run `py/serve.py` with
     `python.exe -WindowStyle Hidden`.
4. Poll `http://localhost:8765/office.html` until it answers 200 (up to ~10s) — `pythonw`
   can take longer than a fixed sleep to cold-start.
5. Open the browser: `Start-Process $url`.
6. Exit (no `Wait-Job`).

### `install-autostart.ps1`

- Resolves the absolute path to `serve.ps1` from its own location.
- Task name: `SorKhonKaenOffice`.
- Trigger: `New-ScheduledTaskTrigger -AtLogOn` (current user).
- Action: `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "<abs>\serve.ps1"`.
- Settings: run only when the user is logged on (no stored password → **no Admin**),
  `-ExecutionTimeLimit 0` (no run-time cap), allow start on battery, restart on
  failure.
- **Idempotent**: unregister an existing same-name task first, then register.
- Prints how to test (`Start-ScheduledTask -TaskName SorKhonKaenOffice`) and how to
  uninstall.

### `uninstall-autostart.ps1`

- `Unregister-ScheduledTask -TaskName SorKhonKaenOffice -Confirm:$false`.
- Also stop the currently running server: kill listeners on 8765 (same filter).
- Prints confirmation.

### Lifecycle

```
Login → Task Scheduler (AtLogOn) → hidden powershell → serve.ps1
      → reuse-or-start `pythonw py/serve.py` on 8765 (detached, no window)
      → open office.html in browser → powershell exits, pythonw keeps serving
Logout / reboot → pythonw dies with the session → next login restarts it
```

### Management

- Enable: run `install-autostart.ps1` once.
- Test now (no logout): `Start-ScheduledTask -TaskName SorKhonKaenOffice`.
- Disable / remove: run `uninstall-autostart.ps1`.
- Inspect: Task Scheduler GUI or `Get-ScheduledTask SorKhonKaenOffice`.

## Edge cases

- Live server already on 8765 → reuse, only open browser (no second instance).
- Stale/dead listener on 8765 → killed before starting (mirrors `start.ps1`).
- `pythonw.exe` missing → fall back to `python.exe -WindowStyle Hidden` (also runs
  `py/serve.py`).
- Repo path contains spaces → the `py/serve.py` argument is quoted (Start-Process on
  Windows PowerShell 5.1 does not auto-quote; an unquoted path would split and the
  server would silently never start).
- `pythonw -m http.server` would bind but return `ERR_EMPTY_RESPONSE` on every request
  (no usable console handles for the logger) → solved by `py/serve.py`'s devnull redirect.
- Hidden powershell launcher may flash for a fraction of a second on some machines;
  the server itself (`pythonw`) is fully windowless.

## Out of scope

- No true system-level Windows Service (no pre-login / boot start, no Admin, no
  `nssm`/`sc.exe`).
- No changes to `office.html`, `css/`, `js/`, or `py/log-event.py` (the hook is
  untouched; `py/serve.py` is a new, separate file).
- No new sprite/furniture art (no visual-preview workflow needed).

## Docs

- Add a short "Auto-start at login" subsection to CLAUDE.md §2 (Running the project).

## Verification

- `serve.ps1` standalone: run it → a `pythonw.exe` serves 8765, browser opens to
  `office.html`, **no window lingers**; run again → reuses, no duplicate process.
- `install-autostart.ps1` → `Get-ScheduledTask SorKhonKaenOffice` shows it
  registered; `Start-ScheduledTask` brings up server + browser with no visible
  window.
- `uninstall-autostart.ps1` → task gone, server on 8765 stopped.
- Human confirms the real path by logging out and back in.
