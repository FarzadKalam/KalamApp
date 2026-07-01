const MODULE_LIST_UNBACKED_FIELD_KEYS: Record<string, Set<string>> = {
  process_templates: new Set(['image_url', 'template_stages_preview']),
  process_runs: new Set(['run_stages_preview']),
};

export const shouldSkipModuleListField = (
  moduleId?: string | null,
  fieldKey?: string | null,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedModuleId || !normalizedFieldKey) return false;
  return MODULE_LIST_UNBACKED_FIELD_KEYS[normalizedModuleId]?.has(normalizedFieldKey) === true;
};
