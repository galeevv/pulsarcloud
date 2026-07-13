$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$worker = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:worker" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
try { npm run dev } finally { if (-not $worker.HasExited) { Stop-Process -Id $worker.Id } }
