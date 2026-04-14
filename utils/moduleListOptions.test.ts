import { describe, expect, it } from 'vitest';
import { customerModule } from '../modules/customerConfig';
import { buildModuleListOptionPlan } from './moduleListOptions';

describe('buildModuleListOptionPlan', () => {
  it('keeps initial list preload limited to visible list fields', () => {
    const plan = buildModuleListOptionPlan(customerModule);

    expect(plan.immediateDynamicCategories).toEqual(['customer_industry', 'customer_interests']);
    expect(plan.immediateRelationFields).toEqual([]);
    expect(plan.allRelationFields.map((field) => field.key)).toEqual(
      expect.arrayContaining([
        'related_employee_id',
        'referrer_customer_id',
        'referrer_employee_id',
        'referrer_supplier_id',
        'process_template_id',
      ])
    );
  });

  it('includes custom visible relation fields in the eager preload plan', () => {
    const plan = buildModuleListOptionPlan(customerModule, ['full_name', 'industry', 'referrer_customer_id']);

    expect(plan.immediateDynamicCategories).toEqual(['customer_industry']);
    expect(plan.immediateRelationFields.map((field) => field.key)).toEqual(['referrer_customer_id']);
  });
});
