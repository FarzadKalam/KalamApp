// @ts-nocheck
import { Buffer } from 'node:buffer';
import { emailAddresses, isEmailAddress } from './email-runtime.ts';

export const validateEmailAttachments = (input: any) => {
  if (!Array.isArray(input)) return [];
  if (input.length > 10) throw new Error('در هر ایمیل حداکثر ۱۰ پیوست مجاز است.');
  let total = 0;
  return input.map(file => {
    const encoded = String(file.content_base64 || '');
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) throw new Error('محتوای یکی از پیوست‌ها معتبر نیست.');
    const bytes = Buffer.from(encoded,'base64'); total += bytes.byteLength;
    if (total > 10*1024*1024) throw new Error('مجموع پیوست‌ها باید حداکثر ۱۰ مگابایت باشد.');
    return {name:String(file.name || 'پیوست').replace(/[\r\n/\\]/g,'_').slice(0,180),
      mime_type:String(file.mime_type || 'application/octet-stream').replace(/[\r\n]/g,''),content_base64:encoded,size:bytes.byteLength};
  });
};
export const storeEmailAttachments = async (ctx: any,messageId: string,files: any[]) => {
  const result = [];
  for (const file of files) {
    const path = `${ctx.orgId}/${messageId}/${crypto.randomUUID()}`;
    const response = await fetch(`${ctx.url}/storage/v1/object/email-attachments/${path}`, {
      method:'POST',headers:{...ctx.headers,'Content-Type':file.mime_type},body:Buffer.from(file.content_base64,'base64'),
      signal:AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('ذخیرهٔ پیوست ایمیل ناموفق بود.');
    result.push({name:file.name,path,bucket:'email-attachments',mime_type:file.mime_type,size:file.size});
  }
  return result;
};
export const findEmailParent = async (ctx: any,accountId: string,reference: string) => {
  const query = new URLSearchParams({org_id:`eq.${ctx.orgId}`,account_id:`eq.${accountId}`,message_id:`eq.${reference}`,select:'id,thread_id,message_id,references_ids',limit:'1'});
  return (await ctx.rest('email_messages',query.toString()))?.[0] || null;
};
export const persistInboundEmail = async (ctx: any,account: any,mail: any,externalId: string) => {
  const duplicate = await ctx.rest('email_messages',new URLSearchParams({account_id:`eq.${account.id}`,org_id:`eq.${ctx.orgId}`,external_id:`eq.${externalId}`,select:'id',limit:'1'}).toString());
  if (duplicate?.length) return duplicate[0];
  const id = crypto.randomUUID();
  const messageId = String(mail.messageId || `<${id}@${account.address.split('@')[1]}>`).replace(/[\r\n]/g,'');
  const parent = mail.inReplyTo ? await findEmailParent(ctx,account.id,String(mail.inReplyTo)) : null;
  let files; let attachmentWarning='';
  try { files=validateEmailAttachments(mail.attachments || []); }
  catch { files=[]; attachmentWarning='\nپیوست‌های این ایمیل از حد دریافت بیشتر است؛ آن‌ها را در صندوق اصلی بررسی کنید.'; }
  const attachments = await storeEmailAttachments(ctx,id,files);
  const from = String(mail.from?.address || '').trim().toLowerCase();
  const normalizeRecipients = (values: any[]) => emailAddresses((values || []).map(item=>item.address || item).filter(isEmailAddress));
  const message = {
    id,org_id:ctx.orgId,account_id:account.id,thread_id:parent?.thread_id || crypto.randomUUID(),
    direction:'inbound',source:'imap',message_id:messageId,external_id:externalId,in_reply_to:mail.inReplyTo || null,
    references_ids:(mail.references || []).map(String).slice(-30),from_address:from,from_name:mail.from?.name || null,
    to_addresses:normalizeRecipients(mail.to),cc_addresses:normalizeRecipients(mail.cc),
    subject:String(mail.subject || '').slice(0,1000),body_text:String(mail.text || '').slice(0,1024*1024)+attachmentWarning,attachments,
    status:'received',message_at:mail.date && Number.isFinite(new Date(mail.date).getTime()) ? new Date(Math.min(new Date(mail.date).getTime(),Date.now())).toISOString() : new Date().toISOString(),
  };
  const rows = await ctx.rest('email_messages','', 'POST',message);
  return rows?.[0] || message;
};
export const signedEmailAttachments = async (ctx: any,message: any) => {
  const result = [];
  for (const file of message.attachments || []) {
    if (file.bucket!=='email-attachments' || !String(file.path).startsWith(`${ctx.orgId}/${message.id}/`)) continue;
    const response = await fetch(`${ctx.url}/storage/v1/object/sign/email-attachments/${file.path}`, {
      method:'POST',headers:ctx.headers,body:JSON.stringify({expiresIn:120}),signal:AbortSignal.timeout(10000),
    });
    const data = await response.json().catch(()=>null);
    if (!response.ok || !data?.signedURL) throw new Error('دریافت پیوست ایمیل مجاز نشد.');
    result.push({...file,url:`${ctx.url}/storage/v1${data.signedURL}`});
  }
  return result;
};
