// @ts-nocheck
import { encryptEmailSecret } from '../_shared/email-runtime.ts';
const assert=(value: unknown,message='Assertion failed')=>{if(!value)throw new Error(message);};
// Import the actual HTTP handler without starting a listener in the test process.
const serve=Deno.serve;Deno.serve=()=>({});
const {createSendEmailHandler}=await import('./index.ts');
Deno.serve=serve;
const originalFetch=globalThis.fetch;
const setup=async()=>{
  Deno.env.set('SUPABASE_URL','https://backend.example.test');Deno.env.set('SUPABASE_SERVICE_ROLE_KEY','service-secret');
  Deno.env.set('EMAIL_SECRET_ENCRYPTION_KEY',btoa('01234567890123456789012345678901'));
  const encrypted=await encryptEmailSecret({smtp:{host:'smtp.example.com',username:'office@example.com',password:'secret'}});
  const messages=[];const privateRows=[];const logs=[];
  globalThis.fetch=async(input,init)=>{
    const url=new URL(String(input));const table=url.pathname.split('/').pop();const method=init?.method || 'GET';const body=init?.body?JSON.parse(String(init.body)):null;
    let result;
    if(table==='get_current_organization_context') result={org_id:'org-a'};
    else if(table==='email_can_access') result=true;
    else if(url.pathname==='/auth/v1/user') result={id:'user-a'};
    else if(table==='email_accounts') {assert(url.searchParams.get('org_id')==='eq.org-a');result=[{id:'account-a',org_id:'org-a',label:'فرستنده',address:'office@example.com',mode:'custom'}];}
    else if(table==='email_account_secrets') result=[{encrypted_credentials:encrypted}];
    else if(table==='email_messages') {
      assert(url.searchParams.get('org_id')==='eq.org-a' || method==='POST');
      if(method==='POST'){if(messages.some(row=>row.request_key===body.request_key))return new Response('{}',{status:409});messages.push({...body});result=[body];}
      else if(method==='PATCH'){const row=messages.find(row=>`eq.${row.id}`===url.searchParams.get('id'));Object.assign(row,body);result=[row];}
      else {result=messages.filter(row=>!url.searchParams.get('request_key') || `eq.${row.request_key}`===url.searchParams.get('request_key'));}
    }
    else if(table==='email_message_private'){privateRows.push(body);result=[body];}
    else if(table==='outbound_messages'){if(method==='POST'){const row={id:crypto.randomUUID(),...body};logs.push(row);result=[row];}else{Object.assign(logs[0],body);result=[logs[0]];}}
    else throw new Error(`Unexpected network request ${url.pathname}`);
    return new Response(JSON.stringify(result),{status:200});
  };
  return{messages,privateRows,logs};
};
const request=(key: string,overrides={})=>new Request('https://backend.example.test/functions/v1/send-email',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json','x-client-info':'kalamapp; org=org-a'},body:JSON.stringify({request_key:key,to:['recipient@example.com'],bcc:['hidden@example.com'],subject:'موضوع',body:'متن ایمیل',...overrides})});
Deno.test('email handler: stores BCC privately, marks SMTP acceptance honestly, and never sends the same request twice',async()=>{
  const state=await setup();let sends=0;
  const handler=createSendEmailHandler(async(_config,message)=>{sends++;assert(message.bcc[0]==='hidden@example.com');return{messageId:'provider-id',accepted:['recipient@example.com','hidden@example.com'],rejected:[]};});
  try {
    const key=crypto.randomUUID();const result=await(await handler(request(key))).json();assert(result.success);assert(state.messages[0].status==='provider_accepted');assert(state.logs[0].status==='provider_accepted');assert(!JSON.stringify(state.messages).includes('hidden@example.com'));assert(!JSON.stringify(state.logs).includes('hidden@example.com'));assert(state.privateRows[0].bcc_addresses[0]==='hidden@example.com');
    assert((await(await handler(request(key))).json()).success);assert(sends===1);
    const denied=await handler(request(crypto.randomUUID(),{org_id:'org-b'}));assert(denied.status===400);assert(sends===1);
  }finally{globalThis.fetch=originalFetch;}
});
Deno.test('email handler: ambiguous transport failure cannot be retried as another send of the same request',async()=>{
  const state=await setup();let sends=0;
  const handler=createSendEmailHandler(async()=>{sends++;throw new Error('socket timeout');});
  try {
    const key=crypto.randomUUID();const result=await(await handler(request(key))).json();assert(!result.success && result.transport_accepted);assert(state.messages[0].status==='unknown_delivery');
    const repeat=await(await handler(request(key))).json();assert(!repeat.success && repeat.transport_accepted);assert(sends===1);
  }finally{globalThis.fetch=originalFetch;}
});
