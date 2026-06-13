import { describe, expect, it } from 'vitest';
import { buildWorkflowFlowDocument, processRuleToFlowDocument } from './flowAdapters';
import { ProcessAutomationRule } from '../../../utils/processAutomationTypes';

describe('buildWorkflowFlowDocument', () => {
  it('تریگر و شرط‌ها و اقدام‌ها را به سند flow نگاشت می‌کند', () => {
    const document = buildWorkflowFlowDocument({
      trigger_type: 'interval',
      interval_value: 3,
      interval_unit: 'hour',
      is_active: true,
      conditionsAll: [{ id: 'c1', field: 'amount', operator: 'gt', value: 10 }],
      conditionsAny: [],
      actions: [{ id: 'a1', type: 'send_sms', config: {} }],
    });

    expect(document.triggerTitle).toBe('بر اساس بازه زمانی');
    expect(document.triggerSummary).toContain('هر ۳ ساعت');
    expect(document.isActive).toBe(true);
    expect(document.conditionsAll).toHaveLength(1);
    expect(document.actions).toHaveLength(1);
  });

  it('ورودی ناقص را بدون خطا مدیریت می‌کند', () => {
    const document = buildWorkflowFlowDocument({
      trigger_type: null,
      conditionsAll: undefined as any,
      conditionsAny: undefined as any,
      actions: undefined as any,
    });
    expect(document.conditionsAll).toEqual([]);
    expect(document.conditionsAny).toEqual([]);
    expect(document.actions).toEqual([]);
  });
});

describe('processRuleToFlowDocument', () => {
  const baseRule: ProcessAutomationRule = {
    id: 'r1',
    name: 'اتوماسیون تست',
    trigger_type: 'on_upsert',
    target_type: 'current_task_assignee',
    conditions_all: [
      { id: 'locked', field: '__task__task_type', operator: 'eq', value: 'print' },
      { id: 'c1', field: '__task__status', operator: 'eq', value: 'done' },
    ],
    conditions_any: [],
    actions: [{ id: 'a1', type: 'send_note', config: { note_text: 'سلام' } }],
  };

  it('لیبل تریگر فرآیندی را برمی‌گرداند', () => {
    const document = processRuleToFlowDocument(baseRule);
    expect(document.triggerTitle).toBe('وقتی فعالیت ایجاد یا به روز شد');
  });

  it('شرط قفل‌شده نوع فعالیت از سند حذف می‌شود', () => {
    const document = processRuleToFlowDocument(baseRule);
    expect(document.conditionsAll).toHaveLength(1);
    expect(document.conditionsAll[0]?.field).toBe('__task__status');
  });

  it('تریگر بازه‌ای خلاصه زمان‌بندی می‌گیرد', () => {
    const document = processRuleToFlowDocument({
      ...baseRule,
      trigger_type: 'interval',
      interval_value: 2,
      interval_unit: 'day',
    });
    expect(document.triggerSummary).toContain('هر ۲ روز');
  });

  it('rule تهی سند خالی امن برمی‌گرداند', () => {
    const document = processRuleToFlowDocument(null);
    expect(document.actions).toEqual([]);
    expect(document.conditionsAll).toEqual([]);
  });
});
