// @ts-nocheck
import nodemailer from 'npm:nodemailer@10.3.1';
import { ImapFlow } from 'npm:imapflow@2.10.0';
import { simpleParser } from 'npm:mailparser@3.14.1';
import { Buffer } from 'node:buffer';

const privateAddress = (value: string) => /^(?:127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(value)
  || /^(?:100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|192\.0\.|192\.0\.2\.|198\.(?:1[89]|51)\.|203\.0\.113\.|22[4-9]\.|2[3-5]\d\.)/.test(value)
  || /^(?:::|f[cd]|fe[89ab]|ff|2001:db8)/i.test(value);
export const validateEmailHost = async (host: string, trusted = false) => {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized || /[\s\/@\\#?]/.test(normalized)) throw new Error('آدرس سرور ایمیل معتبر نیست.');
  const allowed = (Deno.env.get('EMAIL_ALLOWED_INTERNAL_HOSTS') || '').split(',').map(value => value.trim().toLowerCase());
  if (trusted || allowed.includes(normalized)) return { host:normalized,servername:normalized };
  if (normalized === 'localhost' || privateAddress(normalized) || !normalized.includes('.')) throw new Error('این سرور برای اتصال ایمیل مجاز نیست.');
  const addresses = [...await Deno.resolveDns(normalized,'A').catch(() => []), ...await Deno.resolveDns(normalized,'AAAA').catch(() => [])];
  if (!addresses.length || addresses.some(privateAddress)) throw new Error('آدرس عمومی سرور ایمیل تأیید نشد.');
  // Pin the validated address: the transport must not resolve the hostname a second time.
  return {host:addresses[0],servername:normalized};
};
export const createEmailSmtp = async (settings: any, trusted = false) => {
  const {host,servername} = await validateEmailHost(settings.host, trusted);
  const port = Number(settings.port || 587);
  if (![465,587].includes(port) && !trusted) throw new Error('برای ارسال امن، پورت ۴۶۵ یا ۵۸۷ را انتخاب کنید.');
  return nodemailer.createTransport({
    host,port,secure:port===465,requireTLS:true,
    auth:{ user:settings.username, pass:settings.password },
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false,
    tls:{ rejectUnauthorized:true,minVersion:'TLSv1.2',servername },
  });
};
export const sendSmtpEmail = async (settings: any, message: any, trusted = false) => {
  const transport = await createEmailSmtp(settings,trusted);
  try {
    const result = await transport.sendMail({
      ...message,
      attachments:(message.attachments || []).map((file: any) => ({
        filename:String(file.name).replace(/[\r\n]/g,''),content:Buffer.from(file.content_base64,'base64'),contentType:file.mime_type || 'application/octet-stream',
      })),
      disableFileAccess:true,disableUrlAccess:true,
    });
    if (!result.accepted?.length) throw new Error('سرور ایمیل هیچ گیرنده‌ای را نپذیرفت.');
    return { messageId:result.messageId,accepted:result.accepted,rejected:result.rejected || [] };
  } finally { transport.close(); }
};
export const verifyEmailSmtp = async (settings: any, trusted = false) => {
  const transport = await createEmailSmtp(settings,trusted);
  try { await transport.verify(); } finally { transport.close(); }
};

export const createEmailImap = async (settings: any,trusted=false) => {
  const {host,servername} = await validateEmailHost(settings.host,trusted);
  if (!trusted && Number(settings.port || 993)!==993) throw new Error('برای دریافت امن، پورت ۹۹۳ را انتخاب کنید.');
  return new ImapFlow({ host,port:Number(settings.port || 993),secure:true,
    auth:{ user:settings.username,pass:settings.password },logger:false,
    connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000,
    tls:{rejectUnauthorized:true,minVersion:'TLSv1.2',servername},disableAutoIdle:true });
};
export const verifyEmailImap = async (settings: any,trusted=false) => {
  const client=await createEmailImap(settings,trusted);
  try { await client.connect(); const lock=await client.getMailboxLock(settings.mailbox || 'INBOX',{readOnly:true});lock.release(); }
  finally { await client.logout().catch(()=>client.close()); }
};
export const readImapEmailBatch = async (settings: any, cursor: { uid_validity?: string;last_uid?: number }, trusted = false) => {
  const client=await createEmailImap(settings,trusted);
  try { await client.connect(); } catch(error) { client.close();throw error; }
  const lock = await client.getMailboxLock(settings.mailbox || 'INBOX',{readOnly:true});
  try {
    const validity = String(client.mailbox.uidValidity);
    const last = cursor.uid_validity === validity ? Number(cursor.last_uid || 0) : 0;
    const next = Number(client.mailbox.uidNext || 1);
    if (last >= next-1) return { messages:[],uidValidity:validity,lastUid:last };
    // Bound both the fetch range and source size; never download the entire mailbox.
    const start = last || Math.max(0,next-41);
    const end = Math.min(next-1,start+40);
    const metadata = await client.fetchAll(`${start+1}:${end}`,{uid:true,size:true,envelope:true},{uid:true});
    const messages = [];
    for (const row of metadata) {
      if (row.size > 12*1024*1024) {
        messages.push({uid:row.uid,oversized:true,envelope:row.envelope}); continue;
      }
      const raw = await client.fetchOne(String(row.uid),{uid:true,source:true},{uid:true});
      if (!raw?.source) throw new Error('متن یکی از ایمیل‌ها دریافت نشد؛ همگام‌سازی دوباره قابل انجام است.');
      const mail = await simpleParser(raw.source,{skipHtmlToText:false,skipImageLinks:true});
      messages.push({uid:row.uid,messageId:mail.messageId,inReplyTo:mail.inReplyTo,
        references:Array.isArray(mail.references)?mail.references:mail.references?[mail.references]:[],
        from:mail.from?.value?.[0],to:mail.to?.value || [],cc:mail.cc?.value || [],
        subject:mail.subject || '',text:mail.text || '',date:mail.date,
        attachments:(mail.attachments || []).map(file => ({name:file.filename || 'پیوست',mime_type:file.contentType,
          content_base64:file.content.toString('base64'),size:file.size})),
      });
    }
    return {messages,uidValidity:validity,lastUid:end};
  } finally { lock.release(); await client.logout().catch(()=>client.close()); }
};
