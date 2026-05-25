// @ts-nocheck
// send-email: ارسال ایمیل از طریق SMTP
// تنظیمات از integration_settings با connection_type = 'email' خوانده می‌شود.

const FUNCTION_BUILD = 'send-email-2026-05-26-01';

// ── Types ──────────────────────────────────────────────────────────────────────

type SmtpSettings = {
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  from_email?: string;
  from_name?: string;
  secure_tls?: boolean;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const svcHeaders = (key: string) => ({
  apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json',
});

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

// RFC 2047: encode non-ASCII header value
function mimeEncode(str: string): string {
  if (!str) return '';
  if (/^[\x20-\x7E]*$/.test(str)) return str;
  return `=?utf-8?B?${encodeBase64(str)}?=`;
}

function buildEmailMessage(from: string, to: string[], subject: string, textBody: string): string {
  const fromEncoded = mimeEncode(from);
  const subjectEncoded = mimeEncode(subject);
  const boundary = `boundary_${Date.now()}`;
  const date = new Date().toUTCString();

  const htmlBody = textBody
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
    .replace(/\n/g, '<br>\n');

  const textBodyB64 = encodeBase64(textBody);
  const htmlBodyB64 = encodeBase64(`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right">${htmlBody}</body></html>`);

  return [
    `From: ${fromEncoded}`,
    `To: ${to.join(', ')}`,
    `Subject: ${subjectEncoded}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    '',
    textBodyB64,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=utf-8`,
    `Content-Transfer-Encoding: base64`,
    '',
    htmlBodyB64,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

// ── SMTP client ────────────────────────────────────────────────────────────────

async function readSmtpResponse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SMTP responses end with CRLF; multi-line responses end with "NNN text\r\n"
    // A single-line response: "NNN text\r\n". Multi-line: "NNN-text\r\n" ... "NNN text\r\n"
    const lines = buf.split('\r\n');
    const lastComplete = lines[lines.length - 1] === '' ? lines[lines.length - 2] : null;
    if (lastComplete && /^\d{3} /.test(lastComplete)) break;
    if (lastComplete && /^\d{3}$/.test(lastComplete)) break;
    if (buf.includes('\r\n') && /^\d{3} /.test(buf)) break;
  }
  return buf.trim();
}

async function writeSmtp(writer: WritableStreamDefaultWriter<Uint8Array>, line: string): Promise<void> {
  await writer.write(new TextEncoder().encode(line + '\r\n'));
}

function assertSmtpCode(response: string, expected: number, cmd: string): void {
  const code = parseInt(response.substring(0, 3), 10);
  if (code !== expected) {
    throw new Error(`SMTP ${cmd} failed (expected ${expected}, got ${code}): ${response}`);
  }
}

async function sendViaSmtp(settings: SmtpSettings, to: string[], message: string): Promise<void> {
  const hostname = String(settings.host || '').trim();
  const port = parseInt(String(settings.port || 587), 10) || 587;
  const username = String(settings.username || '').trim();
  const password = String(settings.password || '').trim();
  const secureTls = settings.secure_tls !== false;

  if (!hostname) throw new Error('SMTP host تنظیم نشده است');
  if (!to.length) throw new Error('گیرنده ایمیل مشخص نشده است');

  const isImplicitTls = port === 465;

  let conn: Deno.TcpConn | Deno.TlsConn;

  if (isImplicitTls) {
    conn = await Deno.connectTls({ hostname, port });
  } else {
    conn = await Deno.connect({ hostname, port });
  }

  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();

  try {
    // 220 greeting
    const greeting = await readSmtpResponse(reader);
    assertSmtpCode(greeting, 220, 'GREETING');

    // EHLO
    await writeSmtp(writer, `EHLO kalam.app`);
    const ehlo1 = await readSmtpResponse(reader);
    assertSmtpCode(ehlo1, 250, 'EHLO');

    // STARTTLS if needed (port 587)
    if (!isImplicitTls && secureTls) {
      await writeSmtp(writer, 'STARTTLS');
      const startTls = await readSmtpResponse(reader);
      assertSmtpCode(startTls, 220, 'STARTTLS');

      // Release reader/writer before upgrading
      reader.releaseLock();
      writer.releaseLock();

      conn = await Deno.startTls(conn as Deno.TcpConn, { hostname });
      const tlsReader = conn.readable.getReader();
      const tlsWriter = conn.writable.getWriter();

      // EHLO again after TLS
      await writeSmtp(tlsWriter, `EHLO kalam.app`);
      const ehlo2 = await readSmtpResponse(tlsReader);
      assertSmtpCode(ehlo2, 250, 'EHLO after TLS');

      // AUTH LOGIN
      if (username && password) {
        await writeSmtp(tlsWriter, 'AUTH LOGIN');
        const authReq = await readSmtpResponse(tlsReader);
        assertSmtpCode(authReq, 334, 'AUTH LOGIN');

        await writeSmtp(tlsWriter, btoa(username));
        const userReq = await readSmtpResponse(tlsReader);
        assertSmtpCode(userReq, 334, 'AUTH USERNAME');

        await writeSmtp(tlsWriter, btoa(password));
        const passResp = await readSmtpResponse(tlsReader);
        assertSmtpCode(passResp, 235, 'AUTH PASSWORD');
      }

      // MAIL FROM
      const fromEmail = String(settings.from_email || '').trim();
      await writeSmtp(tlsWriter, `MAIL FROM:<${fromEmail}>`);
      const mailFrom = await readSmtpResponse(tlsReader);
      assertSmtpCode(mailFrom, 250, 'MAIL FROM');

      // RCPT TO
      for (const recipient of to) {
        await writeSmtp(tlsWriter, `RCPT TO:<${recipient}>`);
        const rcpt = await readSmtpResponse(tlsReader);
        assertSmtpCode(rcpt, 250, `RCPT TO ${recipient}`);
      }

      // DATA
      await writeSmtp(tlsWriter, 'DATA');
      const dataResp = await readSmtpResponse(tlsReader);
      assertSmtpCode(dataResp, 354, 'DATA');

      // Message body — dot-stuffing: lines starting with "." get an extra "."
      const stuffed = message.split('\r\n').map((l) => l.startsWith('.') ? '.' + l : l).join('\r\n');
      await writeSmtp(tlsWriter, stuffed + '\r\n.');
      const dataEnd = await readSmtpResponse(tlsReader);
      assertSmtpCode(dataEnd, 250, 'DATA END');

      // QUIT
      await writeSmtp(tlsWriter, 'QUIT');

      tlsReader.releaseLock();
      tlsWriter.releaseLock();
      return;
    }

    // No STARTTLS (plain or already TLS) — AUTH LOGIN
    if (username && password) {
      await writeSmtp(writer, 'AUTH LOGIN');
      const authReq = await readSmtpResponse(reader);
      assertSmtpCode(authReq, 334, 'AUTH LOGIN');

      await writeSmtp(writer, btoa(username));
      const userReq = await readSmtpResponse(reader);
      assertSmtpCode(userReq, 334, 'AUTH USERNAME');

      await writeSmtp(writer, btoa(password));
      const passResp = await readSmtpResponse(reader);
      assertSmtpCode(passResp, 235, 'AUTH PASSWORD');
    }

    const fromEmail = String(settings.from_email || '').trim();
    await writeSmtp(writer, `MAIL FROM:<${fromEmail}>`);
    assertSmtpCode(await readSmtpResponse(reader), 250, 'MAIL FROM');

    for (const recipient of to) {
      await writeSmtp(writer, `RCPT TO:<${recipient}>`);
      assertSmtpCode(await readSmtpResponse(reader), 250, `RCPT TO ${recipient}`);
    }

    await writeSmtp(writer, 'DATA');
    assertSmtpCode(await readSmtpResponse(reader), 354, 'DATA');

    const stuffed = message.split('\r\n').map((l) => l.startsWith('.') ? '.' + l : l).join('\r\n');
    await writeSmtp(writer, stuffed + '\r\n.');
    assertSmtpCode(await readSmtpResponse(reader), 250, 'DATA END');

    await writeSmtp(writer, 'QUIT');
  } finally {
    try { reader.releaseLock(); } catch {}
    try { writer.releaseLock(); } catch {}
    try { conn.close(); } catch {}
  }
}

// ── Settings resolution ────────────────────────────────────────────────────────

async function getSmtpSettings(supabaseUrl: string, serviceKey: string, orgId: string, override?: SmtpSettings | null): Promise<SmtpSettings> {
  if (override && typeof override === 'object' && override.host) return override;

  const url = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/integration_settings?org_id=eq.${orgId}&connection_type=eq.email&is_active=eq.true&limit=1`;
  const r = await fetch(url, { method: 'GET', headers: svcHeaders(serviceKey) });
  if (!r.ok) throw new Error('خطا در خواندن تنظیمات ایمیل');
  const rows = await r.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.settings?.host) throw new Error('تنظیمات SMTP برای این سازمان فعال نیست.');
  return row.settings as SmtpSettings;
}

async function getOrgIdFromToken(supabaseUrl: string, serviceKey: string, userToken: string): Promise<string | null> {
  // Get user's profile to determine org_id
  const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/profiles?select=org_id&limit=1`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${userToken}` },
  });
  if (!r.ok) return null;
  const rows = await r.json();
  return String(rows?.[0]?.org_id || '').trim() || null;
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'Method Not Allowed' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return json(500, { success: false, message: 'Missing env vars' });

  const authHeader = req.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return json(401, { success: false, message: 'Unauthorized' });
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  const isServiceRole = token === serviceKey;

  let body: any;
  try { body = await req.json(); } catch { return json(400, { success: false, message: 'Invalid JSON' }); }

  try {
    // Resolve org_id
    let orgId = String(body?.org_id || '').trim();
    if (!isServiceRole) {
      // Verify user token and get org_id
      const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return json(401, { success: false, message: 'Unauthorized' });
      const user = await r.json();
      if (!user?.id) return json(401, { success: false, message: 'Unauthorized' });
      if (!orgId) {
        orgId = await getOrgIdFromToken(supabaseUrl, serviceKey, token) || '';
      }
    }
    if (!orgId) return json(400, { success: false, message: 'org_id الزامی است' });

    const to: string[] = (Array.isArray(body?.to) ? body.to : [])
      .map((v: any) => String(v || '').trim())
      .filter(isValidEmail);
    const subject = String(body?.subject || '').trim();
    const textBody = String(body?.body || body?.text || '').trim();

    if (to.length === 0) return json(400, { success: false, message: 'آدرس گیرنده معتبر نیست' });
    if (!subject && !textBody) return json(400, { success: false, message: 'موضوع یا متن ایمیل الزامی است' });

    const settings = await getSmtpSettings(supabaseUrl, serviceKey, orgId, body?.overrideSettings);
    const fromEmail = String(settings.from_email || settings.username || '').trim();
    const fromName = String(settings.from_name || '').trim();
    const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

    const message = buildEmailMessage(from, to, subject, textBody);
    await sendViaSmtp(settings, to, message);

    console.log(`[send-email] build=${FUNCTION_BUILD} org=${orgId} to=${to.length} subject="${subject.substring(0, 40)}"`);
    return json(200, { success: true, sent: to.length });
  } catch (e: any) {
    const msg = String(e?.message || 'خطا در ارسال ایمیل');
    console.error('[send-email] error', msg);
    return json(400, { success: false, message: msg });
  }
});
