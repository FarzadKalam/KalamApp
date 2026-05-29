import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CaretRightOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  LeftOutlined,
  PauseOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Modal, Popover, Space, Spin, Tooltip, Typography } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import type { OrgStoryWithMeta, StorySlide } from './storyTypes';
import { getGradientPreset } from '../../utils/storyGradients';
import { STORY_REACTION_EMOJIS } from '../../utils/storyGradients';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import ProfileAvatar from '../common/ProfileAvatar';

interface StoryViewerModalProps {
  open: boolean;
  stories: OrgStoryWithMeta[];
  initialIndex: number;
  currentUserId: string;
  canEditOwn: boolean;
  canDeleteOwn: boolean;
  canEditOthers: boolean;
  canDeleteOthers: boolean;
  canPin: boolean;
  canViewReactions: boolean;
  onClose: () => void;
  onEdit: (story: OrgStoryWithMeta) => void;
  onDelete: (storyId: string) => Promise<boolean>;
  onTogglePin: (storyId: string, isPinned: boolean) => void;
  onMarkViewed: (storyId: string) => void;
  onReact: (storyId: string, emoji: string) => void;
}

interface ViewerEntry {
  user_id: string;
  user_name: string | null;
  avatar_url: string | null;
  viewed_at: string;
}

type ViewerProfileRow = {
  id: string;
  full_name: string | null;
  email?: string | null;
  mobile_1?: string | null;
  avatar_url: string | null;
};

const PROGRESS_INTERVAL_MS = 50;
// ارتفاع ناحیه هدر — ناحیه‌های کلیک از پایین هدر شروع می‌شوند
const HEADER_ZONE_PX = 88;
// ارتفاع ناحیه فوتر
const FOOTER_ZONE_PX = 136;

