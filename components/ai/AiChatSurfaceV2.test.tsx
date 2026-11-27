import React from 'react';
import { App } from 'antd';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AiChatSurfaceV2 from './AiChatSurfaceV2';
vi.mock('../../moduleRegistry',()=>({MODULES:{customers:{id:'customers',titles:{fa:'مشتریان'},fields:[],blocks:[]}}}));
vi.mock('../notifications/messaging/MessagingSurfacePrototype',()=>({default:({agentsOnly,initialConversationKey}:any)=><div data-testid="agent-inbox-surface">{agentsOnly?initialConversationKey:'wrong workspace'}</div>}));

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
  it('opens the requested notification thread rather than another recent conversation',async()=>{
    renderSurface(['/ai?thread=thread-1']);
    await waitFor(()=>expect(invokeMock).toHaveBeenCalledWith('ai-assistant',expect.objectContaining({body:expect.objectContaining({action:'get_thread',threadId:'thread-1'})})));
    const otherThread=(await screen.findAllByText('گفتگوی پشتیبانی')).find(item=>item.closest('[role="button"]'))!;
    fireEvent.click(otherThread.closest('[role="button"]')!);
    await waitFor(()=>expect(invokeMock).toHaveBeenCalledWith('ai-assistant',expect.objectContaining({body:expect.objectContaining({action:'get_thread',threadId:'thread-2'})})));
  });
  it('keeps the complete agent inbox inside the AI workspace',async()=>{
    renderSurface(['/ai?inbox=1&agent=sales_leads']);
    expect(await screen.findByTestId('agent-inbox-surface')).toHaveTextContent('live:agent:agent:sales_leads');
  });
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

    expect(screen.queryByPlaceholderText('جستجوی گفتگوها')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'جستجوی گفتگوهای هوش مصنوعی'}));
    fireEvent.change(await screen.findByPlaceholderText('جستجوی گفتگوها'), { target: { value: 'پشتیبانی' } });
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

  it('opens the shared thread drawer with a persistent new conversation action',async () => {
    renderSurface(['/ai']);
    await screen.findAllByText('گفتگوی واقعی فروش');
    expect(screen.queryByLabelText('فشرده‌سازی زمینه گفتگو')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('فهرست گفتگوهای هوش مصنوعی'));
    const drawer=await screen.findByTestId('ai-thread-drawer');
    expect(within(drawer).getByText('گفتگوی واقعی فروش')).toBeInTheDocument();
    const newChat=within(drawer).getByRole('button',{name:/گفتگوی جدید.*Ctrl/});
    expect(newChat.parentElement).toHaveClass('shrink-0');
    fireEvent.click(newChat);
    await waitFor(() => expect(screen.getByLabelText('فهرست گفتگوهای هوش مصنوعی')).toHaveAttribute('aria-expanded','false'));
    expect(screen.getByLabelText('شروع گفتگوی جدید')).toBeInTheDocument();
  },30000);

  it('handles the new conversation shortcut with a Persian keyboard without invoking browser shortcuts',async () => {
    vi.stubGlobal('matchMedia',vi.fn((query:string) => ({matches:query.includes('hover'),media:query,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()})));
    renderSurface(['/ai']);
    await screen.findAllByText('گفتگوی واقعی فروش');
    const oldShortcut=new KeyboardEvent('keydown',{key:'N',code:'KeyN',altKey:true,shiftKey:true,cancelable:true});
    window.dispatchEvent(oldShortcut);expect(oldShortcut.defaultPrevented).toBe(false);
    const shortcut=new KeyboardEvent('keydown',{key:'د',code:'KeyN',altKey:true,ctrlKey:true,cancelable:true});
    act(() => {window.dispatchEvent(shortcut);});
    expect(shortcut.defaultPrevented).toBe(true);
    await waitFor(() => expect(within(screen.getByTestId('ai-conversation-header')).queryByText('گفتگوی واقعی فروش')).not.toBeInTheDocument());
  },15000);

  it('keeps parallel agent activity during the response and makes it expandable after the answer', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const encoder=new TextEncoder();
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream<Uint8Array>({start(value){controller=value;}}),{headers:{'Content-Type':'text/event-stream'}}));
    renderSurface([{pathname:'/ai',state:{aiInitialPrompt:'گزارش سازمان',forceNewThread:true}}]);
    await waitFor(()=>expect(fetchMock).toHaveBeenCalled());
    // No fabricated retrieval stages before the server reports actual execution.
    expect(screen.queryByText('در حال بررسی دانش سازمان…')).not.toBeInTheDocument();
    const send=(event:string,payload:unknown)=>act(async()=>{controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));});
    await send('agent_activity',{agentId:'organization_data',phase:'started',at:1});
    await send('agent_activity',{agentId:'organization_knowledge',phase:'started',at:2});
    expect(await screen.findByText('در حال بررسی اطلاعات واقعی سازمان…')).toBeInTheDocument();
    expect(await screen.findByText('در حال بررسی دانش سازمان…')).toBeInTheDocument();
    await send('agent_activity',{agentId:'organization_data',phase:'completed',at:3});
    expect(screen.getByText('در حال بررسی اطلاعات واقعی سازمان…')).toBeInTheDocument();
    expect(screen.getByText('در حال بررسی دانش سازمان…')).toBeInTheDocument();
    await send('done',{success:true,threadId:'new-thread',messageId:'answer-1',answer:'گزارش آماده است'});
    expect(await screen.findByText('گزارش آماده است')).toBeInTheDocument();
    expect(screen.queryByText('در حال بررسی دانش سازمان…')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /سوابق پردازش/ }));
    expect(screen.getByText('در حال بررسی اطلاعات واقعی سازمان…')).toBeInTheDocument();
    expect(screen.getByText('در حال بررسی دانش سازمان…')).toBeInTheDocument();
  },15000);

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

    expect(await screen.findByTitle('proposal.pdf')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(screen.getByText(/متن دریافت‌شده حفظ شد/, { selector: '.ai-chat-message-column.is-assistant *' })).toBeInTheDocument();
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
    expect(await screen.findByText(/متن دریافت‌شده حفظ شد/, { selector: '.ai-chat-message-column.is-assistant *' }, { timeout: 8000 })).toBeInTheDocument();
  }, 15000);

  it('recovers a recorded answer when the stream closes after acceptance and before metadata', async () => {
    fetchMock.mockResolvedValueOnce(streamResponse([
      'event: accepted\ndata: {"threadId":"new-thread","userMessageId":"accepted-turn"}\n\n',
    ]));
    const fallback = invokeMock.getMockImplementation()!;
    let recoveryAttempts = 0;
    invokeMock.mockImplementation(async (...args) => {
      if (args[1]?.body?.afterUserMessageId !== 'accepted-turn') return fallback(...args);
      const messages = recoveryAttempts++ ? [{ id: 'saved-answer', content: 'پاسخ ذخیره‌شدهٔ گفتگو', metadata: {} }] : [];
      return { data: { success: true, messages }, error: null };
    });
    renderSurface([{ pathname: '/ai', state: { aiInitialPrompt: 'درخواست تازه', forceNewThread: true } }]);
    expect(await screen.findByText('پاسخ ذخیره‌شدهٔ گفتگو', {}, { timeout: 6000 })).toBeInTheDocument();
    expect(recoveryAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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
