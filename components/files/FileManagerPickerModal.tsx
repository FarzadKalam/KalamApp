import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Modal, Spin } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import { MODULES } from '../../moduleRegistry';
import {
  buildFileManagerTree,
  type FileManagerListItem,
  type FileManagerTreeResult,
} from '../../utils/fileManagerQueries';
import { createFileManagerShortcut } from '../../utils/fileManagerService';
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
  const [tree, setTree] = useState<FileManagerTreeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeFolderKey, setActiveFolderKey] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);

  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const hasRecordScope = Boolean(normalizedModuleId && normalizedRecordId);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const loaded = await buildFileManagerTree({
        page,
        pageSize,
        folderKey: activeFolderKey,
        initialModuleId: normalizedModuleId,
        initialRecordId: normalizedRecordId,
        fileTypes,
        moduleTitleMap,
      });
      setTree(loaded);
      if (!activeFolderKey || activeFolderKey === 'all') {
        setActiveFolderKey(loaded.initialFolderKey);
      } else if (loaded.activeFolderKey !== activeFolderKey) {
        setActiveFolderKey(loaded.activeFolderKey);
      }
    } catch (error) {
      console.warn('Could not load files for picker', error);
      message.error('بارگذاری فایل‌ها ناموفق بود');
      setTree(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setActiveFolderKey('all');
    setPage(1);
    void loadFiles();
  }, [open, normalizedModuleId, normalizedRecordId]);

  const moduleTitleMap = useMemo(() => {
    return Object.keys(MODULES).reduce<Record<string, string>>((acc, key) => {
      acc[key] = MODULES[key]?.titles?.fa || key;
      return acc;
    }, {});
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadFiles();
  }, [activeFolderKey, page, pageSize, fileTypes?.join('|')]);

  const handleSelect = async (selected: FileManagerListItem[]) => {
    const limited = selected.slice(0, multiple ? undefined : 1);
    const resolvedItems = await Promise.all(limited.map(async (item) => {
      const sourceModuleId = String(item.module_id || '').trim();
      const sourceRecordId = String(item.record_id || '').trim();
      const isForeign = hasRecordScope && (sourceModuleId !== normalizedModuleId || sourceRecordId !== normalizedRecordId);
      if (!isForeign || !item.asset_id) return item;
      try {
        const created = await createFileManagerShortcut({
          assetId: item.asset_id,
          sourceEntryId: item.entry_id || null,
          sourceModuleId,
          sourceRecordId,
          sourceRecordTitle: item.source_record_title || getDisplayFileName(item),
          targetModuleId: normalizedModuleId,
          targetRecordId: normalizedRecordId,
          targetRecordTitle: normalizedRecordId,
          fileUrl: item.file_url,
          fileName: getDisplayFileName(item),
          mimeType: item.mime_type || null,
          fileType: item.file_type,
        });
        return {
          ...item,
          id: String(created?.recordFileId || created?.entry?.id || item.id),
          entry_id: created?.entry?.id ? String(created.entry.id) : item.entry_id,
          module_id: normalizedModuleId,
          record_id: normalizedRecordId,
          is_shortcut: true,
          source_module_id: sourceModuleId,
          source_record_id: sourceRecordId,
        };
      } catch (error) {
        console.warn('Could not create shortcut for picked file', error);
        message.warning('میانبر بعضی فایل‌ها ساخته نشد؛ فایل به عنوان لینک پیوست شد');
        return item;
      }
    }));
    const attachments = resolvedItems
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
          items={tree?.items || []}
          folders={tree?.folders || []}
          activeFolderKey={activeFolderKey}
          onFolderChange={(key) => {
            setPage(1);
            setActiveFolderKey(key);
          }}
          onRefresh={() => void loadFiles()}
          recordTitleMap={tree?.recordTitleMap || (hasRecordScope ? { [`${normalizedModuleId}:${normalizedRecordId}`]: normalizedRecordId } : {})}
          moduleTitleMap={moduleTitleMap}
          canDelete={false}
          canEdit={false}
          canShare={false}
          iconTileMinWidth={112}
          selectionMode
          selectionItems={tree?.allItems || []}
          clearSelectionOnFolderChange={false}
          page={page}
          pageSize={pageSize}
          totalItems={tree?.totalItems || 0}
          onPageChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
          selectionLabel={multiple ? 'اتصال فایل‌های انتخابی' : 'اتصال فایل'}
          onConfirmSelection={(selected) => void handleSelect(selected as FileManagerListItem[])}
        />
      )}
    </Modal>
  );
};

export default FileManagerPickerModal;
