import React from "react";
import { Avatar, Checkbox, Popover, Tag } from "antd";
import { AppstoreOutlined, DragOutlined } from "@ant-design/icons";
import { FieldType } from "../../types";
import { formatPersianPrice, toPersianNumber, safeJalaliFormat, parseDateValue } from "../../utils/persianNumberFormatter";
import { getRecordTitle } from "../../utils/recordTitle";
import { getAssigneeLabel } from "../../utils/assigneeLabel";
import { formatRecordDisplayValue, formatRecordFieldValue } from "../../utils/recordDisplayFormatter";
import { getRecordCardSummaryFields, getRecordCardTags, resolveCardStatusMeta } from "../../utils/recordCardHelpers";
import { getTaskRelationFieldKey, resolveTaskSourceLink } from "../../utils/taskMeta";
import { MODULES } from "../../moduleRegistry";
import TaskActionButtons from "../tasks/TaskActionButtons";
import { openTaskProcessModal } from "../../utils/taskProcessModalEvents";
import { buildConditionalFieldStateMap } from "../../utils/conditionalFieldRules";
import { getResolvedModuleConditionalDisplay } from "../../utils/moduleSettingsRuntime";
import ResilientImage from "../common/ResilientImage";
import AssigneeAvatarDisplay from "../common/AssigneeAvatarDisplay";

