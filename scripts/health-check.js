const API = process.env.API_URL || 'http://localhost:3000/api';
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost:3006';
const services = ['auth-service', 'product-service', 'inventory-service', 'transaction-service', 'report-service'];
const attempts = Math.max(1, Number(process.env.HEALTH_CHECK_RETRIES || 1));
const retryDelayMs = Math.max(0, Number(process.env.HEALTH_CHECK_RETRY_DELAY_MS || 5000));

async function request(url) {
  const started = Date.now();
  const response = await fetch(url);
  const durationMs = Date.now() - started;
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.slice(0, 200)}`);
  return { durationMs, body: body ? JSON.parse(body) : null };
}

async function requestText(url) {
  const started = Date.now();
  const response = await fetch(url);
  const durationMs = Date.now() - started;
  const body = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${url}: ${body.slice(0, 200)}`);
  return { durationMs, body, contentType: response.headers.get('content-type') || '' };
}

function normalizeUrl(value) {
  return (value || '').trim().replace(/\/+$/, '');
}

function parseRuntimeConfigScript(body) {
  const match = body.match(/^window\.__WMS_CONFIG__=(.*);$/);
  if (!match) throw new Error('Runtime config script has unexpected format');
  return JSON.parse(match[1]);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkOnce() {
  const frontend = await request(`${FRONTEND}/api/health`);
  const runtimeConfig = await requestText(`${FRONTEND}/api/runtime-config`);
  if (!runtimeConfig.contentType.includes('application/javascript')) throw new Error(`Unexpected runtime config content type: ${runtimeConfig.contentType}`);
  const runtimeConfigBody = parseRuntimeConfigScript(runtimeConfig.body);
  if (runtimeConfigBody.error) throw new Error(`Runtime config error: ${runtimeConfigBody.error}`);
  const runtimeApiUrl = normalizeUrl(runtimeConfigBody.apiUrl);
  if (!runtimeApiUrl) throw new Error('Runtime config apiUrl is empty');
  if (process.env.API_URL && runtimeApiUrl !== normalizeUrl(API)) {
    throw new Error(`Runtime config apiUrl mismatch: expected ${normalizeUrl(API)}, got ${runtimeApiUrl}`);
  }
  const live = await request(`${API}/health`);
  const ready = await request(`${API}/health/ready`);
  if (!['ok', 'degraded'].includes(ready.body.status)) throw new Error('Unexpected readiness status');
  const checks = ready.body.checks || [];
  const missing = services.filter((service) => !checks.some((item) => item.service === service));
  if (missing.length) throw new Error(`Readiness checks missing: ${missing.join(', ')}`);
  const degraded = checks.filter((item) => item.status !== 'ok');
  console.log('[OK] Frontend health', `${frontend.durationMs}ms`);
  console.log('[OK] Frontend runtime config', `${runtimeConfig.durationMs}ms`, runtimeApiUrl);
  console.log('[OK] Gateway live', `${live.durationMs}ms`);
  console.log('[OK] Gateway readiness', ready.body.status, `${ready.durationMs}ms`);
  for (const check of checks) console.log(`[${check.status === 'ok' ? 'OK' : 'WARN'}] ${check.service}`, check.httpStatus || check.error);
  if (degraded.length) throw new Error(`Readiness degraded: ${degraded.map((item) => item.service).join(', ')}`);
}

async function main() {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await checkOnce();
      if (attempt > 1) console.log(`[OK] Health check passed on attempt ${attempt}/${attempts}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`[WARN] Health check attempt ${attempt}/${attempts} failed: ${error.message}`);
      await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

main().catch((error) => {
  console.error('Health check failed:', error.message);
  process.exitCode = 1;
});
