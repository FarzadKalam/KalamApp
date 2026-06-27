import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorkflowNoteRecipientFieldKey } from './workflowTypes';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertNotesWithFallback: vi.fn(),
  sendNoteSmsNotifications: vi.fn(),
  rowsByTable: {} as Record<string, any[]>,
  workflowLogRows: [] as any[],
  authUser: null as any,
}));

vi.mock('../supabaseClient', () => ({
  supabase: {
    from: mocks.from,
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

import { runProcessAutomationsForTaskEvent } from './processAutomationRuntime';

const createSelectQuery = (rows: any[]) => {
  const filters: Array<{ type: 'eq' | 'neq'; field: string; value: any }> = [];
  let limitCount: number | null = null;

  const applyFilters = () =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === 'eq') return row?.[filter.field] === filter.value;
        if (filter.type === 'neq') return row?.[filter.field] !== filter.value;
        return true;
      })
    ).slice(0, limitCount ?? undefined);

  const chain: any = {
    eq: (field: string, value: any) => {
      filters.push({ type: 'eq', field, value });
      return chain;
    },
    neq: (field: string, value: any) => {
      filters.push({ type: 'neq', field, value });
      return chain;
    },
    contains: (_field: string, _value: any) => chain,
    order: (_field: string, _options?: { ascending?: boolean }) => chain,
    limit: (count: number) => {
      limitCount = count;
      return chain;
    },
    maybeSingle: async () => ({
      data: applyFilters()[0] ?? null,
      error: null,
    }),
    then: (resolve: any, reject: any) => Promise.resolve({
      data: applyFilters(),
      error: null,
    }).then(resolve, reject),
  };

  return chain;
};

