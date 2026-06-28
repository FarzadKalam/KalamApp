import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  markModuleListChanged,
  readModuleListInvalidationMarker,
  subscribeToLocalModuleListInvalidation,
} from './moduleListLive';

describe('moduleListLive local invalidation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('stores the latest marker per org and module', () => {
    markModuleListChanged({
      org_id: 'org-1',
      module_id: 'projects',
      record_id: 'record-1',
      action: 'update',
      updated_at: '2026-06-28T12:00:00.000Z',
    });

    const marker = readModuleListInvalidationMarker({ orgId: 'org-1', moduleId: 'projects' });

    expect(marker?.module_id).toBe('projects');
    expect(marker?.record_id).toBe('record-1');
    expect(marker?.action).toBe('update');
    expect(marker?.sequence).toBeGreaterThan(0);
  });

  it('notifies subscribers in the same browser context', () => {
    const onInvalidate = vi.fn();
    const unsubscribe = subscribeToLocalModuleListInvalidation({
      orgId: 'org-1',
      moduleId: 'tasks',
      onInvalidate,
    });

    markModuleListChanged({
      org_id: 'org-1',
      module_id: 'tasks',
      record_id: 'task-1',
      action: 'update',
    });

    expect(onInvalidate).toHaveBeenCalledTimes(1);
    expect(onInvalidate.mock.calls[0]?.[0]?.record_id).toBe('task-1');

    unsubscribe();
  });
});
