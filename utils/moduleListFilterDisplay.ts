import { FieldType } from '../types';
import { getFieldLabelFa } from './fieldLabel';
import { getAssigneeLabel } from './assigneeLabel';
import { getFieldOptions, getSingleOptionLabel, isUuidLikeValue } from './optionHelpers';
import { WORKFLOW_OPERATORS, workflowOperatorNeedsValue, workflowOperatorNumericValue } from './filterUtils';
import { WORKFLOW_ASSIGNEE_FIELD_KEY } from './workflowTypes';
import { localizeFinancialValue } from './financialValueLabels';
import { safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';

type DisplayContext = {
  moduleId?: string;
  fields: any[];
  dynamicOptions?: Record<string, any[]>;
  relationOptions?: Record<string, any[]>;
  users?: any[];
  roles?: any[];
  tagLabels?: Map<string, string>;
};

const aliases: Record<string, string> = {
  ne: 'neq', nin: 'not_in', ncontains: 'not_contains', startswith: 'starts_with',
  endswith: 'ends_with', null: 'is_null', nnull: 'not_null',
};

const valuesOf = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw.flatMap(valuesOf);
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try { const parsed = JSON.parse(raw); if (Array.isArray(parsed)) return parsed.flatMap(valuesOf); } catch { /* A literal search string. */ }
  }
  return [raw];
};

export const getModuleListFilterValueLabel = (fieldKey: string, raw: any, context: DisplayContext): string => {
  const field = context.fields.find((entry) => entry.key === fieldKey);
  const scalar = (value: any): string => {
    if (value && typeof value === 'object') value = value.value ?? value.id ?? value.label;
    if (value === null || value === undefined || value === '') return 'خالی';
    const token = String(value).trim();
    const isUserField = fieldKey === 'assignee_id' || fieldKey === WORKFLOW_ASSIGNEE_FIELD_KEY || field?.type === FieldType.USER;
    if (isUserField && ['__current_user__', 'current_user'].includes(token)) return 'کاربر در حال مشاهده';
    if (isUserField && ['__current_role__', 'current_role'].includes(token)) return 'نقش کاربر در حال مشاهده';
    if (isUserField) {
      const userId = token.startsWith('user_') ? token.slice(5) : token;
      const roleId = token.startsWith('role_') ? token.slice(5) : token;
      const user = context.users?.find((entry) => String(entry.id) === userId);
      const role = context.roles?.find((entry) => String(entry.id) === roleId);
      if (user) return user.display_name || user.full_name || 'کاربر انتخاب‌شده';
      if (role) return `نقش: ${role.title || 'نقش انتخاب‌شده'}`;
      if (token.startsWith('user_')) return 'کاربر انتخاب‌شده';
      if (token.startsWith('role_')) return 'نقش انتخاب‌شده';
    }
    if (typeof value === 'boolean' || field?.type === FieldType.CHECKBOX) {
      return value === true || value === 1 || token === 'true' || token === '1' ? 'بله' : 'خیر';
    }
    if ([FieldType.DATE, FieldType.DATETIME].includes(field?.type)) {
      return toPersianNumber(safeJalaliFormat(value, field?.type === FieldType.DATE ? 'YYYY/MM/DD' : 'YYYY/MM/DD HH:mm') || 'تاریخ انتخاب‌شده');
    }
    if ([FieldType.NUMBER, FieldType.PRICE, FieldType.PERCENTAGE, FieldType.STOCK, FieldType.TIME].includes(field?.type)) return toPersianNumber(token);
    if (context.tagLabels?.has(token)) return context.tagLabels.get(token)!;
    if (!field) return isUserField ? 'کاربر یا نقش انتخاب‌شده' : isUuidLikeValue(token) ? 'مورد انتخاب‌شده' : toPersianNumber(token);
    const option = getFieldOptions(field, context.dynamicOptions, context.relationOptions).find((entry) => String(entry.value) === token);
    if (!option && (field.type === FieldType.STATUS || fieldKey.includes('status')) && !/[\u0600-\u06ff]/.test(token)) {
      return localizeFinancialValue(token, 'status') || 'وضعیت انتخاب‌شده';
    }
    const label = typeof option?.label === 'string' ? option.label : getSingleOptionLabel(field, value, context.dynamicOptions, context.relationOptions);
    if (isUuidLikeValue(label)) return 'مورد انتخاب‌شده';
    const isChoice = [FieldType.SELECT, FieldType.MULTI_SELECT, FieldType.STATUS, FieldType.TAGS, FieldType.CHECKLIST].includes(field.type);
    return isChoice && label === token && /^[a-z][a-z0-9_-]*$/i.test(token) ? 'گزینهٔ انتخاب‌شده' : label;
  };
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try { raw = JSON.parse(raw); } catch { /* Literal text. */ }
  }
  if (raw && !Array.isArray(raw) && typeof raw === 'object' && ('from' in raw || 'to' in raw)) {
    const from = raw.from !== undefined && raw.from !== '' && raw.from !== null ? scalar(raw.from) : '';
    const to = raw.to !== undefined && raw.to !== '' && raw.to !== null ? scalar(raw.to) : '';
    return from && to ? `از ${from} تا ${to}` : from ? `از ${from}` : to ? `تا ${to}` : 'بازهٔ انتخاب‌شده';
  }
  return valuesOf(raw).map(scalar).filter(Boolean).join('، ');
};

export const getModuleListFilterLabel = (filter: any, context: DisplayContext): string | null => {
  const fieldKey = String(filter?._displayField || filter?.field || '').trim();
  if (!fieldKey && ['and', 'or'].includes(filter?.operator) && Array.isArray(filter.value)) {
    return filter.value.map((child: any) => getModuleListFilterLabel(child, context)).filter(Boolean).join(filter.operator === 'or' ? ' یا ' : ' و ') || null;
  }
  if (!fieldKey) return null;
  const operator = String(filter._displayOperator || filter.operator || 'eq');
  const normalizedOperator = aliases[operator] || operator;
  const operatorLabel = (WORKFLOW_OPERATORS as Record<string, string>)[normalizedOperator] || 'مطابق مقدار انتخاب‌شده';
  const field = context.fields.find((entry) => entry.key === fieldKey);
  const fieldLabel = ['assignee_id', WORKFLOW_ASSIGNEE_FIELD_KEY].includes(fieldKey)
    ? getAssigneeLabel(context.moduleId)
    : getFieldLabelFa(field, { moduleId: context.moduleId, fallback: 'فیلد انتخاب‌شده' });
  const raw = Object.prototype.hasOwnProperty.call(filter, '_displayValue') ? filter._displayValue : filter.value;
  const valueLabel = !workflowOperatorNeedsValue(normalizedOperator) ? '' : workflowOperatorNumericValue(normalizedOperator)
    ? valuesOf(raw).map((value) => toPersianNumber(String(value ?? ''))).join('، ')
    : getModuleListFilterValueLabel(fieldKey, raw, context);
  return `${fieldLabel}: ${operatorLabel}${valueLabel ? ` ${valueLabel}` : ''}`;
};
