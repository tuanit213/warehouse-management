# Database Migrations

Run versioned SQL migrations with:

```powershell
npm run migrate:auth
npm run migrate:inventory
npm run migrate:transaction
npm run migrate:all
```

The runner stores applied versions in `schema_migrations`.

Database URL lookup order:

1. `--database-url`
2. `<SERVICE>_DATABASE_URL`
3. `<SERVICE>_SERVICE_DATABASE_URL`
4. `DATABASE_URL_<SERVICE>`
5. `DATABASE_URL`

Examples: `AUTH_DATABASE_URL`, `INVENTORY_SERVICE_DATABASE_URL`, `DATABASE_URL_TRANSACTION`.

Use `npm run migrate:dry-run` to validate the migration plan without connecting to a database.

Before applying migrations to an existing database, run:

```powershell
npm run migrate:preflight
```

Preflight checks reject known unsafe data states, including duplicate inventory stock keys, negative stock balances, invalid transaction statuses, and invalid auth roles/statuses.
