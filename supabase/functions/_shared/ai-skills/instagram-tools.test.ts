import { describe, expect, it, vi } from 'vitest';
import { createInstagramReadToolRuntime } from './instagram-tools';
import { instagrammerSkill } from './instagrammer';
import type { SkillExecutionContext } from './types';

const ctx = (agents: string[] = ['instagrammer']): SkillExecutionContext => ({
  supabaseUrl: 'https://example.invalid', serviceRoleKey: 'test', authContext: {},
  grounding: { freeChatMode: false, agentStates: { instagrammer: { canUse: true, canView: true, canChat: true } } } as any,
  selectedAgents: agents as any, selectedCapabilities: [], userMessage: 'این سرنخ را از دایرکت اینستاگرام ثبت کن',
});

describe('model-selected Instagram context', () => {
  it('does not load media while assembling the persona, even when the text mentions posts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      expect(await instagrammerSkill.gatherDomainContext({ ...ctx(), userMessage: 'ثبت مشتری از زیر پست اینستاگرام' })).toEqual({ available_tools: ['read_instagram_context'] });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });
  it('does not offer Instagram reads to another agent or an inaccessible persona', () => {
    const load = vi.fn();
    expect(createInstagramReadToolRuntime(ctx(['sales_leads']), load)).toBeNull();
    const denied = ctx(); (denied.grounding.agentStates.instagrammer as any).canChat = false;
    expect(createInstagramReadToolRuntime(denied, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });
  it('reads only on a tool call and displays only cards explicitly selected by the model', async () => {
    const cards = [{ id: 'first', permalink: 'https://example.invalid/first', media_type: 'post' }, { id: 'second', permalink: 'https://example.invalid/second', media_type: 'reel' }];
    const load = vi.fn(async () => ({ media_cards: cards }));
    const runtime = createInstagramReadToolRuntime(ctx(), load)!;
    const responseArray = runtime.mediaCards;
    expect(load).not.toHaveBeenCalled();
    await runtime.execute({ showMediaCards: false });
    expect(responseArray).toEqual([]);
    await runtime.execute({ showMediaCards: true, mediaIds: ['second'] });
    expect(responseArray.map(card => card.id)).toEqual(['second']);
    expect(runtime.mediaCards).toBe(responseArray);
    await runtime.execute({ showMediaCards: true, mediaIds: ['unknown'] });
    expect(responseArray).toEqual([]);
  });
  it('never presents cards returned from a denied source', async () => {
    const runtime = createInstagramReadToolRuntime(ctx(), vi.fn(async () => ({ rbac_restricted: true, reason_fa: 'دسترسی ندارید' })))!;
    expect(await runtime.execute({ showMediaCards: true })).toMatchObject({ success: false });
    expect(runtime.mediaCards).toEqual([]);
  });
});
