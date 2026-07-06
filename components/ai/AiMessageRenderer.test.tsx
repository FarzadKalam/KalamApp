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

  it('shows streaming and retry controls', () => {
    const onStop = vi.fn();
    const onRetry = vi.fn();
    const { rerender } = render(<AiMessageRenderer text="" streaming onStop={onStop} />);

    expect(screen.getByText('در حال آماده‌سازی پاسخ...')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('توقف دریافت پاسخ'));
    expect(onStop).toHaveBeenCalled();

    rerender(<AiMessageRenderer text="خطا" failed onRetry={onRetry} />);
    fireEvent.click(screen.getByLabelText('تلاش دوباره'));
    expect(onRetry).toHaveBeenCalled();
  });
});
