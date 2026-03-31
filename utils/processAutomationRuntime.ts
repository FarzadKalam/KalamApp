import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { normalizeNoteScope } from './noteScope';
import { resolveTaskSourceLink } from './taskMeta';
import {
  normalizeProcessAutomationRules,
  ProcessAutomationRule,
} from './processAutomationTypes';

type AutomationActor = {
  id?: string | null;
  fullName?: string | null;
};

type ProcessAutomationRunArgs = {
  task: Record<string, any>;
  previousStatus?: string | null;
  currentUser?: AutomationActor | null;
};

type MentionTarget = {
  userIds: string[];
  roleIds: string[];
};

const normalizeTaskStatus = (value: unknown) => String(value || '').trim().toLowerCase();

const parseRecurrenceInfo = (value: any): Record<string, any> => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const getTaskStatusLabel = (status: unknown) => {
  const normalized = normalizeTaskStatus(status);
  const options = MODULES.tasks?.fields?.find((field: any) => field.key === 'status')?.options || [];
  const matched = options.find((option: any) => normalizeTaskStatus(option?.value) === normalized);
  return String(matched?.label || status || '').trim();
};

const renderTaskAutomationTemplate = (template: string, task: Record<string, any>) => {
  const sourceLink = resolveTaskSourceLink(task);
  const values: Record<string, any> = {
    task_name: task?.name ?? '',
    task_type: task?.task_type ?? parseRecurrenceInfo(task?.recurrence_info)?.task_type ?? '',
    status: task?.status ?? '',
    status_label: getTaskStatusLabel(task?.status),
    due_date: task?.due_date ?? '',
    source_module_id: sourceLink.moduleId ?? '',
    source_record_id: sourceLink.recordId ?? '',
    process_group_id: task?.process_group_id ?? parseRecurrenceInfo(task?.recurrence_info)?.process_group?.id ?? '',
  };

  return String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const normalizedKey = String(key || '').trim().replace(/\./g, '_');
    const nextValue = values[normalizedKey];
    return nextValue === null || nextValue === undefined ? '' : String(nextValue);
  });
};

const buildMentionTargetFromTask = (task: Record<string, any> | null | undefined): MentionTarget => {
  if (!task) return { userIds: [], roleIds: [] };
  const roleId = String(task?.assignee_role_id || '').trim();
  if (roleId) return { userIds: [], roleIds: [roleId] };
  const userId = String(task?.assignee_id || '').trim();
  if (userId) return { userIds: [userId], roleIds: [] };
  return { userIds: [], roleIds: [] };
};

const mergeMentionTargets = (...targets: MentionTarget[]): MentionTarget => ({
  userIds: Array.from(new Set(targets.flatMap((item) => item.userIds).filter(Boolean))),
  roleIds: Array.from(new Set(targets.flatMap((item) => item.roleIds).filter(Boolean))),
});

