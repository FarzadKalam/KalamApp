import React from 'react';
import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AssistantPanel from './AssistantPanel';

const invokeMock = vi.fn();

vi.mock('../../supabaseClient', () => ({
  SUPABASE_URL: 'https://example.test',
  SUPABASE_ANON_KEY: 'anon-test-key',
  supabase: {
    functions: {
      invoke: (...args: any[]) => invokeMock(...args),
    },
    auth: {
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

vi.mock('../../utils/sessionCache', () => ({
  fetchSessionBootstrap: vi.fn(async () => ({
    user: { id: 'user-1', email: 'user@example.test' },
    profile: { full_name: 'کاربر تست', avatar_url: null },
  })),
}));

vi.mock('../../utils/blobBase64', () => ({
  blobToBase64: vi.fn(async () => 'voice-base64'),
}));

vi.mock('../../utils/aiRecordCreation', () => ({
  buildAiRecordModuleOptions: vi.fn(() => [{ label: 'مشتریان', value: 'customers' }]),
  buildAiRecordCreationSchema: vi.fn((moduleId: string) => ({ moduleId, fields: [{ key: 'name', label: 'نام' }] })),
}));

vi.mock('./AiCapabilityComposerActions', async () => {
  const React = await import('react');
  const button = (label: string, onClick: () => void) =>
    React.createElement('button', { type: 'button', onClick }, label);
  const MockActions = (props: any) => React.createElement(
    'div',
    { 'data-testid': 'ai-operator-actions' },
    React.createElement('div', { 'data-testid': 'selected-capabilities' }, (props.selected || []).join(',')),
    button('cap-text_chat', () => props.onChange(['text_chat'])),
    button('cap-web_search', () => props.onChange(['web_search'])),
    button('cap-deep_reasoning', () => props.onChange(['deep_reasoning'])),
    button('cap-legal_assistant', () => props.onChange(['legal_assistant', 'web_search', 'deep_reasoning'])),
    button('cap-image_generation', () => props.onChange(['image_generation'])),
    button('cap-voice_output', () => props.onChange(['voice_output'])),
    button('cap-video_generation', () => props.onChange(['video_generation'])),
    button('cap-document_generation', () => props.onChange(['document_generation'])),
    button('cap-process_operation', () => props.onChange([...(props.selected || []), 'process_operation'])),
    button('cap-record_creation', () => {
      props.onChange([...(props.selected || []), 'record_creation']);
      props.onRecordCreationTargetModuleChange?.('customers');
    }),
    button('cap-document_analysis', () => props.onChange([...(props.selected || []), 'document_analysis'])),
    button('cap-voice_input', () => props.onChange([...(props.selected || []), 'voice_input'])),
    button('send-file', () => props.onFilePrepared({
      fileName: 'proposal.pdf',
      mimeType: 'application/pdf',
      size: 2400,
      prompt: 'متن استخراج شده فایل',
      data: 'data:application/pdf;base64,AAAA',
      inputKind: 'file',
    })),
    button('send-voice', () => props.onVoiceSend({
      blob: new Blob(['voice'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      durationMs: 1200,
      filename: 'voice.webm',
    })),
  );
  return {
    default: MockActions,
    normalizeAiComposerCapabilities: (items: string[]) => {
      const normalized = Array.from(new Set(items || []));
      return normalized.includes('text_chat') ? ['text_chat'] : normalized;
    },
  };
});

const getBodies = () => invokeMock.mock.calls.map((call) => call[1]?.body).filter(Boolean);
const findBody = (action: string) => getBodies().find((body) => body?.action === action);
const getFetchBodies = () => (vi.mocked(fetch).mock.calls || [])
  .map((call) => {
    try { return JSON.parse(String(call[1]?.body || '{}')); } catch { return null; }
  })
  .filter(Boolean);
const findFetchBody = (action: string) => getFetchBodies().find((body: any) => body?.action === action);

const waitForBootstrap = async () => {
  await waitFor(() => expect(findBody('get_ai_overview')).toBeTruthy());
  invokeMock.mockClear();
};

const makeStreamResponse = (answer = 'پاسخ تست') => new Response(
  `event: done\ndata: ${JSON.stringify({ success: true, threadId: 'thread-1', messageId: 'stream-1', answer })}\n\n`,
  { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
);

const renderPanel = async () => {
  render(
    <App>
      <MemoryRouter initialEntries={['/dashboard']}>
        <AssistantPanel active />
      </MemoryRouter>
    </App>,
  );
  await waitForBootstrap();
};

const findButtonByVisibleName = (name: string | RegExp) => {
  const buttons = screen.getAllByRole('button');
  const matcher = typeof name === 'string'
    ? (value: string) => value.includes(name)
    : (value: string) => name.test(value);
  const match = buttons.find((button) => matcher(String(button.textContent || '').trim()));
  if (!match) throw new Error(`Button not found: ${String(name)}`);
  return match;
};

const typeAndSend = async (text: string, buttonName: string | RegExp = 'ارسال') => {
  fireEvent.change(screen.getByPlaceholderText('سوال خود را بنویسید...'), { target: { value: text } });
  fireEvent.click(findButtonByVisibleName(buttonName));
};

describe('AssistantPanel AI operators', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    invokeMock.mockReset();
    vi.stubGlobal('fetch', vi.fn(async () => makeStreamResponse()));
    invokeMock.mockImplementation(async (_functionName: string, options?: any) => {
      const action = options?.body?.action;
      if (action === 'get_ai_overview') {
        return { data: { success: true, capabilityAvailability: {} }, error: null };
      }
      if (action === 'get_thread') {
        return { data: { success: true, threadId: 'thread-1', messages: [] }, error: null };
      }
      if (action === 'suggest_auto_capabilities') {
        const messageText = String(options?.body?.message || '').trim();
        const bundleInputs = Array.isArray(options?.body?.bundle?.inputs) ? options.body.bundle.inputs : [];
        if (messageText.includes('لید')) {
          const voiceInput = bundleInputs.find((item: any) => item.type === 'voice');
          return {
            data: {
              success: true,
              capabilities: ['voice_input', 'document_analysis', 'record_creation'],
              targetModuleId: 'marketing_leads',
              mutationMode: 'create',
              voiceTranscripts: voiceInput ? [{ inputId: voiceInput.id, transcript: 'این تصویر و ویس را به عنوان دو لید ثبت کن' }] : [],
            },
            error: null,
          };
        }
        if (messageText.includes('ویرایش')) {
          return { data: { success: true, capabilities: ['record_creation'], targetModuleId: 'customers', mutationMode: 'update' }, error: null };
        }
        if (messageText.includes('هزینه')) {
          return { data: { success: true, capabilities: ['record_creation'], targetModuleId: 'expense_documents', mutationMode: 'create' }, error: null };
        }
        if (messageText.includes('تصویر')) {
          return { data: { success: true, capabilities: ['image_generation'], targetModuleId: null }, error: null };
        }
        if (messageText.includes('مشتری')) {
          return { data: { success: true, capabilities: ['record_creation'], targetModuleId: 'customers' }, error: null };
        }
        if (bundleInputs.length > 0) {
          return { data: { success: true, capabilities: ['document_analysis'], targetModuleId: null }, error: null };
        }
        return { data: { success: true, capabilities: [], targetModuleId: null }, error: null };
      }
      if (action === 'transcribe_voice') {
        return { data: { success: true, transcript: 'متن ویس تست' }, error: null };
      }
      if (action === 'generate_image') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'img-1', answer: 'تصویر آماده شد.', image: { url: 'https://example.test/image.png' } }, error: null };
      }
      if (action === 'generate_voice_output') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'voice-out-1', answer: 'صدا آماده شد.', file: { url: 'https://example.test/voice.mp3' } }, error: null };
      }
      if (action === 'generate_video') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'video-1', videoId: 'video-job-1' }, error: null };
      }
      if (action === 'generate_document') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'doc-1', answer: 'فایل آماده شد.', file: { url: 'https://example.test/doc.docx' }, format: 'docx' }, error: null };
      }
      if (action === 'process_operation_from_prompt') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'process-1', answer: 'اقدام پیشنهادی آماده شد.', proposedAction: { id: 'action-1' } }, error: null };
      }
      if (action === 'create_record_from_prompt') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'record-1', answer: 'پیشنهاد ساخت آماده شد.', createdRecords: [{ id: 'record-1' }] }, error: null };
      }
      if (action === 'chat_with_file') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'file-1', answer: 'تحلیل فایل آماده شد.' }, error: null };
      }
      if (action === 'run_task_bundle') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'bundle-1', answer: 'باندل پردازش شد.', proposedAction: options?.body?.capabilities?.includes('record_creation') ? { id: 'bundle-action-1' } : null }, error: null };
      }
      if (action === 'chat') {
        return { data: { success: true, threadId: 'thread-1', messageId: 'chat-1', answer: 'پاسخ تست' }, error: null };
      }
      return { data: { success: true }, error: null };
    });
  });

  it.each([
    ['web_search', 'cap-web_search', 'chat_stream', 'dashboard_chat', 'ارسال'],
    ['deep_reasoning', 'cap-deep_reasoning', 'chat_stream', 'deep_reasoning', 'ارسال'],
    ['legal_assistant', 'cap-legal_assistant', 'chat_stream', 'legal_assistant', 'ارسال'],
    ['process_operation', 'cap-process_operation', 'process_operation_from_prompt', 'record_chat', 'پیشنهاد اقدام'],
    ['record_creation', 'cap-record_creation', 'create_record_from_prompt', 'dashboard_chat', 'آماده‌سازی پیش‌نویس'],
  ])('sends the %s operator through the expected assistant action', async (_name, capabilityButton, expectedAction, expectedCapability, sendButtonName) => {
    await renderPanel();
    fireEvent.click(screen.getAllByText(capabilityButton)[0]);
    await waitFor(() => expect(screen.getByTestId('selected-capabilities')).toHaveTextContent(String(capabilityButton).replace('cap-', '')));
    await typeAndSend('درخواست تست عملگر', sendButtonName);
    if (expectedAction === 'chat_stream') {
      await waitFor(() => expect(findFetchBody('chat_stream')).toBeTruthy());
      const body = findFetchBody('chat_stream') as any;
      expect(body?.capability).toBe(expectedCapability);
      expect(body?.message).toContain('درخواست تست عملگر');
      return;
    }
    await waitFor(() => expect(findBody(expectedAction)).toBeTruthy());
    const body = findBody(expectedAction);
    expect(body?.capability).toBe(expectedCapability);
    expect(body?.message).toContain('درخواست تست عملگر');
    if (expectedAction === 'create_record_from_prompt') {
      expect(body?.recordCreation?.moduleId).toBe('customers');
      expect(body?.previewOnly).toBe(true);
    }
    if (expectedAction === 'process_operation_from_prompt') {
      expect(body?.previewOnly).toBe(true);
    }
  }, 10000);

  it.each([
    ['image_generation', 'cap-image_generation', 'generate_image', /ساخت تصویر/],
    ['voice_output', 'cap-voice_output', 'generate_voice_output', /تولید صدا/],
    ['video_generation', 'cap-video_generation', 'generate_video', /ساخت ویدیو/],
    ['document_generation', 'cap-document_generation', 'generate_document', /ساخت فایل/],
  ])('runs the %s generation operator with its dedicated action', async (_name, capabilityButton, expectedAction, sendButtonName) => {
    await renderPanel();
    fireEvent.click(screen.getAllByText(capabilityButton)[0]);
    await waitFor(() => expect(screen.getByTestId('selected-capabilities')).toHaveTextContent(String(capabilityButton).replace('cap-', '')));
    await typeAndSend('متن تولید تست', sendButtonName);
    await waitFor(() => expect(findBody(expectedAction)).toBeTruthy());
    expect(findBody(expectedAction)?.prompt || findBody(expectedAction)?.text).toContain('متن تولید تست');
  });

  it('runs document_analysis through file upload and keeps the file payload visible to the assistant', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('cap-document_analysis')[0]);
    await waitFor(() => expect(screen.getByTestId('selected-capabilities')).toHaveTextContent('document_analysis'));
    fireEvent.click(screen.getAllByText('send-file')[0]);
    expect(screen.getAllByText(/proposal\.pdf/).length).toBeGreaterThan(0);
    await typeAndSend('این فایل را بررسی کن', 'ارسال');
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.capabilities).toContain('document_analysis');
    expect(body?.bundle?.inputs?.[0]?.file?.filename).toBe('proposal.pdf');
    expect(body?.bundle?.inputs?.[0]?.file?.data).toContain('data:application/pdf');
  });

  it('uses auto routing as the default text mode when no operator is selected', async () => {
    await renderPanel();
    await typeAndSend('یک پاسخ معمولی بده', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(fetch).toHaveBeenCalled(), { timeout: 5000 });
    expect(findBody('chat')).toBeFalsy();
  });

  it('uses direct text chat without invoking the automatic decision engine', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('cap-text_chat')[0]);
    await waitFor(() => expect(screen.getByTestId('selected-capabilities')).toHaveTextContent('text_chat'));
    await typeAndSend('فقط یک گفتگوی متنی معمولی', 'ارسال');

    await waitFor(() => expect(findFetchBody('chat_stream')).toBeTruthy());
    const body = findFetchBody('chat_stream') as any;
    expect(body?.capability).toBe('dashboard_chat');
    expect(body?.capabilities).toEqual([]);
    expect(findBody('suggest_auto_capabilities')).toBeFalsy();
  });

  it('does not generate an image automatically when the user only asks for an image prompt', async () => {
    await renderPanel();
    await typeAndSend('یک پرامپت برای تولید تصویر بهم بده', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    expect(findBody('generate_image')).toBeFalsy();
  });

  it('requires confirmation before auto-routed image generation runs', async () => {
    await renderPanel();
    await typeAndSend('یک تصویر برای پروپوزال بساز', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('تایید ساخت تصویر')).toBeInTheDocument());
    expect(findBody('generate_image')).toBeFalsy();
    fireEvent.click(screen.getByText('تایید و اجرا'));
    await waitFor(() => expect(findBody('generate_image')).toBeTruthy());
    expect(findBody('generate_image')?.prompt).toContain('یک تصویر برای پروپوزال بساز');
  });

  it('uses auto routing for record creation when no operator is selected', async () => {
    await renderPanel();
    await typeAndSend('این را به عنوان مشتری ثبت کن', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(findBody('create_record_from_prompt') || findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle') || findBody('create_record_from_prompt');
    expect(body?.recordCreation?.moduleId).toBe('customers');
  });

  it('routes an insurance expense to an editable expense draft instead of a manual CRM reply', async () => {
    await renderPanel();
    await typeAndSend('مبلغ ۱۱۷۶۱۰۶۱۸ ریال بابت بیمه ثبت هزینه کن', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.capabilities).toContain('record_creation');
    expect(body?.recordCreation?.moduleId).toBe('expense_documents');
    expect(body?.recordMutationMode).toBe('create');
    expect(body?.previewOnly).toBe(true);
  });

  it('routes record edits through the confirmed multi-record update path', async () => {
    await renderPanel();
    await typeAndSend('رکوردهای انتخاب‌شده مشتری را ویرایش کن', 'ارسال');
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.recordCreation?.moduleId).toBe('customers');
    expect(body?.recordMutationMode).toBe('update');
    expect(body?.previewOnly).toBe(true);
  }, 10000);

  it('uses auto routing for attached files when no operator is selected', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('send-file')[0]);
    await typeAndSend('این را بررسی کن', 'ارسال');
    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    expect(findBody('run_task_bundle')?.capabilities).toContain('document_analysis');
  });

  it('queues voice_input and sends it through task bundle', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('cap-voice_input')[0]);
    await waitFor(() => expect(screen.getByTestId('selected-capabilities')).toHaveTextContent('voice_input'));
    fireEvent.click(screen.getAllByText('send-voice')[0]);
    expect(screen.getAllByText(/ویس/).length).toBeGreaterThan(0);
    await typeAndSend('این ویس را بررسی کن', 'ارسال');
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.bundle?.inputs?.[0]?.type).toBe('voice');
    expect(body?.bundle?.inputs?.[0]?.audio?.data).toBe('voice-base64');
  });

  it('sends image/file and voice together for record creation as one task bundle', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('cap-record_creation')[0]);
    fireEvent.click(screen.getAllByText('cap-voice_input')[0]);
    fireEvent.click(screen.getAllByText('send-file')[0]);
    fireEvent.click(screen.getAllByText('send-voice')[0]);
    await typeAndSend('این را به عنوان مشتری ثبت کن', 'ارسال');
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.capabilities).toContain('record_creation');
    expect(body?.recordCreation?.moduleId).toBe('customers');
    expect(body?.bundle?.inputs).toHaveLength(2);
    expect(body?.bundle?.inputs?.map((item: any) => item.type)).toEqual(['file', 'voice']);
  });

  it('reuses the decision engine voice transcript while sending image, file and voice together', async () => {
    await renderPanel();
    fireEvent.click(screen.getAllByText('send-file')[0]);
    fireEvent.click(screen.getAllByText('send-voice')[0]);
    await typeAndSend('این عکس و ویس را به عنوان چند لید جدید ثبت کن', 'ارسال');

    await waitFor(() => expect(findBody('suggest_auto_capabilities')).toBeTruthy());
    await waitFor(() => expect(findBody('run_task_bundle')).toBeTruthy());
    const body = findBody('run_task_bundle');
    expect(body?.capabilities).toEqual(expect.arrayContaining(['voice_input', 'document_analysis', 'record_creation']));
    expect(body?.recordCreation?.moduleId).toBe('marketing_leads');
    expect(body?.recordMutationMode).toBe('create');
    expect(body?.bundle?.inputs).toHaveLength(2);
    expect(body?.bundle?.inputs?.[1]?.text).toContain('دو لید');
    expect(body?.bundle?.inputs?.[1]?.audio).toBeNull();
  }, 10000);
});
