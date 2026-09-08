import React from 'react';
import { Button, Tooltip } from 'antd';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { getRecordTitle } from '../../utils/recordTitle';
import { resolveCardStatusMeta } from '../../utils/recordCardHelpers';
import { resolveMapStatusColor } from '../../utils/mapStatusColor';
import AssigneeAvatarDisplay from '../common/AssigneeAvatarDisplay';
import RenderCardItem from '../moduleList/RenderCardItem';
import TaskStatusIcon from '../tasks/TaskStatusIcon';

type ResponsibilityListRowProps = {
  item: any;
  moduleId: string;
  moduleConfig: any;
  imageField?: string;
  tagsField?: string;
  statusField?: string;
  categoryField?: string;
  moduleBadgeLabel?: string | null;
  allUsers?: any[];
  allRoles?: any[];
  onOpen: (moduleId: string, recordId: string, label?: string) => void;
  canLockRecord?: boolean;
  canUnlockRecord?: boolean;
};

/** Compact, expandable representation for responsibility records from any module. */
const ResponsibilityListRow: React.FC<ResponsibilityListRowProps> = ({
  item,
  moduleId,
  moduleConfig,
  imageField,
  tagsField,
  statusField,
  categoryField,
  moduleBadgeLabel,
  allUsers = [],
  allRoles = [],
  onOpen,
  canLockRecord = false,
  canUnlockRecord = false,
}) => {
  const [expanded, setExpanded] = React.useState(false);
  const title = getRecordTitle(item, moduleConfig, { fallback: 'بدون عنوان' });
  const statusMeta = resolveCardStatusMeta(item, moduleConfig, statusField);
  const statusOption = statusMeta?.field?.options?.find(
    (option: any) => String(option?.value || '') === String(statusMeta?.value || ''),
  );
  const statusColor = resolveMapStatusColor(statusMeta?.color) || '#9ca3af';

  React.useEffect(() => {
    setExpanded(false);
  }, [item?.id, item?.updated_at]);

  return (
    <article
      className="overflow-hidden rounded-xl border border-gray-200/90 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-white/10 dark:bg-[rgba(var(--app-dark-surface-rgb),0.92)]"
      style={{ borderRightWidth: 4, borderRightColor: statusColor }}
    >
      <div className="flex min-w-0 items-center gap-2 px-3 py-2.5">
        <AssigneeAvatarDisplay
          source={item}
          allUsers={allUsers}
          allRoles={allRoles}
          avatarSize={30}
          showLabel={false}
          emptyPlaceholder={<span className="h-[30px] w-[30px] rounded-full border border-dashed border-gray-300 dark:border-gray-600" />}
          className="shrink-0"
        />

        <button
          type="button"
          className="min-w-0 flex-1 text-right"
          onClick={() => onOpen(moduleId, String(item?.id || ''), title)}
        >
          <span className="block truncate text-sm font-bold text-gray-800 hover:text-leather-700 hover:underline dark:text-gray-100">
            {title}
          </span>
          <span className="mt-0.5 block truncate text-[10px] font-semibold text-gray-400">
            {moduleBadgeLabel || moduleConfig?.titles?.fa || 'مسئولیت'}
          </span>
        </button>

        {statusMeta ? (
          <Tooltip title={statusMeta.label}>
            <span
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-base shadow-sm"
              style={{
                color: statusColor,
                borderColor: `${statusColor}66`,
                backgroundColor: `${statusColor}14`,
              }}
              aria-label={statusMeta.label}
            >
              <TaskStatusIcon iconKey={statusOption?.icon || 'circle'} />
            </span>
          </Tooltip>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-gray-100 p-2.5 dark:border-white/10">
          <RenderCardItem
            item={item}
            moduleId={moduleId}
            moduleConfig={moduleConfig}
            imageField={imageField}
            tagsField={tagsField}
            statusField={statusField}
            categoryField={categoryField}
            allUsers={allUsers}
            allRoles={allRoles}
            selectedRowKeys={[]}
            setSelectedRowKeys={() => undefined}
            navigate={(path) => {
              const [, targetModuleId, recordId] = String(path || '').split('/');
              if (!targetModuleId || !recordId) return;
              onOpen(targetModuleId, recordId);
            }}
            canViewField={() => true}
            hideSelection
            moduleBadgeLabel={moduleBadgeLabel}
            canLockRecord={canLockRecord}
            canUnlockRecord={canUnlockRecord}
          />
        </div>
      ) : null}

      <Button
        type="text"
        size="small"
        block
        className="!h-7 !rounded-none !border-x-0 !border-b-0 !border-t !border-gray-100 !text-gray-400 hover:!text-leather-700 dark:!border-white/10 dark:!text-gray-400"
        icon={expanded ? <UpOutlined /> : <DownOutlined />}
        aria-expanded={expanded}
        aria-label={expanded ? 'بستن جزئیات مسئولیت' : 'نمایش جزئیات مسئولیت'}
        onClick={() => setExpanded((previous) => !previous)}
      />
    </article>
  );
};

export default React.memo(ResponsibilityListRow);
