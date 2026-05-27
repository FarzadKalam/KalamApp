import { FieldType, ModuleDefinition, ModuleField } from '../types';
import { ModuleSettingsConfig } from '../pages/Settings/moduleSettingsTypes';
import { getBaseModuleFieldDefinition } from './moduleSettingsRuntime';

const CUSTOM_FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const RESERVED_CUSTOM_FIELD_KEYS = new Set([
  'id',
  'org_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
]);

const isSchemaItemActive = (item: any) => item?.isActive !== false && item?.disabled !== true;

const hasInactiveParentBlock = (
  field: ModuleField,
  config: ModuleSettingsConfig
) => {
  const blockId = String((field as any)?.blockId || '').trim();
  if (!blockId) return false;
  const block = (config.schema.blocks || []).find((item) => String(item?.id || '').trim() === blockId);
  return block ? !isSchemaItemActive(block) : false;
};

export const getActiveCustomModuleFields = (
  moduleDef: ModuleDefinition,
  config: ModuleSettingsConfig
) =>
  (config.schema.fields || []).filter((field) => {
    const key = String(field?.key || '').trim();
    if (!key || RESERVED_CUSTOM_FIELD_KEYS.has(key)) return false;
    if (!CUSTOM_FIELD_KEY_PATTERN.test(key)) return false;
    if (!isSchemaItemActive(field) || hasInactiveParentBlock(field, config)) return false;
    return !getBaseModuleFieldDefinition(moduleDef.id, key);
  });

export const ensureModuleSettingsCustomColumns = async (
  supabaseClient: any,
  moduleDef: ModuleDefinition,
  config: ModuleSettingsConfig
) => {
  const fields = getActiveCustomModuleFields(moduleDef, config)
    .filter((field) => field.type !== FieldType.TAGS)
    .map((field) => ({
      key: String(field.key || '').trim(),
      type: String(field.type || FieldType.TEXT),
    }));

  if (fields.length === 0) return;

  const { error } = await supabaseClient.rpc('ensure_module_settings_columns', {
    p_module_id: moduleDef.id,
    p_table_name: moduleDef.table,
    p_fields: fields,
  });

  if (error) throw error;
};
