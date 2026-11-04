// @ts-nocheck
import { emailService, emailJson } from '../_shared/email-runtime.ts';

// The delivery provider signs `${timestamp}.${rawBody}` using HMAC-SHA256.
// This endpoint never accepts browser credentials or trusts an organization from its payload.
export const handleEmailProviderEvent = async (request: Request) => {
  if (request.method!=='POST') return emailJson(405,{success:false});
  try {
    const secret=Deno.env.get('EMAIL_PROVIDER_WEBHOOK_SECRET');
    const timestamp=request.headers.get('x-email-timestamp') || '';
    const signature=request.headers.get('x-email-signature') || '';
    if (!secret || !/^\d{10}$/.test(timestamp) || Math.abs(Date.now()/1000-Number(timestamp))>300 || !/^[a-f0-9]{64}$/i.test(signature)) return emailJson(401,{success:false});
    const raw=await request.text(); if(raw.length>16000) return emailJson(413,{success:false});
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    const bytes=Uint8Array.from(signature.match(/../g)!,value=>parseInt(value,16));
    if(!await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(`${timestamp}.${raw}`))) return emailJson(401,{success:false});
    const body=JSON.parse(raw); if(!['delivered','bounced'].includes(body.status)) return emailJson(400,{success:false});
    const service=emailService();
    const mail=(await service.rest('email_messages',new URLSearchParams({message_id:`eq.${body.message_id}`,direction:'eq.outbound',select:'id,org_id,status,outbound_message_id',limit:'2'}).toString())) || [];
    if(mail.length!==1) return emailJson(404,{success:false});
    const record=mail[0];
    // Replayed receipt events cannot send an email, change its tenant or reopen a terminal state.
    if(!['provider_accepted','unknown_delivery','sending'].includes(record.status)) return emailJson(200,{success:true,unchanged:true});
    const detail=body.status==='bounced'?'ارائه‌دهنده برگشت ایمیل را گزارش کرده است.':null;
    await service.rest('email_messages',`id=eq.${record.id}&org_id=eq.${record.org_id}&status=in.(provider_accepted,unknown_delivery,sending)`,'PATCH',{status:body.status,error_message:detail});
    if(record.outbound_message_id) await service.rest('outbound_messages',`id=eq.${record.outbound_message_id}&org_id=eq.${record.org_id}`,'PATCH',{status:body.status==='bounced'?'failed':'delivered',error_message:detail});
    return emailJson(200,{success:true});
  } catch { return emailJson(400,{success:false,message:'ثبت رسید ایمیل انجام نشد.'}); }
};
Deno.serve(handleEmailProviderEvent);
