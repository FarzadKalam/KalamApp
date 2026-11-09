// This endpoint only signs scoped downloads and accepts explicitly opted-in health reports.
// Long-running builds and tenant exports are executed by the separate worker.
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
export async function handleLocalInstallations(request: Request) {
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return json(405, { message: 'روش درخواست مجاز نیست.' });
  try {
    if (Number(request.headers.get('content-length') || 0) > 65536) return json(413, { message: 'حجم درخواست بیش از حد مجاز است.' });
    const bodyText = await request.text();
    if (bodyText.length > 65536) return json(413, { message: 'حجم درخواست بیش از حد مجاز است.' });
    const body = JSON.parse(bodyText);
    const url = Deno.env.get('SUPABASE_URL')!; const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const token = request.headers.get('authorization') || '';
    if (!token.startsWith('Bearer ') || !uuid(body.installation_id)) return json(403, { message: 'دسترسی مجاز نیست.' });
    const rpc = async (name: string, payload: unknown, privileged = false) => {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: {
        apikey: serviceKey, Authorization: privileged ? `Bearer ${serviceKey}` : token, 'Content-Type': 'application/json',
        ...(!privileged && uuid(body.org_id) ? { 'x-client-info': `kalamapp; org=${body.org_id}` } : {}),
      }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error('ACCESS_DENIED');
      return response.json();
    };
    if (body.action === 'download') {
      if (!uuid(body.org_id) || !uuid(body.job_id)) return json(400, { message: 'درخواست دریافت معتبر نیست.' });
      const result = await rpc('admin_local_installation', { p_action: 'download', p_id: body.installation_id, p_payload: { job_id: body.job_id } });
      if (!result.path || typeof result.path !== 'string' || result.path.includes('..') || !result.path.startsWith(`${body.org_id}/${body.installation_id}/`)) return json(409, { message: 'فایل معتبر برای این نصب ثبت نشده است.' });
      const sign = async (path: string) => {
      const response = await fetch(`${url}/storage/v1/object/sign/local-installations-private/${path.split('/').map(encodeURIComponent).join('/')}`, {
        method: 'POST', headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 120 }),
      });
      const signed = await response.json();
      if (!response.ok || !signed.signedURL) throw new Error('ARTIFACT_MISSING');
      const publicUrl = Deno.env.get('API_EXTERNAL_URL') || Deno.env.get('PUBLIC_SITE_URL');
      if (!publicUrl?.startsWith('https://')) throw new Error('PUBLIC_URL_MISSING');
      return `${publicUrl.replace(/\/$/, '')}/storage/v1${signed.signedURL}`;
      };
      const files = [{ title: result.kind === 'prepare' ? 'تنظیمات این نصب' : 'اطلاعات رمزگذاری‌شدهٔ مشتری', url: await sign(result.path) }];
      if (result.kind === 'prepare') {
        const response = await fetch(`${url}/rest/v1/saas_local_releases?id=eq.${result.release_id}&org_id=eq.${body.org_id}&select=artifact_path`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
        const releases = await response.json();
        if (!response.ok || !releases?.[0]?.artifact_path?.startsWith(`${body.org_id}/releases/`)) throw new Error('RELEASE_MISSING');
        files.push({ title: 'بستهٔ کامل مشترک نرم‌افزار', url: await sign(releases[0].artifact_path) });
      }
      return json(200, { files });
    }
    if (body.action === 'receipt') {
      if (!uuid(body.org_id) || !uuid(body.job_id) || typeof body.payload !== 'string' || body.payload.length > 32768 || typeof body.signature !== 'string' || body.signature.length > 4096) throw new Error('INVALID_RECEIPT');
      const authorized = await rpc('admin_local_installation', { p_action: 'authorize_receipt', p_id: body.installation_id, p_payload: { job_id: body.job_id } });
      const decode = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
      const pem = String(authorized.public_key || '').replace(/-----[^-]+-----|\s/g, '');
      const key = await crypto.subtle.importKey('spki', decode(pem), { name: 'RSA-PSS', hash: 'SHA-256' }, false, ['verify']);
      const payload = decode(body.payload);
      if (!await crypto.subtle.verify({ name: 'RSA-PSS', saltLength: 32 }, key, decode(body.signature), payload)) throw new Error('INVALID_SIGNATURE');
      const receipt = JSON.parse(new TextDecoder().decode(payload));
      if (receipt.format !== 'kalamapp-restore-receipt-v1') throw new Error('INVALID_FORMAT');
      await rpc('worker_local_installation', { p_action: 'restore_receipt', p_id: authorized.job_id, p_payload: { receipt, actor: authorized.actor } }, true);
      return json(200, { success: true });
    }
    if (body.action === 'report') {
      await rpc('receive_local_installation_report', { p_id: body.installation_id, p_token: token.slice(7), p_report: body.report }, true);
      return json(200, { success: true });
    }
    return json(400, { message: 'عملیات معتبر نیست.' });
  } catch { return json(403, { message: 'درخواست مجاز نیست یا اطلاعات نصب معتبر نیست.' }); }
}
if (import.meta.main) Deno.serve(handleLocalInstallations);
