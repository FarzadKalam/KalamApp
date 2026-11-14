import React, { useState } from 'react';
import { Button, Input, Radio } from 'antd';
import { buildAiQuestionAnswer, type AiQuestion } from '../../supabase/functions/_shared/ai-questions';

type Props = { questions: AiQuestion[]; disabled?: boolean; onAnswer: (answer: string) => Promise<void> };

const AiQuestionCard: React.FC<Props> = ({ questions, disabled = false, onAnswer }) => {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const locked = disabled || sending || submitted;
  return (
    <section aria-label="پرسش‌های تکمیلی ایجنت" className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-right dark:border-white/10 dark:bg-white/5" dir="rtl">
      {questions.map((question) => (
        <fieldset key={question.id} disabled={locked} className="min-w-0">
          <legend className="mb-2 text-sm font-semibold">{question.title}</legend>
          {question.options.length > 0 ? (
            <Radio.Group aria-label={question.title} value={answers[question.id]} disabled={locked}
              onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))}
              className="mb-2 flex flex-col gap-2">
              {question.options.map((option) => <Radio key={option} value={option} className="min-h-10 content-center">{option}</Radio>)}
            </Radio.Group>
          ) : null}
          <Input.TextArea aria-label={`پاسخ به ${question.title}`} placeholder={question.options.length ? 'یا پاسخ دلخواه خود را بنویسید' : 'پاسخ خود را بنویسید'}
            value={answers[question.id] || ''} disabled={locked} autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000}
            onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))} />
        </fieldset>
      ))}
      <Button type="primary" loading={sending} disabled={locked || questions.some((question) => !answers[question.id]?.trim())}
        onClick={async () => {
          setSending(true);
          try { await onAnswer(buildAiQuestionAnswer(questions, answers)); setSubmitted(true); }
          finally { setSending(false); }
        }}>{submitted ? 'پاسخ ارسال شد' : 'ارسال پاسخ‌ها'}</Button>
    </section>
  );
};

export default AiQuestionCard;
