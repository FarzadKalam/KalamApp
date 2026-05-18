import React, { useRef } from 'react';
import { Spin } from 'antd';
import { StoryRing, AddStoryButton } from './StoryRing';
import { useOrgStories } from './useOrgStories';
import type { OrgStoryWithMeta } from './storyTypes';

interface StoryBarProps {
  orgId: string;
  currentUserId: string;
  canPublish: boolean;
  onAddStory: () => void;
  onOpenStory: (story: OrgStoryWithMeta, allStories: OrgStoryWithMeta[]) => void;
  ringSize?: number;
  initialStories?: OrgStoryWithMeta[];
}

const StoryBar: React.FC<StoryBarProps> = ({
  orgId,
  currentUserId,
  canPublish,
  onAddStory,
  onOpenStory,
  ringSize = 58,
  initialStories,
}) => {
  const { stories, loading } = useOrgStories({ orgId, currentUserId, initialStories });
  const scrollRef = useRef<HTMLDivElement>(null);

  // اگر در حال بارگذاری اولیه است، skeleton ساده نشان می‌دهیم
  if (loading && stories.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-gray-200 dark:border-dark-border px-4 py-3 flex items-center justify-center" style={{ minHeight: 96 }}>
        <Spin size="small" />
      </div>
    );
  }

  // اگر نه محتوا دارد نه دسترسی انتشار، نمایش نمی‌دهیم
  if (!canPublish && stories.length === 0) return null;

  return (
    <div className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-gray-200 dark:border-dark-border px-4 py-3">
      <div
        ref={scrollRef}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 14,
          overflowX: 'auto',
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          alignItems: 'flex-start',
        } as React.CSSProperties}
      >
        {/* دکمه افزودن استوری */}
        {canPublish && (
          <div style={itemWrapStyle}>
            <AddStoryButton size={ringSize} onClick={onAddStory} />
            <span style={labelStyle}>استوری جدید</span>
          </div>
        )}

        {/* استوری‌ها */}
        {stories.map((story) => (
          <div key={story.id} style={itemWrapStyle}>
            <StoryRing
              story={story}
              size={ringSize}
              onClick={(s) => onOpenStory(s, stories)}
            />
            <span style={labelStyle} title={story.creator_name || ''}>
              {truncate(story.creator_name || 'ناشناس', 8)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const truncate = (str: string, max: number) =>
  str.length > max ? str.slice(0, max) + '…' : str;

const itemWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--kalam-text-secondary, #64748B)',
  maxWidth: 68,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  direction: 'rtl',
};

export default StoryBar;
