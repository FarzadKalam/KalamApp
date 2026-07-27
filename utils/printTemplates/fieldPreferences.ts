const PRINT_FIELD_PREFERENCES_KEY = 'kalamapp.print_field_preferences.v2';
const LEGACY_PRINT_FIELD_PREFERENCES_KEY = 'kalamapp.print_field_preferences.v1';

type PrintFieldScope = 'record' | 'list';
type PrintFieldPreferencesStore = Record<string, string[]>;

const normalizeKeys = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

const readStore = (storageKey: string): PrintFieldPreferencesStore => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed as PrintFieldPreferencesStore : {};
  } catch {
    return {};
  }
};

const writeStore = (store: PrintFieldPreferencesStore) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PRINT_FIELD_PREFERENCES_KEY, JSON.stringify(store));
};

const buildPreferenceKey = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}) => [
  String(orgId || '').trim(),
  String(userId || 'anonymous').trim() || 'anonymous',
  String(moduleId || '').trim(),
  String(templateId || '').trim(),
  String(scope || 'record').trim(),
].join('::');

const buildLegacyPreferenceKey = ({
  userId,
  moduleId,
  templateId,
  scope,
}: Omit<Parameters<typeof buildPreferenceKey>[0], 'orgId'>) => [
  String(userId || 'anonymous').trim() || 'anonymous',
  String(moduleId || '').trim(),
  String(templateId || '').trim(),
  String(scope || 'record').trim(),
].join('::');

export const loadPrintFieldPreference = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
  allowLegacy = false,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
  /** Only non-system templates may retain a v1 browser preference. */
  allowLegacy?: boolean;
}): string[] | null => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return null;

  const key = buildPreferenceKey({ orgId: normalizedOrgId, userId, moduleId, templateId, scope });
  const values = readStore(PRINT_FIELD_PREFERENCES_KEY)[key];
  if (Array.isArray(values)) return normalizeKeys(values);

  if (!allowLegacy) return null;
  const legacyKey = buildLegacyPreferenceKey({ userId, moduleId, templateId, scope });
  const legacyValues = readStore(LEGACY_PRINT_FIELD_PREFERENCES_KEY)[legacyKey];
  return Array.isArray(legacyValues) ? normalizeKeys(legacyValues) : null;
};

export const savePrintFieldPreference = ({
  orgId,
  userId,
  moduleId,
  templateId,
  scope,
  selectedFieldKeys,
}: {
  orgId?: string | null;
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
  selectedFieldKeys: string[];
}) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return;

  const key = buildPreferenceKey({ orgId: normalizedOrgId, userId, moduleId, templateId, scope });
  const store = readStore(PRINT_FIELD_PREFERENCES_KEY);
  store[key] = normalizeKeys(selectedFieldKeys);
  writeStore(store);
};
