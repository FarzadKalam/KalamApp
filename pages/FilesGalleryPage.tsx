import React, { useEffect, useMemo, useState } from 'react';
import { App, Badge, Button, Card, Empty, Input, Select, Segmented, Spin, Tag } from 'antd';
import { AppstoreOutlined, FileOutlined, PictureOutlined, ReloadOutlined, SearchOutlined, UnorderedListOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  detectRecordFilesTable,
  getRecordFilesTableAvailabilityCache,
  isMissingRecordFilesError,
  setRecordFilesTableAvailability,
} from '../utils/recordFilesAvailability';
import { getRecordTitle } from '../utils/recordTitle';
import { fetchCurrentUserRolePermissions, resolveFilesAccessPermissions } from '../utils/permissions';

type GalleryFileType = 'image' | 'video' | 'file';
type GalleryViewMode = 'list' | 'grid';

type GalleryFileItem = {
  id: string;
  module_id: string;
  record_id: string;
  file_url: string;
  file_type: GalleryFileType;
  file_name: string | null;
  mime_type: string | null;
  created_at: string | null;
};

let recordFilesTableExistsCache: boolean | null = getRecordFilesTableAvailabilityCache();

const getDisplayFileName = (item: Pick<GalleryFileItem, 'file_name' | 'file_url'>): string => {
  const direct = String(item.file_name || '').trim();
  if (direct) return direct;
  const raw = String(item.file_url || '').split('?')[0].split('/').pop() || '';
  if (!raw) return '-';
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};

const guessTypeFromUrl = (url?: string | null): GalleryFileType => {
  const value = String(url || '').toLowerCase();
  if (/\.(mp4|webm|ogg|mov|m4v|avi|mkv)(\?|$)/i.test(value)) return 'video';
  if (/\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif)(\?|$)/i.test(value)) return 'image';
  return 'file';
};

const normalizeType = (rawType: unknown, mimeType?: string | null, fileUrl?: string | null): GalleryFileType => {
  const value = String(rawType || '').toLowerCase();
  if (value === 'image' || value === 'video' || value === 'file') return value;

  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';

  return guessTypeFromUrl(fileUrl);
};

const buildSelectFields = (moduleId: string): string => {
  const moduleConfig = MODULES[moduleId];
  const fieldKeys = (moduleConfig?.fields || []).map((f: any) => String(f.key || ''));
  const preferred = ['name', 'title', 'system_code', 'manual_code', 'business_name', 'full_name'];
  const keyField = (moduleConfig?.fields || []).find((f: any) => f.isKey)?.key;
  const inferred = fieldKeys.filter((key) => /name|title|code|number|subject/i.test(key));
  const keys = Array.from(new Set(['id', ...preferred, ...(keyField ? [String(keyField)] : []), ...inferred]));
  return keys.filter((k) => fieldKeys.includes(k) || k === 'id').join(', ');
};

