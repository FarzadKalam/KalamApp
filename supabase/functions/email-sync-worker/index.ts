// @ts-nocheck
import { emailService, emailJson } from '../_shared/email-runtime.ts';
export const handleEmailSyncWorker=async(request: Request)=>{
  if(request.method!=='POST') return emailJson(405,{success:false});
  try {
    const service=emailService();
    if(request.headers.get('Authorization')!==`Bearer ${service.key}`) return emailJson(401,{success:false});
    // Keyset pagination bounds work per invocation. The scheduler continues with next_cursor.
    const body=await request.json().catch(()=>({}));
    const query=new URLSearchParams({is_active:'eq.true',receive_enabled:'eq.true',select:'id,org_id',order:'id.asc',limit:'10',...(body.after?{id:`gt.${body.after}`}:{})});
    const accounts=await service.rest('email_accounts',query.toString()); const results=[];
    for(const account of accounts) {
      const response=await fetch(`${service.url}/functions/v1/email-admin`,{method:'POST',headers:service.headers,body:JSON.stringify({action:'sync_account',org_id:account.org_id,account_id:account.id}),signal:AbortSignal.timeout(90000)}).catch(()=>null);
      results.push({account_id:account.id,success:Boolean(response?.ok)});
    }
    return emailJson(200,{success:true,results,next_cursor:accounts.length===10?accounts[accounts.length-1].id:null});
  }catch{return emailJson(400,{success:false,message:'همگام‌سازی ایمیل کامل نشد.'});}
};
Deno.serve(handleEmailSyncWorker);
