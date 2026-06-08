import { describe, expect, it, vi } from 'vitest';
import {
  createProcessGroupId,
  buildProcessRunStageLookupKeys,
  ensureProcessRunForDraftStageGroup,
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

  it('normalizes prefixed assignees when applying template stages to a draft', () => {
    const roleId = '55555555-5555-4555-8555-555555555555';
    const userId = '66666666-6666-4666-8666-666666666666';

    const draft = mapProcessTemplateStagesToDraft('template-1', [
      { id: 'stage-1', stage_name: 'طراحی', default_assignee_id: `role:${roleId}`, sort_order: 10 },
      { id: 'stage-2', stage_name: 'چاپ', default_assignee_id: `user_${userId}`, sort_order: 20 },
    ]);

    expect(draft[0].default_assignee_id).toBeNull();
    expect(draft[0].default_assignee_role_id).toBe(roleId);
    expect(draft[1].default_assignee_id).toBe(userId);
    expect(draft[1].default_assignee_role_id).toBeNull();
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

  it('creates draft runtime stages through the atomic RPC', async () => {
    const roleId = '55555555-5555-4555-8555-555555555555';
    const rpc = vi.fn().mockResolvedValue({
      data: {
        process_run_id: '11111111-1111-4111-8111-111111111111',
        stages: [{
          id: '22222222-2222-4222-8222-222222222222',
          draft_stage_id: 'draft-stage-1',
          template_stage_id: null,
          stage_name: 'طراحی',
          sort_order: 10,
        }],
      },
      error: null,
    });
    const from = vi.fn((table: string) => {
      expect(table).toBe('projects');
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { org_id: '33333333-3333-4333-8333-333333333333' },
            }),
          }),
        }),
      };
    });

    const result = await ensureProcessRunForDraftStageGroup({
      supabaseClient: { from, rpc },
      moduleId: 'projects',
      recordId: '44444444-4444-4444-8444-444444444444',
      stages: [{
        id: 'draft-stage-1',
        name: 'طراحی',
        sort_order: 10,
        process_group_id: 'group-a',
        default_assignee_id: `role:${roleId}`,
      }],
      targetStage: {
        id: 'draft-stage-1',
        name: 'طراحی',
        sort_order: 10,
        process_group_id: 'group-a',
      },
    });

    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('ensure_process_run_for_draft_group', expect.objectContaining({
      p_module_id: 'projects',
      p_process_group_id: 'group-a',
    }));
    expect(rpc.mock.calls[0][1].p_stages[0]).toEqual(expect.objectContaining({
      assignee_user_id: null,
      assignee_role_id: roleId,
    }));
    expect(result.processRunId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.processRunStageId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('uses the selected target assignee for the stage being converted', async () => {
    const selectedUserId = '66666666-6666-4666-8666-666666666666';
    const staleRoleId = '77777777-7777-4777-8777-777777777777';
    const rpc = vi.fn().mockResolvedValue({
      data: {
        process_run_id: '11111111-1111-4111-8111-111111111111',
        stages: [],
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { org_id: '33333333-3333-4333-8333-333333333333' },
          }),
        }),
      }),
    }));

    await ensureProcessRunForDraftStageGroup({
      supabaseClient: { from, rpc },
      moduleId: 'projects',
      recordId: '44444444-4444-4444-8444-444444444444',
      stages: [{
        id: 'draft-stage-1',
        name: 'طراحی',
        sort_order: 10,
        process_group_id: 'group-a',
        default_assignee_role_id: `role:${staleRoleId}`,
      }],
      targetStage: {
        id: 'draft-stage-1',
        name: 'طراحی',
        sort_order: 10,
        process_group_id: 'group-a',
        default_assignee_id: selectedUserId,
        default_assignee_role_id: null,
      },
    });

    expect(rpc.mock.calls[0][1].p_stages[0]).toEqual(expect.objectContaining({
      assignee_user_id: selectedUserId,
      assignee_role_id: null,
    }));
  });

  it('can limit runtime stage creation to only the converted draft stage', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        process_run_id: '11111111-1111-4111-8111-111111111111',
        stages: [{
          id: '22222222-2222-4222-8222-222222222222',
          draft_stage_id: 'draft-stage-2',
          template_stage_id: null,
          stage_name: 'چاپ',
          sort_order: 20,
        }],
      },
      error: null,
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { org_id: '33333333-3333-4333-8333-333333333333' },
          }),
        }),
      }),
    }));

    const result = await ensureProcessRunForDraftStageGroup({
      supabaseClient: { from, rpc },
      moduleId: 'projects',
      recordId: '44444444-4444-4444-8444-444444444444',
      stages: [
        { id: 'draft-stage-1', name: 'طراحی', sort_order: 10, process_group_id: 'group-a' },
        { id: 'draft-stage-2', name: 'چاپ', sort_order: 20, process_group_id: 'group-a' },
        { id: 'draft-stage-3', name: 'تحویل', sort_order: 30, process_group_id: 'group-a' },
      ],
      targetStage: {
        id: 'draft-stage-2',
        name: 'چاپ',
        sort_order: 20,
        process_group_id: 'group-a',
      },
      stageScope: 'target',
    });

    expect(rpc.mock.calls[0][1].p_stages).toHaveLength(1);
    expect(rpc.mock.calls[0][1].p_stages[0]).toMatchObject({
      draft_stage_id: 'draft-stage-2',
      stage_name: 'چاپ',
      sort_order: 20,
    });
    expect(result.processRunStageId).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('keeps task creation available while the runtime RPC migration is pending', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: 'PGRST202',
        message: 'Could not find the function public.ensure_process_run_for_draft_group',
      },
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { org_id: '33333333-3333-4333-8333-333333333333' },
          }),
        }),
      }),
    }));

    const result = await ensureProcessRunForDraftStageGroup({
      supabaseClient: { from, rpc },
      moduleId: 'projects',
      recordId: '44444444-4444-4444-8444-444444444444',
      stages: [{
        id: 'draft-stage-1',
        name: 'طراحی',
        process_group_id: 'group-a',
      }],
    });

    expect(result.processRunId).toBeNull();
    expect(result.processRunStageId).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('keeps task creation available when runtime linking is denied by the server', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: {
        code: '42501',
        message: 'دسترسی ایجاد اجرای فرآیند برای این سازمان وجود ندارد.',
      },
    });
    const from = vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { org_id: '33333333-3333-4333-8333-333333333333' },
          }),
        }),
      }),
    }));

    const result = await ensureProcessRunForDraftStageGroup({
      supabaseClient: { from, rpc },
      moduleId: 'projects',
      recordId: '44444444-4444-4444-8444-444444444444',
      stages: [{
        id: 'draft-stage-1',
        name: 'طراحی',
        process_group_id: 'group-a',
      }],
    });

    expect(result.processRunId).toBeNull();
    expect(result.processRunStageId).toBeNull();
  });
});
