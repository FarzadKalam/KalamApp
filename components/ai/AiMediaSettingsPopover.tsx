import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Grid, Input, InputNumber, Popover, Select, Slider, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';
import { supabase } from '../../supabaseClient';

export type AiMediaSourceImage = {
  data: string;
  mimeType: string;
  filename?: string;
  previewUrl: string;
};

export type AiMediaSettings = {
  // image
  size?: string;
  quality?: string;
  n?: number;
  persianText?: boolean;
  persianDigits?: boolean;
  rtlText?: boolean;
  orientationHorizontal?: boolean;
  orientationVertical?: boolean;
  useOrganizationContext?: boolean;
  useConversationHistory?: boolean;
  imageOutputFormat?: string;
  // voice
  voice?: string;
  speed?: number;
  responseFormat?: string;
  language?: string;
  voiceStyle?: string;
  musicMode?: 'off' | 'instrumental' | 'song';
  lyrics?: string;
  referenceVoiceData?: string;
  referenceVoiceMimeType?: string;
  referenceVoiceFilename?: string;
  referenceVoicePreviewUrl?: string;
  // video
  seconds?: number;
  videoQuality?: 'standard' | 'high';
  videoStyle?: string;
  videoMotion?: string;
  videoCamera?: string;
  // document
  format?: string;
};

type AiMediaSettingsPopoverProps = {
  capability: 'image_generation' | 'voice_output' | 'video_generation' | 'document_generation';
  settings: AiMediaSettings;
  onSettingsChange: (next: AiMediaSettings) => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
  /** The selected media model. When omitted, the organization's default is used. */
  modelId?: string | null;
};

