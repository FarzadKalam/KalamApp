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
});
