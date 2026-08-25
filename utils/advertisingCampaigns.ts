export const ADVERTISING_CAMPAIGNS_MODULE_ID = 'advertising_campaigns';
export const ADVERTISING_CAMPAIGN_TOOLS_MODULE_ID = 'advertising_campaign_tools';
export const ADVERTISING_CAMPAIGN_RESPONSES_MODULE_ID = 'advertising_campaign_responses';
export const ADVERTISING_CAMPAIGN_SOURCE_VALUE = 'advertising_campaign';

export const CAMPAIGN_PLAN_FEATURES = {
  sms: 'campaign_sms',
  email: 'campaign_email',
  bot_group: 'campaign_bot_group',
  bot_private: 'campaign_bot_private',
  instagram_post: 'campaign_instagram_post',
  voice_call: 'campaign_voice_call',
} as const;

export type CampaignPlanFeature = typeof CAMPAIGN_PLAN_FEATURES[keyof typeof CAMPAIGN_PLAN_FEATURES];

export type CampaignToolType =
  | 'sms'
  | 'email'
  | 'bot_group'
  | 'bot_private'
  | 'instagram_post'
  | 'voice_call'
  | 'outdoor'
  | 'instagram_ads'
  | 'click_ads'
  | 'exhibition'
  | 'conference'
  | 'internet_ad'
  | 'advertorial'
  | 'influencer'
  | 'content_seo'
  | 'affiliate'
  | 'sponsorship';

export type CampaignToolDefinition = {
  value: CampaignToolType;
  label: string;
  planFeature?: CampaignPlanFeature;
  automatedAudience?: boolean;
  dispatchable?: boolean;
  releaseAvailable?: boolean;
};

export const CAMPAIGN_TOOL_DEFINITIONS: CampaignToolDefinition[] = [
  { value: 'sms', label: 'پیامک', planFeature: CAMPAIGN_PLAN_FEATURES.sms, automatedAudience: true, dispatchable: true },
  { value: 'email', label: 'ایمیل', planFeature: CAMPAIGN_PLAN_FEATURES.email, automatedAudience: true, dispatchable: true },
  { value: 'bot_group', label: 'گروه بات', planFeature: CAMPAIGN_PLAN_FEATURES.bot_group, dispatchable: true },
  { value: 'bot_private', label: 'پی‌وی بات', planFeature: CAMPAIGN_PLAN_FEATURES.bot_private, automatedAudience: true, dispatchable: true },
  { value: 'instagram_post', label: 'پست اینستاگرام', planFeature: CAMPAIGN_PLAN_FEATURES.instagram_post, dispatchable: false },
  { value: 'voice_call', label: 'تماس صوتی', planFeature: CAMPAIGN_PLAN_FEATURES.voice_call, dispatchable: false, releaseAvailable: false },
  { value: 'outdoor', label: 'تبلیغات محیطی' },
  { value: 'instagram_ads', label: 'تبلیغ اینستاگرامی' },
  { value: 'click_ads', label: 'تبلیغات کلیکی' },
  { value: 'exhibition', label: 'نمایشگاه' },
  { value: 'conference', label: 'همایش' },
  { value: 'internet_ad', label: 'آگهی اینترنتی' },
  { value: 'advertorial', label: 'رپرتاژ' },
  { value: 'influencer', label: 'اینفلوئنسر / تولیدکننده محتوا' },
  { value: 'content_seo', label: 'بازاریابی محتوایی و سئو' },
  { value: 'affiliate', label: 'همکاری در فروش / معرفی' },
  { value: 'sponsorship', label: 'اسپانسرینگ / همکاری تجاری' },
];

export type CampaignStatus = 'draft' | 'planned' | 'active' | 'paused' | 'completed' | 'canceled';
export type CampaignToolStatus = 'draft' | 'ready' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed' | 'canceled';
export type CampaignDispatchStatus = 'draft' | 'queued' | 'processing' | 'paused' | 'succeeded' | 'partial' | 'failed' | 'canceled';
export type CampaignAccessMode = 'full' | 'tool_limited';

export const CAMPAIGN_STATUS_OPTIONS = [
  { label: 'پیش‌نویس', value: 'draft', color: 'default' },
  { label: 'برنامه‌ریزی‌شده', value: 'planned', color: 'blue' },
  { label: 'در حال اجرا', value: 'active', color: 'orange' },
  { label: 'متوقف', value: 'paused', color: 'red' },
  { label: 'تکمیل‌شده', value: 'completed', color: 'green' },
  { label: 'لغوشده', value: 'canceled', color: 'default' },
] as const;

export const CAMPAIGN_TOOL_STATUS_OPTIONS = [
  { label: 'پیش‌نویس', value: 'draft', color: 'default' },
  { label: 'آماده', value: 'ready', color: 'blue' },
  { label: 'زمان‌بندی‌شده', value: 'scheduled', color: 'cyan' },
  { label: 'در حال اجرا', value: 'running', color: 'orange' },
  { label: 'متوقف', value: 'paused', color: 'red' },
  { label: 'تکمیل‌شده', value: 'completed', color: 'green' },
  { label: 'ناموفق', value: 'failed', color: 'red' },
  { label: 'لغوشده', value: 'canceled', color: 'default' },
] as const;

export const getCampaignToolDefinition = (value: unknown) => {
  const normalized = String(value || '').trim();
  return CAMPAIGN_TOOL_DEFINITIONS.find((item) => item.value === normalized) || null;
};

export const getCampaignToolLabel = (value: unknown) =>
  getCampaignToolDefinition(value)?.label || String(value || '').trim() || 'ابزار سفارشی';
