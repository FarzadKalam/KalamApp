import { supabase } from '../supabaseClient';
import { normalizePhoneForStorage } from './phoneNumber';
import { dialWebPhone } from './voipStore';

export type VoipDialMode = 'webphone_webrtc' | 'telefonchy_smartcall' | 'sip_link' | 'tel_link';

export type VoipSmartCallArgs = {
  phone: unknown;
  moduleId?: string | null;
  recordId?: string | null;
  title?: string | null;
};

export type VoipSmartCallResult = {
  started: boolean;
  mode?: VoipDialMode;
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

  const {data:policy,error:policyError}=await supabase.functions.invoke('voip-session',{body:{action:'get_connection_policy'}});
  if(policyError||!policy?.success)throw new Error('تنظیمات تماس سازمان در دسترس نیست.');
  if(!policy.enabled)throw new Error(policy.message||'مکالمه داخل تازه‌سیستم برای این سازمان فعال نیست.');
  {
    await dialWebPhone(normalizedPhone, { moduleId, recordId, title });
    return {
      started: true,
      mode: 'webphone_webrtc',
      message: 'تماس زنده از طریق تلفن داخل برنامه آغاز شد.',
    };
  }

};
