import { evaluateFormulaExpression, type FormulaExpressionNode } from './formulaRuntime';
import { withProcessTaskCustomFieldValues } from './processTaskCustomFields';
import { evaluateWorkflowConditions } from './workflowRuntime';
import type { WorkflowCondition } from './workflowTypes';
import {
  type ActivityPerformancePayItem,
  getActivityPerformanceMetricLabel,
  getTaskProcessTemplateId,
  resolveActivityPerformanceMetricQuantity,
  withActivityPerformanceFieldAliases,
} from './activityPerformanceFields';

export type ActivityPerformanceRule = {
  id: string;
  name?: string | null;
  employee_id?: string | null;
  task_type?: string | null;
  formula_id?: string | null;
  output_type?: string | null;
  priority?: number | null;
  conditions_all?: WorkflowCondition[] | null;
  conditions_any?: WorkflowCondition[] | null;
  is_active?: boolean | null;
  config?: Record<string, any> | null;
};

export type ActivityPerformanceFormula = {
  id: string;
  name?: string | null;
  expression_config?: FormulaExpressionNode | string | null;
  output_type?: string | null;
  config?: Record<string, any> | null;
};

export type ActivityPerformanceEntry = {
  source_rule_id: string;
  source_key?: string;
  formula_id: string;
  employee_id: string;
  task_id: string;
  title: string;
  amount: number;
  output_type: string;
  metric_key?: string;
  metric_label?: string;
  quantity?: number;
  rate?: number;
  errors: string[];
  snapshot: Record<string, any>;
};

export type EvaluateActivityPerformanceRulesInput = {
  rules: ActivityPerformanceRule[];
  formulas: ActivityPerformanceFormula[];
  tasks: Record<string, any>[];
  employeeIdByAssigneeId: Record<string, string>;
  taskMetricsById?: Record<string, Record<string, any>>;
  alreadyIncludedSourceKeys?: Set<string> | string[];
};

