import React from 'react';
import { Button, Empty, Skeleton } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { FieldType } from '../../types';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import RenderCardItem from '../moduleList/RenderCardItem';

type CreatedSortDirection = 'desc' | 'asc';

type ResponsibilityView = { key: string; label: string };

const getModuleCardFields = (moduleConfig: any) => {
  const fields = moduleConfig?.fields || [];
  return {
    imageField: fields.find((field: any) => field?.type === FieldType.IMAGE)?.key,
    tagsField: fields.find((field: any) => field?.type === FieldType.TAGS || field?.key === 'tags')?.key,
    statusField: fields.find((field: any) => field?.type === FieldType.STATUS || field?.key === 'status')?.key,
    categoryField: fields.find((field: any) => ['category', 'task_type'].includes(String(field?.key || '')))?.key,
  };
};

type ResponsibilitiesPanelProps = {
  mode: 'list' | 'grid';
  filteredResponsibilities: any[];
  visibleCount: number;
  onShowMore: () => void;
  onShowLess: () => void;
  loadingResponsibilities: boolean;
  responsibilityViewKey: string;
  setResponsibilityViewKey: (key: string) => void;
  responsibilitySortDirection: CreatedSortDirection;
  setResponsibilitySortDirection: React.Dispatch<React.SetStateAction<CreatedSortDirection>>;
  responsibilityViews: ResponsibilityView[];
  directoryUsers: any[];
  directoryRoles: any[];
  openPreviewRecord: (moduleId: string, recordId: string, label?: string) => void;
  recordTitleMap: Record<string, string>;
  formatRecordLabel: (row: any, moduleId?: string | null) => string;
  roleNameMap: Record<string, string>;
  assigneeNameMap: Record<string, string>;
  createdByNameMap: Record<string, string>;
  handleClose: () => void;
  maxItems: number;
};

const ResponsibilitiesPanel: React.FC<ResponsibilitiesPanelProps> = ({
  mode,
  filteredResponsibilities,
  visibleCount,
  onShowMore,
  onShowLess,
  loadingResponsibilities,
  responsibilityViewKey,
  setResponsibilityViewKey,
  responsibilitySortDirection,
  setResponsibilitySortDirection,
  responsibilityViews,
  directoryUsers,
  directoryRoles,
  openPreviewRecord,
  recordTitleMap,
  formatRecordLabel,
  handleClose,
  maxItems,
}) => {
  const data = filteredResponsibilities.slice(0, visibleCount);
  const remainingCount = Math.max(0, filteredResponsibilities.length - data.length);
  const canShowLess = visibleCount > maxItems;

  const renderCreatedAtSortControls = () => (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-gray-50 px-1 py-0.5 dark:border-gray-700 dark:bg-white/5">
      <Button
        type="text"
        size="small"
        icon={<DownOutlined />}
        className={responsibilitySortDirection === 'desc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setResponsibilitySortDirection('desc')}
      />
      <Button
        type="text"
        size="small"
        icon={<UpOutlined />}
        className={responsibilitySortDirection === 'asc' ? '!text-[rgb(var(--brand-700-rgb))]' : '!text-gray-400'}
        onClick={() => setResponsibilitySortDirection('asc')}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {mode === 'grid' ? (
        <div className="flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/88 p-1 h-10 shadow-sm overflow-hidden dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.88)]">
          {renderCreatedAtSortControls()}
          <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar px-1">
            {responsibilityViews.map((view) => (
              <div
                key={view.key}
                onClick={() => {
                  setResponsibilityViewKey(view.key);
                }}
                className={`group px-3 py-1 rounded-lg text-xs cursor-pointer whitespace-nowrap transition-all flex items-center gap-2 select-none border ${
                  responsibilityViewKey === view.key
                    ? 'bg-leather-600 text-white border-leather-600 shadow-sm font-bold'
                    : 'bg-transparent border-transparent hover:bg-gray-100/80 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300'
                }`}
              >
                {view.label}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {loadingResponsibilities ? (
        <div className="space-y-2">
          <Skeleton active paragraph={{ rows: 3 }} />
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : data.length === 0 ? (
        <Empty description="مسئولیتی یافت نشد" />
      ) : mode === 'grid' ? (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {data.map((item: any) => {
              const moduleConfig = MODULES[item.module_id];
              if (!moduleConfig) return null;
              const { imageField, tagsField, statusField, categoryField } = getModuleCardFields(moduleConfig);
              return (
                <RenderCardItem
                  key={`${item.module_id}:${item.id}`}
                  item={{
                    ...item,
                    name: recordTitleMap[`${item.module_id}:${item.id}`] || item.name,
                  }}
                  moduleId={item.module_id}
                  moduleConfig={moduleConfig}
                  imageField={imageField}
                  tagsField={tagsField}
                  statusField={statusField}
                  categoryField={categoryField}
                  allUsers={directoryUsers}
                  allRoles={directoryRoles}
                  selectedRowKeys={[]}
                  setSelectedRowKeys={() => undefined}
                  navigate={(path) => {
                    const [, moduleId, recordId] = String(path || '').split('/');
                    if (!moduleId || !recordId) return;
                    openPreviewRecord(
                      moduleId,
                      recordId,
                      recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ ...item, id: recordId, module_id: moduleId }, moduleId)
                    );
                  }}
                  canViewField={() => true}
                  hideSelection
                  moduleBadgeLabel={moduleConfig.titles?.fa || item.module_title || item.module_id}
                />
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="grid grid-cols-1 gap-3">
            {data.map((item: any) => {
              const moduleConfig = MODULES[item.module_id];
              if (!moduleConfig) return null;
              const { imageField, tagsField, statusField, categoryField } = getModuleCardFields(moduleConfig);
              const moduleBadgeLabel = moduleConfig.titles?.fa || item.module_title || item.module_id;
              return (
                <RenderCardItem
                  key={`${item.module_id}:${item.id}`}
                  item={{
                    ...item,
                    name: recordTitleMap[`${item.module_id}:${item.id}`] || item.name,
                  }}
                  moduleId={item.module_id}
                  moduleConfig={moduleConfig}
                  imageField={imageField}
                  tagsField={tagsField}
                  statusField={statusField}
                  categoryField={categoryField}
                  allUsers={directoryUsers}
                  allRoles={directoryRoles}
                  selectedRowKeys={[]}
                  setSelectedRowKeys={() => undefined}
                  navigate={(path) => {
                    const [, moduleId, recordId] = String(path || '').split('/');
                    if (!moduleId || !recordId) return;
                    openPreviewRecord(
                      moduleId,
                      recordId,
                      recordTitleMap[`${moduleId}:${recordId}`] || formatRecordLabel({ ...item, id: recordId, module_id: moduleId }, moduleId)
                    );
                    handleClose();
                  }}
                  canViewField={() => true}
                  hideSelection
                  minimal
                  moduleBadgeLabel={moduleBadgeLabel}
                />
              );
            })}
          </div>
        </div>
      )}

      {filteredResponsibilities.length > maxItems ? (
        <div className="flex items-center justify-between gap-2">
          {canShowLess ? (
            <Button type="link" onClick={onShowLess}>
              نمایش کمتر
            </Button>
          ) : <span />}
          {remainingCount > 0 ? (
            <Button type="link" onClick={onShowMore}>
              مشاهده موارد بیشتر ({toPersianNumber(String(remainingCount))})
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default React.memo(ResponsibilitiesPanel);
