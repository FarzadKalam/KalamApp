import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiChatSurfaceV2 from './AiChatSurfaceV2';

const invokeMock = vi.fn();
const fetchMock = vi.fn();

const renderSurface = (initialEntries: React.ComponentProps<typeof MemoryRouter>['initialEntries']) => render(
  <App>
    <MemoryRouter initialEntries={initialEntries}>
      <AiChatSurfaceV2 />
    </MemoryRouter>
  </App>,
);

const streamResponse = (events: string[]) => {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      events.forEach((event) => controller.enqueue(encoder.encode(event)));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
};

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1', email: 'user@example.test' } }, error: null })),
      getSession: vi.fn(async () => ({ data: { session: { access_token: 'session-token' } }, error: null })),
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
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    invokeMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValue(streamResponse([
      'event: meta\ndata: {"success":true,"threadId":"new-thread","userMessageId":"user-msg","provider":"avalai","model":"gpt-test"}\n\n',
      'event: delta\ndata: {"text":"پاسخ "}\n\n',
      'event: delta\ndata: {"text":"تازه"}\n\n',
      'event: done\ndata: {"success":true,"threadId":"new-thread","messageId":"msg-1","answer":"پاسخ تازه","provider":"avalai","model":"gpt-test","attachments":[]}\n\n',
    ]));
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
        return { data: { success: true, threadId: options?.body?.threadId || 'thread-1', thread: { id: options?.body?.threadId || 'thread-1', title: options?.body?.threadId === 'thread-2' ? 'گفتگوی پشتیبانی' : 'گفتگوی واقعی فروش' }, messages: [] }, error: null };
      }
      if (action === 'rename_thread') {
        return { data: { success: true, thread: { id: options?.body?.threadId, title: options?.body?.title } }, error: null };
      }
      if (action === 'delete_thread') {
        return { data: { success: true, archived: true }, error: null };
      }
      if (action === 'get_ai_overview') {
        return { data: { success: true, capabilityAvailability: {} }, error: null };
      }
      if (action === 'get_ai_credit_summary' || action === 'get_ai_usage_summary') {
        return {
          data: {
            success: true,
            access: { allowed: true, canManageAiSettings: true },
            dailyUsage: { usedTokens: 12000, dailyTokenLimit: 80000, remainingTokens: 68000 },
            orgWallet: { remainingIrt: 450000, warning: false, exhausted: false },
            company: { currency_code: 'IRT', currency_label: 'تومان' },
          },
          error: null,
        };
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
    renderSurface(['/ai']);

    expect(screen.getByTestId('ai-chat-v2')).toBeInTheDocument();
    expect(screen.getAllByText('دستیار هوشمند سازمان')[0]).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/مصرف امروز:/)[0]).toHaveTextContent('۱۲٬۰۰۰'));
    await waitFor(() => expect(screen.getAllByText('گفتگوی واقعی فروش').length).toBeGreaterThan(0));
    expect(invokeMock).toHaveBeenCalledWith('ai-assistant', expect.objectContaining({ body: expect.objectContaining({ action: 'list_threads' }) }));

    fireEvent.change(screen.getByPlaceholderText('جستجوی گفتگوها'), { target: { value: 'پشتیبانی' } });
    expect(screen.getAllByText('گفتگوی پشتیبانی').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('گفتگوی پشتیبانی')[0]);
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({ body: expect.objectContaining({ action: 'get_thread', threadId: 'thread-2' }) }),
    ));
  }, 15000);

  it('starts a fresh thread and submits the dashboard prompt instead of opening the latest old thread', async () => {
    renderSurface([{
        pathname: '/ai',
        state: {
          aiInitialPrompt: 'پیام داشبورد',
          forceNewThread: true,
        },
      }]);

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({
        body: expect.objectContaining({
          action: 'suggest_auto_capabilities',
          message: 'پیام داشبورد',
        }),
      }),
    ));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/functions/v1/ai-assistant',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"action":"chat_stream"'),
      }),
    ));
    await waitFor(() => expect(screen.getByText('پاسخ تازه')).toBeInTheDocument());
    expect(invokeMock.mock.calls.some((call) => call[1]?.body?.action === 'get_thread' && call[1]?.body?.threadId === 'thread-1')).toBe(false);
  }, 15000);

  it('does not auto-submit when a dashboard file is only queued for the new conversation', async () => {
    renderSurface([{
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
      }]);

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

  it('keeps the partial answer when an incomplete stream reaches the output limit', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse([
      'event: meta\ndata: {"success":true,"threadId":"new-thread","userMessageId":"user-msg","provider":"avalai","model":"gpt-test"}\n\n',
      'event: delta\ndata: {"text":"پاسخ نصفه"}\n\n',
      'event: error\ndata: {"success":false,"threadId":"new-thread","messageId":"msg-error","message":"پاسخ هوش مصنوعی کامل دریافت نشد.","incomplete":true,"finishReason":"length"}\n\n',
    ]));

    renderSurface([{
        pathname: '/ai',
        state: {
          aiInitialPrompt: 'پیام طولانی',
          forceNewThread: true,
        },
      }]);

    await waitFor(() => expect(screen.getByText(/پاسخ نصفه/)).toBeInTheDocument());
    expect(screen.getByText(/متن دریافت‌شده حفظ شد/)).toBeInTheDocument();
    expect(screen.queryByText('پاسخ هوش مصنوعی کامل دریافت نشد.')).not.toBeInTheDocument();
  }, 15000);

  it('keeps streamed text when the connection closes without a terminal event', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse([
      'event: meta\ndata: {"success":true,"threadId":"new-thread","userMessageId":"user-msg","provider":"avalai","model":"gpt-test"}\n\n',
      'event: delta\ndata: {"text":"متن دریافت‌شده پیش از قطع اتصال"}\n\n',
    ]));

    renderSurface([{
      pathname: '/ai',
      state: {
        aiInitialPrompt: 'پاسخ با اتصال ناپایدار',
        forceNewThread: true,
      },
    }]);

    await waitFor(() => expect(screen.getByText(/متن دریافت‌شده پیش از قطع اتصال/)).toBeInTheDocument());
    expect(screen.getByText(/متن دریافت‌شده حفظ شد/)).toBeInTheDocument();
  }, 15000);

  it('renames the active thread inline from the conversation header', async () => {
    renderSurface(['/ai']);

    await waitFor(() => expect(screen.getAllByText('گفتگوی واقعی فروش').length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByText('گفتگوی واقعی فروش')[0]);
    const titleButtons = await screen.findAllByTitle('ویرایش عنوان گفتگو');
    fireEvent.click(titleButtons[0]);
    const input = await screen.findByLabelText('ویرایش عنوان گفتگو');
    fireEvent.change(input, { target: { value: 'عنوان تازه گفتگو' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({ body: expect.objectContaining({ action: 'rename_thread', threadId: 'thread-1', title: 'عنوان تازه گفتگو' }) }),
    ));
    await waitFor(() => expect(screen.getAllByText('عنوان تازه گفتگو').length).toBeGreaterThan(0));
  }, 15000);

  it('asks before deleting the active thread', async () => {
    renderSurface(['/ai']);

    await waitFor(() => expect(screen.getAllByText('گفتگوی واقعی فروش').length).toBeGreaterThan(0));
    invokeMock.mockClear();

    fireEvent.click(screen.getByLabelText('حذف گفتگوی هوش مصنوعی'));
    await screen.findByText('این گفتگوی هوش مصنوعی حذف شود؟');
    fireEvent.click(screen.getByText('حذف گفتگو'));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith(
      'ai-assistant',
      expect.objectContaining({ body: expect.objectContaining({ action: 'delete_thread', threadId: 'thread-1' }) }),
    ));
    await waitFor(() => expect(screen.queryByText('گفتگوی واقعی فروش')).not.toBeInTheDocument());
  }, 15000);
});
