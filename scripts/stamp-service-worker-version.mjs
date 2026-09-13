import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const packagePath = path.join(repoRoot, 'package.json');
const serviceWorkerPath = path.join(repoRoot, 'dist', 'sw.js');
const version = String(JSON.parse(fs.readFileSync(packagePath, 'utf8')).version || '').trim();
const token = '__TAZESYSTEM_CACHE_VERSION__';

if (!version) throw new Error('Application version is missing from package.json.');
if (!fs.existsSync(serviceWorkerPath)) throw new Error('Build output is missing dist/sw.js.');

const expectedCacheVersion = `const CACHE_VERSION = 'v${version}';`;
const source = fs.readFileSync(serviceWorkerPath, 'utf8');
const stamped = source.includes(token)
  ? source.replaceAll(token, `v${version}`)
  : source;

if (!stamped.includes(expectedCacheVersion)) {
  throw new Error('The service-worker cache version could not be stamped for this release.');
}

fs.writeFileSync(serviceWorkerPath, stamped, 'utf8');
