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
});
