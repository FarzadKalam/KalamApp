import { describe, expect, it, vi } from 'vitest';
vi.mock('../supabaseClient', () => ({ supabase: {} }));
import { isValidInstallationOrigin, reportIsStale, safeDiagnosticReport } from './localInstallations';

describe('installation inputs and diagnostic privacy', () => {
  it('accepts public and private HTTPS origins without embedded credentials', () => {
    expect(isValidInstallationOrigin('https://10.0.1.20')).toBe(true);
    expect(isValidInstallationOrigin('https://app.example.ir')).toBe(true);
    for (const url of ['http://app.example.ir', 'https://a:b@app.example.ir', 'https://app.example.ir/a', 'https://app.example.ir?token=secret']) expect(isValidInstallationOrigin(url)).toBe(false);
  });
  it('reconstructs the diagnostic schema instead of storing unknown fields', () => {
    const result = safeDiagnosticReport({ format: 'kalamapp-diagnostics-v1', generated_at: '2026-11-04T10:00:00Z', version: '2.121.0.0.0', services: [{ name: 'db', status: 'healthy', password: 'private' }], token: 'private', rows: ['private'] });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(result.services).toEqual([{ name: 'db', status: 'healthy' }]);
    expect(() => safeDiagnosticReport({ ...result, services: [{ name: 'password=secret', status: 'healthy' }] })).toThrow();
  });
  it('marks old reports by generation time independently of receipt time', () => {
    const now = Date.parse('2026-11-04T10:00:00Z');
    expect(reportIsStale('2026-11-01T10:00:00Z', now)).toBe(true);
    expect(reportIsStale('2026-11-04T09:59:00Z', now)).toBe(false);
    expect(reportIsStale('invalid', now)).toBe(true);
  });
});
