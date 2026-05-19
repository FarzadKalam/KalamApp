import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insertNotesWithFallback: vi.fn(),
  sendNoteSmsNotifications: vi.fn(),
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

describe('processAutomationRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertNotesWithFallback.mockResolvedValue(undefined);
    mocks.sendNoteSmsNotifications.mockResolvedValue({ recipients: [] });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'workflow_logs') {
        return {
          insert: vi.fn(async () => ({ data: null, error: null })),
        };
      }
      throw new Error(`Unexpected table ${table}`);
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
});