const getSameProcessTasks = async (task: Record<string, any>) => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const processGroupId = String(task?.process_group_id || recurrence?.process_group?.id || '').trim();
  const sourceLink = resolveTaskSourceLink(task);

  let query = supabase
    .from('tasks')
    .select('id, name, status, task_type, assignee_id, assignee_role_id, assignee_type, sort_order, process_group_id, recurrence_info, source_module_id, source_record_id')
    .neq('id', String(task?.id || ''));

  if (processGroupId) {
    query = query.eq('process_group_id', processGroupId);
  } else if (sourceLink.moduleId && sourceLink.recordId) {
    query = query
      .eq('source_module_id', sourceLink.moduleId)
      .eq('source_record_id', sourceLink.recordId);
    if (task?.source_template_id) {
      query = query.eq('source_template_id', task.source_template_id);
    }
  } else {
    return [] as Record<string, any>[];
  }

  const { data, error } = await query.order('sort_order', { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
};

const resolveRuleTarget = async (
  rule: ProcessAutomationRule,
  task: Record<string, any>,
  siblingTasks: Record<string, any>[]
): Promise<MentionTarget> => {
  switch (rule.target_type) {
    case 'current_task_assignee':
      return buildMentionTargetFromTask(task);
    case 'next_stage_assignee': {
      const currentSort = Number(task?.sort_order || 0);
      const nextTask = siblingTasks
        .filter((row) => Number(row?.sort_order || 0) > currentSort)
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0];
      return buildMentionTargetFromTask(nextTask);
    }
    case 'task_type_assignee': {
      const targetTaskType = String(rule?.target_task_type || '').trim();
      if (!targetTaskType) return { userIds: [], roleIds: [] };
      const matchedTask = siblingTasks.find(
        (row) => String(row?.task_type || '').trim() === targetTaskType
      );
      return buildMentionTargetFromTask(matchedTask);
    }
    case 'specific_user': {
      const userId = String(rule?.target_user_id || '').trim();
      return { userIds: userId ? [userId] : [], roleIds: [] };
    }
    case 'specific_role': {
      const roleId = String(rule?.target_role_id || '').trim();
      return { userIds: [], roleIds: roleId ? [roleId] : [] };
    }
    default:
      return { userIds: [], roleIds: [] };
  }
};

const insertAutomationNote = async (
  task: Record<string, any>,
  rule: ProcessAutomationRule,
  target: MentionTarget,
  currentUser?: AutomationActor | null
) => {
  const noteText = renderTaskAutomationTemplate(String(rule?.note_text || ''), task).trim();
  if (!noteText) return;

  const sourceLink = resolveTaskSourceLink(task);
  const scope = normalizeNoteScope(
    sourceLink.moduleId || 'tasks',
    sourceLink.recordId || String(task?.id || '')
  );
  if (!scope.hasLinkedRecord) return;

  const mentionTarget = mergeMentionTargets(target);
  if (mentionTarget.userIds.length === 0 && mentionTarget.roleIds.length === 0) return;

  const payload: Record<string, any> = {
    module_id: scope.module_id,
    record_id: scope.record_id,
    content: noteText,
    mention_user_ids: mentionTarget.userIds,
    mention_role_ids: mentionTarget.roleIds,
  };

  const currentUserId = String(currentUser?.id || '').trim();
  if (currentUserId) payload.author_id = currentUserId;
  const currentUserName = String(currentUser?.fullName || '').trim();
  if (currentUserName) payload.author_name = currentUserName;

  const { error } = await supabase.from('notes').insert(payload);
  if (error) throw error;
};

export const runProcessAutomationsForTaskStatusChange = async ({
  task,
  previousStatus = null,
  currentUser = null,
}: ProcessAutomationRunArgs) => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const rules = normalizeProcessAutomationRules(recurrence?.process_automation_rules);
  if (rules.length === 0) return;

  const nextStatus = normalizeTaskStatus(task?.status);
  const previousNormalizedStatus = normalizeTaskStatus(previousStatus);
  if (!nextStatus || nextStatus === previousNormalizedStatus) return;

  const candidateRules = rules.filter((rule) =>
    rule?.is_active !== false
    && rule?.trigger_type === 'status_changed_to'
    && normalizeTaskStatus(rule?.trigger_status) === nextStatus
    && String(rule?.action_type || 'send_note') === 'send_note'
  );
  if (candidateRules.length === 0) return;

  let siblingTasks: Record<string, any>[] | null = null;

  for (const rule of candidateRules) {
    try {
      const requiresSiblingLookup =
        rule.target_type === 'next_stage_assignee'
        || rule.target_type === 'task_type_assignee';
      if (requiresSiblingLookup && siblingTasks === null) {
        siblingTasks = await getSameProcessTasks(task);
      }
      const target = await resolveRuleTarget(rule, task, siblingTasks || []);
      await insertAutomationNote(task, rule, target, currentUser);
    } catch (error) {
      console.warn('Process automation rule failed', rule?.id, error);
    }
  }
};
