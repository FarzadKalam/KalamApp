import React, { useEffect, useMemo, useRef } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, useReactFlow, ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  FLOW_ADD_TAIL_NODE_ID,
  FLOW_CONDITIONS_NODE_ID,
  FLOW_TRIGGER_NODE_ID,
  buildFlowGraph,
  parseActionNodeId,
} from './flowGraph';
import { ActionNode, AddTailNode, ConditionsNode, TriggerNode } from './flowNodes';
import { AddActionEdge } from './flowEdges';
import { FlowCallbacks, FlowDocument, FlowSelection } from './flowTypes';

const NODE_TYPES = {
  workflowTrigger: TriggerNode,
  workflowConditions: ConditionsNode,
  workflowAction: ActionNode,
  workflowAddTail: AddTailNode,
} as const;

const EDGE_TYPES = {
  workflowEdge: AddActionEdge,
} as const;

type WorkflowFlowCanvasProps = FlowCallbacks & {
  document: FlowDocument;
  selection: FlowSelection | null;
  readOnly?: boolean;
};

const WorkflowFlowCanvasInner: React.FC<WorkflowFlowCanvasProps> = ({
  document: flowDocument,
  selection,
  readOnly,
  onSelect,
  onAddAction,
  onMoveAction,
  onDeleteAction,
  onDuplicateAction,
}) => {
  const reactFlow = useReactFlow();
  const lastNodeCountRef = useRef(0);

  const { nodes, edges } = useMemo(() => {
    const graph = buildFlowGraph(flowDocument, selection);
    return {
      nodes: graph.nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          readOnly: !!readOnly,
          onMoveAction,
          onDeleteAction,
          onDuplicateAction,
        },
      })),
      edges: graph.edges.map((edge) => ({
        ...edge,
        data: {
          ...edge.data,
          readOnly: !!readOnly,
          onAddAction,
        },
      })),
    };
  }, [flowDocument, selection, readOnly, onAddAction, onMoveAction, onDeleteAction, onDuplicateAction]);

  useEffect(() => {
    if (nodes.length !== lastNodeCountRef.current) {
      lastNodeCountRef.current = nodes.length;
      window.requestAnimationFrame(() => {
        reactFlow.fitView({ padding: 0.2, duration: 240, maxZoom: 1 });
      });
    }
  }, [nodes.length, reactFlow]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      edgesFocusable={false}
      deleteKeyCode={null}
      panOnScroll
      zoomOnPinch
      minZoom={0.3}
      maxZoom={1.6}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      proOptions={{ hideAttribution: true }}
      onPaneClick={() => onSelect(null)}
      onNodeClick={(_event, node) => {
        const nodeId = String(node?.id || '');
        if (nodeId === FLOW_TRIGGER_NODE_ID) {
          onSelect({ kind: 'trigger' });
          return;
        }
        if (nodeId === FLOW_CONDITIONS_NODE_ID) {
          onSelect({ kind: 'conditions' });
          return;
        }
        if (nodeId === FLOW_ADD_TAIL_NODE_ID) {
          if (!readOnly) {
            onAddAction(Number((node?.data as any)?.insertIndex) || 0);
          }
          return;
        }
        const actionId = parseActionNodeId(nodeId);
        if (actionId) {
          onSelect({ kind: 'action', actionId });
        }
      }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="rgba(var(--brand-300-rgb), 0.45)" />
      <Controls showInteractive={false} position="bottom-right" />
    </ReactFlow>
  );
};

const WorkflowFlowCanvas: React.FC<WorkflowFlowCanvasProps> = (props) => (
  <div dir="ltr" className="h-full w-full">
    <ReactFlowProvider>
      <WorkflowFlowCanvasInner {...props} />
    </ReactFlowProvider>
  </div>
);

export default WorkflowFlowCanvas;
