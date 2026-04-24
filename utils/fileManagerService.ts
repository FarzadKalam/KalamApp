import { supabase } from '../supabaseClient';
import { FILE_STORAGE_BUCKET } from './storageClient';
import { detectRecordFilesTable, extractStoragePathFromPublicUrl, isMissingRecordFilesError } from './recordFilesAvailability';
import { getFileSystemModuleDefinition } from './fileManagerConfig';
import { invalidateFileManagerFolderCaches, invalidateFileManagerQueryCache } from './fileManagerQueryCache';
import { MODULES } from '../moduleRegistry';
import { getRecordDisplayLabel } from './recordLabel';
import { buildRecordTitleSelectColumns, runSelectWithCompatibleColumns } from './selectCompat';
import type { FileAssetRow, FileEntryRow, FileFolderRow, FileVisibility } from './fileManagerTypes';

const FILE_MANAGER_TABLES_KEY = 'erp_file_manager_tables_available';

let fileManagerTablesAvailableCache: boolean | null = (() => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(FILE_MANAGER_TABLES_KEY);
    if (raw === '1') return true;
    if (raw === '0') return false;
  } catch {
    // ignore
  }
  return null;
})();

const persistFileManagerTablesAvailability = (exists: boolean) => {
  fileManagerTablesAvailableCache = exists;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FILE_MANAGER_TABLES_KEY, exists ? '1' : '0');
    }
  } catch {
    // ignore
  }
};

const isMissingFileManagerTableError = (error: any) => {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return String(error?.code || '').trim() === '42P01'
    || (message.includes('file_folders') && message.includes('does not exist'))
    || (message.includes('file_assets') && message.includes('does not exist'))
    || (message.includes('file_entries') && message.includes('does not exist'));
};

const slugify = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\u0600-\u06FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const buildSourceKey = (...parts: Array<string | null | undefined>) =>
  parts.map((part) => String(part || '').trim()).filter(Boolean).join(':');

const invalidateFileManagerFolderScope = (moduleId?: string | null, recordId?: string | null) => {
  invalidateFileManagerFolderCaches(moduleId, recordId);
};

const invalidateFileManagerRecordScope = (moduleId?: string | null, recordId?: string | null) => {
  invalidateFileManagerFolderScope(moduleId, recordId);
  invalidateFileManagerQueryCache();
};

export const getFileManagerTablesAvailabilityCache = () => fileManagerTablesAvailableCache;

export const detectFileManagerTables = async (client: any = supabase, force = false): Promise<boolean> => {
  if (!force && fileManagerTablesAvailableCache !== null) {
    return fileManagerTablesAvailableCache;
  }

  try {
    const { error } = await client.from('file_folders').select('id').limit(1);
    if (!error) {
      persistFileManagerTablesAvailability(true);
      return true;
    }
    if (isMissingFileManagerTableError(error)) {
      persistFileManagerTablesAvailability(false);
      return false;
    }
  } catch {
    // ignore
  }

  persistFileManagerTablesAvailability(true);
  return true;
};

export const buildModuleRootFolderDraft = (moduleId: string): Partial<FileFolderRow> => {
  const definition = getFileSystemModuleDefinition(moduleId);
  return {
    name: definition.rootTitle,
    slug: slugify(definition.rootTitle),
    folder_type: 'system_module',
    module_id: moduleId,
    source_scope: 'module_root',
    source_key: buildSourceKey('module_root', moduleId),
    visibility: 'private',
    is_system: true,
    color_token: definition.rootColorToken,
    icon_token: 'folder',
    metadata: {
      module_id: moduleId,
      auto_created: true,
    },
  };
};

export const buildRecordFolderDraft = (moduleId: string, recordId: string, recordTitle: string): Partial<FileFolderRow> => {
  const definition = getFileSystemModuleDefinition(moduleId);
  const nextName = String(recordTitle || '').trim() || 'رکورد بدون عنوان';
  return {
    name: nextName,
    slug: slugify(nextName),
    folder_type: 'system_record',
    module_id: moduleId,
    record_id: recordId,
    source_scope: 'record_root',
    source_key: buildSourceKey('record_root', moduleId, recordId),
    visibility: 'private',
    is_system: true,
    color_token: definition.rootColorToken,
    icon_token: 'folder-open',
    metadata: {
      module_id: moduleId,
      record_id: recordId,
      auto_created: true,
    },
  };
};

