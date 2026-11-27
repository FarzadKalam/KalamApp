import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { publicOrganizationSchema, publicWebsiteSchema, publicWebApplicationSchema } from '../shared/publicBrandSeo.mjs';
import { RECENT_PRODUCT_UPDATES } from '../shared/publicProductUpdates.mjs';
import { PUBLIC_SOLUTIONS } from '../shared/publicSolutions.mjs';
import { getStaticPublicPageSeo, renderContentBlock, sanitizeCmsHtml } from '../shared/publicSiteSeo.mjs';

test('generated home HTML gives crawlers the same brand identity and canonical URL as the app', () => {
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
    assert.deepEqual(schemas.find((item) => item['@type'] === 'WebApplication'), publicWebApplicationSchema());
    assert.equal(schemas.find((item) => item['@type'] === 'WebPage').isPartOf['@id'], publicWebsiteSchema()['@id']);
    assert.match(home, /<link data-rh="true" rel="canonical" href="https:\/\/tazesystem\.ir\/" \/>/);
    assert.match(home, /property="og:image" content="https:\/\/tazesystem\.ir\/logo\.png"/);
    assert.match(home, /<h1>[^<]*تازه سیستم/);
    for (const href of ['/features', '/pricing', '/learn', '/blog', '/updates', '/about', '/contact']) assert.ok(home.includes(`href="${href}"`));

    const pricing = readFileSync(path.join(dir, 'dist', 'seo-pages', 'pricing.html'), 'utf8');
    assert.equal((pricing.match(/"@type":"Organization"/g) || []).length, 0);
    assert.match(pricing, /<link data-rh="true" rel="canonical" href="https:\/\/tazesystem\.ir\/pricing" \/>/);

    const features = readFileSync(path.join(dir, 'dist', 'seo-pages', 'features.html'), 'utf8');
    assert.match(features, /<link data-rh="true" rel="canonical" href="https:\/\/tazesystem\.ir\/features" \/>/);

    const updates = readFileSync(path.join(dir, 'dist', 'seo-pages', 'updates.html'), 'utf8');
    assert.match(updates, /<link data-rh="true" rel="canonical" href="https:\/\/tazesystem\.ir\/updates" \/>/);
    assert.ok(updates.includes(RECENT_PRODUCT_UPDATES[0].title), 'updates.html includes recent product update titles');

    const solutionsIndex = readFileSync(path.join(dir, 'dist', 'seo-pages', 'solutions.html'), 'utf8');
    assert.match(solutionsIndex, /<link data-rh="true" rel="canonical" href="https:\/\/tazesystem\.ir\/solutions" \/>/);
    for (const item of PUBLIC_SOLUTIONS) {
      assert.ok(solutionsIndex.includes(`href="${item.path}"`), `solutions.html links to ${item.path}`);
      const detail = readFileSync(path.join(dir, 'dist', 'seo-pages', item.file), 'utf8');
      assert.match(detail, new RegExp(`<link data-rh="true" rel="canonical" href="https://tazesystem\\.ir${item.path}" />`));
      assert.ok(detail.includes('"@type":"FAQPage"'), `${item.file} includes FAQPage schema`);
    }

    const reportBuilder = readFileSync(path.join(dir, 'dist', 'seo-pages', 'solutions', 'report-builder.html'), 'utf8');
    assert.ok(reportBuilder.includes('سیستم گزارش ساز'));
    assert.ok(reportBuilder.includes('href="/blog/report-builder-for-better-decisions"'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CMS rich-text rendering preserves safe HTML without double-escaping and strips unsafe tags', () => {
  const html = renderContentBlock({
    type: 'paragraph',
    content: '<p>متن با <a href="/solutions/ai-crm" onclick="alert(1)">لینک داخلی</a> و <script>alert(1)</script><strong>تاکید</strong></p>',
  });
  assert.ok(!html.includes('&lt;p&gt;'), 'must not double-escape CMS paragraph tags');
  assert.ok(!html.includes('<script'), 'must strip script tags');
  assert.ok(!html.includes('onclick'), 'must strip inline event handlers');
  assert.ok(html.includes('<a href="/solutions/ai-crm">لینک داخلی</a>'));
  assert.ok(html.includes('<strong>تاکید</strong>'));

  const sanitizedUnsafeLink = sanitizeCmsHtml('<a href="javascript:alert(1)">کلیک</a>');
  assert.equal(sanitizedUnsafeLink, '<a>کلیک</a>');

  assert.equal(getStaticPublicPageSeo('/demo').canonical, 'https://tazesystem.ir/contact');
  assert.equal(getStaticPublicPageSeo('/').canonical, 'https://tazesystem.ir/');
});
