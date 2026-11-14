import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiAgentTaskApprovalCard from './AiAgentTaskApprovalCard';
vi.mock('../../moduleRegistry', () => ({ MODULES: { marketing_leads: { titles: { fa: 'سرنخ‌های فروش' } } } }));
vi.mock('../PersianDatePicker', () => ({ default: () => <span>انتخاب تاریخ اجرا</span> }));
const change = { operation: 'create', name: 'پیگیری روزانه', workflowId: null, expectedRevision: null,
  config: { agentKey: 'sales_leads', instruction: 'سرنخ‌های بی‌پاسخ را بررسی کن', sourceModuleIds: ['marketing_leads'],
    trigger: 'interval', schedule: { kind: 'daily', at: '09:00', timeZone: 'Asia/Tehran' },
    deliveries: [{ channel: 'sms', numbers: ['09121234567'] }], notifyWhen: 'findings' } };
describe('shared agent task approval', () => {
  afterEach(cleanup);
  it.each(['create','update'])('shows the actual scope, schedule and recipient and edits the %s draft', operation => {
    const onChange = vi.fn(); render(<AiAgentTaskApprovalCard change={{ ...change, operation }} onChange={onChange} />);
    expect(screen.getByText('سرنخ‌های فروش')).toBeInTheDocument();
    expect(screen.getByText(/هر روز ساعت 09:00/)).toBeInTheDocument();
    expect(screen.getByLabelText('گیرندگان پیامک')).toHaveValue('09121234567');
    fireEvent.change(screen.getByLabelText('عنوان کار خودکار'), { target: { value: 'عنوان اصلاح‌شده' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'عنوان اصلاح‌شده', operation }));
    // The surrounding common approval owns the only final confirmation.
    expect(screen.queryByRole('button', { name: /تأیید/ })).toBeNull();
  });
  it('keeps pause and resume as immutable reviews of the existing task', () => {
    render(<AiAgentTaskApprovalCard change={{ ...change, operation: 'pause' }} onChange={vi.fn()} />);
    expect(screen.getByLabelText('عنوان کار خودکار')).toBeDisabled();
    expect(screen.getByLabelText('گیرندگان پیامک')).toBeDisabled();
    expect(screen.getByText(/اجراهای بعدی این کار را متوقف/)).toBeInTheDocument();
  });
});
