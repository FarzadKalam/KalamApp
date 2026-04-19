import React, { useMemo } from 'react';

const FILE_EXTENSION_STYLE_MAP: Record<string, string> = {
  PDF: 'bg-red-100 text-red-700 border-red-200',
  ZIP: 'bg-amber-100 text-amber-700 border-amber-200',
  RAR: 'bg-amber-100 text-amber-700 border-amber-200',
  '7Z': 'bg-amber-100 text-amber-700 border-amber-200',
  XLS: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  XLSX: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CSV: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  DOC: 'bg-blue-100 text-blue-700 border-blue-200',
  DOCX: 'bg-blue-100 text-blue-700 border-blue-200',
  PPT: 'bg-orange-100 text-orange-700 border-orange-200',
  PPTX: 'bg-orange-100 text-orange-700 border-orange-200',
  PSD: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  AI: 'bg-orange-100 text-orange-700 border-orange-200',
  MP4: 'bg-violet-100 text-violet-700 border-violet-200',
  MOV: 'bg-violet-100 text-violet-700 border-violet-200',
  AVI: 'bg-violet-100 text-violet-700 border-violet-200',
  MP3: 'bg-pink-100 text-pink-700 border-pink-200',
  WAV: 'bg-pink-100 text-pink-700 border-pink-200',
  CAD: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  DWG: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  DXF: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

const normalizeExtension = (value?: string | null) => String(value || '').trim().replace(/^\./, '').toUpperCase() || 'FILE';

export const inferFileExtension = (fileName?: string | null, url?: string | null, mimeType?: string | null) => {
  const fromName = String(fileName || '').trim();
  if (fromName.includes('.')) {
    return normalizeExtension(fromName.split('.').pop());
  }

  const fromUrl = String(url || '').trim();
  if (fromUrl) {
    const clean = fromUrl.split('?')[0].split('#')[0];
    const segment = clean.split('/').pop() || '';
    if (segment.includes('.')) {
      return normalizeExtension(segment.split('.').pop());
    }
  }

  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  if (normalizedMime.includes('/')) {
    return normalizeExtension(normalizedMime.split('/').pop());
  }

  return 'FILE';
};

type FileExtensionTileProps = {
  fileName?: string | null;
  url?: string | null;
  mimeType?: string | null;
  compact?: boolean;
  className?: string;
};

const FileExtensionTile: React.FC<FileExtensionTileProps> = ({
  fileName,
  url,
  mimeType,
  compact = false,
  className = '',
}) => {
  const extension = useMemo(() => inferFileExtension(fileName, url, mimeType), [fileName, mimeType, url]);
  const chipClassName = useMemo(() => {
    const key = String(extension || 'FILE').toUpperCase();
    return FILE_EXTENSION_STYLE_MAP[key] || 'bg-gray-100 text-gray-700 border-gray-200';
  }, [extension]);

  return (
    <div
      className={[
        'relative flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-gray-200 text-gray-700',
        compact ? 'rounded-xl' : 'rounded-2xl',
        className,
      ].join(' ')}
    >
      <div className={`rounded-xl border px-3 py-1.5 text-xl font-black tracking-wider ${chipClassName}`}>
        {extension || 'FILE'}
      </div>
      <div className="max-w-[90%] truncate text-[11px] text-gray-500" title={fileName || url || ''}>
        {fileName || url || 'فایل'}
      </div>
    </div>
  );
};

export default FileExtensionTile;
