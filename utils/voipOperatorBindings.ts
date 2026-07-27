import { supabase } from '../supabaseClient';

export type VoipOperatorBindingDraft = {
  provider?: string | null;
  serviceId?: string | null;
  extension?: string | null;
  operatorCode?: string | null;
  providerOperatorId?: string | null;
  displayName?: string | null;
  profileId: string;
};

const normalizeText = (value: unknown) => String(value || '').trim();

export const bindVoipOperatorIdentity = async (draft: VoipOperatorBindingDraft) => {
  const profileId = normalizeText(draft.profileId);
  const extension = normalizeText(draft.extension);
  const operatorCode = normalizeText(draft.operatorCode);
  const providerOperatorId = normalizeText(draft.providerOperatorId);
  if (!profileId) throw new Error('کاربر مقصد را انتخاب کنید.');
  if (!extension && !operatorCode && !providerOperatorId) {
    throw new Error('داخلی یا کد اپراتور قابل اتصال نیست.');
  }

  const { data, error } = await supabase.rpc('bind_voip_operator_identity', {
    p_provider: normalizeText(draft.provider) || 'telefonchy',
    p_service_id: normalizeText(draft.serviceId) || null,
    p_extension: extension || null,
    p_operator_code: operatorCode || null,
    p_provider_operator_id: providerOperatorId || null,
    p_display_name: normalizeText(draft.displayName) || null,
    p_profile_id: profileId,
  });
  if (error) throw error;
  return data;
};
