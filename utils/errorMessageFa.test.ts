import { describe, expect, it } from 'vitest';
import { toFaErrorMessage } from './errorMessageFa';

describe('database trigger error messages', () => {
  it('reports a trigger update conflict without blaming concurrent users or suggesting refresh', () => {
    const message = toFaErrorMessage({
      code: '27000',
      message: 'tuple to be updated was already modified by an operation triggered by the current command',
      hint: 'Consider using an AFTER trigger instead of a BEFORE trigger to propagate changes to other rows.',
    });
    expect(message).toContain('همگام‌سازی داخلی رکورد');
    expect(message).not.toContain('سند');
    expect(message).not.toContain('هم‌زمانی');
    expect(message).not.toContain('بروزرسانی');
  });
});
