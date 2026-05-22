# Backup & Restore Runbook

## Scope

The WMS uses one PostgreSQL database per bounded context:

- auth_db
- product_db
- inventory_db
- transaction_db
- report_db

Backups are logical SQL dumps created with `pg_dump` from each running database container. Product image uploads are copied from the Product Service upload volume into the same backup folder.

## Create backup

For development defaults:

```powershell
.\scripts\backup-production.ps1
```

For production, the script loads `.env.production` by default. You can pass another env file:

```powershell
.\scripts\backup-production.ps1 -EnvFile .\.env.production
```

Output path:

```txt
backups/<yyyyMMdd-HHmmss>/<database>.sql
backups/<yyyyMMdd-HHmmss>/product-uploads/
```

## Restore backup

> [!WARNING]
> Restore is destructive if applied over databases with existing rows. Create a fresh backup first.

```powershell
.\scripts\restore-production.ps1 -BackupPath .\backups\20260513-230000
```

If `product-uploads/` exists in the backup folder, restore copies those files back to `/app/uploads/products` in the Product Service container.

## Recommended production policy

- Run backups before every deployment.
- Keep at least 7 daily backups and 4 weekly backups.
- Store backup archives outside the server running Docker.
- Test restore monthly in a non-production environment.
- Never commit generated `backups/` content.