const normalizeRecordFolderLabel = (row: any, moduleId: string) => {
  const display = String(getRecordDisplayLabel(row, moduleId, { fallback: '' }) || '').trim();
  if (display) return display;
  const systemCode = String(row?.system_code || '').trim();
  if (systemCode) return systemCode;
  const manualCode = String(row?.manual_code || '').trim();
  if (manualCode) return manualCode;
  return 'رکورد بدون عنوان';
};

export const resolveRecordFolderLabel = async (
  moduleId: string,
  recordId: string,
  fallback?: string | null,
): Promise<string> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  const normalizedFallback = String(fallback || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) {
    return normalizedFallback || 'رکورد بدون عنوان';
  }

  const table = MODULES[normalizedModuleId]?.table || normalizedModuleId;
  if (!table) return normalizedFallback || 'رکورد بدون عنوان';

  try {
    const result = await runSelectWithCompatibleColumns<any>({
      cacheKey: `file-manager-folder-label:${normalizedModuleId}`,
      columns: buildRecordTitleSelectColumns(normalizedModuleId),
      execute: (selectExpr) =>
        supabase
          .from(table)
          .select(selectExpr)
          .eq('id', normalizedRecordId)
          .maybeSingle(),
    });
    if (result.error) throw result.error;
    if (result.data) return normalizeRecordFolderLabel(result.data, normalizedModuleId);
  } catch (error) {
    console.warn('Could not resolve record folder label', error);
  }

  return normalizedFallback || 'رکورد بدون عنوان';
};

