import React from 'react';
import {
  CalendarOutlined,
  CustomerServiceOutlined,
  LinkOutlined,
  PauseOutlined,
  PlayCircleFilled,
  TagOutlined,
} from '@ant-design/icons';
import ProfileAvatar from '../common/ProfileAvatar';
import {
  STORY_CANVAS_REFERENCE_WIDTH,
  type StoryStickerLayer,
  type StoryStickerVariant,
  type StoryTextLayer,
  type StoryTextStyleVariant,
} from './storyTypes';

export interface StoryTextStyleOption {
  key: StoryTextStyleVariant;
  label: string;
  previewBg: string;
  previewText: string;
  previewBorder?: string;
}

export const STORY_TEXT_STYLE_OPTIONS: StoryTextStyleOption[] = [
  { key: 'clean', label: 'ساده', previewBg: 'rgba(15,23,42,0.18)', previewText: '#ffffff' },
  { key: 'pill_dark', label: 'کادر تیره', previewBg: 'rgba(15,23,42,0.88)', previewText: '#ffffff' },
  { key: 'pill_light', label: 'کادر روشن', previewBg: 'rgba(255,255,255,0.95)', previewText: '#0f172a' },
  { key: 'pill_brand', label: 'رنگ برند', previewBg: 'rgb(var(--brand-500-rgb))', previewText: '#ffffff' },
  { key: 'frost', label: 'شیشه‌ای', previewBg: 'rgba(255,255,255,0.26)', previewText: '#ffffff', previewBorder: '1px solid rgba(255,255,255,0.45)' },
  { key: 'outline', label: 'دورخط', previewBg: 'rgba(15,23,42,0.35)', previewText: '#ffffff', previewBorder: '2px solid #ffffff' },
  { key: 'neon', label: 'درخشش', previewBg: 'rgba(15,23,42,0.48)', previewText: '#ffffff' },
];

export const STORY_FONT_WEIGHT_OPTIONS: Array<{ value: 400 | 600 | 700 | 900; label: string }> = [
  { value: 400, label: 'عادی' },
  { value: 600, label: 'متوسط' },
  { value: 700, label: 'ضخیم' },
  { value: 900, label: 'بسیار ضخیم' },
];

export const STORY_TEXT_COLORS = [
  '#FFFFFF',
  '#0F172A',
  '#FACC15',
  '#F97316',
  '#EF4444',
  '#EC4899',
  '#8B5CF6',
  '#3B82F6',
  '#06B6D4',
  '#10B981',
];

export const STORY_EMOJI_STICKERS = [
  '🔥', '✨', '🎉', '❤️', '👏', '🙌',
  '💡', '✅', '📢', '🚀', '💎', '🌟',
  '🤩', '💯', '🥳', '☕', '📌', '🎁',
  '⚡', '🙏', '💪', '🫶', '🔔', '🏆',
];

export const STORY_BADGE_STICKERS: Array<{ text: string; icon: string; variant: StoryStickerVariant }> = [
  { text: 'اطلاعیه مهم', icon: '📢', variant: 'brand' },
  { text: 'خبر تازه', icon: '✨', variant: 'amber' },
  { text: 'محصول جدید', icon: '🚀', variant: 'emerald' },
  { text: 'پیشنهاد ویژه', icon: '🎁', variant: 'rose' },
  { text: 'نکته کلیدی', icon: '💡', variant: 'frost' },
  { text: 'گزارش امروز', icon: '📌', variant: 'dark' },
  { text: 'تبریک ویژه', icon: '🎉', variant: 'light' },
];

export const computeStoryRenderScale = (containerWidth: number | null | undefined): number => {
  const width = Number(containerWidth || 0);
  if (!Number.isFinite(width) || width <= 0) return 1;
  return Math.max(0.55, Math.min(1.6, width / STORY_CANVAS_REFERENCE_WIDTH));
};

