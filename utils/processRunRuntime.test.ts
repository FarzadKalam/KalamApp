import { describe, expect, it, vi } from 'vitest';
import {
  createProcessGroupId,
  buildProcessRunStageLookupKeys,
  ensureProcessRunContextsForStageGroups,
  mapProcessTemplateStagesToDraft,
  resolveProcessRunStageId,
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

  it('resolves a run stage from the shared group stage map', () => {
    const stage = {
      id: 'draft-stage-1',
      name: 'طراحی',
      sort_order: 10,
    };
    const lookupKeys = buildProcessRunStageLookupKeys(stage);
    const stageMap = new Map(lookupKeys.map((key) => [key, 'run-stage-1']));

    expect(resolveProcessRunStageId(stageMap, stage)).toBe('run-stage-1');
    expect(resolveProcessRunStageId(stageMap, { name: 'چاپ', sort_order: 20 })).toBeNull();
  });

  it('ensures a process run only once for each process group', async () => {
    const ensureGroup = vi.fn(async (_stage: any, groupId: string) => ({
      processRunId: `run-${groupId}`,
      processRunStageId: null,
      stageMap: new Map<string, string>(),
    }));

    const contexts = await ensureProcessRunContextsForStageGroups([
      { id: 'stage-1', process_group_id: 'group-a' },
      { id: 'stage-2', process_group_id: 'group-a' },
      { id: 'stage-3', process_group_id: 'group-b' },
    ], ensureGroup);

    expect(ensureGroup).toHaveBeenCalledTimes(2);
    expect(contexts.get('group-a')?.processRunId).toBe('run-group-a');
    expect(contexts.get('group-b')?.processRunId).toBe('run-group-b');
  });
});
