import React from 'react';
import { App } from 'antd';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ensureProcessRunContextsForStageGroups,
  ensureProcessRunForDraftStageGroup,
  mapProcessTemplateStagesToDraft,
  removeDraftStagesForProcessGroups,
  resolveProcessRunStageId,
  syncProcessRunStageFromTask,
} from '../../utils/processRunRuntime';
import { normalizeTaskAssigneeForDirectory } from '../../utils/assigneeValue';
import { deriveProjectStatusFromProcessState } from '../../utils/projectProcessStatus';
import { openTaskProcessModal } from '../../utils/taskProcessModalEvents';

const mocks = vi.hoisted(() => ({
  productionStagesField: vi.fn((props: any) => (
    <div
      data-testid="global-process-modal"
      data-module-id={props.moduleId}
      data-record-id={props.recordId}
      data-task-id={props.autoOpenTaskId}
    />
  )),
  runSelectWithCompatibleColumns: vi.fn(),
}));

vi.mock('../ProductionStagesField', () => ({
  default: mocks.productionStagesField,
}));

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-test-key',
  supabase: {
    from: vi.fn(),
  },
  supabaseSignUpClient: {
    from: vi.fn(),
  },
}));

vi.mock('../../utils/selectCompat', () => ({
  runSelectWithCompatibleColumns: mocks.runSelectWithCompatibleColumns,
}));

import GlobalTaskProcessModalHost from './GlobalTaskProcessModalHost';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ORG_ROLE_ID = '99999999-9999-4999-8999-999999999999';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const TEMPLATE_ID = '33333333-3333-4333-8333-333333333333';
const USER_A_ID = '44444444-4444-4444-8444-444444444444';
const USER_B_ID = '55555555-5555-4555-8555-555555555555';
const ROLE_QA_ID = '66666666-6666-4666-8666-666666666666';

const currentOrgAssignees = {
  users: [{ id: USER_A_ID }, { id: USER_B_ID }],
  roles: [{ id: ROLE_QA_ID }],
};

const createRuntimeSupabase = () => {
  const rpc = vi.fn(async (functionName: string, args: any) => {
    if (functionName === 'ensure_process_run_for_draft_group_v2') {
      return {
        data: {
          process_run_id: '77777777-7777-4777-8777-777777777777',
          stages: (args?.p_stages || []).map((stage: any, index: number) => ({
            id: `88888888-8888-4888-8888-88888888888${Math.max(0, Number(stage?.sort_order || ((index + 1) * 10)) / 10 - 1)}`,
            draft_stage_id: stage.draft_stage_id,
            template_stage_id: stage.template_stage_id,
            stage_name: stage.stage_name,
            sort_order: stage.sort_order,
          })),
        },
        error: null,
      };
    }

    if (functionName === 'sync_process_run_stage_from_task') {
      return { data: null, error: null };
    }

    return {
      data: null,
      error: { code: '42883', message: `unknown rpc ${functionName}` },
    };
  });

  const from = vi.fn((table: string) => {
    expect(table).toBe('projects');
    return {
      select: () => ({
        eq: (_field: string, value: string) => ({
          maybeSingle: async () => ({
            data: value === PROJECT_ID ? { org_id: ORG_ID } : null,
            error: null,
          }),
        }),
      }),
    };
  });

  return { from, rpc };
};

const createMultiStageTemplateDraft = () =>
  mapProcessTemplateStagesToDraft(TEMPLATE_ID, [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      stage_name: 'طراحی اولیه',
      sort_order: 10,
      default_assignee_id: `user:${USER_A_ID}`,
      metadata: { task_type: 'طراحی' },
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
      stage_name: 'کنترل کیفیت',
      sort_order: 20,
      default_assignee_id: `role:${ROLE_QA_ID}`,
      metadata: { task_type: 'بازبینی' },
    },
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3',
      stage_name: 'تحویل نهایی',
      sort_order: 30,
      default_assignee_id: `role:${OTHER_ORG_ROLE_ID}`,
      metadata: { task_type: 'تحویل' },
    },
  ], {
    groupId: 'process_group_main',
    groupName: 'فرآیند اجرای سفارش',
    templateName: 'الگوی چند مرحله‌ای سفارش',
    targetModuleIds: ['projects'],
    processLinkMap: { projects: PROJECT_ID },
  });

