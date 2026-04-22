import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import { getFileSystemModuleDefinition } from './fileManagerConfig';
import {
  detectFileManagerTables,
  ensureSystemFoldersForRecord,
  resolveRecordFolderLabel,
} from './fileManagerService';
import { loadLegacyRecordFiles } from './fileManagerCompat';
import { fetchRecordReferenceLabels } from './recordReference';
import { detectRecordFilesTable } from './recordFilesAvailability';
import {
  canAccessAssignedRecord,
  fetchCurrentUserRecordAccessContext,
  type CurrentUserRecordAccessContext,
  type PermissionMap,
} from './permissions';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from './selectCompat';
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
  tags?: Array<{ id: string; title: string; color?: string | null }>;
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
  colorToken?: string | null;
  folderType?: string | null;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
};

export type FileManagerTreeOptions = {
  scope?: 'global' | 'module' | 'record';
  page?: number;
  pageSize?: number;
  folderKey?: string;
  moduleId?: string | null;
  recordId?: string | null;
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

const ROOT_FOLDER_KEY = 'all';
const FILE_MANAGER_QUERY_TTL_MS = 10_000;

type TimedCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const timedCache = new Map<string, TimedCacheEntry<any>>();

const getTimedCache = <T,>(key: string): T | null => {
  const hit = timedCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    timedCache.delete(key);
    return null;
  }
  return hit.value as T;
};

const setTimedCache = <T,>(key: string, value: T, ttlMs = FILE_MANAGER_QUERY_TTL_MS) => {
  timedCache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
  return value;
};

const getOrSetTimedCache = async <T,>(key: string, loader: () => Promise<T>, ttlMs = FILE_MANAGER_QUERY_TTL_MS) => {
  const cached = getTimedCache<T>(key);
  if (cached !== null) return cached;
  const value = await loader();
  return setTimedCache(key, value, ttlMs);
};

const moduleFolderKey = (moduleId: string) => `module:${moduleId}`;
const recordFolderKey = (moduleId: string, recordId: string) => `record:${moduleId}:${recordId}`;
const physicalFolderKey = (folderId: string) => `folder:${folderId}`;

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

const normalizeText = (value: unknown) => String(value || '').trim();

const getModuleRecordScope = (permissions: PermissionMap | null | undefined, moduleId: string) => {
  const modulePerm = permissions?.[moduleId] || {};
  return modulePerm.record_scope ?? (modulePerm.view === false ? 'own' : 'all');
};

const moduleSupportsScopedRecords = (moduleId: string) => {
  const module = MODULES[moduleId];
  const fieldKeys = new Set((module?.fields || []).map((field: any) => String(field?.key || '')));
  return fieldKeys.has('assignee_id') || fieldKeys.has('assignee_type') || fieldKeys.has('assignee_role_id');
};

const canViewModuleFiles = (permissions: PermissionMap | null | undefined, moduleId: string) =>
  (permissions?.[moduleId] || {}).view !== false;

const normalizeTagList = (rawValue: unknown): Array<{ id: string; title: string; color?: string | null }> => {
  if (!Array.isArray(rawValue)) return [];
  return rawValue
    .map((item) => {
      const id = normalizeText((item as any)?.id || (item as any)?.value || (item as any)?.title);
      const title = normalizeText((item as any)?.title || (item as any)?.label || (item as any)?.name);
      if (!id || !title) return null;
      return {
        id,
        title,
        color: normalizeText((item as any)?.color) || null,
      };
    })
    .filter(Boolean) as Array<{ id: string; title: string; color?: string | null }>;
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
  tags: [],
});

const mapFileEntryRow = (row: any): FileManagerListItem => {
  const asset = row?.file_assets || {};
  const metadata = row?.metadata && typeof row.metadata === 'object' ? row.metadata : null;
  const assetMetadata = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : null;
  const tags = normalizeTagList(metadata?.tags || assetMetadata?.tags);
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
    tags,
  };
};

