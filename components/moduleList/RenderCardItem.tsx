import React from "react";
import { Avatar, Checkbox, Popover, Tag } from "antd";
import { AppstoreOutlined, DragOutlined, LockOutlined } from "@ant-design/icons";
import { FieldType } from "../../types";
import { formatPersianPrice, toPersianNumber, safeJalaliFormat, parseDateValue } from "../../utils/persianNumberFormatter";
import { getRecordTitle } from "../../utils/recordTitle";
import { getRecordDisplayLabel } from "../../utils/recordLabel";
import { getAssigneeLabel } from "../../utils/assigneeLabel";
import { formatRecordDisplayValue, formatRecordFieldValue } from "../../utils/recordDisplayFormatter";
import { getRecordCardSummaryFields, getRecordCardTags, resolveCardStatusMeta } from "../../utils/recordCardHelpers";
import { getTaskRelationFieldKey, resolveTaskSourceLink } from "../../utils/taskMeta";
import { MODULES } from "../../moduleRegistry";
import TaskActionButtons from "../tasks/TaskActionButtons";
import { getTaskStatusOptions } from "../../utils/processTaskStatusOptions";
import { openTaskProcessModal } from "../../utils/taskProcessModalEvents";
import { buildConditionalFieldStateMap } from "../../utils/conditionalFieldRules";
import { getResolvedModuleConditionalDisplay } from "../../utils/moduleSettingsRuntime";
import ResilientImage from "../common/ResilientImage";
import AssigneeAvatarDisplay from "../common/AssigneeAvatarDisplay";
import RecordLockControl from "../recordLocks/RecordLockControl";
import { getRecordLockStateFromRecord, mergeRecordLockIntoRecord, type RecordLockState } from "../../utils/recordLockRuntime";
import { supabase } from "../../supabaseClient";
import { hasProcessTaskTitleTokens, resolveProcessTaskTitle } from "../../utils/processTaskTitle";

const ProductionStagesField = React.lazy(() => import("../ProductionStagesField"));
const ProcessCardsV2RuntimeBlock = React.lazy(() => import("../processes/ProcessCardsV2RuntimeBlock"));

export interface RenderCardItemProps {
  item: any;
  moduleId: string;
  moduleConfig: any;
  imageField?: string;
  tagsField?: string;
  statusField?: string;
  categoryField?: string;
  allUsers?: any[];
  allRoles?: any[];
  selectedRowKeys: React.Key[];
  setSelectedRowKeys: (keys: React.Key[]) => void;
  navigate: (path: string) => void;
  minimal?: boolean;
  hideSelection?: boolean;
  canViewField?: (fieldKey: string) => boolean;
  relationOptions?: Record<string, any[]>;
  showDragHandle?: boolean;
  isDragActive?: boolean;
  dragHandleTitle?: string;
  onDragHandlePointerDown?: (item: any, event: React.PointerEvent<HTMLButtonElement>) => void;
  moduleBadgeLabel?: string | null;
  canLockRecord?: boolean;
  canUnlockRecord?: boolean;
}

const getAdaptiveCardTitleClassName = (value: unknown, minimal = false) => {
  const length = String(value || '').trim().length;
  const sizeClass = length > 90
    ? 'text-[11px]'
    : length > 62
      ? 'text-[12px]'
      : length > 38
        ? 'text-[13px]'
        : (minimal ? 'text-[11px]' : 'text-sm');

  return `font-extrabold text-gray-800 dark:text-white mb-0.5 ${sizeClass} leading-5 line-clamp-2 break-words overflow-hidden`;
};

