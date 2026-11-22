import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rmdir, unlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('verifies the exact live artifact and rejects stale HTML, provenance and cache headers', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'kalam-release-test-'));
  const dist = join(dir, 'dist');
  await mkdir(dist);
  const version = '3.0.0';
  const artifact = { version, commit_sha: 'a'.repeat(40) };
  const entry = '<script type="module" crossorigin src="/assets/index-current.js"></script>';
  const files = [join(dir, 'package.json'), join(dist, 'central-release.json'), join(dist, 'index.html')];
  t.after(async () => {
    await Promise.all(files.map(file => unlink(file)));
    await rmdir(dist);
    await rmdir(dir);
  });
  await Promise.all([
    writeFile(files[0], JSON.stringify({ version })),
    writeFile(files[1], JSON.stringify(artifact)),
    writeFile(files[2], entry),
  ]);

  let scenario = 'current';
  const server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    response.setHeader('Cache-Control', scenario === 'cache' ? 'no-cache, must-revalidate' : 'no-cache, no-store, must-revalidate');
    const pages = {
      '/index.html': scenario === 'entry' ? entry.replace('index-current', 'index-stale') : entry,
      '/sw.js': `const CACHE_VERSION = 'v${version}';`,
      '/version.json': JSON.stringify({ version }),
      '/central-release.json': JSON.stringify(scenario === 'commit' ? { ...artifact, commit_sha: 'b'.repeat(40) } : artifact),
    };
    response.end(pages[path]);
  });
  t.after(() => server.close());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const verifier = fileURLToPath(new URL('./verify-live-pwa-release.mjs', import.meta.url));
  for (const [caseName, expectedCode] of [['current', 0], ['commit', 1], ['entry', 1], ['cache', 1]]) {
    scenario = caseName;
    const status = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [verifier, origin], { cwd: dir, stdio: 'ignore' });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    assert.equal(status, expectedCode, caseName);
  }
});
