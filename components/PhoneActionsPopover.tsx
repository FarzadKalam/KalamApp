import React from 'react';
import { Popover } from 'antd';
import PhoneDisplay from './PhoneDisplay';
import RecordMessageActions from './RecordMessageActions';
import { getPhoneDisplayMeta } from '../utils/phoneNumber';

type PhoneActionsPopoverProps = {
  value: unknown;
  className?: string;
  emptyText?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  moduleId?: string | null;
  record?: Record<string, any> | null;
};

const PhoneActionsPopover: React.FC<PhoneActionsPopoverProps> = ({
  value,
  className,
  emptyText = '-',
  size = 'md',
  moduleId,
  record,
}) => {
  const meta = getPhoneDisplayMeta(value);

  if (!meta.nationalNumber) {
    return <PhoneDisplay value={value} className={className} emptyText={emptyText} size={size} />;
  }

  return (
    <span className="inline-flex max-w-full flex-wrap items-center gap-1.5">
      <Popover
        trigger="click"
        placement="bottom"
        overlayClassName="max-w-[92vw]"
        content={(
          <div className="w-[300px] max-w-[80vw] space-y-3 p-1">
            <PhoneDisplay value={value} size="md" className="w-full" />
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-white/5">
              <div className="text-xs text-gray-500">عملیات تماس و پیام</div>
              <RecordMessageActions moduleId={moduleId} record={record} phoneValue={value} />
            </div>
          </div>
        )}
      >
        <span
          className="inline-flex max-w-full min-w-0 cursor-pointer"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          <PhoneDisplay value={value} className={className} emptyText={emptyText} size={size} />
        </span>
      </Popover>
      <RecordMessageActions
        moduleId={moduleId}
        record={record}
        phoneValue={value}
        compact={size === 'sm'}
        buttonVariant="text"
        className="opacity-90"
      />
    </span>
  );
};

export default PhoneActionsPopover;
