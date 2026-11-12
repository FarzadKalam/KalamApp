import type { AgentKey } from '../ai-agent-catalog.ts';
import type { CentralAiGrounding } from '../ai-grounding.ts';

export type SkillExecutionContext = {
  supabaseUrl: string;
  serviceRoleKey: string;
  authContext: any;
  grounding: CentralAiGrounding;
  userMessage: string;
  selectedAgents: AgentKey[];
  selectedCapabilities: string[];
  pageContext?: any;
};

export type DomainSkillModule = {
  agentKey: AgentKey;
  titleFa: string;
  buildContractPrompt: (ctx: SkillExecutionContext) => string;
  gatherDomainContext: (ctx: SkillExecutionContext) => Promise<Record<string, any> | null>;
};
