param(
  [string]$EnvFile = ".env.production",
  [string]$BackupDir = "backups"
)

$ErrorActionPreference = "Stop"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$target = Join-Path $BackupDir $timestamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

$databases = @(
  @{ Container = "wms-auth-service-db"; Database = "${env:AUTH_DB}"; DefaultDatabase = "auth_db" },
  @{ Container = "wms-product-service-db"; Database = "${env:PRODUCT_DB}"; DefaultDatabase = "product_db" },
  @{ Container = "wms-inventory-service-db"; Database = "${env:INVENTORY_DB}"; DefaultDatabase = "inventory_db" },
  @{ Container = "wms-transaction-service-db"; Database = "${env:TRANSACTION_DB}"; DefaultDatabase = "transaction_db" },
  @{ Container = "wms-report-service-db"; Database = "${env:REPORT_DB}"; DefaultDatabase = "report_db" }
)

foreach ($item in $databases) {
  $db = if ($item.Database) { $item.Database } else { $item.DefaultDatabase }
  $file = Join-Path $target "$db.sql"
  Write-Host "Backing up $db from $($item.Container) -> $file"
  $postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'postgres' }
  docker exec $item.Container pg_dump -U $postgresUser $db | Out-File -Encoding utf8 $file
}

Write-Host "Backup completed: $target"
