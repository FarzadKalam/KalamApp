const DEFAULT_SUPABASE_TIMEOUT_MS = 4_500;

export const attachAbortSignalIfSupported = <TQuery extends Record<string, any>>(
  query: TQuery,
  signal: AbortSignal,
): TQuery => {
  if (query && typeof (query as any).abortSignal === 'function') {
    return (query as any).abortSignal(signal);
  }
  return query;
};

export const runWithSupabaseTimeout = async <T>(
  execute: (signal: AbortSignal) => PromiseLike<T>,
  timeoutMs = DEFAULT_SUPABASE_TIMEOUT_MS,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await execute(controller.signal);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

export { DEFAULT_SUPABASE_TIMEOUT_MS };
