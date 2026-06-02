import React, { useMemo, useState } from 'react';
import { App, Button, Empty, Input, Tooltip } from 'antd';
import {
  PlusOutlined,
  CheckOutlined,
  CloseOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  PrinterOutlined,
} from '@ant-design/icons';
import { printOrgChart } from './orgChartPrint';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { OrgChartNode, ORG_NODE_WIDTH } from './OrgChartNode';
import { buildTree, type RoleNode } from './orgChartHelpers';
import { ROOT_DROP_ZONE_ID } from './useRoleDragDrop';

const CONNECTOR_HEIGHT = 20;
const NODE_GAP = 24;

interface OrgChartProps {
  roles: any[];
  selectedRoleId: string | null;
  expandedKeys: string[];
  supportsRoleTreeSchema: boolean | null;
  activeId: string | null;
  overId: string | null;
  orgName?: string;
  onEditClick: (id: string) => void;
  onDeleteRole: (id: string) => void;
  onAddRole: (parentId: string | null, name: string) => Promise<void>;
  onSelectRole: (id: string) => void;
  onExpandChange: (keys: string[]) => void;
  onDragStart: (event: any) => void;
  onDragOver: (event: any) => void;
  onDragEnd: (event: any) => Promise<void>;
  onDragCancel: () => void;
}

// ─── Root Drop Zone ───────────────────────────────────────────────────────────
function RootDropZone({ isActive }: { isActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ZONE_ID });
  if (!isActive) return null;
  return (
    <div
      ref={setNodeRef}
      style={{
        border: `2px dashed ${isOver ? 'rgb(var(--brand-500-rgb))' : 'rgba(var(--brand-300-rgb),0.5)'}`,
        backgroundColor: isOver ? 'rgba(var(--brand-100-rgb),0.4)' : 'rgba(var(--brand-50-rgb),0.2)',
        transition: 'all 0.15s',
        minHeight: 48,
        borderRadius: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        marginBottom: 8,
      }}
    >
      <span className="text-xs text-gray-400 dark:text-gray-500" style={{ color: 'rgb(var(--brand-400-rgb))' }}>
        اینجا رها کن تا به سطح اول (ریشه) منتقل شود
      </span>
    </div>
  );
}

// ─── Inline Add Card ───────────────────────────────────────────────────────────
function InlineAddCard({
  name,
  onNameChange,
  onConfirm,
  onCancel,
}: {
  name: string;
  onNameChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      style={{
        width: `${ORG_NODE_WIDTH}px`,
        minWidth: `${ORG_NODE_WIDTH}px`,
        border: '1.5px dashed rgb(var(--brand-400-rgb))',
        backgroundColor: 'rgba(var(--brand-50-rgb),0.4)',
        borderRadius: 12,
        padding: '10px',
      }}
      className="dark:bg-white/5 dark:border-opacity-50"
    >
      <Input
        size="small"
        autoFocus
        placeholder="نام جایگاه جدید..."
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onConfirm();
          if (e.key === 'Escape') onCancel();
        }}
        className="dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-2"
      />
      <div className="flex gap-1 justify-end">
        <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!name.trim()} onClick={onConfirm}
          style={{ background: 'rgb(var(--brand-500-rgb))', border: 'none' }}>
          افزودن
        </Button>
        <Button size="small" icon={<CloseOutlined />} onClick={onCancel} />
      </div>
    </div>
  );
}

// ─── Recursive node renderer ───────────────────────────────────────────────────
interface NodeWrapProps {
  node: RoleNode;
  expandedSet: Set<string>;
  selectedRoleId: string | null;
  activeId: string | null;
  overId: string | null;
  pendingAddChildOfId: string | null;
  inlineAddName: string;
  supportsRoleTreeSchema: boolean | null;
  onEditClick: (id: string) => void;
  onDeleteRole: (id: string) => void;
  onAddChildOpen: (id: string) => void;
  onSelectRole: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onInlineAddNameChange: (v: string) => void;
  onInlineAddConfirm: () => void;
  onInlineAddCancel: () => void;
}

