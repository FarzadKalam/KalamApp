import { describe, expect, it } from 'vitest';
import { FieldType } from '../types';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';
import { getModuleListFilterLabel, getModuleListFilterValueLabel } from './moduleListFilterDisplay';

const id = '11111111-1111-4111-8111-111111111111';
const context = {
  moduleId: 'marketing_leads',
  fields: [
    { key: 'status', labels: { fa: 'وضعیت' }, type: FieldType.STATUS, dynamicOptionsCategory: 'lead_status', options: [{ value: 'new', label: 'جدید' }] },
    { key: 'amount', labels: { fa: 'مبلغ' }, type: FieldType.PRICE },
    { key: 'date', labels: { fa: 'تاریخ' }, type: FieldType.DATE },
    { key: 'enabled', labels: { fa: 'فعال' }, type: FieldType.CHECKBOX },
    { key: 'customer', labels: { fa: 'مشتری' }, type: FieldType.RELATION, relationConfig: { targetModule: 'customers' } },
  ],
  dynamicOptions: { lead_status: [{ value: 'follow_up', label: 'در حال پیگیری' }] },
  relationOptions: { customer: [{ value: id, label: 'مشتری نمونه' }] },
  users: [{ id, full_name: 'کاربر نمونه' }], roles: [{ id: 'sales', title: 'فروش' }],
};

describe('shared module list filter display', () => {
  it.each(['new', ['new'], '["new"]'])('resolves a simple status regardless of selection representation: %j', (value) => {
    expect(getModuleListFilterLabel({ field: 'status', operator: 'eq', value }, context)).toBe('وضعیت: برابر است با جدید');
  });
  it('resolves each selected static and tenant-defined status independently', () => {
    expect(getModuleListFilterValueLabel('status', ['new', 'follow_up'], context)).toBe('جدید، در حال پیگیری');
    expect(getModuleListFilterValueLabel('status', { value: 'follow_up' }, context)).toBe('در حال پیگیری');
    expect(getModuleListFilterValueLabel('status', 'custom_not_loaded', context)).toBe('وضعیت انتخاب‌شده');
  });
  it('uses Persian current-viewer labels for saved and column filters', () => {
    expect(getModuleListFilterLabel({ field: WORKFLOW_ASSIGNEE_FIELD_KEY, operator: 'eq', value: '__current_user__' }, context)).toContain('کاربر در حال مشاهده');
    expect(getModuleListFilterValueLabel('assignee_id', '__current_role__', context)).toBe('نقش کاربر در حال مشاهده');
    expect(getModuleListFilterValueLabel('assignee_id', [`user_${id}`, 'role_sales'], context)).toBe('کاربر نمونه، نقش: فروش');
  });
  it('does not show raw user or relation identifiers while titles are unavailable', () => {
    const empty = { ...context, users: [], roles: [], relationOptions: {} };
    expect(getModuleListFilterValueLabel('assignee_id', `user_${id}`, empty)).toBe('کاربر انتخاب‌شده');
    expect(getModuleListFilterValueLabel('customer', id, empty)).toBe('رکورد مرتبط');
    expect(getModuleListFilterValueLabel('customer', id, context)).toBe('مشتری نمونه');
  });
  it('preserves false and zero and localizes bounded and open-ended ranges', () => {
    expect(getModuleListFilterValueLabel('enabled', false, context)).toBe('خیر');
    expect(getModuleListFilterValueLabel('amount', 0, context)).toBe('۰');
    expect(getModuleListFilterValueLabel('amount', '{"from":0,"to":1200}', context)).toBe('از ۰ تا ۱۲۰۰');
    expect(getModuleListFilterValueLabel('amount', { to: 500 }, context)).toBe('تا ۵۰۰');
  });
  it('uses Persian labels for query operators without inventing an undefined value', () => {
    expect(getModuleListFilterLabel({ field: 'status', operator: 'nnull', value: null }, context)).toBe('وضعیت: خالی نباشد');
    expect(getModuleListFilterLabel({ field: 'status', operator: 'nin', value: ['new'] }, context)).toBe('وضعیت: شامل نشده باشد با جدید');
    expect(getModuleListFilterLabel({ field: 'date', operator: 'is_today' }, context)).toBe('تاریخ: امروز باشد');
    expect(getModuleListFilterLabel({ field: 'date', operator: 'days_passed_gt', value: 3 }, context)).toContain('۳');
  });
  it('uses display metadata instead of transport values and summarizes compound predicates', () => {
    expect(getModuleListFilterLabel({ operator: 'or', value: [{ field: 'status', operator: 'eq', value: 'new' }], _displayField: WORKFLOW_ASSIGNEE_FIELD_KEY, _displayOperator: 'eq', _displayValue: '__current_user__' }, context)).toContain('کاربر در حال مشاهده');
    expect(getModuleListFilterLabel({ operator: 'or', value: [{ field: 'status', operator: 'eq', value: 'new' }, { field: 'status', operator: 'eq', value: 'follow_up' }] }, context)).toBe('وضعیت: برابر است با جدید یا وضعیت: برابر است با در حال پیگیری');
  });
});
