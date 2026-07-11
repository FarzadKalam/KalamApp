import type { CrudFilter, CrudFilters } from "@refinedev/core";
import { FieldType, ModuleField } from "../types";

const JSON_ARRAY_VIEW_FILTER_TYPES = new Set<FieldType>([
  FieldType.MULTI_SELECT,
  FieldType.MULTI_RELATION,
  FieldType.CHECKLIST,
]);

const POSITIVE_ARRAY_OPERATORS = new Set(["eq", "contains", "in"]);
const NEGATIVE_ARRAY_OPERATORS = new Set(["neq", "not_contains", "not_in"]);

export const isJsonArrayViewFilterField = (field?: ModuleField | null) => (
  !!field && JSON_ARRAY_VIEW_FILTER_TYPES.has(field.type)
);

export const normalizeJsonArrayViewFilterValues = (value: unknown): string[] => {
  const rawValues = Array.isArray(value)
    ? value
    : value !== undefined && value !== null && value !== ""
      ? [value]
      : [];

  return Array.from(
    new Set(
      rawValues
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );
};

const buildContainsFilter = (
  fieldKey: string,
  value: string,
  options?: { negative?: boolean; displayOperator?: string; displayValue?: unknown }
): CrudFilter => ({
  field: fieldKey,
  operator: (options?.negative ? "not.cs" : "cs") as any,
  value: JSON.stringify([value]),
  _displayField: fieldKey,
  _displayOperator: options?.displayOperator,
  _displayValue: options?.displayValue,
} as any);

export const buildJsonArrayViewCrudFilters = (
  fieldKey: string,
  operator: string,
  value: unknown
): CrudFilters => {
  const normalizedOperator = String(operator || "").trim();
  const values = normalizeJsonArrayViewFilterValues(value);
  if (values.length === 0) return [];

  if (POSITIVE_ARRAY_OPERATORS.has(normalizedOperator)) {
    const containsFilters = values.map((entry) =>
      buildContainsFilter(fieldKey, entry, {
        displayOperator: normalizedOperator,
        displayValue: values,
      })
    );

    return containsFilters.length === 1
      ? containsFilters
      : [{
          operator: "or",
          value: containsFilters,
          _displayField: fieldKey,
          _displayOperator: normalizedOperator,
          _displayValue: values,
        } as any];
  }

  if (NEGATIVE_ARRAY_OPERATORS.has(normalizedOperator)) {
    return values.map((entry) =>
      buildContainsFilter(fieldKey, entry, {
        negative: true,
        displayOperator: normalizedOperator,
        displayValue: values,
      })
    );
  }

  return [];
};
