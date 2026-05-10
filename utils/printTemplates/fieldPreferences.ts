const PRINT_FIELD_PREFERENCES_KEY = 'kalamapp.print_field_preferences.v1';

type PrintFieldScope = 'record' | 'list';
type PrintFieldPreferencesStore = Record<string, string[]>;

const readStore = (): PrintFieldPreferencesStore => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(PRINT_FIELD_PREFERENCES_KEY);
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
  userId,
  moduleId,
  templateId,
  scope,
}: {
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}) => [
  String(userId || 'anonymous').trim() || 'anonymous',
  String(moduleId || '').trim(),
  String(templateId || '').trim(),
  String(scope || 'record').trim(),
].join('::');

export const loadPrintFieldPreference = ({
  userId,
  moduleId,
  templateId,
  scope,
}: {
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}): string[] | null => {
  const key = buildPreferenceKey({ userId, moduleId, templateId, scope });
  const store = readStore();
  const values = store[key];
  return Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : null;
};

export const savePrintFieldPreference = ({
  userId,
  moduleId,
  templateId,
  scope,
  selectedFieldKeys,
}: {
  userId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
  selectedFieldKeys: string[];
}) => {
  const key = buildPreferenceKey({ userId, moduleId, templateId, scope });
  const store = readStore();
  store[key] = Array.isArray(selectedFieldKeys)
    ? selectedFieldKeys.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  writeStore(store);
};
