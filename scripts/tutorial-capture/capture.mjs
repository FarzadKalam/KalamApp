import fs from 'node:fs';
import { createTutorialBrowser } from './browser.mjs';
const {browser,context}=await createTutorialBrowser();
const page=await context.newPage();
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
fs.mkdirSync('public/assets/tutorials',{recursive:true});
const articles=JSON.parse(fs.readFileSync('content/tutorials/launch-fa.json','utf8'));
const entries=process.argv.slice(2).length?process.argv.slice(2):[...new Set(articles.flatMap(article=>article.content_blocks.filter(block=>block.type==='image').map(block=>block.url.split('/').pop().replace('.png','').replace(/-(list|form)$/u,':$1'))))];
for(const entry of entries){
  const [module,mode]=entry.split(':');
  await page.goto(`http://127.0.0.1:5186/scripts/tutorial-capture/index.html?module=${module}&mode=${mode}`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByText('تازه سیستم · راهنمای کاربردی').waitFor({timeout:120000});
  await page.waitForTimeout(3000);
  await page.waitForFunction(() => document.body.innerText.trim().length > 100, {timeout:30000});
  console.log(entry,(await page.locator('body').innerText()).slice(0,220));
  await page.screenshot({path:`public/assets/tutorials/${module}-${mode}.png`,fullPage:false});
}
await browser.close();
