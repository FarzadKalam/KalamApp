import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { publicOrganizationSchema, publicWebsiteSchema } from '../shared/publicBrandSeo.mjs';

test('generated home HTML gives crawlers the same brand identity as the app', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'taze-seo-'));
  try {
    mkdirSync(path.join(dir, 'dist'));
    writeFileSync(path.join(dir, 'dist', 'index.html'), '<html><head><title>App</title></head><body><div id="root"></div></body></html>');
    const env = { ...process.env };
    delete env.VITE_SUPABASE_URL;
    delete env.VITE_SUPABASE_ANON_KEY;
    execFileSync(process.execPath, [fileURLToPath(new URL('./generate-public-seo.mjs', import.meta.url))], { cwd: dir, env });
    const home = readFileSync(path.join(dir, 'dist', 'seo-pages', 'home.html'), 'utf8');
    const schemas = [...home.matchAll(/<script[^>]*type="application\/ld\+json">(.*?)<\/script>/gs)].map((match) => JSON.parse(match[1]));
    assert.equal(schemas.filter((item) => item['@type'] === 'WebSite').length, 1);
    assert.deepEqual(schemas.find((item) => item['@type'] === 'WebSite'), publicWebsiteSchema());
    assert.deepEqual(schemas.find((item) => item['@type'] === 'Organization'), publicOrganizationSchema());
    assert.equal(schemas.find((item) => item['@type'] === 'WebPage').isPartOf['@id'], publicWebsiteSchema()['@id']);
    assert.match(home, /property="og:image" content="https:\/\/tazesystem\.ir\/logo\.png"/);
    for (const href of ['/features', '/pricing', '/learn', '/blog', '/updates', '/about', '/contact']) assert.ok(home.includes(`href="${href}"`));
    const pricing = readFileSync(path.join(dir, 'dist', 'seo-pages', 'pricing.html'), 'utf8');
    assert.equal((pricing.match(/"@type":"Organization"/g) || []).length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
