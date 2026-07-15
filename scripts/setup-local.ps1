param(
  [switch]$LiveRemnawave
)

$ErrorActionPreference = "Stop"

$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$EnvPath = Join-Path $Root ".env"
$ExampleEnvPath = Join-Path $Root ".env.example"
$DefaultLiveRemnawaveBaseUrl = "https://panel.pulsar-cloud.space"
$DefaultLiveRemnawaveStandardSquad = "1d64e64b-b56e-4fa5-a947-f0d071114ddf"
$DefaultLiveRemnawaveLteSquad = "1d0c6f11-8049-48c0-8d2b-ed79f00ad128"
$DefaultLocalRemnawaveNamespace = "pulsar_local_test"

function Get-DotEnvValues {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $pattern = "(?m)^[ `t]*$([Regex]::Escape($Name))[ `t]*=[ `t]*(.*?)[ `t]*$"
  $values = @()
  foreach ($match in [Regex]::Matches($Content, $pattern)) {
    $value = $match.Groups[1].Value.Trim()
    if (
      $value.Length -ge 2 -and
      (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or
        ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))
    ) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    $values += $value
  }
  return $values
}

function Get-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $values = @(Get-DotEnvValues -Content $Content -Name $Name)
  if ($values.Count -eq 0) { return $null }
  return $values[$values.Count - 1]
}

function Set-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Value
  )

  $pattern = "(?m)^[ `t]*$([Regex]::Escape($Name))[ `t]*=.*$"
  $line = "$Name=$Value"
  $matches = [Regex]::Matches($Content, $pattern)
  if ($matches.Count -gt 0) {
    # dotenv uses the last definition. Replace only that effective definition
    # so earlier text (including a user's preserved secret) is never rewritten.
    $match = $matches[$matches.Count - 1]
    return $Content.Substring(0, $match.Index) + $line + $Content.Substring($match.Index + $match.Length)
  }

  if ($Content.Length -gt 0 -and -not $Content.EndsWith("`n")) {
    $Content += "`r`n"
  }
  return $Content + $line + "`r`n"
}

function New-HexSecret {
  param([int]$ByteCount = 32)

  $bytes = New-Object byte[] $ByteCount
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $generator.GetBytes($bytes)
  }
  finally {
    $generator.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-OrCreateSecret {
  param(
    [Parameter(Mandatory = $true)][string]$Content,
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][ValidateSet("text", "hex")][string]$Kind
  )

  $value = Get-DotEnvValue -Content $Content -Name $Name
  $isPlaceholder = $null -eq $value -or [string]::IsNullOrWhiteSpace($value) -or $value -match '^replace-with-'
  if ($isPlaceholder) {
    return [PSCustomObject]@{
      Value       = New-HexSecret
      ShouldWrite = $true
    }
  }

  if ($Kind -eq "hex" -and $value -notmatch '^[a-fA-F0-9]{64}$') {
    throw "$Name already exists but is not a 64-character hexadecimal key. No files were changed. Fix it manually instead of rotating it implicitly."
  }
  if ($Kind -eq "text" -and $value.Length -lt 32) {
    throw "$Name already exists but is shorter than 32 characters. No files were changed. Fix it manually instead of rotating it implicitly."
  }
  return [PSCustomObject]@{
    Value       = $value
    ShouldWrite = $false
  }
}

function Invoke-Npm {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

function Assert-AbsoluteHttpsUrl {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $uri = $null
  if (
    -not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri) -or
    $uri.Scheme -ne "https" -or
    -not [string]::IsNullOrEmpty($uri.UserInfo) -or
    -not [string]::IsNullOrEmpty($uri.Query) -or
    -not [string]::IsNullOrEmpty($uri.Fragment)
  ) {
    throw "$Name must be an absolute HTTPS URL without credentials, query, or fragment. No files were changed."
  }
}

