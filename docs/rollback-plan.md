# Rollback Plan

## Application Rollback

1. Keep the previous image tag available before deploy.
2. If smoke tests fail, redeploy the previous image tag.
3. Restart only gateway/frontend first when the issue is routing or UI only.

## Database Rollback

1. Stop write traffic through the gateway.
2. Restore the latest backup created before migration:

```powershell
npm run prod:restore -- -BackupPath .\backups\<pre-deploy-backup> -DryRun
npm run prod:restore -- -BackupPath .\backups\<pre-deploy-backup> -ConfirmRestore
```

The restore manifest `postgresUser` must match the target `POSTGRES_USER`; dry-run fails before destructive work if it does not.

3. Run health checks and smoke tests after restore.

## Transaction Recovery

- `CONFIRMING`: if stale beyond `CONFIRMING_RETRY_AFTER_MINUTES`, retry confirm. Inventory application is idempotent by transaction item id.
- `CONFIRM_FAILED`: inspect `confirm_error`, fix the downstream issue, then retry confirm.
- Do not manually set `CONFIRM_FAILED` back to `DRAFT`; cancel is only valid for `DRAFT`.
