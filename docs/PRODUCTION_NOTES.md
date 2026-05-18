# Production Readiness Notes

## Current baseline

- Docker images build production artifacts before runtime.
- Frontend runs Next.js standalone output and exposes `/api/health`.
- Backend services run compiled `dist/main.js` output.
- API Gateway provides liveness and downstream readiness endpoints.
- `docker-compose.prod.yml` hides database and Redis ports from the host.
- Smoke tests cover login, refresh token rotation, CRUD reads, stock changes, transaction confirmation, report endpoints and export.
- Production env validation rejects weak defaults for core secrets.
- `npm audit --omit=dev` is clean for backend service images after the Nest 11 upgrade. The frontend still reports the current Next.js transitive `postcss` advisory; npm registry currently resolves latest stable Next.js to `16.2.6`, so do not use `npm audit fix --force` because it proposes a breaking downgrade. Re-run audit after the next Next.js patch release.

## Recommended next hardening

- Event-driven bằng RabbitMQ: Inventory và Report consume event từ Transaction.
- Audit log: lưu actor, action, entity, before/after.
- Logging: JSON log, correlation id từ Gateway.
- Monitoring: Prometheus + Grafana, health endpoint từng service.
- CI/CD: GitHub Actions build/test/push image.
- Security: JWT rotation, refresh token revoke, rate limit, helmet, validation pipe.
- Deployment: tách compose dev/prod hoặc Kubernetes cho scale service độc lập.

## Scale

- Stateless backend service để scale horizontal.
- Database riêng theo bounded context.
- Read model/report snapshot để dashboard không query xuyên service.
