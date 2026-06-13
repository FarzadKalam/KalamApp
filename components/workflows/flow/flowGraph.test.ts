import { describe, expect, it } from 'vitest';
import {
  FLOW_ADD_TAIL_NODE_ID,
  FLOW_CONDITIONS_NODE_ID,
  FLOW_TRIGGER_NODE_ID,
  buildActionNodeId,
  buildFlowGraph,
  parseActionNodeId,
} from './flowGraph';
import { FlowDocument } from './flowTypes';

const buildDocument = (overrides: Partial<FlowDocument> = {}): FlowDocument => ({
  triggerTitle: 'وقتی رکورد جدید ایجاد شد',
  triggerSummary: 'وقتی رکورد جدید ایجاد شد',
  isActive: true,
  conditionsAll: [],
  conditionsAny: [],
  actions: [],
  ...overrides,
});

describe('buildFlowGraph', () => {
  it('بدون اقدام: تریگر → شرط‌ها → نود افزودن', () => {
    const { nodes, edges } = buildFlowGraph(buildDocument(), null);

    expect(nodes.map((node) => node.id)).toEqual([
      FLOW_TRIGGER_NODE_ID,
      FLOW_CONDITIONS_NODE_ID,
      FLOW_ADD_TAIL_NODE_ID,
    ]);
    expect(edges).toHaveLength(2);
    expect(edges[0]).toMatchObject({
      source: FLOW_TRIGGER_NODE_ID,
      target: FLOW_CONDITIONS_NODE_ID,
      data: { insertIndex: null },
    });
    expect(edges[1]).toMatchObject({
      source: FLOW_CONDITIONS_NODE_ID,
      target: FLOW_ADD_TAIL_NODE_ID,
      data: { insertIndex: null },
    });
    const tail = nodes.find((node) => node.id === FLOW_ADD_TAIL_NODE_ID);
    expect(tail?.data?.isEmpty).toBe(true);
    expect(tail?.data?.insertIndex).toBe(0);
  });

  it('بدون شرط: خلاصه «همیشه اجرا می‌شود» نمایش داده می‌شود', () => {
    const { nodes } = buildFlowGraph(buildDocument(), null);
    const conditionsNode = nodes.find((node) => node.id === FLOW_CONDITIONS_NODE_ID);
    expect(conditionsNode?.data?.summary).toContain('بدون شرط');
  });

  it('اقدام‌ها به ترتیب با insertIndex درست زنجیر می‌شوند', () => {
    const document = buildDocument({
      conditionsAll: [{ id: 'c1', field: 'amount', operator: 'gt', value: 10 }],
      actions: [
        { id: 'a1', type: 'send_sms', config: {} },
        { id: 'a2', type: 'send_note', config: {} },
        { id: 'a3', type: 'publish_story', config: {} },
      ],
    });
    const { nodes, edges } = buildFlowGraph(document, null);

    expect(nodes.map((node) => node.id)).toEqual([
      FLOW_TRIGGER_NODE_ID,
      FLOW_CONDITIONS_NODE_ID,
      buildActionNodeId('a1'),
      buildActionNodeId('a2'),
      buildActionNodeId('a3'),
      FLOW_ADD_TAIL_NODE_ID,
    ]);

    const insertIndexes = edges.map((edge) => edge.data.insertIndex);
    expect(insertIndexes).toEqual([null, 0, 1, 2, null]);

    const positions = nodes.map((node) => node.position.y);
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);

    const tail = nodes.find((node) => node.id === FLOW_ADD_TAIL_NODE_ID);
    expect(tail?.data?.insertIndex).toBe(3);
  });

  it('انتخاب فعلی روی نود مربوطه علامت می‌خورد', () => {
    const document = buildDocument({
      actions: [{ id: 'a1', type: 'send_sms', config: {} }],
    });
    const { nodes } = buildFlowGraph(document, { kind: 'action', actionId: 'a1' });
    const actionNode = nodes.find((node) => node.id === buildActionNodeId('a1'));
    const triggerNode = nodes.find((node) => node.id === FLOW_TRIGGER_NODE_ID);
    expect(actionNode?.data?.isSelected).toBe(true);
    expect(triggerNode?.data?.isSelected).toBe(false);
  });

  it('شمارنده شرط‌ها در نود شرط درج می‌شود', () => {
    const document = buildDocument({
      conditionsAll: [
        { id: 'c1', field: 'a', operator: 'eq', value: 1 },
        { id: 'c2', field: 'b', operator: 'eq', value: 2 },
      ],
      conditionsAny: [{ id: 'c3', field: 'c', operator: 'eq', value: 3 }],
    });
    const { nodes } = buildFlowGraph(document, null);
    const conditionsNode = nodes.find((node) => node.id === FLOW_CONDITIONS_NODE_ID);
    expect(conditionsNode?.data?.allCount).toBe(2);
    expect(conditionsNode?.data?.anyCount).toBe(1);
  });
});

describe('parseActionNodeId', () => {
  it('شناسه اقدام را از شناسه نود برمی‌گرداند', () => {
    expect(parseActionNodeId(buildActionNodeId('abc'))).toBe('abc');
    expect(parseActionNodeId('trigger')).toBeNull();
    expect(parseActionNodeId('action:')).toBeNull();
  });
});
