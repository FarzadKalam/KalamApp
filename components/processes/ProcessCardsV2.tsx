import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, Dropdown, Input, Select, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import ProcessTaskModalV2 from './ProcessTaskModalV2';
import {
  ApartmentOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  CompressOutlined,
  CopyOutlined,
  DeleteOutlined,
  EyeOutlined,
  FileTextOutlined,
  HolderOutlined,
  HourglassOutlined,
  InfoCircleOutlined,
  DownOutlined,
  LeftOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

export type ProcessV2StageKind = 'draft' | 'activity';
export type ProcessV2StageStatus = 'draft' | 'waiting' | 'active' | 'done' | 'blocked' | 'canceled';
export type ProcessV2CardMode = 'template' | 'run';
export type ProcessV2Variant = 'full' | 'compact' | 'column';

export type ProcessV2Stage = {
  id: string;
  title: string;
  kind: ProcessV2StageKind;
  status: ProcessV2StageStatus;
  layoutSlot?: number;
  assigneeLabel?: string;
  assigneeAvatarUrl?: string;
  activityTypeLabel?: string;
  dueLabel?: string;
  actionCount?: number;
  metaLabel?: string;
};

export type ProcessV2Lane = {
  id: string;
  title: string;
  collapsed?: boolean;
  stages: ProcessV2Stage[];
};

export type ProcessV2TemplateOption = {
  id: string;
  title: string;
};

export type ProcessV2TemplateCard = {
  mode: 'template';
  id: string;
  title: string;
  moduleLabel: string;
  activatorLabel: string;
  realtimeLabel?: string;
  lanes: ProcessV2Lane[];
};

export type ProcessV2RunCard = {
  mode: 'run';
  id: string;
  title: string;
  templateId: string;
  templateTitle: string;
  relatedRecordLabel: string;
  statusLabel: string;
  realtimeLabel?: string;
  lanes: ProcessV2Lane[];
};

export type ProcessV2CardData = ProcessV2TemplateCard | ProcessV2RunCard;

type ProcessCardsV2Props = {
  item: ProcessV2CardData;
  templates?: ProcessV2TemplateOption[];
  variant?: ProcessV2Variant;
  onChange?: (next: ProcessV2CardData) => void;
  onDelete?: (id: string) => void;
  onCopy?: (id: string) => void;
  onAddRun?: () => void;
};

type StageSizeMode = 'fit' | 'expanded';
type ProcessComputedStatus = 'draft' | 'not_started' | 'in_progress' | 'completed' | 'canceled';
type ConnectorMode = 'idle' | 'add' | 'connect';
type ConnectorPlacement = 'top' | 'bottom' | 'left' | 'right';
type ConnectorPoint = { x: number; y: number };
type ConnectorPair = { id: string; from: string; to: string };
type StageDragPayload = { laneId: string; stageId: string };
type LaneDragPayload = { laneId: string };
type DropSlotPreview = { laneId: string; slot: number } | null;
type DropLanePreview = { laneId: string; edge: 'before' | 'after' } | null;
type ActiveStageModal = { stage: ProcessV2Stage; laneTitle: string } | null;

const statusVisual: Record<ProcessV2StageStatus, {
  label: string;
  border: string;
  fill: string;
  text: string;
  darkBorder: string;
  darkFill: string;
  darkText: string;
  icon: React.ReactNode;
}> = {
  draft: {
    label: 'پیش نویس',
    border: '#94a3b8',
    fill: '#f8fafc',
    text: '#475569',
    darkBorder: '#64748b',
    darkFill: 'rgba(148, 163, 184, 0.10)',
    darkText: '#cbd5e1',
    icon: <FileTextOutlined />,
  },
  waiting: {
    label: 'در انتظار',
    border: '#f59e0b',
    fill: '#fffbeb',
    text: '#92400e',
    darkBorder: '#fbbf24',
    darkFill: 'rgba(245, 158, 11, 0.20)',
    darkText: '#fde68a',
    icon: <HourglassOutlined />,
  },
  active: {
    label: 'فعال',
    border: '#2563eb',
    fill: '#eff6ff',
    text: '#1d4ed8',
    darkBorder: '#60a5fa',
    darkFill: 'rgba(37, 99, 235, 0.22)',
    darkText: '#bfdbfe',
    icon: <ClockCircleOutlined />,
  },
  done: {
    label: 'انجام شده',
    border: '#16a34a',
    fill: '#f0fdf4',
    text: '#15803d',
    darkBorder: '#4ade80',
    darkFill: 'rgba(22, 163, 74, 0.22)',
    darkText: '#bbf7d0',
    icon: <CheckOutlined />,
  },
  blocked: {
    label: 'متوقف',
    border: '#dc2626',
    fill: '#fef2f2',
    text: '#b91c1c',
    darkBorder: '#f87171',
    darkFill: 'rgba(220, 38, 38, 0.20)',
    darkText: '#fecaca',
    icon: <CloseOutlined />,
  },
  canceled: {
    label: 'لغو شده',
    border: '#64748b',
    fill: '#f8fafc',
    text: '#475569',
    darkBorder: '#94a3b8',
    darkFill: 'rgba(100, 116, 139, 0.16)',
    darkText: '#cbd5e1',
    icon: <CloseOutlined />,
  },
};

const processStatusVisual = {
  draft: { label: 'پیش نویس', color: 'default' as const, className: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200' },
  not_started: { label: 'شروع نشده', color: 'error' as const, className: '!border-red-200 !bg-red-50 !text-red-700 dark:!border-red-700/50 dark:!bg-red-500/10 dark:!text-red-200' },
  in_progress: { label: 'در حال انجام', color: 'processing' as const, className: '!border-blue-200 !bg-blue-50 !text-blue-700 dark:!border-blue-700/50 dark:!bg-blue-500/10 dark:!text-blue-200' },
  completed: { label: 'تکمیل شده', color: 'success' as const, className: '!border-green-200 !bg-green-50 !text-green-700 dark:!border-green-700/50 dark:!bg-green-500/10 dark:!text-green-200' },
  canceled: { label: 'لغو شده', color: 'default' as const, className: '!border-slate-300 !bg-slate-100 !text-slate-600 dark:!border-slate-600 dark:!bg-white/10 dark:!text-slate-200' },
};

let localIdSeed = 0;
const nextLocalId = (prefix: string) => `${prefix}_${Date.now()}_${localIdSeed++}`;

const cloneStage = (stage: ProcessV2Stage): ProcessV2Stage => ({
  ...stage,
  id: nextLocalId('stage'),
  title: `${stage.title} کپی`,
});

const getStageLayoutSlot = (stage: ProcessV2Stage, fallbackIndex: number) => (
  typeof stage.layoutSlot === 'number' && Number.isFinite(stage.layoutSlot)
    ? Math.max(0, Math.floor(stage.layoutSlot))
    : fallbackIndex
);

const cloneLane = (lane: ProcessV2Lane): ProcessV2Lane => ({
  ...lane,
  id: nextLocalId('lane'),
  title: `${lane.title} کپی`,
  stages: lane.stages.map((stage) => cloneStage(stage)),
});

const createNewStage = (mode: ProcessV2CardMode, layoutSlot?: number): ProcessV2Stage => ({
  id: nextLocalId('stage'),
  title: mode === 'template' ? 'مرحله پیش نویس جدید' : 'فعالیت جدید',
  kind: mode === 'template' ? 'draft' : 'activity',
  status: mode === 'template' ? 'draft' : 'waiting',
  layoutSlot,
  assigneeLabel: 'تعیین مسئول',
  activityTypeLabel: mode === 'template' ? 'مرحله پیش نویس' : 'فعالیت جدید',
  actionCount: 0,
});

const getAssigneeInitial = (label?: string) => {
  const normalized = String(label || '').trim();
  return normalized ? normalized.slice(0, 1) : '؟';
};

const getExpandedStageWidth = (stage: ProcessV2Stage) => {
  const base = Math.max(stage.title.length * 9 + 156, 220);
  return Math.min(base, 380);
};

const getFitStageWidth = (stageSlotCount: number) => {
  const safeSlotCount = Math.max(stageSlotCount, 1);
  return `calc((100% - ${safeSlotCount * 36 + 12}px) / ${safeSlotCount})`;
};

const getStageActivityLabel = (stage: ProcessV2Stage, statusLabel: string) => (
  stage.assigneeLabel || stage.metaLabel || statusLabel
);

const getStageActionLabel = (stage: ProcessV2Stage) => (
  `${toPersianNumber(stage.actionCount ?? 0)} اقدام`
);

const shiftStagesFromSlot = (stages: ProcessV2Stage[], targetSlot: number) => (
  stages.map((stage, index) => {
    const slot = getStageLayoutSlot(stage, index);
    return {
      ...stage,
      layoutSlot: slot >= targetSlot ? slot + 1 : slot,
    };
  })
);

const sortStagesByLayoutSlot = (stages: ProcessV2Stage[]) => (
  [...stages].sort((first, second) => {
    const firstSlot = getStageLayoutSlot(first, 0);
    const secondSlot = getStageLayoutSlot(second, 0);
    if (firstSlot !== secondSlot) return firstSlot - secondSlot;
    return first.id.localeCompare(second.id);
  })
);

const getProcessComputedStatus = (item: ProcessV2CardData): ProcessComputedStatus => {
  const stages = item.lanes.flatMap((lane) => lane.stages);
  if (item.mode === 'template' || stages.length === 0) return 'draft';
  const statuses = stages.map((stage) => stage.status);
  if (statuses.every((status) => status === 'canceled')) return 'canceled';
  if (statuses.every((status) => status === 'done')) return 'completed';
  if (statuses.some((status) => status === 'active' || status === 'done' || status === 'blocked')) return 'in_progress';
  return 'not_started';
};

const IconButton = ({
  title,
  icon,
  active,
  danger,
  onClick,
  disabled,
}: {
  title: string;
  icon: React.ReactNode;
  active?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) => (
  <Tooltip title={title}>
    <Button
      type="text"
      size="small"
      shape="circle"
      danger={danger}
      disabled={disabled}
      icon={icon}
      aria-label={title}
      onClick={onClick}
      className={`!inline-flex !items-center !justify-center hover:!bg-slate-100 dark:hover:!bg-white/10 ${
        active
          ? '!border !border-[rgba(var(--brand-600-rgb),0.28)] !bg-[rgba(var(--brand-600-rgb),0.12)] !text-[rgb(var(--brand-700-rgb))] dark:!border-[rgba(var(--brand-300-rgb),0.35)] dark:!bg-[rgba(var(--brand-500-rgb),0.22)] dark:!text-[rgb(var(--brand-100-rgb))]'
          : '!text-slate-500 dark:!text-slate-300'
      }`}
    />
  </Tooltip>
);

const ActionOverflow = ({ items }: { items: MenuProps['items'] }) => (
  <Dropdown menu={{ items }} trigger={['click']} placement="bottomLeft">
    <Button
      type="text"
      size="small"
      shape="circle"
      icon={<MoreOutlined />}
      aria-label="گزینه های بیشتر"
      className="!inline-flex !items-center !justify-center !text-slate-500 dark:!text-slate-300"
    />
  </Dropdown>
);

const connectorEdgeStyle: Record<ConnectorPlacement, React.CSSProperties> = {
  top: {
    position: 'absolute',
    left: '50%',
    top: 0,
    transform: 'translate(-50%, -50%)',
  },
  bottom: {
    position: 'absolute',
    bottom: 0,
    left: '50%',
    transform: 'translate(-50%, 50%)',
  },
  left: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translate(-50%, -50%)',
  },
  right: {
    position: 'absolute',
    right: 0,
    top: '50%',
    transform: 'translate(50%, -50%)',
  },
};

const connectorCenterStyle: React.CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '50%',
  transform: 'translate(-50%, -50%)',
};

const ConnectorAnchor = memo(({
  connectorId,
  style,
}: {
  connectorId: string;
  style: React.CSSProperties;
}) => (
  <span
    aria-hidden="true"
    data-process-connector={connectorId}
    className="pointer-events-none absolute h-0 w-0"
    style={style}
  />
));

ConnectorAnchor.displayName = 'ConnectorAnchor';

const getConnectorSide = (connectorId: string) => connectorId.split(':').pop() || '';

const getConnectorPath = (from: ConnectorPoint, to: ConnectorPoint, pair: ConnectorPair) => {
  const isSameRow = Math.abs(from.y - to.y) < 8;
  const isSameColumn = Math.abs(from.x - to.x) < 8;
  if (isSameRow) return `M ${from.x} ${from.y} H ${to.x}`;
  if (isSameColumn) return `M ${from.x} ${from.y} V ${to.y}`;
  const targetSide = getConnectorSide(pair.to);
  if (targetSide === 'left' || targetSide === 'right') {
    const midX = from.x + (to.x - from.x) / 2;
    return `M ${from.x} ${from.y} H ${midX} V ${to.y} H ${to.x}`;
  }
  const midY = from.y + (to.y - from.y) / 2;
  return `M ${from.x} ${from.y} V ${midY} H ${to.x} V ${to.y}`;
};

const ConnectorLinesOverlay = memo(({
  pairs,
  positions,
  selectedPairId,
  onSelectPair,
}: {
  pairs: ConnectorPair[];
  positions: Record<string, ConnectorPoint>;
  selectedPairId?: string | null;
  onSelectPair: (pairId: string) => void;
}) => {
  const visiblePairs = pairs
    .map((pair) => ({ pair, from: positions[pair.from], to: positions[pair.to] }))
    .filter((entry): entry is { pair: ConnectorPair; from: ConnectorPoint; to: ConnectorPoint } => Boolean(entry.from && entry.to));

  if (!visiblePairs.length) return null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[3] h-full w-full overflow-visible"
      aria-label="خط های اتصال فرآیند"
    >
      {visiblePairs.map(({ pair, from, to }) => (
        <path
          key={pair.id}
          d={getConnectorPath(from, to, pair)}
          className={`pointer-events-auto cursor-pointer transition ${selectedPairId === pair.id ? 'stroke-red-400 dark:stroke-red-300' : 'stroke-slate-300 dark:stroke-white/20'}`}
          fill="none"
          pointerEvents="stroke"
          strokeLinecap="square"
          strokeLinejoin="miter"
          strokeWidth={selectedPairId === pair.id ? 2.25 : 1.5}
          opacity={0.95}
          onClick={(event) => {
            event.stopPropagation();
            onSelectPair(pair.id);
          }}
        />
      ))}
    </svg>
  );
});

