import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldUseGeneratedPdfPrint, waitForPrintPrerequisite } from './printAsPdf';

describe('printAsPdf device-independent flow', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('selects the server-generated PDF on every browser client', () => {
    expect(shouldUseGeneratedPdfPrint()).toBe(true);
  });

  it('ends a stalled print prerequisite instead of waiting forever', async () => {
    vi.useFakeTimers();
    const pending = new Promise<never>(() => undefined);
    const result = waitForPrintPrerequisite(pending, 80);
    const rejection = expect(result).rejects.toThrow('print_prerequisite_timeout');

    await vi.advanceTimersByTimeAsync(80);

    await rejection;
  });
});
