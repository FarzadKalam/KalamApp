import { MODULES } from '../moduleRegistry';
import { SelectOption } from '../types';

export const PROCESS_TASK_STATUS_OPTIONS_KEY = 'process_task_status_options';
export const PROCESS_TASK_STATUS_START_ANCHOR = '__start__';
export const PROCESS_TASK_STATUS_COLOR_META: Array<{ label: string; value: string; hex: string }> = [
  { label: 'پیش‌فرض', value: 'default', hex: '#9ca3af' },
  { label: 'آبی', value: 'blue', hex: '#3b82f6' },
  { label: 'سبز', value: 'green', hex: '#10b981' },
  { label: 'نارنجی', value: 'orange', hex: '#f97316' },
  { label: 'قرمز', value: 'red', hex: '#ef4444' },
  { label: 'طلایی', value: 'gold', hex: '#f59e0b' },
  { label: 'بنفش', value: 'purple', hex: '#8b5cf6' },
  { label: 'خاکستری', value: 'gray', hex: '#6b7280' },
  { label: 'صورتی', value: 'pink', hex: '#ec4899' },
];
export const PROCESS_TASK_STATUS_COLOR_OPTIONS: Array<{ label: string; value: string }> =
  PROCESS_TASK_STATUS_COLOR_META.map(({ label, value }) => ({ label, value }));

const LEGACY_TASK_STATUS_FALLBACKS: Record<string, SelectOption> = {
  pending: { value: 'pending', label: 'در انتظار', color: 'orange' },
  completed: { value: 'completed', label: 'تکمیل شده', color: 'green' },
  done: { value: 'done', label: 'تکمیل شده', color: 'green' },
  in_progress: { value: 'in_progress', label: 'در حال انجام', color: 'blue' },
  review: { value: 'review', label: 'بازبینی', color: 'gold' },
  todo: { value: 'todo', label: 'انجام نشده', color: 'red' },
  canceled: { value: 'canceled', label: 'لغو شده', color: 'default' },
};

