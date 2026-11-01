import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { preservePublicSeo } from './preserve-public-seo.mjs';

function fixture(complete = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-seo-test-'));
  const dist = path.join(root, 'dist'); const previous = path.join(root, 'previous');
  fs.mkdirSync(dist); fs.mkdirSync(path.join(previous, 'blog'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'seo-generation.json'), JSON.stringify({ dynamicComplete: complete, dynamicCount: 0 }));
  fs.writeFileSync(path.join(dist, 'index.html'), '<html><head><script type="module" src="/assets/new.js"></script><link rel="stylesheet" href="/assets/new.css"></head></html>');
  return { root, dist, previous };
}
function removeFixture(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith('public-seo-test-')) throw new Error('Unsafe test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
}

test('preserves published metadata/content, retargets assets and keeps fresh pages', (t) => {
  const f = fixture(); t.after(() => removeFixture(f.root));
  const old = '<html><head><title>آموزش</title><script src="/assets/old.js" type="module"></script><link href="/assets/old.css" rel="stylesheet"><script type="application/ld+json">{"name":"آموزش"}</script></head><body><main data-seo-fallback="true">متن منتشرشده</main></body></html>';
  fs.writeFileSync(path.join(f.previous, 'blog', 'article.html'), old);
  fs.writeFileSync(path.join(f.previous, 'blog', 'fresh.html'), old);
  fs.mkdirSync(path.join(f.dist, 'seo-pages', 'blog'), { recursive: true });
  fs.writeFileSync(path.join(f.dist, 'seo-pages', 'blog', 'fresh.html'), 'fresh');
  assert.equal(preservePublicSeo(f.previous, f.dist), 1);
  const html = fs.readFileSync(path.join(f.dist, 'seo-pages', 'blog', 'article.html'), 'utf8');
  assert.ok(html.includes('متن منتشرشده')); assert.ok(html.includes('application/ld+json'));
  assert.ok(html.includes('/assets/new.js')); assert.ok(html.includes('/assets/new.css')); assert.ok(!html.includes('/assets/old.'));
  assert.equal(fs.readFileSync(path.join(f.dist, 'seo-pages', 'blog', 'fresh.html'), 'utf8'), 'fresh');
});
test('successful CMS fetch allows deletions and never revives old pages', (t) => {
  const f = fixture(true); t.after(() => removeFixture(f.root));
  assert.equal(preservePublicSeo(f.previous, f.dist), 0);
  assert.equal(fs.existsSync(path.join(f.dist, 'seo-pages')), false);
});
test('blocks a release if the CMS is unavailable and no prior pages exist', (t) => {
  const f = fixture(); t.after(() => removeFixture(f.root));
  assert.throws(() => preservePublicSeo(f.previous, f.dist), /no previous/);
});
