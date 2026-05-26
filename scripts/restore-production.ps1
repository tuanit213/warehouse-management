param(
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$EnvFile = ".env.production",
  [switch]$ConfirmRestore,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $BackupPath)) { throw "Backup path not found: $BackupPath" }

if (Test-Path $EnvFile) {
  $managedKeys = @("POSTGRES_USER", "AUTH_DB", "PRODUCT_DB", "INVENTORY_DB", "TRANSACTION_DB", "REPORT_DB", "PRODUCT_UPLOAD_DIR")
  foreach ($key in $managedKeys) {
    [Environment]::SetEnvironmentVariable($key, $null, "Process")
  }

  Get-Content $EnvFile | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $key, $value = $line.Split("=", 2)
      [Environment]::SetEnvironmentVariable($key, $value.Trim("'"""), "Process")
    }
  }
}

if (-not $env:POSTGRES_USER) {
  throw "POSTGRES_USER is required for production restore. Set it in $EnvFile or the process environment."
}
$postgresUser = $env:POSTGRES_USER
$rawProductUploadDir = if ($env:PRODUCT_UPLOAD_DIR) { $env:PRODUCT_UPLOAD_DIR } else { "/app/uploads/products" }

function Assert-SafePostgresUser {
  param([Parameter(Mandatory=$true)][string]$Value)

  if ($Value -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
    throw "POSTGRES_USER must be a PostgreSQL role name using letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters"
  }
}

function Assert-SafeContainerPath {
  param(
    [Parameter(Mandatory=$true)][string]$Name,
    [Parameter(Mandatory=$true)][string]$Value
  )

  if (-not $Value.StartsWith('/')) { throw "$Name must be an absolute Linux container path" }
  if ($Value -eq '/') { throw "$Name must not be the container root path" }
  if ($Value.Contains('..')) { throw "$Name must not contain path traversal segments" }
  if ($Value -match '\s') { throw "$Name must not contain whitespace" }
  if ($Value.Length -gt 1 -and $Value.EndsWith('/')) { throw "$Name must not end with a trailing slash" }
}

function Get-SafeDatabaseName {
  param(
    [Parameter(Mandatory=$true)][string]$EnvKey,
    [Parameter(Mandatory=$true)][string]$DefaultDatabase
  )

  $value = [Environment]::GetEnvironmentVariable($EnvKey, "Process")
  $database = if ($value) { $value } else { $DefaultDatabase }
  if ($database -notmatch '^[A-Za-z_][A-Za-z0-9_]{0,62}$') {
    throw "$EnvKey must be a PostgreSQL database name using letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters"
  }
  return $database
}

Assert-SafePostgresUser -Value $postgresUser
Assert-SafeContainerPath -Name "PRODUCT_UPLOAD_DIR" -Value $rawProductUploadDir
$productUploadDir = $rawProductUploadDir
$manifestPath = Join-Path $BackupPath "manifest.json"
$manifest = $null
if (Test-Path $manifestPath) {
  $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
}
if ($manifest) {
  if ($manifest.status -and $manifest.status -ne "COMPLETED") {
    throw "Backup manifest status is '$($manifest.status)', not COMPLETED. Refusing to restore a partial backup."
  }
  if ($manifest.postgresUser -and $manifest.postgresUser -ne $postgresUser) {
    throw "Backup manifest postgresUser is '$($manifest.postgresUser)', but target POSTGRES_USER is '$postgresUser'. Refusing to restore with a different database role."
  }
  if (-not $manifest.postgresUser) {
    Write-Warning "Backup manifest has no postgresUser field; treating it as a legacy backup."
  }
  if (-not $manifest.status) {
    Write-Warning "Backup manifest has no status field; treating it as a legacy backup."
  }
}

$databases = @(
  @{ Container = "wms-auth-service-db"; Database = Get-SafeDatabaseName -EnvKey "AUTH_DB" -DefaultDatabase "auth_db" },
  @{ Container = "wms-product-service-db"; Database = Get-SafeDatabaseName -EnvKey "PRODUCT_DB" -DefaultDatabase "product_db" },
  @{ Container = "wms-inventory-service-db"; Database = Get-SafeDatabaseName -EnvKey "INVENTORY_DB" -DefaultDatabase "inventory_db" },
  @{ Container = "wms-transaction-service-db"; Database = Get-SafeDatabaseName -EnvKey "TRANSACTION_DB" -DefaultDatabase "transaction_db" },
  @{ Container = "wms-report-service-db"; Database = Get-SafeDatabaseName -EnvKey "REPORT_DB" -DefaultDatabase "report_db" }
)

