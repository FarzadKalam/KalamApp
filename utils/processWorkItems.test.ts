import { describe, expect, it } from 'vitest';
import {
  dedupeProcessWorkItems,
  getPreferredProcessRecordRef,
  type ProcessWorkItem,
} from './processWorkItems';

const buildItem = (overrides: Partial<ProcessWorkItem> = {}): ProcessWorkItem => ({
  key: 'source',
  moduleId: 'invoices',
  recordId: 'invoice-1',
  lineId: null,
  groupId: 'process-group-1',
  templateId: 'template-1',
  templateName: 'فرآیند نمونه',
  updatedAt: '2026-07-20T10:00:00Z',
  processStatus: 'in_progress',
  reason: 'task',
  processLinks: {},
  ...overrides,
});

describe('process work items', () => {
  it('keeps a process group only once while retaining all related records', () => {
    const items = dedupeProcessWorkItems([
      buildItem({
        moduleId: 'invoices',
        recordId: 'invoice-1',
        processLinks: { invoices: 'invoice-1' },
      }),
      buildItem({
        moduleId: 'customers',
        recordId: 'customer-1',
        updatedAt: '2026-07-20T11:00:00Z',
        processLinks: { projects: 'project-1', customers: 'customer-1' },
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].key).toBe('group:process-group-1');
    expect(items[0].processLinks).toMatchObject({
      invoices: 'invoice-1',
      projects: 'project-1',
      customers: 'customer-1',
    });
  });

  it('uses the requested related-record priority and respects module access', () => {
    const item = buildItem({
      processLinks: {
        employees: 'employee-1',
        customers: 'customer-1',
        projects: 'project-1',
      },
    });

    expect(getPreferredProcessRecordRef(item)).toEqual({ moduleId: 'projects', recordId: 'project-1' });
    expect(getPreferredProcessRecordRef(item, (moduleId) => !['projects', 'invoices'].includes(moduleId))).toEqual({
      moduleId: 'customers',
      recordId: 'customer-1',
    });
  });
});
