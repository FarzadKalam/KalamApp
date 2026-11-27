import React, { useState } from 'react';
import { Alert, Button, Checkbox, Empty } from 'antd';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { CALENDAR_CONTENT_TYPES } from '../../supabase/functions/_shared/ai-content-calendar';
import { applyProcessApprovalEdits, getProcessApprovalFields, getProcessApprovalValue } from '../../supabase/functions/_shared/ai-process-approval';
import { resolveAiRecordEditorField } from '../../utils/aiRecordCreation';
import SmartFieldRenderer from '../SmartFieldRenderer';

type Choice = { value: string; label: string };
type EditMap = Record<number, Record<string, unknown>>;

type Props = {
  operations: any[];
  selectedIndexes: number[];
  onChange: (indexes: number[]) => void;
  actionId: string;
  edits: EditMap;
  onEdit: (index: number, values: Record<string, unknown>) => void;
  loadTemplateOptions: (index: number, templateId?: string) => Promise<Choice[]>;
  disabled?: boolean;
};

const getOperationTitle = (operation: any, index: number) => {
  const type = String(operation?.type || '').trim();
  const name = String(operation?.process_name || operation?.name || operation?.stage?.name || '').trim();
  if (type === 'schedule_calendar_content') return `افزودن به تقویم · ${name}`;
  if (type === 'create_calendar_template') return `ساخت الگوی تقویم · ${name}`;
  if (type === 'materialize_template_to_tasks') return `ساخت فعالیت‌ها از الگو${name ? `: ${name}` : ''}`;
  if (type === 'create_raw_process_with_tasks') return `ساخت برنامهٔ محتوا${name ? `: ${name}` : ''}`;
  if (type === 'add_stage_task') return `افزودن فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'update_stage_task') return `ویرایش فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'cancel_stage_task') return `لغو فعالیت${name ? `: ${name}` : ''}`;
  if (type === 'create_content_project') return `ساخت پروژهٔ تقویمی${name ? `: ${name}` : ''}`;
  return `اقدام ${index + 1}`;
};

const getOperationDetails = (operation: any) => {
  if (operation?.type === 'schedule_calendar_content') {
    const format = (value: string) => value && Number.isFinite(Date.parse(`${value}+03:30`)) ? new Intl.DateTimeFormat('fa-IR', {
      timeZone: 'Asia/Tehran', dateStyle: 'medium', timeStyle: 'short',
    }).format(new Date(`${value}+03:30`)) : 'تعیین نشده';
    return [
      CALENDAR_CONTENT_TYPES.find(item => item.value === operation.content_type)?.label,
      `از ${format(operation.start_date)} تا ${format(operation.due_date)}`,
      operation.template_name, operation.template_stage_name,
    ].filter(Boolean).join(' · ');
  }
  const stages = Array.isArray(operation?.stages) ? operation.stages : [];
  const stageNames = stages
    .map((stage: any) => String(stage?.name || stage?.stage_name || '').trim())
    .filter(Boolean);
  if (stageNames.length) return `${stageNames.length.toLocaleString('fa-IR')} فعالیت: ${stageNames.slice(0, 4).join('، ')}${stageNames.length > 4 ? ' و موارد دیگر' : ''}`;
  const templateName = String(operation?.template_name || '').trim();
  return templateName ? `الگو: ${templateName}` : 'قبل از اجرا، این مورد را بررسی و انتخاب کنید.';
};