const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  open,
  stories,
  initialIndex,
  currentUserId,
  canEditOwn,
  canDeleteOwn,
  canEditOthers,
  canDeleteOthers,
  canPin,
  canViewReactions,
  onClose,
  onEdit,
  onDelete,
  onTogglePin,
  onMarkViewed,
  onReact,
}) => {
  const navigate = useNavigate();
  const [storyIndex, setStoryIndex] = useState(initialIndex);
  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersList, setViewersList] = useState<ViewerEntry[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [localMyReaction, setLocalMyReaction] = useState<string | null>(
    () => stories[initialIndex]?.myReaction?.emoji ?? null
  );

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  const currentStory = stories[storyIndex] ?? null;
  const currentSlide: StorySlide | null = currentStory?.slides?.[slideIndex] ?? null;
  const slideDuration = currentSlide?.duration_ms ?? 5000;
  const totalSlides = currentStory?.slides?.length ?? 0;
  const currentSlideText = (currentSlide?.text_layers || [])
    .map((layer) => String(layer?.content || '').trim())
    .filter(Boolean)
    .join('\n');

  // reset وقتی استوری عوض می‌شود
  useEffect(() => {
    setSlideIndex(0);
    setProgress(0);
    progressRef.current = 0;
    setViewersOpen(false);
    setViewersList([]);
    setLocalMyReaction(stories[storyIndex]?.myReaction?.emoji ?? null);
  }, [storyIndex]);

  // ثبت بازدید هنگام نمایش
  useEffect(() => {
    if (currentStory && open) {
      onMarkViewed(currentStory.id);
    }
  }, [currentStory?.id, open]);

  // تایمر پیشرفت
  useEffect(() => {
    if (!open || paused || !currentSlide) return;

    const step = (PROGRESS_INTERVAL_MS / slideDuration) * 100;

    timerRef.current = setInterval(() => {
      progressRef.current += step;
      setProgress(Math.min(progressRef.current, 100));

      if (progressRef.current >= 100) {
        clearInterval(timerRef.current!);
        goNextSlide();
      }
    }, PROGRESS_INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [open, paused, slideIndex, storyIndex, slideDuration]);

  const goNextSlide = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    if (slideIndex + 1 < totalSlides) {
      setSlideIndex((i) => i + 1);
    } else if (storyIndex + 1 < stories.length) {
      setStoryIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [slideIndex, totalSlides, storyIndex, stories.length, onClose]);

  const goPrevSlide = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    if (slideIndex > 0) {
      setSlideIndex((i) => i - 1);
    } else if (storyIndex > 0) {
      setStoryIndex((i) => i - 1);
    }
  }, [slideIndex, storyIndex]);

  const replayCurrentSlideText = useCallback(() => {
    progressRef.current = 0;
    setProgress(0);
    setPaused(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') goPrevSlide();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') goNextSlide();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, goPrevSlide, goNextSlide, onClose]);

  // دریافت لیست بازدیدکنندگان با نام و زمان
  const fetchViewers = useCallback(async (storyId: string) => {
    setViewersLoading(true);
    try {
      const { data: viewData } = await supabase
        .from('org_story_views')
        .select('user_id, viewed_at')
        .eq('story_id', storyId)
        .order('viewed_at', { ascending: false });

      if (!viewData?.length) {
        setViewersList([]);
        return;
      }

      const userIds = Array.from(
        new Set(viewData.map((v: { user_id: string }) => String(v?.user_id || '').trim()).filter(Boolean))
      );
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile_1, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(
        ((profileData ?? []) as ViewerProfileRow[]).map((p) => [p.id, p])
      );

      setViewersList(
        viewData.map((v: { user_id: string; viewed_at: string }) => {
          const profile = profileMap.get(v.user_id);
          return {
            user_id: v.user_id,
            user_name: profile?.full_name || profile?.email || profile?.mobile_1 || null,
            avatar_url: profile?.avatar_url ?? null,
            viewed_at: v.viewed_at,
          };
        })
      );
    } finally {
      setViewersLoading(false);
    }
  }, []);

  if (!currentStory || !currentSlide) return null;

  const isOwnStory = currentStory.creator_id === currentUserId;

  const handleSlideLink = () => {
    if (!currentSlide.link_url) return;
    setPaused(true);
    if (currentSlide.link_type === 'internal') {
      navigate(currentSlide.link_url);
      onClose();
    } else {
      window.open(currentSlide.link_url, '_blank', 'noopener,noreferrer');
    }
  };
  const canEdit = isOwnStory ? canEditOwn : canEditOthers;
  const canDelete = isOwnStory ? canDeleteOwn : canDeleteOthers;

  // پس‌زمینه اسلاید
  const slideBackground: React.CSSProperties = (() => {
    if (currentSlide.type === 'image' && currentSlide.image_url) {
      return {
        backgroundImage: `url(${currentSlide.image_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      };
    }
    const preset = getGradientPreset(currentSlide.gradient_key);
    return { background: preset.gradient };
  })();

  const menuItems = [
    canEdit && {
      key: 'edit',
      icon: <EditOutlined />,
      label: 'ویرایش',
      onClick: () => onEdit(currentStory),
    },
    canDelete && {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'حذف',
      danger: true,
      onClick: async () => {
        const deleted = await onDelete(currentStory.id);
        if (deleted) onClose();
      },
    },
    canPin && {
      key: 'pin',
      icon: currentStory.is_pinned ? <PushpinFilled /> : <PushpinOutlined />,
      label: currentStory.is_pinned ? 'برداشتن پین' : 'پین کردن',
      onClick: () => onTogglePin(currentStory.id, currentStory.is_pinned),
    },
  ].filter(Boolean) as any[];

  const viewersPopoverContent = (
    <div style={{ minWidth: 200, maxWidth: 260, maxHeight: 320, overflowY: 'auto' }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        بازدیدکنندگان ({toPersianNumber(currentStory.viewerCount)})
      </Typography.Text>
      {viewersLoading ? (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <Spin size="small" />
        </div>
      ) : viewersList.length === 0 ? (
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          هنوز کسی این استوری را ندیده
        </Typography.Text>
      ) : (
        viewersList.map((v) => (
          <div
            key={v.user_id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}
          >
            <ProfileAvatar
              size={28}
              src={v.avatar_url || undefined}
              style={{ backgroundColor: 'var(--brand-primary, #3730A3)', flexShrink: 0, fontSize: 11 }}
              name={v.user_name || '?'}
            />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v.user_name ?? 'کاربر ناشناس'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--kalam-text-secondary, #64748B)' }}>
                {formatRelativeTime(v.viewed_at)}
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      centered
      width={400}
      styles={{
        content: {
          padding: 0,
          borderRadius: 16,
          overflow: 'hidden',
          background: 'transparent',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        },
        mask: { backgroundColor: 'rgba(0,0,0,0.85)' },
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '9/16',
          maxHeight: '80vh',
          borderRadius: 16,
          overflow: 'hidden',
          userSelect: 'none',
          ...slideBackground,
        }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* ─── نوارهای پیشرفت ─── */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            right: 10,
            display: 'flex',
            gap: 4,
            zIndex: 10,
            pointerEvents: 'none',
          }}
        >
          {currentStory.slides.map((slide, idx) => (
            <div
              key={slide.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.35)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 2,
                  backgroundColor: '#fff',
                  width:
                    idx < slideIndex
                      ? '100%'
                      : idx === slideIndex
                      ? `${progress}%`
                      : '0%',
                  transition: idx === slideIndex ? 'none' : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* ─── هدر: آواتار + نام + زمان + منو ─── */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 20,
          }}
        >
          <ProfileAvatar
            size={36}
            src={currentStory.creator_avatar}
            style={{ backgroundColor: 'var(--brand-primary, #3730A3)', flexShrink: 0 }}
            name={currentStory.creator_name || '?'}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <Typography.Text
              strong
              style={{ color: '#fff', fontSize: 13, display: 'block', textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              {currentStory.creator_name}
            </Typography.Text>
            <Typography.Text
              style={{ color: 'rgba(255,255,255,0.75)', fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              {formatRelativeTime(currentStory.published_at)}
            </Typography.Text>
          </div>

          {menuItems.length > 0 && (
            <Dropdown
              menu={{ items: menuItems }}
              trigger={['click']}
              placement="bottomRight"
              getPopupContainer={(trigger) =>
                (trigger?.closest('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null)
                ?? resolveOverlayPopupContainer(trigger)
              }
            >
              <Button
                type="text"
                icon={<EllipsisOutlined />}
                style={{ color: '#fff', zIndex: 20 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          )}

          <Tooltip title={paused ? 'ادامه' : 'توقف'}>
            <Button
              type="text"
              icon={paused ? <CaretRightOutlined /> : <PauseOutlined />}
              style={{ color: '#fff', zIndex: 20 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setPaused((prev) => !prev);
              }}
            />
          </Tooltip>

          <Button
            type="text"
            icon={<CloseOutlined />}
            style={{ color: '#fff', zIndex: 20 }}
            onClick={(e) => { e.stopPropagation(); onClose(); }}
          />
        </div>

        {/* ─── ناحیه‌های کلیک — فقط ناحیه میانی، بیرون از هدر و فوتر ─── */}
        <div
          style={{
            position: 'absolute',
            top: HEADER_ZONE_PX,
            right: 0,
            width: '45%',
            height: `calc(100% - ${HEADER_ZONE_PX + FOOTER_ZONE_PX}px)`,
            zIndex: 5,
          }}
          onClick={(e) => { e.stopPropagation(); goPrevSlide(); }}
        />
        <div
          style={{
            position: 'absolute',
            top: HEADER_ZONE_PX,
            left: 0,
            width: '45%',
            height: `calc(100% - ${HEADER_ZONE_PX + FOOTER_ZONE_PX}px)`,
            zIndex: 5,
          }}
          onClick={(e) => { e.stopPropagation(); goNextSlide(); }}
        />

        {/* ─── لایه‌های متن ─── */}
        {currentSlide.text_layers.map((layer) => (
          <div
            key={layer.id}
            style={{
              position: 'absolute',
              left: `${layer.x}%`,
              top: `${layer.y}%`,
              transform: 'translate(-50%, -50%)',
              color: layer.color,
              fontSize: layer.font_size,
              fontWeight: layer.bold ? 'bold' : 'normal',
              textAlign: layer.align,
              direction: 'rtl',
              textShadow: '0 1px 6px rgba(0,0,0,0.6)',
              zIndex: 6,
              pointerEvents: 'none',
              maxWidth: '85%',
              wordBreak: 'break-word',
              lineHeight: 1.4,
            }}
          >
            {layer.content}
          </div>
        ))}

        {/* ─── دکمه لینک اسلاید ─── */}
        {currentSlide.link_url && (
          <div
            style={{
              position: 'absolute',
              bottom: currentSlideText ? 124 : 80,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
            }}
          >
            <Tooltip title={currentSlide.link_url} placement="top">
              <button
                onClick={(e) => { e.stopPropagation(); handleSlideLink(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.18)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255,255,255,0.45)',
                  borderRadius: 24,
                  padding: '7px 18px',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  direction: 'rtl',
                  whiteSpace: 'nowrap',
                  textShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}
              >
                <LinkOutlined style={{ fontSize: 14 }} />
                {currentSlide.link_label || 'مشاهده بیشتر'}
              </button>
            </Tooltip>
          </div>
        )}

        {currentSlideText && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 64,
              zIndex: 20,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 10,
              padding: '10px 12px',
              borderRadius: 16,
              background: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.16)',
            }}
          >
            <div
              style={{
                flex: 1,
                color: '#fff',
                fontSize: 12,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                textShadow: '0 1px 4px rgba(0,0,0,0.45)',
              }}
            >
              {currentSlideText}
            </div>
            <Tooltip title="بازپخش متن">
              <Button
                type="text"
                icon={<ReloadOutlined />}
                style={{
                  color: '#fff',
                  background: 'rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  flexShrink: 0,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  replayCurrentSlideText();
                }}
              />
            </Tooltip>
          </div>
        )}

        {/* ─── فوتر: واکنش + بازدید ─── */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            left: 16,
            right: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 20,
          }}
        >
          {/* ایموجی‌های واکنش */}
          <Space size={4}>
            {STORY_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = localMyReaction === emoji ? null : emoji;
                  setLocalMyReaction(next);
                  onReact(currentStory.id, emoji);
                }}
                style={{
                  background: localMyReaction === emoji
                    ? 'rgba(255,255,255,0.35)'
                    : 'rgba(0,0,0,0.25)',
                  border: localMyReaction === emoji
                    ? '1.5px solid rgba(255,255,255,0.7)'
                    : '1.5px solid transparent',
                  borderRadius: 20,
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontSize: 18,
                  backdropFilter: 'blur(4px)',
                  transition: 'all 0.15s',
                  transform: localMyReaction === emoji ? 'scale(1.15)' : 'scale(1)',
                }}
              >
                {emoji}
              </button>
            ))}
          </Space>

          {/* دکمه بازدید — فقط برای صاحب استوری یا کسی که حق دیدن واکنش‌ها دارد */}
          {(isOwnStory || canViewReactions) && (
            <Popover
              open={viewersOpen}
              onOpenChange={(v) => {
                setViewersOpen(v);
                if (v) fetchViewers(currentStory.id);
              }}
              trigger="click"
              placement="top"
              content={viewersPopoverContent}
            >
              <Button
                type="text"
                icon={<EyeOutlined />}
                style={{
                  color: '#fff',
                  background: 'rgba(0,0,0,0.25)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: 16,
                  fontSize: 12,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {toPersianNumber(currentStory.viewerCount)}
              </Button>
            </Popover>
          )}
        </div>

        {/* ─── دکمه‌های قبلی/بعدی استوری ─── */}
        {storyIndex > 0 && (
          <Button
            type="text"
            icon={<RightOutlined />}
            style={{
              position: 'absolute',
              right: -44,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              zIndex: 20,
            }}
            onClick={(e) => { e.stopPropagation(); setStoryIndex((i) => i - 1); }}
          />
        )}
        {storyIndex < stories.length - 1 && (
          <Button
            type="text"
            icon={<LeftOutlined />}
            style={{
              position: 'absolute',
              left: -44,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              zIndex: 20,
            }}
            onClick={(e) => { e.stopPropagation(); setStoryIndex((i) => i + 1); }}
          />
        )}
      </div>
    </Modal>
  );
};

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'همین الان';
  if (minutes < 60) return `${toPersianNumber(minutes)} دقیقه پیش`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${toPersianNumber(hours)} ساعت پیش`;
  const days = Math.floor(hours / 24);
  return `${toPersianNumber(days)} روز پیش`;
}

export default StoryViewerModal;
