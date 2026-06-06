# serve.ps1 — silent, non-blocking launcher for the office dashboard.
# Used by the AtLogOn scheduled task (see install-autostart.ps1). Unlike start.ps1
# it does NOT block: it ensures a windowless server is running on 8765, opens the
# browser, and exits. The server (pythonw) keeps running after this script exits.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$url = "http://localhost:8765/office.html"

# If a live server already answers, don't spawn a duplicate — just open the page.
$alreadyServing = $false
try {
    $resp = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $alreadyServing = $true }
} catch { }

if (-not $alreadyServing) {
    # Port occupied but not serving (stale/dead) -> stop EVERY listener on 8765
    # (filter out OwningProcess 0 from TIME_WAIT entries; kill all, not just one).
    $pids = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
            Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
    foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
    if ($pids) { Start-Sleep -Milliseconds 500 }

    # Start the server detached and windowless via py/serve.py. pythonw.exe has no
    # console window and the process survives this script exiting. We must NOT use
    # `pythonw -m http.server` directly: with no console its std handles are unusable
    # and http.server's request logger aborts every response (ERR_EMPTY_RESPONSE) —
    # py/serve.py silences logging so requests serve. Fall back to a hidden python.exe
    # window if pythonw is unavailable.
    # The repo path contains spaces, so the script path MUST be quoted in the
    # argument string — Start-Process -ArgumentList does not auto-quote on Windows
    # PowerShell 5.1, and an unquoted path splits at the spaces (the server then
    # never starts).
    $servePy = '"' + (Join-Path $ScriptDir 'py\serve.py') + '"'
    $pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
    if ($pythonw) {
        Start-Process -FilePath $pythonw `
            -ArgumentList $servePy `
            -WorkingDirectory $ScriptDir
    } else {
        Start-Process -FilePath 'python.exe' `
            -ArgumentList $servePy `
            -WorkingDirectory $ScriptDir `
            -WindowStyle Hidden
    }

    # pythonw can take a couple of seconds to cold-start (longer than a fixed
    # sleep would safely cover), so poll until it actually answers before opening
    # the browser — otherwise the first page load hits a dead port.
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($r.StatusCode -eq 200) { break }
        } catch { }
    }
}

# Open the browser to the dashboard.
Start-Process $url
