$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$worker = Start-Process -FilePath "npm.cmd" -ArgumentList "run", "dev:worker" -WorkingDirectory $Root -WindowStyle Hidden -PassThru
try {
  npm run dev
}
finally {
  if (-not $worker.HasExited) {
    # npm.cmd starts the tsx worker as a child process. Stop the complete tree so
    # Ctrl+C does not leave a hidden worker holding SQLite or source files open.
    & taskkill.exe /PID $worker.Id /T /F 2>$null | Out-Null
  }
}
