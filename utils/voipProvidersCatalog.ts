export type FrontendVoipProviderKey =
  | 'telefonchy'
  | 'simotel'
  | 'novatel'
  | 'alovoip'
  | 'issabel'
  | 'daftareshoma'
  | 'kalamapp_cloud_pbx'
  | 'asiatech'
  | 'shatel'
  | 'pishgaman'
  | 'respina'
  | 'tci'
  | 'sip_trunk';

export type VoipProviderKey = FrontendVoipProviderKey;

export type FrontendVoipProviderInfo = {
  value: FrontendVoipProviderKey;
  label: string;
  categoryLabel: string;
  supportsSmartCall: boolean;
  supportsSipTrunk: boolean;
  supportsWebrtc: boolean;
  defaultBaseUrl: string;
  defaultPort: number;
  hintFa: string;
};

export const FRONTEND_VOIP_PROVIDERS: FrontendVoipProviderInfo[] = [
  {
    value: 'telefonchy',
    label: 'تلفنچی',
    categoryLabel: 'تلفن ابری',
    supportsSmartCall: true,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: 'https://panel.telefonchy.com',
    defaultPort: 5060,
    hintFa: 'امکان استفاده هم‌زمان از Smart Call، گزارش تماس‌های اخیر و اتصال داخلی‌ها به هسته WebRTC.',
  },
  {
    value: 'simotel',
    label: 'سیموتل (Simotel)',
    categoryLabel: 'مرکز تماس',
    supportsSmartCall: true,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'پشتیبانی از Smart API، وب‌هوک لحظه‌ای رویدادها و اتصال ترانک SIP به تلفن زنده داخل اپ.',
  },
  {
    value: 'novatel',
    label: 'نواتل (Novatel)',
    categoryLabel: 'مرکز تلفن ابری',
    supportsSmartCall: true,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'پشتیبانی از وب‌هوک تماس، Open API و اتصال حساب SIP به WebPhone.',
  },
  {
    value: 'alovoip',
    label: 'الوویپ (AloVoIP)',
    categoryLabel: 'مرکز تلفن ابری',
    supportsSmartCall: true,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'اتصال با وب‌هوک رویدادها و رجیستر حساب SIP برای مکالمه داخل اپ.',
  },
  {
    value: 'issabel',
    label: 'ایزابل / استریسک / FreePBX',
    categoryLabel: 'سرور اختصاصی',
    supportsSmartCall: true,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'سرور ویپ شرکت را با ترانک SIP متصل کنید و رویداد تماس‌ها را به وب‌هوک واحد بفرستید.',
  },
  {
    value: 'daftareshoma',
    label: 'دفترشما',
    categoryLabel: 'منشی مجازی',
    supportsSmartCall: false,
    supportsSipTrunk: false,
    supportsWebrtc: false,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'ثبت گزارش تماس و پاپ‌آپ مخاطب با وب‌هوک؛ در پلن‌های بدون SIP، مکالمه داخل مرورگر فعال نیست.',
  },
  {
    value: 'kalamapp_cloud_pbx',
    label: 'مرکز تلفن ابری تازه سیستم (WebRTC)',
    categoryLabel: 'هسته داخلی',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'تماس داخلی بین اپراتورها و تماس شهری روی ترانک‌های SIP متصل به سازمان.',
  },
  {
    value: 'asiatech',
    label: 'سیپ ترانک آسیاتک (آسیاتل)',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'خط ثابت ۹۱۰۱ / ۹۱۳۰ آسیاتک را مستقیماً به‌عنوان ترانک SIP به مرکز تلفن ابری متصل کنید.',
  },
  {
    value: 'shatel',
    label: 'سیپ ترانک شاتل (شاتل‌تاک)',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'خط ثابت ۹۱۰۰ / ۹۱۳۲ شاتل را مستقیم به هستهٔ WebRTC متصل کنید.',
  },
  {
    value: 'pishgaman',
    label: 'سیپ ترانک پیشگامان',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'خط ثابت ۹۱۰۹ پیشگامان را به‌صورت ترانک SIP تنظیم کنید.',
  },
  {
    value: 'respina',
    label: 'سیپ ترانک رسپینا (نکسفون)',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'ترانک سازمانی رسپینا/نکسفون را مستقیم روی هستهٔ Asterisk تعریف کنید.',
  },
  {
    value: 'tci',
    label: 'سیپ ترانک مخابرات ایران',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'اتصال خطوط ۴، ۵ یا ۸ رقمی مخابرات (در صورت دسترسی IP سرور).',
  },
  {
    value: 'sip_trunk',
    label: 'سایر ترانک‌های SIP استاندارد',
    categoryLabel: 'اپراتور خط ثابت',
    supportsSmartCall: false,
    supportsSipTrunk: true,
    supportsWebrtc: true,
    defaultBaseUrl: '',
    defaultPort: 5060,
    hintFa: 'هر خط یا مرکز تلفن سازگار با پروتکل SIP استاندارد.',
  },
];

export const getFrontendVoipProviderInfo = (provider: unknown): FrontendVoipProviderInfo =>
  FRONTEND_VOIP_PROVIDERS.find((item) => item.value === String(provider || '').trim().toLowerCase()) ||
  FRONTEND_VOIP_PROVIDERS[0];

export const VOIP_DIAL_MODE_OPTIONS = [
  { label: 'تلفن زنده داخل اپ (WebRTC)', value: 'webphone_webrtc' },
  { label: 'Smart Call / تماس سرور', value: 'telefonchy_smartcall' },
  { label: 'لینک SIP', value: 'sip_link' },
  { label: 'لینک تلفن', value: 'tel_link' },
] as const;
