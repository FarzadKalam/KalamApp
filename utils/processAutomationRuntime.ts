import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { normalizeNoteScope } from './noteScope';
import { createProcessLinkedFieldKey, parseProcessLinkMap } from './processTargets';
import { resolveTaskSourceLink } from './taskMeta';
import {
  evaluateWorkflowCondition,
  executeWorkflowAction,
  formatWorkflowTemplateValue,
  resolveNoteAttachmentsFromFields,
} from './workflowRuntime';
import {
  normalizeProcessAutomationRules,
  ProcessAutomationRule,
} from './processAutomationTypes';
import { WorkflowCondition } from './workflowTypes';
import {
  getProcessTaskCustomFieldValuesFromRecurrence,
  getProcessTaskCustomFieldsFromRecurrence,
  mergeProcessTaskCustomFieldValues,
  PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX,
  TASK_AUTOMATION_FIELD_PREFIX,
  withProcessTaskCustomFieldValues,
} from './processTaskCustomFields';
import { getTaskStatusLabel } from './processTaskStatusOptions';
import { insertNotesWithFallback, sendNoteSmsNotifications } from './noteDispatch';
import { serializeNoteContent } from './noteContent';

type AutomationActor = {
  id?: string | null;
  fullName?: string | null;
};

type ProcessAutomationEvent = 'create' | 'update';

type ProcessAutomationRunArgs = {
  task: Record<string, any>;
  event: ProcessAutomationEvent;
  previousTask?: Record<string, any> | null;
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
  rubikaChatIds: string[];
};

type CommunicationChannel = 'sms' | 'email' | 'bale' | 'rubika';

const isTaskAutomationFieldKey = (fieldKey?: string | null) =>
  String(fieldKey || '').startsWith(TASK_AUTOMATION_FIELD_PREFIX);
const getTaskAutomationBaseFieldKey = (fieldKey?: string | null) =>
  String(fieldKey || '').replace(TASK_AUTOMATION_FIELD_PREFIX, '');

const normalizeTaskStatus = (value: unknown) => String(value || '').trim().toLowerCase();
const COMPLETED_TASK_STATUSES = new Set(['done', 'completed']);
const PROCESS_AUTOMATION_LOG_RUN_TYPE = 'process_automation';
const WORKFLOW_OPERATORS_WITHOUT_VALUE = new Set([
  'is_true',
  'is_false',
  'is_null',
  'not_null',
  'changed',
  'is_today',
  'is_yesterday',
  'is_tomorrow',
  'is_friday',
  'is_official_holiday',
]);

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
    task_id: task?.id ?? '',
    task_name: task?.name ?? '',
    task_type: task?.task_type ?? parseRecurrenceInfo(task?.recurrence_info)?.task_type ?? '',
    task_status: task?.status ?? '',
    status_label: getTaskStatusLabel(task?.status, task),
    task_status_label: getTaskStatusLabel(task?.status, task),
    task_due_date: task?.due_date ?? '',
    task_image_url: task?.image_url ?? '',
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
  if (merged.id === undefined || merged.id === null || String(merged.id).trim() === '') {
    merged.id = task?.id ?? '';
  }
  return merged;
};

const isBlankConditionValue = (value: unknown) =>
  value === undefined
  || value === null
  || String(value).trim() === ''
  || (Array.isArray(value) && value.length === 0);

const isRunnableProcessAutomationCondition = (condition: WorkflowCondition) => {
  const field = String(condition?.field || '').trim();
  if (!field) return false;
  const operator = String(condition?.operator || 'eq').trim();
  if (WORKFLOW_OPERATORS_WITHOUT_VALUE.has(operator)) return true;
  return !isBlankConditionValue(condition?.value);
};

