import { describe, expect, it } from 'vitest';
import { parseAiMarkdownTable, splitAiTableRow } from './aiMarkdownTable';
import { getAiModelTransition } from './aiChatPresentation';
import { getAiExecutionSteps } from '../supabase/functions/_shared/ai-agents';
import { readAiTaskResponse } from './aiEventStream';

describe('AI chat presentation contracts', () => {
  it('parses escaped pipes and inline code without interpreting cell HTML', () => {
    expect(splitAiTableRow('| الف \\| ب | `a|b` |')).toEqual(['الف | ب', '`a|b`']);
    expect(splitAiTableRow('| `C:\\files` | C:\\files |')).toEqual(['`C:\\files`', 'C:\\files']);
    expect(parseAiMarkdownTable(['| نام | مقدار |','| --- | ---: |','| <script>x</script> | ۱۲ |'],0)?.rows).toEqual([['<script>x</script>','۱۲']]);
    expect(parseAiMarkdownTable(['a | b','text | text'],0)).toBeNull();
  });
  it('does not silently discard extra columns or grow an unbounded table', () => {
    const parsed = parseAiMarkdownTable(['a | b','--- | ---','1 | 2 | 3'],0);
    expect(parsed?.end).toBe(1);
    expect(parseAiMarkdownTable(['a | b','--- | ---',...Array(500).fill('1 | 2')],0)?.rows).toHaveLength(200);
  });
  it('shows a transition only when actual response models change, including after reload', () => {
    const messages = [{role:'assistant',model:'model-a'},{role:'user'},{role:'assistant'},{role:'assistant',model:'model-b'}];
    expect(getAiModelTransition(messages,0)).toBeNull();
    expect(getAiModelTransition(messages,2)).toBeNull();
    expect(getAiModelTransition(JSON.parse(JSON.stringify(messages)),3)).toEqual({from:'model-a',to:'model-b'});
    expect(getAiModelTransition([{role:'assistant',model:'same'},{role:'assistant',model:'same'}],1)).toBeNull();
  });
  it('keeps sequential and overlapping stage executions distinct and records failures', () => {
    const steps = getAiExecutionSteps([
      {agentId:'organization_data',phase:'started',at:1}, {agentId:'organization_knowledge',phase:'started',at:2},
      {agentId:'organization_data',phase:'completed',at:3},{agentId:'organization_knowledge',phase:'failed',at:4},
      {agentId:'organization_data',phase:'started',at:5},
    ]);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toMatchObject({parallel:true,endedAt:3});
    expect(steps[1]).toMatchObject({parallel:true,failed:true});
    expect(steps[2]).toMatchObject({parallel:false,startedAt:5});
    expect(steps[2].endedAt).toBeUndefined();
  });
  it('reads fragmented SSE stages and the original structured bundle result', async () => {
    const encoder=new TextEncoder(); const observed: unknown[]=[];
    const response=new Response(new ReadableStream({start(controller){
      for(const chunk of ['event: agent_act','ivity\r\ndata: {"agentId":"document_analysis","phase":"started","at":1}\r\n\r\n','event: done\ndata: {"success":true,"proposedAction":{"kind":"preview"}}\n\n']) controller.enqueue(encoder.encode(chunk));
      controller.close();
    }}),{headers:{'content-type':'text/event-stream'}});
    expect(await readAiTaskResponse(response,event=>observed.push(event))).toMatchObject({success:true,proposedAction:{kind:'preview'}});
    expect(observed).toHaveLength(1);
  });
  it('accepts old JSON servers and rejects incomplete streams and failed payloads', async () => {
    expect(await readAiTaskResponse(Response.json({success:true,answer:'قدیمی'}),()=>{})).toMatchObject({answer:'قدیمی'});
    await expect(readAiTaskResponse(new Response('event: ping\ndata: {}\n\n',{headers:{'content-type':'text/event-stream'}}),()=>{})).rejects.toThrow('قطع شد');
    await expect(readAiTaskResponse(Response.json({success:false,message:'خطای نمونه'}),()=>{})).rejects.toThrow('خطای نمونه');
  });
});