ConnectorLinesOverlay.displayName = 'ConnectorLinesOverlay';

const getConnectionControlPoint = (from: ConnectorPoint, to: ConnectorPoint) => {
  const isSameRow = Math.abs(from.y - to.y) < 8;
  const isSameColumn = Math.abs(from.x - to.x) < 8;
  if (isSameRow) return { x: from.x + (to.x - from.x) / 2, y: from.y };
  if (isSameColumn) return { x: from.x, y: from.y + (to.y - from.y) / 2 };
  return { x: to.x, y: from.y + (to.y - from.y) / 2 };
};

const ConnectionDeleteControls = memo(({
  pair,
  positions,
  onDelete,
}: {
  pair?: ConnectorPair;
  positions: Record<string, ConnectorPoint>;
  onDelete: () => void;
}) => {
  if (!pair) return null;
  const from = positions[pair.from];
  const to = positions[pair.to];
  if (!from || !to) return null;
  const middle = getConnectionControlPoint(from, to);
  const controls = [
    { key: 'middle', point: middle, title: 'حذف اتصال' },
    { key: 'from', point: from, title: 'حذف اتصال از نقطه اول' },
    { key: 'to', point: to, title: 'حذف اتصال از نقطه دوم' },
  ];

  return (
    <>
      {controls.map(({ key, point, title }) => (
        <Tooltip key={key} title={title}>
          <Button
            type="text"
            size="small"
            shape="circle"
            danger
            icon={<DeleteOutlined />}
            aria-label={title}
            onClick={(event) => {
              event.stopPropagation();
              onDelete();
            }}
            className="!absolute !z-[7] !inline-flex !h-5 !w-5 !min-w-5 !items-center !justify-center !bg-white !text-[10px] !shadow-sm dark:!bg-slate-950"
            style={{
              left: point.x,
              top: point.y,
              transform: 'translate(-50%, -50%)',
            }}
          />
        </Tooltip>
      ))}
    </>
  );
});

ConnectionDeleteControls.displayName = 'ConnectionDeleteControls';

