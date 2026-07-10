import type { SupabaseClient } from '@supabase/supabase-js';
import { getBotChatIdFieldKey, type BotChannel, type BotTargetModuleId } from './botPlatform';

const TARGET_SELECT_BY_MODULE: Record<BotTargetModuleId, string> = {
  customers: 'id, org_id, full_name, business_name, legal_name, system_code',
  suppliers: 'id, org_id, business_name, first_name, last_name, system_code',
  employees: 'id, org_id, full_name, first_name, last_name, system_code, legacy_system_code, related_profile_id',
};

const buildTargetDisplayName = (moduleId: BotTargetModuleId, row: Record<string, any> | null | undefined) => {
  if (!row) return '';
  if (moduleId === 'customers') {
    return String(row.full_name || row.business_name || row.legal_name || row.system_code || '').trim();
  }
  if (moduleId === 'suppliers') {
    return String(row.business_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.system_code || '').trim();
  }
  return String(row.full_name || [row.first_name, row.last_name].filter(Boolean).join(' ') || row.system_code || row.legacy_system_code || '').trim();
};

const isMissingRpcError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('could not find the function')
    || (message.includes('function public.') && message.includes('does not exist'))
  );
};

const updateProfileChannelChatId = async (
  client: SupabaseClient<any, 'public', any>,
  profileId: string,
  channel: BotChannel,
  chatId: string | null,
) => {
  if (!profileId) return;
  const profilePatch = { [getBotChatIdFieldKey(channel)]: chatId || null };
  const { error } = await client.from('profiles').update(profilePatch).eq('id', profileId);
  if (error) throw error;
};

export const syncBotDirectChatIdForTarget = async ({
  client,
  orgId,
  moduleId,
  recordId,
  channel,
  chatId,
  previousChatId,
  username,
  phoneNumber,
  displayName,
  threadMetadata,
}: {
  client: SupabaseClient<any, 'public', any>;
  orgId: string;
  moduleId: BotTargetModuleId;
  recordId: string;
  channel: BotChannel;
  chatId?: string | null;
  previousChatId?: string | null;
  username?: string | null;
  phoneNumber?: string | null;
  displayName?: string | null;
  threadMetadata?: Record<string, any> | null;
}) => {
  const normalizedOrgId = String(orgId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedChatId = String(chatId || '').trim() || null;
  if (!normalizedOrgId || !normalizedRecordId) {
    throw new Error('اطلاعات رکورد برای ذخیره chat id کامل نیست.');
  }

  const rpcResult = await client.rpc('sync_bot_direct_chat_identity', {
    p_target_module_id: moduleId,
    p_target_record_id: normalizedRecordId,
    p_channel_type: channel,
    p_chat_id: normalizedChatId,
    p_previous_chat_id: String(previousChatId || '').trim() || null,
    p_username: String(username || '').trim() || null,
    p_phone_number: String(phoneNumber || '').trim() || null,
    p_display_name: String(displayName || '').trim() || null,
    p_thread_metadata: threadMetadata && typeof threadMetadata === 'object' ? threadMetadata : null,
  });
  if (!rpcResult.error) {
    const data = rpcResult.data && typeof rpcResult.data === 'object' ? rpcResult.data as Record<string, any> : {};
    return {
      displayName: String(data.display_name || '').trim() || null,
      profileId: String(data.profile_id || '').trim() || null,
      currentChatId: String(data.previous_chat_id || '').trim() || null,
    };
  }
  if (!isMissingRpcError(rpcResult.error)) {
    throw rpcResult.error;
  }

  const { data: targetRow, error: targetError } = await client
    .from(moduleId)
    .select(TARGET_SELECT_BY_MODULE[moduleId])
    .eq('id', normalizedRecordId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!targetRow) throw new Error('رکورد انتخاب‌شده پیدا نشد.');

  const fieldKey = getBotChatIdFieldKey(channel);
  const currentChatId = String((targetRow as any)?.[fieldKey] || '').trim() || null;
  const currentDisplayName = buildTargetDisplayName(moduleId, targetRow);
  const finalDisplayName = String(displayName || currentDisplayName || '').trim() || null;
  const profileId = moduleId === 'employees'
    ? String((targetRow as any)?.related_profile_id || '').trim() || null
    : null;

  const patch = { [fieldKey]: normalizedChatId };
  const { error: updateError } = await client.from(moduleId).update(patch).eq('id', normalizedRecordId);
  if (updateError) throw updateError;

  if (profileId) {
    await updateProfileChannelChatId(client, profileId, channel, normalizedChatId);
  }

  const staleChatIds = Array.from(new Set(
    [previousChatId, currentChatId]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value) => value !== normalizedChatId),
  ));

  if (normalizedChatId) {
    const bindingPayload = {
      org_id: normalizedOrgId,
      channel_type: channel,
      chat_id: normalizedChatId,
      target_module_id: moduleId,
      target_record_id: normalizedRecordId,
      profile_id: profileId,
      display_name: finalDisplayName,
      username: String(username || '').trim() || null,
      phone_number: String(phoneNumber || '').trim() || null,
      last_seen_at: new Date().toISOString(),
    };
    const { error: bindingError } = await client
      .from('bot_chat_identity_bindings')
      .upsert(bindingPayload, { onConflict: 'org_id,channel_type,chat_id' });
    if (bindingError) throw bindingError;

    const threadPayload = {
      org_id: normalizedOrgId,
      channel_type: channel,
      chat_id: normalizedChatId,
      target_module_id: moduleId,
      target_record_id: normalizedRecordId,
      customer_id: moduleId === 'customers' ? normalizedRecordId : null,
      supplier_id: moduleId === 'suppliers' ? normalizedRecordId : null,
      employee_id: moduleId === 'employees' ? normalizedRecordId : null,
      profile_id: profileId,
      display_name: finalDisplayName,
      username: String(username || '').trim() || null,
      phone_number: String(phoneNumber || '').trim() || null,
      last_seen_at: new Date().toISOString(),
    };
    const { error: threadError } = await client
      .from('counterparty_bot_direct_threads')
      .upsert(threadPayload, { onConflict: 'org_id,channel_type,chat_id' });
    if (threadError) throw threadError;
  }

  if (staleChatIds.length > 0) {
    const { error: staleBindingError } = await client
      .from('bot_chat_identity_bindings')
      .delete()
      .eq('org_id', normalizedOrgId)
      .eq('channel_type', channel)
      .eq('target_module_id', moduleId)
      .eq('target_record_id', normalizedRecordId)
      .in('chat_id', staleChatIds);
    if (staleBindingError) throw staleBindingError;

    const { error: staleThreadError } = await client
      .from('counterparty_bot_direct_threads')
      .update({
        target_module_id: null,
        target_record_id: null,
        customer_id: null,
        supplier_id: null,
        employee_id: null,
        profile_id: null,
      })
      .eq('org_id', normalizedOrgId)
      .eq('channel_type', channel)
      .in('chat_id', staleChatIds)
      .eq('target_module_id', moduleId)
      .eq('target_record_id', normalizedRecordId);
    if (staleThreadError) throw staleThreadError;
  }

  return {
    displayName: finalDisplayName,
    profileId,
    currentChatId,
  };
};
