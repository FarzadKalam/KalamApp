import type { NoteAttachment } from './noteContent';
import { loadRecordFileItems, type FileManagerListItem } from './fileManagerQueries';
import {
  getLegacyWorkflowAttachmentFields,
  shouldIncludeStarredWorkflowAttachments,
} from '../shared/workflowMessagingContract';

export const isStarredRecordFile = (item: Pick<FileManagerListItem, 'is_main_image' | 'entry_metadata'>): boolean =>
  item?.is_main_image === true
  || item?.entry_metadata?.main_image?.starred === true
  || item?.entry_metadata?.starred === true;

const getAttachmentName = (item: FileManagerListItem, index: number) => {
  const explicit = String(item?.file_name || '').trim();
  if (explicit) return explicit;
  const urlName = String(item?.file_url || '').split('?')[0].split('#')[0].split('/').pop();
  return String(urlName || `فایل ستاره‌دار ${index + 1}`).trim();
};

export const loadStarredRecordAttachments = async ({
  moduleId,
  recordId,
}: {
  moduleId: string;
  recordId: string;
}): Promise<NoteAttachment[]> => {
  const normalizedModuleId = String(moduleId || '').trim();
  const normalizedRecordId = String(recordId || '').trim();
  if (!normalizedModuleId || !normalizedRecordId) return [];

  const files = await loadRecordFileItems(normalizedModuleId, normalizedRecordId, null, 'primary');
  return files
    .filter((item) => isStarredRecordFile(item) && String(item?.file_url || '').trim())
    .map((item, index) => ({
      name: getAttachmentName(item, index),
      url: String(item.file_url).trim(),
      mimeType: String(item.mime_type || '').trim() || null,
    }));
};

export const resolveWorkflowMessageAttachments = async ({
  moduleId,
  recordId,
  config,
  resolveLegacyFields,
}: {
  moduleId: string;
  recordId?: string | null;
  config: Record<string, any> | null | undefined;
  resolveLegacyFields: (fieldKeys: string[]) => Promise<NoteAttachment[]>;
}): Promise<NoteAttachment[]> => {
  const legacyFields = getLegacyWorkflowAttachmentFields(config);
  const [starred, legacy] = await Promise.all([
    shouldIncludeStarredWorkflowAttachments(config) && recordId
      ? loadStarredRecordAttachments({ moduleId, recordId: String(recordId) }).catch((error) => {
          console.warn('Could not load starred workflow attachments', error);
          return [];
        })
      : Promise.resolve([]),
    legacyFields.length > 0 ? resolveLegacyFields(legacyFields) : Promise.resolve([]),
  ]);

  return Array.from(new Map(
    [...starred, ...legacy]
      .filter((item) => String(item?.url || '').trim())
      .map((item) => [String(item.url).trim(), item]),
  ).values());
};
