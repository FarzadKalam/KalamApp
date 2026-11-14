import { describe, expect, it } from 'vitest';
import { normalizeAgentPlan, shouldEscalateCustomerAutoReply } from './ai-agent-contract';

describe('AI agent plan contract', () => {
  it('routes scheduling to its own approval and never creates a normal task record instead', () => {
    const plan = normalizeAgentPlan({ capabilities: ['agent_task','record_creation','process_operation'], confidence: 'high' }, {
      policy: 'interactive_chat', allowedCapabilities: ['agent_task','record_creation','process_operation'], isKnownModule: () => true,
    });
    expect(plan.capabilities).toEqual(['agent_task']); expect(plan.steps[0].requires_confirmation).toBe(true);
    expect(normalizeAgentPlan({ capabilities: ['agent_task'] }, { policy: 'customer_auto_reply', allowedCapabilities: ['agent_task'], isKnownModule: () => true }).capabilities).toEqual([]);
  });
  it('accepts only enabled capabilities and registered modules', () => {
    const plan = normalizeAgentPlan({
      capabilities: ['record_creation', 'unknown_operator'],
      target_module_id: 'expense_documents',
      clarification_questions: ['تاریخ هزینه چیست؟'],
      steps: [{ id: 'draft', operator: 'unknown_operator', status_message: 'نباید پذیرفته شود' }],
    }, {
      policy: 'interactive_chat',
      allowedCapabilities: ['record_creation'],
      isKnownModule: (moduleId) => moduleId === 'expense_documents',
    });

    expect(plan.capabilities).toEqual(['record_creation']);
    expect(plan.target_module_id).toBe('expense_documents');
    expect(plan.clarification_questions).toEqual(['تاریخ هزینه چیست؟']);
    expect(plan.steps[0]?.operator).toBe('record_creation');
    expect(plan.steps[0]?.requires_confirmation).toBe(true);
  });

  it('fails customer auto-reply closed when the plan is not explicitly low risk', () => {
    const plan = normalizeAgentPlan({
      capabilities: ['record_creation'],
      confidence: 'high',
      risk: 'low',
    }, {
      policy: 'customer_auto_reply',
      allowedCapabilities: ['record_creation'],
      isKnownModule: () => true,
    });

    expect(plan.capabilities).toEqual([]);
    expect(shouldEscalateCustomerAutoReply(plan)).toBe(false);
    expect(shouldEscalateCustomerAutoReply({ ...plan, risk: 'medium' })).toBe(true);
  });
});
