import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Input, Modal, Select, Typography, Upload } from 'antd';
import { PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import { supabase } from '../supabaseClient';
import { MODULES } from '../moduleRegistry';
import { fileStorageClient, FILE_STORAGE_BUCKET } from '../utils/storageClient';
import {
  detectRecordFilesTable,
  getRecordFilesTableAvailabilityCache,
  isMissingRecordFilesError,
  setRecordFilesTableAvailability,
} from '../utils/recordFilesAvailability';
import { isUploadCanceledError, uploadFileWithProgress } from '../utils/uploadFileWithProgress';
import { joinStoragePath, sanitizeStorageFileName } from '../utils/storagePath';
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import { insertNotesWithFallback } from '../utils/noteDispatch';
import { normalizeNoteScope } from '../utils/noteScope';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { getRecordDisplayLabel } from '../utils/recordLabel';
import { parseProcessLinkMap } from '../utils/processTargets';
import {
  createManualFileFolder,
  createFileManagerOriginForUpload,
  createFileManagerShortcut,
  deleteManualFileFolder,
  deleteFileManagerEntry,
  detectFileManagerTables,
  ensureSystemFoldersForRecord,
  resolveRecordFolderLabel,
  renameFileFolder,
} from '../utils/fileManagerService';
import {
  buildFileManagerTree,
  invalidateFileManagerFolderCaches,
  type FileManagerListItem,
  type FileManagerTreeResult,
} from '../utils/fileManagerQueries';
import type { FileFolderRow } from '../utils/fileManagerTypes';
import { canonicalizeFileManagerItems } from '../utils/fileManagerCanonical';
import { sendCounterpartyBotGroupMessage } from '../utils/botGateway';
import { logAndTouchRecord } from '../utils/recordActivity';
import FileManagerBrowser, { type FileManagerBrowserItem } from './files/FileManagerBrowser';
import TagInput from './TagInput';

export type RecordFileType = 'image' | 'video' | 'file';

export interface RecordFileItem {
  id: string;
  module_id: string;
  record_id: string;
  file_url: string;
  file_type: RecordFileType;
  file_name: string | null;
  mime_type: string | null;
  sort_order: number;
  folder_id?: string | null;
  asset_id?: string | null;
  entry_id?: string | null;
  visibility?: 'private' | 'org' | 'public' | null;
  is_shortcut?: boolean;
  is_main_image?: boolean;
  source_module_id?: string | null;
  source_record_id?: string | null;
  source_record_title?: string | null;
  source_kind?: 'entry' | 'legacy' | 'synthetic' | 'note_attachment';
  created_at?: string;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
}

interface ShareTargetOption {
  label: string;
  value: string;
}

interface RelatedRecordShareTarget {
  moduleId: string;
  recordId: string;
  title: string;
}

type InternalChatGroup = {
  id: string;
  name: string;
  user_ids: string[];
  role_ids: string[];
};

type CounterpartyBotGroup = {
  id: string;
  title: string;
  channel_type: 'telegram' | 'bale' | 'rubika';
  bot_chat_id: string;
  customer_id: string | null;
  supplier_id: string | null;
};

interface UploadedFileResult {
  url: string;
  fileType: RecordFileType;
  fileName: string;
  mimeType: string | null;
  assetId?: string | null;
  entryId?: string | null;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
}

interface RecordFilesManagerProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  recordId?: string;
  mainImage?: string | null;
  onMainImageChange?: (url: string | null) => void | Promise<void>;
  canEdit?: boolean;
  canUpload?: boolean;
  canDelete?: boolean;
  highlightFileId?: string | null;
}

let recordFilesTableExistsCache: boolean | null = getRecordFilesTableAvailabilityCache();

const guessTypeFromUrl = (url?: string | null): RecordFileType => {
  const value = String(url || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(value)) return 'image';
  return 'file';
};

const normalizeType = (rawType: unknown, mimeType?: string | null, fileUrl?: string | null): RecordFileType => {
  const value = String(rawType || '').toLowerCase();
  if (value === 'image' || value === 'video' || value === 'file') return value;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return guessTypeFromUrl(fileUrl);
};

const getFileType = (file: File): RecordFileType => {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return 'file';
};

