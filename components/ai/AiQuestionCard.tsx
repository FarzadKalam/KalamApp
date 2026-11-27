import React, { useMemo, useState } from 'react';
import { Button, Input, Radio } from 'antd';
import { buildAiQuestionAnswer, type AiQuestion } from '../../supabase/functions/_shared/ai-questions';
import { resolveAiRecordEditorField, type AiRecordFieldSpec } from '../../utils/aiRecordCreation';
import SmartFieldRenderer from '../SmartFieldRenderer';
import './AiChatPresentation.css';

export type AiQuestionForm = {
  moduleId: string;
  actionType: 'create_record_from_prompt' | 'update_record_from_prompt';
  fields: AiRecordFieldSpec[];
  values?: Record<string, unknown>;
};

type Props = {
  questions: AiQuestion[];
  form?: AiQuestionForm;
  disabled?: boolean;
  onAnswer: (answer: string, fieldAnswers?: Record<string, unknown>) => Promise<void | boolean>;
};

const hasAnswer = (value: unknown): boolean =>
  value != null && (typeof value === 'string' ? Boolean(value.trim()) : !Array.isArray(value) || value.length > 0);

const answerLabel = (value: unknown, options?: AiRecordFieldSpec['options']): string => {
  if (Array.isArray(value)) return value.map(item => answerLabel(item, options)).join('، ');
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  if (typeof value === 'object' || (typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))) return 'انتخاب شد';
  return options?.find(option => String(option.value) === String(value))?.label || String(value ?? '');
};

const AiQuestionCard: React.FC<Props> = ({ questions, form, disabled = false, onAnswer }) => {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const locked = disabled || sending || submitted;
  const fields = useMemo(() => new Map((Array.isArray(form?.fields) ? form.fields : []).map(spec => [
    spec.key, resolveAiRecordEditorField(form?.moduleId || '', spec),
  ])), [form]);
  const rows = questions.map(question => {
    const field = question.fieldKey ? fields.get(question.fieldKey) : undefined;
    const value = answers[question.id] ?? (field?.type === 'checkbox' ? false : undefined);
    return { question, field, value };
  });
  const fieldValues = Object.fromEntries(rows.flatMap(({ field, value }) => field ? [[field.key, value]] : []));
  const updateAnswer = (id: string, value: unknown) => setAnswers(previous => ({ ...previous, [id]: value }));
  return (
    <section aria-label="پرسش‌های تکمیلی ایجنت" className="ai-question-card mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-right dark:border-white/10 dark:bg-white/5" dir="rtl">
      {rows.map(({ question, field, value }) => (
        <fieldset key={question.id} disabled={locked} className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">{question.title}</legend>
          {field ? (
            <SmartFieldRenderer field={locked ? { ...field, readonly: true } : field} value={value}
              onChange={next => { if (!locked) updateAnswer(question.id, next); }}
              moduleId={form?.moduleId} allValues={{ ...form?.values, ...fieldValues }} forceEditMode={!locked} compactMode
              disableRequired canCreateRelatedRecord={() => false} allowOptionManagement={false} overlayZIndexBase={32000} />
          ) : (
            <>
              {question.options.length > 0 ? (
                <Radio.Group aria-label={question.title} value={value} disabled={locked}
                  onChange={event => updateAnswer(question.id, event.target.value)}
                  className="mb-2 flex flex-col gap-2">
                  {question.options.map(option => <Radio key={option} value={option} className="ai-question-option">{option}</Radio>)}
                </Radio.Group>
              ) : null}
              <Input.TextArea aria-label={`پاسخ به ${question.title}`} placeholder={question.options.length ? 'یا پاسخ دلخواه خود را بنویسید' : 'پاسخ خود را بنویسید'}
                value={String(value ?? '')} disabled={locked} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000}
                onChange={event => updateAnswer(question.id, event.target.value)} />
            </>
          )}
        </fieldset>
      ))}
      <Button type="primary" loading={sending} disabled={locked || rows.some(row => !hasAnswer(row.value))}
        onClick={async () => {
          setSending(true);
          const labels = Object.fromEntries(rows.map(({ question, field, value }) => [question.id, answerLabel(value, field?.options)]));
          const structured = Object.fromEntries(rows.flatMap(({ question, field, value }) => field ? [[question.id, value]] : []));
          const reply = buildAiQuestionAnswer(questions, labels);
          try {
            const result = Object.keys(structured).length ? await onAnswer(reply, structured) : await onAnswer(reply);
            if (result !== false) setSubmitted(true);
          }
          finally { setSending(false); }
        }}>{submitted ? 'پاسخ ارسال شد' : 'ارسال پاسخ‌ها'}</Button>
    </section>
  );
};

export default AiQuestionCard;
