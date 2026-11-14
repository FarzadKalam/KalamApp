import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || pathToFileURL(path.resolve('tmp/ui-review/node_modules/playwright/index.mjs')).href);
const output = 'tmp/sidebar-review';
fs.mkdirSync(output, { recursive: true });
const links = [...fs.readFileSync('dist/index.html', 'utf8').matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(match => match[0]).join('');
const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta name="viewport" content="width=device-width, initial-scale=1">${links}<link rel="stylesheet" href="/sidebar-test/entry.css"></head><body style="margin:0"><div id="root"></div><script type="module" src="/sidebar-test/entry.js"></script></body></html>`;
const root = path.resolve('dist');
const server = createServer((request, response) => {
  const file = path.resolve(root, `.${new URL(request.url, 'http://localhost').pathname}`);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', file.endsWith('.css') ? 'text/css' : file.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
  response.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_BROWSER === 'chromium' ? {} : { channel: 'msedge' }), headless: true });
const errors = [];
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'fa-IR', serviceWorkers: 'block' });
  await context.route('**/sidebar-test/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/index.html')) return route.fulfill({ contentType: 'text/html', body: html });
    const basename = path.basename(pathname);
    if (!/^[-\w]+\.(js|css)$/.test(basename)) return route.abort();
    return route.fulfill({ contentType: basename.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(path.join('tmp/sidebar-preview', basename)) });
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/sidebar-test/index.html`, { waitUntil: 'networkidle' });
  const panel = page.locator('.app-sidebar-panel');
  const body = page.locator('.sidebar-preview-body');
  const toggle = page.getByRole('button', { name: 'باز کردن فهرست ماژول‌ها', exact: true });
  const settled = () => page.waitForFunction(() => !document.querySelector('.app-workspace-content').getAnimations().some(animation => animation.playState === 'running'));
  const assertDashboard = async () => {
    await panel.waitFor(); await settled();
    const p = await panel.boundingBox(), b = await body.boundingBox();
    assert.ok(p.y > 0 && p.y + p.height < page.viewportSize().height, 'Desktop panel floats beside the rail');
    assert.ok(b.x + b.width <= p.x - 8, 'Dashboard content remains outside the panel');
    assert.equal(await page.locator('.ant-drawer-mask').count(), 0, 'Desktop has no drawer mask');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow');
  };
  await assertDashboard();
  const assertLabelsVisible = async (scope) => {
    const labels = await scope.locator('.sidebar-menu-label, .sidebar-menu-link__text').evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => {
      const range = document.createRange(); range.selectNodeContents(element);
      const text = range.getBoundingClientRect();
      const row = element.closest('.ant-menu-item, .ant-menu-submenu-title').getBoundingClientRect();
      return { label: element.textContent, text: { top: text.top, bottom: text.bottom, left: text.left, right: text.right, width: text.width }, row: { top: row.top, bottom: row.bottom, left: row.left, right: row.right } };
    }));
    // Glyph bounds may extend one pixel beyond the line box in Peyda.
    assert.ok(labels.length > 0, 'The menu scope contains visible labels');
    for (const item of labels) assert.ok(item.text.width > 4 && item.text.top >= item.row.top - 2 && item.text.bottom <= item.row.bottom + 2 && item.text.left >= item.row.left && item.text.right <= item.row.right, `Menu text must fit inside its row: ${JSON.stringify(item)}`);
  };
  await assertLabelsVisible(panel);
  assert.ok(await panel.locator('.ant-menu-item-selected a.sidebar-menu-link').evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const text = range.getBoundingClientRect(), row = el.closest('.ant-menu-item').getBoundingClientRect();
    return text.width > 0 && text.top >= row.top && text.bottom <= row.bottom;
  }), 'Record link text is visible inside its menu row beside the icon');
  const expandedWidth = (await body.boundingBox()).width;
  await page.getByRole('button', { name: 'عملیات صفحه', exact: true }).click();
  assert.equal(await panel.count(), 0, 'Clicking outside dismisses the menu');
  await toggle.click();
  await page.getByRole('button', { name: 'بستن فهرست ماژول‌ها', exact: true }).click();
  await settled();
  assert.ok((await body.boundingBox()).width > expandedWidth + 250, 'Closing restores dashboard width');
  await toggle.click();
  await panel.locator('.ant-menu-submenu-title').filter({ hasText: 'امور مالی' }).hover();
  const popups = page.locator('.workspace-sidebar-submenu:visible');
  await popups.first().waitFor();
  await assertLabelsVisible(popups.first());
  assert.ok((await popups.first().boundingBox()).x < (await panel.boundingBox()).x, 'RTL submenu opens to the left');
  await popups.first().locator('.ant-menu-submenu-title').filter({ hasText: 'گزارش‌های مالی' }).hover();
  await page.waitForFunction(() => [...document.querySelectorAll('.workspace-sidebar-submenu')].filter(el => el.getBoundingClientRect().width > 0 && getComputedStyle(el).visibility !== 'hidden').length >= 2);
  await assertLabelsVisible(popups.nth(1));
  await page.screenshot({ path: `${output}/submenu-light.png`, fullPage: true });
  await popups.nth(1).getByRole('link', { name: 'گزارش فروش', exact: true }).click();
  await panel.waitFor({ state: 'detached' });
  assert.ok(page.url().endsWith('/sidebar-test/index.html'), 'Menu links use client navigation without reloading the document');
  await page.getByRole('button', { name: 'صفحه مشتریان', exact: true }).click();
  const before = await body.boundingBox();
  await toggle.click(); await panel.waitFor();
  const after = await body.boundingBox();
  assert.equal(after.width, before.width, 'Other pages keep their content width');
  assert.equal(after.x, before.x, 'Other pages do not shift');
  await page.mouse.click(20, 800);
  await panel.waitFor({ state: 'detached' });
  await toggle.click(); await page.keyboard.press('Escape');
  await panel.waitFor({ state: 'detached' });
  assert.equal(await toggle.evaluate(el => el === document.activeElement), true, 'Escape returns focus to the rail');
  await page.getByRole('button', { name: 'صفحه داشبورد', exact: true }).click();
  for (const width of [1024, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    if (!await panel.count()) await toggle.click();
    await assertDashboard();
  }
  await page.screenshot({ path: `${output}/desktop-light.png`, fullPage: true });
  await page.getByRole('button', { name: 'تغییر روز و شب', exact: true }).click();
  await toggle.click();
  await panel.locator('.ant-menu-dark').waitFor();
  await assertLabelsVisible(panel);
  await page.waitForFunction(() => {
    const title = document.querySelector('.app-sidebar-panel .ant-menu-submenu-title');
    const search = document.querySelector('.app-sidebar-panel .ant-input-affix-wrapper');
    const channels = el => getComputedStyle(el).color.match(/\d+/g).slice(0, 3).map(Number);
    return channels(title).every(value => value > 180) && channels(search).every(value => value > 180);
  });
  await page.waitForFunction(() => !document.querySelector('.app-sidebar-panel').getAnimations({ subtree: true }).some(animation => animation.playState === 'running'));
  await page.screenshot({ path: `${output}/desktop-dark.png`, fullPage: true });
  await panel.locator('.ant-menu-submenu-title').filter({ hasText: 'امور مالی' }).hover();
  await popups.first().waitFor();
  await assertLabelsVisible(popups.first());
  await page.screenshot({ path: `${output}/submenu-dark.png`, fullPage: true });
  await page.mouse.move(20, 800);
  assert.equal(await panel.locator('.ant-menu-item-selected a.sidebar-menu-link').evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)', 'Selected record links inherit the readable menu color');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(await page.locator('.app-workspace-content').evaluate(el => getComputedStyle(el).transitionDuration), '0s');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'باز کردن منوی گوشی', exact: true }).click();
  const drawer = page.locator('.ant-drawer-body');
  await drawer.locator('.ant-menu-submenu-title').filter({ hasText: 'امور مالی' }).click();
  await assertLabelsVisible(drawer);
  await drawer.getByRole('link', { name: 'فاکتورها', exact: true }).click();
  await page.locator('.ant-drawer-content-wrapper').waitFor({ state: 'hidden' });
  assert.equal(await page.locator('.app-main-rail').count(), 0);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('button', { name: 'باز کردن منوی گوشی', exact: true }).click();
  await drawer.waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const rect = document.querySelector('.ant-drawer-body')?.getBoundingClientRect();
    return rect && rect.width > 0 && rect.left >= 0 && rect.right <= innerWidth + 1;
  });
  await page.screenshot({ path: `${output}/mobile-dark.png`, fullPage: true });
  assert.deepEqual(errors, []);
  fs.writeFileSync(`${output}/checks.json`, JSON.stringify({ passed: true, checks: ['dashboard push', 'other pages overlay', 'nested RTL hover', 'outside dismissal', 'Escape focus', 'responsive widths', 'touch navigation', 'day/night', 'reduced motion'], errors }, null, 2));
} catch (error) {
  if (page) fs.writeFileSync(`${output}/failure-layout.json`, JSON.stringify(await page.locator('.workspace-sidebar-submenu:visible .ant-menu-item').evaluateAll(rows => rows.map(row => ({html:row.outerHTML, display:getComputedStyle(row).display, children:[...row.children].map(el=>({tag:el.tagName,cls:el.className,display:getComputedStyle(el).display,rect:el.getBoundingClientRect().toJSON()}))}))), null, 2));
  if (page) await page.screenshot({ path: `${output}/failure.png`, fullPage: true }).catch(() => {});
  console.error(errors);
  throw error;
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
