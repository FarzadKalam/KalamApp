// @ts-nocheck
import { authorizeEmail, decryptEmailSecret, emailAddresses, emailCors, emailJson, isEmailAddress, loadEmailCredentials } from '../_shared/email-runtime.ts';
import { sendSmtpEmail } from '../_shared/email-transport.ts';
import { storeEmailAttachments, validateEmailAttachments } from '../_shared/email-messages.ts';

export const createSendEmailHandler = (send = sendSmtpEmail) => async (request: Request) => {
  if (request.method==='OPTIONS') return new Response('ok',{headers:emailCors});
  if (request.method!=='POST') return emailJson(405,{success:false,message:'روش درخواست مجاز نیست.'});
  let ctx: any; let message: any; let log: any; let accepted=false; let attempted=false;
  try {
    const body=await request.json();
    ctx=await authorizeEmail(request,body,'send',true);
    const requestKey=body.request_key || crypto.randomUUID();
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestKey)) throw new Error('شناسهٔ درخواست ارسال معتبر نیست.');
    const existing=(await ctx.rest('email_messages',new URLSearchParams({org_id:`eq.${ctx.orgId}`,request_key:`eq.${requestKey}`,select:'id,status,created_by',limit:'1'}).toString()))?.[0];
    if (existing) {
      if (existing.created_by !== ctx.userId) throw new Error('این درخواست ارسال مجاز نیست.');
      if (['provider_accepted','delivered'].includes(existing.status)) return emailJson(200,{success:true,message_id:existing.id,status:existing.status,message:'این ایمیل قبلاً برای ارسال پذیرفته شده است؛ دوباره ارسال نشد.'});
      return emailJson(409,{success:false,message:'این درخواست قبلاً ثبت شده است. پیش از ارسال دوباره، نتیجه را در گزارش ایمیل بررسی کنید.',transport_accepted:existing.status!=='failed',retry_safe:existing.status==='failed',message_id:existing.id});
    }
    if (!ctx.userId && !ctx.system && !await ctx.rpc('org_has_plan_feature',{p_org_id:ctx.orgId,p_feature_key:'organization_email',p_default_enabled:false})) {
      throw new Error('ایمیل سازمانی برای پلن این سازمان فعال نیست.');
    }
    const to=emailAddresses(body.to); const cc=emailAddresses(body.cc); const bcc=emailAddresses(body.bcc);
    if (!to.length) throw new Error('حداقل یک گیرندهٔ اصلی وارد کنید.');
    const subject=String(body.subject || '').trim(); const text=String(body.body || body.text || '').trim();
    if (!subject || !text) throw new Error('موضوع و متن ایمیل را کامل کنید.');
    if (/[\r\n]/.test(subject) || subject.length>1000 || text.length>1024*1024) throw new Error('موضوع یا اندازهٔ متن ایمیل معتبر نیست.');
    const files=validateEmailAttachments(body.attachments);
    let account: any; let config: any; let fromAddress: string; let fromName: string; let trusted=false;
    if (ctx.system) {
      const provider=(await ctx.rest('saas_org_settings','is_billing_provider=eq.true&select=org_id&limit=1'))?.[0];
      const platform=provider?(await ctx.rest('email_platform_settings',`org_id=eq.${provider.org_id}`))?.[0]:null;
      if (!platform?.encrypted_credentials || !isEmailAddress(platform.sender_address)) throw new Error('فرستندهٔ مرکزی سامانه هنوز تنظیم نشده است.');
      config=await decryptEmailSecret(platform.encrypted_credentials);fromAddress=platform.sender_address;fromName=platform.sender_name || '';trusted=true;
    } else {
      const query=new URLSearchParams({org_id:`eq.${ctx.orgId}`,is_active:'eq.true',status:'in.(configured,ready)',
        ...(body.account_id?{id:`eq.${body.account_id}`}:{order:'is_default.desc,created_at.asc'}),limit:'1'});
      account=(await ctx.rest('email_accounts',query.toString()))?.[0];
      if (!account) throw new Error('برای ارسال، ابتدا یک حساب ایمیل فعال در تنظیمات سازمان متصل کنید.');
      config=await loadEmailCredentials(ctx,account);fromAddress=account.address;fromName=account.label;trusted=account.mode==='managed';
    }
    const id=crypto.randomUUID(); let parent: any;
    if (body.reply_to_id) {
      parent=(await ctx.rest('email_messages',new URLSearchParams({id:`eq.${body.reply_to_id}`,org_id:`eq.${ctx.orgId}`,account_id:`eq.${account?.id}`,limit:'1'}).toString()))?.[0];
      if (!parent) throw new Error('ایمیل مرجع پاسخ متعلق به این صندوق نیست.');
    }
    const messageId=`<${id}@${fromAddress.split('@')[1]}>`;
    const references=parent?[...(parent.references_ids || []),parent.message_id].slice(-30):[];
    message=(await ctx.rest('email_messages','','POST',{
      id,request_key:requestKey,org_id:ctx.orgId,account_id:account?.id || null,thread_id:parent?.thread_id || crypto.randomUUID(),
      direction:'outbound',source:ctx.system?'system':ctx.userId?'manual':'automation',
      message_id:messageId,in_reply_to:parent?.message_id || null,references_ids:references,
      from_address:fromAddress,from_name:fromName,to_addresses:to,cc_addresses:cc,subject,body_text:text,
      attachments:[],status:'queued',created_by:ctx.userId,
      related_module_id:ctx.userId?null:body.module_id || null,related_record_id:ctx.userId?null:body.record_id || null,
    }))?.[0];
    const attachments=await storeEmailAttachments(ctx,id,files);
    await ctx.rest('email_messages',`id=eq.${id}&org_id=eq.${ctx.orgId}`,'PATCH',{attachments});
    if (bcc.length) await ctx.rest('email_message_private','','POST',{message_id:id,org_id:ctx.orgId,bcc_addresses:bcc});
    log=(await ctx.rest('outbound_messages','','POST',{
      org_id:ctx.orgId,channel_type:'email',provider:account?.mode || 'platform',recipient:to.join(', '),sender:fromAddress,
      title:subject,message_text:text,status:'pending',related_module_id:message.related_module_id,related_record_id:message.related_record_id,
      metadata:{email_message_id:id,source:message.source},
    }))?.[0];
    await ctx.rest('email_messages',`id=eq.${id}&org_id=eq.${ctx.orgId}`,'PATCH',{status:'sending',outbound_message_id:log.id});
    attempted=true;
    const result=await send(config.smtp,{from:{name:fromName,address:fromAddress},to,cc,bcc,subject,text,
      messageId,inReplyTo:parent?.message_id,references,attachments:files},trusted);
    accepted=true;
    const status='provider_accepted';
    const warning=result.rejected.length?'سرور بخشی از گیرندگان را نپذیرفت؛ وضعیت تحویل قطعی نیست.':null;
    await ctx.rest('email_messages',`id=eq.${id}&org_id=eq.${ctx.orgId}`,'PATCH',{status,provider_message_id:result.messageId,error_message:warning});
    await ctx.rest('outbound_messages',`id=eq.${log.id}&org_id=eq.${ctx.orgId}`,'PATCH',{
      status,provider_message_id:result.messageId,error_message:warning,sent_at:new Date().toISOString(),
    });
    return emailJson(200,{success:true,message_id:id,sent:result.accepted.length,status,message:warning || 'سرور ایمیل پیام را پذیرفت؛ تحویل هنوز تأیید نشده است.'});
  } catch (error) {
    const raw=String(error?.message || '');
    const uncertain=accepted || attempted && ![500,501,502,503,504,530,535,550,551,552,553,554].includes(Number(error?.responseCode));
    const detail=uncertain?'نتیجهٔ ارسال قطعی نیست؛ برای جلوگیری از ارسال تکراری، گزارش ایمیل و صندوق اصلی را بررسی کنید.':
      /[آ-ی]/.test(raw)?raw:'ارسال ایمیل انجام نشد. اتصال یا اطلاعات فرستنده را بررسی کنید.';
    if (ctx && message?.id) {
      const status=uncertain?'unknown_delivery':'failed';
      await ctx.rest('email_messages',`id=eq.${message.id}&org_id=eq.${ctx.orgId}`,'PATCH',{status,error_message:detail}).catch(()=>null);
      if (log?.id) await ctx.rest('outbound_messages',`id=eq.${log.id}&org_id=eq.${ctx.orgId}`,'PATCH',{status,error_message:detail}).catch(()=>null);
    }
    return emailJson(400,{success:false,message:detail,transport_accepted:uncertain,retry_safe:!uncertain,message_id:message?.id || null});
  }
};
export const handleSendEmail=createSendEmailHandler();
Deno.serve(handleSendEmail);
