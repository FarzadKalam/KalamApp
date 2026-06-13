import React from 'react';
import { Drawer, Grid } from 'antd';
import WorkflowFlowCanvas from './WorkflowFlowCanvas';
import { FlowCallbacks, FlowDocument, FlowSelection } from './flowTypes';

type WorkflowFlowSurfaceProps = FlowCallbacks & {
  document: FlowDocument;
  selection: FlowSelection | null;
  readOnly?: boolean;
  inspectorTitle: (selection: FlowSelection) => string;
  renderInspector: (selection: FlowSelection) => React.ReactNode;
  /**
   * محتوایی که باید همیشه mount بماند (مثل Form.Item های antd) — فقط وقتی
   * selection از نوع trigger است نمایش داده می‌شود و بقیه مواقع با CSS مخفی است.
   */
  alwaysMountedInspector?: React.ReactNode;
};

const WorkflowFlowSurface: React.FC<WorkflowFlowSurfaceProps> = ({
  document: flowDocument,
  selection,
  readOnly,
  inspectorTitle,
  renderInspector,
  alwaysMountedInspector,
  onSelect,
  onAddAction,
  onMoveAction,
  onDeleteAction,
  onDuplicateAction,
}) => {
  const screens = Grid.useBreakpoint();
  const drawerWidth = screens.md ? 540 : '100%';
  const isTriggerSelection = selection?.kind === 'trigger';

  return (
    <div className="relative h-full w-full overflow-hidden bg-[rgba(var(--brand-50-rgb),0.35)] dark:bg-transparent">
      <WorkflowFlowCanvas
        document={flowDocument}
        selection={selection}
        readOnly={readOnly}
        onSelect={onSelect}
        onAddAction={onAddAction}
        onMoveAction={onMoveAction}
        onDeleteAction={onDeleteAction}
        onDuplicateAction={onDuplicateAction}
      />
      <Drawer
        open={!!selection}
        onClose={() => onSelect(null)}
        title={selection ? inspectorTitle(selection) : ''}
        placement="left"
        width={drawerWidth}
        mask={false}
        forceRender
        getContainer={false}
        destroyOnHidden={false}
        styles={{
          body: { paddingBottom: 32 },
          content: { boxShadow: '8px 0 24px rgba(0,0,0,0.12)' },
        }}
      >
        {alwaysMountedInspector ? (
          <div style={{ display: isTriggerSelection ? 'block' : 'none' }}>{alwaysMountedInspector}</div>
        ) : null}
        {selection && !(isTriggerSelection && alwaysMountedInspector)
          ? renderInspector(selection)
          : null}
      </Drawer>
    </div>
  );
};

export default WorkflowFlowSurface;