const FALLBACK_VOICE_OPTIONS = [
  { value: 'alloy', label: 'Alloy' },
  { value: 'ash', label: 'Ash' },
  { value: 'ballad', label: 'Ballad' },
  { value: 'coral', label: 'Coral' },
  { value: 'echo', label: 'Echo' },
  { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx' },
  { value: 'nova', label: 'Nova' },
  { value: 'sage', label: 'Sage' },
  { value: 'shimmer', label: 'Shimmer' },
  { value: 'verse', label: 'Verse' },
];

const IMAGE_SIZE_OPTIONS = [
  { value: 'auto', label: 'خودکار' },
  { value: '1024x1024', label: 'مربع (۱۰۲۴×۱۰۲۴)' },
  { value: '1024x1536', label: 'عمودی (۱۰۲۴×۱۵۳۶)' },
  { value: '1088x1920', label: 'عمودی تمام‌صفحه (۱۰۸۸×۱۹۲۰)' },
  { value: '1536x1024', label: 'افقی (۱۵۳۶×۱۰۲۴)' },
  { value: '1920x1088', label: 'افقی تمام‌صفحه (۱۹۲۰×۱۰۸۸)' },
];

const VIDEO_SIZE_OPTIONS = [
  { value: '1280x720', label: 'افقی HD (۱۲۸۰×۷۲۰)' },
  { value: '1920x1080', label: 'افقی تمام‌صفحه (۱۹۲۰×۱۰۸۰)' },
  { value: '720x1280', label: 'عمودی HD (۷۲۰×۱۲۸۰)' },
  { value: '1080x1920', label: 'عمودی تمام‌صفحه (۱۰۸۰×۱۹۲۰)' },
  { value: '1024x1024', label: 'مربع (۱۰۲۴×۱۰۲۴)' },
];

const IMAGE_QUALITY_OPTIONS = [
  { value: 'auto', label: 'خودکار' },
  { value: 'high', label: 'بالا' },
  { value: 'medium', label: 'متوسط' },
  { value: 'low', label: 'اقتصادی' },
];

const IMAGE_OUTPUT_FORMAT_OPTIONS = [
  { value: 'png', label: 'PNG' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WEBP' },
];

const AUDIO_FORMAT_OPTIONS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
];

const VOICE_LANGUAGE_OPTIONS = [
  { value: 'fa-IR', label: 'فارسی' },
  { value: 'en-US', label: 'انگلیسی' },
  { value: 'ar', label: 'عربی' },
  { value: 'tr', label: 'ترکی' },
  { value: 'auto', label: 'تشخیص خودکار' },
];

const VOICE_STYLE_OPTIONS = [
  { value: 'neutral', label: 'معمولی' },
  { value: 'formal', label: 'رسمی' },
  { value: 'warm', label: 'گرم و صمیمی' },
  { value: 'energetic', label: 'پر انرژی' },
  { value: 'calm', label: 'آرام' },
];

const MUSIC_MODE_OPTIONS = [
  { value: 'off', label: 'فقط گفتار' },
  { value: 'instrumental', label: 'موسیقی خام' },
  { value: 'song', label: 'موسیقی با ترانه' },
];

const AiMediaSettingsPopover: React.FC<AiMediaSettingsPopoverProps> = ({
  capability,
  settings,
  onSettingsChange,
  disabled = false,
  size,
  modelId,
}) => {
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  const [defaultVoiceModelId, setDefaultVoiceModelId] = useState<string | null>(null);
  const [voiceOptionsByModel, setVoiceOptionsByModel] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [voiceOptionsLoaded, setVoiceOptionsLoaded] = useState(false);
  const isMobile = !screens.md;

  useEffect(() => {
    if (capability !== 'voice_output') return;
    let mounted = true;
    void (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('ai-assistant', { body: { action: 'get_compose_models' } });
        if (error || !mounted) return;
        const info = data?.capabilities?.voice_output;
        setDefaultVoiceModelId(String(info?.model || '').trim() || null);
        if (info?.voiceOptionsByModel && typeof info.voiceOptionsByModel === 'object') {
          setVoiceOptionsByModel(info.voiceOptionsByModel);
        }
      } catch {
        // Without a catalog response we do not display another provider's voices.
      } finally {
        if (mounted) setVoiceOptionsLoaded(true);
      }
    })();
    return () => { mounted = false; };
  }, [capability]);

  const activeVoiceModelId = String(modelId || defaultVoiceModelId || '').trim();
  const voiceOptions = voiceOptionsByModel[activeVoiceModelId]?.length
    ? voiceOptionsByModel[activeVoiceModelId]
    : activeVoiceModelId
      ? []
      : FALLBACK_VOICE_OPTIONS;
  const selectedVoice = voiceOptions.some((option) => option.value === settings.voice)
    ? settings.voice
    : voiceOptions[0]?.value || 'alloy';

  useEffect(() => () => {
    scheduleOverlayLockRelease(0);
  }, []);

  const update = (patch: AiMediaSettings) => onSettingsChange({ ...settings, ...patch });

  const updateImageOrientation = (orientation: 'horizontal' | 'vertical', checked: boolean) => {
    if (orientation === 'horizontal') {
      update({
        orientationHorizontal: checked,
        orientationVertical: checked ? false : settings.orientationVertical,
        size: checked ? '1920x1088' : settings.orientationVertical ? '1088x1920' : settings.size,
      });
      return;
    }
    update({
      orientationVertical: checked,
      orientationHorizontal: checked ? false : settings.orientationHorizontal,
      size: checked ? '1088x1920' : settings.orientationHorizontal ? '1920x1088' : settings.size,
    });
  };

  const content = useMemo(() => (
    <div className="w-full max-w-[min(88vw,20rem)] space-y-3 overflow-y-auto px-0.5 pb-1 md:w-72 md:max-w-none" dir="rtl">
      <div className="rounded-lg border border-gray-100 p-2 dark:border-white/10">
        <Checkbox
          checked={settings.useConversationHistory === true}
          onChange={(event) => update({ useConversationHistory: event.target.checked })}
        >
          استفاده از تاریخچه گفتگوی فعلی
        </Checkbox>
      </div>
      {capability === 'image_generation' ? (
        <>
          <div className="rounded-lg border border-gray-100 p-2 dark:border-white/10">
            <Checkbox
              checked={settings.useOrganizationContext === true}
              onChange={(event) => update({ useOrganizationContext: event.target.checked })}
            >
              استفاده از اطلاعات سازمان
            </Checkbox>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">ابعاد تصویر</div>
            <Select
              size="small"
              className="w-full"
              value={settings.size || '1024x1024'}
              options={IMAGE_SIZE_OPTIONS}
              onChange={(value) => update({ size: String(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">کیفیت</div>
            <Select
              size="small"
              className="w-full"
              value={settings.quality || 'auto'}
              options={IMAGE_QUALITY_OPTIONS}
              onChange={(value) => update({ quality: String(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">فرمت خروجی</div>
            <Select
              size="small"
              className="w-full"
              value={settings.imageOutputFormat || 'png'}
              options={IMAGE_OUTPUT_FORMAT_OPTIONS}
              onChange={(value) => update({ imageOutputFormat: String(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">تعداد خروجی</div>
            <Select
              size="small"
              className="w-full"
              value={settings.n || 1}
              options={[1, 2, 3, 4].map((n) => ({ value: n, label: n.toLocaleString('fa-IR') }))}
              onChange={(value) => update({ n: Number(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">راهنمای نوشته و جهت</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300">
              <Checkbox checked={settings.persianText === true} onChange={(event) => update({ persianText: event.target.checked })}>
                متن فارسی
              </Checkbox>
              <Checkbox checked={settings.persianDigits === true} onChange={(event) => update({ persianDigits: event.target.checked })}>
                اعداد فارسی
              </Checkbox>
              <Checkbox checked={settings.rtlText === true} onChange={(event) => update({ rtlText: event.target.checked })}>
                نوشته‌ها راست‌چین
              </Checkbox>
              <Checkbox checked={settings.orientationHorizontal === true} onChange={(event) => updateImageOrientation('horizontal', event.target.checked)}>
                افقی
              </Checkbox>
              <Checkbox checked={settings.orientationVertical === true} onChange={(event) => updateImageOrientation('vertical', event.target.checked)}>
                عمودی
              </Checkbox>
            </div>
          </div>
        </>
      ) : null}

      {capability === 'voice_output' ? (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2 text-[10px] leading-5 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            گزینه‌های پیشرفته فقط برای مدل‌هایی اعمال می‌شوند که همان ویژگی را پشتیبانی می‌کنند.
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">صدا</div>
            <Select
              size="small"
              className="w-full"
              value={selectedVoice}
              options={voiceOptions}
              loading={Boolean(activeVoiceModelId) && !voiceOptionsLoaded}
              disabled={disabled || (Boolean(activeVoiceModelId) && voiceOptions.length === 0)}
              notFoundContent={voiceOptionsLoaded ? 'گوینده سازگار برای این مدل ثبت نشده است' : 'در حال دریافت گوینده‌های سازگار...'}
              onChange={(value) => update({ voice: String(value) })}
            />
          </div>
          {activeVoiceModelId ? (
            <div className="text-[10px] leading-4 text-gray-400">
              گوینده‌های سازگار با موتور انتخاب‌شده نمایش داده می‌شوند.
            </div>
          ) : null}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">زبان</div>
              <Select
                size="small"
                className="w-full"
                value={settings.language || 'fa-IR'}
                options={VOICE_LANGUAGE_OPTIONS}
                onChange={(value) => update({ language: String(value) })}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">حالت صدا</div>
              <Select
                size="small"
                className="w-full"
                value={settings.voiceStyle || 'neutral'}
                options={VOICE_STYLE_OPTIONS}
                onChange={(value) => update({ voiceStyle: String(value) })}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">
              سرعت گفتار ({(settings.speed || 1).toLocaleString('fa-IR')}×)
            </div>
            <Slider
              min={0.25}
              max={4}
              step={0.05}
              value={settings.speed || 1}
              onChange={(value) => update({ speed: Number(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">فرمت خروجی</div>
            <Select
              size="small"
              className="w-full"
              value={settings.responseFormat || 'mp3'}
              options={AUDIO_FORMAT_OPTIONS}
              onChange={(value) => update({ responseFormat: String(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">نوع خروجی صوتی</div>
            <Select
              size="small"
              className="w-full"
              value={settings.musicMode || 'off'}
              options={MUSIC_MODE_OPTIONS}
              onChange={(value) => update({ musicMode: value as AiMediaSettings['musicMode'] })}
            />
          </div>
          {settings.musicMode === 'song' ? (
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">متن ترانه</div>
              <Input.TextArea
                size="small"
                value={settings.lyrics || ''}
                onChange={(event) => update({ lyrics: event.target.value })}
                autoSize={{ minRows: 2, maxRows: 4 }}
                placeholder="اگر مدل انتخاب‌شده پشتیبانی کند، از این متن برای ساخت ترانه استفاده می‌شود."
              />
            </div>
          ) : null}
        </>
      ) : null}

      {capability === 'document_generation' ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">نوع فایل خروجی</div>
          <Select
            size="small"
            className="w-full"
            value={settings.format || 'docx'}
            options={[
              { value: 'docx', label: 'Word (.docx)' },
              { value: 'xlsx', label: 'Excel (.xlsx)' },
              { value: 'pdf', label: 'PDF (.pdf)' },
              { value: 'csv', label: 'CSV (.csv)' },
            ]}
            onChange={(value) => update({ format: String(value) })}
          />
          <div className="mt-1 text-[10px] leading-4 text-gray-400">
            برای Excel/CSV، داده‌ها به‌صورت جدول ساخته می‌شوند.
          </div>
        </div>
      ) : null}

      {capability === 'video_generation' ? (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-2 text-[10px] leading-5 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-200">
            تنظیمات زیر برای ساخت همین ویدیو اعمال می‌شوند. در صورت ارسال تصویر، همان تصویر به‌عنوان مبنا استفاده می‌شود.
          </div>
          <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-2 dark:border-violet-400/20 dark:bg-violet-950/15">
            <div className="mb-2 text-xs font-semibold text-violet-800 dark:text-violet-100">قاب و کارگردانی ویدیو</div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">ابعاد ویدیو</div>
            <Select
              size="small"
              className="w-full"
              value={settings.size || '1080x1920'}
              options={VIDEO_SIZE_OPTIONS}
              onChange={(value) => update({ size: String(value) })}
            />
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">سبک</div>
                <Select size="small" className="w-full" value={settings.videoStyle || 'cinematic'} options={[{ value: 'cinematic', label: 'سینمایی' }, { value: 'realistic', label: 'واقع‌گرایانه' }, { value: 'animation', label: 'انیمیشنی' }, { value: 'product', label: 'معرفی محصول' }]} onChange={(value) => update({ videoStyle: String(value) })} />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">حرکت</div>
                <Select size="small" className="w-full" value={settings.videoMotion || 'gentle'} options={[{ value: 'gentle', label: 'ملایم' }, { value: 'dynamic', label: 'پویا' }, { value: 'static', label: 'ثابت' }]} onChange={(value) => update({ videoMotion: String(value) })} />
              </div>
            </div>
            <div className="mt-2">
              <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">نمای دوربین</div>
              <Select size="small" className="w-full" value={settings.videoCamera || 'auto'} options={[{ value: 'auto', label: 'انتخاب خودکار' }, { value: 'close_up', label: 'نمای نزدیک' }, { value: 'wide', label: 'نمای باز' }, { value: 'tracking', label: 'دنبال‌کننده' }]} onChange={(value) => update({ videoCamera: String(value) })} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">مدت (ثانیه)</div>
            <InputNumber
              size="small"
              className="w-full"
              min={4}
              max={20}
              step={1}
              value={settings.seconds || 4}
              onChange={(value) => update({ seconds: Number(value) || 4 })}
            />
            </div>
            <div>
              <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">کیفیت</div>
              <Select
                size="small"
                className="w-full"
                value={settings.videoQuality || 'standard'}
                options={[{ value: 'standard', label: 'استاندارد' }, { value: 'high', label: 'بالاتر' }]}
                onChange={(value) => update({ videoQuality: value as AiMediaSettings['videoQuality'] })}
              />
            </div>
          </div>
        </>
      ) : null}

    </div>
  ), [capability, settings]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) scheduleOverlayLockRelease();
  };

  const renderTriggerButton = (onClick?: () => void) => (
    <Tooltip title="تنظیمات تولید رسانه">
      <Button size={size} disabled={disabled} icon={<SettingOutlined />} onClick={onClick}>
        تنظیمات
      </Button>
    </Tooltip>
  );

  if (isMobile) {
    return (
      <>
        {renderTriggerButton(() => handleOpenChange(true))}
        <Drawer
          title="تنظیمات تولید رسانه"
          placement="bottom"
          open={open}
          onClose={() => handleOpenChange(false)}
          height="min(78vh, 560px)"
          destroyOnHidden
          getContainer={typeof document === 'undefined' ? undefined : () => document.body}
          styles={{ body: { padding: 12, overflowY: 'auto' } }}
          afterOpenChange={(nextOpen) => {
            if (!nextOpen) scheduleOverlayLockRelease();
          }}
        >
          {content}
        </Drawer>
      </>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="topRight"
      trigger="click"
      content={content}
      overlayStyle={{ maxWidth: 'calc(100vw - 24px)' }}
      getPopupContainer={() => document.body}
      destroyOnHidden
    >
      {renderTriggerButton()}
    </Popover>
  );
};

export default AiMediaSettingsPopover;
