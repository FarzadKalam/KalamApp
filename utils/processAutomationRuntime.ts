import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { normalizeNoteScope } from './noteScope';
import { createProcessLinkedFieldKey, parseProcessLinkMap } from './processTargets';
import { resolveTaskSourceLink } from './taskMeta';
import { evaluateWorkflowCondition, executeWorkflowAction } from './workflowRuntime';
import {
  normalizeProcessAutomationRules,
  ProcessAutomationRule,
} from './processAutomationTypes';
import { WorkflowCondition } from './workflowTypes';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  mergeProcessTaskCustomFieldValues,
  TASK_AUTOMATION_FIELD_PREFIX,
  withProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import { getTaskStatusLabel } from './processTaskStatusOptions';

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

type CommunicationTarget = {
  phones: string[];
  emails: string[];
  baleChatIds: string[];
};

const isTaskAutomationFieldKey = (fieldKey?: string | null) =>
  String(fieldKey || '').startsWith(TASK_AUTOMATION_FIELD_PREFIX);
const getTaskAutomationBaseFieldKey = (fieldKey?: string | null) =>
  String(fieldKey || '').replace(TASK_AUTOMATION_FIELD_PREFIX, '');

const normalizeTaskStatus = (value: unknown) => String(value || '').trim().toLowerCase();
const COMPLETED_TASK_STATUSES = new Set(['done', 'completed']);

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

const buildAutomationActionRecord = (
  task: Record<string, any>,
  sourceRecord?: Record<string, any> | null,
  sourceModuleId?: string | null
) => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const processLinks = parseProcessLinkMap(recurrence?.process_links);
  const customFields = getProcessTaskCustomFieldsFromRecurrence(recurrence);
  const customFieldValues = mergeProcessTaskCustomFieldValues(
    customFields,
    getProcessTaskCustomFieldValuesFromRecurrence(recurrence)
  );
  const sourceLink = resolveTaskSourceLink(task);
  const merged: Record<string, any> = {
    ...(sourceRecord || {}),
    task_name: task?.name ?? '',
    task_type: task?.task_type ?? parseRecurrenceInfo(task?.recurrence_info)?.task_type ?? '',
    task_status: task?.status ?? '',
    status_label: getTaskStatusLabel(task?.status, task),
    task_status_label: getTaskStatusLabel(task?.status, task),
    task_due_date: task?.due_date ?? '',
    source_module_id: sourceModuleId || sourceLink.moduleId || '',
    source_record_id: sourceLink.recordId ?? '',
    process_group_id: task?.process_group_id ?? parseRecurrenceInfo(task?.recurrence_info)?.process_group?.id ?? '',
    process_links: processLinks,
  };
  customFields.forEach((field) => {
    const key = String(field?.key || '').trim();
    if (!key) return;
    const value = customFieldValues[key];
    merged[key] = value;
    merged[`${TASK_AUTOMATION_FIELD_PREFIX}${key}`] = value;
  });
  if (merged.status === undefined) {
    merged.status = task?.status ?? '';
  }
  if (merged.due_date === undefined) {
    merged.due_date = task?.due_date ?? '';
  }
  return merged;
};

const renderAutomationTemplateFromRecord = (template: string, record: Record<string, any>) =>
  String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    const value = record?.[fieldKey];
    return value === null || value === undefined ? '' : String(value);
  });

const buildMentionTargetFromTask = (task: Record<string, any> | null | undefined): MentionTarget => {
  if (!task) return { userIds: [], roleIds: [] };
  const roleId = String(task?.assignee_role_id || '').trim();
  if (roleId) return { userIds: [], roleIds: [roleId] };
  const userId = String(task?.assignee_id || '').trim();
  if (userId) return { userIds: [userId], roleIds: [] };
  return { userIds: [], roleIds: [] };
};

const isTaskCompleted = (status: unknown) => COMPLETED_TASK_STATUSES.has(normalizeTaskStatus(status));

