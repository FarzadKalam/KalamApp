import React, { useEffect, useMemo, useState } from 'react';
import { Button, Upload } from 'antd';
import { FileOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import RecordFilesManager from './RecordFilesManager';
import FileExtensionTile, { inferFileExtension } from './files/FileExtensionTile';
import ResilientImage from './common/ResilientImage';

interface RecordImageBoxProps {
  moduleId: string;
  recordId?: string | null;
  imageUrl?: string | null;
  canEdit?: boolean;
  canViewFilesManager?: boolean;
  canEditFilesManager?: boolean;
  canUploadFilesManager?: boolean;
  canDeleteFilesManager?: boolean;
  compact?: boolean;
  onImageUpdate?: (file: File) => Promise<boolean> | boolean;
  onMainImageChange?: (url: string | null) => void | Promise<void>;
  openFilesManagerByDefault?: boolean;
  highlightFileId?: string | null;
  onFilesManagerClose?: () => void;
  filesButtonLabel?: string;
}

type PreviewState = {
  url: string;
  kind: 'image' | 'file' | 'empty';
  extension: string;
  fileName: string | null;
  mimeType: string | null;
};

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp', 'avif', 'heic', 'heif']);

const EMPTY_PREVIEW: PreviewState = {
  url: '',
  kind: 'empty',
  extension: '',
  fileName: null,
  mimeType: null,
};

const inferExtension = (fileName?: string | null, url?: string | null, mimeType?: string | null) => {
  return inferFileExtension(fileName, url, mimeType);
};

const isImagePreview = (extension: string, mimeType?: string | null) => {
  const normalizedExt = String(extension || '').trim().replace(/^\./, '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(normalizedExt)) return true;
  return String(mimeType || '').toLowerCase().startsWith('image/');
};

const buildPreview = (url?: string | null, fileName?: string | null, mimeType?: string | null): PreviewState => {
  const normalizedUrl = String(url || '').trim();
  if (!normalizedUrl) return EMPTY_PREVIEW;
  const extension = inferExtension(fileName, normalizedUrl, mimeType);
  return {
    url: normalizedUrl,
    kind: isImagePreview(extension, mimeType) ? 'image' : 'file',
    extension: extension || 'FILE',
    fileName: String(fileName || '').trim() || null,
    mimeType: String(mimeType || '').trim() || null,
  };
};

const RecordImageBox: React.FC<RecordImageBoxProps> = ({
  moduleId,
  recordId,
  imageUrl,
  canEdit = false,
  canViewFilesManager = true,
  canEditFilesManager = true,
  canUploadFilesManager,
  canDeleteFilesManager = true,
  compact = false,
  onImageUpdate,
  onMainImageChange,
  openFilesManagerByDefault = false,
  highlightFileId = null,
  onFilesManagerClose,
  filesButtonLabel = '\u0641\u0627\u06CC\u0644 \u0647\u0627',
}) => {
  const [preview, setPreview] = useState<PreviewState>(EMPTY_PREVIEW);
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    if (!openFilesManagerByDefault) return;
    setGalleryOpen(true);
  }, [openFilesManagerByDefault]);

  useEffect(() => {
    const direct = String(imageUrl || '').trim();
    if (!moduleId || !recordId) {
      setPreview(buildPreview(direct || null, null, null));
      return;
    }

    let active = true;
    const loadPreview = async () => {
      try {
        if (direct) {
          const { data } = await supabase
            .from('record_files')
            .select('file_url,file_name,mime_type')
            .eq('module_id', moduleId)
            .eq('record_id', recordId)
            .eq('file_url', direct)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (!active) return;
          setPreview(buildPreview(direct, data?.file_name || null, data?.mime_type || null));
          return;
        }

        const { data, error } = await supabase
          .from('record_files')
          .select('file_url,file_name,mime_type')
          .eq('module_id', moduleId)
          .eq('record_id', recordId)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw error;

        if (!active) return;
        setPreview(buildPreview(data?.file_url || null, data?.file_name || null, data?.mime_type || null));
      } catch {
        if (!active) return;
        setPreview(buildPreview(direct || null, null, null));
      }
    };

    void loadPreview();
    return () => {
      active = false;
    };
  }, [imageUrl, moduleId, recordId]);

  const canOpenFilesGallery = Boolean(moduleId && recordId && canViewFilesManager);
  const previewAlt = useMemo(
    () => preview.fileName || (preview.kind === 'image' ? 'image' : 'file'),
    [preview.fileName, preview.kind],
  );
  const handleCloseManager = () => {
    setGalleryOpen(false);
    onFilesManagerClose?.();
  };

  const renderActions = () => (
    <div className="flex items-center gap-2">
      {canOpenFilesGallery ? (
        <>
          <Button
            type="primary"
            shape="circle"
            icon={<PlusOutlined />}
            className="border-none bg-leather-500"
            onClick={() => setGalleryOpen(true)}
            title="\u0627\u0641\u0632\u0648\u062F\u0646 \u0641\u0627\u06CC\u0644"
          />
          <Button type="default" size="small" onClick={() => setGalleryOpen(true)}>
            {filesButtonLabel}
          </Button>
        </>
      ) : null}
      {!canOpenFilesGallery && canEdit && onImageUpdate ? (
        <Upload showUploadList={false} beforeUpload={onImageUpdate}>
          <Button type="primary" icon={<UploadOutlined />} className="border-none bg-leather-500">
            {'\u0622\u067E\u0644\u0648\u062F \u0641\u0627\u06CC\u0644'}
          </Button>
        </Upload>
      ) : null}
    </div>
  );

  return (
    <>
      <div
        className={[
          'relative group overflow-hidden bg-gray-100 dark:bg-black/20',
          compact
            ? 'h-36 w-full rounded-xl border border-white dark:border-gray-700 shadow-md'
            : 'h-48 w-full rounded-2xl border-4 border-white dark:border-gray-700 shadow-xl',
        ].join(' ')}
      >
        {preview.kind === 'image' ? (
          <ResilientImage
            src={preview.url}
            preset="hero"
            alt={previewAlt}
            className="h-full w-full object-cover"
          />
        ) : preview.kind === 'file' ? (
          <FileExtensionTile fileName={preview.fileName} url={preview.url} mimeType={preview.mimeType} className="dark:from-gray-800 dark:to-gray-900 dark:text-gray-100" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-gray-300 dark:border-gray-600">
              <PlusOutlined className={compact ? 'text-base' : 'text-lg'} />
            </div>
            <span className={compact ? 'text-[11px]' : 'text-xs'}>{'\u0641\u0627\u06CC\u0644 \u0627\u0635\u0644\u06CC \u0627\u0646\u062A\u062E\u0627\u0628 \u0646\u0634\u062F\u0647'}</span>
          </div>
        )}

        <div className="absolute inset-0 hidden flex-col items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition-all group-hover:flex group-hover:opacity-100 md:flex">
          {renderActions()}
        </div>

        {preview.kind === 'empty' ? (
          <div className="absolute inset-x-0 bottom-2 flex items-center justify-center md:hidden">
            {renderActions()}
          </div>
        ) : null}

        {preview.kind === 'file' ? (
          <div className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-white">
            <FileOutlined /> {'\u0641\u0627\u06CC\u0644'}
          </div>
        ) : null}
      </div>

      {canOpenFilesGallery ? (
        <RecordFilesManager
          open={galleryOpen}
          onClose={handleCloseManager}
          moduleId={moduleId}
          recordId={recordId || undefined}
          mainImage={imageUrl || null}
          onMainImageChange={onMainImageChange}
          canEdit={canEdit && canEditFilesManager}
          canUpload={canUploadFilesManager ?? (canEdit && canEditFilesManager)}
          canDelete={canDeleteFilesManager}
          highlightFileId={highlightFileId || undefined}
        />
      ) : null}
    </>
  );
};

export default RecordImageBox;

