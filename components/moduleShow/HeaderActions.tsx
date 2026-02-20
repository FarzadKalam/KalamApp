import React from 'react';
import { Button, Tooltip, Popover, QRCode } from 'antd';
import { ArrowRightOutlined, PrinterOutlined, ShareAltOutlined, QrcodeOutlined, EditOutlined, DeleteOutlined, AppstoreOutlined, PlusOutlined, StarOutlined, ReloadOutlined, CopyOutlined } from '@ant-design/icons';

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
  refreshLoading?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  extraActions?: { id: string; label: string; variant?: 'primary' | 'default'; onClick: () => void; }[];
}

const HeaderActions: React.FC<HeaderActionsProps> = ({
  shareUrl,
  onBack,
  onPrint,
  onRefresh,
  onCopy,
  onEdit,
  onDelete,
  refreshLoading = false,
  canEdit = true,
  canDelete = true,
  extraActions = [],
}) => {
  return (
    <div className="flex w-full justify-between items-center flex-wrap gap-2 mb-2 flex-row-reverse">
      <div className="flex gap-2 flex-wrap">
        {extraActions.map(action => (
          <Button
            key={action.id}
            icon={
              action.id === 'auto_name'
                ? <StarOutlined />
                : action.variant === 'primary'
                  ? <PlusOutlined />
                  : <AppstoreOutlined />
            }
            type={action.variant === 'primary' ? 'primary' : 'default'}
            onClick={action.onClick}
            size="middle"
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
            size="middle"
            className="hover:text-leather-600 hover:border-leather-600" 
          />
        </Tooltip>
        <Popover content={<QRCode value={shareUrl} bordered={false} />} trigger="click">
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

      <Tooltip title="بازگشت">
        <Button
          icon={<ArrowRightOutlined />}
          onClick={onBack}
          shape="circle"
          size="middle"
          className="border-none shadow-sm"
        />
      </Tooltip>
    </div>
  );
};

export default HeaderActions;