const ProductionStagesField = React.lazy(() => import("../ProductionStagesField"));

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

  return `font-extrabold text-gray-800 dark:text-white mb-0.5 ${sizeClass} leading-5 line-clamp-2 break-words overflow-hidden ${minimal ? 'min-h-[2.5rem]' : ''}`;
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
}) => {
  const [taskPatch, setTaskPatch] = React.useState<Record<string, any>>({});
  const isSelected = selectedRowKeys.includes(item.id);
  const isTasks = moduleId === 'tasks';
  React.useEffect(() => {
    setTaskPatch({});
  }, [item?.id, item?.updated_at]);
  const cardItem = isTasks ? { ...item, ...taskPatch } : item;
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
  const title = getRecordTitle(cardItem, moduleConfig, { fallback: "-" });
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

  const statusFieldConfig = moduleConfig?.fields.find(
    (f: any) => f.type === FieldType.STATUS || f.key === statusField,
  );
  const status = statusField ? cardItem[statusField] : null;
  const statusOption = statusFieldConfig?.options?.find((o: any) => o.value === status);

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
  const renderDragHandle = () => {
    if (!showDragHandle || !onDragHandlePointerDown) return null;
    return (
      <button
        type="button"
        title={dragHandleTitle}
        aria-label={dragHandleTitle}
        className="absolute bottom-2 left-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white/95 text-gray-500 shadow-sm transition hover:border-[rgba(var(--brand-500-rgb),0.8)] hover:text-[rgb(var(--brand-700-rgb))] active:cursor-grabbing dark:border-white/10 dark:bg-[#242424] dark:text-gray-300"
        style={{ touchAction: 'none', userSelect: 'none' }}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => onDragHandlePointerDown(item, event)}
      >
        <DragOutlined />
      </button>
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
        className={`
          group relative flex cursor-pointer flex-col rounded-2xl border bg-gradient-to-b from-white to-gray-50 shadow-sm transition-all
          dark:from-[#1d1d1d] dark:to-[#171717]
          ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-[rgba(var(--brand-200-rgb),0.75)] hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)]"}
          ${minimal ? "" : "h-full"}
          ${minimal ? "p-3" : "p-3"}
          ${showDragHandle ? "pb-9" : ""}
          ${isDragActive ? "opacity-70 ring-2 ring-[rgba(var(--brand-500-rgb),0.45)]" : ""}
        `}
      >
        {renderDragHandle()}
        {!hideSelection && (
          <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={isSelected} onChange={toggleSelect} />
          </div>
        )}

        <div className="flex items-start gap-3">
          <Avatar
            shape="square"
            size={minimal ? 36 : 52}
            src={imageUrl ? <ResilientImage src={String(imageUrl)} preset="avatar" alt={title} className="h-full w-full object-cover" /> : undefined}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />

          <div className={`min-w-0 flex-1 ${hideSelection ? '' : 'pr-6'}`}>
            <div className="min-w-0">
              <h4
                className={getAdaptiveCardTitleClassName(title, minimal)}
                title={title}
              >
                {title}
              </h4>
              <div className={`mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2 ${minimal ? "leading-4" : ""}`}>
                <div className="min-w-0 text-[10px] text-gray-400 font-mono">
                  {recordCode || "---"}
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
              <div className="mt-2 space-y-1.5 text-xs">
                {summaryFields.map((field: any) => {
                  const value = cardItem?.[field.key];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div
                      key={field.key}
                      className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 items-start border-b border-gray-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-gray-800"
                    >
                      <span className="text-gray-500 dark:text-gray-400">{field.labels?.fa || field.title || field.key}</span>
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

        <div className="mt-auto pt-2 border-t border-gray-100 dark:border-gray-700 flex justify-between items-start gap-3 text-xs">
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
      className={`
        bg-gradient-to-b from-white to-gray-50 dark:from-[#1d1d1d] dark:to-[#171717] rounded-2xl border shadow-sm cursor-pointer transition-all flex flex-col group relative
        ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-[rgba(var(--brand-200-rgb),0.75)] hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)]"}
        ${minimal ? "p-3" : "p-3 h-full"}
        ${showDragHandle ? "pb-9" : ""}
        ${isDragActive ? "opacity-70 ring-2 ring-[rgba(var(--brand-500-rgb),0.45)]" : ""}
      `}
    >
      {renderDragHandle()}
      {!hideSelection && (
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onChange={toggleSelect} />
        </div>
      )}

      {isTasks && imageUrl ? (
        <div className={`mb-2 overflow-hidden rounded-xl border border-gray-100 bg-gray-100 dark:border-gray-700 dark:bg-gray-900 ${minimal ? 'h-24' : 'h-32'}`}>
          <ResilientImage src={String(imageUrl)} preset="card" alt={title} className="h-full w-full object-cover" loading="lazy" />
        </div>
      ) : null}

      <div className="mb-2 flex items-start gap-3">
        {!isTasks && (
          <Avatar
            shape="square"
            size={minimal ? 40 : 54}
            src={imageUrl ? <ResilientImage src={String(imageUrl)} preset="avatar" alt={title} className="h-full w-full object-cover" /> : undefined}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />
        )}
        <div className={`min-w-0 flex-1 ${hideSelection ? '' : 'pr-6'}`}>
          <h4
            className={getAdaptiveCardTitleClassName(title, minimal)}
            title={title}
          >
            {title}
          </h4>
          <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {isTasks ? (
                cardTags.length > 0 ? (
                  <>
                    {cardTags.slice(0, 2).map((tag, index) => (
                      <Tag
                        key={`${tag.label}-${index}`}
                        color={tag.color || 'blue'}
                        className="!m-0 !rounded-full !px-1.5 !py-0 !text-[9px] !leading-4"
                      >
                        {tag.label}
                      </Tag>
                    ))}
                    {cardTags.length > 2 ? (
                      <span className="rounded-full bg-gray-100 px-1.5 py-0 text-[9px] leading-4 text-gray-500 dark:bg-gray-800 dark:text-gray-300">
                        +{cardTags.length - 2}
                      </span>
                    ) : null}
                  </>
                ) : recordCode ? (
                  <div className={`text-[10px] text-gray-400 font-mono ${minimal ? "leading-4" : ""}`}>
                    {recordCode}
                  </div>
                ) : null
              ) : (
                <div className={`text-[10px] text-gray-400 font-mono ${minimal ? "leading-4" : ""}`}>
                  {recordCode || "---"}
                </div>
              )}
              {isTasks && category && categoryAllowed && (
                <Tag
                  color="default"
                  className="!m-0 !rounded-full !border-0 !bg-gray-100 !px-2 !py-0.5 !text-[10px] !text-gray-600 dark:!bg-gray-800 dark:!text-gray-300"
                >
                  {categoryLabel}
                </Tag>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {isTasks ? (
                <TaskActionButtons
                  task={cardItem}
                  onTaskUpdated={async (updatedTask) => {
                    setTaskPatch((prev) => ({ ...prev, ...updatedTask }));
                  }}
                  modalZIndex={12100}
                />
              ) : null}
              {cardStatusMeta ? (
                <Tag
                  color={cardStatusMeta.color || "default"}
                  className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[10px] !font-semibold shrink-0"
                >
                  {cardStatusMeta.label}
                </Tag>
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
          className={`${minimal ? 'mt-2' : 'mt-3'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <React.Suspense fallback={null}>
            <ProductionStagesField
              recordId={String(relatedProcessRecordId)}
              moduleId={relatedProcessModuleId}
              readOnly
              compact
              cardCompact
              allowReportEditInReadOnly
            />
          </React.Suspense>
        </div>
      )}
    </div>
  );

  return taskCardNode;
};

export default RenderCardItem;
