import React, { useMemo, useRef, useState } from 'react';
import { App, Button, Popover, Tooltip } from 'antd';
import { FolderOpenOutlined, UploadOutlined } from '@ant-design/icons';
import FileManagerPickerModal from '../files/FileManagerPickerModal';
import type { NoteAttachment } from '../../utils/noteContent';
import { FILE_STORAGE_BUCKET, fileStorageClient } from '../../utils/storageClient';
import { uploadFileWithProgress, isUploadCanceledError } from '../../utils/uploadFileWithProgress';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';
import { sanitizeStorageFileName } from '../../utils/storagePath';
import { createWorkflowId as createId } from '../../utils/workflowTypes';
import {
  STORY_MAX_AUDIO_BYTES,
  STORY_MAX_IMAGE_BYTES,
  STORY_MAX_VIDEO_BYTES,
} from './storyTypes';

export type StoryMediaAcceptKind = 'image' | 'video' | 'audio' | 'visual';

export interface SelectedStoryMediaResult {
  kind: 'image' | 'video' | 'audio';
  url: string;
  name: string;
  fileId?: string | null;
  durationSec?: number | null;
  mimeType?: string | null;
}

const IMAGE_EXT_REGEX = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)$/i;
const VIDEO_EXT_REGEX = /\.(mp4|webm|mov|m4v|mkv|3gp)$/i;
const AUDIO_EXT_REGEX = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|weba|webm)$/i;

export const detectStoryMediaKindFromInput = (
  input: { name?: string | null; mimeType?: string | null; url?: string | null },
  preferredKind?: StoryMediaAcceptKind,
): 'image' | 'video' | 'audio' | null => {
  const mime = String(input.mimeType || '').trim().toLowerCase();
  const target = `${String(input.name || '')} ${String(input.url || '').split('?')[0]}`.trim().toLowerCase();

  // تصاویر هرگز نباید ویدیو یا صدا تشخیص داده شوند
  if (mime.startsWith('image/') || IMAGE_EXT_REGEX.test(target)) {
    return 'image';
  }
  if (mime.startsWith('audio/') || (preferredKind === 'audio' && (mime.includes('webm') || AUDIO_EXT_REGEX.test(target)))) {
    return 'audio';
  }
  if (mime.startsWith('video/') || VIDEO_EXT_REGEX.test(target)) {
    return 'video';
  }
  if (AUDIO_EXT_REGEX.test(target)) {
    return 'audio';
  }
  return null;
};

export const readMediaDurationSeconds = (source: File | string, kind: 'video' | 'audio'): Promise<number | null> => {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const objectUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
    const el = document.createElement(kind);
    let settled = false;
    const cleanup = () => {
      if (typeof source !== 'string') {
        URL.revokeObjectURL(objectUrl);
      }
      el.removeAttribute('src');
      el.load?.();
    };
    const finish = (value: number | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const timeout = window.setTimeout(() => finish(null), 4000);
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      window.clearTimeout(timeout);
      const dur = Number(el.duration);
      finish(Number.isFinite(dur) && dur > 0 ? dur : null);
    };
    el.onerror = () => {
      window.clearTimeout(timeout);
      finish(null);
    };
    el.src = objectUrl;
  });
};

interface StoryMediaUploadTriggerProps {
  orgId: string;
  acceptKind: StoryMediaAcceptKind;
  buttonLabel: string;
  buttonIcon?: React.ReactNode;
  buttonSize?: 'small' | 'middle' | 'large';
  buttonType?: 'default' | 'primary' | 'dashed' | 'text';
  buttonBlock?: boolean;
  tooltip?: string;
  disabled?: boolean;
  onMediaSelected: (result: SelectedStoryMediaResult) => void;
  popupContainer?: (node?: HTMLElement | null) => HTMLElement;
  popoverZIndex?: number;
  modalZIndex?: number;
  children?: React.ReactNode;
}

