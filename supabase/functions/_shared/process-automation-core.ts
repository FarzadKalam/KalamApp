export type ProcessAutomationEvent = 'create' | 'update' | 'interval' | 'previous_stage_completed';

export type ProcessAutomationConditionEvaluator = (
  condition: Record<string, any>,
  currentRecord: Record<string, any>,
  previousRecord: Record<string, any> | null,
) => Promise<boolean>;

export const parseAutomationObject = (value: any): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};
export const getTaskProcessNodeKey = (task: Record<string, any>): string => {
  const recurrence = parseAutomationObject(task?.recurrence_info);
  return String(task?.process_node_key || recurrence?.process_node_key || '').trim();
};

export const getTaskProcessLaneKey = (task: Record<string, any>): string => {
  const recurrence = parseAutomationObject(task?.recurrence_info);
  return String(task?.process_lane_key || recurrence?.process_lane_key || 'lane_1').trim() || 'lane_1';
};

export const getTaskProcessGraph = (task: Record<string, any>): Record<string, any> =>
  parseAutomationObject(parseAutomationObject(task?.recurrence_info)?.process_graph);

export const assignProcessAutomationIdentityContext = (
  target: Record<string, any>,
  processNameValue: unknown,
  laneNameValue: unknown,
) => {
  const processName = String(processNameValue || '').trim();
  const laneName = String(laneNameValue || '').trim();
  if (processName) {
    target.process_name = processName;
    target['نام فرآیند'] = processName;
    target['نام فرایند'] = processName;
  }
  if (laneName) {
    target.process_lane_name = laneName;
    target.lane_name = laneName;
    target['نام ردیف'] = laneName;
  }
  return target;
};

export const getTaskProcessIdentity = (task: Record<string, any>) => {
  const recurrence = parseAutomationObject(task?.recurrence_info);
  const processGroup = parseAutomationObject(recurrence?.process_group);
  const graph = getTaskProcessGraph(task);
  const laneKey = getTaskProcessLaneKey(task);
  const lane = (Array.isArray(graph?.lanes) ? graph.lanes : []).find((item: any) => (
    String(item?.key || item?.id || '').trim() === laneKey
  ));
  return {
    processName: String(
      task?.process_name
      || task?.process_group_name
      || processGroup?.name
      || processGroup?.template_name
      || '',
    ).trim(),
    laneName: String(
      task?.process_lane_name
      || recurrence?.process_lane_name
      || lane?.name
      || lane?.title
      || 'ردیف اصلی',
    ).trim() || 'ردیف اصلی',
  };
};

export const getTaskSourceLink = (task: Record<string, any>): { moduleId: string; recordId: string } => {
  const recurrence = parseAutomationObject(task?.recurrence_info);
  const moduleId = String(task?.source_module_id || task?.related_to_module || '').trim();
  const fallbackByModule: Record<string, any> = {
    projects: task?.project_id,
    marketing_leads: task?.marketing_lead_id,
    customers: task?.related_customer,
    suppliers: task?.related_supplier,
    invoices: task?.related_invoice,
    purchase_invoices: task?.purchase_invoice_id,
    production_orders: task?.related_production_order,
  };
  const recordId = String(task?.source_record_id || fallbackByModule[moduleId] || recurrence?.source_record_id || '').trim();
  return { moduleId, recordId };
};

