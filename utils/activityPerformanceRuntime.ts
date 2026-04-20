import { evaluateFormulaExpression, type FormulaExpressionNode } from './formulaRuntime';
import { withProcessTaskCustomFieldValues } from './processTaskCustomFields';
import { evaluateWorkflowConditions } from './workflowRuntime';
import type { WorkflowCondition } from './workflowTypes';

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
  formula_id: string;
  employee_id: string;
  task_id: string;
  title: string;
  amount: number;
  output_type: string;
  errors: string[];
  snapshot: Record<string, any>;
};

export type EvaluateActivityPerformanceRulesInput = {
  rules: ActivityPerformanceRule[];
  formulas: ActivityPerformanceFormula[];
  tasks: Record<string, any>[];
  employeeIdByAssigneeId: Record<string, string>;
  taskMetricsById?: Record<string, Record<string, any>>;
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
  return true;
};

export const evaluateActivityPerformanceRules = async ({
  rules,
  formulas,
  tasks,
  employeeIdByAssigneeId,
  taskMetricsById = {},
}: EvaluateActivityPerformanceRulesInput): Promise<ActivityPerformanceEntry[]> => {
  const formulaById = new Map(
    (Array.isArray(formulas) ? formulas : [])
      .filter((formula) => formula?.id)
      .map((formula) => [String(formula.id), formula]),
  );
  const sortedRules = [...(Array.isArray(rules) ? rules : [])].sort(
    (a, b) => toNumber(a.priority) - toNumber(b.priority),
  );
  const entries: ActivityPerformanceEntry[] = [];

  for (const task of Array.isArray(tasks) ? tasks : []) {
    const assigneeId = String(task?.assignee_id || '').trim();
    const employeeId = assigneeId ? String(employeeIdByAssigneeId[assigneeId] || '').trim() : '';
    if (!employeeId) continue;

    const taskId = String(task?.id || '').trim();
    const taskWithCustomFields = withProcessTaskCustomFieldValues(task);
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
      const amount = formulaResult ? formulaResult.value : evaluateSimpleRuleAmount(rule, taskContext);

      entries.push({
        source_rule_id: String(rule.id),
        formula_id: String(formula?.id || ''),
        employee_id: employeeId,
        task_id: taskId,
        title: rule.name || formula?.name || 'ضریب فعالیت',
        amount,
        output_type: rule.output_type || formula?.output_type || 'money',
        errors: formulaResult?.errors || [],
        snapshot: {
          task_id: taskId,
          task_type: taskContext.task_type || null,
          assignee_id: assigneeId,
          formula_name: formula?.name || null,
          rule_name: rule.name || null,
          evaluation_mode: formulaResult ? 'formula' : 'simple',
        },
      });
    }
  }

  return entries;
};
