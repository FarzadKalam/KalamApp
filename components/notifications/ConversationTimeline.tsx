import React, { useEffect, useRef } from 'react';
import { Button, Empty, Skeleton } from 'antd';
import { UpOutlined } from '@ant-design/icons';

const CHAT_TIMELINE_STACK_CLASS = 'space-y-4 pb-1';
// Distance (px) from the top of the thread that triggers loading older messages.
const AUTO_LOAD_OLDER_THRESHOLD_PX = 80;
const AUTO_LOAD_COOLDOWN_MS = 650;

type ConversationTimelineProps<T> = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScroll?: React.UIEventHandler<HTMLDivElement>;
  layoutPaddingClass: string;
  hideUntilSettled?: boolean;
  loading?: boolean;
  emptyDescription: string;
  hasMoreBefore?: boolean;
  loadingOlder?: boolean;
  onLoadOlder?: () => void | Promise<void>;
  items: T[];
  getItemKey: (item: T, index: number) => string | number;
  renderItem: (item: T, index: number) => React.ReactNode;
};

// Message thread. Rows are rendered as a plain stack (histories stay small —
// pages of 10 plus on-demand older pages) while the row components themselves
// are memoized, so scroll frames and unrelated popover updates cost nothing.
// Chat bubbles have wildly variable heights and the thread must stay pinned to
// the bottom; absolute-position virtualization fights both, so it is
// intentionally not used here.
const ConversationTimeline = <T,>({
  containerRef,
  onScroll,
  layoutPaddingClass,
  hideUntilSettled = false,
  loading = false,
  emptyDescription,
  hasMoreBefore = false,
  loadingOlder = false,
  onLoadOlder,
  items,
  getItemKey,
  renderItem,
}: ConversationTimelineProps<T>) => {
  // Auto-load older messages when the user scrolls near the top, so the
  // «مشاهده پیام‌های قبلی» button is a fallback rather than a requirement.
  // Re-armed when items change (the older page has been prepended).
  const autoLoadFiredRef = useRef(false);
  const lastScrollTopRef = useRef(0);
  const lastAutoLoadAtRef = useRef(0);
  useEffect(() => {
    autoLoadFiredRef.current = false;
  }, [items.length]);

  const handleScroll: React.UIEventHandler<HTMLDivElement> = (event) => {
    onScroll?.(event);
    const node = event.currentTarget;
    const scrollingUp = node.scrollTop < lastScrollTopRef.current;
    lastScrollTopRef.current = node.scrollTop;
    if (!hasMoreBefore || loadingOlder || autoLoadFiredRef.current || !onLoadOlder) return;
    if (Date.now() - lastAutoLoadAtRef.current < AUTO_LOAD_COOLDOWN_MS) return;
    if (!scrollingUp) return;
    if (node.scrollTop > AUTO_LOAD_OLDER_THRESHOLD_PX) return;
    // Ignore when the thread doesn't actually scroll (content shorter than view).
    if (node.scrollHeight <= node.clientHeight + 10) return;
    autoLoadFiredRef.current = true;
    lastAutoLoadAtRef.current = Date.now();
    void onLoadOlder();
  };

  return (
    <div
      ref={containerRef as React.Ref<HTMLDivElement>}
      onScroll={handleScroll}
      className={`flex-1 overflow-y-auto ${layoutPaddingClass} bg-[rgba(var(--brand-50-rgb),0.14)] dark:bg-black/[0.10] ${hideUntilSettled ? 'opacity-0 pointer-events-none' : 'opacity-100'} transition-opacity`}
      style={{ overflowAnchor: 'none', overscrollBehavior: 'contain' }}
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 2 }} />
          <Skeleton active paragraph={{ rows: 2 }} />
        </div>
      ) : items.length === 0 ? (
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
            {items.map((item, index) => (
              <div key={getItemKey(item, index)}>
                {renderItem(item, index)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

export default ConversationTimeline;
