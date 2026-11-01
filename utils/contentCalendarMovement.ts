export function buildContentCalendarMovePatch(record: Record<string, any>, field: string, targetDay: string) {
  if (!['start_date', 'due_date', 'completed_at'].includes(field) || !/^\d{4}-\d{2}-\d{2}$/.test(targetDay)) throw new Error('تاریخ مقصد معتبر نیست.');
  const source = new Date(record[field]);
  const target = new Date(`${targetDay}T12:00:00`);
  if (!record[field] || Number.isNaN(source.getTime()) || Number.isNaN(target.getTime())) throw new Error('تاریخ رکورد معتبر نیست.');
  const days = Math.round((Date.UTC(target.getFullYear(), target.getMonth(), target.getDate()) - Date.UTC(source.getFullYear(), source.getMonth(), source.getDate())) / 86_400_000);
  if (!days) return null;
  const patch: Record<string, string> = {};
  for (const key of field === 'completed_at' ? [field] : ['start_date', 'due_date']) {
    if (!record[key]) continue;
    const value = new Date(record[key]);
    if (Number.isNaN(value.getTime())) continue;
    value.setDate(value.getDate() + days);
    patch[key] = value.toISOString();
  }
  return patch;
}

export async function moveContentCalendarRecord(client: any, args: { kind: 'task' | 'project'; record: Record<string, any>; field: string; targetDay: string; orgId: string }) {
  if (!args.orgId || !args.record.id) throw new Error('دسترسی سازمان برای جابه‌جایی مشخص نیست.');
  const patch = buildContentCalendarMovePatch(args.record, args.field, args.targetDay);
  if (!patch) return null;
  const { data, error } = await client.from(args.kind === 'task' ? 'tasks' : 'projects')
    .update(patch).eq('org_id', args.orgId).eq('id', args.record.id)
    .select('id,start_date,due_date,completed_at,updated_at').single();
  if (error) throw error;
  if (!data?.id) throw new Error('جابه‌جایی رکورد ذخیره نشد.');
  return { ...patch, ...data };
}
