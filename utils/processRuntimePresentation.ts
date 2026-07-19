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
