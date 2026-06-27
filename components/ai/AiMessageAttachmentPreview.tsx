import React, { useMemo } from 'react';
import { Button, Image, Space } from 'antd';
import { CustomerServiceOutlined, DownloadOutlined, EditOutlined } from '@ant-design/icons';
import FileExtensionTile from '../files/FileExtensionTile';
import { supabase, SUPABASE_URL } from '../../supabaseClient';
import { buildImagePreviewUrl } from '../../utils/imagePreview';
import { normalizePublicAssetUrl } from '../../utils/assetUrl';

type AiAttachmentLike = {
  url?: string | null;
  path?: string | null;
  bucket?: string | null;
  mimeType?: string | null;
  mime_type?: string | null;
  fileName?: string | null;
  filename?: string | null;
  name?: string | null;
  data?: string | null;
};

const normalizeStoragePublicUrl = (url: string) => {
  const raw = String(url || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const marker = '/storage/v1/object/public/';
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex >= 0) {
      const publicPath = parsed.pathname.slice(markerIndex + marker.length);
      const publicBase = SUPABASE_URL.replace(/\/+$/, '');
      return normalizePublicAssetUrl(`${publicBase}${marker}${publicPath}${parsed.search || ''}`);
    }
    return normalizePublicAssetUrl(raw) || raw;
  } catch {
    return normalizePublicAssetUrl(raw) || raw;
  }
};

export const resolveAiAttachmentUrl = (attachment: AiAttachmentLike | null | undefined) => {
  const bucket = String(attachment?.bucket || '').trim();
  const path = String(attachment?.path || '').trim();
  if (bucket && path) {
    return normalizeStoragePublicUrl(supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl || '');
  }
  return normalizeStoragePublicUrl(String(attachment?.url || attachment?.data || '').trim());
};

const getAttachmentName = (attachment: AiAttachmentLike, fallback: string) =>
  String(attachment.fileName || attachment.filename || attachment.name || '').trim() || fallback;

const isImageLike = (url: string, fileName: string, mimeType: string) => {
  const lower = `${url} ${fileName} ${mimeType}`.toLowerCase();
  return mimeType.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif|svg)(\?|#|$)/i.test(lower);
};

const isAudioLike = (url: string, fileName: string, mimeType: string) => {
  const lower = `${url} ${fileName} ${mimeType}`.toLowerCase();
  return mimeType.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|oga|webm)(\?|#|$)/i.test(lower);
};

const isVideoLike = (url: string, fileName: string, mimeType: string) => {
  const lower = `${url} ${fileName} ${mimeType}`.toLowerCase();
  return mimeType.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv)(\?|#|$)/i.test(lower);
};

const downloadAttachment = (url: string, fileName: string) => {
  if (!url || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'ai-file';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export { normalizeStoragePublicUrl };

type AiMessageAttachmentPreviewProps = {
  attachment?: AiAttachmentLike | null;
  fallbackName?: string;
  onEditImage?: (url: string) => void;
};

const AiMessageAttachmentPreview: React.FC<AiMessageAttachmentPreviewProps> = ({
  attachment,
  fallbackName = 'فایل هوش مصنوعی',
  onEditImage,
}) => {
  const normalized = useMemo(() => {
    const url = resolveAiAttachmentUrl(attachment);
    const mimeType = String(attachment?.mimeType || attachment?.mime_type || '').trim();
    const fileName = getAttachmentName(attachment || {}, fallbackName);
    return {
      url,
      mimeType,
      fileName,
      isImage: isImageLike(url, fileName, mimeType),
      isAudio: isAudioLike(url, fileName, mimeType),
      isVideo: isVideoLike(url, fileName, mimeType),
    };
  }, [attachment, fallbackName]);

  if (!normalized.url) return null;

  if (normalized.isVideo) {
    return (
      <div className="mt-3 w-full max-w-[420px] overflow-hidden rounded-lg border border-gray-200 bg-white/80 p-2 dark:border-dark-border dark:bg-dark-surface/80">
        <video controls preload="metadata" src={normalized.url} className="max-h-[360px] w-full rounded-lg">
          مرورگر شما از پخش ویدیو پشتیبانی نمی‌کند.
        </video>
        <div className="mt-2 flex justify-end">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => downloadAttachment(normalized.url, normalized.fileName)}
          >
            دانلود فایل اصلی
          </Button>
        </div>
      </div>
    );
  }

  if (normalized.isImage) {
    return (
      <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white/80 p-2 dark:border-dark-border dark:bg-dark-surface/80">
        <Image
          src={buildImagePreviewUrl(normalized.url, 'gallery')}
          preview={{ src: normalized.url }}
          alt={normalized.fileName}
          className="max-h-[360px] rounded-lg object-contain"
        />
        <div className="mt-2 flex justify-end gap-2">
          {onEditImage ? (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<EditOutlined />}
              onClick={() => onEditImage(normalized.url)}
            >
              اصلاح این تصویر
            </Button>
          ) : null}
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => downloadAttachment(normalized.url, normalized.fileName)}
          >
            دانلود فایل اصلی
          </Button>
        </div>
      </div>
    );
  }

  if (normalized.isAudio) {
    return (
      <div className="mt-3 w-full max-w-[360px] rounded-lg border border-gray-200 bg-white/80 p-3 dark:border-dark-border dark:bg-dark-surface/80">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-gray-600 dark:text-gray-300">
          <CustomerServiceOutlined />
          <span className="truncate">{normalized.fileName}</span>
        </div>
        <audio controls preload="none" src={normalized.url} className="w-full">
          مرورگر شما از پخش صوت پشتیبانی نمی‌کند.
        </audio>
        <div className="mt-2 flex justify-end">
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => downloadAttachment(normalized.url, normalized.fileName)}
          >
            دانلود فایل اصلی
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 w-[220px] rounded-lg border border-gray-200 bg-white/80 p-2 dark:border-dark-border dark:bg-dark-surface/80">
      <FileExtensionTile
        fileName={normalized.fileName}
        url={normalized.url}
        mimeType={normalized.mimeType}
        compact
      />
      <Space className="mt-2 w-full justify-end">
        <Button
          size="small"
          icon={<DownloadOutlined />}
          onClick={() => downloadAttachment(normalized.url, normalized.fileName)}
        >
          دانلود
        </Button>
      </Space>
    </div>
  );
};

export default AiMessageAttachmentPreview;
