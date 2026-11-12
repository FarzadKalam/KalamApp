import fs from 'node:fs';

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const origins = process.argv.slice(2);
if (!origins.length) origins.push('https://kalam.tazesystem.ir', 'https://app.tazesystem.ir');
for (const origin of origins) {
  for (const file of ['index.html', 'sw.js', 'version.json']) {
    const response = await fetch(new URL(`/${file}?release=${encodeURIComponent(version)}`, origin), {
      signal: AbortSignal.timeout(25000), cache: 'no-store', redirect: 'error',
    });
    if (!response.ok) throw new Error(`${origin}/${file}: HTTP ${response.status}`);
    const cache = response.headers.get('cache-control')?.toLowerCase() || '';
    if (!['no-cache', 'no-store', 'must-revalidate'].every((directive) => cache.includes(directive))) {
      throw new Error(`${origin}/${file}: required PWA cache directives are missing`);
    }
    const text = await response.text();
    if (file === 'version.json' && JSON.parse(text).version !== version) throw new Error(`${origin}: stale public version`);
    if (file === 'sw.js' && (!text.includes(`const CACHE_VERSION = 'v${version}';`) || text.includes('__TAZESYSTEM_CACHE_VERSION__'))) {
      throw new Error(`${origin}: stale or unstamped service worker`);
    }
    console.log(`${origin}/${file}: release and cache checks passed`);
  }
}