export const ensureFolder = async (draft: Partial<FileFolderRow>, parentId?: string | null): Promise<FileFolderRow | null> => {
  const sourceKey = String(draft.source_key || '').trim();
  if (!sourceKey) return null;

  const { data: existing, error: existingError } = await supabase
    .from('file_folders')
    .select('*')
    .eq('source_key', sourceKey)
    .maybeSingle();
  if (existingError && isMissingFileManagerTableError(existingError)) {
    persistFileManagerTablesAvailability(false);
    return null;
  }
  if (existingError) throw existingError;
  if (existing) {
    const nextName = String(draft.name || '').trim();
    const nextSlug = String(draft.slug || '').trim();
    if (existing.is_system && nextName && String(existing.name || '') !== nextName) {
      const { data: updated, error: updateError } = await supabase
        .from('file_folders')
        .update({
          name: nextName,
          slug: nextSlug || existing.slug || null,
        })
        .eq('id', existing.id)
        .select('*')
        .single();
      if (updateError) throw updateError;
      invalidateFileManagerFolderScope(updated?.module_id || existing.module_id, updated?.record_id || existing.record_id);
      return updated as FileFolderRow;
    }
    return existing as FileFolderRow;
  }

  const { data, error } = await supabase
    .from('file_folders')
    .insert({
      ...draft,
      parent_id: parentId || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  invalidateFileManagerFolderScope(data?.module_id, data?.record_id);
  return data as FileFolderRow;
};

export const ensureSystemFoldersForRecord = async (
  moduleId: string,
  recordId: string,
  recordTitle: string,
): Promise<{ moduleFolder: FileFolderRow | null; recordFolder: FileFolderRow | null; subfolders: FileFolderRow[] }> => {
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return { moduleFolder: null, recordFolder: null, subfolders: [] };

  const providedTitle = String(recordTitle || '').trim();
  const nextRecordTitle = providedTitle && providedTitle !== String(recordId || '').trim() && providedTitle !== 'رکورد بدون عنوان'
    ? providedTitle
    : await resolveRecordFolderLabel(moduleId, recordId, recordTitle);
  const moduleFolder = await ensureFolder(buildModuleRootFolderDraft(moduleId));
  const recordFolder = await ensureFolder(buildRecordFolderDraft(moduleId, recordId, nextRecordTitle), moduleFolder?.id || null);
  return { moduleFolder, recordFolder, subfolders: [] };
};

export const createManualFileFolder = async (input: {
  parentId: string;
  name: string;
  moduleId?: string | null;
  recordId?: string | null;
  visibility?: FileVisibility;
}) => {
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return null;

  const parentId = String(input.parentId || '').trim();
  const name = String(input.name || '').trim();
  if (!parentId || !name) throw new Error('create_file_folder_invalid_input');

  const { data, error } = await supabase
    .from('file_folders')
    .insert({
      parent_id: parentId,
      name,
      slug: slugify(name),
      folder_type: 'manual',
      module_id: String(input.moduleId || '').trim() || null,
      record_id: String(input.recordId || '').trim() || null,
      visibility: input.visibility || 'private',
      is_system: false,
      icon_token: 'folder',
      metadata: {},
    })
    .select('*')
    .single();
  if (error) throw error;
  invalidateFileManagerFolderScope(data?.module_id, data?.record_id);
  return data as FileFolderRow;
};

export const renameFileFolder = async (folderId: string, name: string) => {
  const normalizedFolderId = String(folderId || '').trim();
  const normalizedName = String(name || '').trim();
  if (!normalizedFolderId || !normalizedName) throw new Error('rename_file_folder_invalid_input');

  const { data: folder, error: folderError } = await supabase
    .from('file_folders')
    .select('id, is_system, module_id, record_id')
    .eq('id', normalizedFolderId)
    .maybeSingle();
  if (folderError) throw folderError;
  if (!folder) throw new Error('folder_not_found');
  if (folder.is_system) throw new Error('system_folder_locked');

  const { data, error } = await supabase
    .from('file_folders')
    .update({
      name: normalizedName,
      slug: slugify(normalizedName),
    })
    .eq('id', normalizedFolderId)
    .select('*')
    .single();
  if (error) throw error;
  invalidateFileManagerFolderScope(data?.module_id, data?.record_id);
  return data as FileFolderRow;
};

export const deleteManualFileFolder = async (folderId: string) => {
  const normalizedFolderId = String(folderId || '').trim();
  if (!normalizedFolderId) throw new Error('delete_file_folder_invalid_input');

  const { data: folder, error: folderError } = await supabase
    .from('file_folders')
    .select('id, is_system')
    .eq('id', normalizedFolderId)
    .maybeSingle();
  if (folderError) throw folderError;
  if (!folder) return;
  if (folder.is_system) throw new Error('system_folder_locked');

  const { count: childCount, error: childError } = await supabase
    .from('file_folders')
    .select('id', { count: 'exact', head: true })
    .eq('parent_id', normalizedFolderId);
  if (childError) throw childError;
  if ((childCount || 0) > 0) throw new Error('folder_not_empty');

  const { count: fileCount, error: fileError } = await supabase
    .from('file_entries')
    .select('id', { count: 'exact', head: true })
    .eq('folder_id', normalizedFolderId)
    .eq('is_deleted', false);
  if (fileError) throw fileError;
  if ((fileCount || 0) > 0) throw new Error('folder_not_empty');

  const { error } = await supabase.from('file_folders').delete().eq('id', normalizedFolderId);
  if (error) throw error;
  invalidateFileManagerFolderScope((folder as any)?.module_id, (folder as any)?.record_id);
};

export const buildAssetDraftFromLegacyUrl = (
  fileUrl: string,
  options?: {
    displayName?: string | null;
    mimeType?: string | null;
    moduleId?: string | null;
    recordId?: string | null;
    visibility?: FileVisibility;
    fileType?: string | null;
  },
): Partial<FileAssetRow> => {
  const normalizedUrl = String(fileUrl || '').trim();
  const storagePath = extractStoragePathFromPublicUrl(normalizedUrl, FILE_STORAGE_BUCKET) || normalizedUrl;
  const directName = String(options?.displayName || '').trim();
  const fallbackName = String(storagePath.split('/').pop() || 'file').trim() || 'file';
  const displayName = directName || fallbackName;
  const ext = String(displayName.split('.').pop() || '').trim().toLowerCase() || null;

  return {
    storage_bucket: FILE_STORAGE_BUCKET,
    storage_path: storagePath,
    target_url: normalizedUrl,
    display_name: displayName,
    canonical_name: displayName,
    file_ext: ext,
    mime_type: options?.mimeType || null,
    file_type: (String(options?.fileType || '').trim() || 'file') as any,
    visibility: options?.visibility || 'private',
    is_public: options?.visibility === 'public',
    origin_module_id: options?.moduleId || null,
    origin_record_id: options?.recordId || null,
    metadata: {},
  };
};

export const ensureAssetForLegacyRecordFile = async (recordFile: {
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  file_type?: string | null;
  module_id?: string | null;
  record_id?: string | null;
  asset_id?: string | null;
}): Promise<FileAssetRow | null> => {
  const fileUrl = String(recordFile.file_url || '').trim();
  if (!fileUrl) return null;

  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return null;

  const existingAssetId = String(recordFile.asset_id || '').trim();
  if (existingAssetId) {
    const { data } = await supabase.from('file_assets').select('*').eq('id', existingAssetId).maybeSingle();
    if (data) return data as FileAssetRow;
  }

  const storagePath = extractStoragePathFromPublicUrl(fileUrl, FILE_STORAGE_BUCKET) || fileUrl;
  const { data: existing } = await supabase
    .from('file_assets')
    .select('*')
    .eq('storage_bucket', FILE_STORAGE_BUCKET)
    .eq('storage_path', storagePath)
    .maybeSingle();
  if (existing) return existing as FileAssetRow;

  const { data, error } = await supabase
    .from('file_assets')
    .insert(buildAssetDraftFromLegacyUrl(fileUrl, {
      displayName: recordFile.file_name || null,
      mimeType: recordFile.mime_type || null,
      moduleId: recordFile.module_id || null,
      recordId: recordFile.record_id || null,
      fileType: recordFile.file_type || null,
    }))
    .select('*')
    .single();
  if (error) throw error;
  return data as FileAssetRow;
};

export const ensureOriginEntryForLegacyRecordFile = async (
  recordFile: {
    id?: string | null;
    file_url?: string | null;
    file_name?: string | null;
    mime_type?: string | null;
    file_type?: string | null;
    module_id?: string | null;
    record_id?: string | null;
    asset_id?: string | null;
    file_entry_id?: string | null;
    source_module_id?: string | null;
    source_record_id?: string | null;
    source_record_title?: string | null;
  },
  options?: {
    recordTitle?: string | null;
    subfolderKey?: string | null;
  },
): Promise<FileEntryRow | null> => {
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return null;

  const asset = await ensureAssetForLegacyRecordFile(recordFile);
  if (!asset) return null;

  const moduleId = String(recordFile.module_id || '').trim();
  const recordId = String(recordFile.record_id || '').trim();
  const bundle = moduleId && recordId
    ? await ensureSystemFoldersForRecord(moduleId, recordId, String(options?.recordTitle || '').trim() || 'رکورد بدون عنوان')
    : { moduleFolder: null, recordFolder: null, subfolders: [] as FileFolderRow[] };
  const targetFolder = bundle.recordFolder;

  const existingEntryId = String(recordFile.file_entry_id || '').trim();
  if (existingEntryId) {
    const { data } = await supabase.from('file_entries').select('*').eq('id', existingEntryId).maybeSingle();
    if (data) return data as FileEntryRow;
  }

  const { data: existing } = await supabase
    .from('file_entries')
    .select('*')
    .eq('asset_id', asset.id)
    .eq('module_id', moduleId || null)
    .eq('record_id', recordId || null)
    .eq('entry_type', 'origin')
    .maybeSingle();
  if (existing) return existing as FileEntryRow;

  const { data, error } = await supabase
    .from('file_entries')
    .insert({
      asset_id: asset.id,
      folder_id: targetFolder?.id || bundle.recordFolder?.id || null,
      entry_type: 'origin',
      entry_name: String(recordFile.file_name || asset.display_name || '').trim() || null,
      module_id: moduleId || null,
      record_id: recordId || null,
      source_table: 'record_files',
      source_row_id: recordFile.id || null,
      source_module_id: String(recordFile.source_module_id || '').trim() || null,
      source_record_id: String(recordFile.source_record_id || '').trim() || null,
      source_record_title: String(recordFile.source_record_title || '').trim() || null,
      metadata: {},
    })
    .select('*')
    .single();
  if (error) throw error;

  if (String(recordFile.id || '').trim()) {
    await supabase
      .from('record_files')
      .update({
        asset_id: asset.id,
        file_entry_id: String(data?.id || '').trim() || null,
        folder_id: String(data?.folder_id || '').trim() || null,
        entry_type: 'origin',
        is_shortcut: false,
      })
      .eq('id', recordFile.id);
  }

  invalidateFileManagerRecordScope(moduleId, recordId);
  return data as FileEntryRow;
};

const normalizeFileAssetType = (value?: string | null): FileAssetRow['file_type'] => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'image' || normalized === 'video' || normalized === 'file' || normalized === 'audio' || normalized === 'archive' || normalized === 'document') {
    return normalized;
  }
  return 'file';
};

