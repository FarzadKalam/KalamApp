import { describe, expect, it, vi } from 'vitest';
import {
  renderCampaignMessageVariables,
  type CampaignMessageVariableDescriptor,
} from './campaign-message-variables';

const CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';

const render = (
  template: string,
  sourceRecord: Record<string, any>,
  descriptors: CampaignMessageVariableDescriptor[],
  fetchRecord = vi.fn(async () => null as Record<string, any> | null),
) => renderCampaignMessageVariables(template, {
  orgId: 'org-1',
  sourceModuleId: 'invoices',
  sourceRecord,
  descriptors,
  fetchRecord,
  appBaseUrl: 'https://app.example.test',
});

describe('campaign runtime message variables', () => {
  it('resolves direct Persian option labels without exposing their stored value', async () => {
    await expect(render('وضعیت: {{status}}', { status: 'approved' }, [{
      key: 'status', module_id: 'invoices', field_key: 'status', field_type: 'status',
      options: [{ value: 'approved', label: 'تأییدشده' }],
    }])).resolves.toBe('وضعیت: تأییدشده');
  });

  it('resolves relation and user UUIDs to their record labels', async () => {
    const fetchRecord = vi.fn(async (moduleId: string, recordId: string) => {
      if (moduleId === 'customers' && recordId === CUSTOMER_ID) return { id: recordId, system_code: 'CUS-۱۰', name: 'آفتاب' };
      if (moduleId === 'profiles' && recordId === PROFILE_ID) return { id: recordId, full_name: 'مریم رضایی' };
      return null;
    });
    const result = await render(
      '{{customer_id}} / {{reviewer_id}}',
      { customer_id: CUSTOMER_ID, reviewer_id: PROFILE_ID },
      [
        { key: 'customer_id', module_id: 'invoices', field_key: 'customer_id', field_type: 'relation', relation_target_module: 'customers', relation_target_field: 'name' },
        { key: 'reviewer_id', module_id: 'invoices', field_key: 'reviewer_id', field_type: 'user' },
      ],
      fetchRecord,
    );

    expect(result).toBe('آفتاب / مریم رضایی');
    expect(result).not.toContain(CUSTOMER_ID);
    expect(result).not.toContain(PROFILE_ID);
  });

  it('resolves central related-record fields and record links', async () => {
    const fetchRecord = vi.fn(async (moduleId: string, recordId: string) => (
      moduleId === 'customers' && recordId === CUSTOMER_ID
        ? { id: recordId, full_name: 'رضا احمدی' }
        : null
    ));
    const relatedKey = '__workflow_related__customer_id::customers::full_name';
    const result = await render(
      `{{${relatedKey}}} {{__workflow_record_link}}`,
      { id: 'invoice-12', customer_id: CUSTOMER_ID },
      [
        { key: relatedKey, module_id: 'invoices', field_key: relatedKey, field_type: 'text' },
        { key: '__workflow_record_link', module_id: 'invoices', field_key: '__workflow_record_link', field_type: 'text' },
      ],
      fetchRecord,
    );

    expect(result).toBe('رضا احمدی https://app.example.test/invoices/invoice-12');
  });

  it('removes unresolved UUIDs instead of leaking them to recipients', async () => {
    await expect(render('کد {{unknown_relation}}', { unknown_relation: CUSTOMER_ID }, [{
      key: 'unknown_relation', module_id: 'invoices', field_key: 'unknown_relation', field_type: 'text',
    }])).resolves.toBe('کد ');
  });
});
