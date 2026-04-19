import React, { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Empty, Input, Select, Segmented, Spin } from 'antd';
import { ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  detectRecordFilesTable,
  getRecordFilesTableAvailabilityCache,
  setRecordFilesTableAvailability,
} from '../utils/recordFilesAvailability';
import { getRecordTitle } from '../utils/recordTitle';
import { fetchCurrentUserRolePermissions, resolveFilesAccessPermissions } from '../utils/permissions';
import { detectFileManagerTables } from '../utils/fileManagerService';
import { loadGalleryFileItems, type FileManagerListItem } from '../utils/fileManagerQueries';
import FileManagerBrowser from '../components/files/FileManagerBrowser';

type GalleryFileItem = FileManagerListItem;

const getDisplayFileName = (item: Pick<GalleryFileItem, 'file_name' | 'file_url'>): string => {
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

let recordFilesTableExistsCache: boolean | null = getRecordFilesTableAvailabilityCache();

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
  const navigate = useNavigate();

  const [items, setItems] = useState<GalleryFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [recordTitleMap, setRecordTitleMap] = useState<Record<string, string>>({});
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canViewGallery, setCanViewGallery] = useState(true);
  const [canViewRecordFilesManager, setCanViewRecordFilesManager] = useState(true);
  const [fileManagerEnabled, setFileManagerEnabled] = useState<boolean>(false);

  const loadFiles = async (forceCheck = false) => {
    setLoading(true);
    try {
      const fileManagerTablesExist = await detectFileManagerTables(supabase, forceCheck);
      setFileManagerEnabled(fileManagerTablesExist);
      const tableExists = await detectRecordFilesTable(supabase, forceCheck);
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);

      const nextItems = await loadGalleryFileItems();
      setItems(nextItems);

      if (tableExists) {
        recordFilesTableExistsCache = true;
        setRecordFilesTableAvailability(true);
        setRecordFilesEnabled(true);
      }
    } catch (error: any) {
      console.warn('Could not load gallery files', error);
      setItems([]);
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

  const openRecordGallery = (item: { module_id?: string; record_id?: string; id: string }) => {
    if (!item.module_id || !item.record_id) return;
    if (canViewRecordFilesManager) {
      navigate(`/${item.module_id}/${item.record_id}?gallery=1&fileId=${item.id}`);
      return;
    }
    navigate(`/${item.module_id}/${item.record_id}`);
  };

  const moduleTitleMap = useMemo(() => {
    return Object.keys(MODULES).reduce<Record<string, string>>((acc, moduleId) => {
      acc[moduleId] = MODULES[moduleId]?.titles?.fa || moduleId;
      return acc;
    }, {});
  }, []);

  const browserFolders = useMemo(() => {
    const grouped = new Map<string, number>();
    filtered.forEach((item) => {
      const normalizedModuleId = String(item.module_id || '').trim();
      if (!normalizedModuleId) return;
      grouped.set(normalizedModuleId, (grouped.get(normalizedModuleId) || 0) + 1);
    });
    return [
      { key: 'all', label: 'همه فایل‌ها', count: filtered.length, isSystem: true },
      ...Array.from(grouped.entries()).map(([moduleId, count]) => ({
        key: moduleId,
        parentKey: 'all',
        label: moduleTitleMap[moduleId] || moduleId,
        count,
        isSystem: true,
      })),
    ];
  }, [filtered, moduleTitleMap]);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      {permissionsLoading ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Spin />
        </div>
      ) : !canViewGallery ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Empty description="دسترسی مشاهده مدیریت فایل‌ها برای این جایگاه فعال نیست." />
        </div>
      ) : (
        <>
      {!recordFilesEnabled && !fileManagerEnabled && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-100">
          <span>جدول `record_files` هنوز ایجاد نشده. فعلا فقط تصاویر محصول (legacy) نمایش داده می‌شود.</span>
          <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadFiles(true)}>بررسی مجدد</Button>
        </div>
      )}

      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-2xl font-black text-gray-800 dark:text-white m-0 flex items-center gap-2 min-w-0">
              <span className="w-2 h-8 bg-leather-500 rounded-full inline-block shrink-0"></span>
              <span className="truncate">مدیریت فایل‌ها</span>
            </h1>
            <Badge
              count={filtered.length}
              overflowCount={9999}
              style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
          </div>
          <Button className="rounded-xl" onClick={() => void loadFiles(true)} loading={loading}>بروزرسانی</Button>
        </div>

        <div className="rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a] md:p-4">
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
          </div>
        </div>
      </div>

      {loading ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 text-center dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Spin />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Empty description="فایلی ثبت نشده است" />
        </div>
      ) : (
        <FileManagerBrowser
          title="فایل‌ها"
          items={filtered}
          folders={browserFolders}
          activeFolderKey={moduleFilter}
          onFolderChange={(key) => setModuleFilter(String(key))}
          onOpenItem={openRecordGallery}
          onRefresh={() => void loadFiles(true)}
          recordTitleMap={recordTitleMap}
          moduleTitleMap={moduleTitleMap}
          highlightItemId={null}
          canDelete={false}
          canShare={false}
          canEdit={false}
        />
      )}
        </>
      )}
    </div>
  );
};

export default FilesGalleryPage;
