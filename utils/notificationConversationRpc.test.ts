import { describe, expect, it } from 'vitest';
import {
  EMPTY_TIMELINE_PAYLOAD,
  isMissingRpcError,
  normalizeTimelinePayload,
} from './notificationConversationRpc';

describe('notificationConversationRpc', () => {
  it('normalizes timeline payload objects', () => {
    const payload = normalizeTimelinePayload<{ id: string }>({
      items: [{ id: '1' }, { id: '2' }],
      unread_count: '3',
      first_unread_id: 11,
      has_more_before: 1,
      next_before_cursor: 22,
    });

    expect(payload).toEqual({
      items: [{ id: '1' }, { id: '2' }],
      unread_count: 3,
      first_unread_id: '11',
      has_more_before: true,
      next_before_cursor: '22',
    });
  });

  it('accepts rpc array wrappers and falls back safely', () => {
    expect(normalizeTimelinePayload([{ items: [{ id: 'x' }] }]).items).toEqual([{ id: 'x' }]);
    expect(normalizeTimelinePayload(null)).toEqual(EMPTY_TIMELINE_PAYLOAD);
  });

  it('detects missing rpc errors from postgrest and postgres', () => {
    expect(isMissingRpcError({ code: 'PGRST202' })).toBe(true);
    expect(isMissingRpcError({ code: '42883' })).toBe(true);
    expect(isMissingRpcError({ message: 'Could not find the function public.get_internal_conversation_timeline' })).toBe(true);
    expect(isMissingRpcError({ code: '42501' })).toBe(false);
  });
});