export const normalizeHexWithAlpha = (hex: string, alpha: number, fallbackRgba: string): string => {
  const clean = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallbackRgba;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const buildStoryTextLayerStyle = (
  layer: StoryTextLayer,
  renderScale = 1,
): React.CSSProperties => {
  const styleVariant: StoryTextStyleVariant = layer.style_variant || 'clean';
  const baseFontSize = Math.max(12, Math.min(72, Number(layer.font_size) || 20));
  const fontSize = Math.round(baseFontSize * renderScale * 10) / 10;
  const fontWeight = layer.font_weight ?? (layer.bold ? 700 : 400);
  const textColor = layer.color || '#FFFFFF';
  const accentColor = layer.bg_color || '#0F172A';

  const base: React.CSSProperties = {
    fontFamily: "var(--font-family-app, 'Peyda', Tahoma, sans-serif)",
    fontSize,
    fontWeight,
    textAlign: layer.align || 'center',
    direction: 'rtl',
    lineHeight: 1.42,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    color: textColor,
    borderRadius: Math.round(12 * renderScale),
    padding: styleVariant === 'clean'
      ? `${Math.round(4 * renderScale)}px ${Math.round(8 * renderScale)}px`
      : `${Math.round(7 * renderScale)}px ${Math.round(13 * renderScale)}px`,
  };

  switch (styleVariant) {
    case 'pill_dark':
      return {
        ...base,
        backgroundColor: normalizeHexWithAlpha(accentColor, 0.86, 'rgba(15, 23, 42, 0.86)'),
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.28)',
      };
    case 'pill_light':
      return {
        ...base,
        backgroundColor: 'rgba(255, 255, 255, 0.94)',
        color: layer.color && layer.color.toUpperCase() !== '#FFFFFF' ? layer.color : '#0F172A',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
      };
    case 'pill_brand':
      return {
        ...base,
        backgroundColor: 'rgb(var(--brand-500-rgb, 79 70 229))',
        color: layer.color || '#FFFFFF',
        boxShadow: '0 10px 24px rgba(var(--brand-600-rgb, 67 56 202), 0.35)',
      };
    case 'frost':
      return {
        ...base,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.36)',
        textShadow: '0 1px 4px rgba(0, 0, 0, 0.3)',
      };
    case 'outline': {
      const borderCol = accentColor && accentColor.toUpperCase() !== '#0F172A' ? accentColor : textColor;
      return {
        ...base,
        backgroundColor: 'rgba(15, 23, 42, 0.28)',
        border: `${Math.max(1.5, Math.round(2 * renderScale))}px solid ${borderCol}`,
        textShadow: '0 1px 4px rgba(0, 0, 0, 0.4)',
      };
    }
    case 'neon': {
      const glow = textColor.toUpperCase() === '#0F172A' ? '#38BDF8' : textColor;
      return {
        ...base,
        backgroundColor: 'rgba(15, 23, 42, 0.25)',
        textShadow: `0 0 ${Math.round(8 * renderScale)}px ${normalizeHexWithAlpha(glow, 0.9, 'rgba(255,255,255,0.85)')}, 0 0 ${Math.round(18 * renderScale)}px ${normalizeHexWithAlpha(glow, 0.65, 'rgba(56,189,248,0.65)')}`,
      };
    }
    case 'clean':
    default:
      return {
        ...base,
        textShadow: '0 2px 10px rgba(0, 0, 0, 0.55)',
      };
  }
};

const getStickerVariantStyles = (variant: StoryStickerVariant = 'frost'): React.CSSProperties => {
  switch (variant) {
    case 'light':
      return {
        background: 'rgba(255, 255, 255, 0.95)',
        color: '#0F172A',
        border: '1px solid rgba(226, 232, 240, 0.95)',
        boxShadow: '0 8px 22px rgba(15, 23, 42, 0.16)',
      };
    case 'dark':
      return {
        background: 'rgba(15, 23, 42, 0.86)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.34)',
      };
    case 'brand':
      return {
        background: 'rgb(var(--brand-500-rgb, 79 70 229))',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.24)',
        boxShadow: '0 10px 24px rgba(var(--brand-600-rgb, 67 56 202), 0.35)',
      };
    case 'amber':
      return {
        background: 'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.28)',
        boxShadow: '0 8px 20px rgba(217, 119, 6, 0.32)',
      };
    case 'emerald':
      return {
        background: 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.28)',
        boxShadow: '0 8px 20px rgba(5, 150, 105, 0.32)',
      };
    case 'rose':
      return {
        background: 'linear-gradient(135deg, #E11D48 0%, #F43F5E 100%)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.28)',
        boxShadow: '0 8px 20px rgba(225, 29, 72, 0.32)',
      };
    case 'frost':
    default:
      return {
        background: 'rgba(15, 23, 42, 0.36)',
        color: '#FFFFFF',
        border: '1px solid rgba(255, 255, 255, 0.34)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.22)',
      };
  }
};

const AUDIO_WAVEFORM_HEIGHTS = [38, 72, 54, 92, 66, 44, 86, 58, 96, 48, 74, 42];

