type SelectedTagLike =
  | string
  | {
      id?: string | null;
      title?: string | null;
      color?: string | null;
    };

const normalizeTagIds = (selectedTags?: SelectedTagLike[] | null) => {
  return Array.from(
    new Set(
      (selectedTags || [])
        .map((item) => {
          if (typeof item === 'string') return item.trim();
          return String(item?.id || '').trim();
        })
        .filter(Boolean)
    )
  );
};

export const syncRecordTags = async (
  supabaseClient: any,
  moduleId: string,
  recordId: string,
  selectedTags?: SelectedTagLike[] | null
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return;

  const tagIds = normalizeTagIds(selectedTags);

  const { error: deleteError } = await supabaseClient
    .from('record_tags')
    .delete()
    .eq('module_id', normalizedModuleId)
    .eq('record_id', normalizedRecordId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) return;

  const payload = tagIds.map((tagId) => ({
    module_id: normalizedModuleId,
    record_id: normalizedRecordId,
    tag_id: tagId,
  }));
  const { error: insertError } = await supabaseClient
    .from('record_tags')
    .insert(payload);
  if (insertError) throw insertError;
};
