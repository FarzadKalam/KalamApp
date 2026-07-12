import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  chatGroups: [] as any[],
  profilesByUser: [] as any[],
  profilesByRole: [] as any[],
  rowsByTable: {} as Record<string, any[]>,
  from: vi.fn(),
  rpc: vi.fn(),
  insertNotesWithFallback: vi.fn(),
  sendNoteSmsNotifications: vi.fn(),
  sendSmsViaGateway: vi.fn(),
  sendBotMessageViaGateway: vi.fn(),
  sendCounterpartyBotGroupMessage: vi.fn(),
  activateInitialProcessRunNodes: vi.fn(),
  activateProcessStageAction: vi.fn(),
  authUser: null as any,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mocks.authUser } })),
    },
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

vi.mock('./botGateway', () => ({
  sendBotMessageViaGateway: mocks.sendBotMessageViaGateway,
  sendCounterpartyBotGroupMessage: mocks.sendCounterpartyBotGroupMessage,
}));

vi.mock('./processStageActivation', () => ({
  activateInitialProcessRunNodes: mocks.activateInitialProcessRunNodes,
  activateProcessStageAction: mocks.activateProcessStageAction,
}));

import { evaluateWorkflowConditions, executeWorkflowAction, runWorkflowsForEvent } from './workflowRuntime';
import { createProcessNextStageFieldKey, createWorkflowNoteRecipientFieldKey } from './workflowTypes';
import {
  PROCESS_TASK_CUSTOM_FIELDS_KEY,
  PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY,
} from './processTaskCustomFields';

const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DIRECT_USER_ID = '33333333-3333-4333-8333-333333333333';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

