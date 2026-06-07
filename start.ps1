$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$url = "http://localhost:8765/office.html"

Write-Host "Starting ส. ขอนแก่น Office..." -ForegroundColor Cyan

# If a server is already serving the page, reuse it — don't spawn a duplicate.
$alreadyServing = $false
try {
    $resp = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { $alreadyServing = $true }
} catch { }

if ($alreadyServing) {
    Write-Host "Server already running at $url - reusing it." -ForegroundColor Green
    Start-Process $url
    return
}

# Port occupied but not serving (stale/dead) -> stop EVERY listener on 8765
# (filter out OwningProcess 0 from TIME_WAIT entries; kill all, not just one).
$pids = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
if ($pids) { Start-Sleep -Milliseconds 500 }

# Start python HTTP server in background (py/serve.py adds no-cache headers so
# edits always show on reload — `python -m http.server` lets the browser cache).
$job = Start-Job -ScriptBlock {
    param($dir)
    python (Join-Path $dir "py\serve.py")
} -ArgumentList $ScriptDir

Start-Sleep 1

# Open browser
try {
    $resp = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-Host "Server running at $url" -ForegroundColor Green
        Start-Process $url
    }
} catch {
    Write-Host "Server started (could not verify - open $url manually)" -ForegroundColor Yellow
    Start-Process $url
}

Write-Host "Press Ctrl+C to stop." -ForegroundColor Yellow
Wait-Job $job | Out-Null
