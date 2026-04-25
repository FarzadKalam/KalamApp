const writeColumnCache = new Map<string, string[]>();

const normalizeKeys = (payload: Record<string, any>) =>
  Object.keys(payload || {}).map((key) => String(key || '').trim()).filter(Boolean);

const collectPatternMatches = (text: string, pattern: RegExp) => {
  const values: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (match?.[1]) {
      values.push(String(match[1]).trim().toLowerCase());
    }
  }
  return values;
};

const extractMissingColumnNames = (error: any): string[] => {
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (!text) return [];

  return Array.from(
    new Set(
      [
        ...collectPatternMatches(text, /column\s+"([^"]+)"/gi),
        ...collectPatternMatches(text, /column\s+'([^']+)'/gi),
        ...collectPatternMatches(text, /could not find the\s+'([^']+)'\s+column/gi),
        ...collectPatternMatches(text, /([a-z0-9_]+)\s+does not exist/gi),
      ].filter(Boolean)
    )
  );
};

const isMissingColumnError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (code === '42703') return true;
  if (code === 'PGRST200' || code === 'PGRST204') {
    return text.includes('column') || text.includes('schema cache');
  }
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist');
};

const prunePayload = (payload: Record<string, any>, error: any) => {
  const missingColumns = extractMissingColumnNames(error);
  if (!missingColumns.length) return null;
  const nextPayload = { ...payload };
  let removed = false;
  Object.keys(nextPayload).forEach((key) => {
    if (missingColumns.includes(String(key || '').trim().toLowerCase())) {
      delete nextPayload[key];
      removed = true;
    }
  });
  return removed ? nextPayload : null;
};

export const runWriteWithCompatiblePayload = async <T>({
  cacheKey,
  payload,
  execute,
}: {
  cacheKey: string;
  payload: Record<string, any>;
  execute: (payload: Record<string, any>) => PromiseLike<{ data: T | null; error: any }>;
}): Promise<{ data: T | null; error: any; payload: Record<string, any> }> => {
  const originalPayload = { ...(payload || {}) };
  const cachedKeys = (writeColumnCache.get(cacheKey) || []).filter((key) =>
    Object.prototype.hasOwnProperty.call(originalPayload, key)
  );
  const candidatePayloads: Record<string, any>[] = [];
  if (cachedKeys.length > 0) {
    candidatePayloads.push(
      Object.fromEntries(cachedKeys.map((key) => [key, originalPayload[key]]))
    );
  }
  candidatePayloads.push(originalPayload);

  const attempted = new Set<string>();
  let lastData: T | null = null;
  let lastError: any = null;
  let lastPayload = originalPayload;

  while (candidatePayloads.length > 0) {
    const activePayload = candidatePayloads.shift() || {};
    const signature = normalizeKeys(activePayload).sort().join(',');
    if (attempted.has(signature)) continue;
    attempted.add(signature);
    lastPayload = activePayload;

    const result = await execute(activePayload);
    lastData = result.data;
    lastError = result.error;

    if (!result.error) {
      writeColumnCache.set(cacheKey, normalizeKeys(activePayload));
      return {
        data: result.data,
        error: null,
        payload: activePayload,
      };
    }

    if (!isMissingColumnError(result.error)) {
      break;
    }

    const nextPayload = prunePayload(activePayload, result.error);
    if (!nextPayload) break;
    candidatePayloads.unshift(nextPayload);
  }

  return {
    data: lastData,
    error: lastError,
    payload: lastPayload,
  };
};
