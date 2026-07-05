import { supabase } from '../supabaseClient';
import { FILE_STORAGE_BUCKET, fileStorageClient } from './storageClient';
import { resolveNoteAttachmentFileType, type NoteAttachment } from './noteContent';
import {
  createFileManagerOriginForUpload,
  createWorkspaceAiFileManagerOriginForUpload,
  detectFileManagerTables,
  ensureRecordAiFilesFolder,
  ensureWorkspaceAiFilesFolder,
} from './fileManagerService';
import { fetchRecordReferenceLabels } from './recordReference';
import { fetchSessionBootstrap } from './sessionCache';
import { uploadFileWithProgress } from './uploadFileWithProgress';
import { joinStoragePath, sanitizeStorageFileName } from './storagePath';

type UploadAiFileAttachmentOptions = {
  moduleId?: string | null;
  recordId?: string | null;
  folderId?: string | null;
};

export const uploadAiFileAttachments = async (
  files: File[],
  options: UploadAiFileAttachmentOptions = {},
): Promise<NoteAttachment[]> => {
  if (files.length === 0) return [];

  const normalizedModuleId = String(options.moduleId || '').trim();
  const normalizedRecordId = String(options.recordId || '').trim();
  const normalizedFolderId = String(options.folderId || '').trim();
  const hasRecordScope = Boolean(normalizedModuleId && normalizedRecordId);
  const session = await fetchSessionBootstrap(supabase);
  const orgId = String(session?.orgId || session?.profile?.org_id || '').trim();
  if (!orgId) throw new Error('سازمان جاری قابل تشخیص نیست.');

  const referenceLabels = hasRecordScope
    ? await fetchRecordReferenceLabels(supabase, [{ moduleId: normalizedModuleId, recordId: normalizedRecordId }])
    : {};
  const recordTitle = referenceLabels[`${normalizedModuleId}:${normalizedRecordId}`] || normalizedRecordId;
  const hasFileManagerTables = await detectFileManagerTables(supabase, false);
  const targetFolder = hasFileManagerTables
    ? hasRecordScope
      ? await ensureRecordAiFilesFolder(normalizedModuleId, normalizedRecordId, recordTitle)
      : await ensureWorkspaceAiFilesFolder()
    : null;
  const targetFolderId = normalizedFolderId || targetFolder?.id || null;

  const uploaded: NoteAttachment[] = [];

  for (const file of files) {
    const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeStorageFileName(file.name || 'file')}`;
    const filePath = hasRecordScope
      ? joinStoragePath('record_files', normalizedModuleId, normalizedRecordId, 'ai', storedName)
      : joinStoragePath('ai_files', orgId, storedName);

    await uploadFileWithProgress({
      client: fileStorageClient,
      bucket: FILE_STORAGE_BUCKET,
      path: filePath,
      file,
      label: file.name || 'فایل',
      detail: 'پیوست هوش مصنوعی',
    });

    const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
    const fileUrl = String(data?.publicUrl || '').trim();
    if (!fileUrl) throw new Error('آدرس فایل بارگذاری‌شده دریافت نشد.');

    const fileType = resolveNoteAttachmentFileType({
      name: file.name,
      mimeType: file.type || null,
    }) || 'file';
    const fileName = String(file.name || storedName).trim() || storedName;

    let assetId: string | null = null;
    let entryId: string | null = null;
    if (hasFileManagerTables) {
      try {
        const created = hasRecordScope
          ? await createFileManagerOriginForUpload({
            moduleId: normalizedModuleId,
            recordId: normalizedRecordId,
            recordTitle,
            fileUrl,
            fileName,
            mimeType: file.type || null,
            fileType,
            folderId: targetFolderId,
            sortOrder: 0,
          })
          : await createWorkspaceAiFileManagerOriginForUpload({
            fileUrl,
            fileName,
            mimeType: file.type || null,
            fileType,
            folderId: targetFolderId,
          });
        assetId = created?.asset?.id ? String(created.asset.id) : null;
        entryId = created?.entry?.id ? String(created.entry.id) : null;
      } catch (fileManagerError) {
        console.warn('Could not insert AI uploaded attachment into file manager tables', fileManagerError);
      }
    }

    uploaded.push({
      name: fileName,
      url: fileUrl,
      mimeType: file.type || null,
      fileType,
      assetId,
      entryId,
      moduleId: hasRecordScope ? normalizedModuleId : null,
      recordId: hasRecordScope ? normalizedRecordId : null,
    });
  }

  return uploaded;
};
