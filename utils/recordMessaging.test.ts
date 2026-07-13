import { describe, expect, it } from 'vitest';
import {
  AI_READY_TEXT_SCOPE,
  GENERAL_MESSAGE_READY_TEXT_SCOPE,
  getMessageReadyTextScopeModuleId,
  getReadyTextScopeModuleId,
  WORKFLOW_AUTOMATION_READY_TEXT_SCOPE,
} from './recordMessaging';

describe('ready text scopes', () => {
  it('keeps form ready texts strictly inside their own module', () => {
    expect(getReadyTextScopeModuleId('customers', 'field')).toBe('customers');
    expect(getReadyTextScopeModuleId('employees', 'field')).toBe('employees');
    expect(getReadyTextScopeModuleId('suppliers', 'field')).toBe('suppliers');
  });

  it('separates module message scopes, including contact SMS messages', () => {
    expect(getMessageReadyTextScopeModuleId('customers')).toBe('__message__:customers');
    expect(getMessageReadyTextScopeModuleId('employees')).toBe('__message__:employees');
    expect(getMessageReadyTextScopeModuleId('suppliers')).toBe('__message__:suppliers');
    expect(getMessageReadyTextScopeModuleId(null)).toBe(GENERAL_MESSAGE_READY_TEXT_SCOPE);
  });

  it('uses one independent scope for all AI prompts', () => {
    expect(getMessageReadyTextScopeModuleId(null, 'ai')).toBe(AI_READY_TEXT_SCOPE);
    expect(getMessageReadyTextScopeModuleId('customers', 'ai')).toBe(AI_READY_TEXT_SCOPE);
  });

  it('uses one independent scope for every workflow and automation action', () => {
    expect(getMessageReadyTextScopeModuleId('customers', 'workflow_automation'))
      .toBe(WORKFLOW_AUTOMATION_READY_TEXT_SCOPE);
    expect(getMessageReadyTextScopeModuleId('invoices', 'workflow_automation'))
      .toBe(WORKFLOW_AUTOMATION_READY_TEXT_SCOPE);
  });

  it('does not collide AI, workflow, general, and module message categories', () => {
    const scopes = new Set([
      getMessageReadyTextScopeModuleId(null, 'ai'),
      getMessageReadyTextScopeModuleId(null, 'workflow_automation'),
      getMessageReadyTextScopeModuleId(null),
      getMessageReadyTextScopeModuleId('customers'),
    ]);

    expect(scopes.size).toBe(4);
  });
});
