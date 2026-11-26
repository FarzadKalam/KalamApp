import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const artifact = JSON.parse(fs.readFileSync('dist/central-release.json', 'utf8'));
if (artifact.version !== version || !/^[a-f0-9]{40}$/.test(artifact.commit_sha ?? '')) {
  throw new Error('The release artifact has invalid source provenance');
}
const moduleEntry = html => html.match(/<script\b(?=[^>]*\btype=["']module["'])[^>]*\bsrc=["']([^"']+)["']/i)?.[1];
const expectedEntry = moduleEntry(fs.readFileSync('dist/index.html', 'utf8'));
if (!expectedEntry) throw new Error('The release artifact has no frontend module entry');
const origins = process.argv.slice(2);
if (!origins.length) origins.push('https://tazesystem.ir', 'https://app.tazesystem.ir', 'https://kalam.tazesystem.ir');
for (const origin of origins) {
  for (const file of ['index.html', 'sw.js', 'version.json', 'central-release.json']) {
    const response = await fetch(new URL(`/${file}?release=${artifact.commit_sha}`, origin), {
      signal: AbortSignal.timeout(25000), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error(`${origin}/${file}: HTTP ${response.status}`);
    const cache = (response.headers.get('cache-control') || '').toLowerCase().split(',').map(directive => directive.trim());
    if (!['no-cache', 'no-store', 'must-revalidate'].every((directive) => cache.includes(directive))) {
      throw new Error(`${origin}/${file}: required PWA cache directives are missing`);
    }
    const text = await response.text();
    if (file === 'index.html' && moduleEntry(text) !== expectedEntry) throw new Error(`${origin}: stale frontend module entry`);
    if (file === 'version.json' && JSON.parse(text).version !== version) throw new Error(`${origin}: stale public version`);
    if (file === 'central-release.json') {
      const live = JSON.parse(text);
      if (live.version !== version || live.commit_sha !== artifact.commit_sha) throw new Error(`${origin}: live release does not match the deployed artifact`);
    }
    if (file === 'sw.js' && (!text.includes(`const CACHE_VERSION = 'v${version}';`) || text.includes('__TAZESYSTEM_CACHE_VERSION__'))) {
      throw new Error(`${origin}: stale or unstamped service worker`);
    }
    console.log(`${origin}/${file}: release and cache checks passed`);
  }
}
