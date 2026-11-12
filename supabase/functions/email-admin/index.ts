// @ts-nocheck
import { authorizeEmail, decryptEmailSecret, emailCors, emailJson, encryptEmailSecret, isEmailAddress, loadEmailCredentials } from '../_shared/email-runtime.ts';
import { persistInboundEmail, signedEmailAttachments } from '../_shared/email-messages.ts';
import { readImapEmailBatch, verifyEmailSmtp, verifyEmailImap } from '../_shared/email-transport.ts';
import { managedEmailAddress, requireManagedEmailFeature } from '../_shared/managed-email.ts';

const accountQuery = (ctx: any,id?: string) => new URLSearchParams({org_id:`eq.${ctx.orgId}`,...(id?{id:`eq.${id}`}:{})}).toString();
const publicConnection = (config: any) => ({smtp:{host:config.smtp?.host,port:config.smtp?.port,username:config.smtp?.username},
  imap:{host:config.imap?.host,port:config.imap?.port,username:config.imap?.username,mailbox:config.imap?.mailbox || 'INBOX'}});

export const handleEmailAdmin = async (request: Request) => {
  if (request.method==='OPTIONS') return new Response('ok',{headers:emailCors});
  if (request.method!=='POST') return emailJson(405,{success:false,message:'روش درخواست مجاز نیست.'});
  try {
    const body = await request.json(); const action = String(body.action || 'accounts');
    const ctx = await authorizeEmail(request,body,['accounts','attachments','sync_account'].includes(action)?'view':'manage',action==='sync_account');
    if (!ctx.userId && !await ctx.rpc('org_has_plan_feature',{p_org_id:ctx.orgId,p_feature_key:'organization_email',p_default_enabled:false})) throw new Error('ایمیل سازمانی برای این سازمان فعال نیست.');
    if (action==='accounts') {
      const accounts = await ctx.rest('email_accounts',accountQuery(ctx)+'&order=is_default.desc,created_at.asc');
      return emailJson(200,{success:true,accounts});
    }
    if (action==='attachments') {
      const messages = await ctx.rest('email_messages',new URLSearchParams({id:`eq.${body.message_id}`,org_id:`eq.${ctx.orgId}`,select:'id,attachments'}).toString());
      if (!messages?.[0]) throw new Error('دسترسی به این ایمیل مجاز نیست.');
      return emailJson(200,{success:true,attachments:await signedEmailAttachments(ctx,messages[0])});
    }
    if (action==='platform_get' || action==='platform_save' || action==='platform_verify') {
      if (!await ctx.rpc('current_user_has_saas_admin_permission',{required_field:'edit_orgs'},ctx.token,request)) throw new Error('تنظیمات ایمیل مرکزی فقط برای مدیر سامانه مجاز است.');
      const provider = await ctx.rest('saas_org_settings',`org_id=eq.${ctx.orgId}&is_billing_provider=eq.true&select=org_id`);
      if (!provider?.length) throw new Error('این سازمان ارائه‌دهندهٔ ایمیل مرکزی نیست.');
      const existing = (await ctx.rest('email_platform_settings',`org_id=eq.${ctx.orgId}`))?.[0];
      if (action==='platform_get') return emailJson(200,{success:true,settings:existing?{
        sender_address:existing.sender_address,sender_name:existing.sender_name,managed_domain:existing.managed_domain,
        managed_enabled:existing.managed_enabled,configured:Boolean(existing.encrypted_credentials),
        smtp:existing.encrypted_credentials?publicConnection(await decryptEmailSecret(existing.encrypted_credentials)).smtp:{}}:null});
      const previous = existing?.encrypted_credentials ? await decryptEmailSecret(existing.encrypted_credentials) : {};
      const smtp = {...previous.smtp,...body.smtp,password:body.smtp?.password || previous.smtp?.password};
      if (action==='platform_verify') { await verifyEmailSmtp(smtp,true); return emailJson(200,{success:true}); }
      if (!isEmailAddress(body.sender_address) || !smtp.host || !smtp.username || !smtp.password) throw new Error('اطلاعات فرستنده و اتصال مرکزی را کامل کنید.');
      const managedDomain = String(body.managed_domain || '').trim().toLowerCase();
      if (managedDomain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(managedDomain)) throw new Error('دامنهٔ ایمیل ابری معتبر نیست.');
      await ctx.rest('email_platform_settings','on_conflict=org_id','POST',{
        org_id:ctx.orgId,sender_address:body.sender_address,sender_name:String(body.sender_name || ''),
        managed_domain:managedDomain || null,managed_enabled:body.managed_enabled===true,
        encrypted_credentials:await encryptEmailSecret({smtp}),updated_at:new Date().toISOString(),
      },{Prefer:'resolution=merge-duplicates,return=representation'});
      return emailJson(200,{success:true});
    }
    if (action==='save_account') {
      const address=String(body.address || '').trim().toLowerCase();
      if (!isEmailAddress(address) || !String(body.label || '').trim()) throw new Error('نام و آدرس ایمیل را کامل کنید.');
      const existing = body.account_id ? (await ctx.rest('email_accounts',accountQuery(ctx,body.account_id)))?.[0] : null;
      if (body.account_id && !existing) throw new Error('حساب ایمیل در این سازمان پیدا نشد.');
      if (existing?.mode==='managed') throw new Error('اتصال صندوق ابری توسط مدیر سامانه مدیریت می‌شود.');
      const previous=existing?await loadEmailCredentials(ctx,existing).catch(()=>({})):{};
      const config={smtp:{...previous.smtp,...body.smtp,password:body.smtp?.password || previous.smtp?.password},
        imap:{...previous.imap,...body.imap,password:body.imap?.password || previous.imap?.password}};
      if (!config.smtp.host || !config.smtp.username || !config.smtp.password) throw new Error('اطلاعات اتصال ارسال ایمیل کامل نیست.');
      if (body.receive_enabled && (!config.imap.host || !config.imap.username || !config.imap.password)) throw new Error('برای دریافت ایمیل، اتصال صندوق را کامل کنید.');
      const encrypted=await encryptEmailSecret(config); // Validate the encryption key before any database write.
      const id=existing?.id || crypto.randomUUID();
      // Keep new/changed connections inactive until a successful connection test.
      const values={id,org_id:ctx.orgId,label:String(body.label).trim(),address,mode:'custom',status:'configured',is_active:false,
        receive_enabled:body.receive_enabled===true,connection_config:publicConnection(config),
        created_by:existing?.created_by || ctx.userId,updated_at:new Date().toISOString()};
      await ctx.rest('email_accounts',existing?accountQuery(ctx,id):'',existing?'PATCH':'POST',values);
      await ctx.rest('email_account_secrets','on_conflict=account_id','POST',{
        account_id:id,org_id:ctx.orgId,encrypted_credentials:encrypted,legacy_credentials:null,uid_validity:null,last_uid:0,
      },{Prefer:'resolution=merge-duplicates,return=representation'});
      return emailJson(200,{success:true,account_id:id,requires_verification:true});
    }
    if (action==='request_managed') {
      await requireManagedEmailFeature(ctx,ctx.orgId);
      const provider=(await ctx.rest('saas_org_settings','is_billing_provider=eq.true&select=org_id&limit=1'))?.[0];
      const settings=provider?(await ctx.rest('email_platform_settings',`org_id=eq.${provider.org_id}`))?.[0]:null;
      if (!settings?.managed_domain || !settings.managed_enabled) throw new Error('ایمیل ابری هنوز توسط مدیر سامانه راه‌اندازی نشده است.');
      const org=(await ctx.rest('organizations',`id=eq.${ctx.orgId}&select=slug,name`))?.[0];
      const address=managedEmailAddress(org?.slug,body.alias,settings.managed_domain);
      const existing=(await ctx.rest('email_accounts',new URLSearchParams({org_id:`eq.${ctx.orgId}`,address:`eq.${address}`,select:'id,status'}).toString()))?.[0];
      if (existing && existing.status!=='pending') return emailJson(200,{success:true,account_id:existing.id,status:existing.status});
      const account=existing || (await ctx.rest('email_accounts','','POST',{org_id:ctx.orgId,label:String(body.label || 'ایمیل ابری سازمان'),address,mode:'managed',created_by:ctx.userId}))?.[0];
      const provisionUrl=Deno.env.get('EMAIL_MANAGED_PROVISION_URL'); const provisionToken=Deno.env.get('EMAIL_MANAGED_PROVISION_TOKEN');
      if (!provisionUrl || !provisionToken) return emailJson(200,{success:true,account_id:account.id,status:'pending',message:'درخواست ثبت شد؛ ساخت صندوق واقعی در انتظار راه‌اندازی سرویس ابری است.'});
      const response=await fetch(provisionUrl,{method:'POST',headers:{Authorization:`Bearer ${provisionToken}`,'Content-Type':'application/json'},
        body:JSON.stringify({organization_id:ctx.orgId,account_id:account.id,address}),signal:AbortSignal.timeout(25000)});
      const result=await response.json().catch(()=>null);
      if (!response.ok || !result?.smtp || !result?.imap || result.address!==address || result.domain_verified!==true) throw new Error('ساخت صندوق ابری و تأیید دامنه کامل نشد. درخواست ثبت‌شده برای پیگیری باقی مانده است.');
      await verifyEmailSmtp(result.smtp,true);
      await verifyEmailImap(result.imap,true);
      await ctx.rest('email_account_secrets','','POST',{account_id:account.id,org_id:ctx.orgId,encrypted_credentials:await encryptEmailSecret(result)});
      await ctx.rest('email_accounts',accountQuery(ctx,account.id),'PATCH',{status:'ready',is_active:true,receive_enabled:true,connection_config:publicConnection(result)});
      return emailJson(200,{success:true,account_id:account.id,status:'ready'});
    }
    const account=body.account_id?(await ctx.rest('email_accounts',accountQuery(ctx,body.account_id)))?.[0]:null;
    if (!account) throw new Error('حساب ایمیل این سازمان پیدا نشد.');
    if (action==='disable_account') {
      await ctx.rest('email_accounts',accountQuery(ctx,account.id),'PATCH',{is_active:false,is_default:false,status:'disabled'});
      return emailJson(200,{success:true});
    }
    const config=await loadEmailCredentials(ctx,account);
    if (action==='verify_account') {
      await verifyEmailSmtp(config.smtp,account.mode==='managed');
      if (account.receive_enabled) await verifyEmailImap(config.imap,account.mode==='managed');
      await ctx.rest('email_accounts',accountQuery(ctx,account.id),'PATCH',{is_active:true,status:'ready',last_error:null});
      return emailJson(200,{success:true});
    }
    if (action==='sync_account') {
      if (!account.is_active || !account.receive_enabled) throw new Error('دریافت ایمیل برای این صندوق فعال نیست.');
      const now=new Date().toISOString();
      const claimed=await ctx.rest('email_account_secrets',`account_id=eq.${account.id}&org_id=eq.${ctx.orgId}&or=(sync_locked_until.is.null,sync_locked_until.lt.${now})`,'PATCH',
        {sync_locked_until:new Date(Date.now()+120000).toISOString()});
      if (!claimed?.length) throw new Error('این صندوق در حال همگام‌سازی است. کمی بعد دوباره بررسی کنید.');
      try {
        const batch=await readImapEmailBatch(config.imap,claimed[0],account.mode==='managed');
        let imported=0;
        for (const mail of batch.messages) {
          if (mail.oversized) { mail.from=mail.envelope?.from?.[0];mail.to=mail.envelope?.to;mail.subject=mail.envelope?.subject;
            mail.text='اندازهٔ این ایمیل بیشتر از حد دریافت است. متن و پیوست را در صندوق اصلی بررسی کنید.'; }
          await persistInboundEmail(ctx,account,mail,`${batch.uidValidity}:${mail.uid}`); imported++;
        }
        await ctx.rest('email_account_secrets',`account_id=eq.${account.id}&org_id=eq.${ctx.orgId}`,'PATCH',
          {uid_validity:batch.uidValidity,last_uid:batch.lastUid});
        await ctx.rest('email_accounts',accountQuery(ctx,account.id),'PATCH',{last_sync_at:new Date().toISOString(),last_error:null});
        return emailJson(200,{success:true,imported});
      } finally { await ctx.rest('email_account_secrets',`account_id=eq.${account.id}&org_id=eq.${ctx.orgId}`,'PATCH',{sync_locked_until:null}); }
    }
    throw new Error('عملیات ایمیل معتبر نیست.');
  } catch (error) {
    const raw=String(error?.message || '');
    return emailJson(400,{success:false,message:/[آ-ی]/.test(raw)?raw:'عملیات ایمیل انجام نشد. تنظیمات اتصال و دسترسی را بررسی کنید.'});
  }
};
Deno.serve(handleEmailAdmin);
