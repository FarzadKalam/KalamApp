import { supabase } from '../supabaseClient';
import { FILE_STORAGE_BUCKET, fileStorageClient } from './storageClient';
import type { NoteAttachment } from './noteContent';
import { createFileManagerOriginForUpload, createFileManagerShortcut, detectFileManagerTables } from './fileManagerService';
import { uploadFileWithProgress } from './uploadFileWithProgress';

const normalizeFileName = (file: File) => {
  const ext = String(file.name.split('.').pop() || '').trim();
  const baseName = String(file.name || 'file')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-120);

  if (!ext || baseName.toLowerCase().endsWith(`.${ext.toLowerCase()}`)) return baseName;
  return `${baseName}.${ext}`;
};

export const uploadNoteAttachments = async (
  moduleId: string | null | undefined,
  recordId: string | null | undefined,
  files: File[],
): Promise<NoteAttachment[]> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (files.length === 0) return [];
  const hasRelatedRecord = Boolean(normalizedModuleId && normalizedRecordId);

  const uploaded: NoteAttachment[] = [];

  for (const file of files) {
    const storedName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${normalizeFileName(file)}`;
    const filePath = hasRelatedRecord
      ? `record_files/${normalizedModuleId}/${normalizedRecordId}/${storedName}`
      : `record_files/notes/unlinked/${storedName}`;

    await uploadFileWithProgress({
      client: fileStorageClient,
      bucket: FILE_STORAGE_BUCKET,
      path: filePath,
      file,
      label: file.name || 'پیوست',
      detail: 'پیوست یادداشت',
    });

    const { data } = fileStorageClient.storage.from(FILE_STORAGE_BUCKET).getPublicUrl(filePath);
    const fileUrl = String(data?.publicUrl || '').trim();
    if (!fileUrl) throw new Error('آدرس فایل بارگذاری‌شده دریافت نشد.');

    const fileType = String(file.type || '').startsWith('image/') ? 'image' : 'file';
    const fileName = String(file.name || storedName).trim() || storedName;

    if (hasRelatedRecord) {
      const hasFileManagerTables = await detectFileManagerTables(supabase, false);
      if (hasFileManagerTables) {
        try {
          await createFileManagerOriginForUpload({
            moduleId: normalizedModuleId,
            recordId: normalizedRecordId,
            recordTitle: normalizedRecordId,
            fileUrl,
            fileName,
            mimeType: file.type || null,
            fileType,
            sortOrder: 0,
          });
        } catch (fileManagerError) {
          console.warn('Could not insert uploaded note attachment into file manager tables', fileManagerError);
        }
      } else {
        const { error: recordFileError } = await supabase
          .from('record_files')
          .insert([
            {
              module_id: normalizedModuleId,
              record_id: normalizedRecordId,
              file_url: fileUrl,
              file_type: fileType,
              file_name: fileName,
              mime_type: file.type || null,
              sort_order: 0,
            },
          ]);

        if (recordFileError) {
          console.warn('Could not insert uploaded note attachment into record_files', recordFileError);
        }
      }
    }

    uploaded.push({
      name: fileName,
      url: fileUrl,
      mimeType: file.type || null,
    });
  }

  return uploaded;
};

export const ensureNoteAttachmentShortcuts = async (
  moduleId: string | null | undefined,
  recordId: string | null | undefined,
  attachments: NoteAttachment[],
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId || attachments.length === 0) return;

  const hasFileManagerTables = await detectFileManagerTables(supabase, false);
  if (!hasFileManagerTables) return;

  for (const attachment of attachments) {
    const url = String(attachment?.url || '').trim();
    if (!url) continue;
    const sourceModuleId = String(attachment.moduleId || '').trim();
    const sourceRecordId = String(attachment.recordId || '').trim();
    if (sourceModuleId === normalizedModuleId && sourceRecordId === normalizedRecordId) continue;

    try {
      await createFileManagerShortcut({
        assetId: attachment.assetId || null,
        sourceEntryId: attachment.entryId || null,
        sourceModuleId: sourceModuleId || null,
        sourceRecordId: sourceRecordId || null,
        sourceRecordTitle: attachment.name || null,
        targetModuleId: normalizedModuleId,
        targetRecordId: normalizedRecordId,
        targetRecordTitle: normalizedRecordId,
        fileUrl: url,
        fileName: attachment.name || null,
        mimeType: attachment.mimeType || null,
        fileType: attachment.fileType || null,
      });
    } catch (error) {
      console.warn('Could not create file manager shortcut for selected note attachment', error);
    }
  }
};
