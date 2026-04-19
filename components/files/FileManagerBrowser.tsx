import React, { useEffect, useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Empty,
  Modal,
  Progress,
  Segmented,
  Select,
  Space,
  Spin,
  Tag,
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
  FileOutlined,
  FolderFilled,
  HomeOutlined,
  InfoCircleOutlined,
  LoginOutlined,
  PlusOutlined,
  ReloadOutlined,
  RetweetOutlined,
  RightOutlined,
  ShareAltOutlined,
  StarFilled,
  StarOutlined,
} from '@ant-design/icons';
import { buildImagePreviewUrl } from '../../utils/imagePreview';
import { getOrCreateShortFileUrl } from '../../utils/fileShortLinks';
import { supabase } from '../../supabaseClient';
import { buildZipArchive } from '../../utils/zipArchive';
import FileExtensionTile from './FileExtensionTile';

const { Text } = Typography;

export type FileManagerBrowserItem = {
  id: string;
  asset_id?: string | null;
  entry_id?: string | null;
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
  is_shortcut?: boolean;
};

export type FileManagerBrowserFolder = {
  key: string;
  label: string;
  parentKey?: string | null;
  count?: number;
  isSystem?: boolean;
};

type FileManagerBrowserProps = {
  title?: string;
  items: FileManagerBrowserItem[];
  loading?: boolean;
  emptyDescription?: string;
  folders?: FileManagerBrowserFolder[];
  activeFolderKey?: string;
  onFolderChange?: (key: string) => void;
  onOpenItem?: (item: FileManagerBrowserItem) => void;
  onRefresh?: () => void | Promise<void>;
  onDeleteItem?: (item: FileManagerBrowserItem) => void | Promise<void>;
  onCopyItems?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  onMoveItems?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  onRenameItem?: (item: FileManagerBrowserItem) => void | Promise<void>;
  onCreateFolder?: (parentKey: string) => void | Promise<void>;
  onRenameFolder?: (folder: FileManagerBrowserFolder) => void | Promise<void>;
  onDeleteFolder?: (folder: FileManagerBrowserFolder) => void | Promise<void>;
  recordTitleMap?: Record<string, string>;
  moduleTitleMap?: Record<string, string>;
  canDelete?: boolean;
  canShare?: boolean;
  canEdit?: boolean;
  defaultViewMode?: 'icon' | 'card';
  selectionMode?: boolean;
  selectionLabel?: string;
  onConfirmSelection?: (items: FileManagerBrowserItem[]) => void | Promise<void>;
  highlightItemId?: string | null;
  iconTileMinWidth?: number;
  mainImageUrl?: string | null;
  canSetMainImage?: boolean;
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
};

type FileShareDeliveryMode = 'original' | 'preview' | 'compressed';

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
    return <img src={buildImagePreviewUrl(item.file_url, compact ? 'thumb' : 'gallery')} alt={item.file_name || 'image'} className={mediaClass} />;
  }

  if (item.file_type === 'video') {
    return <video src={item.file_url} controls className={mediaClass} preload="metadata" />;
  }

  return (
    <div className={`${compact ? 'h-20' : 'h-44'} rounded-xl border border-gray-200 overflow-hidden`}>
      <FileExtensionTile fileName={item.file_name} url={item.file_url} mimeType={item.mime_type} compact={compact} />
    </div>
  );
};