function Assert-Uuid {
  param(
    [Parameter(Mandatory = $true)][string]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $parsed = [Guid]::Empty
  if (-not [Guid]::TryParse($Value, [ref]$parsed)) {
    throw "$Name must be a valid UUID. No files were changed."
  }
}

if (Test-Path -LiteralPath $EnvPath) {
  $content = [IO.File]::ReadAllText($EnvPath)
  $appEnvironments = @(Get-DotEnvValues -Content $content -Name "APP_ENV")
  $normalizedEnvironments = @($appEnvironments | ForEach-Object { $_.Trim().ToLowerInvariant() })

  if ($normalizedEnvironments -contains "production") {
    throw "Refusing to modify $EnvPath because it contains APP_ENV=production. Create a separate development checkout or move the production env to /etc/pulsar on the VPS."
  }
  if ($normalizedEnvironments.Count -eq 0 -or @($normalizedEnvironments | Where-Object { $_ -notin @("development", "test") }).Count -gt 0) {
    throw "Refusing to modify existing $EnvPath because APP_ENV is missing or is not explicitly development/test. No files were changed."
  }
}
else {
  if (-not (Test-Path -LiteralPath $ExampleEnvPath)) {
    throw "Missing $ExampleEnvPath"
  }
  $content = [IO.File]::ReadAllText($ExampleEnvPath)
}

$liveRemnawaveValues = $null
if ($LiveRemnawave) {
  $baseUrl = Get-DotEnvValue -Content $content -Name "REMNAWAVE_BASE_URL"
  if ([string]::IsNullOrWhiteSpace($baseUrl)) {
    $baseUrl = $DefaultLiveRemnawaveBaseUrl
  }

  $standardSquad = Get-DotEnvValue -Content $content -Name "REMNAWAVE_STANDARD_SQUAD_UUID"
  if ([string]::IsNullOrWhiteSpace($standardSquad)) {
    $standardSquad = $DefaultLiveRemnawaveStandardSquad
  }

  $lteSquad = Get-DotEnvValue -Content $content -Name "REMNAWAVE_LTE_SQUAD_UUID"
  if ([string]::IsNullOrWhiteSpace($lteSquad)) {
    $lteSquad = $DefaultLiveRemnawaveLteSquad
  }

  $apiToken = Get-DotEnvValue -Content $content -Name "REMNAWAVE_API_TOKEN"
  if (
    [string]::IsNullOrWhiteSpace($apiToken) -or
    $apiToken -match '^replace-with-' -or
    $apiToken.Length -lt 16
  ) {
    throw "-LiveRemnawave requires a dedicated local-test REMNAWAVE_API_TOKEN (16+ characters) in .env. Never copy the production Pulsar token. No files were changed."
  }

  $userNamespace = Get-DotEnvValue -Content $content -Name "REMNAWAVE_USER_NAMESPACE"
  if ([string]::IsNullOrWhiteSpace($userNamespace) -or $userNamespace -eq "pulsar") {
    $userNamespace = $DefaultLocalRemnawaveNamespace
  }
  if ($userNamespace -notmatch '^[a-z][a-z0-9_-]{0,31}$') {
    throw "REMNAWAVE_USER_NAMESPACE must start with a lowercase letter and contain at most 32 lowercase letters, digits, underscores, or hyphens. No files were changed."
  }

  Assert-AbsoluteHttpsUrl -Value $baseUrl -Name "REMNAWAVE_BASE_URL"
  Assert-Uuid -Value $standardSquad -Name "REMNAWAVE_STANDARD_SQUAD_UUID"
  Assert-Uuid -Value $lteSquad -Name "REMNAWAVE_LTE_SQUAD_UUID"
  if ($standardSquad -eq $lteSquad) {
    throw "REMNAWAVE_STANDARD_SQUAD_UUID and REMNAWAVE_LTE_SQUAD_UUID must differ. No files were changed."
  }

  $liveRemnawaveValues = [ordered]@{
    REMNAWAVE_PROVIDER               = "http"
    REMNAWAVE_USER_NAMESPACE         = $userNamespace
    REMNAWAVE_BASE_URL               = $baseUrl
    REMNAWAVE_STANDARD_SQUAD_UUID     = $standardSquad
    REMNAWAVE_LTE_SQUAD_UUID          = $lteSquad
    PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "true"
  }
}
else {
  $existingRemnawaveToken = Get-DotEnvValue -Content $content -Name "REMNAWAVE_API_TOKEN"
  if (-not [string]::IsNullOrWhiteSpace($existingRemnawaveToken)) {
    Write-Warning "Mock mode does not revoke or clear the existing Remnawave API token. Revoke this full-access local-test token in the Panel UI and clear REMNAWAVE_API_TOKEN when live testing is complete."
  }
}

# Validate every existing secret before creating the backup or changing content.
# Valid values are preserved; only missing/example placeholders are generated.
$sessionSecret = Get-OrCreateSecret -Content $content -Name "SESSION_SECRET" -Kind "text"
$authPepper = Get-OrCreateSecret -Content $content -Name "AUTH_PEPPER" -Kind "text"
$encryptionKey = Get-OrCreateSecret -Content $content -Name "DATA_ENCRYPTION_KEY" -Kind "hex"

$updates = [ordered]@{
  APP_ENV                             = "development"
  APP_URL                             = "http://localhost:3000"
  # Prisma's Windows migration engine handles this repository-relative URL
  # consistently, including when the checkout path contains non-ASCII text.
  DATABASE_URL                        = "file:./prisma/dev.db"
  PAYMENT_PROVIDER                    = "test"
  BILLING_ENABLED                     = "false"
  REMNAWAVE_PROVIDER                  = "mock"
  REMNAWAVE_USER_NAMESPACE            = $DefaultLocalRemnawaveNamespace
  PULSAR_TEST_MODE                    = "true"
  PULSAR_ALLOW_TEST_MODE_IN_PRODUCTION = "false"
  PULSAR_ALLOW_LIVE_REMNAWAVE_IN_TEST_MODE = "false"
}

if ($LiveRemnawave) {
  foreach ($entry in $liveRemnawaveValues.GetEnumerator()) {
    $updates[$entry.Key] = $entry.Value
  }
}

foreach ($entry in $updates.GetEnumerator()) {
  $content = Set-DotEnvValue -Content $content -Name $entry.Key -Value $entry.Value
}

$secrets = [ordered]@{
  SESSION_SECRET      = $sessionSecret
  AUTH_PEPPER         = $authPepper
  DATA_ENCRYPTION_KEY = $encryptionKey
}
foreach ($entry in $secrets.GetEnumerator()) {
  if ($entry.Value.ShouldWrite) {
    $content = Set-DotEnvValue -Content $content -Name $entry.Key -Value $entry.Value.Value
  }
}

if (Test-Path -LiteralPath $EnvPath) {
  $timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
  $backupPath = "$EnvPath.local-setup-backup-$timestamp"
  if (Test-Path -LiteralPath $backupPath) {
    $backupPath += "-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
  }
  Copy-Item -LiteralPath $EnvPath -Destination $backupPath -ErrorAction Stop
  Write-Host "Backed up the previous development env to $backupPath"
}

$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($EnvPath, $content, $utf8WithoutBom)
if ($LiveRemnawave) {
  Write-Host "Prepared development-only env at $EnvPath (test payment + live Remnawave with an isolated user namespace)."
}
else {
  Write-Host "Prepared development-only env at $EnvPath (test payment + mock Remnawave)."
}

$databaseFile = Join-Path $Root "prisma\dev.db"
if (-not (Test-Path -LiteralPath $databaseFile)) {
  New-Item -ItemType File -Path $databaseFile -Force | Out-Null
}

Set-Location $Root
Invoke-Npm -Arguments @("ci", "--include=dev")
Invoke-Npm -Arguments @("run", "db:generate")
Invoke-Npm -Arguments @("run", "db:deploy")
Invoke-Npm -Arguments @("run", "db:seed")
Write-Host "Local setup complete. Run scripts/dev.ps1."
