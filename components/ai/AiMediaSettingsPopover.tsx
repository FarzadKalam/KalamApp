import React, { useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, InputNumber, Popover, Select, Slider, Space, Tooltip } from 'antd';
import type { ButtonProps } from 'antd';
import { CloseCircleFilled, PictureOutlined, SettingOutlined } from '@ant-design/icons';
import { scheduleOverlayLockRelease } from '../../utils/overlayLocks';

export type AiMediaSourceImage = {
  data: string;       // base64 (no data: prefix)
  mimeType: string;
  filename?: string;
  previewUrl: string; // data URL for thumbnail
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
  // voice
  voice?: string;
  speed?: number;
  responseFormat?: string;
  // video
  seconds?: number;
  // document
  format?: string;
};

type AiMediaSettingsPopoverProps = {
  capability: 'image_generation' | 'voice_output' | 'video_generation' | 'document_generation';
  settings: AiMediaSettings;
  onSettingsChange: (next: AiMediaSettings) => void;
  sourceImages?: AiMediaSourceImage[];
  onSourceImagesChange?: (next: AiMediaSourceImage[]) => void;
  disabled?: boolean;
  size?: ButtonProps['size'];
  maxSourceImages?: number;
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

const AUDIO_FORMAT_OPTIONS = [
  { value: 'mp3', label: 'MP3' },
  { value: 'wav', label: 'WAV' },
  { value: 'opus', label: 'Opus' },
  { value: 'aac', label: 'AAC' },
];

const blobToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('خواندن فایل ناموفق بود.'));
  reader.readAsDataURL(file);
});

const AiMediaSettingsPopover: React.FC<AiMediaSettingsPopoverProps> = ({
  capability,
  settings,
  onSettingsChange,
  sourceImages = [],
  onSourceImagesChange,
  disabled = false,
  size,
  maxSourceImages = 4,
}) => {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const supportsSourceImages = (capability === 'image_generation' || capability === 'video_generation')
    && typeof onSourceImagesChange === 'function';

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

  const handlePickFiles = async (files: FileList | null) => {
    if (!files || !onSourceImagesChange) return;
    const room = Math.max(0, maxSourceImages - sourceImages.length);
    if (room <= 0) {
      message.warning(`حداکثر ${maxSourceImages.toLocaleString('fa-IR')} تصویر منبع مجاز است.`);
      return;
    }
    const picked = Array.from(files).filter((file) => file.type.startsWith('image/')).slice(0, room);
    const next: AiMediaSourceImage[] = [];
    for (const file of picked) {
      if (file.size > 8 * 1024 * 1024) {
        message.warning(`«${file.name}» بزرگ‌تر از ۸ مگابایت است و رد شد.`);
        continue;
      }
      try {
        const dataUrl = await blobToDataUrl(file);
        next.push({
          data: dataUrl.replace(/^data:[^;]+;base64,/, ''),
          mimeType: file.type || 'image/png',
          filename: file.name,
          previewUrl: dataUrl,
        });
      } catch {
        message.error(`خواندن «${file.name}» ناموفق بود.`);
      }
    }
    if (next.length) onSourceImagesChange([...sourceImages, ...next]);
  };

  const removeSource = (index: number) => {
    if (!onSourceImagesChange) return;
    onSourceImagesChange(sourceImages.filter((_, idx) => idx !== index));
  };

  const content = useMemo(() => (
    <div className="w-72 space-y-3" dir="rtl">
      {capability === 'image_generation' ? (
        <>
          <div className="rounded-lg border border-gray-100 p-2 dark:border-white/10">
            <Checkbox
              checked={settings.useOrganizationContext !== false}
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

      {supportsSourceImages ? (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
              {capability === 'video_generation' ? 'تصویر مرجع' : 'تصاویر منبع'}
            </span>
            <span className="text-[10px] text-gray-400">
              {sourceImages.length.toLocaleString('fa-IR')}/{maxSourceImages.toLocaleString('fa-IR')}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sourceImages.map((src, index) => (
              <div key={`${src.filename}-${index}`} className="relative">
                <img src={src.previewUrl} alt={src.filename || 'منبع'} className="h-14 w-14 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => removeSource(index)}
                  className="absolute -right-1.5 -top-1.5 text-red-500"
                  aria-label="حذف تصویر"
                >
                  <CloseCircleFilled />
                </button>
              </div>
            ))}
            {sourceImages.length < maxSourceImages ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 hover:border-leather-400 hover:text-leather-500 dark:border-white/15"
                aria-label="افزودن تصویر منبع"
              >
                <PictureOutlined />
              </button>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple={capability !== 'video_generation'}
            className="hidden"
            onChange={(event) => {
              void handlePickFiles(event.target.files);
              event.target.value = '';
            }}
          />
          <div className="mt-1 text-[10px] leading-4 text-gray-400">
            {capability === 'video_generation'
              ? 'یک تصویر برای ساخت ویدیو از روی عکس.'
              : 'با افزودن تصویر، هوش مصنوعی به‌جای ساخت از صفر، تصویر شما را ویرایش/ترکیب می‌کند.'}
          </div>
        </div>
      ) : null}
    </div>
  ), [capability, settings, sourceImages, maxSourceImages, supportsSourceImages]);

  const badge = sourceImages.length > 0 ? sourceImages.length.toLocaleString('fa-IR') : null;
  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) scheduleOverlayLockRelease();
  };

  return (
    <Popover
      open={open}
      onOpenChange={handleOpenChange}
      placement="topRight"
      trigger="click"
      content={content}
      getPopupContainer={() => document.body}
      destroyTooltipOnHide
    >
      <Tooltip title="تنظیمات تولید رسانه">
        <Button size={size} disabled={disabled} icon={<SettingOutlined />}>
          {badge ? <Space size={2}>{badge}</Space> : null}
        </Button>
      </Tooltip>
    </Popover>
  );
};

export default AiMediaSettingsPopover;
