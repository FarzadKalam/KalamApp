// @ts-nocheck
// Run using Deno; no real email is sent by these tests.
import { authorizeEmail, decryptEmailSecret, encryptEmailSecret, emailAddresses } from './email-runtime.ts';
import { validateEmailAttachments } from './email-messages.ts';
import { validateEmailHost } from './email-transport.ts';
const assert=(value: unknown,message='Assertion failed')=>{if(!value)throw new Error(message);};
const rejects=async(callback:()=>unknown)=>{let failed=false;try{await callback();}catch{failed=true;}assert(failed,'Expected rejection');};
const originalFetch=globalThis.fetch;
Deno.test('email: secrets are authenticated encrypted values, attachments and recipients reject invalid input',async()=>{
  Deno.env.set('EMAIL_SECRET_ENCRYPTION_KEY',btoa('01234567890123456789012345678901'));
  const encrypted=await encryptEmailSecret({password:'private-password'});
  assert(!encrypted.includes('private-password'));assert((await decryptEmailSecret(encrypted)).password==='private-password');
  await rejects(()=>decryptEmailSecret(encrypted.slice(0,-5)+'AAAAA'));
  await rejects(()=>emailAddresses(['a@example.com\r\nBcc:someone@example.com']));
  await rejects(()=>validateEmailAttachments(Array.from({length:11},()=>({content_base64:'AA=='}))));
  await rejects(()=>validateEmailAttachments([{content_base64:'not valid base64!'}]));
});
Deno.test('email: untrusted SMTP targets reject internal addresses and pin validated public DNS',async()=>{
  for(const host of ['localhost','127.0.0.1','169.254.169.254','10.1.1.1','192.168.1.1','100.64.0.1','::1','mail.internal']) {
    if(host==='mail.internal') continue;
    await rejects(()=>validateEmailHost(host));
  }
  const original=Deno.resolveDns;
  try {
    Deno.resolveDns=async(_host,type)=>type==='A'?['93.184.216.34']:[];
    const result=await validateEmailHost('smtp.example.com'); assert(result.host==='93.184.216.34');assert(result.servername==='smtp.example.com');
    Deno.resolveDns=async()=>['10.0.0.1'];await rejects(()=>validateEmailHost('smtp.example.com'));
  }finally{Deno.resolveDns=original;}
});
Deno.test('email: user context rejects forged tenant ids and missing permission, service requires explicit organization',async()=>{
  Deno.env.set('SUPABASE_URL','https://backend.example.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','test-service');
  let permitted=true;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);const body=url.includes('get_current_organization_context')?{org_id:'org-a'}:url.includes('email_can_access')?permitted:{id:'user-a'};
    if(url.includes('/rpc/')) assert(new Headers(init?.headers).get('x-client-info')==='kalamapp; org=org-a');
    return new Response(JSON.stringify(body),{status:200});
  };
  const request=new Request('https://backend.example.test/functions/v1/send-email',{headers:{Authorization:'Bearer user-token','x-client-info':'kalamapp; org=org-a'}});
  try {
    assert((await authorizeEmail(request,{},'send')).orgId==='org-a');
    await rejects(()=>authorizeEmail(request,{org_id:'org-b'},'send'));
    permitted=false;await rejects(()=>authorizeEmail(request,{},'send'));
    const service=new Request(request.url,{headers:{Authorization:'Bearer test-service'}});
    await rejects(()=>authorizeEmail(service,{},'send',true));
    await rejects(()=>authorizeEmail(service,{org_id:'org-a'},'send',false));
  }finally{globalThis.fetch=originalFetch;}
});
Deno.test('email: delivery callbacks reject unsigned or expired requests before touching tenant data',async()=>{
  const serve=Deno.serve;Deno.serve=()=>({});
  const {handleEmailProviderEvent}=await import('../email-provider-events/index.ts');Deno.serve=serve;
  Deno.env.set('EMAIL_PROVIDER_WEBHOOK_SECRET','independent-webhook-secret');
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('must not access data');};
  try {
    const request=(headers={})=>new Request('https://backend.example.test/functions/v1/email-provider-events',{method:'POST',headers,body:JSON.stringify({message_id:'<example>',status:'delivered'})});
    assert((await handleEmailProviderEvent(request())).status===401);
    assert((await handleEmailProviderEvent(request({'x-email-timestamp':String(Math.floor(Date.now()/1000)),'x-email-signature':'0'.repeat(64)}))).status===401);
    assert((await handleEmailProviderEvent(request({'x-email-timestamp':'1000000000','x-email-signature':'0'.repeat(64)}))).status===401);
    assert(calls===0);
  }finally{globalThis.fetch=originalFetch;}
});
