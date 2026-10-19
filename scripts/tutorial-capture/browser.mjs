import { chromium } from '../../tmp/launch-validation/node_modules/playwright/index.mjs';
import fs from 'node:fs';
export async function createTutorialBrowser() {
const browser = await chromium.launch({channel:'msedge',headless:true});
const context = await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1,locale:'fa-IR'});
const org='10000000-0000-4000-8000-000000000001', user='20000000-0000-4000-8000-000000000001';
const env=fs.readFileSync('.env.local','utf8');
const rawUrl=env.match(/^VITE_SUPABASE_URL\s*=\s*["']?([^\r\n"']+)/m)?.[1];
const authKey=`sb-${new URL(rawUrl).hostname.split('.')[0]}-auth-token`;
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:user,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.fixture-only`;
await context.addInitScript(({authKey,token,user})=>localStorage.setItem(authKey,JSON.stringify({access_token:token,refresh_token:'fixture-only',expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{id:user,email:'training@example.com'}})),{authKey,token,user});
await context.route('**/*',async route => {
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1') return route.continue();
  if(url.pathname.includes('/auth/v1/user')) return route.fulfill({json:{id:user,email:'training@example.com',user_metadata:{full_name:'کاربر آموزشی'}}});
  if(url.pathname.includes('/rest/v1/profiles')) return route.fulfill({json:route.request().headers().accept?.includes('object')?{id:user,org_id:org,full_name:'کاربر آموزشی',role:'admin',is_active:true}:[{id:user,org_id:org,full_name:'کاربر آموزشی',role:'admin',is_active:true}]});
  if(url.pathname.includes('/rest/v1/saas_org_settings')) return route.fulfill({json:[{org_id:org,is_demo:true,plan_code:'public_demo_full',status:'demo'}]});
  if(url.pathname.includes('/functions/v1/demo-data-admin')) return route.fulfill({json:{success:true,is_demo:true,has_seeded_batch:true,status:'seeded',seeded_records_count:60}});
  if(url.pathname.includes('/rest/v1/rpc/')) {
    if(/plan|feature|access/.test(url.pathname)) return route.fulfill({json:true});
    return route.fulfill({json:[]});
  }
  if(url.pathname.includes('/rest/v1/')) return route.fulfill({json:[]});
  return route.abort();
});
return { browser, context };
}
