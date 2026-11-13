import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PUBLIC_ECOSYSTEM_GROUPS } from '../../shared/publicEcosystem.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.resolve('tmp/ui-review/node_modules/playwright/index.mjs')).href);
const base = process.env.PUBLIC_SITE_URL || 'http://127.0.0.1:5189/tazesystem';
const output = 'tmp/ecosystem-review';
fs.mkdirSync(output, { recursive: true });
const items = PUBLIC_ECOSYSTEM_GROUPS.flatMap(group => group.items);
assert.equal(new Set(items.map(item => item.id)).size, items.length, 'Catalog keys are unique');
assert.deepEqual(items.filter(item => item.status === 'development').map(item => item.id).sort(), ['mahak', 'sepidar', 'whatsapp']);
for (const item of items.filter(item => item.logo)) {
  assert.ok(item.logo.startsWith('/assets/'), 'All marks are served locally');
  assert.ok(fs.existsSync(path.join('public', item.logo)), `Missing logo: ${item.id}`);
}

const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: 'fa-IR', serviceWorkers: 'block' });
context.setDefaultTimeout(20000);
// Exercise published-CMS compatibility; all remote backend requests are mocked.
await context.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin === new URL(base).origin) return route.continue();
  if (url.pathname.endsWith('/rpc/get_cms_landing_page')) return route.fulfill({ json: { sections: [{ id: 'published-integrations', type: 'integrations', enabled: true, props: {} }], theme: { paletteKey: 'corporate_blue' } } });
  if (url.pathname.includes('/rest/v1/rpc/')) return route.fulfill({ json: {} });
  if (url.pathname.includes('/rest/v1/')) return route.fulfill({ json: [] });
  if (url.pathname.includes('/auth/')) return route.fulfill({ status: 401, json: { message: 'No test session' } });
  return route.abort();
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  const publishedPage = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/rpc/get_cms_landing_page'));
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await publishedPage;
  await page.locator('.product-hero').waitFor({ state: 'detached' });
  console.log('Local page loaded');
  const section = page.locator('.ecosystem-section');
  await section.waitFor();
  console.log('Published integrations section rendered');
  await page.evaluate(() => document.fonts.ready);
  await section.scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelector('.ecosystem-canvas')?.getAttribute('data-paused') === 'false');
  assert.equal(await section.locator('.ecosystem-orb').count(), items.length);
  assert.equal(await section.evaluate(el => getComputedStyle(el).getPropertyValue('--brand-500-rgb').trim()), '248 35 119');
  assert.equal(await section.locator('.ecosystem-ring:visible').count(), 4);
  await section.getByRole('button', { name: 'توقف حرکت', exact: true }).click();
  for (const image of await section.locator('img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(el => el.decode());
    assert.ok(await image.evaluate(el => el.naturalWidth > 0), 'Every logo decodes');
  }
  await section.getByRole('button', { name: 'ادامهٔ حرکت', exact: true }).click();
  console.log('All local logos decoded');
  const whatsapp = section.locator('.ecosystem-canvas').getByRole('button', { name: 'واتساپ؛ در حال توسعه', exact: true });
  await section.locator('.ecosystem-canvas').hover();
  await whatsapp.hover();
  assert.equal(await whatsapp.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  assert.equal(await section.locator('.ecosystem-detail').innerText(), 'واتساپ');
  assert.doesNotMatch(await section.innerText(), /در حال توسعه|هنوز قابل استفاده نیست|پشتیبانی می‌شود/);
  for (const mark of await section.locator('.ecosystem-orb .ecosystem-mark[data-status="development"]').all()) {
    assert.equal(await mark.evaluate(el => getComputedStyle(el).filter), 'grayscale(1)');
    assert.equal(await mark.evaluate(el => getComputedStyle(el).opacity), '0.32');
  }
  assert.equal(await section.locator('.ecosystem-orb .ecosystem-mark[data-status="supported"]').first().evaluate(el => getComputedStyle(el).filter), 'none');
  await whatsapp.click();
  await page.mouse.move(5, 5);
  assert.match(await section.locator('.ecosystem-detail').innerText(), /واتساپ/);
  const pause = section.getByRole('button', { name: 'توقف حرکت', exact: true });
  await pause.click();
  assert.equal(await section.locator('.ecosystem-canvas').getAttribute('data-paused'), 'true');
  await section.getByRole('button', { name: 'ادامهٔ حرکت', exact: true }).click();
  await page.keyboard.press('Tab'); // Enter keyboard modality before checking focus-visible.
  await whatsapp.focus();
  assert.equal(await whatsapp.evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  assert.equal(await whatsapp.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.keyboard.press('Escape');
  await page.mouse.move(5, 5);
  await section.screenshot({ path: `${output}/desktop.png` });
  console.log('Desktop interaction checks passed');

  for (const width of [320, 375, 390, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Page overflow at ${width}`);
    if (width < 640) {
      assert.equal(await section.locator('.ecosystem-ring:visible').count(), 1);
      for (const group of PUBLIC_ECOSYSTEM_GROUPS) {
        await section.locator('.ecosystem-groups').getByRole('button').filter({ hasText: group.title }).click();
        assert.equal(await section.locator('.ecosystem-ring:visible').getAttribute('data-group'), group.id);
        for (const button of await section.locator('.ecosystem-orb:visible').all()) {
          const box = await button.boundingBox();
          assert.ok(box.width >= 43.9 && box.height >= 43.9, 'Touch target is at least 44px');
        }
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await section.locator('.ecosystem-groups').getByRole('button').filter({ hasText: 'کسب‌وکار و مالی' }).click();
  await section.locator('.ecosystem-directory').getByRole('button').filter({ hasText: 'سپیدار' }).click();
  assert.equal(await section.locator('.ecosystem-detail').innerText(), 'سپیدار');
  for (const mark of await section.locator('.ecosystem-detail .ecosystem-mark, .ecosystem-directory .ecosystem-mark[data-status="development"]').all()) {
    assert.equal(await mark.evaluate(el => getComputedStyle(el).filter), 'grayscale(1)');
    assert.equal(await mark.evaluate(el => getComputedStyle(el).opacity), '0.32');
  }
  assert.doesNotMatch(await section.innerText(), /در حال توسعه|هنوز قابل استفاده نیست|پشتیبانی می‌شود/);
  await section.screenshot({ path: `${output}/mobile.png` });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.querySelector('.ecosystem-controls button')?.disabled === true);
  assert.equal(await section.locator('.ecosystem-orb:visible').first().evaluate(el => getComputedStyle(el).animationPlayState), 'paused');
  assert.ok(await section.getByRole('button', { name: 'نمایش بدون حرکت' }).isDisabled());
  assert.deepEqual(errors, [], 'No browser errors');
  console.log(`PASS: ${items.length} marks, CMS compatibility, desktop/mobile, status, local assets, hover, keyboard, pause and reduced motion.`);
} catch (error) {
  console.log('Browser errors:', errors);
  console.log('Visible page:', (await page.locator('body').innerText()).slice(0, 1500));
  await page.screenshot({ path: `${output}/failure.png`, fullPage: false });
  throw error;
} finally {
  await browser.close();
}
