// Unified VoIP provider definitions, capabilities, webhook payload normalizers,
// and TURN ephemeral credential helpers shared across Edge Functions & tests.

export type VoipProviderKey =
  | 'telefonchy'
  | 'simotel'
  | 'novatel'
  | 'alovoip'
  | 'issabel'
  | 'daftareshoma'
  | 'asiatech'
  | 'shatel'
  | 'pishgaman'
  | 'respina'
  | 'tci'
  | 'sip_trunk'
  | 'kalamapp_cloud_pbx';

export type VoipProviderCapabilities = {
  key: VoipProviderKey;
  labelFa: string;
  category: 'cloud_pbx' | 'on_prem_pbx' | 'fcp_trunk' | 'kalamapp_pbx';
  supportsWebrtcGateway: boolean;
  supportsSipTrunk: boolean;
  supportsClickToCallApi: boolean;
  supportsRealtimeEvents: boolean;
  defaultSipPort: number;
  defaultBaseUrl: string;
  notesFa: string;
};

export const VOIP_PROVIDER_CATALOG: Record<VoipProviderKey, VoipProviderCapabilities> = {
  telefonchy: {
    key: 'telefonchy',
    labelFa: 'تلفنچی',
    category: 'cloud_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: false,
    defaultSipPort: 5060,
    defaultBaseUrl: 'https://panel.telefonchy.com',
    notesFa: 'اتصال از طریق وب‌سرویس SmartCall و ثبت داخلی/ترانک روی phone.telefonchy.com.',
  },
  simotel: {
    key: 'simotel',
    labelFa: 'سیموتل (Simotel)',
    category: 'on_prem_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'پشتیبانی کامل از Smart API، Event Webhook لحظه‌ای و اتصال SIP به مرکز تماس.',
  },
  novatel: {
    key: 'novatel',
    labelFa: 'نواتل (Novatel)',
    category: 'cloud_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'مرکز تلفن ابری سازمانی با Open API، وب‌هوک رویداد و داخلی SIP.',
  },
  alovoip: {
    key: 'alovoip',
    labelFa: 'الوویپ (AloVoIP)',
    category: 'cloud_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'پشتیبانی از Open API، گزارش تماس Webhook و حساب SIP.',
  },
  issabel: {
    key: 'issabel',
    labelFa: 'ایزابل / استریسک / FreePBX',
    category: 'on_prem_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'اتصال سرور شرکت از طریق SIP Peer یا گزارش‌دهی AMI/AGI به وب‌هوک KalamApp.',
  },
  daftareshoma: {
    key: 'daftareshoma',
    labelFa: 'دفترشما',
    category: 'cloud_pbx',
    supportsWebrtcGateway: false,
    supportsSipTrunk: false,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'ثبت گزارش تماس و پاپ‌آپ از طریق Webhook؛ پلن‌های پایه بدون حساب SIP از WebPhone پشتیبانی نمی‌کنند.',
  },
  asiatech: {
    key: 'asiatech',
    labelFa: 'سیپ ترانک آسیاتک (آسیاتل)',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'خط ثابت اینترنتی مستقیم (۹۱۰۱ / ۹۱۳۰) متصل به مرکز تلفن ابری KalamApp.',
  },
  shatel: {
    key: 'shatel',
    labelFa: 'سیپ ترانک شاتل (شاتل‌تاک)',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'خط ثابت سازمانی شاتل (۹۱۰۰ / ۹۱۳۲) متصل به هسته Asterisk.',
  },
  pishgaman: {
    key: 'pishgaman',
    labelFa: 'سیپ ترانک پیشگامان',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'خط ثابت پیشگامان (۹۱۰۹) متصل به هسته Asterisk.',
  },
  respina: {
    key: 'respina',
    labelFa: 'سیپ ترانک رسپینا (نکسفون)',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'خط سازمانی رسپینا/نکسفون متصل به هسته Asterisk.',
  },
  tci: {
    key: 'tci',
    labelFa: 'سیپ ترانک مخابرات ایران',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'خطوط ۴، ۵ یا ۸ رقمی مخابرات متصل از طریق ترانک SIP.',
  },
  sip_trunk: {
    key: 'sip_trunk',
    labelFa: 'سیپ ترانک استاندارد (سایر)',
    category: 'fcp_trunk',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: false,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'اتصال مستقیم هر ترانک SIP استاندارد به مرکز تلفن KalamApp.',
  },
  kalamapp_cloud_pbx: {
    key: 'kalamapp_cloud_pbx',
    labelFa: 'مرکز تلفن ابری KalamApp (WebRTC داخلی)',
    category: 'kalamapp_pbx',
    supportsWebrtcGateway: true,
    supportsSipTrunk: true,
    supportsClickToCallApi: true,
    supportsRealtimeEvents: true,
    defaultSipPort: 5060,
    defaultBaseUrl: '',
    notesFa: 'تماس داخلی بین اپراتورها و تماس خروجی از طریق ترانک سازمان در هسته Asterisk Realtime.',
  },
};