const parseExpression = (raw: ActivityPerformanceFormula['expression_config']): FormulaExpressionNode | null => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const toNumber = (value: unknown) => {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export const buildActivityPerformanceSourceKey = ({
  employeeId,
  taskId,
  ruleId,
  metricKey,
}: {
  employeeId: string;
  taskId: string;
  ruleId: string;
  metricKey: string;
}) => `activity_performance:${employeeId}:${taskId}:${ruleId}:${metricKey}`;

const getConstants = (rule: ActivityPerformanceRule, formula: ActivityPerformanceFormula) => ({
  ...(formula.config && typeof formula.config === 'object' ? formula.config : {}),
  ...(rule.config && typeof rule.config === 'object' ? rule.config : {}),
});

const evaluateSimpleRuleAmount = (
  rule: ActivityPerformanceRule,
  taskContext: Record<string, any>,
) => {
  const config = rule.config && typeof rule.config === 'object' ? rule.config : {};
  const total =
    toNumber(config.fixed_amount) +
    (toNumber(config.weight_amount) * toNumber(taskContext.weight)) +
    (toNumber(config.late_minute_amount) * toNumber(taskContext.late_minutes)) +
    (toNumber(config.early_minute_amount) * toNumber(taskContext.early_minutes)) +
    (toNumber(config.activity_minute_amount) * toNumber(taskContext.activity_minutes));

  if ((rule.output_type || '').trim() === 'penalty') {
    return -Math.abs(total);
  }

  return total;
};

const normalizePayItems = (rule: ActivityPerformanceRule): ActivityPerformancePayItem[] => {
  const rawItems = Array.isArray(rule.config?.pay_items) ? rule.config?.pay_items : [];
  return rawItems
    .map((item: any) => ({
      id: String(item?.id || '').trim() || undefined,
      metric_key: String(item?.metric_key || '').trim(),
      metric_label: String(item?.metric_label || '').trim() || null,
      amount: item?.amount,
    }))
    .filter((item: ActivityPerformancePayItem) => item.metric_key && toNumber(item.amount) !== 0);
};

const getRuleProcessScope = (rule: ActivityPerformanceRule) => {
  const rawScope = String(rule.config?.process_scope || 'all_processes').trim();
  return ['all_processes', 'no_process', 'specific_processes'].includes(rawScope) ? rawScope : 'all_processes';
};

const isRuleProcessCandidate = (rule: ActivityPerformanceRule, task: Record<string, any>) => {
  const scope = getRuleProcessScope(rule);
  const templateId = getTaskProcessTemplateId(task);
  if (scope === 'no_process') return !templateId;
  if (scope === 'specific_processes') {
    const selectedIds = Array.isArray(rule.config?.process_template_ids)
      ? rule.config.process_template_ids.map((item: any) => String(item || '').trim()).filter(Boolean)
      : [];
    return !!templateId && selectedIds.includes(templateId);
  }
  return true;
};

const isRuleCandidateForTask = (
  rule: ActivityPerformanceRule,
  task: Record<string, any>,
  employeeId: string,
) => {
  if (rule.is_active === false) return false;
  const scopedEmployeeId = String(rule.employee_id || '').trim();
  if (scopedEmployeeId && scopedEmployeeId !== employeeId) return false;
  const scopedProfileIds = Array.isArray(rule.config?.assignee_profile_ids)
    ? rule.config.assignee_profile_ids.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  const scopedRoleIds = Array.isArray(rule.config?.assignee_role_ids)
    ? rule.config.assignee_role_ids.map((item: any) => String(item || '').trim()).filter(Boolean)
    : [];
  if (scopedProfileIds.length > 0 && !scopedProfileIds.includes(String(task?.assignee_id || '').trim())) return false;
  if (scopedRoleIds.length > 0 && !scopedRoleIds.includes(String(task?.assignee_role_id || '').trim())) return false;
  const taskType = String(rule.task_type || '').trim();
  if (taskType && taskType !== String(task?.task_type || '').trim()) return false;
  if (!isRuleProcessCandidate(rule, task)) return false;
  return true;
};

export const evaluateActivityPerformanceRules = async ({
  rules,
  formulas,
  tasks,
  employeeIdByAssigneeId,
  taskMetricsById = {},
  alreadyIncludedSourceKeys = new Set<string>(),
}: EvaluateActivityPerformanceRulesInput): Promise<ActivityPerformanceEntry[]> => {
  const formulaById = new Map(
    (Array.isArray(formulas) ? formulas : [])
      .filter((formula) => formula?.id)
      .map((formula) => [String(formula.id), formula]),
  );
  const sortedRules = [...(Array.isArray(rules) ? rules : [])].sort(
    (a, b) => toNumber(a.priority) - toNumber(b.priority),
  );
  const includedSourceKeySet = alreadyIncludedSourceKeys instanceof Set
    ? alreadyIncludedSourceKeys
    : new Set((alreadyIncludedSourceKeys || []).map((item) => String(item || '').trim()).filter(Boolean));
  const entries: ActivityPerformanceEntry[] = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const assigneeId = String(task?.assignee_id || '').trim();
    const employeeId = assigneeId ? String(employeeIdByAssigneeId[assigneeId] || '').trim() : '';
    if (!employeeId) continue;

    const taskId = String(task?.id || '').trim();
    const taskWithCustomFields = withActivityPerformanceFieldAliases(withProcessTaskCustomFieldValues(task));
    const metrics = taskId ? taskMetricsById[taskId] || {} : {};
    const taskContext = { ...taskWithCustomFields, ...metrics };

    for (const rule of sortedRules) {
      if (!isRuleCandidateForTask(rule, taskContext, employeeId)) continue;
      const passed = await evaluateWorkflowConditions({
        conditionsAll: rule.conditions_all || [],
        conditionsAny: rule.conditions_any || [],
        currentRecord: taskContext,
        moduleId: 'tasks',
      });
      if (!passed) continue;

      const formula = formulaById.get(String(rule.formula_id || ''));
      const expression = parseExpression(formula?.expression_config || null);
      const formulaResult = formula && expression
        ? evaluateFormulaExpression(expression, {
          task: taskContext,
          employee: { id: employeeId },
          constants: getConstants(rule, formula),
        })
        : null;
      if (formulaResult) {
        const metricKey = 'formula';
        const sourceKey = buildActivityPerformanceSourceKey({
          employeeId,
          taskId,
          ruleId: String(rule.id),
          metricKey,
        });
        if (includedSourceKeySet.has(sourceKey)) continue;

        entries.push({
          source_rule_id: String(rule.id),
          source_key: sourceKey,
          formula_id: String(formula?.id || ''),
          employee_id: employeeId,
          task_id: taskId,
          title: rule.name || formula?.name || 'ضریب فعالیت',
          amount: (rule.output_type || '').trim() === 'penalty'
            ? -Math.abs(toNumber(formulaResult.value))
            : toNumber(formulaResult.value),
          output_type: rule.output_type || formula?.output_type || 'money',
          metric_key: metricKey,
          metric_label: formula?.name || 'فرمول',
          quantity: 1,
          rate: toNumber(formulaResult.value),
          errors: formulaResult.errors || [],
          snapshot: {
            task_id: taskId,
            task_type: taskContext.task_type || null,
            process_template_id: getTaskProcessTemplateId(taskContext) || null,
            assignee_id: assigneeId,
            formula_name: formula?.name || null,
            rule_name: rule.name || null,
            metric_key: metricKey,
            metric_label: formula?.name || 'فرمول',
            evaluation_mode: 'formula',
          },
        });
        continue;
      }

      const payItems = normalizePayItems(rule);
      if (payItems.length === 0) {
        const metricKey = 'legacy_simple';
        const sourceKey = buildActivityPerformanceSourceKey({
          employeeId,
          taskId,
          ruleId: String(rule.id),
          metricKey,
        });
        if (includedSourceKeySet.has(sourceKey)) continue;
        const amount = evaluateSimpleRuleAmount(rule, taskContext);
        entries.push({
          source_rule_id: String(rule.id),
          source_key: sourceKey,
          formula_id: '',
          employee_id: employeeId,
          task_id: taskId,
          title: rule.name || 'ضریب فعالیت',
          amount,
          output_type: rule.output_type || 'money',
          metric_key: metricKey,
          metric_label: 'محاسبه ساده',
          quantity: 1,
          rate: amount,
          errors: [],
          snapshot: {
            task_id: taskId,
            task_type: taskContext.task_type || null,
            process_template_id: getTaskProcessTemplateId(taskContext) || null,
            assignee_id: assigneeId,
            rule_name: rule.name || null,
            metric_key: metricKey,
            metric_label: 'محاسبه ساده',
            evaluation_mode: 'simple',
          },
        });
        continue;
      }

      for (const item of payItems) {
        const metricKey = String(item.metric_key || '').trim();
        if (!metricKey) continue;
        const sourceKey = buildActivityPerformanceSourceKey({
          employeeId,
          taskId,
          ruleId: String(rule.id),
          metricKey,
        });
        if (includedSourceKeySet.has(sourceKey)) continue;
        const quantity = resolveActivityPerformanceMetricQuantity(metricKey, taskContext);
        const rate = toNumber(item.amount);
        const rawAmount = quantity * rate;
        if (rawAmount === 0) continue;
        const amount = (rule.output_type || '').trim() === 'penalty' ? -Math.abs(rawAmount) : rawAmount;
        const metricLabel = getActivityPerformanceMetricLabel(metricKey, item.metric_label);
        entries.push({
          source_rule_id: String(rule.id),
          source_key: sourceKey,
          formula_id: '',
          employee_id: employeeId,
          task_id: taskId,
          title: rule.name || 'ضریب فعالیت',
          amount,
          output_type: rule.output_type || 'money',
          metric_key: metricKey,
          metric_label: metricLabel,
          quantity,
          rate,
          errors: [],
          snapshot: {
            task_id: taskId,
            task_type: taskContext.task_type || null,
            process_template_id: getTaskProcessTemplateId(taskContext) || null,
            assignee_id: assigneeId,
            rule_name: rule.name || null,
            metric_key: metricKey,
            metric_label: metricLabel,
            quantity,
            rate,
            evaluation_mode: 'pay_items',
          },
        });
      }
    }
  }

  return entries;
};
