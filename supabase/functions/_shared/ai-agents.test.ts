import { describe, expect, it, vi } from 'vitest';
import { AI_AGENTS, applyAiAgentActivity, getAiAgentLabel, parseAiAgentActivity, resolveAiAgentId, withAiAgentActivity, type AiAgentActivity } from './ai-agents';

describe('shared AI agent contract', () => {
  it('keeps saved capability aliases compatible and never exposes unknown keys', () => {
    expect(resolveAiAgentId('dashboard_chat')).toBe('text_chat');
    expect(resolveAiAgentId('auto_router')).toBe('auto_decision');
    expect(getAiAgentLabel('private-unknown-key')).toBe('انتخاب خودکار');
    expect(getAiAgentLabel('constructor')).toBe('انتخاب خودکار');
    expect(getAiAgentLabel('__proto__')).toBe('انتخاب خودکار');
    for (const agent of Object.values(AI_AGENTS)) expect(agent.label).toMatch(/^(ایجنت|مهارت|انتخاب) /);
  });
  it('tracks parallel observed work without dropping another agent or accepting unknown events', () => {
    const first: AiAgentActivity = { agentId:'organization_data', phase:'started', at:1 };
    const second: AiAgentActivity = { agentId:'organization_knowledge', phase:'started', at:2 };
    const active = applyAiAgentActivity([first],second);
    expect(active).toEqual([first,second]);
    expect(applyAiAgentActivity(active,{...first,phase:'completed'})).toEqual([second]);
    expect(parseAiAgentActivity({agentId:'fake',phase:'started',at:1})).toBeNull();
    expect(parseAiAgentActivity({...first,at:'secret'})).toBeNull();
    expect(parseAiAgentActivity({...first,phase:'unknown'})).toBeNull();
  });
  it('reports only the lifetime of real work and always ends failed work', async () => {
    const report=vi.fn();
    let release!: (value:string)=>void;
    const request=withAiAgentActivity('web_search',()=>new Promise<string>(resolve=>{release=resolve;}),report);
    expect(report.mock.calls.map(([event])=>event.phase)).toEqual(['started']);
    release('result');
    await expect(request).resolves.toBe('result');
    expect(report.mock.calls.map(([event])=>event.phase)).toEqual(['started','completed']);
    report.mockClear();
    await expect(withAiAgentActivity('organization_data',async()=>{throw new Error('denied');},report)).rejects.toThrow('denied');
    expect(report.mock.calls.map(([event])=>event.phase)).toEqual(['started','completed']);
  });
});
