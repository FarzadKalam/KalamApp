import React, { useEffect, useState } from 'react';
import { Button, Image, Upload } from 'antd';
import { FileImageOutlined, PlusOutlined, UploadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import RecordFilesManager from './RecordFilesManager';

interface RecordImageBoxProps {
  moduleId: string;
  recordId?: string | null;
  imageUrl?: string | null;
  canEdit?: boolean;
  canViewFilesManager?: boolean;
  canEditFilesManager?: boolean;
  canDeleteFilesManager?: boolean;
  compact?: boolean;
  onImageUpdate?: (file: File) => Promise<boolean> | boolean;
  onMainImageChange?: (url: string | null) => void | Promise<void>;
}

const RecordImageBox: React.FC<RecordImageBoxProps> = ({
  moduleId,
  recordId,
  imageUrl,
  canEdit = false,
  canViewFilesManager = true,
  canEditFilesManager = true,
  canDeleteFilesManager = true,
  compact = false,
  onImageUpdate,
  onMainImageChange,
}) => {
  const [resolvedPreviewUrl, setResolvedPreviewUrl] = useState(String(imageUrl || '').trim());
  const [galleryOpen, setGalleryOpen] = useState(false);

  useEffect(() => {
    const direct = String(imageUrl || '').trim();
    if (direct) {
      setResolvedPreviewUrl(direct);
      return;
    }
    if (!moduleId || !recordId) {
      setResolvedPreviewUrl('');
      return;
    }

    let active = true;
    const loadPreview = async () => {
      try {
        const { data, error } = await supabase
          .from('record_files')
          .select('file_url')
          .eq('module_id', moduleId)
          .eq('record_id', recordId)
          .eq('file_type', 'image')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (active) {
          setResolvedPreviewUrl(String(data?.file_url || '').trim());
        }
      } catch {
        if (active) {
          setResolvedPreviewUrl('');
        }
      }
    };

    void loadPreview();
    return () => {
      active = false;
    };
  }, [imageUrl, moduleId, recordId]);

  const canOpenFilesGallery = Boolean(moduleId && recordId && canViewFilesManager);

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
        {resolvedPreviewUrl ? (
          <Image
            src={resolvedPreviewUrl}
            className="h-full w-full object-cover"
            wrapperStyle={{ width: '100%', height: '100%' }}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-gray-400">
            <FileImageOutlined className={compact ? 'text-2xl opacity-30' : 'text-3xl opacity-30'} />
            <span className={compact ? 'text-[11px]' : 'text-xs'}>بدون تصویر</span>
          </div>
        )}

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 backdrop-blur-sm transition-all group-hover:opacity-100">
          {(canOpenFilesGallery || (canEdit && onImageUpdate)) ? (
            <div className="flex items-center gap-2">
              {canOpenFilesGallery ? (
                <Button
                  type="primary"
                  shape="circle"
                  icon={<PlusOutlined />}
                  className="border-none bg-leather-500"
                  onClick={() => setGalleryOpen(true)}
                  title="افزودن سریع عکس/فایل"
                />
              ) : null}
              {canOpenFilesGallery ? (
                <Button type="default" size="small" onClick={() => setGalleryOpen(true)}>
                  گالری
                </Button>
              ) : null}
              {!canOpenFilesGallery && canEdit && onImageUpdate ? (
                <Upload showUploadList={false} beforeUpload={onImageUpdate}>
                  <Button
                    type="primary"
                    icon={<UploadOutlined />}
                    className="border-none bg-leather-500"
                  >
                    {compact ? 'تصویر' : 'تغییر تصویر'}
                  </Button>
                </Upload>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {canOpenFilesGallery ? (
        <RecordFilesManager
          open={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          moduleId={moduleId}
          recordId={recordId || undefined}
          mainImage={resolvedPreviewUrl || null}
          onMainImageChange={onMainImageChange}
          canEdit={canEdit && canEditFilesManager}
          canDelete={canDeleteFilesManager}
        />
      ) : null}
    </>
  );
};

export default RecordImageBox;
