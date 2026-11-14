import { describe, expect, it } from 'vitest';
import { nextAgentTaskRunAt, normalizeAgentTaskConfig, normalizeAgentTaskSchedule, summarizeAgentTaskDeliveries } from './ai-agent-task-contract';

const allowed = { agentKeys: ['sales_leads'], moduleIds: ['marketing_leads', 'invoices'] };
export const taskDraft = () => ({ version: 1, agentKey: 'sales_leads', instruction: 'سرنخ‌های نیازمند پیگیری را بررسی کن',
  trigger: 'interval', schedule: { kind: 'daily', at: '۰۹:۳۰', timeZone: 'Asia/Tehran' },
  sourceModuleIds: ['marketing_leads'], notifyWhen: 'findings', sourceLimit: 100, threadId: null,
  deliveries: [{ channel: 'sms', numbers: ['۰۹۱۲۱۲۳۴۵۶۷'] }] });

describe('agent task contract', () => {
  it('normalizes Persian times and recipients while dropping unknown write instructions', () => {
    const task = normalizeAgentTaskConfig({ ...taskDraft(), orgId: 'another-org', actions: [{ type: 'delete_record' }] }, allowed);
    expect(task.schedule).toEqual({ kind: 'daily', at: '09:30', timeZone: 'Asia/Tehran' });
    expect(task.deliveries).toEqual([{ channel: 'sms', numbers: ['09121234567'] }]);
    expect(task).not.toHaveProperty('orgId');
    expect(task).not.toHaveProperty('actions');
  });
  it.each([
    { agentKey: 'hr_manager' }, { sourceModuleIds: ['employees'] }, { sourceModuleIds: [] },
    { deliveries: [{ channel: 'email', addresses: ['x@org.test\nBcc:evil@org.test'], subject: 'گزارش' }] },
    { deliveries: [{ channel: 'chat' }, { channel: 'chat' }] }, { notifyWhen: 'invented' },
    { sourceLimit: 5000 }, { deliveries: [] }, { instruction: '' },
  ])('rejects invalid or unauthorized tasks: %j', patch => {
    expect(() => normalizeAgentTaskConfig({ ...taskDraft(), ...patch }, allowed)).toThrow();
  });
  it('requires an explicit timezone and rejects ambiguous one-off timestamps', () => {
    expect(() => normalizeAgentTaskSchedule({ kind: 'daily', at: '09:00' })).toThrow();
    expect(() => normalizeAgentTaskSchedule({ kind: 'once', at: '2026-11-15T09:00', timeZone: 'Asia/Tehran' })).toThrow();
    expect(() => normalizeAgentTaskSchedule({ kind: 'daily', at: '25:00', timeZone: 'Asia/Tehran' })).toThrow();
  });
  it('represents create/upsert event triggers without an interval schedule', () => {
    const task = normalizeAgentTaskConfig({ ...taskDraft(), trigger: 'on_upsert' }, allowed);
    expect(task.trigger).toBe('on_upsert'); expect(task.schedule).toBeNull();
  });
  it('schedules at local Tehran clock time independently of server timezone', () => {
    const daily = { kind: 'daily' as const, at: '09:30', timeZone: 'Asia/Tehran' };
    expect(nextAgentTaskRunAt(daily, new Date('2026-11-14T05:59:00Z'))).toBe('2026-11-14T06:00:00.000Z');
    expect(nextAgentTaskRunAt(daily, new Date('2026-11-14T06:00:00Z'))).toBe('2026-11-15T06:00:00.000Z');
  });
  it('coalesces missed daily runs without sending a burst of old reports', () => {
    expect(nextAgentTaskRunAt({ kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' }, new Date('2026-11-20T10:00:00Z'))).toBe('2026-11-21T05:30:00.000Z');
  });
  it('handles weekly days and clamps end-of-month schedules', () => {
    expect(nextAgentTaskRunAt({ kind: 'weekly', at: '09:00', weekdays: [6], timeZone: 'Asia/Tehran' }, new Date('2026-11-14T06:00:00Z'))).toBe('2026-11-21T05:30:00.000Z');
    expect(nextAgentTaskRunAt({ kind: 'monthly', at: '09:00', day: 31, timeZone: 'Asia/Tehran' }, new Date('2026-02-01T00:00:00Z'))).toBe('2026-02-28T05:30:00.000Z');
  });
  it('handles DST gaps and sends only once during an overlapping local hour', () => {
    expect(nextAgentTaskRunAt({ kind: 'daily', at: '02:30', timeZone: 'America/New_York' }, new Date('2026-03-08T05:00:00Z'))).toBe('2026-03-08T07:00:00.000Z');
    const fall = { kind: 'daily' as const, at: '01:30', timeZone: 'America/New_York' };
    expect(nextAgentTaskRunAt(fall, new Date('2026-11-01T04:00:00Z'))).toBe('2026-11-01T05:30:00.000Z');
    expect(nextAgentTaskRunAt(fall, new Date('2026-11-01T05:31:00Z'))).toBe('2026-11-02T06:30:00.000Z');
  });
  it('supports one-time runs and bounded intervals', () => {
    expect(nextAgentTaskRunAt({ kind: 'once', at: '2026-11-15T09:00:00+03:30', timeZone: 'Asia/Tehran' }, new Date('2026-11-15T00:00:00Z'))).toBe('2026-11-15T05:30:00.000Z');
    expect(nextAgentTaskRunAt({ kind: 'once', at: '2026-11-15T09:00:00+03:30', timeZone: 'Asia/Tehran' }, new Date('2026-11-16T00:00:00Z'))).toBeNull();
    expect(() => normalizeAgentTaskSchedule({ kind: 'interval', minutes: 0, timeZone: 'Asia/Tehran' })).toThrow();
  });
  it('does not report success for failed, skipped or missing requested sends', () => {
    expect(summarizeAgentTaskDeliveries([{ channel: 'sms', status: 'success' }, { channel: 'email', status: 'failed' }]).status).toBe('failed');
    expect(summarizeAgentTaskDeliveries([{ channel: 'email', status: 'skipped' }]).status).toBe('failed');
    expect(summarizeAgentTaskDeliveries([]).status).toBe('failed');
  });
});