export const createFileManagerOriginForUpload = async (input: {
  moduleId: string;
  recordId: string;
  recordTitle?: string | null;
  fileUrl: string;
  fileName?: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  subfolderKey?: string | null;
  folderId?: string | null;
  sortOrder?: number | null;
  visibility?: FileVisibility;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
}) => {
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return null;

  const moduleId = String(input.moduleId || '').trim();
  const recordId = String(input.recordId || '').trim();
  const fileUrl = String(input.fileUrl || '').trim();
  if (!moduleId || !recordId || !fileUrl) {
    throw new Error('create_file_manager_origin_invalid_input');
  }

  const bundle = await ensureSystemFoldersForRecord(
    moduleId,
    recordId,
    String(input.recordTitle || '').trim() || 'رکورد بدون عنوان',
  );
  const targetFolderId = String(input.folderId || '').trim() || bundle.recordFolder?.id || null;
  const storagePath = extractStoragePathFromPublicUrl(fileUrl, FILE_STORAGE_BUCKET) || fileUrl;
  const displayName = String(input.fileName || '').trim() || String(storagePath.split('/').pop() || 'file').trim() || 'file';

  let asset: FileAssetRow | null = null;
  const { data: existingAsset } = await supabase
    .from('file_assets')
    .select('*')
    .eq('storage_bucket', FILE_STORAGE_BUCKET)
    .eq('storage_path', storagePath)
    .maybeSingle();
  if (existingAsset) {
    asset = existingAsset as FileAssetRow;
  } else {
    const { data: insertedAsset, error: assetError } = await supabase
      .from('file_assets')
      .insert({
        ...buildAssetDraftFromLegacyUrl(fileUrl, {
          displayName,
          mimeType: input.mimeType || null,
          moduleId,
          recordId,
          visibility: input.visibility || 'private',
          fileType: normalizeFileAssetType(input.fileType),
        }),
        origin_folder_id: targetFolderId,
        metadata: {
          tags: Array.isArray(input.tags) ? input.tags : [],
        },
      })
      .select('*')
      .single();
    if (assetError) throw assetError;
    asset = insertedAsset as FileAssetRow;
  }

  const { data: existingEntry } = await supabase
    .from('file_entries')
    .select('*')
    .eq('asset_id', asset.id)
    .eq('module_id', moduleId)
    .eq('record_id', recordId)
    .eq('entry_type', 'origin')
    .eq('is_deleted', false)
    .maybeSingle();

  const entry = existingEntry
    ? (existingEntry as FileEntryRow)
    : await (async () => {
      const { data: insertedEntry, error: entryError } = await supabase
        .from('file_entries')
        .insert({
          asset_id: asset.id,
          folder_id: targetFolderId,
          entry_type: 'origin',
          entry_name: displayName,
          module_id: moduleId,
          record_id: recordId,
          sort_order: Number.isFinite(input.sortOrder as number) ? input.sortOrder : 0,
          metadata: {
            tags: Array.isArray(input.tags) ? input.tags : [],
          },
        })
        .select('*')
        .single();
      if (entryError) throw entryError;
      return insertedEntry as FileEntryRow;
    })();

  let recordFileId: string | null = null;
  const hasRecordFilesTable = await detectRecordFilesTable(supabase, false);
  if (hasRecordFilesTable) {
    const { data: existingRecordFile } = await supabase
      .from('record_files')
      .select('id')
      .eq('file_entry_id', entry.id)
      .maybeSingle();

    if (existingRecordFile?.id) {
      recordFileId = String(existingRecordFile.id);
    } else {
      const { data: insertedRecordFile, error: recordFileError } = await supabase
        .from('record_files')
        .insert({
          module_id: moduleId,
          record_id: recordId,
          file_url: fileUrl,
          file_type: normalizeFileAssetType(input.fileType),
          file_name: displayName,
          mime_type: input.mimeType || null,
          sort_order: Number.isFinite(input.sortOrder as number) ? input.sortOrder : 0,
          folder_id: entry.folder_id || null,
          asset_id: asset.id,
          file_entry_id: entry.id,
          entry_type: 'origin',
          is_shortcut: false,
        })
        .select('id')
        .single();

      if (recordFileError && !isMissingRecordFilesError(recordFileError)) {
        throw recordFileError;
      }
      recordFileId = insertedRecordFile?.id ? String(insertedRecordFile.id) : null;
    }
  }

  invalidateFileManagerRecordScope(moduleId, recordId);
  return { asset, entry, recordFileId };
};

