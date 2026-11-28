import { fetchSessionBootstrap } from './sessionCache';

export const updateContentCalendarDrafts = async (
  supabaseClient: any,
  calendarId: string,
  updateDrafts: (drafts: Record<string, any>[]) => Record<string, any>[],
) => {
  const { orgId } = await fetchSessionBootstrap(supabaseClient);
  if (!orgId) throw new Error('سازمان فعال برای ذخیرهٔ پیش‌نویس مشخص نیست.');

  const calendarQuery = () => supabaseClient.from('content_calendars');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: calendar, error: readError } = await calendarQuery()
      .select('execution_process_draft,updated_at')
      .eq('id', calendarId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (readError) throw readError;
    if (!calendar) throw new Error('تقویم محتوایی در دسترس نیست.');

    const current = Array.isArray(calendar.execution_process_draft) ? calendar.execution_process_draft : [];
    const next = updateDrafts(current);
    if (current === next) return;

    // اگر در فاصلهٔ خواندن و نوشتن، کسی تقویم را تغییر داد، تغییر را روی دادهٔ تازه اعمال کن.
    const { data: saved, error: updateError } = await calendarQuery()
      .update({ execution_process_draft: next })
      .eq('id', calendarId)
      .eq('org_id', orgId)
      .eq('updated_at', calendar.updated_at)
      .select('id')
      .maybeSingle();
    if (updateError) throw updateError;
    if (saved) return;
  }
  throw new Error('ذخیرهٔ پیش‌نویس در تقویم تأیید نشد. دوباره تلاش کنید.');
};