const mergeMentionTargets = (...targets: MentionTarget[]): MentionTarget => ({
  userIds: Array.from(new Set(targets.flatMap((item) => item.userIds).filter(Boolean))),
  roleIds: Array.from(new Set(targets.flatMap((item) => item.roleIds).filter(Boolean))),
});

const resolveCommunicationTargets = async (target: MentionTarget): Promise<CommunicationTarget> => {
  const userIds = Array.from(new Set((target?.userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const roleIds = Array.from(new Set((target?.roleIds || []).map((id) => String(id || '').trim()).filter(Boolean)));

  let directUsers: any[] = [];
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, mobile_1, email, bale_chat_id')
      .in('id', userIds);
    if (error) throw error;
    directUsers = Array.isArray(data) ? data : [];
  }

  let roleUsers: any[] = [];
  if (roleIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role_id, mobile_1, email, bale_chat_id')
      .in('role_id', roleIds);
    if (error) throw error;
    roleUsers = Array.isArray(data) ? data : [];
  }

  const allUsers = [...directUsers, ...roleUsers];
  return {
    phones: Array.from(new Set(allUsers.map((row) => String(row?.mobile_1 || '').trim()).filter(Boolean))),
    emails: Array.from(new Set(allUsers.map((row) => String(row?.email || '').trim()).filter(Boolean))),
    baleChatIds: Array.from(new Set(allUsers.map((row) => String(row?.bale_chat_id || '').trim()).filter(Boolean))),
  };
};

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
  return Array.isArray(data) ? data.map((row: any) => withProcessTaskCustomFieldValues(row)) : [];
};

const fetchSourceRecord = async (task: Record<string, any>) => {
  const sourceLink = resolveTaskSourceLink(task);
  if (!sourceLink.moduleId || !sourceLink.recordId) return null;
  const table = MODULES[sourceLink.moduleId]?.table || sourceLink.moduleId;
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', sourceLink.recordId)
    .maybeSingle();
  if (error) throw error;
  return {
    moduleId: sourceLink.moduleId,
    record: data || null,
  };
};

const buildSourceRecordWithProcessLinks = (
  task: Record<string, any>,
  sourceRecord: Record<string, any> | null | undefined,
) => ({
  ...(sourceRecord || {}),
  process_links: parseProcessLinkMap(parseRecurrenceInfo(task?.recurrence_info)?.process_links),
});

const buildAutomationActionRecordWithLinks = async (
  task: Record<string, any>,
  sourceRecord?: Record<string, any> | null,
  sourceModuleId?: string | null,
  siblingTasks: Record<string, any>[] = []
) => {
  const actionRecord = buildAutomationActionRecord(task, sourceRecord, sourceModuleId);
  const processLinks = parseProcessLinkMap(actionRecord.process_links);
  const linkedRecordEntries = await Promise.all(
    Object.entries(processLinks).map(async ([linkedModuleId, linkedRecordId]) => {
      const normalizedModuleId = String(linkedModuleId || '').trim();
      const normalizedRecordId = String(linkedRecordId || '').trim();
      if (!normalizedModuleId || !normalizedRecordId) return null;
      if (normalizedModuleId === sourceModuleId && sourceRecord) {
        return { moduleId: normalizedModuleId, record: sourceRecord };
      }
      const table = MODULES[normalizedModuleId]?.table || normalizedModuleId;
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', normalizedRecordId)
        .maybeSingle();
      if (error) throw error;
      return { moduleId: normalizedModuleId, record: data || null };
    })
  );

  linkedRecordEntries.forEach((entry) => {
    if (!entry?.record) return;
    Object.entries(entry.record).forEach(([fieldKey, value]) => {
      actionRecord[createProcessLinkedFieldKey(entry.moduleId, fieldKey)] = value;
    });
    const linkedAssignee = entry.record ? `${String(entry.record?.assignee_role_id ? 'role' : 'user')}_${String(entry.record?.assignee_role_id || entry.record?.assignee_id || '').trim()}` : '';
    if (linkedAssignee && !linkedAssignee.endsWith('_')) {
      actionRecord[createProcessLinkedFieldKey(entry.moduleId, '__workflow_assignee')] = linkedAssignee;
    }
  });

  const currentSort = Number(task?.sort_order || 0);
  const previousTask = siblingTasks
    .filter((row) => Number(row?.sort_order || 0) < currentSort)
    .sort((a, b) => Number(b?.sort_order || 0) - Number(a?.sort_order || 0))[0];
  const nextTask = siblingTasks
    .filter((row) => Number(row?.sort_order || 0) > currentSort)
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0];
  const toCombo = (row?: Record<string, any> | null) => {
    if (!row) return '';
    const roleId = String(row?.assignee_role_id || '').trim();
    if (roleId) return `role_${roleId}`;
    const userId = String(row?.assignee_id || '').trim();
    return userId ? `user_${userId}` : '';
  };
  actionRecord.__comm_recipient__current_task_assignee = toCombo(task);
  actionRecord.__comm_recipient__previous_stage_assignee = toCombo(previousTask);
  actionRecord.__comm_recipient__next_stage_assignee = toCombo(nextTask);

  return actionRecord;
};

