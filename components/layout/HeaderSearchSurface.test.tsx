import React, { useRef, useState } from 'react';
import { Input } from 'antd';
import type { InputRef } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HeaderSearchSurface from './HeaderSearchSurface';

afterEach(cleanup);

const Harness = ({ mobile = true, route = '/', dismiss = vi.fn() }) => {
  const input = useRef<InputRef>(null);
  const container = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  return <header data-testid="header" data-search-open={expanded}>
    <HeaderSearchSurface isMobile={mobile} resetKey={route} inputRef={input} containerRef={container}
      onDismiss={dismiss} onOpenChange={setExpanded}>
      <Input ref={input} aria-label="عبارت جستجو" />
      <button>نتیجهٔ جستجو</button>
    </HeaderSearchSurface>
    <button>بیرون جستجو</button>
  </header>;
};

describe('mobile header search', () => {
  it('opens from a named button, exposes the search and focuses the input', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'باز کردن جستجو' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByRole('search')).toBeVisible();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox')).toHaveFocus();
    expect(screen.getByTestId('header')).toHaveAttribute('data-search-open', 'true');
  });
  it('closes on Escape and restores focus to the search button', async () => {
    const dismiss = vi.fn();
    render(<Harness dismiss={dismiss} />);
    const trigger = screen.getByRole('button', { name: 'باز کردن جستجو' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('keeps results interactive and dismisses when tapping outside', () => {
    const dismiss = vi.fn();
    render(<Harness dismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جستجو' }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'نتیجهٔ جستجو' }));
    expect(dismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'بیرون جستجو' }));
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('closes on navigation and becomes inline when switching to desktop', () => {
    const view = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جستجو' }));
    view.rerender(<Harness route="/customers" />);
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    view.rerender(<Harness mobile={false} route="/customers" />);
    expect(screen.queryByRole('button', { name: 'باز کردن جستجو' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeVisible();
    expect(screen.getByRole('search')).not.toHaveAttribute('aria-hidden');
  });
  it('closes through the close button', () => {
    const dismiss = vi.fn();
    render(<Harness dismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'باز کردن جستجو' }));
    fireEvent.click(screen.getByRole('button', { name: 'بستن جستجو' }));
    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});
