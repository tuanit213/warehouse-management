param(
  [string]$EnvFile = ".env.production",
  [switch]$WithProxy,
  [switch]$WithObservability,
  [switch]$SkipSecurityAudit,
  [switch]$SkipHealth,
  [switch]$SkipSmoke,
  [switch]$SkipLogCheck,
  [switch]$ConfirmSkipGates,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

function Import-EnvFile {
  param([Parameter(Mandatory=$true)][string]$Path)

  $managedKeys = @(
    "NODE_ENV",
    "JWT_SECRET",
    "INTERNAL_GATEWAY_TOKEN",
    "JWT_EXPIRES_IN",
    "REFRESH_TOKEN_DAYS",
    "POSTGRES_USER",
    "POSTGRES_PASSWORD",
    "AUTH_DB",
    "PRODUCT_DB",
    "INVENTORY_DB",
    "TRANSACTION_DB",
    "REPORT_DB",
    "RABBITMQ_DEFAULT_USER",
    "RABBITMQ_DEFAULT_PASS",
    "CORS_ORIGIN",
    "NEXT_PUBLIC_API_URL",
    "PRODUCT_PUBLIC_BASE_URL",
    "PRODUCT_UPLOAD_DIR",
    "PRODUCT_IMAGE_MAX_BYTES",
    "BOOTSTRAP_ADMIN_EMAIL",
    "BOOTSTRAP_ADMIN_PASSWORD",
    "BOOTSTRAP_ADMIN_NAME",
    "SMOKE_ADMIN_EMAIL",
    "SMOKE_ADMIN_PASSWORD",
    "SMOKE_ADMIN_ACCESS_TOKEN",
    "WMS_ADMIN_ACCESS_TOKEN",
    "PUBLIC_FRONTEND_HOST",
    "PUBLIC_API_HOST",
    "ACME_EMAIL",
    "HTTP_PORT",
    "HTTPS_PORT",
    "FRONTEND_PORT",
    "PROXY_TIMEOUT_MS",
    "AUTH_VERIFY_TIMEOUT_MS",
    "INVENTORY_API_URL",
    "PRODUCT_API_URL",
    "TRANSACTION_OUTBOX_PUBLISHER_ENABLED",
    "TRANSACTION_OUTBOX_EXCHANGE",
    "TRANSACTION_OUTBOX_DEAD_EXCHANGE",
    "TRANSACTION_OUTBOX_DEAD_QUEUE",
    "TRANSACTION_OUTBOX_POLL_MS",
    "TRANSACTION_OUTBOX_BATCH_SIZE",
    "TRANSACTION_OUTBOX_MAX_ATTEMPTS",
    "TRANSACTION_OUTBOX_STALE_MINUTES",
    "INVENTORY_TRANSACTION_CONSUMER_ENABLED",
    "INVENTORY_TRANSACTION_EVENTS_QUEUE",
    "INVENTORY_TRANSACTION_DEAD_EXCHANGE",
    "INVENTORY_TRANSACTION_DEAD_QUEUE",
    "INVENTORY_TRANSACTION_CONSUMER_PREFETCH",
    "PROMETHEUS_PORT",
    "PROMETHEUS_RETENTION",
    "GRAFANA_PORT",
    "GRAFANA_ADMIN_USER",
    "GRAFANA_ADMIN_PASSWORD",
    "LOKI_PORT",
    "OBSERVABILITY_BIND_HOST",
    "OBSERVABILITY_EXPOSE_PUBLIC",
    "PRODUCTION_COMPOSE_PROFILES",
    "ALLOW_LOCAL_PRODUCTION_URLS",
    "API_URL",
    "WMS_API_URL",
    "FRONTEND_URL"
  )
  foreach ($key in $managedKeys) {
    [Environment]::SetEnvironmentVariable($key, $null, "Process")
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) { return }
    $key, $value = $line.Split("=", 2)
    [Environment]::SetEnvironmentVariable($key, $value.Trim("'"""), "Process")
  }
}

function Set-ProcessEnv {
  param(
    [Parameter(Mandatory=$true)][string]$Key,
    [AllowEmptyString()][string]$Value
  )

  if ($Value) {
    [Environment]::SetEnvironmentVariable($Key, $Value, "Process")
  }
}

function Set-DefaultProcessEnv {
  param(
    [Parameter(Mandatory=$true)][string]$Key,
    [AllowEmptyString()][string]$Value
  )

  if ($Value -and -not [Environment]::GetEnvironmentVariable($Key, "Process")) {
    [Environment]::SetEnvironmentVariable($Key, $Value, "Process")
  }
}

function Invoke-Step {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Name"
  & $Action
}

