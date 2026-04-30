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
  supabaseSignUpClient: {
    from: mocks.from,
  },
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
}));

vi.mock('./noteDispatch', () => ({
  insertNotesWithFallback: mocks.insertNotesWithFallback,
  sendNoteSmsNotifications: mocks.sendNoteSmsNotifications,
}));

vi.mock('./smsGateway', () => ({
  sendSmsViaGateway: mocks.sendSmsViaGateway,
}));

import { evaluateWorkflowConditions, executeWorkflowAction, runWorkflowsForEvent } from './workflowRuntime';
import { createProcessNextStageFieldKey } from './workflowTypes';
import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';

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

const createFilterableSelectQuery = (rows: any[]) => {
  const filters: Array<{ type: 'eq' | 'in'; field: string; value: any }> = [];

  const applyFilters = () =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === 'eq') {
          return row?.[filter.field] === filter.value;
        }
        if (filter.type === 'in') {
          return Array.isArray(filter.value) && filter.value.includes(row?.[filter.field]);
        }
        return true;
      })
    );

  const chain: any = {
    eq: (field: string, value: any) => {
      filters.push({ type: 'eq', field, value });
      return chain;
    },
    in: async (field: string, value: any[]) => {
      filters.push({ type: 'in', field, value });
      return { data: applyFilters(), error: null };
    },
    maybeSingle: async () => ({
      data: applyFilters()[0] ?? null,
      error: null,
    }),
    limit: async (count: number) => ({
      data: applyFilters().slice(0, count),
      error: null,
    }),
  };

  return chain;
};

const createOrderableTaskQuery = (rows: any[]) => {
  const filters: Array<{ field: string; value: any }> = [];
  const applyFilters = () =>
    rows.filter((row) => filters.every((filter) => row?.[filter.field] === filter.value));
  const chain: any = {
    eq: (field: string, value: any) => {
      filters.push({ field, value });
      return chain;
    },
    order: async (field: string, options?: { ascending?: boolean }) => {
      const sorted = [...applyFilters()].sort((left, right) => {
        const direction = options?.ascending === false ? -1 : 1;
        return (Number(left?.[field] || 0) - Number(right?.[field] || 0)) * direction;
      });
      return { data: sorted, error: null };
    },
  };
  return chain;
};

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

describe('send_to_next_stages workflow action', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.clearAllMocks();
  });

  it('writes values into the next task custom fields', async () => {
    const updates: Array<{ id: string; payload: Record<string, any> }> = [];
    const nextRecurrence = {
      [PROCESS_TASK_CUSTOM_FIELDS_KEY]: [
        {
          key: 'handover_note',
          type: 'text',
          labels: { fa: 'یادداشت تحویل' },
        },
      ],
      [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: {},
    };
    const taskRows = [
      { id: 'task-current', sort_order: 10, process_group_id: 'group-1', recurrence_info: {} },
      { id: 'task-next', sort_order: 20, process_group_id: 'group-1', recurrence_info: nextRecurrence },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => createOrderableTaskQuery(taskRows)),
          update: vi.fn((payload: Record<string, any>) => ({
            eq: vi.fn(async (_field: string, id: string) => {
              updates.push({ id, payload });
              return { data: null, error: null };
            }),
          })),
        };
      }
      return makeQuery(table);
    });

    await executeWorkflowAction(
      {
        id: 'action-next-1',
        type: 'send_to_next_stages',
        config: {
          field: createProcessNextStageFieldKey(1, 'handover_note'),
          value_mode: 'from_source',
          source_field: '__task__result',
        },
      },
      'customers',
      {
        id: 'source-1',
        task_id: 'task-current',
        process_group_id: 'group-1',
        __task__result: 'آماده ارسال',
      }
    );

    expect(updates).toHaveLength(1);
    expect(updates[0].id).toBe('task-next');
    expect(updates[0].payload.recurrence_info?.[PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]?.handover_note)
      .toBe('آماده ارسال');
  });

  it('can target the second next task public fields', async () => {
    const updates: Array<{ id: string; payload: Record<string, any> }> = [];
    const taskRows = [
      { id: 'task-current', sort_order: 10, process_group_id: 'group-1', recurrence_info: {} },
      { id: 'task-next', sort_order: 20, process_group_id: 'group-1', recurrence_info: {} },
      { id: 'task-second-next', sort_order: 30, process_group_id: 'group-1', recurrence_info: {} },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          select: vi.fn(() => createOrderableTaskQuery(taskRows)),
          update: vi.fn((payload: Record<string, any>) => ({
            eq: vi.fn(async (_field: string, id: string) => {
              updates.push({ id, payload });
              return { data: null, error: null };
            }),
          })),
        };
      }
      return makeQuery(table);
    });

    await executeWorkflowAction(
      {
        id: 'action-next-2',
        type: 'send_to_next_stages',
        config: {
          field: createProcessNextStageFieldKey(2, 'task_report'),
          value_mode: 'static',
          value: 'گزارش منتقل شد',
        },
      },
      'customers',
      { id: 'source-1', task_id: 'task-current', process_group_id: 'group-1' }
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      id: 'task-second-next',
      payload: expect.objectContaining({ task_report: 'گزارش منتقل شد' }),
    });
  });
});

