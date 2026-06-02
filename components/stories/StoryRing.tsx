import React from 'react';
import { PlusOutlined, PushpinFilled } from '@ant-design/icons';
import { Tooltip } from 'antd';
import type { OrgStoryWithMeta } from './storyTypes';
import { getGradientPreset } from '../../utils/storyGradients';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
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
// دایره استوری — حلقه رنگی + آواتار/اسلاید اول
// ─────────────────────────────────────────────
export const StoryRing: React.FC<StoryRingProps> = ({ story, size = 60, onClick }) => {
  const isViewed = story.isViewedByMe;
  const firstSlide = story.slides?.[0];

  const previewStyle: React.CSSProperties = (() => {
    if (firstSlide?.type === 'image' && firstSlide.image_url) {
      return buildImageBackgroundStyle(firstSlide.image_url, 'thumb');
    }
    return { background: getGradientPreset(firstSlide?.gradient_key).gradient };
  })();

  // حلقه: دیده‌شده = خاکستری، ندیده = گرادینت برند
  const ringBackground = isViewed
    ? 'var(--kalam-ring-seen, #94A3B8)'
    : 'linear-gradient(135deg, var(--brand-primary, #3730A3) 0%, #DB2777 100%)';

  // رنگ جدا‌کننده سفید/تیره بسته به تم
  const separatorColor = 'var(--kalam-story-sep, var(--kalam-surface, #fff))';

  const firstTextLayer = firstSlide?.text_layers?.[0];
  const preset = firstSlide?.gradient_key ? getGradientPreset(firstSlide.gradient_key) : null;

  return (
    <Tooltip title={story.creator_name || 'استوری'} placement="bottom" mouseEnterDelay={0.6}>
      <div
        style={{
          width: size + 8,
          height: size + 8,
          borderRadius: '50%',
          padding: 3,
          background: ringBackground,
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'transform 0.15s ease',
        }}
        onClick={() => onClick(story)}
        onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.07)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; }}
      >
        {/* حلقه جداکننده — رنگ از CSS var تا در dark mode درست باشد */}
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            padding: 2,
            background: separatorColor,
          }}
        >
          {/* محتوای داخل دایره */}
          <div
            style={{
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              overflow: 'hidden',
              position: 'relative',
              ...previewStyle,
            }}
          >
            {/* پیش‌نمایش متن — فقط اگر گرادینت و متن وجود دارد */}
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

        {/* آواتار سازنده — همیشه نمایش داده می‌شود، با fallback به حروف اول نام */}
        {(() => {
          const badgeSize = Math.round(size * 0.36);
          const initial = (story.creator_name || '').trim().charAt(0).toUpperCase() || '؟';
          if (story.creator_avatar) {
            return (
              <ProfileAvatar
                size={badgeSize}
                src={story.creator_avatar}
                name={story.creator_name || ''}
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
            <div style={{
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
            }}>
              <span style={{
                color: '#fff',
                fontSize: Math.max(7, Math.round(badgeSize * 0.45)),
                fontWeight: 700,
                lineHeight: 1,
                fontFamily: 'inherit',
              }}>
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

        {/* نشان SaaS — لوگوی تازه‌سیستم */}
        {story.is_saas_wide && (
          <div
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: Math.round(size * 0.36),
              height: Math.round(size * 0.36),
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
              border: `2px solid ${separatorColor}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <img
              src="/pwa-192.png"
              alt="تازه‌سیستم"
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
              onError={(e) => {
                // fallback: حرف "ت" اگر لوگو لود نشد
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent && !parent.querySelector('span')) {
                  const span = document.createElement('span');
                  span.textContent = 'ت';
                  span.style.cssText = `color:#fff;font-size:${Math.max(7, Math.round(size * 0.13))}px;font-weight:bold;font-family:inherit`;
                  parent.appendChild(span);
                }
              }}
            />
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
          border: '2px dashed var(--brand-primary, #3730A3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          flexShrink: 0,
          transition: 'all 0.15s ease',
          backgroundColor: 'rgba(55,48,163,0.06)',
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
        <PlusOutlined style={{ fontSize: Math.round(size * 0.36), color: 'var(--brand-primary, #3730A3)' }} />
      </div>
    </Tooltip>
  );
};
