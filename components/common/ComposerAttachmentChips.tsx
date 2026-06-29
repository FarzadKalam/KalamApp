import React, { useEffect, useMemo, useState } from 'react';
import { AudioOutlined } from '@ant-design/icons';
import { Button, Spin } from 'antd';
import ResilientImage from './ResilientImage';
import FileExtensionTile from '../files/FileExtensionTile';
import { resolveNoteAttachmentFileType } from '../../utils/noteContent';

export type ComposerAttachmentChipItem = {
  id: string;
  name: string;
  mimeType?: string | null;
  fileType?: string | null;
  file?: File | Blob | null;
  url?: string | null;
  subtitle?: string | null;
  sizeText?: string | null;
  loading?: boolean;
  onRemove?: (() => void) | null;
  removeDisabled?: boolean;
};

const ComposerAttachmentChipAvatar: React.FC<{ item: ComposerAttachmentChipItem }> = ({ item }) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextFile = item.file;
    if (!nextFile || item.url || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      setObjectUrl(null);
      return undefined;
    }
    const nextObjectUrl = URL.createObjectURL(nextFile);
    setObjectUrl(nextObjectUrl);
    return () => {
      if (typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [item.file, item.url]);

  const previewUrl = String(item.url || objectUrl || '').trim();
  const resolvedType = useMemo(() => resolveNoteAttachmentFileType({
    name: item.name,
    url: previewUrl,
    mimeType: item.mimeType,
    fileType: item.fileType,
  }), [item.fileType, item.mimeType, item.name, previewUrl]);

  if (resolvedType === 'image' && previewUrl) {
    return (
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-slate-200/70 bg-slate-100 dark:border-white/[0.08] dark:bg-white/[0.05]">
        <ResilientImage src={previewUrl} preset="thumb" alt={item.name} className="h-full w-full object-cover" />
      </div>
    );
  }

  if (resolvedType === 'voice' || resolvedType === 'audio') {
    return (
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgba(var(--brand-100-rgb),0.88)] text-[rgb(var(--brand-700-rgb))] dark:bg-[rgba(var(--brand-600-rgb),0.18)] dark:text-[rgb(var(--brand-200-rgb))]">
        <AudioOutlined />
      </span>
    );
  }

  return (
    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-xl">
      <FileExtensionTile fileName={item.name} url={previewUrl} mimeType={item.mimeType || null} compact className="h-full w-full" />
    </div>
  );
};

type ComposerAttachmentChipsProps = {
  items: ComposerAttachmentChipItem[];
};

const ComposerAttachmentChips: React.FC<ComposerAttachmentChipsProps> = ({ items }) => {
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const meta = [String(item.subtitle || '').trim(), String(item.sizeText || '').trim()].filter(Boolean).join(' • ');
        return (
          <div
            key={item.id}
            className="inline-flex max-w-full items-center gap-2 rounded-2xl border border-slate-200/70 bg-slate-50/90 px-2.5 py-1.5 text-[11px] text-slate-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.045] dark:text-slate-200"
          >
            <ComposerAttachmentChipAvatar item={item} />
            <span className="min-w-0">
              <span className="block max-w-[220px] truncate font-semibold">{item.name}</span>
              {meta ? (
                <span className="block text-[10px] text-slate-400">{meta}</span>
              ) : null}
            </span>
            {item.loading ? <Spin size="small" /> : null}
            {item.onRemove ? (
              <Button type="text" size="small" disabled={item.removeDisabled} onClick={item.onRemove}>
                حذف
              </Button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

export default ComposerAttachmentChips;
