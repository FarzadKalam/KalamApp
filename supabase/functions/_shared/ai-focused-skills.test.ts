// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { AI_AGENT_CATALOG, type AgentKey } from './ai-agent-catalog';
import { createAgentSkillRuntime } from './ai-skill-registry';
import { buildActorWorkIdentity, createActorWorkContext } from './ai-actor-work-context';
import { compileLayeredAgentPrompt } from './ai-prompt-compiler';
import type { AgentDataAccess } from './ai-agent-data';
import type { SkillExecutionContext } from './ai-skills/types';

const orgId = '40000000-0000-4000-8000-000000000001';
const userId = '40000000-0000-4000-8000-000000000002';
const roleId = '40000000-0000-4000-8000-000000000003';
const employeeId = '40000000-0000-4000-8000-000000000004';
const contractId = '40000000-0000-4000-8000-000000000005';

const allowedAgent = { canUse: true, canChat: true, canView: true };
const skillContext = (selectedAgents: AgentKey[], overrides: object = {}) => ({
  userMessage: 'همون کار قبلی رو ادامه بده',
  selectedAgents,
  grounding: { agentStates: Object.fromEntries(selectedAgents.map(key => [key, allowedAgent])), agentConfigs: [], ...overrides },
}) as unknown as SkillExecutionContext;

describe('model-selected agent skills', () => {
  it('offers short metadata for all agents before reading any instructions', () => {
    for (const { key } of AI_AGENT_CATALOG) {
      const runtime = createAgentSkillRuntime(skillContext([key]));
      expect(runtime?.tool.function.name).toBe('read_agent_skills');
      expect(runtime?.systemMessage).toContain(key + ':');
    }
    expect(createAgentSkillRuntime(skillContext(['sales_leads'], { freeChatMode: true }))).toBeNull();
  });

  it('loads several skills the model requests for a follow-up without matching words', async () => {
    const ctx = skillContext(['project_process']);
    const runtime = createAgentSkillRuntime(ctx)!;
    const skillIds = ['project_process:template', 'project_process:automation', 'project_process:run_status'];
    expect(runtime.systemMessage).not.toContain('تمام صفحه‌های مراحل مرتبط');
    const result = await runtime.execute({ skillIds });
    expect(result.success).toBe(true);
    expect(result.skills?.map(row => row.id)).toEqual(skillIds);
    expect(result.skills?.[0].instructions).toContain('تمام صفحه‌های مراحل مرتبط');
    expect(await runtime.execute({ skillIds })).toEqual(result);
  });

  it('keeps custom instructions lazy and enforces agent authorization and disabled settings', async () => {
    const ctx = skillContext(['sales_leads'], { agentConfigs: [
      { agent_key: 'sales_leads', policy_json: { skill_settings: [
        { id: 'sales_invoice', enabled: false },
        { id: 'custom_private', title: 'مهارت مخصوص', instructions: 'دستور اختصاصی سازمان', triggers: ['درخواست اختصاصی'] },
      ] } },
    ] });
    const runtime = createAgentSkillRuntime(ctx)!;
    expect(runtime.systemMessage).toContain('درخواست اختصاصی');
    expect(runtime.systemMessage).not.toContain('دستور اختصاصی سازمان');
    expect(runtime.systemMessage).not.toContain('sales_leads:sales_invoice');
    await expect(runtime.execute({ skillIds: ['sales_leads:sales_invoice'] })).resolves.toMatchObject({ success: false });
    await expect(runtime.execute({ skillIds: ['hr_manager:payroll'] })).resolves.toMatchObject({ success: false });
    await expect(runtime.execute({ skillIds: ['sales_leads:custom_private'] })).resolves.toMatchObject({
      success: true, skills: [{ instructions: 'دستور اختصاصی سازمان' }],
    });
  });

  it('exposes the price update to the role assistant only if the purchase agent is authorized', () => {
    const ctx = skillContext(['lead_orchestrator'], { agentStates: { lead_orchestrator: allowedAgent, purchase_supply: allowedAgent } });
    expect(createAgentSkillRuntime(ctx)?.systemMessage).toContain('purchase_supply:price_update');
    expect(createAgentSkillRuntime(skillContext(['lead_orchestrator']))?.systemMessage).not.toContain('purchase_supply:price_update');
  });

  it('keeps organization skill instructions out of the fixed prompt and attaches the actor role', async () => {
    const compiled = await compileLayeredAgentPrompt({
      userMessage: 'ثبت فاکتور', selectedAgents: ['sales_leads'], selectedCapabilities: [],
      grounding: {
        orgDirectory: { roles: [], members: [] },
        agentStates: { sales_leads: { canUse: true, config: { policy_json: {
          skill_settings: [{ instructions: 'مهارت نامرتبط و خارج از زمینه' }],
        } } } },
        actorWorkIdentity: buildActorWorkIdentity({ role: { title: 'مدیر فروش' } }),
      } as unknown as SkillExecutionContext['grounding'],
      contextPayload: {}, historyMessages: [],
    });
    expect(compiled.staticSystemPrefix).not.toContain('مهارت نامرتبط');
    expect(compiled.volatileUserBlock).not.toContain('مهارت نامرتبط');
    expect(compiled.volatileUserBlock).toContain('دستیار مدیر فروش');
  });

  it('keeps changing role, page and tool guidance after the exact stable prefix', async () => {
    const makePrompt = (term: string) => compileLayeredAgentPrompt({
      selectedAgents: ['sales_leads'], userMessage: term, selectedCapabilities: [term],
      grounding: {
        company: { company_name: term },
        orgDirectory: { roles: [], members: [] },
        agentStates: { sales_leads: { canUse: true, config: { policy_json: { custom_instructions: term } } } },
        actorWorkIdentity: buildActorWorkIdentity({ role: { title: term } }),
      } as unknown as SkillExecutionContext['grounding'],
      pageContextSummary: term, contextPayload: { retrieval: term }, historyMessages: [],
      currentSystemInstruction: 'مهارت‌های مجاز و ابزارهای این نوبت ' + term, legacySystemPrompt: term,
    });
    const first = await makePrompt('زمینهٔ شیفت اول');
    const second = await makePrompt('زمینهٔ شیفت دوم');
    expect(first.cachedPrefixHash).toBe(second.cachedPrefixHash);
    expect(first.messages[0]).toEqual(second.messages[0]);
    expect(second.messages[0].content).not.toContain('زمینهٔ شیفت');
    expect(second.messages[1]).toMatchObject({ role: 'system', content: expect.stringContaining('مهارت‌های مجاز و ابزارهای این نوبت زمینهٔ شیفت دوم') });
    expect(second.messages.at(-1)?.content).toContain('زمینهٔ شیفت دوم');
  });
});

