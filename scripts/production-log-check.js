const { spawnSync } = require('child_process');

const DEFAULT_LOG_CONTAINERS = [
  'wms-frontend',
  'wms-api-gateway',
  'wms-auth-service',
  'wms-product-service',
  'wms-inventory-service',
  'wms-transaction-service',
  'wms-report-service',
];

const DEFAULT_STATE_CONTAINERS = [
  ...DEFAULT_LOG_CONTAINERS,
  'wms-auth-service-db',
  'wms-product-service-db',
  'wms-inventory-service-db',
  'wms-transaction-service-db',
  'wms-report-service-db',
  'wms-redis',
  'wms-rabbitmq',
];

const containers = (process.env.LOG_CHECK_CONTAINERS || DEFAULT_LOG_CONTAINERS.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const stateContainers = (process.env.LOG_CHECK_STATE_CONTAINERS || DEFAULT_STATE_CONTAINERS.join(','))
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const since = process.env.LOG_CHECK_SINCE || '15m';
const tail = process.env.LOG_CHECK_TAIL || '500';
const maxSamples = Number(process.env.LOG_CHECK_MAX_SAMPLES || 12);
const maxRestarts = Number(process.env.LOG_CHECK_MAX_RESTARTS || 3);

const seriousPatterns = [
  /\blevel=(fatal|error)\b/i,
  /"level"\s*:\s*"(fatal|error)"/i,
  /\b(fatal|panic|uncaught|unhandled(?:rejection| exception)?|segmentation fault|out of memory|oom killed)\b/i,
  /\b(Cannot find module|Module not found|EADDRINUSE|ECONNREFUSED|ETIMEDOUT|password authentication failed)\b/i,
  /Nest can't resolve dependencies/i,
  /\b(migration failed|database .* does not exist)\b/i,
];

const ignorePatterns = [
  /plugin xychart is already registered/i,
  /Database locked, sleeping then retrying/i,
];

function runDocker(args) {
  const result = spawnSync('docker', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return {
    status: result.status,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function inspectContainer(container) {
  const result = runDocker(['inspect', container]);
  if (result.status !== 0) throw new Error(`Container not found: ${container}`);
  try {
    return JSON.parse(result.output)[0];
  } catch (error) {
    throw new Error(`Could not parse docker inspect output for ${container}: ${error.message}`);
  }
}

function assertContainerHealthy(container) {
  const info = inspectContainer(container);
  const state = info.State || {};
  if (!state.Running) throw new Error(`Container is not running: ${container} (status=${state.Status || 'unknown'}, exitCode=${state.ExitCode ?? 'unknown'})`);
  if (state.Restarting) throw new Error(`Container is restarting: ${container}`);
  if (state.Dead) throw new Error(`Container is dead: ${container}`);
  if (state.OOMKilled) throw new Error(`Container was OOM killed: ${container}`);
  if (Number(info.RestartCount || 0) > maxRestarts) {
    throw new Error(`Container restart count is too high: ${container} restartCount=${info.RestartCount} max=${maxRestarts}`);
  }
  const health = state.Health?.Status;
  if (health && health !== 'healthy') throw new Error(`Container health is ${health}: ${container}`);
  return { health: health || 'none', restartCount: Number(info.RestartCount || 0) };
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/g, '');
}

function isSerious(line) {
  if (!line.trim()) return false;
  if (ignorePatterns.some((pattern) => pattern.test(line))) return false;
  return seriousPatterns.some((pattern) => pattern.test(line));
}

function scanContainer(container) {
  const state = assertContainerHealthy(container);
  const result = runDocker(['logs', '--since', since, '--tail', tail, container]);
  if (result.status !== 0) throw new Error(`Could not read logs for ${container}: ${result.output.slice(0, 300)}`);

  const lines = stripAnsi(result.output).split(/\r?\n/);
  const matches = lines.filter(isSerious);
  if (!matches.length) {
    console.log(`[OK] ${container} logs`, `health=${state.health}`, `restarts=${state.restartCount}`, `no serious entries in last ${since}`);
    return [];
  }

  console.log(`[FAIL] ${container} logs`, `${matches.length} serious entr${matches.length === 1 ? 'y' : 'ies'} in last ${since}`);
  return matches.slice(0, maxSamples).map((line) => ({ container, line: line.slice(0, 500) }));
}

function checkContainerState(container) {
  const state = assertContainerHealthy(container);
  console.log(`[OK] ${container} state`, `health=${state.health}`, `restarts=${state.restartCount}`);
}

function main() {
  const failures = [];
  const scanned = new Set(containers);
  for (const container of containers) failures.push(...scanContainer(container));
  for (const container of stateContainers) {
    if (!scanned.has(container)) checkContainerState(container);
  }
  if (failures.length) {
    console.error('\nSerious log samples:');
    for (const failure of failures) console.error(`[${failure.container}] ${failure.line}`);
    process.exit(1);
  }
  console.log('Production log check passed.');
}

try {
  main();
} catch (error) {
  console.error('Production log check failed:', error.message);
  process.exit(1);
}
