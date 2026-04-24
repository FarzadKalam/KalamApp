import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Modal,
  Pagination,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
  theme,
  Tooltip,
  Typography,
} from 'antd';
import {
  AppstoreOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  CopyOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FileOutlined,
  FolderAddOutlined,
  FolderFilled,
  FolderOpenOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  RetweetOutlined,
  RightOutlined,
  ShareAltOutlined,
  StarFilled,
  StarOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { buildImagePreviewUrl } from '../../utils/imagePreview';
import { getOrCreateShortFileUrl } from '../../utils/fileShortLinks';
import { supabase } from '../../supabaseClient';
import { buildZipArchive } from '../../utils/zipArchive';
import FileExtensionTile from './FileExtensionTile';
import TagInput from '../TagInput';

const { Text } = Typography;

export type FileManagerBrowserItem = {
  id: string;
  asset_id?: string | null;
  entry_id?: string | null;
  folder_id?: string | null;
  module_id?: string;
  record_id?: string;
  file_url: string;
  file_type: 'image' | 'video' | 'file';
  file_name: string | null;
  mime_type: string | null;
  created_at?: string | null;
  is_main_image?: boolean;
  source_module_id?: string | null;
  source_record_id?: string | null;
  source_record_title?: string | null;
  visibility?: 'private' | 'org' | 'public' | null;
  source_kind?: 'entry' | 'legacy' | 'synthetic' | 'note_attachment' | null;
  is_shortcut?: boolean;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
};

export type FileManagerBrowserFolder = {
  key: string;
  label: string;
  parentKey?: string | null;
  count?: number;
  isSystem?: boolean;
  isDeletedRecord?: boolean;
  colorToken?: string | null;
  folderType?: string | null;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
};

type FileManagerBrowserProps = {
  title?: string;
  items: FileManagerBrowserItem[];
  loading?: boolean;
  refreshing?: boolean;
  emptyDescription?: string;
  folders?: FileManagerBrowserFolder[];
  activeFolderKey?: string;
  onFolderChange?: (key: string) => void;
  onOpenItem?: (item: FileManagerBrowserItem) => void;
  onRefresh?: () => void | Promise<void>;
  onDeleteItem?: (item: FileManagerBrowserItem) => void | Promise<void>;
  onCopyItems?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  copyItemsLabel?: string;
  onCreateShortcutsHere?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  onMoveItems?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  onRenameItem?: (item: FileManagerBrowserItem) => void | Promise<void>;
  onCreateFolder?: (parentKey: string) => void | Promise<void>;
  onRenameFolder?: (folder: FileManagerBrowserFolder) => void | Promise<void>;
  onDeleteFolder?: (folder: FileManagerBrowserFolder) => void | Promise<void>;
  recordTitleMap?: Record<string, string>;
  moduleTitleMap?: Record<string, string>;
  showSourceBadges?: boolean;
  canDelete?: boolean;
  canShare?: boolean;
  canEdit?: boolean;
  defaultViewMode?: 'icon' | 'card';
  selectionMode?: boolean;
  selectionLabel?: string;
  onConfirmSelection?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  selectionItems?: FileManagerBrowserItem[];
  clearSelectionOnFolderChange?: boolean;
  highlightItemId?: string | null;
  iconTileMinWidth?: number;
  page?: number;
  pageSize?: number;
  totalItems?: number;
  onPageChange?: (page: number, pageSize: number) => void;
  mainImageUrl?: string | null;
  canSetMainImage?: boolean;
  setMainImageLabel?: string;
  onSetMainImages?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  directShareTargetOptions?: Array<{ label: string; value: string }>;
  onDirectShareItems?: (
    items: FileManagerBrowserItem[],
    urls: string[],
    options: { publicAccess: boolean; deliveryMode: FileShareDeliveryMode },
    recipientIds: string[],
  ) => void | Promise<void>;
  onAddCompressedArchive?: (
    archive: { blob: Blob; fileName: string; sourceItems: FileManagerBrowserItem[] },
  ) => Promise<FileManagerBrowserItem>;
  onUpdateItemTags?: (
    item: FileManagerBrowserItem,
    tags: Array<{ id: string; title: string; color?: string | null }>,
  ) => void | Promise<void>;
};

type FileShareDeliveryMode = 'original' | 'preview' | 'compressed';

const ICON_GRID_VIRTUALIZATION_THRESHOLD = 80;
const ICON_GRID_ROW_HEIGHT = 134;

const SOURCE_KIND_META: Record<
  'entry' | 'legacy' | 'synthetic' | 'note_attachment',
  { label: string; color: string }
> = {
  entry: { label: 'اصلی', color: 'success' },
  legacy: { label: 'سازگاری', color: 'gold' },
  synthetic: { label: 'سازگاری', color: 'gold' },
  note_attachment: { label: 'پیوست یادداشت', color: 'purple' },
};

type IconGridEntry =
  | { key: string; type: 'folder'; folder: FileManagerBrowserFolder }
  | { key: string; type: 'item'; item: FileManagerBrowserItem };

const FILE_SHARE_DELIVERY_OPTIONS: Array<{ label: string; value: FileShareDeliveryMode }> = [
  { label: 'فایل اصلی', value: 'original' },
  { label: 'پیش نمایش', value: 'preview' },
  { label: 'فشرده', value: 'compressed' },
];

const isCompressedFileLike = (item: Pick<FileManagerBrowserItem, 'file_name' | 'file_url' | 'mime_type'>) => {
  const name = `${String(item.file_name || '')} ${String(item.file_url || '')}`.toLowerCase();
  const mime = String(item.mime_type || '').toLowerCase();
  return mime.includes('zip')
    || mime.includes('rar')
    || mime.includes('7z')
    || mime.includes('x-tar')
    || /\.(zip|rar|7z|tar|gz|tgz|bz2|xz)(\?|#|$)/i.test(name);
};

const getDisplayFileName = (item: Pick<FileManagerBrowserItem, 'file_name' | 'file_url'>): string => {
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

const renderPreview = (item: FileManagerBrowserItem, compact = false) => {
  const mediaClass = compact
    ? 'w-full h-20 object-cover rounded-xl border border-gray-100'
    : 'w-full h-44 object-cover rounded-xl border border-gray-100';

  if (item.file_type === 'image') {
    return <PreviewImage src={item.file_url} preset={compact ? 'thumb' : 'gallery'} alt={item.file_name || 'image'} className={mediaClass} />;
  }

  if (item.file_type === 'video') {
    return (
      <div className={`${compact ? 'h-20' : 'h-44'} flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300`}>
        <div className="flex flex-col items-center gap-2">
          <FileOutlined className={compact ? 'text-xl' : 'text-3xl'} />
          <span className="text-[11px] font-semibold tracking-[0.18em]">VIDEO</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'h-20' : 'h-44'} rounded-xl border border-gray-200 overflow-hidden`}>
      <FileExtensionTile fileName={item.file_name} url={item.file_url} mimeType={item.mime_type} compact={compact} />
    </div>
  );
};

const renderCompactTags = (tags?: Array<{ id: string; title: string; color?: string | null }>, limit = 2) => {
  const visibleTags = (tags || []).filter((tag) => String(tag?.title || '').trim()).slice(0, limit);
  if (visibleTags.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
      {visibleTags.map((tag) => (
        <Tag key={tag.id} color={tag.color || 'default'} className="m-0 rounded-full text-[10px]">
          {tag.title}
        </Tag>
      ))}
      {(tags || []).length > limit ? <Tag className="m-0 rounded-full text-[10px]">+{(tags || []).length - limit}</Tag> : null}
    </div>
  );
};

const getSourceKindMeta = (item: Pick<FileManagerBrowserItem, 'source_kind' | 'is_shortcut'>) => {
  if (item.is_shortcut) return null;
  const kind = item.source_kind || 'entry';
  return SOURCE_KIND_META[kind] || null;
};

const formatDateTime = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const PreviewImage: React.FC<{ src: string; alt: string; className: string; preset: 'thumb' | 'gallery' }> = React.memo(({
  src,
  alt,
  className,
  preset,
}) => {
  const [retry, setRetry] = useState(0);
  const previewUrl = useMemo(() => {
    const url = buildImagePreviewUrl(src, preset);
    if (retry === 0) return url;
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}fm_retry=${retry}`;
  }, [preset, retry, src]);

  return (
    <img
      src={previewUrl}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      onError={() => {
        if (retry < 3) window.setTimeout(() => setRetry((value) => value + 1), 700 * (retry + 1));
      }}
    />
  );
});

const VirtualizedIconGrid: React.FC<{
  entries: IconGridEntry[];
  minTileWidth: number;
  renderTile: (entry: IconGridEntry) => React.ReactNode;
}> = React.memo(({
  entries,
  minTileWidth,
  renderTile,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const syncSize = () => {
      setContainerWidth(node.clientWidth);
      setViewportHeight(node.clientHeight);
    };

    syncSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(syncSize);
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', syncSize);
    return () => window.removeEventListener('resize', syncSize);
  }, []);

  const columnCount = Math.max(1, Math.floor((containerWidth || minTileWidth) / Math.max(1, minTileWidth)));
  const rowCount = Math.max(1, Math.ceil(entries.length / columnCount));
  const totalHeight = rowCount * ICON_GRID_ROW_HEIGHT;
  const overscanRows = 3;
  const startRow = Math.max(0, Math.floor(scrollTop / ICON_GRID_ROW_HEIGHT) - overscanRows);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + Math.max(viewportHeight, ICON_GRID_ROW_HEIGHT)) / ICON_GRID_ROW_HEIGHT) + overscanRows,
  );
  const startIndex = startRow * columnCount;
  const endIndex = Math.min(entries.length, endRow * columnCount);
  const visibleEntries = entries.slice(startIndex, endIndex);
  const tileWidth = containerWidth > 0 ? containerWidth / columnCount : minTileWidth;

  return (
    <div
      ref={containerRef}
      className="max-h-[62vh] overflow-y-auto"
      onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
    >
      <div className="relative" style={{ height: totalHeight }}>
        {visibleEntries.map((entry, index) => {
          const absoluteIndex = startIndex + index;
          const rowIndex = Math.floor(absoluteIndex / columnCount);
          const columnIndex = absoluteIndex % columnCount;
          return (
            <div
              key={entry.key}
              className="absolute"
              style={{
                top: rowIndex * ICON_GRID_ROW_HEIGHT,
                left: columnIndex * tileWidth,
                width: tileWidth,
                height: ICON_GRID_ROW_HEIGHT,
                padding: 4,
              }}
            >
              {renderTile(entry)}
            </div>
          );
        })}
      </div>
    </div>
  );
});