const FilesGalleryPage: React.FC = () => {
  const { message: msg } = App.useApp();
  const navigate = useNavigate();

  const [items, setItems] = useState<GalleryFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<GalleryViewMode>('list');
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canViewGallery, setCanViewGallery] = useState(true);
  const [canViewRecordFilesManager, setCanViewRecordFilesManager] = useState(true);

  const loadLegacyProductImages = async (): Promise<GalleryFileItem[]> => {
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
      file_type: 'image',
      file_name: null,
      mime_type: null,
      created_at: row.created_at ? String(row.created_at) : null,
    }));
  };

  const loadFiles = async (forceCheck = false) => {
    setLoading(true);
    try {
      const tableExists = await detectRecordFilesTable(supabase, forceCheck);
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);

      if (!tableExists) {
        setRecordFilesEnabled(false);
        setItems(await loadLegacyProductImages());
        return;
      }

      const { data, error } = await supabase
        .from('record_files')
        .select('id, module_id, record_id, file_url, file_type, file_name, mime_type, created_at')
        .order('created_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      recordFilesTableExistsCache = true;
      setRecordFilesTableAvailability(true);
      setRecordFilesEnabled(true);
      setItems(
        (data || []).map((row: any) => ({
          id: String(row.id),
          module_id: String(row.module_id || ''),
          record_id: String(row.record_id || ''),
          file_url: String(row.file_url || ''),
          file_type: normalizeType(row.file_type, row.mime_type, row.file_url),
          file_name: row.file_name ? String(row.file_name) : null,
          mime_type: row.mime_type ? String(row.mime_type) : null,
          created_at: row.created_at ? String(row.created_at) : null,
        }))
      );
    } catch (error: any) {
      if (isMissingRecordFilesError(error)) {
        recordFilesTableExistsCache = false;
        setRecordFilesTableAvailability(false);
        setRecordFilesEnabled(false);
        setItems(await loadLegacyProductImages().catch(() => []));
        msg.warning('جدول record_files هنوز روی دیتابیس ایجاد نشده است. لطفا migration را اجرا کنید.');
      } else {
        console.warn('Could not load gallery files', error);
        setItems([]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadPermissions = async () => {
      setPermissionsLoading(true);
      const rolePermissions = await fetchCurrentUserRolePermissions(supabase);
      const filePerms = resolveFilesAccessPermissions(rolePermissions || {});
      if (cancelled) return;
      setCanViewGallery(filePerms.canViewGallery);
      setCanViewRecordFilesManager(filePerms.canViewRecordFilesManager);
      setPermissionsLoading(false);
    };
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (permissionsLoading || !canViewGallery) return;
    void loadFiles(false);
  }, [permissionsLoading, canViewGallery]);

  useEffect(() => {
    let cancelled = false;

    const loadTitles = async () => {
      const byModule = new Map<string, Set<string>>();

      items.forEach((item) => {
        if (!item.module_id || !item.record_id || !MODULES[item.module_id]) return;
        if (!byModule.has(item.module_id)) byModule.set(item.module_id, new Set<string>());
        byModule.get(item.module_id)?.add(item.record_id);
      });

      const nextMap: Record<string, string> = {};

      for (const [moduleId, idsSet] of byModule.entries()) {
        const ids = Array.from(idsSet);
        if (!ids.length) continue;

        const selectFields = buildSelectFields(moduleId);
        if (!selectFields) continue;

        const { data } = await supabase.from(moduleId).select(selectFields).in('id', ids);

        (data || []).forEach((row: any) => {
          nextMap[`${moduleId}:${String(row.id)}`] = getRecordTitle(row, MODULES[moduleId], { fallback: String(row.id || '-') });
        });
      }

      if (!cancelled) setRecordTitleMap(nextMap);
    };

    void loadTitles();

    return () => {
      cancelled = true;
    };
  }, [items]);

  const moduleOptions = useMemo(() => {
    const used = Array.from(new Set(items.map((item) => item.module_id))).filter(Boolean);
    return [
      { label: 'همه بخش‌ها', value: 'all' },
      ...used.map((moduleId) => ({ label: MODULES[moduleId]?.titles?.fa || moduleId, value: moduleId })),
    ];
  }, [items]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return items.filter((item) => {
      if (moduleFilter !== 'all' && item.module_id !== moduleFilter) return false;
      if (typeFilter !== 'all' && item.file_type !== typeFilter) return false;
      if (query) {
        const moduleTitle = MODULES[item.module_id]?.titles?.fa || item.module_id;
        const recordTitle = recordTitleMap[`${item.module_id}:${item.record_id}`] || item.record_id;
        const displayFileName = getDisplayFileName(item);
        const haystack = `${displayFileName} ${item.file_name || ''} ${item.mime_type || ''} ${moduleTitle} ${recordTitle}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [items, moduleFilter, typeFilter, searchTerm, recordTitleMap]);

  const openRecordGallery = (item: GalleryFileItem) => {
    if (!item.module_id || !item.record_id) return;
    if (canViewRecordFilesManager) {
      navigate(`/${item.module_id}/${item.record_id}?gallery=1&fileId=${item.id}`);
      return;
    }
    navigate(`/${item.module_id}/${item.record_id}`);
  };

  const renderPreview = (item: GalleryFileItem, compact = false) => {
    const mediaClass = compact
      ? 'w-full h-20 object-cover rounded-xl border border-gray-100'
      : 'w-full h-44 object-cover rounded-xl border border-gray-100';

    if (item.file_type === 'image') {
      return <img src={item.file_url} alt={item.file_name || 'image'} className={mediaClass} />;
    }

    if (item.file_type === 'video') {
      return <video src={item.file_url} controls className={mediaClass} preload="metadata" />;
    }

    return (
      <div className={`${compact ? 'h-20' : 'h-44'} rounded-xl border border-gray-200 bg-gray-50 flex flex-col items-center justify-center px-3`}>
        <FileOutlined className="text-lg text-gray-500 mb-1" />
        <span className="text-xs text-gray-600 truncate max-w-full w-full text-center">{item.file_name || 'فایل'}</span>
      </div>
    );
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {permissionsLoading ? (
        <div className="bg-white rounded-[2rem] border border-gray-200 p-10 text-center">
          <Spin />
        </div>
      ) : !canViewGallery ? (
        <div className="bg-white rounded-[2rem] border border-gray-200 p-10">
          <Empty description="دسترسی مشاهده گالری فایل‌ها برای این جایگاه فعال نیست." />
        </div>
      ) : (
        <>
      {!recordFilesEnabled && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 flex items-center justify-between gap-2">
          <span>جدول `record_files` هنوز ایجاد نشده. فعلا فقط تصاویر محصول (legacy) نمایش داده می‌شود.</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadFiles(true)}>بررسی مجدد</Button>
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
              <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
              <span className="truncate">گالری فایل‌ها</span>
            </h1>
            <Badge
              count={filtered.length}
              overflowCount={9999}
              style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
          </div>
          <Button className="rounded-xl" onClick={() => void loadFiles(true)} loading={loading}>بروزرسانی</Button>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] shadow-sm border border-gray-200 dark:border-gray-800 p-3 md:p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select className="min-w-[220px]" options={moduleOptions} value={moduleFilter} onChange={(value) => setModuleFilter(String(value))} />
            <Input
              className="min-w-[240px] max-w-[360px]"
              allowClear
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در نام فایل، محصول یا بخش..."
              prefix={<SearchOutlined className="text-gray-400" />}
            />
            <Segmented
              value={typeFilter}
              onChange={(value) => setTypeFilter(value as 'all' | 'image' | 'video' | 'file')}
              options={[
                { label: 'همه', value: 'all' },
                { label: 'عکس', value: 'image' },
                { label: 'فیلم', value: 'video' },
                { label: 'فایل', value: 'file' },
              ]}
            />
            <Button
              className="rounded-xl"
              icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
              onClick={() => setViewMode((prev) => (prev === 'list' ? 'grid' : 'list'))}
            >
              {viewMode === 'list' ? 'نمایش گرید' : 'نمایش لیستی'}
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-[2rem] border border-gray-200 p-10 text-center">
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-[2rem] border border-gray-200 p-10">
          <Empty description="فایلی ثبت نشده است" />
        </div>
      ) : (
        <div className={viewMode === 'list' ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-3 gap-4'}>
          {filtered.map((item) => {
            const moduleTitle = MODULES[item.module_id]?.titles?.fa || item.module_id;
            const recordTitle = recordTitleMap[`${item.module_id}:${item.record_id}`] || item.record_id;
            const displayFileName = getDisplayFileName(item);
            const isListView = viewMode === 'list';

            const fileTypeTag = item.file_type === 'image'
              ? <Tag icon={<PictureOutlined />} color="blue">عکس</Tag>
              : item.file_type === 'video'
                ? <Tag icon={<VideoCameraOutlined />} color="purple">فیلم</Tag>
                : <Tag icon={<FileOutlined />} color="default">فایل</Tag>;

            return (
              <Card
                key={item.id}
                hoverable
                className="rounded-2xl"
                styles={{ body: { padding: isListView ? 10 : 12 } }}
                onClick={() => openRecordGallery(item)}
              >
                {isListView ? (
                  <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-3 items-center">
                    <div className="w-full md:w-[220px] shrink-0">
                      {renderPreview(item, true)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {fileTypeTag}
                        <span className="text-xs text-gray-500">{moduleTitle}</span>
                      </div>
                      <div className="text-base font-bold text-gray-700 mt-1 truncate">{recordTitle}</div>
                      <div className="text-xs text-gray-500 mt-1 truncate" title={displayFileName}>
                        نام فایل: {displayFileName}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {renderPreview(item)}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      {fileTypeTag}
                      <span className="text-xs text-gray-500">{moduleTitle}</span>
                    </div>
                    <div className="text-sm font-bold text-gray-700 mt-1 truncate">{recordTitle}</div>
                    <div className="text-xs text-gray-500 mt-1 truncate" title={displayFileName}>
                      نام فایل: {displayFileName}
                    </div>
                  </>
                )}
              </Card>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default FilesGalleryPage;