const OperationEditor = ({ operation, draft, actionId, index, disabled, onEdit, loadTemplateOptions }: {
  operation: any; draft: any; index: number; actionId: string;
  disabled: boolean; onEdit: (values: Record<string, unknown>) => void;
  loadTemplateOptions: Props['loadTemplateOptions'];
}) => {
  const fields = getProcessApprovalFields(operation).filter(field => operation.editable_fields?.includes(field.key));
  const usesTemplates = fields.some(field => field.key === 'template_id');
  const templateId = String(draft.template_id || '');
  const templates = useQuery({
    queryKey: ['process-approval-templates', actionId, index],
    queryFn: () => loadTemplateOptions(index),
    enabled: usesTemplates,
    retry: false,
  });
  const stages = useQuery({
    queryKey: ['process-approval-template-stages', actionId, index, templateId],
    queryFn: () => loadTemplateOptions(index, templateId),
    enabled: Boolean(templateId) && fields.some(field => field.key === 'template_stage_id'),
    retry: false,
  });
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--ai-chat-line)] pt-3 sm:grid-cols-2">
      {fields.filter(field => field.key !== 'template_stage_id' || templateId).map((spec) => {
        const stageIndex = /^stages\.(\d+)\./.exec(spec.key)?.[1];
        const label = stageIndex === undefined ? spec.label : `مرحلهٔ ${(Number(stageIndex) + 1).toLocaleString('fa-IR')} · ${spec.label}`;
        const isTemplate = spec.key === 'template_id';
        const isStage = spec.key === 'template_stage_id';
        const query = isTemplate ? templates : isStage ? stages : null;
        const value = getProcessApprovalValue(draft, spec.key);
        const options = query?.data || [];
        const fallbackLabel = isTemplate ? operation.template_name : operation.template_stage_name;
        const originalValue = getProcessApprovalValue(operation, spec.key);
        const fallback = typeof value === 'string' && value === originalValue && !options.some(item => item.value === value)
          ? [{ value, label: fallbackLabel || (isTemplate ? 'الگوی فعلی' : 'مرحلهٔ فعلی') }] : [];
        const moduleId = operation.type === 'create_content_project' ? 'projects'
          : operation.type === 'create_calendar_template' ? 'process_templates' : 'tasks';
        const field = resolveAiRecordEditorField(moduleId, {
          ...spec,
          label,
          options: query ? [...options, ...fallback] : spec.options ? [...spec.options] : undefined,
        });
        return (
          <div key={spec.key} role="group" aria-label={label} className={spec.type === 'long_text' ? 'min-w-0 sm:col-span-2' : 'min-w-0'}>
            <div className="mb-1 font-medium">{label}</div>
            <SmartFieldRenderer
              field={field}
              value={spec.type === 'date' && typeof value === 'string' ? value.slice(0, 10) : value}
              forceEditMode={!disabled && !query?.isFetching}
              allValues={draft}
              overlayZIndexBase={32000}
              onChange={(next) => {
                if (isTemplate) {
                  onEdit(draft.type === 'schedule_calendar_content'
                    ? { template_id: next ?? null, template_stage_id: null }
                    : { template_id: next ?? null });
                  return;
                }
                const date = draft.type === 'schedule_calendar_content' && spec.type === 'datetime' && next
                  ? dayjs(next).format('YYYY-MM-DDTHH:mm') : next;
                onEdit({ [spec.key]: date ?? null });
              }}
            />
            {query?.isFetching ? <div role="status" className="mt-1 text-xs">در حال دریافت گزینه‌ها…</div> : null}
            {query?.isError ? <Alert className="mt-1" type="error" showIcon message="دریافت گزینه‌ها ناموفق بود."
              action={<Button type="link" size="small" onClick={() => void query.refetch()}>تلاش دوباره</Button>} /> : null}
          </div>
        );
      })}
    </div>
  );
};

const AiProcessOperationApprovalCard: React.FC<Props> = ({ operations, selectedIndexes, onChange, actionId, edits, onEdit, loadTemplateOptions, disabled = false }) => {
  const selected = new Set(selectedIndexes);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  if (!operations.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="اقدام قابل تأییدی وجود ندارد." />;

  return (
    <div className="mt-2 space-y-2">
      {operations.map((operation, index) => {
        const changes = edits[index] || {};
        const draft = applyProcessApprovalEdits(operation, changes);
        const opened = openIndex === index;
        return (
        <section key={`${String(operation?.type || 'operation')}-${index}`} className="rounded-xl border border-[var(--ai-chat-line,#dfe2e5)] bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/[0.045]">
          <div className="flex items-start justify-between gap-2">
          <Checkbox
            checked={selected.has(index)}
            disabled={disabled}
            onChange={(event) => {
              const next = event.target.checked
                ? Array.from(new Set([...selectedIndexes, index])).sort((left, right) => left - right)
                : selectedIndexes.filter((item) => item !== index);
              onChange(next);
            }}
            aria-label={`انتخاب ${getOperationTitle(draft, index)}`}
          >
            <span className="block font-semibold text-[var(--ai-chat-text,#292e31)] dark:text-[var(--ai-chat-text,#f4f4f5)]">{getOperationTitle(draft, index)}</span>
            <span className="mt-0.5 block text-xs leading-5 text-[var(--ai-chat-muted,#596168)] dark:text-[var(--ai-chat-muted,#b7b7be)]">{getOperationDetails(
              Object.hasOwn(changes, 'template_id') ? { ...draft, template_name: null, template_stage_name: null } : draft,
            )}</span>
          </Checkbox>
          {operation.editable_fields?.length ? <Button size="small" type="link" aria-expanded={opened} disabled={disabled || !selected.has(index)}
            onClick={() => setOpenIndex(opened ? null : index)}>{opened ? 'بستن' : 'ویرایش'}</Button> : null}
          </div>
          {opened && selected.has(index) ? <OperationEditor operation={operation} draft={draft} actionId={actionId} index={index}
            disabled={disabled} onEdit={(values) => onEdit(index, values)} loadTemplateOptions={loadTemplateOptions} /> : null}
        </section>
        );
      })}
    </div>
  );
};

export default AiProcessOperationApprovalCard;