const makeQuery = (table: string) => ({
  select: vi.fn(() => {
    if (table === 'chat_groups') {
      return {
        in: vi.fn(async (_field: string, values: string[]) => ({
          data: mocks.chatGroups.filter((group) => values.includes(String(group.id))),
          error: null,
        })),
      };
    }
    if (table === 'profiles') {
      return {
        in: vi.fn(async (field: string, values: string[]) => {
          if (field === 'id') {
            return {
              data: mocks.profilesByUser.filter((profile) => values.includes(String(profile.id))),
              error: null,
            };
          }
          if (field === 'role_id') {
            return {
              data: mocks.profilesByRole.filter((profile) => values.includes(String(profile.role_id))),
              error: null,
            };
          }
          return { data: [], error: null };
        }),
      };
    }
    return createFilterableSelectQuery(mocks.rowsByTable[table] || []);
  }),
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
    mocks.rowsByTable = {};
    mocks.from.mockImplementation((table: string) => makeQuery(table));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.insertNotesWithFallback.mockResolvedValue(undefined);
    mocks.sendNoteSmsNotifications.mockResolvedValue({ recipients: [] });
    mocks.sendSmsViaGateway.mockResolvedValue({ success: true, sent: 0 });
    mocks.sendBotMessageViaGateway.mockResolvedValue({ ok: true });
    mocks.sendCounterpartyBotGroupMessage.mockResolvedValue({ ok: true });
    mocks.activateInitialProcessRunNodes.mockResolvedValue({ createdTaskIds: [], existingTaskIds: [] });
    mocks.activateProcessStageAction.mockResolvedValue({ createdTaskIds: [], existingTaskIds: [] });
    mocks.authUser = null;
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

  it('filters inactive users from workflow SMS recipients', async () => {
    mocks.profilesByUser = [
      { id: USER_ID, mobile_1: '09111111111', is_active: false },
      { id: DIRECT_USER_ID, mobile_1: '09333333333', is_active: true },
    ];
    mocks.profilesByRole = [
      { id: '66666666-6666-4666-8666-666666666666', role_id: ROLE_ID, mobile_1: '09222222222', is_active: false },
      { id: '77777777-7777-4777-8777-777777777777', role_id: ROLE_ID, mobile_1: '09444444444', is_active: true },
    ];

    await executeWorkflowAction(
      {
        id: 'action-active-sms',
        type: 'send_sms',
        config: {
          recipient_assignees: [`user:${USER_ID}`, `user:${DIRECT_USER_ID}`, `role:${ROLE_ID}`],
          message: 'سلام',
        },
      },
      'customers',
      { id: '55555555-5555-4555-8555-555555555555' }
    );

    expect(mocks.sendSmsViaGateway).toHaveBeenCalledTimes(1);
    expect(mocks.sendSmsViaGateway).toHaveBeenCalledWith(expect.objectContaining({
      to: ['09333333333', '09444444444'],
    }));
  });

  it('skips workflow system notes when all resolved user recipients are inactive', async () => {
    mocks.profilesByUser = [
      { id: USER_ID, is_active: false },
    ];
    mocks.profilesByRole = [
      { id: '66666666-6666-4666-8666-666666666666', role_id: ROLE_ID, is_active: false },
    ];

    await executeWorkflowAction(
      {
        id: 'action-inactive-note',
        type: 'send_note_sms',
        config: {
          recipient_assignees: [`user:${USER_ID}`, `role:${ROLE_ID}`],
          note_text: 'پیام تست',
        },
      },
      'customers',
      { id: '55555555-5555-4555-8555-555555555555' }
    );

    expect(mocks.insertNotesWithFallback).not.toHaveBeenCalled();
    expect(mocks.sendNoteSmsNotifications).not.toHaveBeenCalled();
  });

  it('publishes workflow stories with system identity and mention users', async () => {
    mocks.rowsByTable = {
      company_settings: [
        { org_id: 'org-1', logo_url: 'https://example.com/logo.png' },
      ],
    };

    await executeWorkflowAction(
      {
        id: 'action-story-1',
        type: 'publish_story',
        config: {
          text_template: 'استوری خودکار',
          gradient_key: 'brand_indigo',
          is_org_wide: true,
          mention_user_ids: [DIRECT_USER_ID, USER_ID],
        },
      },
      'customers',
      { id: 'customer-1', org_id: 'org-1' }
    );

    expect(mocks.rpc).toHaveBeenCalledWith(
      'create_workflow_org_story',
      expect.objectContaining({
        p_org_id: 'org-1',
        p_creator_id: null,
        p_creator_name: 'سیستم',
        p_creator_avatar: 'https://example.com/logo.png',
        p_mention_user_ids: [DIRECT_USER_ID, USER_ID],
      })
    );
  });

  it('skips workflow system notes that do not resolve any explicit recipients', async () => {
    await executeWorkflowAction(
      {
        id: 'action-empty-note',
        type: 'send_note_sms',
        config: {
          note_text: 'بدون گیرنده',
          recipient_assignees: [],
          recipient_fields: [],
        },
      },
      'customers',
      { id: '55555555-5555-4555-8555-555555555555' }
    );

    expect(mocks.insertNotesWithFallback).not.toHaveBeenCalled();
    expect(mocks.sendNoteSmsNotifications).not.toHaveBeenCalled();
  });

  it('resolves multi relation employee profile targets for workflow notes', async () => {
    mocks.rowsByTable = {
      employees: [
        { id: 'emp-1', related_profile_id: USER_ID },
        { id: 'emp-2', related_profile_id: DIRECT_USER_ID },
      ],
    };

    await executeWorkflowAction(
      {
        id: 'action-note-multi-relation',
        type: 'send_note_sms',
        config: {
          note_text: 'یادداشت چندگیرنده',
          recipient_fields: ['__workflow_multi_relation__meeting_employee_ids::employees::related_profile_id'],
          recipient_assignees: [],
        },
      },
      'tasks',
      {
        id: 'task-1',
        meeting_employee_ids: ['emp-1', 'emp-2'],
      }
    );

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        mention_user_ids: [USER_ID, DIRECT_USER_ID],
        mention_role_ids: [],
      }),
    ]);
    expect(mocks.sendNoteSmsNotifications).toHaveBeenCalledWith(expect.objectContaining({
      mentionUserIds: [USER_ID, DIRECT_USER_ID],
      mentionRoleIds: [],
    }));
  });

  it('normalizes direct user and role recipient fields for workflow notes', async () => {
    await executeWorkflowAction(
      {
        id: 'action-note-explicit-recipients',
        type: 'send_note_sms',
        config: {
          note_text: 'یادداشت برای مسئول و نقش',
          recipient_fields: [
            createWorkflowNoteRecipientFieldKey('recipient_profile_id', 'user'),
            createWorkflowNoteRecipientFieldKey('recipient_role_id', 'role'),
          ],
          recipient_assignees: [],
        },
      },
      'secretariat_documents',
      {
        id: 'doc-1',
        recipient_profile_id: DIRECT_USER_ID,
        recipient_role_id: ROLE_ID,
      }
    );

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        mention_user_ids: [DIRECT_USER_ID],
        mention_role_ids: [ROLE_ID],
      }),
    ]);
    expect(mocks.sendNoteSmsNotifications).toHaveBeenCalledWith(expect.objectContaining({
      mentionUserIds: [DIRECT_USER_ID],
      mentionRoleIds: [ROLE_ID],
    }));
  });

  it('adds org and actor identity to workflow note rows for strict tenant RLS', async () => {
    mocks.authUser = { id: DIRECT_USER_ID };

    await executeWorkflowAction(
      {
        id: 'action-note-identity',
        type: 'send_note',
        config: {
          note_text: 'یادداشت سازمانی',
          recipient_assignees: [`user:${USER_ID}`],
          recipient_fields: [],
        },
      },
      'customers',
      {
        id: 'customer-identity',
        org_id: 'org-identity',
      }
    );

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: 'org-identity',
        author_id: DIRECT_USER_ID,
        mention_user_ids: [USER_ID],
      }),
    ]);
  });

  it('sends telegram bot messages to multi relation chat ids', async () => {
    mocks.rowsByTable = {
      customers: [
        { id: 'customer-1', telegram_chat_id: 'tg-100' },
        { id: 'customer-2', telegram_chat_id: 'tg-200' },
      ],
    };

    await executeWorkflowAction(
      {
        id: 'action-telegram-multi-relation',
        type: 'send_telegram_bot',
        config: {
          message: 'سلام تلگرام',
          recipient_fields: ['__workflow_multi_relation__meeting_customer_ids::customers::telegram_chat_id'],
          recipient_assignees: [],
          manual_chat_ids: [],
        },
      },
      'tasks',
      {
        id: 'task-2',
        meeting_customer_ids: ['customer-1', 'customer-2'],
      }
    );

    expect(mocks.sendBotMessageViaGateway).toHaveBeenCalledTimes(2);
    expect(mocks.sendBotMessageViaGateway).toHaveBeenNthCalledWith(1, expect.objectContaining({
      channel: 'telegram',
      chatId: 'tg-100',
      text: 'سلام تلگرام',
    }));
    expect(mocks.sendBotMessageViaGateway).toHaveBeenNthCalledWith(2, expect.objectContaining({
      channel: 'telegram',
      chatId: 'tg-200',
      text: 'سلام تلگرام',
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

describe('formula-based workflow actions', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    vi.clearAllMocks();
  });

  it('updates the current record with a calculated formula value', async () => {
    const updates: Array<{ id: string; payload: Record<string, any> }> = [];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'customers') {
        return {
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
        id: 'action-formula-update',
        type: 'update_record',
        config: {
          field: 'score',
          value_mode: 'formula',
          formula_expression_text: '{{weight}} * 10 + {{bonus}}',
          formula_expression_config: {
            type: 'binary',
            operator: 'add',
            left: {
              type: 'binary',
              operator: 'multiply',
              left: { type: 'field', path: 'weight', fallback: 0 },
              right: { type: 'constant', value: 10 },
            },
            right: { type: 'field', path: 'bonus', fallback: 0 },
          },
        },
      },
      'customers',
      { id: 'record-1', weight: 3, bonus: 5 }
    );

    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({
      id: 'record-1',
      payload: expect.objectContaining({ score: 35 }),
    });
  });

  it('creates a related record with a calculated formula mapping', async () => {
    const inserts: Array<Record<string, any>> = [];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'invoices') {
        return {
          insert: vi.fn((payload: Record<string, any>) => {
            inserts.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'invoice-1' }, error: null })),
              })),
            };
          }),
        };
      }
      return makeQuery(table);
    });

    await executeWorkflowAction(
      {
        id: 'action-formula-create',
        type: 'create_related_record',
        config: {
          source_module_id: 'customers',
          target_module_id: 'invoices',
          relation_field_key: 'customer_id',
          field_mappings: [
            {
              id: 'mapping-1',
              field: 'total_amount',
              mode: 'formula',
              formula_expression_text: '{{amount}} * {{count}}',
              formula_expression_config: {
                type: 'binary',
                operator: 'multiply',
                left: { type: 'field', path: 'amount', fallback: 0 },
                right: { type: 'field', path: 'count', fallback: 0 },
              },
            },
          ],
        },
      },
      'customers',
      { id: 'customer-1', amount: 2500, count: 4 }
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.objectContaining({
      customer_id: 'customer-1',
      total_amount: 10000,
    }));
  });

  it('creates a related activity with normalized source linkage fields', async () => {
    const inserts: Array<Record<string, any>> = [];

    mocks.from.mockImplementation((table: string) => {
      if (table === 'tasks') {
        return {
          insert: vi.fn((payload: Record<string, any>) => {
            inserts.push(payload);
            return {
              select: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({ data: { id: 'task-1' }, error: null })),
              })),
            };
          }),
        };
      }
      return makeQuery(table);
    });

    await executeWorkflowAction(
      {
        id: 'action-task-create',
        type: 'create_related_record',
        config: {
          source_module_id: 'customers',
          target_module_id: 'tasks',
          field_mappings: [
            {
              id: 'mapping-1',
              field: 'name',
              mode: 'static',
              value: 'پیگیری مشتری',
            },
          ],
        },
      },
      'customers',
      { id: 'customer-1' }
    );

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual(expect.objectContaining({
      related_to_module: 'customers',
      source_module_id: 'customers',
      source_record_id: 'customer-1',
      related_customer: 'customer-1',
      name: 'پیگیری مشتری',
    }));
  });
});

