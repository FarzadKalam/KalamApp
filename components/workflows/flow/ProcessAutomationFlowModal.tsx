import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from 'antd';
import {
  ProcessAutomationRule,
  extractRuleNoteTextFromActions,
} from '../../../utils/processAutomationTypes';
import { getWorkflowActionTypeLabelFa } from '../../../utils/workflowActionSummary';
import { WorkflowAction, createWorkflowId } from '../../../utils/workflowTypes';
import { getDefaultActionConfig } from '../WorkflowActionsBuilder';
import ProcessAutomationRuleInspector, {
  ProcessAutomationRuleInspectorContext,
} from './ProcessAutomationRuleInspector';
import WorkflowFlowSurface from './WorkflowFlowSurface';
import { processRuleToFlowDocument } from './flowAdapters';
import { FlowSelection } from './flowTypes';

type ProcessAutomationFlowModalProps = {
  open: boolean;
  onClose: () => void;
  rule: ProcessAutomationRule | null;
  onPatch: (patch: Partial<ProcessAutomationRule>) => void;
  context: ProcessAutomationRuleInspectorContext;
  disabled?: boolean;
  zIndex?: number;
};

const ProcessAutomationFlowModal: React.FC<ProcessAutomationFlowModalProps> = ({
  open,
  onClose,
  rule,
  onPatch,
  context,
  disabled = false,
  zIndex = 16100,
}) => {
  const [selection, setSelection] = useState<FlowSelection | null>(null);

  useEffect(() => {
    if (!open) setSelection(null);
  }, [open]);

  const flowDocument = useMemo(() => processRuleToFlowDocument(rule), [rule]);
  const ruleActions: WorkflowAction[] = useMemo(
    () => (Array.isArray(rule?.actions) ? (rule?.actions as WorkflowAction[]) : []),
    [rule]
  );

  const applyActionsPatch = useCallback((next: WorkflowAction[]) => {
    onPatch({
      actions: next,
      note_text: extractRuleNoteTextFromActions(next),
    });
  }, [onPatch]);

  const handleAddAction = useCallback((insertIndex: number) => {
    if (disabled) return;
    const newAction: WorkflowAction = {
      id: createWorkflowId(),
      type: 'send_note',
      config: getDefaultActionConfig('send_note'),
    };
    const next = [...ruleActions];
    const boundedIndex = Math.max(0, Math.min(insertIndex, next.length));
    next.splice(boundedIndex, 0, newAction);
    applyActionsPatch(next);
    setSelection({ kind: 'action', actionId: newAction.id });
  }, [disabled, ruleActions, applyActionsPatch]);

  const handleMoveAction = useCallback((actionId: string, direction: -1 | 1) => {
    const fromIndex = ruleActions.findIndex((item) => String(item.id) === String(actionId));
    const toIndex = fromIndex + direction;
    if (fromIndex < 0 || toIndex < 0 || toIndex >= ruleActions.length) return;
    const next = [...ruleActions];
    const temp = next[fromIndex];
    next[fromIndex] = next[toIndex];
    next[toIndex] = temp;
    applyActionsPatch(next);
  }, [ruleActions, applyActionsPatch]);

  const handleDeleteAction = useCallback((actionId: string) => {
    applyActionsPatch(ruleActions.filter((item) => String(item.id) !== String(actionId)));
    setSelection((prev) => (
      prev?.kind === 'action' && String(prev.actionId) === String(actionId) ? null : prev
    ));
  }, [ruleActions, applyActionsPatch]);

  const handleDuplicateAction = useCallback((actionId: string) => {
    const sourceIndex = ruleActions.findIndex((item) => String(item.id) === String(actionId));
    if (sourceIndex < 0) return;
    const source = ruleActions[sourceIndex];
    const cloned: WorkflowAction = {
      id: createWorkflowId(),
      type: source.type,
      config: JSON.parse(JSON.stringify(source.config || {})),
    };
    const next = [...ruleActions];
    next.splice(sourceIndex + 1, 0, cloned);
    applyActionsPatch(next);
    setSelection({ kind: 'action', actionId: cloned.id });
  }, [ruleActions, applyActionsPatch]);

  const inspectorTitle = useCallback((currentSelection: FlowSelection): string => {
    if (currentSelection.kind === 'trigger') return 'مشخصات و شرایط اجرا';
    if (currentSelection.kind === 'conditions') return 'شرط‌ها';
    const action = ruleActions.find((item) => String(item.id) === String(currentSelection.actionId));
    return action ? getWorkflowActionTypeLabelFa(action.type) : 'تنظیمات اقدام';
  }, [ruleActions]);

  const renderInspector = useCallback((currentSelection: FlowSelection): React.ReactNode => {
    if (!rule) return null;
    return (
      <ProcessAutomationRuleInspector
        rule={rule}
        selection={currentSelection}
        onPatch={onPatch}
        context={context}
        disabled={disabled}
      />
    );
  }, [rule, onPatch, context, disabled]);

  const ruleName = String(rule?.name || '').trim() || 'اتوماسیون بدون نام';

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={`نمای دیاگرام — ${ruleName}`}
      width="100vw"
      style={{ top: 0, maxWidth: '100vw', margin: 0, paddingBottom: 0 }}
      styles={{ body: { height: 'calc(100vh - 110px)', padding: 0, overflow: 'hidden' } }}
      zIndex={zIndex}
      destroyOnHidden
      footer={null}
    >
      <WorkflowFlowSurface
        document={flowDocument}
        selection={selection}
        readOnly={disabled}
        onSelect={setSelection}
        onAddAction={handleAddAction}
        onMoveAction={handleMoveAction}
        onDeleteAction={handleDeleteAction}
        onDuplicateAction={handleDuplicateAction}
        inspectorTitle={inspectorTitle}
        renderInspector={renderInspector}
      />
    </Modal>
  );
};

export default ProcessAutomationFlowModal;
