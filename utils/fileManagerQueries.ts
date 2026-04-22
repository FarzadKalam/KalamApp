import { supabase } from '../supabaseClient';
import { detectFileManagerTables } from './fileManagerService';
import { detectRecordFilesTable, isMissingRecordFilesError } from './recordFilesAvailability';
import {
  loadLegacyRecordFiles,
  syncLegacyRecordFilesBatchToFileManager,
  syncLegacyRecordFilesToFileManager,
} from './fileManagerCompat';
import type { FileFolderRow } from './fileManagerTypes';

export type FileManagerListItem = {
  id: string;
  asset_id?: string | null;
  entry_id?: string | null;
  folder_id?: string | null;
  module_id: string;
  record_id: string;
  file_url: string;
  file_type: 'image' | 'video' | 'file';
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
  is_main_image?: boolean;
  entry_metadata?: Record<string, any> | null;
  entry_type?: 'origin' | 'shortcut' | null;
  is_shortcut?: boolean;
  source_module_id?: string | null;
  source_record_id?: string | null;
  source_record_title?: string | null;
  visibility?: 'private' | 'org' | 'public' | null;
};

export type FileManagerTreeFolder = {
  key: string;
  label: string;
  parentKey?: string | null;
  count?: number;
  isSystem?: boolean;
  moduleId?: string | null;
  recordId?: string | null;
  folderId?: string | null;
};

export type FileManagerTreeOptions = {
  page?: number;
  pageSize?: number;
  folderKey?: string;
  initialModuleId?: string | null;
  initialRecordId?: string | null;
  search?: string | null;
  fileTypes?: Array<'image' | 'video' | 'file'>;
  recordTitleMap?: Record<string, string>;
  moduleTitleMap?: Record<string, string>;
};

export type FileManagerTreeResult = {
  folders: FileManagerTreeFolder[];
  items: FileManagerListItem[];
  allItems: FileManagerListItem[];
  activeFolderKey: string;
  initialFolderKey: string;
  totalItems: number;
  page: number;
  pageSize: number;
  recordTitleMap: Record<string, string>;
};

const guessTypeFromUrl = (url?: string | null): 'image' | 'video' | 'file' => {
  const value = String(url || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(value)) return 'image';
  return 'file';
};

const normalizeType = (rawType: unknown, mimeType?: string | null, fileUrl?: string | null): 'image' | 'video' | 'file' => {
  const value = String(rawType || '').toLowerCase();
  if (value === 'image' || value === 'video' || value === 'file') return value;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  return guessTypeFromUrl(fileUrl);
};

const mapLegacyRecordFile = (row: any): FileManagerListItem => ({
  id: String(row.id),
  asset_id: row.asset_id ? String(row.asset_id) : null,
  entry_id: row.file_entry_id ? String(row.file_entry_id) : null,
  folder_id: row.folder_id ? String(row.folder_id) : null,
  module_id: String(row.module_id || ''),
  record_id: String(row.record_id || ''),
  file_url: String(row.file_url || ''),
  file_type: normalizeType(row.file_type, row.mime_type, row.file_url),
  file_name: row.file_name ? String(row.file_name) : null,
  mime_type: row.mime_type ? String(row.mime_type) : null,
  created_at: row.created_at ? String(row.created_at) : null,
  is_main_image: false,
  entry_metadata: null,
  entry_type: String(row.entry_type || '').trim() === 'shortcut' ? 'shortcut' : 'origin',
  is_shortcut: row.is_shortcut === true || String(row.entry_type || '').trim() === 'shortcut',
  source_module_id: row.source_module_id ? String(row.source_module_id) : null,
  source_record_id: row.source_record_id ? String(row.source_record_id) : null,
  source_record_title: row.source_record_title ? String(row.source_record_title) : null,
  visibility: null,
});

