import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import {
  buildReportTaskProcessFieldKey,
  buildTaskReportProcessFields,
  resolveTaskReportProcessFieldValue,
} from './reportTaskProcessFields';

describe('task process report fields', () => {
  it('keeps custom fields scoped to their process stage and reads snapshot values', () => {
    const fields = buildTaskReportProcessFields([{
      templateId: 'template-a',
      templateName: 'فرآیند فروش',
      stageId: 'stage-a',
      stageName: 'بررسی مالی',
      processNodeKey: 'finance_review',
      field: { key: 'approved_amount', type: FieldType.NUMBER, labels: { fa: 'مبلغ تاییدشده', en: 'Approved amount' } },
    }]);
    const key = fields[0].key;

    expect(key).toBe(buildReportTaskProcessFieldKey('template-a', 'finance_review', 'approved_amount'));
    expect(fields[0].labels?.fa).toBe('مبلغ تاییدشده (فرآیند «فرآیند فروش» / مرحله «بررسی مالی»)');
    expect(resolveTaskReportProcessFieldValue({
      source_template_id: 'template-a',
      process_node_key: 'finance_review',
      recurrence_info: {
        process_task_custom_fields: [{ key: 'approved_amount', type: FieldType.NUMBER, labels: { fa: 'مبلغ تاییدشده' } }],
        process_task_custom_field_values: { approved_amount: 125000 },
      },
    }, key)).toBe(125000);
    expect(resolveTaskReportProcessFieldValue({ source_template_id: 'template-a', process_node_key: 'other' }, key)).toBeNull();
  });
});
