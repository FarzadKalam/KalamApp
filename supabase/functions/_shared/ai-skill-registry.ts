import {
  normalizeSelectedAgents,
  type AgentKey,
} from './ai-agent-catalog.ts';
import type { CentralAiGrounding } from './ai-grounding.ts';
import { leadOrchestratorSkill } from './ai-skills/lead-orchestrator.ts';
import { salesLeadsSkill } from './ai-skills/sales-leads.ts';
import { purchaseSupplySkill } from './ai-skills/purchase-supply.ts';
import { customerResponseSkill } from './ai-skills/customer-response.ts';
import { hrManagerSkill } from './ai-skills/hr-manager.ts';
import { reservationSkill } from './ai-skills/reservation.ts';
import { projectProcessSkill } from './ai-skills/project-process.ts';
import { instagrammerSkill } from './ai-skills/instagrammer.ts';
import { systemGuideSkill } from './ai-skills/system-guide.ts';
import {
  pricingAdjustmentSkill,
  shouldAttachPricingAdjustmentSkill,
} from './ai-skills/pricing-adjustment.ts';
import type { DomainSkillModule, SkillExecutionContext } from './ai-skills/types.ts';

export const DOMAIN_SKILL_MAP: Record<AgentKey, DomainSkillModule> = {
  lead_orchestrator: leadOrchestratorSkill,
  sales_leads: salesLeadsSkill,
  purchase_supply: purchaseSupplySkill,
  customer_response: customerResponseSkill,
  hr_manager: hrManagerSkill,
  reservation: reservationSkill,
  project_process: projectProcessSkill,
  instagrammer: instagrammerSkill,
  system_guide: systemGuideSkill,
};

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

export const assembleMultiSkillContext = async (
  ctx: SkillExecutionContext,
): Promise<{
  skillContractsPrompt: string;
  domainContextByAgent: Record<string, any>;
  instagramMediaCards: any[];
  blockedAgents: Array<{ agentKey: AgentKey; reasonFa: string }>;
}> => {
  const { permittedAgents, blockedAgents } = resolveRunnableAgentsForActor({
    requestedAgents: ctx.selectedAgents,
    grounding: ctx.grounding,
  });

  // Always let lead_orchestrator assist with coordination when > 1 agents are selected and lead_orchestrator is permitted
  const orderedAgents: AgentKey[] = [...permittedAgents];
  if (
    orderedAgents.length > 1
    && !orderedAgents.includes('lead_orchestrator')
    && ctx.grounding.agentStates?.lead_orchestrator?.canUse
  ) {
    orderedAgents.unshift('lead_orchestrator');
  }

  const attachPricingAdjustment = shouldAttachPricingAdjustmentSkill(ctx);

  const skillContractsPrompt = [
    ...orderedAgents.map((key) => DOMAIN_SKILL_MAP[key]?.buildContractPrompt(ctx)),
    attachPricingAdjustment ? pricingAdjustmentSkill.buildContractPrompt(ctx) : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (ctx.grounding.freeChatMode || !orderedAgents.length) {
    return {
      skillContractsPrompt,
      domainContextByAgent: {},
      instagramMediaCards: [],
      blockedAgents,
    };
  }

  const [entries, pricingData] = await Promise.all([
    Promise.all(
      orderedAgents.map(async (agentKey) => {
        const skill = DOMAIN_SKILL_MAP[agentKey];
        if (!skill) return [agentKey, null] as const;
        try {
          const result = await skill.gatherDomainContext(ctx);
          return [agentKey, result] as const;
        } catch (err) {
          console.warn('domain skill gatherDomainContext failed', agentKey, err);
          return [agentKey, null] as const;
        }
      }),
    ),
    attachPricingAdjustment
      ? pricingAdjustmentSkill.gatherDomainContext(ctx).catch((err) => {
          console.warn('pricing adjustment skill gatherDomainContext failed', err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  const domainContextByAgent: Record<string, any> = {};
  let instagramMediaCards: any[] = [];
  for (const [agentKey, data] of entries) {
    if (data && Object.keys(data).length > 0) {
      domainContextByAgent[agentKey] = data;
      if (agentKey === 'instagrammer' && Array.isArray(data.media_cards)) {
        instagramMediaCards = data.media_cards;
      }
    }
  }
  if (pricingData && Object.keys(pricingData).length > 0) {
    domainContextByAgent.pricing_adjustment = pricingData;
  }

  return {
    skillContractsPrompt,
    domainContextByAgent,
    instagramMediaCards,
    blockedAgents,
  };
};
