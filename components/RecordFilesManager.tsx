import React, { useEffect, useMemo, useState } from 'react';
import { App, Button, Checkbox, Image, Input, List, Modal, Select, Tag, Typography, Upload } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  DownloadOutlined,
  FileOutlined,
  PaperClipOutlined,
  PictureOutlined,
  ReloadOutlined,
  StarOutlined,
  UploadOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
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
import { parseNoteContent, serializeNoteContent } from '../utils/noteContent';
import { normalizeNoteScope } from '../utils/noteScope';
import { fetchAssigneeDirectory } from '../utils/referenceData';
import { fetchSessionBootstrap } from '../utils/sessionCache';
import { getRecordTitle } from '../utils/recordTitle';
import { parseProcessLinkMap } from '../utils/processTargets';

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
  source_module_id?: string | null;
  source_record_id?: string | null;
  source_record_title?: string | null;
  created_at?: string;
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

interface UploadedFileResult {
  url: string;
  fileType: RecordFileType;
  fileName: string;
  mimeType: string | null;
}

interface RecordFilesManagerProps {
  open: boolean;
  onClose: () => void;
  moduleId: string;
  recordId?: string;
  mainImage?: string | null;
  onMainImageChange?: (url: string | null) => void;
  canEdit?: boolean;
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

const safeFileName = (name: string): string => {
  const clean = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  return clean.slice(-120);
};

const getDisplayFileName = (item: Pick<RecordFileItem, 'file_name' | 'file_url'>): string => {
  const direct = String(item.file_name || '').trim();
  if (direct) return direct;
  const raw = String(item.file_url || '').split('?')[0].split('/').pop() || '';
  if (!raw) return 'file';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const NOTE_ATTACHMENT_ID_PREFIX = 'note-attachment:';
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
  canDelete,
  highlightFileId,
}) => {
  const { message: msg } = App.useApp();
  const [items, setItems] = useState<RecordFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingFileExtension, setPendingFileExtension] = useState('');
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [shareTargetOptions, setShareTargetOptions] = useState<ShareTargetOption[]>([]);
  const [shareTargetIds, setShareTargetIds] = useState<string[]>([]);
  const [shareInRelatedRecords, setShareInRelatedRecords] = useState(false);
  const canDeleteFiles = canDelete ?? canEdit;

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
    const seenUrls = new Set(baseItems.map((item) => String(item.file_url || '').trim()).filter(Boolean));
    const merged = [...baseItems];
    noteItems.forEach((item) => {
      const url = String(item.file_url || '').trim();
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      merged.push(item);
    });
    return merged;
  };

  const loadFiles = async (forceCheck = false) => {
    if (!recordId || !moduleId) return;
    setLoading(true);
    try {
      const tableExists = await detectRecordFilesTable(supabase, forceCheck);
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);

      if (!tableExists) {
        setRecordFilesEnabled(false);
        const legacyItems = await loadLegacyProductImages();
        setItems(await mergeItemsWithNoteAttachments(legacyItems));
        return;
      }

      const { data, error } = await supabase
        .from('record_files')
        .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, sort_order, source_module_id, source_record_id, source_record_title, created_at')
        .eq('module_id', moduleId)
        .eq('record_id', recordId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;

      recordFilesTableExistsCache = true;
      setRecordFilesTableAvailability(true);
      setRecordFilesEnabled(true);
      const baseItems = (data || []).map((row: any, idx: number) => ({
          id: String(row.id),
          module_id: String(row.module_id || moduleId),
          record_id: String(row.record_id || recordId),
          file_url: String(row.file_url || ''),
          file_type: normalizeType(row.file_type, row.mime_type, row.file_url),
          file_name: row.file_name ? String(row.file_name) : null,
          mime_type: row.mime_type ? String(row.mime_type) : null,
          sort_order: Number.isFinite(row.sort_order) ? row.sort_order : idx,
          source_module_id: row.source_module_id ? String(row.source_module_id) : null,
          source_record_id: row.source_record_id ? String(row.source_record_id) : null,
          source_record_title: row.source_record_title ? String(row.source_record_title) : null,
          created_at: row.created_at ? String(row.created_at) : undefined,
        }));
      setItems(await mergeItemsWithNoteAttachments(baseItems));
    } catch (error: any) {
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        const legacyItems = await loadLegacyProductImages().catch(() => []);
        setItems(await mergeItemsWithNoteAttachments(legacyItems));
        msg.warning('جدول record_files هنوز روی دیتابیس ایجاد نشده است. لطفا migration را اجرا کنید.');
      } else {
        console.warn('Could not load record files', error);
        msg.error('بارگذاری فایل‌ها ناموفق بود');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    void loadFiles(false);
  }, [open, moduleId, recordId]);

  useEffect(() => {
    if (!open || moduleId !== 'tasks') return;
    let active = true;
    const loadShareTargets = async () => {
      try {
        const directory = await fetchAssigneeDirectory(supabase);
        if (!active) return;
        setShareTargetOptions(
          (directory.users || [])
            .map((user) => ({
              value: String(user.id),
              label: String(user.display_name || user.full_name || user.email || user.mobile_1 || user.id),
            }))
            .filter((item) => item.value && item.label)
            .sort((a, b) => a.label.localeCompare(b.label, 'fa'))
        );
      } catch (error) {
        console.warn('Could not load task file share targets', error);
        if (active) setShareTargetOptions([]);
      }
    };
    void loadShareTargets();
    return () => {
      active = false;
    };
  }, [moduleId, open]);

  const buildStoredFileName = (file: File, desiredName: string) => {
    const ext = file.name.includes('.') ? String(file.name.split('.').pop() || '').trim() : '';
    const rawDesired = desiredName.trim() || file.name || 'file';
    const desiredBase = ext && rawDesired.toLowerCase().endsWith(`.${ext.toLowerCase()}`)
      ? rawDesired.slice(0, -1 * (ext.length + 1))
      : rawDesired;
    const cleanDesired = safeFileName(desiredBase || 'file');
    const finalBase = ext ? `${cleanDesired}.${ext}` : cleanDesired;
    return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${finalBase}`;
  };

  const uploadToStorage = async (file: File, desiredName: string): Promise<string> => {
    if (!recordId) throw new Error('Record id is required');
    const storedFileName = buildStoredFileName(file, desiredName);
    const filePath = `record_files/${moduleId}/${recordId}/${storedFileName}`;
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
        const moduleConfig = MODULES[target.moduleId];
        const { data: targetRecord } = await supabase
          .from(target.moduleId)
          .select('*')
          .eq('id', target.recordId)
          .maybeSingle();
        return {
          ...target,
          title: getRecordTitle(targetRecord || { id: target.recordId }, moduleConfig, { fallback: target.recordId }) || target.recordId,
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
    const payload = {
      module_id: scope.module_id,
      record_id: scope.record_id,
      content: serializeNoteContent('', [{
        name: file.fileName,
        url: file.url,
        mimeType: file.mimeType,
      }]),
      reply_to: null,
      mention_user_ids: targetIds,
      mention_role_ids: [],
      author_id: snapshot.user?.id || null,
      author_name: snapshot.profile?.full_name || null,
    };
    const { error } = await supabase.from('notes').insert([payload]);
    if (error) throw error;
  };

  const shareUploadedFileWithRelatedRecords = async (file: UploadedFileResult, shouldShare = shareInRelatedRecords) => {
    if (!shouldShare || moduleId !== 'tasks' || !recordId) return 0;
    if (!recordFilesEnabled) return 0;
    const targets = await resolveTaskRelatedTargets();
    if (targets.length === 0) return 0;
    const sourceTitle = file.fileName || pendingFileName || 'فعالیت';
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

  const uploadFile = async (file: File, desiredName: string): Promise<UploadedFileResult | null> => {
    if (!recordId) {
      msg.warning('ابتدا رکورد را ذخیره کنید');
      return null;
    }

    const type = getFileType(file);
    try {
      let useLegacy = !recordFilesEnabled || recordFilesTableExistsCache === false;
      if (useLegacy) {
        const tableExists = await detectRecordFilesTable(supabase, true);
        recordFilesTableExistsCache = tableExists;
        setRecordFilesEnabled(tableExists);
        useLegacy = !tableExists;
      }

      if (useLegacy && !(moduleId === 'products' && type === 'image')) {
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
            created_at: data.created_at ? String(data.created_at) : undefined,
          },
        ]);
        if (!mainImage && onMainImageChange) onMainImageChange(url);
        msg.success('فایل اضافه شد');
        return {
          url,
          fileType: 'image',
          fileName: desiredName,
          mimeType: file.type || null,
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

      setItems((prev) => [
        ...prev,
        {
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
          created_at: data.created_at ? String(data.created_at) : undefined,
        },
      ]);

      if (!mainImage && onMainImageChange) onMainImageChange(url);
      msg.success('فایل اضافه شد');
      return {
        url,
        fileType: type,
        fileName: desiredName,
        mimeType: file.type || null,
      };
      msg.success('فایل اضافه شد');
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
      if (!recordFilesEnabled || recordFilesTableExistsCache === false) {
        if (moduleId !== 'products') return;
        const { error } = await supabase.from('product_images').delete().eq('id', fileId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('record_files').delete().eq('id', fileId);
        if (error) throw error;
      }

      const nextItems = items.filter((it) => it.id !== fileId);
      setItems(nextItems);
      if (target?.file_url === mainImage) {
        onMainImageChange?.(nextItems[0]?.file_url || null);
      }
      msg.success('فایل حذف شد');
    } catch (error) {
      console.warn('Delete file failed', error);
      msg.error('حذف فایل ناموفق بود');
    }
  };

  const moveWithinType = async (fileType: 'image' | 'video', index: number, direction: -1 | 1) => {
    const typedItems = fileType === 'image' ? imageItems : videoItems;
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= typedItems.length) return;

    const current = typedItems[index];
    const target = typedItems[nextIndex];
    if (isSyntheticNoteAttachmentId(current?.id) || isSyntheticNoteAttachmentId(target?.id)) {
      msg.warning('ترتیب پیوست‌های یادداشت از این بخش قابل تغییر نیست');
      return;
    }
    const swappedA = { ...current, sort_order: target.sort_order };
    const swappedB = { ...target, sort_order: current.sort_order };
    const previous = items;
    setItems(previous.map((it) => (it.id === swappedA.id ? swappedA : it.id === swappedB.id ? swappedB : it)));

    try {
      if (!recordFilesEnabled || recordFilesTableExistsCache === false) {
        if (moduleId !== 'products' || fileType !== 'image') return;
        await Promise.all([
          supabase.from('product_images').update({ sort_order: swappedA.sort_order }).eq('id', swappedA.id),
          supabase.from('product_images').update({ sort_order: swappedB.sort_order }).eq('id', swappedB.id),
        ]);
      } else {
        await Promise.all([
          supabase.from('record_files').update({ sort_order: swappedA.sort_order }).eq('id', swappedA.id),
          supabase.from('record_files').update({ sort_order: swappedB.sort_order }).eq('id', swappedB.id),
        ]);
      }
    } catch {
      setItems(previous);
      msg.error('به‌روزرسانی ترتیب ناموفق بود');
    }
  };

  const downloadFile = (item: RecordFileItem) => {
    const fileLabel = getDisplayFileName(item);
    const link = document.createElement('a');
    link.href = item.file_url;
    link.download = fileLabel;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMediaCard = (item: RecordFileItem, index: number, fileType: 'image' | 'video', total: number) => {
    const isMain = mainImage === item.file_url;
    const isHighlighted = highlightFileId && highlightFileId === item.id;
    const isNoteAttachment = isSyntheticNoteAttachmentId(item.id);
    const isSharedFromReference = Boolean(item.source_module_id && item.source_record_id);
    const fileLabel = getDisplayFileName(item);
    return (
      <div key={item.id} className={`relative group border rounded-lg p-1 ${isHighlighted ? 'border-leather-500 ring-2 ring-leather-200' : (isSharedFromReference ? 'border-sky-300 bg-sky-50/30' : 'border-gray-100')}`}>
        <div className="h-40 overflow-hidden rounded">
          {item.file_type === 'video' ? (
            <video src={item.file_url} controls className="w-full h-full object-cover rounded" preload="metadata" />
          ) : (
            <Image
              src={item.file_url}
              className="w-full h-full object-cover rounded"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              preview={{ src: item.file_url }}
            />
          )}
        </div>

        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <Button size="small" icon={<ArrowUpOutlined />} onClick={() => moveWithinType(fileType, index, -1)} disabled={!canEdit || index === 0 || isNoteAttachment} />
          <Button size="small" icon={<ArrowDownOutlined />} onClick={() => moveWithinType(fileType, index, 1)} disabled={!canEdit || index === total - 1 || isNoteAttachment} />
        </div>

        <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <Button size="small" icon={<StarOutlined />} onClick={() => onMainImageChange?.(item.file_url)} disabled={!canEdit || isNoteAttachment}>فایل اصلی</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(item.id)} disabled={!canDeleteFiles || isNoteAttachment}>حذف</Button>
        </div>

        <div className="absolute top-1 left-1 flex items-center gap-1">
          {isMain && <Tag color="gold">اصلی</Tag>}
          {item.file_type === 'video' ? <Tag icon={<VideoCameraOutlined />}>فیلم</Tag> : <Tag icon={<PictureOutlined />}>عکس</Tag>}
          {isNoteAttachment ? <Tag color="blue">یادداشت</Tag> : null}
        </div>
        <div className="px-1 pt-2">
          <div className="text-xs text-gray-600 truncate" title={fileLabel}>
            {fileLabel}
          </div>
          {isSharedFromReference ? (
            <div className="mt-1 text-[11px] text-sky-700">
              رکورد مرجع:{' '}
              <a href={`/${item.source_module_id}/${item.source_record_id}`} className="text-sky-700 hover:underline">
                {item.source_record_title || item.source_record_id}
              </a>
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <Modal title="مدیریت فایل‌ها" open={open} onCancel={onClose} footer={null} destroyOnHidden zIndex={13000} width={950}>
      {!recordFilesEnabled && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-center justify-between gap-2">
          <span>حالت سازگاری فعال است: جدول `record_files` روی دیتابیس ایجاد نشده. فعلا فقط عکس‌های محصول از `product_images` خوانده می‌شود.</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadFiles(true)}>بررسی مجدد</Button>
        </div>
      )}

      <div className="mt-2">
        <div className="mb-2 text-sm font-bold text-gray-700">عکس‌ها ({imageItems.length})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {imageItems.map((item, idx) => renderMediaCard(item, idx, 'image', imageItems.length))}
          {imageItems.length === 0 && <div className="text-xs text-gray-400 col-span-full py-4">عکسی ثبت نشده است.</div>}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-bold text-gray-700">فیلم‌ها ({videoItems.length})</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {videoItems.map((item, idx) => renderMediaCard(item, idx, 'video', videoItems.length))}
          {videoItems.length === 0 && <div className="text-xs text-gray-400 col-span-full py-4">فیلمی ثبت نشده است.</div>}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 text-sm font-bold text-gray-700">فایل‌ها ({documentItems.length})</div>
        <List
          locale={{ emptyText: 'فایلی ثبت نشده است.' }}
          dataSource={documentItems}
          renderItem={(item) => {
            const fileLabel = getDisplayFileName(item);
            const isMain = mainImage === item.file_url;
            const isHighlighted = highlightFileId && highlightFileId === item.id;
            const isNoteAttachment = isSyntheticNoteAttachmentId(item.id);
            const isSharedFromReference = Boolean(item.source_module_id && item.source_record_id);
            return (
              <List.Item
                className={`rounded-lg px-3 ${isHighlighted ? 'bg-leather-50 border border-leather-200' : (isSharedFromReference ? 'border border-sky-200 bg-sky-50/30' : '')}`}
                actions={[
                  <Button
                    key={`main-${item.id}`}
                    size="small"
                    icon={<StarOutlined />}
                    onClick={() => onMainImageChange?.(item.file_url)}
                    disabled={!canEdit || isNoteAttachment}
                  >
                    فایل اصلی
                  </Button>,
                  <Button key={`download-${item.id}`} size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(item)}>دانلود</Button>,
                  <Button key={`delete-${item.id}`} size="small" danger icon={<DeleteOutlined />} disabled={!canDeleteFiles || isNoteAttachment} onClick={() => handleDelete(item.id)}>حذف</Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<FileOutlined className="text-gray-500" />}
                  title={(
                    <span className="flex items-center gap-2 text-sm">
                      <span>{fileLabel}</span>
                      {isMain ? <Tag color="gold" className="!m-0">اصلی</Tag> : null}
                    </span>
                  )}
                  description={<span className="text-xs text-gray-500">{isNoteAttachment ? `پیوست یادداشت${item.mime_type ? ` • ${item.mime_type}` : ''}` : (item.mime_type || 'فایل ضمیمه')}</span>}
                />
              </List.Item>
            );
          }}
        />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <Upload showUploadList={false} beforeUpload={handleBeforeUpload} disabled={!recordId || !canEdit} fileList={[]}>
          <Button icon={<UploadOutlined />}>افزودن فایل (عکس، فیلم، فایل)</Button>
        </Upload>
        <div className="text-xs text-gray-400 flex items-center gap-2">
          <PaperClipOutlined />
          <span>{items.length} فایل</span>
        </div>
      </div>

      {loading && <div className="text-xs text-gray-500 mt-2">در حال بارگذاری...</div>}

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
    </Modal>
  );
};

export default RecordFilesManager;



