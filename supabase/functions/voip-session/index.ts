// @ts-nocheck
import {resolveVoipPolicy,resolveExternalWebphone,normalizeWssUrl,normalizeSipDomain} from '../_shared/voip-connection-policy.ts';
import {loadVoipOrganizationContext} from '../_shared/voip-organization-context.ts';
import { loadOrgPlanAccess } from '../_shared/org-plan-access.ts';
import { dialPhone } from '../_shared/phone-number.ts';
import {normalizeVoipProviderKey} from '../_shared/voip-providers.ts';
import {resolveVoipRouteStrategy,selectVoipRoute,normalizeProviderSipServer} from '../_shared/voip-route-strategy.ts';
import {prepareProviderBridge} from '../_shared/voip-provider-bridge.ts';
import {searchVoipOperators,normalizeDialExtension,validDialExtension} from '../_shared/voip-directory.ts';

const FUNCTION_BUILD = 'voip-session-2026-11-17-dial-directory';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, x-organization-id, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, payload: Record<string, any>) =>
  new Response(JSON.stringify({ build: FUNCTION_BUILD, ...payload }), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
      'X-Kalam-Function-Build': FUNCTION_BUILD,
    },
  });

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const parseJsonSafe = (raw: string) => {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const serviceHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});

const verifyUserToken = async (supabaseUrl: string, serviceRoleKey: string, userToken: string) => {
  const response = await fetch(`${trimTrailingSlash(supabaseUrl)}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${userToken}` },
  });
  const raw = await response.text();
  if (!response.ok) throw new Error('نشست کاربر معتبر نیست.');
  const user = parseJsonSafe(raw);
  if (!user?.id) throw new Error('نشست کاربر معتبر نیست.');
  return user;
};

