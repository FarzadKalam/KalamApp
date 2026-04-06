import React from 'react';
import { Button, Dropdown, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onSelectAll?: () => void;
  onSelectAllPages?: () => void;
  selectAllLoading?: boolean;
  selectAllPagesLoading?: boolean;
  onDelete?: () => void;
  onExport?: () => void;
  exportMenuItems?: MenuProps['items'];
  onEdit?: () => void;
  onCopy?: () => void;
  selectAllDisabled?: boolean;
  selectAllPagesDisabled?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  primaryActionTooltip?: string;
  extraActions?: Array<{
    key: string;
    icon: React.ReactNode;
    tooltip: string;
    onClick: () => void;
    disabled?: boolean;
    danger?: boolean;
  }>;
}

const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  selectedCount,
  onClear,
  onSelectAll,
  onSelectAllPages,
  selectAllLoading = false,
  selectAllPagesLoading = false,
  onDelete,
  onExport,
  exportMenuItems,
  onEdit,
  onCopy,
  selectAllDisabled = false,
  selectAllPagesDisabled = false,
  primaryActionLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  primaryActionTooltip,
  extraActions = [],
}) => {
  if (!selectedCount) return null;

  const primaryActionButton =
    onPrimaryAction && primaryActionLabel ? (
      <Button
        type="primary"
        size="small"
        onClick={onPrimaryAction}
        disabled={primaryActionDisabled}
        className="bg-leather-600 hover:!bg-leather-500 border-none"
      >
        {primaryActionLabel}
      </Button>
    ) : null;

  return (
    <div className="flex flex-col gap-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <Tag color="blue">{selectedCount} انتخاب شده</Tag>
        <Button onClick={onClear} size="small" type="text" danger>
          لغو انتخاب
        </Button>
        {onSelectAll && (
          <Button
            onClick={onSelectAll}
            size="small"
            type="text"
            disabled={selectAllDisabled}
            loading={selectAllLoading}
          >
            انتخاب همه
          </Button>
        )}
        {onSelectAllPages && (
          <Button
            onClick={onSelectAllPages}
            size="small"
            type="text"
            disabled={selectAllPagesDisabled}
            loading={selectAllPagesLoading}
          >
            انتخاب همه صفحات
          </Button>
        )}
        {primaryActionButton &&
          (primaryActionTooltip ? (
            <Tooltip title={primaryActionTooltip}>
              <span className="inline-flex">{primaryActionButton}</span>
            </Tooltip>
          ) : (
            primaryActionButton
          ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1 w-full sm:w-auto">
        {extraActions.map((action) => (
          <Tooltip key={action.key} title={action.tooltip}>
            <span className="inline-flex">
              <Button
                type="text"
                icon={action.icon}
                size="small"
                onClick={action.onClick}
                disabled={action.disabled}
                danger={action.danger}
                aria-label={action.tooltip}
              />
            </span>
          </Tooltip>
        ))}
        {onEdit && (
          <Tooltip title="ویرایش گروهی">
            <span className="inline-flex">
              <Button type="text" icon={<EditOutlined />} size="small" onClick={onEdit} aria-label="ویرایش گروهی" />
            </span>
          </Tooltip>
        )}
        {onCopy && (
          <Tooltip title="کپی">
            <span className="inline-flex">
              <Button type="text" icon={<CopyOutlined />} size="small" onClick={onCopy} aria-label="کپی" />
            </span>
          </Tooltip>
        )}
        {Array.isArray(exportMenuItems) && exportMenuItems.length > 0 ? (
          <Tooltip title="خروجی">
            <span className="inline-flex">
              <Dropdown trigger={['click']} menu={{ items: exportMenuItems }} placement="bottomLeft">
                <Button type="text" icon={<ExportOutlined />} size="small" aria-label="خروجی" />
              </Dropdown>
            </span>
          </Tooltip>
        ) : onExport ? (
          <Tooltip title="خروجی">
            <span className="inline-flex">
              <Button type="text" icon={<ExportOutlined />} size="small" onClick={onExport} aria-label="خروجی" />
            </span>
          </Tooltip>
        ) : null}
        {onDelete && (
          <Tooltip title="حذف">
            <span className="inline-flex">
              <Button danger type="text" icon={<DeleteOutlined />} size="small" onClick={onDelete} aria-label="حذف" />
            </span>
          </Tooltip>
        )}
      </div>
    </div>
  );
};

export default BulkActionsBar;