describe('evaluateWorkflowConditions', () => {
  const mockHolidayCalendarFetch = () => {
    const months = Array.from({ length: 12 }, () => ({ days: [] as any[] }));
    months[2] = {
      days: [
        {
          day: { jalali: '۵', gregorian: '26', hijri: '١٠' },
          events: {
            isHoliday: true,
            list: [{ isHoliday: true, event: 'عید سعید قربان', calendarType: 'hijri' }],
          },
        },
        {
          day: { jalali: '۶', gregorian: '27', hijri: '١١' },
          events: { isHoliday: false, list: [] },
        },
        {
          day: { jalali: '۱۴', gregorian: '4', hijri: '١٩' },
          events: {
            isHoliday: true,
            list: [
              { isHoliday: true, event: 'رحلت حضرت امام خمینی', calendarType: 'jalali' },
              { isHoliday: true, event: 'عید سعید غدیر خم(۱۰ ه‍‍.ق)', calendarType: 'hijri' },
            ],
          },
        },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => months,
    }));
  };

  it('matches contains against any selected value in arrays', async () => {
    await expect(evaluateWorkflowConditions({
      conditionsAll: [
        { id: 'contains-1', field: 'status_tags', operator: 'contains', value: ['ready', 'urgent'] } as any,
      ],
      conditionsAny: [],
      currentRecord: { status_tags: ['draft', 'ready_to_ship'] },
      moduleId: 'tasks',
    })).resolves.toBe(true);
  });

  it('matches contains against relation-like objects', async () => {
    await expect(evaluateWorkflowConditions({
      conditionsAll: [
        { id: 'contains-2', field: 'product', operator: 'contains', value: ['چرم'] } as any,
      ],
      conditionsAny: [],
      currentRecord: { product: { id: 'product-1', label: 'کیف چرم طبیعی' } },
      moduleId: 'invoices',
    })).resolves.toBe(true);
  });

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

  it('matches date fields against calendar occasions', async () => {
    mockHolidayCalendarFetch();

    await expect(evaluateWorkflowConditions({
      conditionsAll: [
        { id: 'occasion-1', field: 'due_date', operator: 'occasion_eq', value: 'عید سعید قربان' } as any,
      ],
      conditionsAny: [],
      currentRecord: { due_date: '2026-05-27' },
      moduleId: 'tasks',
    })).resolves.toBe(true);

    await expect(evaluateWorkflowConditions({
      conditionsAll: [
        { id: 'occasion-2', field: 'due_date', operator: 'occasion_not_contains', value: ['عید سعید قربان'] } as any,
      ],
      conditionsAny: [],
      currentRecord: { due_date: '2026-05-26' },
      moduleId: 'tasks',
    })).resolves.toBe(true);
  });

  it('matches date fields that are N days before a selected occasion', async () => {
    mockHolidayCalendarFetch();

    await expect(evaluateWorkflowConditions({
      conditionsAll: [
        {
          id: 'occasion-before-1',
          field: 'due_date',
          operator: 'days_before_occasion',
          value: { days: 3, occasion: 'عید سعید غدیر خم' },
        } as any,
      ],
      conditionsAny: [],
      currentRecord: { due_date: '2026-06-01' },
      moduleId: 'tasks',
    })).resolves.toBe(true);
  });
});