const renderAutomationTemplateWithBoldMarkers = (template: string, record: Record<string, any>) =>
  String(template || '').replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key: string) => {
    const fieldKey = String(key || '').trim();
    const value = record?.[fieldKey];
    if (value === null || value === undefined) return '';
    const resolved = formatWorkflowTemplateValue(value).trim();
    return resolved ? `**${resolved}**` : '';
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

const appendMentionTargetToken = (target: MentionTarget, value: any) => {
  const combo = String(value || '').trim();
  const match = combo.match(/^(user|role)[:_](.+)$/i);
  if (!match) return;
  const id = String(match[2] || '').trim();
  if (!id) return;
  if (String(match[1] || '').toLowerCase() === 'user') {
    target.userIds.push(id);
    return;
  }
  target.roleIds.push(id);
};

const getRequestedCommunicationChannels = (actions: any[]): Set<CommunicationChannel> => {
  const channels = new Set<CommunicationChannel>();
  actions.forEach((action) => {
    const actionType = String(action?.type || '').trim();
    if (actionType === 'send_sms') {
      channels.add('sms');
      return;
    }
    if (actionType === 'send_email') {
      channels.add('email');
      return;
    }
    if (actionType === 'send_bale_bot') {
      channels.add('bale');
      return;
    }
    if (actionType === 'send_rubika_bot') {
      channels.add('rubika');
    }
  });
  return channels;
};

const getProfileCommunicationSelect = (channels: Set<CommunicationChannel>) => {
  const columns = ['id'];
  if (channels.has('sms')) columns.push('mobile_1');
  if (channels.has('email')) columns.push('email');
  if (channels.has('bale')) columns.push('bale_chat_id');
  if (channels.has('rubika')) columns.push('rubika_chat_id');
  return columns.join(', ');
};

const resolveCommunicationTargets = async (
  target: MentionTarget,
  channels: Set<CommunicationChannel>
): Promise<CommunicationTarget> => {
  if (channels.size === 0) {
    return { phones: [], emails: [], baleChatIds: [], rubikaChatIds: [] };
  }

  const userIds = Array.from(new Set((target?.userIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const roleIds = Array.from(new Set((target?.roleIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  const profileSelect = getProfileCommunicationSelect(channels);

  let directUsers: any[] = [];
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileSelect)
      .in('id', userIds);
    if (error) throw error;
    directUsers = Array.isArray(data) ? data : [];
  }

  let roleUsers: any[] = [];
  if (roleIds.length > 0) {
    const { data, error } = await supabase
      .from('profiles')
      .select(profileSelect)
      .in('role_id', roleIds);
    if (error) throw error;
    roleUsers = Array.isArray(data) ? data : [];
  }

  const allUsers = [...directUsers, ...roleUsers];
  return {
    phones: Array.from(new Set(allUsers.map((row) => String(row?.mobile_1 || '').trim()).filter(Boolean))),
    emails: Array.from(new Set(allUsers.map((row) => String(row?.email || '').trim()).filter(Boolean))),
    baleChatIds: Array.from(new Set(allUsers.map((row) => String(row?.bale_chat_id || '').trim()).filter(Boolean))),
    rubikaChatIds: Array.from(new Set(allUsers.map((row) => String(row?.rubika_chat_id || '').trim()).filter(Boolean))),
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
  const previousTaskRecord = previousTask ? withProcessTaskCustomFieldValues(previousTask) : null;
  const previousTaskCustomFields = previousTask
    ? getProcessTaskCustomFieldsFromRecurrence(parseRecurrenceInfo(previousTask?.recurrence_info))
    : [];
  actionRecord.__comm_recipient__current_task_assignee = toCombo(task);
  actionRecord.__comm_recipient__previous_stage_assignee = toCombo(previousTask);
  actionRecord.__comm_recipient__next_stage_assignee = toCombo(nextTask);
  previousTaskCustomFields.forEach((field) => {
    const fieldKey = String(field?.key || '').trim();
    if (!fieldKey) return;
    actionRecord[`${PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX}${fieldKey}`] = previousTaskRecord?.[fieldKey];
  });
  actionRecord[`${PREVIOUS_STAGE_TASK_AUTOMATION_FIELD_PREFIX}image_url`] = previousTaskRecord?.image_url;

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
  const all = (Array.isArray(conditionsAll) ? conditionsAll : []).filter(isRunnableProcessAutomationCondition);
  const any = (Array.isArray(conditionsAny) ? conditionsAny : []).filter(isRunnableProcessAutomationCondition);

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
    rule?.actions?.find((action) => {
      const actionType = String(action?.type || '').trim();
      return actionType === 'send_note' || actionType === 'send_note_sms';
    })?.config?.note_text
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
  _currentUser?: AutomationActor | null,
  sendSmsNotice = false
) => {
  const ruleNoteAction = (rule?.actions || []).find((action) => {
    const actionType = String(action?.type || '').trim();
    return actionType === 'send_note' || actionType === 'send_note_sms';
  });
  const noteText = renderAutomationTemplateWithBoldMarkers(getRuleNoteText(rule), actionRecord).trim();

  const sourceLink = resolveTaskSourceLink(task);
  const resolvedModuleId = sourceLink.moduleId || 'tasks';
  const attachments = await resolveNoteAttachmentsFromFields({
    currentRecord: actionRecord,
    moduleId: resolvedModuleId,
    attachmentFields: Array.isArray((ruleNoteAction as any)?.config?.attachment_fields)
      ? (ruleNoteAction as any).config.attachment_fields
      : [],
  });
  if (!noteText && attachments.length === 0) return;
  const scope = normalizeNoteScope(
    resolvedModuleId,
    sourceLink.recordId || String(task?.id || '')
  );
  if (!scope.hasLinkedRecord) return;

  const mentionTarget = mergeMentionTargets(target);

  const payload: Record<string, any> = {
    module_id: scope.module_id,
    record_id: scope.record_id,
    content: serializeNoteContent(noteText, attachments),
    mention_user_ids: mentionTarget.userIds,
    mention_role_ids: mentionTarget.roleIds,
    source_type: 'system',
    metadata: {
      source_type: 'system',
      process_automation_rule_id: String(rule?.id || '').trim() || null,
      workflow_action_type: String((ruleNoteAction as any)?.type || 'send_note').trim() || 'send_note',
    },
  };

  await insertNotesWithFallback([payload]);
  if (sendSmsNotice) {
    await sendNoteSmsNotifications({
      authorName: 'سیستم',
      noteText,
      mentionUserIds: mentionTarget.userIds,
      mentionRoleIds: mentionTarget.roleIds,
      moduleId: scope.module_id,
      recordId: scope.record_id,
      title: 'ارسال یادداشت خودکار',
    });
  }
};

export const runProcessAutomationsForTaskEvent = async ({
  task,
  event,
  previousTask = null,
  currentUser = null,
}: ProcessAutomationRunArgs) => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const rules = normalizeProcessAutomationRules(recurrence?.process_automation_rules);
  if (rules.length === 0) return;

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
    if (triggerType === 'interval' || triggerType === 'previous_stage_completed') return false;
    if (triggerType === 'on_create' && event !== 'create') return false;
    if (triggerType === 'on_upsert' && !['create', 'update'].includes(event)) return false;

    const executionMode = String(rule?.execution_mode || 'every_match').trim();
    const taskId = String(task?.id || '').trim();
    if (executionMode === 'first_match' && taskId) {
      const alreadyExecuted = await hasProcessAutomationLogForTask(String(rule?.id || ''), taskId);
      if (alreadyExecuted) return false;
    }

    const sourceContext = await getSourceRecordContext();
    const previousTaskRecord = previousTask ? withProcessTaskCustomFieldValues(previousTask) : null;

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

  const runRulesForTask = async (
    targetTask: Record<string, any>,
    candidateRules: ProcessAutomationRule[],
    targetEvent: ProcessAutomationEvent | 'previous_stage_completed',
    targetPreviousTask: Record<string, any> | null = null
  ) => {
    if (candidateRules.length === 0) return;

    for (const rule of candidateRules) {
      const targetTaskId = String(targetTask?.id || '').trim();
      try {
        const executionMode = String(rule?.execution_mode || 'every_match').trim();
        if (executionMode === 'first_match' && targetTaskId) {
          const alreadyExecuted = await hasProcessAutomationLogForTask(String(rule?.id || ''), targetTaskId);
          if (alreadyExecuted) continue;
        }

        const sourceContext = await fetchSourceRecord(targetTask);
        if (!await evaluateProcessAutomationConditions({
          conditionsAll: rule?.conditions_all || [],
          conditionsAny: rule?.conditions_any || [],
          taskCurrentRecord: withProcessTaskCustomFieldValues(targetTask),
          taskPreviousRecord: targetPreviousTask ? withProcessTaskCustomFieldValues(targetPreviousTask) : null,
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
        const communicationTargets = await resolveCommunicationTargets(
          target,
          getRequestedCommunicationChannels(actions)
        );

        for (const action of actions) {
          if (String(action?.type || '') === 'send_note' || String(action?.type || '') === 'send_note_sms') {
            const actionRecipientFields = Array.isArray((action as any)?.config?.recipient_fields)
              ? (action as any).config.recipient_fields
              : [];
            const directNoteTarget = actionRecipientFields.reduce((acc: MentionTarget, recipientField: any) => {
              const rawRecipientField = String(recipientField || '').trim();
              if (!rawRecipientField) return acc;
              const resolvedValues = /^(user|role)[:_]/i.test(rawRecipientField)
                ? [rawRecipientField]
                : (Array.isArray(actionRecord?.[rawRecipientField])
                    ? actionRecord[rawRecipientField]
                    : [actionRecord?.[rawRecipientField]]);
              resolvedValues.forEach((resolvedValue: any) => {
                appendMentionTargetToken(acc, resolvedValue);
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
              currentUser,
              String(action?.type || '') === 'send_note_sms'
            );
            continue;
          }

          const actionType = String(action?.type || '');
          const canRunWithoutSourceRecord = ['send_sms', 'send_email', 'send_bale_bot', 'send_rubika_bot'].includes(actionType);
          if ((!sourceContext?.moduleId || !sourceContext?.record) && !canRunWithoutSourceRecord) continue;

          const actionConfig = (action as any)?.config || {};
          const actionRecipientFields = Array.isArray(actionConfig?.recipient_fields)
            ? actionConfig.recipient_fields.map((item: any) => String(item || '').trim()).filter(Boolean)
            : [];
          const directConfigPatch: Record<string, any> = {};

          const hasManualNumbers = Array.isArray(actionConfig?.manual_numbers)
            && actionConfig.manual_numbers.some((item: any) => String(item || '').trim());
          if (actionType === 'send_sms' && communicationTargets.phones.length > 0 && actionRecipientFields.length === 0 && !hasManualNumbers) {
            directConfigPatch.manual_numbers = Array.from(new Set([
              ...communicationTargets.phones,
            ]));
          }

          const hasManualEmails = Array.isArray(actionConfig?.manual_emails)
            && actionConfig.manual_emails.some((item: any) => String(item || '').trim());
          if (actionType === 'send_email' && communicationTargets.emails.length > 0 && actionRecipientFields.length === 0 && !hasManualEmails) {
            directConfigPatch.manual_emails = Array.from(new Set([
              ...communicationTargets.emails,
            ]));
          }

          const hasManualChatIds = Array.isArray(actionConfig?.manual_chat_ids)
            && actionConfig.manual_chat_ids.some((item: any) => String(item || '').trim());
          if (actionType === 'send_bale_bot' && communicationTargets.baleChatIds.length > 0 && actionRecipientFields.length === 0 && !hasManualChatIds) {
            directConfigPatch.manual_chat_ids = Array.from(new Set([
              ...communicationTargets.baleChatIds,
            ]));
          }
          if (actionType === 'send_rubika_bot' && communicationTargets.rubikaChatIds.length > 0 && actionRecipientFields.length === 0 && !hasManualChatIds) {
            directConfigPatch.manual_chat_ids = Array.from(new Set([
              ...communicationTargets.rubikaChatIds,
            ]));
          }

          await executeWorkflowAction(
            Object.keys(directConfigPatch).length > 0
              ? { ...(action as any), config: { ...((action as any)?.config || {}), ...directConfigPatch } }
              : (action as any),
            sourceContext?.moduleId || 'tasks',
            actionRecord
          );
        }

        await logProcessAutomationRun({
          rule,
          task: targetTask,
          event: targetEvent,
          status: 'success',
          currentUser,
        });
      } catch (error) {
        console.warn('Process automation rule failed', rule?.id, error);
        try {
          await logProcessAutomationRun({
            rule,
            task: targetTask,
            event: targetEvent,
            status: 'failed',
            currentUser,
            errorMessage: String((error as any)?.message || error || 'process automation failed'),
          });
        } catch (logError) {
          console.warn('Process automation log failed', rule?.id, logError);
        }
      }
    }
  };

  const currentTaskRules = [] as ProcessAutomationRule[];
  for (const rule of rules) {
    if (await shouldRunRule(rule)) {
      currentTaskRules.push(rule);
    }
  }
  await runRulesForTask(task, currentTaskRules, event, previousTask);

  const didBecomeCompleted = isTaskCompleted(task?.status) && !isTaskCompleted(previousTask?.status);
  if (didBecomeCompleted) {
    const siblings = await getSiblingTasks();
    const currentSort = Number(task?.sort_order || 0);
    const nextTask = siblings
      .filter((row) => Number(row?.sort_order || 0) > currentSort)
      .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0];
    if (nextTask) {
      const nextTaskRules = normalizeProcessAutomationRules(parseRecurrenceInfo(nextTask?.recurrence_info)?.process_automation_rules)
        .filter((rule) => rule?.is_active !== false && rule?.trigger_type === 'previous_stage_completed');
      if (nextTaskRules.length > 0) {
        await runRulesForTask(nextTask, nextTaskRules, 'previous_stage_completed', null);
      }
    }
  }
};

const hasProcessAutomationLogForTask = async (ruleId: string, taskId: string) => {
  const normalizedRuleId = String(ruleId || '').trim();
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedRuleId || !normalizedTaskId) return false;

  const { data, error } = await supabase
    .from('workflow_logs')
    .select('id')
    .eq('run_type', PROCESS_AUTOMATION_LOG_RUN_TYPE)
    .eq('status', 'success')
    .eq('module_id', 'tasks')
    .eq('record_id', normalizedTaskId)
    .contains('details', { process_automation_rule_id: normalizedRuleId })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
};

const logProcessAutomationRun = async ({
  rule,
  task,
  event,
  status,
  currentUser = null,
  errorMessage,
}: {
  rule: ProcessAutomationRule;
  task: Record<string, any>;
  event: ProcessAutomationEvent | 'previous_stage_completed';
  status: 'success' | 'failed';
  currentUser?: AutomationActor | null;
  errorMessage?: string;
}) => {
  const taskId = String(task?.id || '').trim() || null;
  await supabase.from('workflow_logs').insert({
    run_type: PROCESS_AUTOMATION_LOG_RUN_TYPE,
    status,
    module_id: 'tasks',
    record_id: taskId,
    message: errorMessage || null,
    details: {
      process_automation_rule_id: String(rule?.id || '').trim() || null,
      process_automation_rule_name: String(rule?.name || '').trim() || null,
      process_automation_trigger_type: String(rule?.trigger_type || '').trim() || null,
      process_automation_event: event,
      action_count: Array.isArray(rule?.actions) ? rule.actions.length : 0,
      actor_id: String(currentUser?.id || '').trim() || null,
    },
  });
};

export const runProcessAutomationsForTaskStatusChange = async ({
  task,
  currentUser = null,
  previousTask = null,
}: Omit<ProcessAutomationRunArgs, 'event'>) => {
  await runProcessAutomationsForTaskEvent({
    task,
    event: 'update',
    previousTask,
    currentUser,
  });
};
