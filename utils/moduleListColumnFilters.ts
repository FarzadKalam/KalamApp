import type { CrudFilters } from '@refinedev/core';
import { FieldType, type ModuleDefinition } from '../types';
import { isWorkflowVirtualField } from './moduleFieldVisibility';
import { buildJsonArrayViewCrudFilters } from './viewCrudFilters';

export type ModuleListColumnFiltersState = Record<string, Array<string | number | boolean> | null>;

const parseRangeFilter = (raw: unknown): { from?: string | number; to?: string | number } => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as { from?: string | number; to?: string | number };
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const buildModuleListColumnCrudFilters = (
  moduleConfig: ModuleDefinition | null | undefined,
  nextColumnFilters: ModuleListColumnFiltersState,
): CrudFilters => {
  if (!moduleConfig) return [];

  const filters: CrudFilters = [];
  Object.entries(nextColumnFilters || {}).forEach(([fieldKey, values]) => {
    if (!Array.isArray(values) || values.length === 0) return;
    const field = moduleConfig.fields.find((item) => item.key === fieldKey);
    if (isWorkflowVirtualField(field)) return;

    if (fieldKey === 'assignee_id') {
      const assigneeValues = values.map((value) => String(value ?? '').trim()).filter(Boolean);
      if (assigneeValues.length === 0) return;
      filters.push({
        operator: 'or',
        value: assigneeValues.length === 1
          ? [
              { field: 'assignee_id', operator: 'eq', value: assigneeValues[0] },
              { field: 'assignee_role_id', operator: 'eq', value: assigneeValues[0] },
            ]
          : [
              { field: 'assignee_id', operator: 'in', value: assigneeValues },
              { field: 'assignee_role_id', operator: 'in', value: assigneeValues },
            ],
      });
      return;
    }

    if (moduleConfig.id === 'products' && (fieldKey === 'category' || fieldKey === 'product_category')) {
      const categoryValues = values.map((value) => String(value ?? '').trim()).filter(Boolean);
      if (categoryValues.length === 0) return;
      const operator = categoryValues.length > 1 ? 'in' : 'eq';
      const value = categoryValues.length > 1 ? categoryValues : categoryValues[0];
      filters.push({
        operator: 'or',
        value: [
          { field: 'category', operator, value },
          { field: 'product_category', operator, value },
        ],
      } as any);
      return;
    }

    if (!field) return;
    if ([FieldType.PRICE, FieldType.DATE, FieldType.TIME, FieldType.DATETIME].includes(field.type)) {
      const range = parseRangeFilter(values[0]);
      if (range.from !== undefined && range.from !== '') filters.push({ field: fieldKey, operator: 'gte', value: range.from });
      if (range.to !== undefined && range.to !== '') filters.push({ field: fieldKey, operator: 'lte', value: range.to });
      return;
    }

    if (field.type === FieldType.MULTI_SELECT || field.type === FieldType.MULTI_RELATION) {
      filters.push(...buildJsonArrayViewCrudFilters(fieldKey, 'in', values));
      return;
    }
    if (field.type === FieldType.TAGS || field.type === FieldType.PROGRESS_STAGES) return;

    if (field.type === FieldType.TEXT || field.key.includes('name') || field.key.includes('code') || field.key.includes('title')) {
      const searchValue = String(values[0] ?? '').trim();
      if (searchValue) filters.push({ field: fieldKey, operator: 'contains', value: searchValue });
      return;
    }

    const scalarValues = values.map((value) => String(value ?? '').trim()).filter(Boolean);
    if (scalarValues.length === 0) return;
    filters.push({
      field: fieldKey,
      operator: scalarValues.length > 1 ? 'in' : 'eq',
      value: scalarValues.length > 1 ? scalarValues : scalarValues[0],
    });
  });

  return filters;
};
