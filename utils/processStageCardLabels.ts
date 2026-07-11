import type { ProcessGraphDefinition } from './processGraph';
import {
  computeProcessStageDueDate,
  normalizeProcessDueAnchor,
  resolveProcessDueAnchorStage,
} from './processSchedule';
import { safeJalaliFormat, toPersianNumber } from './persianNumberFormatter';
import { getFieldLabelFa } from './fieldLabel';

const PERSIAN_TEXT_RE = /[\u0600-\u06FF]/;

const normalizeText = (value: unknown) => String(value || '').trim();

const parseObject = (value: unknown): Record<string, any> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const pickFirstText = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return '';
};

const hasDueScheduleSignal = (stage: Record<string, any>, metadata: Record<string, any>, recurrence: Record<string, any>) => (
  [
    stage?.duration_value,
    metadata?.duration_value,
    recurrence?.duration_value,
    stage?.duration_from,
    metadata?.duration_from,
    recurrence?.duration_from,
    stage?.due_anchor_type,
    metadata?.due_anchor_type,
    recurrence?.due_anchor_type,
  ].some((value) => normalizeText(value))
);

export const resolveProcessStageDueValue = ({
  stage,
  stages = [],
  graph,
  processStartedAt,
}: {
  stage: Record<string, any> | null | undefined;
  stages?: Record<string, any>[];
  graph?: ProcessGraphDefinition | null;
  processStartedAt?: Date | string | null;
}) => {
  if (!stage) return '';
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  const sourceStage = stage?.source_stage && typeof stage.source_stage === 'object' ? stage.source_stage : {};
  const sourceMetadata = parseObject(sourceStage?.metadata);
  const sourceRecurrence = parseObject(sourceStage?.recurrence_info || sourceMetadata?.recurrence_info);

  const manualDue = pickFirstText(
    stage?.due_date,
    stage?.planned_due_at,
    metadata?.due_date,
    metadata?.planned_due_at,
    recurrence?.due_date,
    recurrence?.planned_due_at,
    sourceStage?.due_date,
    sourceStage?.planned_due_at,
    sourceMetadata?.due_date,
    sourceMetadata?.planned_due_at,
    sourceRecurrence?.due_date,
    sourceRecurrence?.planned_due_at,
  );
  if (manualDue) return manualDue;

  if (!hasDueScheduleSignal(stage, metadata, recurrence)) return '';

  const enrichedStage = {
    ...stage,
    duration_from: pickFirstText(stage?.duration_from, recurrence?.duration_from, metadata?.duration_from, 'process_start'),
    duration_value: Number(stage?.duration_value ?? recurrence?.duration_value ?? metadata?.duration_value ?? 0) || 0,
    duration_unit: pickFirstText(stage?.duration_unit, recurrence?.duration_unit, metadata?.duration_unit, 'day'),
    due_anchor_stage_node_key: pickFirstText(stage?.due_anchor_stage_node_key, recurrence?.due_anchor_stage_node_key, metadata?.due_anchor_stage_node_key),
    metadata: {
      ...metadata,
      duration_from: pickFirstText(stage?.duration_from, recurrence?.duration_from, metadata?.duration_from, 'process_start'),
      duration_value: Number(stage?.duration_value ?? recurrence?.duration_value ?? metadata?.duration_value ?? 0) || 0,
      duration_unit: pickFirstText(stage?.duration_unit, recurrence?.duration_unit, metadata?.duration_unit, 'day'),
      due_anchor_stage_node_key: pickFirstText(stage?.due_anchor_stage_node_key, recurrence?.due_anchor_stage_node_key, metadata?.due_anchor_stage_node_key),
    },
  };
  const baseDate = processStartedAt || stage?.process_started_at || stage?.started_at || stage?.created_at || new Date();
  const computed = computeProcessStageDueDate({
    stage: enrichedStage,
    stages,
    processStartedAt: baseDate,
    graph,
  });
  return computed ? computed.toISOString() : '';
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const getRelativeDayLabel = (dayDiff: number) => {
  if (dayDiff === 0) return 'امروز';
  if (dayDiff === -1) return 'دیروز';
  if (dayDiff === 1) return 'فردا';
  if (dayDiff === 2) return 'پس‌فردا';
  if (dayDiff === -2) return 'دو روز پیش';
  if (dayDiff === -7) return 'یک هفته پیش';
  if (dayDiff === -10) return 'ده روز پیش';
  if (dayDiff < 0 && dayDiff >= -10) return `${toPersianNumber(Math.abs(dayDiff))} روز پیش`;
  if (dayDiff > 0 && dayDiff <= 10) return `${toPersianNumber(dayDiff)} روز دیگر`;
  return '';
};

const formatTimeLabel = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return toPersianNumber(`${hours}:${minutes}`);
};

