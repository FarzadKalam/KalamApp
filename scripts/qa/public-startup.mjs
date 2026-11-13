import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.resolve('tmp/ui-review/node_modules/playwright/index.mjs')).href);
const preview = process.env.PUBLIC_SITE_PREVIEW_ORIGIN || 'http://127.0.0.1:5189';
const origin = 'https://tazesystem.ir';
const output = 'tmp/ecosystem-review';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: true });

// Use the real marketing hostname while serving the compiled artifact locally.
// This exercises the public entry rather than the tenant app's preview route.
const bridge = async context => {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/rpc/get_cms_landing_page')) return route.fulfill({ json: { sections: [] } });
    if (url.pathname.includes('/rest/v1/rpc/')) return route.fulfill({ json: {} });
    if (url.pathname.includes('/rest/v1/')) return route.fulfill({ json: [] });
    if (url.pathname.includes('/auth/')) return route.fulfill({ status: 401, json: { message: 'No test session' } });
    if (url.origin === origin) {
      const localPath = url.pathname === '/' ? '/seo-pages/home.html' : url.pathname;
      const response = await context.request.get(`${preview}${localPath}${url.search}`);
      return route.fulfill({ response });
    }
    return route.abort();
  });
};

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR', serviceWorkers: 'block' });
  context.setDefaultTimeout(30000);
  await bridge(context);
  const page = await context.newPage();
  const errors = [];
  const scripts = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/\/assets\/.*\.js(?:\?|$)/.test(request.url())) scripts.push(new URL(request.url()).pathname); });
  let releaseScripts;
  const gate = new Promise(resolve => { releaseScripts = resolve; });
  await page.route('**/assets/*.js', async route => {
    await gate;
    await route.fallback().catch(() => undefined);
  });
  await page.goto(origin, { waitUntil: 'commit' });
  const fallback = page.locator('[data-seo-fallback="true"]');
  await fallback.waitFor({ state: 'attached' });
  await page.waitForTimeout(250); // Allow a paint while application scripts are held.
  assert.equal(await fallback.isVisible(), false, 'Crawler text must be hidden before any app JavaScript arrives');
  await page.screenshot({ path: `${output}/startup-before-javascript.png` });
  releaseScripts();
  await page.locator('.product-hero h1').waitFor();
  await page.waitForFunction(() => document.fonts.status === 'loaded');
  assert.equal(await page.locator('.ecosystem-orb').count(), 28);
  assert.ok(!scripts.some(file => /^\/assets\/App-.*\.js$/.test(file)), 'The marketing host must not request the tenant App entry');
  assert.ok(!scripts.some(file => /FeedbackViewport-|NotificationOverlayPanel-/.test(file)), 'Idle public pages must not download feedback animations or the tenant inbox');
  assert.deepEqual(errors, [], 'Public entry loads without browser errors');
  await page.screenshot({ path: `${output}/startup-ready-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: `${output}/startup-ready-mobile.png` });
  fs.writeFileSync(`${output}/startup-scripts.json`, JSON.stringify(scripts, null, 2));
  await context.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block' });
  await bridge(noJs);
  const noJsPage = await noJs.newPage();
  await noJsPage.goto(origin, { waitUntil: 'domcontentloaded' });
  assert.ok(await noJsPage.locator('[data-seo-fallback="true"]').isVisible(), 'No-JS readers retain the crawlable content');
  assert.match(await noJsPage.locator('[data-seo-fallback="true"]').innerText(), /زیست‌بوم تازه سیستم/);
  await noJs.close();
  console.log('PASS: no SEO text flash with blocked app scripts, direct marketing bootstrap, desktop/mobile and no-JS content.');
} finally {
  await browser.close();
}
