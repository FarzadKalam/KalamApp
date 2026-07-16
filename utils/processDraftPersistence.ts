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

  const result = await supabaseClient
    .from(normalizedModuleId)
    .update({ [normalizedFieldKey]: Array.isArray(stages) ? stages : [] })
    .eq('id', normalizedRecordId)
    .select('id')
    .maybeSingle();
  if (result.error) throw result.error;
  if (!result.data?.id) {
    throw new Error('ذخیره فرآیند روی سرور تأیید نشد.');
  }
  return result.data;
};
