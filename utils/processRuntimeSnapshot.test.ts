import { describe, expect, it } from 'vitest';
import {
  getCompletedProcessesToggleLabel,
  isProcessExecutionStarted,
  shouldShowProcessEmptyState,
} from './processRuntimeSnapshot';

describe('process runtime snapshot', () => {
  it('only marks progressed task statuses as started', () => {
    expect(isProcessExecutionStarted([{ status: 'todo' }])).toBe(false);
    expect(isProcessExecutionStarted([{ status: 'in_progress' }])).toBe(true);
    expect(isProcessExecutionStarted([{ status: 'completed' }])).toBe(true);
  });

  it('does not expose the empty action before a successful load', () => {
    expect(shouldShowProcessEmptyState({ loaded: false, succeeded: false, isEmpty: true })).toBe(false);
    expect(shouldShowProcessEmptyState({ loaded: true, succeeded: false, isEmpty: true })).toBe(false);
    expect(shouldShowProcessEmptyState({ loaded: true, succeeded: true, isEmpty: true })).toBe(true);
  });

  it('builds the one-line completed-process label with Persian digits', () => {
    expect(getCompletedProcessesToggleLabel(2)).toBe('مشاهده ۲ فرآیند تکمیل‌شده');
    expect(getCompletedProcessesToggleLabel(2, true)).toBe('پنهان کردن ۲ فرآیند تکمیل‌شده');
  });
});
