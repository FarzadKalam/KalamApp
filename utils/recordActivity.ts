import { MODULES } from '../moduleRegistry';
import { getFieldLabelFa } from './fieldLabel';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RecordActivityAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'table_row_added'
  | 'table_row_removed'
  | 'table_cell_updated'
  | 'file_attached'
  | 'file_removed'
  | 'process_template_applied'
  | 'project_auto_referred'
  | 'task_created'
  | 'process_updated'
  | 'tags_updated';

export type RecordActivityMetadata = Record<string, any>;

type InsertRecordActivityInput = {
  supabase: any;
  moduleId: string;
  recordId: string;
  action: RecordActivityAction | string;
  fieldName?: string | null;
  fieldLabel?: string | null;
  oldValue?: any;
  newValue?: any;
  userId?: string | null;
  recordTitle?: string | null;
  metadata?: RecordActivityMetadata | null;
};

type TouchParentRecordInput = {
  supabase: any;
  moduleId: string;
  recordId: string;
  userId?: string | null;
  patch?: Record<string, any> | null;
};

type LogAndTouchRecordInput = InsertRecordActivityInput & {
  touchPatch?: Record<string, any> | null;
};

const serializeActivityValue = (value: any): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const isSameSerializedActivityValue = (left: any, right: any): boolean =>
  serializeActivityValue(left) === serializeActivityValue(right);

const CAN_DEDUPE_BY_TRIGGER_ACTION = new Set([
  'create',
  'delete',
  'task_created',
  'process_template_applied',
  'process_updated',
]);

const TABLE_ACTIVITY_ACTIONS = new Set([
  'table_row_added',
  'table_row_removed',
  'table_cell_updated',
]);

const isMissingColumnLikeError = (error: any, columnNames: string[]) => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  if (code === '42703' || code === 'PGRST204' || code === 'PGRST200') return true;
  return columnNames.some((column) => text.includes(String(column || '').toLowerCase()));
};

const hasRecentTriggerActivity = async (
  supabase: any,
  payload: Record<string, any>,
  oldValue: any,
  newValue: any
): Promise<boolean> => {
  const action = String(payload.action || '').trim();
  const fieldName = payload.field_name || null;
  if (!supabase || !payload.module_id || !payload.record_id || !action) return false;

  const since = new Date(Date.now() - 10000).toISOString();
  let query = supabase
    .from('changelogs')
    .select('action,field_name,old_value,new_value,metadata,created_at')
    .eq('module_id', payload.module_id)
    .eq('record_id', payload.record_id)
    .eq('action', action)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(10);

  query = fieldName ? query.eq('field_name', fieldName) : query.is('field_name', null);
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return false;

  return data.some((row: any) => {
    const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    if (metadata.source !== 'db_trigger') return false;
    if (CAN_DEDUPE_BY_TRIGGER_ACTION.has(action)) return true;
    // The server stores raw relation and option values so the normal renderer
    // can resolve them later; legacy client helpers may already have turned
    // those values into labels.  The matching action/field is enough here and
    // prevents a second history row for the same editable-table cell.
    if (TABLE_ACTIVITY_ACTIONS.has(action)) return true;
    if (row.old_value === null && row.new_value === null) return true;
    return isSameSerializedActivityValue(row.old_value, oldValue)
      && isSameSerializedActivityValue(row.new_value, newValue);
  });
};

export const sanitizeActivityText = (value: unknown, fallback = 'مقدار ثبت‌شده'): string => {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (UUID_REGEX.test(text)) return fallback;
  return text;
};

export const getActivityActionLabel = (action: string) => {
  switch (String(action || '').trim()) {
    case 'create':
      return 'ایجاد';
    case 'update':
      return 'ویرایش';
    case 'delete':
      return 'حذف';
    case 'table_row_added':
      return 'افزودن ردیف';
    case 'table_row_removed':
      return 'حذف ردیف';
    case 'table_cell_updated':
      return 'ویرایش جدول';
    case 'file_attached':
      return 'پیوست فایل';
    case 'file_removed':
      return 'حذف فایل';
    case 'process_template_applied':
      return 'افزودن الگوی فرآیند';
    case 'project_auto_referred':
      return 'ارجاع خودکار';
    case 'task_created':
      return 'ایجاد فعالیت';
    case 'process_updated':
      return 'تغییر فرآیند';
    case 'tags_updated':
      return 'ویرایش برچسب‌ها';
    case 'restore':
      return 'بازگردانی';
    case 'records_merged':
      return 'ادغام رکوردها';
    case 'process_run_created':
      return 'افزودن فرآیند';
    case 'process_stage_added':
      return 'افزودن مرحله';
    case 'process_stage_removed':
      return 'حذف مرحله';
    case 'process_stage_reordered':
      return 'جابجایی مرحله';
    case 'process_stage_activated':
      return 'تبدیل به فعالیت';
    case 'process_stages_auto_referred':
      return 'ارجاع خودکار مراحل';
    default:
      return 'تغییر';
  }
};

export const getModuleFaTitle = (moduleId?: string | null) => {
  const normalizedModuleId = String(moduleId || '').trim();
  return MODULES[normalizedModuleId]?.titles?.fa || 'رکورد';
};

