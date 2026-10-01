import { supabase } from '../../supabaseClient';

const PRINT_FIELD_PREFERENCES_KEY = 'kalamapp.print_field_preferences.v2';
const LEGACY_PRINT_FIELD_PREFERENCES_KEY = 'kalamapp.print_field_preferences.v1';

type PrintFieldScope = 'record' | 'list';
type PrintFieldPreferencesStore = Record<string, string[]>;

const normalizeKeys = (values: unknown): string[] =>
  Array.isArray(values)
    ? values.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

/**
 * A template-owned selection is structural (used by the template editor),
 * unlike the former browser cache which was per device and could be stale.
 * Empty legacy arrays represented an omitted selection, not an instruction
 * to hide every newly added variable.
 */
export const getTemplateStoredPrintFieldSelection = (
  selectedFieldKeys: unknown,
): string[] | null => {
  const keys = normalizeKeys(selectedFieldKeys);
  return keys.length > 0 ? keys : null;
};

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

export const loadPrintFieldPreferenceFromServer = async ({
  orgId,
  moduleId,
  templateId,
  scope,
}: {
  orgId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
}): Promise<string[] | null> => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return null;
  const { data, error } = await supabase
    .from('print_field_preferences')
    .select('selected_field_keys')
    .eq('org_id', normalizedOrgId)
    .eq('module_id', moduleId)
    .eq('template_id', templateId)
    .eq('scope', scope)
    .maybeSingle();
  if (error) {
    // Keep compatibility with installations before the migration. The caller
    // still has the scoped browser fallback while the server is upgraded.
    console.warn('Load server print field preference failed', error);
    return null;
  }
  return Array.isArray(data?.selected_field_keys)
    ? normalizeKeys(data.selected_field_keys)
    : null;
};

export const savePrintFieldPreferenceToServer = async ({
  orgId,
  moduleId,
  templateId,
  scope,
  selectedFieldKeys,
}: {
  orgId?: string | null;
  moduleId: string;
  templateId: string;
  scope: PrintFieldScope;
  selectedFieldKeys: string[];
}) => {
  const normalizedOrgId = String(orgId || '').trim();
  if (!normalizedOrgId) return false;
  const { error } = await supabase
    .from('print_field_preferences')
    .upsert({
      org_id: normalizedOrgId,
      module_id: String(moduleId || '').trim(),
      template_id: String(templateId || '').trim(),
      scope,
      selected_field_keys: normalizeKeys(selectedFieldKeys),
    }, { onConflict: 'org_id,module_id,template_id,scope' });
  if (error) {
    console.warn('Save server print field preference failed', error);
    return false;
  }
  return true;
};
