export const normalizeAutoNameEnabled = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  if (value === true || value === false) return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

export const isAutoNameEnabled = (value: unknown): boolean => normalizeAutoNameEnabled(value, false);