export const formatProcessStageDueLabel = (value: unknown, now: Date = new Date()) => {
  const raw = normalizeText(value);
  if (!raw) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return toPersianNumber(safeJalaliFormat(raw, raw.includes(':') ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD') || raw);
  }

  const dayDiff = Math.round((startOfLocalDay(parsed) - startOfLocalDay(now)) / 86_400_000);
  const relativeLabel = getRelativeDayLabel(dayDiff);
  const hasExplicitTime = /[T\s]\d{1,2}:\d{2}/.test(raw) || (parsed.getHours() !== 0 || parsed.getMinutes() !== 0);
  if (relativeLabel) {
    const timeLabel = hasExplicitTime ? ` ساعت ${formatTimeLabel(parsed)}` : '';
    return toPersianNumber(`${relativeLabel}${timeLabel}`);
  }

  const format = hasExplicitTime ? 'YYYY/MM/DD HH:mm' : 'YYYY/MM/DD';
  return toPersianNumber(safeJalaliFormat(parsed.toISOString(), format) || raw);
};

export const formatProcessStageScheduleRule = ({
  stage,
  stages = [],
  graph,
}: {
  stage: Record<string, any> | null | undefined;
  stages?: Record<string, any>[];
  graph?: ProcessGraphDefinition | null;
}) => {
  if (!stage) return undefined;
  const metadata = parseObject(stage?.metadata);
  const recurrence = parseObject(stage?.recurrence_info || metadata?.recurrence_info);
  if (!hasDueScheduleSignal(stage, metadata, recurrence)) return undefined;

  const enriched = {
    ...stage,
    due_anchor_type: pickFirstText(stage?.due_anchor_type, recurrence?.due_anchor_type, metadata?.due_anchor_type, stage?.duration_from, recurrence?.duration_from, metadata?.duration_from),
    due_anchor_stage_node_key: pickFirstText(stage?.due_anchor_stage_node_key, recurrence?.due_anchor_stage_node_key, metadata?.due_anchor_stage_node_key),
  };
  const anchor = normalizeProcessDueAnchor(enriched);
  const value = Math.max(0, Number(stage?.duration_value ?? recurrence?.duration_value ?? metadata?.duration_value ?? 0) || 0);
  const unit = pickFirstText(stage?.duration_unit, recurrence?.duration_unit, metadata?.duration_unit) === 'hour' ? 'ساعت' : 'روز';
  const offset = value > 0 ? `${toPersianNumber(value)} ${unit} بعد از ` : 'هم‌زمان با ';
  const anchorStage = resolveProcessDueAnchorStage({ stage: enriched, stages, graph });
  const anchorStageName = pickFirstText(anchorStage?.stage_name, anchorStage?.name, anchorStage?.title) || 'مرحله انتخاب‌شده';
  const labels: Record<string, string> = {
    process_start: 'شروع فرآیند',
    current_stage_created: 'ایجاد فعالیت',
    previous_stage_created: 'ایجاد مرحله قبلی',
    previous_stage_start: 'شروع واقعی مرحله قبلی',
    previous_stage_due: 'موعد مرحله قبلی',
    previous_stage_completed: 'تکمیل واقعی مرحله قبلی',
    next_stage_created: 'ایجاد مرحله بعدی',
    next_stage_start: 'شروع واقعی مرحله بعدی',
    next_stage_due: 'موعد مرحله بعدی',
    next_stage_completed: 'تکمیل واقعی مرحله بعدی',
    specific_stage_created: `ایجاد مرحله «${anchorStageName}»`,
    specific_stage_start: `شروع واقعی مرحله «${anchorStageName}»`,
    specific_stage_due: `موعد مرحله «${anchorStageName}»`,
    specific_stage_completed: `تکمیل واقعی مرحله «${anchorStageName}»`,
  };
  return `${offset}${labels[anchor.type] || 'شروع فرآیند'}`;
};

export const getProcessTaskCustomFieldLabelFa = (field: any, index: number, moduleId = 'tasks') => {
  const key = normalizeText(field?.key);
  const explicitFa = normalizeText(field?.labels?.fa || field?.labelFa);
  if (explicitFa && explicitFa !== key && PERSIAN_TEXT_RE.test(explicitFa)) return explicitFa;
  const resolved = normalizeText(getFieldLabelFa(field, { moduleId, fieldKey: key, fallback: explicitFa }));
  if (resolved && resolved !== key && PERSIAN_TEXT_RE.test(resolved)) return resolved;
  return `فیلد اختصاصی ${toPersianNumber(index + 1)}`;
};
