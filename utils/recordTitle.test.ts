import { describe, expect, it } from 'vitest';
import { getRecordTitle } from './recordTitle';

const employeesTitleConfig = {
  id: 'employees',
  fields: [
    { key: 'full_name', isKey: true },
    { key: 'first_name' },
    { key: 'last_name' },
  ],
} as any;

describe('getRecordTitle', () => {
  it('uses the configured full employee name as the primary title', () => {
    expect(getRecordTitle({
      full_name: 'خانم نرگس احمدی',
      first_name: 'نرگس',
      last_name: 'احمدی',
    }, employeesTitleConfig)).toBe('خانم نرگس احمدی');
  });

  it('falls back to first and last name when an older employee has no full name yet', () => {
    expect(getRecordTitle({
      first_name: 'نرگس',
      last_name: 'احمدی',
    }, employeesTitleConfig)).toBe('نرگس احمدی');
  });
});
