import React from 'react';
import { Button, Dropdown, Space, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';

interface BulkActionsBarProps {
  selectedCount: number;
  onClear: () => void;
  onSelectAll?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  exportMenuItems?: MenuProps['items'];
  onEdit?: () => void;
  onCopy?: () => void;
  selectAllDisabled?: boolean;
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
  onDelete,
  onExport,
  exportMenuItems,
  onEdit,
  onCopy,
  selectAllDisabled = false,
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
    <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 mb-3 shadow-sm">
      <Space size="middle">
        <Tag color="blue">{selectedCount} انتخاب شده</Tag>
        <Button onClick={onClear} size="small" type="text" danger>
          لغو انتخاب
        </Button>
        {onSelectAll && (
          <Button onClick={onSelectAll} size="small" type="text" disabled={selectAllDisabled}>
            انتخاب همه
          </Button>
        )}
        {primaryActionButton &&
          (primaryActionTooltip ? (
            <Tooltip title={primaryActionTooltip}>{primaryActionButton}</Tooltip>
          ) : (
            primaryActionButton
          ))}
      </Space>

      <Space size="small">
        {extraActions.map((action) => (
          <Tooltip key={action.key} title={action.tooltip}>
            <Button
              type="text"
              icon={action.icon}
              size="small"
              onClick={action.onClick}
              disabled={action.disabled}
              danger={action.danger}
              aria-label={action.tooltip}
            />
          </Tooltip>
        ))}
        {onEdit && (
          <Tooltip title="ویرایش گروهی">
            <Button type="text" icon={<EditOutlined />} size="small" onClick={onEdit} aria-label="ویرایش گروهی" />
          </Tooltip>
        )}
        {onCopy && (
          <Tooltip title="کپی">
            <Button type="text" icon={<CopyOutlined />} size="small" onClick={onCopy} aria-label="کپی" />
          </Tooltip>
        )}
        {Array.isArray(exportMenuItems) && exportMenuItems.length > 0 ? (
          <Tooltip title="خروجی">
            <Dropdown trigger={['click']} menu={{ items: exportMenuItems }} placement="bottomLeft">
              <Button type="text" icon={<ExportOutlined />} size="small" aria-label="خروجی" />
            </Dropdown>
          </Tooltip>
        ) : onExport ? (
          <Tooltip title="خروجی">
            <Button type="text" icon={<ExportOutlined />} size="small" onClick={onExport} aria-label="خروجی" />
          </Tooltip>
        ) : null}
        {onDelete && (
          <Tooltip title="حذف">
            <Button danger type="text" icon={<DeleteOutlined />} size="small" onClick={onDelete} aria-label="حذف" />
          </Tooltip>
        )}
      </Space>
    </div>
  );
};

export default BulkActionsBar;
