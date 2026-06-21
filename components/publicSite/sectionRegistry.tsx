import React from 'react';
import type { SectionType } from './types';
import { HeroSection, LogosSection, StatsSection, FeaturesSection } from './sections/sectionsA';
import {
  ProcessSection, AutomationSection, CommunicationsSection, IntegrationsSection, AiSection,
} from './sections/sectionsB';
import {
  CalendarSection, ScreenshotsSection, ComparisonSection, TestimonialsSection, FaqSection, CtaSection,
  FeatureSliderSection,
} from './sections/sectionsC';
import { HeroTreeSection, HrSection, AccountingSection, ProcessShowcaseSection } from './sections/sectionsD';
import PricingSection from './shared/PricingSection';

// ──────────────────────────────────────────────────
// شِمای فیلدهای ویرایش (برای ادیتور ادمین)
// ──────────────────────────────────────────────────
export type EditorField =
  | { key: string; label: string; type: 'text' | 'textarea' | 'image' | 'url' | 'media' }
  | { key: string; label: string; type: 'tone' }
  | { key: string; label: string; type: 'cta' }
  | { key: string; label: string; type: 'icon' }
  | { key: string; label: string; type: 'string-list'; itemLabel?: string }
  | { key: string; label: string; type: 'item-list'; itemLabel?: string; fields: EditorField[] }
  | { key: string; label: string; type: 'comparison' };

export interface SectionDef {
  type: SectionType;
  labelFa: string;
  description: string;
  Component: React.FC<{ props: any }>;
  editor: EditorField[];
}

const baseHeadingFields: EditorField[] = [
  { key: 'eyebrow', label: 'برچسب بالا', type: 'text' },
  { key: 'title', label: 'عنوان', type: 'text' },
  { key: 'text', label: 'توضیح', type: 'textarea' },
];

const iconItemFields: EditorField[] = [
  { key: 'icon', label: 'آیکن', type: 'icon' },
  { key: 'title', label: 'عنوان', type: 'text' },
  { key: 'text', label: 'توضیح', type: 'textarea' },
];

