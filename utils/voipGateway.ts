import { supabase } from '../supabaseClient';
import { fetchSessionBootstrap } from './sessionCache';
import { normalizePhoneForStorage } from './phoneNumber';

type VoipDialMode = 'telefonchy_smartcall' | 'sip_link' | 'tel_link';

export type VoipSmartCallArgs = {
  phone: unknown;
  moduleId?: string | null;
  recordId?: string | null;
  title?: string | null;
};

export type VoipSmartCallResult = {
  started: boolean;
  fallbackUrl?: string;
  fallbackMode?: VoipDialMode;
  callLogId?: string | null;
  message?: string;
};

const getErrorMessage = (value: any, fallback: string) => {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return String(value.message || value.error || fallback);
};

export const buildVoipFallbackUrl = (
  phone: unknown,
  mode: VoipDialMode | string | null | undefined
) => {
  const normalizedPhone = normalizePhoneForStorage(phone) || String(phone || '').trim();
  if (!normalizedPhone) return '';
  return mode === 'sip_link' ? `sip:${normalizedPhone}` : `tel:${normalizedPhone}`;
};

export const requestVoipSmartCall = async ({
  phone,
  moduleId,
  recordId,
  title,
}: VoipSmartCallArgs): Promise<VoipSmartCallResult> => {
  const normalizedPhone = normalizePhoneForStorage(phone) || String(phone || '').trim();
  if (!normalizedPhone) {
    throw new Error('شماره تماس معتبر نیست.');
  }

  const bootstrap = await fetchSessionBootstrap(supabase);
  const profile = bootstrap.profile || {};
  const dialMode = String(profile.voip_dial_mode || 'tel_link') as VoipDialMode;
  const fallbackUrl = buildVoipFallbackUrl(normalizedPhone, dialMode);

  if (profile.voip_enabled !== true || dialMode !== 'telefonchy_smartcall') {
    return {
      started: false,
      fallbackUrl,
      fallbackMode: dialMode,
      message: 'تماس از مسیر جایگزین باز شد.',
    };
  }

  const body: Record<string, any> = {
    to: normalizedPhone,
  };
  if (moduleId) body.moduleId = moduleId;
  if (recordId) body.recordId = recordId;
  if (title) body.title = title;

  const { data, error } = await supabase.functions.invoke('telefonchy_smartcall', { body });
  if (error) throw new Error(getErrorMessage(error, 'شروع تماس VoIP ناموفق بود.'));
  if (data && data.success === false) {
    throw new Error(getErrorMessage(data, 'شروع تماس VoIP ناموفق بود.'));
  }

  return {
    started: true,
    callLogId: data?.call_log_id || null,
    message: 'تماس VoIP آغاز شد.',
  };
};
