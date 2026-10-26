import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyModuleListLocalChanges, clearModuleListLocalChanges, hasModuleListLocalChange } from './moduleListLocalRows';
import { markModuleListChanged, readModuleListInvalidationMarker } from './moduleListLive';

describe('saved row changes when returning to a module list', () => {
  const rows = [{ id: 'invoice-a', status: 'proforma', amount: 100 }, { id: 'invoice-b', status: 'final', amount: 200 }];
  beforeEach(() => { clearModuleListLocalChanges(); localStorage.clear(); vi.useRealTimers(); });
  const save = (patch: Record<string, any>, recordId = 'invoice-a') => markModuleListChanged({ org_id: 'org-a', user_id: 'user-a', module_id: 'invoices', record_id: recordId, action: 'update', record_patch: patch });
  it('overlays confirmed writes on cached rows without mutating the cache or fetching', () => {
    save({ status: 'final' });
    const next = applyModuleListLocalChanges(rows, 'org-a', 'invoices', 0, 'user-a');
    expect(next[0]).toEqual({ id: 'invoice-a', status: 'final', amount: 100 });
    expect(next[1]).toBe(rows[1]);
    expect(rows[0].status).toBe('proforma');
    const marker = readModuleListInvalidationMarker({ orgId: 'org-a', moduleId: 'invoices' });
    expect(hasModuleListLocalChange(marker)).toBe(true);
    expect(marker?.record_patch).toBeUndefined(); // no record contents in localStorage
  });
  it('fails closed across tenants and users and never adds rows outside the loaded result', () => {
    save({ status: 'final' }); save({ status: 'final' }, 'unloaded-invoice');
    expect(applyModuleListLocalChanges(rows, 'org-b', 'invoices', 0, 'user-a')).toBe(rows);
    expect(applyModuleListLocalChanges(rows, 'org-a', 'invoices', 0, 'user-b')).toBe(rows);
    expect(applyModuleListLocalChanges(rows, null, 'invoices', 0, 'user-a')).toBe(rows);
    expect(applyModuleListLocalChanges(rows, 'org-a', 'invoices', 0, 'user-a')).toHaveLength(2);
  });
  it('lets newer server data supersede the local overlay', () => {
    save({ status: 'final' });
    expect(applyModuleListLocalChanges(rows, 'org-a', 'invoices', Date.now() + 1, 'user-a')).toBe(rows);
  });
  it('removes deleted records from the cached page', () => {
    markModuleListChanged({ org_id: 'org-a', user_id: 'user-a', module_id: 'invoices', record_id: 'invoice-a', action: 'delete' });
    expect(applyModuleListLocalChanges(rows, 'org-a', 'invoices', 0, 'user-a')).toEqual([rows[1]]);
  });
});
