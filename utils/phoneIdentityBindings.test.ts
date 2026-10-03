import { describe, expect, it } from 'vitest';
import {
  buildPhoneTargetDisplayName,
  PHONE_BIND_TARGET_MODULES,
  PHONE_BIND_TARGET_OPTIONS,
} from './phoneIdentityBindings';

describe('phone identity bindings for marketing leads', () => {
  it('offers marketing leads as a manual phone-binding target', () => {
    expect(PHONE_BIND_TARGET_MODULES).toContain('marketing_leads');
    expect(PHONE_BIND_TARGET_OPTIONS).toContainEqual({ label: 'لید', value: 'marketing_leads' });
  });

  it('uses the readable lead title without exposing a record identifier', () => {
    expect(buildPhoneTargetDisplayName('marketing_leads', {
      business_name: 'فروشگاه بهار',
      name: 'پیگیری فروشگاه بهار',
      sarnakh_code: 'L-42',
    })).toBe('فروشگاه بهار');
    expect(buildPhoneTargetDisplayName('marketing_leads', {
      name: 'پیگیری خرید',
      sarnakh_code: 'L-43',
    })).toBe('پیگیری خرید');
  });
});
