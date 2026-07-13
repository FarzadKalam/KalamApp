import { describe, expect, it } from 'vitest';
import {
  buildAutomatedBotSenderPayload,
  extractBotProviderMessageId,
  isSystemBotMessagePayload,
} from '../supabase/functions/_shared/bot-system-message';

describe('automated bot group message identity', () => {
  it('uses the system identity and organization avatar for workflow messages', () => {
    const payload = buildAutomatedBotSenderPayload({
      payload: { workflow_action_type: 'send_bot_message' },
      systemAvatarUrl: 'https://cdn.example/org-logo.png',
    });
    expect(isSystemBotMessagePayload(payload)).toBe(true);
    expect(payload).toMatchObject({
      sender_display_name: 'پیام‌های سیستم',
      sender_avatar_url: 'https://cdn.example/org-logo.png',
      sender_kind: 'system',
      sender_user_id: null,
    });
  });

  it('keeps AI messages distinct from system messages', () => {
    const payload = buildAutomatedBotSenderPayload({ payload: { sender_kind: 'ai' } });
    expect(payload.sender_display_name).toBe('هوش مصنوعی');
    expect(payload.sender_kind).toBe('ai');
  });

  it('extracts provider ids from supported bot response shapes', () => {
    expect(extractBotProviderMessageId({ data: { message_update: { message_id: 'rubika-1' } } })).toBe('rubika-1');
    expect(extractBotProviderMessageId({ result: { message_id: 42 } })).toBe('42');
  });
});
