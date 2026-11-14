/** Pure record contract shared by preparation, approval and execution. */
export type RecordOptionProposal = { fieldKey: string; fieldLabel: string; category: string; label: string; value: string };
const text = (value: unknown) => String(value ?? '').trim();
const comparable = (value: unknown) => text(value).replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').toLowerCase();
const blocked = new Set(['id', 'org_id', 'system_code', 'created_at', 'updated_at', 'created_by', 'updated_by', 'deleted_at']);

export const canAddAiDynamicOption = (permission: any) => permission?.edit === true
  && permission.view !== false && permission.fields?.__module_settings !== false;

export const resolveAiRecordSchema = (base: any, configured: any, permission: any) => {
  const overrides = new Map((Array.isArray(configured?.fields) ? configured.fields : []).map((field: any) => [field.key, field]));
  const baseFields = Array.isArray(base?.fields) ? base.fields : [];
  const protectedKeys = new Set([...blocked, ...(base?.contextFields || []).filter((field: any) => field.aiWritable === false || field.readonly).map((field: any) => field.key)]);
  const fields = [
    ...baseFields.map((field: any) => {
      const override: any = overrides.get(field.key);
      if (!override) return field;
      return { ...field, ...override, label: override.labels?.fa || override.label || field.label,
        required: override.validation?.required ?? field.required,
        relationTargetModule: override.relationConfig?.targetModule || field.relationTargetModule };
    }),
    ...Array.from(overrides.values()).filter((field: any) => !baseFields.some((baseField: any) => baseField.key === field.key))
      .map((field: any) => ({ ...field, label: field.labels?.fa || field.label || field.key,
        required: field.validation?.required === true, relationTargetModule: field.relationConfig?.targetModule })),
  ].filter((field: any) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field?.key || '') && !protectedKeys.has(field.key) && permission?.fields?.[field.key] !== false
    && field.readonly !== true && field.nature !== 'system' && field.aiWritable !== false
    && field.isActive !== false && field.disabled !== true
    && !['image', 'json', 'checklist', 'progress_stages', 'readonly_lookup', 'tags'].includes(field.type));
  return { ...base, fields, contextFields: undefined,
    tables: (base?.tables || []).filter((table: any) => permission?.fields?.[table.key] !== false)
      .map((table: any) => ({ ...table, columns: table.columns.filter((column: any) =>
        permission?.fields?.[`${table.key}.${column.key}`] !== false && permission?.fields?.[column.key] !== false) })) };
};

export const hydrateAiRecordOptions = (schema: any, rows: any[], mayAdd: boolean) => ({
  ...schema,
  fields: schema.fields.map((field: any) => {
    if (!field.dynamicOptionsCategory) return field;
    const options = new Map((field.options || []).map((option: any) => [text(option.value), option]));
    rows.filter((row) => row.category === field.dynamicOptionsCategory).forEach((row) => options.set(text(row.value), { label: row.label, value: row.value }));
    return { ...field, options: Array.from(options.values()), allowNewOption: mayAdd };
  }),
});

/** Resolve Persian labels to stored values; unknown values must never disappear silently. */
export const prepareAiRecordOptions = (records: any[], schema: any, mayAdd: boolean) => {
  const proposals = new Map<string, RecordOptionProposal>();
  const questions = new Set<string>();
  const nextRecords = records.map((record) => {
    const fields = { ...(record?.fields || record?.payload || {}) };
    for (const field of schema.fields || []) {
      const raw = fields[field.key];
      if (raw === null || raw === undefined || raw === '' || !['select', 'status', 'multi_select'].includes(field.type)) continue;
      const values = Array.isArray(raw) ? raw : [raw];
      const resolved = values.map((value: any) => {
        const match = (field.options || []).find((option: any) => comparable(option.value) === comparable(value) || comparable(option.label) === comparable(value));
        if (match) return match.value;
        if (field.dynamicOptionsCategory && mayAdd) {
          const label = text(value).slice(0, 160);
          const key = `${field.dynamicOptionsCategory}:${comparable(label)}`;
          const existing = proposals.get(key);
          const proposal = existing || { fieldKey: field.key, fieldLabel: field.label, category: field.dynamicOptionsCategory, label, value: label };
          proposals.set(key, proposal);
          return proposal.value;
        }
        if (field.dynamicOptionsCategory || field.options?.length) questions.add(`برای «${field.label}» گزینهٔ «${text(value)}» موجود نیست؛ یکی از گزینه‌های مجاز را مشخص کنید.`);
        return value;
      });
      fields[field.key] = field.type === 'multi_select' ? resolved : resolved[0];
    }
    return { ...record, fields };
  });
  const nextSchema = { ...schema, fields: schema.fields.map((field: any) => ({ ...field,
    options: [...(field.options || []), ...Array.from(proposals.values()).filter((proposal) => proposal.category === field.dynamicOptionsCategory)
      .map((proposal) => ({ label: proposal.label, value: proposal.value }))],
  })) };
  return { records: nextRecords, schema: nextSchema, proposals: Array.from(proposals.values()), questions: Array.from(questions) };
};

export const getAiRecordRequiredQuestions = (records: any[], schema: any, isUpdate: boolean) => {
  return (schema.fields || []).filter((field: any) => field.required
    && records.some((record) => {
      const value = record.fields?.[field.key];
      if (isUpdate && value === undefined) return false;
      if (!isUpdate && value === undefined && field.defaultValue !== undefined && field.defaultValue !== null && field.defaultValue !== '') return false;
      return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
    }))
    .map((field: any) => `لطفاً «${field.label}» را مشخص کنید.`);
};

/** Primary-model mode must never demote an operational request to plain chat. */
export const hasAiStructuredAction = (capabilities: string[]) => capabilities.some((capability) =>
  ['record_creation', 'process_operation', 'pricing_adjustment'].includes(capability));
