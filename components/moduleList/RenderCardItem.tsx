import React from "react";
import { Avatar, Checkbox, Popover, Tag } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FieldType } from "../../types";
import { formatPersianPrice, toPersianNumber, safeJalaliFormat, parseDateValue } from "../../utils/persianNumberFormatter";
import { getRecordTitle } from "../../utils/recordTitle";
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
  canViewField,
  relationOptions = {},
}) => {
  const isSelected = selectedRowKeys.includes(item.id);
  const imageUrl = imageField ? item[imageField] : null;
  const title = getRecordTitle(item, moduleConfig, { fallback: "-" });
  const isTasks = moduleId === 'tasks';
  const isProductionTask = (
    isTasks
    && String(item?.related_to_module || '') === 'production_orders'
    && item?.related_production_order
    && item?.production_line_id
  );

  const statusFieldConfig = moduleConfig?.fields.find(
    (f: any) => f.type === FieldType.STATUS || f.key === statusField,
  );
  const status = statusField ? item[statusField] : null;
  const statusOption = statusFieldConfig?.options?.find((o: any) => o.value === status);

  const categoryFieldConfig = moduleConfig?.fields.find((f: any) => f.key === categoryField);
  const category = categoryField ? item[categoryField] : null;
  const categoryLabel = categoryFieldConfig?.options?.find((o: any) => o.value === category)?.label || category;

  const assigneeId = item.assignee_id;
  const assigneeType = item.assignee_type;
  const dueDate = item.due_date;
  const assigneeAllowed = canViewField ? canViewField('assignee_id') !== false : true;
  const dueAllowed = canViewField ? canViewField('due_date') !== false : true;
  const categoryAllowed = canViewField ? canViewField(categoryFieldConfig?.key || 'related_to_module') !== false : true;
  const relatedRelationFields = isTasks
    ? (moduleConfig?.fields || []).filter(
        (f: any) => f?.type === FieldType.RELATION && String(f?.key || '').startsWith('related_')
      )
    : [];
  const selectedRelationField = isTasks
    ? (
        relatedRelationFields.find((f: any) => f?.relationConfig?.targetModule === item?.related_to_module && item?.[f.key])
        || relatedRelationFields.find((f: any) => item?.[f.key])
      )
    : null;
  const relatedRecordId = selectedRelationField ? item?.[selectedRelationField.key] : null;
  const relatedModuleId = isTasks
    ? (item?.related_to_module || selectedRelationField?.relationConfig?.targetModule || null)
    : null;
  const relatedFieldAllowed = selectedRelationField
    ? (canViewField ? canViewField(selectedRelationField.key) !== false : true)
    : false;
  const relatedOptions = selectedRelationField ? relationOptions?.[selectedRelationField.key] || [] : [];
  const relatedOptionLabel = relatedRecordId
    ? relatedOptions.find((opt: any) => opt?.value === relatedRecordId)?.label
    : null;
  const relatedRecordLabel = relatedOptionLabel || (relatedRecordId ? String(relatedRecordId) : null);
  const relatedModuleTitle = relatedModuleId
    ? (MODULES as Record<string, any>)?.[String(relatedModuleId)]?.titles?.fa || String(relatedModuleId)
    : null;
  const showRelatedRecord = isTasks && relatedRecordId && relatedModuleId && relatedFieldAllowed;

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

  return (
    <div
      onClick={() => navigate(`/${moduleId}/${item.id}`)}
      className={`
        bg-white dark:bg-[#1e1e1e] rounded-xl border shadow-sm cursor-pointer transition-all flex flex-col group relative
        ${isSelected ? "border-leather-500 ring-1 ring-leather-500 bg-leather-50 dark:bg-leather-900/20" : "border-gray-200 dark:border-gray-700 hover:border-leather-400 hover:shadow-md"}
        ${minimal ? "p-3 mb-2" : "p-3 h-full"}
      `}
    >
      <div className="absolute top-3 right-3 z-10" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={isSelected} onChange={toggleSelect} />
      </div>

      <div className="flex gap-2 mb-2">
        {!isTasks && (
          <Avatar
            shape="square"
            size={minimal ? 40 : 54}
            src={imageUrl}
            icon={<AppstoreOutlined />}
            className="rounded-lg bg-gray-50 border border-gray-100 dark:bg-gray-800 dark:border-gray-700 shrink-0 object-cover"
          />
        )}
        <div className="min-w-0 flex-1 pr-6">
          <h4
            className={`font-bold text-gray-800 dark:text-white truncate mb-0.5 ${minimal ? "text-xs" : "text-sm"}`}
            title={title}
          >
            {title}
          </h4>
          <div className="text-[10px] text-gray-400 font-mono mb-1">
            {item.system_code || item.manual_code || "---"}
          </div>
          {isTasks && category && categoryAllowed && (
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
      </div>

      {!minimal && (
        <>
          <div className="flex justify-between gap-2 mb-2 px-0">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              {statusOption && (canViewField ? canViewField(statusFieldConfig?.key || 'status') !== false : true) && (
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
                    <span className="text-gray-500 dark:text-gray-400 text-[8px]">مسئول</span>
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
              <span className="text-gray-500 dark:text-gray-400 text-[8px]">مسئول</span>
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
          className={`${minimal ? 'mt-2' : 'mt-3'} rounded-lg border border-[#d6c2ab] bg-[#faf5ef] p-2`}
          onClick={(e) => e.stopPropagation()}
        >
          <ProductionStagesField
            recordId={String(item.related_production_order)}
            moduleId="production_orders"
            readOnly
            compact
            lazyLoad
            onlyLineId={String(item.production_line_id)}
          />
        </div>
      )}
    </div>
  );
};

export default RenderCardItem;