describe('processAutomationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertNotesWithFallback.mockResolvedValue(undefined);
    mocks.sendNoteSmsNotifications.mockResolvedValue({ recipients: [] });
    mocks.rowsByTable = {};
    mocks.workflowLogRows = [];
    mocks.authUser = null;
    mocks.from.mockImplementation((table: string) => {
      if (table === 'workflow_logs') {
        return {
          select: vi.fn(() => createSelectQuery(mocks.rowsByTable[table] || [])),
          insert: vi.fn(async (payload: any) => {
            mocks.workflowLogRows.push(payload);
            return { data: null, error: null };
          }),
        };
      }
      return {
        select: vi.fn(() => createSelectQuery(mocks.rowsByTable[table] || [])),
      };
    });
  });

  it('skips process automation system notes that do not resolve any explicit recipients', async () => {
    await runProcessAutomationsForTaskEvent({
      event: 'create',
      task: {
        id: 'task-1',
        name: 'فعالیت تست',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-empty-note',
              is_active: true,
              trigger_type: 'on_create',
              execution_mode: 'every_match',
              target_type: 'specific_user',
              actions: [
                {
                  id: 'action-empty-note',
                  type: 'send_note_sms',
                  config: {
                    note_text: 'بدون گیرنده',
                    recipient_fields: [],
                    attachment_fields: [],
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).not.toHaveBeenCalled();
    expect(mocks.sendNoteSmsNotifications).not.toHaveBeenCalled();
  });

  it('skips process automations for tasks whose process run is in the recycle bin', async () => {
    mocks.rowsByTable = {
      recycle_bin_records: [
        {
          id: 'recycle-run-1',
          source_table: 'process_runs',
          source_record_id: 'run-1',
        },
      ],
    };

    await runProcessAutomationsForTaskEvent({
      event: 'create',
      task: {
        id: 'task-recycled-parent',
        name: 'فعالیت حذف‌شده',
        process_run_id: 'run-1',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-recycled-parent',
              is_active: true,
              trigger_type: 'on_create',
              execution_mode: 'every_match',
              target_type: 'specific_user',
              target_user_id: 'user-1',
              actions: [
                {
                  id: 'action-recycled-parent',
                  type: 'send_note',
                  config: {
                    note_text: 'نباید اجرا شود',
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).not.toHaveBeenCalled();
    expect(mocks.workflowLogRows).toHaveLength(0);
  });

  it('resolves multi relation note recipients from the source record', async () => {
    mocks.rowsByTable = {
      tasks: [],
      projects: [
        {
          id: 'project-1',
          stakeholder_ids: ['emp-1', 'emp-2'],
        },
      ],
      employees: [
        { id: 'emp-1', related_profile_id: 'profile-1' },
        { id: 'emp-2', related_profile_id: 'profile-2' },
      ],
    };

    await runProcessAutomationsForTaskEvent({
      event: 'create',
      task: {
        id: 'task-2',
        name: 'فعالیت پروژه',
        source_module_id: 'projects',
        source_record_id: 'project-1',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-multi-relation-note',
              is_active: true,
              trigger_type: 'on_create',
              execution_mode: 'every_match',
              target_type: 'specific_user',
              target_user_id: 'fallback-user',
              actions: [
                {
                  id: 'action-multi-relation-note',
                  type: 'send_note_sms',
                  config: {
                    note_text: 'به اعضای پروژه اطلاع بده',
                    recipient_fields: ['__workflow_multi_relation__stakeholder_ids::employees::related_profile_id'],
                    attachment_fields: [],
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledTimes(1);
    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        mention_user_ids: ['profile-1', 'profile-2'],
        mention_role_ids: [],
      }),
    ]);
    expect(mocks.sendNoteSmsNotifications).toHaveBeenCalledWith(expect.objectContaining({
      mentionUserIds: ['profile-1', 'profile-2'],
      mentionRoleIds: [],
    }));
  });

  it('resolves wrapped user and role recipient fields from the source record', async () => {
    mocks.rowsByTable = {
      secretariat_documents: [
        {
          id: 'doc-1',
          recipient_profile_id: 'profile-9',
          recipient_role_id: 'role-9',
        },
      ],
    };

    await runProcessAutomationsForTaskEvent({
      event: 'create',
      task: {
        id: 'task-3',
        name: 'فعالیت دبیرخانه',
        source_module_id: 'secretariat_documents',
        source_record_id: 'doc-1',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-direct-recipient-note',
              is_active: true,
              trigger_type: 'on_create',
              execution_mode: 'every_match',
              target_type: 'specific_user',
              target_user_id: 'fallback-user',
              actions: [
                {
                  id: 'action-direct-recipient-note',
                  type: 'send_note_sms',
                  config: {
                    note_text: 'اطلاع به گیرنده‌ها',
                    recipient_fields: [
                      createWorkflowNoteRecipientFieldKey('recipient_profile_id', 'user'),
                      createWorkflowNoteRecipientFieldKey('recipient_role_id', 'role'),
                    ],
                    attachment_fields: [],
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        mention_user_ids: ['profile-9'],
        mention_role_ids: ['role-9'],
      }),
    ]);
    expect(mocks.sendNoteSmsNotifications).toHaveBeenCalledWith(expect.objectContaining({
      mentionUserIds: ['profile-9'],
      mentionRoleIds: ['role-9'],
    }));
  });

  it('carries org and actor identity into process automation notes and logs', async () => {
    mocks.authUser = { id: 'actor-1' };

    await runProcessAutomationsForTaskEvent({
      event: 'create',
      currentUser: { id: 'actor-1' },
      task: {
        id: 'task-identity',
        name: 'فعالیت سازمانی',
        org_id: 'org-identity',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-note-identity',
              is_active: true,
              trigger_type: 'on_create',
              execution_mode: 'every_match',
              target_type: 'specific_user',
              target_user_id: 'profile-identity',
              actions: [
                {
                  id: 'action-note-identity',
                  type: 'send_note',
                  config: {
                    note_text: 'یادداشت سازمانی',
                    recipient_fields: [],
                    attachment_fields: [],
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: 'org-identity',
        author_id: 'actor-1',
        mention_user_ids: ['profile-identity'],
      }),
    ]);
    expect(mocks.workflowLogRows).toContainEqual(expect.objectContaining({
      org_id: 'org-identity',
      status: 'success',
      module_id: 'tasks',
      record_id: 'task-identity',
      details: expect.objectContaining({
        actor_id: 'actor-1',
      }),
    }));
  });

  it('keeps interval process automation notes org-scoped', async () => {
    mocks.authUser = { id: 'actor-interval' };

    await runProcessAutomationsForTaskEvent({
      event: 'interval',
      currentUser: { id: 'actor-interval' },
      task: {
        id: 'task-interval',
        name: 'فعالیت زمان‌بندی‌شده',
        org_id: 'org-interval',
        recurrence_info: {
          process_automation_rules: [
            {
              id: 'rule-interval-note',
              is_active: true,
              trigger_type: 'interval',
              execution_mode: 'every_match',
              interval_value: 1,
              interval_unit: 'day',
              target_type: 'specific_user',
              target_user_id: 'profile-interval',
              actions: [
                {
                  id: 'action-interval-note',
                  type: 'send_note',
                  config: {
                    note_text: 'یادآوری زمان‌بندی‌شده',
                    recipient_fields: [],
                    attachment_fields: [],
                  },
                },
              ],
            },
          ],
        },
      },
    });

    expect(mocks.insertNotesWithFallback).toHaveBeenCalledWith([
      expect.objectContaining({
        org_id: 'org-interval',
        author_id: 'actor-interval',
        mention_user_ids: ['profile-interval'],
      }),
    ]);
    expect(mocks.workflowLogRows).toContainEqual(expect.objectContaining({
      org_id: 'org-interval',
      status: 'success',
      details: expect.objectContaining({
        process_automation_event: 'interval',
      }),
    }));
  });
});
