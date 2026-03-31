import React from "react";
import { Avatar, Checkbox, Popover, Tag } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FieldType } from "../../types";
import { formatPersianPrice, toPersianNumber, safeJalaliFormat, parseDateValue } from "../../utils/persianNumberFormatter";
import { getRecordTitle } from "../../utils/recordTitle";
import { getSafeOptionFallback } from "../../utils/optionHelpers";
import { getAssigneeLabel } from "../../utils/assigneeLabel";
import { getResolvedAssigneeId } from "../../utils/assigneeValue";
import { formatRecordDisplayValue } from "../../utils/recordDisplayFormatter";
import { getModuleCardSummaryFields, getRecordCardTags, resolveCardStatusMeta } from "../../utils/recordCardHelpers";
import { resolveTaskSourceLink } from "../../utils/taskMeta";
import ProductionStagesField from "../ProductionStagesField";
import { MODULES } from "../../moduleRegistry";

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
}

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
}) => {
  const isSelected = selectedRowKeys.includes(item.id);
  const imageUrl = imageField ? item[imageField] : null;
  const title = getRecordTitle(item, moduleConfig, { fallback: "-" });
  const isTasks = moduleId === 'tasks';
  const processRecordKeyByModule: Record<string, string> = {
    projects: 'project_id',
    customers: 'related_customer',
    invoices: 'related_invoice',
    purchase_invoices: 'purchase_invoice_id',
    marketing_leads: 'marketing_lead_id',
  };
  const isProductionTask = (
    isTasks
    && String(item?.related_to_module || '') === 'production_orders'
    && item?.related_production_order
    && item?.production_line_id
  );
  const relatedProcessModuleId = String(item?.related_to_module || '');
  const relatedProcessRecordKey = processRecordKeyByModule[relatedProcessModuleId];
  const relatedProcessRecordId = relatedProcessRecordKey ? item?.[relatedProcessRecordKey] : null;
  const isExecutionProcessTask = (
    isTasks
    && !isProductionTask
    && !!relatedProcessRecordId
    && Object.prototype.hasOwnProperty.call(processRecordKeyByModule, relatedProcessModuleId)
  );

  const statusFieldConfig = moduleConfig?.fields.find(
    (f: any) => f.type === FieldType.STATUS || f.key === statusField,
  );
  const status = statusField ? item[statusField] : null;
  const statusOption = statusFieldConfig?.options?.find((o: any) => o.value === status);

  const categoryFieldConfig = moduleConfig?.fields.find((f: any) => f.key === categoryField);
  const category = categoryField ? item[categoryField] : null;
  const categoryLabel = categoryFieldConfig?.options?.find((o: any) => o.value === category)?.label || category;

  const assigneeId = getResolvedAssigneeId(item);
  const assigneeType = item.assignee_type;
  const assigneeLabel = getAssigneeLabel(moduleId);
  const dueDate = item.due_date;
  const assigneeAllowed = canViewField ? canViewField('assignee_id') !== false : true;
  const dueAllowed = canViewField ? canViewField('due_date') !== false : true;
  const categoryAllowed = canViewField ? canViewField(categoryFieldConfig?.key || 'related_to_module') !== false : true;
  const sourceLink = isTasks ? resolveTaskSourceLink(item) : { moduleId: null, recordId: null };
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
  const fallbackRelationKey = fallbackRelationKeyByModule[String(item?.related_to_module || '')];
  const fallbackRelationRecordId = fallbackRelationKey ? item?.[fallbackRelationKey] : null;
  const selectedRelationField = isTasks
    ? (
        relatedRelationFields.find((f: any) => f?.relationConfig?.targetModule === item?.related_to_module && item?.[f.key])
        || relatedRelationFields.find((f: any) => item?.[f.key])
        || (
          fallbackRelationKey && fallbackRelationRecordId
            ? { key: fallbackRelationKey, relationConfig: { targetModule: item?.related_to_module } }
            : null
        )
      )
    : null;
  const relatedRecordId = sourceLink.recordId || (selectedRelationField ? item?.[selectedRelationField.key] : null);
  const relatedModuleId = isTasks
    ? (sourceLink.moduleId || item?.related_to_module || selectedRelationField?.relationConfig?.targetModule || null)
    : null;
  const relatedFieldAllowed = sourceLink.recordId
    ? true
    : (
      selectedRelationField
        ? (canViewField ? canViewField(selectedRelationField.key) !== false : true)
        : false
    );
  const relatedOptions = selectedRelationField ? relationOptions?.[selectedRelationField.key] || [] : [];
  const relatedOptionLabel = relatedRecordId
    ? relatedOptions.find((opt: any) => opt?.value === relatedRecordId)?.label
    : null;
  const relatedRecordLabel = relatedOptionLabel || (relatedRecordId ? getSafeOptionFallback(relatedRecordId, '') : null);
  const relatedModuleTitle = relatedModuleId
    ? (MODULES as Record<string, any>)?.[String(relatedModuleId)]?.titles?.fa || String(relatedModuleId)
    : null;
  const showRelatedRecord = isTasks && relatedRecordId && relatedModuleId && relatedFieldAllowed;
  const cardStatusMeta = resolveCardStatusMeta(item, moduleConfig, statusField);
  const cardTags = getRecordCardTags(item, tagsField);
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
  const summaryFields = getModuleCardSummaryFields(moduleConfig, summaryExcludedKeys, minimal ? 2 : 3);

  const renderAssignee = () => {
    if (!assigneeId) {
      return <span className="text-[10px] text-gray-400">-</span>;
    }
    if (assigneeType === 'user') {
      const user = allUsers.find((u: any) => u.id === assigneeId);
      if (user) {
        return (
          <div className="flex items-center gap-1 min-w-0">
            <Avatar size={18} src={user.avatar_url}>
              {!user.avatar_url && user.full_name?.[0]}
            </Avatar>
            <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[90px]">
              {user.full_name}
            </span>
          </div>
        );
      }
    }
    if (assigneeType === 'role') {
      const role = allRoles.find((r: any) => r.id === assigneeId);
      if (role) {
        return (
          <div className="flex items-center gap-1 min-w-0">
            <Avatar size={18} className="bg-blue-100 text-blue-600">R</Avatar>
            <span className="text-[10px] text-gray-600 dark:text-gray-300 truncate max-w-[90px]">
              {role.title}
            </span>
          </div>
        );
      }
    }
    return <span className="text-[10px] text-gray-400">نامشخص</span>;
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

  if (!isTasks) {
    const renderFieldValue = (field: any, value: any) => {
      if (value === null || value === undefined || value === '') {
        return <span className="break-words text-gray-400">-</span>;
      }

      if ((field?.type === FieldType.RELATION || field?.type === FieldType.USER) && relationOptions?.[field.key]?.length) {
        const matched = relationOptions[field.key].find((opt: any) => String(opt?.value) === String(value));
        if (matched?.label) {
          return <span className="break-words text-gray-700 dark:text-gray-200">{matched.label}</span>;
        }
      }

      return <span className="break-words text-gray-700 dark:text-gray-200">{formatRecordDisplayValue(value, field)}</span>;
    };

    return (
      <div
        onClick={() => navigate(`/${moduleId}/${item.id}`)}
        className={`
          group relative flex h-full cursor-pointer flex-col rounded-2xl border bg-gradient-to-b from-white to-gray-50 shadow-sm transition-all
          dark:from-[#1d1d1d] dark:to-[#171717]
          ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-[rgba(var(--brand-200-rgb),0.75)] hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)]"}
          ${minimal ? "p-3" : "p-3"}
        `}
      >
        {!hideSelection && (
          <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={isSelected} onChange={toggleSelect} />
          </div>
        )}

        <div className="flex items-start gap-3">
          <Avatar
            shape="square"
            size={minimal ? 36 : 52}
            src={imageUrl}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />

          <div className={`min-w-0 flex-1 ${hideSelection ? '' : 'pr-6'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4
                  className={`font-extrabold text-gray-800 dark:text-white mb-0.5 ${minimal ? "text-[11px] leading-4 line-clamp-2 min-h-[2rem]" : "text-sm truncate"}`}
                  title={title}
                >
                  {title}
                </h4>
                <div className={`text-[10px] text-gray-400 font-mono ${minimal ? "leading-4" : ""}`}>
                  {item.system_code || item.manual_code || "---"}
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0">
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

            {summaryFields.length > 0 ? (
              <div className="mt-2 space-y-1.5 text-xs">
                {summaryFields.map((field: any) => {
                  const value = item?.[field.key];
                  if (value === undefined || value === null || value === '') return null;
                  return (
                    <div
                      key={field.key}
                      className="grid grid-cols-[92px_1fr] gap-2 items-start border-b border-gray-100 pb-1.5 last:border-b-0 last:pb-0 dark:border-gray-800"
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
            {item.buy_price && (canViewField ? canViewField('buy_price') !== false : true) ? (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">خرید</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(item.buy_price, true)}
                </span>
              </div>
            ) : null}
            {item.sell_price && (canViewField ? canViewField('sell_price') !== false : true) ? (
              <div className="flex flex-col gap-0">
                <span className="text-gray-500 dark:text-gray-400 text-[8px]">فروش</span>
                <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                  {formatPersianPrice(item.sell_price, true)}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => navigate(`/${moduleId}/${item.id}`)}
      className={`
        bg-gradient-to-b from-white to-gray-50 dark:from-[#1d1d1d] dark:to-[#171717] rounded-2xl border shadow-sm cursor-pointer transition-all flex flex-col group relative
        ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-[rgba(var(--brand-200-rgb),0.75)] hover:-translate-y-0.5 hover:border-[rgba(var(--brand-400-rgb),0.8)] hover:shadow-md dark:border-[rgba(var(--brand-300-rgb),0.2)]"}
        ${minimal ? "p-3 mb-2" : "p-3 h-full"}
      `}
    >
      {!hideSelection && (
        <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={isSelected} onChange={toggleSelect} />
        </div>
      )}

      <div className="mb-2 flex items-start justify-between gap-3">
        {!isTasks && (
          <Avatar
            shape="square"
            size={minimal ? 40 : 54}
            src={imageUrl}
            icon={<AppstoreOutlined />}
            className="rounded-xl bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />
        )}
        <div className={`min-w-0 flex-1 ${hideSelection ? '' : 'pr-6'}`}>
          <h4
            className={`font-extrabold text-gray-800 dark:text-white mb-0.5 ${minimal ? "text-[11px] leading-4 line-clamp-2 min-h-[2rem]" : "text-sm truncate"}`}
            title={title}
          >
            {title}
          </h4>
          <div className={`text-[10px] text-gray-400 font-mono ${minimal ? "leading-4" : "mb-1"}`}>
            {item.system_code || item.manual_code || "---"}
          </div>
          {isTasks && category && categoryAllowed && (
            <Tag
              color="default"
              className="!m-0 !rounded-full !border-0 !bg-gray-100 !px-2 !py-0.5 !text-[10px] !text-gray-600 dark:!bg-gray-800 dark:!text-gray-300"
            >
              {categoryLabel}
            </Tag>
          )}
        </div>
        {cardStatusMeta ? (
          <Tag
            color={cardStatusMeta.color || "default"}
            className="!m-0 !rounded-full !border-0 !px-2 !py-0.5 !text-[10px] !font-semibold shrink-0"
          >
            {cardStatusMeta.label}
          </Tag>
        ) : null}
      </div>

      {!minimal && (
        <>
          <div className="flex justify-between gap-2 mb-2 px-0">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {!isTasks && statusOption && (canViewField ? canViewField(statusFieldConfig?.key || 'status') !== false : true) && (
                <Tag color={statusOption.color || "default"} style={{ fontSize: "10px", lineHeight: "16px", margin: 0 }}>
                  {statusOption.label}
                </Tag>
              )}

              {category && (canViewField ? canViewField(categoryFieldConfig?.key || 'category') !== false : true) && (
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

            {tagsField && item[tagsField] && (
              <div className="flex flex-wrap gap-1 justify-end flex-1">
                {(Array.isArray(item[tagsField]) ? item[tagsField] : [item[tagsField]]).slice(0, 1).map((t: any, idx: number) => {
                  const tagTitle = typeof t === "string" ? t : t.title || t.label;
                  const tagColor = typeof t === "string" ? "blue" : t.color || "blue";
                  return (
                    <Tag key={idx} color={tagColor} style={{ fontSize: "9px", lineHeight: "14px", margin: 0, padding: "1px 4px" }}>
                      {tagTitle}
                    </Tag>
                  );
                })}
                {Array.isArray(item[tagsField]) && item[tagsField].length > 1 && (
                  <Popover
                    content={
                      <div className="flex flex-wrap gap-1">
                        {item[tagsField].slice(1).map((t: any, idx: number) => {
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
                    title={`${item[tagsField].length - 1} برچسب بیشتر`}
                    trigger="click"
                  >
                    <span className="text-[9px] text-gray-500 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 font-medium">
                      +{item[tagsField].length - 1}
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
                {item.buy_price && (canViewField ? canViewField('buy_price') !== false : true) && (
                  <div className="flex flex-col gap-0">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">خرید</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                      {formatPersianPrice(item.buy_price, true)}
                    </span>
                  </div>
                )}
                {item.sell_price && (canViewField ? canViewField('sell_price') !== false : true) && (
                  <div className="flex flex-col gap-0">
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">فروش</span>
                    <span className="font-bold text-gray-700 dark:text-gray-300 persian-number text-[11px]">
                      {formatPersianPrice(item.sell_price, true)}
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
          className={`${minimal ? 'mt-2' : 'mt-3'} rounded-lg border border-[#d6c2ab] bg-[#faf5ef] dark:border-[#4b3a2b] dark:bg-[#2b241e] p-2`}
          onClick={(e) => e.stopPropagation()}
        >
          <ProductionStagesField
            recordId={String(item.related_production_order)}
            moduleId="production_orders"
            readOnly
            compact
            cardCompact
            allowReportEditInReadOnly
            lazyLoad
            onlyLineId={String(item.production_line_id)}
          />
        </div>
      )}
      {isExecutionProcessTask && (
        <div
          className={`${minimal ? 'mt-2' : 'mt-3'} rounded-lg border border-[#d6c2ab] bg-[#faf5ef] dark:border-[#4b3a2b] dark:bg-[#2b241e] p-2`}
          onClick={(e) => e.stopPropagation()}
        >
          <ProductionStagesField
            recordId={String(relatedProcessRecordId)}
            moduleId={relatedProcessModuleId}
            readOnly
            compact
            cardCompact
            allowReportEditInReadOnly
            lazyLoad
          />
        </div>
      )}
    </div>
  );
};

export default RenderCardItem;