describe('evaluateWorkflowConditions', () => {
  it('requires all negative any-conditions on the same field to pass together', async () => {
    await expect(evaluateWorkflowConditions({
      conditionsAll: [{ id: 'all-1', field: 'is_overdue', operator: 'is_true' } as any],
      conditionsAny: [
        { id: 'any-1', field: 'status', operator: 'neq', value: 'done' } as any,
        { id: 'any-2', field: 'status', operator: 'neq', value: 'canceled' } as any,
      ],
      currentRecord: { is_overdue: true, status: 'done' },
      moduleId: 'tasks',
    })).resolves.toBe(false);

    await expect(evaluateWorkflowConditions({
      conditionsAll: [{ id: 'all-1', field: 'is_overdue', operator: 'is_true' } as any],
      conditionsAny: [
        { id: 'any-1', field: 'status', operator: 'neq', value: 'done' } as any,
        { id: 'any-2', field: 'status', operator: 'neq', value: 'canceled' } as any,
      ],
      currentRecord: { is_overdue: true, status: 'open' },
      moduleId: 'tasks',
    })).resolves.toBe(true);
  });

  it('keeps classic any-conditions as OR for non-negative groups', async () => {
    await expect(evaluateWorkflowConditions({
      conditionsAll: [],
      conditionsAny: [
        { id: 'any-1', field: 'status', operator: 'eq', value: 'open' } as any,
        { id: 'any-2', field: 'priority', operator: 'eq', value: 'high' } as any,
      ],
      currentRecord: { status: 'closed', priority: 'high' },
      moduleId: 'tasks',
    })).resolves.toBe(true);
  });
});

describe('runWorkflowsForEvent', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.sendSmsViaGateway.mockResolvedValue({ success: true, sent: 1 });
    vi.clearAllMocks();
  });

  it('hydrates the latest record snapshot before evaluating conditions', async () => {
    const recordId = '88888888-8888-4888-8888-888888888888';
    const workflowLogs: any[] = [];
    const workflowRows = [
      {
        id: 'wf-1',
        module_id: 'attendance_logs',
        name: 'ارسال پیامک ثبت تردد وب فرم',
        trigger_type: 'on_create',
        execution_mode: 'every_match',
        is_active: true,
        conditions_all: [
          { id: 'cond-1', field: 'source_type', operator: 'eq', value: 'web_form' },
        ],
        conditions_any: [],
        actions: [
          {
            id: 'action-1',
            type: 'send_sms',
            config: {
              message: 'ثبت شد',
              manual_numbers: ['09123456789'],
            },
          },
        ],
      },
    ];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'attendance_logs') {
        return {
          select: vi.fn(() =>
            createFilterableSelectQuery([
              { id: recordId, org_id: 'org-1', source_type: 'web_form' },
            ])
          ),
        };
      }

      if (table === 'workflows') {
        return {
          select: vi.fn(() => createFilterableSelectQuery(workflowRows)),
          update: vi.fn(() => ({
            eq: vi.fn(async () => ({ data: null, error: null })),
          })),
        };
      }

      if (table === 'workflow_logs') {
        return {
          select: vi.fn(() => createFilterableSelectQuery([])),
          insert: vi.fn(async (payload: any) => {
            workflowLogs.push(payload);
            return { data: null, error: null };
          }),
        };
      }

      return makeQuery(table);
    });

    await runWorkflowsForEvent({
      moduleId: 'attendance_logs',
      event: 'create',
      currentRecord: { id: recordId },
    });

    expect(mocks.sendSmsViaGateway).toHaveBeenCalledTimes(1);
    expect(workflowLogs).toEqual([
      expect.objectContaining({
        workflow_id: 'wf-1',
        module_id: 'attendance_logs',
        record_id: recordId,
        status: 'success',
      }),
    ]);
  });
});
