import { describe, expect, it, vi } from 'vitest';
import {
  createProcessGroupId,
  mapProcessTemplateStagesToDraft,
} from './processRunRuntime';

describe('process run draft helpers', () => {
  it('creates a named unique process group for every template application', () => {
    vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1001);
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.111111)
      .mockReturnValueOnce(0.222222);

    const firstGroupId = createProcessGroupId();
    const secondGroupId = createProcessGroupId();

    const first = mapProcessTemplateStagesToDraft('template-1', [
      { id: 'stage-1', stage_name: 'طراحی', sort_order: 10, metadata: { task_type: 'طراحی' } },
    ], {
      groupId: firstGroupId,
      groupName: 'فرآیند طراحی',
      templateName: 'الگوی طراحی',
    });

    const second = mapProcessTemplateStagesToDraft('template-1', [
      { id: 'stage-1', stage_name: 'طراحی', sort_order: 10, metadata: { task_type: 'طراحی' } },
    ], {
      groupId: secondGroupId,
      groupName: 'فرآیند طراحی دوم',
      templateName: 'الگوی طراحی',
    });

    expect(first[0].source_template_id).toBe('template-1');
    expect(second[0].source_template_id).toBe('template-1');
    expect(first[0].process_group_id).not.toBe(second[0].process_group_id);
    expect(first[0].process_group_name).toBe('فرآیند طراحی');
    expect(second[0].process_group_name).toBe('فرآیند طراحی دوم');

    vi.restoreAllMocks();
  });
});
