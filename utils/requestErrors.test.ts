import { describe, expect, it } from 'vitest';
import { isAbortLikeError } from './requestErrors';

describe('isAbortLikeError', () => {
  it('recognizes Supabase timeout and abort payloads', () => {
    expect(isAbortLikeError({ name: 'AbortError' })).toBe(true);
    expect(isAbortLikeError({ details: 'AbortError: signal is aborted without reason' })).toBe(true);
    expect(isAbortLikeError({ hint: 'Request was aborted (timeout or manual cancellation)' })).toBe(true);
    expect(isAbortLikeError({ message: 'permission denied' })).toBe(false);
  });
});