export const createFileManagerShortcut = async (input: {
  assetId?: string | null;
  sourceEntryId?: string | null;
  sourceModuleId?: string | null;
  sourceRecordId?: string | null;
  sourceRecordTitle?: string | null;
  targetModuleId: string;
  targetRecordId: string;
  targetRecordTitle?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileType?: string | null;
  subfolderKey?: string | null;
  folderId?: string | null;
  sortOrder?: number | null;
  tags?: Array<{ id: string; title: string; color?: string | null }>;
}) => {
  const hasTables = await detectFileManagerTables(supabase, false);
  if (!hasTables) return null;

  const targetModuleId = String(input.targetModuleId || '').trim();
  const targetRecordId = String(input.targetRecordId || '').trim();
  if (!targetModuleId || !targetRecordId) {
    throw new Error('create_file_manager_shortcut_invalid_target');
  }

  let assetId = String(input.assetId || '').trim();
  if (!assetId) {
    const asset = await ensureAssetForLegacyRecordFile({
      file_url: input.fileUrl || null,
      file_name: input.fileName || null,
      mime_type: input.mimeType || null,
      file_type: input.fileType || null,
      module_id: input.sourceModuleId || targetModuleId,
      record_id: input.sourceRecordId || targetRecordId,
    });
    assetId = String(asset?.id || '').trim();
  }
  if (!assetId) {
    throw new Error('create_file_manager_shortcut_missing_asset');
  }

  const bundle = await ensureSystemFoldersForRecord(
    targetModuleId,
    targetRecordId,
    String(input.targetRecordTitle || '').trim() || 'رکورد بدون عنوان',
  );
  const targetFolderId = String(input.folderId || '').trim() || bundle.recordFolder?.id || null;

  let existingEntryQuery = supabase
    .from('file_entries')
    .select('*')
    .eq('asset_id', assetId)
    .eq('module_id', targetModuleId)
    .eq('record_id', targetRecordId)
    .eq('entry_type', 'shortcut')
    .eq('is_deleted', false);
  existingEntryQuery = targetFolderId
    ? existingEntryQuery.eq('folder_id', targetFolderId)
    : existingEntryQuery.is('folder_id', null);
  const { data: existingEntry } = await existingEntryQuery.maybeSingle();

  const entry = existingEntry
    ? (existingEntry as FileEntryRow)
    : await (async () => {
      const { data: insertedEntry, error: entryError } = await supabase
        .from('file_entries')
        .insert({
          asset_id: assetId,
          folder_id: targetFolderId,
          entry_type: 'shortcut',
          entry_name: String(input.fileName || '').trim() || null,
          module_id: targetModuleId,
          record_id: targetRecordId,
          source_entry_id: String(input.sourceEntryId || '').trim() || null,
          source_module_id: String(input.sourceModuleId || '').trim() || null,
          source_record_id: String(input.sourceRecordId || '').trim() || null,
          source_record_title: String(input.sourceRecordTitle || '').trim() || null,
          sort_order: Number.isFinite(input.sortOrder as number) ? input.sortOrder : 0,
          metadata: {
            tags: Array.isArray(input.tags) ? input.tags : [],
          },
        })
        .select('*')
        .single();
      if (entryError) throw entryError;
      return insertedEntry as FileEntryRow;
    })();

  let recordFileId: string | null = null;
  const hasRecordFilesTable = await detectRecordFilesTable(supabase, false);
  if (hasRecordFilesTable) {
    const { data: existingRecordFile } = await supabase
      .from('record_files')
      .select('id')
      .eq('file_entry_id', entry.id)
      .maybeSingle();

    if (existingRecordFile?.id) {
      recordFileId = String(existingRecordFile.id);
    } else {
      const { data: insertedRecordFile, error: recordFileError } = await supabase
        .from('record_files')
        .insert({
          module_id: targetModuleId,
          record_id: targetRecordId,
          file_url: String(input.fileUrl || '').trim() || null,
          file_type: normalizeFileAssetType(input.fileType),
          file_name: String(input.fileName || '').trim() || null,
          mime_type: input.mimeType || null,
          sort_order: Number.isFinite(input.sortOrder as number) ? input.sortOrder : 0,
          folder_id: entry.folder_id || targetFolderId || null,
          asset_id: assetId,
          file_entry_id: entry.id,
          entry_type: 'shortcut',
          is_shortcut: true,
          source_module_id: String(input.sourceModuleId || '').trim() || null,
          source_record_id: String(input.sourceRecordId || '').trim() || null,
          source_record_title: String(input.sourceRecordTitle || '').trim() || null,
        })
        .select('id')
        .single();
      if (recordFileError && !isMissingRecordFilesError(recordFileError)) {
        throw recordFileError;
      }
      recordFileId = insertedRecordFile?.id ? String(insertedRecordFile.id) : null;
    }
  }

  invalidateFileManagerRecordScope(targetModuleId, targetRecordId);
  return { entry, recordFileId };
};

