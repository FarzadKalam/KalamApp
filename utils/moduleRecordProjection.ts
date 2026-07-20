import { ModuleNature, type ModuleDefinition } from '../types';
import { isWorkflowVirtualField } from './moduleFieldVisibility';
import { shouldSkipModuleListField } from './moduleListFieldSelection';

const BASE_RECORD_COLUMNS = [
  'id',
  'org_id',
  'created_at',
  'updated_at',
  'created_by',
  'updated_by',
  'system_code',
  'name',
  'status',
  'assignee_type',
  'assignee_id',
  'assignee_role_id',
] as const;

const PROCESS_DRAFT_FIELD_KEYS = new Set([
  'execution_process_draft',
  'marketing_process_draft',
  'production_stages_draft',
]);

const isSelectableColumnKey = (value: unknown) => {
  const key = String(value || '').trim();
  return Boolean(key && !key.startsWith('__') && !key.includes('.') && !key.includes('(') && !key.includes(')'));
};

export const isDeferredProcessDraftField = (field: any) => (
  PROCESS_DRAFT_FIELD_KEYS.has(String(field?.key || '').trim())
);

/**
 * پروجکشن show از روی تعریف ماژول ساخته می‌شود تا پاسخ اولیه شامل snapshotهای
 * بزرگ اجرای فرآیند نباشد. خود snapshot بلافاصله پس از رندر اولیه و فقط برای
 * همان رکورد دریافت می‌شود.
 */
export const buildModuleRecordProjection = (moduleConfig?: ModuleDefinition | null) => {
  if (!moduleConfig) {
    return { initialColumns: ['id'], deferredProcessDraftColumns: [] as string[] };
  }

  // ردیف‌های اقلام و مبالغ فاکتور یک snapshot مالی واحد هستند. دریافت انتخابی
  // آن‌ها می‌تواند در schemaهای قدیمی پاسخ ناقص بسازد؛ صفحهٔ فاکتور باید همیشه
  // همان رکورد کامل را بخواند و هرگز با fallback ستونی، اقلام را خالی نشان ندهد.
  if (moduleConfig.nature === ModuleNature.INVOICE) {
    return { initialColumns: ['*'], deferredProcessDraftColumns: [] as string[] };
  }

  const initial = new Set<string>(BASE_RECORD_COLUMNS);
  const deferredProcessDraftColumns: string[] = [];

  (moduleConfig.fields || []).forEach((field: any) => {
    if (isWorkflowVirtualField(field)) return;
    const key = String(field?.key || '').trim();
    if (!isSelectableColumnKey(key) || shouldSkipModuleListField(moduleConfig.id, key)) return;
    if (isDeferredProcessDraftField(field)) {
      deferredProcessDraftColumns.push(key);
      return;
    }
    initial.add(key);
  });

  return {
    initialColumns: Array.from(initial),
    deferredProcessDraftColumns: Array.from(new Set(deferredProcessDraftColumns)),
  };
};
