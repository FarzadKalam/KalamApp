import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Modal, Spin } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import { loadGalleryFileItems, loadRecordFileItems, type FileManagerListItem } from '../../utils/fileManagerQueries';
import type { NoteAttachment } from '../../utils/noteContent';
import FileManagerBrowser from './FileManagerBrowser';

type FileManagerPickerModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (attachments: NoteAttachment[]) => void;
  onUploadFiles?: (files: File[]) => void;
  moduleId?: string | null;
  recordId?: string | null;
  title?: string;
  multiple?: boolean;
  fileTypes?: Array<'image' | 'video' | 'file'>;
  zIndex?: number;
};

const getDisplayFileName = (item: Pick<FileManagerListItem, 'file_name' | 'file_url'>): string => {
  const direct = String(item.file_name || '').trim();
  if (direct) return direct;
  const raw = String(item.file_url || '').split('?')[0].split('/').pop() || '';
  if (!raw) return 'فایل';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const itemToAttachment = (item: FileManagerListItem): NoteAttachment => ({
  name: getDisplayFileName(item),
  url: String(item.file_url || '').trim(),
  mimeType: item.mime_type || null,
  assetId: item.asset_id || null,
  entryId: item.entry_id || null,
  moduleId: item.module_id || null,
  recordId: item.record_id || null,
  fileType: item.file_type || null,
});

const FileManagerPickerModal: React.FC<FileManagerPickerModalProps> = ({
  open,
  onClose,
  onSelect,
  onUploadFiles,
  moduleId,
  recordId,
  title = 'انتخاب فایل',
  multiple = true,
  fileTypes,
  zIndex = 13200,
}) => {
  const { message } = App.useApp();
  const uploadInputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<FileManagerListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFolderKey, setActiveFolderKey] = useState('all');

  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const hasRecordScope = Boolean(normalizedModuleId && normalizedRecordId);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const loaded = hasRecordScope
        ? await loadRecordFileItems(normalizedModuleId, normalizedRecordId, normalizedRecordId)
        : await loadGalleryFileItems();
      setItems(loaded.filter((item) => String(item.file_url || '').trim()));
    } catch (error) {
      console.warn('Could not load files for picker', error);
      message.error('بارگذاری فایل‌ها ناموفق بود');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setActiveFolderKey('all');
    void loadFiles();
  }, [open, normalizedModuleId, normalizedRecordId]);

  const typeSet = useMemo(() => new Set(fileTypes || []), [fileTypes]);

  const baseItems = useMemo(() => {
    if (typeSet.size === 0) return items;
    return items.filter((item) => typeSet.has(item.file_type));
  }, [items, typeSet]);

  const moduleTitleMap = useMemo(() => {
    return Object.keys(MODULES).reduce<Record<string, string>>((acc, key) => {
      acc[key] = MODULES[key]?.titles?.fa || key;
      return acc;
    }, {});
  }, []);

  const folders = useMemo(() => {
    if (hasRecordScope) {
      const byType = new Map<string, number>();
      baseItems.forEach((item) => byType.set(item.file_type, (byType.get(item.file_type) || 0) + 1));
      return [
        { key: 'all', label: 'همه فایل‌ها', count: baseItems.length, isSystem: true },
        { key: 'image', parentKey: 'all', label: 'عکس‌ها', count: byType.get('image') || 0, isSystem: true },
        { key: 'video', parentKey: 'all', label: 'فیلم‌ها', count: byType.get('video') || 0, isSystem: true },
        { key: 'file', parentKey: 'all', label: 'فایل‌ها', count: byType.get('file') || 0, isSystem: true },
      ];
    }

    const byModule = new Map<string, number>();
    baseItems.forEach((item) => {
      const key = String(item.module_id || '').trim();
      if (!key) return;
      byModule.set(key, (byModule.get(key) || 0) + 1);
    });
    return [
      { key: 'all', label: 'همه فایل‌ها', count: baseItems.length, isSystem: true },
      ...Array.from(byModule.entries()).map(([key, count]) => ({
        key,
        parentKey: 'all',
        label: moduleTitleMap[key] || key,
        count,
        isSystem: true,
      })),
    ];
  }, [baseItems, hasRecordScope, moduleTitleMap]);

  const visibleItems = useMemo(() => {
    if (activeFolderKey === 'all') return baseItems;
    if (hasRecordScope) return baseItems.filter((item) => item.file_type === activeFolderKey);
    return baseItems.filter((item) => item.module_id === activeFolderKey);
  }, [activeFolderKey, baseItems, hasRecordScope]);

  const handleSelect = (selected: FileManagerListItem[]) => {
    const attachments = selected
      .slice(0, multiple ? undefined : 1)
      .map(itemToAttachment)
      .filter((item) => item.url);
    if (attachments.length === 0) return;
    onSelect(attachments);
    onClose();
  };

  const handleUploadInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    onUploadFiles?.(multiple ? files : files.slice(0, 1));
    onClose();
  };

  return (
    <Modal
      title={title}
      open={open}
      onCancel={onClose}
      footer={null}
      width={980}
      zIndex={zIndex}
      destroyOnHidden
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-gray-500">فایل‌های موجود را انتخاب کنید یا از همین‌جا فایل جدید اضافه کنید.</div>
        <Button icon={<UploadOutlined />} onClick={() => uploadInputRef.current?.click()} disabled={!onUploadFiles}>
          آپلود از دستگاه
        </Button>
        <input
          ref={uploadInputRef}
          type="file"
          multiple={multiple}
          className="hidden"
          onChange={handleUploadInputChange}
        />
      </div>

      {loading ? (
        <div className="flex h-56 items-center justify-center">
          <Spin />
        </div>
      ) : (
        <FileManagerBrowser
          title="فایل‌ها"
          items={visibleItems}
          folders={folders}
          activeFolderKey={activeFolderKey}
          onFolderChange={setActiveFolderKey}
          onRefresh={() => void loadFiles()}
          recordTitleMap={hasRecordScope ? { [`${normalizedModuleId}:${normalizedRecordId}`]: normalizedRecordId } : {}}
          moduleTitleMap={moduleTitleMap}
          canDelete={false}
          canEdit={false}
          canShare={false}
          iconTileMinWidth={112}
          selectionMode
          selectionLabel={multiple ? 'اتصال فایل‌های انتخابی' : 'اتصال فایل'}
          onConfirmSelection={(selected) => handleSelect(selected as FileManagerListItem[])}
        />
      )}
    </Modal>
  );
};

export default FileManagerPickerModal;
