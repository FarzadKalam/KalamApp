import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { formatListCellValue } from './listPrintExport';

describe('formatListCellValue assignee display', () => {
  it('renders relation fields as labels instead of UUIDs', () => {
    const customerId = '11111111-1111-1111-1111-111111111111';

    const value = formatListCellValue(
      { key: 'customer_id', label: 'مشتری', type: FieldType.RELATION },
      { customer_id: customerId },
      {
        customer_id: [
          { label: 'شرکت نمونه', value: customerId },
        ],
      }
    );

    expect(value).toBe('شرکت نمونه');
  });

  it('renders role assignee_id as a label instead of a UUID', () => {
    const roleId = '22222222-2222-2222-2222-222222222222';

    const value = formatListCellValue(
      { key: 'assignee_id', label: 'مسئول', type: FieldType.USER },
      {
        assignee_id: null,
        assignee_role_id: roleId,
        assignee_type: 'role',
      },
      {
        __workflow_assignee: [
          { label: 'تیم فروش', value: `role_${roleId}` },
        ],
      }
    );

    expect(value).toBe('تیم فروش');
  });

  it('renders workflow role combo values as labels instead of role-prefixed IDs', () => {
    const roleId = '43147e04-6a09-4e7c-a7f7-3eaf21aa3dfa';

    const value = formatListCellValue(
      { key: '__workflow_assignee', label: 'مسئول', type: FieldType.SELECT },
      { __workflow_assignee: `role_${roleId}` },
      {
        __workflow_assignee: [
          { label: 'نقش فروش', value: `role_${roleId}` },
        ],
      }
    );

    expect(value).toBe('نقش فروش');
  });
});
