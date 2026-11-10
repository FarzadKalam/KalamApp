import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AudioMutedOutlined,
  CaretRightOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EllipsisOutlined,
  EyeOutlined,
  LeftOutlined,
  LinkOutlined,
  PauseOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SendOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Input, message, Modal, Popover, Space, Spin, Tooltip, Typography } from 'antd';
import { supabase } from '../../supabaseClient';
import type { OrgStoryWithMeta, StorySlide, StoryStickerLayer } from './storyTypes';
import { getGradientPreset, STORY_REACTION_EMOJIS } from '../../utils/storyGradients';
import { toPersianNumber } from '../../utils/persianNumberFormatter';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import ProfileAvatar from '../common/ProfileAvatar';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
import { sendStoryReply } from '../../utils/storyReplies';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import { invalidateOrgStoriesCache, resolveStoryCreatorIdentity } from '../../utils/orgStories';
import {
  buildStoryTextLayerStyle,
  computeStoryRenderScale,
  StoryStickerVisual,
} from './storyLayerRenderers';

interface StoryViewerModalProps {
  open: boolean;
  stories: OrgStoryWithMeta[];
  initialIndex: number;
  currentOrgId: string;
  currentUserId: string;
  currentUserName: string;
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
const HEADER_ZONE_PX = 88;
const FOOTER_ZONE_PX = 136;

const clamp = (val: number, min: number, max: number) => Math.max(min, Math.min(max, val));

const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  open,
  stories,
  initialIndex,
  currentOrgId,
  currentUserId,
  currentUserName,
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
  const [viewerMuted, setViewerMuted] = useState(false);
  const [playingAudioStickerId, setPlayingAudioStickerId] = useState<string | null>(null);
  const [audioBlockedPrompt, setAudioBlockedPrompt] = useState(false);
  const [stageWidth, setStageWidth] = useState(380);

