import React from 'react';
import { render, waitFor,screen,fireEvent,cleanup } from '@testing-library/react';
import { beforeEach,afterEach, describe, expect, it, vi } from 'vitest';
import AiComposeModelBar from './AiComposeModelBar';

const invokeMock = vi.fn();

vi.mock('../../supabaseClient', () => ({
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
  },
}));

describe('AiComposeModelBar', () => {
  afterEach(cleanup);
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({
      data: {
        success: true,
        capabilities: {
          dashboard_chat: {
            model: 'default-chat',
            modelLabel: 'پیش‌فرض',
            available: true,
            selectable: [
              { value: 'default-chat', label: 'پیش‌فرض' },
              { value: 'custom-chat', label: 'انتخاب کاربر' },
            ],
          },
          web_search: {
            model: 'default-web',
            modelLabel: 'وب پیش‌فرض',
            available: true,
            selectable: [
              { value: 'default-web', label: 'وب پیش‌فرض' },
              { value: 'custom-web', label: 'وب کاربر' },
            ],
          },
        },
      },
      error: null,
    });
  });

  it('keeps persisted model overrides when the effective capability changes', async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <AiComposeModelBar
        selectedCapabilities={[]}
        fallbackCapability="dashboard_chat"
        persistedOverrides={{ dashboard_chat: 'custom-chat', web_search: 'custom-web' }}
        onModelOverrideChange={onChange}
      />
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('custom-chat', 'dashboard_chat'));

    rerender(
      <AiComposeModelBar
        selectedCapabilities={['web_search']}
        fallbackCapability="dashboard_chat"
        persistedOverrides={{ dashboard_chat: 'custom-chat', web_search: 'custom-web' }}
        onModelOverrideChange={onChange}
      />
    );

    await waitFor(() => expect(onChange).toHaveBeenCalledWith('custom-web', 'web_search'));
    expect(onChange.mock.calls.some((call) => call[0] === null)).toBe(false);
  });

  it('nests the selected model thinking control in the model menu and sends its actual level',async () => {
    const data=(await invokeMock()).data;
    data.capabilities.dashboard_chat.reasoningByModel={ 'default-chat': {
      options: [{ value: 'auto',label: 'خودکار مدل' },{ value: 'low',label: 'کم' },{ value: 'high',label: 'زیاد' }],defaultValue: 'low',
    } };
    invokeMock.mockResolvedValue({ data });
    const change=vi.fn();
    render(<AiComposeModelBar selectedCapabilities={[]} fallbackCapability="dashboard_chat" onModelOverrideChange={vi.fn()}
      reasoningOverrides={{ 'default-chat': 'low' }} onReasoningChange={change} />);
    await waitFor(() => expect(screen.getByRole('combobox',{ name: 'مدل هوش مصنوعی' })).toBeInTheDocument());
    expect(screen.queryByText('تفکر')).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox',{ name: 'مدل هوش مصنوعی' }));
    await waitFor(() => expect(screen.getByText('تفکر')).toBeInTheDocument());
    fireEvent.mouseDown(screen.getByRole('combobox',{ name: 'میزان تفکر' }));
    fireEvent.click(await screen.findByText('زیاد'));
    expect(change).toHaveBeenCalledWith('high','default-chat');
    expect(screen.queryByText('متوسط')).not.toBeInTheDocument();
  });
});