const getDisplayFileName = (item: Pick<RecordFileItem, 'file_name' | 'file_url'>): string => {
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

const NOTE_ATTACHMENT_ID_PREFIX = 'note-attachment:';

const normalizeManagerText = (value: unknown) => String(value || '').trim();

const dedupeManagerItems = (items: RecordFileItem[]) => canonicalizeFileManagerItems(items, { dedupeById: true });

const buildRecursiveFallbackFolderCounts = (
  recordFolderId: string,
  subfolders: Array<Pick<FileFolderRow, 'id' | 'parent_id'>>,
  items: Array<Pick<RecordFileItem, 'folder_id'>>,
) => {
  const normalizedSubfolderIds = new Set(subfolders.map((folder) => normalizeManagerText(folder.id)).filter(Boolean));
  const directItemCount = new Map<string, number>();
  const childFolderIdsByParent = new Map<string, string[]>();

  items.forEach((item) => {
    const folderId = normalizeManagerText(item.folder_id) || recordFolderId;
    if (!folderId) return;
    directItemCount.set(folderId, (directItemCount.get(folderId) || 0) + 1);
  });

  subfolders.forEach((folder) => {
    const folderId = normalizeManagerText(folder.id);
    if (!folderId) return;
    const parentId = normalizeManagerText(folder.parent_id);
    const parentKey = parentId && normalizedSubfolderIds.has(parentId) ? parentId : recordFolderId;
    childFolderIdsByParent.set(parentKey, [...(childFolderIdsByParent.get(parentKey) || []), folderId]);
  });

  const recursiveCounts = new Map<string, number>();
  const countDescendants = (folderId: string): number => {
    if (recursiveCounts.has(folderId)) return recursiveCounts.get(folderId) || 0;
    const childFolderIds = childFolderIdsByParent.get(folderId) || [];
    const total = (directItemCount.get(folderId) || 0)
      + childFolderIds.length
      + childFolderIds.reduce((sum, childId) => sum + countDescendants(childId), 0);
    recursiveCounts.set(folderId, total);
    return total;
  };

  countDescendants(recordFolderId);
  return recursiveCounts;
};
const isSyntheticNoteAttachmentId = (value?: string | null) =>
  String(value || '').startsWith(NOTE_ATTACHMENT_ID_PREFIX);

const RecordFilesManager: React.FC<RecordFilesManagerProps> = ({
  open,
  onClose,
  moduleId,
  recordId,
  mainImage,
  onMainImageChange,
  canEdit = true,
  canUpload,
  canDelete,
  highlightFileId,
}) => {
  const { message: msg } = App.useApp();
  const [items, setItems] = useState<RecordFileItem[]>([]);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadedScopeKey, setLoadedScopeKey] = useState('');
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingFileExtension, setPendingFileExtension] = useState('');
  const [pendingTags, setPendingTags] = useState<Array<{ id: string; title: string; color?: string | null }>>([]);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [shareTargetOptions, setShareTargetOptions] = useState<ShareTargetOption[]>([]);
  const [directShareTargetOptions, setDirectShareTargetOptions] = useState<ShareTargetOption[]>([]);
  const [directShareUsers, setDirectShareUsers] = useState<Array<{ id: string; display_name: string; role_id?: string | null }>>([]);
  const [directShareChatGroups, setDirectShareChatGroups] = useState<InternalChatGroup[]>([]);
  const [directShareBotGroups, setDirectShareBotGroups] = useState<CounterpartyBotGroup[]>([]);
  const [shareTargetIds, setShareTargetIds] = useState<string[]>([]);
  const [shareInRelatedRecords, setShareInRelatedRecords] = useState(false);
  const [fileManagerEnabled, setFileManagerEnabled] = useState(false);
  const [initialFolderKey, setInitialFolderKey] = useState('all');
  const [browserFolderKey, setBrowserFolderKey] = useState('all');
  const [browserTree, setBrowserTree] = useState<FileManagerTreeResult | null>(null);
  const [browserPage, setBrowserPage] = useState(1);
  const [browserPageSize, setBrowserPageSize] = useState(60);
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<RecordFileItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameTags, setRenameTags] = useState<Array<{ id: string; title: string; color?: string | null }>>([]);
  const [renaming, setRenaming] = useState(false);
  const [systemFolders, setSystemFolders] = useState<{ recordFolder: FileFolderRow | null; subfolders: FileFolderRow[] }>({
    recordFolder: null,
    subfolders: [],
  });
  const [destinationModalOpen, setDestinationModalOpen] = useState(false);
  const [destinationAction, setDestinationAction] = useState<'copy' | 'move'>('copy');
  const [destinationItems, setDestinationItems] = useState<RecordFileItem[]>([]);
  const [destinationFolderId, setDestinationFolderId] = useState('');
  const [destinationSaving, setDestinationSaving] = useState(false);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderParentId, setFolderParentId] = useState('');
  const [folderTarget, setFolderTarget] = useState<FileFolderRow | null>(null);
  const [folderNameValue, setFolderNameValue] = useState('');
  const [folderSaving, setFolderSaving] = useState(false);
  const [recordDisplayTitle, setRecordDisplayTitle] = useState('');
  const canUploadFiles = canUpload ?? canEdit;
  const canDeleteFiles = canDelete ?? canEdit;
  const currentScopeKey = `${String(moduleId || '').trim()}:${String(recordId || '').trim()}`;
  const browserReady = !recordId || loadedScopeKey === currentScopeKey;
  const bootstrapRequestIdRef = React.useRef(0);
  const visibleTreeRequestIdRef = React.useRef(0);
  const skipBrowserEffectRef = React.useRef(false);

  const syncSystemFoldersFromTree = React.useCallback((nextTree: FileManagerTreeResult | null, nextRecordTitle?: string | null) => {
    if (!nextTree || !moduleId || !recordId) return;
    const recordFolderKey = `record:${moduleId}:${recordId}`;
    const recordFolder = nextTree.folders.find((folder) => folder.key === recordFolderKey) || null;
    const recordFolderId = String(recordFolder?.folderId || '').trim();
    setSystemFolders({
      recordFolder: recordFolderId ? {
        id: recordFolderId,
        name: String(nextRecordTitle || recordFolder?.label || 'پوشه رکورد'),
        module_id: moduleId,
        record_id: String(recordId),
        folder_type: 'system_record',
        is_system: true,
        parent_id: null,
      } as FileFolderRow : null,
      subfolders: nextTree.folders
        .filter((folder) => folder.folderType === 'manual' && String(folder.moduleId || '') === moduleId && String(folder.recordId || '') === String(recordId) && String(folder.folderId || '').trim())
        .map((folder) => ({
          id: String(folder.folderId),
          name: String(folder.label || 'پوشه بدون نام'),
          module_id: moduleId,
          record_id: String(recordId),
          folder_type: 'manual',
          is_system: false,
          parent_id: String(folder.parentKey || '').startsWith('folder:') ? String(folder.parentKey).slice('folder:'.length) : recordFolderId || null,
        } as FileFolderRow)),
    });
  }, [moduleId, recordId]);

  const resolveBrowserScope = (folderKey: string) => {
    const normalizedKey = String(folderKey || '').trim();
    if (!normalizedKey) {
      return {
        scope: 'record' as const,
        moduleId,
        recordId: recordId || null,
      };
    }
    if (normalizedKey.startsWith('record:')) {
      const rest = normalizedKey.slice('record:'.length);
      const [nextModuleId, ...recordParts] = rest.split(':');
      return {
        scope: 'record' as const,
        moduleId: nextModuleId,
        recordId: recordParts.join(':'),
      };
    }
    if (normalizedKey.startsWith('module:')) {
      return {
        scope: 'module' as const,
        moduleId: normalizedKey.slice('module:'.length),
        recordId: null,
      };
    }
    return {
      scope: 'global' as const,
      moduleId: null,
      recordId: null,
    };
  };

  const getDefaultRecordFolderKey = () => (
    moduleId && recordId ? `record:${moduleId}:${recordId}` : 'all'
  );

  const getEffectiveFolderKey = (folderKey?: string | null) => {
    const normalized = String(folderKey || browserFolderKey || initialFolderKey || '').trim();
    return normalized || getDefaultRecordFolderKey();
  };

  const imageItems = useMemo(
    () => items.filter((it) => it.file_type === 'image').sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const videoItems = useMemo(
    () => items.filter((it) => it.file_type === 'video').sort((a, b) => a.sort_order - b.sort_order),
    [items],
  );
  const documentItems = useMemo(
    () => items.filter((it) => it.file_type === 'file').sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')),
    [items],
  );

  const loadLegacyProductImages = async (): Promise<RecordFileItem[]> => {
    if (moduleId !== 'products' || !recordId) return [];
    const { data, error } = await supabase
      .from('product_images')
      .select('id, image_url, sort_order, created_at')
      .eq('product_id', recordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any, idx: number) => ({
      id: String(row.id),
      module_id: moduleId,
      record_id: recordId,
      file_url: String(row.image_url || ''),
      file_type: 'image' as const,
      file_name: null,
      mime_type: null,
      sort_order: Number.isFinite(row.sort_order) ? row.sort_order : idx,
      source_kind: 'legacy',
      created_at: row.created_at ? String(row.created_at) : undefined,
    }));
  };
  const loadNoteAttachmentItems = async (sortOffset = 0): Promise<RecordFileItem[]> => {
    if (!recordId || !moduleId) return [];
    try {
      const { data, error } = await supabase
        .from('notes')
        .select('id, content, created_at')
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      const items: RecordFileItem[] = [];
      (data || []).forEach((row: any, noteIndex: number) => {
        const parsed = parseNoteContent(row?.content);
        parsed.attachments.forEach((attachment, attachmentIndex) => {
          items.push({
            id: `${NOTE_ATTACHMENT_ID_PREFIX}${String(row?.id || '')}:${attachmentIndex}`,
            module_id: moduleId,
            record_id: recordId,
            file_url: String(attachment.url || '').trim(),
            file_type: normalizeType(null, attachment.mimeType || null, attachment.url),
            file_name: attachment.name ? String(attachment.name) : null,
            mime_type: attachment.mimeType ? String(attachment.mimeType) : null,
            sort_order: sortOffset + noteIndex + attachmentIndex,
            source_kind: 'note_attachment',
            created_at: row?.created_at ? String(row.created_at) : undefined,
          });
        });
      });
      return items.filter((item) => item.file_url);
    } catch (error) {
      console.warn('Could not load note attachments for record files manager', error);
      return [];
    }
  };
  const mergeItemsWithNoteAttachments = async (baseItems: RecordFileItem[]) => {
    const noteItems = await loadNoteAttachmentItems(baseItems.length + 1000);
    if (noteItems.length === 0) return baseItems;
    return dedupeManagerItems([...baseItems, ...noteItems]);
  };

  const resolveCurrentRecordTitle = async () => {
    const fallback = String(recordId || '').trim();
    if (!moduleId || !recordId || !MODULES[moduleId]) return fallback;
    try {
      return await resolveRecordFolderLabel(moduleId, recordId, fallback);
    } catch (error) {
      console.warn('Could not resolve record title for file manager folder', error);
      return fallback;
    }
  };

  const bootstrapRecordContext = async (forceCheck = false): Promise<string> => {
    const scopeKey = `${String(moduleId || '').trim()}:${String(recordId || '').trim()}`;
    if (!recordId || !moduleId) {
      setLoadedScopeKey(scopeKey);
      return '';
    }
    if (!forceCheck && loadedScopeKey === scopeKey && (fileManagerEnabled || recordFilesEnabled || items.length > 0 || browserTree)) {
      return recordDisplayTitle || String(recordId || '');
    }
    const requestId = bootstrapRequestIdRef.current + 1;
    bootstrapRequestIdRef.current = requestId;
    let resolvedRecordTitle = recordDisplayTitle || String(recordId || '');
    try {
      const [nextRecordTitle, hasFileManagerTables, tableExists] = await Promise.all([
        resolveCurrentRecordTitle(),
        detectFileManagerTables(supabase, forceCheck),
        detectRecordFilesTable(supabase, forceCheck),
      ]);
      resolvedRecordTitle = nextRecordTitle;
      if (bootstrapRequestIdRef.current !== requestId) return resolvedRecordTitle;
      setRecordDisplayTitle(nextRecordTitle);
      setFileManagerEnabled(hasFileManagerTables);
      if (hasFileManagerTables) {
        const ensuredFolders = await ensureSystemFoldersForRecord(moduleId, recordId, nextRecordTitle);
        if (bootstrapRequestIdRef.current !== requestId) return resolvedRecordTitle;
        setSystemFolders({
          recordFolder: ensuredFolders.recordFolder || null,
          subfolders: [],
        });
      } else {
        setSystemFolders({ recordFolder: null, subfolders: [] });
      }
      if (bootstrapRequestIdRef.current !== requestId) return resolvedRecordTitle;
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);
      if (!tableExists && !hasFileManagerTables) {
        setRecordFilesEnabled(false);
      } else if (tableExists) {
        recordFilesTableExistsCache = true;
        setRecordFilesTableAvailability(true);
        setRecordFilesEnabled(true);
      }
    } catch (error: any) {
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        console.warn('record_files table is unavailable; falling back to legacy file sources when possible.');
      } else {
        console.warn('Could not load record files', error);
        msg.error('بارگذاری فایل‌ها ناموفق بود');
      }
    }
    if (bootstrapRequestIdRef.current !== requestId) return resolvedRecordTitle;
    setLoadedScopeKey(scopeKey);
    return resolvedRecordTitle;
  };

  const mapBrowserItemsToRecordItems = (loadedItems: FileManagerListItem[]) => {
    return loadedItems.map((row, idx) => ({
      id: String(row.id),
      asset_id: row.asset_id ? String(row.asset_id) : null,
      entry_id: row.entry_id ? String(row.entry_id) : null,
      module_id: String(row.module_id || moduleId),
      record_id: String(row.record_id || recordId),
      file_url: String(row.file_url || ''),
      file_type: normalizeType(row.file_type, row.mime_type, row.file_url),
      file_name: row.file_name ? String(row.file_name) : null,
      mime_type: row.mime_type ? String(row.mime_type) : null,
      sort_order: idx,
      folder_id: row.folder_id ? String(row.folder_id) : null,
      visibility: row.visibility ? String(row.visibility) as any : null,
      is_shortcut: row.is_shortcut === true,
      is_main_image: row.is_main_image === true || Boolean(String(mainImage || '').trim() && String(row.file_url || '').trim() === String(mainImage || '').trim()),
      source_module_id: row.source_module_id ? String(row.source_module_id) : null,
      source_record_id: row.source_record_id ? String(row.source_record_id) : null,
      source_record_title: row.source_record_title ? String(row.source_record_title) : null,
      source_kind: row.source_kind,
      created_at: row.created_at ? String(row.created_at) : undefined,
      tags: Array.isArray(row.tags) ? row.tags : [],
    }));
  };

  const isItemVisibleInFolder = (item: Pick<RecordFileItem, 'folder_id' | 'file_type'>, folderKey?: string | null) => {
    const normalizedFolderKey = getEffectiveFolderKey(folderKey);
    const itemFolderId = String(item.folder_id || '').trim();
    const rootFolderId = String(systemFolders.recordFolder?.id || '').trim();
    if (normalizedFolderKey.startsWith('folder:')) {
      return itemFolderId === normalizedFolderKey.slice('folder:'.length);
    }
    if (normalizedFolderKey.startsWith('record:')) {
      return !itemFolderId || itemFolderId === rootFolderId;
    }
    if (normalizedFolderKey === 'all' || normalizedFolderKey.startsWith('module:')) {
      return false;
    }
    return item.file_type === normalizedFolderKey;
  };

  const toBrowserListItem = (item: RecordFileItem): FileManagerListItem => ({
    id: String(item.id),
    asset_id: item.asset_id || null,
    entry_id: item.entry_id || null,
    folder_id: item.folder_id || null,
    module_id: String(item.module_id || moduleId),
    record_id: String(item.record_id || recordId || ''),
    file_url: String(item.file_url || ''),
    file_type: item.file_type,
    file_name: item.file_name || null,
    mime_type: item.mime_type || null,
    created_at: item.created_at ? String(item.created_at) : null,
    is_main_image: item.is_main_image === true,
    entry_metadata: null,
    entry_type: item.is_shortcut ? 'shortcut' : 'origin',
    is_shortcut: item.is_shortcut === true,
    source_module_id: item.source_module_id || null,
    source_record_id: item.source_record_id || null,
    source_record_title: item.source_record_title || null,
    visibility: item.visibility || null,
    source_kind: item.source_kind,
    tags: Array.isArray(item.tags) ? item.tags : [],
  });

  const appendOptimisticItem = (item: RecordFileItem, folderKey?: string | null) => {
    setItems((prev) => {
      if (prev.some((current) => current.id === item.id)) return prev;
      return [...prev, item];
    });
    setBrowserTree((prev) => {
      if (!prev) return prev;
      const nextBrowserItem = toBrowserListItem(item);
      const existsInAll = prev.allItems.some((current) => current.id === item.id);
      const nextAllItems = existsInAll ? prev.allItems : [...prev.allItems, nextBrowserItem];
      const shouldAppear = isItemVisibleInFolder(item, folderKey || prev.activeFolderKey);
      const nextVisibleItems = shouldAppear && !prev.items.some((current) => current.id === item.id)
        ? [...prev.items, nextBrowserItem]
        : prev.items;
      return {
        ...prev,
        allItems: nextAllItems,
        items: nextVisibleItems,
        totalItems: shouldAppear && !existsInAll ? prev.totalItems + 1 : prev.totalItems,
      };
    });
  };

  const patchOptimisticItem = (itemId: string, updater: (item: RecordFileItem) => RecordFileItem) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? updater(item) : item)));
    setBrowserTree((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) => (item.id === itemId ? toBrowserListItem(updater(item as RecordFileItem)) : item)),
        allItems: prev.allItems.map((item) => (item.id === itemId ? toBrowserListItem(updater(item as RecordFileItem)) : item)),
      };
    });
  };

  const removeOptimisticItem = (itemId: string) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId));
    setBrowserTree((prev) => {
      if (!prev) return prev;
      const nextVisibleItems = prev.items.filter((item) => item.id !== itemId);
      const removedVisibleCount = prev.items.length - nextVisibleItems.length;
      return {
        ...prev,
        items: nextVisibleItems,
        allItems: prev.allItems.filter((item) => item.id !== itemId),
        totalItems: Math.max(0, prev.totalItems - removedVisibleCount),
      };
    });
  };

  const mergeBrowserTreeWithNoteAttachments = async (tree: FileManagerTreeResult) => {
    const noteItems = await loadNoteAttachmentItems(tree.allItems.length + 1000);
    if (noteItems.length === 0) return tree;

    const mergedRecordItems = dedupeManagerItems([
      ...mapBrowserItemsToRecordItems(tree.allItems),
      ...noteItems,
    ]);
    if (mergedRecordItems.length === tree.allItems.length) return tree;

    const mergedAllItems = mergedRecordItems.map(toBrowserListItem);
    const recordRootKey = `record:${moduleId}:${recordId}`;
    const recordRootFolderId = normalizeManagerText(
      tree.folders.find((folder) => folder.key === recordRootKey)?.folderId,
    );
    const normalizedActiveFolderKey = normalizeManagerText(tree.activeFolderKey);
    const visibleItems = mergedAllItems.filter((item) => {
      const itemFolderId = normalizeManagerText(item.folder_id);
      if (normalizedActiveFolderKey.startsWith('folder:')) {
        return itemFolderId === normalizedActiveFolderKey.slice('folder:'.length);
      }
      if (
        normalizedActiveFolderKey === 'all'
        || normalizedActiveFolderKey.startsWith('module:')
        || normalizedActiveFolderKey === recordRootKey
      ) {
        return !itemFolderId || itemFolderId === recordRootFolderId;
      }
      return true;
    });
    const start = Math.max(0, (tree.page - 1) * tree.pageSize);
    const rootDelta = visibleItems.length - tree.totalItems;

    return {
      ...tree,
      folders: tree.folders.map((folder) => (
        folder.key === recordRootKey
          ? { ...folder, count: Math.max(0, Number(folder.count || 0) + rootDelta) }
          : folder
      )),
      items: visibleItems.slice(start, start + tree.pageSize),
      allItems: mergedAllItems,
      totalItems: visibleItems.length,
    };
  };

  const loadVisibleTree = async (options?: { forceCheck?: boolean; keepItems?: boolean; folderKey?: string | null; recordTitle?: string | null; loadMode?: 'primary' | 'full' }) => {
    if (!recordId || !moduleId) return;
    const activeFolderKey = getEffectiveFolderKey(options?.folderKey);
    const effectiveRecordTitle = String(options?.recordTitle || recordDisplayTitle || recordId).trim() || String(recordId);
    const nextRefreshing = Boolean(options?.keepItems);
    const requestId = visibleTreeRequestIdRef.current + 1;
    visibleTreeRequestIdRef.current = requestId;
    if (nextRefreshing) {
      setRefreshing(true);
    } else {
      setInitialLoading(true);
    }
    try {
      const hasFileManagerTables = await detectFileManagerTables(supabase, Boolean(options?.forceCheck));
      if (!hasFileManagerTables) {
        const legacyItems = await loadLegacyProductImages().catch(() => []);
        if (visibleTreeRequestIdRef.current !== requestId) return;
        setBrowserTree(null);
        setItems(await mergeItemsWithNoteAttachments(legacyItems));
        return;
      }

      const resolvedScope = resolveBrowserScope(activeFolderKey);
      const builtTree = await buildFileManagerTree({
        scope: resolvedScope.scope,
        page: browserPage,
        pageSize: browserPageSize,
        folderKey: activeFolderKey || undefined,
        moduleId: resolvedScope.moduleId,
        recordId: resolvedScope.recordId,
        loadMode: options?.loadMode || 'full',
        recordTitleMap: { [`${moduleId}:${recordId}`]: effectiveRecordTitle },
        moduleTitleMap: { [moduleId]: MODULES[moduleId]?.titles?.fa || moduleId },
      });
      const nextTree = (options?.loadMode || 'full') === 'full'
        ? await mergeBrowserTreeWithNoteAttachments(builtTree)
        : builtTree;

      if (visibleTreeRequestIdRef.current !== requestId) return;
      setBrowserTree(nextTree);
      syncSystemFoldersFromTree(nextTree, effectiveRecordTitle);
      setItems(mapBrowserItemsToRecordItems(nextTree.allItems));
      if ((!String(activeFolderKey || '').trim() || !nextTree.folders.some((folder) => folder.key === activeFolderKey)) && nextTree.activeFolderKey) {
        setBrowserFolderKey(nextTree.activeFolderKey);
      }
    } catch (error) {
      console.warn('Could not load visible file manager tree', error);
      msg.error('بارگذاری فایل‌ها ناموفق بود');
    } finally {
      if (visibleTreeRequestIdRef.current === requestId) {
        setRefreshing(false);
        setInitialLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!open) return;
    const nextInitialFolderKey = getDefaultRecordFolderKey();
    setInitialFolderKey(nextInitialFolderKey);
    setBrowserFolderKey(nextInitialFolderKey);
    setBrowserPage(1);
    void (async () => {
      skipBrowserEffectRef.current = true;
      try {
        const sameScope = loadedScopeKey === currentScopeKey;
        const hasExistingData = Boolean(browserTree || items.length > 0);
        if (!sameScope || !hasExistingData) {
          const nextRecordTitle = await bootstrapRecordContext(false);
          await loadVisibleTree({ forceCheck: false, keepItems: false, folderKey: nextInitialFolderKey, recordTitle: nextRecordTitle, loadMode: 'primary' });
          void loadVisibleTree({ forceCheck: false, keepItems: true, folderKey: nextInitialFolderKey, recordTitle: nextRecordTitle, loadMode: 'full' });
          return;
        }
        await loadVisibleTree({ forceCheck: false, keepItems: true, folderKey: nextInitialFolderKey });
      } finally {
        skipBrowserEffectRef.current = false;
      }
    })();
  }, [open, moduleId, recordId]);

  const loadBrowserTree = async () => {
    if (!open || !fileManagerEnabled || !moduleId || !recordId) return;
    await loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
  };

  const refreshCurrentScope = async (forceCheck = false) => {
    const nextRecordTitle = await bootstrapRecordContext(forceCheck);
    await loadVisibleTree({ forceCheck, keepItems: true, folderKey: getEffectiveFolderKey(), recordTitle: nextRecordTitle });
  };

  useEffect(() => {
    if (!open || !fileManagerEnabled || !browserReady) return;
    if (skipBrowserEffectRef.current) return;
    void loadBrowserTree();
  }, [browserFolderKey, browserPage, browserPageSize, fileManagerEnabled, browserReady]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const loadShareTargets = async () => {
      try {
        const [snapshot, directory] = await Promise.all([
          fetchSessionBootstrap(supabase),
          fetchAssigneeDirectory(supabase),
        ]);
        const orgId = String(snapshot.orgId || '').trim();
        const currentUserId = String(snapshot.user?.id || '').trim();
        const [groupsResult, botGroupsResult] = orgId
          ? await Promise.all([
              supabase
                .from('chat_groups')
                .select('id, name, user_ids, role_ids')
                .eq('org_id', orgId)
                .order('updated_at', { ascending: false })
                .limit(200),
              supabase
                .from('counterparty_bot_groups')
                .select('id, group_title, group_join_link, channel_type, bot_chat_id, customer_id, supplier_id, status')
                .in('channel_type', ['telegram', 'bale', 'rubika'])
                .eq('status', 'active')
                .order('updated_at', { ascending: false })
                .limit(200),
            ])
          : [{ data: [], error: null }, { data: [], error: null }];
        if (groupsResult.error) throw groupsResult.error;
        if (botGroupsResult.error) throw botGroupsResult.error;
        if (!active) return;
        const users = (directory.users || [])
          .map((user) => ({
            id: String(user.id || ''),
            display_name: String(user.display_name || user.full_name || user.email || user.mobile_1 || user.id),
            role_id: user.role_id ? String(user.role_id) : null,
          }))
          .filter((item) => item.id && item.display_name);
        const chatGroups = (groupsResult.data || []).map((group: any) => ({
          id: String(group?.id || ''),
          name: String(group?.name || 'گروه'),
          user_ids: Array.isArray(group?.user_ids) ? group.user_ids.map((value: any) => String(value)) : [],
          role_ids: Array.isArray(group?.role_ids) ? group.role_ids.map((value: any) => String(value)) : [],
        })).filter((group) => group.id);
        const botGroups = (botGroupsResult.data || [])
          .map((row: any) => {
            const channelType = String(row?.channel_type || '').trim() as 'telegram' | 'bale' | 'rubika';
            if (!['telegram', 'bale', 'rubika'].includes(channelType)) return null;
            return {
              id: String(row?.id || ''),
              title: String(row?.group_title || row?.group_join_link || row?.bot_chat_id || 'گروه بات'),
              channel_type: channelType,
              bot_chat_id: String(row?.bot_chat_id || ''),
              customer_id: row?.customer_id ? String(row.customer_id) : null,
              supplier_id: row?.supplier_id ? String(row.supplier_id) : null,
            };
          })
          .filter(Boolean) as CounterpartyBotGroup[];

        setDirectShareUsers(users);
        setDirectShareChatGroups(chatGroups);
        setDirectShareBotGroups(botGroups);
        setShareTargetOptions(
          users
            .map((user) => ({
              value: String(user.id),
              label: String(user.display_name || user.id),
            }))
            .filter((item) => item.value && item.label)
            .sort((a, b) => a.label.localeCompare(b.label, 'fa'))
        );
        setDirectShareTargetOptions([
          ...botGroups.map((group) => ({
            label: `گروه بات: ${group.title}`,
            value: `bot_group:${group.id}`,
          })),
          ...chatGroups.map((group) => ({
            label: `گروه داخلی: ${group.name}`,
            value: `chat_group:${group.id}`,
          })),
          ...users
            .filter((user) => user.id !== currentUserId)
            .map((user) => ({
              label: `کاربر: ${user.display_name}`,
              value: `user:${user.id}`,
            })),
        ]);
      } catch (error) {
        console.warn('Could not load task file share targets', error);
        if (active) {
          setShareTargetOptions([]);
          setDirectShareTargetOptions([]);
          setDirectShareUsers([]);
          setDirectShareChatGroups([]);
          setDirectShareBotGroups([]);
        }
      }
    };
    void loadShareTargets();
    return () => {
      active = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !highlightFileId) return;
    setBrowserFolderKey(getDefaultRecordFolderKey());
  }, [highlightFileId, open]);

  const buildStoredFileName = (file: File, desiredName: string) => {
    const ext = file.name.includes('.') ? String(file.name.split('.').pop() || '').trim() : '';
    const rawDesired = desiredName.trim() || file.name || 'file';
    const desiredBase = ext && rawDesired.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? rawDesired.slice(0, -1 * (ext.length + 1))
      : rawDesired;
    const cleanDesired = sanitizeStorageFileName(desiredBase || 'file');
    const finalBase = ext ? `${cleanDesired}.${ext}` : cleanDesired;
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${finalBase}`;
  };

  const uploadToStorage = async (file: File, desiredName: string): Promise<string> => {
    if (!recordId) throw new Error('Record id is required');
    const storedFileName = buildStoredFileName(file, desiredName);
    const filePath = joinStoragePath('record_files', moduleId, recordId, storedFileName);
    await uploadFileWithProgress({
      client: fileStorageClient,
      bucket: FILE_STORAGE_BUCKET,
      path: filePath,
      file,
      label: desiredName || file.name || 'فایل',
      detail: moduleId,
    });
    return fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath).data.publicUrl;
  };

  const resetUploadPrompt = () => {
    setNameModalOpen(false);
    setPendingFile(null);
    setPendingFileName('');
    setPendingFileExtension('');
    setPendingTags([]);
    setShareTargetIds([]);
    setShareInRelatedRecords(false);
  };

  const resolveTaskRelatedTargets = async (): Promise<RelatedRecordShareTarget[]> => {
    if (moduleId !== 'tasks' || !recordId) return [];
    const { data, error } = await supabase
      .from('tasks')
      .select('id, name, source_module_id, source_record_id, related_product, related_customer, related_supplier, related_production_order, related_invoice, project_id, purchase_invoice_id, marketing_lead_id, recurrence_info')
      .eq('id', recordId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return [];

    const targetMap = new Map<string, { moduleId: string; recordId: string }>();
    const addTarget = (nextModuleId: unknown, nextRecordId: unknown) => {
      const normalizedModuleId = String(nextModuleId || '').trim();
      const normalizedRecordId = String(nextRecordId || '').trim();
      if (!normalizedModuleId || !normalizedRecordId) return;
      if (normalizedModuleId === moduleId && normalizedRecordId === String(recordId)) return;
      targetMap.set(`${normalizedModuleId}:${normalizedRecordId}`, {
        moduleId: normalizedModuleId,
        recordId: normalizedRecordId,
      });
    };

    addTarget(data.source_module_id, data.source_record_id);
    addTarget('products', data.related_product);
    addTarget('customers', data.related_customer);
    addTarget('suppliers', data.related_supplier);
    addTarget('production_orders', data.related_production_order);
    addTarget('invoices', data.related_invoice);
    addTarget('projects', data.project_id);
    addTarget('purchase_invoices', data.purchase_invoice_id);
    addTarget('marketing_leads', data.marketing_lead_id);

    const processLinks = parseProcessLinkMap((data as any)?.recurrence_info?.process_links);
    Object.entries(processLinks).forEach(([linkedModuleId, linkedRecordId]) => {
      addTarget(linkedModuleId, linkedRecordId);
    });

    const targets = Array.from(targetMap.values());
    const titledTargets = await Promise.all(targets.map(async (target) => {
      try {
        const { data: targetRecord } = await supabase
          .from(target.moduleId)
          .select('*')
          .eq('id', target.recordId)
          .maybeSingle();
        return {
          ...target,
          title: getRecordDisplayLabel(targetRecord || { id: target.recordId }, target.moduleId, {
            fallback: target.recordId,
          }) || target.recordId,
        };
      } catch {
        return {
          ...target,
          title: target.recordId,
        };
      }
    }));

    return titledTargets;
  };

  const shareUploadedFileInChats = async (file: UploadedFileResult, recipientIds: string[] = shareTargetIds) => {
    const targetIds = Array.from(new Set(recipientIds.map((item) => String(item || '').trim()).filter(Boolean)));
    if (targetIds.length === 0) return;
    const scope = normalizeNoteScope(moduleId, recordId);
    const snapshot = await fetchSessionBootstrap(supabase);
    const currentUserId = String(snapshot.user?.id || '').trim() || null;
    const currentScope = scope.hasLinkedRecord
      ? scope
      : {
          module_id: currentUserId ? 'profiles' : scope.module_id,
          record_id: currentUserId || scope.record_id,
        };
    const payload = {
      module_id: currentScope.module_id,
      record_id: currentScope.record_id,
      content: serializeNoteContent('', [{
        name: file.fileName,
        url: file.url,
        mimeType: file.mimeType,
      }]),
      reply_to: null,
      mention_user_ids: targetIds,
      mention_role_ids: [],
      author_id: currentUserId,
      author_name: snapshot.profile?.full_name || null,
      metadata: { source_type: 'file_manager_share' },
    };
    await insertNotesWithFallback([payload]);
  };

  const shareUploadedFileWithRelatedRecords = async (file: UploadedFileResult, shouldShare = shareInRelatedRecords) => {
    if (!shouldShare || moduleId !== 'tasks' || !recordId) return 0;
    const targets = await resolveTaskRelatedTargets();
    if (targets.length === 0) return 0;
    const sourceTitle = recordDisplayTitle || String(recordId);

    if (fileManagerEnabled && file.assetId) {
      let createdCount = 0;
      for (const [index, target] of targets.entries()) {
        await createFileManagerShortcut({
          assetId: file.assetId,
          sourceEntryId: file.entryId || null,
          sourceModuleId: moduleId,
          sourceRecordId: String(recordId),
          sourceRecordTitle: sourceTitle,
          targetModuleId: target.moduleId,
          targetRecordId: target.recordId,
          targetRecordTitle: target.title,
          fileUrl: file.url,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileType: file.fileType,
          sortOrder: index,
        });
        createdCount += 1;
      }
      return createdCount;
    }

    if (!recordFilesEnabled) return 0;
    const rows = targets.map((target, index) => ({
      module_id: target.moduleId,
      record_id: target.recordId,
      file_url: file.url,
      file_type: file.fileType,
      file_name: file.fileName,
      mime_type: file.mimeType,
      sort_order: index,
      source_module_id: moduleId,
      source_record_id: String(recordId),
      source_record_title: sourceTitle,
    }));
    const { error } = await supabase.from('record_files').insert(rows);
    if (error) throw error;
    return rows.length;
  };

  const destinationOptions = useMemo(() => {
    const recordFolder = systemFolders.recordFolder;
    if (!recordFolder) return [] as Array<{ label: string; value: string }>;
    return [
      { label: recordDisplayTitle || String(recordFolder.name || 'پوشه رکورد'), value: String(recordFolder.id) },
      ...systemFolders.subfolders.map((folder) => ({
        label: String(folder.name || 'پوشه بدون نام'),
        value: String(folder.id),
      })),
    ];
  }, [recordDisplayTitle, systemFolders]);

  const getActiveFolderId = () => {
    if (!fileManagerEnabled) return null;
    const normalizedBrowserFolderKey = String(browserFolderKey || '').trim();
    if (normalizedBrowserFolderKey.startsWith('folder:')) {
      return normalizedBrowserFolderKey.slice('folder:'.length);
    }
    if (normalizedBrowserFolderKey.startsWith('record:') && systemFolders.recordFolder?.id) {
      return String(systemFolders.recordFolder.id);
    }
    return systemFolders.recordFolder?.id ? String(systemFolders.recordFolder.id) : null;
  };

  const openDestinationModal = (action: 'copy' | 'move', selected: RecordFileItem[]) => {
    if (!fileManagerEnabled) {
      msg.warning('کپی و انتقال مسیرمحور بعد از اجرای migration فایل‌منیجر فعال می‌شود');
      return;
    }
    const movableItems = selected.filter((item) => !isSyntheticNoteAttachmentId(item.id));
    if (movableItems.length === 0) {
      msg.warning('برای این فایل‌ها عملیات مسیرمحور پشتیبانی نمی‌شود');
      return;
    }
    const normalizedBrowserFolderKey = String(browserFolderKey || '').startsWith('folder:')
      ? String(browserFolderKey).slice('folder:'.length)
      : String(browserFolderKey || '');
    const defaultFolderId = browserFolderKey !== 'all' && destinationOptions.some((option) => option.value === normalizedBrowserFolderKey)
      ? normalizedBrowserFolderKey
      : destinationOptions[0]?.value || '';
    if (!defaultFolderId) {
      msg.warning('پوشه مقصد آماده نیست');
      return;
    }
    setDestinationAction(action);
    setDestinationItems(movableItems);
    setDestinationFolderId(defaultFolderId);
    setDestinationModalOpen(true);
  };

  const createShortcutsInActiveFolder = async (selected: RecordFileItem[]) => {
    if (!fileManagerEnabled || !recordId) {
      msg.warning('فایل‌منیجر برای این عملیات آماده نیست');
      return;
    }
    const folderId = String(getActiveFolderId() || '').trim();
    if (!folderId) {
      msg.warning('پوشه مقصد آماده نیست');
      return;
    }
    const shortcutItems = selected.filter((item) => !isSyntheticNoteAttachmentId(item.id));
    if (shortcutItems.length === 0) {
      msg.warning('برای این انتخاب ساخت میانبر پشتیبانی نمی‌شود');
      return;
    }
    try {
      for (const [index, item] of shortcutItems.entries()) {
        const created = await createFileManagerShortcut({
          assetId: item.asset_id || null,
          sourceEntryId: item.entry_id || null,
          sourceModuleId: item.module_id || moduleId,
          sourceRecordId: item.record_id || String(recordId),
          sourceRecordTitle: item.source_record_title || recordDisplayTitle || String(recordId),
          targetModuleId: moduleId,
          targetRecordId: String(recordId),
          targetRecordTitle: recordDisplayTitle || String(recordId),
          fileUrl: item.file_url,
          fileName: getDisplayFileName(item),
          mimeType: item.mime_type || null,
          fileType: item.file_type,
          folderId,
          sortOrder: index,
          tags: item.tags || [],
        });
        appendOptimisticItem({
          id: String(created?.recordFileId || created?.entry?.id || `${item.id}:shortcut:${index}`),
          asset_id: item.asset_id || null,
          entry_id: created?.entry?.id ? String(created.entry.id) : null,
          module_id: moduleId,
          record_id: String(recordId),
          file_url: item.file_url,
          file_type: item.file_type,
          file_name: getDisplayFileName(item),
          mime_type: item.mime_type || null,
          sort_order: index,
          folder_id: folderId,
          visibility: item.visibility || null,
          is_shortcut: true,
          source_module_id: item.module_id || moduleId,
          source_record_id: item.record_id || String(recordId),
          source_record_title: item.source_record_title || recordDisplayTitle || String(recordId),
          source_kind: 'entry',
          created_at: new Date().toISOString(),
          tags: item.tags || [],
        }, browserFolderKey);
      }
      msg.success('میانبرها در این مسیر ساخته شدند');
      await loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
    } catch (error) {
      console.warn('Create shortcut in current folder failed', error);
      msg.error('ساخت میانبر در این مسیر ناموفق بود');
    }
  };

  const closeDestinationModal = () => {
    if (destinationSaving) return;
    setDestinationModalOpen(false);
    setDestinationItems([]);
    setDestinationFolderId('');
  };

  const handleConfirmDestinationOperation = async () => {
    const folderId = String(destinationFolderId || '').trim();
    if (!folderId || destinationItems.length === 0 || !recordId) return;
    setDestinationSaving(true);
    try {
      if (destinationAction === 'move') {
        const entryIds = destinationItems.map((item) => String(item.entry_id || '').trim()).filter(Boolean);
        if (entryIds.length === 0) {
          msg.warning('انتقال فقط برای فایل‌های ثبت‌شده در فایل‌منیجر پشتیبانی می‌شود');
          return;
        }
        const { error: entryError } = await supabase
          .from('file_entries')
          .update({ folder_id: folderId })
          .in('id', entryIds);
        if (entryError) throw entryError;

        if (recordFilesEnabled) {
          const recordFileIds = destinationItems.map((item) => String(item.id || '').trim()).filter((id) => id && !isSyntheticNoteAttachmentId(id));
          if (recordFileIds.length > 0) {
            const { error: recordFileError } = await supabase
              .from('record_files')
              .update({ folder_id: folderId })
              .in('id', recordFileIds);
            if (recordFileError && !isMissingRecordFilesError(recordFileError)) throw recordFileError;
          }
          const { error: recordFileByEntryError } = await supabase
            .from('record_files')
            .update({ folder_id: folderId })
            .in('file_entry_id', entryIds);
          if (recordFileByEntryError && !isMissingRecordFilesError(recordFileByEntryError)) throw recordFileByEntryError;
        }
        destinationItems.forEach((item) => {
          patchOptimisticItem(item.id, (current) => ({ ...current, folder_id: folderId }));
        });
      } else {
        for (const [index, item] of destinationItems.entries()) {
          const created = await createFileManagerShortcut({
            assetId: item.asset_id || null,
            sourceEntryId: item.entry_id || null,
            sourceModuleId: item.module_id || moduleId,
            sourceRecordId: item.record_id || String(recordId),
            sourceRecordTitle: recordDisplayTitle || String(recordId),
            targetModuleId: moduleId,
            targetRecordId: String(recordId),
            targetRecordTitle: recordDisplayTitle || String(recordId),
            fileUrl: item.file_url,
            fileName: getDisplayFileName(item),
            mimeType: item.mime_type || null,
            fileType: item.file_type,
            folderId,
            sortOrder: index,
            tags: item.tags || [],
          });
          appendOptimisticItem({
            id: String(created?.recordFileId || created?.entry?.id || `${item.id}:copy:${index}`),
            asset_id: item.asset_id || null,
            entry_id: created?.entry?.id ? String(created.entry.id) : null,
            module_id: moduleId,
            record_id: String(recordId),
            file_url: item.file_url,
            file_type: item.file_type,
            file_name: getDisplayFileName(item),
            mime_type: item.mime_type || null,
            sort_order: index,
            folder_id: folderId,
            visibility: item.visibility || null,
            is_shortcut: true,
            source_module_id: item.module_id || moduleId,
            source_record_id: item.record_id || String(recordId),
            source_record_title: recordDisplayTitle || String(recordId),
            source_kind: 'entry',
            created_at: new Date().toISOString(),
            tags: item.tags || [],
          }, browserFolderKey);
        }
      }

      msg.success(destinationAction === 'move' ? 'فایل‌ها منتقل شدند' : 'میانبر فایل‌ها کپی شد');
      setDestinationModalOpen(false);
      setDestinationItems([]);
      setDestinationFolderId('');
      await loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
    } catch (error) {
      console.warn('File destination operation failed', error);
      msg.error(destinationAction === 'move' ? 'انتقال فایل‌ها ناموفق بود' : 'کپی فایل‌ها ناموفق بود');
    } finally {
      setDestinationSaving(false);
    }
  };

  const openCreateFolderModal = (parentId: string) => {
    const normalizedParentKey = String(parentId || '').trim();
    const normalizedParentId = normalizedParentKey === `record:${moduleId}:${recordId}`
      ? String(systemFolders.recordFolder?.id || '')
      : normalizedParentKey.replace(/^folder:/, '');
    if (!normalizedParentId || normalizedParentKey === 'all') {
      msg.warning('ابتدا وارد یک پوشه شوید');
      return;
    }
    setFolderModalMode('create');
    setFolderParentId(normalizedParentId);
    setFolderTarget(null);
    setFolderNameValue('');
    setFolderModalOpen(true);
  };

  const openRenameFolderModal = (folder: { key: string; label: string }) => {
    const normalizedFolderKey = String(folder.key || '').trim().replace(/^folder:/, '');
    const target = [systemFolders.recordFolder, ...systemFolders.subfolders]
      .filter(Boolean)
      .find((item) => String(item?.id) === normalizedFolderKey) as FileFolderRow | undefined;
    if (!target) return;
    if (target.is_system) {
      msg.warning('پوشه‌های سیستمی قابل تغییر نام نیستند');
      return;
    }
    setFolderModalMode('rename');
    setFolderParentId(String(target.parent_id || ''));
    setFolderTarget(target);
    setFolderNameValue(String(target.name || folder.label || ''));
    setFolderModalOpen(true);
  };

  const closeFolderModal = () => {
    if (folderSaving) return;
    setFolderModalOpen(false);
    setFolderTarget(null);
    setFolderParentId('');
    setFolderNameValue('');
  };

  const handleConfirmFolderModal = async () => {
    const name = String(folderNameValue || '').trim();
    if (!name) {
      msg.warning('نام پوشه الزامی است');
      return;
    }
    setFolderSaving(true);
    try {
      if (folderModalMode === 'rename' && folderTarget) {
        await renameFileFolder(folderTarget.id, name);
        msg.success('نام پوشه بروزرسانی شد');
      } else {
        await createManualFileFolder({
          parentId: folderParentId,
          name,
          moduleId,
          recordId: recordId || null,
        });
        msg.success('پوشه ساخته شد');
      }
      setFolderModalOpen(false);
      setFolderTarget(null);
      setFolderParentId('');
      setFolderNameValue('');
      await refreshCurrentScope(false);
    } catch (error: any) {
      console.warn('Folder save failed', error);
      if (String(error?.message || '') === 'system_folder_locked') {
        msg.error('پوشه سیستمی قابل ویرایش نیست');
      } else {
        msg.error('ذخیره پوشه ناموفق بود');
      }
    } finally {
      setFolderSaving(false);
    }
  };

  const handleDeleteFolder = async (folder: { key: string; label: string }) => {
    try {
      await deleteManualFileFolder(String(folder.key || '').trim().replace(/^folder:/, ''));
      if (browserFolderKey === folder.key) {
        setBrowserFolderKey(systemFolders.recordFolder?.id ? `record:${moduleId}:${recordId}` : 'all');
      }
      msg.success('پوشه حذف شد');
      await refreshCurrentScope(false);
    } catch (error: any) {
      console.warn('Folder delete failed', error);
      if (String(error?.message || '') === 'system_folder_locked') {
        msg.error('پوشه سیستمی قابل حذف نیست');
      } else if (String(error?.message || '') === 'folder_not_empty') {
        msg.error('برای حذف پوشه، ابتدا فایل‌ها و زیرپوشه‌های داخل آن را جابه‌جا یا حذف کنید');
      } else {
        msg.error('حذف پوشه ناموفق بود');
      }
    }
  };

  const uploadFile = async (file: File, desiredName: string): Promise<UploadedFileResult | null> => {
    if (!recordId) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return null;
    }

    const type = getFileType(file);
    try {
      let useLegacy = !fileManagerEnabled && (!recordFilesEnabled || recordFilesTableExistsCache === false);
      if (!fileManagerEnabled && useLegacy) {
        const tableExists = await detectRecordFilesTable(supabase, true);
        recordFilesTableExistsCache = tableExists;
        setRecordFilesEnabled(tableExists);
        useLegacy = !tableExists;
      }

      if (!fileManagerEnabled && useLegacy && !(moduleId === 'products' && type === 'image')) {
        msg.error('برای آپلود فیلم و فایل، ابتدا migration جدول record_files را اجرا کنید.');
        return null;
      }

      const url = await uploadToStorage(file, desiredName);

      if (useLegacy) {
        const nextOrder = imageItems.length;
        const { data, error } = await supabase
          .from('product_images')
          .insert([{ product_id: recordId, image_url: url, sort_order: nextOrder }])
          .select('id, image_url, sort_order, created_at')
          .single();
        if (error) throw error;

        setItems((prev) => [
          ...prev,
          {
            id: String(data.id),
            module_id: moduleId,
            record_id: recordId,
            file_url: String(data.image_url || ''),
            file_type: 'image',
            file_name: desiredName,
            mime_type: file.type || null,
            sort_order: Number.isFinite(data.sort_order) ? data.sort_order : nextOrder,
            source_kind: 'legacy',
            created_at: data.created_at ? String(data.created_at) : undefined,
          },
        ]);
        if (!mainImage && onMainImageChange) onMainImageChange(url);
        await logAndTouchRecord({
          supabase,
          moduleId,
          recordId,
          action: 'file_attached',
          fieldName: 'record_files',
          fieldLabel: 'فایل‌های رکورد',
          oldValue: null,
          newValue: desiredName,
          metadata: {
            changeKind: 'file_attached',
            fileName: desiredName,
            fileType: 'image',
            summary: 'فایل به رکورد پیوست شد',
          },
        });
        msg.success('فایل اضافه شد');
        return {
          url,
          fileType: 'image',
          fileName: desiredName,
          mimeType: file.type || null,
          assetId: null,
          entryId: null,
        };
      }

      if (fileManagerEnabled) {
        const nextOrder = type === 'image' ? imageItems.length : type === 'video' ? videoItems.length : documentItems.length;
        const created = await createFileManagerOriginForUpload({
          moduleId,
          recordId,
          recordTitle: recordDisplayTitle || String(recordId || ''),
          fileUrl: url,
          fileName: desiredName,
          mimeType: file.type || null,
          fileType: type,
          folderId: getActiveFolderId(),
          sortOrder: nextOrder,
          tags: pendingTags,
        });
        const optimisticItem: RecordFileItem = {
          id: String(created?.recordFileId || created?.entry?.id || url),
          asset_id: created?.asset?.id ? String(created.asset.id) : null,
          entry_id: created?.entry?.id ? String(created.entry.id) : null,
          module_id: moduleId,
          record_id: String(recordId),
          file_url: url,
          file_type: type,
          file_name: desiredName,
          mime_type: file.type || null,
          sort_order: nextOrder,
          created_at: new Date().toISOString(),
          folder_id: getActiveFolderId(),
          visibility: created?.asset?.visibility ? String(created.asset.visibility) as any : null,
          is_shortcut: false,
          source_record_title: recordDisplayTitle || String(recordId),
          source_kind: 'entry',
          tags: pendingTags,
        };
        appendOptimisticItem(optimisticItem, browserFolderKey);
        void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
        if (!mainImage && onMainImageChange) onMainImageChange(url);
        await logAndTouchRecord({
          supabase,
          moduleId,
          recordId,
          action: 'file_attached',
          fieldName: 'record_files',
          fieldLabel: 'فایل‌های رکورد',
          oldValue: null,
          newValue: desiredName,
          metadata: {
            changeKind: 'file_attached',
            fileName: desiredName,
            fileType: type,
            summary: 'فایل به رکورد پیوست شد',
          },
        });
        msg.success('فایل اضافه شد');
        return {
          url,
          fileType: type,
          fileName: desiredName,
          mimeType: file.type || null,
          assetId: created?.asset?.id || null,
          entryId: created?.entry?.id || null,
          tags: pendingTags,
        };
      }

      const nextOrder = type === 'image' ? imageItems.length : type === 'video' ? videoItems.length : 0;
      const { data, error } = await supabase
        .from('record_files')
        .insert([
          {
            module_id: moduleId,
            record_id: recordId,
            file_url: url,
            file_type: type,
            file_name: desiredName,
            mime_type: file.type || null,
            sort_order: nextOrder,
          },
        ])
        .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, sort_order, source_module_id, source_record_id, source_record_title, created_at')
        .single();
      if (error) throw error;

      appendOptimisticItem({
        id: String(data.id),
        module_id: String(data.module_id),
        record_id: String(data.record_id),
        file_url: String(data.file_url),
        file_type: normalizeType(data.file_type, data.mime_type, data.file_url),
        file_name: data.file_name ? String(data.file_name) : null,
        mime_type: data.mime_type ? String(data.mime_type) : null,
        sort_order: Number.isFinite(data.sort_order) ? data.sort_order : nextOrder,
        source_module_id: data.source_module_id ? String(data.source_module_id) : null,
        source_record_id: data.source_record_id ? String(data.source_record_id) : null,
        source_record_title: data.source_record_title ? String(data.source_record_title) : null,
        source_kind: 'legacy',
        created_at: data.created_at ? String(data.created_at) : undefined,
        folder_id: getActiveFolderId(),
        tags: pendingTags,
      }, browserFolderKey);
      void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });

      if (!mainImage && onMainImageChange) onMainImageChange(url);
      await logAndTouchRecord({
        supabase,
        moduleId,
        recordId,
        action: 'file_attached',
        fieldName: 'record_files',
        fieldLabel: 'فایل‌های رکورد',
        oldValue: null,
        newValue: desiredName,
        metadata: {
          changeKind: 'file_attached',
          fileName: desiredName,
          fileType: type,
          summary: 'فایل به رکورد پیوست شد',
        },
      });
      msg.success('فایل اضافه شد');
        return {
          url,
          fileType: type,
          fileName: desiredName,
          mimeType: file.type || null,
          assetId: null,
          entryId: null,
          tags: pendingTags,
        };
    } catch (error: any) {
      if (isUploadCanceledError(error)) {
        return null;
      }
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        msg.error('جدول record_files وجود ندارد. migration را اجرا کنید.');
      } else {
        msg.error('خطا در ثبت فایل: ' + (error?.message || 'نامشخص'));
      }
    }
    return null;
  };

  const handleBeforeUpload = (file: File) => {
    if (!recordId) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return false;
    }
    const fileName = String(file.name || '').trim();
    const lastDotIndex = fileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName || 'file';
    const extension = lastDotIndex > 0 ? fileName.slice(lastDotIndex + 1) : '';
    setPendingFile(file);
    setPendingFileName(baseName);
    setPendingFileExtension(extension);
    setPendingTags([]);
    setNameModalOpen(true);
    return false;
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile) return false;
    const finalName = pendingFileName.trim();
    if (!finalName) {
      msg.warning('نام فایل الزامی است');
      return false;
    }

    const file = pendingFile;
    const finalFileName = pendingFileExtension ? `${finalName}.${pendingFileExtension}` : finalName;
    const recipientIds = [...shareTargetIds];
    const shouldShareInRelatedRecords = shareInRelatedRecords;
    resetUploadPrompt();
    const uploaded = await uploadFile(file, finalFileName);
    if (!uploaded) return false;
    try {
      await shareUploadedFileInChats(uploaded, recipientIds);
      const copiedCount = await shareUploadedFileWithRelatedRecords(uploaded, shouldShareInRelatedRecords);
      if (recipientIds.length > 0 && copiedCount > 0) {
        msg.success('فایل آپلود و همزمان ارسال شد');
      } else if (recipientIds.length > 0) {
        msg.success('فایل آپلود و در گفتگو ارسال شد');
      } else if (copiedCount > 0) {
        msg.success(`فایل در ${copiedCount} رکورد مرتبط هم نمایش داده شد`);
      }
    } catch (error) {
      console.warn('Record file post-upload sharing failed', error);
      msg.warning('فایل آپلود شد ولی اشتراک‌گذاری کامل نشد');
    }
    return false;
  };

  const handleCancelUploadPrompt = () => {
    resetUploadPrompt();
  };

  const handleAddCompressedArchive = async ({
    blob,
    fileName,
  }: {
    blob: Blob;
    fileName: string;
    sourceItems: FileManagerBrowserItem[];
  }): Promise<FileManagerBrowserItem> => {
    if (!recordId || !moduleId) throw new Error('record_required');
    const finalFileName = String(fileName || '').trim() || `files-${Date.now()}.zip`;
    const file = new File([blob], finalFileName, { type: 'application/zip' });
    const storedFileName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeStorageFileName(finalFileName)}`;
    const filePath = joinStoragePath('record_files', moduleId, recordId, 'archives', storedFileName);
    await uploadFileWithProgress({
      client: fileStorageClient,
      bucket: FILE_STORAGE_BUCKET,
      path: filePath,
      file,
      label: finalFileName,
      detail: 'ZIP فایل‌ها',
    });
    const { data: urlData } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
    const publicUrl = String(urlData.publicUrl || '').trim();
    if (!publicUrl) throw new Error('archive_url_missing');

      if (fileManagerEnabled) {
      const nextOrder = documentItems.length + imageItems.length + videoItems.length;
      const created = await createFileManagerOriginForUpload({
        moduleId,
        recordId,
        recordTitle: recordDisplayTitle || String(recordId),
        fileUrl: publicUrl,
        fileName: finalFileName,
        mimeType: 'application/zip',
        fileType: 'archive',
          folderId: getActiveFolderId(),
          sortOrder: nextOrder,
        });
      appendOptimisticItem({
        id: String(created?.recordFileId || created?.entry?.id || publicUrl),
        asset_id: created?.asset?.id ? String(created.asset.id) : null,
        entry_id: created?.entry?.id ? String(created.entry.id) : null,
        module_id: moduleId,
        record_id: String(recordId),
        file_url: publicUrl,
        file_type: 'file',
        file_name: finalFileName,
        mime_type: 'application/zip',
        created_at: new Date().toISOString(),
        folder_id: getActiveFolderId(),
        visibility: created?.asset?.visibility ? String(created.asset.visibility) as any : null,
        is_shortcut: false,
        source_kind: 'entry',
      } as RecordFileItem, browserFolderKey);
      void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
      return {
        id: String(created?.recordFileId || created?.entry?.id || publicUrl),
        asset_id: created?.asset?.id ? String(created.asset.id) : null,
        entry_id: created?.entry?.id ? String(created.entry.id) : null,
        module_id: moduleId,
        record_id: String(recordId),
        file_url: publicUrl,
        file_type: 'file',
        file_name: finalFileName,
        mime_type: 'application/zip',
        created_at: new Date().toISOString(),
        folder_id: getActiveFolderId(),
        visibility: created?.asset?.visibility ? String(created.asset.visibility) as any : null,
        is_shortcut: false,
        source_kind: 'entry',
      } as FileManagerBrowserItem;
    }

    if (!recordFilesEnabled) throw new Error('record_files_unavailable');
    const { data, error } = await supabase
      .from('record_files')
      .insert([{
        module_id: moduleId,
        record_id: recordId,
        file_url: publicUrl,
        file_type: 'archive',
        file_name: finalFileName,
        mime_type: 'application/zip',
        sort_order: documentItems.length + imageItems.length + videoItems.length,
      }])
      .select('id, module_id, record_id, file_url, file_name, mime_type, created_at')
      .single();
    if (error) throw error;
    appendOptimisticItem({
      id: String(data?.id || publicUrl),
      module_id: String(data?.module_id || moduleId),
      record_id: String(data?.record_id || recordId),
      file_url: String(data?.file_url || publicUrl),
      file_type: 'file',
      file_name: data?.file_name ? String(data.file_name) : finalFileName,
      mime_type: data?.mime_type ? String(data.mime_type) : 'application/zip',
      created_at: data?.created_at ? String(data.created_at) : new Date().toISOString(),
      folder_id: getActiveFolderId(),
      sort_order: documentItems.length + imageItems.length + videoItems.length,
      source_kind: 'legacy',
    }, browserFolderKey);
    void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
    return {
      id: String(data?.id || publicUrl),
      module_id: String(data?.module_id || moduleId),
      record_id: String(data?.record_id || recordId),
      file_url: String(data?.file_url || publicUrl),
      file_type: 'file',
      file_name: data?.file_name ? String(data.file_name) : finalFileName,
      mime_type: data?.mime_type ? String(data.mime_type) : 'application/zip',
      created_at: data?.created_at ? String(data.created_at) : new Date().toISOString(),
      source_kind: 'legacy',
    };
  };

  const handleDirectShareItems = async (
    selectedItems: FileManagerBrowserItem[],
    urls: string[],
    _options: { publicAccess: boolean; deliveryMode: 'original' | 'preview' | 'compressed' },
    recipientIds: string[],
  ) => {
    const targetIds = Array.from(new Set(recipientIds.map((item) => String(item || '').trim()).filter(Boolean)));
    if (targetIds.length === 0) return;

    const attachments = selectedItems
      .map((item, index) => ({
        name: getDisplayFileName(item as RecordFileItem),
        url: String(urls[index] || item.file_url || '').trim(),
        mimeType: item.mime_type || null,
      }))
      .filter((item) => item.url);
    if (attachments.length === 0) return;

    const scope = normalizeNoteScope(moduleId, recordId);
    const snapshot = await fetchSessionBootstrap(supabase);
    const currentUserId = String(snapshot.user?.id || '').trim();
    const authorName = String(snapshot.profile?.full_name || '').trim() || null;
    const noteText = recordDisplayTitle ? `فایل از ${recordDisplayTitle}` : 'فایل ارسال شد.';
    const payloads: Array<Record<string, any>> = [];
    const botTargets: CounterpartyBotGroup[] = [];

    targetIds.forEach((targetId) => {
      if (targetId.startsWith('chat_group:')) {
        const groupId = targetId.replace('chat_group:', '');
        const group = directShareChatGroups.find((item) => item.id === groupId);
        if (!group) return;
        const roleDrivenUserIds = directShareUsers
          .filter((user) => user.role_id && group.role_ids.includes(String(user.role_id)))
          .map((user) => String(user.id));
        const mentionUserIds = Array.from(new Set([...group.user_ids, ...roleDrivenUserIds]))
          .filter((userId) => userId !== currentUserId);
        payloads.push({
          module_id: scope.module_id,
          record_id: scope.record_id,
          content: serializeNoteContent(noteText, attachments),
          reply_to: null,
          mention_user_ids: mentionUserIds,
          mention_role_ids: group.role_ids,
          author_id: currentUserId || null,
          author_name: authorName,
          metadata: { chat_group_id: group.id, source_type: 'file_manager_share' },
        });
        return;
      }

      if (targetId.startsWith('bot_group:')) {
        const groupId = targetId.replace('bot_group:', '');
        const group = directShareBotGroups.find((item) => item.id === groupId);
        if (group) botTargets.push(group);
        return;
      }

      const userId = targetId.startsWith('user:') ? targetId.replace('user:', '') : targetId;
      if (!userId || userId === currentUserId) return;
      payloads.push({
        module_id: scope.module_id,
        record_id: scope.record_id,
        content: serializeNoteContent(noteText, attachments),
        reply_to: null,
        mention_user_ids: [userId],
        mention_role_ids: [],
        author_id: currentUserId || null,
        author_name: authorName,
        metadata: { source_type: 'file_manager_share' },
      });
    });

    if (payloads.length > 0) {
      await insertNotesWithFallback(payloads);
    }

    for (const target of botTargets) {
      const isRubikaTarget = target.channel_type === 'rubika';
      const externalText = [
        noteText,
        attachments.map((item) => `فایل: ${String(item.url || '').trim()}`).filter(Boolean).join('\n'),
      ].filter(Boolean).join('\n');
      await sendCounterpartyBotGroupMessage({
        group: target,
        text: isRubikaTarget
          ? (String(noteText || '').trim() || 'فایل ارسال شد.')
          : (externalText || 'فایل ارسال شد.'),
        messageType: 'file',
        fallbackText: isRubikaTarget
          ? [noteText, attachments.map((item) => `🔗 ${item.name}`).join('\n')].filter(Boolean).join('\n')
          : undefined,
        attachments: isRubikaTarget ? attachments : undefined,
        payload: {
          attachments,
          source_type: 'file_manager_share',
          module_id: scope.module_id,
          record_id: scope.record_id,
        },
      });
    }
  };

  const openRenameModal = (item: RecordFileItem) => {
    if (isSyntheticNoteAttachmentId(item.id)) {
      msg.warning('تغییر نام پیوست‌های یادداشت از این بخش پشتیبانی نمی‌شود');
      return;
    }
    setRenameTarget(item);
    setRenameValue(getDisplayFileName(item));
    setRenameTags(Array.isArray(item.tags) ? item.tags : []);
    setRenameModalOpen(true);
  };

  const closeRenameModal = () => {
    if (renaming) return;
    setRenameModalOpen(false);
    setRenameTarget(null);
    setRenameValue('');
    setRenameTags([]);
  };

  const handleRename = async () => {
    const target = renameTarget;
    const nextName = String(renameValue || '').trim();
    if (!target) return;
    if (!nextName) {
      msg.warning('نام فایل الزامی است');
      return;
    }

    setRenaming(true);
    try {
      if (fileManagerEnabled && target.asset_id) {
        const { data: assetRow } = await supabase
          .from('file_assets')
          .select('metadata')
          .eq('id', target.asset_id)
          .maybeSingle();
        const nextTagMetadata = {
          ...((assetRow?.metadata && typeof assetRow.metadata === 'object') ? assetRow.metadata : {}),
          tags: renameTags,
        };
        const { error: assetError } = await supabase
          .from('file_assets')
          .update({
            display_name: nextName,
            canonical_name: nextName,
            metadata: nextTagMetadata,
          })
          .eq('id', target.asset_id);
        if (assetError) throw assetError;

        if (target.entry_id) {
          const { data: entryRow } = await supabase
            .from('file_entries')
            .select('metadata')
            .eq('id', target.entry_id)
            .maybeSingle();
          const { error: entryError } = await supabase
            .from('file_entries')
            .update({
              entry_name: nextName,
              metadata: {
                ...((entryRow?.metadata && typeof entryRow.metadata === 'object') ? entryRow.metadata : {}),
                tags: renameTags,
              },
            })
            .eq('id', target.entry_id);
          if (entryError) throw entryError;
        }

        if (recordFilesEnabled) {
          const { error: legacyError } = await supabase
            .from('record_files')
            .update({ file_name: nextName })
            .eq('asset_id', target.asset_id);
          if (legacyError && !isMissingRecordFilesError(legacyError)) throw legacyError;
        }
      } else {
        const { error } = await supabase
          .from('record_files')
          .update({ file_name: nextName })
          .eq('id', target.id);
        if (error) throw error;
      }

      patchOptimisticItem(target.id, (current) => ({ ...current, file_name: nextName, tags: renameTags }));
      void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
      setRenameModalOpen(false);
      setRenameTarget(null);
      setRenameValue('');
      setRenameTags([]);
      msg.success('نام فایل بروزرسانی شد');
    } catch (error) {
      console.warn('Rename file failed', error);
      msg.error('تغییر نام فایل ناموفق بود');
    } finally {
      setRenaming(false);
    }
  };

  const handleSetMainImages = async (selected: RecordFileItem[]) => {
    if (!canEdit) {
      msg.warning('دسترسی تغییر ستاره فایل‌ها را ندارید');
      return;
    }
    const fileSelections = selected.filter((item) => String(item.entry_id || '').trim() && String(item.file_url || '').trim());
    if (fileSelections.length === 0) {
      msg.warning('حداقل یک فایل قابل مدیریت انتخاب کنید');
      return;
    }

    const nextStarred = fileSelections.length === 1 ? fileSelections[0].is_main_image !== true : true;
    const starredAt = new Date().toISOString();
    try {
      const entryIds = fileSelections.map((item) => String(item.entry_id || '').trim()).filter(Boolean);
      if (fileManagerEnabled && entryIds.length > 0) {
        const { data: entryRows, error: entryRowsError } = await supabase
          .from('file_entries')
          .select('id, metadata')
          .in('id', entryIds);
        if (entryRowsError) throw entryRowsError;

        const metadataById = new Map(
          (entryRows || []).map((row: any) => [
            String(row.id),
            row?.metadata && typeof row.metadata === 'object' ? row.metadata : {},
          ]),
        );

        const results = await Promise.all(entryIds.map((entryId) => {
          const previousMetadata = metadataById.get(entryId) || {};
          return supabase
            .from('file_entries')
            .update({
              metadata: {
                ...previousMetadata,
                main_image: {
                  ...(previousMetadata as any)?.main_image,
                  starred: nextStarred,
                  starred_at: nextStarred ? starredAt : null,
                  module_id: moduleId,
                  record_id: recordId || null,
                },
              },
            })
            .eq('id', entryId);
        }));
        const failed = results.find((result: any) => result?.error);
        if (failed?.error) throw failed.error;
      }

      const imageSelections = fileSelections.filter((item) => item.file_type === 'image');
      const lastStarredImage = imageSelections[imageSelections.length - 1];
      if (nextStarred && lastStarredImage && onMainImageChange) {
        await Promise.resolve(onMainImageChange(lastStarredImage.file_url));
      } else if (!nextStarred && onMainImageChange && fileSelections.some((item) => String(item.file_url) === String(mainImage || ''))) {
        await Promise.resolve(onMainImageChange(null));
      }
      setItems((prev) => prev.map((item) => (
        fileSelections.some((selectedItem) => selectedItem.id === item.id)
          ? { ...item, is_main_image: nextStarred }
          : item
      )));
      invalidateFileManagerFolderCaches(moduleId, recordId || null);
      msg.success(nextStarred
        ? (fileSelections.length > 1 ? 'فایل‌های انتخاب‌شده ستاره‌دار شدند' : 'فایل ستاره‌دار شد')
        : 'ستاره فایل برداشته شد');
    } catch (error) {
      console.warn('Update starred files failed', error);
      msg.error('بروزرسانی ستاره فایل‌ها ناموفق بود');
    }
  };

  const handleUpdateFileTags = async (
    item: RecordFileItem,
    tags: Array<{ id: string; title: string; color?: string | null }>,
  ) => {
    if (!fileManagerEnabled || !item.asset_id) {
      msg.warning('ویرایش برچسب برای این فایل در دسترس نیست');
      return;
    }
    const normalizedTags = Array.isArray(tags) ? tags : [];
    try {
      const { data: assetRow } = await supabase
        .from('file_assets')
        .select('metadata')
        .eq('id', item.asset_id)
        .maybeSingle();
      const { error: assetError } = await supabase
        .from('file_assets')
        .update({
          metadata: {
            ...((assetRow?.metadata && typeof assetRow.metadata === 'object') ? assetRow.metadata : {}),
            tags: normalizedTags,
          },
        })
        .eq('id', item.asset_id);
      if (assetError) throw assetError;

      if (item.entry_id) {
        const { data: entryRow } = await supabase
          .from('file_entries')
          .select('metadata')
          .eq('id', item.entry_id)
          .maybeSingle();
        const { error: entryError } = await supabase
          .from('file_entries')
          .update({
            metadata: {
              ...((entryRow?.metadata && typeof entryRow.metadata === 'object') ? entryRow.metadata : {}),
              tags: normalizedTags,
            },
          })
          .eq('id', item.entry_id);
        if (entryError) throw entryError;
      }

      patchOptimisticItem(item.id, (current) => ({ ...current, tags: normalizedTags }));
      void loadVisibleTree({ keepItems: true, folderKey: browserFolderKey });
      msg.success('برچسب‌های فایل بروزرسانی شد');
    } catch (error) {
      console.warn('Update file tags failed', error);
      msg.error('بروزرسانی برچسب‌های فایل ناموفق بود');
    }
  };

  const handleDelete = async (fileId: string) => {
    if (!canDeleteFiles) {
      msg.warning('دسترسی حذف فایل ندارید');
      return;
    }
    if (isSyntheticNoteAttachmentId(fileId)) {
      msg.warning('برای حذف این فایل، پیوست را از خود یادداشت حذف کنید');
      return;
    }
    try {
      const target = items.find((it) => it.id === fileId);
      if (fileManagerEnabled && target?.entry_id) {
        await deleteFileManagerEntry({
          recordFileId: target.id,
          entryId: target.entry_id,
        });
      } else if (!recordFilesEnabled || recordFilesTableExistsCache === false) {
        if (moduleId !== 'products') return;
        const { error } = await supabase.from('product_images').delete().eq('id', fileId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('record_files').delete().eq('id', fileId);
        if (error) throw error;
      }

      const nextItems = items.filter((it) => it.id !== fileId);
      removeOptimisticItem(fileId);
      if (target?.file_url === mainImage) {
        const nextImage = nextItems.find((item) => item.file_type === 'image');
        onMainImageChange?.(nextImage?.file_url || null);
      }
      if (target) {
        await logAndTouchRecord({
          supabase,
          moduleId,
          recordId: String(recordId || ''),
          action: 'file_removed',
          fieldName: 'record_files',
          fieldLabel: 'فایل‌های رکورد',
          oldValue: target.file_name || target.file_url || 'فایل',
          newValue: null,
          metadata: {
            changeKind: 'file_removed',
            fileName: target.file_name || null,
            fileType: target.file_type || null,
            summary: 'فایل از رکورد حذف شد',
          },
        });
      }
      msg.success('فایل حذف شد');
    } catch (error: any) {
      console.warn('Delete file failed', error);
      if (String(error?.message || '').trim() === 'origin_has_shortcuts') {
        msg.error('این فایل مرجع اصلی میانبرهای دیگر است. ابتدا میانبرها را حذف یا جابه‌جا کنید.');
        return;
      }
      msg.error('حذف فایل ناموفق بود');
    }
  };

  const browserFolders = useMemo(() => {
    if (fileManagerEnabled && browserTree) {
      return browserTree.folders.map((folder) => (
        folder.key === `record:${moduleId}:${recordId}` && recordDisplayTitle
          ? { ...folder, label: recordDisplayTitle }
          : folder
      ));
    }
    const recordFolder = systemFolders.recordFolder;
    if (fileManagerEnabled && recordFolder) {
      const recordFolderId = String(recordFolder.id);
      const recursiveFolderCounts = buildRecursiveFallbackFolderCounts(recordFolderId, systemFolders.subfolders, items);
      return [
        { key: 'all', label: 'همه فایل‌ها', count: items.length, isSystem: true },
        {
          key: `record:${moduleId}:${recordId}`,
          parentKey: 'all',
          label: recordDisplayTitle || String(recordFolder.name || 'پوشه رکورد'),
          count: recursiveFolderCounts.get(recordFolderId) || 0,
          isSystem: true,
        },
        ...systemFolders.subfolders.map((folder) => ({
          key: `folder:${String(folder.id)}`,
          parentKey: String(folder.parent_id)
            ? (String(folder.parent_id) === recordFolderId ? `record:${moduleId}:${recordId}` : `folder:${String(folder.parent_id)}`)
            : `record:${moduleId}:${recordId}`,
          label: String(folder.name || 'پوشه بدون نام'),
          count: recursiveFolderCounts.get(String(folder.id)) || 0,
          isSystem: folder.is_system === true,
        })),
      ];
    }
    return [
      { key: 'all', label: 'همه فایل‌ها', count: items.length, isSystem: true },
      { key: 'image', parentKey: 'all', label: 'عکس‌ها', count: imageItems.length, isSystem: true },
      { key: 'video', parentKey: 'all', label: 'فیلم‌ها', count: videoItems.length, isSystem: true },
      { key: 'file', parentKey: 'all', label: 'فایل‌ها', count: documentItems.length, isSystem: true },
    ];
  }, [browserTree, documentItems.length, fileManagerEnabled, imageItems.length, items, recordDisplayTitle, recordId, moduleId, systemFolders, videoItems.length]);

  const browserVisibleItems = useMemo(() => {
    if (fileManagerEnabled && browserTree) return browserTree.items as RecordFileItem[];
    const normalizedFolderKey = String(browserFolderKey || '').trim();
    if (normalizedFolderKey === 'all') return items;
    if (fileManagerEnabled && systemFolders.recordFolder) {
      const recordFolderId = String(systemFolders.recordFolder.id);
      if (normalizedFolderKey === `record:${moduleId}:${recordId}` || normalizedFolderKey === recordFolderId) {
        return items.filter((item) => String(item.folder_id || recordFolderId) === recordFolderId);
      }
      return items.filter((item) => String(item.folder_id || '') === normalizedFolderKey.replace(/^folder:/, ''));
    }
    return items.filter((item) => item.file_type === normalizedFolderKey);
  }, [browserFolderKey, browserTree, fileManagerEnabled, items, moduleId, recordId, systemFolders.recordFolder]);

  const activeBrowserFolderLabel = useMemo(() => {
    const normalizedKey = String(browserFolderKey || '').trim();
    const folder = browserFolders.find((item) =>
      item.key === normalizedKey
      || (normalizedKey.startsWith('folder:') && item.key === normalizedKey.replace(/^folder:/, ''))
      || (item.key.startsWith('folder:') && normalizedKey === item.key.replace(/^folder:/, ''))
    );
    if (folder?.label) return folder.label;
    if (normalizedKey === 'all') return 'خانه';
    return recordDisplayTitle || 'فایل‌ها';
  }, [browserFolderKey, browserFolders, recordDisplayTitle]);
  const browserRecordTitleMap = useMemo(
    () => ({ ...(browserTree?.recordTitleMap || {}), [`${moduleId}:${recordId}`]: recordDisplayTitle || String(recordId || '') }),
    [browserTree?.recordTitleMap, moduleId, recordDisplayTitle, recordId],
  );
  const browserModuleTitleMap = useMemo(
    () => ({ [moduleId]: MODULES[moduleId]?.titles?.fa || moduleId }),
    [moduleId],
  );

  const recordRootFolderKey = getDefaultRecordFolderKey();

  return (
    <Modal
      title={recordDisplayTitle ? (
        <button
          type="button"
          className="cursor-pointer border-0 bg-transparent p-0 text-right text-inherit"
          onClick={() => {
            setBrowserPage(1);
            setBrowserFolderKey(recordRootFolderKey);
          }}
        >
          {`پنجره فایل های "${recordDisplayTitle}"`}
        </button>
      ) : 'مدیریت فایل‌ها'}
      open={open}
      onCancel={onClose}
      footer={null}
      zIndex={13000}
      width={950}
    >
      <div className="mt-3">
        {!browserReady ? (
          <div className="flex h-56 items-center justify-center rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-[#1a1a1a]">
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-leather-600" />
              <span>در حال آماده‌سازی فایل‌ها...</span>
            </div>
          </div>
        ) : (
          <FileManagerBrowser
            title={activeBrowserFolderLabel}
            items={browserVisibleItems}
            folders={browserFolders}
            activeFolderKey={browserFolderKey}
            onFolderChange={(key) => {
              setBrowserPage(1);
              setBrowserFolderKey(key);
            }}
            loading={initialLoading && !browserTree && items.length === 0}
            refreshing={refreshing || (initialLoading && (Boolean(browserTree) || items.length > 0))}
            onRefresh={() => void refreshCurrentScope(true)}
            onDeleteItem={(item) => void handleDelete(item.id)}
            onCopyItems={(selected) => openDestinationModal('copy', selected as RecordFileItem[])}
            copyItemsLabel={`کپی میانبر به "${recordDisplayTitle || 'رکورد فعلی'}"`}
            onCreateShortcutsHere={(selected) => void createShortcutsInActiveFolder(selected as RecordFileItem[])}
            onMoveItems={(selected) => openDestinationModal('move', selected as RecordFileItem[])}
            onRenameItem={(item) => openRenameModal(item as RecordFileItem)}
            onCreateFolder={openCreateFolderModal}
            onRenameFolder={openRenameFolderModal}
            onDeleteFolder={(folder) => void handleDeleteFolder(folder)}
            recordTitleMap={browserRecordTitleMap}
            moduleTitleMap={browserModuleTitleMap}
            showSourceBadges
            selectionItems={(browserTree?.allItems || items) as FileManagerBrowserItem[]}
            clearSelectionOnFolderChange={false}
            page={browserPage}
            pageSize={browserPageSize}
            totalItems={browserTree?.totalItems}
            onPageChange={(nextPage, nextPageSize) => {
              setBrowserPage(nextPage);
              setBrowserPageSize(nextPageSize);
            }}
            highlightItemId={highlightFileId || null}
            iconTileMinWidth={118}
            mainImageUrl={mainImage || null}
            canSetMainImage={canEdit}
            setMainImageLabel={`ستاره‌دار کردن فایل‌های "${recordDisplayTitle || 'رکورد'}"`}
            onSetMainImages={(selected) => void handleSetMainImages(selected as RecordFileItem[])}
            canDelete={canDeleteFiles}
            canShare={true}
            canEdit={canEdit}
            directShareTargetOptions={directShareTargetOptions}
            onDirectShareItems={handleDirectShareItems}
            onAddCompressedArchive={handleAddCompressedArchive}
            onUpdateItemTags={(item, tags) => void handleUpdateFileTags(item as RecordFileItem, tags)}
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Upload showUploadList={false} beforeUpload={handleBeforeUpload} disabled={!recordId || !canUploadFiles} fileList={[]}>
          <Button icon={<UploadOutlined />}>افزودن فایل (عکس، فیلم، فایل)</Button>
        </Upload>
        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
          <PaperClipOutlined />
          <span>{items.length} فایل</span>
        </div>
      </div>

      <Modal
        title="نام فایل آپلودی"
        open={nameModalOpen}
        onOk={handleConfirmUpload}
        onCancel={handleCancelUploadPrompt}
        okText="آپلود"
        cancelText="انصراف"
        destroyOnHidden
        zIndex={13010}
      >
        <Input
          autoFocus
          value={pendingFileName}
          onChange={(e) => setPendingFileName(e.target.value)}
          placeholder="نام فایل را وارد کنید"
          onPressEnter={handleConfirmUpload}
        />
        <div className="mt-3">
          <TagInput
            moduleId="file_assets"
            initialTags={pendingTags as any}
            onChange={(tags) => setPendingTags((tags || []) as any)}
            popupZIndex={13080}
          />
        </div>
        {pendingFileExtension ? (
          <div className="mt-3 flex items-center gap-2 text-xs" style={{ color: 'var(--ant-color-text-secondary)' }}>
            <span>پسوند:</span>
            <Typography.Text code>.{pendingFileExtension}</Typography.Text>
          </div>
        ) : null}
        {moduleId === 'tasks' ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-[rgba(var(--brand-200-rgb),0.7)] bg-[rgba(var(--brand-50-rgb),0.5)] p-3">
              <div className="mb-2 text-sm font-medium text-gray-700">اشتراک‌گذاری داخلی</div>
              <Select
                mode="multiple"
                allowClear
                showSearch
                value={shareTargetIds}
                onChange={(values) => setShareTargetIds((values || []).map((value) => String(value)))}
                options={shareTargetOptions}
                placeholder="انتخاب گفتگوها"
                optionFilterProp="label"
                className="w-full"
                getPopupContainer={(trigger) => trigger.parentElement || document.body}
                styles={{ popup: { root: { zIndex: 13120 } } }}
                listHeight={280}
                maxTagCount="responsive"
              />
            </div>
            <Checkbox checked={shareInRelatedRecords} onChange={(event) => setShareInRelatedRecords(event.target.checked)}>
              اشتراک‌گذاری در رکوردهای مرتبط
            </Checkbox>
          </div>
        ) : null}
      </Modal>

      <Modal
        title="تغییر نام فایل"
        open={renameModalOpen}
        onOk={() => void handleRename()}
        onCancel={closeRenameModal}
        okText="ذخیره"
        cancelText="انصراف"
        confirmLoading={renaming}
        destroyOnHidden
        zIndex={13020}
      >
        <Input
          autoFocus
          value={renameValue}
          onChange={(event) => setRenameValue(event.target.value)}
          placeholder="نام جدید فایل"
          onPressEnter={() => void handleRename()}
        />
        <div className="mt-3">
          <TagInput
            moduleId="file_assets"
            initialTags={renameTags as any}
            onChange={(tags) => setRenameTags((tags || []) as any)}
            popupZIndex={13090}
          />
        </div>
      </Modal>

      <Modal
        title={destinationAction === 'move' ? 'انتقال به مسیر' : 'کپی در مسیر'}
        open={destinationModalOpen}
        onOk={() => void handleConfirmDestinationOperation()}
        onCancel={closeDestinationModal}
        okText={destinationAction === 'move' ? 'انتقال' : 'کپی'}
        cancelText="انصراف"
        confirmLoading={destinationSaving}
        destroyOnHidden
        zIndex={13030}
      >
        <div className="space-y-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            فایل‌ها / {MODULES[moduleId]?.titles?.fa || moduleId} / {destinationOptions.find((option) => option.value === destinationFolderId)?.label || 'مسیر مقصد'}
          </div>
          <Select
            value={destinationFolderId}
            onChange={(value) => setDestinationFolderId(String(value))}
            options={destinationOptions}
            className="w-full"
            placeholder="انتخاب پوشه مقصد"
            getPopupContainer={(trigger) => trigger.parentElement || document.body}
            styles={{ popup: { root: { zIndex: 13140 } } }}
          />
          <div className="text-xs text-gray-500">
            {destinationItems.length} فایل برای {destinationAction === 'move' ? 'انتقال' : 'کپی'} انتخاب شده است.
          </div>
        </div>
      </Modal>

      <Modal
        title={folderModalMode === 'rename' ? 'تغییر نام پوشه' : 'پوشه جدید'}
        open={folderModalOpen}
        onOk={() => void handleConfirmFolderModal()}
        onCancel={closeFolderModal}
        okText={folderModalMode === 'rename' ? 'ذخیره' : 'ساخت پوشه'}
        cancelText="انصراف"
        confirmLoading={folderSaving}
        destroyOnHidden
        zIndex={13040}
      >
        <Input
          autoFocus
          value={folderNameValue}
          onChange={(event) => setFolderNameValue(event.target.value)}
          placeholder="نام پوشه"
          onPressEnter={() => void handleConfirmFolderModal()}
        />
      </Modal>
    </Modal>
  );
};

export default RecordFilesManager;