export const getAdjacentProcessTasks = (
  task: Record<string, any>,
  siblings: Record<string, any>[],
  direction: 'previous' | 'next',
) => {
  const currentNodeKey = getTaskProcessNodeKey(task);
  const currentLaneKey = getTaskProcessLaneKey(task);
  const currentSort = Number(task?.sort_order || 0);
  const sameLane = siblings
    .filter((row) => String(row?.id || '') !== String(task?.id || '') && getTaskProcessLaneKey(row) === currentLaneKey)
    .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
  const direct = direction === 'previous'
    ? sameLane.filter((row) => Number(row?.sort_order || 0) < currentSort).slice(-1)
    : sameLane.filter((row) => Number(row?.sort_order || 0) > currentSort).slice(0, 1);
  if (direct.length > 0 || !currentNodeKey) return direct;

  const graph = getTaskProcessGraph(task);
  const lanes = Array.isArray(graph?.lanes) ? graph.lanes : [];
  const triggers = Array.isArray(graph?.triggers) ? graph.triggers : [];
  if (direction === 'next') {
    const targetLaneKeys = new Set<string>(
      triggers
        .filter((trigger: any) => String(trigger?.sourceNodeKey || '').trim() === currentNodeKey)
        .flatMap((trigger: any) => Array.isArray(trigger?.targetLaneKeys) ? trigger.targetLaneKeys : [])
        .map((value: any) => String(value || '').trim())
        .filter(Boolean),
    );
    return Array.from(targetLaneKeys)
      .map((laneKey) => siblings
        .filter((row) => getTaskProcessLaneKey(row) === laneKey)
        .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0))[0])
      .filter(Boolean);
  }
  const currentLane = lanes.find((lane: any) => String(lane?.key || '').trim() === currentLaneKey);
  const parentTriggerKey = String(currentLane?.parentTriggerKey || currentLane?.parent_trigger_key || '').trim();
  const parentNodeKey = String(
    triggers.find((trigger: any) => String(trigger?.key || '').trim() === parentTriggerKey)?.sourceNodeKey || ''
  ).trim();
  return parentNodeKey ? siblings.filter((row) => getTaskProcessNodeKey(row) === parentNodeKey).slice(0, 1) : [];
};

export const taskRecipientToken = (task: Record<string, any> | null | undefined): string | null => {
  const roleId = String(task?.assignee_role_id || '').trim();
  if (roleId) return `role:${roleId}`;
  const userId = String(task?.assignee_id || '').trim();
  return userId ? `user:${userId}` : null;
};

export const resolveProcessAutomationTargetTokens = (
  rule: any,
  task: Record<string, any>,
  siblings: Record<string, any>[],
): string[] => {
  let targets: Array<Record<string, any> | null | undefined> = [];
  switch (String(rule?.target_type || '').trim()) {
    case 'current_task_assignee': targets = [task]; break;
    case 'previous_stage_assignee': targets = getAdjacentProcessTasks(task, siblings, 'previous'); break;
    case 'next_stage_assignee': targets = getAdjacentProcessTasks(task, siblings, 'next'); break;
    case 'specific_stage_assignee':
      targets = siblings.filter((row) => getTaskProcessNodeKey(row) === String(rule?.target_stage_node_key || '').trim());
      break;
    case 'task_type_assignee':
      targets = siblings.filter((row) => String(
        row?.task_type || parseAutomationObject(row?.recurrence_info)?.task_type || ''
      ).trim() === String(rule?.target_task_type || '').trim()).slice(0, 1);
      break;
    case 'specific_user': return String(rule?.target_user_id || '').trim() ? [`user:${String(rule.target_user_id).trim()}`] : [];
    case 'specific_role': return String(rule?.target_role_id || '').trim() ? [`role:${String(rule.target_role_id).trim()}`] : [];
  }
  return Array.from(new Set(targets.map(taskRecipientToken).filter(Boolean) as string[]));
};

