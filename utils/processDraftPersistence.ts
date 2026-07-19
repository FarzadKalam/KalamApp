const PROCESS_DRAFT_TRANSIENT_KEYS = new Set([
  '__process_v2_template_context',
]);

const sanitizeDraftValue = (value: any, depth = 0): any => {
  if (depth > 50 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDraftValue(item, depth + 1));
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  return Object.entries(value).reduce<Record<string, any>>((result, [key, item]) => {
    if (!PROCESS_DRAFT_TRANSIENT_KEYS.has(key)) {
      result[key] = sanitizeDraftValue(item, depth + 1);
    }
    return result;
  }, {});
};

export const sanitizeProcessDraftStagesForPersistence = (stages: any) => (
  Array.isArray(stages) ? sanitizeDraftValue(stages) : []
);

export const persistProcessDraftField = async ({
  supabaseClient,
  moduleId,
  recordId,
  fieldKey,
  stages,
}: {
  supabaseClient: any;
  moduleId: string;
  recordId: string;
  fieldKey: string;
  stages: any[];
}) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedFieldKey = String(fieldKey || '').trim();
  if (!normalizedModuleId || !normalizedRecordId || !normalizedFieldKey) {
    throw new Error('اطلاعات لازم برای ذخیره فرآیند کامل نیست.');
  }

  const persistedStages = sanitizeProcessDraftStagesForPersistence(stages);
  const result = await supabaseClient
    .from(normalizedModuleId)
    .update({ [normalizedFieldKey]: persistedStages })
    .eq('id', normalizedRecordId)
    .select('id')
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) {
    throw new Error('ذخیره فرآیند روی سرور تأیید نشد.');
  }
  return result.data;
};
