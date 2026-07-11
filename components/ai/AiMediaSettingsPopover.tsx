import React, { useEffect, useMemo, useState } from 'react';
import { Button, Checkbox, Drawer, Grid, Input, InputNumber, Popover, Select, Slider, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';

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
  // document
  format?: string;
};

type AiMediaSettingsPopoverProps = {
  capability: 'image_generation' | 'voice_output' | 'video_generation' | 'document_generation';
  settings: AiMediaSettings;
  onSettingsChange: (next: AiMediaSettings) => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
};

// Voices valid on AvalAI /v1/audio/speech (OpenAI + ElevenLabs compatible set).
const VOICE_OPTIONS = [
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
  { value: '1536x1024', label: 'افقی (۱۵۳۶×۱۰۲۴)' },
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
}) => {
  const screens = Grid.useBreakpoint();
  const [open, setOpen] = useState(false);
  const isMobile = !screens.md;

  useEffect(() => () => {
    scheduleOverlayLockRelease(0);
  }, []);

  const update = (patch: AiMediaSettings) => onSettingsChange({ ...settings, ...patch });

  const updateImageOrientation = (orientation: 'horizontal' | 'vertical', checked: boolean) => {
    if (orientation === 'horizontal') {
      update({
        orientationHorizontal: checked,
        orientationVertical: checked ? false : settings.orientationVertical,
        size: checked ? '1536x1024' : settings.orientationVertical ? '1024x1536' : settings.size,
      });
      return;
    }
    update({
      orientationVertical: checked,
      orientationHorizontal: checked ? false : settings.orientationHorizontal,
      size: checked ? '1024x1536' : settings.orientationHorizontal ? '1536x1024' : settings.size,
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
              value={settings.voice || 'alloy'}
              options={VOICE_OPTIONS}
              onChange={(value) => update({ voice: String(value) })}
            />
          </div>
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
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">ابعاد ویدیو</div>
            <Select
              size="small"
              className="w-full"
              value={settings.size || '1280x720'}
              options={[
                { value: '1280x720', label: 'افقی (۱۲۸۰×۷۲۰)' },
                { value: '720x1280', label: 'عمودی (۷۲۰×۱۲۸۰)' },
                { value: '1024x1024', label: 'مربع (۱۰۲۴×۱۰۲۴)' },
              ]}
              onChange={(value) => update({ size: String(value) })}
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-600 dark:text-gray-300">مدت (ثانیه)</div>
            <InputNumber
              size="small"
              className="w-full"
              min={1}
              max={20}
              value={settings.seconds || 5}
              onChange={(value) => update({ seconds: Number(value) || 5 })}
            />
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