foreach ($item in $databases) {
  $file = Join-Path $BackupPath "$($item.Database).sql"
  if (-not (Test-Path $file)) { throw "Missing backup file: $file" }
  if ((Get-Item $file).Length -le 0) { throw "Backup file is empty: $file" }
  if ($manifest) {
    $entry = @($manifest.databases | Where-Object { $_.database -eq $item.Database -and $_.file -eq "$($item.Database).sql" }) | Select-Object -First 1
    if (-not $entry) { throw "Manifest is missing database entry for $($item.Database)" }
    $hash = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLowerInvariant()
    if ($hash -ne $entry.sha256) { throw "Checksum mismatch for $file" }
  }
}
if ($manifest) {
  Write-Host "Backup manifest verified: $manifestPath"
  if ($manifest.dumpFormat -and $manifest.dumpFormat -ne "plain-sql-clean-if-exists") {
    Write-Warning "Backup dump format is '$($manifest.dumpFormat)'. Restoring over an existing schema may require a fresh target database."
  } elseif (-not $manifest.dumpFormat) {
    Write-Warning "Backup manifest has no dumpFormat. Legacy backup may require a fresh target database."
  }
} else {
  Write-Warning "Backup manifest not found; checksum validation skipped for legacy backup."
  Write-Warning "Legacy backup may require a fresh target database because dump cleanup metadata is unavailable."
}

$uploadSource = Join-Path $BackupPath "product-uploads"
if ($manifest -and $manifest.productUploads) {
  if (-not (Test-Path $uploadSource)) { throw "Missing product uploads backup directory: $uploadSource" }
  $uploadFiles = @(Get-ChildItem -Path $uploadSource -Recurse -File -ErrorAction SilentlyContinue)
  $uploadBytes = ($uploadFiles | Measure-Object -Property Length -Sum).Sum
  if (-not $uploadBytes) { $uploadBytes = 0 }
  if ($manifest.productUploads.fileCount -ne $null -and [int]$manifest.productUploads.fileCount -ne $uploadFiles.Count) {
    throw "Product uploads file count mismatch"
  }
  if ($manifest.productUploads.bytes -ne $null -and [int64]$manifest.productUploads.bytes -ne [int64]$uploadBytes) {
    throw "Product uploads byte count mismatch"
  }
  if ($manifest.productUploads.files) {
    foreach ($entry in $manifest.productUploads.files) {
      $relative = [string]$entry.path
      if (-not $relative -or [IO.Path]::IsPathRooted($relative) -or $relative.Contains('..')) {
        throw "Unsafe product upload path in manifest: $relative"
      }
      $file = Join-Path $uploadSource ($relative -replace '/', [IO.Path]::DirectorySeparatorChar)
      if (-not (Test-Path $file)) { throw "Missing product upload backup file: $relative" }
      if ([int64](Get-Item $file).Length -ne [int64]$entry.bytes) { throw "Product upload byte mismatch: $relative" }
      $hash = (Get-FileHash -Algorithm SHA256 -Path $file).Hash.ToLowerInvariant()
      if ($hash -ne $entry.sha256) { throw "Product upload checksum mismatch: $relative" }
    }
  } else {
    Write-Warning "Backup manifest has no per-file product upload checksums; validated aggregate upload count and bytes only."
  }
}

Write-Host "Restore plan:"
foreach ($item in $databases) {
  $file = Join-Path $BackupPath "$($item.Database).sql"
  Write-Host "  $($item.Database) -> $($item.Container) from $file"
}
if (Test-Path $uploadSource) {
  Write-Host "  product uploads -> wms-product-service:$productUploadDir from $uploadSource"
}

if ($DryRun) {
  Write-Host "Dry run completed. No data was restored."
  return
}

if (-not $ConfirmRestore) {
  throw "Restore is destructive and requires explicit confirmation. Re-run with -ConfirmRestore after stopping write traffic and creating a fresh backup."
}

foreach ($item in $databases) {
  $file = Join-Path $BackupPath "$($item.Database).sql"
  $containerFile = "/tmp/wms-restore-$($item.Database)-$(Get-Date -Format 'yyyyMMddHHmmssfff').sql"
  Write-Host "Restoring $($item.Database) into $($item.Container) from $file"
  try {
    docker cp $file "$($item.Container):$containerFile"
    if ($LASTEXITCODE -ne 0) { throw "Copy restore file failed for $($item.Database)" }
    docker exec $item.Container psql -v ON_ERROR_STOP=1 -U $postgresUser -d $item.Database -f $containerFile
    if ($LASTEXITCODE -ne 0) { throw "Restore failed for $($item.Database)" }
  } finally {
    docker exec $item.Container rm -f $containerFile 2>$null | Out-Null
  }
}

if (Test-Path $uploadSource) {
  docker exec wms-product-service mkdir -p $productUploadDir | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Create product upload restore directory failed" }
  docker cp "$uploadSource/." "wms-product-service:$productUploadDir" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Product upload restore copy failed" }
  Write-Host "Product uploads restored from: $uploadSource"
}

Write-Host "Restore completed from: $BackupPath"
