// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

let handle: (request: Request) => Promise<Response>;
const create = vi.fn(async () => ({ fetch: async () => new Response('ok') }));

beforeAll(async () => {
  vi.stubGlobal('Deno', {
    env: { get: (name: string) => name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture-service-key' : undefined, toObject: () => ({}) },
    serve: (handler: typeof handle) => { handle = handler; },
  });
  vi.stubGlobal('EdgeRuntime', { userWorkers: { create } });
  await import('./index');
});
afterAll(() => vi.unstubAllGlobals());

describe('worker lifetime for AI requests', () => {
  it.each([
    ['ai-assistant', {}, 120_000],
    ['other-function', {}, 60_000],
    ['ai-assistant', { 'x-kalam-internal': 'ai-image-worker', authorization: 'Bearer user-session' }, 120_000],
    ['ai-assistant', { 'x-kalam-internal': 'ai-image-worker', authorization: 'Bearer fixture-service-key' }, 900_000],
  ] as const)('applies the runtime budget to %s', async (service, headers, workerTimeoutMs) => {
    await handle(new Request(`https://edge.example.test/${service}`, { method: 'POST', headers }));
    expect(create).toHaveBeenLastCalledWith(expect.objectContaining({ workerTimeoutMs, memoryLimitMb: 150 }));
  });
});
