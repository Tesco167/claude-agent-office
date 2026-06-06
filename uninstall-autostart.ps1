# uninstall-autostart.ps1 — remove the login autostart task and stop the running
# server. Reverses install-autostart.ps1.

$TaskName = 'SorKhonKaenOffice'

# Remove the scheduled task.
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Green
} else {
    Write-Host "No scheduled task '$TaskName' found." -ForegroundColor Yellow
}

# Stop the running server: kill EVERY listener on 8765 (filter out OwningProcess 0).
$pids = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 }
foreach ($p in $pids) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue }
if ($pids) {
    Write-Host "Stopped server on port 8765." -ForegroundColor Green
} else {
    Write-Host "No server running on port 8765." -ForegroundColor Yellow
}
