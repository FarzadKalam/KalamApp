import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiActivityStatus from './AiActivityStatus';

afterEach(cleanup);

describe('AiActivityStatus', () => {
  it('renders ThoughtChain steps during streaming and supports stopping', () => {
    const onStop = vi.fn();
    render(
      <AiActivityStatus
        streaming
        onStop={onStop}
        activities={[
          { agentId: 'organization_data', phase: 'completed', at: 1, actionType: 'read_data', detail: 'خواندن فاکتورهای باز' },
          { agentId: 'deep_reasoning', phase: 'started', at: 2, actionType: 'deep_reasoning', detail: 'تحلیل تخفیف‌ها' },
        ]}
      />,
    );

    expect(screen.getByText('فرآیند بررسی و آماده‌سازی دستیار')).toBeInTheDocument();
    expect(screen.getByText('خواندن فاکتورهای باز…')).toBeInTheDocument();
    expect(screen.getByText('تحلیل تخفیف‌ها…')).toBeInTheDocument();
    expect(screen.getByText('در حال اجرا')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'توقف دریافت پاسخ' }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it('collapses completed activities into a Think summary trigger and expands on click', () => {
    render(
      <AiActivityStatus
        streaming={false}
        activities={[
          { agentId: 'organization_knowledge', phase: 'completed', at: 1, actionType: 'search_knowledge', detail: 'بررسی دستورالعمل فروش' },
          { agentId: 'text_chat', phase: 'completed', at: 2, actionType: 'generating_reply', detail: 'نگارش جمع‌بندی' },
        ]}
      />,
    );

    const trigger = screen.getByRole('button', { name: /مرحله بررسی و انجام شد/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('بررسی دستورالعمل فروش…')).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('بررسی دستورالعمل فروش…')).toBeInTheDocument();
    expect(screen.getByText('نگارش جمع‌بندی…')).toBeInTheDocument();
  });
});
