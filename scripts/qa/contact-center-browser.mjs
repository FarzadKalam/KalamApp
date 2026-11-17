import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createServer} from 'node:http';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||pathToFileURL(path.resolve('../Kalamapp/tmp/ui-review/node_modules/playwright/index.mjs')).href);
const output='tmp/contact-center-review';fs.mkdirSync(output,{recursive:true});
const links=[...fs.readFileSync('dist/index.html','utf8').matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(item=>item[0]).join('');
const fixtureStyles=fs.existsSync('tmp/contact-center-preview/entry.css')?'<link rel="stylesheet" href="/center-test/entry.css">':'';
const html=`<!doctype html><html dir="rtl" lang="fa"><head><meta name="viewport" content="width=device-width,initial-scale=1">${links}${fixtureStyles}<style>html,body,#root{height:auto;min-height:100%;overflow:visible}</style></head><body style="margin:0"><div id="root"></div><script type="module" src="/center-test/entry.js"></script></body></html>`;
const root=path.resolve('dist');const server=createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({...(process.env.PLAYWRIGHT_BROWSER==='chromium'?{}:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}),headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',locale:'fa-IR'});
 await context.route('**/center-test/**',route=>{const filename=path.basename(new URL(route.request().url()).pathname);if(filename==='index.html')return route.fulfill({contentType:'text/html',body:html});if(!/^[-\w]+\.(js|css|woff2?|ttf)$/.test(filename))return route.abort();return route.fulfill({contentType:filename.endsWith('.css')?'text/css':filename.endsWith('.js')?'text/javascript':'font/woff2',body:fs.readFileSync(path.join('tmp/contact-center-preview',filename))});});
 await context.route('https://isolated-preview.invalid/**',route=>route.fulfill({contentType:'application/json',body:'[]'}));
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin+'/center-test/index.html',{waitUntil:'networkidle'});
 await page.getByRole('heading',{name:'مرکز تماس',exact:true}).waitFor();await page.getByRole('heading',{name:'اپراتور نمونه',exact:true}).waitFor();
 await page.screenshot({path:output+'/desktop.png',fullPage:true});
 assert.equal(await page.locator('[aria-label="شماره‌گیر مرکز تماس"] [aria-label="جست‌وجوی داخلی و مخاطب"]').count(),1,'same phone is docked');
 await page.getByRole('button',{name:'تماس با هوش مصنوعی',exact:true}).click();await page.getByText('آزمایش داخل مرورگر',{exact:true}).waitFor();await page.getByText('تماس با مخاطب',{exact:true}).click();await page.getByLabel('شمارهٔ مخاطب',{exact:true}).waitFor();await page.screenshot({path:output+'/voice-console.png'});await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile has no horizontal overflow');await page.screenshot({path:output+'/mobile.png',fullPage:true});
 await page.getByRole('button',{name:'تغییر پوستهٔ آزمون'}).click();await page.waitForTimeout(200);await page.screenshot({path:output+'/mobile-dark.png',fullPage:true});
 assert.deepEqual(errors,[],'page has no runtime exceptions');console.log(JSON.stringify({desktop:true,mobile:true,dark:true,dockedPhone:true,bothVoiceModes:true,realCallPlaced:false}));
}finally{await browser.close();server.close();}
