import { describe, expect, it } from 'vitest';
import {
  appendCampaignMessageVariable,
  buildCampaignMessageVariableOptions,
} from './campaignMessageVariableCatalog';

describe('campaign message variable catalog', () => {
  it('uses only enabled audience modules and includes each Persian module label', () => {
    const options = buildCampaignMessageVariableOptions([
      {
        target_module_id: 'customers',
        enabled: false,
        conditions_all: [],
        conditions_any: [],
      },
      {
        target_module_id: 'marketing_leads',
        enabled: true,
        conditions_all: [],
        conditions_any: [],
      },
    ]);

    expect(options.some((option) => option.moduleId === 'marketing_leads')).toBe(true);
    expect(options.some((option) => option.moduleId === 'customers')).toBe(false);
    expect(options.some((option) => option.moduleId === 'invoices')).toBe(true);
    expect(options.find((option) => option.moduleId === 'marketing_leads')?.label)
      .toContain('(لیدهای بازاریابی)');
    expect(options.every((option) => option.token === `{{${option.fieldKey}}}`)).toBe(true);
    expect(options.some((option) => option.fieldKey === '__workflow_record_link')).toBe(true);
    expect(options.every((option) => option.descriptor.module_id === option.moduleId)).toBe(true);
    expect(options.every((option) => option.descriptor.field_key === option.fieldKey)).toBe(true);
  });

  it('inserts a selected token once without replacing the message', () => {
    expect(appendCampaignMessageVariable('سلام', '{{name}}')).toBe('سلام {{name}}');
    expect(appendCampaignMessageVariable('سلام {{name}}', '{{name}}')).toBe('سلام {{name}}');
  });
});