const evaluateProcessAutomationConditions = async ({
  conditionsAll = [],
  conditionsAny = [],
  taskCurrentRecord,
  taskPreviousRecord = null,
  sourceCurrentRecord = null,
  sourcePreviousRecord = null,
  sourceModuleId = null,
}: {
  conditionsAll?: WorkflowCondition[] | null;
  conditionsAny?: WorkflowCondition[] | null;
  taskCurrentRecord: Record<string, any>;
  taskPreviousRecord?: Record<string, any> | null | undefined;
  sourceCurrentRecord?: Record<string, any> | null | undefined;
  sourcePreviousRecord?: Record<string, any> | null | undefined;
  sourceModuleId?: string | null | undefined;
}) => {
  const all = Array.isArray(conditionsAll) ? conditionsAll : [];
  const any = Array.isArray(conditionsAny) ? conditionsAny : [];

  const evaluateOne = async (condition: WorkflowCondition) => {
    const rawField = String(condition?.field || '').trim();
    if (!rawField) return false;

    if (isTaskAutomationFieldKey(rawField)) {
      return evaluateWorkflowCondition({
        condition: { ...condition, field: getTaskAutomationBaseFieldKey(rawField) },
        currentRecord: taskCurrentRecord,
        previousRecord: taskPreviousRecord,
        moduleId: 'tasks',
      });
    }

    if (!sourceCurrentRecord || !sourceModuleId) return false;

    return evaluateWorkflowCondition({
      condition,
      currentRecord: sourceCurrentRecord,
      previousRecord: sourcePreviousRecord,
      moduleId: sourceModuleId,
    });
  };

  for (const condition of all) {
    if (!await evaluateOne(condition as WorkflowCondition)) return false;
  }

  if (any.length === 0) return true;

  for (const condition of any) {
    if (await evaluateOne(condition as WorkflowCondition)) return true;
  }

  return false;
};

const getRuleNoteText = (rule: ProcessAutomationRule) =>
  String(
    rule?.actions?.find((action) => String(action?.type || '') === 'send_note')?.config?.note_text
    || rule?.note_text
    || ''
  ).trim();

