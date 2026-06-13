import {
  PROCESS_AUTOMATION_TRIGGER_LABELS,
  ProcessAutomationRule,
  filterEditableAutomationConditions,
} from '../../../utils/processAutomationTypes';
import {
  WorkflowTriggerSummaryInput,
  getWorkflowTriggerLabelFa,
  getWorkflowTriggerSummaryFa,
} from '../../../utils/workflowActionSummary';
import { WorkflowAction, WorkflowCondition } from '../../../utils/workflowTypes';
import { FlowDocument } from './flowTypes';

export type WorkflowFlowDocumentInput = WorkflowTriggerSummaryInput & {
  is_active?: boolean | null;
  conditionsAll: WorkflowCondition[];
  conditionsAny: WorkflowCondition[];
  actions: WorkflowAction[];
};

export const buildWorkflowFlowDocument = (input: WorkflowFlowDocumentInput): FlowDocument => ({
  triggerTitle: getWorkflowTriggerLabelFa(input?.trigger_type),
  triggerSummary: getWorkflowTriggerSummaryFa(input),
  isActive: input?.is_active !== false,
  conditionsAll: Array.isArray(input?.conditionsAll) ? input.conditionsAll : [],
  conditionsAny: Array.isArray(input?.conditionsAny) ? input.conditionsAny : [],
  actions: Array.isArray(input?.actions) ? input.actions : [],
});

export const processRuleToFlowDocument = (rule: ProcessAutomationRule | null | undefined): FlowDocument => {
  const triggerType = String(rule?.trigger_type || 'on_upsert');
  const triggerTitle =
    (PROCESS_AUTOMATION_TRIGGER_LABELS as Record<string, string>)[triggerType] || 'اجرای نامشخص';
  const triggerSummary = triggerType === 'interval'
    ? getWorkflowTriggerSummaryFa({
        trigger_type: 'interval',
        interval_value: rule?.interval_value ?? null,
        interval_unit: rule?.interval_unit ?? null,
        interval_at: rule?.interval_at ?? null,
      })
    : triggerTitle;

  return {
    triggerTitle,
    triggerSummary,
    isActive: rule?.is_active !== false,
    conditionsAll: filterEditableAutomationConditions(rule?.conditions_all),
    conditionsAny: filterEditableAutomationConditions(rule?.conditions_any),
    actions: Array.isArray(rule?.actions) ? (rule?.actions as WorkflowAction[]) : [],
  };
};
