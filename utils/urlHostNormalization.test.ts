import { describe, expect, it } from 'vitest';
import { normalizeApiBaseUrl, normalizeExternalUrl } from './urlHostNormalization';

describe('urlHostNormalization', () => {
  it('rewrites the legacy API host to the current host for Supabase base URLs', () => {
    expect(normalizeApiBaseUrl('https://api.kalamapp.ir')).toBe('https://api.tazesystem.ir');
    expect(normalizeApiBaseUrl('http://api.kalamapp.ir/rest/v1/')).toBe('https://api.tazesystem.ir/rest/v1');
  });

  it('keeps local development URLs on http', () => {
    expect(normalizeApiBaseUrl('http://localhost:54321')).toBe('http://localhost:54321');
  });

  it('rewrites legacy asset hosts before rendering public URLs', () => {
    const normalized = normalizeExternalUrl(new URL('https://api.kalamapp.ir/storage/v1/object/public/images/test.jpg'));
    expect(normalized.toString()).toBe('https://api.tazesystem.ir/storage/v1/object/public/images/test.jpg');
  });
});
