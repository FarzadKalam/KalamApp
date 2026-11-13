import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.resolve('tmp/ui-review/node_modules/playwright/index.mjs')).href);
const output = 'tmp/feedback-review';
fs.mkdirSync(output, { recursive: true });
const dir = process.env.FEEDBACK_PREVIEW_DIR || 'tmp/feedback-preview';
const origin = 'http://127.0.0.1:5189';
const builtIndex = fs.readFileSync('dist/index.html', 'utf8');
const links = [...builtIndex.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1">${links}<link rel="stylesheet" href="/feedback-test/entry.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/feedback-test/entry.js"></script></body></html>`;
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/feedback-test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/index.html')) return route.fulfill({ contentType: 'text/html', body: html });
    const basename = path.basename(pathname);
    if (!/^[-\w]+\.(js|css)$/.test(basename)) return route.abort();
    return route.fulfill({ contentType: basename.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join(dir, basename)) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const scripts = [];
  page.on('request', request => { if (request.url().endsWith('.js')) scripts.push(request.url()); });
  await page.goto(`${origin}/feedback-test/index.html`, { waitUntil: 'networkidle' });
  assert.ok(!scripts.some(url => /FeedbackViewport-/.test(url)), 'The Sileo renderer is not loaded while idle');
  assert.ok(!scripts.some(url => /NotificationOverlayPanel-/.test(url)), 'The inbox panel is not loaded while compact');
  const dock = page.getByRole('button', { name: 'نمایش اعلان‌ها و آپلودها' });
  assert.ok((await dock.boundingBox()).width < 240, 'Compact dock stays small');
  await dock.click();
  await page.getByRole('button', { name: 'کوچک کردن پنجره' }).click();
  await page.getByRole('button', { name: 'جابجایی صفحه' }).click();
  await dock.waitFor();
  assert.equal(await page.getByRole('button', { name: 'کوچک کردن پنجره' }).count(), 0);
  await page.getByRole('button', { name: 'اعلان تازه', exact: true }).click();
  await dock.waitFor();
  assert.equal(await page.getByRole('button', { name: 'کوچک کردن پنجره' }).count(), 0, 'New notifications do not expand the panel');
  for (const button of await page.getByRole('button', { name: 'بستن پیام', exact: true }).all()) await button.click();
  for (const mode of ['light', 'dark']) {
    if (mode === 'dark') await page.getByRole('button', { name: 'تغییر روز و شب' }).click();
    await page.getByRole('button', { name: 'نمایش پیام سرنخ' }).click();
    const toast = page.locator('[data-sileo-toast]').filter({ hasText: 'سرنخ فروش ثبت شد' });
    await toast.locator('[data-sileo-content][data-visible="true"]').waitFor();
    const toastBox = await toast.boundingBox();
    assert.ok(await page.evaluate(({ x, y }) => !document.elementFromPoint(x, y)?.closest('[data-sileo-toast]'), { x: toastBox.x + 2, y: toastBox.y + 2 }), 'Transparent margins must not block the page beneath');
    assert.equal(await toast.getByRole('button', { name: 'ثبت فعالیت', exact: true }).count(), 1);
    assert.equal(await toast.getByRole('button', { name: 'تماس', exact: true }).count(), 1);
    assert.equal(await toast.getByRole('button', { name: 'ارسال پیام', exact: true }).count(), 1);
    assert.ok(await toast.locator('[data-sileo-title]').evaluate(el => getComputedStyle(el).color === (document.querySelector('main').style.background === 'rgb(16, 24, 40)' ? 'rgb(23, 32, 51)' : 'rgb(248, 250, 252)')), 'Day/night contrast follows app theme');
    await page.screenshot({ path: `${output}/${mode}-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/${mode}-mobile.png` });
    await toast.getByRole('button', { name: 'ثبت فعالیت', exact: true }).click();
    await page.getByText('فرم فعالیت آمادهٔ تکمیل است', { exact: true }).waitFor();
    for (const close of await page.getByRole('button', { name: 'بستن پیام', exact: true }).all()) await close.click();
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('button', { name: 'ارسال هم‌زمان پیام‌ها' }).click();
  assert.ok(await page.locator('[data-sileo-toast]').count() <= 3, 'A burst cannot create an unbounded animation queue');
  const frameSample = await page.evaluate(async () => {
    const samples = [];
    let previous = performance.now();
    for (let frame = 0; frame < 90; frame++) {
      const now = await new Promise(resolve => requestAnimationFrame(resolve));
      samples.push(now - previous); previous = now;
    }
    samples.sort((a, b) => a - b);
    return { frameCount: samples.length, p95FrameMs: samples[Math.floor(samples.length * .95)], maxFrameMs: samples.at(-1) };
  });
  await page.waitForFunction(() => document.querySelectorAll('[data-sileo-toast]').length === 0);
  assert.equal(await page.locator('.app-feedback-viewport').count(), 0, 'No visual renderer remains active after messages expire');
  const files = fs.readdirSync('dist/assets').filter(file => /^FeedbackViewport-.*\.js$/.test(file));
  assert.ok(files.length > 0);
  const budget = files.map(file => ({ file, gzipBytes: gzipSync(fs.readFileSync(`dist/assets/${file}`)).length }));
  assert.ok(budget.every(file => file.gzipBytes <= 20000), 'The lazy renderer stays below 20 KB gzip');
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify({ errors, rendererBudget: budget, maxVisible: 3, frameSample, scripts }, null, 2));
  assert.deepEqual(errors, []);
  console.log('PASS: compact persistent overlay; lazy renderer/panel; Persian actions; day/night; mobile; bounded burst; idle teardown; renderer budget.');
} catch (error) { console.log(error); throw error; } finally { await browser.close(); }