const dedupeItems = (items: FileManagerListItem[]) => {
  const byId = new Map<string, FileManagerListItem>();
  items.forEach((item) => {
    const key = [
      normalizeText(item.module_id),
      normalizeText(item.record_id),
      normalizeText(item.file_url),
      normalizeText(item.entry_type),
      normalizeText(item.folder_id),
    ].join(':');
    if (!key) return;
    const existing = byId.get(key);
    if (!existing || (item.entry_id && !existing.entry_id)) {
      byId.set(key, item);
    }
  });
  return Array.from(byId.values());
};

const isFileLikeUrl = (value: unknown) => {
  const text = normalizeText(value);
  if (!text) return false;
  if (/^https?:\/\//i.test(text) || /^\/storage\/v1\//i.test(text)) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|pdf|docx?|xlsx?|pptx?|zip|rar|7z|txt|mp4|webm|ogg|mov|m4v|avi|mkv)(\?|#|$)/i.test(text);
};

const FILE_FIELD_PATTERN = /(image|file|attachment|document|receipt|invoice|url)$/i;

const collectUrlsFromValue = (
  value: unknown,
  fieldPath: string[] = [],
  collector: Array<{ url: string; fieldPath: string }>,
  visited = new WeakSet<object>(),
) => {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') {
    const fieldKey = fieldPath[fieldPath.length - 1] || '';
    if (FILE_FIELD_PATTERN.test(fieldKey) && isFileLikeUrl(value)) {
      collector.push({ url: value.trim(), fieldPath: fieldPath.join('.') });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectUrlsFromValue(item, fieldPath, collector, visited));
    return;
  }
  if (typeof value !== 'object') return;
  if (visited.has(value as object)) return;
  visited.add(value as object);
  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    collectUrlsFromValue(child, [...fieldPath, key], collector, visited);
  });
};

const mapSyntheticAttachment = (
  moduleId: string,
  recordId: string,
  url: string,
  options?: { fileName?: string | null; createdAt?: string | null; sourceTitle?: string | null; idSuffix?: string | number | null },
): FileManagerListItem => ({
  id: `synthetic:${moduleId}:${recordId}:${String(options?.idSuffix ?? url)}`,
  module_id: moduleId,
  record_id: recordId,
  file_url: url,
  file_type: guessTypeFromUrl(url),
  file_name: options?.fileName ? String(options.fileName) : null,
  mime_type: null,
  created_at: options?.createdAt ? String(options.createdAt) : null,
  is_main_image: false,
  entry_metadata: { synthetic: true },
  entry_type: 'origin',
  is_shortcut: false,
  source_record_title: options?.sourceTitle ? String(options.sourceTitle) : null,
  visibility: null,
});

const fetchRecordRow = async (moduleId: string, recordId: string) => {
  const table = MODULES[moduleId]?.table || moduleId;
  if (!table) return null;
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', recordId)
    .maybeSingle();
  if (!error) return data;

  const result = await runSelectWithCompatibleColumns<any>({
    cacheKey: `file-manager-row:${moduleId}`,
    columns: buildRecordTitleSelectColumns(moduleId),
    execute: (selectExpr) =>
      supabase
        .from(table)
        .select(selectExpr)
        .eq('id', recordId)
        .maybeSingle(),
  });
  if (result.error) throw result.error;
  return result.data;
};

const selectAccessibleRecordRows = async (
  moduleId: string,
  recordIds: string[],
): Promise<any[]> => {
  const uniqueRecordIds = Array.from(new Set((recordIds || []).map((value) => normalizeText(value)).filter(Boolean)));
  if (uniqueRecordIds.length === 0) return [];
  const cacheKey = `file-manager:accessible-rows:${moduleId}:${uniqueRecordIds.slice().sort().join(',')}`;
  const cached = getTimedCache<any[]>(cacheKey);
  if (cached) return cached;
  const table = MODULES[moduleId]?.table || moduleId;
  if (!table) return [];
  const result = await runSelectWithCompatibleColumns<any>({
    cacheKey: `file-manager-permissions:${moduleId}`,
    columns: ['id', 'org_id', 'assignee_id', 'assignee_type', 'assignee_role_id'],
    execute: (selectExpr) =>
      supabase
        .from(table)
        .select(selectExpr)
        .in('id', uniqueRecordIds)
        .limit(uniqueRecordIds.length),
  });
  if (result.error) {
    console.warn('Could not load scoped file manager records', result.error);
    return [];
  }
  return setTimedCache(cacheKey, result.data || []);
};

