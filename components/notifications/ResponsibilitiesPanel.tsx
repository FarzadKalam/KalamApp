import React from 'react';
import { Button, Empty, List, Skeleton } from 'antd';
import { DownOutlined, UpOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { MODULES } from '../../moduleRegistry';
import { FieldType } from '../../types';
import { safeJalaliFormat } from '../../utils/persianNumberFormatter';
import { getResolvedAssigneeId } from '../../utils/assigneeValue';
import RenderCardItem from '../moduleList/RenderCardItem';

type CreatedSortDirection = 'desc' | 'asc';

type ResponsibilityView = { key: string; label: string };

const resolveOptionLabel = (value: any, options?: { label: string; value: any }[]) => {
  if (!options?.length) return null;
  const found = options.find(opt => String(opt.value) === String(value));
  return found ? found.label : null;
};

const STATUS_LABEL_FALLBACKS: Record<string, string> = {
  todo: 'انجام نشده',
  pending: 'در انتظار',
  in_progress: 'در حال انجام',
  review: 'بازبینی',
  done: 'تکمیل شده',
  completed: 'تکمیل شده',
  canceled: 'لغو شده',
};

const resolveStatusLabelFallback = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  return STATUS_LABEL_FALLBACKS[normalized] || String(value || '').trim();
};

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
  showMore: boolean;
  setShowMore: (value: boolean) => void;
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
  showMore,
  setShowMore,
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
  roleNameMap,
  assigneeNameMap,
  createdByNameMap,
  handleClose,
  maxItems,
}) => {
  const data = showMore ? filteredResponsibilities : filteredResponsibilities.slice(0, maxItems);

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
                  setShowMore(false);
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
                  item={item}
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
                />
              );
            })}
          </div>
        </div>
      ) : (
        <List
          dataSource={data}
          renderItem={(item: any) => {
            const recordKey = `${item.module_id}:${item.id}`;
            const title = recordTitleMap[recordKey] || formatRecordLabel(item, item.module_id);
            const moduleConfig = MODULES[item.module_id];
            const statusField = moduleConfig?.fields?.find((f: any) => f.key === 'status');
            const categoryField = moduleConfig?.fields?.find((f: any) => f.key === 'category');
            const statusLabel = resolveOptionLabel(item.status, statusField?.options) || resolveStatusLabelFallback(item.status);
            const categoryLabel = resolveOptionLabel(item.category, categoryField?.options);
            const assigneeLabel = item.assignee_type === 'role'
              ? (roleNameMap[String(getResolvedAssigneeId(item) || '')] || 'نقش')
              : (assigneeNameMap[String(getResolvedAssigneeId(item) || '')] || 'کاربر');
            const createdById = item.created_by || item.created_by_id;
            const createdByLabel = createdById ? (createdByNameMap[createdById] || createdById) : null;
            return (
              <div className="mb-2">
                <div className="rounded-xl border border-gray-200/80 bg-white/92 p-3 shadow-sm dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.72)]">
                  <div className="text-xs text-gray-500 mb-2">{item.module_title}</div>
                  <Link
                    to={`/${item.module_id}/${item.id}`}
                    className="block w-full text-right text-sm font-semibold leading-5 text-gray-800 line-clamp-2 break-words overflow-hidden dark:text-gray-200"
                    title={title}
                    onClick={handleClose}
                  >
                    {title}
                  </Link>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {categoryLabel ? (
                      <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                        {categoryLabel}
                      </span>
                    ) : null}
                    {statusLabel ? (
                      <span className="text-[11px] bg-[rgba(var(--brand-50-rgb),0.9)] dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2 py-0.5 rounded-full">
                        {statusLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500">
                    <span className="flex items-center gap-1">
                      {item.assignee_type === 'role' ? <TeamOutlined /> : <UserOutlined />}
                      {assigneeLabel}
                    </span>
                    <span>{safeJalaliFormat(item.created_at, 'YYYY/MM/DD HH:mm')}</span>
                  </div>
                  {createdByLabel ? (
                    <div className="text-[11px] text-gray-400 mt-1">
                      ایجاد کننده: {createdByLabel}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          }}
        />
      )}

      {filteredResponsibilities.length > maxItems ? (
        <Button type="link" onClick={() => setShowMore(!showMore)}>
          {showMore ? 'نمایش کمتر' : 'نمایش بیشتر'}
        </Button>
      ) : null}
    </div>
  );
};

export default React.memo(ResponsibilitiesPanel);