const FileManagerBrowser: React.FC<FileManagerBrowserProps> = ({
  title,
  items,
  loading = false,
  refreshing = false,
  emptyDescription = 'فایلی ثبت نشده است.',
  folders = [],
  activeFolderKey = 'all',
  onFolderChange,
  onOpenItem,
  onRefresh,
  onDeleteItem,
  onCopyItems,
  onCreateShortcutsHere,
  copyItemsLabel = 'کپی',
  onMoveItems,
  onRenameItem,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  recordTitleMap = {},
  moduleTitleMap = {},
  showSourceBadges = false,
  canDelete = true,
  canShare = true,
  canEdit = true,
  defaultViewMode = 'icon',
  selectionMode = false,
  selectionLabel = 'انتخاب فایل‌ها',
  onConfirmSelection,
  selectionItems,
  clearSelectionOnFolderChange = true,
  highlightItemId = null,
  iconTileMinWidth = 92,
  page = 1,
  pageSize = 60,
  totalItems,
  onPageChange,
  mainImageUrl = null,
  canSetMainImage = false,
  setMainImageLabel = 'ستاره تصویر اصلی',
  onSetMainImages,
  directShareTargetOptions = [],
  onDirectShareItems,
  onAddCompressedArchive,
  onUpdateItemTags,
}) => {
  const { message, modal } = App.useApp();
  const { token } = theme.useToken();
  const [viewMode, setViewMode] = useState<'icon' | 'card'>(defaultViewMode);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<string[]>([]);
  const [detailsItem, setDetailsItem] = useState<FileManagerBrowserItem | null>(null);
  const [previewItem, setPreviewItem] = useState<FileManagerBrowserItem | null>(null);
  const [detailsShortUrl, setDetailsShortUrl] = useState('');
  const [detailsTags, setDetailsTags] = useState<Array<{ id: string; title: string; color?: string | null }>>([]);
  const [detailsSaving, setDetailsSaving] = useState(false);
  const [shareItems, setShareItems] = useState<FileManagerBrowserItem[]>([]);
  const [sharePublicAccess, setSharePublicAccess] = useState(false);
  const [shareDeliveryMode, setShareDeliveryMode] = useState<FileShareDeliveryMode>('original');
  const [shareShortUrls, setShareShortUrls] = useState<string[]>([]);
  const [shareLongUrls, setShareLongUrls] = useState<string[]>([]);
  const [shareLoading, setShareLoading] = useState(false);
  const [directRecipientIds, setDirectRecipientIds] = useState<string[]>([]);
  const [directSending, setDirectSending] = useState(false);
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [zipFileName, setZipFileName] = useState('');
  const [zipProgress, setZipProgress] = useState(0);
  const [zipBuilding, setZipBuilding] = useState(false);
  const [zipAdding, setZipAdding] = useState(false);
  const [zipArchiveItem, setZipArchiveItem] = useState<FileManagerBrowserItem | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const [internalPageSize, setInternalPageSize] = useState(pageSize);

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [defaultViewMode]);

  useEffect(() => {
    if (clearSelectionOnFolderChange) setSelectedIds([]);
    setSelectedFolderKeys([]);
    setInternalPage(1);
  }, [activeFolderKey, clearSelectionOnFolderChange]);

  useEffect(() => {
    const normalizedHighlightId = String(highlightItemId || '').trim();
    if (!normalizedHighlightId) return;
    if (!items.some((item) => item.id === normalizedHighlightId)) return;
    setSelectedIds([normalizedHighlightId]);
  }, [highlightItemId, items]);

  const selectedIdSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedFolderKeySet = useMemo(() => new Set(selectedFolderKeys), [selectedFolderKeys]);
  const selectedItems = useMemo(() => {
    const itemMap = new Map((selectionItems || items).map((item) => [item.id, item]));
    return selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as FileManagerBrowserItem[];
  }, [items, selectedIds, selectionItems]);

  const folderMap = useMemo(() => {
    const next = new Map<string, FileManagerBrowserFolder>();
    folders.forEach((folder) => next.set(folder.key, folder));
    return next;
  }, [folders]);

  const activeFolder = folderMap.get(activeFolderKey) || null;
  const canCreateFolderInActivePath = activeFolderKey.startsWith('folder:') || activeFolderKey.startsWith('record:');

  const breadcrumbFolders = useMemo(() => {
    const chain: FileManagerBrowserFolder[] = [];
    const seen = new Set<string>();
    let cursor = activeFolder;
    while (cursor && !seen.has(cursor.key)) {
      seen.add(cursor.key);
      if (cursor.key !== 'all') chain.unshift(cursor);
      const parentKey = String(cursor.parentKey || '').trim();
      cursor = parentKey ? folderMap.get(parentKey) || null : null;
    }
    return chain;
  }, [activeFolder, folderMap]);

  const visibleFolders = useMemo(() => {
    if (folders.length === 0) return [];
    const byParent = folders.filter((folder) => String(folder.parentKey || 'all') === activeFolderKey && folder.key !== activeFolderKey);
    if (byParent.length > 0 || folders.some((folder) => folder.parentKey !== undefined)) return byParent;
    return folders;
  }, [activeFolderKey, folders]);

  const totalFileCount = Number.isFinite(totalItems as number) ? Number(totalItems) : items.length;
  const visibleEntryCount = visibleFolders.length + totalFileCount;
  const displayedItems = useMemo(() => {
    if (onPageChange) return items;
    if (!Number.isFinite(totalItems as number) && items.length > pageSize) {
      const start = (Math.max(1, internalPage) - 1) * internalPageSize;
      return items.slice(start, start + internalPageSize);
    }
    return items;
  }, [internalPage, internalPageSize, items, onPageChange, pageSize, totalItems]);
  const effectiveTotalItems = Number.isFinite(totalItems as number) ? Number(totalItems) : items.length;
  const effectivePage = onPageChange ? page : internalPage;
  const effectivePageSize = onPageChange ? pageSize : internalPageSize;
  const showPagination = effectiveTotalItems > effectivePageSize;
  const deferredVisibleFolders = React.useDeferredValue(visibleFolders);
  const deferredDisplayedItems = React.useDeferredValue(displayedItems);
  const deferredGridEntries = useMemo<IconGridEntry[]>(
    () => [
      ...deferredVisibleFolders.map((folder) => ({ key: `folder:${folder.key}`, type: 'folder' as const, folder })),
      ...deferredDisplayedItems.map((item) => ({ key: item.id, type: 'item' as const, item })),
    ],
    [deferredDisplayedItems, deferredVisibleFolders],
  );
  const selectedFolders = useMemo(() => {
    return visibleFolders.filter((folder) => selectedFolderKeySet.has(folder.key));
  }, [selectedFolderKeySet, visibleFolders]);
  const totalSelectedCount = selectedItems.length + selectedFolders.length;
  const selectedImageItems = useMemo(
    () => selectedItems.filter((item) => item.file_type === 'image'),
    [selectedItems],
  );
  const normalizedMainImageUrl = String(mainImageUrl || '').trim();
  const getDeleteConfirmBody = (nextItems: FileManagerBrowserItem[], nextFolders: FileManagerBrowserFolder[]) => {
    const previewLines = [
      ...nextFolders.map((folder) => `پوشه: ${folder.label}`),
      ...nextItems.map((item) => `فایل: ${getDisplayFileName(item)}`),
    ].slice(0, 6);
    const hiddenCount = Math.max(0, nextItems.length + nextFolders.length - previewLines.length);
    return (
      <div className="space-y-3 text-sm">
        <div className="rounded-xl border px-3 py-2" style={{ borderColor: token.colorErrorBorder, background: token.colorErrorBg }}>
          <div className="font-bold" style={{ color: token.colorError }}>
            {nextFolders.length > 0 && nextItems.length > 0
              ? `در حال حذف ${nextFolders.length} پوشه و ${nextItems.length} فایل هستید.`
              : nextFolders.length > 0
                ? `در حال حذف ${nextFolders.length} پوشه هستید.`
                : `در حال حذف ${nextItems.length} فایل هستید.`}
          </div>
          <div className="mt-1" style={{ color: token.colorTextSecondary }}>
            این عملیات بازگشت‌پذیر نیست و روی محتوای انتخاب‌شده اعمال می‌شود.
          </div>
        </div>
        {previewLines.length > 0 ? (
          <div className="rounded-xl border px-3 py-2" style={{ borderColor: token.colorBorder, background: token.colorFillAlter }}>
            <div className="mb-2 font-bold" style={{ color: token.colorTextHeading }}>موارد انتخاب‌شده</div>
            <div className="space-y-1">
              {previewLines.map((line) => (
                <div key={line} className="truncate" style={{ color: token.colorText }}>{line}</div>
              ))}
              {hiddenCount > 0 ? (
                <div style={{ color: token.colorTextSecondary }}>
                  و {hiddenCount} مورد دیگر...
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    );
  };
  const shareDeliveryOptions = useMemo(() => {
    if (shareItems.length === 0) return FILE_SHARE_DELIVERY_OPTIONS;
    if (shareItems.length > 1) {
      const allImages = shareItems.every((item) => item.file_type === 'image');
      return FILE_SHARE_DELIVERY_OPTIONS.filter((option) => allImages || option.value !== 'preview');
    }
    const item = shareItems[0];
    if (isCompressedFileLike(item)) {
      return FILE_SHARE_DELIVERY_OPTIONS.filter((option) => option.value === 'original');
    }
    if (item.file_type === 'image') {
      return FILE_SHARE_DELIVERY_OPTIONS;
    }
    return FILE_SHARE_DELIVERY_OPTIONS.filter((option) => option.value !== 'preview');
  }, [shareItems]);

  const toggleItemSelection = (itemId: string) => {
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]));
  };

  const toggleFolderSelection = (folderKey: string) => {
    setSelectedFolderKeys((prev) => (prev.includes(folderKey) ? prev.filter((key) => key !== folderKey) : [...prev, folderKey]));
  };

  const renameSelectedEntry = () => {
    if (totalSelectedCount !== 1) return;
    if (selectedFolders[0]) {
      onRenameFolder?.(selectedFolders[0]);
      return;
    }
    if (selectedItems[0]) onRenameItem?.(selectedItems[0]);
  };

  const markAsMainImages = (nextItems: FileManagerBrowserItem[]) => {
    const validItems = nextItems.filter((item) => item.file_type === 'image');
    if (validItems.length === 0 || !onSetMainImages) return;
    onSetMainImages(validItems);
  };

  const deleteSelectedEntries = async () => {
    if (totalSelectedCount === 0) return;
    const nextFolders = [...selectedFolders];
    const nextItems = [...selectedItems];
    modal.confirm({
      title: 'حذف موارد انتخاب‌شده',
      icon: <ExclamationCircleOutlined style={{ color: token.colorError }} />,
      content: getDeleteConfirmBody(nextItems, nextFolders),
      okText: 'حذف',
      cancelText: 'انصراف',
      centered: true,
      okButtonProps: { danger: true },
      zIndex: 14050,
      styles: {
        content: { background: token.colorBgElevated },
        header: { background: token.colorBgElevated, color: token.colorTextHeading },
        body: { color: token.colorText },
        footer: { background: token.colorBgElevated },
      },
      onOk: async () => {
        for (const folder of nextFolders) {
          await onDeleteFolder?.(folder);
        }
        for (const item of nextItems) {
          await onDeleteItem?.(item);
        }
        setSelectedFolderKeys([]);
        setSelectedIds([]);
      },
    });
  };

  const navigateToParentFolder = () => {
    const parentKey = String(activeFolder?.parentKey || '').trim();
    if (parentKey) {
      onFolderChange?.(parentKey);
      return;
    }
    if (activeFolderKey !== 'all') onFolderChange?.('all');
  };

  const requestFolderDelete = (folder: FileManagerBrowserFolder) => {
    if (!onDeleteFolder) return;
    modal.confirm({
      title: 'حذف پوشه',
      icon: <ExclamationCircleOutlined style={{ color: token.colorError }} />,
      content: getDeleteConfirmBody([], [folder]),
      okText: 'حذف',
      cancelText: 'انصراف',
      centered: true,
      okButtonProps: { danger: true },
      zIndex: 14050,
      styles: {
        content: { background: token.colorBgElevated },
        header: { background: token.colorBgElevated, color: token.colorTextHeading },
        body: { color: token.colorText },
        footer: { background: token.colorBgElevated },
      },
      onOk: () => onDeleteFolder(folder),
    });
  };

  const openDetails = async (item: FileManagerBrowserItem) => {
    setDetailsItem(item);
    setDetailsShortUrl('');
    setDetailsTags(Array.isArray(item.tags) ? item.tags : []);
    try {
      const nextShortUrl = await getOrCreateShortFileUrl(item.file_url, {
        assetId: item.asset_id || null,
        entryId: item.entry_id || null,
        moduleId: item.module_id || null,
        recordId: item.record_id || null,
        title: getDisplayFileName(item),
      });
      setDetailsShortUrl(nextShortUrl);
    } catch (error) {
      console.warn('Could not build short link for details modal', error);
    }
  };

  const getShareTargetUrl = (item: FileManagerBrowserItem, mode: FileShareDeliveryMode) => {
    if (mode === 'preview' && item.file_type === 'image') {
      return buildImagePreviewUrl(item.file_url, 'gallery');
    }
    return item.file_url;
  };

  const getEffectiveShareItems = (deliveryMode: FileShareDeliveryMode, archiveItem = zipArchiveItem) => {
    if (deliveryMode === 'compressed') return archiveItem ? [archiveItem] : [];
    return shareItems;
  };

  const buildShareUrls = async (
    nextItems: FileManagerBrowserItem[],
    publicAccess: boolean,
    deliveryMode: FileShareDeliveryMode,
  ) => {
    if (nextItems.length === 0) {
      setShareShortUrls([]);
      setShareLongUrls([]);
      return;
    }

    setShareLoading(true);
    try {
      const effectiveItems = deliveryMode === 'compressed' ? nextItems : nextItems;
      const assetIds = Array.from(new Set(effectiveItems.map((item) => String(item.asset_id || '').trim()).filter(Boolean)));
      if (assetIds.length > 0) {
        await supabase
          .from('file_assets')
          .update({ visibility: publicAccess ? 'public' : 'private', is_public: publicAccess })
          .in('id', assetIds);
      }
      const longUrls = effectiveItems.map((item) => getShareTargetUrl(item, deliveryMode));
      const shortUrls = await Promise.all(effectiveItems.map((item) => {
        const targetUrl = getShareTargetUrl(item, deliveryMode);
        const variantKey = [
          'file-share',
          item.entry_id || item.asset_id || targetUrl,
          publicAccess ? 'public' : 'scoped',
          deliveryMode,
        ].join(':');
        return getOrCreateShortFileUrl(targetUrl, {
          assetId: item.asset_id || null,
          entryId: item.entry_id || null,
          moduleId: item.module_id || null,
          recordId: item.record_id || null,
          title: getDisplayFileName(item),
          metadata: {
            variant_key: variantKey,
            share_public_access: publicAccess,
            share_delivery_mode: deliveryMode,
            share_file_name: getDisplayFileName(item),
          },
        });
      }));
      setShareLongUrls(longUrls);
      setShareShortUrls(shortUrls);
    } catch (error) {
      console.warn('Could not build file share links', error);
      message.error('ساخت لینک اشتراک ناموفق بود');
    } finally {
      setShareLoading(false);
    }
  };

  const openShareModal = (nextItems: FileManagerBrowserItem[]) => {
    const validItems = nextItems.filter((item) => String(item.file_url || '').trim());
    if (validItems.length === 0) return;
    const nextPublicAccess = validItems.some((item) => item.visibility === 'public');
    setShareItems(validItems);
    setSharePublicAccess(nextPublicAccess);
    setShareDeliveryMode('original');
    setDirectRecipientIds([]);
    setZipBlob(null);
    setZipFileName('');
    setZipProgress(0);
    setZipArchiveItem(null);
    setShareShortUrls([]);
    setShareLongUrls([]);
    void buildShareUrls(validItems, nextPublicAccess, 'original');
  };

  const updateShareOptions = (nextPublicAccess: boolean, nextDeliveryMode: FileShareDeliveryMode) => {
    setSharePublicAccess(nextPublicAccess);
    setShareDeliveryMode(nextDeliveryMode);
    if (nextDeliveryMode === 'compressed') {
      const effectiveItems = getEffectiveShareItems(nextDeliveryMode);
      if (effectiveItems.length > 0) {
        void buildShareUrls(effectiveItems, nextPublicAccess, nextDeliveryMode);
      } else {
        setShareShortUrls([]);
        setShareLongUrls([]);
      }
      return;
    }
    void buildShareUrls(shareItems, nextPublicAccess, nextDeliveryMode);
  };

  const buildArchiveFileName = () => {
    const firstName = shareItems.length === 1 ? getDisplayFileName(shareItems[0]).replace(/\.[^.]+$/, '') : 'files';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `${firstName || 'files'}-${stamp}.zip`;
  };

  const handleBuildZipArchive = async () => {
    if (shareItems.length === 0) return;
    setZipBuilding(true);
    setZipProgress(0);
    setZipBlob(null);
    setZipArchiveItem(null);
    setShareShortUrls([]);
    setShareLongUrls([]);
    try {
      const blob = await buildZipArchive(
        shareItems.map((item) => ({
          name: getDisplayFileName(item),
          url: item.file_url,
        })),
        (progress) => {
          const total = Math.max(1, progress.total);
          setZipProgress(Math.round((progress.loaded / total) * 100));
        },
      );
      const fileName = buildArchiveFileName();
      setZipBlob(blob);
      setZipFileName(fileName);
      setZipProgress(100);
      message.success('فشرده‌سازی انجام شد');
    } catch (error) {
      console.warn('Could not build zip archive', error);
      message.error('فشرده‌سازی ناموفق بود');
    } finally {
      setZipBuilding(false);
    }
  };

  const handleAddZipToRecordFiles = async () => {
    if (!zipBlob || !zipFileName || !onAddCompressedArchive) return;
    setZipAdding(true);
    try {
      const archiveItem = await onAddCompressedArchive({ blob: zipBlob, fileName: zipFileName, sourceItems: shareItems });
      setZipArchiveItem(archiveItem);
      await buildShareUrls([archiveItem], sharePublicAccess, 'compressed');
      message.success('فایل ZIP به فایل‌های رکورد افزوده شد');
    } catch (error) {
      console.warn('Could not add zip archive to record files', error);
      message.error('افزودن فایل ZIP ناموفق بود');
    } finally {
      setZipAdding(false);
    }
  };

  const handleCopyText = async (value: string, successMessage: string) => {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    message.success(successMessage);
  };

  const isMainImageItem = (item: FileManagerBrowserItem) => {
    const itemUrl = String(item.file_url || '').trim();
    return Boolean(item.is_main_image) || Boolean(normalizedMainImageUrl && itemUrl && itemUrl === normalizedMainImageUrl);
  };

  const renderFilePreviewContent = (item: FileManagerBrowserItem) => {
    const displayFileName = getDisplayFileName(item);
    if (item.file_type === 'image') {
      return (
        <img
          src={buildImagePreviewUrl(item.file_url, 'gallery')}
          alt={displayFileName}
          className="max-h-[68vh] w-full rounded-lg border border-gray-200 object-contain dark:border-gray-700"
        />
      );
    }
    if (item.file_type === 'video') {
      return (
        <video
          src={item.file_url}
          controls
          autoPlay
          className="max-h-[68vh] w-full rounded-lg border border-gray-200 bg-black dark:border-gray-700"
        />
      );
    }
    return (
      <div className="mx-auto max-w-sm rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900">
        <FileExtensionTile fileName={item.file_name} url={item.file_url} mimeType={item.mime_type} />
      </div>
    );
  };

  const renderSourceKindTag = (item: FileManagerBrowserItem, compact = false) => {
    if (!showSourceBadges) return null;
    const meta = getSourceKindMeta(item);
    if (!meta) return null;
    return (
      <Tag color={meta.color} className={compact ? 'm-0 rounded-full px-1.5 text-[10px]' : undefined}>
        {meta.label}
      </Tag>
    );
  };

  const renderItemCard = (item: FileManagerBrowserItem) => {
    const displayFileName = getDisplayFileName(item);
    const moduleTitle = moduleTitleMap[item.module_id || ''] || item.module_id || '-';
    const recordTitle = recordTitleMap[`${item.module_id}:${item.record_id}`] || item.record_id || '-';
    const isSelected = selectedIdSet.has(item.id);
    const isMainImage = isMainImageItem(item);
    const visibilityTag = item.visibility === 'public'
      ? <Tag color="green">عمومی</Tag>
      : item.visibility === 'org'
        ? <Tag color="blue">سازمانی</Tag>
        : <Tag>خصوصی</Tag>;
    const actions = (
      <Space size={4}>
        {canSetMainImage && item.file_type === 'image' ? (
          <Tooltip title={isMainImage ? 'تصویر اصلی' : 'ستاره تصویر اصلی'}>
            <Button
              size="small"
              type={isMainImage ? 'primary' : 'default'}
              icon={isMainImage ? <StarFilled /> : <StarOutlined />}
              disabled={!onSetMainImages}
              onClick={(event) => {
                event.stopPropagation();
                markAsMainImages([item]);
              }}
            />
          </Tooltip>
        ) : null}
        <Tooltip title="جزئیات">
          <Button size="small" icon={<InfoCircleOutlined />} onClick={(event) => { event.stopPropagation(); void openDetails(item); }} />
        </Tooltip>
        <Tooltip title="اشتراک">
          <Button
            size="small"
            icon={<ShareAltOutlined />}
            disabled={!canShare}
            onClick={(event) => {
              event.stopPropagation();
              openShareModal([item]);
            }}
          />
        </Tooltip>
      </Space>
    );

    const body = viewMode === 'card' ? (
      <>
        <div className="relative">
          {renderPreview(item)}
          {item.is_shortcut ? (
            <div className="absolute bottom-2 left-2 flex h-7 w-7 items-center justify-center rounded-md border border-white bg-white/95 text-[13px] text-blue-600 shadow">
              <RetweetOutlined />
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Space size={4} wrap>
            {visibilityTag}
            {item.is_shortcut ? <Tag color="cyan">میانبر</Tag> : null}
          </Space>
          <span className="text-xs text-gray-500 dark:text-gray-400">{moduleTitle}</span>
        </div>
        {showSourceBadges ? <div className="mt-1">{renderSourceKindTag(item)}</div> : null}
        <div className="mt-1 text-sm font-bold text-gray-700 truncate dark:text-gray-100">{recordTitle}</div>
        <div className="mt-1 text-xs text-gray-500 truncate dark:text-gray-400" title={displayFileName}>
          نام فایل: {displayFileName}
        </div>
        {renderCompactTags(item.tags, 3)}
      </>
    ) : (
      <div className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 px-1.5 py-1 text-center">
        <div className="relative flex h-12 w-12 items-center justify-center">
          {item.file_type === 'image' ? (
            <PreviewImage src={item.file_url} preset="thumb" alt={displayFileName} className="h-11 w-11 rounded-md border border-gray-200 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-900" />
          ) : item.file_type === 'video' ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-200 bg-gray-50 text-lg text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
              <FileOutlined />
            </div>
          ) : (
            <div className="h-11 w-11 overflow-hidden rounded-md border border-gray-200 dark:border-gray-700">
              <FileExtensionTile fileName={item.file_name} url={item.file_url} mimeType={item.mime_type} compact />
            </div>
          )}
          {item.is_shortcut ? (
            <div className="absolute bottom-0 left-0 flex h-5 w-5 items-center justify-center rounded border border-white bg-white text-[10px] text-blue-600 shadow">
              <RetweetOutlined />
            </div>
          ) : null}
        </div>
        <div className="line-clamp-2 w-full break-words text-xs font-semibold leading-5 text-gray-700 dark:text-gray-100" title={displayFileName}>
          {displayFileName}
        </div>
        {item.is_shortcut ? <span className="text-[10px] leading-3 text-blue-600">میانبر</span> : null}
        {showSourceBadges ? renderSourceKindTag(item, true) : null}
        {renderCompactTags(item.tags, 1)}
      </div>
    );

    return (
      <Card
        key={item.id}
        hoverable
        className={`group overflow-hidden dark:bg-[#1f1f1f] dark:border-gray-700 ${viewMode === 'icon' ? 'rounded-lg shadow-none' : 'rounded-2xl'} ${isSelected ? 'border-leather-400 bg-leather-50 ring-2 ring-leather-200 dark:bg-[rgba(var(--brand-900-rgb),0.25)] dark:ring-[rgba(var(--brand-300-rgb),0.28)]' : ''}`}
        styles={{ body: { padding: viewMode === 'icon' ? 6 : 12, position: 'relative', overflow: 'hidden' } }}
        onClick={() => {
          toggleItemSelection(item.id);
        }}
        onDoubleClick={() => {
          if (selectionMode) return;
          if (onOpenItem) {
            onOpenItem(item);
            return;
          }
          setPreviewItem(item);
        }}
      >
        {viewMode === 'icon' ? (
          <>
            <div className="absolute right-1.5 top-1.5 z-10" onClick={(event) => event.stopPropagation()}>
              <Checkbox checked={isSelected} onChange={() => toggleItemSelection(item.id)} />
            </div>
            <div className="absolute left-1.5 top-1.5 z-10 flex max-w-[calc(100%-38px)] items-center justify-end overflow-hidden">
              {actions}
            </div>
            <div className="pt-5">{body}</div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Checkbox
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleItemSelection(item.id)}
              />
              {actions}
            </div>
            {body}
          </>
        )}
      </Card>
    );
  };

  const renderFolderCard = (folder: FileManagerBrowserFolder) => {
    const canManageThisFolder = canEdit && !folder.isSystem;
    const isSelected = selectedFolderKeySet.has(folder.key);
    const folderToneClass = folder.isSystem
      ? 'border-amber-200 bg-amber-50 text-amber-500 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300'
      : 'border-sky-200 bg-sky-50 text-sky-500 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300';
    const folderIconClass = folder.isSystem
      ? 'text-amber-500 dark:text-amber-300'
      : 'text-sky-500 dark:text-sky-300';
    const folderActions = (
      <Space size={4}>
        <Tooltip title="تغییر نام پوشه">
          <Button
            size="small"
            icon={<EditOutlined />}
            disabled={!canManageThisFolder}
            onClick={(event) => {
              event.stopPropagation();
              onRenameFolder?.(folder);
            }}
          />
        </Tooltip>
        <Tooltip title="حذف پوشه">
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            disabled={!canManageThisFolder}
            onClick={(event) => {
              event.stopPropagation();
              requestFolderDelete(folder);
            }}
          />
        </Tooltip>
      </Space>
    );
    const body = viewMode === 'card' ? (
      <>
        <div className={`flex h-44 w-full items-center justify-center rounded-xl border text-6xl ${folderToneClass}`}>
          <FolderFilled />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Space size={4} wrap>
            <Tag color={folder.isSystem ? 'gold' : 'blue'}>{folder.isSystem ? 'سیستمی' : 'پوشه'}</Tag>
            {folder.isDeletedRecord ? <Tag color="red">حذف شده</Tag> : null}
          </Space>
          <span className="text-xs text-gray-500 dark:text-gray-400">{folder.count || 0} مورد</span>
        </div>
        <div className="mt-1 truncate text-sm font-bold text-gray-700 dark:text-gray-100">{folder.label}</div>
        {renderCompactTags(folder.tags, 3)}
      </>
    ) : (
      <div className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 px-1.5 py-1 text-center">
        <FolderFilled className={`text-[46px] ${folderIconClass}`} />
        <div className="line-clamp-2 w-full break-words text-xs font-semibold leading-5 text-gray-700 dark:text-gray-100" title={folder.label}>
          {folder.label}
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">{folder.count || 0} مورد</span>
        {renderCompactTags(folder.tags, 1)}
      </div>
    );

    return (
      <Card
        key={`folder:${folder.key}`}
        hoverable
        className={`group overflow-hidden dark:bg-[#1f1f1f] dark:border-gray-700 ${viewMode === 'icon' ? 'rounded-lg shadow-none' : 'rounded-2xl'} ${isSelected ? 'border-leather-400 bg-leather-50 ring-2 ring-leather-200 dark:bg-[rgba(var(--brand-900-rgb),0.25)] dark:ring-[rgba(var(--brand-300-rgb),0.28)]' : ''}`}
        styles={{ body: { padding: viewMode === 'icon' ? 6 : 12, position: 'relative', overflow: 'hidden' } }}
        onClick={() => toggleFolderSelection(folder.key)}
        onDoubleClick={() => onFolderChange?.(folder.key)}
      >
        {viewMode === 'icon' ? (
          <>
            <div className="absolute right-1.5 top-1.5 z-10" onClick={(event) => event.stopPropagation()}>
              <Checkbox checked={isSelected} onChange={() => toggleFolderSelection(folder.key)} />
            </div>
            <div className="absolute left-1.5 top-1.5 z-10 flex max-w-[calc(100%-38px)] items-center justify-end overflow-hidden">
              {folderActions}
            </div>
            <div className="pt-5">{body}</div>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <Checkbox
                checked={isSelected}
                onClick={(event) => event.stopPropagation()}
                onChange={() => toggleFolderSelection(folder.key)}
              />
              <span className={`text-xs font-bold ${folder.isSystem ? 'text-amber-600 dark:text-amber-300' : 'text-sky-600 dark:text-sky-300'}`}>پوشه</span>
              {folderActions}
            </div>
            {body}
          </>
        )}
      </Card>
    );
  };

  const renderGridEntry = (entry: IconGridEntry) => (
    entry.type === 'folder' ? renderFolderCard(entry.folder) : renderItemCard(entry.item)
  );

  return (
    <div className="flex flex-col gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white px-3 py-2 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="middle"
              icon={<ArrowUpOutlined />}
              disabled={activeFolderKey === 'all'}
              className="rounded-xl border-leather-200 bg-leather-50 font-bold text-leather-700 disabled:bg-gray-50 disabled:text-gray-400 dark:border-[rgba(var(--brand-300-rgb),0.25)] dark:bg-[rgba(var(--brand-900-rgb),0.18)] dark:text-[rgb(var(--brand-100-rgb))] dark:disabled:bg-gray-900 dark:disabled:text-gray-600"
              onClick={navigateToParentFolder}
            >
              برگشت
            </Button>
            <div className="flex min-w-0 flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              <Button
                type={activeFolderKey === 'all' ? 'primary' : 'text'}
                size="small"
                icon={<HomeOutlined />}
                onClick={() => onFolderChange?.('all')}
              >
                خانه
              </Button>
              {breadcrumbFolders.map((folder) => (
                <React.Fragment key={folder.key}>
                  <RightOutlined className="text-[10px] text-gray-300" />
                  <Button
                    type={folder.key === activeFolderKey ? 'primary' : 'text'}
                    size="small"
                    onClick={() => onFolderChange?.(folder.key)}
                  >
                    {folder.label}
                  </Button>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {title ? <div className="text-xl font-black text-gray-800 truncate dark:text-gray-100">{title}</div> : null}
          <Tag>{visibleEntryCount}</Tag>
        </div>
        <Space wrap>
          {onCreateFolder ? (
            <Button
              className="rounded-xl"
              icon={<FolderAddOutlined />}
              disabled={!canEdit || !canCreateFolderInActivePath}
              onClick={() => onCreateFolder(activeFolderKey)}
            >
              پوشه جدید
            </Button>
          ) : null}
          <Segmented
            value={viewMode}
            onChange={(value) => setViewMode(value as 'icon' | 'card')}
            options={[
              { label: 'آیکونی', value: 'icon', icon: <AppstoreOutlined /> },
              { label: 'کارتی', value: 'card', icon: <AppstoreOutlined /> },
            ]}
          />
          {onRefresh ? <Button className="rounded-xl" icon={<ReloadOutlined />} onClick={() => void onRefresh()}>بروزرسانی</Button> : null}
        </Space>
      </div>

      <div className={`min-h-[72px] rounded-2xl border px-4 py-3 transition-colors ${totalSelectedCount > 0 ? 'border-leather-200 bg-leather-50 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--brand-900-rgb),0.18)]' : 'border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1a1a1a]'}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-gray-700 dark:text-gray-100">
            {totalSelectedCount > 0 ? `${totalSelectedCount} مورد انتخاب شده` : 'برای انجام عملیات، فایل یا پوشه انتخاب کنید'}
          </div>
          <Space wrap>
            {selectionMode ? (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={!onConfirmSelection || selectedItems.length === 0}
                onClick={() => onConfirmSelection?.(selectedItems)}
              >
                {selectionLabel}
              </Button>
            ) : null}
            {canSetMainImage ? (
              <Tooltip title={setMainImageLabel}>
                <Button
                  icon={<StarOutlined />}
                  disabled={!onSetMainImages || selectedImageItems.length === 0}
                  onClick={() => markAsMainImages(selectedImageItems)}
                />
              </Tooltip>
            ) : null}
            <Tooltip title={copyItemsLabel}>
              <Button icon={<CopyOutlined />} disabled={!canEdit || !onCopyItems || selectedItems.length === 0} onClick={() => onCopyItems?.(selectedItems)} />
            </Tooltip>
            <Tooltip title="ایجاد میانبر">
              <Button
                icon={<RetweetOutlined />}
                disabled={!canEdit || !onCreateShortcutsHere || selectedItems.length === 0}
                onClick={() => onCreateShortcutsHere?.(selectedItems)}
              />
            </Tooltip>
            <Tooltip title="انتقال">
              <Button icon={<SwapOutlined />} disabled={!canEdit || !onMoveItems || selectedItems.length === 0} onClick={() => onMoveItems?.(selectedItems)} />
            </Tooltip>
            <Tooltip title="اشتراک">
              <Button
                icon={<ShareAltOutlined />}
                disabled={!canShare || selectedItems.length === 0 || selectedFolders.length > 0}
                onClick={() => openShareModal(selectedItems)}
              />
            </Tooltip>
            <Tooltip title="تغییر نام">
              <Button
                icon={<EditOutlined />}
                disabled={!canEdit || totalSelectedCount !== 1 || (selectedFolders.length === 1 ? !onRenameFolder || selectedFolders[0].isSystem : !onRenameItem)}
                onClick={renameSelectedEntry}
              />
            </Tooltip>
            <Tooltip title="حذف">
              <Button
                icon={<DeleteOutlined />}
                danger
                disabled={!canDelete || totalSelectedCount === 0 || selectedFolders.some((folder) => folder.isSystem) || (selectedItems.length > 0 && !onDeleteItem) || (selectedFolders.length > 0 && !onDeleteFolder)}
                onClick={() => void deleteSelectedEntries()}
              />
            </Tooltip>
            <Tooltip title="جزئیات">
              <Button icon={<InfoCircleOutlined />} disabled={selectedItems.length !== 1 || selectedFolders.length > 0} onClick={() => selectedItems[0] && void openDetails(selectedItems[0])} />
            </Tooltip>
          </Space>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Spin />
        </div>
      ) : (
        <div className="relative">
          {refreshing ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center rounded-[2rem] bg-white/45 pt-6 backdrop-blur-[1px] dark:bg-[#111]/35">
              <div className="rounded-full border border-gray-200 bg-white/90 px-3 py-1 shadow-sm dark:border-gray-700 dark:bg-[#1f1f1f]/90">
                <Spin size="small" />
              </div>
            </div>
          ) : null}
          {visibleEntryCount === 0 ? (
            <div className="rounded-[2rem] border border-gray-200 bg-white p-10 dark:border-gray-800 dark:bg-[#1a1a1a]">
              <Empty description={emptyDescription} />
            </div>
          ) : (
            viewMode === 'icon' && deferredGridEntries.length >= ICON_GRID_VIRTUALIZATION_THRESHOLD ? (
              <VirtualizedIconGrid
                entries={deferredGridEntries}
                minTileWidth={iconTileMinWidth}
                renderTile={renderGridEntry}
              />
            ) : (
              <div className={viewMode === 'icon'
                ? 'grid gap-2'
                : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'}
                style={viewMode === 'icon' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${iconTileMinWidth}px, 1fr))` } : undefined}
              >
                {viewMode === 'icon'
                  ? deferredGridEntries.map(renderGridEntry)
                  : (
                    <>
                      {deferredVisibleFolders.map(renderFolderCard)}
                      {deferredDisplayedItems.map(renderItemCard)}
                    </>
                  )}
              </div>
            )
          )}
        </div>
      )}

      {showPagination ? (
        <div className="flex justify-center pt-1">
          <Pagination
            current={effectivePage}
            pageSize={effectivePageSize}
            total={effectiveTotalItems}
            showSizeChanger
            pageSizeOptions={[24, 48, 60, 96, 120]}
            onChange={(nextPage, nextPageSize) => {
              if (onPageChange) {
                onPageChange(nextPage, nextPageSize);
                return;
              }
              setInternalPage(nextPage);
              setInternalPageSize(nextPageSize);
            }}
          />
        </div>
      ) : null}

      <Modal
        title="جزئیات فایل"
        open={!!detailsItem}
        onCancel={() => setDetailsItem(null)}
        footer={null}
        destroyOnHidden
      >
        {detailsItem ? (
          <div className="space-y-3 text-sm">
            <div><Text strong>نام فایل:</Text> {getDisplayFileName(detailsItem)}</div>
            <div><Text strong>زمان آپلود:</Text> {formatDateTime(detailsItem.created_at)}</div>
            <div><Text strong>رکورد اصلی مرتبط:</Text> {recordTitleMap[`${detailsItem.module_id}:${detailsItem.record_id}`] || detailsItem.record_id || '-'}</div>
            <div><Text strong>رکوردهای میانبر:</Text> {detailsItem.is_shortcut ? 'این مورد یک میانبر است' : 'فعلاً از منبع داده موجود قابل محاسبه نیست'}</div>
            <div><Text strong>دسترسی:</Text> {detailsItem.visibility === 'public' ? 'عمومی' : detailsItem.visibility === 'org' ? 'سازمانی' : 'خصوصی'}</div>
            <div className="space-y-2">
              <Text strong>برچسب‌ها</Text>
              <TagInput
                moduleId="file_assets"
                initialTags={detailsTags as any}
                onChange={(tags) => setDetailsTags((tags || []) as any)}
                disabled={!canEdit || !onUpdateItemTags}
                popupZIndex={13620}
              />
              {canEdit && onUpdateItemTags ? (
                <Button
                  size="small"
                  loading={detailsSaving}
                  onClick={async () => {
                    if (!detailsItem) return;
                    setDetailsSaving(true);
                    try {
                      await onUpdateItemTags(detailsItem, detailsTags);
                      setDetailsItem({ ...detailsItem, tags: detailsTags });
                    } finally {
                      setDetailsSaving(false);
                    }
                  }}
                >
                  ذخیره برچسب‌ها
                </Button>
              ) : null}
            </div>
            <div className="space-y-1">
              <Text strong>لینک اصلی</Text>
              <div className="flex gap-2">
                <input readOnly value={detailsItem.file_url} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
                <Button onClick={() => void handleCopyText(detailsItem.file_url, 'لینک اصلی کپی شد')}>کپی</Button>
              </div>
            </div>
            <div className="space-y-1">
              <Text strong>لینک کوتاه</Text>
              <div className="flex gap-2">
                <input readOnly value={detailsShortUrl} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100" />
                <Button disabled={!detailsShortUrl} onClick={() => void handleCopyText(detailsShortUrl, 'لینک کوتاه کپی شد')}>کپی</Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        title={shareItems.length > 1 ? `اشتراک ${shareItems.length} فایل` : 'اشتراک فایل'}
        open={shareItems.length > 0}
        onCancel={() => setShareItems([])}
        footer={null}
        destroyOnHidden
      >
        <div className="space-y-4 text-sm">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="mb-2 font-bold text-gray-700 dark:text-gray-100">
              {shareItems.length === 1 ? getDisplayFileName(shareItems[0]) : `${shareItems.length} فایل انتخاب شده`}
            </div>
            <Checkbox
              checked={sharePublicAccess}
              onChange={(event) => updateShareOptions(event.target.checked, shareDeliveryMode)}
            >
              دسترسی عمومی
            </Checkbox>
            <div className="mt-3 space-y-2">
              <Text strong>نحوه ارسال</Text>
              <Segmented
                block
                value={shareDeliveryMode}
                options={shareDeliveryOptions}
                onChange={(value) => updateShareOptions(sharePublicAccess, value as FileShareDeliveryMode)}
              />
              {shareDeliveryMode === 'compressed' ? (
                <div className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-white p-3 dark:border-gray-700 dark:bg-gray-950">
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    ابتدا فایل‌های انتخاب‌شده به یک فایل ZIP تبدیل می‌شوند. بعد از افزودن ZIP به فایل‌های رکورد، لینک‌ها و ارسال مستقیم از همان فایل ZIP استفاده می‌کنند.
                  </div>
                  <Progress percent={zipProgress} size="small" status={zipBuilding ? 'active' : zipProgress === 100 ? 'success' : 'normal'} />
                  <Space wrap>
                    <Button loading={zipBuilding} onClick={() => void handleBuildZipArchive()}>
                      فشرده سازی
                    </Button>
                    <Button
                      type="primary"
                      loading={zipAdding}
                      disabled={!zipBlob || !onAddCompressedArchive || Boolean(zipArchiveItem)}
                      onClick={() => void handleAddZipToRecordFiles()}
                    >
                      افزودن به فایل های رکورد
                    </Button>
                  </Space>
                  {zipArchiveItem ? (
                    <div className="text-xs text-green-600 dark:text-green-300">فایل ZIP آماده اشتراک‌گذاری است: {getDisplayFileName(zipArchiveItem)}</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Text strong>لینک کوتاه</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                disabled={shareLoading || shareShortUrls.length === 0 || (shareDeliveryMode === 'compressed' && !zipArchiveItem)}
                onClick={() => void handleCopyText(shareShortUrls.join('\n'), 'لینک کوتاه کپی شد')}
              >
                کپی
              </Button>
            </div>
            <textarea
              readOnly
              value={shareShortUrls.join('\n')}
              className="min-h-16 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Text strong>لینک بلند</Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                disabled={shareLongUrls.length === 0 || (shareDeliveryMode === 'compressed' && !zipArchiveItem)}
                onClick={() => void handleCopyText(shareLongUrls.join('\n'), 'لینک بلند کپی شد')}
              >
                کپی
              </Button>
            </div>
            <textarea
              readOnly
              value={shareLongUrls.join('\n')}
              className="min-h-16 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            />
          </div>

          {onDirectShareItems ? (
            <div className="space-y-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700">
              <Text strong>ارسال مستقیم</Text>
              <Select
                mode="multiple"
                allowClear
                showSearch
                value={directRecipientIds}
                onChange={(values) => setDirectRecipientIds((values || []).map((value) => String(value)))}
                options={directShareTargetOptions}
                placeholder="انتخاب گفتگوها"
                optionFilterProp="label"
                className="w-full"
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
                maxTagCount="responsive"
              />
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                loading={directSending}
                disabled={shareShortUrls.length === 0 || directRecipientIds.length === 0 || (shareDeliveryMode === 'compressed' && !zipArchiveItem)}
                onClick={async () => {
                  setDirectSending(true);
                  try {
                    await onDirectShareItems(getEffectiveShareItems(shareDeliveryMode), shareShortUrls, { publicAccess: sharePublicAccess, deliveryMode: shareDeliveryMode }, directRecipientIds);
                    message.success('ارسال مستقیم انجام شد');
                    setShareItems([]);
                  } catch (error) {
                    console.warn('Direct file share failed', error);
                    message.error('ارسال مستقیم ناموفق بود');
                  } finally {
                    setDirectSending(false);
                  }
                }}
              >
                ارسال مستقیم
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Space wrap>
              {getEffectiveShareItems(shareDeliveryMode).map((item) => (
                <Button
                  key={item.id}
                  href={getShareTargetUrl(item, shareDeliveryMode)}
                  target="_blank"
                  rel="noreferrer"
                  download={getDisplayFileName(item)}
                  icon={<DownloadOutlined />}
                >
                  {shareItems.length > 1 ? `دانلود ${getDisplayFileName(item)}` : 'دانلود'}
                </Button>
              ))}
            </Space>
          </div>
        </div>
      </Modal>

      <Modal
        title={previewItem ? getDisplayFileName(previewItem) : 'پیش‌نمایش فایل'}
        open={!!previewItem}
        onCancel={() => setPreviewItem(null)}
        width={860}
        footer={previewItem ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Space wrap>
              {canSetMainImage && previewItem.file_type === 'image' ? (
                <Button
                  icon={isMainImageItem(previewItem) ? <StarFilled /> : <StarOutlined />}
                  type={isMainImageItem(previewItem) ? 'primary' : 'default'}
                  onClick={() => markAsMainImages([previewItem])}
                >
                  تصویر اصلی
                </Button>
              ) : null}
              {onOpenItem ? (
                <Button icon={<FolderOpenOutlined />} onClick={() => onOpenItem(previewItem)}>
                  باز کردن رکورد
                </Button>
              ) : null}
            </Space>
            <Button icon={<ExportOutlined />} href={previewItem.file_url} target="_blank" rel="noreferrer">
              باز کردن لینک
            </Button>
          </div>
        ) : null}
        destroyOnHidden
      >
        {previewItem ? (
          <div className="space-y-3">
            {renderFilePreviewContent(previewItem)}
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {recordTitleMap[`${previewItem.module_id}:${previewItem.record_id}`] || previewItem.record_id || '-'}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
};

export default FileManagerBrowser;
