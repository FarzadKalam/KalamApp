import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Divider,
  Modal,
  Segmented,
  Select,
  Slider,
  Space,
  Switch,
  Tooltip,
  Input,
} from 'antd';
import {
  AlignCenterOutlined,
  AlignLeftOutlined,
  AlignRightOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  AudioMutedOutlined,
  CalendarOutlined,
  CustomerServiceOutlined,
  DeleteOutlined,
  EditOutlined,
  FontSizeOutlined,
  LinkOutlined,
  PictureOutlined,
  PlusOutlined,
  SettingOutlined,
  SmileOutlined,
  SoundOutlined,
  TagOutlined,
  UserAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { supabase } from '../../supabaseClient';
import { MODULES } from '../../moduleRegistry';
import AdaptiveIdentityPicker from '../AdaptiveIdentityPicker';
import PersianDatePicker from '../PersianDatePicker';
import { resolveOverlayPopupContainer } from '../../utils/popupContainer';
import { STORY_GRADIENT_PRESET_LIST, getGradientPreset } from '../../utils/storyGradients';
import { createWorkflowId as createId } from '../../utils/workflowTypes';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { buildImageBackgroundStyle } from '../../utils/imagePreview';
import { safeJalaliFormat, toPersianNumber } from '../../utils/persianNumberFormatter';
import { isSaasAdminModuleId } from '../../utils/permissions';
import { getRecordTitle, getRecordTitleCandidateKeys } from '../../utils/recordTitle';
import { toFaErrorMessage } from '../../utils/errorMessageFa';
import {
  extractMentionUserIdsFromSlides,
  sendStoryMentionSystemNotifications,
} from '../../utils/storyMentions';
import { invalidateOrgStoriesCache } from '../../utils/orgStories';
import type { IdentityOption } from '../../utils/identityDirectory';
import { StoryCanvasEditor, type SelectedStoryElement } from './StoryCanvasEditor';
import {
  STORY_BADGE_STICKERS,
  STORY_EMOJI_STICKERS,
  STORY_FONT_WEIGHT_OPTIONS,
  STORY_TEXT_COLORS,
  STORY_TEXT_STYLE_OPTIONS,
} from './storyLayerRenderers';
import {
  StoryMediaUploadTrigger,
  type SelectedStoryMediaResult,
} from './StoryMediaUploadTrigger';
import { StoryAudioRecorderInline } from './StoryAudioRecorderInline';
import {
  DEFAULT_SLIDE_DURATION_MS,
  DEFAULT_TEXT_LAYER,
  SAAS_STORY_AVATAR_URL,
  SAAS_STORY_CREATOR_NAME,
  STORY_DEFAULT_VIDEO_DURATION_MS,
  STORY_MAX_SLIDE_DURATION_MS,
  STORY_MIN_SLIDE_DURATION_MS,
  type OrgStory,
  type StorySlide,
  type StoryStickerLayer,
  type StoryStickerVariant,
  type StoryTextLayer,
} from './storyTypes';

interface StoryEditorModalProps {
  open: boolean;
  orgId: string;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatar?: string | null;
  editingStory?: OrgStory | null;
  canPublishSaasStory?: boolean;
  canPublishSaasAdminStory?: boolean;
  onClose: () => void;
  onSaved: () => void;
  onNotifySms?: (storyId: string, text: string, recipientIds: string[]) => void;
}

type StudioTabKey = 'design' | 'stickers' | 'settings';
type StickerToolSection = 'mention' | 'link' | 'audio' | 'badge';

const STICKER_VARIANT_OPTIONS: Array<{ value: StoryStickerVariant; label: string; dotColor: string }> = [
  { value: 'frost', label: 'شیشه‌ای', dotColor: '#334155' },
  { value: 'light', label: 'روشن', dotColor: '#f8fafc' },
  { value: 'dark', label: 'تیره', dotColor: '#0f172a' },
  { value: 'brand', label: 'برند', dotColor: 'rgb(var(--brand-500-rgb, 79 70 229))' },
  { value: 'amber', label: 'کهربایی', dotColor: '#f59e0b' },
  { value: 'emerald', label: 'سبز', dotColor: '#10b981' },
  { value: 'rose', label: 'رز', dotColor: '#f43f5e' },
];

const clampSlideDurationMs = (ms: number | null | undefined, fallback = DEFAULT_SLIDE_DURATION_MS) => {
  const num = Number(ms);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.max(STORY_MIN_SLIDE_DURATION_MS, Math.min(STORY_MAX_SLIDE_DURATION_MS, Math.round(num)));
};

const createGradientSlide = (gradientKey = 'brand_indigo'): StorySlide => ({
  id: createId(),
  type: 'gradient',
  gradient_key: gradientKey,
  text_layers: [],
  stickers: [],
  duration_ms: DEFAULT_SLIDE_DURATION_MS,
});

const sanitizeExternalHttpUrl = (raw: string): string => {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

const isRpcSignatureMissingError = (error: any): boolean => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === 'PGRST202'
    || code === '42883'
    || text.includes('could not find the function')
    || text.includes('delete_media_on_expire')
    || text.includes('p_settings')
  );
};

const isMissingLifecycleColumnError = (error: any): boolean => {
  const code = String(error?.code || '').toUpperCase();
  const text = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return (
    code === '42703'
    || code === 'PGRST204'
    || text.includes('delete_media_on_expire')
    || text.includes('media_cleaned_at')
    || text.includes('settings')
  );
};

