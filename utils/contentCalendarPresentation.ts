import { MODULES } from '../moduleRegistry';
import { getTaskStatusColor, getTaskStatusLabel } from './processTaskStatusOptions';

const COLORS: Record<string, string> = {
  red: '#ef4444', blue: '#3b82f6', green: '#10b981', orange: '#f97316',
  gold: '#f59e0b', purple: '#8b5cf6', pink: '#ec4899', gray: '#6b7280', default: '#9ca3af',
};
export type ContentCalendarStatus = { kind: 'task' | 'project' | 'draft'; label: string; color: string };
const CONTENT_TYPES: Record<string, string> = { post: 'پست', story: 'استوری', video: 'ویدئو', article: 'مقاله', newsletter: 'خبرنامه', other: 'سایر' };
export const getContentCalendarContentTypeLabel = (value: string) => CONTENT_TYPES[value] || (/[\u0600-\u06ff]/.test(value) ? value : 'سایر');

export function getContentCalendarStatus(record: any, kind: ContentCalendarStatus['kind']): ContentCalendarStatus {
  if (kind === 'draft') return { kind, label: 'پیش‌نویس', color: '#64748b' };
  const option = kind === 'project'
    ? MODULES.projects.fields.find((field) => field.key === 'status')?.options?.find((item) => String(item.value) === String(record.status))
    : null;
  const label = String(kind === 'task'
    ? record.status_presentation?.label || getTaskStatusLabel(record.status, record)
    : option?.label || record.status || '').trim();
  const rawColor = String(kind === 'task'
    ? record.status_presentation?.color || getTaskStatusColor(record.status, record)
    : option?.color || 'default');
  return {
    kind,
    label: /[\u0600-\u06ff]/.test(label) ? label : label ? 'وضعیت نامشخص' : 'بدون وضعیت',
    color: COLORS[rawColor] || (/^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(rawColor) ? rawColor : COLORS.default),
  };
}

export function getContentCalendarLegend(statuses: ContentCalendarStatus[]) {
  return [...new Map(statuses.map((status) => [`${status.kind}:${status.label}:${status.color}`, status])).values()];
}
