export const CALENDAR_CONTENT_TYPES = [
  { value: 'post', label: 'پست' }, { value: 'story', label: 'استوری' },
  { value: 'video', label: 'ویدئو' }, { value: 'article', label: 'مقاله' },
  { value: 'newsletter', label: 'خبرنامه' }, { value: 'other', label: 'سایر' },
] as const;

export const isCalendarProcessTemplate = (template: any) => {
  const targets = [...(Array.isArray(template?.module_ids) ? template.module_ids : []), template?.module_id].filter(Boolean);
  return template?.is_active !== false && (targets.length === 0 || targets.some(id => id === 'content_calendars' || id === 'tasks'));
};

export const isCalendarPlanningRequest = (value: string) =>
  /(بچین|چیدمان|زمان[‌\s-]*بندی|برنامه[‌\s-]*ریزی|مرتب\s*کن|بساز|ایجاد|ثبت|پیشنهاد.*الگو)/u.test(value);

export const normalizeCalendarSchedule = (input: any) => {
  const name = String(input?.name || '').trim().slice(0, 160);
  const contentType = CALENDAR_CONTENT_TYPES.find(type => type.value === input?.content_type);
  const start = String(input?.start_date || '');
  const due = String(input?.due_date || '');
  const parse = (value: string) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value) ? Date.parse(`${value}+03:30`) : NaN;
  if (!name || !contentType || !Number.isFinite(parse(start)) || !Number.isFinite(parse(due)) || parse(due) <= parse(start)) {
    throw new Error('عنوان، نوع محتوا، زمان شروع و موعد معتبر برای فعالیت تقویم لازم است.');
  }
  const isoDay = (value: string) => new Date(Date.parse(`${value}Z`)).toISOString().slice(0, 10);
  if (isoDay(start) !== start.slice(0, 10) || isoDay(due) !== due.slice(0, 10)) throw new Error('تاریخ تقویم معتبر نیست.');
  return { name, content_type: contentType.value, start_date: start, due_date: due };
};

export const buildAiCalendarDraft = (operation: any, calendarId: string, groupId: string, template?: any) => {
  const schedule = normalizeCalendarSchedule(operation);
  const source = template?.stages?.find((stage: any) => stage.id === operation.template_stage_id);
  if (template && !source) throw new Error('مرحلهٔ انتخاب‌شده در الگوی تقویم پیدا نشد.');
  const metadata = source?.metadata && typeof source.metadata === 'object' ? source.metadata : {};
  return {
    ...metadata, ...schedule, id: groupId, stage_name: schedule.name, status: 'draft', is_draft: true,
    sort_order: source?.sort_order ?? 10, wage: source?.wage ?? 0,
    default_assignee_id: source?.default_assignee_id ?? null,
    default_assignee_role_id: source?.default_assignee_role_id ?? null,
    task_type: metadata.task_type || 'فعالیت سازمانی',
    source_template_id: template?.id ?? null, source_template_name: template?.name ?? null,
    template_stage_id: source?.id ?? null, process_group_id: groupId,
    process_group_name: template?.name || schedule.name,
    process_target_module_ids: ['content_calendars'],
    process_link_map: { content_calendars: calendarId },
    process_node_key: source?.process_node_key || metadata.process_node_key || `${groupId}__activity_1`,
    process_lane_key: source?.process_lane_key || metadata.process_lane_key || `${groupId}__calendar`,
    metadata: { ...metadata, ...schedule, content_calendar_id: calendarId },
  };
};
