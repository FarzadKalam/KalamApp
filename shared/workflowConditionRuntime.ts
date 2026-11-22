import {
  evaluateConditionCollection,
  evaluateCoreConditionOperator,
  evaluateTableCondition,
  getConditionRecordField,
  isTableConditionOperator,
} from './recordRuntime.ts';

export type WorkflowConditionRuntimeCondition = {
  field?: unknown;
  operator?: unknown;
  value?: unknown;
};

type ResolvedConditionValue = {
  currentValue: any;
  previousValue?: any;
};

/**
 * قرارداد مشترک اجرای شرط‌ها در مرورگر و Edge Functionها.
 * Resolver عمداً تزریق می‌شود؛ هر محیط مسیر امن و tenant-aware خودش را برای
 * رکوردهای مرتبط، تگ‌ها و فیلدهای ویژه دارد، اما معنای عملگرها یکسان می‌ماند.
 */
export const evaluateWorkflowConditionWithResolver = async ({
  condition,
  resolveValues,
  evaluateAsyncOperator,
  resolveTableRowValue,
}: {
  condition: WorkflowConditionRuntimeCondition;
  resolveValues: () => Promise<ResolvedConditionValue>;
  evaluateAsyncOperator: (input: {
    operator: string;
    currentValue: any;
    expectedValue: any;
  }) => Promise<boolean>;
  resolveTableRowValue?: (field: string, row: Record<string, unknown>) => Promise<unknown>;
}): Promise<boolean> => {
  const field = String(condition?.field || '').trim();
  if (!field) return true;
  const operator = String(condition?.operator || 'eq').trim();
  const expectedValue = condition?.value;
  const { currentValue, previousValue } = await resolveValues();
  if (field.startsWith('__workflow_related__') && currentValue === undefined) return false;
  if (isTableConditionOperator(operator)) {
    return evaluateTableCondition(operator, expectedValue, currentValue, async (rowCondition, row) => {
      const rowValue = resolveTableRowValue
        ? await resolveTableRowValue(rowCondition.field, row)
        : getConditionRecordField(row, rowCondition.field);
      return evaluateWorkflowConditionWithResolver({
        condition: rowCondition,
        resolveValues: async () => ({ currentValue: rowValue }),
        evaluateAsyncOperator,
      });
    });
  }
  const coreResult = evaluateCoreConditionOperator({
    operator,
    currentValue,
    previousValue,
    expectedValue,
  });
  return coreResult === undefined
    ? evaluateAsyncOperator({ operator, currentValue, expectedValue })
    : coreResult;
};

export const evaluateWorkflowConditionCollectionWithResolver = async <T extends WorkflowConditionRuntimeCondition>({
  conditionsAll = [],
  conditionsAny = [],
  evaluate,
}: {
  conditionsAll?: T[] | null;
  conditionsAny?: T[] | null;
  evaluate: (condition: T) => Promise<boolean>;
}): Promise<boolean> => evaluateConditionCollection({
  conditionsAll: Array.isArray(conditionsAll) ? conditionsAll : [],
  conditionsAny: Array.isArray(conditionsAny) ? conditionsAny : [],
  evaluate,
});