export const normalizeServerProcessAutomationRule = (rule: any, task: Record<string, any>, index: number) => {
  if (!rule || typeof rule !== 'object' || !String(rule?.target_type || '').trim()) return null;
  const rawTrigger = String(rule?.trigger_type || '').trim();
  let triggerType = ['on_create', 'on_upsert', 'interval', 'previous_stage_completed'].includes(rawTrigger)
    ? rawTrigger
    : 'on_upsert';
  const conditionsAll = Array.isArray(rule?.conditions_all) ? [...rule.conditions_all] : [];
  if (['process_started', 'current_stage_in_progress', 'current_stage_completed'].includes(rawTrigger)) {
    triggerType = 'on_upsert';
    if (!conditionsAll.some((condition: any) => String(condition?.field || '').trim() === '__task__status')) {
      conditionsAll.unshift({
        id: `__legacy_status_${index}`,
        field: '__task__status',
        operator: 'eq',
        value: rawTrigger === 'current_stage_completed' ? 'done' : 'in_progress',
      });
    }
  }
  const noteText = String(rule?.note_text || '').trim() || '{{task_name}} وارد وضعیت {{status_label}} شد.';
  const actions = Array.isArray(rule?.actions) ? rule.actions.map((action: any) => {
    if (!['send_note', 'send_note_sms'].includes(String(action?.type || ''))) return action;
    return {
      ...action,
      config: {
        ...(action?.config || {}),
        note_text: String(action?.config?.note_text || noteText),
        recipient_fields: Array.isArray(action?.config?.recipient_fields) ? action.config.recipient_fields : [],
        attachment_fields: Array.isArray(action?.config?.attachment_fields) ? action.config.attachment_fields : [],
      },
    };
  }) : [{
    id: `__legacy_note_${String(task?.id || 'task')}_${index}`,
    type: 'send_note',
    config: { note_text: noteText, recipient_fields: [], attachment_fields: [] },
  }];
  return {
    ...rule,
    id: String(rule?.id || `process_rule_${String(task?.process_node_key || index)}_${index}`),
    trigger_type: triggerType,
    execution_mode: ['first_match', 'every_match'].includes(String(rule?.execution_mode || ''))
      ? rule.execution_mode
      : 'every_match',
    interval_value: triggerType === 'interval' ? Math.max(1, Number(rule?.interval_value || 1)) : null,
    interval_unit: triggerType === 'interval' && ['hour', 'day', 'week', 'month'].includes(String(rule?.interval_unit || ''))
      ? rule.interval_unit
      : triggerType === 'interval' ? 'day' : null,
    interval_at: triggerType === 'interval' ? String(rule?.interval_at || '').trim() || null : null,
    conditions_all: conditionsAll,
    conditions_any: Array.isArray(rule?.conditions_any) ? rule.conditions_any : [],
    actions,
    is_active: rule?.is_active !== false,
  };
};

export const getTaskProcessAutomationRules = (task: Record<string, any>): any[] => {
  const recurrence = parseAutomationObject(task?.recurrence_info);
  return (Array.isArray(recurrence?.process_automation_rules) ? recurrence.process_automation_rules : [])
    .map((rule: any, index: number) => normalizeServerProcessAutomationRule(rule, task, index))
    .filter((rule: any) => rule && rule?.is_active !== false);
};

export const runnableProcessConditions = (value: any): any[] => {
  const noValueOperators = new Set([
    'is_true', 'is_false', 'is_null', 'not_null', 'is_empty', 'not_empty', 'changed',
    'is_today', 'is_yesterday', 'is_tomorrow', 'is_this_week', 'is_last_week',
    'is_this_month', 'is_last_month', 'is_friday', 'is_official_holiday',
  ]);
  return (Array.isArray(value) ? value : []).filter((condition: any) => {
    if (!String(condition?.field || '').trim()) return false;
    if (noValueOperators.has(String(condition?.operator || 'eq'))) return true;
    return condition?.value !== null
      && condition?.value !== undefined
      && !(typeof condition.value === 'string' && condition.value.trim() === '')
      && !(Array.isArray(condition.value) && condition.value.length === 0);
  });
};

export const evaluateProcessAutomationConditions = async (
  conditionsAll: any[],
  conditionsAny: any[],
  currentRecord: Record<string, any>,
  previousRecord: Record<string, any> | null,
  evaluate: ProcessAutomationConditionEvaluator,
) => {
  for (const condition of conditionsAll) {
    if (!await evaluate(condition, currentRecord, previousRecord)) return false;
  }
  if (conditionsAny.length === 0) return true;
  const negativeOperators = new Set([
    'neq', 'not_in', 'not_contains', 'occasion_neq', 'occasion_not_contains',
    'is_false', 'is_null', 'is_empty',
  ]);
  const byField = new Map<string, any[]>();
  conditionsAny.forEach((condition) => {
    const field = String(condition?.field || '').trim();
    const rows = byField.get(field) || [];
    rows.push(condition);
    byField.set(field, rows);
  });
  const groups: any[][] = [];
  byField.forEach((rows) => {
    if (rows.length > 1 && rows.every((row) => negativeOperators.has(String(row?.operator || '').trim()))) groups.push(rows);
    else rows.forEach((row) => groups.push([row]));
  });
  for (const group of groups) {
    let passed = true;
    for (const condition of group) {
      if (!await evaluate(condition, currentRecord, previousRecord)) { passed = false; break; }
    }
    if (passed) return true;
  }
  return false;
};
