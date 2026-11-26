import { FieldType, type ModuleField } from '../types';
import { getConditionTableSources } from './conditionTableFields';
import { getWorkflowOperatorOptions, workflowOperatorNeedsValue } from './filterUtils';
import { parseWorkflowRelatedFieldKey, type WorkflowCondition } from './workflowTypes';

const numericTypes = new Set([FieldType.NUMBER, FieldType.PRICE, FieldType.PERCENTAGE]);
const scalarTypes = new Set([
  ...numericTypes, FieldType.SELECT, FieldType.STATUS, FieldType.RELATION, FieldType.DATE,
  FieldType.DATETIME, FieldType.TEXT, FieldType.LONG_TEXT, FieldType.CHECKBOX,
]);

const baseOperators = new Set(['eq', 'neq', 'in', 'not_in', 'is_null', 'not_null']);
const numericOperators = new Set(['gt', 'gte', 'lt', 'lte']);
const textOperators = new Set(['contains', 'not_contains', 'starts_with', 'ends_with']);
const dateOperators = new Set(['after_date', 'before_date', 'date_between', 'is_today', 'is_yesterday', 'is_tomorrow']);

export const getCustomerClubServerOperatorOptions = (field?: ModuleField | null) => {
  if (!field || !scalarTypes.has(field.type)) return [];
  return getWorkflowOperatorOptions(field).filter(({ value }) =>
    baseOperators.has(value)
    || (numericTypes.has(field.type) && numericOperators.has(value))
    || ([FieldType.TEXT, FieldType.LONG_TEXT].includes(field.type) && textOperators.has(value))
    || ([FieldType.DATE, FieldType.DATETIME].includes(field.type) && dateOperators.has(value))
    || (field.type === FieldType.CHECKBOX && (value === 'is_true' || value === 'is_false')));
};

export const customerClubInvoiceConditionTables = getConditionTableSources('invoices').map((table) => ({
  ...table,
  getOperatorOptions: getCustomerClubServerOperatorOptions,
  fields: table.fields.filter((field) => {
    if (!scalarTypes.has(field.type)) return false;
    const related = parseWorkflowRelatedFieldKey(field.key);
    return !related || (related.relationFieldKey === 'product_id' && ['products', 'billboards'].includes(related.targetModuleId));
  }),
})).filter((table) => table.fields.length > 0);

export const getCustomerClubInvoiceConditionFields = (fields: ModuleField[]) =>
  fields.filter((field) => scalarTypes.has(field.type));

export const hasInvalidCustomerClubServerCondition = (
  conditions: WorkflowCondition[],
  fields: ModuleField[],
): boolean => conditions.some(({ field, operator, value }) => {
  if (!getCustomerClubServerOperatorOptions(fields.find(({ key }) => key === field))
    .some((option) => option.value === operator)) return true;
  return workflowOperatorNeedsValue(operator) && (value == null || value === '' || (Array.isArray(value) && !value.length));
});
