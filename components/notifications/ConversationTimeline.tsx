import React from 'react';
import { Button, Empty, Skeleton } from 'antd';
import { UpOutlined } from '@ant-design/icons';

const CHAT_TIMELINE_STACK_CLASS = 'space-y-4 pb-1';

type ConversationTimelineProps = {
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  layoutPaddingClass: string;
  hideUntilSettled?: boolean;
  loading?: boolean;
  emptyDescription: string;
  hasMoreBefore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  children: React.ReactNode;
};

const ConversationTimeline: React.FC<ConversationTimelineProps> = ({
  containerRef,
  onScroll,
  layoutPaddingClass,
  hideUntilSettled = false,
  loading = false,
  emptyDescription,
  hasMoreBefore = false,
  loadingOlder = false,
  onLoadOlder,
  children,
}) => {
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div
      ref={containerRef as React.Ref<HTMLDivElement>}
      onScroll={onScroll}
      className={`flex-1 overflow-y-auto ${layoutPaddingClass} bg-[rgba(var(--brand-50-rgb),0.14)] dark:bg-black/[0.10] ${hideUntilSettled ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
      ) : !hasChildren ? (
        <Empty description={emptyDescription} />
      ) : (
        <>
          {hasMoreBefore ? (
            <div className="flex justify-center pb-2">
              <Button
                type="text"
                size="small"
                icon={<UpOutlined />}
                loading={loadingOlder}
                onClick={() => void onLoadOlder?.()}
                className="text-xs text-gray-400 hover:!text-gray-600 dark:text-gray-500 dark:hover:!text-gray-300"
              >
                مشاهده پیام‌های قبلی
              </Button>
            </div>
          ) : null}
          <div className={CHAT_TIMELINE_STACK_CLASS}>
            {children}
          </div>
        </>
      )}
    </div>
  );
};

export default ConversationTimeline;
