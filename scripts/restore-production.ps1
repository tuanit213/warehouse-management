param(
  [Parameter(Mandatory=$true)][string]$BackupPath
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $BackupPath)) { throw "Backup path not found: $BackupPath" }

$postgresUser = if ($env:POSTGRES_USER) { $env:POSTGRES_USER } else { 'postgres' }
$databases = @(
  @{ Container = "wms-auth-service-db"; Database = if ($env:AUTH_DB) { $env:AUTH_DB } else { "auth_db" } },
  @{ Container = "wms-product-service-db"; Database = if ($env:PRODUCT_DB) { $env:PRODUCT_DB } else { "product_db" } },
  @{ Container = "wms-inventory-service-db"; Database = if ($env:INVENTORY_DB) { $env:INVENTORY_DB } else { "inventory_db" } },
  @{ Container = "wms-transaction-service-db"; Database = if ($env:TRANSACTION_DB) { $env:TRANSACTION_DB } else { "transaction_db" } },
  @{ Container = "wms-report-service-db"; Database = if ($env:REPORT_DB) { $env:REPORT_DB } else { "report_db" } }
)

foreach ($item in $databases) {
  $file = Join-Path $BackupPath "$($item.Database).sql"
  if (-not (Test-Path $file)) { throw "Missing backup file: $file" }
  Write-Host "Restoring $($item.Database) into $($item.Container) from $file"
  Get-Content $file | docker exec -i $item.Container psql -U $postgresUser -d $item.Database
}

Write-Host "Restore completed from: $BackupPath"
