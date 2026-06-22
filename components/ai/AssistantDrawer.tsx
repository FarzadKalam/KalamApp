import React from 'react';
import { Drawer } from 'antd';
import AiSparkleIcon from './AiSparkleIcon';
import AssistantPanel from './AssistantPanel';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';

interface AssistantDrawerProps {
  open: boolean;
  onClose: () => void;
  isMobile?: boolean;
}

const AssistantDrawer: React.FC<AssistantDrawerProps> = ({ open, onClose, isMobile = false }) => {
  return (
    <Drawer
      title={(
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#f0abfc] bg-[#fdf2f8] text-[#be185d] dark:border-[#be185d]/55 dark:bg-[#3b1022] dark:text-[#f9a8d4]">
            <AiSparkleIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-bold">دستیار هوشمند</div>
            <div className="truncate text-[11px] font-normal text-gray-500 dark:text-gray-400">پاسخ سریع و دقیق</div>
          </div>
        </div>
      )}
      open={open}
      onClose={onClose}
      width={isMobile ? '100%' : 460}
      placement="left"
      classNames={{ body: '!p-0' }}
      destroyOnHidden
      getContainer={typeof document === 'undefined' ? undefined : () => document.body}
      afterOpenChange={(nextOpen) => {
        if (!nextOpen) scheduleOverlayLockRelease();
      }}
    >
      <AssistantPanel active={open} />
    </Drawer>
  );
};

export default AssistantDrawer;