  const [viewersOpen, setViewersOpen] = useState(false);
  const [viewersList, setViewersList] = useState<ViewerEntry[]>([]);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [localMyReaction, setLocalMyReaction] = useState<string | null>(
    () => stories[initialIndex]?.myReaction?.emoji ?? null,
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const userPausedAudioRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    if (!open) return;
    setStoryIndex(clamp(initialIndex, 0, Math.max(0, stories.length - 1)));
    setSlideIndex(0);
    setProgress(0);
    progressRef.current = 0;
    setPaused(false);
  }, [open, initialIndex, stories.length]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !open) return;
    const syncWidth = () => setStageWidth(el.clientWidth || 380);
    syncWidth();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(syncWidth);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, storyIndex]);

  const currentStory = stories[storyIndex] ?? null;
  const currentSlide: StorySlide | null = currentStory?.slides?.[slideIndex] ?? null;
  const slideDuration = currentSlide?.duration_ms ?? 5000;
  const totalSlides = currentStory?.slides?.length ?? 0;

  const canReplyToCurrentStory = Boolean(
    currentStory?.creator_id
    && currentStory.creator_id !== currentUserId
    && currentStory.org_id === currentOrgId
    && !currentStory.is_saas_wide,
  );

  const renderScale = useMemo(() => computeStoryRenderScale(stageWidth), [stageWidth]);

  const activeSlideAudioStickers = useMemo(
    () => (currentSlide?.stickers || []).filter((s) => s.type === 'audio' && Boolean(s.audio_url) && !s.media_cleaned),
    [currentSlide],
  );

  const hasVideo = Boolean(currentSlide?.type === 'video' && currentSlide.video_url && !currentSlide.media_cleaned);
  const hasSoundTrack = hasVideo || activeSlideAudioStickers.length > 0;

  // reset وقتی استوری عوض می‌شود
  useEffect(() => {
    setSlideIndex(0);
    setProgress(0);
    progressRef.current = 0;
    setViewersOpen(false);
    setViewersList([]);
    setReplyText('');
    setLocalMyReaction(stories[storyIndex]?.myReaction?.emoji ?? null);
  }, [storyIndex]);

  useEffect(() => {
    setReplyText('');
  }, [currentSlide?.id, open]);

  // ثبت بازدید هنگام نمایش
  useEffect(() => {
    if (currentStory && open) {
      onMarkViewed(currentStory.id);
    }
  }, [currentStory?.id, open]);

  // مدیریت پخش صدای ویدیوی اسلاید
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !open || !hasVideo) return;
    videoEl.muted = Boolean(currentSlide?.video_muted) || viewerMuted;
    if (paused) {
      videoEl.pause();
    } else {
      void videoEl.play().catch(() => undefined);
    }
  }, [open, paused, viewerMuted, hasVideo, currentSlide?.id, currentSlide?.video_muted]);

  // بارگذاری و پخش خودکار استیکر صدا در اسلاید
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    audioEl.pause();
    audioEl.currentTime = 0;
    userPausedAudioRef.current = false;
    setPlayingAudioStickerId(null);
    setAudioBlockedPrompt(false);

    if (!open || !currentSlide) {
      audioEl.removeAttribute('src');
      return;
    }

    const firstAudio = activeSlideAudioStickers[0];
    if (!firstAudio?.audio_url) {
      audioEl.removeAttribute('src');
      return;
    }

    audioEl.src = firstAudio.audio_url;
    audioEl.loop = false;
    audioEl.muted = viewerMuted;

    if (firstAudio.auto_play !== false && !paused) {
      void audioEl
        .play()
        .then(() => {
          setPlayingAudioStickerId(firstAudio.id);
          setAudioBlockedPrompt(false);
        })
        .catch(() => {
          setPlayingAudioStickerId(null);
          setAudioBlockedPrompt(true);
        });
    }

    return () => {
      audioEl.pause();
    };
  }, [open, currentStory?.id, currentSlide?.id]);

  // همگام‌سازی pause و mute استیکر صدا
  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl || !audioEl.src) return;
    audioEl.muted = viewerMuted;

    if (!open || paused) {
      if (!audioEl.paused) {
        audioEl.pause();
      }
      return;
    }

    if (playingAudioStickerId && audioEl.paused && !userPausedAudioRef.current) {
      void audioEl.play().catch(() => undefined);
    }
  }, [open, paused, viewerMuted, playingAudioStickerId]);

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

  // تایمر پیشرفت اسلاید
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
  }, [open, paused, slideIndex, storyIndex, slideDuration, goNextSlide, currentSlide]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT'
        || target?.tagName === 'TEXTAREA'
        || target?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') goPrevSlide();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') goNextSlide();
      if (e.key === 'Escape') onClose();
      if (e.key === ' ') setPaused((p) => !p);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, goPrevSlide, goNextSlide, onClose]);

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
        new Set(viewData.map((v: { user_id: string }) => String(v?.user_id || '').trim()).filter(Boolean)),
      );
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile_1, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(
        ((profileData ?? []) as ViewerProfileRow[]).map((p) => [p.id, p]),
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
        }),
      );
    } finally {
      setViewersLoading(false);
    }
  }, []);

  if (!currentStory || !currentSlide) return null;

  const isOwnStory = currentStory.creator_id === currentUserId;
  const { creatorName, creatorAvatar } = resolveStoryCreatorIdentity(currentStory);

  const navigateOrOpenUrl = (url: string, linkType?: 'internal' | 'external') => {
    const trimmed = String(url || '').trim();
    if (!trimmed) return;
    setPaused(true);
    if (linkType === 'internal' || trimmed.startsWith('/')) {
      navigate(trimmed);
      onClose();
      return;
    }
    if (/^https?:\/\//i.test(trimmed)) {
      window.open(trimmed, '_blank', 'noopener,noreferrer');
    }
  };

  const handleStickerToggleAudio = (sticker: StoryStickerLayer) => {
    const audioEl = audioRef.current;
    if (!audioEl || !sticker.audio_url) return;

    if (playingAudioStickerId === sticker.id && !audioEl.paused) {
      audioEl.pause();
      userPausedAudioRef.current = true;
      setPlayingAudioStickerId(null);
      return;
    }

    if (audioEl.src !== sticker.audio_url) {
      audioEl.src = sticker.audio_url;
      audioEl.currentTime = 0;
    }
    userPausedAudioRef.current = false;
    setViewerMuted(false);
    audioEl.muted = false;
    setAudioBlockedPrompt(false);

    void audioEl
      .play()
      .then(() => {
        setPlayingAudioStickerId(sticker.id);
      })
      .catch(() => {
        message.warning('پخش صدا در مرورگر مسدود شد؛ دوباره ضربه بزنید.');
      });
  };

  const handleStickerClick = (sticker: StoryStickerLayer) => {
    if (sticker.type === 'link' && sticker.url) {
      navigateOrOpenUrl(sticker.url, sticker.link_type);
      return;
    }
    if (sticker.type === 'mention' && sticker.user_id && !currentStory.is_saas_wide) {
      setPaused(true);
      navigate(`/profile/${sticker.user_id}`);
      onClose();
    }
  };

  const canEdit = isOwnStory ? canEditOwn : canEditOthers;
  const canDelete = isOwnStory ? canDeleteOwn : canDeleteOthers;

  const submitReply = async () => {
    const text = replyText.trim();
    if (!text || replySending || !canReplyToCurrentStory || !currentStory.creator_id) return;

    setReplySending(true);
    try {
      await sendStoryReply({
        orgId: currentOrgId,
        storyId: currentStory.id,
        slideId: currentSlide.id,
        creatorId: currentStory.creator_id,
        currentUserId,
        currentUserName,
        text,
      });
      setReplyText('');
      message.success('پاسخ ارسال شد.');
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'ارسال پاسخ ناموفق بود.'));
    } finally {
      setReplySending(false);
    }
  };

  const slideBackground: React.CSSProperties = (() => {
    if (currentSlide.type === 'image' && currentSlide.image_url && !currentSlide.media_cleaned) {
      return buildImageBackgroundStyle(currentSlide.image_url, 'hero');
    }
    if (currentSlide.type === 'video' && currentSlide.video_url && !currentSlide.media_cleaned) {
      return { background: '#090D16' };
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
        if (deleted) {
          invalidateOrgStoriesCache(currentOrgId);
          onClose();
        }
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
                {v.user_name ?? 'همکار سازمان'}
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
      width={408}
      styles={{
        content: {
          padding: 0,
          borderRadius: 20,
          overflow: 'hidden',
          background: 'transparent',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
        },
        mask: { backgroundColor: 'rgba(0,0,0,0.85)' },
      }}
    >
      <audio
        ref={audioRef}
        className="hidden"
        onEnded={() => setPlayingAudioStickerId(null)}
        onPause={() => {
          if (!paused) setPlayingAudioStickerId(null);
        }}
      />

      <div style={{ position: 'relative' }}>
      <div
        ref={stageRef}
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '9/16',
          maxHeight: '84vh',
          borderRadius: 20,
          overflow: 'hidden',
          userSelect: 'none',
          border: currentStory.is_saas_wide ? '2px solid rgba(56, 189, 248, 0.55)' : undefined,
          ...slideBackground,
        }}
        onMouseDown={() => setPaused(true)}
        onMouseUp={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
      >
        {/* ─── ویدیوی واقعی اسلاید ─── */}
        {hasVideo && (
          <video
            ref={videoRef}
            src={currentSlide.video_url}
            muted={Boolean(currentSlide.video_muted) || viewerMuted}
            playsInline
            autoPlay
            loop
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* اطلاع پاک‌شدن فایل پس از انقضا */}
        {currentSlide.media_cleaned && (
          <div className="absolute inset-0 flex items-center justify-center p-6 pointer-events-none z-[4]">
            <div className="rounded-2xl bg-black/45 backdrop-blur-md border border-white/20 px-4 py-3 text-center text-xs text-white/90">
              مدیای این استوری پس از پایان زمان نمایش پاکسازی شده است.
            </div>
          </div>
        )}

        {/* گرادیانت خوانایی هدر و فوتر */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 z-[8]"
          style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.52), transparent)' }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-32 z-[8]"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.56), transparent)' }}
        />

        {/* ─── نوارهای پیشرفت ─── */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            left: 12,
            right: 12,
            display: 'flex',
            gap: 4,
            zIndex: 25,
            pointerEvents: 'none',
          }}
        >
          {currentStory.slides.map((slide, idx) => (
            <div
              key={slide.id}
              style={{
                flex: 1,
                height: 3,
                borderRadius: 99,
                backgroundColor: 'rgba(255,255,255,0.34)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  borderRadius: 99,
                  backgroundColor: '#fff',
                  width:
                    idx < slideIndex
                      ? '100%'
                      : idx === slideIndex
                        ? `${progress}%`
                        : '0%',
                }}
              />
            </div>
          ))}
        </div>

        {/* ─── هدر: آواتار + نام + دکمه صدا + منو ─── */}
        <div
          style={{
            position: 'absolute',
            top: 22,
            left: 12,
            right: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            zIndex: 25,
          }}
          dir="rtl"
        >
          <ProfileAvatar
            size={36}
            src={creatorAvatar || undefined}
            style={{
              backgroundColor: currentStory.is_saas_wide ? '#ffffff' : 'var(--brand-primary, #3730A3)',
              border: currentStory.is_saas_wide ? '2px solid #F59E0B' : '1.5px solid rgba(255,255,255,0.65)',
              flexShrink: 0,
            }}
            name={creatorName}
          />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div className="flex items-center gap-1.5">
              <Typography.Text
                strong
                style={{ color: '#fff', fontSize: 13, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
                className="truncate"
              >
                {creatorName}
              </Typography.Text>
              {currentStory.is_saas_wide && (
                <span className="inline-flex items-center rounded-full bg-amber-400/95 px-1.5 py-[1px] text-[9px] font-bold text-slate-950 shrink-0">
                  رسمی
                </span>
              )}
            </div>
            <Typography.Text
              style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, textShadow: '0 1px 3px rgba(0,0,0,0.5)' }}
            >
              {formatRelativeTime(currentStory.published_at)}
            </Typography.Text>
          </div>

          {hasSoundTrack && (
            <Tooltip title={currentSlide.video_muted && activeSlideAudioStickers.length === 0 ? 'بی‌صدا توسط منتشرکننده' : (viewerMuted ? 'وصل صدا' : 'بی‌صدا')}>
              <Button
                type="text"
                icon={viewerMuted || (currentSlide.video_muted && activeSlideAudioStickers.length === 0)
                  ? <AudioMutedOutlined />
                  : <SoundOutlined />}
                style={{ color: '#fff', zIndex: 25 }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerMuted((prev) => !prev);
                }}
              />
            </Tooltip>
          )}

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
                style={{ color: '#fff', zIndex: 25 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </Dropdown>
          )}

          <Tooltip title={paused ? 'ادامه' : 'توقف'}>
            <Button
              type="text"
              icon={paused ? <CaretRightOutlined /> : <PauseOutlined />}
              style={{ color: '#fff', zIndex: 25 }}
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
            style={{ color: '#fff', zIndex: 25 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          />
        </div>

        {/* پیام راهنمای مرورگر در صورت نیاز به ضربه برای شروع پخش صدا */}
        {audioBlockedPrompt && activeSlideAudioStickers[0] && (
          <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[26]">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleStickerToggleAudio(activeSlideAudioStickers[0]);
              }}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-950/75 border border-white/25 px-3 py-1 text-[11px] font-medium text-white backdrop-blur cursor-pointer"
            >
              <SoundOutlined />
              <span>برای پخش صدا ضربه بزنید</span>
            </button>
          </div>
        )}

        {/* ─── ناحیه‌های کلیک راست و چپ (قبلی / بعدی) ─── */}
        <div
          style={{
            position: 'absolute',
            top: HEADER_ZONE_PX,
            right: 0,
            width: '45%',
            height: `calc(100% - ${HEADER_ZONE_PX + FOOTER_ZONE_PX}px)`,
            zIndex: 5,
          }}
          onClick={(e) => {
            e.stopPropagation();
            goPrevSlide();
          }}
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
          onClick={(e) => {
            e.stopPropagation();
            goNextSlide();
          }}
        />

        {/* ─── لایه‌های متن ─── */}
        {(currentSlide.text_layers || []).map((layer) => {
          const widthPct = clamp(Number(layer.width_pct) || 74, 26, 92);
          return (
            <div
              key={layer.id}
              style={{
                position: 'absolute',
                left: `${layer.x}%`,
                top: `${layer.y}%`,
                transform: 'translate(-50%, -50%)',
                width: `${widthPct}%`,
                zIndex: 12,
                pointerEvents: 'none',
              }}
            >
              <div style={buildStoryTextLayerStyle(layer, renderScale)}>
                {layer.content}
              </div>
            </div>
          );
        })}

        {/* ─── لایه‌های استیکر ─── */}
        {(currentSlide.stickers || []).map((sticker) => {
          const interactive = sticker.type === 'link' || sticker.type === 'mention' || sticker.type === 'audio';
          return (
            <div
              key={sticker.id}
              onMouseDown={(e) => {
                if (interactive) e.stopPropagation();
              }}
              onMouseUp={(e) => {
                if (interactive) e.stopPropagation();
              }}
              onTouchStart={(e) => {
                if (interactive) e.stopPropagation();
              }}
              onTouchEnd={(e) => {
                if (interactive) e.stopPropagation();
              }}
              onClick={(e) => {
                if (interactive) e.stopPropagation();
              }}
              style={{
                position: 'absolute',
                left: `${sticker.x}%`,
                top: `${sticker.y}%`,
                transform: 'translate(-50%, -50%)',
                zIndex: 16,
                pointerEvents: interactive ? 'auto' : 'none',
              }}
            >
              <StoryStickerVisual
                sticker={sticker}
                renderScale={renderScale}
                isAudioPlaying={playingAudioStickerId === sticker.id}
                onToggleAudio={(e) => {
                  e.stopPropagation();
                  handleStickerToggleAudio(sticker);
                }}
                onClickSticker={(e) => {
                  e.stopPropagation();
                  handleStickerClick(sticker);
                }}
              />
            </div>
          );
        })}

        {/* ─── دکمه لینک قدیمی اسلاید (پشتیبانی سازگار) ─── */}
        {currentSlide.link_url && (
          <div
            style={{
              position: 'absolute',
              bottom: canReplyToCurrentStory ? 124 : 80,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 20,
            }}
          >
            <Tooltip title={currentSlide.link_url} placement="top">
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  navigateOrOpenUrl(currentSlide.link_url!, currentSlide.link_type);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: 'rgba(255,255,255,0.2)',
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

        {/* پاسخ سریع */}
        {canReplyToCurrentStory && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 64,
              zIndex: 25,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              borderRadius: 16,
              background: 'rgba(0,0,0,0.34)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.18)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            <Input
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              onFocus={() => setPaused(true)}
              onBlur={() => {
                if (!replySending) setPaused(false);
              }}
              onPressEnter={(event) => {
                event.preventDefault();
                void submitReply();
              }}
              placeholder="پاسخ خود را بنویسید..."
              aria-label="متن پاسخ به استوری"
              maxLength={2000}
              readOnly={replySending}
              style={{
                flex: 1,
                color: '#fff',
                background: 'transparent',
                border: 0,
                boxShadow: 'none',
                direction: 'rtl',
              }}
            />
            <Tooltip title="ارسال پاسخ">
              <Button
                type="text"
                icon={<SendOutlined />}
                loading={replySending}
                disabled={!replyText.trim()}
                aria-label="ارسال پاسخ"
                style={{
                  color: '#fff',
                  background: 'rgba(255,255,255,0.14)',
                  borderRadius: 12,
                  flexShrink: 0,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  void submitReply();
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
            zIndex: 25,
          }}
        >
          <Space size={4}>
            {STORY_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = localMyReaction === emoji ? null : emoji;
                  setLocalMyReaction(next);
                  onReact(currentStory.id, emoji);
                }}
                style={{
                  background: localMyReaction === emoji
                    ? 'rgba(255,255,255,0.35)'
                    : 'rgba(0,0,0,0.28)',
                  border: localMyReaction === emoji
                    ? '1.5px solid rgba(255,255,255,0.75)'
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

          {(isOwnStory || canViewReactions) && (
            <Popover
              open={viewersOpen}
              onOpenChange={(v) => {
                setViewersOpen(v);
                setPaused(v);
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
                  background: 'rgba(0,0,0,0.28)',
                  backdropFilter: 'blur(4px)',
                  borderRadius: 16,
                  fontSize: 12,
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                {toPersianNumber(currentStory.viewerCount)}
              </Button>
            </Popover>
          )}
        </div>

      </div>

        {/* ─── دکمه‌های قبلی/بعدی استوری بیرون از کادر برش ─── */}
        {storyIndex > 0 && (
          <Button
            type="text"
            icon={<RightOutlined />}
            style={{
              position: 'absolute',
              right: -46,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              zIndex: 30,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setStoryIndex((i) => i - 1);
            }}
          />
        )}
        {storyIndex < stories.length - 1 && (
          <Button
            type="text"
            icon={<LeftOutlined />}
            style={{
              position: 'absolute',
              left: -46,
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#fff',
              zIndex: 30,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              setStoryIndex((i) => i + 1);
            }}
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
