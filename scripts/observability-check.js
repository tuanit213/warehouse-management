const PROMETHEUS_URL = trimTrailingSlash(process.env.PROMETHEUS_URL || 'http://localhost:9090');
const GRAFANA_URL = trimTrailingSlash(process.env.GRAFANA_URL || 'http://localhost:3008');
const LOKI_URL = trimTrailingSlash(process.env.LOKI_URL || 'http://localhost:3100');
const EXPECTED_JOBS = (process.env.WMS_OBSERVABILITY_JOBS || [
  'api-gateway',
  'auth-service',
  'product-service',
  'inventory-service',
  'transaction-service',
  'report-service',
].join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const REQUIRE_LOKI_LOGS = process.env.LOKI_REQUIRE_LOGS !== 'false';

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

async function requestJson(name, url) {
  const started = Date.now();
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${text.slice(0, 200)}`);
  try {
    return { durationMs: Date.now() - started, body: text ? JSON.parse(text) : null };
  } catch (error) {
    throw new Error(`${name} returned invalid JSON: ${error.message}`);
  }
}

async function requestText(name, url) {
  const started = Date.now();
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`${name} failed: ${response.status} ${text.slice(0, 200)}`);
  return { durationMs: Date.now() - started, body: text };
}

async function checkPrometheus() {
  const result = await requestJson('Prometheus targets', `${PROMETHEUS_URL}/api/v1/targets?state=active`);
  if (result.body?.status !== 'success') throw new Error('Prometheus targets API did not return success');

  const targets = result.body.data?.activeTargets || [];
  const jobs = new Map();
  for (const target of targets) {
    const job = target.labels?.job || target.discoveredLabels?.job;
    if (!job) continue;
    if (!jobs.has(job)) jobs.set(job, []);
    jobs.get(job).push(target);
  }

  const missing = EXPECTED_JOBS.filter((job) => !jobs.has(job));
  if (missing.length) throw new Error(`Prometheus targets missing jobs: ${missing.join(', ')}`);

  const unhealthy = [];
  for (const job of EXPECTED_JOBS) {
    for (const target of jobs.get(job) || []) {
      if (target.health !== 'up') unhealthy.push(`${job}=${target.health || 'unknown'}`);
    }
  }
  if (unhealthy.length) throw new Error(`Prometheus targets unhealthy: ${unhealthy.join(', ')}`);

  console.log('[OK] Prometheus targets', `${targets.length} active`, `${result.durationMs}ms`);
  for (const job of EXPECTED_JOBS) console.log(`[OK] Prometheus job ${job}`, `${jobs.get(job).length} target(s) up`);
}

async function checkGrafana() {
  const result = await requestJson('Grafana health', `${GRAFANA_URL}/api/health`);
  if (result.body?.database !== 'ok') throw new Error(`Grafana database is not ok: ${JSON.stringify(result.body)}`);
  console.log('[OK] Grafana health', `database=${result.body.database}`, `${result.durationMs}ms`);
}

async function checkLoki() {
  const ready = await requestText('Loki ready', `${LOKI_URL}/ready`);
  console.log('[OK] Loki ready', ready.body.trim() || 'ready', `${ready.durationMs}ms`);

  const end = Date.now() * 1_000_000;
  const start = end - 60 * 60 * 1_000_000_000;
  const serviceRegex = EXPECTED_JOBS.map((job) => job.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const query = `{service=~"${serviceRegex}"}`;
  const url = `${LOKI_URL}/loki/api/v1/query_range?query=${encodeURIComponent(query)}&limit=5&start=${start}&end=${end}`;
  const result = await requestJson('Loki query_range', url);
  if (result.body?.status !== 'success') throw new Error('Loki query_range did not return success');

  const streams = result.body.data?.result || [];
  if (REQUIRE_LOKI_LOGS && streams.length === 0) {
    throw new Error('Loki query_range returned no WMS service log streams in the last hour');
  }
  console.log('[OK] Loki query_range', `${streams.length} stream(s)`, `${result.durationMs}ms`);
}

async function main() {
  await checkPrometheus();
  await checkGrafana();
  await checkLoki();
  console.log('Observability check passed.');
}

main().catch((error) => {
  console.error('Observability check failed:', error.message);
  process.exit(1);
});
