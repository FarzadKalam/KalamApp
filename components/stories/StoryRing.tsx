import React from 'react';
import { PlayCircleFilled, PlusOutlined, PushpinFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { OrgStoryWithMeta } from './storyTypes';
import { SAAS_STORY_AVATAR_URL, SAAS_STORY_CREATOR_NAME } from './storyTypes';
import { getGradientPreset } from '../../utils/storyGradients';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
import { resolveStoryCreatorIdentity } from '../../utils/orgStories';
import ProfileAvatar from '../common/ProfileAvatar';

interface StoryRingProps {
  story: OrgStoryWithMeta;
  size?: number;
  onClick: (story: OrgStoryWithMeta) => void;
}

interface AddStoryButtonProps {
  size?: number;
  onClick: () => void;
}

// ─────────────────────────────────────────────
// حلقه استوری — کادر متمایز برای استوری‌های رسمی تازه‌سیستم
// ─────────────────────────────────────────────
export const StoryRing: React.FC<StoryRingProps> = ({ story, size = 60, onClick }) => {
  const isViewed = story.isViewedByMe;
  const isSaasWide = Boolean(story.is_saas_wide);
  const firstSlide = story.slides?.[0];
  const { creatorName, creatorAvatar } = resolveStoryCreatorIdentity(story);

  const previewStyle: React.CSSProperties = (() => {
    if (firstSlide?.type === 'image' && firstSlide.image_url && !firstSlide.media_cleaned) {
      return buildImageBackgroundStyle(firstSlide.image_url, 'thumb');
    }
    if (firstSlide?.type === 'video' && firstSlide.video_url && !firstSlide.media_cleaned) {
      return { background: '#0F172A' };
    }
    return { background: getGradientPreset(firstSlide?.gradient_key).gradient };
  })();

  // استوری‌های عمومی تازه‌سیستم: کادر سکوئیرکل دوحاشیه با طیف آبی-طلایی متمایز
  // استوری‌های داخلی سازمان‌ها: حلقه دایره‌ای برند
  const ringBackground = isSaasWide
    ? (isViewed
        ? 'linear-gradient(135deg, #94A3B8 0%, #CBD5E1 62%, #FBBF24 100%)'
        : 'linear-gradient(135deg, #0284C7 0%, #4F46E5 50%, #F59E0B 100%)')
    : (isViewed
        ? 'var(--kalam-ring-seen, #94A3B8)'
        : 'linear-gradient(135deg, rgb(var(--brand-500-rgb, 55 48 163)) 0%, #DB2777 100%)');

  const outerRadius = isSaasWide ? Math.round((size + 8) * 0.3) : '50%';
  const innerRadius = isSaasWide ? Math.round((size + 2) * 0.27) : '50%';
  const contentRadius = isSaasWide ? Math.round(size * 0.25) : '50%';

  const separatorColor = 'var(--kalam-story-sep, var(--kalam-surface, #fff))';
  const firstTextLayer = firstSlide?.text_layers?.[0];
  const preset = firstSlide?.gradient_key ? getGradientPreset(firstSlide.gradient_key) : null;

  return (
    <Tooltip
      title={isSaasWide ? `${SAAS_STORY_CREATOR_NAME} (اطلاعیه رسمی)` : creatorName}
      placement="bottom"
      mouseEnterDelay={0.5}
    >
      <div
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: outerRadius,
          padding: isSaasWide ? 3.5 : 3,
          background: ringBackground,
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'transform 0.15s ease',
          boxShadow: isSaasWide && !isViewed
            ? '0 4px 16px rgba(14, 165, 233, 0.28), 0 0 0 1px rgba(245, 158, 11, 0.24)'
            : undefined,
        }}
        onClick={() => onClick(story)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: innerRadius,
            padding: 2,
            background: separatorColor,
          }}
        >
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: contentRadius,
              overflow: 'hidden',
              position: 'relative',
              ...previewStyle,
            }}
          >
            {/* پیش‌نمایش فریم اول ویدیو (هرگز برای تصویر استفاده نمی‌شود) */}
            {firstSlide?.type === 'video' && firstSlide.video_url && !firstSlide.media_cleaned && (
              <>
                <video
                  src={firstSlide.video_url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }}
                />
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(15, 23, 42, 0.22)',
                  }}
                >
                  <PlayCircleFilled style={{ fontSize: Math.round(size * 0.34), color: 'rgba(255,255,255,0.9)' }} />
                </div>
              </>
            )}

            {/* پیش‌نمایش متن روی گرادینت */}
            {firstSlide?.type === 'gradient' && firstTextLayer?.content && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: `${Math.round(size * 0.1)}px`,
                  overflow: 'hidden',
                }}
              >
                <span
                  style={{
                    color: preset?.textColor || '#fff',
                    fontSize: Math.max(8, Math.round(size * 0.15)),
                    fontWeight: 'bold',
                    textAlign: 'center',
                    lineHeight: 1.25,
                    wordBreak: 'break-word',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    maxWidth: '100%',
                  } as React.CSSProperties}
                >
                  {firstTextLayer.content}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* آواتار سازنده / لوگوی رسمی تازه‌سیستم */}
        {(() => {
          const badgeSize = Math.round(size * 0.36);
          if (isSaasWide) {
            return (
              <div
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: badgeSize + 2,
                  height: badgeSize + 2,
                  borderRadius: '50%',
                  background: '#FFFFFF',
                  border: '2px solid #F59E0B',
                  boxShadow: '0 2px 6px rgba(15, 23, 42, 0.24)',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <img
                  src={SAAS_STORY_AVATAR_URL}
                  alt={SAAS_STORY_CREATOR_NAME}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 1 }}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (!target.dataset.fallbackApplied) {
                      target.dataset.fallbackApplied = '1';
                      target.src = '/tazesystem_logo.png';
                    }
                  }}
                />
              </div>
            );
          }

          const initial = creatorName.trim().charAt(0).toUpperCase() || '؟';
          if (creatorAvatar) {
            return (
              <ProfileAvatar
                size={badgeSize}
                src={creatorAvatar}
                name={creatorName}
                preset="avatar"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  border: `2px solid ${separatorColor}`,
                  backgroundColor: '#94A3B8',
                }}
              />
            );
          }
          return (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: badgeSize,
                height: badgeSize,
                borderRadius: '50%',
                border: `2px solid ${separatorColor}`,
                background: 'linear-gradient(135deg, #6B7280, #9CA3AF)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                style={{
                  color: '#fff',
                  fontSize: Math.max(7, Math.round(badgeSize * 0.45)),
                  fontWeight: 700,
                  lineHeight: 1,
                  fontFamily: 'inherit',
                }}
              >
                {initial}
              </span>
            </div>
          );
        })()}

        {/* نشان پین */}
        {story.is_pinned && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: '#F59E0B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px solid ${separatorColor}`,
            }}
          >
            <PushpinFilled style={{ fontSize: 9, color: '#fff' }} />
          </div>
        )}

        {/* برچسب رسمی برای استوری‌های عمومی تازه‌سیستم */}
        {isSaasWide && (
          <div
            style={{
              position: 'absolute',
              top: -4,
              right: -2,
              borderRadius: 999,
              padding: '1px 6px',
              background: 'linear-gradient(135deg, #0284C7 0%, #4F46E5 100%)',
              color: '#FFFFFF',
              fontSize: 8.5,
              fontWeight: 800,
              lineHeight: 1.35,
              border: `1.5px solid ${separatorColor}`,
              boxShadow: '0 2px 6px rgba(15, 23, 42, 0.25)',
            }}
          >
            رسمی
          </div>
        )}
      </div>
    </Tooltip>
  );
};

// ─────────────────────────────────────────────
// دکمه افزودن استوری جدید
// ─────────────────────────────────────────────
export const AddStoryButton: React.FC<AddStoryButtonProps> = ({ size = 60, onClick }) => {
  return (
    <Tooltip title="استوری جدید" placement="bottom">
      <div
        onClick={onClick}
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: '50%',
          border: '2px dashed rgb(var(--brand-500-rgb, 55 48 163))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          backgroundColor: 'rgba(var(--brand-500-rgb, 55 48 163), 0.06)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)';
          (e.currentTarget as HTMLDivElement).style.borderStyle = 'solid';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLDivElement).style.borderStyle = 'dashed';
        }}
      >
        <PlusOutlined style={{ fontSize: Math.round(size * 0.36), color: 'rgb(var(--brand-500-rgb, 55 48 163))' }} />
      </div>
    </Tooltip>
  );
};
