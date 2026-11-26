// @vitest-environment node
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import { isPrimaryAgentOperation } from '../_shared/ai-gateway';
import { hasAiStructuredAction } from '../_shared/ai-record-contract';
import { NATIVE_AGENT_SKILLS } from '../_shared/ai-native-skills';

// Execute the actual preflight, stopping before thread/provider work. The live
// failure occurred here after successful routing, before the mutation handler.
const source = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const start = source.indexOf('const handleRunTaskBundle =');
const end = source.indexOf('  const existingThread =', start);
const preflight = source.slice(start, end) + '\nreturn true; }; return handleRunTaskBundle;';
const harness = () => {
  const resolveProviderConfig = vi.fn(async (_url, _key, _auth, capability) => {
    if (capability === 'record_creation' || capability === 'process_operation') throw new Error('A standalone operational model does not exist');
    return { orgAiSettings: {}, model: 'actual-agent-model' };
  });
  const assertAiCapabilityEnabled = vi.fn(async () => {});
  const dependencies = { resolveProviderConfig, assertAiCapabilityEnabled, isPrimaryAgentOperation, hasAiStructuredAction, NATIVE_AGENT_SKILLS,
    normalizeTaskBundleInputs: () => [], normalizeContext: (context: any) => context || {},
    AI_CAPABILITY_FEATURE_KEYS: { record_creation: 'ai_chat', process_operation: 'ai_chat', voice_input: 'ai_voice_input' },
  };
  const run = new Function(...Object.keys(dependencies), ts.transpileModule(preflight, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText)(...Object.values(dependencies));
  return { run, resolveProviderConfig, assertAiCapabilityEnabled };
};
describe('actual task bundle operational preflight', () => {
  it.each(['record_creation', 'process_operation', 'document_analysis', 'deep_reasoning'])('does not demand a separate %s model after routing', async capability => {
    const fixture = harness();
    expect(await fixture.run('test://', 'test', { orgId: 'org-1' }, { message: 'درخواست عملیاتی', capabilities: [capability], primaryModelOnly: !NATIVE_AGENT_SKILLS.has(capability) })).toBe(true);
    expect(fixture.resolveProviderConfig).toHaveBeenCalledTimes(1);
    expect(fixture.assertAiCapabilityEnabled).toHaveBeenCalledWith('test://', 'test', { orgId: 'org-1' }, {}, capability);
  });
  it('still enforces the operation feature gate rather than conflating it with model compatibility', async () => {
    const fixture = harness(); fixture.assertAiCapabilityEnabled.mockRejectedValueOnce(new Error('permission denied'));
    await expect(fixture.run('test://', 'test', {}, { message: 'ثبت کن', capabilities: ['record_creation'] })).rejects.toThrow('permission denied');
  });
  it('uses the editable transcript in planning without sending the audio to a model again', async () => {
    const declarations = source.slice(source.indexOf('const transcribeTaskBundleVoices ='), source.indexOf('const buildAutoRouterHistoryText ='));
    const executable = ts.transpileModule(declarations + '\nreturn { transcribeTaskBundleVoices, buildTaskBundlePrompt };',
      { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
    const { transcribeTaskBundleVoices, buildTaskBundlePrompt } = new Function(executable)();
    const inputs = [{ id: 'voice-message', label: 'ویس', text: 'برای مشتری فاکتور ثبت کن', audio: { data: 'unused-audio' } }];
    const transcripts = await transcribeTaskBundleVoices('test://', 'test', {}, inputs);
    expect(transcripts).toEqual([{ inputId: 'voice-message', label: 'ویس', transcript: 'برای مشتری فاکتور ثبت کن', source: 'composer_transcript' }]);
    expect(buildTaskBundlePrompt({}, inputs, transcripts).match(/برای مشتری فاکتور ثبت کن/g)).toHaveLength(1);
  });
});
