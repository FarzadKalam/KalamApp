export type ProcessRuntimeSurfaceMode = 'hidden' | 'loading' | 'error' | 'empty' | 'cards';

type ProcessRuntimeSurfaceInput = {
  variant: 'full' | 'compact' | 'column';
  hasValidRecord: boolean;
  hasLoadedRuntime: boolean;
  loading: boolean;
  waitingForContext: boolean;
  hasError: boolean;
  cardCount: number;
};

/** قرارداد نمایش: بدنهٔ full در ModuleShow برای رکورد معتبر هرگز hidden نمی‌شود. */
export const resolveProcessRuntimeSurfaceMode = ({
  variant,
  hasValidRecord,
  hasLoadedRuntime,
  loading,
  waitingForContext,
  hasError,
  cardCount,
}: ProcessRuntimeSurfaceInput): ProcessRuntimeSurfaceMode => {
  if (cardCount > 0) return 'cards';
  if (!hasValidRecord) return 'hidden';
  if (!hasLoadedRuntime || loading || waitingForContext) return 'loading';
  if (hasError) return 'error';
  if (variant === 'full') return 'empty';
  return 'hidden';
};

export const shouldLoadProcessRuntime = ({
  enabled,
  moduleId,
  recordId,
  variant,
  snapshotOnly,
}: {
  enabled: boolean;
  moduleId: string;
  recordId: string;
  variant: 'full' | 'compact' | 'column';
  snapshotOnly: boolean;
}) => Boolean(
  enabled
  && moduleId
  && recordId
  && !(snapshotOnly && variant !== 'full')
);

/**
 * در فهرست الگوها preview اغلب عمداً انتخاب نمی‌شود تا payload سبک بماند.
 * بنابراین یک آرایهٔ خالیِ موقتی نباید نتیجهٔ معتبرِ خوانده‌شده از
 * process_template_stages را پاک کند.
 */
export const shouldApplyProcessTemplateStagePreview = ({
  isProcessTemplate,
  currentStages,
  previewStages,
}: {
  isProcessTemplate: boolean;
  currentStages: unknown;
  previewStages: unknown;
}) => {
  if (!isProcessTemplate) return true;
  const currentCount = Array.isArray(currentStages) ? currentStages.length : 0;
  const previewCount = Array.isArray(previewStages) ? previewStages.length : 0;
  return previewCount > 0 || currentCount === 0;
};
