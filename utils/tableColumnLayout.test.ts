import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { clampTableColumnWidth, estimateTableColumnWidth, readTableColumnPreferences, reconcileTableColumnOrder } from './tableColumnLayout';

describe('table column layout', () => {
  it('keeps short fields compact instead of assigning every name field a large width', () => {
    const compact = estimateTableColumnWidth({ field: { key: 'first_name', type: FieldType.TEXT }, label: 'نام', samples: ['علی', 'حسن'] });
    const title = estimateTableColumnWidth({ field: { key: 'title', type: FieldType.TEXT }, label: 'عنوان', samples: ['عنوان یک رکورد با متن طولانی‌تر'], primary: true });
    expect(compact).toBeLessThan(180);
    expect(title).toBeGreaterThan(compact);
  });
  it('bounds unusually long content and preserves process card space', () => {
    expect(estimateTableColumnWidth({ field: { key: 'name', type: FieldType.TEXT }, label: 'عنوان', samples: ['x'.repeat(1000)], primary: true, mobile: true })).toBe(260);
    expect(estimateTableColumnWidth({ field: { key: 'run_stages_preview', type: FieldType.PROGRESS_STAGES }, label: 'فرآیند', samples: [] })).toBe(460);
    expect(clampTableColumnWidth(-20)).toBe(64);
  });
  it('ignores removed columns and appends newly visible ones without duplicate headers', () => {
    expect(reconcileTableColumnOrder(['name', 'status', 'amount'], ['status', 'deleted', 'name', 'name'])).toEqual(['status', 'name', 'amount']);
  });
  it('reads only the exact user/org/view key and rejects corrupt widths', () => {
    localStorage.setItem('org-a:user-a:view', JSON.stringify({ order: ['status'], widths: { status: 120, name: 'invalid' } }));
    expect(readTableColumnPreferences('org-a:user-a:view')).toEqual({ order: ['status'], widths: { status: 120 } });
    expect(readTableColumnPreferences('org-b:user-a:view')).toEqual({ order: [], widths: {} });
  });
});
