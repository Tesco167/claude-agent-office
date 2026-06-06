# install-autostart.ps1 — register a per-user scheduled task that launches the
# office dashboard silently at login. No Admin required (the task runs only while
# you are logged on, so no stored password is needed). Idempotent: re-running
# replaces any existing task of the same name.

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ServePs1  = Join-Path $ScriptDir 'serve.ps1'
$TaskName  = 'SorKhonKaenOffice'

if (-not (Test-Path $ServePs1)) {
    Write-Host "Cannot find serve.ps1 at $ServePs1 - aborting." -ForegroundColor Red
    return
}

# Action: hidden PowerShell that runs serve.ps1, which starts the windowless
# server and opens the browser, then exits.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ServePs1`""

$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive

# Idempotent: remove any existing task of this name first.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Description 'Start the ส. ขอนแก่น office dashboard at login (silent).' | Out-Null

Write-Host "Registered scheduled task '$TaskName' (runs at login)." -ForegroundColor Green
Write-Host ""
Write-Host "Test now (no logout needed):  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Cyan
Write-Host "Inspect:                      Get-ScheduledTask $TaskName" -ForegroundColor Cyan
Write-Host "Remove:                       .\uninstall-autostart.ps1" -ForegroundColor Cyan
