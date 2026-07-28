import {
  evaluateConditionCollection,
  evaluateCoreConditionOperator,
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
}: {
  condition: WorkflowConditionRuntimeCondition;
  resolveValues: () => Promise<ResolvedConditionValue>;
  evaluateAsyncOperator: (input: {
    operator: string;
    currentValue: any;
    expectedValue: any;
  }) => Promise<boolean>;
}): Promise<boolean> => {
  const field = String(condition?.field || '').trim();
  if (!field) return true;
  const operator = String(condition?.operator || 'eq').trim();
  const expectedValue = condition?.value;
  const { currentValue, previousValue } = await resolveValues();
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
