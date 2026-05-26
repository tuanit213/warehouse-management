# Backup & Restore Runbook

## Scope

The WMS uses one PostgreSQL database per bounded context:

- auth_db
- product_db
- inventory_db
- transaction_db
- report_db

Backups are logical SQL dumps created with `pg_dump --clean --if-exists` from each running database container. The dump is written inside the database container and copied to the host with `docker cp`, avoiding PowerShell text stream re-encoding. Product image uploads are copied from the Product Service upload volume into the same backup folder. The upload source path follows `PRODUCT_UPLOAD_DIR` from the selected env file and defaults to `/app/uploads/products`. `PRODUCT_UPLOAD_DIR` must be an absolute Linux container path and must not be `/`, contain `..`, whitespace, or a trailing slash.
`POSTGRES_USER` and custom database names from `AUTH_DB`, `PRODUCT_DB`, `INVENTORY_DB`, `TRANSACTION_DB`, and `REPORT_DB` must be PostgreSQL-safe identifiers: letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters. Backup and restore validate these values before creating or reading dump files.

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
backups/<yyyyMMdd-HHmmss-fff>/<database>.sql
backups/<yyyyMMdd-HHmmss-fff>/product-uploads/
backups/<yyyyMMdd-HHmmss-fff>/manifest.json
```

Backup target directories are created without overwrite mode; an existing target path fails instead of mixing files from two backup attempts. `manifest.json` is written at the start with `status=IN_PROGRESS` and finalized as `status=COMPLETED` only after all dump files and product uploads are copied and recorded. If any required database dump or product upload copy fails, the manifest is finalized as `status=FAILED` with `failedAt` and `error`, and restore refuses it. It records each database dump file, byte size, SHA256 checksum, dump format, the database container, and product upload copy metadata, including per-file SHA256 hashes. Keep it with the SQL files; restore dry-run uses it to detect missing, corrupted, or partial dumps before any destructive restore.

## Restore backup

> [!WARNING]
> Restore is destructive if applied over databases with existing rows. Create a fresh backup first.

The target PostgreSQL role must match the `postgresUser` recorded in `manifest.json` and the owner role stored in the dump. For a fresh non-production restore target, initialize PostgreSQL with the same `POSTGRES_USER` used by production, or create that role before running the restore. Restore dry-run refuses a manifest whose `postgresUser` differs from the target `POSTGRES_USER`.

```powershell
.\scripts\restore-production.ps1 -BackupPath .\backups\20260513-230000 -DryRun
```

After reviewing the dry-run plan, stop write traffic, create a fresh backup, then run the destructive restore with explicit confirmation:

```powershell
.\scripts\restore-production.ps1 -BackupPath .\backups\20260513-230000 -ConfirmRestore
```

Restore copies each SQL file into its target database container and runs `psql -f` there, avoiding host shell text pipelines.
If `product-uploads/` exists in the backup folder, restore copies those files back to `PRODUCT_UPLOAD_DIR` in the Product Service container and fails if the target directory cannot be created or the upload copy fails.
If `manifest.json` exists, restore requires `status=COMPLETED` for new backups, validates the recorded PostgreSQL user, validates dump file size and SHA256, and validates product upload count, bytes, and per-file SHA256 before dry-run or confirmed restore. New backups include cleanup metadata and SQL `DROP ... IF EXISTS` statements so a confirmed restore can replace an existing schema. Legacy backups without a manifest status, `postgresUser`, or upload file checksums are still accepted with a warning and may require a fresh target database.

## Restore drill result

The backup at `backups/20260523-004946` was restored into a temporary PostgreSQL 16 container without publishing ports. The drill created the dump owner role first, restored all five databases, checked row counts on the primary tables, and removed the temporary container afterwards. Counts verified included users, products, warehouses, stock levels, stock movements, stock transactions, suppliers, and report snapshots.

## Recommended production policy

- Run backups before every deployment.
- Keep at least 7 daily backups and 4 weekly backups.
- Store backup archives outside the server running Docker.
- Preserve `manifest.json` with every backup archive.
- Test restore monthly in a non-production environment.
- Always run `restore-production.ps1 -DryRun` before a real restore.
- Never run `-ConfirmRestore` until write traffic is stopped and the target environment has been identified.
- Never commit generated `backups/` content.