const formatDateTime = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const FileManagerBrowser: React.FC<FileManagerBrowserProps> = ({
  title,
  items,
  loading = false,
  emptyDescription = 'فایلی ثبت نشده است.',
  folders = [],
  activeFolderKey = 'all',
  onFolderChange,
  onOpenItem,
  onRefresh,
  onDeleteItem,
  onCopyItems,
  onMoveItems,
  onRenameItem,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  recordTitleMap = {},
  moduleTitleMap = {},
  canDelete = true,
  canShare = true,
  canEdit = true,
  defaultViewMode = 'icon',
  selectionMode = false,
  selectionLabel = 'انتخاب فایل‌ها',
  onConfirmSelection,
  highlightItemId = null,
  iconTileMinWidth = 92,
  mainImageUrl = null,
  canSetMainImage = false,
  onSetMainImages,
  directShareTargetOptions = [],
  onDirectShareItems,
  onAddCompressedArchive,
}) => {
  const { message } = App.useApp();
  const [viewMode, setViewMode] = useState<'icon' | 'card'>(defaultViewMode);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<string[]>([]);
  const [detailsItem, setDetailsItem] = useState<FileManagerBrowserItem | null>(null);
  const [previewItem, setPreviewItem] = useState<FileManagerBrowserItem | null>(null);
  const [detailsShortUrl, setDetailsShortUrl] = useState('');
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

  useEffect(() => {
    setViewMode(defaultViewMode);
  }, [defaultViewMode]);

  useEffect(() => {
    setSelectedIds([]);
    setSelectedFolderKeys([]);
  }, [activeFolderKey]);

  useEffect(() => {
    const normalizedHighlightId = String(highlightItemId || '').trim();
    if (!normalizedHighlightId) return;
    if (!items.some((item) => item.id === normalizedHighlightId)) return;
    setSelectedIds([normalizedHighlightId]);
  }, [highlightItemId, items]);

  const selectedItems = useMemo(() => {
    const itemMap = new Map(items.map((item) => [item.id, item]));
    return selectedIds.map((id) => itemMap.get(id)).filter(Boolean) as FileManagerBrowserItem[];
  }, [items, selectedIds]);

  const folderMap = useMemo(() => {
    const next = new Map<string, FileManagerBrowserFolder>();
    folders.forEach((folder) => next.set(folder.key, folder));
    return next;
  }, [folders]);

  const activeFolder = folderMap.get(activeFolderKey) || null;

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

  const visibleEntryCount = visibleFolders.length + items.length;
  const selectedFolders = useMemo(() => {
    const selectedSet = new Set(selectedFolderKeys);
    return visibleFolders.filter((folder) => selectedSet.has(folder.key));
  }, [selectedFolderKeys, visibleFolders]);
  const totalSelectedCount = selectedItems.length + selectedFolders.length;
  const selectedImageItems = useMemo(
    () => selectedItems.filter((item) => item.file_type === 'image'),
    [selectedItems],
  );
  const normalizedMainImageUrl = String(mainImageUrl || '').trim();
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

  const openSelectedEntry = () => {
    if (totalSelectedCount !== 1) return;
    if (selectedFolders[0]) {
      onFolderChange?.(selectedFolders[0].key);
      return;
    }
    if (selectedItems[0]) setPreviewItem(selectedItems[0]);
  };

  const markAsMainImages = (nextItems: FileManagerBrowserItem[]) => {
    const validItems = nextItems.filter((item) => item.file_type === 'image');
    if (validItems.length === 0 || !onSetMainImages) return;
    onSetMainImages(validItems);
  };

  const deleteSelectedEntries = async () => {
    if (totalSelectedCount === 0) return;
    for (const folder of selectedFolders) {
      await onDeleteFolder?.(folder);
    }
    for (const item of selectedItems) {
      await onDeleteItem?.(item);
    }
    setSelectedFolderKeys([]);
    setSelectedIds([]);
  };

  const navigateToParentFolder = () => {
    const parentKey = String(activeFolder?.parentKey || '').trim();
    if (parentKey) {
      onFolderChange?.(parentKey);
      return;
    }
    if (activeFolderKey !== 'all') onFolderChange?.('all');
  };

  const openDetails = async (item: FileManagerBrowserItem) => {
    setDetailsItem(item);
    setDetailsShortUrl('');
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

  const renderItemCard = (item: FileManagerBrowserItem) => {
    const displayFileName = getDisplayFileName(item);
    const moduleTitle = moduleTitleMap[item.module_id || ''] || item.module_id || '-';
    const recordTitle = recordTitleMap[`${item.module_id}:${item.record_id}`] || item.record_id || '-';
    const isSelected = selectedIds.includes(item.id);
    const isMainImage = isMainImageItem(item);
    const visibilityTag = item.visibility === 'public'
      ? <Tag color="green">عمومی</Tag>
      : item.visibility === 'org'
        ? <Tag color="blue">سازمانی</Tag>
        : <Tag>خصوصی</Tag>;
    const actions = (
      <Space size={4} className={viewMode === 'icon' ? 'opacity-0 transition-opacity group-hover:opacity-100' : ''}>
        {canSetMainImage && item.file_type === 'image' ? (
          <Tooltip title={isMainImage ? 'تصویر اصلی' : 'ستاره تصویر اصلی'}>
            <Button
              size="small"
              type={isMainImage ? 'primary' : 'default'}
              icon={isMainImage ? <StarFilled /> : <StarOutlined />}
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
        <div className="mt-1 text-sm font-bold text-gray-700 truncate dark:text-gray-100">{recordTitle}</div>
        <div className="mt-1 text-xs text-gray-500 truncate dark:text-gray-400" title={displayFileName}>
          نام فایل: {displayFileName}
        </div>
      </>
    ) : (
      <div className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 px-1.5 py-1 text-center">
        <div className="relative flex h-12 w-12 items-center justify-center">
          {item.file_type === 'image' ? (
            <img src={buildImagePreviewUrl(item.file_url, 'thumb')} alt={displayFileName} className="h-11 w-11 rounded-md border border-gray-200 bg-gray-50 object-contain dark:border-gray-700 dark:bg-gray-900" />
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
          if (!selectionMode) setPreviewItem(item);
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
    const isSelected = selectedFolderKeys.includes(folder.key);
    const folderActions = canManageThisFolder ? (
      <Space size={4} className={viewMode === 'icon' ? 'opacity-0 transition-opacity group-hover:opacity-100' : ''}>
        <Tooltip title="تغییر نام پوشه">
          <Button
            size="small"
            icon={<EditOutlined />}
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
            onClick={(event) => {
              event.stopPropagation();
              onDeleteFolder?.(folder);
            }}
          />
        </Tooltip>
      </Space>
    ) : null;
    const body = viewMode === 'card' ? (
      <>
        <div className="flex h-44 w-full items-center justify-center rounded-xl border border-amber-100 bg-amber-50 text-6xl text-amber-500 dark:border-amber-500/20 dark:bg-amber-500/10">
          <FolderFilled />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Tag color={folder.isSystem ? 'gold' : 'default'}>{folder.isSystem ? 'سیستمی' : 'پوشه'}</Tag>
          <span className="text-xs text-gray-500 dark:text-gray-400">{folder.count || 0} مورد</span>
        </div>
        <div className="mt-1 truncate text-sm font-bold text-gray-700 dark:text-gray-100">{folder.label}</div>
      </>
    ) : (
      <div className="flex min-h-[96px] flex-col items-center justify-center gap-1.5 px-1.5 py-1 text-center">
        <FolderFilled className="text-[46px] text-amber-500" />
        <div className="line-clamp-2 w-full break-words text-xs font-semibold leading-5 text-gray-700 dark:text-gray-100" title={folder.label}>
          {folder.label}
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400">{folder.count || 0} مورد</span>
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
              <span className="text-xs font-bold text-amber-600">پوشه</span>
              {folderActions}
            </div>
            {body}
          </>
        )}
      </Card>
    );
  };

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
              icon={<PlusOutlined />}
              disabled={!canEdit || activeFolderKey === 'all'}
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

      {totalSelectedCount > 0 ? (
        <div className="rounded-2xl border border-leather-200 bg-leather-50 px-4 py-3 dark:border-[rgba(var(--brand-300-rgb),0.22)] dark:bg-[rgba(var(--brand-900-rgb),0.18)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-gray-700 dark:text-gray-100">{totalSelectedCount} مورد انتخاب شده</div>
            <Space wrap>
              <Button
                icon={<LoginOutlined />}
                disabled={totalSelectedCount !== 1 || (selectedItems.length === 1 && !onOpenItem) || (selectedFolders.length === 1 && !onFolderChange)}
                onClick={openSelectedEntry}
              >
                باز کردن
              </Button>
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
                <Button
                  icon={<StarOutlined />}
                  disabled={!onSetMainImages || selectedImageItems.length === 0}
                  onClick={() => markAsMainImages(selectedImageItems)}
                >
                  ستاره تصویر اصلی
                </Button>
              ) : null}
              <Button icon={<CopyOutlined />} disabled={!canEdit || !onCopyItems || selectedItems.length === 0} onClick={() => onCopyItems?.(selectedItems)}>کپی</Button>
              <Button icon={<RetweetOutlined />} disabled={!canEdit || !onMoveItems || selectedItems.length === 0} onClick={() => onMoveItems?.(selectedItems)}>انتقال</Button>
              <Button
                icon={<ShareAltOutlined />}
                disabled={!canShare || selectedItems.length === 0 || selectedFolders.length > 0}
                onClick={() => openShareModal(selectedItems)}
              >
                اشتراک
              </Button>
              <Button
                disabled={!canEdit || totalSelectedCount !== 1 || (selectedFolders.length === 1 ? !onRenameFolder || selectedFolders[0].isSystem : !onRenameItem)}
                onClick={renameSelectedEntry}
              >
                تغییر نام
              </Button>
              <Button
                icon={<DeleteOutlined />}
                danger
                disabled={!canDelete || totalSelectedCount === 0 || selectedFolders.some((folder) => folder.isSystem) || (selectedItems.length > 0 && !onDeleteItem) || (selectedFolders.length > 0 && !onDeleteFolder)}
                onClick={() => void deleteSelectedEntries()}
              >
                حذف
              </Button>
              <Button icon={<InfoCircleOutlined />} disabled={selectedItems.length !== 1 || selectedFolders.length > 0} onClick={() => selectedItems[0] && void openDetails(selectedItems[0])}>جزئیات</Button>
            </Space>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Spin />
        </div>
      ) : visibleEntryCount === 0 ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Empty description={emptyDescription} />
        </div>
      ) : (
        <div className={viewMode === 'icon'
          ? 'grid gap-2'
          : 'grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4'}
          style={viewMode === 'icon' ? { gridTemplateColumns: `repeat(auto-fill, minmax(${iconTileMinWidth}px, 1fr))` } : undefined}
        >
          {visibleFolders.map(renderFolderCard)}
          {items.map(renderItemCard)}
        </div>
      )}

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
                <Button icon={<LoginOutlined />} onClick={() => onOpenItem(previewItem)}>
                  باز کردن رکورد
                </Button>
              ) : null}
            </Space>
            <Button href={previewItem.file_url} target="_blank" rel="noreferrer">
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
