import React from 'react';
import { App } from 'antd';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RecordMessageActions from './RecordMessageActions';
import { requestVoipSmartCall } from '../utils/voipGateway';
vi.mock('./MessageComposerModal', () => ({ default: () => <div>فرم پیام نمونه</div> }));
vi.mock('../utils/recordMessaging', () => ({ getPrimaryRecordPhone: () => '09120000000', hasAnyRecordBotTarget: () => false }));
vi.mock('../utils/voipGateway', () => ({ buildVoipFallbackUrl: () => 'tel:09120000000', requestVoipSmartCall: vi.fn() }));
const record = { id: 'record', full_name: 'مشتری نمونه', description: 'توضیحات پروندهٔ مشتری' };
beforeEach(() => { vi.mocked(requestVoipSmartCall).mockReset().mockResolvedValue({ started: true, message: 'تماس آغاز شد' } as any); });
describe('contact action confirmation', () => {
  it('opens the dialer and customer context without starting a call', async () => {
    render(<App><RecordMessageActions moduleId="customers" record={record} initialAction="call" /></App>);
    await screen.findByText('شماره‌گیر مخاطب');
    expect(screen.getByText('مشتری نمونه')).toBeVisible();
    expect(screen.getByText('توضیحات پروندهٔ مشتری')).toBeVisible();
    expect(requestVoipSmartCall).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'برقراری تماس' }));
    await waitFor(() => expect(requestVoipSmartCall).toHaveBeenCalledOnce());
    expect(requestVoipSmartCall).toHaveBeenCalledWith(expect.objectContaining({ phone: '+989120000000', recordId: 'record', moduleId: 'customers' }));
  });
  it('also requires confirmation for existing contact shortcuts', async () => {
    render(<App><RecordMessageActions moduleId="customers" record={record} /></App>);
    const call = screen.getAllByRole('button')[0];
    fireEvent.click(call);
    await screen.findByText('شماره‌گیر مخاطب');
    expect(requestVoipSmartCall).not.toHaveBeenCalled();
  });
});
