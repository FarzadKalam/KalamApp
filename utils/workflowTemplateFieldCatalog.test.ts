import { describe, expect, it } from 'vitest';
import { FieldNature, FieldType } from '../types';
import { attachWorkflowTemplateFieldCatalog } from './workflowTemplateFieldCatalog';

describe('workflowTemplateFieldCatalog', () => {
  it('uses module id only as resolver context and snapshots Persian labels', () => {
    const [action] = attachWorkflowTemplateFieldCatalog(
      [{ type: 'send_sms', config: { message: 'وضعیت: {{status}}' } } as any],
      'tasks',
      [{
        key: 'status',
        labels: { fa: 'وضعیت فعالیت', en: 'Task status' },
        type: FieldType.STATUS,
        nature: FieldNature.STANDARD,
        options: [{ value: 'done', label: 'تکمیل شده' }],
      } as any],
    );

    expect((action.config as any).__template_field_catalog.status).toMatchObject({
      moduleId: 'tasks',
      fieldKey: 'status',
      label: 'وضعیت فعالیت',
      options: [{ value: 'done', label: 'تکمیل شده' }],
    });
    expect((action.config as any).message).toBe('وضعیت: {{status}}');
  });

  it('keeps relation metadata so scheduled workers can resolve UUIDs to record titles', () => {
    const [action] = attachWorkflowTemplateFieldCatalog(
      [{ type: 'send_email', config: { subject: 'مشتری {{customer_id}}' } } as any],
      'invoices',
      [{
        key: 'customer_id',
        labels: { fa: 'مشتری', en: 'Customer' },
        type: FieldType.RELATION,
        nature: FieldNature.STANDARD,
        relationConfig: { targetModule: 'customers', targetField: 'full_name' },
      } as any],
    );

    expect((action.config as any).__template_field_catalog.customer_id).toMatchObject({
      label: 'مشتری',
      moduleId: 'invoices',
      relationConfig: { targetModule: 'customers', targetField: 'full_name' },
    });
  });
});
