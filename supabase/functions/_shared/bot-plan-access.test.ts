import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasBotPlanAccess, canUseBotAction } from './bot-plan-access';
import { BOT_PLAN_FEATURES } from './bot-plan-features';
afterEach(() => vi.unstubAllGlobals());
describe('bot channel licenses', () => {
  it.each(Object.entries(BOT_PLAN_FEATURES))('enforces the %s channel, organization and readonly state', async (channel, feature) => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ available: true, features: { [feature]: true } }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await hasBotPlanAccess('https://example.invalid', 'test', 'org-a', channel)).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).p_org_id).toBe('org-a');
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ available: true, features: { [feature]: false } }) });
    expect(await hasBotPlanAccess('https://example.invalid', 'test', 'org-a', channel)).toBe(false);
    fetcher.mockResolvedValue({ ok: true, json: async () => ({ available: true, isReadonly: true, features: { [feature]: true } }) });
    expect(await hasBotPlanAccess('https://example.invalid', 'test', 'org-a', channel)).toBe(false);
  });
  it('denies unknown channels before any query', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    expect(await hasBotPlanAccess('https://example.invalid', 'test', 'org-a', 'unknown')).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
});

it('keeps role permissions independent from a licensed channel', () => {
  expect(canUseBotAction({ __communications: { fields: { use_bot_channels: false } } }, 'send_test_message', { software_role: 'editor' })).toBe(false);
  expect(canUseBotAction({}, 'send_test_message', { software_role: 'editor' })).toBe(true);
  expect(canUseBotAction({}, 'start_capture', { software_role: 'editor' })).toBe(false);
  expect(canUseBotAction({ __settings_tabs: { fields: { connections: false } } }, 'start_capture', { software_role: 'admin' })).toBe(false);
  expect(canUseBotAction({}, 'start_capture', { software_role: 'admin' })).toBe(true);
});
