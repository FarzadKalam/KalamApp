import { FieldType, type ModuleDefinition, type ModuleField } from '../types';
import { MODULES } from '../moduleRegistry';
import { fetchCurrentUserRoleContext } from './permissions';

type Confirmation = NonNullable<ModuleField['relationConfig']>['populateConfirmation'];

export type RelationPopulateRequest = {
  supabaseClient: any;
  module: ModuleDefinition;
  field: ModuleField;
  value: any;
  previousValue?: any;
  confirm: (options: NonNullable<Confirmation>) => Promise<boolean>;
  isCurrent: () => boolean;
};

/** Shared by full forms and inline edits; a cancelled copy still keeps the relation. */
export const resolveRelationPopulatePatch = async ({
  supabaseClient, module, field, value, previousValue, confirm, isCurrent,
}: RelationPopulateRequest): Promise<Record<string, any>> => {
  const config = field.type === FieldType.MULTI_RELATION ? field.multiRelationConfig : field.relationConfig;
  if (!config?.populateFields || !isCurrent()) return {};
  const selectedId = String(Array.isArray(value) ? value[0] || '' : value || '').trim();
  const previousId = String(Array.isArray(previousValue) ? previousValue[0] || '' : previousValue || '').trim();
  if (previousValue !== undefined && selectedId === previousId) return {};
  // Disconnecting a confirmed-copy relation must never silently erase employee text.
  if (!selectedId && config.populateConfirmation) return {};

  const sourceModule = MODULES[config.targetModule];
  if (!sourceModule) return {};
  const context = await fetchCurrentUserRoleContext(supabaseClient);
  if (!context.orgId || !isCurrent()) return {};
  const destinationPermission = context.permissions?.[module.id];
  const sourcePermission = context.permissions?.[sourceModule.id];
  if (destinationPermission?.edit === false || sourcePermission?.view === false) {
    throw new Error('دسترسی لازم برای به‌روزرسانی فیلدهای مرتبط وجود ندارد.');
  }
  const permittedField = (definition: ModuleDefinition, key: string, permission: any) => {
    const definitionField = definition.fields.find((candidate) => candidate.key === key);
    return definitionField
      && permission?.fields?.[key] !== false
      && (!definitionField.blockId || permission?.fields?.[definitionField.blockId] !== false)
      ? definitionField : null;
  };
  const mappings = Object.entries(config.populateFields).filter(([target, source]) => {
    const destination = permittedField(module, target, destinationPermission);
    return destination && !destination.readonly
      && permittedField(sourceModule, source, sourcePermission);
  });
  if (!mappings.length) return {};
  if (!selectedId) return Object.fromEntries(mappings.map(([target]) => [target, null]));
  if (config.populateConfirmation && !await confirm(config.populateConfirmation)) return {};
  if (!isCurrent()) return {};

  const { data, error } = await supabaseClient.from(sourceModule.table || sourceModule.id)
    .select([...new Set(mappings.map(([, source]) => source))].join(','))
    .eq('org_id', context.orgId)
    .eq('id', selectedId)
    .maybeSingle();
  if (error) throw error;
  if (!isCurrent()) return {};
  if (!data) throw new Error('رکورد مرتبط پیدا نشد یا دسترسی به آن وجود ندارد؛ متن‌های فعلی حفظ شدند.');
  return Object.fromEntries(mappings.map(([target, source]) => [target, data[source] ?? null]));
};
