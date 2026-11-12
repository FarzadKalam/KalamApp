export const isPlanValueEnabled = (value: unknown): boolean => {
  if (value === true) return true;
  if (typeof value === 'string') return ['true', '1', 'yes', 'on', 'enabled', 'full', 'limited'].includes(value.trim().toLowerCase());
  if (value && typeof value === 'object') {
    const item = value as { enabled?: unknown; available?: unknown };
    return item.enabled === true || item.available === true;
  }
  return false;
};

// Store explicit off values for known options, preserve unrecognized settings.
// Omitting all agent flags would otherwise restore legacy automatic access.
export const buildExplicitPlanFlags = (
  knownIds: string[], selectedIds: string[], previous: Record<string, any> = {},
): Record<string, any> => {
  const selected = new Set(selectedIds);
  return { ...previous, ...Object.fromEntries(knownIds.map((id) => [id, selected.has(id)])) };
};