describe('the current member’s work context', () => {
  const moduleWith = (id: string, keys: string[]): AgentDataAccess['modules'][number] => ({
    id, table: id, label: id, recordScope: 'all', fields: keys.map(key => ({ key, label: key, type: 'text' })),
  });
  const access: AgentDataAccess = { orgId, userId, roleId, allowedRoleIds: [], allowedUserIds: [userId], modules: [
    moduleWith('employees', ['full_name', 'related_profile_id', 'job_description_id']),
    moduleWith('employee_contracts', ['employee_id', 'name']),
  ] };

  it('derives a clean assistant title from the current role', () => {
    expect(buildActorWorkIdentity({ role: { title: 'مدیر فروش' }, rolePath: [{ title: 'مدیر' }, { title: userId }] }))
      .toMatchObject({ assistantTitle: 'دستیار مدیر فروش', rolePath: ['مدیر'] });
    expect(buildActorWorkIdentity({ softwareRole: 'admin' }).assistantTitle).toBe('دستیار مدیر');
  });

  it('reads only the linked employee and allowed contract fields in the active org', async () => {
    const read = vi.fn(async (table: string, _params: Record<string, string | number>) => table === 'employees'
      ? [{ id: employeeId, full_name: 'همکار' }] : [{ id: contractId, name: 'قرارداد ۱۴۰۵', body: 'محرمانه' }]);
    const run = createActorWorkContext({ access, read, roleId, fieldAllowed: () => true, canReadGoal: () => false,
      moduleActions: () => ({ create: false, edit: false, delete: false }) });
    const result = await run({ section: 'contracts' });
    expect(read.mock.calls[0][1]).toMatchObject({ org_id: `eq.${orgId}` });
    expect(read.mock.calls[0][1].and).toContain(userId);
    expect(read.mock.calls[1][1].and).toContain(employeeId);
    expect(JSON.stringify(result)).toContain('قرارداد ۱۴۰۵');
    expect(JSON.stringify(result)).not.toContain('محرمانه');
    expect(await run({ section: 'goals' })).toEqual({ available: false });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
