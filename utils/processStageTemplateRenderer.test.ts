import { describe, expect, it } from 'vitest';
import { renderProcessStageForTaskCreation } from '../supabase/functions/_shared/process-stage-template-renderer';

const values: Record<string, any> = {
  customer_name: 'مشتری نمونه',
  amount: 1250000,
  approved: true,
};

const renderText = async (template: string) => template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_token, key) =>
  String(values[String(key).trim()] ?? '')
);
const resolveRaw = async (fieldKey: string) => values[fieldKey];

describe('server process stage template renderer', () => {
  it('renders the task name and description before real task creation', async () => {
    const result = await renderProcessStageForTaskCreation({
      stageName: 'پیگیری {{customer_name}}',
      metadata: { description: 'مبلغ: {{amount}}' },
    }, renderText, resolveRaw);

    expect(result.stageName).toBe('پیگیری مشتری نمونه');
    expect(result.metadata.description).toBe('مبلغ: 1250000');
    expect(result.metadata.template_rendered_server_side).toBe(true);
  });

  it('keeps exact custom-field variables typed while rendering embedded text', async () => {
    const result = await renderProcessStageForTaskCreation({
      stageName: 'مرحله',
      metadata: {
        process_task_custom_fields: [
          { key: 'amount', defaultValue: '{{amount}}' },
          { key: 'caption', default_value: 'برای {{customer_name}}' },
        ],
        process_task_custom_field_values: { approved: '{{approved}}' },
      },
    }, renderText, resolveRaw);

    expect(result.metadata.process_task_custom_fields[0].defaultValue).toBe(1250000);
    expect(result.metadata.process_task_custom_fields[1].default_value).toBe('برای مشتری نمونه');
    expect(result.metadata.process_task_custom_field_values.approved).toBe(true);
  });
});
