const API = process.env.API_URL || 'http://localhost:3000/api';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3006';
const services = ['auth-service', 'product-service', 'inventory-service', 'transaction-service', 'report-service'];

async function request(url) {
  const started = Date.now();
  const response = await fetch(url);
  const durationMs = Date.now() - started;
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.slice(0, 200)}`);
  return { durationMs, body: body ? JSON.parse(body) : null };
}

async function main() {
  const frontend = await request(`${FRONTEND}/api/health`);
  const live = await request(`${API}/health`);
  const ready = await request(`${API}/health/ready`);
  if (!['ok', 'degraded'].includes(ready.body.status)) throw new Error('Unexpected readiness status');
  const checks = ready.body.checks || [];
  const missing = services.filter((service) => !checks.some((item) => item.service === service));
  if (missing.length) throw new Error(`Readiness checks missing: ${missing.join(', ')}`);
  const degraded = checks.filter((item) => item.status !== 'ok');
  console.log('[OK] Frontend health', `${frontend.durationMs}ms`);
  console.log('[OK] Gateway live', `${live.durationMs}ms`);
  console.log('[OK] Gateway readiness', ready.body.status, `${ready.durationMs}ms`);
  for (const check of checks) console.log(`[${check.status === 'ok' ? 'OK' : 'WARN'}] ${check.service}`, check.httpStatus || check.error);
  if (degraded.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Health check failed:', error.message);
  process.exit(1);
});
