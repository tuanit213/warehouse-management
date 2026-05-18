# Backup & Restore Runbook

## Scope

The WMS uses one PostgreSQL database per bounded context:

- auth_db
- product_db
- inventory_db
- transaction_db
- report_db

Backups are logical SQL dumps created with `pg_dump` from each running database container.

## Create backup

For development defaults:

```powershell
.\scripts\backup-production.ps1
```

For production, load the same environment values used by deployment before running.
At minimum set:

```powershell
$env:POSTGRES_USER='wms_prod'
$env:AUTH_DB='auth_db'
$env:PRODUCT_DB='product_db'
$env:INVENTORY_DB='inventory_db'
$env:TRANSACTION_DB='transaction_db'
$env:REPORT_DB='report_db'
.\scripts\backup-production.ps1
```

Output path:

```txt
backups/<yyyyMMdd-HHmmss>/<database>.sql
```

## Restore backup

> [!WARNING]
> Restore is destructive if applied over databases with existing rows. Create a fresh backup first.

```powershell
.\scripts\restore-production.ps1 -BackupPath .\backups\20260513-230000
```

## Recommended production policy

- Run backups before every deployment.
- Keep at least 7 daily backups and 4 weekly backups.
- Store backup archives outside the server running Docker.
- Test restore monthly in a non-production environment.
- Never commit generated `backups/` content.