interface StoryStickerVisualProps {
  sticker: StoryStickerLayer;
  renderScale?: number;
  isEditor?: boolean;
  isAudioPlaying?: boolean;
  onToggleAudio?: (e: React.MouseEvent | React.TouchEvent) => void;
  onClickSticker?: (e: React.MouseEvent) => void;
}

export const StoryStickerVisual: React.FC<StoryStickerVisualProps> = ({
  sticker,
  renderScale = 1,
  isEditor = false,
  isAudioPlaying = false,
  onToggleAudio,
  onClickSticker,
}) => {
  const effectiveScale = Math.max(0.55, Math.min(2.4, Number(sticker.scale) || 1)) * renderScale;
  const variantStyles = getStickerVariantStyles(sticker.variant);

  if (sticker.type === 'emoji') {
    return (
      <div
        style={{
          fontSize: Math.round(42 * effectiveScale),
          lineHeight: 1.05,
          filter: 'drop-shadow(0 6px 14px rgba(15, 23, 42, 0.28))',
          userSelect: 'none',
          padding: Math.round(4 * renderScale),
        }}
      >
        {sticker.emoji || '✨'}
      </div>
    );
  }

  if (sticker.type === 'badge') {
    return (
      <div
        style={{
          ...variantStyles,
          display: 'inline-flex',
          alignItems: 'center',
          gap: Math.round(6 * effectiveScale),
          borderRadius: 999,
          padding: `${Math.round(7 * effectiveScale)}px ${Math.round(14 * effectiveScale)}px`,
          fontSize: Math.round(13 * effectiveScale),
          fontWeight: 700,
          fontFamily: "var(--font-family-app, 'Peyda', Tahoma, sans-serif)",
          whiteSpace: 'nowrap',
          direction: 'rtl',
          userSelect: 'none',
        }}
      >
        {sticker.icon ? (
          <span style={{ fontSize: Math.round(15 * effectiveScale), lineHeight: 1 }}>{sticker.icon}</span>
        ) : (
          <TagOutlined style={{ fontSize: Math.round(13 * effectiveScale) }} />
        )}
        <span>{sticker.text || 'برچسب'}</span>
      </div>
    );
  }

  if (sticker.type === 'datetime') {
    return (
      <div
        style={{
          ...variantStyles,
          display: 'inline-flex',
          alignItems: 'center',
          gap: Math.round(7 * effectiveScale),
          borderRadius: Math.round(14 * effectiveScale),
          padding: `${Math.round(7 * effectiveScale)}px ${Math.round(13 * effectiveScale)}px`,
          fontSize: Math.round(12 * effectiveScale),
          fontWeight: 700,
          fontFamily: "var(--font-family-persian-numerals, 'Peyda Farsi Numerals', 'Peyda', Tahoma, sans-serif)",
          whiteSpace: 'nowrap',
          direction: 'rtl',
          userSelect: 'none',
        }}
      >
        <CalendarOutlined style={{ fontSize: Math.round(13 * effectiveScale) }} />
        <span>{sticker.text || 'امروز'}</span>
      </div>
    );
  }

  if (sticker.type === 'mention') {
    const displayName = String(sticker.user_name || '').trim() || 'کاربر';
    return (
      <button
        type="button"
        onClick={onClickSticker}
        style={{
          ...variantStyles,
          display: 'inline-flex',
          alignItems: 'center',
          gap: Math.round(6 * effectiveScale),
          borderRadius: 999,
          padding: `${Math.round(4 * effectiveScale)}px ${Math.round(12 * effectiveScale)}px ${Math.round(4 * effectiveScale)}px ${Math.round(6 * effectiveScale)}px`,
          fontSize: Math.round(13 * effectiveScale),
          fontWeight: 700,
          fontFamily: "var(--font-family-app, 'Peyda', Tahoma, sans-serif)",
          whiteSpace: 'nowrap',
          direction: 'rtl',
          cursor: isEditor ? 'grab' : 'pointer',
          userSelect: 'none',
        }}
      >
        <ProfileAvatar
          size={Math.max(18, Math.round(22 * effectiveScale))}
          src={sticker.user_avatar || undefined}
          name={displayName}
          style={{ flexShrink: 0, fontSize: Math.round(10 * effectiveScale) }}
        />
        <span dir="ltr" style={{ opacity: 0.8, fontWeight: 900 }}>@</span>
        <span>{displayName}</span>
      </button>
    );
  }

  if (sticker.type === 'link') {
    const labelText = String(sticker.label || '').trim() || 'مشاهده لینک';
    return (
      <button
        type="button"
        onClick={onClickSticker}
        style={{
          ...(sticker.variant ? variantStyles : getStickerVariantStyles('light')),
          display: 'inline-flex',
          alignItems: 'center',
          gap: Math.round(7 * effectiveScale),
          borderRadius: 999,
          padding: `${Math.round(7 * effectiveScale)}px ${Math.round(15 * effectiveScale)}px`,
          fontSize: Math.round(13 * effectiveScale),
          fontWeight: 700,
          fontFamily: "var(--font-family-app, 'Peyda', Tahoma, sans-serif)",
          whiteSpace: 'nowrap',
          maxWidth: Math.round(250 * effectiveScale),
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          direction: 'rtl',
          cursor: isEditor ? 'grab' : 'pointer',
          userSelect: 'none',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: Math.round(22 * effectiveScale),
            height: Math.round(22 * effectiveScale),
            borderRadius: '50%',
            background: sticker.variant === 'light' || !sticker.variant
              ? 'rgba(var(--brand-500-rgb, 79 70 229), 0.14)'
              : 'rgba(255,255,255,0.2)',
            flexShrink: 0,
          }}
        >
          <LinkOutlined style={{ fontSize: Math.round(12 * effectiveScale) }} />
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelText}</span>
      </button>
    );
  }

  // استیکر صدا (audio)
  const audioTitle = String(sticker.audio_name || '').trim() || 'پخش صدا';
  const durationLabel = sticker.duration_sec
    ? `${Math.floor(sticker.duration_sec / 60)}:${String(Math.round(sticker.duration_sec % 60)).padStart(2, '0')}`
    : null;

  return (
    <div
      onClick={!isEditor ? onToggleAudio : onClickSticker}
      style={{
        ...variantStyles,
        display: 'flex',
        alignItems: 'center',
        gap: Math.round(9 * effectiveScale),
        borderRadius: Math.round(16 * effectiveScale),
        padding: `${Math.round(8 * effectiveScale)}px ${Math.round(12 * effectiveScale)}px`,
        minWidth: Math.round(196 * effectiveScale),
        maxWidth: Math.round(250 * effectiveScale),
        direction: 'rtl',
        cursor: isEditor ? 'grab' : 'pointer',
        userSelect: 'none',
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleAudio?.(e);
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        style={{
          width: Math.round(32 * effectiveScale),
          height: Math.round(32 * effectiveScale),
          borderRadius: '50%',
          border: 'none',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: sticker.variant === 'light'
            ? 'rgb(var(--brand-500-rgb, 79 70 229))'
            : 'rgba(255,255,255,0.22)',
          color: '#FFFFFF',
          cursor: 'pointer',
          flexShrink: 0,
        }}
        aria-label={isAudioPlaying ? 'توقف صدا' : 'پخش صدا'}
      >
        {isAudioPlaying ? (
          <PauseOutlined style={{ fontSize: Math.round(14 * effectiveScale) }} />
        ) : (
          <PlayCircleFilled style={{ fontSize: Math.round(16 * effectiveScale) }} />
        )}
      </button>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: Math.round(4 * effectiveScale),
            fontSize: Math.round(12 * effectiveScale),
            fontWeight: 700,
            fontFamily: "var(--font-family-app, 'Peyda', Tahoma, sans-serif)",
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          <CustomerServiceOutlined style={{ fontSize: Math.round(11 * effectiveScale), opacity: 0.85 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{audioTitle}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: Math.round(6 * effectiveScale),
            marginTop: Math.round(4 * effectiveScale),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(2 * effectiveScale), height: Math.round(12 * effectiveScale), flex: 1 }}>
            {AUDIO_WAVEFORM_HEIGHTS.map((pct, index) => (
              <span
                key={index}
                style={{
                  width: Math.max(2, Math.round(2.5 * effectiveScale)),
                  height: `${isAudioPlaying ? Math.max(30, ((pct + index * 13) % 95)) : pct}%`,
                  borderRadius: 99,
                  backgroundColor: 'currentColor',
                  opacity: isAudioPlaying ? 0.92 : 0.55,
                  transition: 'height 0.18s ease, opacity 0.18s ease',
                }}
              />
            ))}
          </div>
          {durationLabel && (
            <span style={{ fontSize: Math.round(10 * effectiveScale), opacity: 0.8, fontFamily: 'monospace' }}>
              {durationLabel}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
