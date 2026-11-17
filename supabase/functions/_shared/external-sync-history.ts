export type SyncOutcome = 'created' | 'updated' | 'linked' | 'skipped';

export const normalizeSyncOutcome = (value: unknown): SyncOutcome => {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'created' || normalized === 'updated' || normalized === 'linked' || normalized === 'skipped'
    ? normalized
    : 'skipped';
};

export const getSyncRowCounts = (value: unknown) => {
  const outcome = normalizeSyncOutcome(value);
  return {
    outcome,
    rowsCreated: outcome === 'created' ? 1 : 0,
    rowsUpdated: outcome === 'updated' ? 1 : 0,
    changed: outcome === 'created' || outcome === 'updated',
  };
};
