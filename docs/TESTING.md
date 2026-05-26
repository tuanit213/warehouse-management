# Regression Test Matrix

This test layer is designed to be fast, deterministic, and mostly independent of Docker. It catches regressions before the full-stack smoke test runs.

## Commands

```powershell
npm run test:regression
```

Run focused checks when needed:

```powershell
npm run test:rbac
npm run test:inventory
npm run test:transactions
npm run test:prod-env
npm run test:prod-migrate-preflight
npm run test:prod-backup-restore
```

## Current Coverage

| Script | Scope | Regression blocked |
|---|---|---|
| `scripts/rbac-regression-test.js` | Gateway RBAC matrix | Staff report access, manager stock adjustment, staff product maintenance |
| `scripts/inventory-regression-test.js` | Stock integrity rules | Negative stock, location warehouse mismatch |
| `scripts/transaction-regression-test.js` | Voucher lifecycle | Duplicate confirm, cancelling confirmed vouchers |
| `scripts/production-env-validation-test.js` | Production env validation | Invalid PostgreSQL role names in `POSTGRES_USER` |
| `scripts/production-migration-preflight-test.js` | Production migration preflight | Invalid DB role/name rejected before Docker is called |
| `scripts/production-backup-restore-validation-test.js` | Production backup/restore validation | Invalid DB role/name rejected before backup artifacts or restore file checks |

## CI Integration

`.github/workflows/ci.yml` verifies `pwsh --version`, then runs `npm run test:quality`, `npm run test:regression`, `npm run test:critical`, workspace builds, Docker stack startup, production migration preflight smoke, and full smoke tests.

CI also runs `npm run security:audit` and `docker compose config --quiet` before build/test gates, so new production advisories are tracked and resolved compose config is not dumped to logs.

`npm run test:quality` includes `npm run test:prod-env`, `npm run test:prod-migrate-preflight`, and `npm run test:prod-backup-restore`, so CI runs generated positive/negative production env checks, pre-Docker migration preflight validation checks, and backup/restore fail-fast checks. CI fails early if `pwsh` is unavailable. Local runs use `pwsh` or Windows PowerShell when available and skip the backup/restore test with an explicit message when neither shell exists.

## Live E2E

Live E2E and critical tests can share dedicated admin credential variables:

```powershell
$env:WMS_API_URL="http://localhost:3000/api"
$env:E2E_ADMIN_EMAIL="admin@wms.local"
$env:E2E_ADMIN_PASSWORD="<admin-password>"
npm run test:e2e
npm run test:critical
```

For non-local APIs, live write tests also require `WMS_ENABLE_LIVE_WRITE_TESTS=true` and dedicated `E2E_ADMIN_*`, `SMOKE_ADMIN_*`, or access-token variables. Demo/bootstrap password fallbacks are blocked for remote targets.

For local smoke runs, prefer explicit `SMOKE_ADMIN_EMAIL` and `SMOKE_ADMIN_PASSWORD` when the local admin password has drifted from the demo default. Do not use the demo fallback for remote or production-like URLs.

## Added Production Checks

```powershell
npm run test:api-contract
npm run test:e2e
```

- `scripts/api-contract-test.js` checks that docs, gateway prefixes, and controllers stay aligned for auth, product image upload, inventory, stock transfer, voucher PDF, and report export routes.
- `scripts/e2e-workflow-test.js` checks live login, product/category list, and report summary when `WMS_API_URL` or `API_URL` points to a running stack. Without a live URL it exits as skipped so local static gates remain deterministic.
- `scripts/production-env-validation-test.js` runs the production env validator with a valid generated env file and verifies that invalid `POSTGRES_USER` values such as `wms-prod` are rejected before deploy.
- `scripts/production-migration-preflight-test.js` verifies that invalid `POSTGRES_USER` and database names fail before the production migration preflight calls Docker.
- `scripts/production-backup-restore-validation-test.js` verifies that invalid `POSTGRES_USER` and database names fail before backup artifacts are created or restore files are inspected.
- `scripts/smoke-test.js` verifies stock transfer, inbound PDF export, invalid PDF IDs, mismatched PDF routes, and report Excel export as binary responses.

## Adding New Workflows

- Add a focused script when logic can be tested without a live database.
- Extend `scripts/smoke-test.js` when the behavior needs the real API stack.
- Add browser E2E separately when the workflow needs a real browser.