const ConnectionDot = memo(({
  connectorId,
  title,
  className,
  style,
  mode,
  selected,
  connected,
  onClick,
}: {
  connectorId: string;
  title: string;
  className?: string;
  style?: React.CSSProperties;
  mode: Exclude<ConnectorMode, 'idle'>;
  selected?: boolean;
  connected?: boolean;
  onClick?: () => void;
}) => (
  <Tooltip title={title}>
    <button
      type="button"
      aria-label={title}
      data-process-connector={connectorId}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
      style={style}
      className={`relative z-[5] inline-flex shrink-0 items-center justify-center rounded-full border transition ${
        mode === 'add'
          ? 'h-4 w-4 border-[rgb(var(--brand-500-rgb))] bg-[rgb(var(--brand-600-rgb))] text-[8px] text-white shadow-sm hover:bg-[rgb(var(--brand-700-rgb))]'
          : `h-3 w-3 ${
              selected || connected
                ? 'border-[rgb(var(--brand-600-rgb))] bg-[rgb(var(--brand-600-rgb))] shadow-sm'
                : 'border-slate-300 bg-white hover:border-[rgb(var(--brand-500-rgb))] dark:border-slate-600 dark:bg-slate-900'
            }`
      } ${className || ''}`}
    >
      {mode === 'add' ? (
        <PlusOutlined />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${selected || connected ? 'bg-white' : 'bg-slate-300 dark:bg-slate-600'}`} />
      )}
    </button>
  </Tooltip>
));

ConnectionDot.displayName = 'ConnectionDot';

const InlineTitle = memo(({
  value,
  className,
  onSave,
}: {
  value: string;
  className?: string;
  onSave: (next: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [editing, value]);

  const commit = useCallback(() => {
    const next = draft.trim() || value;
    setDraft(next);
    setEditing(false);
    if (next !== value) onSave(next);
  }, [draft, onSave, value]);

  const cancel = useCallback(() => {
    setDraft(value);
    setEditing(false);
  }, [value]);

  if (editing) {
    return (
      <span className={`inline-flex min-w-0 items-center gap-1 ${className || ''}`}>
        <Input
          autoFocus
          size="small"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onPressEnter={commit}
          onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Escape') cancel();
          }}
          className="!h-8 !min-w-0 !rounded-lg !text-right !font-bold"
        />
        <Button
          size="small"
          type="text"
          shape="circle"
          icon={<CheckOutlined />}
          aria-label="ذخیره"
          onMouseDown={(event) => event.preventDefault()}
          onClick={commit}
          className="!text-emerald-600"
        />
        <Button
          size="small"
          type="text"
          shape="circle"
          icon={<CloseOutlined />}
          aria-label="لغو"
          onMouseDown={(event) => event.preventDefault()}
          onClick={cancel}
          className="!text-slate-400"
        />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`min-w-0 truncate rounded-lg px-2 py-1 text-right font-bold text-slate-800 transition hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10 ${className || ''}`}
      title={value}
    >
      {value}
    </button>
  );
});

InlineTitle.displayName = 'InlineTitle';

const ProcessStagePill = memo(({
  stage,
  laneId,
  slot,
  isFirstStage,
  compact,
  readOnlySurface,
  sizeMode,
  stageSlotCount,
  onCopy,
  onDelete,
  onInsertBefore,
  onInsertAfter,
  onInsertAbove,
  onInsertBelow,
  connectorMode,
  selectedConnectorId,
  connectedConnectorIds,
  onConnectorClick,
  onDragStart,
  onDragEnd,
  onOpenDetails,
}: {
  stage: ProcessV2Stage;
  laneId: string;
  slot: number;
  isFirstStage: boolean;
  compact: boolean;
  readOnlySurface: boolean;
  sizeMode: StageSizeMode;
  stageSlotCount: number;
  onCopy: () => void;
  onDelete: () => void;
  onInsertBefore: () => void;
  onInsertAfter: () => void;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  connectorMode: ConnectorMode;
  selectedConnectorId?: string | null;
  connectedConnectorIds: Set<string>;
  onConnectorClick: (connectorId: string, insertStage: () => void) => void;
  onDragStart: (event: React.DragEvent<HTMLElement>, payload: StageDragPayload) => void;
  onDragEnd: () => void;
  onOpenDetails: () => void;
}) => {
  const visual = statusVisual[stage.status];
  const activityLabel = getStageActivityLabel(stage, visual.label);
  const actionLabel = getStageActionLabel(stage);
  const actionItems: MenuProps['items'] = [
    { key: 'copy', label: 'کپی مرحله', icon: <CopyOutlined />, onClick: onCopy },
    { key: 'delete', label: 'حذف مرحله', icon: <DeleteOutlined />, danger: true, onClick: onDelete },
  ];
  const expandedWidth = getExpandedStageWidth(stage);
  const stageHeight = readOnlySurface ? (compact ? 40 : 44) : compact ? 50 : 58;
  const fitClass = sizeMode === 'fit'
    ? 'min-w-0 shrink-0'
    : 'shrink-0';
  const topConnectorId = `${stage.id}:top`;
  const bottomConnectorId = `${stage.id}:bottom`;
  const rightConnectorId = `${stage.id}:right`;

  return (
    <div
      className={`group relative cursor-pointer rounded-xl border border-[var(--process-stage-border)] bg-[var(--process-stage-fill)] text-[var(--process-stage-text)] shadow-sm transition hover:shadow-md dark:border-[var(--process-stage-border-dark)] dark:bg-[var(--process-stage-fill-dark)] dark:text-[var(--process-stage-text-dark)] ${fitClass}`}
      role="button"
      tabIndex={0}
      onClick={onOpenDetails}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetails();
        }
      }}
      style={{
        width: sizeMode === 'expanded' ? `max(${expandedWidth}px, ${getFitStageWidth(stageSlotCount)})` : undefined,
        flexBasis: sizeMode === 'fit' ? getFitStageWidth(stageSlotCount) : undefined,
        height: stageHeight,
        minHeight: stageHeight,
        borderStyle: stage.status === 'draft' ? 'dashed' : 'solid',
        '--process-stage-border': visual.border,
        '--process-stage-fill': visual.fill,
        '--process-stage-fill-dark': visual.darkFill,
        '--process-stage-text': visual.text,
        '--process-stage-text-dark': visual.darkText,
        '--process-stage-border-dark': visual.darkBorder,
      } as React.CSSProperties}
    >
      {!readOnlySurface && connectorMode !== 'idle' ? (
        <>
          {isFirstStage ? (
            <ConnectionDot
              title={connectorMode === 'add' ? 'افزودن مرحله قبل از شروع این ردیف' : 'انتخاب نقطه شروع این ردیف برای اتصال'}
              connectorId={rightConnectorId}
              mode={connectorMode}
              selected={selectedConnectorId === rightConnectorId}
              connected={connectedConnectorIds.has(rightConnectorId)}
              onClick={() => onConnectorClick(rightConnectorId, onInsertBefore)}
              style={connectorEdgeStyle.right}
            />
          ) : null}
          <ConnectionDot
            title={connectorMode === 'add' ? 'افزودن مرحله از بالای این مرحله' : 'انتخاب نقطه بالای مرحله برای اتصال'}
            connectorId={topConnectorId}
            mode={connectorMode}
            selected={selectedConnectorId === topConnectorId}
            connected={connectedConnectorIds.has(topConnectorId)}
            onClick={() => onConnectorClick(topConnectorId, onInsertAbove)}
            style={connectorEdgeStyle.top}
          />
          <ConnectionDot
            title={connectorMode === 'add' ? 'افزودن مرحله از پایین این مرحله' : 'انتخاب نقطه پایین مرحله برای اتصال'}
            connectorId={bottomConnectorId}
            mode={connectorMode}
            selected={selectedConnectorId === bottomConnectorId}
            connected={connectedConnectorIds.has(bottomConnectorId)}
            onClick={() => onConnectorClick(bottomConnectorId, onInsertBelow)}
            style={connectorEdgeStyle.bottom}
          />
        </>
      ) : (
        <>
          {isFirstStage ? <ConnectorAnchor connectorId={rightConnectorId} style={connectorEdgeStyle.right} /> : null}
          <ConnectorAnchor connectorId={topConnectorId} style={connectorEdgeStyle.top} />
          <ConnectorAnchor connectorId={bottomConnectorId} style={connectorEdgeStyle.bottom} />
        </>
      )}
      <div
        className="relative flex h-full min-h-[inherit] min-w-0 items-center gap-1.5 overflow-hidden rounded-xl px-2.5 py-1"
      >
        <Avatar
          size={compact ? 20 : 24}
          src={stage.assigneeAvatarUrl}
          className="shrink-0 !border !border-white/70 !bg-white/80 !text-[10px] !font-black dark:!border-white/15 dark:!bg-slate-950/45"
          style={{ color: 'inherit' }}
        >
          {getAssigneeInitial(stage.assigneeLabel)}
        </Avatar>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className={`${sizeMode === 'expanded' ? 'whitespace-nowrap' : 'truncate'} flex min-w-0 items-center gap-1 text-[11px] font-black leading-5`}>
            <span className="inline-flex shrink-0 items-center justify-center text-[11px]" aria-label={visual.label}>
              {visual.icon}
            </span>
            <span className={sizeMode === 'expanded' ? 'whitespace-nowrap' : 'truncate'}>
              {stage.title}
            </span>
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[9.5px] font-semibold leading-4 opacity-85">
            <span className="truncate">{activityLabel}</span>
            <span className="shrink-0 opacity-50">•</span>
            <span className="truncate">{stage.dueLabel || 'بدون موعد'}</span>
            <span className="shrink-0 opacity-50">•</span>
            <span className="shrink-0">{actionLabel}</span>
          </div>
        </div>
        {!readOnlySurface ? (
          <>
            <div
              className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-0.5 rounded-full bg-white/90 px-1 shadow-sm opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-slate-900/90 sm:flex"
              onClick={(event) => event.stopPropagation()}
            >
              <Tooltip title="جابجایی با کشیدن">
                <button
                  type="button"
                  draggable
                  aria-label="جابجایی مرحله"
                  onDragStart={(event) => onDragStart(event, { laneId, stageId: stage.id })}
                  onDragEnd={onDragEnd}
                  onClick={(event) => event.stopPropagation()}
                  className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:cursor-grabbing dark:text-slate-300 dark:hover:bg-white/10"
                >
                  <HolderOutlined />
                </button>
              </Tooltip>
              <IconButton title="کپی مرحله" icon={<CopyOutlined />} onClick={onCopy} />
              <IconButton title="حذف مرحله" icon={<DeleteOutlined />} danger onClick={onDelete} />
            </div>
            <span className="shrink-0 sm:hidden" onClick={(event) => event.stopPropagation()}>
              <ActionOverflow items={actionItems} />
            </span>
          </>
        ) : null}
      </div>
    </div>
  );
});

ProcessStagePill.displayName = 'ProcessStagePill';

const InterStageDot = memo(({
  title,
  connectorId,
  onClick,
  compact,
  isBetween,
  connectorMode,
  selectedConnectorId,
  connectedConnectorIds,
  onConnectorClick,
  isDropTarget,
  dropTargetSlot,
  onDragEnterSlot,
  onDropOnSlot,
}: {
  title: string;
  connectorId: string;
  onClick: () => void;
  compact: boolean;
  isBetween?: boolean;
  connectorMode: ConnectorMode;
  selectedConnectorId?: string | null;
  connectedConnectorIds: Set<string>;
  onConnectorClick: (connectorId: string, insertStage: () => void) => void;
  isDropTarget?: boolean;
  dropTargetSlot?: number;
  onDragEnterSlot?: (slot: number) => void;
  onDropOnSlot?: (event: React.DragEvent<HTMLElement>, targetSlot: number) => void;
}) => (
  <div
    className={`relative z-[4] flex w-5 shrink-0 items-center justify-center rounded-lg transition ${isDropTarget ? 'bg-[rgba(var(--brand-100-rgb),0.58)] dark:bg-[rgba(var(--brand-500-rgb),0.18)]' : ''}`}
    onDragEnter={() => {
      if (typeof dropTargetSlot === 'number') onDragEnterSlot?.(dropTargetSlot);
    }}
    onDragOver={(event) => {
      if (typeof dropTargetSlot !== 'number') return;
      event.preventDefault();
      onDragEnterSlot?.(dropTargetSlot);
    }}
    onDrop={(event) => {
      if (typeof dropTargetSlot === 'number') onDropOnSlot?.(event, dropTargetSlot);
    }}
    style={{ height: compact ? 40 : 58 }}
  >
    {isBetween ? (
      <span className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-slate-300 dark:bg-white/20" />
    ) : null}
    {isDropTarget ? (
      <span className="pointer-events-none absolute top-1/2 h-9 w-1 -translate-y-1/2 rounded-full bg-[rgb(var(--brand-600-rgb))] shadow-sm dark:bg-[rgb(var(--brand-300-rgb))]" />
    ) : null}
    {connectorMode !== 'idle' ? (
      <ConnectionDot
        connectorId={connectorId}
        title={title}
        mode={connectorMode}
        selected={selectedConnectorId === connectorId}
        connected={connectedConnectorIds.has(connectorId)}
        onClick={() => onConnectorClick(connectorId, onClick)}
      />
    ) : (
      <ConnectorAnchor connectorId={connectorId} style={connectorCenterStyle} />
    )}
  </div>
));

InterStageDot.displayName = 'InterStageDot';

const EdgeDropMarker = memo(({
  side,
  compact,
  slot,
  isDropTarget,
  onDragEnterSlot,
  onDropOnSlot,
}: {
  side: 'start' | 'end';
  compact: boolean;
  slot: number;
  isDropTarget: boolean;
  onDragEnterSlot: (slot: number) => void;
  onDropOnSlot: (event: React.DragEvent<HTMLElement>, targetSlot: number) => void;
}) => (
  <div
    className={`relative z-[4] flex w-4 shrink-0 items-center justify-center rounded-lg transition ${isDropTarget ? 'bg-[rgba(var(--brand-100-rgb),0.58)] dark:bg-[rgba(var(--brand-500-rgb),0.18)]' : ''}`}
    style={{ height: compact ? 40 : 58 }}
    aria-label={side === 'start' ? 'محل قرارگیری در ابتدای ردیف' : 'محل قرارگیری در انتهای ردیف'}
    onDragEnter={() => onDragEnterSlot(slot)}
    onDragOver={(event) => {
      event.preventDefault();
      onDragEnterSlot(slot);
    }}
    onDrop={(event) => onDropOnSlot(event, slot)}
  >
    <span className={`pointer-events-none h-9 w-1 rounded-full transition ${isDropTarget ? 'bg-[rgb(var(--brand-600-rgb))] shadow-sm dark:bg-[rgb(var(--brand-300-rgb))]' : 'bg-transparent'}`} />
  </div>
));

EdgeDropMarker.displayName = 'EdgeDropMarker';

const StageSlotSpacer = memo(({
  compact,
  sizeMode,
  stageSlotCount,
  slot,
  isDropTarget,
  onDragEnterSlot,
  onDropOnSlot,
}: {
  compact: boolean;
  sizeMode: StageSizeMode;
  stageSlotCount: number;
  slot: number;
  isDropTarget: boolean;
  onDragEnterSlot: (slot: number) => void;
  onDropOnSlot: (event: React.DragEvent<HTMLElement>, targetSlot: number) => void;
}) => {
  const stageHeight = compact ? 40 : 58;
  const fitClass = sizeMode === 'fit'
    ? 'min-w-0 shrink-0'
    : 'shrink-0';

  return (
    <div
      className={`rounded-xl border border-dashed transition ${isDropTarget ? 'border-[rgb(var(--brand-500-rgb))] bg-[rgba(var(--brand-100-rgb),0.46)] ring-2 ring-[rgba(var(--brand-500-rgb),0.18)] dark:border-[rgb(var(--brand-300-rgb))] dark:bg-[rgba(var(--brand-500-rgb),0.16)]' : 'border-transparent'} ${fitClass}`}
      onDragEnter={() => onDragEnterSlot(slot)}
      onDragOver={(event) => {
        event.preventDefault();
        onDragEnterSlot(slot);
      }}
      onDrop={(event) => onDropOnSlot(event, slot)}
      style={{
        width: sizeMode === 'expanded' ? 220 : undefined,
        flexBasis: sizeMode === 'fit' ? getFitStageWidth(stageSlotCount) : undefined,
        height: stageHeight,
      }}
      aria-hidden="true"
    />
  );
});

StageSlotSpacer.displayName = 'StageSlotSpacer';

const LaneDropMarker = memo(({
  laneId,
  edge,
  active,
  visible,
  onDragEnter,
  onDrop,
}: {
  laneId: string;
  edge: 'before' | 'after';
  active: boolean;
  visible: boolean;
  onDragEnter: (laneId: string, edge: 'before' | 'after') => void;
  onDrop: (event: React.DragEvent<HTMLElement>, laneId: string, edge: 'before' | 'after') => void;
}) => {
  const canAcceptLane = (event: React.DragEvent<HTMLElement>) => (
    Array.from(event.dataTransfer.types).includes('application/x-process-lane')
  );

  return (
    <div
      className={`relative h-3 transition ${active || visible ? 'opacity-100' : 'opacity-0 hover:opacity-100'}`}
      onDragEnter={(event) => {
        if (!canAcceptLane(event)) return;
        event.preventDefault();
        onDragEnter(laneId, edge);
      }}
      onDragOver={(event) => {
        if (!canAcceptLane(event)) return;
        event.preventDefault();
        onDragEnter(laneId, edge);
      }}
      onDrop={(event) => {
        if (!canAcceptLane(event)) return;
        onDrop(event, laneId, edge);
      }}
      aria-label={edge === 'before' ? 'محل قرارگیری ردیف در بالا' : 'محل قرارگیری ردیف در پایین'}
    >
      <span
        className={`pointer-events-none absolute inset-x-3 top-1/2 h-1 -translate-y-1/2 rounded-full transition ${
          active
            ? 'bg-[rgb(var(--brand-600-rgb))] shadow-sm dark:bg-[rgb(var(--brand-300-rgb))]'
            : 'bg-slate-200/70 dark:bg-white/10'
        }`}
      />
    </div>
  );
});

LaneDropMarker.displayName = 'LaneDropMarker';

const ProcessLaneRow = memo(({
  lane,
  cardMode,
  compact,
  column,
  readOnlySurface,
  sizeMode,
  stageSlotCount,
  dropSlotPreview,
  onUpdateTitle,
  onToggleCollapse,
  onDelete,
  onCopy,
  onInsertStageBefore,
  onInsertStageAfter,
  onInsertStageAbove,
  onInsertStageBelow,
  connectorMode,
  selectedConnectorId,
  connectedConnectorIds,
  onConnectorClick,
  onStageDragStart,
  onStageDragEnd,
  onDragEnterSlot,
  onDropStageOnSlot,
  onLaneDragStart,
  onLaneDragEnd,
  onOpenStageDetails,
  onCopyStage,
  onDeleteStage,
}: {
  lane: ProcessV2Lane;
  cardMode: ProcessV2CardMode;
  compact: boolean;
  column: boolean;
  readOnlySurface: boolean;
  sizeMode: StageSizeMode;
  stageSlotCount: number;
  dropSlotPreview: DropSlotPreview;
  onUpdateTitle: (title: string) => void;
  onToggleCollapse: () => void;
  onDelete: () => void;
  onCopy?: () => void;
  onInsertStageBefore: (stageId: string) => void;
  onInsertStageAfter: (stageId: string | null) => void;
  onInsertStageAbove: (stageId: string) => void;
  onInsertStageBelow: (stageId: string) => void;
  connectorMode: ConnectorMode;
  selectedConnectorId?: string | null;
  connectedConnectorIds: Set<string>;
  onConnectorClick: (connectorId: string, insertStage: () => void) => void;
  onStageDragStart: (event: React.DragEvent<HTMLElement>, payload: StageDragPayload) => void;
  onStageDragEnd: () => void;
  onDragEnterSlot: (laneId: string, slot: number) => void;
  onDropStageOnSlot: (event: React.DragEvent<HTMLElement>, targetSlot: number) => void;
  onLaneDragStart: (event: React.DragEvent<HTMLElement>, payload: LaneDragPayload) => void;
  onLaneDragEnd: () => void;
  onOpenStageDetails: (stage: ProcessV2Stage, laneTitle: string) => void;
  onCopyStage: (stageId: string) => void;
  onDeleteStage: (stageId: string) => void;
}) => {
  const stageEntries = useMemo(() => {
    const usedSlots = new Set<number>();
    return lane.stages.map((stage, index) => {
      let slot = Math.min(getStageLayoutSlot(stage, index), stageSlotCount - 1);
      while (usedSlots.has(slot) && slot < stageSlotCount - 1) slot += 1;
      usedSlots.add(slot);
      return { stage, slot };
    }).sort((first, second) => first.slot - second.slot);
  }, [lane.stages, stageSlotCount]);
  const stageEntriesBySlot = useMemo(
    () => new Map(stageEntries.map((entry) => [entry.slot, entry])),
    [stageEntries],
  );
  const firstStageId = stageEntries[0]?.stage.id;
  const laneActionItems: MenuProps['items'] = [
    ...(cardMode === 'run' && onCopy ? [{ key: 'copy-lane', label: 'کپی ردیف', icon: <CopyOutlined />, onClick: onCopy }] : []),
    { key: 'delete-lane', label: 'حذف ردیف', icon: <DeleteOutlined />, danger: true, onClick: onDelete },
    { key: 'toggle-lane', label: lane.collapsed ? 'باز کردن ردیف' : 'بستن ردیف', icon: lane.collapsed ? <LeftOutlined /> : <DownOutlined />, onClick: onToggleCollapse },
  ];

  return (
    <section
      className={`max-w-full overflow-visible rounded-xl transition ${
        readOnlySurface
          ? 'border border-transparent bg-transparent p-0.5 shadow-none'
          : 'border border-slate-200 bg-white/90 p-1.5 shadow-sm dark:border-white/10 dark:bg-white/[0.04]'
      }`}
    >
      {!readOnlySurface ? (
        <div className="flex min-w-0 items-center gap-2 px-1 pb-1">
          <Tooltip title="جابجایی ردیف">
            <button
              type="button"
              draggable
              aria-label="جابجایی ردیف"
              onDragStart={(event) => onLaneDragStart(event, { laneId: lane.id })}
              onDragEnd={onLaneDragEnd}
              className="inline-flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:cursor-grabbing dark:text-slate-300 dark:hover:bg-white/10"
            >
              <HolderOutlined />
            </button>
          </Tooltip>
          <InlineTitle value={lane.title} onSave={onUpdateTitle} className="max-w-[260px] flex-1 text-[12px]" />
          <div className="hidden items-center gap-1 sm:flex" style={{ marginInlineStart: 'auto' }}>
            {cardMode === 'run' && onCopy ? <IconButton title="کپی ردیف" icon={<CopyOutlined />} onClick={onCopy} /> : null}
            <IconButton title="حذف ردیف" icon={<DeleteOutlined />} danger onClick={onDelete} />
            <IconButton title={lane.collapsed ? 'باز کردن ردیف' : 'بستن ردیف'} icon={lane.collapsed ? <LeftOutlined /> : <DownOutlined />} onClick={onToggleCollapse} />
          </div>
          <span className="sm:hidden" style={{ marginInlineStart: 'auto' }}>
            <ActionOverflow items={laneActionItems} />
          </span>
        </div>
      ) : null}

      {readOnlySurface || !lane.collapsed ? (
        <div className={`max-w-full overflow-visible ${readOnlySurface ? 'px-0 py-0' : 'px-1 py-1'}`}>
          <div className={`relative flex items-center rounded-xl bg-slate-50/80 ${column || sizeMode === 'expanded' ? 'min-w-max' : 'min-w-0'} ${readOnlySurface ? 'gap-1 px-1 py-1' : `gap-2 px-2 ${compact ? 'py-2' : 'py-3'}`} dark:bg-white/[0.025]`}>
            {!readOnlySurface ? (
              <EdgeDropMarker
                side="start"
                compact={compact}
                slot={0}
                isDropTarget={dropSlotPreview?.laneId === lane.id && dropSlotPreview.slot === 0}
                onDragEnterSlot={(targetSlot) => onDragEnterSlot(lane.id, targetSlot)}
                onDropOnSlot={onDropStageOnSlot}
              />
            ) : null}
            {Array.from({ length: stageSlotCount }).map((_, slot) => {
              const entry = stageEntriesBySlot.get(slot);
              const nextEntry = stageEntries.find((candidate) => candidate.slot > slot);
              return (
                <React.Fragment key={`${lane.id}_slot_${slot}`}>
                  {entry ? (
                    <ProcessStagePill
                      stage={entry.stage}
                      laneId={lane.id}
                      slot={slot}
                      isFirstStage={entry.stage.id === firstStageId}
                      compact={compact}
                      readOnlySurface={readOnlySurface}
                      sizeMode={sizeMode}
                      stageSlotCount={stageSlotCount}
                      onCopy={() => onCopyStage(entry.stage.id)}
                      onDelete={() => onDeleteStage(entry.stage.id)}
                      onInsertBefore={() => onInsertStageBefore(entry.stage.id)}
                      onInsertAfter={() => onInsertStageAfter(entry.stage.id)}
                      onInsertAbove={() => onInsertStageAbove(entry.stage.id)}
                      onInsertBelow={() => onInsertStageBelow(entry.stage.id)}
                      connectorMode={connectorMode}
                      selectedConnectorId={selectedConnectorId}
                      connectedConnectorIds={connectedConnectorIds}
                      onConnectorClick={onConnectorClick}
                      onDragStart={onStageDragStart}
                      onDragEnd={onStageDragEnd}
                      onOpenDetails={() => onOpenStageDetails(entry.stage, lane.title)}
                    />
                  ) : (
                    readOnlySurface ? null : (
                      <StageSlotSpacer
                        compact={readOnlySurface ? true : compact}
                        sizeMode={sizeMode}
                        stageSlotCount={stageSlotCount}
                        slot={slot}
                        isDropTarget={dropSlotPreview?.laneId === lane.id && dropSlotPreview.slot === slot}
                        onDragEnterSlot={(targetSlot) => onDragEnterSlot(lane.id, targetSlot)}
                        onDropOnSlot={onDropStageOnSlot}
                      />
                    )
                  )}
                  {slot < stageSlotCount - 1 ? (
                    entry ? (
                      <InterStageDot
                        title={nextEntry && nextEntry.slot === slot + 1 ? 'افزودن یا اتصال بین دو مرحله' : 'افزودن یا اتصال در انتهای این جایگاه'}
                        connectorId={`${lane.id}:${entry.stage.id}:after`}
                        onClick={() => onInsertStageAfter(entry.stage.id)}
                        compact={readOnlySurface ? true : compact}
                        isBetween={Boolean(nextEntry && nextEntry.slot === slot + 1)}
                        isDropTarget={dropSlotPreview?.laneId === lane.id && dropSlotPreview.slot === slot + 1}
                        dropTargetSlot={slot + 1}
                        onDragEnterSlot={(targetSlot) => onDragEnterSlot(lane.id, targetSlot)}
                        onDropOnSlot={onDropStageOnSlot}
                        connectorMode={readOnlySurface ? 'idle' : connectorMode}
                        selectedConnectorId={selectedConnectorId}
                        connectedConnectorIds={connectedConnectorIds}
                        onConnectorClick={onConnectorClick}
                      />
                    ) : (
                      readOnlySurface ? null : (
                        <InterStageDot
                          title="محل قرارگیری بین جایگاه ها"
                          connectorId={`${lane.id}:empty-slot-${slot}:after`}
                          onClick={() => onInsertStageAfter(null)}
                          compact={readOnlySurface ? true : compact}
                          isBetween={false}
                          isDropTarget={dropSlotPreview?.laneId === lane.id && dropSlotPreview.slot === slot + 1}
                          dropTargetSlot={slot + 1}
                          onDragEnterSlot={(targetSlot) => onDragEnterSlot(lane.id, targetSlot)}
                          onDropOnSlot={onDropStageOnSlot}
                          connectorMode={connectorMode}
                          selectedConnectorId={selectedConnectorId}
                          connectedConnectorIds={connectedConnectorIds}
                          onConnectorClick={onConnectorClick}
                        />
                      )
                    )
                  ) : null}
                </React.Fragment>
              );
            })}
            {!readOnlySurface ? (
              <EdgeDropMarker
                side="end"
                compact={readOnlySurface ? true : compact}
                slot={stageSlotCount}
                isDropTarget={dropSlotPreview?.laneId === lane.id && dropSlotPreview.slot === stageSlotCount}
                onDragEnterSlot={(targetSlot) => onDragEnterSlot(lane.id, targetSlot)}
                onDropOnSlot={onDropStageOnSlot}
              />
            ) : null}
            {!readOnlySurface && lane.stages.length === 0 ? (
              <InterStageDot
                title="افزودن اولین مرحله در این ردیف"
                connectorId={`${lane.id}:empty:first`}
                onClick={() => onInsertStageAfter(null)}
                compact={compact}
                connectorMode={connectorMode}
                selectedConnectorId={selectedConnectorId}
                connectedConnectorIds={connectedConnectorIds}
                onConnectorClick={onConnectorClick}
              />
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
});

ProcessLaneRow.displayName = 'ProcessLaneRow';

const SharedProcessActivator = memo(({
  mode,
  onInsertFirstStage,
  readOnlySurface,
  connectorMode,
  selectedConnectorId,
  connectedConnectorIds,
  onConnectorClick,
}: {
  mode: ProcessV2CardMode;
  onInsertFirstStage: () => void;
  readOnlySurface: boolean;
  connectorMode: ConnectorMode;
  selectedConnectorId?: string | null;
  connectedConnectorIds: Set<string>;
  onConnectorClick: (connectorId: string, insertStage: () => void) => void;
}) => {
  const [enabled, setEnabled] = useState(mode === 'template');
  useEffect(() => {
    setEnabled(mode === 'template');
  }, [mode]);

  const activatorColor = 'rgb(var(--brand-600-rgb))';
  const title = mode === 'template'
    ? (enabled ? 'تنظیم فعال کننده فعال است' : 'تنظیم فعال کننده غیرفعال است')
    : (enabled ? 'ارجاع خودکار فعال است' : 'ارجاع خودکار فرآیند');

  return (
    <div className={`relative flex shrink-0 items-center justify-center self-stretch ${readOnlySurface ? 'w-10 px-0.5' : 'w-16 px-2'}`}>
      <div className={`relative shrink-0 ${readOnlySurface ? 'h-8 w-8' : 'h-9 w-9'}`}>
        {!readOnlySurface && connectorMode !== 'idle' ? (
          <>
            <ConnectionDot
              title={connectorMode === 'add' ? 'افزودن مرحله از بالای فعال کننده' : 'انتخاب نقطه بالای فعال کننده برای اتصال'}
              connectorId="activator:top"
              mode={connectorMode}
              selected={selectedConnectorId === 'activator:top'}
              connected={connectedConnectorIds.has('activator:top')}
              style={connectorEdgeStyle.top}
              onClick={() => onConnectorClick('activator:top', onInsertFirstStage)}
            />
            <ConnectionDot
              title={connectorMode === 'add' ? 'افزودن مرحله از سمت چپ فعال کننده' : 'انتخاب نقطه سمت چپ فعال کننده برای اتصال'}
              connectorId="activator:left"
              mode={connectorMode}
              selected={selectedConnectorId === 'activator:left'}
              connected={connectedConnectorIds.has('activator:left')}
              style={connectorEdgeStyle.left}
              onClick={() => onConnectorClick('activator:left', onInsertFirstStage)}
            />
            <ConnectionDot
              title={connectorMode === 'add' ? 'افزودن مرحله از پایین فعال کننده' : 'انتخاب نقطه پایین فعال کننده برای اتصال'}
              connectorId="activator:bottom"
              mode={connectorMode}
              selected={selectedConnectorId === 'activator:bottom'}
              connected={connectedConnectorIds.has('activator:bottom')}
              style={connectorEdgeStyle.bottom}
              onClick={() => onConnectorClick('activator:bottom', onInsertFirstStage)}
            />
          </>
        ) : (
          <>
            <ConnectorAnchor connectorId="activator:top" style={connectorEdgeStyle.top} />
            <ConnectorAnchor connectorId="activator:left" style={connectorEdgeStyle.left} />
            <ConnectorAnchor connectorId="activator:bottom" style={connectorEdgeStyle.bottom} />
          </>
        )}
        <Tooltip title={title}>
          <Button
            shape="circle"
            size="small"
            icon={mode === 'template' ? <ThunderboltOutlined /> : <PlayCircleOutlined />}
            aria-label={mode === 'template' ? 'تنظیم فعال کننده' : 'ارجاع خودکار فرآیند'}
            onClick={readOnlySurface ? undefined : () => setEnabled((current) => !current)}
            className={`!absolute !inset-0 !z-[4] !inline-flex !shrink-0 !items-center !justify-center [&_.ant-btn-icon]:!inline-flex [&_.ant-btn-icon]:!items-center [&_.ant-btn-icon]:!justify-center ${readOnlySurface ? '!h-8 !w-8' : '!h-9 !w-9'}`}
            style={enabled
              ? { borderColor: activatorColor, background: activatorColor, color: '#fff' }
              : { borderColor: 'rgba(var(--brand-600-rgb),0.38)', background: 'rgba(var(--brand-50-rgb),0.7)', color: activatorColor }}
          />
        </Tooltip>
      </div>
    </div>
  );
});

SharedProcessActivator.displayName = 'SharedProcessActivator';

const ProcessCardsV2: React.FC<ProcessCardsV2Props> = ({
  item,
  templates = [],
  variant = 'full',
  onChange,
  onDelete,
  onCopy,
  onAddRun,
}) => {
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [stageSizeMode, setStageSizeMode] = useState<StageSizeMode>('fit');
  const [connectorMode, setConnectorMode] = useState<ConnectorMode>('idle');
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>(null);
  const [connectedConnectorIds, setConnectedConnectorIds] = useState<Set<string>>(() => new Set());
  const [connectionPairs, setConnectionPairs] = useState<ConnectorPair[]>([]);
  const [selectedConnectionPairId, setSelectedConnectionPairId] = useState<string | null>(null);
  const [connectorPositions, setConnectorPositions] = useState<Record<string, ConnectorPoint>>({});
  const [dropSlotPreview, setDropSlotPreview] = useState<DropSlotPreview>(null);
  const [dropLanePreview, setDropLanePreview] = useState<DropLanePreview>(null);
  const [draggingLaneId, setDraggingLaneId] = useState<string | null>(null);
  const [activeStageModal, setActiveStageModal] = useState<ActiveStageModal>(null);
  const compact = variant === 'compact';
  const column = variant === 'column';
  const readOnlySurface = compact || column;
  const computedStatus = getProcessComputedStatus(item);
  const computedStatusView = processStatusVisual[computedStatus];
  const stageSlotCount = useMemo(
    () => Math.max(
      1,
      ...item.lanes.map((lane) => lane.stages.length),
      ...item.lanes.flatMap((lane) => lane.stages.map((stage, index) => getStageLayoutSlot(stage, index) + 1)),
    ),
    [item.lanes],
  );
  const templateOptions = useMemo(
    () => templates.map((template) => ({ value: template.id, label: template.title })),
    [templates],
  );
  const defaultActivatorPair = useMemo<ConnectorPair | null>(() => {
    const firstLaneWithStage = item.lanes.find((lane) => lane.stages.length > 0);
    if (!firstLaneWithStage) return null;
    const firstStage = sortStagesByLayoutSlot(firstLaneWithStage.stages)[0];
    if (!firstStage) return null;
    return {
      id: 'default-activator-start',
      from: 'activator:left',
      to: `${firstStage.id}:right`,
    };
  }, [item.lanes]);
  const visibleConnectionPairs = useMemo(
    () => defaultActivatorPair ? [defaultActivatorPair, ...connectionPairs] : connectionPairs,
    [connectionPairs, defaultActivatorPair],
  );
  const visibleConnectedConnectorIds = useMemo(() => {
    const next = new Set(connectedConnectorIds);
    if (defaultActivatorPair) {
      next.add(defaultActivatorPair.from);
      next.add(defaultActivatorPair.to);
    }
    return next;
  }, [connectedConnectorIds, defaultActivatorPair]);

  const updateItem = useCallback((updater: (current: ProcessV2CardData) => ProcessV2CardData) => {
    onChange?.(updater(item));
  }, [item, onChange]);

  const updateLane = useCallback((laneId: string, updater: (lane: ProcessV2Lane) => ProcessV2Lane) => {
    updateItem((current) => ({
      ...current,
      lanes: current.lanes.map((lane) => (lane.id === laneId ? updater(lane) : lane)),
    } as ProcessV2CardData));
  }, [updateItem]);

  const toggleStageSizeMode = useCallback(() => {
    setStageSizeMode((current) => current === 'fit' ? 'expanded' : 'fit');
  }, []);

  const toggleConnectorMode = useCallback((mode: Exclude<ConnectorMode, 'idle'>) => {
    setConnectorMode((current) => {
      const next = current === mode ? 'idle' : mode;
      if (next !== 'connect') setSelectedConnectorId(null);
      return next;
    });
  }, []);

  const measureConnectors = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const bodyRect = body.getBoundingClientRect();
    const nextPositions: Record<string, ConnectorPoint> = {};
    body.querySelectorAll<HTMLElement>('[data-process-connector]').forEach((element) => {
      const connectorId = element.dataset.processConnector;
      if (!connectorId) return;
      const rect = element.getBoundingClientRect();
      nextPositions[connectorId] = {
        x: rect.left - bodyRect.left + rect.width / 2,
        y: rect.top - bodyRect.top + rect.height / 2,
      };
    });
    setConnectorPositions(nextPositions);
  }, []);

  const handleConnectorClick = useCallback((connectorId: string, insertStage: () => void) => {
    if (connectorMode === 'add') {
      insertStage();
      return;
    }

    if (connectorMode !== 'connect') return;
    setSelectedConnectorId((current) => {
      if (!current) return connectorId;
      if (current === connectorId) return null;
      setConnectionPairs((pairs) => [
        ...pairs,
        {
          id: `${current}__${connectorId}__${Date.now()}`,
          from: current,
          to: connectorId,
        },
      ]);
      setConnectedConnectorIds((connected) => {
        const next = new Set(connected);
        next.add(current);
        next.add(connectorId);
        return next;
      });
      return null;
    });
  }, [connectorMode]);

  const deleteConnectionPair = useCallback((pairId: string) => {
    setConnectionPairs((pairs) => {
      const remainingPairs = pairs.filter((pair) => pair.id !== pairId);
      const remainingConnectorIds = new Set<string>();
      remainingPairs.forEach((pair) => {
        remainingConnectorIds.add(pair.from);
        remainingConnectorIds.add(pair.to);
      });
      setConnectedConnectorIds(remainingConnectorIds);
      return remainingPairs;
    });
    setSelectedConnectionPairId(null);
  }, []);

  const handleStageDragStart = useCallback((event: React.DragEvent<HTMLElement>, payload: StageDragPayload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-process-stage', JSON.stringify(payload));
  }, []);

  const handleStageDragEnd = useCallback(() => {
    setDropSlotPreview(null);
  }, []);

  const handleLaneDragStart = useCallback((event: React.DragEvent<HTMLElement>, payload: LaneDragPayload) => {
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-process-lane', JSON.stringify(payload));
    setDraggingLaneId(payload.laneId);
  }, []);

  const handleLaneDragEnd = useCallback(() => {
    setDropLanePreview(null);
    setDraggingLaneId(null);
  }, []);

  const handleDragEnterLane = useCallback((laneId: string, edge: 'before' | 'after') => {
    setDropLanePreview({ laneId, edge });
  }, []);

  const handleDragEnterSlot = useCallback((laneId: string, slot: number) => {
    setDropSlotPreview({ laneId, slot });
  }, []);

  const moveStageToSlot = useCallback((sourceLaneId: string, stageId: string, targetLaneId: string, targetSlot: number) => {
    updateItem((current) => {
      const lanes = current.lanes.map((lane) => ({ ...lane, stages: [...lane.stages] }));
      const sourceLaneIndex = lanes.findIndex((lane) => lane.id === sourceLaneId);
      const targetLaneIndex = lanes.findIndex((lane) => lane.id === targetLaneId);
      if (sourceLaneIndex < 0 || targetLaneIndex < 0) return current;

      const sourceStageIndex = lanes[sourceLaneIndex].stages.findIndex((stage) => stage.id === stageId);
      if (sourceStageIndex < 0) return current;
      const [stage] = lanes[sourceLaneIndex].stages.splice(sourceStageIndex, 1);
      const normalizedTargetSlot = Math.max(0, Math.floor(targetSlot));
      stage.layoutSlot = normalizedTargetSlot;

      lanes[targetLaneIndex].stages = sortStagesByLayoutSlot([
        ...shiftStagesFromSlot(lanes[targetLaneIndex].stages, normalizedTargetSlot),
        stage,
      ]);
      return { ...current, lanes } as ProcessV2CardData;
    });
  }, [updateItem]);

  const handleStageDropOnSlot = useCallback((event: React.DragEvent<HTMLElement>, targetLaneId: string, targetSlot: number) => {
    event.preventDefault();
    event.stopPropagation();
    setDropSlotPreview(null);
    const rawPayload = event.dataTransfer.getData('application/x-process-stage');
    if (!rawPayload) return;
    try {
      const payload = JSON.parse(rawPayload) as StageDragPayload;
      if (!payload?.laneId || !payload?.stageId) return;
      moveStageToSlot(payload.laneId, payload.stageId, targetLaneId, targetSlot);
    } catch {
      return;
    }
  }, [moveStageToSlot]);

  const moveLaneToEdge = useCallback((sourceLaneId: string, targetLaneId: string, edge: 'before' | 'after') => {
    if (sourceLaneId === targetLaneId) return;
    updateItem((current) => {
      const lanes = [...current.lanes];
      const sourceIndex = lanes.findIndex((lane) => lane.id === sourceLaneId);
      const targetIndex = lanes.findIndex((lane) => lane.id === targetLaneId);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const [lane] = lanes.splice(sourceIndex, 1);
      const targetIndexAfterRemoval = lanes.findIndex((candidate) => candidate.id === targetLaneId);
      if (targetIndexAfterRemoval < 0) return current;
      const insertIndex = edge === 'before' ? targetIndexAfterRemoval : targetIndexAfterRemoval + 1;
      lanes.splice(insertIndex, 0, lane);
      return { ...current, lanes } as ProcessV2CardData;
    });
  }, [updateItem]);

  const handleLaneDrop = useCallback((event: React.DragEvent<HTMLElement>, targetLaneId: string, edge: 'before' | 'after') => {
    event.preventDefault();
    event.stopPropagation();
    setDropLanePreview(null);
    setDraggingLaneId(null);
    const rawPayload = event.dataTransfer.getData('application/x-process-lane');
    if (!rawPayload) return;
    try {
      const payload = JSON.parse(rawPayload) as LaneDragPayload;
      if (!payload?.laneId) return;
      moveLaneToEdge(payload.laneId, targetLaneId, edge);
    } catch {
      return;
    }
  }, [moveLaneToEdge]);

  useLayoutEffect(() => {
    measureConnectors();
  }, [connectorMode, connectionPairs, item, measureConnectors, stageSizeMode, variant]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return undefined;
    const scrollParent = body.parentElement;

    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => measureConnectors())
      : null;
    observer?.observe(body);
    scrollParent?.addEventListener('scroll', measureConnectors, { passive: true });
    body.querySelectorAll<HTMLElement>('*').forEach((element) => {
      if (element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight) {
        element.addEventListener('scroll', measureConnectors, { passive: true });
      }
    });
    window.addEventListener('resize', measureConnectors);

    return () => {
      observer?.disconnect();
      scrollParent?.removeEventListener('scroll', measureConnectors);
      body.querySelectorAll<HTMLElement>('*').forEach((element) => {
        element.removeEventListener('scroll', measureConnectors);
      });
      window.removeEventListener('resize', measureConnectors);
    };
  }, [measureConnectors, connectorMode, item.lanes.length]);

  const addLane = useCallback(() => {
    updateItem((current) => ({
      ...current,
      lanes: [
        ...current.lanes,
        {
          id: nextLocalId('lane'),
          title: 'ردیف جدید',
          stages: [],
        },
      ],
    } as ProcessV2CardData));
  }, [updateItem]);

  const selectedConnectionPair = useMemo(
    () => connectionPairs.find((pair) => pair.id === selectedConnectionPairId),
    [connectionPairs, selectedConnectionPairId],
  );

  const insertStageBefore = useCallback((laneId: string, stageId: string) => {
    updateLane(laneId, (lane) => {
      const index = lane.stages.findIndex((stage) => stage.id === stageId);
      const targetSlot = index >= 0 ? getStageLayoutSlot(lane.stages[index], index) : 0;
      const stages = shiftStagesFromSlot(lane.stages, targetSlot);
      return { ...lane, stages: sortStagesByLayoutSlot([...stages, createNewStage(item.mode, targetSlot)]) };
    });
  }, [item.mode, updateLane]);

  const insertStageAfter = useCallback((laneId: string, stageId: string | null) => {
    updateLane(laneId, (lane) => {
      if (!stageId) {
        const targetSlot = 0;
        const stages = shiftStagesFromSlot(lane.stages, targetSlot);
        return { ...lane, stages: sortStagesByLayoutSlot([createNewStage(item.mode, targetSlot), ...stages]) };
      }
      const index = lane.stages.findIndex((stage) => stage.id === stageId);
      if (index < 0) {
        const targetSlot = lane.stages.length;
        return { ...lane, stages: sortStagesByLayoutSlot([...lane.stages, createNewStage(item.mode, targetSlot)]) };
      }
      const targetSlot = getStageLayoutSlot(lane.stages[index], index) + 1;
      const stages = shiftStagesFromSlot(lane.stages, targetSlot);
      return { ...lane, stages: sortStagesByLayoutSlot([...stages, createNewStage(item.mode, targetSlot)]) };
    });
  }, [item.mode, updateLane]);

  const insertConnectedStageInLane = useCallback((laneId: string, sourceStageId: string, direction: 'above' | 'below') => {
    const sourceLaneIndex = item.lanes.findIndex((lane) => lane.id === laneId);
    if (sourceLaneIndex < 0) return;
    const sourceStageIndex = item.lanes[sourceLaneIndex].stages.findIndex((stage) => stage.id === sourceStageId);
    if (sourceStageIndex < 0) return;

    const sourceSlot = getStageLayoutSlot(item.lanes[sourceLaneIndex].stages[sourceStageIndex], sourceStageIndex);
    const nextStage = createNewStage(item.mode, sourceSlot);
    const sourceConnectorId = `${sourceStageId}:${direction === 'above' ? 'top' : 'bottom'}`;
    const targetConnectorId = `${nextStage.id}:${direction === 'above' ? 'bottom' : 'top'}`;

    updateItem((current) => {
      const lanes = current.lanes.map((lane) => ({ ...lane, stages: [...lane.stages] }));
      const currentSourceLaneIndex = lanes.findIndex((lane) => lane.id === laneId);
      if (currentSourceLaneIndex < 0) return current;
      const currentSourceStageIndex = lanes[currentSourceLaneIndex].stages.findIndex((stage) => stage.id === sourceStageId);
      if (currentSourceStageIndex < 0) return current;

      const requestedTargetIndex = currentSourceLaneIndex + (direction === 'above' ? -1 : 1);
      let targetLaneIndex = requestedTargetIndex;
      if (!lanes[requestedTargetIndex]) {
        const newLane: ProcessV2Lane = {
          id: nextLocalId('lane'),
          title: direction === 'above' ? 'ردیف بالایی جدید' : 'ردیف پایینی جدید',
          stages: [],
        };
        targetLaneIndex = direction === 'above' ? currentSourceLaneIndex : currentSourceLaneIndex + 1;
        lanes.splice(targetLaneIndex, 0, newLane);
      }

      const targetLane = lanes[targetLaneIndex];
      targetLane.stages = sortStagesByLayoutSlot([
        ...shiftStagesFromSlot(targetLane.stages, sourceSlot),
        nextStage,
      ]);
      return { ...current, lanes } as ProcessV2CardData;
    });

    setConnectionPairs((pairs) => [
      ...pairs,
      {
        id: `${sourceConnectorId}__${targetConnectorId}__${Date.now()}`,
        from: sourceConnectorId,
        to: targetConnectorId,
      },
    ]);
    setConnectedConnectorIds((connected) => {
      const next = new Set(connected);
      next.add(sourceConnectorId);
      next.add(targetConnectorId);
      return next;
    });
  }, [item.lanes, item.mode, updateItem]);

  const insertStageFromActivator = useCallback(() => {
    const firstLane = item.lanes[0];
    if (!firstLane) return;
    insertStageAfter(firstLane.id, null);
  }, [insertStageAfter, item.lanes]);

  const headerActions: MenuProps['items'] = item.mode === 'run'
    ? [
        { key: 'delete', label: 'حذف فرآیند', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete?.(item.id) },
        { key: 'copy', label: 'کپی فرآیند', icon: <CopyOutlined />, onClick: () => onCopy?.(item.id) },
        { key: 'info', label: 'اطلاعات اجرای فرآیند', icon: <InfoCircleOutlined /> },
        { key: 'records', label: 'مشاهده رکوردهای مرتبط', icon: <EyeOutlined /> },
        { key: 'size', label: stageSizeMode === 'fit' ? 'نمای بزرگ مراحل' : 'فیت کردن مراحل', icon: <CompressOutlined />, onClick: toggleStageSizeMode },
        { key: 'add-mode', label: connectorMode === 'add' ? 'بستن افزودن' : 'افزودن', icon: <PlusOutlined />, onClick: () => toggleConnectorMode('add') },
        { key: 'connect-mode', label: connectorMode === 'connect' ? 'بستن اتصال' : 'اتصال مرحله ها', icon: <ApartmentOutlined />, onClick: () => toggleConnectorMode('connect') },
      ]
    : [
        { key: 'delete', label: 'حذف الگو', icon: <DeleteOutlined />, danger: true, onClick: () => onDelete?.(item.id) },
        { key: 'size', label: stageSizeMode === 'fit' ? 'نمای بزرگ مراحل' : 'فیت کردن مراحل', icon: <CompressOutlined />, onClick: toggleStageSizeMode },
        { key: 'add-mode', label: connectorMode === 'add' ? 'بستن افزودن' : 'افزودن', icon: <PlusOutlined />, onClick: () => toggleConnectorMode('add') },
        { key: 'connect-mode', label: connectorMode === 'connect' ? 'بستن اتصال' : 'اتصال مرحله ها', icon: <ApartmentOutlined />, onClick: () => toggleConnectorMode('connect') },
      ];

  const editorTools = (
    <div className="flex items-center gap-1">
      <IconButton
        title={connectorMode === 'add' ? 'بستن ابزار افزودن' : 'افزودن مرحله یا ردیف'}
        icon={<PlusOutlined />}
        active={connectorMode === 'add'}
        onClick={() => toggleConnectorMode('add')}
      />
      <IconButton
        title={connectorMode === 'connect' ? 'بستن ابزار اتصال' : 'اتصال نقطه های فرآیند'}
        icon={<ApartmentOutlined />}
        active={connectorMode === 'connect'}
        onClick={() => toggleConnectorMode('connect')}
      />
    </div>
  );

  const addTools = !readOnlySurface && connectorMode === 'add' ? (
    <div className="mb-3 flex flex-wrap items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white/70 px-2 py-2 dark:border-white/10 dark:bg-white/[0.03]">
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined />}
        onClick={addLane}
        className="!rounded-full !border !border-dashed !border-slate-300 !px-4 !text-slate-600 dark:!border-white/20 dark:!text-slate-200"
      >
        افزودن ردیف جدید
      </Button>
      {onAddRun ? (
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={onAddRun}
          className="!rounded-full !border !border-dashed !border-slate-300 !px-4 !text-slate-600 dark:!border-white/20 dark:!text-slate-200"
        >
          افزودن فرآیند جدید
        </Button>
      ) : null}
    </div>
  ) : null;

  return (
    <article
      className={`relative w-full max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70 shadow-sm dark:border-white/10 dark:bg-slate-950/30 ${readOnlySurface ? 'p-1.5 sm:p-2' : 'p-2.5 sm:p-3'}`}
      dir="rtl"
    >
      {readOnlySurface ? (
        <div className="absolute left-2 top-2 z-20">
          <IconButton title={stageSizeMode === 'fit' ? 'نمای بزرگ مراحل' : 'فیت کردن مراحل'} icon={<CompressOutlined />} onClick={toggleStageSizeMode} />
        </div>
      ) : item.mode === 'run' ? (
        <div className="mb-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
          <div className="grid min-w-0 grid-cols-1 items-center gap-2 sm:flex sm:flex-wrap">
            <Select
              size="small"
              value={item.templateId}
              options={templateOptions}
              onChange={(templateId) => {
                const selected = templates.find((template) => template.id === templateId);
                updateItem((current) => current.mode === 'run' ? ({
                  ...current,
                  templateId,
                  templateTitle: selected?.title || current.templateTitle,
                }) : current);
              }}
              className="min-w-0 sm:min-w-[180px]"
              aria-label="انتخاب الگوی فرآیند"
            />
            <InlineTitle
              value={item.title}
              onSave={(title) => updateItem((current) => current.mode === 'run' ? { ...current, title } : current)}
              className="min-w-0 flex-1 text-[13px]"
            />
            <Tag className={`!m-0 !rounded-full !border !px-2.5 !py-0.5 !text-[11px] !font-black ${computedStatusView.className}`}>
              {computedStatusView.label}
            </Tag>
            <div className="hidden items-center gap-1 sm:flex" style={{ marginInlineStart: 'auto' }}>
              {editorTools}
              <IconButton title="حذف فرآیند" icon={<DeleteOutlined />} danger onClick={() => onDelete?.(item.id)} />
              <IconButton title="کپی فرآیند" icon={<CopyOutlined />} onClick={() => onCopy?.(item.id)} />
              <IconButton title="اطلاعات اجرای فرآیند" icon={<InfoCircleOutlined />} />
              <IconButton title="مشاهده رکوردهای مرتبط" icon={<EyeOutlined />} />
              <IconButton title={stageSizeMode === 'fit' ? 'نمای بزرگ مراحل' : 'فیت کردن مراحل'} icon={<CompressOutlined />} onClick={toggleStageSizeMode} />
            </div>
            <div className="flex items-center gap-1 justify-self-end sm:hidden">
              {editorTools}
            </div>
            <span className="justify-self-end sm:hidden">
              <ActionOverflow items={headerActions} />
            </span>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
          <InlineTitle
            value={item.title}
            onSave={(title) => updateItem((current) => current.mode === 'template' ? { ...current, title } : current)}
            className="min-w-0 flex-1 text-[14px]"
          />
          <Tag className={`!m-0 !rounded-full !border !px-2.5 !py-0.5 !text-[11px] !font-black ${computedStatusView.className}`}>
            {computedStatusView.label}
          </Tag>
          <div className="hidden items-center gap-1 sm:flex" style={{ marginInlineStart: 'auto' }}>
            {editorTools}
            <IconButton title="حذف الگو" icon={<DeleteOutlined />} danger onClick={() => onDelete?.(item.id)} />
            <IconButton title={stageSizeMode === 'fit' ? 'نمای بزرگ مراحل' : 'فیت کردن مراحل'} icon={<CompressOutlined />} onClick={toggleStageSizeMode} />
          </div>
          <div className="flex items-center gap-1 sm:hidden" style={{ marginInlineStart: 'auto' }}>
            {editorTools}
          </div>
          <span className="sm:hidden" style={{ marginInlineStart: 'auto' }}>
            <ActionOverflow items={headerActions} />
          </span>
        </div>
      )}

      {addTools}

      <div className="max-w-full overflow-x-auto rounded-xl border border-slate-200/80 bg-white/70 dark:border-white/10 dark:bg-white/[0.025]">
        <div ref={bodyRef} className={`relative flex min-w-full items-stretch ${readOnlySurface ? 'gap-1 p-1' : 'gap-2 p-2'} ${stageSizeMode === 'expanded' ? 'w-max' : 'w-full'}`}>
          <ConnectorLinesOverlay
            pairs={visibleConnectionPairs}
            positions={connectorPositions}
            selectedPairId={selectedConnectionPairId}
            onSelectPair={readOnlySurface ? () => undefined : setSelectedConnectionPairId}
          />
          {!readOnlySurface ? (
            <ConnectionDeleteControls
              pair={selectedConnectionPair}
              positions={connectorPositions}
              onDelete={() => {
                if (selectedConnectionPairId) deleteConnectionPair(selectedConnectionPairId);
              }}
            />
          ) : null}
          <SharedProcessActivator
            mode={item.mode}
            onInsertFirstStage={insertStageFromActivator}
            readOnlySurface={readOnlySurface}
            connectorMode={readOnlySurface ? 'idle' : connectorMode}
            selectedConnectorId={selectedConnectorId}
            connectedConnectorIds={visibleConnectedConnectorIds}
            onConnectorClick={handleConnectorClick}
          />
          <div className={`relative grid flex-1 ${readOnlySurface ? 'gap-0' : 'gap-0.5'} ${stageSizeMode === 'expanded' ? 'min-w-max' : 'min-w-0'}`}>
            {item.lanes.map((lane, laneIndex) => (
              <React.Fragment key={lane.id}>
                {!readOnlySurface ? (
                  <LaneDropMarker
                    laneId={lane.id}
                    edge="before"
                    active={dropLanePreview?.laneId === lane.id && dropLanePreview.edge === 'before'}
                    visible={Boolean(draggingLaneId && draggingLaneId !== lane.id)}
                    onDragEnter={handleDragEnterLane}
                    onDrop={handleLaneDrop}
                  />
                ) : null}
                <ProcessLaneRow
                  lane={lane}
                  cardMode={item.mode}
                  compact={compact}
                  column={column}
                  readOnlySurface={readOnlySurface}
                  sizeMode={stageSizeMode}
                  stageSlotCount={stageSlotCount}
                  dropSlotPreview={dropSlotPreview}
                  onUpdateTitle={(title) => updateLane(lane.id, (currentLane) => ({ ...currentLane, title }))}
                  onToggleCollapse={() => updateLane(lane.id, (currentLane) => ({ ...currentLane, collapsed: !currentLane.collapsed }))}
                  onDelete={() => updateItem((current) => ({ ...current, lanes: current.lanes.filter((candidate) => candidate.id !== lane.id) } as ProcessV2CardData))}
                  onCopy={item.mode === 'run' ? () => updateItem((current) => ({ ...current, lanes: [...current.lanes, cloneLane(lane)] } as ProcessV2CardData)) : undefined}
                  onInsertStageBefore={(stageId) => insertStageBefore(lane.id, stageId)}
                  onInsertStageAfter={(stageId) => insertStageAfter(lane.id, stageId)}
                  onInsertStageAbove={(stageId) => insertConnectedStageInLane(lane.id, stageId, 'above')}
                  onInsertStageBelow={(stageId) => insertConnectedStageInLane(lane.id, stageId, 'below')}
                  connectorMode={connectorMode}
                  selectedConnectorId={selectedConnectorId}
                  connectedConnectorIds={visibleConnectedConnectorIds}
                  onConnectorClick={handleConnectorClick}
                  onStageDragStart={handleStageDragStart}
                  onStageDragEnd={handleStageDragEnd}
                  onDragEnterSlot={handleDragEnterSlot}
                  onDropStageOnSlot={(event, targetSlot) => handleStageDropOnSlot(event, lane.id, targetSlot)}
                onLaneDragStart={handleLaneDragStart}
                onLaneDragEnd={handleLaneDragEnd}
                onOpenStageDetails={(stage, laneTitle) => setActiveStageModal({ stage, laneTitle })}
                onCopyStage={(stageId) => updateLane(lane.id, (currentLane) => {
                    const stage = currentLane.stages.find((candidate) => candidate.id === stageId);
                    return stage ? { ...currentLane, stages: [...currentLane.stages, cloneStage(stage)] } : currentLane;
                  })}
                  onDeleteStage={(stageId) => updateLane(lane.id, (currentLane) => ({
                    ...currentLane,
                    stages: currentLane.stages.filter((stage) => stage.id !== stageId),
                  }))}
                />
                {!readOnlySurface && laneIndex === item.lanes.length - 1 ? (
                  <LaneDropMarker
                    laneId={lane.id}
                    edge="after"
                    active={dropLanePreview?.laneId === lane.id && dropLanePreview.edge === 'after'}
                    visible={!readOnlySurface && Boolean(draggingLaneId && draggingLaneId !== lane.id)}
                    onDragEnter={handleDragEnterLane}
                    onDrop={handleLaneDrop}
                  />
                ) : null}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
      <ProcessTaskModalV2
        open={Boolean(activeStageModal)}
        process={item}
        stage={activeStageModal?.stage || null}
        laneTitle={activeStageModal?.laneTitle || null}
        onClose={() => setActiveStageModal(null)}
      />
    </article>
  );
};

export default memo(ProcessCardsV2);
