# Production-ready mindset

## Nâng cao optional

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
