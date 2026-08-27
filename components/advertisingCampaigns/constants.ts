import {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  CAMPAIGN_PLAN_FEATURES,
  CAMPAIGN_STATUS_OPTIONS,
  CAMPAIGN_TOOL_DEFINITIONS,
  CAMPAIGN_TOOL_STATUS_OPTIONS,
  getCampaignToolLabel,
} from '../../utils/advertisingCampaigns';
import type { CampaignToolType } from './types';

export {
  ADVERTISING_CAMPAIGNS_MODULE_ID,
  CAMPAIGN_PLAN_FEATURES,
  CAMPAIGN_STATUS_OPTIONS,
  CAMPAIGN_TOOL_STATUS_OPTIONS,
  getCampaignToolLabel,
};
export const CAMPAIGN_TOOL_TYPE_CATEGORY = 'advertising_campaign_tool_type';

export type CampaignToolOption = {
  value: CampaignToolType;
  label: string;
  group: 'automatic' | 'manual';
  featureKey?: string;
  releaseDisabled?: boolean;
  description: string;
};

export const CAMPAIGN_TOOL_OPTIONS: CampaignToolOption[] = [
  { value: 'sms', label: 'پیامک', group: 'automatic', featureKey: CAMPAIGN_PLAN_FEATURES.sms, description: 'ارسال گروهی و زمان‌بندی‌شده پیامک' },
  { value: 'email', label: 'ایمیل', group: 'automatic', featureKey: CAMPAIGN_PLAN_FEATURES.email, description: 'ارسال ایمیل قالب‌دار و قابل رصد' },
  { value: 'bot_group', label: 'گروه بات', group: 'automatic', featureKey: CAMPAIGN_PLAN_FEATURES.bot_group, description: 'ارسال به گروه‌های متصل سازمان' },
  { value: 'bot_private', label: 'پی‌وی بات', group: 'automatic', featureKey: CAMPAIGN_PLAN_FEATURES.bot_private, description: 'ارسال خصوصی به مخاطبان متصل' },
  { value: 'instagram_post', label: 'پست اینستاگرام', group: 'automatic', featureKey: CAMPAIGN_PLAN_FEATURES.instagram_post, description: 'برنامه‌ریزی محتوا و ثبت انتشار' },
  { value: 'voice_call', label: 'تماس تلفنی', group: 'manual', featureKey: CAMPAIGN_PLAN_FEATURES.voice_call, description: 'ثبت و پیگیری تماس‌های اجرایی کمپین' },
  { value: 'outdoor', label: 'تبلیغات محیطی', group: 'manual', description: 'بیلبورد، تابلو و رسانه‌های محیطی' },
  { value: 'instagram_ads', label: 'تبلیغ اینستاگرامی', group: 'manual', description: 'تبلیغ صفحه یا محتوای اینستاگرامی' },
  { value: 'click_ads', label: 'تبلیغات کلیکی', group: 'manual', description: 'کمپین‌های CPC، CPM و CPA' },
  { value: 'exhibition', label: 'نمایشگاه', group: 'manual', description: 'برنامه‌ریزی و ثبت نتیجه نمایشگاه' },
  { value: 'conference', label: 'همایش', group: 'manual', description: 'همایش، رویداد و نشست تخصصی' },
  { value: 'internet_ad', label: 'آگهی اینترنتی', group: 'manual', description: 'بنر و جایگاه در وب‌سایت‌ها' },
  { value: 'advertorial', label: 'رپرتاژ', group: 'manual', description: 'انتشار مقاله و رپرتاژ آگهی' },
  { value: 'influencer', label: 'اینفلوئنسر و تولیدکننده محتوا', group: 'manual', description: 'همکاری با صفحات و تولیدکنندگان محتوا' },
  { value: 'content_seo', label: 'بازاریابی محتوایی و سئو', group: 'manual', description: 'محتوا، ورودی ارگانیک و رتبه جست‌وجو' },
  { value: 'affiliate', label: 'همکاری در فروش و معرفی', group: 'manual', description: 'فروش منتسب به شریک یا معرف' },
  { value: 'sponsorship', label: 'اسپانسرینگ و همکاری تجاری', group: 'manual', description: 'تعهدات و نتیجه حمایت تجاری' },
];

export const CAMPAIGN_TARGET_MODULES = [
  { value: 'marketing_leads', label: 'لیدهای بازاریابی' },
  { value: 'customers', label: 'مشتریان' },
  { value: 'invoices', label: 'فاکتورهای فروش' },
] as const;

export const isAutomaticCampaignTool = (toolType: string) =>
  CAMPAIGN_TOOL_DEFINITIONS.some((option) => option.value === toolType && option.dispatchable === true);

export const usesCampaignAudience = (toolType: string) =>
  CAMPAIGN_TOOL_DEFINITIONS.some((option) => option.value === toolType && option.automatedAudience === true);
