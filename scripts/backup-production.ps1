param(
  [string]$EnvFile = ".env.production",
  [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"

function Import-BackupEnvFile {
  param([Parameter(Mandatory=$true)][string]$Path)

  $managedKeys = @("POSTGRES_USER", "AUTH_DB", "PRODUCT_DB", "INVENTORY_DB", "TRANSACTION_DB", "REPORT_DB", "PRODUCT_UPLOAD_DIR")
  foreach ($key in $managedKeys) {
    [Environment]::SetEnvironmentVariable($key, $null, "Process")
  }

  Get-Content $Path | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
      $key, $value = $line.Split("=", 2)
      [Environment]::SetEnvironmentVariable($key, $value.Trim("'"""), "Process")
    }
  }
}

if (Test-Path $EnvFile) {
  Import-BackupEnvFile -Path $EnvFile
}

if (-not $env:POSTGRES_USER) {
  throw "POSTGRES_USER is required for production backup. Set it in $EnvFile or the process environment."
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

$databases = @(
  @{ Container = "wms-auth-service-db"; Database = Get-SafeDatabaseName -EnvKey "AUTH_DB" -DefaultDatabase "auth_db" },
  @{ Container = "wms-product-service-db"; Database = Get-SafeDatabaseName -EnvKey "PRODUCT_DB" -DefaultDatabase "product_db" },
  @{ Container = "wms-inventory-service-db"; Database = Get-SafeDatabaseName -EnvKey "INVENTORY_DB" -DefaultDatabase "inventory_db" },
  @{ Container = "wms-transaction-service-db"; Database = Get-SafeDatabaseName -EnvKey "TRANSACTION_DB" -DefaultDatabase "transaction_db" },
  @{ Container = "wms-report-service-db"; Database = Get-SafeDatabaseName -EnvKey "REPORT_DB" -DefaultDatabase "report_db" }
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
$target = Join-Path $BackupDir $timestamp
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
New-Item -ItemType Directory -Path $target -ErrorAction Stop | Out-Null
$pgDumpArgs = @("--clean", "--if-exists")
$manifest = [ordered]@{
  createdAt = (Get-Date).ToUniversalTime().ToString("o")
  completedAt = $null
  failedAt = $null
  status = "IN_PROGRESS"
  error = $null
  postgresUser = $postgresUser
  dumpFormat = "plain-sql-clean-if-exists"
  pgDumpArgs = $pgDumpArgs
  databases = @()
  productUploads = $null
}
$manifestPath = Join-Path $target "manifest.json"

function Write-BackupManifest {
  param([Parameter(Mandatory=$true)]$Manifest)
  $Manifest | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 $manifestPath
}

function Get-RelativeBackupPath {
  param(
    [Parameter(Mandatory=$true)][string]$BasePath,
    [Parameter(Mandatory=$true)][string]$FilePath
  )

  $base = (Resolve-Path $BasePath).Path.TrimEnd([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
  $full = (Resolve-Path $FilePath).Path
  if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Upload file path is outside backup upload directory: $FilePath"
  }
  return $full.Substring($base.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar).Replace('\', '/')
}

Write-BackupManifest -Manifest $manifest

try {
  foreach ($item in $databases) {
    $db = $item.Database
    $container = $item.Container
    $file = Join-Path $target "$db.sql"
    $containerFile = "/tmp/wms-backup-$timestamp-$db.sql"
    Write-Host "Backing up $db from $container -> $file"
    try {
      docker exec $container pg_dump @pgDumpArgs -U $postgresUser -f $containerFile $db
      if ($LASTEXITCODE -ne 0) { throw "pg_dump failed for $db from $container" }
      docker cp "${container}:$containerFile" $file
      if ($LASTEXITCODE -ne 0) { throw "docker cp failed for $db from $container" }
    } finally {
      docker exec $container rm -f $containerFile 2>$null | Out-Null
    }
    if (-not (Test-Path $file) -or (Get-Item $file).Length -le 0) { throw "Backup file is empty or missing: $file" }
    $hash = Get-FileHash -Algorithm SHA256 -Path $file
    $manifest.databases += [ordered]@{
      database = $db
      container = $container
      file = "$db.sql"
      bytes = (Get-Item $file).Length
      sha256 = $hash.Hash.ToLowerInvariant()
    }
    Write-BackupManifest -Manifest $manifest
  }

  $uploadTarget = Join-Path $target "product-uploads"
  New-Item -ItemType Directory -Path $uploadTarget -ErrorAction Stop | Out-Null
  docker cp "wms-product-service:$productUploadDir/." $uploadTarget | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed for product uploads" }
  $uploadFiles = @(Get-ChildItem -Path $uploadTarget -Recurse -File -ErrorAction SilentlyContinue)
  $uploadBytes = ($uploadFiles | Measure-Object -Property Length -Sum).Sum
  if (-not $uploadBytes) { $uploadBytes = 0 }
  $uploadManifestFiles = @()
  foreach ($uploadFile in $uploadFiles) {
    $uploadHash = Get-FileHash -Algorithm SHA256 -Path $uploadFile.FullName
    $uploadManifestFiles += [ordered]@{
      path = Get-RelativeBackupPath -BasePath $uploadTarget -FilePath $uploadFile.FullName
      bytes = $uploadFile.Length
      sha256 = $uploadHash.Hash.ToLowerInvariant()
    }
  }
  $manifest.productUploads = [ordered]@{
    path = "product-uploads"
    fileCount = $uploadFiles.Count
    bytes = $uploadBytes
    files = $uploadManifestFiles
  }
  Write-BackupManifest -Manifest $manifest
  Write-Host "Product uploads backed up -> $uploadTarget"

  $manifest.status = "COMPLETED"
  $manifest.completedAt = (Get-Date).ToUniversalTime().ToString("o")
  Write-BackupManifest -Manifest $manifest
  Write-Host "Backup manifest written -> $manifestPath"
  Write-Host "Backup completed: $target"
} catch {
  $manifest.status = "FAILED"
  $manifest.failedAt = (Get-Date).ToUniversalTime().ToString("o")
  $manifest.error = $_.Exception.Message
  Write-BackupManifest -Manifest $manifest
  throw
}
