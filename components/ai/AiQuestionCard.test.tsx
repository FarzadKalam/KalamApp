import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AiQuestionCard from './AiQuestionCard';

vi.mock('../../moduleRegistry', () => ({ MODULES: {} }));
vi.mock('../SmartFieldRenderer', () => ({
  default: ({ field, onChange }: any) => (
    <button type="button" onClick={() => onChange(field.type === 'date' ? '2026-11-27' : '11111111-1111-4111-8111-111111111111')}>
      {field.labels.fa} / {field.type}
    </button>
  ),
}));

afterEach(cleanup);
it('requires explicit answers, supports choices and free text, and submits them together once', async () => {
  const onAnswer = vi.fn(async () => {});
  render(<AiQuestionCard questions={[{ id: 'source', title: 'منبع؟', options: ['اینستاگرام', 'معرفی'] }, { id: 'name', title: 'نام؟', options: [] }]} onAnswer={onAnswer} />);
  expect(screen.getByRole('button', { name: 'ارسال پاسخ‌ها' })).toBeDisabled();
  expect(screen.getByRole('radio', { name: 'اینستاگرام' })).not.toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'اینستاگرام' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'پاسخ به نام؟' }), { target: { value: 'مهدخت' } });
  fireEvent.click(screen.getByRole('button', { name: 'ارسال پاسخ‌ها' }));
  await waitFor(() => expect(onAnswer).toHaveBeenCalledOnce());
  expect(onAnswer.mock.calls[0][0]).toContain('پاسخ: اینستاگرام');
  expect(onAnswer.mock.calls[0][0]).toContain('پاسخ: مهدخت');
  await waitFor(() => expect(screen.getByRole('button', { name: /پاسخ ارسال شد/ })).toBeDisabled());
});

it('uses the module renderer for record questions and sends relation IDs only in structured answers', async () => {
  const onAnswer = vi.fn(async (_text: string, _fields?: Record<string, unknown>) => {});
  render(<AiQuestionCard questions={[
    { id: 'date', title: 'تاریخ فاکتور؟', options: [], fieldKey: 'invoice_date' },
    { id: 'customer', title: 'مشتری فاکتور؟', options: [], fieldKey: 'customer_id' },
  ]} form={{ moduleId: 'invoices', actionType: 'create_record_from_prompt', fields: [
    { key: 'invoice_date', type: 'date', label: 'تاریخ فاکتور' },
    { key: 'customer_id', type: 'relation', label: 'مشتری' },
  ] }} onAnswer={onAnswer} />);
  expect(screen.queryByRole('textbox')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'تاریخ فاکتور / date' }));
  fireEvent.click(screen.getByRole('button', { name: 'مشتری / relation' }));
  fireEvent.click(screen.getByRole('button', { name: 'ارسال پاسخ‌ها' }));
  await waitFor(() => expect(onAnswer).toHaveBeenCalledOnce());
  expect(onAnswer.mock.calls[0][0]).toContain('2026-11-27');
  expect(onAnswer.mock.calls[0][0]).not.toContain('11111111-');
  expect(onAnswer.mock.calls[0][1]).toEqual({ date: '2026-11-27', customer: '11111111-1111-4111-8111-111111111111' });
});