const parseRecurrenceInfo = (value: any): Record<string, any> => {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const normalizeTaskStatusOption = (value: any): SelectOption | null => {
  const optionValue = String(value?.value ?? value?.label ?? '').trim();
  const optionLabel = String(value?.label ?? value?.value ?? '').trim();
  if (!optionValue || !optionLabel) return null;
  const insertAfter = String(value?.insertAfter ?? value?.insert_after ?? '').trim();
  return {
    label: optionLabel,
    value: optionValue,
    color: String(value?.color || '').trim() || undefined,
    insertAfter: insertAfter || undefined,
  };
};

export const normalizeProcessTaskStatusOptions = (value: any): SelectOption[] => {
  const rows = Array.isArray(value) ? value : [];
  const map = new Map<string, SelectOption>();
  rows.forEach((row: any) => {
    const normalized = normalizeTaskStatusOption(row);
    if (!normalized) return;
    const key = String(normalized.value).trim();
    if (!key || map.has(key)) return;
    map.set(key, normalized);
  });
  return Array.from(map.values());
};

export const getBaseTaskStatusOptions = (): SelectOption[] =>
  normalizeProcessTaskStatusOptions(
    MODULES.tasks?.fields?.find((field: any) => String(field?.key || '').trim() === 'status')?.options || []
  );

export const getProcessTaskStatusOptionsFromStage = (stage: any): SelectOption[] =>
  normalizeProcessTaskStatusOptions(
    stage?.process_task_status_options
    || stage?.metadata?.[PROCESS_TASK_STATUS_OPTIONS_KEY]
  );

export const getProcessTaskStatusOptionsFromRecurrence = (recurrence: any): SelectOption[] =>
  normalizeProcessTaskStatusOptions(recurrence?.[PROCESS_TASK_STATUS_OPTIONS_KEY]);

const insertTaskStatusOption = (list: SelectOption[], option: SelectOption) => {
  const optionValue = String(option?.value || '').trim();
  if (!optionValue) return;

  const existingIndex = list.findIndex((item) => String(item?.value || '').trim() === optionValue);
  if (existingIndex >= 0) {
    list.splice(existingIndex, 1);
  }

  const anchor = String(option?.insertAfter || '').trim();
  if (anchor === PROCESS_TASK_STATUS_START_ANCHOR) {
    list.unshift(option);
    return;
  }

  const anchorIndex = list.findIndex((item) => String(item?.value || '').trim() === anchor);
  if (anchorIndex >= 0) {
    list.splice(anchorIndex + 1, 0, option);
    return;
  }

  list.push(option);
};

export const mergeTaskStatusOptions = (baseOptions?: any[] | null, customOptions?: any[] | null): SelectOption[] => {
  const base = normalizeProcessTaskStatusOptions(baseOptions);
  const custom = normalizeProcessTaskStatusOptions(customOptions);
  const ordered = base.map((option) => ({ ...option }));
  custom.forEach((option) => insertTaskStatusOption(ordered, { ...option }));
  return ordered;
};

export const rebuildProcessTaskStatusOptionsByMergedOrder = (
  mergedOptions?: any[] | null,
  currentCustomOptions?: any[] | null,
  _baseOptions?: any[] | null
): SelectOption[] => {
  const merged = normalizeProcessTaskStatusOptions(mergedOptions);
  const customMap = new Map(
    normalizeProcessTaskStatusOptions(currentCustomOptions).map((option) => [String(option.value), option] as const)
  );
  const next: SelectOption[] = [];

  merged.forEach((option, index) => {
    const optionValue = String(option?.value || '').trim();
    const source = customMap.get(optionValue);
    if (!source) return;
    const previousValue = index > 0 ? String(merged[index - 1]?.value || '').trim() : '';
    next.push({
      ...source,
      insertAfter: previousValue || PROCESS_TASK_STATUS_START_ANCHOR,
    });
  });

  const seen = new Set(next.map((option) => String(option.value)));
  normalizeProcessTaskStatusOptions(currentCustomOptions).forEach((option) => {
    const optionValue = String(option?.value || '').trim();
    if (!optionValue || seen.has(optionValue)) return;
    next.push({
      ...option,
      insertAfter: option.insertAfter || (next.length ? String(next[next.length - 1]?.value || '') : PROCESS_TASK_STATUS_START_ANCHOR),
    });
  });

  return normalizeProcessTaskStatusOptions(next);
};

export const getTaskStatusOptions = (task?: any, baseOptions?: any[] | null): SelectOption[] => {
  const recurrence = parseRecurrenceInfo(task?.recurrence_info);
  const base = normalizeProcessTaskStatusOptions(baseOptions);
  const merged = mergeTaskStatusOptions(
    base.length ? base : getBaseTaskStatusOptions(),
    getProcessTaskStatusOptionsFromRecurrence(recurrence)
  );
  const currentStatus = String(task?.status || '').trim().toLowerCase();
  const fallback = currentStatus ? LEGACY_TASK_STATUS_FALLBACKS[currentStatus] : null;
  if (fallback && !merged.some((option) => String(option?.value || '').trim().toLowerCase() === currentStatus)) {
    return [...merged, fallback];
  }
  return merged;
};

export const getTaskStatusOption = (status: unknown, task?: any, baseOptions?: any[] | null): SelectOption | null => {
  const normalizedStatus = String(status || '').trim();
  if (!normalizedStatus) return null;
  return getTaskStatusOptions(task, baseOptions).find(
    (option) => String(option?.value || '').trim() === normalizedStatus
  ) || LEGACY_TASK_STATUS_FALLBACKS[normalizedStatus.toLowerCase()] || null;
};

export const getTaskStatusLabel = (status: unknown, task?: any, baseOptions?: any[] | null): string =>
  String(getTaskStatusOption(status, task, baseOptions)?.label || status || '').trim();

export const getTaskStatusColor = (status: unknown, task?: any, baseOptions?: any[] | null): string => {
  const optionColor = String(getTaskStatusOption(status, task, baseOptions)?.color || '').trim();
  if (optionColor) return optionColor;

  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (normalizedStatus === 'done' || normalizedStatus === 'completed') return 'green';
  if (normalizedStatus === 'pending') return 'orange';
  if (normalizedStatus === 'in_progress') return 'blue';
  if (normalizedStatus === 'review') return 'gold';
  if (normalizedStatus === 'todo') return 'red';
  if (normalizedStatus === 'canceled') return 'default';
  return 'default';
};

export const getTaskStatusSwatchColor = (status: unknown, task?: any, baseOptions?: any[] | null): string => {
  const colorValue = getTaskStatusColor(status, task, baseOptions);
  return PROCESS_TASK_STATUS_COLOR_META.find((item) => item.value === colorValue)?.hex || '#9ca3af';
};
