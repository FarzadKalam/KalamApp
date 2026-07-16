import { PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY } from './processTaskCustomFields';

const normalizeText = (value: unknown) => String(value || '').trim();

const isMissingPatchRpc = (error: any) => {
  const code = normalizeText(error?.code).toUpperCase();
  const message = normalizeText(error?.message || error?.details || error?.hint).toLowerCase();
  return code === '42883'
    || code === 'PGRST202'
    || code === 'PGRST204'
    || message.includes('patch_process_task_v2_custom_field_values')
    || message.includes('could not find the function');
};

export const patchProcessTaskCustomFieldValues = async ({
  supabaseClient,
  taskId,
  values,
  fallbackRecurrence,
}: {
  supabaseClient: any;
  taskId: string;
  values: Record<string, any>;
  fallbackRecurrence: Record<string, any>;
}) => {
  const { data, error } = await supabaseClient.rpc('patch_process_task_v2_custom_field_values', {
    p_task_id: taskId,
    p_field_values: values,
  });
  if (!error) {
    return data && typeof data === 'object' ? data : {};
  }
  if (!isMissingPatchRpc(error)) throw error;

  const nextRecurrence = {
    ...(fallbackRecurrence || {}),
    [PROCESS_TASK_CUSTOM_FIELD_VALUES_KEY]: values,
  };
  const fallback = await supabaseClient
    .from('tasks')
    .update({ recurrence_info: nextRecurrence })
    .eq('id', taskId)
    .select('id,recurrence_info,updated_at')
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  if (!fallback.data?.id) throw new Error('ذخیره فیلد اختصاصی روی سرور تأیید نشد.');
  return fallback.data;
};
