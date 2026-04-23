import { logAndTouchRecord } from './recordActivity';

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

const normalizeTagTitles = (selectedTags?: SelectedTagLike[] | null) => {
  return Array.from(
    new Set(
      (selectedTags || [])
        .map((item) => {
          if (typeof item === 'string') return '';
          return String(item?.title || '').trim();
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

  const { data: authData } = await supabaseClient.auth.getUser();
  const userId = authData?.user?.id || null;
  const previousTagsResult = await supabaseClient
    .from('record_tags')
    .select('tags(title)')
    .eq('module_id', normalizedModuleId)
    .eq('record_id', normalizedRecordId);
  const previousTagTitles = Array.from(new Set(
    (previousTagsResult.data || [])
      .map((row: any) => String(row?.tags?.title || row?.tags?.[0]?.title || '').trim())
      .filter(Boolean)
  ));
  const tagIds = normalizeTagIds(selectedTags);
  const nextTagTitles = normalizeTagTitles(selectedTags);

  const { error: deleteError } = await supabaseClient
    .from('record_tags')
    .delete()
    .eq('module_id', normalizedModuleId)
    .eq('record_id', normalizedRecordId);
  if (deleteError) throw deleteError;

  if (tagIds.length === 0) {
    if (JSON.stringify(previousTagTitles) !== JSON.stringify(nextTagTitles)) {
      await logAndTouchRecord({
        supabase: supabaseClient,
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
        action: 'tags_updated',
        fieldName: 'tags',
        fieldLabel: 'برچسب‌ها',
        oldValue: previousTagTitles,
        newValue: nextTagTitles,
        userId,
        metadata: {
          changeKind: 'tags_updated',
          summary: 'برچسب‌های رکورد بروزرسانی شد',
        },
      });
    }
    return;
  }

  const payload = tagIds.map((tagId) => ({
    module_id: normalizedModuleId,
    record_id: normalizedRecordId,
    tag_id: tagId,
  }));
  const { error: insertError } = await supabaseClient
    .from('record_tags')
    .insert(payload);
  if (insertError) throw insertError;

  if (JSON.stringify(previousTagTitles) !== JSON.stringify(nextTagTitles)) {
    await logAndTouchRecord({
      supabase: supabaseClient,
      moduleId: normalizedModuleId,
      recordId: normalizedRecordId,
      action: 'tags_updated',
      fieldName: 'tags',
      fieldLabel: 'برچسب‌ها',
      oldValue: previousTagTitles,
      newValue: nextTagTitles,
      userId,
      metadata: {
        changeKind: 'tags_updated',
        summary: 'برچسب‌های رکورد بروزرسانی شد',
      },
    });
  }
};
