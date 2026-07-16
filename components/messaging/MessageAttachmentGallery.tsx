import React, { useMemo, useState } from 'react';
import {
  DownloadOutlined,
  FileImageOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { Button, Modal } from 'antd';
import ResilientImage from '../common/ResilientImage';
import FileExtensionTile from '../files/FileExtensionTile';
import AiAudioPlayer from '../ai/AiAudioPlayer';
import type { NoteAttachment } from '../../utils/noteContent';
import { resolveNoteAttachmentFileType } from '../../utils/noteContent';
import { dedupeAttachments } from '../../utils/messageAttachments';
import { toPersianNumber } from '../../utils/persianNumberFormatter';

type MessageAttachmentGalleryProps = {
  attachments?: Array<NoteAttachment | null | undefined>;
  call?: boolean;
};

const AudioAttachmentPlayer: React.FC<{ name: string; url?: string | null; call?: boolean }> = ({ name, url, call = false }) => (
  <div className="mt-2">
    <AiAudioPlayer src={url} title={call ? 'ضبط تماس' : 'پیام صوتی'} subtitle={name} downloadName={name} compact />
  </div>
);

const MessageAttachmentGallery: React.FC<MessageAttachmentGalleryProps> = ({ attachments = [], call = false }) => {
  const [previewAttachment, setPreviewAttachment] = useState<NoteAttachment | null>(null);
  const normalized = useMemo(() => dedupeAttachments(attachments), [attachments]);
  const images = normalized.filter((attachment) => resolveNoteAttachmentFileType(attachment) === 'image');
  const videos = normalized.filter((attachment) => resolveNoteAttachmentFileType(attachment) === 'video');
  const files = normalized.filter((attachment) => resolveNoteAttachmentFileType(attachment) === 'file');
  const audios = normalized.filter((attachment) => {
    const type = resolveNoteAttachmentFileType(attachment);
    return type === 'audio' || type === 'voice';
  });

  if (normalized.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {images.length > 0 ? (
        <div className={`grid gap-1.5 ${images.length === 1 ? 'max-w-[156px] grid-cols-1' : 'max-w-[260px] grid-cols-2'}`}>
          {images.slice(0, 4).map((attachment, index) => {
            const hiddenCount = images.length - 4;
            const showOverlay = index === 3 && hiddenCount > 0;
            return (
              <button
                type="button"
                key={`${attachment.name}-${attachment.url || index}`}
                className="group relative aspect-square overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(var(--brand-100-rgb),0.95),rgba(var(--brand-50-rgb),0.72),rgba(255,255,255,0.92))] text-right shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] dark:border-white/[0.08] dark:bg-[linear-gradient(135deg,rgba(var(--brand-700-rgb),0.26),rgba(255,255,255,0.06))]"
                aria-label={`نمایش تصویر ${attachment.name}`}
                onClick={() => setPreviewAttachment(attachment)}
              >
                {attachment.url ? (
                  <ResilientImage
                    src={attachment.url}
                    preset="thumb"
                    forcePreviewTransform
                    loading="lazy"
                    decoding="async"
                    alt={attachment.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[rgb(var(--brand-500-rgb))] opacity-80">
                    <FileImageOutlined className="text-3xl" />
                  </div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/45 to-transparent p-2 text-[11px] font-semibold text-white">
                  <span className="line-clamp-1">{attachment.name}</span>
                </div>
                {showOverlay ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-bold text-white">
                    +{toPersianNumber(String(hiddenCount))}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
      {videos.length > 0 ? (
        <div className="grid max-w-[220px] grid-cols-1 gap-1.5">
          {videos.map((attachment) => (
            <button
              type="button"
              key={`${attachment.name}-${attachment.url || 'video'}`}
              className="relative aspect-video overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-right shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] dark:border-white/[0.08]"
              aria-label={`پخش ویدیو ${attachment.name}`}
              onClick={() => setPreviewAttachment(attachment)}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(var(--brand-300-rgb),0.45),transparent_36%),linear-gradient(135deg,#111827,#334155)]" />
              <div className="absolute inset-0 flex items-center justify-center text-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/36 backdrop-blur">
                  <PlayCircleOutlined className="text-2xl" />
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2 text-[11px] font-semibold text-white">
                <span className="line-clamp-1">{attachment.name}</span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="grid max-w-[360px] grid-cols-1 gap-2 sm:grid-cols-2">
          {files.map((attachment) => (
            <a
              href={attachment.url || undefined}
              download={attachment.url ? attachment.name : undefined}
              target="_blank"
              rel="noreferrer"
              key={`${attachment.name}-${attachment.url || 'file'}`}
              className={`group flex min-w-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white/92 p-2 text-[11px] text-slate-600 shadow-sm transition hover:border-[rgba(var(--brand-300-rgb),0.9)] hover:bg-slate-50 dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200 ${attachment.url ? '' : 'pointer-events-none opacity-60'}`}
            >
              <FileExtensionTile fileName={attachment.name} url={attachment.url || ''} mimeType={attachment.mimeType || null} compact />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{attachment.name}</span>
                <span className="mt-0.5 block text-[10px] text-slate-400">فایل پیوست</span>
              </span>
              {attachment.url ? <DownloadOutlined className="shrink-0 text-slate-400 transition group-hover:text-[rgb(var(--brand-600-rgb))]" /> : null}
            </a>
          ))}
        </div>
      ) : null}
      {audios.map((attachment) => (
        <AudioAttachmentPlayer key={`${attachment.name}-${attachment.url || 'audio'}`} name={attachment.name} url={attachment.url} call={call} />
      ))}
      <Modal
        open={Boolean(previewAttachment)}
        title={previewAttachment?.name || 'پیش‌نمایش فایل'}
        footer={previewAttachment?.url ? (
          <div className="flex justify-end gap-2">
            <Button href={previewAttachment.url} target="_blank">باز کردن فایل اصلی</Button>
            <Button type="primary" href={previewAttachment.url} download={previewAttachment.name} icon={<DownloadOutlined />}>دانلود</Button>
          </div>
        ) : null}
        onCancel={() => setPreviewAttachment(null)}
        destroyOnHidden
        centered
        width={760}
      >
        {resolveNoteAttachmentFileType(previewAttachment) === 'image' && previewAttachment?.url ? (
          <ResilientImage
            src={previewAttachment.url}
            preset="gallery"
            forcePreviewTransform
            decoding="async"
            alt={previewAttachment.name}
            className="max-h-[70vh] w-full rounded-2xl object-contain"
          />
        ) : resolveNoteAttachmentFileType(previewAttachment) === 'video' && previewAttachment?.url ? (
          <video src={previewAttachment.url} controls className="max-h-[70vh] w-full rounded-2xl bg-black" />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-slate-300">
            پیش‌نمایش این فایل در دسترس نیست.
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MessageAttachmentGallery;