function Invoke-CommandLine {
  param(
    [Parameter(Mandatory=$true)][string[]]$Command,
    [switch]$RunInDryRun
  )

  $display = $Command -join " "
  if ($DryRun -and -not $RunInDryRun) {
    Write-Host "[dry-run] $display"
    return
  }
  if ($DryRun -and $RunInDryRun) {
    Write-Host "[dry-run:validate] $display"
  }

  & $Command[0] @($Command | Select-Object -Skip 1)
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($LASTEXITCODE): $display"
  }
}

function Test-SmokeCredentialsConfigured {
  $hasToken = [bool]($env:SMOKE_ADMIN_ACCESS_TOKEN -or $env:WMS_ADMIN_ACCESS_TOKEN)
  $hasCredentialPair = [bool]($env:SMOKE_ADMIN_EMAIL -and $env:SMOKE_ADMIN_PASSWORD)
  return $hasToken -or $hasCredentialPair
}

function Get-SkippedVerificationGates {
  $skipped = @()
  if ($SkipSecurityAudit) { $skipped += "security audit" }
  if ($SkipHealth) { $skipped += "health check" }
  if ($SkipSmoke) { $skipped += "smoke test" }
  if ($SkipLogCheck) { $skipped += "log scan" }
  return $skipped
}

if (-not (Test-Path $EnvFile)) {
  throw "Environment file not found: $EnvFile"
}

$resolvedEnvFile = (Resolve-Path $EnvFile).Path
$env:PRODUCTION_ENV_FILE = $resolvedEnvFile
Import-EnvFile -Path $resolvedEnvFile
Set-ProcessEnv -Key "API_URL" -Value $env:NEXT_PUBLIC_API_URL
Set-ProcessEnv -Key "WMS_API_URL" -Value $env:API_URL
Set-ProcessEnv -Key "FRONTEND_URL" -Value $env:CORS_ORIGIN
Set-DefaultProcessEnv -Key "HEALTH_CHECK_RETRIES" -Value "30"
Set-DefaultProcessEnv -Key "HEALTH_CHECK_RETRY_DELAY_MS" -Value "5000"

$activeProfiles = @()
if ($WithProxy) { $activeProfiles += "proxy" }
if ($WithObservability) { $activeProfiles += "observability" }
$activeProfilesValue = if ($activeProfiles.Count -gt 0) { $activeProfiles -join "," } else { "none" }
Set-ProcessEnv -Key "PRODUCTION_COMPOSE_PROFILES" -Value $activeProfilesValue

Write-Host "Verification API_URL=$env:API_URL"
Write-Host "Verification FRONTEND_URL=$env:FRONTEND_URL"

$skippedVerificationGates = @(Get-SkippedVerificationGates)
if ($skippedVerificationGates.Count -gt 0) {
  if (-not $ConfirmSkipGates) {
    throw "Skipping verification gates requires explicit confirmation. Re-run with -ConfirmSkipGates after approving skipped gate(s): $($skippedVerificationGates -join ', ')."
  }
  Write-Warning "Skipping approved verification gate(s): $($skippedVerificationGates -join ', ')"
}

Invoke-Step "Validate production environment" {
  Invoke-CommandLine -Command @("node", "scripts/validate-production-env.js", "--active-profiles", $activeProfilesValue) -RunInDryRun
}

if (-not $SkipSecurityAudit) {
  Invoke-Step "Run security audit" {
    Invoke-CommandLine -Command @("npm", "run", "security:audit") -RunInDryRun
  }
}

if (-not $SkipSmoke) {
  Invoke-Step "Validate smoke credentials" {
    if (-not (Test-SmokeCredentialsConfigured)) {
      throw "Smoke test is enabled but no dedicated smoke credential is configured. Set SMOKE_ADMIN_EMAIL+SMOKE_ADMIN_PASSWORD or SMOKE_ADMIN_ACCESS_TOKEN, or re-run with -SkipSmoke only for an explicitly approved verification."
    }
    Write-Host "Smoke credentials configured."
  }
}

if (-not $SkipHealth) {
  Invoke-Step "Run health check" {
    Invoke-CommandLine @("npm", "run", "health:check")
  }
}

if (-not $SkipSmoke) {
  Invoke-Step "Run smoke test" {
    Invoke-CommandLine @("npm", "run", "smoke:test")
  }
}

if ($WithObservability) {
  Invoke-Step "Run observability check" {
    Invoke-CommandLine @("npm", "run", "observability:check")
  }
}

if (-not $SkipLogCheck) {
  Invoke-Step "Scan production logs" {
    Invoke-CommandLine @("npm", "run", "prod:logs:check")
  }
}

Write-Host ""
Write-Host "Production verification workflow completed."
