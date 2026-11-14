import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import AiQuestionCard from './AiQuestionCard';

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