const mapFileEntryRow = (row: any): FileManagerListItem => {
  const asset = row?.file_assets || {};
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  return {
    id: String(row?.source_row_id || row?.id || ''),
    asset_id: asset?.id ? String(asset.id) : null,
    entry_id: String(row?.id || ''),
    folder_id: row?.folder_id ? String(row.folder_id) : null,
    module_id: String(row?.module_id || asset?.origin_module_id || ''),
    record_id: String(row?.record_id || asset?.origin_record_id || ''),
    file_url: String(asset?.target_url || '').trim(),
    file_type: normalizeType(asset?.file_type, asset?.mime_type, asset?.target_url),
    file_name: asset?.display_name ? String(asset.display_name) : null,
    mime_type: asset?.mime_type ? String(asset.mime_type) : null,
    created_at: row?.created_at ? String(row.created_at) : (asset?.created_at ? String(asset.created_at) : null),
    is_main_image: metadata?.main_image?.starred === true,
    entry_metadata: metadata,
    entry_type: String(row?.entry_type || '').trim() === 'shortcut' ? 'shortcut' : 'origin',
    is_shortcut: String(row?.entry_type || '').trim() === 'shortcut',
    source_module_id: row?.source_module_id ? String(row.source_module_id) : null,
    source_record_id: row?.source_record_id ? String(row.source_record_id) : null,
    source_record_title: row?.source_record_title ? String(row.source_record_title) : null,
    visibility: asset?.visibility ? String(asset.visibility) as any : null,
  };
};

const mapLegacyProductImage = (row: any): FileManagerListItem => ({
  id: String(row.id),
  module_id: 'products',
  record_id: String(row.product_id || ''),
  file_url: String(row.image_url || ''),
  file_type: 'image',
  file_name: null,
  mime_type: null,
  created_at: row.created_at ? String(row.created_at) : null,
  is_main_image: false,
  entry_metadata: null,
  entry_type: 'origin',
  is_shortcut: false,
});

const dedupeItems = (items: FileManagerListItem[]) => {
  const byId = new Map<string, FileManagerListItem>();
  items.forEach((item) => {
    const key = [
      String(item.module_id || '').trim(),
      String(item.record_id || '').trim(),
      String(item.file_url || '').trim(),
      String(item.entry_type || '').trim(),
    ].join(':') || String(item.id || '').trim();
    if (!key) return;
    if (!byId.has(key)) {
      byId.set(key, item);
      return;
    }

    const existing = byId.get(key)!;
    const shouldPreferNext = Boolean(item.entry_id && !existing.entry_id);
    if (shouldPreferNext) {
      byId.set(key, item);
    }
  });
  return Array.from(byId.values());
};

const moduleFolderKey = (moduleId: string) => `module:${moduleId}`;
const recordFolderKey = (moduleId: string, recordId: string) => `record:${moduleId}:${recordId}`;
const physicalFolderKey = (folderId: string) => `folder:${folderId}`;

const parseTreeFolderKey = (key?: string | null) => {
  const value = String(key || '').trim();
  if (!value || value === 'all') return { kind: 'all' as const };
  if (value.startsWith('module:')) return { kind: 'module' as const, moduleId: value.slice('module:'.length) };
  if (value.startsWith('record:')) {
    const rest = value.slice('record:'.length);
    const [moduleId, ...recordParts] = rest.split(':');
    return { kind: 'record' as const, moduleId, recordId: recordParts.join(':') };
  }
  if (value.startsWith('folder:')) return { kind: 'folder' as const, folderId: value.slice('folder:'.length) };
  return { kind: 'legacy' as const, value };
};

