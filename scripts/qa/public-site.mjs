import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Read-only UI smoke check: all backend calls are intercepted; no account or
// production content is changed. Run against the local Vite server on 5187.
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR', serviceWorkers: 'block' });
const errors = [];
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.hostname === '127.0.0.1') return route.continue();
  if (url.pathname.includes('/rest/v1/rpc/get_cms_landing_page')) return route.fulfill({ json: { sections: [], theme: { paletteKey: 'corporate_blue' } } });
  if (url.pathname.includes('/rest/v1/rpc/get_cms_page_by_slug')) return route.fulfill({ json: { title: 'حریم خصوصی', content_blocks: [] } });
  if (url.pathname.includes('/rest/v1/rpc/get_site_footer')) return route.fulfill({ json: {} });
  if (url.pathname.includes('/rest/v1/')) return route.fulfill({ json: [] });
  if (url.pathname.includes('/auth/')) return route.fulfill({ status: 401, json: { message: 'No test session' } });
  return route.abort();
});
const page = await context.newPage();
page.on('pageerror', error => errors.push(error.message));
fs.mkdirSync('tmp/public-site-review', { recursive: true });
try {
  await page.goto('http://127.0.0.1:5187/tazesystem', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.product-hero h1').waitFor({ timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.public-site').evaluate(el => getComputedStyle(el).getPropertyValue('--brand-500-rgb').trim()), '248 35 119');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('#public-page-content').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  const flowButtons = page.locator('.product-preview__flows button');
  await flowButtons.nth(1).click();
  assert.equal(await flowButtons.nth(1).getAttribute('aria-pressed'), 'true');
  assert.match(await page.locator('.product-preview__screen img').getAttribute('src'), /process_templates/);
  await page.screenshot({ path: 'tmp/public-site-review/desktop.png', fullPage: false });
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `Page overflows at ${width}px by ${overflow}px`);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: 'tmp/public-site-review/mobile.png', fullPage: false });
  await page.locator('.site-mobile-nav summary').click();
  await page.locator('.site-mobile-nav').getByRole('link', { name: 'تازه‌ها', exact: true }).click();
  await page.waitForURL('**/updates');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  assert.equal(await page.locator('.site-mobile-nav').getAttribute('open'), null);
  await page.locator('footer').getByRole('link', { name: 'حریم خصوصی', exact: true }).click();
  await page.waitForURL('**/privacy');
  assert.equal(await page.evaluate(() => window.scrollY), 0);
  await page.getByRole('heading', { name: 'حریم خصوصی', exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('http://127.0.0.1:5187/tazesystem');
  await page.locator('.product-hero h1').waitFor();
  assert.equal(await page.locator('.product-hero__copy').evaluate(el => getComputedStyle(el).opacity), '1');
  assert.equal(await page.getByText('تازه سیستم را قبل از شروع ببینید', { exact: true }).count(), 0);
  assert.equal(await page.locator('a a').count(), 0, 'Links must not be nested');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: brand isolation, product selection, responsive widths, mobile menu, footer navigation, scroll reset, reduced motion, removed section, valid links, no runtime errors');
} finally {
  await browser.close();
}