const getAccessibleRecordIds = async (
  moduleId: string,
  recordIds: string[],
  recordAccess: CurrentUserRecordAccessContext | null,
) => {
  const normalizedIds = Array.from(new Set((recordIds || []).map((value) => normalizeText(value)).filter(Boolean)));
  if (normalizedIds.length === 0) return new Set<string>();
  if (!recordAccess || !canViewModuleFiles(recordAccess.permissions, moduleId)) return new Set<string>();
  const recordScope = getModuleRecordScope(recordAccess.permissions, moduleId);
  if (recordScope === 'all') return new Set(normalizedIds);
  if (!moduleSupportsScopedRecords(moduleId)) return new Set<string>();
  const rows = await selectAccessibleRecordRows(moduleId, normalizedIds);
  return new Set(
    rows
      .filter((row) =>
        canAccessAssignedRecord(row, recordAccess.userId, recordAccess.roleId, recordScope, {
          currentOrgId: recordAccess.orgId,
          allowedRoleIds: recordAccess.allowedRoleIds,
          allowedUserIds: recordAccess.allowedUserIds,
        }))
      .map((row) => normalizeText(row?.id))
      .filter(Boolean),
  );
};

const loadSyntheticRecordAttachments = async (
  moduleId: string,
  recordId: string,
  recordTitle?: string | null,
): Promise<FileManagerListItem[]> => {
  const items: FileManagerListItem[] = [];
  const row = await fetchRecordRow(moduleId, recordId).catch(() => null);
  if (row && typeof row === 'object') {
    const urls: Array<{ url: string; fieldPath: string }> = [];
    collectUrlsFromValue(row, [], urls);
    urls.forEach((item, index) => {
      items.push(mapSyntheticAttachment(moduleId, recordId, item.url, {
        fileName: item.fieldPath.split('.').pop() || null,
        sourceTitle: recordTitle || null,
        idSuffix: `${item.fieldPath}:${index}`,
      }));
    });
  }

  const definition = getFileSystemModuleDefinition(moduleId);
  await Promise.all((definition.relatedAttachmentSources || []).map(async (source) => {
    const targetTable = MODULES[source.moduleId]?.table || source.moduleId;
    if (!targetTable) return;
    const selectExpr = ['id', 'created_at', ...source.attachmentFieldKeys].join(',');
    const { data, error } = await supabase
      .from(targetTable)
      .select(selectExpr)
      .eq(source.foreignKey, recordId)
      .limit(500);
    if (error) {
      console.warn('Could not load related attachment rows for file manager', error);
      return;
    }
    (data || []).forEach((row: any) => {
      source.attachmentFieldKeys.forEach((fieldKey) => {
        const url = normalizeText(row?.[fieldKey]);
        if (!isFileLikeUrl(url)) return;
        items.push(mapSyntheticAttachment(moduleId, recordId, url, {
          fileName: fieldKey,
          createdAt: row?.created_at ? String(row.created_at) : null,
          sourceTitle: recordTitle || null,
          idSuffix: `${source.moduleId}:${fieldKey}:${row?.id || url}`,
        }));
      });
    });
  }));

  return items;
};

const loadRecordEntries = async (moduleId: string, recordId: string) => {
  const cacheKey = `file-manager:record-entries:${moduleId}:${recordId}`;
  const cached = getTimedCache<FileManagerListItem[]>(cacheKey);
  if (cached) return cached;
  const hasFileManagerTables = await detectFileManagerTables(supabase, false);
  if (!hasFileManagerTables) return [] as FileManagerListItem[];
  const { data, error } = await supabase
    .from('file_entries')
    .select('id, folder_id, module_id, record_id, entry_type, source_row_id, source_module_id, source_record_id, source_record_title, metadata, created_at, file_assets(id, target_url, display_name, mime_type, file_type, visibility, origin_module_id, origin_record_id, created_at, metadata)')
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('Could not load file manager record entries', error);
    return [];
  }
  return setTimedCache(cacheKey, (data || []).map(mapFileEntryRow).filter((item) => item.file_url));
};

