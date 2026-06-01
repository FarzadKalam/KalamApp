import React from 'react';
import { Button } from 'antd';
import type { ActiveUserAnnouncement } from '../../utils/userAnnouncements';

type UserAnnouncementsBannerProps = {
  items: ActiveUserAnnouncement[];
  onDismiss: (item: ActiveUserAnnouncement) => void | Promise<void>;
  className?: string;
};

const UserAnnouncementsBanner: React.FC<UserAnnouncementsBannerProps> = ({ items, onDismiss, className }) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  return (
    <div className={className || ''}>
      {items.map((item) => (
        <div
          key={item.id}
          className="border-b border-amber-200 bg-amber-50/95 px-3 py-2 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
        >
          <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              {item.title ? <div className="text-xs md:text-sm font-bold">{item.title}</div> : null}
              <div className="text-sm md:text-[15px] whitespace-pre-wrap break-words">{item.body}</div>
            </div>
            <Button
              size="small"
              onClick={() => void onDismiss(item)}
              className="!rounded-lg !text-[11px]"
            >
              {item.allow_dismiss ? 'متوجه شدم، دیگر نشان نده' : 'بستن'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default UserAnnouncementsBanner;
