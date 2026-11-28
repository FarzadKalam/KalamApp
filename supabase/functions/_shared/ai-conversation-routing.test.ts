import { describe, expect, it } from 'vitest';
import { resolveAiConversationRouting } from './ai-conversation-routing';

const route = (prompt: string, decision: Record<string, any> = {}) =>
  resolveAiConversationRouting({ prompt, decision, currentModule: 'job_descriptions', recordCreationAllowed: true });

describe('assistant conversation routing', () => {
  it('keeps job-description revisions in chat when a list of duties contains action verbs', () => {
    const prompt = 'در وظایف روزانه نظارت بر فعالیت‌های جاری را اضافه کن. آموزش‌پذیری را اضافه کن و متن شرح شغل را بازنویسی کن.';
    expect(route(prompt)).toEqual({});
    expect(route(prompt, { capabilities: ['record_creation'], target_module_id: 'tasks', mutation_mode: 'create' }))
      .toMatchObject({ capabilities: [], target_module_id: null, mutation_mode: null });
  });

  it('keeps explicit activity creation and explicit requests to save a record', () => {
    expect(route('یک فعالیت برای پیگیری قرارداد بساز.')).toMatchObject({ target_module_id: 'tasks', mutation_mode: 'create' });
    const decision = { capabilities: ['record_creation'], target_module_id: 'job_descriptions' };
    expect(route('متن شرح شغل را بازنویسی کن و در سامانه ثبت کن.', decision)).toBe(decision);
  });
});