const restSelect = async (
  supabaseUrl: string,
  serviceRoleKey: string,
  table: string,
  params: Record<string, string>,
) => {
  const url = new URL(`${trimTrailingSlash(supabaseUrl)}/rest/v1/${table}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: serviceHeaders(serviceRoleKey) });
  const raw = await res.text();
  if (!res.ok) throw new Error(raw || `خواندن ${table} ناموفق بود.`);
  const rows = parseJsonSafe(raw);
  return Array.isArray(rows) ? rows : [];
};

const canManageOrgVoipSettings = (permissions: Record<string, any> | null | undefined) => {
  const perms = permissions && typeof permissions === 'object' ? permissions : {};
  if (perms.__settings_tabs?.edit === true) return true;
  return perms.profiles?.edit === true;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { success: false, message: 'روش درخواست معتبر نیست.' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { success: false, message: 'تنظیمات سرور کامل نیست.' });
  }

  try {
    const authHeader = String(req.headers.get('Authorization') || '');
    const userToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!userToken) return json(401, { success: false, message: 'نشست کاربر ارسال نشده است.' });

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || 'get_webphone_session').trim();

    const user = await verifyUserToken(supabaseUrl, serviceRoleKey, userToken);
    const profiles = await restSelect(supabaseUrl, serviceRoleKey, 'profiles', {
      id: `eq.${user.id}`,
      select: 'id,org_id,role_id,full_name,voip_enabled,voip_extension,voip_operator_code,voip_service_id,voip_dial_mode',
      limit: '1',
    });
    const context=await loadVoipOrganizationContext(req,supabaseUrl,serviceRoleKey,userToken);
    const profile = profiles[0] ? {...profiles[0],...context.settings,org_id:context.org_id,role_id:context.role_id} : null;
    if (!profile?.id || !profile?.org_id) {
      return json(403, { success: false, message: 'پروفایل سازمانی کاربر مشخص نیست.' });
    }

    const orgId = String(profile.org_id);
    const roles = profile.role_id
      ? await restSelect(supabaseUrl, serviceRoleKey, 'org_roles', {
          id: `eq.${profile.role_id}`,
          org_id: `eq.${orgId}`,
          select: 'id,permissions',
          limit: '1',
        })
      : [];
    const permissions = context.permissions || {};
    const isAdmin = canManageOrgVoipSettings(permissions);

    const planAccess = await loadOrgPlanAccess(trimTrailingSlash(supabaseUrl), serviceRoleKey, orgId);
    const webphonePlanEnabled = Boolean(
      planAccess?.available &&
        (planAccess?.features?.voip_webphone === true || planAccess?.reason === 'internal_organization'),
    );

    const voipSettingsRows = await restSelect(supabaseUrl, serviceRoleKey, 'integration_settings', {
      org_id: `eq.${orgId}`,
      connection_type: 'eq.voip',
      select: 'id,provider,settings,is_active',
      limit: '5',
    });
    const activeSettingRow = voipSettingsRows.find((r) => r?.is_active !== false) || voipSettingsRows[0] || null;
    const settings = (activeSettingRow?.settings && typeof activeSettingRow.settings === 'object')
      ? activeSettingRow.settings
      : {};

    const policy=resolveVoipPolicy(settings,activeSettingRow?.provider);
    const disabledReason=activeSettingRow?.is_active!==true ? 'organization_disabled'
      :policy.development?'under_development':!policy.canUseBrowser?'reports_only'
      :!webphonePlanEnabled?'plan_disabled':profile.voip_enabled!==true?'user_disabled':null;
    const messages={organization_disabled:'اتصال تلفن سازمان فعال نیست.',under_development:'مرکز تلفن ابری تازه‌سیستم در حال توسعه است.',reports_only:'حالت سازمان فقط گزارشات تماس است؛ مکالمهٔ داخل تازه‌سیستم فعال نیست.',plan_disabled:'مکالمهٔ داخل تازه‌سیستم در پلن سازمان فعال نیست.',user_disabled:'مکالمه برای این کاربر فعال نیست.'};
    if(action==='get_connection_policy') return json(200,{success:true,...policy,enabled:!disabledReason,reason:disabledReason,message:messages[disabledReason]||null,provider:activeSettingRow?.provider||null});

    if(action==='search_directory'){
      if(disabledReason)return json(403,{success:false,message:messages[disabledReason]});
      const offset=Number(body.offset||0);
      if(!Number.isSafeInteger(offset)||offset<0||offset>2147483647)return json(400,{success:false,message:'شمارهٔ صفحه معتبر نیست.'});
      const result=await searchVoipOperators((table,params)=>restSelect(supabaseUrl,serviceRoleKey,table,params),orgId,body.query,offset);
      return json(200,{success:true,...result});
    }

    if(action==='get_webphone_session'){
      if(disabledReason)return json(200,{success:true,enabled:false,reason:disabledReason,message:messages[disabledReason]});
      const accounts=await restSelect(supabaseUrl,serviceRoleKey,'voip_external_accounts',{
        org_id:`eq.${orgId}`,assignee_profile_id:`eq.${profile.id}`,is_active:'eq.true',
        select:'id,extension,display_name,sip_secret,metadata',limit:'1',
      });
      const account=accounts[0];
      if(!account)return json(200,{success:true,enabled:false,reason:'no_external_account',message:'حساب اپراتور سرویس‌دهنده برای شما تنظیم نشده است.'});
      const connection=resolveExternalWebphone(settings,account);
      const strategy=resolveVoipRouteStrategy(account.metadata?.connection_strategy||settings.connection_strategy);
      const leases=await restSelect(supabaseUrl,serviceRoleKey,'voip_provider_bridges',{
        org_id:`eq.${orgId}`,account_id:`eq.${account.id}`,lease_until:`gt.${new Date().toISOString()}`,select:'id',limit:'1'});
      const route=selectVoipRoute({strategy,wssUrl:connection.wssUrl,requestGateway:body.route==='gateway',gatewayLeaseActive:leases.length>0});
      if(route==='gateway')return json(200,{...await prepareProviderBridge({url:supabaseUrl,key:serviceRoleKey,orgId,userId:profile.id,account,
        displayName:account.display_name||profile.full_name||account.extension,env:name=>Deno.env.get(name)}),strategy,provider:activeSettingRow.provider});
      if(connection.reason)return json(200,{success:true,enabled:false,reason:connection.reason,message:connection.reason==='missing_verified_wss'?'آدرس کامل WSS سرویس‌دهنده مشخص نیست؛ اطلاعات PortSIP به‌تنهایی کافی نیست.':connection.reason==='missing_sip_domain'?'دامنه SIP حساب سرویس‌دهنده مشخص نیست.':'نام کاربری یا رمز حساب سرویس‌دهنده کامل نیست.'});
      let iceServers=[];
      try {const parsed=JSON.parse(settings.ice_servers_json||'[]');if(Array.isArray(parsed))iceServers=parsed.filter(item=>item&&item.urls);}catch{}
      return json(200,{success:true,enabled:true,route:'direct',strategy,dialMode:'webphone_webrtc',provider:activeSettingRow.provider,
        wssUrl:connection.wssUrl,sipDomain:connection.sipDomain,iceServers,
        endpoint:{extension:account.extension,displayName:account.display_name||profile.full_name||account.extension,
          authUsername:connection.username,pjsipId:connection.username,
          sipUri:`sip:${connection.sipUser}@${connection.sipDomain}`,sipSecret:account.sip_secret,transport:'wss'}});
    }

    if (action === 'log_webrtc_call') {
      if(disabledReason)return json(403,{success:false,message:messages[disabledReason]});
      if (profile.voip_enabled !== true) {
        return json(403, { success: false, message: 'VoIP برای این کاربر فعال نیست.' });
      }
      const callId = String(body?.callId || body?.call_id || '').trim();
      if (!callId) return json(400, { success: false, message: 'شناسه تماس مشخص نیست.' });
      const direction = ['incoming', 'outgoing', 'internal'].includes(String(body?.direction || ''))
        ? String(body.direction)
        : 'outgoing';
      const status = ['ringing', 'answered', 'missed', 'failed', 'completed'].includes(String(body?.status || ''))
        ? String(body.status)
        : 'ringing';
      const provider = normalizeVoipProviderKey(activeSettingRow?.provider || 'kalamapp_cloud_pbx');
      const sourceNumber = dialPhone(body?.sourceNumber || body?.source_number || profile.voip_extension || '') || String(body?.sourceNumber || '');
      const destinationNumber = dialPhone(body?.destinationNumber || body?.destination_number || '') || String(body?.destinationNumber || '');
      const extension = String(body?.extension || profile.voip_extension || '').trim() || null;

      const existing = await restSelect(supabaseUrl, serviceRoleKey, 'voip_call_logs', {
        org_id: `eq.${orgId}`,
        provider: `eq.${provider}`,
        call_id: `eq.${callId}`,
        select: 'id,started_at,metadata,related_module_id,related_record_id',
        limit: '1',
      });

      const nowIso = new Date().toISOString();
      const rowPayload: Record<string, any> = {
        org_id: orgId,
        provider,
        call_id: callId,
        direction,
        status,
        source_number: sourceNumber || null,
        destination_number: destinationNumber || null,
        extension,
        operator_code: profile.voip_operator_code || null,
        related_module_id: body?.moduleId || existing[0]?.related_module_id || null,
        related_record_id: body?.recordId || existing[0]?.related_record_id || null,
        assignee_id: profile.id,
        title: (direction === 'incoming' ? sourceNumber : destinationNumber) || 'تماس تحت وب',
        metadata: {
          ...(existing[0]?.metadata && typeof existing[0].metadata === 'object' ? existing[0].metadata : {}),
          webrtc: true,
          build: FUNCTION_BUILD,
        },
      };
      if (status === 'ringing' && !existing[0]?.started_at) rowPayload.started_at = nowIso;
      if (['completed', 'missed', 'failed'].includes(status)) rowPayload.ended_at = nowIso;
      if (Number.isFinite(Number(body?.talkSeconds))) {
        rowPayload.talk_seconds = Math.max(0, Math.floor(Number(body.talkSeconds)));
      }

      const targetUrl = existing[0]?.id
        ? `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs?id=eq.${existing[0].id}`
        : `${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_call_logs`;
      const res = await fetch(targetUrl, {
        method: existing[0]?.id ? 'PATCH' : 'POST',
        headers: { ...serviceHeaders(serviceRoleKey), Prefer: 'return=representation' },
        body: JSON.stringify(rowPayload),
      });
      const raw = await res.text();
      if (!res.ok) throw new Error(raw || 'ثبت گزارش تماس WebRTC ناموفق بود.');
      const saved = parseJsonSafe(raw);
      return json(200, { success: true, callLog: Array.isArray(saved) ? saved[0] : saved });
    }

    if(!isAdmin)return json(403,{success:false,message:'مدیریت حساب تلفن نیازمند دسترسی ویرایش کاربران یا تنظیمات سازمان است.'});
    if(action==='list_trunks'||action==='list_endpoints')return json(200,{success:true,trunks:[],endpoints:[],message:'مدیریت مرکز تلفن تازه‌سیستم در حال توسعه است.'});
    if(action==='get_user_endpoint'){
      if(!policy.canUseBrowser||!webphonePlanEnabled)return json(200,{success:true,endpoint:null});
      const rows=await restSelect(supabaseUrl,serviceRoleKey,'voip_external_accounts',{
        org_id:`eq.${orgId}`,assignee_profile_id:`eq.${String(body.userId||body.profileId||user.id)}`,
        select:'id,extension,display_name,metadata,is_active',limit:'1'});
      return json(200,{success:true,endpoint:rows[0]||null});
    }
    if(action==='upsert_endpoint'){
      if(!policy.canUseBrowser||!webphonePlanEnabled||activeSettingRow?.is_active!==true)return json(403,{success:false,message:'ورود حساب اپراتور فقط در حالت مکالمه با سرویس‌دهندهٔ دیگر و پلن مجاز فعال است.'});
      const ep=body.endpoint||{};
      let previous=null;
      if(ep.id){
        const rows=await restSelect(supabaseUrl,serviceRoleKey,'voip_external_accounts',{id:`eq.${String(ep.id)}`,org_id:`eq.${orgId}`,select:'id,assignee_profile_id,extension,display_name,metadata,is_active',limit:'1'});
        previous=rows[0];if(!previous)return json(404,{success:false,message:'حساب اپراتور در این سازمان پیدا نشد.'});
      }
      const target=String(ep.assignee_profile_id||previous?.assignee_profile_id||'');
      const members=await restSelect(supabaseUrl,serviceRoleKey,'user_organization_memberships',{
        org_id:`eq.${orgId}`,user_id:`eq.${target}`,is_active:'eq.true',select:'user_id',limit:'1'});
      if(!members.length)return json(403,{success:false,message:'اپراتور باید عضو فعال همین سازمان باشد.'});
      if(!previous){const rows=await restSelect(supabaseUrl,serviceRoleKey,'voip_external_accounts',{org_id:`eq.${orgId}`,assignee_profile_id:`eq.${target}`,select:'id,assignee_profile_id,extension,display_name,metadata,is_active',limit:'1'});previous=rows[0]||null;}
      if(previous&&previous.assignee_profile_id!==target)return json(403,{success:false,message:'تغییر مالک حساب اپراتور مجاز نیست.'});
      const extension=String(ep.extension||previous?.extension||'').trim();
      if(!extension||/[\s@<>;]/.test(extension))return json(400,{success:false,message:'نام کاربری یا داخلی SIP معتبر نیست.'});
      const metadata={...(previous?.metadata||{}),...(ep.metadata||{})};
      if(ep.metadata&&Object.hasOwn(ep.metadata,'dial_extension')){
        metadata.dial_extension=normalizeDialExtension(ep.metadata.dial_extension);
        if(metadata.dial_extension&&!validDialExtension(metadata.dial_extension))return json(400,{success:false,message:'داخلی قابل شماره‌گیری باید فقط شامل عدد، ستاره یا مربع باشد.'});
      }
      if(metadata.server_url&&!normalizeProviderSipServer(metadata.server_url))return json(400,{success:false,message:'سرور SIP را به صورت دامنه یا دامنه:پورت وارد کنید.'});
      if(metadata.sip_port&&(!Number.isInteger(Number(metadata.sip_port))||Number(metadata.sip_port)<1||Number(metadata.sip_port)>65535))return json(400,{success:false,message:'پورت SIP باید بین ۱ تا ۶۵۵۳۵ باشد.'});
      if(metadata.sip_transport&&!['udp','tcp'].includes(metadata.sip_transport))return json(400,{success:false,message:'نوع اتصال SIP باید UDP یا TCP باشد.'});
      for(const [key,validate] of [['wss_url',normalizeWssUrl],['sip_domain',normalizeSipDomain]]){
        if(ep.metadata?.[key]&&!validate(ep.metadata[key]))return json(400,{success:false,message:key==='wss_url'?'آدرس کامل و امن WSS لازم است؛ آدرس SIP را جای آن وارد نکنید.':'دامنه SIP معتبر نیست.'});
      }
      const secret=String(ep.sip_secret||'').trim();
      if(!previous&&!secret)return json(400,{success:false,message:'رمز حساب موجود سرویس‌دهنده را وارد کنید؛ رمز خودکار ساخته نمی‌شود.'});
      const payload={org_id:orgId,assignee_profile_id:target,extension,display_name:String(ep.display_name||previous?.display_name||extension),
        is_active:ep.is_active!==false,metadata,updated_at:new Date().toISOString(),...(secret?{sip_secret:secret}:{})};
      const targetUrl=previous?`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_external_accounts?id=eq.${previous.id}&org_id=eq.${orgId}`:`${trimTrailingSlash(supabaseUrl)}/rest/v1/voip_external_accounts`;
      const response=await fetch(targetUrl,{method:previous?'PATCH':'POST',headers:{...serviceHeaders(serviceRoleKey),Prefer:'return=representation'},body:JSON.stringify(payload)});
      const saved=await response.json().catch(()=>null);
      if(!response.ok||!Array.isArray(saved)||!saved[0])throw new Error('ذخیره حساب اپراتور سرویس‌دهنده ناموفق بود.');
      const {sip_secret:_secret,...safe}=saved[0];
      return json(200,{success:true,endpoint:safe,message:'اطلاعات حساب موجود سرویس‌دهنده ذخیره شد؛ وضعیت اتصال صوت باید جدا آزمایش شود.'});
    }
    return json(400,{success:false,message:'این عملیات در مسیر انتخاب‌شده فعال نیست؛ مرکز تلفن ابری تازه‌سیستم در حال توسعه است.'});
  }catch(error){
    console.error('[voip-session] request failed');
    return json(500,{success:false,message:'دریافت یا ذخیره تنظیمات تلفن ناموفق بود. عضویت سازمان و کامل‌بودن تنظیمات را بررسی کنید.'});
  }
});
