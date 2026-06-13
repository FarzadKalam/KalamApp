import { WorkflowAction, WorkflowCondition } from '../../../utils/workflowTypes';

export type FlowSelection =
  | { kind: 'trigger' }
  | { kind: 'conditions' }
  | { kind: 'action'; actionId: string };

export type FlowDocument = {
  triggerTitle: string;
  triggerSummary: string;
  isActive: boolean;
  conditionsAll: WorkflowCondition[];
  conditionsAny: WorkflowCondition[];
  actions: WorkflowAction[];
};

export type FlowCallbacks = {
  onSelect: (selection: FlowSelection | null) => void;
  onAddAction: (insertIndex: number) => void;
  onMoveAction: (actionId: string, direction: -1 | 1) => void;
  onDeleteAction: (actionId: string) => void;
  onDuplicateAction: (actionId: string) => void;
};