export const StoryMediaUploadTrigger: React.FC<StoryMediaUploadTriggerProps> = ({
  orgId,
  acceptKind,
  buttonLabel,
  buttonIcon,
  buttonSize = 'small',
  buttonType = 'default',
  buttonBlock = false,
  tooltip,
  disabled = false,
  onMediaSelected,
  popupContainer,
  popoverZIndex = 1480,
  modalZIndex = 13200,
  children,
}) => {
  const { message } = App.useApp();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [filePickerOpen, setFilePickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const acceptAttr = useMemo(() => {
    if (acceptKind === 'image') return 'image/*';
    if (acceptKind === 'video') return 'video/mp4,video/webm,video/quicktime,video/*';
    if (acceptKind === 'audio') return 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus';
    return 'image/*,video/mp4,video/webm,video/quicktime,video/*';
  }, [acceptKind]);

  const pickerFileTypes = useMemo<Array<'image' | 'video' | 'file'>>(() => {
    if (acceptKind === 'image') return ['image'];
    if (acceptKind === 'video') return ['video'];
    if (acceptKind === 'audio') return ['file', 'video'];
    return ['image', 'video'];
  }, [acceptKind]);

  const validateSelectedKind = (kind: 'image' | 'video' | 'audio' | null) => {
    if (!kind) {
      message.warning('فرمت فایل انتخاب‌شده پشتیبانی نمی‌شود.');
      return null;
    }
    if (acceptKind === 'image' && kind !== 'image') {
      message.warning('لطفاً فقط یک فایل تصویر انتخاب کنید.');
      return null;
    }
    if (acceptKind === 'video' && kind !== 'video') {
      message.warning('این بخش مخصوص فایل ویدیو است؛ تصویر به عنوان ویدیو بارگذاری نمی‌شود.');
      return null;
    }
    if (acceptKind === 'visual' && kind === 'audio') {
      message.warning('برای پس‌زمینه استوری، تصویر یا ویدیو انتخاب کنید.');
      return null;
    }
    if (acceptKind === 'audio' && kind !== 'audio') {
      message.warning('لطفاً یک فایل صوتی معتبر (MP3، WAV، M4A، OGG و...) انتخاب کنید.');
      return null;
    }
    return kind;
  };

  const uploadDedicatedStoryFile = async (file: File): Promise<void> => {
    const detectedKind = validateSelectedKind(
      detectStoryMediaKindFromInput({ name: file.name, mimeType: file.type }, acceptKind),
    );
    if (!detectedKind) return;

    const maxBytes = detectedKind === 'video'
      ? STORY_MAX_VIDEO_BYTES
      : detectedKind === 'audio'
        ? STORY_MAX_AUDIO_BYTES
        : STORY_MAX_IMAGE_BYTES;

    if (file.size > maxBytes) {
      const maxMb = Math.round(maxBytes / (1024 * 1024));
      message.error(`حداکثر حجم مجاز برای این فایل ${maxMb} مگابایت است.`);
      return;
    }

    setUploading(true);
    try {
      const safeName = sanitizeStorageFileName(file.name, detectedKind);
      const uniquePrefix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : createId();
      const folder = detectedKind === 'video' ? 'videos' : detectedKind === 'audio' ? 'audio' : 'images';
      const storagePath = `stories/${orgId}/${folder}/${uniquePrefix}_${safeName}`;

      await uploadFileWithProgress({
        client: fileStorageClient,
        bucket: FILE_STORAGE_BUCKET,
        path: storagePath,
        file,
        cacheControl: '31536000',
        contentType: file.type || undefined,
        label: file.name,
        detail: detectedKind === 'video' ? 'ویدیوی استوری' : detectedKind === 'audio' ? 'صدای استوری' : 'تصویر استوری',
      });

      const { data: urlData } = fileStorageClient.storage
        .from(FILE_STORAGE_BUCKET)
        .getPublicUrl(storagePath);

      const publicUrl = normalizePublicAssetUrl(urlData?.publicUrl) || urlData?.publicUrl;
      if (!publicUrl) throw new Error('آدرس فایل پس از آپلود دریافت نشد.');

      const durationSec = (detectedKind === 'video' || detectedKind === 'audio')
        ? await readMediaDurationSeconds(file, detectedKind)
        : null;

      onMediaSelected({
        kind: detectedKind,
        url: publicUrl,
        name: file.name,
        fileId: null, // فایل اختصاصی استوری — با تیک حذف پس از انقضا پاک‌شدنی است
        durationSec,
        mimeType: file.type || null,
      });
    } catch (err: any) {
      if (!isUploadCanceledError(err)) {
        message.error(String(err?.message || 'آپلود فایل ناموفق بود.'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleSoftwareFileSelected = async (attachments: NoteAttachment[]) => {
    const picked = attachments[0];
    if (!picked?.url) return;

    const detectedKind = validateSelectedKind(
      detectStoryMediaKindFromInput(
        { name: picked.name, mimeType: picked.mimeType, url: picked.url },
        acceptKind,
      ),
    );
    if (!detectedKind) return;

    const normalizedUrl = normalizePublicAssetUrl(picked.url) || picked.url;
    const durationSec = (detectedKind === 'video' || detectedKind === 'audio')
      ? await readMediaDurationSeconds(normalizedUrl, detectedKind)
      : null;

    onMediaSelected({
      kind: detectedKind,
      url: normalizedUrl,
      name: picked.name || 'فایل نرم‌افزار',
      fileId: picked.assetId || picked.entryId || 'file_manager_linked',
      durationSec,
      mimeType: picked.mimeType || null,
    });
  };

  const popoverContent = (
    <div className="flex flex-col gap-1.5 min-w-[188px]" dir="rtl">
      <Button
        size="small"
        type="text"
        icon={<UploadOutlined />}
        className="!justify-start !text-right !h-8 !rounded-lg hover:!bg-slate-100 dark:hover:!bg-white/10"
        loading={uploading}
        onClick={() => {
          setPopoverOpen(false);
          fileInputRef.current?.click();
        }}
      >
        آپلود از دستگاه
      </Button>
      <Button
        size="small"
        type="text"
        icon={<FolderOpenOutlined />}
        className="!justify-start !text-right !h-8 !rounded-lg hover:!bg-slate-100 dark:hover:!bg-white/10"
        onClick={() => {
          setPopoverOpen(false);
          setFilePickerOpen(true);
        }}
      >
        از فایل‌های نرم‌افزار
      </Button>
    </div>
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void uploadDedicatedStoryFile(file);
        }}
      />

      <Popover
        open={popoverOpen}
        onOpenChange={(next) => {
          if (disabled || uploading) return;
          setPopoverOpen(next);
        }}
        trigger="click"
        placement="bottom"
        content={popoverContent}
        getPopupContainer={popupContainer}
        zIndex={popoverZIndex}
      >
        {children || (
          <Tooltip title={tooltip}>
            <Button
              size={buttonSize}
              type={buttonType}
              icon={buttonIcon}
              block={buttonBlock}
              loading={uploading}
              disabled={disabled}
            >
              {buttonLabel}
            </Button>
          </Tooltip>
        )}
      </Popover>

      <FileManagerPickerModal
        open={filePickerOpen}
        onClose={() => setFilePickerOpen(false)}
        title={
          acceptKind === 'audio'
            ? 'انتخاب فایل صوتی از نرم‌افزار'
            : acceptKind === 'video'
              ? 'انتخاب ویدیو از نرم‌افزار'
              : acceptKind === 'image'
                ? 'انتخاب تصویر از نرم‌افزار'
                : 'انتخاب تصویر یا ویدیو از نرم‌افزار'
        }
        multiple={false}
        fileTypes={pickerFileTypes}
        onSelect={(attachments) => void handleSoftwareFileSelected(attachments)}
        onUploadFiles={(files) => {
          const file = files?.[0];
          if (file) void uploadDedicatedStoryFile(file);
        }}
        zIndex={modalZIndex}
      />
    </>
  );
};
