import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AiGenerationStatusCard from './AiGenerationStatusCard';
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('AI generation status',()=>{
  it('preserves timed polling and manual recheck while exposing the real agent and elapsed time',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-10T12:00:00Z'));
    const recheck=vi.fn(),dismiss=vi.fn();
    render(<AiGenerationStatusCard kind="image_generation" startedAtMs={Date.now()} onRecheck={recheck} onDismiss={dismiss} />);
    expect(screen.getByText('مهارت تصویرسازی')).toBeInTheDocument();
    expect(screen.getByText('در حال ساخت تصویر…')).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'بررسی مجدد'})).toBeDisabled();
    await act(async()=>vi.advanceTimersByTime(5000));
    expect(recheck).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('زمان سپری‌شده')).toHaveTextContent('۰۰:۰۵');
    fireEvent.click(screen.getByRole('button',{name:'بررسی مجدد'}));
    expect(recheck).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button',{name:'بستن کارت ساخت خروجی'}));
    expect(dismiss).toHaveBeenCalledOnce();
  });
  it('does not pretend a disconnected request is still generating or poll when manual checking is required',async()=>{
    vi.useFakeTimers();
    const recheck=vi.fn();
    render(<AiGenerationStatusCard kind="video_generation" startedAtMs={Date.now()} onRecheck={recheck} autoPoll={false} failedNote="ارتباط قطع شد؛ وضعیت را بررسی کنید." />);
    expect(screen.getByText('نیازمند بررسی وضعیت')).toBeInTheDocument();
    expect(screen.queryByText('در حال ساخت ویدیو…')).not.toBeInTheDocument();
    await act(async()=>vi.advanceTimersByTime(10000));
    expect(recheck).not.toHaveBeenCalled();
  });
});