describe('workflow process actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rowsByTable = {};
    mocks.from.mockImplementation((table: string) => makeQuery(table));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.activateInitialProcessRunNodes.mockResolvedValue({ createdTaskIds: [], existingTaskIds: [] });
    mocks.activateProcessStageAction.mockResolvedValue({ createdTaskIds: [], existingTaskIds: [] });
  });

  it('copies a process template by creating a process run without activating stages', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'process-run-1', error: null });
    const record = { id: 'record-1', org_id: 'org-1' };

    await executeWorkflowAction(
      {
        id: 'action-copy-process',
        type: 'copy_process_template',
        config: { template_id: 'template-1' },
      },
      'projects',
      record
    );

    expect(mocks.rpc).toHaveBeenCalledWith('create_process_run_from_template', {
      p_org_id: 'org-1',
      p_template_id: 'template-1',
      p_module_id: 'projects',
      p_record_id: 'record-1',
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    expect(record).toMatchObject({
      process_template_id: 'template-1',
      process_run_id: 'process-run-1',
    });
    expect(mocks.activateInitialProcessRunNodes).not.toHaveBeenCalled();
  });

  it('executes a process by creating a run and activating initial stages', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 'process-run-2', error: null });

    await executeWorkflowAction(
      {
        id: 'action-execute-process',
        type: 'execute_process',
        config: { template_id: 'template-2' },
      },
      'projects',
      { id: 'record-2', org_id: 'org-2' }
    );

    expect(mocks.rpc).toHaveBeenCalledWith('create_process_run_from_template', {
      p_org_id: 'org-2',
      p_template_id: 'template-2',
      p_module_id: 'projects',
      p_record_id: 'record-2',
      p_process_name: null,
      p_copied_mode: 'auto',
    });
    expect(mocks.activateInitialProcessRunNodes).toHaveBeenCalledWith({
      processRunId: 'process-run-2',
    });
  });

  it('delegates single-stage activation actions to the process stage runtime', async () => {
    const record = {
      id: 'task-1',
      org_id: 'org-1',
      process_run_id: 'process-run-3',
      process_node_key: 'stage_a',
    };
    const config = { stage_node_keys: ['stage_b'] };

    await executeWorkflowAction(
      {
        id: 'action-activate-stage',
        type: 'activate_specific_process_stage',
        config,
      },
      'tasks',
      record
    );

    expect(mocks.activateProcessStageAction).toHaveBeenCalledWith({
      actionType: 'activate_specific_process_stage',
      config,
      record,
      moduleId: 'tasks',
    });
  });
});

describe('runWorkflowsForEvent', () => {
  beforeEach(() => {
    mocks.from.mockReset();
    mocks.sendSmsViaGateway.mockResolvedValue({ success: true, sent: 1 });
    vi.clearAllMocks();
  });

  it('does not execute workflow actions in the browser', async () => {
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

    expect(mocks.sendSmsViaGateway).not.toHaveBeenCalled();
    expect(workflowLogs).toEqual([]);
  });
});
