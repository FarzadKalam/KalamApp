// تایپ‌های مشترک سیستم استوری

export interface StoryTextLayer {
  id: string;
  content: string;     // متن (می‌تواند @mention داشته باشد)
  x: number;           // موقعیت افقی (درصد از چپ، ۰ تا ۱۰۰)
  y: number;           // موقعیت عمودی (درصد از بالا، ۰ تا ۱۰۰)
  font_size: number;   // اندازه فونت (px)
  color: string;       // رنگ متن (hex)
  align: 'right' | 'center' | 'left';
  bold: boolean;
}

export type StorySlideType = 'image' | 'gradient';

export interface StorySlide {
  id: string;
  type: StorySlideType;
  image_url?: string;        // URL فایل آپلود‌شده
  file_id?: string;          // اگر از record_files پروژه انتخاب شده
  gradient_key?: string;     // کلید از STORY_GRADIENT_PRESETS
  text_layers: StoryTextLayer[];
  duration_ms: number;       // مدت نمایش (پیش‌فرض ۵۰۰۰ میلی‌ثانیه)
  link_url?: string;         // لینک اسلاید (اختیاری)
  link_type?: 'internal' | 'external'; // نوع لینک
  link_label?: string;       // برچسب دکمه لینک
}

export interface OrgStory {
  id: string;
  org_id: string;
  creator_id: string;
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

// دیتای فرم ویرایشگر
export interface StoryFormValues {
  slides: StorySlide[];
  is_org_wide: boolean;
  viewer_user_ids: string[];
  viewer_role_ids: string[];
  expires_at: string | null;    // ISO string یا null
  mention_user_ids: string[];
  mention_role_ids: string[];
  notify_sms: boolean;
  sms_text: string;
  sms_recipient_ids: string[];  // آی‌دی کاربرانی که باید پیامک دریافت کنند
}

export const DEFAULT_SLIDE_DURATION_MS = 5000;
export const DEFAULT_TEXT_LAYER: Omit<StoryTextLayer, 'id'> = {
  content: '',
  x: 50,
  y: 50,
  font_size: 20,
  color: '#FFFFFF',
  align: 'center',
  bold: false,
};
