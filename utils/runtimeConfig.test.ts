import { describe, expect, it } from 'vitest';
import { resolvePublicRuntimeConfig } from './runtimeConfig';

const key = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature`;
const local = { deploymentMode: 'self_hosted' as const, supabaseUrl: 'https://local.example.ir', supabaseAnonKey: key('anon') };
describe('runtime connection isolation', () => {
  it('preserves the existing cloud connection without a local marker', () => {
    expect(resolvePublicRuntimeConfig({}, { url: 'https://cloud.example.ir', key: 'cloud-key' }).supabaseUrl).toBe('https://cloud.example.ir');
  });
  it('never falls back to cloud for a local shell or an incomplete local config', () => {
    expect(() => resolvePublicRuntimeConfig({}, { url: 'https://cloud.example.ir' }, true)).toThrow();
    expect(() => resolvePublicRuntimeConfig({ deploymentMode: 'self_hosted' }, {})).toThrow();
  });
  it('accepts public credentials and rejects private roles and unsafe origins', () => {
    expect(resolvePublicRuntimeConfig(local, {}).deploymentMode).toBe('self_hosted');
    for (const supabaseUrl of ['http://local.example.ir', 'https://user:password@local.example.ir', 'https://local.example.ir/api', 'https://local.example.ir?token=x']) {
      expect(() => resolvePublicRuntimeConfig({ ...local, supabaseUrl }, {})).toThrow();
    }
    expect(() => resolvePublicRuntimeConfig({ ...local, supabaseAnonKey: key('service_role') }, {})).toThrow();
  });
});
