import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AiChatSurfaceV2 from './AiChatSurfaceV2';

const invokeMock = vi.fn();

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn(async () => ({ data: [], error: null })),
    })),
  },
}));

describe('AiChatSurfaceV2', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (_functionName: string, options?: any) => {
      const action = options?.body?.action;
      if (action === 'list_threads') {
        return {
          data: {
            success: true,
            threads: [
              {
                id: 'thread-1',
                title: 'گفتگوی واقعی فروش',
                context_type: 'dashboard',
                updated_at: '2026-06-22T12:00:00Z',
                metadata: {},
              },
              {
                id: 'thread-2',
                title: 'گفتگوی پشتیبانی',
                context_type: 'module_page',
                module_id: 'customers',
                updated_at: '2026-06-22T13:00:00Z',
                metadata: { context_kind: 'list' },
              },
            ],
          },
          error: null,
        };
      }
      if (action === 'get_thread') {
        return { data: { success: true, threadId: 'thread-1', messages: [] }, error: null };
      }
      if (action === 'get_ai_overview') {
        return { data: { success: true, capabilityAvailability: {} }, error: null };
      }
      if (action === 'suggest_auto_capabilities') {
        return { data: { success: true, capabilities: [], targetModuleId: null }, error: null };
      }
      if (action === 'chat') {
        return { data: { success: true, threadId: 'new-thread', messageId: 'msg-1', answer: 'پاسخ تازه' }, error: null };
      }
      return { data: { success: true }, error: null };
    });
  });

  it('loads, searches and opens real AI threads through the v2 surface', async () => {
    render(
      <MemoryRouter initialEntries={['/ai']}>
        <AiChatSurfaceV2 />
      </MemoryRouter>
    );

    expect(screen.getByTestId('ai-chat-v2')).toBeInTheDocument();
    expect(screen.getAllByText('هوش مصنوعی تازه سیستم')[0]).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText('گفتگوی واقعی فروش').length).toBeGreaterThan(0));
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant', expect.objectContaining({ body: expect.objectContaining({ action: 'list_threads' }) }));

    fireEvent.change(screen.getByPlaceholderText('جستجوی گفتگوها'), { target: { value: 'پشتیبانی' } });
    expect(screen.getAllByText('گفتگوی پشتیبانی').length).toBeGreaterThan(0);
    expect(screen.queryByText('گفتگوی واقعی فروش')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByText('گفتگوی پشتیبانی')[0]);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({ body: expect.objectContaining({ action: 'get_thread', threadId: 'thread-2' }) }),
    ));
  }, 15000);

  it('starts a fresh thread and submits the dashboard prompt instead of opening the latest old thread', async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/ai',
        state: {
          aiInitialPrompt: 'پیام داشبورد',
          forceNewThread: true,
        },
      }]}>
        <AiChatSurfaceV2 />
      </MemoryRouter>
    );

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'suggest_auto_capabilities',
          message: 'پیام داشبورد',
        }),
      }),
    ));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'chat',
          message: 'پیام داشبورد',
          threadId: null,
        }),
      }),
    ));
    expect(invokeMock.mock.calls.some((call) => call[1]?.body?.action === 'get_thread' && call[1]?.body?.threadId === 'thread-1')).toBe(false);
  }, 15000);

  it('does not auto-submit when a dashboard file is only queued for the new conversation', async () => {
    render(
      <MemoryRouter initialEntries={[{
        pathname: '/ai',
        state: {
          aiInitialFile: {
            fileName: 'proposal.pdf',
            mimeType: 'application/pdf',
            size: 2400,
            prompt: 'متن استخراج‌شده فایل',
            data: 'data:application/pdf;base64,AAAA',
            inputKind: 'file',
            message: '',
          },
          aiAutoSubmitInitial: false,
          forceNewThread: true,
        },
      }]}>
        <AiChatSurfaceV2 />
      </MemoryRouter>
    );

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'get_ai_overview',
        }),
      }),
    ));
    expect(invokeMock.mock.calls.some((call) => {
      const action = call[1]?.body?.action;
      return action === 'suggest_auto_capabilities' || action === 'run_task_bundle' || action === 'chat';
    })).toBe(false);
  }, 15000);
});