const matchesTreeSearch = (
  item: FileManagerListItem,
  search: string,
  recordTitleMap: Record<string, string>,
  moduleTitleMap: Record<string, string>,
) => {
  if (!search) return true;
  const moduleTitle = moduleTitleMap[item.module_id] || item.module_id;
  const recordTitle = recordTitleMap[`${item.module_id}:${item.record_id}`] || item.source_record_title || item.record_id;
  const haystack = [
    item.file_name,
    item.file_url,
    item.mime_type,
    moduleTitle,
    recordTitle,
    item.source_record_title,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  return haystack.includes(search);
};

const loadFileFoldersByIds = async (
  folderIds: string[],
  options?: { moduleId?: string | null; recordId?: string | null },
): Promise<FileFolderRow[]> => {
  const ids = Array.from(new Set(folderIds.map((id) => String(id || '').trim()).filter(Boolean)));
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return [];
  const byId = new Map<string, FileFolderRow>();

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('file_folders')
      .select('*')
      .in('id', ids);
    if (error) {
      console.warn('Could not load file folders for tree', error);
    } else {
      (data || []).forEach((folder: FileFolderRow) => byId.set(String(folder.id), folder));
    }
  }

  const moduleId = String(options?.moduleId || '').trim();
  const recordId = String(options?.recordId || '').trim();
  if (moduleId && recordId) {
    const { data, error } = await supabase
      .from('file_folders')
      .select('*')
      .eq('module_id', moduleId)
      .eq('record_id', recordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Could not load scoped file folders for tree', error);
    } else {
      (data || []).forEach((folder: FileFolderRow) => byId.set(String(folder.id), folder));
    }
  }

  return Array.from(byId.values());
};

export const loadGalleryFileItems = async (): Promise<FileManagerListItem[]> => {
  const hasFileManagerTables = await detectFileManagerTables(supabase, false);
  if (hasFileManagerTables) {
    await syncLegacyRecordFilesBatchToFileManager(250).catch((error) => {
      console.warn('Could not sync legacy record files for gallery', error);
    });

    const { data, error } = await supabase
      .from('file_entries')
      .select('id, folder_id, module_id, record_id, entry_type, source_row_id, source_module_id, source_record_id, source_record_title, metadata, created_at, file_assets(id, target_url, display_name, mime_type, file_type, visibility, origin_module_id, origin_record_id, created_at)')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(2000);

    const entryItems = error
      ? []
      : (data || [])
        .map(mapFileEntryRow)
        .filter((item) => item.file_url);

    const hasRecordFiles = await detectRecordFilesTable(supabase, false);
    if (!hasRecordFiles) {
      return entryItems;
    }

    const [legacyRows, productImagesResult] = await Promise.all([
      loadLegacyRecordFiles({ limit: 2000 }),
      supabase
        .from('product_images')
        .select('id, product_id, image_url, created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);
    const legacyItems = legacyRows.map(mapLegacyRecordFile).filter((item) => item.file_url);
    const productImageItems = Array.isArray(productImagesResult.data)
      ? productImagesResult.data.map(mapLegacyProductImage).filter((item) => item.file_url)
      : [];

    return dedupeItems([...entryItems, ...legacyItems, ...productImageItems])
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')));
  }

  const hasRecordFiles = await detectRecordFilesTable(supabase, false);
  if (!hasRecordFiles) {
    const { data, error } = await supabase
      .from('product_images')
      .select('id, product_id, image_url, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: String(row.id),
      module_id: 'products',
      record_id: String(row.product_id || ''),
      file_url: String(row.image_url || ''),
      file_type: 'image' as const,
      file_name: null,
      mime_type: null,
      created_at: row.created_at ? String(row.created_at) : null,
      entry_type: 'origin' as const,
      is_shortcut: false,
    }));
  }

  const { data, error } = await supabase
    .from('record_files')
    .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, created_at, asset_id, file_entry_id, folder_id, entry_type, is_shortcut, source_module_id, source_record_id, source_record_title')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data || []).map(mapLegacyRecordFile).filter((item) => item.file_url);
};

export const loadRecordFileItems = async (
  moduleId: string,
  recordId: string,
  recordTitle?: string | null,
): Promise<FileManagerListItem[]> => {
  const hasFileManagerTables = await detectFileManagerTables(supabase, false);
  if (hasFileManagerTables && recordTitle) {
    await syncLegacyRecordFilesToFileManager(moduleId, recordId, recordTitle).catch((error) => {
      console.warn('Could not sync legacy record files into file manager tables', error);
    });

    const { data, error } = await supabase
      .from('file_entries')
      .select('id, folder_id, module_id, record_id, entry_type, source_row_id, source_module_id, source_record_id, source_record_title, metadata, created_at, file_assets(id, target_url, display_name, mime_type, file_type, visibility, origin_module_id, origin_record_id, created_at)')
      .eq('module_id', moduleId)
      .eq('record_id', recordId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true });
    const entryItems = error
      ? []
      : (data || [])
        .map(mapFileEntryRow)
        .filter((item) => item.file_url);

    const legacyRows = await loadLegacyRecordFiles({ moduleId, recordId });
    const legacyItems = legacyRows.map(mapLegacyRecordFile).filter((item) => item.file_url);

    const productImageItems = moduleId === 'products'
      ? await supabase
        .from('product_images')
        .select('id, product_id, image_url, created_at')
        .eq('product_id', recordId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (error) throw error;
          return (data || []).map(mapLegacyProductImage).filter((item) => item.file_url);
        })
      : [];

    return dedupeItems([...entryItems, ...legacyItems, ...productImageItems])
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
  }

  const hasRecordFiles = await detectRecordFilesTable(supabase, false);
  if (!hasRecordFiles) {
    if (moduleId !== 'products') return [];
    const { data, error } = await supabase
      .from('product_images')
      .select('id, image_url, sort_order, created_at')
      .eq('product_id', recordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row: any) => ({
      id: String(row.id),
      module_id: moduleId,
      record_id: recordId,
      file_url: String(row.image_url || ''),
      file_type: 'image' as const,
      file_name: null,
      mime_type: null,
      created_at: row.created_at ? String(row.created_at) : null,
      entry_type: 'origin' as const,
      is_shortcut: false,
      is_main_image: false,
      entry_metadata: null,
    }));
  }

  const { data, error } = await supabase
    .from('record_files')
    .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, created_at, asset_id, file_entry_id, folder_id, entry_type, is_shortcut, source_module_id, source_record_id, source_record_title')
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .order('created_at', { ascending: true });
  if (error) {
    if (isMissingRecordFilesError(error)) return [];
    throw error;
  }
  return (data || []).map(mapLegacyRecordFile).filter((item) => item.file_url);
};

