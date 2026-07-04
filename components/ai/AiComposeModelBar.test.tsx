import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
});
