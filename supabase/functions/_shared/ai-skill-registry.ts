import {
  normalizeSelectedAgents,
  type AgentKey,
} from './ai-agent-catalog.ts';
import type { CentralAiGrounding } from './ai-grounding.ts';
import { pricingAdjustmentSkill } from './ai-skills/pricing-adjustment.ts';
import { buildSystemGuideSoftwareArchitectureReference, systemGuideSkill } from './ai-skills/system-guide.ts';
import type { SkillExecutionContext } from './ai-skills/types.ts';
import { listAgentSkills } from './ai-skill-catalog.ts';

export const resolveRunnableAgentsForActor = (params: {
  requestedAgents: AgentKey[];
  grounding: CentralAiGrounding;
}): {
  permittedAgents: AgentKey[];
  blockedAgents: Array<{ agentKey: AgentKey; reasonFa: string }>;
} => {
  const requested = normalizeSelectedAgents(params.requestedAgents);
  const candidates: AgentKey[] = requested.length ? requested : ['lead_orchestrator'];
  const permittedAgents: AgentKey[] = [];
  const blockedAgents: Array<{ agentKey: AgentKey; reasonFa: string }> = [];

  for (const agentKey of candidates) {
    const state = params.grounding.agentStates?.[agentKey];
    if (!state) continue;
    if (state.canUse && state.canView && state.canChat) {
      permittedAgents.push(agentKey);
      continue;
    }
    const reasonFa = !state.orgEnabled
      ? `${state.definition.titleFa} توسط مدیر سازمان غیرفعال شده است.`
      : !state.planAllowed
      ? `${state.definition.titleFa} در پلن اشتراک فعلی سازمان فعال نیست.`
      : !state.canView
      ? `نقش شما مجوز مشاهده ${state.definition.titleFa} را ندارد.`
      : !state.canChat
      ? `نقش شما مجوز گفتگو با ${state.definition.titleFa} را ندارد.`
      : !state.rbacAllowed
      ? `نقش شما دسترسی لازم به ماژول‌های ${state.definition.titleFa} را ندارد.`
      : `دسترسی استفاده از ${state.definition.titleFa} برای حساب شما محدود شده است.`;
    blockedAgents.push({ agentKey, reasonFa });
  }

  return { permittedAgents, blockedAgents };
};

export const createAgentSkillRuntime = (ctx: SkillExecutionContext) => {
  if (ctx.grounding.freeChatMode || !ctx.selectedAgents.length) return null;
  const { permittedAgents } = resolveRunnableAgentsForActor({
    requestedAgents: ctx.selectedAgents,
    grounding: ctx.grounding,
  });

  const orderedAgents: AgentKey[] = [...permittedAgents];
  if (
    orderedAgents.length > 1
    && !orderedAgents.includes('lead_orchestrator')
    && ctx.grounding.agentStates?.lead_orchestrator?.canUse
    && ctx.grounding.agentStates.lead_orchestrator.canView
    && ctx.grounding.agentStates.lead_orchestrator.canChat
  ) {
    orderedAgents.unshift('lead_orchestrator');
  }

  const findSkillSettings = (key: AgentKey) =>
    ctx.grounding.agentConfigs.find(config => config.agent_key === key)?.policy_json?.skill_settings;
  const skillEntries = orderedAgents.flatMap(agentKey => listAgentSkills(agentKey, findSkillSettings(agentKey))
    .map(skill => ({ ...skill, agentKey, key: `${agentKey}:${skill.id}` })));
  const purchase = ctx.grounding.agentStates?.purchase_supply;
  if (orderedAgents.includes('lead_orchestrator') && !orderedAgents.includes('purchase_supply')
    && purchase?.canUse && purchase.canView && purchase.canChat) {
    const pricing = listAgentSkills('purchase_supply', findSkillSettings('purchase_supply')).find(skill => skill.id === 'price_update');
    if (pricing) skillEntries.push({ ...pricing, agentKey: 'purchase_supply', key: 'purchase_supply:price_update' });
  }
  const allowed = new Map(skillEntries.filter(entry => entry.enabled).map(entry => [entry.key, entry]));
  if (!allowed.size) return null;
  const instructions = 'برای کار تخصصی در صورت نیاز از فهرست، مهارت را با read_agent_skills انتخاب کن. تصمیم را از معنا، فایل و زمینهٔ گفتگو بگیر. نمونه‌ها شرط فعال‌سازی نیستند. برای گفتگوی ساده به ابزار مهارت نیاز نیست. مجوز و تأیید عملیات همیشه با سرور است.';
  const catalog = [...allowed.values()].map(entry => `${entry.key} | ${entry.title}${
    entry.triggers.length ? ` | نمونه: ${entry.triggers.slice(0, 2).map(example => example.slice(0, 40)).join('، ')}` : ''
  }`).join('\n');
  type SkillResult = { id: string; title: string; instructions: string; details?: unknown };
  const loaded = new Map<string, Promise<SkillResult>>();
  const load = async (id: string): Promise<SkillResult> => {
    const entry = allowed.get(id)!;
    let details: unknown;
    if (id === 'purchase_supply:price_update') details = pricingAdjustmentSkill.buildContractPrompt(ctx);
    if (id === 'system_guide:page_guide') {
      const reference = buildSystemGuideSoftwareArchitectureReference();
      const moduleId = String(ctx.pageContext?.moduleId || '');
      details = moduleId ? reference.split('\n').filter(line => line.includes('`' + moduleId + '`')).join('\n') || reference : reference;
    }
    if (id === 'system_guide:official_tutorial') {
      details = await systemGuideSkill.gatherDomainContext(ctx).catch(() => ({ unavailable: true }));
    }
    if (id === 'reservation:availability') {
      details = { reservationSettings: ctx.grounding.reservationSettings, timezone: 'Asia/Tehran' };
    }
    return { id, title: entry.title, instructions: entry.instructions, ...(details ? { details } : {}) };
  };
  return {
    systemMessage: `${instructions}\n${catalog}`,
    getSkillOwner: (id: string) => allowed.get(id)?.agentKey,
    tool: { type: 'function', function: { name: 'read_agent_skills',
      description: 'خواندن دستور کامل مهارت‌های مرتبط از فهرست مجاز؛ انتخاب با مدل است.',
      parameters: { type: 'object', properties: {
        skillIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string' } },
      }, required: ['skillIds'], additionalProperties: false },
    } },
    execute: async (args: { skillIds?: unknown }) => {
      const ids = args?.skillIds;
      if (!Array.isArray(ids) || !ids.length || ids.length > 3 || ids.some(id => typeof id !== 'string' || !allowed.has(id))) {
        return { success: false, message: 'مهارت را از فهرست مجاز همین درخواست انتخاب کن.' };
      }
      const unique = [...new Set(ids as string[])];
      const fresh = unique.filter(id => !loaded.has(id));
      if (fresh.length + loaded.size > 5) return { success: false, message: 'از دستور مهارت‌های خوانده‌شده استفاده کن.' };
      for (const id of fresh) loaded.set(id, load(id));
      return { success: true, skills: await Promise.all(unique.map(id => loaded.get(id)!)) };
    },
  };
};