export const normalizeVoipProviderKey = (value: unknown): VoipProviderKey => {
  const raw = String(value || '').trim().toLowerCase();
  if (raw in VOIP_PROVIDER_CATALOG) return raw as VoipProviderKey;
  if (raw === 'asterisk') return 'kalamapp_cloud_pbx';
  return 'telefonchy';
};

export const getVoipProviderCapabilities = (provider: unknown): VoipProviderCapabilities =>
  VOIP_PROVIDER_CATALOG[normalizeVoipProviderKey(provider)];

export type NormalizedVoipWebhookRow = {
  provider: VoipProviderKey;
  serviceId: string;
  callId: string;
  objectId: string;
  direction: 'incoming' | 'outgoing' | 'internal' | 'unknown';
  status: 'ringing' | 'answered' | 'missed' | 'failed' | 'completed' | 'unknown';
  sourceNumber: string;
  destinationNumber: string;
  extension: string;
  targetExtension: string;
  operatorCode: string;
  trunk: string;
  waitSeconds: number | null;
  talkSeconds: number | null;
  fileId: string;
  recordingUrl: string;
  startedAtRaw: string;
  endedAtRaw: string;
};

const firstStr = (...values: unknown[]): string => {
  for (const val of values) {
    if (val === false || val === null || val === undefined || typeof val === 'object') continue;
    const s = String(val).trim();
    if (s) return s;
  }
  return '';
};

const toIntOrNull = (val: unknown): number | null => {
  const raw = String(val ?? '').trim();
  if (!raw) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? Math.max(0, Math.floor(num)) : null;
};

const mapDirectionGeneric = (raw: string): NormalizedVoipWebhookRow['direction'] => {
  const val = raw.trim().toLowerCase();
  if (['in', 'inbound', 'incoming', 'ورودی'].includes(val)) return 'incoming';
  if (['out', 'outbound', 'outgoing', 'خروجی'].includes(val)) return 'outgoing';
  if (['local', 'internal', 'extension', 'داخلی'].includes(val)) return 'internal';
  return 'unknown';
};

const mapStatusGeneric = (
  raw: string,
  eventName: string,
  talkSeconds: number | null
): NormalizedVoipWebhookRow['status'] => {
  const val = raw.trim().toLowerCase();
  const ev = eventName.trim().toLowerCase();
  if (['ringing', 'ring', 'newstate_ringing', 'dialing', 'newchannel', 'calling'].includes(ev) || ['ringing', 'trying', 'proceeding'].includes(val)) {
    return 'ringing';
  }
  if (['answer', 'answered', 'up', 'connected', 'ok', 'پاسخ داده شده'].includes(val) || ev === 'answered') {
    return 'answered';
  }
  if (['no answer', 'no_answer', 'noanswer', 'missed', 'busy', 'cancel', 'canceled', 'cancelled', 'unanswered', 'بی‌پاسخ'].includes(val)) {
    return 'missed';
  }
  if (['fail', 'failed', 'congestion', 'error', 'chanunavail', 'rejected', 'ناموفق'].includes(val)) {
    return 'failed';
  }
  if (['hangup', 'cdr', 'ended', 'completed', 'done'].includes(ev) || ['completed', 'ended', 'done', 'finished'].includes(val)) {
    if (talkSeconds !== null && talkSeconds > 0) return 'answered';
    if (talkSeconds === 0) return 'missed';
    return 'completed';
  }
  if (talkSeconds !== null && talkSeconds > 0) return 'answered';
  if (talkSeconds === 0) return 'missed';
  return 'unknown';
};