const StoryEditorModal: React.FC<StoryEditorModalProps> = ({
  open,
  orgId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  editingStory,
  canPublishSaasStory = false,
  canPublishSaasAdminStory = false,
  onClose,
  onSaved,
  onNotifySms,
}) => {
  const { message } = App.useApp();

  const [activeTab, setActiveTab] = useState<StudioTabKey>('design');
  const [stickerSection, setStickerSection] = useState<StickerToolSection>('badge');

  const [slides, setSlides] = useState<StorySlide[]>([]);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [selectedElement, setSelectedElement] = useState<SelectedStoryElement>(null);

  // تنظیمات انتشار
  const [isOrgWide, setIsOrgWide] = useState(true);
  const [isSaasWide, setIsSaasWide] = useState(false);
  const [isSaasAdminsOnly, setIsSaasAdminsOnly] = useState(false);
  const [viewerUserIds, setViewerUserIds] = useState<string[]>([]);
  const [viewerRoleIds, setViewerRoleIds] = useState<string[]>([]);
  const [extraMentionUserIds, setExtraMentionUserIds] = useState<string[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [deleteMediaOnExpire, setDeleteMediaOnExpire] = useState<boolean>(true);
  const [notifySms, setNotifySms] = useState(false);
  const [smsText, setSmsText] = useState('');
  const [smsRecipientIds, setSmsRecipientIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // فرم استیکرها
  const [mentionDraftUserId, setMentionDraftUserId] = useState<string | undefined>(undefined);
  const [mentionDraftOption, setMentionDraftOption] = useState<IdentityOption | null>(null);
  const [mentionDraftVariant, setMentionDraftVariant] = useState<StoryStickerVariant>('frost');
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null);

  const [linkMode, setLinkMode] = useState<'external' | 'internal'>('internal');
  const [linkExternalUrl, setLinkExternalUrl] = useState('');
  const [linkInternalModuleId, setLinkInternalModuleId] = useState<string | undefined>(undefined);
  const [linkInternalRecordId, setLinkInternalRecordId] = useState<string | undefined>(undefined);
  const [linkModuleRecords, setLinkModuleRecords] = useState<Array<{ label: string; value: string }>>([]);
  const [linkModuleRecordsLoading, setLinkModuleRecordsLoading] = useState(false);
  const [linkCustomLabel, setLinkCustomLabel] = useState('');
  const [linkVariant, setLinkVariant] = useState<StoryStickerVariant>('light');

  const [audioTitle, setAudioTitle] = useState('');
  const [audioAutoPlay, setAudioAutoPlay] = useState(true);
  const [audioVariant, setAudioVariant] = useState<StoryStickerVariant>('frost');
  const [pendingAudioMedia, setPendingAudioMedia] = useState<SelectedStoryMediaResult | null>(null);

  const [badgeText, setBadgeText] = useState('');
  const [badgeIcon, setBadgeIcon] = useState('📢');
  const [badgeVariant, setBadgeVariant] = useState<StoryStickerVariant>('brand');

  const OVERLAY_Z_BASE = 1480;
  const popupContainer = useCallback((triggerNode?: HTMLElement | null) => {
    const host = triggerNode?.closest?.('.ant-modal-body, .ant-modal-content, .ant-modal') as HTMLElement | null;
    return host || resolveOverlayPopupContainer(triggerNode);
  }, []);

  const isEdit = Boolean(editingStory);
  const initialMentionIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setActiveTab('design');
    setSelectedElement(null);
    setEditingStickerId(null);
    setPendingAudioMedia(null);
    setAudioTitle('');
    setAudioAutoPlay(true);
    setLinkExternalUrl('');
    setLinkCustomLabel('');
    setLinkInternalModuleId(undefined);
    setLinkInternalRecordId(undefined);
    setLinkModuleRecords([]);
    setMentionDraftUserId(undefined);
    setMentionDraftOption(null);

    if (editingStory) {
      const normalizedSlides = (editingStory.slides || []).map((slide) => ({
        ...slide,
        text_layers: Array.isArray(slide.text_layers) ? slide.text_layers : [],
        stickers: Array.isArray(slide.stickers) ? slide.stickers : [],
        duration_ms: clampSlideDurationMs(slide.duration_ms),
      }));
      setSlides(normalizedSlides.length ? normalizedSlides : [createGradientSlide('brand_indigo')]);
      setIsOrgWide(editingStory.is_org_wide);
      setIsSaasWide(editingStory.is_saas_wide ?? false);
      setIsSaasAdminsOnly(editingStory.is_saas_admins_only ?? false);
      setViewerUserIds(editingStory.viewer_user_ids ?? []);
      setViewerRoleIds(editingStory.viewer_role_ids ?? []);

      const slideMentionSet = new Set(extractMentionUserIdsFromSlides(normalizedSlides));
      const allStoryMentions = editingStory.mention_user_ids ?? [];
      initialMentionIdsRef.current = allStoryMentions;
      setExtraMentionUserIds(allStoryMentions.filter((id) => !slideMentionSet.has(id)));

      setExpiresAt(editingStory.expires_at ?? null);
      setDeleteMediaOnExpire(editingStory.delete_media_on_expire ?? true);
    } else {
      initialMentionIdsRef.current = [];
      setSlides([createGradientSlide('brand_indigo')]);
      setIsOrgWide(true);
      setIsSaasWide(false);
      setIsSaasAdminsOnly(false);
      setViewerUserIds([]);
      setViewerRoleIds([]);
      setExtraMentionUserIds([]);
      const default24h = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      setExpiresAt(default24h);
      setDeleteMediaOnExpire(true);
      setNotifySms(false);
      setSmsText('');
      setSmsRecipientIds([]);
    }
    setActiveSlideIdx(0);
  }, [open, editingStory]);

  const activeSlide = slides[activeSlideIdx] ?? null;

  const selectedTextLayer: StoryTextLayer | null = useMemo(() => {
    if (!activeSlide || selectedElement?.kind !== 'text') return null;
    return activeSlide.text_layers.find((l) => l.id === selectedElement.id) ?? null;
  }, [activeSlide, selectedElement]);

  const selectedSticker: StoryStickerLayer | null = useMemo(() => {
    if (!activeSlide || selectedElement?.kind !== 'sticker') return null;
    return (activeSlide.stickers || []).find((s) => s.id === selectedElement.id) ?? null;
  }, [activeSlide, selectedElement]);

  const availableInternalModules = useMemo(() => {
    return Object.entries(MODULES)
      .filter(([moduleId, mod]) => {
        if (!mod || !mod.table) return false;
        if (moduleId.startsWith('__') || isSaasAdminModuleId(moduleId)) return false;
        return Boolean(mod.titles?.fa);
      })
      .map(([moduleId, mod]) => ({
        value: moduleId,
        label: mod.titles.fa,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fa'));
  }, []);

  // واکشی رکوردهای ماژول انتخابی بدون استفاده از select('*')
  useEffect(() => {
    if (!open || !linkInternalModuleId) {
      setLinkModuleRecords([]);
      return;
    }
    const mod = MODULES[linkInternalModuleId];
    if (!mod?.table) {
      setLinkModuleRecords([]);
      return;
    }

    let cancelled = false;
    setLinkModuleRecordsLoading(true);
    const titleKeys = getRecordTitleCandidateKeys(mod).slice(0, 5);
    const selectCols = Array.from(new Set(['id', ...titleKeys])).join(',');

    void (async () => {
      try {
        const { data, error } = await supabase
          .from(mod.table)
          .select(selectCols)
          .limit(40);

        if (cancelled) return;
        if (error || !Array.isArray(data)) {
          setLinkModuleRecords([]);
          return;
        }
        const options = data
          .map((row: any) => {
            const id = String(row?.id || '').trim();
            if (!id) return null;
            const title = getRecordTitle(row, mod, { fallback: '' });
            if (!title) return null;
            return {
              value: id,
              label: title,
            };
          })
          .filter((item): item is { value: string; label: string } => Boolean(item));
        setLinkModuleRecords(options);
      } catch {
        if (!cancelled) setLinkModuleRecords([]);
      } finally {
        if (!cancelled) setLinkModuleRecordsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, linkInternalModuleId]);

  // ─── مدیریت اسلایدها ───────────────────────

  const updateActiveSlide = useCallback(
    (updater: (slide: StorySlide) => StorySlide) => {
      setSlides((prev) => prev.map((s, i) => (i === activeSlideIdx ? updater(s) : s)));
    },
    [activeSlideIdx],
  );

  const handleAddVisualSlide = (media: SelectedStoryMediaResult) => {
    if (media.kind === 'image') {
      const slide: StorySlide = {
        id: createId(),
        type: 'image',
        image_url: media.url,
        file_id: media.fileId || undefined,
        text_layers: [],
        stickers: [],
        duration_ms: DEFAULT_SLIDE_DURATION_MS,
      };
      setSlides((prev) => {
        const next = [...prev, slide];
        setActiveSlideIdx(next.length - 1);
        return next;
      });
      setSelectedElement(null);
      return;
    }

    if (media.kind === 'video') {
      const videoDurationMs = media.durationSec
        ? clampSlideDurationMs(media.durationSec * 1000, STORY_DEFAULT_VIDEO_DURATION_MS)
        : STORY_DEFAULT_VIDEO_DURATION_MS;
      const slide: StorySlide = {
        id: createId(),
        type: 'video',
        video_url: media.url,
        video_muted: false,
        video_duration_ms: videoDurationMs,
        file_id: media.fileId || undefined,
        text_layers: [],
        stickers: [],
        duration_ms: videoDurationMs,
      };
      setSlides((prev) => {
        const next = [...prev, slide];
        setActiveSlideIdx(next.length - 1);
        return next;
      });
      setSelectedElement(null);
    }
  };

  const handleReplaceActiveSlideBackground = (media: SelectedStoryMediaResult) => {
    if (!activeSlide) return;
    if (media.kind === 'image') {
      updateActiveSlide((s) => ({
        ...s,
        type: 'image',
        image_url: media.url,
        video_url: undefined,
        video_muted: undefined,
        video_duration_ms: undefined,
        gradient_key: undefined,
        file_id: media.fileId || undefined,
        media_cleaned: false,
      }));
      return;
    }
    if (media.kind === 'video') {
      const videoDurationMs = media.durationSec
        ? clampSlideDurationMs(media.durationSec * 1000, STORY_DEFAULT_VIDEO_DURATION_MS)
        : STORY_DEFAULT_VIDEO_DURATION_MS;
      updateActiveSlide((s) => ({
        ...s,
        type: 'video',
        video_url: media.url,
        video_muted: s.video_muted ?? false,
        video_duration_ms: videoDurationMs,
        image_url: undefined,
        gradient_key: undefined,
        file_id: media.fileId || undefined,
        duration_ms: videoDurationMs,
        media_cleaned: false,
      }));
    }
  };

  const addGradientSlide = (gradientKey = 'brand_indigo') => {
    const nextSlide = createGradientSlide(gradientKey);
    setSlides((prev) => {
      const next = [...prev, nextSlide];
      setActiveSlideIdx(next.length - 1);
      return next;
    });
    setSelectedElement(null);
  };

  const moveSlide = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= slides.length) return;
    setSlides((prev) => {
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
    setActiveSlideIdx(targetIdx);
  };

  const removeSlide = (idx: number) => {
    if (slides.length <= 1) {
      message.warning('حداقل یک اسلاید باید وجود داشته باشد.');
      return;
    }
    setSlides((prev) => prev.filter((_, i) => i !== idx));
    setActiveSlideIdx((prev) => Math.max(0, prev >= idx ? prev - 1 : prev));
    setSelectedElement(null);
  };

  // ─── مدیریت لایه‌های متن ──────────────────────────

  const addTextLayer = () => {
    const newLayer: StoryTextLayer = {
      id: createId(),
      ...DEFAULT_TEXT_LAYER,
      y: Math.min(80, 34 + (activeSlide?.text_layers?.length || 0) * 12),
    };
    updateActiveSlide((slide) => ({
      ...slide,
      text_layers: [...slide.text_layers, newLayer],
    }));
    setSelectedElement({ kind: 'text', id: newLayer.id });
    setActiveTab('design');
  };

  const updateTextLayer = useCallback(
    (layerId: string, changes: Partial<StoryTextLayer>) => {
      updateActiveSlide((slide) => ({
        ...slide,
        text_layers: slide.text_layers.map((l) => (l.id === layerId ? { ...l, ...changes } : l)),
      }));
    },
    [updateActiveSlide],
  );

  const removeTextLayer = useCallback(
    (layerId: string) => {
      updateActiveSlide((slide) => ({
        ...slide,
        text_layers: slide.text_layers.filter((l) => l.id !== layerId),
      }));
    },
    [updateActiveSlide],
  );

  // ─── مدیریت استیکرها ──────────────────────────

  const addSticker = (stickerData: Omit<StoryStickerLayer, 'id'>) => {
    const existingOffset = ((activeSlide?.stickers?.length || 0) % 4) * 6;
    const sticker: StoryStickerLayer = {
      id: createId(),
      ...stickerData,
      x: stickerData.x ?? 50,
      y: stickerData.y ?? Math.min(78, 52 + existingOffset),
      scale: stickerData.scale ?? 1,
    };
    updateActiveSlide((slide) => ({
      ...slide,
      stickers: [...(slide.stickers || []), sticker],
    }));
    setSelectedElement({ kind: 'sticker', id: sticker.id });
  };

  const updateSticker = useCallback(
    (stickerId: string, patch: Partial<StoryStickerLayer>) => {
      updateActiveSlide((slide) => ({
        ...slide,
        stickers: (slide.stickers || []).map((st) => (st.id === stickerId ? { ...st, ...patch } : st)),
      }));
    },
    [updateActiveSlide],
  );

  const removeSticker = useCallback(
    (stickerId: string) => {
      updateActiveSlide((slide) => ({
        ...slide,
        stickers: (slide.stickers || []).filter((st) => st.id !== stickerId),
      }));
    },
    [updateActiveSlide],
  );

  // هنگام درخواست ویرایش یک استیکر از روی بوم
  const handleRequestEditElement = (el: NonNullable<SelectedStoryElement>) => {
    if (el.kind === 'text') {
      setActiveTab('design');
      return;
    }
    const target = activeSlide?.stickers?.find((s) => s.id === el.id);
    if (!target) return;
    setActiveTab('stickers');
    setEditingStickerId(target.id);
    if (target.type === 'mention') {
      setStickerSection('mention');
      setMentionDraftUserId(target.user_id);
      setMentionDraftVariant(target.variant || 'frost');
    } else if (target.type === 'link') {
      setStickerSection('link');
      setLinkMode(target.link_type === 'internal' ? 'internal' : 'external');
      setLinkCustomLabel(target.label || '');
      setLinkVariant(target.variant || 'light');
      if (target.link_type === 'internal') {
        setLinkInternalModuleId(target.module_id || undefined);
        setLinkInternalRecordId(target.record_id || undefined);
      } else {
        setLinkExternalUrl(target.url || '');
      }
    } else if (target.type === 'audio') {
      setStickerSection('audio');
      setAudioTitle(target.audio_name || '');
      setAudioAutoPlay(target.auto_play !== false);
      setAudioVariant(target.variant || 'frost');
      if (target.audio_url) {
        setPendingAudioMedia({
          kind: 'audio',
          url: target.audio_url,
          name: target.audio_name || 'فایل صوتی',
          fileId: target.file_id || null,
          durationSec: target.duration_sec || null,
        });
      }
    } else if (target.type === 'badge') {
      setStickerSection('badge');
      setBadgeText(target.text || '');
      setBadgeIcon(target.icon || '📢');
      setBadgeVariant(target.variant || 'brand');
    }
  };

  // افزودن یا بروزرسانی استیکر منشن
  const handleApplyMentionSticker = async () => {
    const userId = String(mentionDraftUserId || '').trim();
    if (!userId) {
      message.warning('ابتدا یک کاربر را انتخاب کنید.');
      return;
    }
    let resolvedName = String(mentionDraftOption?.label || '').trim();
    let resolvedAvatar = mentionDraftOption?.avatarUrl || null;

    if (!resolvedName || /^[0-9a-f-]{30,}$/i.test(resolvedName)) {
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id, full_name, email, mobile_1, avatar_url')
        .eq('id', userId)
        .maybeSingle();
      resolvedName = String(
        profileRow?.full_name || profileRow?.email || profileRow?.mobile_1 || 'همکار سازمان',
      ).trim();
      resolvedAvatar = profileRow?.avatar_url ? String(profileRow.avatar_url) : resolvedAvatar;
    }

    if (editingStickerId && selectedSticker?.type === 'mention') {
      updateSticker(editingStickerId, {
        user_id: userId,
        user_name: resolvedName,
        user_avatar: resolvedAvatar,
        variant: mentionDraftVariant,
      });
      setEditingStickerId(null);
      message.success('استیکر منشن بروزرسانی شد.');
    } else {
      addSticker({
        type: 'mention',
        x: 50,
        y: 62,
        scale: 1,
        variant: mentionDraftVariant,
        user_id: userId,
        user_name: resolvedName,
        user_avatar: resolvedAvatar,
      });
    }
    setMentionDraftUserId(undefined);
    setMentionDraftOption(null);
  };

  // افزودن یا بروزرسانی استیکر لینک
  const handleApplyLinkSticker = () => {
    let url = '';
    let label = linkCustomLabel.trim();
    let moduleId: string | null = null;
    let recordId: string | null = null;

    if (linkMode === 'internal') {
      if (!linkInternalModuleId) {
        message.warning('ابتدا یک صفحه یا ماژول را انتخاب کنید.');
        return;
      }
      moduleId = linkInternalModuleId;
      const modTitle = MODULES[linkInternalModuleId]?.titles?.fa || 'صفحه نرم‌افزار';
      if (linkInternalRecordId) {
        recordId = linkInternalRecordId;
        url = `/${linkInternalModuleId}/${linkInternalRecordId}`;
        if (!label) {
          const recOption = linkModuleRecords.find((r) => r.value === linkInternalRecordId);
          label = recOption?.label ? `مشاهده ${recOption.label}` : `مشاهده ${modTitle}`;
        }
      } else {
        url = `/${linkInternalModuleId}`;
        if (!label) {
          label = `باز کردن ${modTitle}`;
        }
      }
    } else {
      url = sanitizeExternalHttpUrl(linkExternalUrl);
      if (!url) {
        message.warning('آدرس لینک را وارد کنید.');
        return;
      }
      if (!label) label = 'مشاهده لینک';
    }

    if (editingStickerId && selectedSticker?.type === 'link') {
      updateSticker(editingStickerId, {
        url,
        link_type: linkMode,
        label,
        module_id: moduleId,
        record_id: recordId,
        variant: linkVariant,
      });
      setEditingStickerId(null);
      message.success('استیکر لینک بروزرسانی شد.');
    } else {
      addSticker({
        type: 'link',
        x: 50,
        y: 74,
        scale: 1,
        variant: linkVariant,
        url,
        link_type: linkMode,
        label,
        module_id: moduleId,
        record_id: recordId,
      });
    }
    setLinkExternalUrl('');
    setLinkCustomLabel('');
  };

  // افزودن یا بروزرسانی استیکر صدا
  const handleAudioMediaPicked = (media: SelectedStoryMediaResult) => {
    if (media.kind !== 'audio') return;
    setPendingAudioMedia(media);
    if (!audioTitle.trim()) {
      const cleanedName = String(media.name || '').replace(/\.[^.]+$/, '').trim();
      setAudioTitle(cleanedName || 'صدای استوری');
    }
  };

  const handleApplyAudioSticker = (directMedia?: SelectedStoryMediaResult) => {
    const media = directMedia || pendingAudioMedia;
    if (!media?.url) {
      message.warning('ابتدا یک فایل صوتی انتخاب یا ضبط کنید.');
      return;
    }
    const finalName = audioTitle.trim() || String(media.name || '').replace(/\.[^.]+$/, '').trim() || 'صدای استوری';

    if (editingStickerId && selectedSticker?.type === 'audio') {
      updateSticker(editingStickerId, {
        audio_url: media.url,
        audio_name: finalName,
        file_id: media.fileId || null,
        duration_sec: media.durationSec || null,
        auto_play: audioAutoPlay,
        variant: audioVariant,
        media_cleaned: false,
      });
      setEditingStickerId(null);
      message.success('استیکر صدا بروزرسانی شد.');
    } else {
      addSticker({
        type: 'audio',
        x: 50,
        y: 66,
        scale: 1,
        variant: audioVariant,
        audio_url: media.url,
        audio_name: finalName,
        file_id: media.fileId || null,
        duration_sec: media.durationSec || null,
        auto_play: audioAutoPlay,
      });
    }
    setPendingAudioMedia(null);
    setAudioTitle('');
  };

  const handleAddDatetimeSticker = () => {
    const now = new Date();
    const formatted = toPersianNumber(safeJalaliFormat(now, 'YYYY/MM/DD - HH:mm') || 'امروز');
    addSticker({
      type: 'datetime',
      x: 50,
      y: 28,
      scale: 1,
      variant: 'frost',
      text: formatted,
      date_iso: now.toISOString(),
    });
  };

  // ─── ذخیره نهایی استوری ───────────────────────────────

  const mergedMentionUserIds = useMemo(() => {
    const slideMentions = extractMentionUserIdsFromSlides(slides);
    return Array.from(new Set([...slideMentions, ...extraMentionUserIds].map((id) => String(id || '').trim()).filter(Boolean)));
  }, [slides, extraMentionUserIds]);

  const handleSave = async () => {
    if (slides.length === 0) {
      message.warning('حداقل یک اسلاید اضافه کنید.');
      return;
    }

    setSaving(true);
    try {
      const effectiveCreatorName = isSaasWide ? SAAS_STORY_CREATOR_NAME : currentUserName;
      const effectiveCreatorAvatar = isSaasWide
        ? SAAS_STORY_AVATAR_URL
        : (normalizePublicAssetUrl(currentUserAvatar) || null);

      const settingsPayload = {
        delete_media_on_expire: Boolean(deleteMediaOnExpire),
        studio_version: 2,
      };

      const basePayload = {
        creator_name: effectiveCreatorName,
        creator_avatar: effectiveCreatorAvatar,
        slides,
        is_org_wide: isOrgWide,
        is_saas_wide: isSaasWide,
        is_saas_admins_only: isSaasWide ? isSaasAdminsOnly : false,
        viewer_user_ids: isOrgWide ? [] : viewerUserIds,
        viewer_role_ids: isOrgWide ? [] : viewerRoleIds,
        mention_user_ids: mergedMentionUserIds,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };

      let storyId: string;

      if (isEdit && editingStory) {
        const fullUpdatePayload = {
          ...basePayload,
          delete_media_on_expire: Boolean(deleteMediaOnExpire),
          settings: settingsPayload,
        };
        let { error } = await supabase
          .from('org_stories')
          .update(fullUpdatePayload)
          .eq('id', editingStory.id);

        if (error && isMissingLifecycleColumnError(error)) {
          ({ error } = await supabase
            .from('org_stories')
            .update(basePayload)
            .eq('id', editingStory.id));
        }
        if (error) throw error;
        storyId = editingStory.id;
      } else {
        let { data, error } = await supabase.rpc('create_org_story', {
          p_creator_name: effectiveCreatorName,
          p_creator_avatar: effectiveCreatorAvatar,
          p_slides: slides,
          p_is_org_wide: isOrgWide,
          p_is_saas_wide: isSaasWide,
          p_is_saas_admins_only: isSaasWide ? isSaasAdminsOnly : false,
          p_viewer_user_ids: isOrgWide ? [] : viewerUserIds,
          p_viewer_role_ids: isOrgWide ? [] : viewerRoleIds,
          p_mention_user_ids: mergedMentionUserIds,
          p_expires_at: expiresAt,
          p_mention_role_ids: [],
          p_delete_media_on_expire: Boolean(deleteMediaOnExpire),
          p_settings: settingsPayload,
        });

        // پشتیبانی سازگار اگر دیتابیس هنوز روی فاز قبلی است
        if (error && isRpcSignatureMissingError(error)) {
          ({ data, error } = await supabase.rpc('create_org_story', {
            p_creator_name: effectiveCreatorName,
            p_creator_avatar: effectiveCreatorAvatar,
            p_slides: slides,
            p_is_org_wide: isOrgWide,
            p_is_saas_wide: isSaasWide,
            p_is_saas_admins_only: isSaasWide ? isSaasAdminsOnly : false,
            p_viewer_user_ids: isOrgWide ? [] : viewerUserIds,
            p_viewer_role_ids: isOrgWide ? [] : viewerRoleIds,
            p_mention_user_ids: mergedMentionUserIds,
            p_expires_at: expiresAt,
          }));
        }
        if (error) throw error;
        storyId = String(data);
      }

      // ارسال اعلان منشن به صندوق پیام‌های سیستم برای کاربران جدید منشن‌شده
      if (mergedMentionUserIds.length > 0 && storyId) {
        try {
          await sendStoryMentionSystemNotifications({
            orgId,
            storyId,
            creatorId: currentUserId,
            creatorName: effectiveCreatorName,
            isSaasWide,
            mentionUserIds: mergedMentionUserIds,
            previousMentionUserIds: isEdit ? initialMentionIdsRef.current : [],
          });
        } catch (notifyErr) {
          console.warn('Story mention system notification failed:', notifyErr);
        }
      }

      // ارسال پیامک اطلاع‌رسانی در صورت فعال بودن
      if (notifySms && smsText.trim() && smsRecipientIds.length > 0 && onNotifySms) {
        onNotifySms(storyId, smsText.trim(), smsRecipientIds);
      }

      invalidateOrgStoriesCache(orgId);
      message.success(isEdit ? 'تغییرات استوری ذخیره شد.' : 'استوری با موفقیت منتشر شد.');
      onSaved();
      onClose();
    } catch (error) {
      message.error(toFaErrorMessage(error as any, 'ذخیره استوری ناموفق بود.'));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const setQuickExpirationHours = (hours: number | null) => {
    if (hours === null) {
      setExpiresAt(null);
      return;
    }
    setExpiresAt(new Date(Date.now() + hours * 60 * 60 * 1000).toISOString());
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      destroyOnHidden
      zIndex={1401}
      width={1020}
      title={
        <div className="flex items-center justify-between gap-3 pl-6" dir="rtl">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[rgba(var(--brand-500-rgb,55_48_163),0.12)] text-[rgb(var(--brand-500-rgb,55_48_163))]">
              <PictureOutlined />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-5">
                {isEdit ? 'ویرایش استوری' : 'استودیو ساخت استوری'}
              </div>
              <div className="text-[11px] font-normal text-slate-500 dark:text-slate-400 truncate">
                اسلاید، متن، استیکر، ویدیو و صدا را با کشیدن روی بوم بچینید
              </div>
            </div>
          </div>
          {activeSlide && (
            <span className="hidden sm:inline-flex items-center rounded-full border border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300">
              اسلاید {toPersianNumber(activeSlideIdx + 1)} از {toPersianNumber(slides.length)}
            </span>
          )}
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2" dir="rtl">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {mergedMentionUserIds.length > 0
              ? `${toPersianNumber(mergedMentionUserIds.length)} کاربر منشن‌شده در پیام‌های سیستم مطلع می‌شوند`
              : 'می‌توانید چند اسلاید تصویر، ویدیو یا گرادینت منتشر کنید'}
          </div>
          <Space>
            <Button onClick={onClose}>انصراف</Button>
            <Button type="primary" loading={saving} onClick={() => void handleSave()}>
              {isEdit ? 'ذخیره تغییرات' : 'انتشار استوری'}
            </Button>
          </Space>
        </div>
      }
      styles={{
        body: { padding: 0 },
      }}
    >
      <div
        className="grid grid-cols-1 lg:grid-cols-12 border-t border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface"
        dir="rtl"
      >
        {/* ─── ستون راست: بوم تعاملی ۹:۱۶ + نوار اسلایدها ─── */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 p-4 border-b lg:border-b-0 lg:border-l border-slate-200 dark:border-dark-border bg-gradient-to-br from-[#f8fafc] via-[#ffffff] to-[#eef2ff] dark:from-[#14171c] dark:via-[#181b21] dark:to-[#111318]">
          {/* نوار دسترسی سریع روی بوم */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <Space size={6} wrap>
              <Button
                size="small"
                type="primary"
                ghost
                icon={<FontSizeOutlined />}
                onClick={addTextLayer}
                className="!rounded-lg"
              >
                متن جدید
              </Button>
              <StoryMediaUploadTrigger
                orgId={orgId}
                acceptKind="visual"
                buttonLabel="عکس / ویدیو"
                buttonIcon={<PictureOutlined />}
                buttonSize="small"
                popupContainer={popupContainer}
                popoverZIndex={OVERLAY_Z_BASE}
                onMediaSelected={handleReplaceActiveSlideBackground}
              />
            </Space>
            <Button
              size="small"
              icon={<SmileOutlined />}
              onClick={() => setActiveTab('stickers')}
              className="!rounded-lg"
            >
              استیکرها
            </Button>
          </div>

          {/* بوم ۹:۱۶ */}
          <StoryCanvasEditor
            slide={activeSlide}
            creatorName={currentUserName}
            creatorAvatar={currentUserAvatar}
            isSaasWide={isSaasWide}
            selectedElement={selectedElement}
            onSelectElement={(next) => {
              setSelectedElement(next);
              if (!next) setEditingStickerId(null);
            }}
            onUpdateTextLayer={updateTextLayer}
            onRemoveTextLayer={removeTextLayer}
            onUpdateSticker={updateSticker}
            onRemoveSticker={removeSticker}
            onRequestEditElement={handleRequestEditElement}
          />

          {/* نوار اسلایدها */}
          <div className="rounded-xl border border-slate-200/90 dark:border-dark-border bg-white/90 dark:bg-dark-surface/90 p-2.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                اسلایدهای استوری ({toPersianNumber(slides.length)})
              </span>
              <Space size={4}>
                <Tooltip title="انتقال به قبل">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowRightOutlined />}
                    disabled={activeSlideIdx <= 0}
                    onClick={() => moveSlide(activeSlideIdx, -1)}
                  />
                </Tooltip>
                <Tooltip title="انتقال به بعد">
                  <Button
                    size="small"
                    type="text"
                    icon={<ArrowLeftOutlined />}
                    disabled={activeSlideIdx >= slides.length - 1}
                    onClick={() => moveSlide(activeSlideIdx, 1)}
                  />
                </Tooltip>
              </Space>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {slides.map((slide, idx) => {
                const isActive = idx === activeSlideIdx;
                const thumbStyle: React.CSSProperties =
                  slide.type === 'image' && slide.image_url
                    ? buildImageBackgroundStyle(slide.image_url, 'thumb')
                    : slide.type === 'video'
                      ? { background: '#0f172a' }
                      : { background: getGradientPreset(slide.gradient_key).gradient };
                return (
                  <div
                    key={slide.id}
                    onClick={() => {
                      setActiveSlideIdx(idx);
                      setSelectedElement(null);
                    }}
                    className={`relative w-12 h-20 rounded-lg shrink-0 cursor-pointer overflow-hidden transition-all ${
                      isActive
                        ? 'ring-2 ring-[rgb(var(--brand-500-rgb,55_48_163))] ring-offset-1 scale-[1.03]'
                        : 'border border-slate-200 dark:border-dark-border opacity-85 hover:opacity-100'
                    }`}
                    style={thumbStyle}
                  >
                    {slide.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 text-white text-sm">
                        <VideoCameraOutlined />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-slate-950/65 px-1 text-[9px] text-white">
                      {toPersianNumber(idx + 1)}
                    </span>
                    {slides.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSlide(idx);
                        }}
                        className="absolute top-1 right-1 h-4 w-4 rounded-full bg-slate-950/65 text-white text-[10px] flex items-center justify-center hover:bg-rose-600 border-0 cursor-pointer"
                        title="حذف اسلاید"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}

              {/* افزودن اسلاید جدید */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Tooltip title="افزودن اسلاید گرادینت">
                  <button
                    type="button"
                    onClick={() => addGradientSlide()}
                    className="w-12 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-dark-border hover:border-[rgb(var(--brand-500-rgb,55_48_163))] bg-slate-50/70 dark:bg-white/5 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 cursor-pointer transition-colors"
                  >
                    <PlusOutlined className="text-sm" />
                    <span className="text-[9px] font-medium">رنگ</span>
                  </button>
                </Tooltip>
                <StoryMediaUploadTrigger
                  orgId={orgId}
                  acceptKind="visual"
                  buttonLabel="رسانه"
                  popupContainer={popupContainer}
                  popoverZIndex={OVERLAY_Z_BASE}
                  onMediaSelected={handleAddVisualSlide}
                >
                  <button
                    type="button"
                    className="w-12 h-20 rounded-lg border-2 border-dashed border-slate-300 dark:border-dark-border hover:border-[rgb(var(--brand-500-rgb,55_48_163))] bg-slate-50/70 dark:bg-white/5 flex flex-col items-center justify-center gap-1 text-slate-500 dark:text-slate-300 cursor-pointer transition-colors"
                    title="افزودن اسلاید تصویر یا ویدیو"
                  >
                    <VideoCameraOutlined className="text-sm" />
                    <span className="text-[9px] font-medium">عکس/ویدیو</span>
                  </button>
                </StoryMediaUploadTrigger>
              </div>
            </div>
          </div>
        </div>

        {/* ─── ستون چپ: پنل ابزارها در ۳ تب ─── */}
        <div className="lg:col-span-7 flex flex-col min-h-[540px] max-h-[78vh]">
          <div className="px-4 pt-3 pb-2.5 border-b border-slate-200 dark:border-dark-border bg-slate-50/70 dark:bg-white/[0.02]">
            <Segmented
              block
              value={activeTab}
              onChange={(val) => setActiveTab(val as StudioTabKey)}
              options={[
                {
                  value: 'design',
                  label: (
                    <span className="inline-flex items-center gap-1.5 py-0.5 font-medium">
                      <FontSizeOutlined />
                      طراحی و متن
                    </span>
                  ),
                },
                {
                  value: 'stickers',
                  label: (
                    <span className="inline-flex items-center gap-1.5 py-0.5 font-medium">
                      <SmileOutlined />
                      استیکرها و صدا
                    </span>
                  ),
                },
                {
                  value: 'settings',
                  label: (
                    <span className="inline-flex items-center gap-1.5 py-0.5 font-medium">
                      <SettingOutlined />
                      انتشار و تنظیمات
                    </span>
                  ),
                },
              ]}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* ═════════════════ تب ۱: طراحی و متن ═════════════════ */}
            {activeTab === 'design' && activeSlide && (
              <>
                {/* بخش پس‌زمینه اسلاید */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02]">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">پس‌زمینه و نوع اسلاید</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        تصویر، ویدیو یا طیف رنگی پس‌زمینه را انتخاب کنید
                      </div>
                    </div>
                    <Space size={6} wrap>
                      <StoryMediaUploadTrigger
                        orgId={orgId}
                        acceptKind="image"
                        buttonLabel="تصویر"
                        buttonIcon={<PictureOutlined />}
                        popupContainer={popupContainer}
                        popoverZIndex={OVERLAY_Z_BASE}
                        onMediaSelected={handleReplaceActiveSlideBackground}
                      />
                      <StoryMediaUploadTrigger
                        orgId={orgId}
                        acceptKind="video"
                        buttonLabel="ویدیو"
                        buttonIcon={<VideoCameraOutlined />}
                        popupContainer={popupContainer}
                        popoverZIndex={OVERLAY_Z_BASE}
                        onMediaSelected={handleReplaceActiveSlideBackground}
                      />
                    </Space>
                  </div>

                  {/* رنگ‌های گرادینت */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {STORY_GRADIENT_PRESET_LIST.map((g) => {
                      const active = activeSlide.type === 'gradient' && activeSlide.gradient_key === g.key;
                      return (
                        <Tooltip key={g.key} title={g.label}>
                          <button
                            type="button"
                            onClick={() =>
                              updateActiveSlide((s) => ({
                                ...s,
                                type: 'gradient',
                                gradient_key: g.key,
                                image_url: undefined,
                                video_url: undefined,
                                video_muted: undefined,
                                file_id: undefined,
                              }))
                            }
                            className={`h-8 w-8 rounded-lg cursor-pointer transition-transform ${
                              active
                                ? 'ring-2 ring-[rgb(var(--brand-500-rgb,55_48_163))] ring-offset-2 scale-105'
                                : 'border border-slate-200 dark:border-dark-border hover:scale-105'
                            }`}
                            style={{ background: g.gradient }}
                          />
                        </Tooltip>
                      );
                    })}
                  </div>

                  {/* تنظیمات مدت نمایش و صدای ویدیو */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2.5 border-t border-slate-100 dark:border-dark-border">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 mb-1">
                        <span>مدت نمایش اسلاید</span>
                        <span className="font-bold">
                          {toPersianNumber(Math.round((activeSlide.duration_ms || DEFAULT_SLIDE_DURATION_MS) / 1000))} ثانیه
                        </span>
                      </div>
                      <Slider
                        min={3}
                        max={60}
                        step={1}
                        value={Math.round((activeSlide.duration_ms || DEFAULT_SLIDE_DURATION_MS) / 1000)}
                        onChange={(sec) => updateActiveSlide((s) => ({ ...s, duration_ms: sec * 1000 }))}
                      />
                    </div>

                    {activeSlide.type === 'video' ? (
                      <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 border border-slate-200/70 dark:border-dark-border">
                        <div className="flex items-center gap-2">
                          {activeSlide.video_muted ? (
                            <AudioMutedOutlined className="text-rose-500" />
                          ) : (
                            <SoundOutlined className="text-emerald-600" />
                          )}
                          <div>
                            <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                              بی‌صدا کردن ویدیو
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              صدای اصلی ویدیو پخش نشود
                            </div>
                          </div>
                        </div>
                        <Switch
                          size="small"
                          checked={Boolean(activeSlide.video_muted)}
                          onChange={(checked) => updateActiveSlide((s) => ({ ...s, video_muted: checked }))}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center text-[11px] text-slate-500 dark:text-slate-400">
                        فایل تصویری فقط به صورت اسلاید عکس نمایش داده می‌شود.
                      </div>
                    )}
                  </div>
                </div>

                {/* بخش لایه‌های متن */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">متن و تایپوگرافی (فونت پیدا)</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        برای ویرایش، متن را روی بوم انتخاب یا دو بار کلیک کنید
                      </div>
                    </div>
                    <Button size="small" type="primary" icon={<PlusOutlined />} onClick={addTextLayer}>
                      افزودن متن
                    </Button>
                  </div>

                  {/* چیپ‌های انتخاب سریع لایه */}
                  {activeSlide.text_layers.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {activeSlide.text_layers.map((layer, index) => {
                        const isSel = selectedTextLayer?.id === layer.id;
                        return (
                          <button
                            key={layer.id}
                            type="button"
                            onClick={() => setSelectedElement({ kind: 'text', id: layer.id })}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium cursor-pointer border transition-colors ${
                              isSel
                                ? 'border-[rgb(var(--brand-500-rgb,55_48_163))] bg-[rgba(var(--brand-500-rgb,55_48_163),0.1)] text-[rgb(var(--brand-500-rgb,55_48_163))]'
                                : 'border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[140px]">
                              {layer.content?.trim() || `متن ${toPersianNumber(index + 1)}`}
                            </span>
                            <DeleteOutlined
                              className="text-rose-500 hover:text-rose-600 text-[10px]"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeTextLayer(layer.id);
                                if (isSel) setSelectedElement(null);
                              }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {selectedTextLayer ? (
                    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-dark-border">
                      <Input.TextArea
                        value={selectedTextLayer.content}
                        onChange={(e) => updateTextLayer(selectedTextLayer.id, { content: e.target.value })}
                        placeholder="متن خود را بنویسید..."
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        style={{ direction: 'rtl' }}
                      />

                      {/* استایل کادر متن */}
                      <div>
                        <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                          مدل نمایش متن
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                          {STORY_TEXT_STYLE_OPTIONS.map((opt) => {
                            const active = (selectedTextLayer.style_variant || 'clean') === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                onClick={() => updateTextLayer(selectedTextLayer.id, { style_variant: opt.key })}
                                className={`flex flex-col items-center gap-1 rounded-lg p-1.5 border cursor-pointer transition-all ${
                                  active
                                    ? 'border-[rgb(var(--brand-500-rgb,55_48_163))] bg-[rgba(var(--brand-500-rgb,55_48_163),0.08)]'
                                    : 'border-slate-200 dark:border-dark-border bg-slate-50/70 dark:bg-white/5 hover:border-slate-300'
                                }`}
                              >
                                <span
                                  className="w-full py-1 rounded text-[11px] font-bold text-center"
                                  style={{
                                    background: opt.previewBg,
                                    color: opt.previewText,
                                    border: opt.previewBorder || '1px solid transparent',
                                  }}
                                >
                                  آ
                                </span>
                                <span className="text-[10px] text-slate-700 dark:text-slate-300 truncate max-w-full">
                                  {opt.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* ضخامت، تراز و اندازه فونت */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">ضخامت فونت</div>
                          <Select
                            size="small"
                            value={selectedTextLayer.font_weight ?? (selectedTextLayer.bold ? 700 : 400)}
                            onChange={(val) =>
                              updateTextLayer(selectedTextLayer.id, {
                                font_weight: val,
                                bold: val >= 700,
                              })
                            }
                            style={{ width: '100%' }}
                            getPopupContainer={popupContainer}
                            options={STORY_FONT_WEIGHT_OPTIONS}
                          />
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">تراز متن</div>
                          <Segmented
                            size="small"
                            block
                            value={selectedTextLayer.align}
                            onChange={(val) =>
                              updateTextLayer(selectedTextLayer.id, { align: val as StoryTextLayer['align'] })
                            }
                            options={[
                              { value: 'right', icon: <AlignRightOutlined /> },
                              { value: 'center', icon: <AlignCenterOutlined /> },
                              { value: 'left', icon: <AlignLeftOutlined /> },
                            ]}
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span>اندازه</span>
                            <span className="font-semibold text-slate-700 dark:text-slate-200">
                              {toPersianNumber(selectedTextLayer.font_size)}
                            </span>
                          </div>
                          <Slider
                            min={12}
                            max={64}
                            value={selectedTextLayer.font_size}
                            onChange={(val) => updateTextLayer(selectedTextLayer.id, { font_size: val })}
                          />
                        </div>
                      </div>

                      {/* رنگ متن و رنگ کادر */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1">رنگ متن:</span>
                          {STORY_TEXT_COLORS.map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => updateTextLayer(selectedTextLayer.id, { color: col })}
                              className={`h-5 w-5 rounded-full cursor-pointer transition-transform ${
                                selectedTextLayer.color?.toUpperCase() === col
                                  ? 'ring-2 ring-[rgb(var(--brand-500-rgb,55_48_163))] ring-offset-1 scale-110'
                                  : 'border border-slate-300 dark:border-slate-600'
                              }`}
                              style={{ backgroundColor: col }}
                            />
                          ))}
                          <input
                            type="color"
                            value={selectedTextLayer.color || '#FFFFFF'}
                            onChange={(e) => updateTextLayer(selectedTextLayer.id, { color: e.target.value })}
                            className="h-6 w-6 rounded cursor-pointer border-0 bg-transparent p-0"
                            title="رنگ دلخواه متن"
                          />
                        </div>

                        {(selectedTextLayer.style_variant === 'pill_dark' || selectedTextLayer.style_variant === 'outline') && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">رنگ کادر:</span>
                            <input
                              type="color"
                              value={selectedTextLayer.bg_color || '#0F172A'}
                              onChange={(e) => updateTextLayer(selectedTextLayer.id, { bg_color: e.target.value })}
                              className="h-6 w-7 rounded cursor-pointer border-0 bg-transparent p-0"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-3 text-center text-xs text-slate-500 dark:text-slate-400">
                      {activeSlide.text_layers.length === 0
                        ? 'هنوز متنی روی این اسلاید قرار نگرفته است. دکمه «افزودن متن» را بزنید.'
                        : 'یکی از متن‌های بالا یا روی بوم را انتخاب کنید تا تنظیماتش نمایش داده شود.'}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ═════════════════ تب ۲: استیکرها و صدا ═════════════════ */}
            {activeTab === 'stickers' && activeSlide && (
              <>
                {/* انتخابگر دسته استیکر */}
                <Segmented
                  block
                  size="small"
                  value={stickerSection}
                  onChange={(val) => {
                    setStickerSection(val as StickerToolSection);
                    setEditingStickerId(null);
                  }}
                  options={[
                    { value: 'badge', label: 'برچسب و ایموجی', icon: <TagOutlined /> },
                    { value: 'mention', label: 'منشن کاربر', icon: <UserAddOutlined /> },
                    { value: 'link', label: 'لینک تعاملی', icon: <LinkOutlined /> },
                    { value: 'audio', label: 'استیکر صدا', icon: <CustomerServiceOutlined /> },
                  ]}
                />

                {/* استیکرهای فعال روی اسلاید */}
                {(activeSlide.stickers || []).length > 0 && (
                  <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3 bg-slate-50/70 dark:bg-white/[0.02]">
                    <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-2">
                      استیکرهای این اسلاید ({toPersianNumber(activeSlide.stickers?.length || 0)})
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeSlide.stickers || []).map((st) => {
                        const isSel = selectedSticker?.id === st.id;
                        const chipLabel =
                          st.type === 'emoji'
                            ? `${st.emoji || '✨'} ایموجی`
                            : st.type === 'mention'
                              ? `@${st.user_name || 'کاربر'}`
                              : st.type === 'link'
                                ? `🔗 ${st.label || 'لینک'}`
                                : st.type === 'audio'
                                  ? `🎵 ${st.audio_name || 'صدا'}`
                                  : st.type === 'datetime'
                                    ? `📅 ${st.text || 'تاریخ'}`
                                    : `${st.icon || '🏷️'} ${st.text || 'برچسب'}`;
                        return (
                          <span
                            key={st.id}
                            onClick={() => setSelectedElement({ kind: 'sticker', id: st.id })}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] cursor-pointer border ${
                              isSel
                                ? 'border-[rgb(var(--brand-500-rgb,55_48_163))] bg-[rgba(var(--brand-500-rgb,55_48_163),0.1)] text-[rgb(var(--brand-500-rgb,55_48_163))] font-semibold'
                                : 'border-slate-200 dark:border-dark-border bg-white dark:bg-dark-surface text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <span className="truncate max-w-[150px]">{chipLabel}</span>
                            {st.type !== 'emoji' && st.type !== 'datetime' && (
                              <EditOutlined
                                className="text-[10px] hover:text-sky-500"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedElement({ kind: 'sticker', id: st.id });
                                  handleRequestEditElement({ kind: 'sticker', id: st.id });
                                }}
                              />
                            )}
                            <DeleteOutlined
                              className="text-[10px] text-rose-500 hover:text-rose-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeSticker(st.id);
                                if (isSel) setSelectedElement(null);
                              }}
                            />
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* بخش برچسب‌ها، تاریخ و ایموجی */}
                {stickerSection === 'badge' && (
                  <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          برچسب‌های آماده و ساعت شمسی
                        </span>
                        <Button
                          size="small"
                          icon={<CalendarOutlined />}
                          onClick={handleAddDatetimeSticker}
                        >
                          افزودن تاریخ و ساعت امروز
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {STORY_BADGE_STICKERS.map((item) => (
                          <button
                            key={item.text}
                            type="button"
                            onClick={() =>
                              addSticker({
                                type: 'badge',
                                x: 50,
                                y: 34,
                                scale: 1,
                                variant: item.variant,
                                text: item.text,
                                icon: item.icon,
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-dark-border bg-slate-50 hover:bg-slate-100 dark:bg-white/5 dark:hover:bg-white/10 px-3 py-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100 cursor-pointer transition-colors"
                          >
                            <span>{item.icon}</span>
                            <span>{item.text}</span>
                          </button>
                        ))}
                      </div>

                      <Divider className="!my-2" />

                      <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        {editingStickerId && selectedSticker?.type === 'badge'
                          ? 'ویرایش برچسب سفارشی'
                          : 'ساخت برچسب سفارشی'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                        <div className="sm:col-span-2">
                          <Input
                            size="small"
                            value={badgeIcon}
                            onChange={(e) => setBadgeIcon(e.target.value)}
                            placeholder="📢"
                            className="!text-center"
                            maxLength={4}
                          />
                        </div>
                        <div className="sm:col-span-6">
                          <Input
                            size="small"
                            value={badgeText}
                            onChange={(e) => setBadgeText(e.target.value)}
                            placeholder="مثلاً: تخفیف پایان فصل"
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <Select
                            size="small"
                            value={badgeVariant}
                            onChange={(v) => setBadgeVariant(v)}
                            style={{ width: '100%' }}
                            getPopupContainer={popupContainer}
                            options={STICKER_VARIANT_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
                          />
                        </div>
                      </div>
                      <Button
                        size="small"
                        type="primary"
                        onClick={() => {
                          if (!badgeText.trim()) {
                            message.warning('متن برچسب را وارد کنید.');
                            return;
                          }
                          if (editingStickerId && selectedSticker?.type === 'badge') {
                            updateSticker(editingStickerId, {
                              text: badgeText.trim(),
                              icon: badgeIcon.trim() || undefined,
                              variant: badgeVariant,
                            });
                            setEditingStickerId(null);
                          } else {
                            addSticker({
                              type: 'badge',
                              x: 50,
                              y: 38,
                              scale: 1,
                              variant: badgeVariant,
                              text: badgeText.trim(),
                              icon: badgeIcon.trim() || undefined,
                            });
                          }
                          setBadgeText('');
                        }}
                      >
                        {editingStickerId && selectedSticker?.type === 'badge'
                          ? 'ذخیره تغییرات برچسب'
                          : 'افزودن برچسب به بوم'}
                      </Button>
                    </div>

                    {/* ایموجی‌های ثابت و جذاب */}
                    <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02]">
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100 mb-2">ایموجی‌ها</div>
                      <div className="grid grid-cols-8 sm:grid-cols-12 gap-1.5">
                        {STORY_EMOJI_STICKERS.map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() =>
                              addSticker({
                                type: 'emoji',
                                x: 50,
                                y: 45,
                                scale: 1,
                                emoji,
                              })
                            }
                            className="h-9 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-dark-border hover:bg-slate-50 dark:hover:bg-white/10 text-xl flex items-center justify-center cursor-pointer transition-transform hover:scale-110"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* بخش استیکر منشن کاربر */}
                {stickerSection === 'mention' && (
                  <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        استیکر منشن کاربر (@)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        کاربر انتخاب‌شده هم روی استوری نمایش داده می‌شود و هم در «پیام‌های سیستم» اعلان دریافت می‌کند.
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">انتخاب همکار</div>
                      <AdaptiveIdentityPicker
                        scopes={['user']}
                        valueMode="raw"
                        value={mentionDraftUserId}
                        onChange={(val, opts) => {
                          const nextId = Array.isArray(val) ? val[0] : val;
                          setMentionDraftUserId(nextId || undefined);
                          setMentionDraftOption(opts?.[0] || null);
                        }}
                        placeholder="نام کاربر را جستجو و انتخاب کنید..."
                        getPopupContainer={popupContainer as any}
                        modalContainer={popupContainer}
                        preferLocalPopupContainer
                        overlayZIndexBase={OVERLAY_Z_BASE}
                      />
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">طرح استیکر</div>
                      <div className="flex flex-wrap gap-1.5">
                        {STICKER_VARIANT_OPTIONS.map((v) => (
                          <button
                            key={v.value}
                            type="button"
                            onClick={() => setMentionDraftVariant(v.value)}
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] border cursor-pointer ${
                              mentionDraftVariant === v.value
                                ? 'border-[rgb(var(--brand-500-rgb,55_48_163))] bg-[rgba(var(--brand-500-rgb,55_48_163),0.1)] font-semibold'
                                : 'border-slate-200 dark:border-dark-border bg-slate-50 dark:bg-white/5'
                            }`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full border border-black/15" style={{ background: v.dotColor }} />
                            <span>{v.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <Button
                      type="primary"
                      icon={<UserAddOutlined />}
                      onClick={() => void handleApplyMentionSticker()}
                    >
                      {editingStickerId && selectedSticker?.type === 'mention'
                        ? 'بروزرسانی استیکر منشن'
                        : 'افزودن استیکر منشن به استوری'}
                    </Button>
                  </div>
                )}

                {/* بخش استیکر لینک */}
                {stickerSection === 'link' && (
                  <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        استیکر لینک (داخلی یا وب)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        کاربر با لمس این استیکر به ماژول/رکورد داخل نرم‌افزار یا یک نشانی وب هدایت می‌شود.
                      </div>
                    </div>

                    <Segmented
                      size="small"
                      value={linkMode}
                      onChange={(val) => setLinkMode(val as 'external' | 'internal')}
                      options={[
                        { value: 'internal', label: 'مسیر داخلی نرم‌افزار' },
                        { value: 'external', label: 'لینک خارجی (وب)' },
                      ]}
                    />

                    {linkMode === 'internal' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">صفحه / ماژول</div>
                          <Select
                            showSearch
                            optionFilterProp="label"
                            value={linkInternalModuleId}
                            onChange={(val) => {
                              setLinkInternalModuleId(val);
                              setLinkInternalRecordId(undefined);
                            }}
                            placeholder="انتخاب ماژول (مثلاً مشتریان، فاکتورها...)"
                            style={{ width: '100%' }}
                            getPopupContainer={popupContainer}
                            options={availableInternalModules}
                          />
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">رکورد خاص (اختیاری)</div>
                          <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            loading={linkModuleRecordsLoading}
                            disabled={!linkInternalModuleId}
                            value={linkInternalRecordId}
                            onChange={(val) => setLinkInternalRecordId(val)}
                            placeholder="کل لیست ماژول یا انتخاب یک رکورد"
                            style={{ width: '100%' }}
                            getPopupContainer={popupContainer}
                            options={linkModuleRecords}
                          />
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">نشانی وب</div>
                        <Input
                          value={linkExternalUrl}
                          onChange={(e) => setLinkExternalUrl(e.target.value)}
                          placeholder="https://example.com"
                          style={{ direction: 'ltr' }}
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">متن روی استیکر (اختیاری)</div>
                        <Input
                          value={linkCustomLabel}
                          onChange={(e) => setLinkCustomLabel(e.target.value)}
                          placeholder="مثلاً: مشاهده جزییات"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">رنگ و سبک استیکر</div>
                        <Select
                          value={linkVariant}
                          onChange={(v) => setLinkVariant(v)}
                          style={{ width: '100%' }}
                          getPopupContainer={popupContainer}
                          options={STICKER_VARIANT_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
                        />
                      </div>
                    </div>

                    <Button type="primary" icon={<LinkOutlined />} onClick={handleApplyLinkSticker}>
                      {editingStickerId && selectedSticker?.type === 'link'
                        ? 'بروزرسانی استیکر لینک'
                        : 'افزودن استیکر لینک به استوری'}
                    </Button>

                    {/* پشتیبانی از لینک قدیمی اسلاید در صورت وجود */}
                    {activeSlide.link_url && (
                      <div className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-600/30 px-3 py-2 text-xs">
                        <span className="truncate text-amber-800 dark:text-amber-200">
                          لینک ثابت قبلی اسلاید: {activeSlide.link_label || activeSlide.link_url}
                        </span>
                        <Button
                          size="small"
                          type="text"
                          danger
                          onClick={() =>
                            updateActiveSlide((s) => ({
                              ...s,
                              link_url: undefined,
                              link_type: undefined,
                              link_label: undefined,
                            }))
                          }
                        >
                          حذف
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* بخش استیکر صدا */}
                {stickerSection === 'audio' && (
                  <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        استیکر صدا (موزیک یا پیام صوتی)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        از دستگاه آپلود کنید، از فایل‌های نرم‌افزار انتخاب کنید یا همین‌جا صدا ضبط کنید.
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <StoryMediaUploadTrigger
                        orgId={orgId}
                        acceptKind="audio"
                        buttonLabel="انتخاب / آپلود فایل صوتی"
                        buttonIcon={<CustomerServiceOutlined />}
                        buttonSize="middle"
                        popupContainer={popupContainer}
                        popoverZIndex={OVERLAY_Z_BASE}
                        onMediaSelected={handleAudioMediaPicked}
                      />
                      <StoryAudioRecorderInline
                        orgId={orgId}
                        onRecorded={handleAudioMediaPicked}
                      />
                    </div>

                    {pendingAudioMedia && (
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/40 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2 space-y-2">
                        <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-200">
                          <span className="font-semibold truncate">فایل آماده: {pendingAudioMedia.name}</span>
                          {pendingAudioMedia.durationSec ? (
                            <span className="font-mono text-[11px]">
                              {toPersianNumber(Math.round(pendingAudioMedia.durationSec))} ثانیه
                            </span>
                          ) : null}
                        </div>
                        <audio controls src={pendingAudioMedia.url} className="w-full h-8" />
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">عنوان روی کارت صدا</div>
                        <Input
                          value={audioTitle}
                          onChange={(e) => setAudioTitle(e.target.value)}
                          placeholder="مثلاً: پیام صوتی مدیرعامل"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">ظاهر کارت</div>
                        <Select
                          value={audioVariant}
                          onChange={(v) => setAudioVariant(v)}
                          style={{ width: '100%' }}
                          getPopupContainer={popupContainer}
                          options={STICKER_VARIANT_OPTIONS.map((v) => ({ value: v.value, label: v.label }))}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2 border border-slate-200/70 dark:border-dark-border">
                      <div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                          پخش خودکار هنگام باز شدن استوری
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {audioAutoPlay
                            ? 'با باز شدن اسلاید، صدا خودکار پخش می‌شود (قابل مکث/بی‌صدا برای بیننده)'
                            : 'صدا فقط با لمس استیکر توسط بیننده پخش می‌شود'}
                        </div>
                      </div>
                      <Switch checked={audioAutoPlay} onChange={setAudioAutoPlay} />
                    </div>

                    <Button
                      type="primary"
                      icon={<CustomerServiceOutlined />}
                      disabled={!pendingAudioMedia?.url}
                      onClick={() => handleApplyAudioSticker()}
                    >
                      {editingStickerId && selectedSticker?.type === 'audio'
                        ? 'بروزرسانی استیکر صدا'
                        : 'افزودن استیکر صدا به استوری'}
                    </Button>
                  </div>
                )}
              </>
            )}

            {/* ═════════════════ تب ۳: انتشار و تنظیمات ═════════════════ */}
            {activeTab === 'settings' && (
              <div className="space-y-3.5">
                {/* مخاطبان استوری */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">مخاطبان استوری</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        تعیین کنید چه افرادی در سازمان این استوری را ببینند
                      </div>
                    </div>
                    <Switch
                      checked={isOrgWide}
                      onChange={setIsOrgWide}
                      checkedChildren="همه اعضا"
                      unCheckedChildren="محدود"
                    />
                  </div>

                  {!isOrgWide && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100 dark:border-dark-border">
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">کاربران مجاز</div>
                        <AdaptiveIdentityPicker
                          mode="multiple"
                          scopes={['user']}
                          valueMode="raw"
                          value={viewerUserIds}
                          onChange={(v) => setViewerUserIds((v as string[]) || [])}
                          placeholder="انتخاب کاربران"
                          getPopupContainer={popupContainer as any}
                          modalContainer={popupContainer}
                          preferLocalPopupContainer
                          overlayZIndexBase={OVERLAY_Z_BASE}
                        />
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">نقش‌های مجاز</div>
                        <AdaptiveIdentityPicker
                          mode="multiple"
                          scopes={['role']}
                          valueMode="raw"
                          value={viewerRoleIds}
                          onChange={(v) => setViewerRoleIds((v as string[]) || [])}
                          placeholder="انتخاب نقش‌ها"
                          getPopupContainer={popupContainer as any}
                          modalContainer={popupContainer}
                          preferLocalPopupContainer
                          overlayZIndexBase={OVERLAY_Z_BASE}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* زمان انقضا و مدیریت فایل‌های سرور */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">زمان انقضا و نگهداری فایل</div>
                    <Space size={4} wrap>
                      <Button size="small" onClick={() => setQuickExpirationHours(24)}>۲۴ ساعت</Button>
                      <Button size="small" onClick={() => setQuickExpirationHours(48)}>۴۸ ساعت</Button>
                      <Button size="small" onClick={() => setQuickExpirationHours(24 * 7)}>۷ روز</Button>
                      <Button size="small" onClick={() => setQuickExpirationHours(null)}>بدون انقضا</Button>
                    </Space>
                  </div>

                  <PersianDatePicker
                    type="DATETIME"
                    value={expiresAt || ''}
                    onChange={(v) => setExpiresAt(v || null)}
                    placeholder="بدون تاریخ انقضا"
                    modalContainer={popupContainer}
                    overlayZIndexBase={OVERLAY_Z_BASE}
                  />

                  <div className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-white/5 px-3 py-2.5 border border-slate-200/70 dark:border-dark-border">
                    <div className="pl-3">
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                        حذف فایل‌های آپلودی از سرور پس از پایان استوری
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">
                        فقط عکس، ویدیو و صدای آپلودشده مستقیماً برای همین استوری پس از انقضا پاک می‌شوند؛ فایل‌های انتخاب‌شده از فایل‌منیجر نرم‌افزار دست‌نخورده می‌مانند.
                      </div>
                    </div>
                    <Switch checked={deleteMediaOnExpire} onChange={setDeleteMediaOnExpire} />
                  </div>
                </div>

                {/* منشن و اطلاع‌رسانی پیام‌های سیستم */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-2.5">
                  <div>
                    <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      منشن و اعلان در پیام‌های سیستم
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      کاربران استیکرهای منشن به‌صورت خودکار شامل می‌شوند؛ در صورت نیاز افراد بیشتری را هم می‌توانید اینجا اضافه کنید.
                    </div>
                  </div>
                  <AdaptiveIdentityPicker
                    mode="multiple"
                    scopes={['user']}
                    valueMode="raw"
                    value={extraMentionUserIds}
                    onChange={(v) => setExtraMentionUserIds((v as string[]) || [])}
                    placeholder="@ انتخاب کاربران اضافه برای اطلاع‌رسانی"
                    getPopupContainer={popupContainer as any}
                    modalContainer={popupContainer}
                    preferLocalPopupContainer
                    overlayZIndexBase={OVERLAY_Z_BASE}
                  />
                </div>

                {/* تنظیمات استوری عمومی تازه‌سیستم */}
                {(canPublishSaasStory || canPublishSaasAdminStory) && (
                  <div className="rounded-xl border border-sky-200 dark:border-sky-800/50 p-3.5 bg-sky-50/50 dark:bg-sky-950/15 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                          انتشار عمومی از طرف «{SAAS_STORY_CREATOR_NAME}» برای همه سازمان‌ها
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          با نام «{SAAS_STORY_CREATOR_NAME}»، لوگوی رسمی اپ و کادر متمایز منتشر می‌شود.
                        </div>
                      </div>
                      <Switch
                        checked={isSaasWide}
                        onChange={(v) => {
                          setIsSaasWide(v);
                          if (!v) setIsSaasAdminsOnly(false);
                        }}
                      />
                    </div>
                    {isSaasWide && canPublishSaasAdminStory && (
                      <div className="flex items-center justify-between pt-2 border-t border-sky-200/70 dark:border-sky-800/40">
                        <span className="text-xs text-slate-700 dark:text-slate-200">
                          فقط برای صاحبان و مدیران سازمان‌ها
                        </span>
                        <Switch checked={isSaasAdminsOnly} onChange={setIsSaasAdminsOnly} />
                      </div>
                    )}
                  </div>
                )}

                {/* اطلاع‌رسانی پیامکی */}
                <div className="rounded-xl border border-slate-200 dark:border-dark-border p-3.5 bg-white dark:bg-white/[0.02] space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-800 dark:text-slate-100">اطلاع‌رسانی پیامکی</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        ارسال پیامک هم‌زمان با انتشار استوری
                      </div>
                    </div>
                    <Switch checked={notifySms} onChange={setNotifySms} />
                  </div>
                  {notifySms && (
                    <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-dark-border">
                      <Input.TextArea
                        value={smsText}
                        onChange={(e) => setSmsText(e.target.value)}
                        rows={2}
                        placeholder="متن پیامک اطلاع‌رسانی..."
                        style={{ direction: 'rtl' }}
                      />
                      <AdaptiveIdentityPicker
                        mode="multiple"
                        scopes={['user']}
                        valueMode="raw"
                        value={smsRecipientIds}
                        onChange={(v) => setSmsRecipientIds((v as string[]) || [])}
                        placeholder="انتخاب گیرندگان پیامک"
                        getPopupContainer={popupContainer as any}
                        modalContainer={popupContainer}
                        preferLocalPopupContainer
                        overlayZIndexBase={OVERLAY_Z_BASE}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default StoryEditorModal;
