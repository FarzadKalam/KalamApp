import { describe, expect, it } from 'vitest';
import {
  buildAgentInboxPayload,
  filterCohesiveThreadMessages,
  resolveEligibleAgentInboxThread,
} from './ai-agent-inbox';

describe('AI agent inbox thread attribution and cohesion', () => {
  it('excludes legacy untagged threads, reply suggestions, and implicit generic web chats', () => {
    expect(
      resolveEligibleAgentInboxThread({
        id: 't-legacy',
        title: 'یک فعالیت جدید میخوام ثبت شه',
        agent_key: null,
        selected_agents: [],
        channel: 'web',
        metadata: { last_activity_kind: 'create_record_confirmed' },
      }),
    ).toEqual({ eligible: false, agentKey: null, channel: 'web' });

    expect(
      resolveEligibleAgentInboxThread({
        id: 't-reply',
        title: 'پیشنهاد پاسخ بات',
        agent_key: 'lead_orchestrator',
        selected_agents: ['lead_orchestrator'],
        channel: 'agent_inbox',
        metadata: { context_key: 'reply:bot:1' },
      }).eligible,
    ).toBe(false);

    expect(
      resolveEligibleAgentInboxThread({
        id: 't-generic-web',
        title: 'سلام چطوری',
        agent_key: 'lead_orchestrator',
        selected_agents: ['lead_orchestrator'],
        channel: 'web',
        metadata: { explicit_agent_selected: false },
      }),
    ).toEqual({ eligible: false, agentKey: null, channel: 'web' });

    expect(
      resolveEligibleAgentInboxThread({
        id: 't-explicit-web',
        title: 'تحلیل فروش امروز',
        agent_key: 'sales_leads',
        selected_agents: ['sales_leads'],
        channel: 'web',
        metadata: { explicit_agent_selected: true },
      }),
    ).toEqual({ eligible: true, agentKey: 'sales_leads', channel: 'web' });

    expect(
      resolveEligibleAgentInboxThread({
        id: 't-staff-bot',
        title: 'گزارش بات کارکنان',
        agent_key: 'hr_manager',
        selected_agents: ['hr_manager'],
        channel: 'staff_bot',
        metadata: {},
      }),
    ).toEqual({ eligible: true, agentKey: 'hr_manager', channel: 'staff_bot' });
  });

  it('strips failed turns with orphaned user prompts and excludes incomplete web threads', () => {
    const webFailedOnly = filterCohesiveThreadMessages(
      [
        {
          id: 'm1',
          thread_id: 't1',
          role: 'user',
          content: 'سلام چطوری',
          created_at: '2026-11-09T23:10:16.000Z',
          metadata: {},
        },
        {
          id: 'm2',
          thread_id: 't1',
          role: 'assistant',
          content: 'خطای provider هوش مصنوعی: اعتبار حساب Avalai تمام شده است.',
          created_at: '2026-11-09T23:10:17.000Z',
          metadata: { failed: true, status: 'failed' },
        },
      ],
      { id: 't1', title: 'سلام چطوری', metadata: { last_activity_kind: 'text_failed' } },
      'lead_orchestrator',
      'web',
    );
    expect(webFailedOnly).toEqual([]);

    const mixedWithOlderSuccess = filterCohesiveThreadMessages(
      [
        {
          id: 'm1',
          thread_id: 't2',
          role: 'user',
          content: 'وضعیت فروش؟',
          created_at: '2026-11-12T08:00:00.000Z',
          metadata: {},
        },
        {
          id: 'm2',
          thread_id: 't2',
          role: 'assistant',
          content: 'امروز ۵ پیش‌فاکتور ثبت شده است.',
          created_at: '2026-11-12T08:00:05.000Z',
          metadata: {},
        },
        {
          id: 'm3',
          thread_id: 't2',
          role: 'user',
          content: 'یک خطای ناتمام',
          created_at: '2026-11-12T08:05:00.000Z',
          metadata: {},
        },
        {
          id: 'm4',
          thread_id: 't2',
          role: 'assistant',
          content: 'خطای شبکه',
          created_at: '2026-11-12T08:05:02.000Z',
          metadata: { failed: true },
        },
      ],
      { id: 't2', title: 'گزارش فروش', metadata: { last_activity_kind: 'text_failed' } },
      'sales_leads',
      'web',
    );
    expect(mixedWithOlderSuccess.map((item) => item.content)).toEqual([
      'امروز ۵ پیش‌فاکتور ثبت شده است.',
      'وضعیت فروش؟',
    ]);
  });

  it('never stitches multiple threads together and dedupes agent_inbox notes against ai_messages', () => {
    const oldThread = {
      id: 't-old',
      title: 'گفتگوی قبلی',
      agent_key: 'sales_leads',
      channel: 'web',
      metadata: { explicit_agent_selected: true },
    };
    const newThread = {
      id: 't-new',
      title: 'گفتگوی جدید',
      agent_key: 'sales_leads',
      channel: 'web',
      metadata: { explicit_agent_selected: true },
    };

    const payload = buildAgentInboxPayload({
      visibleAgentNotes: [
        {
          id: 'note-1',
          content: 'سفارش آماده پیگیری است',
          source_type: 'ai',
          created_at: '2026-11-12T10:00:00.000Z',
          metadata: { agent_key: 'hr_manager', conversation_key: 'agent:hr_manager' },
        },
      ],
      eligibleThreads: [
        { thread: oldThread, agentKey: 'sales_leads', channel: 'web' },
        { thread: newThread, agentKey: 'sales_leads', channel: 'web' },
      ],
      threadMessages: [
        {
          id: 'old-u',
          thread_id: 't-old',
          role: 'user',
          content: 'سوال قدیمی',
          created_at: '2026-11-10T09:00:00.000Z',
          metadata: {},
        },
        {
          id: 'old-a',
          thread_id: 't-old',
          role: 'assistant',
          content: 'پاسخ قدیمی',
          created_at: '2026-11-10T09:00:03.000Z',
          metadata: {},
        },
        {
          id: 'new-u',
          thread_id: 't-new',
          role: 'user',
          content: 'سوال تازه',
          created_at: '2026-11-12T11:00:00.000Z',
          metadata: {},
        },
        {
          id: 'new-a',
          thread_id: 't-new',
          role: 'assistant',
          content: 'پاسخ تازه',
          created_at: '2026-11-12T11:00:03.000Z',
          metadata: {},
        },
      ],
    });

    const salesThread = payload.threads.find((item) => item.agentKey === 'sales_leads');
    expect(salesThread).toBeTruthy();
    expect(salesThread?.messages.map((item) => item.content)).toEqual([
      'پاسخ تازه',
      'سوال تازه',
    ]);
    expect(salesThread?.messages.some((item) => item.content === 'سوال قدیمی')).toBe(false);
  });
});