export const loadRecordFileItems = async (
  moduleId: string,
  recordId: string,
  recordTitle?: string | null,
): Promise<FileManagerListItem[]> => {
  const cacheKey = `file-manager:record-items:${moduleId}:${recordId}:${normalizeText(recordTitle)}`;
  const cached = getTimedCache<FileManagerListItem[]>(cacheKey);
  if (cached) return cached;
  const [entryItems, syntheticItems, hasRecordFilesTable] = await Promise.all([
    loadRecordEntries(moduleId, recordId),
    loadSyntheticRecordAttachments(moduleId, recordId, recordTitle),
    detectRecordFilesTable(supabase, false),
  ]);

  const legacyItems = hasRecordFilesTable
    ? (await loadLegacyRecordFiles({ moduleId, recordId })).map(mapLegacyRecordFile).filter((item) => item.file_url)
    : [];

  return setTimedCache(
    cacheKey,
    dedupeItems([...entryItems, ...legacyItems, ...syntheticItems])
      .sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || ''))),
  );
};

const loadRecordTagsMap = async (moduleId: string, recordIds: string[]) => {
  const normalizedRecordIds = Array.from(new Set(recordIds.map((item) => normalizeText(item)).filter(Boolean)));
  if (!moduleId || normalizedRecordIds.length === 0) return {} as Record<string, Array<{ id: string; title: string; color?: string | null }>>;
  const cacheKey = `file-manager:record-tags:${moduleId}:${normalizedRecordIds.slice().sort().join(',')}`;
  const cached = getTimedCache<Record<string, Array<{ id: string; title: string; color?: string | null }>>>(cacheKey);
  if (cached) return cached;
  const { data, error } = await supabase
    .from('record_tags')
    .select('record_id, tags(id, title, color)')
    .eq('module_id', moduleId)
    .in('record_id', normalizedRecordIds);
  if (error) {
    console.warn('Could not load record tags for file manager', error);
    return {};
  }
  return setTimedCache(cacheKey, (data || []).reduce<Record<string, Array<{ id: string; title: string; color?: string | null }>>>((acc, item: any) => {
    const nextRecordId = normalizeText(item?.record_id);
    if (!nextRecordId || !item?.tags) return acc;
    if (!acc[nextRecordId]) acc[nextRecordId] = [];
    acc[nextRecordId].push({
      id: normalizeText(item.tags.id || item.tags.title),
      title: normalizeText(item.tags.title),
      color: normalizeText(item.tags.color) || null,
    });
    return acc;
  }, {}));
};

