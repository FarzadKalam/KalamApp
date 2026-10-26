import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const version = String(readJson('package.json').version || '').trim();
const lock = readJson('package-lock.json');
const changes = readJson('.version-changes.json');

if (!version || lock.version !== version || lock.packages?.['']?.version !== version || changes.releases?.[0]?.version !== version) {
  throw new Error('Release version files are not aligned.');
}

const dist = path.join(root, 'dist');
const readDist = (file) => fs.readFileSync(path.join(dist, file), 'utf8');
readDist('index.html');
const sw = readDist('sw.js');
if (sw.includes('__TAZESYSTEM_CACHE_VERSION__') || !sw.includes(`const CACHE_VERSION = 'v${version}';`)) {
  throw new Error('Service-worker cache version is missing or does not match the release.');
}
if (readJson('dist/version.json').version !== version) {
  throw new Error('Public version manifest does not match the release.');
}

console.log(`PWA release ${version} verified.`);