export const buildFileManagerTree = async (
  options: FileManagerTreeOptions = {},
): Promise<FileManagerTreeResult> => {
  const pageSize = Math.max(1, Math.min(200, Number(options.pageSize || 60)));
  const page = Math.max(1, Number(options.page || 1));
  const typeSet = new Set(options.fileTypes || []);
  const search = String(options.search || '').trim().toLowerCase();
  const recordTitleMap = { ...(options.recordTitleMap || {}) };
  const moduleTitleMap = { ...(options.moduleTitleMap || {}) };

  const loadedItems = await loadGalleryFileItems();
  const baseItems = loadedItems.filter((item) => {
    if (!String(item.file_url || '').trim()) return false;
    if (typeSet.size > 0 && !typeSet.has(item.file_type)) return false;
    return matchesTreeSearch(item, search, recordTitleMap, moduleTitleMap);
  });

  const folderRows = await loadFileFoldersByIds(baseItems.map((item) => item.folder_id || ''), {
    moduleId: options.initialModuleId,
    recordId: options.initialRecordId,
  });
  const folderMap = new Map(folderRows.map((folder) => [String(folder.id), folder]));

  const countByModule = new Map<string, number>();
  const countByRecord = new Map<string, number>();
  const countByFolder = new Map<string, number>();
  baseItems.forEach((item) => {
    const moduleId = String(item.module_id || '').trim();
    const recordId = String(item.record_id || '').trim();
    if (moduleId) countByModule.set(moduleId, (countByModule.get(moduleId) || 0) + 1);
    if (moduleId && recordId) {
      const recordKey = `${moduleId}:${recordId}`;
      countByRecord.set(recordKey, (countByRecord.get(recordKey) || 0) + 1);
      if (!recordTitleMap[recordKey]) {
        recordTitleMap[recordKey] = String(item.source_record_title || recordId);
      }
    }
    const folderId = String(item.folder_id || '').trim();
    if (folderId) countByFolder.set(folderId, (countByFolder.get(folderId) || 0) + 1);
  });

  const folders: FileManagerTreeFolder[] = [
    { key: 'all', label: 'همه فایل‌ها', count: baseItems.length, isSystem: true },
  ];

  Array.from(countByModule.entries()).forEach(([moduleId, count]) => {
    folders.push({
      key: moduleFolderKey(moduleId),
      parentKey: 'all',
      label: moduleTitleMap[moduleId] || moduleId,
      count,
      isSystem: true,
      moduleId,
    });
  });

  Array.from(countByRecord.entries()).forEach(([recordKey, count]) => {
    const [moduleId, ...recordParts] = recordKey.split(':');
    const recordId = recordParts.join(':');
    folders.push({
      key: recordFolderKey(moduleId, recordId),
      parentKey: moduleFolderKey(moduleId),
      label: recordTitleMap[recordKey] || recordId,
      count,
      isSystem: true,
      moduleId,
      recordId,
    });
  });

  folderRows.forEach((folder) => {
    const folderId = String(folder.id || '').trim();
    if (!folderId) return;
    const moduleId = String(folder.module_id || '').trim();
    const recordId = String(folder.record_id || '').trim();
    const parentId = String(folder.parent_id || '').trim();
    const parentKey = parentId && folderMap.has(parentId)
      ? physicalFolderKey(parentId)
      : moduleId && recordId
        ? recordFolderKey(moduleId, recordId)
        : 'all';
    folders.push({
      key: physicalFolderKey(folderId),
      parentKey,
      label: String(folder.name || folder.id),
      count: countByFolder.get(folderId) || 0,
      isSystem: folder.is_system === true,
      moduleId,
      recordId,
      folderId,
    });
  });

  const initialFolderKey = (() => {
    const moduleId = String(options.initialModuleId || '').trim();
    const recordId = String(options.initialRecordId || '').trim();
    if (moduleId && recordId && countByRecord.has(`${moduleId}:${recordId}`)) return recordFolderKey(moduleId, recordId);
    if (moduleId && countByModule.has(moduleId)) return moduleFolderKey(moduleId);
    return 'all';
  })();

  const requestedFolderKey = String(options.folderKey || '').trim();
  const activeFolderKey = requestedFolderKey && folders.some((folder) => folder.key === requestedFolderKey)
    ? requestedFolderKey
    : initialFolderKey;
  const parsed = parseTreeFolderKey(activeFolderKey);
  const folderRow = parsed.kind === 'folder' ? folderMap.get(parsed.folderId) : null;
  const physicalFolderIdsUnderRecord = new Set(
    folderRows
      .filter((folder) => {
        if (parsed.kind !== 'record') return false;
        return String(folder.module_id || '') === parsed.moduleId && String(folder.record_id || '') === parsed.recordId;
      })
      .map((folder) => String(folder.id)),
  );

  const scopedItems = baseItems.filter((item) => {
    if (parsed.kind === 'all') return false;
    if (parsed.kind === 'module') return false;
    if (parsed.kind === 'record') {
      if (item.module_id !== parsed.moduleId || item.record_id !== parsed.recordId) return false;
      const folderId = String(item.folder_id || '').trim();
      return !folderId || !physicalFolderIdsUnderRecord.has(folderId);
    }
    if (parsed.kind === 'folder') {
      const folderId = String(item.folder_id || '').trim();
      if (folderId === parsed.folderId) return true;
      if (!folderRow) return false;
      return false;
    }
    if (parsed.kind === 'legacy') return item.module_id === parsed.value || item.file_type === parsed.value;
    return false;
  });

  const start = (page - 1) * pageSize;
  return {
    folders,
    items: scopedItems.slice(start, start + pageSize),
    allItems: baseItems,
    activeFolderKey,
    initialFolderKey,
    totalItems: scopedItems.length,
    page,
    pageSize,
    recordTitleMap,
  };
};
