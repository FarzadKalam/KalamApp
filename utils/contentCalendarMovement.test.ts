import { describe, expect, it, vi } from 'vitest';
import { buildContentCalendarMovePatch, moveContentCalendarRecord } from './contentCalendarMovement';

describe('content calendar scheduling', () => {
  const record = { id: 'record', start_date: '2026-11-01T09:15:00Z', due_date: '2026-11-03T18:45:00Z', completed_at: '2026-11-04T20:00:00Z' };
  it('moves the selected day while preserving time and the activity duration', () => {
    const patch = buildContentCalendarMovePatch(record, 'due_date', '2026-11-05')!;
    expect(patch.due_date).toBe('2026-11-05T18:45:00.000Z');
    expect(patch.start_date).toBe('2026-11-03T09:15:00.000Z');
    expect(patch.completed_at).toBeUndefined();
  });
  it('moves completion independently and ignores same-day drops', () => {
    expect(buildContentCalendarMovePatch(record, 'completed_at', '2026-11-06')).toEqual({ completed_at: '2026-11-06T20:00:00.000Z' });
    expect(buildContentCalendarMovePatch(record, 'start_date', '2026-11-01')).toBeNull();
    expect(() => buildContentCalendarMovePatch(record, 'unknown', 'bad-date')).toThrow();
  });
  it('updates only the project and current org, requiring a saved row', async () => {
    const query: any = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { id: 'record' }, error: null }) };
    const client = { from: vi.fn(() => query) };
    await moveContentCalendarRecord(client, { kind: 'project', record, field: 'due_date', targetDay: '2026-11-05', orgId: 'current-org' });
    expect(client.from).toHaveBeenCalledExactlyOnceWith('projects');
    expect(query.eq.mock.calls).toEqual([['org_id', 'current-org'], ['id', 'record']]);
    query.single.mockResolvedValue({ data: null, error: null });
    await expect(moveContentCalendarRecord(client, { kind: 'task', record, field: 'due_date', targetDay: '2026-11-05', orgId: 'current-org' })).rejects.toThrow();
    await expect(moveContentCalendarRecord(client, { kind: 'task', record, field: 'due_date', targetDay: '2026-11-05', orgId: '' })).rejects.toThrow();
  });
});