function NodeWrap(props: NodeWrapProps) {
  const {
    node,
    expandedSet,
    selectedRoleId,
    activeId,
    overId,
    pendingAddChildOfId,
    inlineAddName,
    supportsRoleTreeSchema,
    onEditClick,
    onDeleteRole,
    onAddChildOpen,
    onSelectRole,
    onToggleExpand,
    onInlineAddNameChange,
    onInlineAddConfirm,
    onInlineAddCancel,
  } = props;

  const isExpanded = expandedSet.has(node.id);
  const hasChildren = node.children.length > 0;
  const hasPendingAdd = pendingAddChildOfId === node.id;
  const showChildren = (hasChildren && isExpanded) || hasPendingAdd;

  const childCount = node.children.length + (hasPendingAdd ? 1 : 0);
  const isDisabled = supportsRoleTreeSchema === false;

  const connectorStyle: React.CSSProperties = {
    width: 2,
    height: CONNECTOR_HEIGHT,
    background: 'rgb(var(--brand-300-rgb))',
    flexShrink: 0,
  };

  return (
    <div className="flex flex-col items-center">
      <OrgChartNode
        node={node}
        isSelected={selectedRoleId === node.id}
        isExpanded={isExpanded}
        showExpandButton={hasChildren}
        isDisabled={isDisabled}
        isBeingDragged={activeId === node.id}
        isDropTarget={overId === node.id}
        onEditClick={onEditClick}
        onAddChild={onAddChildOpen}
        onDelete={onDeleteRole}
        onToggleExpand={onToggleExpand}
        onSelect={onSelectRole}
      />

      {showChildren && (
        <>
          {/* Vertical connector from card down */}
          <div style={connectorStyle} />

          {/* Children row */}
          <div className="relative flex flex-row" style={{ gap: `${NODE_GAP}px` }}>
            {/* Horizontal bar (only when 2+ visible children) */}
            {childCount > 1 && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: `${ORG_NODE_WIDTH / 2}px`,
                  right: `${ORG_NODE_WIDTH / 2}px`,
                  height: 2,
                  background: 'rgb(var(--brand-300-rgb))',
                }}
              />
            )}

            {/* Existing children */}
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center">
                {childCount > 1 && <div style={connectorStyle} />}
                <NodeWrap {...props} node={child} />
              </div>
            ))}

            {/* Inline add-child input */}
            {hasPendingAdd && (
              <div className="flex flex-col items-center">
                {childCount > 1 && <div style={connectorStyle} />}
                <InlineAddCard
                  name={inlineAddName}
                  onNameChange={onInlineAddNameChange}
                  onConfirm={onInlineAddConfirm}
                  onCancel={onInlineAddCancel}
                />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main OrgChart component ───────────────────────────────────────────────────
export const OrgChart: React.FC<OrgChartProps> = ({
  roles,
  selectedRoleId,
  expandedKeys,
  supportsRoleTreeSchema,
  activeId,
  overId,
  orgName,
  onEditClick,
  onDeleteRole,
  onAddRole,
  onSelectRole,
  onExpandChange,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}) => {
  const { message } = App.useApp();
  const [chartScale, setChartScale] = useState(1);
  const [rootInputName, setRootInputName] = useState('');
  const [pendingAddChildOfId, setPendingAddChildOfId] = useState<string | null>(null);
  const [inlineAddName, setInlineAddName] = useState('');
  const [printing, setPrinting] = useState(false);

  const tree = useMemo(() => buildTree(roles), [roles]);
  const expandedSet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const handleToggleExpand = (id: string) => {
    if (expandedSet.has(id)) {
      onExpandChange(expandedKeys.filter((k) => k !== id));
    } else {
      onExpandChange([...expandedKeys, id]);
    }
  };

  const handleAddChildOpen = (id: string) => {
    setPendingAddChildOfId(id);
    setInlineAddName('');
    // auto-expand so children are visible
    if (!expandedSet.has(id)) {
      onExpandChange([...expandedKeys, id]);
    }
  };

  const handleInlineAddConfirm = async () => {
    if (!inlineAddName.trim() || !pendingAddChildOfId) return;
    await onAddRole(pendingAddChildOfId, inlineAddName);
    setPendingAddChildOfId(null);
    setInlineAddName('');
  };

  const handleInlineAddCancel = () => {
    setPendingAddChildOfId(null);
    setInlineAddName('');
  };

  const handleAddRoot = async () => {
    if (!rootInputName.trim()) return;
    await onAddRole(null, rootInputName);
    setRootInputName('');
  };

  const handlePrint = async () => {
    if (!roles.length) return;
    setPrinting(true);
    try {
      await printOrgChart(roles, orgName);
    } catch {
      message.error('خطا در آماده‌سازی پرینت');
    } finally {
      setPrinting(false);
    }
  };

  const activeRole = activeId ? roles.find((r) => String(r?.id) === activeId) : null;

  const nodeWrapProps: Omit<NodeWrapProps, 'node'> = {
    expandedSet,
    selectedRoleId,
    activeId,
    overId,
    pendingAddChildOfId,
    inlineAddName,
    supportsRoleTreeSchema,
    onEditClick,
    onDeleteRole,
    onAddChildOpen: handleAddChildOpen,
    onSelectRole,
    onToggleExpand: handleToggleExpand,
    onInlineAddNameChange: setInlineAddName,
    onInlineAddConfirm: handleInlineAddConfirm,
    onInlineAddCancel: handleInlineAddCancel,
  };

  return (
    <div className="bg-gray-50 dark:bg-[#1c1c1c] border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
      {/* Header toolbar */}
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <h3 className="text-base font-bold text-gray-700 dark:text-gray-200 m-0 flex items-center gap-2">
          <span style={{ color: 'rgb(var(--brand-500-rgb))' }}>▤</span>
          چارت سازمانی
        </h3>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <Input
            size="small"
            placeholder="نام جایگاه جدید در سطح اول..."
            value={rootInputName}
            onChange={(e) => setRootInputName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAddRoot(); }}
            style={{ maxWidth: 240 }}
            className="dark:bg-[#303030] dark:border-gray-700 dark:text-white"
          />
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            disabled={!rootInputName.trim()}
            onClick={() => void handleAddRoot()}
            style={{ background: 'rgb(var(--brand-500-rgb))', border: 'none' }}
          >
            افزودن ریشه
          </Button>
          <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <Tooltip title="کوچک‌تر">
              <Button
                type="text"
                size="small"
                icon={<ZoomOutOutlined />}
                onClick={() => setChartScale((s) => Math.max(0.4, s - 0.1))}
              />
            </Tooltip>
            <span className="text-xs text-gray-400 px-1">{Math.round(chartScale * 100)}٪</span>
            <Tooltip title="بزرگ‌تر">
              <Button
                type="text"
                size="small"
                icon={<ZoomInOutlined />}
                onClick={() => setChartScale((s) => Math.min(1.6, s + 0.1))}
              />
            </Tooltip>
          </div>
          <Tooltip title="پرینت چارت سازمانی">
            <Button
              size="small"
              icon={<PrinterOutlined />}
              loading={printing}
              disabled={!roles.length}
              onClick={() => void handlePrint()}
              style={{
                borderColor: 'rgba(var(--brand-300-rgb),0.6)',
                color: 'rgb(var(--brand-600-rgb))',
              }}
            >
              چاپ
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Schema warning */}
      {supportsRoleTreeSchema === false && (
        <div
          className="mb-4 text-xs rounded-xl border p-3"
          style={{
            borderColor: 'rgba(var(--brand-300-rgb),0.4)',
            background: 'rgba(var(--brand-50-rgb),0.5)',
            color: 'rgb(var(--brand-700-rgb))',
          }}
        >
          ساختار سلسله‌مراتبی در این محیط فعال نیست. drag-drop و زیرمجموعه‌ها غیرفعال هستند.
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        {/* Chart scrollable container */}
        <div className="overflow-auto" style={{ maxHeight: '55vh' }}>
          <div
            style={{
              transform: `scale(${chartScale})`,
              transformOrigin: 'top center',
              transition: 'transform 0.2s ease',
              paddingBottom: 8,
            }}
          >
            {tree.length === 0 ? (
              <Empty
                description={<span className="text-gray-400">هنوز جایگاهی تعریف نشده</span>}
              />
            ) : (
              <div className="flex flex-row flex-wrap justify-center gap-6 relative" style={{ minWidth: 'max-content' }}>
                {tree.map((rootNode) => (
                  <NodeWrap key={rootNode.id} node={rootNode} {...nodeWrapProps} />
                ))}
              </div>
            )}

            {/* Root drop zone (shown when dragging) */}
            <RootDropZone isActive={!!activeId} />
          </div>
        </div>

        {/* Drag overlay ghost */}
        <DragOverlay>
          {activeRole && (
            <div
              style={{
                width: ORG_NODE_WIDTH,
                border: '1.5px solid rgb(var(--brand-500-rgb))',
                backgroundColor: 'rgb(var(--brand-50-rgb))',
                borderRadius: 12,
                padding: '10px 12px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                opacity: 0.9,
                pointerEvents: 'none',
              }}
            >
              <span className="text-sm font-bold text-gray-700">
                {String(activeRole?.title || '')}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <style>{`
        .dark .org-chart-label { color: #e5e7eb; }
      `}</style>
    </div>
  );
};
