import React from 'react';
import { Button, Dropdown, Tag, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';

interface BulkActionsBarProps {
  selectedCount: number;
  placement?: 'floating' | 'inline';
  onClear: () => void;
  onSelectAll?: () => void;
  onSelectAllPages?: () => void;
  selectAllLabel?: string;
  selectAllPagesLabel?: string;
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
  placement = 'floating',
  onClear,
  onSelectAll,
  onSelectAllPages,
  selectAllLabel = 'انتخاب همه',
  selectAllPagesLabel = 'انتخاب همه صفحات',
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
  const isVisible = selectedCount > 0;
  const isInline = placement === 'inline';
  const sharedTooltipProps = {
    zIndex: 13250,
    mouseEnterDelay: 0.12,
    getPopupContainer: () => document.body,
  } as const;

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
    <div
      className={
        isInline
          ? 'bulk-actions-inline-enter h-full w-full'
          : 'pointer-events-none fixed inset-x-2 bottom-28 z-[950] flex justify-center md:inset-x-6 md:bottom-12'
      }
      style={isInline ? undefined : { paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        aria-hidden={!isVisible}
        className={`${isInline ? '' : `${isVisible ? 'pointer-events-auto' : 'pointer-events-none'} `}flex w-full ${isInline ? 'h-full min-h-full ' : 'max-w-5xl '}flex-col gap-3 rounded-2xl px-3 py-3 text-[rgb(var(--brand-700-rgb))] transition-all duration-300 ease-out md:flex-row md:items-center md:justify-between md:px-4 dark:text-white ${
          isInline
            ? 'border border-[rgba(var(--brand-300-rgb),0.65)] bg-[rgba(var(--brand-50-rgb),0.96)] shadow-[0_14px_34px_-20px_rgba(var(--brand-700-rgb),0.4)] dark:border-[rgba(var(--brand-300-rgb),0.2)] dark:bg-[rgba(var(--app-dark-surface-rgb),0.96)]'
            : isVisible
              ? 'translate-y-0 scale-100 opacity-100 border-2 border-[rgba(var(--brand-500-rgb),0.42)] bg-[linear-gradient(135deg,rgba(var(--brand-100-rgb),0.96),rgba(var(--brand-500-rgb),0.16),rgba(var(--brand-600-rgb),0.28))] shadow-[0_0_0_2px_rgba(var(--brand-500-rgb),0.18),0_0_24px_rgba(var(--brand-500-rgb),0.22),0_24px_64px_rgba(var(--brand-700-rgb),0.28)] backdrop-blur dark:border-[rgba(var(--brand-300-rgb),0.24)] dark:bg-[linear-gradient(135deg,rgba(var(--brand-700-rgb),0.82),rgba(var(--brand-900-rgb),0.96))]'
              : 'translate-y-6 scale-[0.98] opacity-0'
        }`}
      >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Tag className={`!m-0 rounded-full border-[rgba(var(--brand-500-rgb),0.3)] px-2 py-0.5 font-['Peyda'] text-[rgb(var(--brand-700-rgb))] shadow-sm dark:text-white ${isInline ? 'bg-white dark:bg-white/10' : 'bg-white/70 dark:bg-white/10'}`}>
          <span className="persian-number">{selectedCount.toLocaleString('fa-IR')} انتخاب شده</span>
        </Tag>
        <Button onClick={onClear} size="small" type="text" danger className="!px-2 !text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10">
          لغو انتخاب
        </Button>
        {onSelectAll && (
          <Button
            onClick={onSelectAll}
            size="small"
            type="text"
            disabled={selectAllDisabled}
            loading={selectAllLoading}
            className="!px-2 !text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10"
          >
            {selectAllLabel}
          </Button>
        )}
        {onSelectAllPages && (
          <Button
            onClick={onSelectAllPages}
            size="small"
            type="text"
            disabled={selectAllPagesDisabled}
            loading={selectAllPagesLoading}
            className="!px-2 !text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10"
          >
            {selectAllPagesLabel}
          </Button>
        )}
        {primaryActionButton &&
          (primaryActionTooltip ? (
            <Tooltip {...sharedTooltipProps} title={primaryActionTooltip}>
              <span className="inline-flex">{primaryActionButton}</span>
            </Tooltip>
          ) : (
              primaryActionButton
          ))}
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto">
        {extraActions.map((action) => (
          <Tooltip key={action.key} {...sharedTooltipProps} title={action.tooltip}>
            <span className="inline-flex">
              <Button
                type="text"
                icon={action.icon}
                size="small"
                onClick={action.onClick}
                disabled={action.disabled}
                danger={action.danger}
                aria-label={action.tooltip}
                className="!rounded-lg !text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10"
              />
            </span>
          </Tooltip>
        ))}
        {onEdit && (
          <Tooltip {...sharedTooltipProps} title="ویرایش گروهی">
            <span className="inline-flex">
              <Button type="text" icon={<EditOutlined />} size="small" onClick={onEdit} aria-label="ویرایش گروهی" className="!text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10" />
            </span>
          </Tooltip>
        )}
        {onCopy && (
          <Tooltip {...sharedTooltipProps} title="کپی">
            <span className="inline-flex">
              <Button type="text" icon={<CopyOutlined />} size="small" onClick={onCopy} aria-label="کپی" className="!text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10" />
            </span>
          </Tooltip>
        )}
        {Array.isArray(exportMenuItems) && exportMenuItems.length > 0 ? (
          <Tooltip {...sharedTooltipProps} title="خروجی">
            <span className="inline-flex">
              <Dropdown
                trigger={['click']}
                menu={{ items: exportMenuItems }}
                placement="bottomLeft"
                overlayStyle={{ zIndex: 13250 }}
                getPopupContainer={() => document.body}
              >
                <Button type="text" icon={<ExportOutlined />} size="small" aria-label="خروجی" className="!text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10" />
              </Dropdown>
            </span>
          </Tooltip>
        ) : onExport ? (
          <Tooltip {...sharedTooltipProps} title="خروجی">
            <span className="inline-flex">
              <Button type="text" icon={<ExportOutlined />} size="small" onClick={onExport} aria-label="خروجی" className="!text-[rgb(var(--brand-700-rgb))] hover:!bg-white/40 dark:!text-white dark:hover:!bg-white/10" />
            </span>
          </Tooltip>
        ) : null}
        {onDelete && (
          <Tooltip {...sharedTooltipProps} title="حذف">
            <span className="inline-flex">
              <Button danger type="text" icon={<DeleteOutlined />} size="small" onClick={onDelete} aria-label="حذف" className="hover:!bg-white/40 dark:hover:!bg-white/10" />
            </span>
          </Tooltip>
        )}
      </div>
      </div>
    </div>
  );
};

export default BulkActionsBar;
