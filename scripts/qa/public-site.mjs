import assert from 'node:assert/strict';
import fs from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

// Read-only UI smoke check: all backend calls are intercepted; no account or
// production content is changed. Run against the local Vite server on 5187.
const base = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:5187/tazesystem';
const live = process.env.PUBLIC_SITE_LIVE === '1';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'fa-IR', serviceWorkers: 'block' });
const errors = [];
if (!live) await context.route('**/*', async route => {
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
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.locator('.product-hero h1').waitFor({ timeout: 120000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.public-site').evaluate(el => getComputedStyle(el).getPropertyValue('--brand-500-rgb').trim()), '248 35 119');
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('#public-page-content').evaluate(el => getComputedStyle(el).outlineStyle), 'none');
  assert.equal(await page.locator('.product-hero h1').innerText(), 'تازه تر و ساده تر از همیشه، کسب و کار را مدیریت کنید');
  assert.equal(await page.locator('.symbol-hero__finale').innerText(), 'همه چیز همین جاست!');
  assert.match(await page.locator('.product-hero__description').innerText(), /نه CRM میخواهید/);
  const symbol = page.locator('.brand-symbol__object');
  const neutral = await symbol.evaluate(el => getComputedStyle(el).transform);
  await page.mouse.move(1300, 250);
  await page.waitForTimeout(600);
  assert.notEqual(await symbol.evaluate(el => getComputedStyle(el).transform), neutral, 'Symbol follows the mouse across the hero');
  await page.screenshot({ path: 'tmp/public-site-review/desktop.png', fullPage: false });
  const counters = page.locator('.site-stats .site-counter');
  assert.equal(await counters.count(), 4);
  assert.equal(await counters.first().locator('.site-counter__value').innerText(), '۰+');
  await page.locator('.site-stats').evaluate(el => window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 100, behavior: 'instant' }));
  await page.waitForFunction(() => document.querySelector('.site-stats .site-counter__value')?.textContent !== '۰+', null, { timeout: 5000 });
  const intermediate = await counters.first().locator('.site-counter__value').innerText();
  assert.notEqual(intermediate, '۰+');
  assert.notEqual(intermediate, await counters.first().getAttribute('aria-label'), 'Counter has an intermediate value');
  await page.waitForTimeout(1700);
  for (const counter of await counters.all()) assert.equal(await counter.locator('.site-counter__value').innerText(), await counter.getAttribute('aria-label'));
  await page.screenshot({ path: 'tmp/public-site-review/counters.png', fullPage: false });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(100);
  await page.locator('.site-stats').scrollIntoViewIfNeeded();
  assert.equal(await counters.first().locator('.site-counter__value').innerText(), await counters.first().getAttribute('aria-label'), 'Counter never restarts');
  const shot = page.locator('.product-shot-button').first();
  await shot.click();
  await page.getByRole('dialog').waitFor();
  assert.ok(await page.getByRole('dialog').locator('img').evaluate(el => el.complete && el.naturalWidth > 2000));
  await page.waitForTimeout(350); // Modal transfers focus after its entrance transition.
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('img[src*="/assets/tutorials/"]').count(), 0);
  const processSection = page.getByRole('heading', { name: 'یک‌بار الگو را طراحی کنید، بارها اجرا کنید', exact: true }).locator('xpath=ancestor::section[1]');
  assert.equal(await processSection.locator('img').count(), 0, 'Standalone process explanation must not contain screenshots');
  const gallery = page.getByRole('heading', { name: 'نگاهی به محیط کار تازه سیستم', exact: true }).locator('xpath=ancestor::section[1]');
  assert.equal(await gallery.locator('.product-shot-button').count(), 6, 'Dedicated screenshot gallery contains the supplied images');
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 1, `Page overflows at ${width}px by ${overflow}px`);
  }
  await page.setViewportSize({ width: 812, height: 375 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Landscape overflow');
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
  await page.goto(base);
  await page.locator('.product-hero h1').waitFor();
  assert.equal(await page.locator('.product-hero__copy').evaluate(el => getComputedStyle(el).opacity), '1');
  for (const counter of await page.locator('.site-stats .site-counter').all()) assert.equal(await counter.locator('.site-counter__value').innerText(), await counter.getAttribute('aria-label'));
  const reducedTransform = await page.locator('.brand-symbol__object').evaluate(el => getComputedStyle(el).transform);
  await page.mouse.move(250, 300);
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.brand-symbol__object').evaluate(el => getComputedStyle(el).transform), reducedTransform);
  assert.equal(await page.getByText('تازه سیستم را قبل از شروع ببینید', { exact: true }).count(), 0);
  assert.equal(await page.locator('a a').count(), 0, 'Links must not be nested');
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log('PASS: exact hero copy, pointer response, counters start on view / intermediate / final / once, real screenshots / enlargement / safe crop, brand isolation, 4 widths, mobile menu, footer navigation, scroll reset, reduced motion, removed section, valid links, no runtime errors');
} finally {
  await browser.close();
}
