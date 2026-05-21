import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertNotesWithFallback: vi.fn(),
  sendNoteSmsNotifications: vi.fn(),
  rowsByTable: {} as Record<string, any[]>,
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

import { runProcessAutomationsForTaskEvent } from './processAutomationRuntime';

const createSelectQuery = (rows: any[]) => {
  const filters: Array<{ type: 'eq' | 'neq'; field: string; value: any }> = [];

  const applyFilters = () =>
    rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === 'eq') return row?.[filter.field] === filter.value;
        if (filter.type === 'neq') return row?.[filter.field] !== filter.value;
        return true;
      })
    );

  const chain: any = {
    eq: (field: string, value: any) => {
      filters.push({ type: 'eq', field, value });
      return chain;
    },
    neq: (field: string, value: any) => {
      filters.push({ type: 'neq', field, value });
      return chain;
    },
    order: async (_field: string, _options?: { ascending?: boolean }) => ({
      data: applyFilters(),
      error: null,
    }),
    maybeSingle: async () => ({
      data: applyFilters()[0] ?? null,
      error: null,
    }),
  };

  return chain;
};

describe('processAutomationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertNotesWithFallback.mockResolvedValue(undefined);
    mocks.sendNoteSmsNotifications.mockResolvedValue({ recipients: [] });
    mocks.rowsByTable = {};
    mocks.from.mockImplementation((table: string) => {
      if (table === 'workflow_logs') {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
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
});
