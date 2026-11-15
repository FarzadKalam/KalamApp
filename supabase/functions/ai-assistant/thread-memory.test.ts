// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe,expect,it,vi } from 'vitest';
import { compactThreadConversation,mergeWorkingStateFromMessages } from '../_shared/ai-context-compressor';
import { estimateMessagesTokens } from '../_shared/ai-prompt-compiler';
import { getModelContextWindowTokens } from '../_shared/ai-context-policy';
const source=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const loadAiThreadMemory ='),source.indexOf('const findThreadByContextKey ='));
describe('durable model conversation memory',() => {
  it('reads every unsummarized page, preserves original file refs and does not resummarize old history',async () => {
    const messages=Array.from({ length: 90 },(_,i) => ({ id: String(i+1),created_at: new Date(1700000000000+i*1000).toISOString(),
      role: i%2 ? 'assistant' : 'user',content: `turn ${i+1}`,metadata: i===0 ? { attachments: [{ name: 'image',url: 'https://files.test/source',assetId: 'asset' }] } : {} }));
    const thread:any={ id: 'thread',working_state: {} };
    const read=vi.fn(async (table,query) => {
      if (table === 'ai_action_logs') return [];
      if (query.id) return messages.filter(row => row.id === query.id.slice(3));
      const date=query.or?.match(/created_at.gt.([^,]+)/)?.[1];
      return messages.filter(row => !date || row.created_at>date).slice(0,query.limit);
    });
    const patch=vi.fn(async (_u,_k,_t,_q,update) => { Object.assign(thread,update); return [thread]; });
    const call=vi.fn(async () => ({ content: 'هدف و تصمیم‌های قبلی و فایل مرجع محفوظ است.',requestId: 'compression' }));
    const deps={ restSelect: (_u:any,_k:any,table:any,query:any) => read(table,query),restPatch: patch,compactThreadConversation,
      mergeWorkingStateFromMessages,estimateMessagesTokens,getModelContextWindowTokens,filterVisibleAiMessages: (rows:any[]) => rows,callChatCompletions: call };
    const run=new Function(...Object.keys(deps),ts.transpileModule(code+'\nreturn loadAiThreadMemory;',{
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText)(...Object.values(deps));
    const provider={ model: 'selected-model',provider: 'test',modelCatalog: { id: 'selected-model' } };
    const result=await run('test','key',{ orgId: 'org' },thread,provider);
    expect(result.at(-1).content).toBe('turn 90'); expect(thread.compaction_cursor_message_id).toBe('74');
    expect(thread.working_state.attachment_refs[0].asset_id).toBe('asset');
    expect(thread.working_state.active_intake_attachments[0].url).toBe('https://files.test/source');
    expect(call).toHaveBeenCalledTimes(1);
    const resumed=await run('test','key',{ orgId: 'org' },thread,provider);
    expect(resumed.at(-1).content).toBe('turn 90'); expect(call).toHaveBeenCalledTimes(1);
    expect(read.mock.calls.every(([_table,query]) => query.org_id === 'eq.org')).toBe(true);
  });
});
