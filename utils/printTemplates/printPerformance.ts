export type PrintPerformanceStep = {
  name: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  metadata?: Record<string, any>;
  error?: string;
};

export type PrintPerformanceReport = {
  flow: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  metadata: Record<string, any>;
  steps: PrintPerformanceStep[];
};

type GlobalDiagnosticsStore = typeof globalThis & {
  __kalamPrintPerformanceReports__?: PrintPerformanceReport[];
  __kalamLastPrintPerformanceReport__?: PrintPerformanceReport | null;
};

const now = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
};

const normalizeErrorText = (error: unknown) => {
  if (!error) return 'unknown_error';
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
};

export const createPrintPerformanceTracker = (
  flow: string,
  metadata: Record<string, any> = {}
) => {
  const startedAt = now();
  const steps: PrintPerformanceStep[] = [];
  const trackerMetadata: Record<string, any> = { ...metadata };

  const addMetadata = (value: Record<string, any> | undefined | null) => {
    if (!value) return;
    Object.assign(trackerMetadata, value);
  };

  const step = async <T>(
    name: string,
    run: () => Promise<T> | T,
    metadataFactory?: ((result: T) => Record<string, any> | undefined) | Record<string, any>
  ): Promise<T> => {
    const startedAt = now();
    try {
      const result = await run();
      const endedAt = now();
      const metadata =
        typeof metadataFactory === 'function'
          ? metadataFactory(result)
          : metadataFactory;
      steps.push({
        name,
        startedAt,
        endedAt,
        durationMs: Number((endedAt - startedAt).toFixed(2)),
        metadata,
      });
      return result;
    } catch (error) {
      const endedAt = now();
      steps.push({
        name,
        startedAt,
        endedAt,
        durationMs: Number((endedAt - startedAt).toFixed(2)),
        error: normalizeErrorText(error),
      });
      throw error;
    }
  };

  const mark = (name: string, metadata?: Record<string, any>) => {
    const timestamp = now();
    steps.push({
      name,
      startedAt: timestamp,
      endedAt: timestamp,
      durationMs: 0,
      metadata,
    });
  };

  const finalize = (metadata?: Record<string, any>) => {
    addMetadata(metadata);
    const endedAt = now();
    const report: PrintPerformanceReport = {
      flow,
      startedAt,
      endedAt,
      durationMs: Number((endedAt - startedAt).toFixed(2)),
      metadata: { ...trackerMetadata },
      steps: [...steps],
    };
    const store = globalThis as GlobalDiagnosticsStore;
    const reports = store.__kalamPrintPerformanceReports__ || [];
    const nextReports = [...reports, report].slice(-30);
    store.__kalamPrintPerformanceReports__ = nextReports;
    store.__kalamLastPrintPerformanceReport__ = report;

    if (typeof console !== 'undefined' && typeof console.info === 'function') {
      console.info('[print-perf]', report);
    }
    return report;
  };

  return {
    addMetadata,
    step,
    mark,
    finalize,
  };
};

export const waitForNextPaint = async (frames = 2) => {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
  let remaining = Math.max(1, Math.floor(frames));
  await new Promise<void>((resolve) => {
    const tick = () => {
      remaining -= 1;
      if (remaining <= 0) {
        resolve();
        return;
      }
      window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  });
};
