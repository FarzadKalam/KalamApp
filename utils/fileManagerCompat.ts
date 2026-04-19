import { supabase } from '../supabaseClient';
import { detectRecordFilesTable, isMissingRecordFilesError } from './recordFilesAvailability';
import { ensureOriginEntryForLegacyRecordFile } from './fileManagerService';
import type { FileEntryRow } from './fileManagerTypes';

type LegacyRecordFileRow = {
  id: string;
  module_id: string;
  record_id: string;
  file_url: string;
  file_name: string | null;
  mime_type: string | null;
  file_type: string | null;
  asset_id?: string | null;
  file_entry_id?: string | null;
  source_module_id?: string | null;
  source_record_id?: string | null;
  source_record_title?: string | null;
};

export type LegacyRecordFileQueryOptions = {
  moduleId?: string | null;
  recordId?: string | null;
  onlyUnsynced?: boolean;
  limit?: number;
};

export const resolveLegacySubfolderKey = (
  moduleId?: string | null,
  options?: {
    sourceTable?: string | null;
    sourceFieldKey?: string | null;
    mimeType?: string | null;
    fileType?: string | null;
  },
) => {
  const normalizedModuleId = String(moduleId || '').trim();
  const sourceTable = String(options?.sourceTable || '').trim().toLowerCase();
  const sourceFieldKey = String(options?.sourceFieldKey || '').trim().toLowerCase();
  const mimeType = String(options?.mimeType || '').trim().toLowerCase();
  const fileType = String(options?.fileType || '').trim().toLowerCase();

  if (normalizedModuleId === 'invoices') {
    if (sourceTable.includes('cash_bank') || sourceFieldKey.includes('receipt') || sourceFieldKey.includes('payment')) {
      return 'receipts';
    }
    return 'invoice_media';
  }

  if (normalizedModuleId === 'purchase_invoices' || normalizedModuleId === 'expense_documents') {
    if (sourceTable.includes('cash_bank') || sourceFieldKey.includes('payment')) {
      return 'payments';
    }
    return normalizedModuleId === 'expense_documents' ? 'documents' : 'invoice_media';
  }

  if (normalizedModuleId === 'products' && (fileType === 'image' || mimeType.startsWith('image/'))) {
    return 'images';
  }

  return 'attachments';
};

export const loadLegacyRecordFiles = async (
  options: LegacyRecordFileQueryOptions = {},
): Promise<LegacyRecordFileRow[]> => {
  const tableExists = await detectRecordFilesTable(supabase, false);
  if (!tableExists) return [];

  let query = supabase
    .from('record_files')
    .select('id, module_id, record_id, file_url, file_name, mime_type, file_type, asset_id, file_entry_id, source_module_id, source_record_id, source_record_title')
    .order('created_at', { ascending: true });

  const moduleId = String(options.moduleId || '').trim();
  const recordId = String(options.recordId || '').trim();
  if (moduleId) query = query.eq('module_id', moduleId);
  if (recordId) query = query.eq('record_id', recordId);
  if (options.onlyUnsynced) {
    query = query.or('file_entry_id.is.null,asset_id.is.null');
  }
  if (Number.isFinite(options.limit as number) && Number(options.limit) > 0) {
    query = query.limit(Number(options.limit));
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingRecordFilesError(error)) return [];
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: String(row.id),
    module_id: String(row.module_id || ''),
    record_id: String(row.record_id || ''),
    file_url: String(row.file_url || ''),
    file_name: row.file_name ? String(row.file_name) : null,
    mime_type: row.mime_type ? String(row.mime_type) : null,
    file_type: row.file_type ? String(row.file_type) : null,
    asset_id: row.asset_id ? String(row.asset_id) : null,
    file_entry_id: row.file_entry_id ? String(row.file_entry_id) : null,
    source_module_id: row.source_module_id ? String(row.source_module_id) : null,
    source_record_id: row.source_record_id ? String(row.source_record_id) : null,
    source_record_title: row.source_record_title ? String(row.source_record_title) : null,
  }));
};

export const loadLegacyRecordFilesForRecord = async (
  moduleId: string,
  recordId: string,
): Promise<LegacyRecordFileRow[]> => {
  return loadLegacyRecordFiles({ moduleId, recordId });
};

export const syncLegacyRecordFilesToFileManager = async (
  moduleId: string,
  recordId: string,
  recordTitle: string,
): Promise<FileEntryRow[]> => {
  const rows = await loadLegacyRecordFilesForRecord(moduleId, recordId);
  if (rows.length === 0) return [];

  const entries: FileEntryRow[] = [];
  for (const row of rows) {
    const entry = await ensureOriginEntryForLegacyRecordFile(row, {
      recordTitle,
      subfolderKey: resolveLegacySubfolderKey(moduleId, {
        mimeType: row.mime_type,
        fileType: row.file_type,
      }),
    });
    if (entry) entries.push(entry);
  }
  return entries;
};

export const syncLegacyRecordFilesBatchToFileManager = async (limit = 200): Promise<FileEntryRow[]> => {
  const rows = await loadLegacyRecordFiles({ onlyUnsynced: true, limit });
  if (rows.length === 0) return [];

  const entries: FileEntryRow[] = [];
  for (const row of rows) {
    const entry = await ensureOriginEntryForLegacyRecordFile(row, {
      recordTitle: String(row.source_record_title || row.record_id || 'رکورد').trim() || String(row.record_id || 'رکورد'),
      subfolderKey: resolveLegacySubfolderKey(row.module_id, {
        mimeType: row.mime_type,
        fileType: row.file_type,
      }),
    });
    if (entry) entries.push(entry);
  }
  return entries;
};
