import {
  getConditionsNodeSummaryFa,
  getWorkflowActionSummaryFa,
  getWorkflowActionTypeLabelFa,
} from '../../../utils/workflowActionSummary';
import { FlowDocument, FlowSelection } from './flowTypes';

export const FLOW_NODE_WIDTH = 320;
export const FLOW_GAP_Y = 168;

export const FLOW_TRIGGER_NODE_ID = 'trigger';
export const FLOW_CONDITIONS_NODE_ID = 'conditions';
export const FLOW_ADD_TAIL_NODE_ID = 'add-tail';
export const FLOW_ACTION_NODE_PREFIX = 'action:';

export type FlowGraphNode = {
  id: string;
  type: 'workflowTrigger' | 'workflowConditions' | 'workflowAction' | 'workflowAddTail';
  position: { x: number; y: number };
  data: Record<string, any>;
  draggable: boolean;
  connectable: boolean;
  selectable: boolean;
};

export type FlowGraphEdge = {
  id: string;
  source: string;
  target: string;
  type: 'workflowEdge';
  data: { insertIndex: number | null };
};

export const buildActionNodeId = (actionId: string) => `${FLOW_ACTION_NODE_PREFIX}${String(actionId || '')}`;

export const parseActionNodeId = (nodeId: string): string | null => {
  const normalized = String(nodeId || '');
  if (!normalized.startsWith(FLOW_ACTION_NODE_PREFIX)) return null;
  const actionId = normalized.slice(FLOW_ACTION_NODE_PREFIX.length);
  return actionId || null;
};

export const buildFlowGraph = (
  document: FlowDocument,
  selection: FlowSelection | null
): { nodes: FlowGraphNode[]; edges: FlowGraphEdge[] } => {
  const actions = Array.isArray(document?.actions) ? document.actions : [];
  const conditionsAll = Array.isArray(document?.conditionsAll) ? document.conditionsAll : [];
  const conditionsAny = Array.isArray(document?.conditionsAny) ? document.conditionsAny : [];

  const nodes: FlowGraphNode[] = [];
  const edges: FlowGraphEdge[] = [];
  const baseNodeProps = { draggable: false, connectable: false, selectable: false } as const;

  let rowIndex = 0;
  const nextPosition = () => ({ x: 0, y: rowIndex++ * FLOW_GAP_Y });

  nodes.push({
    id: FLOW_TRIGGER_NODE_ID,
    type: 'workflowTrigger',
    position: nextPosition(),
    data: {
      title: String(document?.triggerTitle || ''),
      summary: String(document?.triggerSummary || ''),
      isActive: document?.isActive !== false,
      isSelected: selection?.kind === 'trigger',
    },
    ...baseNodeProps,
  });

  nodes.push({
    id: FLOW_CONDITIONS_NODE_ID,
    type: 'workflowConditions',
    position: nextPosition(),
    data: {
      allCount: conditionsAll.length,
      anyCount: conditionsAny.length,
      summary: getConditionsNodeSummaryFa(conditionsAll.length, conditionsAny.length),
      isSelected: selection?.kind === 'conditions',
    },
    ...baseNodeProps,
  });

  edges.push({
    id: `${FLOW_TRIGGER_NODE_ID}->${FLOW_CONDITIONS_NODE_ID}`,
    source: FLOW_TRIGGER_NODE_ID,
    target: FLOW_CONDITIONS_NODE_ID,
    type: 'workflowEdge',
    data: { insertIndex: null },
  });

  let previousNodeId = FLOW_CONDITIONS_NODE_ID;

  actions.forEach((action, index) => {
    const nodeId = buildActionNodeId(String(action?.id || ''));
    nodes.push({
      id: nodeId,
      type: 'workflowAction',
      position: nextPosition(),
      data: {
        actionId: String(action?.id || ''),
        actionType: String(action?.type || ''),
        index,
        total: actions.length,
        label: getWorkflowActionTypeLabelFa(action?.type as any),
        summary: getWorkflowActionSummaryFa(action),
        isSelected: selection?.kind === 'action' && String(selection.actionId) === String(action?.id),
      },
      ...baseNodeProps,
    });
    edges.push({
      id: `${previousNodeId}->${nodeId}`,
      source: previousNodeId,
      target: nodeId,
      type: 'workflowEdge',
      data: { insertIndex: index },
    });
    previousNodeId = nodeId;
  });

  nodes.push({
    id: FLOW_ADD_TAIL_NODE_ID,
    type: 'workflowAddTail',
    position: nextPosition(),
    data: {
      insertIndex: actions.length,
      isEmpty: actions.length === 0,
    },
    ...baseNodeProps,
  });

  edges.push({
    id: `${previousNodeId}->${FLOW_ADD_TAIL_NODE_ID}`,
    source: previousNodeId,
    target: FLOW_ADD_TAIL_NODE_ID,
    type: 'workflowEdge',
    data: { insertIndex: null },
  });

  return { nodes, edges };
};
