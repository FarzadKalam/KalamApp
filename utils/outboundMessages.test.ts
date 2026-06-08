import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authUser: null as any,
  insertedRows: [] as any[],
  from: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mocks.authUser } })),
    },
    from: mocks.from,
  },
}));

import { createOutboundMessageLog } from './outboundMessages';

describe('outboundMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authUser = null;
    mocks.insertedRows = [];
    mocks.from.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({ data: { org_id: 'org-from-profile' }, error: null })),
            })),
          })),
        };
      }
      if (table === 'outbound_messages') {
        return {
          insert: vi.fn((payload: any) => {
            mocks.insertedRows.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'message-1', ...payload }, error: null })),
              })),
            };
          }),
        };
      }
      return {};
    });
  });

  it('adds current org_id to outbound message logs for strict tenant RLS', async () => {
    mocks.authUser = { id: 'user-1' };

    await createOutboundMessageLog({
      channelType: 'sms',
      recipient: '09111111111',
      messageText: 'پیام تست',
    });

    expect(mocks.insertedRows).toContainEqual(expect.objectContaining({
      org_id: 'org-from-profile',
      channel_type: 'sms',
      status: 'pending',
    }));
  });

  it('prefers explicit payload org_id over profile fallback', async () => {
    mocks.authUser = { id: 'user-1' };

    await createOutboundMessageLog({
      orgId: 'org-explicit',
      channelType: 'rubika',
      recipient: 'chat-1',
      messageText: 'پیام بات',
    });

    expect(mocks.insertedRows).toContainEqual(expect.objectContaining({
      org_id: 'org-explicit',
      channel_type: 'rubika',
    }));
  });
});
