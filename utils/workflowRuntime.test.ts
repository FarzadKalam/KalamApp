import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatGroups: [] as any[],
  profilesByUser: [] as any[],
  profilesByRole: [] as any[],
  from: vi.fn(),
  insertNotesWithFallback: vi.fn(),
  sendNoteSmsNotifications: vi.fn(),
  sendSmsViaGateway: vi.fn(),
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
  },
}));

vi.mock('./noteDispatch', () => ({
  insertNotesWithFallback: mocks.insertNotesWithFallback,
  sendNoteSmsNotifications: mocks.sendNoteSmsNotifications,
}));

vi.mock('./smsGateway', () => ({
  sendSmsViaGateway: mocks.sendSmsViaGateway,
}));

import { executeWorkflowAction } from './workflowRuntime';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DIRECT_USER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

const makeQuery = (table: string) => ({
  select: vi.fn(() => ({
    in: vi.fn(async (field: string, values: string[]) => {
      if (table === 'chat_groups') {
        return {
          data: mocks.chatGroups.filter((group) => values.includes(String(group.id))),
          error: null,
        };
      }
      if (table === 'profiles' && field === 'id') {
        return {
          data: mocks.profilesByUser.filter((profile) => values.includes(String(profile.id))),
          error: null,
        };
      }
      if (table === 'profiles' && field === 'role_id') {
        return {
          data: mocks.profilesByRole.filter((profile) => values.includes(String(profile.role_id))),
          error: null,
        };
      }
      return { data: [], error: null };
    }),
  })),
});

describe('workflow action recipients', () => {
  beforeEach(() => {
    mocks.chatGroups = [];
    mocks.profilesByUser = [];
    mocks.profilesByRole = [];
    mocks.from.mockImplementation((table: string) => makeQuery(table));
    mocks.insertNotesWithFallback.mockResolvedValue(undefined);
    mocks.sendNoteSmsNotifications.mockResolvedValue({ recipients: [] });
    mocks.sendSmsViaGateway.mockResolvedValue({ success: true, sent: 0 });
    vi.clearAllMocks();
  });

  it('keeps internal chat group notes in the group and sends SMS notification to all selected recipients', async () => {
    mocks.chatGroups = [{
      id: GROUP_ID,
      user_ids: [USER_ID],
      role_ids: [ROLE_ID],
    }];

    await executeWorkflowAction(
      {
        id: 'action-1',
        type: 'send_note_sms',
        config: {
          recipient_assignees: [`chat_group:${GROUP_ID}`, `user:${DIRECT_USER_ID}`],
          note_text: 'پیام تست',
        },
      },
      'customers',
      { id: '55555555-5555-4555-8555-555555555555' }
    );

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledTimes(1);
    const insertedRows = mocks.insertNotesWithFallback.mock.calls[0][0];
    expect(insertedRows).toHaveLength(2);
    expect(insertedRows[0].metadata?.chat_group_id).toBeUndefined();
    expect(insertedRows[0].mention_user_ids).toEqual([DIRECT_USER_ID]);
    expect(insertedRows[1].metadata?.chat_group_id).toBe(GROUP_ID);
    expect(insertedRows[1].mention_user_ids).toEqual([USER_ID]);
    expect(insertedRows[1].mention_role_ids).toEqual([ROLE_ID]);

    expect(mocks.sendNoteSmsNotifications).toHaveBeenCalledWith(expect.objectContaining({
      mentionUserIds: [DIRECT_USER_ID, USER_ID],
      mentionRoleIds: [ROLE_ID],
    }));
  });

  it('expands internal chat groups to all valid SMS recipient phones', async () => {
    mocks.chatGroups = [{
      id: GROUP_ID,
      user_ids: [USER_ID],
      role_ids: [ROLE_ID],
    }];
    mocks.profilesByUser = [
      { id: USER_ID, mobile_1: '09111111111' },
    ];
    mocks.profilesByRole = [
      { id: '66666666-6666-4666-8666-666666666666', role_id: ROLE_ID, mobile_1: '09222222222' },
      { id: '77777777-7777-4777-8777-777777777777', role_id: ROLE_ID, mobile_1: '09111111111' },
    ];

    await executeWorkflowAction(
      {
        id: 'action-2',
        type: 'send_sms',
        config: {
          recipient_assignees: [`chat_group:${GROUP_ID}`],
          message: 'سلام',
        },
      },
      'customers',
      { id: '55555555-5555-4555-8555-555555555555' }
    );

    expect(mocks.sendSmsViaGateway).toHaveBeenCalledTimes(1);
    expect(mocks.sendSmsViaGateway).toHaveBeenCalledWith(expect.objectContaining({
      to: ['09111111111', '09222222222'],
      title: 'ارسال پیامک خودکار',
    }));
  });
});