const resolveRuleTarget = async (
  rule: ProcessAutomationRule,
  task: Record<string, any>,
  siblingTasks: Record<string, any>[]
): Promise<MentionTarget> => {
  switch (rule.target_type) {
    case 'current_task_assignee':
      return buildMentionTargetFromTask(task);
    case 'previous_stage_assignee': {
      const currentSort = Number(task?.sort_order || 0);
      const previousTask = siblingTasks
        .filter((row) => Number(row?.sort_order || 0) < currentSort)
        .sort((a, b) => Number(b?.sort_order || 0) - Number(a?.sort_order || 0))[0];
      return buildMentionTargetFromTask(previousTask);
    }
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
  actionRecord: Record<string, any>,
  currentUser?: AutomationActor | null
) => {
  const noteText = renderAutomationTemplateFromRecord(getRuleNoteText(rule), actionRecord).trim();
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

  let siblingTasks: Record<string, any>[] | null = null;
  let sourceRecordContext: { moduleId: string; record: Record<string, any> | null } | null | undefined;

  const getSiblingTasks = async () => {
    if (siblingTasks !== null) return siblingTasks;
    siblingTasks = await getSameProcessTasks(task);
    return siblingTasks;
  };

  const getSourceRecordContext = async () => {
    if (sourceRecordContext !== undefined) return sourceRecordContext;
    sourceRecordContext = await fetchSourceRecord(task);
    return sourceRecordContext;
  };

  const shouldRunRule = async (rule: ProcessAutomationRule) => {
    if (rule?.is_active === false) return false;

    const triggerType = String(rule?.trigger_type || '').trim();
    let matchedTrigger = false;

    if (triggerType === 'current_stage_completed') {
      matchedTrigger = isTaskCompleted(task?.status);
    } else if (triggerType === 'current_stage_in_progress') {
      matchedTrigger = nextStatus === 'in_progress';
    } else if (triggerType === 'process_started') {
      const siblings = await getSiblingTasks();
      const currentSort = Number(task?.sort_order || 0);
      const hasPreviousTask = siblings.some((row) => Number(row?.sort_order || 0) < currentSort);
      matchedTrigger = !hasPreviousTask && nextStatus === 'in_progress';
    } else {
      matchedTrigger = false;
    }

    if (!matchedTrigger) return false;

    const sourceContext = await getSourceRecordContext();
    const previousTaskRecord = previousNormalizedStatus
      ? withProcessTaskCustomFieldValues({ ...task, status: previousStatus })
      : null;

    return evaluateProcessAutomationConditions({
      conditionsAll: rule?.conditions_all || [],
      conditionsAny: rule?.conditions_any || [],
      taskCurrentRecord: withProcessTaskCustomFieldValues(task),
      taskPreviousRecord: previousTaskRecord,
      sourceCurrentRecord: buildSourceRecordWithProcessLinks(task, sourceContext?.record || null),
      sourcePreviousRecord: null,
      sourceModuleId: sourceContext?.moduleId || null,
    });
  };

  const runRulesForTask = async (targetTask: Record<string, any>, candidateRules: ProcessAutomationRule[]) => {
    if (candidateRules.length === 0) return;

    for (const rule of candidateRules) {
      try {
        const sourceContext = await fetchSourceRecord(targetTask);
        if (!await evaluateProcessAutomationConditions({
          conditionsAll: rule?.conditions_all || [],
          conditionsAny: rule?.conditions_any || [],
          taskCurrentRecord: withProcessTaskCustomFieldValues(targetTask),
          taskPreviousRecord: null,
          sourceCurrentRecord: buildSourceRecordWithProcessLinks(targetTask, sourceContext?.record || null),
          sourcePreviousRecord: null,
          sourceModuleId: sourceContext?.moduleId || null,
        })) {
          continue;
        }
        const target = await resolveRuleTarget(rule, targetTask, (await getSiblingTasks()) || []);
        const actions = Array.isArray(rule?.actions) ? rule.actions : [];
        const actionRecord = await buildAutomationActionRecordWithLinks(
          targetTask,
          sourceContext?.record || null,
          sourceContext?.moduleId || null,
          (await getSiblingTasks()) || [],
        );
        const communicationTargets = await resolveCommunicationTargets(target);

        for (const action of actions) {
          if (String(action?.type || '') === 'send_note') {
            const actionRecipientFields = Array.isArray((action as any)?.config?.recipient_fields)
              ? (action as any).config.recipient_fields
              : [];
            const directNoteTarget = actionRecipientFields.reduce((acc: MentionTarget, recipientField: any) => {
              const rawRecipientField = String(recipientField || '').trim();
              if (!rawRecipientField) return acc;
              const resolvedValues = rawRecipientField.startsWith('user_') || rawRecipientField.startsWith('role_')
                ? [rawRecipientField]
                : (Array.isArray(actionRecord?.[rawRecipientField])
                    ? actionRecord[rawRecipientField]
                    : [actionRecord?.[rawRecipientField]]);
              resolvedValues.forEach((resolvedValue: any) => {
                const combo = String(resolvedValue || '').trim();
                if (combo.startsWith('user_')) acc.userIds.push(combo.slice(5));
                if (combo.startsWith('role_')) acc.roleIds.push(combo.slice(5));
              });
              return acc;
            }, { userIds: [], roleIds: [] });
            const noteTarget = (
              directNoteTarget.userIds.length > 0
              || directNoteTarget.roleIds.length > 0
            )
              ? mergeMentionTargets(directNoteTarget)
              : target;
            await insertAutomationNote(
              targetTask,
              {
                ...rule,
                actions: [action],
                note_text: String(action?.config?.note_text || rule?.note_text || ''),
              },
              noteTarget,
              actionRecord,
              currentUser
            );
            continue;
          }

          if (!sourceContext?.moduleId || !sourceContext?.record) continue;
          const actionType = String(action?.type || '');
          const directConfigPatch: Record<string, any> = {};

          if (actionType === 'send_sms' && communicationTargets.phones.length > 0) {
            directConfigPatch.manual_numbers = Array.from(new Set([
              ...communicationTargets.phones,
              ...((Array.isArray((action as any)?.config?.manual_numbers) ? (action as any).config.manual_numbers : []) as string[]),
            ]));
          }

          if (actionType === 'send_email' && communicationTargets.emails.length > 0) {
            directConfigPatch.manual_emails = Array.from(new Set([
              ...communicationTargets.emails,
              ...((Array.isArray((action as any)?.config?.manual_emails) ? (action as any).config.manual_emails : []) as string[]),
            ]));
          }

          if (actionType === 'send_bale_bot' && communicationTargets.baleChatIds.length > 0) {
            directConfigPatch.manual_chat_ids = Array.from(new Set([
              ...communicationTargets.baleChatIds,
              ...((Array.isArray((action as any)?.config?.manual_chat_ids) ? (action as any).config.manual_chat_ids : []) as string[]),
            ]));
          }

          await executeWorkflowAction(
            Object.keys(directConfigPatch).length > 0
              ? { ...(action as any), config: { ...((action as any)?.config || {}), ...directConfigPatch } }
              : (action as any),
            sourceContext.moduleId,
            actionRecord
          );
        }
      } catch (error) {
        console.warn('Process automation rule failed', rule?.id, error);
      }
    }
  };

  const currentTaskRules = [] as ProcessAutomationRule[];
  for (const rule of rules) {
    if (await shouldRunRule(rule)) {
      currentTaskRules.push(rule);
    }
  }
  await runRulesForTask(task, currentTaskRules);

  if (isTaskCompleted(task?.status)) {
    const siblings = await getSiblingTasks();
    const currentSort = Number(task?.sort_order || 0);
    const nextTask = siblings
      .filter((row) => Number(row?.sort_order || 0) > currentSort)
      .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0];
    if (nextTask) {
      const nextTaskRules = normalizeProcessAutomationRules(parseRecurrenceInfo(nextTask?.recurrence_info)?.process_automation_rules)
        .filter((rule) => rule?.is_active !== false && rule?.trigger_type === 'previous_stage_completed');
      if (nextTaskRules.length > 0) {
        await runRulesForTask(nextTask, nextTaskRules);
      }
    }
  }
};