export const deleteFileManagerEntry = async (input: {
  recordFileId?: string | null;
  entryId?: string | null;
}) => {
  const entryId = String(input.entryId || '').trim();
  if (!entryId) {
    const recordFileId = String(input.recordFileId || '').trim();
    if (!recordFileId) return;
    const { data: recordFile } = await supabase
      .from('record_files')
      .select('module_id, record_id')
      .eq('id', recordFileId)
      .maybeSingle();
    const { error } = await supabase.from('record_files').delete().eq('id', recordFileId);
    if (error && !isMissingRecordFilesError(error)) throw error;
    invalidateFileManagerRecordScope((recordFile as any)?.module_id, (recordFile as any)?.record_id);
    return;
  }

  const { data: entry, error: entryError } = await supabase
    .from('file_entries')
    .select('id, asset_id, entry_type, module_id, record_id')
    .eq('id', entryId)
    .maybeSingle();
  if (entryError) throw entryError;
  if (!entry) return;

  if (String(entry.entry_type || '').trim() === 'origin') {
    const { count, error: refsError } = await supabase
      .from('file_entries')
      .select('id', { count: 'exact', head: true })
      .eq('asset_id', entry.asset_id)
      .eq('is_deleted', false)
      .neq('id', entryId);
    if (refsError) throw refsError;
    if ((count || 0) > 0) {
      throw new Error('origin_has_shortcuts');
    }
  }

  const { error: deleteEntryError } = await supabase
    .from('file_entries')
    .update({
      is_deleted: true,
      deleted_at: new Date().toISOString(),
    })
    .eq('id', entryId);
  if (deleteEntryError) throw deleteEntryError;

  const recordFileId = String(input.recordFileId || '').trim();
  if (recordFileId) {
    const { error: deleteRecordFileError } = await supabase.from('record_files').delete().eq('id', recordFileId);
    if (deleteRecordFileError && !isMissingRecordFilesError(deleteRecordFileError)) throw deleteRecordFileError;
    invalidateFileManagerRecordScope((entry as any)?.module_id, (entry as any)?.record_id);
    return;
  }

  const hasRecordFilesTable = await detectRecordFilesTable(supabase, false);
  if (hasRecordFilesTable) {
    const { error: deleteRecordFileError } = await supabase.from('record_files').delete().eq('file_entry_id', entryId);
    if (deleteRecordFileError && !isMissingRecordFilesError(deleteRecordFileError)) throw deleteRecordFileError;
  }
  invalidateFileManagerRecordScope((entry as any)?.module_id, (entry as any)?.record_id);
};
