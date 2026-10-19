/** Normalize account emails consistently in the browser and Edge Function. */
export const normalizeEmail = (value: unknown): string =>
  String(value ?? '')
    .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .trim()
    .toLowerCase();
