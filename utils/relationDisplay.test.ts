import { describe, expect, it } from 'vitest';

import { buildRelationDisplayLabel, getRelationDisplayFields } from './relationDisplay';

describe('relation display labels', () => {
  it('uses the generated full customer name when automatic naming is enabled', () => {
    const label = buildRelationDisplayLabel(
      'customers',
      {
        full_name: 'شرکت آفتاب',
        business_name: 'شرکت آفتاب',
        auto_name_enabled: true,
      },
      'full_name',
    );

    expect(label).toBe('شرکت آفتاب');
  });

  it('keeps the configured customer label template when automatic naming is disabled', () => {
    const label = buildRelationDisplayLabel(
      'customers',
      {
        full_name: 'علی رضایی',
        business_name: 'فروشگاه آفتاب',
        auto_name_enabled: false,
      },
      'full_name',
    );

    expect(label).toBe('علی رضایی - فروشگاه آفتاب');
  });

  it('fetches the automatic naming flag for customer relation labels', () => {
    expect(getRelationDisplayFields('customers', 'full_name')).toContain('auto_name_enabled');
  });
});
