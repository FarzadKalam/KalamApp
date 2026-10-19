import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createTutorialBrowser } from '../tutorial-capture/browser.mjs';
const { browser, context } = await createTutorialBrowser();
const articles=JSON.parse(fs.readFileSync('content/tutorials/launch-fa.json','utf8'));
const choices=[articles[0],articles[1]].map((item,index)=>({...item,id:`sample-${index}`}));
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.route('**/rest/v1/cms_tutorial_posts*',async route=>{
  const url=new URL(route.request().url());
  const selected=url.searchParams.get('id')?.replace('eq.','');
  await route.fulfill({json:selected?{content_blocks:choices.find(item=>item.id===selected).content_blocks}:choices});
});
try {
  await page.goto('http://127.0.0.1:5186/scripts/tutorial-capture/index.html?module=customers&mode=list',{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByRole('button',{name:'آموزش این بخش',exact:true}).click({timeout:120000});
  await page.getByRole('heading',{name:articles[0].title,exact:true}).waitFor();
  await page.getByRole('tab',{name:'فروش و مشتری',exact:true}).click();
  await page.getByRole('heading',{name:articles[1].title,exact:true}).waitFor();
  const href=await page.getByRole('link',{name:'مشاهده در مرکز آموزش'}).getAttribute('href');
  assert.match(href,/\/learn\/customers-and-leads$/);
  await page.setViewportSize({width:390,height:844});
  const drawer=await page.locator('.ant-drawer-content').boundingBox();
  assert.ok(drawer.width<=390.5,'mobile drawer fits the viewport');
  await page.screenshot({path:'tmp/tutorial-help-mobile.png'});
  assert.equal(errors.length,0,errors.join('\n'));
  for(const article of articles) for(const block of article.content_blocks.filter(item=>item.type==='image')) {
    assert.ok(fs.existsSync('public'+block.url),`missing image: ${block.url}`);
    assert.ok(fs.statSync('public'+block.url).size>15000,`blank image: ${block.url}`);
  }
  console.log('PASS: contextual help, group tabs, article selection, public link, mobile drawer, all article screenshots');
} finally { await browser.close(); }
