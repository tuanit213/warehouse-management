const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['.git', '.next', 'dist', 'node_modules']);
const textExtensions = new Set(['.css', '.js', '.json', '.md', '.ps1', '.ts', '.tsx', '.yml', '.yaml']);
const mojibakePattern = /Ã|Â|Ä|á»|áº|Æ|Å/;
const failures = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(fullPath);
    else if (textExtensions.has(path.extname(entry.name))) checkFile(fullPath);
  }
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function checkFile(file) {
  if (path.basename(file) === 'package-lock.json') return;
  if (path.basename(file) === 'static-quality-check.js') return;
  const text = fs.readFileSync(file, 'utf8');
  if (mojibakePattern.test(text)) failures.push(`${rel(file)} contains likely mojibake text`);
  if (rel(file).endsWith('Dockerfile') && /start:dev|next dev|npm", "run", "dev/.test(text)) {
    failures.push(`${rel(file)} runs a development server in Docker`);
  }
}

walk(root);

if (failures.length) {
  console.error('Static quality check failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[OK] Static quality check');
