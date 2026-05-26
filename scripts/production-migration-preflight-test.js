const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function writeEnvFile(name, lines) {
  const file = path.join(os.tmpdir(), `wms-${name}-${process.pid}.env`);
  fs.writeFileSync(file, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
  return file;
}

function makeFakeDockerDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `wms-fake-docker-${process.pid}-`));
  const shellScript = path.join(dir, 'docker');
  fs.writeFileSync(shellScript, '#!/bin/sh\necho DOCKER_CALLED >&2\nexit 99\n', { encoding: 'utf8', mode: 0o700 });
  const cmdScript = path.join(dir, 'docker.cmd');
  fs.writeFileSync(cmdScript, '@echo off\r\necho DOCKER_CALLED 1>&2\r\nexit /b 99\r\n', { encoding: 'utf8' });
  return dir;
}

function runPreflight(envFile, fakeDockerDir) {
  return spawnSync(process.execPath, ['scripts/production-migration-preflight.js', '--env-file', envFile, '--service', 'auth'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeDockerDir}${path.delimiter}${process.env.PATH || ''}`,
      Path: `${fakeDockerDir}${path.delimiter}${process.env.Path || process.env.PATH || ''}`,
    },
  });
}

function expectPreDockerFailure(name, lines, expectedMessage) {
  const envFile = writeEnvFile(name, lines);
  const fakeDockerDir = makeFakeDockerDir();
  try {
    const result = runPreflight(envFile, fakeDockerDir);
    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status === 0) {
      process.stdout.write(output);
      throw new Error(`${name} expected production migration preflight to fail`);
    }
    if (!output.includes(expectedMessage)) {
      process.stdout.write(output);
      throw new Error(`${name} failed with an unexpected message`);
    }
    if (output.includes('DOCKER_CALLED')) {
      process.stdout.write(output);
      throw new Error(`${name} called Docker before validating preflight env`);
    }
    console.log(`[OK] ${name}`);
  } finally {
    fs.rmSync(envFile, { force: true });
    fs.rmSync(fakeDockerDir, { recursive: true, force: true });
  }
}

expectPreDockerFailure(
  'production-migration-preflight-rejects-bad-postgres-user-before-docker',
  ['POSTGRES_USER=bad user'],
  'POSTGRES_USER must be a PostgreSQL identifier',
);

expectPreDockerFailure(
  'production-migration-preflight-rejects-bad-auth-db-before-docker',
  ['POSTGRES_USER=wms_prod', 'AUTH_DB=../evil'],
  'AUTH_DB must be a PostgreSQL identifier',
);
