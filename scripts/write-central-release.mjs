import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

const sha = value => createHash('sha256').update(value).digest('hex');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = null; let dirty = true;
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  dirty = Boolean(execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { encoding: 'utf8' }).trim());
} catch { /* Source archives without provenance must never become a verified local release. */ }
const sql = Object.fromEntries(readdirSync('.').filter(name => /^database_v1.*\.sql$/.test(name)).sort().map(name => [name, sha(readFileSync(name))]));
const manifest = {
  format: 'kalamapp-central-release-v1', version: pkg.version, commit_sha: commit, dirty,
  dependency_checksum: sha(readFileSync('package-lock.json')),
  compose_checksum: sha(readFileSync('docker-compose.yml')),
  schema_inventory: sql, generated_at: new Date().toISOString(),
};
writeFileSync('dist/central-release.json', `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Central release provenance recorded for ${pkg.version}${dirty ? ' (uncommitted source; not publishable)' : ''}.`);