export const normalizeProviderWebhookPayload = (
  providerInput: unknown,
  rawPayload: Record<string, any>
): NormalizedVoipWebhookRow => {
  const provider = normalizeVoipProviderKey(providerInput);
  const data = rawPayload?.data && typeof rawPayload.data === 'object' ? { ...rawPayload, ...rawPayload.data } : rawPayload;
  const eventName = firstStr(data.event_name, data.event, data.event_type, data.type_event);

  const talkSeconds = toIntOrNull(
    firstStr(
      data.talk_seconds,
      data.billsec,
      data.time_talk,
      data.talk_duration,
      data.duration_talk,
      data.duration
    )
  );
  const waitSeconds = toIntOrNull(
    firstStr(data.wait_seconds, data.time_wait, data.ring_duration, data.wait_time)
  );

  const direction = mapDirectionGeneric(
    firstStr(data.direction, data.call_type, data.type, data.call_direction, data.kind)
  );

  const sourceNumber = firstStr(
    data.source_number,
    data.call_source,
    data.src,
    data.caller_id,
    data.caller,
    data.from,
    data.cid_num
  );

  const destinationNumber = firstStr(
    data.destination_number,
    data.call_dest,
    data.dst,
    data.callee,
    data.to,
    data.did
  );

  const extension = firstStr(
    data.extension,
    data.exten,
    data.operator_extension,
    data.participant,
    data.interface_exten,
    direction === 'outgoing' && sourceNumber.length <= 6 ? sourceNumber : '',
    direction === 'incoming' && destinationNumber.length <= 6 ? destinationNumber : ''
  );

  const targetExtension = firstStr(
    data.target_extension,
    direction === 'internal' && destinationNumber.length <= 6 ? destinationNumber : ''
  );

  const status = mapStatusGeneric(
    firstStr(data.status, data.disposition, data.call_status, data.state),
    eventName,
    talkSeconds
  );

  return {
    provider,
    serviceId: firstStr(data.service_id, data.serviceId, data.pbx_id),
    callId: firstStr(data.call_id, data.callId, data.cuid, data.unique_id, data.uniqueid, data.linkedid, data.call_uuid),
    objectId: firstStr(data.object_id, data.objectId, data.cdr_id, data.id),
    direction,
    status,
    sourceNumber,
    destinationNumber,
    extension,
    targetExtension,
    operatorCode: firstStr(data.operator_code, data.agent_code, data.agent_id),
    trunk: firstStr(data.trunk, data.trunk_name, data.did_number),
    waitSeconds,
    talkSeconds,
    fileId: firstStr(data.file_id, data.fileId, data.record_id),
    recordingUrl: firstStr(data.recording_url, data.recordingUrl, data.audio_url, data.record_url, data.file_url),
    startedAtRaw: firstStr(data.started_at, data.start_at, data.start_time, data.calldate, data.created_at),
    endedAtRaw: firstStr(data.ended_at, data.end_at, data.end_time, data.hangup_at),
  };
};

export const buildTenantPjsipNamespace = (orgId: string): string =>
  `k_${String(orgId || '').replace(/-/g, '').slice(0, 12).toLowerCase()}`;

export const buildTenantPjsipId = (orgId: string, extension: string): string => {
  const cleanExt = String(extension || '').replace(/[^a-zA-Z0-9_]/g, '');
  return `${buildTenantPjsipNamespace(orgId)}_${cleanExt}`;
};

export type IceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export const buildCoturnIceServers = async (params: {
  turnHost?: string;
  turnPort?: number;
  turnSecret?: string;
  userId?: string;
  ttlSeconds?: number;
  extraStunUrls?: string[];
}): Promise<IceServerConfig[]> => {
  const servers: IceServerConfig[] = [];
  const host = String(params.turnHost || '').trim();
  const port = Number(params.turnPort || 3478) || 3478;
  const secret = String(params.turnSecret || '').trim();
  const extraStun = Array.isArray(params.extraStunUrls) ? params.extraStunUrls.filter(Boolean) : [];

  if (host) {
    servers.push({ urls: `stun:${host}:${port}` });
    if (secret && typeof crypto !== 'undefined' && crypto.subtle) {
      const ttl = Math.max(60, Number(params.ttlSeconds || 43200));
      const expiresAt = Math.floor(Date.now() / 1000) + ttl;
      const username = `${expiresAt}:${String(params.userId || 'kalamapp').replace(/[^a-zA-Z0-9_-]/g, '')}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
      const bytes = new Uint8Array(sig);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const credential = btoa(binary);
      servers.push({
        urls: [`turn:${host}:${port}?transport=udp`, `turn:${host}:${port}?transport=tcp`],
        username,
        credential,
      });
    }
  }

  if (extraStun.length > 0) {
    servers.push({ urls: extraStun });
  } else if (servers.length === 0) {
    servers.push({ urls: ['stun:stun.l.google.com:19302'] });
  }

  return servers;
};
