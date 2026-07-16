import { describe, expect, it } from 'vitest';
import { getWorkflowActionContract, isWorkflowOutputVariableAllowed, WORKFLOW_ACTION_CONTRACTS } from './workflowActionContract';

describe('workflow action central contract', () => {
  it('defines every supported workflow action in one registry', () => {
    expect(Object.keys(WORKFLOW_ACTION_CONTRACTS)).toHaveLength(21);
    expect(getWorkflowActionContract('send_email').templateFields).toEqual(['subject', 'body']);
  });

  it('limits generated output variables to their parent action', () => {
    expect(isWorkflowOutputVariableAllowed('send_web_form_link', 'web_form_link')).toBe(true);
    expect(isWorkflowOutputVariableAllowed('send_sms', 'web_form_link')).toBe(false);
    expect(isWorkflowOutputVariableAllowed('run_ai_prompt', 'ai_answer')).toBe(true);
  });

  it('keeps all record mutation modes aligned', () => {
    for (const type of ['update_record', 'create_related_record', 'create_standalone_record']) {
      expect(getWorkflowActionContract(type).valueModes).toEqual(['static', 'from_source', 'from_related', 'formula']);
    }
  });
});
