import { describe, expect, it, vi } from 'vitest';
import { getContentCalendarStatus, getContentCalendarLegend } from './contentCalendarPresentation';

vi.mock('../supabaseClient', () => ({ supabase: {}, SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'test' }));

describe('content calendar status presentation', () => {
  it('uses Persian project labels and the configured color', () => {
    expect(getContentCalendarStatus({ status: 'planning' }, 'project')).toEqual({ kind: 'project', label: 'برنامه‌ریزی', color: '#3b82f6' });
    expect(getContentCalendarStatus({ status: 'in_progress' }, 'project').label).toBe('در حال اجرا');
  });
  it('uses the current public custom status without exposing internal identifiers', () => {
    const status = getContentCalendarStatus({ status: 'custom_approval', status_presentation: { label: 'آماده انتشار', color: 'purple' } }, 'task');
    expect(status.label).toBe('آماده انتشار');
    expect(status.color).toBe('#8b5cf6');
    expect(getContentCalendarStatus({ status: 'unknown_internal' }, 'project').label).toBe('وضعیت نامشخص');
    expect(getContentCalendarLegend([status, status])).toEqual([status]);
  });
});
