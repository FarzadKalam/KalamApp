export type AgentExecutionPolicy = 'interactive_chat' | 'customer_auto_reply' | 'workflow_automation';

export type AgentPlanStep = {
  id: string;
  operator: string;
  status_message: string;
  reason?: string;
  requires_confirmation: boolean;
};

export type AgentPlan = {
  policy: AgentExecutionPolicy;
  capabilities: string[];
  target_module_id: string | null;
  mutation_mode: 'create' | 'update';
  confidence: 'low' | 'medium' | 'high';
  risk: 'low' | 'medium' | 'high';
  reason: string;
  clarification_questions: string[];
  steps: AgentPlanStep[];
};

const CONFIRMATION_REQUIRED_OPERATORS = new Set([
  'record_creation',
  'process_operation',
  'image_generation',
  'video_generation',
  'document_generation',
  'voice_output',
]);

const CUSTOMER_AUTO_REPLY_FORBIDDEN_OPERATORS = new Set([
  'record_creation',
  'process_operation',
  'image_generation',
  'video_generation',
  'document_generation',
  'voice_output',
]);

const asText = (value: unknown, max = 240) => String(value ?? '').trim().slice(0, max);

const toRisk = (value: unknown): AgentPlan['risk'] =>
  ['low', 'medium', 'high'].includes(String(value)) ? String(value) as AgentPlan['risk'] : 'medium';

const toConfidence = (value: unknown): AgentPlan['confidence'] =>
  ['low', 'medium', 'high'].includes(String(value)) ? String(value) as AgentPlan['confidence'] : 'low';

export const normalizeAgentPlan = (input: any, options: {
  policy: AgentExecutionPolicy;
  allowedCapabilities: string[];
  isKnownModule: (moduleId: string) => boolean;
}): AgentPlan => {
  const allowed = new Set(options.allowedCapabilities.map((item) => String(item || '').trim()).filter(Boolean));
  const requestedCapabilities = Array.isArray(input?.capabilities) ? input.capabilities : [];
  const capabilities = Array.from(new Set(requestedCapabilities
    .map((item: unknown) => asText(item, 80))
    .filter((item: string) => allowed.has(item))
    .filter((item: string) => options.policy !== 'customer_auto_reply' || !CUSTOMER_AUTO_REPLY_FORBIDDEN_OPERATORS.has(item))));
  const rawModuleId = asText(input?.target_module_id, 120);
  const targetModuleId = rawModuleId && options.isKnownModule(rawModuleId) ? rawModuleId : null;
  const mutationMode = String(input?.mutation_mode) === 'update' ? 'update' : 'create';
  const rawSteps = Array.isArray(input?.steps) ? input.steps : [];
  const clarificationQuestions = Array.isArray(input?.clarification_questions)
    ? input.clarification_questions.map((item: unknown) => asText(item, 220)).filter(Boolean).slice(0, 3)
    : [];
  const steps = rawSteps.slice(0, 8).map((step: any, index: number) => {
    const operator = asText(step?.operator, 80);
    const usableOperator = capabilities.includes(operator) ? operator : capabilities[index] || '';
    return {
      id: asText(step?.id, 80) || `step_${index + 1}`,
      operator: usableOperator,
      status_message: asText(step?.status_message, 180) || 'در حال آماده‌سازی اطلاعات لازم…',
      reason: asText(step?.reason, 320) || undefined,
      requires_confirmation: options.policy === 'interactive_chat' && CONFIRMATION_REQUIRED_OPERATORS.has(usableOperator),
    };
  }).filter((step: AgentPlanStep) => Boolean(step.operator));

  return {
    policy: options.policy,
    capabilities,
    target_module_id: targetModuleId,
    mutation_mode: mutationMode,
    confidence: toConfidence(input?.confidence),
    risk: toRisk(input?.risk),
    reason: asText(input?.reason, 600) || 'تصمیم‌گیری عامل بر اساس درخواست و context مجاز انجام شد.',
    clarification_questions: clarificationQuestions,
    steps: steps.length ? steps : capabilities.map((operator, index) => ({
      id: `step_${index + 1}`,
      operator,
      status_message: 'در حال آماده‌سازی عملیات…',
      requires_confirmation: options.policy === 'interactive_chat' && CONFIRMATION_REQUIRED_OPERATORS.has(operator),
    })),
  };
};

export const shouldEscalateCustomerAutoReply = (plan: Pick<AgentPlan, 'risk' | 'confidence' | 'capabilities'>) =>
  plan.risk !== 'low'
  || plan.confidence === 'low'
  || plan.capabilities.some((operator) => CUSTOMER_AUTO_REPLY_FORBIDDEN_OPERATORS.has(operator));
