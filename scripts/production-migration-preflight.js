const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { preflightChecks, services } = require('./migrate');

const root = path.resolve(__dirname, '..');

const dbTargets = {
  auth: {
    service: 'auth-service-db',
    databaseEnv: 'AUTH_DB',
    defaultDatabase: 'auth_db',
  },
  inventory: {
    service: 'inventory-service-db',
    databaseEnv: 'INVENTORY_DB',
    defaultDatabase: 'inventory_db',
  },
  transaction: {
    service: 'transaction-service-db',
    databaseEnv: 'TRANSACTION_DB',
    defaultDatabase: 'transaction_db',
  },
};

function usage() {
  console.log('Usage: node scripts/production-migration-preflight.js [--env-file .env.production] [--compose-file docker-compose.yml ...] [--profile name ...] [--service auth|inventory|transaction|all]');
  console.log('Runs read-only migration preflight checks through docker compose exec against running production DB services.');
}

function parseArgs(argv) {
  const args = {
    envFile: '.env.production',
    composeFiles: ['docker-compose.yml', 'docker-compose.prod.yml'],
    profiles: [],
    service: 'all',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--env-file') args.envFile = argv[++i];
    else if (arg === '--compose-file') args.composeFiles.push(argv[++i]);
    else if (arg === '--profile') args.profiles.push(argv[++i]);
    else if (arg === '--service') args.service = argv[++i];
    else if (arg === '--help') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.service !== 'all' && !services.includes(args.service)) {
    throw new Error(`Unsupported service: ${args.service}`);
  }

  args.composeFiles = [...new Set(args.composeFiles.filter(Boolean))];
  args.profiles = [...new Set(args.profiles.filter(Boolean))];
  return args;
}

function loadEnvFile(file) {
  const resolved = path.resolve(root, file);
  if (!fs.existsSync(resolved)) throw new Error(`Environment file not found: ${file}`);

  const env = {};
  for (const line of fs.readFileSync(resolved, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return { env, resolved };
}

function buildComposeArgs(args, envFile) {
  const composeArgs = ['compose', '--env-file', envFile];
  for (const composeFile of args.composeFiles) {
    composeArgs.push('-f', composeFile);
  }
  for (const profile of args.profiles) {
    composeArgs.push('--profile', profile);
  }
  return composeArgs;
}

function runDocker(args, commandArgs, options = {}) {
  const result = spawnSync('docker', [...args, ...commandArgs], {
    cwd: root,
    encoding: 'utf8',
    env: options.env,
  });
  if (result.status) {
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    throw new Error(options.failureMessage || `docker ${[...args, ...commandArgs].join(' ')} failed`);
  }
  return result.stdout || '';
}

function assertDbServicesRunning(composeArgs, selectedServices, env) {
  const output = runDocker(composeArgs, ['ps', '--services', '--status', 'running'], {
    env,
    failureMessage: 'Unable to inspect running Docker Compose services for migration preflight',
  });
  const running = new Set(output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const missing = selectedServices
    .map((service) => dbTargets[service].service)
    .filter((service) => !running.has(service));

  if (missing.length) {
    throw new Error(`Migration preflight requires running DB service(s): ${missing.join(', ')}. Start the existing stack first, or for an approved first deploy with no existing data use -SkipMigratePreflight -ConfirmSkipGates.`);
  }
}

function assertSafePostgresIdentifier(name, value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value)) {
    throw new Error(`${name} must be a PostgreSQL identifier using letters, numbers, and underscores, starting with a letter or underscore, up to 63 characters.`);
  }
}

function validatePreflightEnv(selectedServices, env) {
  const user = env.POSTGRES_USER;
  if (!user) throw new Error('POSTGRES_USER is required for production migration preflight.');
  assertSafePostgresIdentifier('POSTGRES_USER', user);

  const databases = {};
  for (const service of selectedServices) {
    const target = dbTargets[service];
    const database = env[target.databaseEnv] || target.defaultDatabase;
    assertSafePostgresIdentifier(target.databaseEnv, database);
    databases[service] = database;
  }

  return { user, databases };
}

function psqlCount(composeArgs, target, user, database, sql, env) {
  const output = runDocker(
    composeArgs,
    ['exec', '-T', target.service, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', user, '-d', database, '-tAc', sql],
    {
      env,
      failureMessage: `Migration preflight query failed for ${target.service}`,
    },
  );
  const count = Number(String(output).trim());
  if (!Number.isFinite(count)) {
    throw new Error(`Migration preflight query returned a non-numeric count for ${target.service}`);
  }
  return count;
}

function runPreflight(composeArgs, selectedServices, env, validatedEnv) {
  let failures = 0;
  for (const service of selectedServices) {
    const target = dbTargets[service];
    const database = validatedEnv.databases[service];
    for (const check of preflightChecks[service] || []) {
      const count = psqlCount(composeArgs, target, validatedEnv.user, database, check.sql, env);
      if (count > 0) {
        failures += 1;
        console.error(`[PREFLIGHT FAIL] ${service}: ${check.name} (${count})`);
      } else {
        console.log(`[PREFLIGHT OK] ${service}: ${check.name}`);
      }
    }
  }

  if (failures) throw new Error(`Production migration preflight failed with ${failures} issue(s)`);
}

function main() {
  const args = parseArgs(process.argv);
  const { env: fileEnv, resolved } = loadEnvFile(args.envFile);
  const env = { ...process.env, ...fileEnv };
  const selectedServices = args.service === 'all' ? services : [args.service];
  const composeArgs = buildComposeArgs(args, resolved);
  const validatedEnv = validatePreflightEnv(selectedServices, env);

  assertDbServicesRunning(composeArgs, selectedServices, env);
  runPreflight(composeArgs, selectedServices, env, validatedEnv);
  console.log('[OK] Production migration preflight');
}

try {
  main();
} catch (error) {
  console.error(`[PRODUCTION MIGRATION PREFLIGHT FAILED] ${error.message}`);
  process.exit(1);
}
