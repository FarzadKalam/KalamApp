import React, { useCallback } from 'react';
import { App, Button, Popover, QRCode, Tooltip } from 'antd';
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  CopyOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  PrinterOutlined,
  QrcodeOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  StarOutlined,
} from '@ant-design/icons';

interface HeaderActionsProps {
  moduleTitle: string;
  recordName: string;
  shareUrl: string;
  onBack: () => void;
  onHome: () => void;
  onModule: () => void;
  onPrint: () => void;
  onRefresh?: () => void;
  onCopy?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  lockControl?: React.ReactNode;
  refreshLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  extraActions?: {
    id: string;
    label: string;
    variant?: 'primary' | 'default';
    onClick: () => void;
    icon?: React.ReactNode;
    loading?: boolean;
  }[];
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
  moduleTitle,
  recordName,
  shareUrl,
  onBack,
  onPrint,
  onRefresh,
  onCopy,
  onEdit,
  onDelete,
  lockControl = null,
  refreshLoading = false,
  canEdit = true,
  canDelete = true,
  extraActions = [],
}) => {
  const { message } = App.useApp();
  const resolvedShareUrl = shareUrl || (typeof window !== 'undefined' ? window.location.href : '');

  const handleShare = useCallback(async () => {
    if (!resolvedShareUrl) {
      message.error('لینک اشتراک گذاری در دسترس نیست.');
      return;
    }

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({
          title: recordName || moduleTitle,
          url: resolvedShareUrl,
        });
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(resolvedShareUrl);
        message.success('لینک اشتراک گذاری کپی شد.');
        return;
      }

      message.error('امکان اشتراک گذاری در این مرورگر در دسترس نیست.');
    } catch (error: any) {
      if (error?.name === 'AbortError') return;
      message.error('اشتراک گذاری این بخش ناموفق بود.');
    }
  }, [message, moduleTitle, recordName, resolvedShareUrl]);

  return (
    <div className="flex w-full justify-between items-center flex-wrap gap-2 mb-2 flex-row-reverse">
      <div className="flex gap-2 flex-wrap">
        {extraActions.map((action) => (
          <Button
            key={action.id}
            icon={
              action.icon
                ? action.icon
                : action.id === 'auto_name'
                  ? <StarOutlined />
                  : action.variant === 'primary'
                    ? <PlusOutlined />
                    : <AppstoreOutlined />
            }
            type={action.variant === 'primary' ? 'primary' : 'default'}
            onClick={action.onClick}
            size="middle"
            loading={action.loading}
            className={action.variant === 'primary' ? 'bg-leather-600 hover:!bg-leather-500 border-none' : 'hover:text-leather-600 hover:border-leather-600'}
          >
            {action.label}
          </Button>
        ))}
        <Tooltip title="چاپ">
          <Button
            icon={<PrinterOutlined />}
            onClick={onPrint}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600"
          />
        </Tooltip>
        <Tooltip title="بروزرسانی">
          <Button
            icon={<ReloadOutlined spin={refreshLoading} />}
            onClick={onRefresh}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600"
          />
        </Tooltip>
        <Tooltip title="اشتراک گذاری">
          <Button
            icon={<ShareAltOutlined />}
            onClick={() => void handleShare()}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600"
          />
        </Tooltip>
        <Popover content={<QRCode value={resolvedShareUrl} bordered={false} />} trigger="click">
          <Button
            icon={<QrcodeOutlined />}
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600"
          />
        </Popover>
        {onCopy && (
          <Tooltip title="کپی رکورد">
            <Button
              icon={<CopyOutlined />}
              onClick={onCopy}
              size="middle"
              className="hover:text-leather-600 hover:border-leather-600"
            />
          </Tooltip>
        )}
        {canEdit && (
          <Tooltip title="ویرایش">
            <Button
              icon={<EditOutlined />}
              onClick={onEdit}
              size="middle"
              className="hover:text-leather-600 hover:border-leather-600"
            />
          </Tooltip>
        )}
        {canDelete && (
          <Tooltip title="حذف">
            <Button
              icon={<DeleteOutlined />}
              danger
              onClick={onDelete}
              size="middle"
              className="hover:text-leather-600 hover:border-leather-600"
            />
          </Tooltip>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Tooltip title="بازگشت">
          <Button
            icon={<ArrowRightOutlined />}
            onClick={onBack}
            shape="circle"
            size="middle"
            className="border-none shadow-sm"
          />
        </Tooltip>
        {lockControl}
      </div>
    </div>
  );
};

export default HeaderActions;