const RenderCardItem: React.FC<RenderCardItemProps> = ({
  item,
  moduleId,
  moduleConfig,
  imageField,
  tagsField,
  statusField,
  categoryField,
  allUsers = [],
  allRoles = [],
  selectedRowKeys,
  setSelectedRowKeys,
  navigate,
  minimal = false,
  hideSelection = false,
  canViewField,
  relationOptions = {},
  showDragHandle = false,
  isDragActive = false,
  dragHandleTitle = "جابجایی کارت",
  onDragHandlePointerDown,
  moduleBadgeLabel,
  canLockRecord = false,
  canUnlockRecord = false,
}) => {
  const [taskPatch, setTaskPatch] = React.useState<Record<string, any>>({});
  const [recordPatch, setRecordPatch] = React.useState<Record<string, any>>({});
  const [resolvedTaskTitle, setResolvedTaskTitle] = React.useState("");
  const isSelected = selectedRowKeys.includes(item.id);
  const isTasks = moduleId === 'tasks';
  React.useEffect(() => {
    setTaskPatch({});
    setRecordPatch({});
  }, [item?.id, item?.updated_at]);
  const cardItem = isTasks ? { ...item, ...taskPatch, ...recordPatch } : { ...item, ...recordPatch };
  const lockState = getRecordLockStateFromRecord(cardItem);
  const isLocked = lockState.isLocked;
  const shouldShowLockControl = isLocked || canLockRecord;
  const handleLockChanged = React.useCallback((nextLockState: RecordLockState) => {
    setRecordPatch((prev) => mergeRecordLockIntoRecord(prev, nextLockState));
  }, []);
  const lockControl = (
    <RecordLockControl
      moduleId={moduleId}
      recordId={String(cardItem?.id || '')}
      lockState={lockState}
      canLock={canLockRecord}
      canUnlock={canUnlockRecord}
      onChanged={handleLockChanged}
    />
  );
  const lockMeta = isLocked ? (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500">
      <LockOutlined />
      <span>قفل شده</span>
    </span>
  ) : null;
  const conditionalDisplaySettings = React.useMemo(
    () => getResolvedModuleConditionalDisplay(moduleConfig?.id),
    [moduleConfig?.id]
  );
  const cardFieldStateMap = React.useMemo(
    () => buildConditionalFieldStateMap(Array.isArray(moduleConfig?.fields) ? moduleConfig.fields : [], cardItem || {}, conditionalDisplaySettings),
    [cardItem, conditionalDisplaySettings, moduleConfig?.fields]
  );
  const isCardFieldVisible = React.useCallback((fieldOrKey?: any) => {
    const fieldKey = String(typeof fieldOrKey === "string" ? fieldOrKey : fieldOrKey?.key || "").trim();
    if (!fieldKey) return true;
    return cardFieldStateMap[fieldKey]?.visible !== false;
  }, [cardFieldStateMap]);
  const imageUrl = imageField && isCardFieldVisible(imageField) ? cardItem[imageField] : null;
  const title = (
    getRecordTitle(cardItem, moduleConfig, { fallback: "" })
    || getRecordDisplayLabel(cardItem, moduleId, { fallback: "" })
    || "بدون عنوان"
  );
  React.useEffect(() => {
    let cancelled = false;
    setResolvedTaskTitle("");
    if (!isTasks || !hasProcessTaskTitleTokens(title)) return undefined;
    resolveProcessTaskTitle(supabase, cardItem, title)
      .then((nextTitle) => {
        if (!cancelled) setResolvedTaskTitle(nextTitle);
      })
      .catch(() => {
        if (!cancelled) setResolvedTaskTitle("");
      });
    return () => {
      cancelled = true;
    };
  }, [cardItem?.id, cardItem?.updated_at, isTasks, title]);
  const displayTitle = isTasks
    ? (resolvedTaskTitle || (hasProcessTaskTitleTokens(title) ? "فعالیت" : title))
    : title;
  const processRecordKeyByModule: Record<string, string> = {
    projects: 'project_id',
    customers: 'related_customer',
    invoices: 'related_invoice',
    purchase_invoices: 'purchase_invoice_id',
    marketing_leads: 'marketing_lead_id',
  };
  const isProductionTask = (
    isTasks
    && String(cardItem?.related_to_module || '') === 'production_orders'
    && cardItem?.related_production_order
    && cardItem?.production_line_id
  );
  const relatedProcessModuleId = String(cardItem?.related_to_module || '');
  const relatedProcessRecordKey = processRecordKeyByModule[relatedProcessModuleId];
  const relatedProcessRecordId = relatedProcessRecordKey ? cardItem?.[relatedProcessRecordKey] : null;
  const isExecutionProcessTask = (
    isTasks
    && !isProductionTask
    && !!relatedProcessRecordId
    && Object.prototype.hasOwnProperty.call(processRecordKeyByModule, relatedProcessModuleId)
  );
  const relatedProcessRecordData = React.useMemo(() => (
    relatedProcessRecordId
      ? {
          id: relatedProcessRecordId,
          module_id: relatedProcessModuleId,
        }
      : null
  ), [relatedProcessModuleId, relatedProcessRecordId]);

  const statusFieldConfig = moduleConfig?.fields.find(
    (f: any) => f.type === FieldType.STATUS || f.key === statusField,
  );
  const status = statusField ? cardItem[statusField] : null;
  const statusOption = statusFieldConfig?.options?.find((o: any) => o.value === status);
  const taskStatusOptions = React.useMemo(
    () => isTasks ? getTaskStatusOptions(cardItem, statusFieldConfig?.options || []) : [],
    [cardItem, isTasks, statusFieldConfig?.options]
  );

  const categoryFieldConfig = moduleConfig?.fields.find((f: any) => f.key === categoryField);
  const category = categoryField ? cardItem[categoryField] : null;
  const categoryLabel = categoryFieldConfig?.options?.find((o: any) => o.value === category)?.label || category;

  const assigneeLabel = getAssigneeLabel(moduleId);
  const dueDate = cardItem.due_date;
  const assigneeAllowed = (canViewField ? canViewField('assignee_id') !== false : true) && isCardFieldVisible('assignee_id');
  const dueAllowed = (canViewField ? canViewField('due_date') !== false : true) && isCardFieldVisible('due_date');
  const categoryAllowed = (canViewField ? canViewField(categoryFieldConfig?.key || 'related_to_module') !== false : true)
    && isCardFieldVisible(categoryFieldConfig?.key || categoryField || 'related_to_module');
  const sourceLink = isTasks ? resolveTaskSourceLink(cardItem) : { moduleId: null, recordId: null };
  const relatedRelationFields = isTasks
    ? (moduleConfig?.fields || []).filter(
        (f: any) => (
          f?.type === FieldType.RELATION
          && (
            String(f?.key || '').startsWith('related_')
            || ['project_id', 'marketing_lead_id', 'purchase_invoice_id'].includes(String(f?.key || ''))
          )
        )
      )
    : [];
  const fallbackRelationKeyByModule: Record<string, string> = {
    projects: 'project_id',
    marketing_leads: 'marketing_lead_id',
    purchase_invoices: 'purchase_invoice_id',
  };
  const fallbackRelationKey = fallbackRelationKeyByModule[String(cardItem?.related_to_module || '')];
  const fallbackRelationRecordId = fallbackRelationKey ? cardItem?.[fallbackRelationKey] : null;
  const selectedRelationField = isTasks
    ? (
        relatedRelationFields.find((f: any) => f?.relationConfig?.targetModule === cardItem?.related_to_module && cardItem?.[f.key])
        || relatedRelationFields.find((f: any) => cardItem?.[f.key])
        || (
          fallbackRelationKey && fallbackRelationRecordId
            ? { key: fallbackRelationKey, relationConfig: { targetModule: cardItem?.related_to_module } }
            : null
        )
      )
    : null;
  const relatedRecordId = sourceLink.recordId || (selectedRelationField ? cardItem?.[selectedRelationField.key] : null);
  const relatedModuleId = isTasks
    ? (sourceLink.moduleId || cardItem?.related_to_module || selectedRelationField?.relationConfig?.targetModule || null)
    : null;
  const sourceRelationFieldKey = isTasks ? getTaskRelationFieldKey(relatedModuleId) : null;
  const relatedFieldAllowed = sourceLink.recordId
    ? true
    : (
      selectedRelationField
        ? (canViewField ? canViewField(selectedRelationField.key) !== false : true) && isCardFieldVisible(selectedRelationField.key)
        : false
    );
  const relatedOptions = (
    selectedRelationField
      ? relationOptions?.[selectedRelationField.key] || []
      : (
        sourceRelationFieldKey
          ? relationOptions?.[sourceRelationFieldKey] || []
          : []
      )
  );
  const relatedOptionLabel = relatedRecordId
    ? relatedOptions.find((opt: any) => opt?.value === relatedRecordId)?.label
    : null;
  const anyRelatedOptionLabel = relatedRecordId
    ? Object.values(relationOptions || {})
        .flat()
        .find((opt: any) => String(opt?.value || '') === String(relatedRecordId))?.label
    : null;
  const relatedRecordLabel = relatedOptionLabel
    || anyRelatedOptionLabel
    || (relatedRecordId ? String(relatedRecordId) : null);
  const relatedModuleTitle = relatedModuleId
    ? (MODULES as Record<string, any>)?.[String(relatedModuleId)]?.titles?.fa || String(relatedModuleId)
    : null;
  const showRelatedRecord = isTasks && relatedRecordId && relatedModuleId && relatedFieldAllowed;
  const recordCode = cardItem.system_code || cardItem.manual_code || null;
  const cardStatusMeta = isCardFieldVisible(statusFieldConfig?.key || statusField || '')
    ? resolveCardStatusMeta(cardItem, moduleConfig, statusField)
    : null;
  const cardTags = tagsField && isCardFieldVisible(tagsField) ? getRecordCardTags(cardItem, tagsField) : [];
  const summaryExcludedKeys = [
    statusFieldConfig?.key || statusField || '',
    cardStatusMeta?.field?.key || '',
    categoryField || '',
    tagsField || '',
    'assignee_id',
    'assignee_role_id',
    'assignee_type',
    'image_url',
    'system_code',
    'manual_code',
    'buy_price',
    'sell_price',
    'related_to_module',
  ].filter(Boolean) as string[];
  const summaryFields = getRecordCardSummaryFields(cardItem, moduleConfig, summaryExcludedKeys, minimal ? 2 : 3);
  const bottomStatusMeta = isTasks ? cardStatusMeta : null;
  const taskModuleMetaLabel = relatedModuleTitle || categoryLabel || moduleConfig?.titles?.fa || 'فعالیت';

  const renderAssignee = () => {
    return (
      <AssigneeAvatarDisplay
        source={cardItem}
        allUsers={allUsers}
        allRoles={allRoles}
        avatarSize={18}
        className="flex items-center gap-1 min-w-0"
        labelClassName="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[90px]"
      />
    );
  };

  const renderDueDate = () => {
    if (!dueDate) return <span className="text-[10px] text-gray-400">-</span>;
    const dayjsValue = parseDateValue(dueDate);
    if (!dayjsValue) return <span className="text-[10px] text-gray-400">-</span>;
    const formatted = safeJalaliFormat(dayjsValue, 'YYYY/MM/DD HH:mm');
    if (!formatted) return <span className="text-[10px] text-gray-400">-</span>;
    return <span className="text-[10px] text-gray-600 dark:text-gray-300 dir-ltr">{toPersianNumber(formatted)}</span>;
  };

  const toggleSelect = (e: any) => {
    e.stopPropagation();
    const newSelected = isSelected
      ? selectedRowKeys.filter((k: any) => k !== item.id)
      : [...selectedRowKeys, item.id];
    setSelectedRowKeys(newSelected);
  };
  const hasSelectionControl = !hideSelection;
  const hasLockControl = shouldShowLockControl;
  const hasDragControl = !isLocked && showDragHandle && !!onDragHandlePointerDown;
  const hasFooterControls = hasSelectionControl || hasLockControl || hasDragControl;
  const cardSurfaceClassName = `
    group relative flex cursor-pointer flex-col rounded-2xl border border-white/70 bg-[linear-gradient(145deg,#ffffff,#f3f6fb)] shadow-[0_16px_34px_rgba(15,23,42,0.10),inset_0_2px_5px_rgba(255,255,255,0.86),inset_0_-10px_22px_rgba(148,163,184,0.14)] transition-all
    hover:-translate-y-0.5 hover:border-[rgba(var(--brand-200-rgb),0.78)] hover:shadow-[0_20px_42px_rgba(15,23,42,0.14),inset_0_2px_6px_rgba(255,255,255,0.92),inset_0_-10px_24px_rgba(148,163,184,0.16)]
    dark:border-white/[0.09] dark:bg-[linear-gradient(145deg,rgba(38,38,38,0.98),rgba(24,24,24,0.98))] dark:shadow-[0_16px_36px_rgba(0,0,0,0.38),inset_0_1px_3px_rgba(255,255,255,0.06),inset_0_-12px_24px_rgba(0,0,0,0.20)]
    dark:hover:border-[rgba(var(--brand-300-rgb),0.24)] dark:hover:shadow-[0_20px_44px_rgba(0,0,0,0.48),inset_0_1px_4px_rgba(255,255,255,0.08),inset_0_-12px_24px_rgba(0,0,0,0.24)]
    ${isSelected ? "ring-2 ring-[rgba(var(--brand-500-rgb),0.36)]" : ""}
    ${minimal ? "" : "h-full"}
    ${minimal ? "p-3" : "p-3"}
    ${hasFooterControls || bottomStatusMeta ? "pb-11" : ""}
    ${isDragActive ? "opacity-75 ring-2 ring-[rgba(var(--brand-500-rgb),0.45)]" : ""}
  `;
  const actionRailClassName = `
    relative z-30 mt-0.5 -mx-1 flex min-w-0 items-center justify-center gap-2 overflow-visible px-1 py-2
  `;
  const renderDragHandle = () => {
    if (!hasDragControl || !onDragHandlePointerDown) return null;
    return (
      <button
        type="button"
        title={dragHandleTitle}
        aria-label={dragHandleTitle}
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-gray-500 shadow-sm transition hover:text-[rgb(var(--brand-700-rgb))] active:cursor-grabbing dark:bg-white/10 dark:text-gray-300"
        style={{ touchAction: 'none', userSelect: 'none' }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => onDragHandlePointerDown(item, event)}
      >
        <DragOutlined />
      </button>
    );
  };
  const renderFooterControls = () => {
    if (!hasFooterControls) return null;
    return (
      <div className="absolute bottom-2 left-2 z-30 flex items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
        {hasSelectionControl ? (
          <label
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 shadow-sm dark:bg-white/10"
            title="انتخاب کارت"
          >
            <Checkbox checked={isSelected} onChange={toggleSelect} />
          </label>
        ) : null}
        {hasLockControl ? (
          <div className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-white/90 px-1 shadow-sm dark:bg-white/10">
            {lockControl}
          </div>
        ) : null}
        {renderDragHandle()}
      </div>
    );
  };
  const renderBottomStatus = () => {
    if (!bottomStatusMeta) return null;
    return (
      <div className="absolute bottom-1.5 right-2 z-30 max-w-[48%] truncate" onClick={(event) => event.stopPropagation()}>
        <Tag
          color={bottomStatusMeta.color || "default"}
          className="!m-0 max-w-full truncate !rounded-full !border-0 !px-2 !py-0.5 !text-[10px] !font-semibold"
        >
          {bottomStatusMeta.label}
        </Tag>
      </div>
    );
  };
  const handleCardClick = () => {
    if (isTasks) {
      openTaskProcessModal({ task: cardItem });
      return;
    }
    navigate(`/${moduleId}/${item.id}`);
  };

  if (!isTasks) {
    const renderFieldValue = (field: any, value: any) => {
      if (value === null || value === undefined || value === '') {
        return <span className="break-words text-gray-400">-</span>;
      }

      if (field?.type === FieldType.MULTI_SELECT) {
        const values = Array.isArray(value) ? value : [value];
        const labels = values
          .map((item: any) => {
            const option = (field.options || []).find((opt: any) => String(opt?.value) === String(item));
            return String(option?.label || item || '').trim();
          })
          .filter(Boolean);

        if (labels.length === 0) return <span className="break-words text-gray-400">-</span>;

        return (
          <div className="flex min-w-0 flex-wrap gap-1">
            {labels.slice(0, 2).map((fieldLabel: string, index: number) => (
              <Tag
                key={`${field.key}-${fieldLabel}-${index}`}
                color="default"
                className="kalam-multi-value-tag !m-0 max-w-[120px] truncate !rounded-md !px-2 !py-0.5 !text-[10px] !font-medium"
                title={fieldLabel}
              >
                {fieldLabel}
              </Tag>
            ))}
            {labels.length > 2 ? (
              <span className="kalam-multi-value-more rounded-md px-2 py-0.5 text-[10px] font-medium">
                +{labels.length - 2}
              </span>
            ) : null}
          </div>
        );
      }

      if ((field?.type === FieldType.RELATION || field?.type === FieldType.USER) && relationOptions?.[field.key]?.length) {
        const matched = relationOptions[field.key].find((opt: any) => String(opt?.value) === String(value));
        if (matched?.label) {
          return <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">{matched.label}</span>;
        }
      }

      if (field?.type === FieldType.PHONE) {
        return <span className="min-w-0 break-all text-left text-gray-700 dark:text-gray-200 dir-ltr">{formatRecordDisplayValue(value, field)}</span>;
      }

      return <span className="min-w-0 break-words text-gray-700 dark:text-gray-200">{formatRecordFieldValue(cardItem, field)}</span>;
    };

    return (
      <div
        onClick={handleCardClick}
        className={cardSurfaceClassName}
    >
      {renderFooterControls()}
      {renderBottomStatus()}
      {moduleBadgeLabel ? (
          <div className="absolute left-3 top-3 z-10 max-w-[45%] truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-200">
            {moduleBadgeLabel}
          </div>
        ) : null}

        <div className={`flex items-start gap-3 ${moduleBadgeLabel ? 'pt-5' : ''}`}>
          <Avatar
            shape="square"
            size={minimal ? 36 : 52}
            src={imageUrl ? <ResilientImage src={String(imageUrl)} preset="avatar" alt={displayTitle} className="h-full w-full object-cover" /> : undefined}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />

          <div className="min-w-0 flex-1">
            <div className="min-w-0">
              <h4
                className={getAdaptiveCardTitleClassName(title, minimal)}
                title={displayTitle}
              >
                {displayTitle}
              </h4>
              <div className={`mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2 ${minimal ? "leading-4" : ""}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {lockMeta}
                  {recordCode ? (
                    <span className="min-w-0 rounded-full bg-gray-100 px-1.5 py-0 text-[10px] font-mono text-gray-400 dark:bg-white/10">
                      {recordCode}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1">
                  {cardStatusMeta ? (
                    <Tag
                      color={cardStatusMeta.color || "default"}
                      className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[10px] !font-semibold"
                    >
                      {cardStatusMeta.label}
                    </Tag>
                  ) : null}
                  {category && categoryAllowed ? (
                    <Tag
                      color="default"
                      className="!m-0 !rounded-full !border-0 !bg-gray-100 !px-2 !py-0.5 !text-[10px] !text-gray-600 dark:!bg-gray-800 dark:!text-gray-300"
                    >
                      {categoryLabel}
                    </Tag>
                  ) : null}
                </div>
              </div>
            </div>

            {summaryFields.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-1.5 text-xs">
                {summaryFields.map((field: any) => {
                  const value = cardItem?.[field.key];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div
                      key={field.key}
                      className="grid grid-cols-[82px_minmax(0,1fr)] items-start gap-2 rounded-lg bg-gray-50/75 px-2 py-1.5 dark:bg-white/5"
                    >
                      <span className="truncate text-[10px] font-semibold text-gray-400 dark:text-gray-500">{field.labels?.fa || field.title || field.key}</span>
                      {renderFieldValue(field, value)}
                    </div>
                  );
                })}
              </div>
            ) : null}

            {cardTags.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {cardTags.slice(0, 2).map((tag, index) => (
                  <Tag
                    key={`${tag.label}-${index}`}
                    color={tag.color || 'blue'}
                    className="!m-0 !rounded-full !px-2 !py-0.5 !text-[10px] !font-medium"
                  >
                    {tag.label}
                  </Tag>
                ))}
                {cardTags.length > 2 ? (
                  <Popover
                    trigger="click"
                    title={`${cardTags.length - 2} برچسب بیشتر`}
                    content={
                      <div className="flex flex-wrap gap-1">
                        {cardTags.slice(2).map((tag, index) => (
                          <Tag
                            key={`${tag.label}-${index}`}
                            color={tag.color || 'blue'}
                            className="!m-0 !rounded-full !px-2 !py-0.5 !text-[10px] !font-medium"
                          >
                            {tag.label}
                          </Tag>
                        ))}
                      </div>
                    }
                  >
                    <span className="cursor-pointer rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300">
                      +{cardTags.length - 2}
                    </span>
                  </Popover>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-auto flex items-start justify-between gap-3 border-t border-gray-100 pt-2 text-xs dark:border-gray-700">
          {assigneeAllowed ? (
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-gray-500 dark:text-gray-400 text-[8px]">{assigneeLabel}</span>
              {renderAssignee()}
            </div>
          ) : <span />}

          <div className="flex items-end gap-3">
            {cardItem.buy_price && (canViewField ? canViewField('buy_price') !== false : true) && isCardFieldVisible('buy_price') ? (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">خرید</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(cardItem.buy_price, true)}
                </span>
              </div>
            ) : null}
            {cardItem.sell_price && (canViewField ? canViewField('sell_price') !== false : true) && isCardFieldVisible('sell_price') ? (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">فروش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(cardItem.sell_price, true)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const taskCardNode = (
    <div
      onClick={handleCardClick}
      className={cardSurfaceClassName}
    >
      {renderFooterControls()}
      {renderBottomStatus()}
      {moduleBadgeLabel ? (
        <div className="absolute left-3 top-3 z-10 max-w-[45%] truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-white/10 dark:text-gray-200">
          {moduleBadgeLabel}
        </div>
      ) : null}

      {isTasks && imageUrl ? (
        <div className={`mb-2 overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-900 ${moduleBadgeLabel ? 'mt-5' : ''} ${minimal ? 'h-24' : 'h-32'}`}>
          <ResilientImage src={String(imageUrl)} preset="card" alt={displayTitle} className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : null}

      <div className={`mb-2 flex items-start gap-3 ${moduleBadgeLabel && !imageUrl ? 'pt-5' : ''}`}>
        {!isTasks && (
          <Avatar
            shape="square"
            size={minimal ? 40 : 54}
            src={imageUrl ? <ResilientImage src={String(imageUrl)} preset="avatar" alt={displayTitle} className="h-full w-full object-cover" /> : undefined}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <h4
            className={getAdaptiveCardTitleClassName(title, minimal)}
            title={displayTitle}
          >
            {displayTitle}
          </h4>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {isTasks && cardTags.slice(0, 3).map((tag, index) => (
              <Tag
                key={`${tag.label}-${index}`}
                color={tag.color || 'blue'}
                className="!m-0 !rounded-full !px-1.5 !py-0 !text-[9px] !leading-4"
              >
                {tag.label}
              </Tag>
            ))}
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500">
            <span className="truncate">{taskModuleMetaLabel}</span>
            {recordCode ? (
              <>
                <span className="shrink-0 opacity-50">•</span>
                <span className="shrink-0 font-mono">{recordCode}</span>
              </>
            ) : null}
          </div>
          <div className={actionRailClassName}>
            <div className="relative z-30 flex min-w-0 flex-1 items-center justify-center gap-1 overflow-x-auto overflow-y-visible py-2">
              {isTasks ? (
                <TaskActionButtons
                  task={cardItem}
                  disabled={isLocked}
                  statusOptions={taskStatusOptions}
                  hideReschedule
                  onTaskUpdated={async (updatedTask) => {
                    setTaskPatch((prev) => ({ ...prev, ...updatedTask }));
                  }}
                  modalZIndex={12100}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {!minimal && (
        <>
          <div className="flex justify-between gap-2 mb-2 px-0">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {!isTasks && statusOption && (canViewField ? canViewField(statusFieldConfig?.key || 'status') !== false : true) && isCardFieldVisible(statusFieldConfig?.key || statusField || 'status') && (
                <Tag color={statusOption.color || "default"} style={{ fontSize: "10px", lineHeight: "16px", margin: 0 }}>
                  {statusOption.label}
                </Tag>
              )}

              {!isTasks && category && (canViewField ? canViewField(categoryFieldConfig?.key || 'category') !== false : true) && isCardFieldVisible(categoryFieldConfig?.key || categoryField || 'category') && (
                <Tag
                  color="default"
                  style={{
                    fontSize: "10px",
                    lineHeight: "16px",
                    margin: 0,
                    backgroundColor: "#f0f0f0",
                    color: "#262626",
                  }}
                >
                  {categoryLabel}
                </Tag>
              )}
            </div>

            {!isTasks && tagsField && isCardFieldVisible(tagsField) && cardItem[tagsField] && (
              <div className="flex flex-wrap gap-1 justify-end flex-1">
                {(Array.isArray(cardItem[tagsField]) ? cardItem[tagsField] : [cardItem[tagsField]]).slice(0, 1).map((t: any, idx: number) => {
                  const tagTitle = typeof t === "string" ? t : t.title || t.label;
                  const tagColor = typeof t === "string" ? "blue" : t.color || "blue";
                  return (
                    <Tag key={idx} color={tagColor} style={{ fontSize: "9px", lineHeight: "14px", margin: 0, padding: "1px 4px" }}>
                      {tagTitle}
                    </Tag>
                  );
                })}
                {Array.isArray(cardItem[tagsField]) && cardItem[tagsField].length > 1 && (
                  <Popover
                    content={
                      <div className="flex flex-wrap gap-1">
                        {cardItem[tagsField].slice(1).map((t: any, idx: number) => {
                          const tagTitle = typeof t === "string" ? t : t.title || t.label;
                          const tagColor = typeof t === "string" ? "blue" : t.color || "blue";
                          return (
                            <Tag key={idx} color={tagColor} style={{ fontSize: "9px", lineHeight: "14px", margin: 0, padding: "1px 4px" }}>
                              {tagTitle}
                            </Tag>
                          );
                        })}
                      </div>
                    }
                    title={`${cardItem[tagsField].length - 1} برچسب بیشتر`}
                    trigger="click"
                  >
                    <span className="text-[9px] text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 font-medium">
                      +{cardItem[tagsField].length - 1}
                    </span>
                  </Popover>
                )}
              </div>
            )}
          </div>

          <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center gap-2 text-xs">
            {isTasks ? (
              <>
                {assigneeAllowed && (
                  <div className="flex flex-col gap-0">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">{assigneeLabel}</span>
                    {renderAssignee()}
                  </div>
                )}
                {dueAllowed && (
                  <div className="flex flex-col gap-0 text-right">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">مهلت انجام</span>
                    {renderDueDate()}
                  </div>
                )}
              </>
            ) : (
              <>
                {cardItem.buy_price && (canViewField ? canViewField('buy_price') !== false : true) && isCardFieldVisible('buy_price') && (
                  <div className="flex flex-col gap-0">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">خرید</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                      {formatPersianPrice(cardItem.buy_price, true)}
                    </span>
                  </div>
                )}
                {cardItem.sell_price && (canViewField ? canViewField('sell_price') !== false : true) && isCardFieldVisible('sell_price') && (
                  <div className="flex flex-col gap-0">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">فروش</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                      {formatPersianPrice(cardItem.sell_price, true)}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          {showRelatedRecord && (
            <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-300 truncate">
              <span className="font-semibold">رکورد مرتبط:</span>{' '}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/${relatedModuleId}/${relatedRecordId}`);
                }}
                className="text-leather-600 hover:underline truncate max-w-full"
                title={`${relatedModuleTitle || ''} - ${relatedRecordLabel || ''}`}
              >
                {relatedRecordLabel}
              </button>
            </div>
          )}
        </>
      )}

      {minimal && isTasks && (assigneeAllowed || dueAllowed) && (
        <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center gap-2 text-xs">
          {assigneeAllowed && (
            <div className="flex flex-col gap-0">
              <span className="text-gray-500 dark:text-gray-400 text-[8px]">{assigneeLabel}</span>
              {renderAssignee()}
            </div>
          )}
          {dueAllowed && (
            <div className="flex flex-col gap-0 text-right">
              <span className="text-gray-500 dark:text-gray-400 text-[8px]">مهلت انجام</span>
              {renderDueDate()}
            </div>
          )}
        </div>
      )}
      {minimal && showRelatedRecord && (
        <div className="mt-1 text-[10px] text-gray-500 dark:text-gray-300 truncate">
          <span className="font-semibold">رکورد مرتبط:</span>{' '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/${relatedModuleId}/${relatedRecordId}`);
            }}
            className="text-leather-600 hover:underline truncate max-w-full"
            title={`${relatedModuleTitle || ''} - ${relatedRecordLabel || ''}`}
          >
            {relatedRecordLabel}
          </button>
        </div>
      )}

      {isProductionTask && (
        <div
          className={`${minimal ? 'mt-2' : 'mt-3'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <React.Suspense fallback={null}>
            <ProductionStagesField
              recordId={String(cardItem.related_production_order)}
              moduleId="production_orders"
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
              onlyLineId={String(cardItem.production_line_id)}
            />
          </React.Suspense>
        </div>
      )}
      {isExecutionProcessTask && (
        <div
          className={`${showRelatedRecord ? 'mt-1' : (minimal ? 'mt-2' : 'mt-3')}`}
          onClick={(e) => e.stopPropagation()}
        >
          <React.Suspense fallback={null}>
            <ProcessCardsV2RuntimeBlock
              recordId={String(relatedProcessRecordId)}
              moduleId={relatedProcessModuleId}
              recordData={relatedProcessRecordData}
              variant="compact"
              highlightedTaskId={String(cardItem?.id || '')}
              highlightedRunStageId={String(cardItem?.process_run_stage_id || '')}
            />
          </React.Suspense>
        </div>
      )}
    </div>
  );

  return taskCardNode;
};

export default RenderCardItem;
