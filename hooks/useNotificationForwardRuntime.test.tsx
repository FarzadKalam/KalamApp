import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendInternalMessageV2: vi.fn(),
}));

vi.mock('../utils/noteDispatch', () => ({
  sendInternalMessageV2: mocks.sendInternalMessageV2,
}));

import { useNotificationForwardRuntime } from './useNotificationForwardRuntime';

describe('useNotificationForwardRuntime', () => {
  it('sends internal forwards through the atomic V2 dispatch and preserves image attachments', async () => {
    const authorId = '11111111-1111-4111-8111-111111111111';
    const recipientId = '22222222-2222-4222-8222-222222222222';
    const insertedRow = { id: '33333333-3333-4333-8333-333333333333', content: 'ثبت شد' };
    mocks.sendInternalMessageV2.mockResolvedValue([insertedRow]);
    const onForwarded = vi.fn();

    const { result } = renderHook(() => useNotificationForwardRuntime({
      messageApi: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
      forwardingNote: {
        id: '44444444-4444-4444-8444-444444444444',
        module_id: null,
        record_id: null,
        content: JSON.stringify({
          text: 'تصویر گزارش',
          attachments: [{ name: 'report.png', url: 'https://example.test/report.png', mimeType: 'image/png', fileType: 'image' }],
        }),
        __forward_source_type: 'note',
      },
      forwardTargetUserIds: [recipientId],
      forwardMessageText: '',
      setForwardingNote: vi.fn(),
      setForwardTargetUserIds: vi.fn(),
      setForwardMessageText: vi.fn(),
      setForwardSubmitting: vi.fn(),
      selectedNoteUserId: null,
      profileId: authorId,
      currentAuthorName: 'کاربر آزمایشی',
      botGroups: [],
      botDirectThreads: [],
      chatGroups: [],
      chatGroupMap: {},
      availableDirectUsers: [],
      roleLookup: {},
      getChatGroupPayload: vi.fn(),
      getBotMessageAttachments: vi.fn(),
      buildAttachmentNameText: vi.fn(),
      sendTextToBotGroup: vi.fn(),
      sendTextToBotDirectThread: vi.fn(),
      refreshSection: vi.fn(async () => undefined),
      onForwarded,
    }));

    await act(async () => {
      await result.current.submitForward();
    });

    expect(mocks.sendInternalMessageV2).toHaveBeenCalledOnce();
    expect(mocks.sendInternalMessageV2).toHaveBeenCalledWith(expect.objectContaining({
      mention_user_ids: [recipientId],
      content: expect.stringContaining('report.png'),
      metadata: expect.objectContaining({
        forwarded_from: expect.objectContaining({ source_type: 'note' }),
      }),
    }));
    expect(onForwarded).toHaveBeenCalledWith({ internalRows: [insertedRow] });
  });
});
