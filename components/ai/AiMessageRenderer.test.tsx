import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AiMessageRenderer from './AiMessageRenderer';

describe('AiMessageRenderer', () => {
  it('renders safe rich AI text and copy controls without executing raw HTML', () => {
    const onCopy = vi.fn();
    render(
      <AiMessageRenderer
        text={'**مهم**\n\n- مورد اول\n\n```ts\nconst value = 1;\n```\n\n<script>alert(1)</script>'}
        onCopyText={onCopy}
      />
    );

    expect(screen.getByText('مهم')).toBeInTheDocument();
    expect(screen.getByText('مورد اول')).toBeInTheDocument();
    expect(screen.getByText('const value = 1;')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(document.querySelector('script')).toBeNull();

    fireEvent.click(screen.getByLabelText('کپی کد'));
    expect(onCopy).toHaveBeenCalledWith('const value = 1;', 'کد');
  });

  it('renders quote-like output with its own copy action', () => {
    const onCopy = vi.fn();
    render(<AiMessageRenderer text={'> متن آماده برای استفاده\n> خط دوم'} onCopyText={onCopy} />);

    expect(screen.getByText(/متن آماده برای استفاده/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('کپی متن'));
    expect(onCopy).toHaveBeenCalledWith('متن آماده برای استفاده\nخط دوم', 'متن');
  });

  it('renders markdown headings without treating code fences as headings', () => {
    render(<AiMessageRenderer text={'## عنوان اصلی\nمتن معمولی\n\n### **زیرعنوان**\n\n#### C#\n\n```md\n## داخل کد\n```'} />);

    expect(screen.getByRole('heading', { level: 2, name: 'عنوان اصلی' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'زیرعنوان' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 4, name: 'C#' })).toBeInTheDocument();
    expect(screen.getByText('## داخل کد')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'داخل کد' })).toBeNull();
  });

  it('shows streaming and retry controls', () => {
    const onStop = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(<AiMessageRenderer text="" streaming onStop={onStop} />);

    expect(screen.getByText('در حال آماده‌سازی پاسخ…')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('توقف دریافت پاسخ'));
    expect(onStop).toHaveBeenCalled();

    rerender(<AiMessageRenderer text="خطا" failed onRetry={onRetry} />);
    fireEvent.click(screen.getByLabelText('تلاش دوباره'));
    expect(onRetry).toHaveBeenCalled();
  });

  it('keeps completed stages visible while processing and accessible after the response', () => {
    const stages = [
      { agentId: 'organization_data', stepId: 'read', phase: 'completed', at: 1, detail: 'خواندن اطلاعات فاکتور' },
      { agentId: 'web_search', stepId: 'search', phase: 'started', at: 2, detail: 'بررسی منابع تکمیلی' },
    ] as const;
    const { rerender } = render(<AiMessageRenderer text="" streaming activities={[...stages]} />);
    expect(screen.getByText('خواندن اطلاعات فاکتور…')).toBeVisible();
    expect(screen.getByText('بررسی منابع تکمیلی…')).toBeVisible();
    rerender(<AiMessageRenderer text="پاسخ نهایی" activities={[stages[0], { ...stages[1], phase: 'completed' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /۲ مرحله بررسی و انجام شد/ }));
    expect(screen.getByText('خواندن اطلاعات فاکتور…')).toBeVisible();
    expect(screen.getByText('بررسی منابع تکمیلی…')).toBeVisible();
  });
});
