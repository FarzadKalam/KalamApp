import { TAZE_SYSTEM_BRAND_ASSETS } from '../../utils/tazeSystemBrandAssets';

// تایپ‌های مشترک سیستم استوری

export const SAAS_STORY_CREATOR_NAME = 'تازه سیستم';
export const SAAS_STORY_AVATAR_URL = TAZE_SYSTEM_BRAND_ASSETS.logo;

export const STORY_CANVAS_REFERENCE_WIDTH = 340;
export const STORY_MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const STORY_MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB
export const STORY_MAX_AUDIO_BYTES = 20 * 1024 * 1024; // 20 MB
export const STORY_DEFAULT_VIDEO_DURATION_MS = 15_000;
export const STORY_MAX_SLIDE_DURATION_MS = 60_000;
export const STORY_MIN_SLIDE_DURATION_MS = 3_000;

export type StoryTextStyleVariant =
  | 'clean'
  | 'pill_dark'
  | 'pill_light'
  | 'pill_brand'
  | 'frost'
  | 'outline'
  | 'neon';

export type StoryTextFontWeight = 400 | 600 | 700 | 900;

export interface StoryTextLayer {
  id: string;
  content: string;     // متن
  x: number;           // موقعیت افقی (درصد از چپ، ۰ تا ۱۰۰)
  y: number;           // موقعیت عمودی (درصد از بالا، ۰ تا ۱۰۰)
  font_size: number;   // اندازه فونت پایه روی بوم مرجع (px)
  color: string;       // رنگ متن (hex)
  align: 'right' | 'center' | 'left';
  bold: boolean;
  font_weight?: StoryTextFontWeight;
  style_variant?: StoryTextStyleVariant;
  bg_color?: string;
  width_pct?: number;  // عرض کادر متن به درصد (۲۴ تا ۹۲)
}

export type StoryStickerType =
  | 'emoji'
  | 'badge'
  | 'datetime'
  | 'mention'
  | 'link'
  | 'audio';

export type StoryStickerVariant =
  | 'frost'
  | 'light'
  | 'dark'
  | 'brand'
  | 'amber'
  | 'emerald'
  | 'rose';

export interface StoryStickerLayer {
  id: string;
  type: StoryStickerType;
  x: number;
  y: number;
  scale?: number; // مقیاس ۰.۵ تا ۲.۴
  variant?: StoryStickerVariant;

  // ایموجی ساده
  emoji?: string;

  // برچسب آماده یا تاریخ/ساعت
  text?: string;
  icon?: string;
  date_iso?: string;

  // استیکر منشن
  user_id?: string;
  user_name?: string;
  user_avatar?: string | null;

  // استیکر لینک
  url?: string;
  link_type?: 'internal' | 'external';
  label?: string;
  module_id?: string | null;
  record_id?: string | null;

  // استیکر صدا
  audio_url?: string;
  audio_name?: string;
  file_id?: string | null;
  duration_sec?: number | null;
  auto_play?: boolean;
  media_cleaned?: boolean;
}

export type StorySlideType = 'image' | 'video' | 'gradient';

export interface StorySlide {
  id: string;
  type: StorySlideType;
  image_url?: string;          // URL فایل تصویری
  video_url?: string;          // URL فایل ویدیویی (فقط برای ویدیوی واقعی)
  video_muted?: boolean;       // بی‌صدا کردن صدای اصلی ویدیو
  video_duration_ms?: number;  // مدت واقعی ویدیو (ms)
  file_id?: string;            // اگر از فایل‌های نرم‌افزار انتخاب شده باشد (هرگز با انقضا پاک نمی‌شود)
  gradient_key?: string;       // کلید از STORY_GRADIENT_PRESETS
  text_layers: StoryTextLayer[];
  stickers?: StoryStickerLayer[];
  duration_ms: number;         // مدت نمایش (پیش‌فرض ۵۰۰۰ میلی‌ثانیه)
  link_url?: string;           // لینک اسلاید قدیمی (پشتیبانی سازگار)
  link_type?: 'internal' | 'external';
  link_label?: string;
  media_cleaned?: boolean;
}

export interface OrgStory {
  id: string;
  org_id: string;
  creator_id: string | null;
  creator_name: string | null;
  creator_avatar: string | null;
  slides: StorySlide[];
  is_org_wide: boolean;
  is_saas_wide: boolean;
  is_saas_admins_only: boolean;
  viewer_user_ids: string[];
  viewer_role_ids: string[];
  mention_user_ids: string[];
  mention_role_ids: string[];
  published_at: string;
  expires_at: string | null;
  is_pinned: boolean;
  is_active: boolean;
  view_count: number;
  delete_media_on_expire?: boolean;
  media_cleaned_at?: string | null;
  settings?: Record<string, any> | null;
  created_at: string;
  updated_at: string;
}

export interface OrgStoryView {
  id: string;
  org_id: string;
  story_id: string;
  user_id: string;
  viewed_at: string;
}

export interface OrgStoryReaction {
  id: string;
  org_id: string;
  story_id: string;
  user_id: string;
  user_name: string | null;
  emoji: string;
  created_at: string;
}

// استوری با اطلاعات تکمیلی برای UI
export interface OrgStoryWithMeta extends OrgStory {
  isViewedByMe: boolean;
  myReaction: OrgStoryReaction | null;
  reactions: OrgStoryReaction[];
  viewerCount: number;
}

export type StoryEditorMode = 'create' | 'edit';

export interface StoryFormValues {
  slides: StorySlide[];
  is_org_wide: boolean;
  viewer_user_ids: string[];
  viewer_role_ids: string[];
  expires_at: string | null;
  mention_user_ids: string[];
  mention_role_ids: string[];
  notify_sms: boolean;
  sms_text: string;
  sms_recipient_ids: string[];
  delete_media_on_expire?: boolean;
}

export const DEFAULT_SLIDE_DURATION_MS = 5000;
export const DEFAULT_TEXT_LAYER: Omit<StoryTextLayer, 'id'> = {
  content: 'متن خود را بنویسید',
  x: 50,
  y: 48,
  font_size: 24,
  color: '#FFFFFF',
  align: 'center',
  bold: true,
  font_weight: 700,
  style_variant: 'clean',
  bg_color: '#0F172A',
  width_pct: 74,
};