const buildTaskPayloadFromDraftStage = async ({
  supabaseClient,
  draftStages,
  targetStage,
}: {
  supabaseClient: any;
  draftStages: any[];
  targetStage: any;
}) => {
  const runtime = await ensureProcessRunForDraftStageGroup({
    supabaseClient,
    moduleId: 'projects',
    recordId: PROJECT_ID,
    stages: draftStages,
    stageScope: 'target',
    targetStage,
  });

  return normalizeTaskAssigneeForDirectory({
    id: `task-${targetStage.sort_order}`,
    name: targetStage.name,
    status: 'todo',
    assignee_id: targetStage.default_assignee_id,
    assignee_role_id: targetStage.default_assignee_role_id,
    assignee_type: targetStage.default_assignee_role_id ? 'role' : 'user',
    task_type: targetStage.task_type,
    sort_order: targetStage.sort_order,
    source_template_id: targetStage.source_template_id,
    source_stage_sort_order: targetStage.sort_order,
    process_group_id: targetStage.process_group_id,
    process_run_id: runtime.processRunId,
    process_run_stage_id: runtime.processRunStageId,
    source_module_id: 'projects',
    source_record_id: PROJECT_ID,
    project_id: PROJECT_ID,
  }, currentOrgAssignees);
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('process draft task flow', () => {
  it('creates single tasks from a multi-stage process template for different people, roles, and task types', async () => {
    const supabaseClient = createRuntimeSupabase();
    const draftStages = createMultiStageTemplateDraft();

    const designTask = await buildTaskPayloadFromDraftStage({
      supabaseClient,
      draftStages,
      targetStage: draftStages[0],
    });
    const qaTask = await buildTaskPayloadFromDraftStage({
      supabaseClient,
      draftStages,
      targetStage: draftStages[1],
    });
    const deliveryTask = await buildTaskPayloadFromDraftStage({
      supabaseClient,
      draftStages,
      targetStage: draftStages[2],
    });

    expect(designTask).toMatchObject({
      name: 'طراحی اولیه',
      task_type: 'طراحی',
      assignee_id: USER_A_ID,
      assignee_role_id: null,
      assignee_type: 'user',
      process_run_id: '77777777-7777-4777-8777-777777777777',
      process_run_stage_id: '88888888-8888-4888-8888-888888888880',
    });
    expect(qaTask).toMatchObject({
      name: 'کنترل کیفیت',
      task_type: 'بازبینی',
      assignee_id: null,
      assignee_role_id: ROLE_QA_ID,
      assignee_type: 'role',
      process_run_stage_id: '88888888-8888-4888-8888-888888888881',
    });
    expect(deliveryTask).toMatchObject({
      name: 'تحویل نهایی',
      task_type: 'تحویل',
      assignee_id: null,
      assignee_role_id: null,
      assignee_type: null,
      process_run_stage_id: '88888888-8888-4888-8888-888888888882',
    });
    expect(supabaseClient.rpc).toHaveBeenCalledTimes(3);
    expect(supabaseClient.rpc.mock.calls[0][1].p_org_id).toBe(ORG_ID);
    expect(supabaseClient.rpc.mock.calls.map(([, args]) => args.p_stages)).toSatisfy(
      (calls: any[]) => calls.every((stages: any[]) => Array.isArray(stages) && stages.length === 1)
    );
  });

  it('auto-assigns the whole process once and links every generated task to its runtime stage', async () => {
    const supabaseClient = createRuntimeSupabase();
    const draftStages = createMultiStageTemplateDraft();

    const contexts = await ensureProcessRunContextsForStageGroups(draftStages, async (firstStage) =>
      ensureProcessRunForDraftStageGroup({
        supabaseClient,
        moduleId: 'projects',
        recordId: PROJECT_ID,
        stages: draftStages,
        targetStage: firstStage,
      })
    );
    const context = contexts.get('process_group_main');
    const autoAssignedTasks = draftStages.map((stage, index) =>
      normalizeTaskAssigneeForDirectory({
        id: `auto-task-${index + 1}`,
        name: stage.name,
        status: 'todo',
        task_type: stage.task_type,
        assignee_id: stage.default_assignee_id,
        assignee_role_id: stage.default_assignee_role_id,
        assignee_type: stage.default_assignee_role_id ? 'role' : 'user',
        process_group_id: stage.process_group_id,
        process_run_id: context?.processRunId,
        process_run_stage_id: resolveProcessRunStageId(context?.stageMap, stage),
        source_module_id: 'projects',
        source_record_id: PROJECT_ID,
      }, currentOrgAssignees)
    );

    expect(supabaseClient.rpc).toHaveBeenCalledTimes(1);
    expect(autoAssignedTasks.map((task) => task.process_run_stage_id)).toEqual([
      '88888888-8888-4888-8888-888888888880',
      '88888888-8888-4888-8888-888888888881',
      '88888888-8888-4888-8888-888888888882',
    ]);
    expect(autoAssignedTasks[2]).toMatchObject({
      assignee_id: null,
      assignee_role_id: null,
      assignee_type: null,
    });
    expect(deriveProjectStatusFromProcessState([], autoAssignedTasks)).toBe('planning');
  });

  it('removes the converted draft process group after auto-assigning real tasks', async () => {
    const draftStages = [
      ...createMultiStageTemplateDraft(),
      ...mapProcessTemplateStagesToDraft(TEMPLATE_ID, [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
          stage_name: 'پیگیری بعدی',
          sort_order: 40,
        },
      ], {
        groupId: 'process_group_followup',
        groupName: 'فرآیند پیگیری',
        templateName: 'فرآیند پیگیری',
      }),
    ];

    const nextDraftStages = removeDraftStagesForProcessGroups(draftStages, ['process_group_main']);

    expect(nextDraftStages).toHaveLength(1);
    expect(nextDraftStages[0]).toMatchObject({
      process_group_id: 'process_group_followup',
      name: 'پیگیری بعدی',
    });
  });

  it('syncs stage changes from tasks and marks the process completed when all tasks are done', async () => {
    const supabaseClient = createRuntimeSupabase();
    const draftStages = createMultiStageTemplateDraft();
    const context = await ensureProcessRunForDraftStageGroup({
      supabaseClient,
      moduleId: 'projects',
      recordId: PROJECT_ID,
      stages: draftStages,
      targetStage: draftStages[0],
    });
    const taskIds = [
      '77777777-7777-4777-8777-777777777771',
      '77777777-7777-4777-8777-777777777772',
      '77777777-7777-4777-8777-777777777773',
    ];
    const tasks = draftStages.map((stage, index) => ({
      id: taskIds[index],
      name: stage.name,
      status: index === 1 ? 'in_progress' : 'todo',
      process_run_stage_id: resolveProcessRunStageId(context.stageMap, stage),
      assignee_id: stage.default_assignee_id,
      assignee_role_id: stage.default_assignee_role_id,
      due_date: '2026-06-10',
    }));

    await syncProcessRunStageFromTask({ supabaseClient, task: tasks[1] });
    expect(supabaseClient.rpc).toHaveBeenLastCalledWith('sync_process_run_stage_from_task', expect.objectContaining({
      p_process_run_stage_id: '88888888-8888-4888-8888-888888888881',
      p_task_id: '77777777-7777-4777-8777-777777777772',
      p_status: 'in_progress',
    }));

    const completedTasks = tasks.map((task) => ({
      ...task,
      status: 'done',
      completed_at: '2026-06-08T10:00:00.000Z',
    }));
    for (const task of completedTasks) {
      await syncProcessRunStageFromTask({ supabaseClient, task });
    }

    expect(deriveProjectStatusFromProcessState([], completedTasks)).toBe('completed');
    expect(supabaseClient.rpc.mock.calls.filter(([name]) => name === 'sync_process_run_stage_from_task')).toHaveLength(4);
  });

  it('opens the global process modal for real tasks and refuses draft stage previews', async () => {
    render(
      <App>
        <GlobalTaskProcessModalHost />
      </App>
    );

    openTaskProcessModal({
      task: {
        id: '77777777-7777-4777-8777-777777777771',
        name: 'کنترل کیفیت',
        source_module_id: 'projects',
        source_record_id: PROJECT_ID,
      },
    });

    const modal = await screen.findByTestId('global-process-modal');
    expect(modal).toHaveAttribute('data-module-id', 'projects');
    expect(modal).toHaveAttribute('data-record-id', PROJECT_ID);
    expect(modal).toHaveAttribute('data-task-id', '77777777-7777-4777-8777-777777777771');

    cleanup();
    render(
      <App>
        <GlobalTaskProcessModalHost />
      </App>
    );

    openTaskProcessModal({
      task: {
        id: 'process_run_stage:88888888-8888-4888-8888-888888888880',
        name: 'مرحله پیش‌نویس',
        isProcessRunStagePreview: true,
      },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('global-process-modal')).toBeNull();
    });
  });
});
