import { describe, expect, it } from 'vitest';
import { evaluateActivityPerformanceRules } from './activityPerformanceRuntime';
import { createWeightTimesConstantFormula } from './formulaRuntime';

describe('activityPerformanceRuntime', () => {
  it('evaluates active matching rules with the default weight formula', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [{
        id: 'rule-1',
        name: 'پاداش وزن',
        formula_id: 'formula-1',
        task_type: 'delivery',
        output_type: 'money',
        conditions_all: [{ id: 'c1', field: 'status', operator: 'eq', value: 'done' }],
        conditions_any: [],
        is_active: true,
        config: { constant: 2000 },
      }],
      formulas: [{
        id: 'formula-1',
        name: 'وزن ضربدر عدد ثابت',
        expression_config: createWeightTimesConstantFormula(),
        output_type: 'money',
      }],
      tasks: [{
        id: 'task-1',
        status: 'done',
        task_type: 'delivery',
        assignee_id: 'profile-1',
        weight: 8,
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source_rule_id: 'rule-1',
      formula_id: 'formula-1',
      employee_id: 'employee-1',
      task_id: 'task-1',
      amount: 16000,
      output_type: 'money',
    });
  });

  it('keeps process task custom fields available for formulas', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [{
        id: 'rule-1',
        formula_id: 'formula-1',
        conditions_all: [],
        conditions_any: [],
        is_active: true,
      }],
      formulas: [{
        id: 'formula-1',
        expression_config: {
          type: 'binary',
          operator: 'multiply',
          left: { type: 'field', path: 'task.custom_score', fallback: 0 },
          right: { type: 'constant', value: 1000 },
        },
      }],
      tasks: [{
        id: 'task-1',
        assignee_id: 'profile-1',
        recurrence_info: {
          process_task_custom_fields: [{ key: 'custom_score', type: 'number', labels: { fa: 'امتیاز اختصاصی' } }],
          process_task_custom_field_values: { custom_score: 7 },
        },
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
    });

    expect(entries[0]?.amount).toBe(7000);
  });

  it('ignores inactive, employee-scoped, and non-matching type rules', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [
        { id: 'inactive', formula_id: 'formula-1', is_active: false },
        { id: 'wrong-employee', formula_id: 'formula-1', employee_id: 'employee-2' },
        { id: 'wrong-type', formula_id: 'formula-1', task_type: 'install' },
      ],
      formulas: [{
        id: 'formula-1',
        expression_config: createWeightTimesConstantFormula(),
      }],
      tasks: [{
        id: 'task-1',
        assignee_id: 'profile-1',
        task_type: 'delivery',
        weight: 8,
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
    });

    expect(entries).toEqual([]);
  });

  it('evaluates simple per-activity rules without formula', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [{
        id: 'simple-1',
        output_type: 'bonus',
        task_type: 'delivery',
        is_active: true,
        config: {
          fixed_amount: 5000,
          weight_amount: 100,
          late_minute_amount: 10,
          early_minute_amount: 50,
          activity_minute_amount: 5,
        },
      }],
      formulas: [],
      tasks: [{
        id: 'task-1',
        assignee_id: 'profile-1',
        task_type: 'delivery',
        weight: 8,
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      taskMetricsById: {
        'task-1': {
          weight: 8,
          late_minutes: 3,
          early_minutes: 10,
          activity_minutes: 20,
        },
      },
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.amount).toBe(6430);
    expect(entries[0]?.snapshot?.evaluation_mode).toBe('simple');
  });

  it('evaluates pay item rules with process scope and stable source keys', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [{
        id: 'rule-1',
        name: 'پاداش فرآیند نصب',
        output_type: 'bonus',
        conditions_all: [{ id: 'c1', field: 'status', operator: 'eq', value: 'done' }],
        conditions_any: [],
        is_active: true,
        config: {
          assignee_profile_ids: ['profile-1'],
          process_scope: 'specific_processes',
          process_template_ids: ['template-1'],
          pay_items: [
            { metric_key: 'activity_count', metric_label: 'فعالیت', amount: 1000 },
            { metric_key: 'weight', metric_label: 'هر واحد وزن', amount: 200 },
          ],
        },
      }],
      formulas: [],
      tasks: [{
        id: 'task-1',
        status: 'done',
        assignee_id: 'profile-1',
        weight: 3,
        recurrence_info: {
          process_group: { template_id: 'template-1' },
        },
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
    });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.amount)).toEqual([1000, 600]);
    expect(entries[0]?.source_key).toBe('activity_performance:employee-1:task-1:rule-1:activity_count');
    expect(entries[1]?.snapshot?.evaluation_mode).toBe('pay_items');
  });

  it('skips already included source keys and makes penalty amounts negative', async () => {
    const entries = await evaluateActivityPerformanceRules({
      rules: [{
        id: 'rule-1',
        output_type: 'penalty',
        conditions_all: [{ id: 'c1', field: 'status', operator: 'eq', value: 'done' }],
        is_active: true,
        config: {
          pay_items: [
            { metric_key: 'activity_count', metric_label: 'فعالیت', amount: 1000 },
            { metric_key: 'late_minutes', metric_label: 'هر دقیقه تاخیر', amount: 50 },
          ],
        },
      }],
      formulas: [],
      tasks: [{
        id: 'task-1',
        status: 'done',
        assignee_id: 'profile-1',
      }],
      employeeIdByAssigneeId: { 'profile-1': 'employee-1' },
      taskMetricsById: {
        'task-1': { late_minutes: 4 },
      },
      alreadyIncludedSourceKeys: new Set(['activity_performance:employee-1:task-1:rule-1:activity_count']),
    });

    expect(entries).toHaveLength(1);
    expect(entries[0]?.metric_key).toBe('late_minutes');
    expect(entries[0]?.amount).toBe(-200);
  });
});