const matchesItemSearch = (
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

const matchesFolderSearch = (folder: FileManagerTreeFolder, search: string) => {
  if (!search) return true;
  return String(folder.label || '').toLowerCase().includes(search);
};

const loadModuleSystemFolders = async () => {
  return getOrSetTimedCache('file-manager:module-folders', async () => {
    const hasTables = await detectFileManagerTables(supabase, false);
    if (!hasTables) return [] as FileFolderRow[];
    const { data, error } = await supabase
      .from('file_folders')
      .select('*')
      .eq('folder_type', 'system_module')
      .order('name', { ascending: true });
    if (error) {
      console.warn('Could not load file manager module folders', error);
      return [];
    }
    return (data || []) as FileFolderRow[];
  });
};

const loadRecordFoldersForModule = async (moduleId: string) => {
  return getOrSetTimedCache(`file-manager:record-folders:${moduleId}`, async () => {
    const hasTables = await detectFileManagerTables(supabase, false);
    if (!hasTables) return [] as FileFolderRow[];
    const { data, error } = await supabase
      .from('file_folders')
      .select('*')
      .eq('module_id', moduleId)
      .eq('folder_type', 'system_record')
      .order('name', { ascending: true });
    if (error) {
      console.warn('Could not load file manager record folders', error);
      return [];
    }
    return (data || []) as FileFolderRow[];
  });
};

const loadScopedRecordFolders = async (moduleId: string, recordId: string) => {
  return getOrSetTimedCache(`file-manager:scoped-folders:${moduleId}:${recordId}`, async () => {
    const hasTables = await detectFileManagerTables(supabase, false);
    if (!hasTables) return [] as FileFolderRow[];
    const { data, error } = await supabase
      .from('file_folders')
      .select('*')
      .eq('module_id', moduleId)
      .eq('record_id', recordId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) {
      console.warn('Could not load scoped record folders', error);
      return [];
    }
    return (data || []) as FileFolderRow[];
  });
};

const getTreeScope = (options: FileManagerTreeOptions) => {
  if (options.scope) return options.scope;
  const moduleId = normalizeText(options.moduleId || options.initialModuleId);
  const recordId = normalizeText(options.recordId || options.initialRecordId);
  if (moduleId && recordId) return 'record' as const;
  if (moduleId) return 'module' as const;
  return 'global' as const;
};

const parseFolderKey = (key?: string | null) => {
  const value = normalizeText(key);
  if (!value || value === ROOT_FOLDER_KEY) return { kind: 'root' as const };
  if (value.startsWith('module:')) return { kind: 'module' as const, moduleId: value.slice('module:'.length) };
  if (value.startsWith('record:')) {
    const rest = value.slice('record:'.length);
    const [moduleId, ...recordParts] = rest.split(':');
    return { kind: 'record' as const, moduleId, recordId: recordParts.join(':') };
  }
  if (value.startsWith('folder:')) return { kind: 'folder' as const, folderId: value.slice('folder:'.length) };
  return { kind: 'unknown' as const, value };
};

export const buildFileManagerTree = async (
  options: FileManagerTreeOptions = {},
): Promise<FileManagerTreeResult> => {
  const pageSize = Math.max(1, Math.min(200, Number(options.pageSize || 60)));
  const page = Math.max(1, Number(options.page || 1));
  const search = normalizeText(options.search).toLowerCase();
  const typeSet = new Set(options.fileTypes || []);
  const recordTitleMap = { ...(options.recordTitleMap || {}) };
  const moduleTitleMap = { ...(options.moduleTitleMap || {}) };
  const scope = getTreeScope(options);
  const moduleId = normalizeText(options.moduleId || options.initialModuleId);
  const recordId = normalizeText(options.recordId || options.initialRecordId);
  const recordAccess = await fetchCurrentUserRecordAccessContext(supabase).catch(() => null);

  const folders: FileManagerTreeFolder[] = [
    { key: ROOT_FOLDER_KEY, label: 'خانه', count: 0, isSystem: true, folderType: 'virtual_root', colorToken: 'system-home' },
  ];

  let allItems: FileManagerListItem[] = [];
  let activeFolderKey = ROOT_FOLDER_KEY;
  let initialFolderKey = ROOT_FOLDER_KEY;

  if (scope === 'global') {
    const [moduleFolders, recordFolders] = await Promise.all([
      loadModuleSystemFolders(),
      detectFileManagerTables(supabase, false)
        .then(async (hasTables) => {
          if (!hasTables) return [] as FileFolderRow[];
          const { data, error } = await supabase
            .from('file_folders')
            .select('id, module_id')
            .eq('folder_type', 'system_record');
          if (error) {
            console.warn('Could not load record folder counts', error);
            return [] as FileFolderRow[];
          }
          return (data || []) as FileFolderRow[];
        }),
    ]);
    const recordCountByModule = new Map<string, number>();
    const recordIdsByModule = new Map<string, string[]>();
    recordFolders.forEach((folder) => {
      const nextModuleId = normalizeText(folder.module_id);
      const nextRecordId = normalizeText(folder.record_id);
      if (!nextModuleId || !nextRecordId) return;
      const current = recordIdsByModule.get(nextModuleId) || [];
      current.push(nextRecordId);
      recordIdsByModule.set(nextModuleId, current);
    });
    const accessibleRecordIdsByModule = new Map<string, Set<string>>();
    await Promise.all(
      Array.from(recordIdsByModule.entries()).map(async ([nextModuleId, nextRecordIds]) => {
        if (!canViewModuleFiles(recordAccess?.permissions, nextModuleId)) {
          accessibleRecordIdsByModule.set(nextModuleId, new Set<string>());
          return;
        }
        accessibleRecordIdsByModule.set(
          nextModuleId,
          await getAccessibleRecordIds(nextModuleId, nextRecordIds, recordAccess),
        );
      }),
    );
    recordFolders.forEach((folder) => {
      const nextModuleId = normalizeText(folder.module_id);
      const nextRecordId = normalizeText(folder.record_id);
      if (!nextModuleId || !nextRecordId) return;
      if (!(accessibleRecordIdsByModule.get(nextModuleId) || new Set<string>()).has(nextRecordId)) return;
      recordCountByModule.set(nextModuleId, (recordCountByModule.get(nextModuleId) || 0) + 1);
    });
    moduleFolders.forEach((folder) => {
      const nextModuleId = normalizeText(folder.module_id);
      if (!canViewModuleFiles(recordAccess?.permissions, nextModuleId)) return;
      const definition = getFileSystemModuleDefinition(nextModuleId);
      const label = moduleTitleMap[nextModuleId] || definition.rootTitle || nextModuleId;
      moduleTitleMap[nextModuleId] = label;
      folders.push({
        key: moduleFolderKey(nextModuleId),
        label,
        parentKey: ROOT_FOLDER_KEY,
        count: recordCountByModule.get(nextModuleId) || 0,
        isSystem: true,
        moduleId: nextModuleId,
        folderId: folder.id,
        folderType: folder.folder_type,
        colorToken: folder.color_token || definition.rootColorToken,
      });
    });
    activeFolderKey = normalizeText(options.folderKey) || ROOT_FOLDER_KEY;
    initialFolderKey = ROOT_FOLDER_KEY;
  }

  if (scope === 'module' && moduleId) {
    if (!canViewModuleFiles(recordAccess?.permissions, moduleId)) {
      initialFolderKey = moduleFolderKey(moduleId);
      activeFolderKey = normalizeText(options.folderKey) || initialFolderKey;
      return {
        folders: folders.filter((folder) => folder.key === ROOT_FOLDER_KEY),
        items: [],
        allItems: [],
        activeFolderKey: ROOT_FOLDER_KEY,
        initialFolderKey: ROOT_FOLDER_KEY,
        totalItems: 0,
        page,
        pageSize,
        recordTitleMap,
      };
    }
    const [moduleFolders, recordFolders, moduleEntries] = await Promise.all([
      loadModuleSystemFolders(),
      loadRecordFoldersForModule(moduleId),
      detectFileManagerTables(supabase, false)
        .then(async (hasTables) => {
          if (!hasTables) return [] as any[];
          const { data, error } = await supabase
            .from('file_entries')
            .select('module_id, record_id')
            .eq('module_id', moduleId)
            .eq('is_deleted', false)
            .limit(5000);
          if (error) {
            console.warn('Could not load module entry counts', error);
            return [];
          }
          return data || [];
        }),
    ]);
    const accessibleRecordIds = await getAccessibleRecordIds(
      moduleId,
      recordFolders.map((folder) => normalizeText(folder.record_id)),
      recordAccess,
    );
    const accessibleRecordFolders = recordFolders.filter((folder) => accessibleRecordIds.has(normalizeText(folder.record_id)));
    const recordTagsMap = await loadRecordTagsMap(moduleId, accessibleRecordFolders.map((folder) => normalizeText(folder.record_id)));
    const moduleDefinition = getFileSystemModuleDefinition(moduleId);
    const moduleFolder = moduleFolders.find((folder) => normalizeText(folder.module_id) === moduleId) || null;
    moduleTitleMap[moduleId] = moduleTitleMap[moduleId] || moduleDefinition.rootTitle || MODULES[moduleId]?.titles?.fa || moduleId;
    folders.push({
      key: moduleFolderKey(moduleId),
      label: moduleTitleMap[moduleId],
      parentKey: ROOT_FOLDER_KEY,
      count: accessibleRecordFolders.length,
      isSystem: true,
      moduleId,
      folderId: moduleFolder?.id || null,
      folderType: moduleFolder?.folder_type || 'system_module',
      colorToken: moduleFolder?.color_token || moduleDefinition.rootColorToken,
    });

    const countByRecord = new Map<string, number>();
    moduleEntries.forEach((row: any) => {
      const nextRecordId = normalizeText(row?.record_id);
      if (!nextRecordId || !accessibleRecordIds.has(nextRecordId)) return;
      countByRecord.set(nextRecordId, (countByRecord.get(nextRecordId) || 0) + 1);
    });

    const fetchedLabels = await fetchRecordReferenceLabels(supabase, accessibleRecordFolders.map((folder) => ({
      moduleId,
      recordId: normalizeText(folder.record_id),
    })));
    Object.assign(recordTitleMap, fetchedLabels);

    accessibleRecordFolders.forEach((folder) => {
      const nextRecordId = normalizeText(folder.record_id);
      const recordKey = `${moduleId}:${nextRecordId}`;
      folders.push({
        key: recordFolderKey(moduleId, nextRecordId),
        label: recordTitleMap[recordKey] || normalizeText(folder.name) || 'رکورد بدون عنوان',
        parentKey: moduleFolderKey(moduleId),
        count: countByRecord.get(nextRecordId) || 0,
        isSystem: true,
        moduleId,
        recordId: nextRecordId,
        folderId: folder.id,
        folderType: folder.folder_type,
        colorToken: folder.color_token || moduleDefinition.rootColorToken,
        tags: recordTagsMap[nextRecordId] || [],
      });
    });
    initialFolderKey = moduleFolderKey(moduleId);
    activeFolderKey = normalizeText(options.folderKey);
    if (!folders.some((folder) => folder.key === activeFolderKey)) activeFolderKey = initialFolderKey;
  }

  if (scope === 'record' && moduleId && recordId) {
    if (!canViewModuleFiles(recordAccess?.permissions, moduleId)) {
      return {
        folders,
        items: [],
        allItems: [],
        activeFolderKey: ROOT_FOLDER_KEY,
        initialFolderKey: ROOT_FOLDER_KEY,
        totalItems: 0,
        page,
        pageSize,
        recordTitleMap,
      };
    }
    const accessibleRecordIds = await getAccessibleRecordIds(moduleId, [recordId], recordAccess);
    if (!accessibleRecordIds.has(recordId)) {
      const moduleDefinition = getFileSystemModuleDefinition(moduleId);
      moduleTitleMap[moduleId] = moduleTitleMap[moduleId] || moduleDefinition.rootTitle || MODULES[moduleId]?.titles?.fa || moduleId;
      folders.push({
        key: moduleFolderKey(moduleId),
        label: moduleTitleMap[moduleId],
        parentKey: ROOT_FOLDER_KEY,
        count: 0,
        isSystem: true,
        moduleId,
        folderType: 'system_module',
        colorToken: moduleDefinition.rootColorToken,
      });
      return {
        folders,
        items: [],
        allItems: [],
        activeFolderKey: recordFolderKey(moduleId, recordId),
        initialFolderKey: recordFolderKey(moduleId, recordId),
        totalItems: 0,
        page,
        pageSize,
        recordTitleMap,
      };
    }
    await ensureSystemFoldersForRecord(moduleId, recordId, normalizeText(recordTitleMap[`${moduleId}:${recordId}`]));
    const [moduleFolders, scopedFolders, recordItems, recordTagsMap] = await Promise.all([
      loadModuleSystemFolders(),
      loadScopedRecordFolders(moduleId, recordId),
      loadRecordFileItems(moduleId, recordId, recordTitleMap[`${moduleId}:${recordId}`]),
      loadRecordTagsMap(moduleId, [recordId]),
    ]);
    allItems = recordItems;

    if (!recordTitleMap[`${moduleId}:${recordId}`]) {
      recordTitleMap[`${moduleId}:${recordId}`] = await resolveRecordFolderLabel(moduleId, recordId, 'رکورد بدون عنوان');
    }
    moduleTitleMap[moduleId] = moduleTitleMap[moduleId] || getFileSystemModuleDefinition(moduleId).rootTitle || MODULES[moduleId]?.titles?.fa || moduleId;

    const moduleFolder = moduleFolders.find((folder) => normalizeText(folder.module_id) === moduleId) || null;
    const recordFolderRow = scopedFolders.find((folder) => normalizeText(folder.folder_type) === 'system_record') || null;
    const manualFolders = scopedFolders.filter((folder) => {
      const type = normalizeText(folder.folder_type);
      return type === 'manual';
    });
    const legacySubfolders = new Set(
      scopedFolders
        .filter((folder) => normalizeText(folder.folder_type) === 'system_subrecord')
        .map((folder) => normalizeText(folder.id)),
    );

    folders.push({
      key: moduleFolderKey(moduleId),
      label: moduleTitleMap[moduleId],
      parentKey: ROOT_FOLDER_KEY,
      count: 0,
      isSystem: true,
      moduleId,
      folderId: moduleFolder?.id || null,
      folderType: moduleFolder?.folder_type || 'system_module',
      colorToken: moduleFolder?.color_token || getFileSystemModuleDefinition(moduleId).rootColorToken,
    });
    folders.push({
      key: recordFolderKey(moduleId, recordId),
      label: recordTitleMap[`${moduleId}:${recordId}`],
      parentKey: moduleFolderKey(moduleId),
      count: 0,
      isSystem: true,
      moduleId,
      recordId,
      folderId: recordFolderRow?.id || null,
      folderType: recordFolderRow?.folder_type || 'system_record',
      colorToken: recordFolderRow?.color_token || getFileSystemModuleDefinition(moduleId).rootColorToken,
      tags: recordTagsMap[recordId] || [],
    });

    const countByFolderId = new Map<string, number>();
    const rootRecordFolderId = normalizeText(recordFolderRow?.id);
    allItems.forEach((item) => {
      const nextFolderId = normalizeText(item.folder_id);
      const counterKey = nextFolderId && !legacySubfolders.has(nextFolderId) ? nextFolderId : '__record_root__';
      countByFolderId.set(counterKey, (countByFolderId.get(counterKey) || 0) + 1);
    });

    folders[folders.length - 1].count = countByFolderId.get('__record_root__') || 0;
    manualFolders.forEach((folder) => {
      const parentId = normalizeText(folder.parent_id);
      const parentKey = parentId && manualFolders.some((candidate) => normalizeText(candidate.id) === parentId)
        ? physicalFolderKey(parentId)
        : recordFolderKey(moduleId, recordId);
      folders.push({
        key: physicalFolderKey(folder.id),
        label: normalizeText(folder.name) || 'پوشه',
        parentKey,
        count: countByFolderId.get(normalizeText(folder.id)) || 0,
        isSystem: false,
        moduleId,
        recordId,
        folderId: folder.id,
        folderType: folder.folder_type,
        colorToken: folder.color_token || 'manual-default',
      });
    });

    initialFolderKey = recordFolderKey(moduleId, recordId);
    activeFolderKey = normalizeText(options.folderKey);
    if (!folders.some((folder) => folder.key === activeFolderKey)) activeFolderKey = initialFolderKey;

    const parsed = parseFolderKey(activeFolderKey);
    allItems = allItems.filter((item) => {
      if (typeSet.size > 0 && !typeSet.has(item.file_type)) return false;
      return matchesItemSearch(item, search, recordTitleMap, moduleTitleMap);
    });

    const visibleItems = allItems.filter((item) => {
      const itemFolderId = normalizeText(item.folder_id);
      if (parsed.kind === 'record' || parsed.kind === 'module' || parsed.kind === 'root') {
        return !itemFolderId || itemFolderId === rootRecordFolderId || legacySubfolders.has(itemFolderId);
      }
      if (parsed.kind === 'folder') return itemFolderId === parsed.folderId;
      return true;
    });
    const start = (page - 1) * pageSize;
    return {
      folders: folders.filter((folder) => matchesFolderSearch(folder, search) || folder.key === activeFolderKey || folder.key === ROOT_FOLDER_KEY),
      items: visibleItems.slice(start, start + pageSize),
      allItems,
      activeFolderKey,
      initialFolderKey,
      totalItems: visibleItems.length,
      page,
      pageSize,
      recordTitleMap,
    };
  }

  const filteredFolders = folders.filter((folder) => matchesFolderSearch(folder, search) || folder.key === activeFolderKey || folder.key === ROOT_FOLDER_KEY);
  return {
    folders: filteredFolders,
    items: [],
    allItems: [],
    activeFolderKey,
    initialFolderKey,
    totalItems: 0,
    page,
    pageSize,
    recordTitleMap,
  };
};