export const SECTION_REGISTRY: Record<SectionType, SectionDef> = {
  hero_tree: {
    type: 'hero_tree',
    labelFa: 'هیرو درختی (اسکرول‌محور)',
    description: 'هیرو با گراف/درختی که با اسکرول شاخه‌هایش رشد می‌کند.',
    Component: HeroTreeSection,
    editor: [
      { key: 'eyebrow', label: 'برچسب بالا', type: 'text' },
      { key: 'titleBefore', label: 'عنوان — قبل از واژه رنگی', type: 'text' },
      { key: 'highlight', label: 'واژه رنگی', type: 'text' },
      { key: 'titleAfter', label: 'عنوان — بعد از واژه رنگی', type: 'textarea' },
      { key: 'subtitle', label: 'زیرعنوان', type: 'textarea' },
      { key: 'hubLabel', label: 'متن هستهٔ مرکزی', type: 'text' },
      { key: 'caption', label: 'زیرنویس پایانی', type: 'text' },
      { key: 'primaryCta', label: 'دکمه اصلی', type: 'cta' },
      { key: 'secondaryCta', label: 'دکمه دوم', type: 'cta' },
      { key: 'nodes', label: 'شاخه‌ها (انتهای هر شاخه)', type: 'item-list', itemLabel: 'شاخه', fields: [
        { key: 'icon', label: 'آیکن', type: 'icon' },
        { key: 'title', label: 'عنوان', type: 'text' },
      ] },
    ],
  },
  hero: {
    type: 'hero',
    labelFa: 'هیرو / اسلایدر کلاسیک',
    description: 'بخش بالای صفحه با عنوان، توضیح، دکمه‌ها و ماک‌آپ/تصویر محصول.',
    Component: HeroSection,
    editor: [
      { key: 'eyebrow', label: 'برچسب بالا', type: 'text' },
      { key: 'title', label: 'عنوان اصلی', type: 'text' },
      { key: 'subtitle', label: 'زیرعنوان', type: 'textarea' },
      { key: 'primaryCta', label: 'دکمه اصلی', type: 'cta' },
      { key: 'secondaryCta', label: 'دکمه دوم', type: 'cta' },
      { key: 'badges', label: 'نشان‌ها (زیر دکمه)', type: 'string-list', itemLabel: 'نشان' },
      { key: 'imageUrl', label: 'تصویر محصول (اختیاری — جای ماک‌آپ)', type: 'image' },
    ],
  },
  logos: {
    type: 'logos',
    labelFa: 'نوار لوگوها / اعتماد',
    description: 'نمایش لوگوی مشتریان یا نشان‌های اعتماد.',
    Component: LogosSection,
    editor: [
      { key: 'title', label: 'عنوان', type: 'text' },
      { key: 'items', label: 'لوگوها', type: 'item-list', itemLabel: 'لوگو', fields: [
        { key: 'label', label: 'متن', type: 'text' },
        { key: 'imageUrl', label: 'تصویر لوگو', type: 'image' },
      ] },
    ],
  },
  stats: {
    type: 'stats',
    labelFa: 'کارت‌های آماری',
    description: 'اعداد کلیدی با انیمیشن شمارنده.',
    Component: StatsSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'items', label: 'آمارها', type: 'item-list', itemLabel: 'آمار', fields: [
        { key: 'value', label: 'عدد', type: 'text' },
        { key: 'suffix', label: 'پسوند (مثل +)', type: 'text' },
        { key: 'label', label: 'برچسب', type: 'text' },
      ] },
    ],
  },
  features: {
    type: 'features',
    labelFa: 'ویژگی‌های کلیدی (Bento)',
    description: 'شبکه کارت‌های ویژگی با آیکن.',
    Component: FeaturesSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'items', label: 'ویژگی‌ها', type: 'item-list', itemLabel: 'ویژگی', fields: iconItemFields },
    ],
  },
  feature_slider: {
    type: 'feature_slider',
    labelFa: 'اسلایدر ویژگی (با مدیا)',
    description: 'اسلایدری که هر اسلاید آن تصویر/گیف/ویدیوی اختصاصی دارد.',
    Component: FeatureSliderSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'slides', label: 'اسلایدها', type: 'item-list', itemLabel: 'اسلاید', fields: [
        { key: 'media', label: 'تصویر / گیف / ویدیو', type: 'media' },
        { key: 'title', label: 'عنوان', type: 'text' },
        { key: 'text', label: 'توضیح', type: 'textarea' },
        { key: 'bullets', label: 'نکات', type: 'string-list', itemLabel: 'نکته' },
      ] },
    ],
  },
  process: {
    type: 'process',
    labelFa: 'دیاگرام فرآیند',
    description: 'مراحل فرآیند به‌صورت دیاگرام مرحله‌ای.',
    Component: ProcessSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'steps', label: 'مراحل', type: 'item-list', itemLabel: 'مرحله', fields: [
        { key: 'title', label: 'عنوان مرحله', type: 'text' },
        { key: 'text', label: 'توضیح', type: 'textarea' },
      ] },
    ],
  },
  process_showcase: {
    type: 'process_showcase',
    labelFa: 'فرآیندها (الگو → اجرا)',
    description: 'نمایش تبدیل الگوی فرآیند به اجرای واقعی با وضعیت و آواتار.',
    Component: ProcessShowcaseSection,
    editor: [
      ...baseHeadingFields,
      { key: 'templateStages', label: 'مراحل الگو', type: 'string-list', itemLabel: 'مرحله' },
      { key: 'run', label: 'اجرای فرآیند', type: 'item-list', itemLabel: 'مرحله اجرا', fields: [
        { key: 'title', label: 'نام مرحله', type: 'text' },
        { key: 'status', label: 'وضعیت (done / active / pending / blocked)', type: 'text' },
        { key: 'assignee', label: 'مسئول', type: 'text' },
      ] },
    ],
  },
  automation: {
    type: 'automation',
    labelFa: 'اتومات‌سازی (قبل/بعد)',
    description: 'مقایسه وضعیت بدون و با اتومات‌سازی.',
    Component: AutomationSection,
    editor: [
      ...baseHeadingFields,
      { key: 'beforeLabel', label: 'برچسب ستون قبل', type: 'text' },
      { key: 'before', label: 'موارد «قبل»', type: 'string-list', itemLabel: 'مورد' },
      { key: 'afterLabel', label: 'برچسب ستون بعد', type: 'text' },
      { key: 'after', label: 'موارد «بعد»', type: 'string-list', itemLabel: 'مورد' },
    ],
  },
  communications: {
    type: 'communications',
    labelFa: 'ارتباطات خارجی',
    description: 'کانال‌های ارتباطی: بات‌ها، پیامک، ایمیل، VoIP.',
    Component: CommunicationsSection,
    editor: [
      ...baseHeadingFields,
      { key: 'channels', label: 'کانال‌ها', type: 'item-list', itemLabel: 'کانال', fields: iconItemFields },
    ],
  },
  integrations: {
    type: 'integrations',
    labelFa: 'اتصالات',
    description: 'وردپرس، حسابداری، مؤدیان، API و Webhook.',
    Component: IntegrationsSection,
    editor: [
      ...baseHeadingFields,
      { key: 'items', label: 'اتصالات', type: 'item-list', itemLabel: 'اتصال', fields: iconItemFields },
    ],
  },
  ai: {
    type: 'ai',
    labelFa: 'هوش مصنوعی',
    description: 'بلاک ویژه هوش مصنوعی با عملگرهای مختلف.',
    Component: AiSection,
    editor: [
      ...baseHeadingFields,
      { key: 'cta', label: 'دکمه', type: 'cta' },
      { key: 'capabilities', label: 'عملگرها', type: 'item-list', itemLabel: 'عملگر', fields: iconItemFields },
    ],
  },
  hr: {
    type: 'hr',
    labelFa: 'منابع انسانی',
    description: 'ویجت امکانات منابع انسانی.',
    Component: HrSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'items', label: 'امکانات', type: 'item-list', itemLabel: 'مورد', fields: iconItemFields },
    ],
  },
  accounting: {
    type: 'accounting',
    labelFa: 'حسابداری',
    description: 'ویجت حسابداری با نمای درختی حساب‌ها.',
    Component: AccountingSection,
    editor: [
      ...baseHeadingFields,
      { key: 'items', label: 'امکانات', type: 'item-list', itemLabel: 'مورد', fields: iconItemFields },
    ],
  },
  calendar: {
    type: 'calendar',
    labelFa: 'نمای تقویم',
    description: 'نمایش تقویم با رویدادها.',
    Component: CalendarSection,
    editor: [
      ...baseHeadingFields,
      { key: 'monthLabel', label: 'عنوان ماه', type: 'text' },
      { key: 'highlights', label: 'نکات کنار تقویم', type: 'string-list', itemLabel: 'نکته' },
      { key: 'events', label: 'رویدادها', type: 'item-list', itemLabel: 'رویداد', fields: [
        { key: 'day', label: 'روز (۱ تا ۳۰)', type: 'text' },
        { key: 'title', label: 'عنوان', type: 'text' },
      ] },
    ],
  },
  screenshots: {
    type: 'screenshots',
    labelFa: 'گالری اسکرین‌شات',
    description: 'اسلایدر تصاویر محیط نرم‌افزار.',
    Component: ScreenshotsSection,
    editor: [
      ...baseHeadingFields,
      { key: 'tone', label: 'تم پس‌زمینه', type: 'tone' },
      { key: 'images', label: 'تصاویر', type: 'item-list', itemLabel: 'تصویر', fields: [
        { key: 'url', label: 'تصویر', type: 'image' },
        { key: 'caption', label: 'کپشن', type: 'text' },
      ] },
    ],
  },
  comparison: {
    type: 'comparison',
    labelFa: 'جدول مقایسه',
    description: 'مقایسه ویژگی‌ها با نرم‌افزارهای دیگر.',
    Component: ComparisonSection,
    editor: [
      ...baseHeadingFields,
      { key: 'columns', label: 'ستون‌ها (ستون اول= ما)', type: 'string-list', itemLabel: 'ستون' },
      { key: 'rows', label: 'ردیف‌های مقایسه', type: 'comparison' },
    ],
  },
  testimonials: {
    type: 'testimonials',
    labelFa: 'نظر مشتریان',
    description: 'بازخورد مشتریان.',
    Component: TestimonialsSection,
    editor: [
      ...baseHeadingFields,
      { key: 'items', label: 'نظرات', type: 'item-list', itemLabel: 'نظر', fields: [
        { key: 'text', label: 'متن نظر', type: 'textarea' },
        { key: 'name', label: 'نام', type: 'text' },
        { key: 'role', label: 'سمت', type: 'text' },
        { key: 'avatarUrl', label: 'تصویر', type: 'image' },
      ] },
    ],
  },
  pricing: {
    type: 'pricing',
    labelFa: 'تعرفه‌ها',
    description: 'پلن‌های اشتراک از تنظیمات پلن‌ها.',
    Component: ({ props }) => <PricingSection eyebrow={props.eyebrow} title={props.title} text={props.text} />,
    editor: baseHeadingFields,
  },
  faq: {
    type: 'faq',
    labelFa: 'سوالات پرتکرار',
    description: 'پرسش و پاسخ.',
    Component: FaqSection,
    editor: [
      ...baseHeadingFields,
      { key: 'items', label: 'سوالات', type: 'item-list', itemLabel: 'سوال', fields: [
        { key: 'q', label: 'پرسش', type: 'text' },
        { key: 'a', label: 'پاسخ', type: 'textarea' },
      ] },
    ],
  },
  cta: {
    type: 'cta',
    labelFa: 'فراخوان نهایی + فرم دمو',
    description: 'بخش پایانی با فرم درخواست دمو.',
    Component: CtaSection,
    editor: [
      { key: 'eyebrow', label: 'برچسب بالا', type: 'text' },
      { key: 'title', label: 'عنوان', type: 'text' },
      { key: 'text', label: 'توضیح', type: 'textarea' },
    ],
  },
};

export const SECTION_TYPES = Object.keys(SECTION_REGISTRY) as SectionType[];
