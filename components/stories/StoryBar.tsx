import React, { useRef } from 'react';
import { Spin } from 'antd';
import { StoryRing, AddStoryButton } from './StoryRing';
import { useOrgStories } from './useOrgStories';
import type { OrgStoryWithMeta } from './storyTypes';
import { resolveStoryCreatorIdentity } from '../../utils/orgStories';

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

  if (loading && stories.length === 0) {
    return (
      <div
        className="bg-white dark:bg-dark-surface rounded-lg shadow-sm border border-gray-200 dark:border-dark-border px-4 py-3 flex items-center justify-center"
        style={{ minHeight: 96 }}
      >
        <Spin size="small" />
      </div>
    );
  }

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
          paddingTop: 4,
          paddingBottom: 4,
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
          alignItems: 'flex-start',
        } as React.CSSProperties}
      >
        {canPublish && (
          <div style={itemWrapStyle}>
            <AddStoryButton size={ringSize} onClick={onAddStory} />
            <span style={labelStyle}>استوری جدید</span>
          </div>
        )}

        {stories.map((story) => {
          const { creatorName } = resolveStoryCreatorIdentity(story);
          return (
            <div key={story.id} style={itemWrapStyle}>
              <StoryRing
                story={story}
                size={ringSize}
                onClick={(s) => onOpenStory(s, stories)}
              />
              <span
                style={{
                  ...labelStyle,
                  ...(story.is_saas_wide
                    ? { fontWeight: 700, color: 'rgb(var(--brand-500-rgb, 2 132 199))' }
                    : {}),
                }}
                title={creatorName}
              >
                {truncate(creatorName, 11)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const truncate = (str: string, max: number) =>
  str.length > max ? `${str.slice(0, max)}…` : str;

const itemWrapStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--kalam-text-secondary, #64748B)',
  maxWidth: 74,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  direction: 'rtl',
};

export default StoryBar;
