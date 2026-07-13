const normalizeText = (value: unknown) => String(value ?? '').trim();

export const isAiBotMessagePayload = (payload: Record<string, any> | null | undefined) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return [source.sender_kind, source.sender_type, source.source_type, source.message_source, source.author_type]
    .some((value) => normalizeText(value).toLowerCase() === 'ai')
    || Boolean(source.ai_generated || source.ai_answer || source.workflow_ai_prompt);
};

export const isSystemBotMessagePayload = (payload: Record<string, any> | null | undefined) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return [source.sender_kind, source.sender_type, source.source_type, source.message_source, source.author_type]
    .some((value) => ['system', 'workflow', 'automation', 'scheduled_report'].includes(normalizeText(value).toLowerCase()))
    || Boolean(source.workflow_action_type || source.process_automation_rule_id || source.scheduled_report_id);
};

export const buildAutomatedBotSenderPayload = ({
  payload,
  systemAvatarUrl,
}: {
  payload?: Record<string, any> | null;
  systemAvatarUrl?: string | null;
}) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  if (isAiBotMessagePayload(source)) {
    return {
      ...source,
      sender_user_id: null,
      sender_profile_id: null,
      sender_display_name: normalizeText(source.sender_display_name) || 'هوش مصنوعی',
      sender_avatar_url: normalizeText(source.sender_avatar_url) || null,
      sender_kind: 'ai',
      sender_type: 'ai',
      message_source: 'ai',
    };
  }
  return {
    ...source,
    sender_user_id: null,
    sender_profile_id: null,
    sender_display_name: normalizeText(source.sender_display_name) || 'پیام‌های سیستم',
    sender_avatar_url: normalizeText(source.sender_avatar_url) || normalizeText(systemAvatarUrl) || null,
    sender_kind: 'system',
    sender_type: 'system',
    message_source: normalizeText(source.message_source) || 'workflow',
  };
};

export const extractBotProviderMessageId = (response: any) => normalizeText(
  response?.result?.message_id
  || response?.message_id
  || response?.data?.message_id
  || response?.data?.message_update?.message_id
  || response?.data?.messageUpdate?.messageId
  || response?.result?.messageId
) || null;
