import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhoneDigits } from './phoneNumber';

export type PhoneBindTargetModuleId = 'customers' | 'suppliers' | 'employees';

export const PHONE_BIND_TARGET_MODULES: PhoneBindTargetModuleId[] = ['customers', 'suppliers', 'employees'];
export const MANUAL_PHONE_BINDING_SOURCE_TABLE = 'manual_phone_binding';
export const MANUAL_PHONE_BINDING_SOURCE_FIELD = 'identity';

type TargetOption = {
  value: string;
  label: string;
  meta?: string | null;
};

const TARGET_SELECT_BY_MODULE: Record<PhoneBindTargetModuleId, string> = {
  customers: 'id, org_id, full_name, business_name, legal_name, system_code, first_name, last_name',
  suppliers: 'id, org_id, business_name, first_name, last_name, system_code',
  employees: 'id, org_id, full_name, first_name, last_name, system_code, legacy_system_code',
};

const buildLookupKey = (value: unknown) => {
  let digits = normalizePhoneDigits(value);
  if (!digits) return '';
  if (digits.startsWith('0098')) {
    digits = digits.slice(4);
  } else if (digits.startsWith('98') && digits.length >= 12) {
    digits = digits.slice(2);
  }
  if (digits.length > 10 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
};

export const buildPhoneTargetDisplayName = (
  moduleId: PhoneBindTargetModuleId,
  row: Record<string, any> | null | undefined,
) => {
  if (!row) return '';
  if (moduleId === 'customers') {
    return String(
      row.full_name
      || row.business_name
      || row.legal_name
      || [row.first_name, row.last_name].filter(Boolean).join(' ')
      || row.system_code
      || ''
    ).trim();
  }
  if (moduleId === 'suppliers') {
    return String(
      row.business_name
      || [row.first_name, row.last_name].filter(Boolean).join(' ')
      || row.system_code
      || ''
    ).trim();
  }
  return String(
    row.full_name
    || [row.first_name, row.last_name].filter(Boolean).join(' ')
    || row.system_code
    || row.legacy_system_code
    || ''
  ).trim();
};

const buildPhoneTargetMeta = (
  moduleId: PhoneBindTargetModuleId,
  row: Record<string, any> | null | undefined,
) => {
  if (!row) return '';
  if (moduleId === 'customers') {
    return String(row.system_code || row.business_name || row.legal_name || '').trim();
  }
  if (moduleId === 'suppliers') {
    return String(row.system_code || row.business_name || '').trim();
  }
  return String(row.system_code || row.legacy_system_code || '').trim();
};

const buildSearchOrFilter = (moduleId: PhoneBindTargetModuleId, search: string) => {
  const normalizedSearch = String(search || '').trim();
  if (!normalizedSearch) return '';
  const escaped = normalizedSearch.replace(/,/g, ' ').replace(/\./g, ' ');
  const like = `%${escaped}%`;
  if (moduleId === 'customers') {
    return [
      `full_name.ilike.${like}`,
      `business_name.ilike.${like}`,
      `legal_name.ilike.${like}`,
      `first_name.ilike.${like}`,
      `last_name.ilike.${like}`,
      `system_code.ilike.${like}`,
    ].join(',');
  }
  if (moduleId === 'suppliers') {
    return [
      `business_name.ilike.${like}`,
      `first_name.ilike.${like}`,
      `last_name.ilike.${like}`,
      `system_code.ilike.${like}`,
    ].join(',');
  }
  return [
    `full_name.ilike.${like}`,
    `first_name.ilike.${like}`,
    `last_name.ilike.${like}`,
    `system_code.ilike.${like}`,
    `legacy_system_code.ilike.${like}`,
  ].join(',');
};

export const searchPhoneBindingTargets = async ({
  client,
  moduleId,
  search,
  limit = 20,
}: {
  client: SupabaseClient<any, 'public', any>;
  moduleId: PhoneBindTargetModuleId;
  search: string;
  limit?: number;
}): Promise<TargetOption[]> => {
  let query = client
    .from(moduleId)
    .select(TARGET_SELECT_BY_MODULE[moduleId])
    .limit(limit);

  const searchFilter = buildSearchOrFilter(moduleId, search);
  if (searchFilter) {
    query = query.or(searchFilter);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data || [])
    .map((row: any) => ({
      value: String(row?.id || '').trim(),
      label: buildPhoneTargetDisplayName(moduleId, row),
      meta: buildPhoneTargetMeta(moduleId, row) || null,
    }))
    .filter((item) => item.value && item.label)
    .sort((left, right) => String(left.label || '').localeCompare(String(right.label || ''), 'fa'));
};

const upsertPhoneNumber = async (
  client: SupabaseClient<any, 'public', any>,
  orgId: string,
  phone: string,
) => {
  const lookupKey = buildLookupKey(phone);
  if (!lookupKey) {
    throw new Error('شماره معتبر نیست.');
  }
  const { data, error } = await client
    .from('phone_numbers')
    .upsert({
      org_id: orgId,
      lookup_key: lookupKey,
      display_number: String(phone || '').trim() || null,
    }, { onConflict: 'org_id,lookup_key' })
    .select('id, display_number')
    .maybeSingle();
  if (error) throw error;
  const phoneNumberId = String(data?.id || '').trim();
  if (!phoneNumberId) {
    throw new Error('ذخیره شماره انجام نشد.');
  }
  return {
    phoneNumberId,
    displayNumber: String(data?.display_number || phone || '').trim() || null,
  };
};

export const syncPhoneIdentityBinding = async ({
  client,
  orgId,
  moduleId,
  recordId,
  phone,
  phoneNumberId,
}: {
  client: SupabaseClient<any, 'public', any>;
  orgId: string;
  moduleId: PhoneBindTargetModuleId;
  recordId: string;
  phone: string;
  phoneNumberId?: string | null;
}) => {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedPhone = String(phone || '').trim();
  if (!normalizedOrgId || !normalizedRecordId) {
    throw new Error('اطلاعات مخاطب برای اتصال شماره کامل نیست.');
  }

  const { data: targetRow, error: targetError } = await client
    .from(moduleId)
    .select(TARGET_SELECT_BY_MODULE[moduleId])
    .eq('id', normalizedRecordId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow) {
    throw new Error('رکورد انتخاب‌شده پیدا نشد.');
  }

  const resolvedPhoneNumberId = String(phoneNumberId || '').trim()
    || (await upsertPhoneNumber(client, normalizedOrgId, normalizedPhone)).phoneNumberId;
  const displayTitle = buildPhoneTargetDisplayName(moduleId, targetRow) || normalizedPhone;

  const { error: deleteManualBindingError } = await client
    .from('phone_number_links')
    .delete()
    .eq('org_id', normalizedOrgId)
    .eq('phone_number_id', resolvedPhoneNumberId)
    .eq('source_table', MANUAL_PHONE_BINDING_SOURCE_TABLE)
    .eq('source_field', MANUAL_PHONE_BINDING_SOURCE_FIELD);
  if (deleteManualBindingError) throw deleteManualBindingError;

  const { error: insertManualBindingError } = await client
    .from('phone_number_links')
    .insert({
      org_id: normalizedOrgId,
      phone_number_id: resolvedPhoneNumberId,
      entity_type: moduleId,
      entity_id: normalizedRecordId,
      label: 'manual_binding',
      is_primary: true,
      source_table: MANUAL_PHONE_BINDING_SOURCE_TABLE,
      source_field: MANUAL_PHONE_BINDING_SOURCE_FIELD,
      display_title: displayTitle,
      metadata: {
        binding_scope: 'manual_identity',
      },
    });
  if (insertManualBindingError) throw insertManualBindingError;

  const smsPatch: Record<string, any> = {
    module_id: moduleId,
    record_id: normalizedRecordId,
    customer_id: moduleId === 'customers' ? normalizedRecordId : null,
    title: displayTitle,
    phone_match_status: 'manual',
  };
  const { error: smsUpdateError } = await client
    .from('outbound_messages')
    .update(smsPatch)
    .eq('org_id', normalizedOrgId)
    .eq('channel_type', 'sms')
    .eq('phone_number_id', resolvedPhoneNumberId);
  if (smsUpdateError) throw smsUpdateError;

  const { error: voipUpdateError } = await client
    .from('voip_call_logs')
    .update({
      module_id: moduleId,
      record_id: normalizedRecordId,
      title: displayTitle,
      phone_match_status: 'manual',
    })
    .eq('org_id', normalizedOrgId)
    .eq('phone_number_id', resolvedPhoneNumberId);
  if (voipUpdateError) throw voipUpdateError;

  return {
    phoneNumberId: resolvedPhoneNumberId,
    displayTitle,
  };
};
