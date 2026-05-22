# Migration Guide

Run a dry-run before every migration:

```powershell
npm run migrate:dry-run
```

Run preflight against existing databases:

```powershell
npm run migrate:preflight
```

Apply migrations by service:

```powershell
npm run migrate:auth
npm run migrate:inventory
npm run migrate:transaction
```

Apply all migrations:

```powershell
npm run migrate:all
```

The runner records applied versions in `schema_migrations`. Database URL lookup order is documented in `docs/MIGRATIONS.md`.

Always take a backup before applying migrations. If preflight reports duplicate inventory stock keys, resolve the duplicates manually before applying the unique index migration.
