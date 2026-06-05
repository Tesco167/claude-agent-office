$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir

Write-Host "Starting ส. ขอนแก่น Office..." -ForegroundColor Cyan

# Kill any previous server on 8765
$conn = Get-NetTCPConnection -LocalPort 8765 -ErrorAction SilentlyContinue
if ($conn) {
    $pid_ = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).Id
    if ($pid_) { Stop-Process -Id $pid_ -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 500
}

# Start python HTTP server in background
$job = Start-Job -ScriptBlock {
    param($dir)
    Set-Location $dir
    python -m http.server 8765
} -ArgumentList $ScriptDir

Start-Sleep 1

# Open browser
$url = "http://localhost:8765/office.html"
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