export const getActivityFieldLabel = (
  moduleId?: string | null,
  fieldName?: string | null,
  fallback?: string | null,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedFieldName = String(fieldName || '').trim();
  const module = MODULES[normalizedModuleId];
  if (!module) return sanitizeActivityText(fallback || normalizedFieldName, 'فیلد نامشخص');

  const directField = (module.fields || []).find((field: any) => String(field?.key || '').trim() === normalizedFieldName);
  if (directField) {
    return getFieldLabelFa(directField, { moduleId: normalizedModuleId, fallback: fallback || normalizedFieldName });
  }

  for (const block of module.blocks || []) {
    if (String(block?.id || '').trim() === normalizedFieldName) {
      return sanitizeActivityText(block?.titles?.fa || fallback || normalizedFieldName, 'فیلد نامشخص');
    }
    const tableColumn = (block?.tableColumns || []).find((column: any) => String(column?.key || '').trim() === normalizedFieldName);
    if (tableColumn) {
      return sanitizeActivityText(tableColumn?.title || fallback || normalizedFieldName, 'فیلد نامشخص');
    }
  }

  return sanitizeActivityText(fallback || normalizedFieldName, 'فیلد نامشخص');
};

export const getActivityTableColumnLabel = (
  moduleId?: string | null,
  blockId?: string | null,
  columnKey?: string | null,
  fallback?: string | null,
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedBlockId = String(blockId || '').trim();
  const normalizedColumnKey = String(columnKey || '').trim();
  const module = MODULES[normalizedModuleId];
  const block = (module?.blocks || []).find((item: any) => String(item?.id || '').trim() === normalizedBlockId);
  const column = (block?.tableColumns || []).find((item: any) => String(item?.key || '').trim() === normalizedColumnKey);
  if (column) return sanitizeActivityText(column?.title, 'ستون ثبت‌شده');
  return sanitizeActivityText(fallback, 'ستون ثبت‌شده');
};

export const touchParentRecord = async ({
  supabase,
  moduleId,
  recordId,
  userId,
  patch,
}: TouchParentRecordInput) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!supabase || !normalizedModuleId || !normalizedRecordId) return;

  const module = MODULES[normalizedModuleId];
  const targetTable = module?.table || normalizedModuleId;
  const nowIso = new Date().toISOString();
  let payload: Record<string, any> = {
    ...(patch || {}),
    updated_at: nowIso,
  };
  if (userId) {
    payload.updated_by = payload.updated_by ?? userId;
  }

  let result = await supabase.from(targetTable).update(payload).eq('id', normalizedRecordId);
  if (!result.error) return;

  if (isMissingColumnLikeError(result.error, ['updated_by'])) {
    const { updated_by, ...withoutUser } = payload;
    payload = withoutUser;
    result = await supabase.from(targetTable).update(payload).eq('id', normalizedRecordId);
    if (!result.error) return;
  }

  if (isMissingColumnLikeError(result.error, ['updated_at'])) {
    const { updated_at, ...withoutUpdatedAt } = payload;
    payload = Object.keys(withoutUpdatedAt).length > 0 ? withoutUpdatedAt : { id: normalizedRecordId };
    if (payload.id === normalizedRecordId) {
      delete payload.id;
    }
    if (Object.keys(payload).length === 0) return;
    result = await supabase.from(targetTable).update(payload).eq('id', normalizedRecordId);
  }

  if (result.error) {
    console.warn('Touch parent record failed:', result.error);
  }
};

export const insertRecordActivity = async ({
  supabase,
  moduleId,
  recordId,
  action,
  fieldName,
  fieldLabel,
  oldValue,
  newValue,
  userId,
  recordTitle,
  metadata,
}: InsertRecordActivityInput) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!supabase || !normalizedModuleId || !normalizedRecordId) return;

  const payload: Record<string, any> = {
    module_id: normalizedModuleId,
    record_id: normalizedRecordId,
    action: String(action || 'update').trim() || 'update',
    field_name: fieldName || null,
    field_label: fieldLabel || null,
    old_value: serializeActivityValue(oldValue),
    new_value: serializeActivityValue(newValue),
    user_id: userId || null,
    record_title: recordTitle || null,
    metadata: metadata || null,
  };

  if (await hasRecentTriggerActivity(supabase, payload, oldValue, newValue).catch(() => false)) {
    return;
  }

  let result = await supabase.from('changelogs').insert([payload]);
  if (!result.error) return;

  if (isMissingColumnLikeError(result.error, ['metadata'])) {
    const { metadata: ignoredMetadata, ...legacyPayload } = payload;
    result = await supabase.from('changelogs').insert([legacyPayload]);
  }

  if (result.error) {
    throw result.error;
  }
};

export const logAndTouchRecord = async ({
  supabase,
  moduleId,
  recordId,
  action,
  fieldName,
  fieldLabel,
  oldValue,
  newValue,
  userId,
  recordTitle,
  metadata,
  touchPatch,
}: LogAndTouchRecordInput) => {
  await Promise.all([
    insertRecordActivity({
      supabase,
      moduleId,
      recordId,
      action,
      fieldName,
      fieldLabel,
      oldValue,
      newValue,
      userId,
      recordTitle,
      metadata,
    }).catch((error) => {
      console.warn('Record activity insert failed:', error);
    }),
    touchParentRecord({
      supabase,
      moduleId,
      recordId,
      userId,
      patch: touchPatch,
    }).catch((error) => {
      console.warn('Record activity touch failed:', error);
    }),
  ]);
};
