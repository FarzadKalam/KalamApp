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
import { fetchCurrentUserRolePermissions, resolveFilesAccessPermissions } from '../utils/permissions';
import { detectFileManagerTables } from '../utils/fileManagerService';
import { buildFileManagerTree, type FileManagerListItem, type FileManagerTreeResult } from '../utils/fileManagerQueries';
import FileManagerBrowser from '../components/files/FileManagerBrowser';

type GalleryFileItem = FileManagerListItem;

let recordFilesTableExistsCache: boolean | null = getRecordFilesTableAvailabilityCache();

const FilesGalleryPage: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<GalleryFileItem[]>([]);
  const [tree, setTree] = useState<FileManagerTreeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [activeFolderKey, setActiveFolderKey] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(60);
  const [recordFilesEnabled, setRecordFilesEnabled] = useState<boolean>(recordFilesTableExistsCache !== false);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [canViewGallery, setCanViewGallery] = useState(true);
  const [canViewRecordFilesManager, setCanViewRecordFilesManager] = useState(true);
  const [fileManagerEnabled, setFileManagerEnabled] = useState<boolean>(false);

  const resolveScopeFromFolderKey = (folderKey: string) => {
    const normalized = String(folderKey || '').trim();
    if (normalized.startsWith('record:')) {
      const rest = normalized.slice('record:'.length);
      const [moduleId, ...recordParts] = rest.split(':');
      return { scope: 'record' as const, moduleId, recordId: recordParts.join(':') };
    }
    if (normalized.startsWith('module:')) {
      return { scope: 'module' as const, moduleId: normalized.slice('module:'.length), recordId: null };
    }
    return {
      scope: moduleFilter !== 'all' ? 'module' as const : 'global' as const,
      moduleId: moduleFilter !== 'all' ? moduleFilter : null,
      recordId: null,
    };
  };

  const loadFiles = async (forceCheck = false) => {
    setLoading(true);
    try {
      const fileManagerTablesExist = await detectFileManagerTables(supabase, forceCheck);
      setFileManagerEnabled(fileManagerTablesExist);
      const tableExists = await detectRecordFilesTable(supabase, forceCheck);
      recordFilesTableExistsCache = tableExists;
      setRecordFilesEnabled(tableExists);
      const resolvedScope = resolveScopeFromFolderKey(activeFolderKey);

      const nextTree = await buildFileManagerTree({
        scope: resolvedScope.scope,
        page,
        pageSize,
        folderKey: activeFolderKey,
        moduleId: resolvedScope.moduleId,
        recordId: resolvedScope.recordId,
        search: searchTerm,
        fileTypes: typeFilter === 'all' ? undefined : [typeFilter],
        moduleTitleMap,
      });
      setTree(nextTree);
      setItems(nextTree.allItems);
      if (nextTree.activeFolderKey !== activeFolderKey) setActiveFolderKey(nextTree.activeFolderKey);

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
    if (permissionsLoading || !canViewGallery) return;
    void loadFiles(false);
  }, [activeFolderKey, page, pageSize, searchTerm, typeFilter, moduleFilter]);

  const moduleOptions = useMemo(() => {
    const used = Array.from(new Set(
      (tree?.folders || [])
        .map((folder) => String(folder.moduleId || '').trim())
        .filter(Boolean)
    ));
    return [
      { label: 'همه بخش‌ها', value: 'all' },
      ...used.map((moduleId) => ({ label: MODULES[moduleId]?.titles?.fa || moduleId, value: moduleId })),
    ];
  }, [tree?.folders]);

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
              count={tree?.allItems.length || items.length}
              overflowCount={9999}
              style={{ backgroundColor: '#f0f0f0', color: '#666', boxShadow: 'none' }}
            />
          </div>
          <Button className="rounded-xl" onClick={() => void loadFiles(true)} loading={loading}>بروزرسانی</Button>
        </div>

        <div className="rounded-[2rem] border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-800 dark:bg-[#1a1a1a] md:p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select
              className="min-w-[220px]"
              options={moduleOptions}
              value={moduleFilter}
              onChange={(value) => {
                const nextModule = String(value);
                setModuleFilter(nextModule);
                setActiveFolderKey(nextModule === 'all' ? 'all' : `module:${nextModule}`);
                setPage(1);
              }}
            />
            <Input
              className="min-w-[240px] max-w-[360px]"
              allowClear
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              placeholder="جستجو در نام فایل، محصول یا بخش..."
              prefix={<SearchOutlined className="text-gray-400" />}
            />
            <Segmented
              value={typeFilter}
              onChange={(value) => {
                setTypeFilter(value as 'all' | 'image' | 'video' | 'file');
                setPage(1);
              }}
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
      ) : (tree?.totalItems || 0) === 0 && (tree?.folders.length || 0) <= 1 ? (
        <div className="rounded-[2rem] border border-gray-200 bg-white p-10 dark:border-gray-800 dark:bg-[#1a1a1a]">
          <Empty description="فایلی ثبت نشده است" />
        </div>
      ) : (
        <FileManagerBrowser
          title="فایل‌ها"
          items={tree?.items || []}
          folders={tree?.folders || []}
          activeFolderKey={activeFolderKey}
          onFolderChange={(key) => {
            const normalizedKey = String(key);
            setActiveFolderKey(normalizedKey);
            const nextScope = resolveScopeFromFolderKey(normalizedKey);
            if (nextScope.scope === 'module' && nextScope.moduleId && MODULES[nextScope.moduleId]) {
              setModuleFilter(nextScope.moduleId);
            } else if (nextScope.scope === 'record' && nextScope.moduleId && MODULES[nextScope.moduleId]) {
              setModuleFilter(nextScope.moduleId);
            } else if (normalizedKey === 'all') {
              setModuleFilter('all');
            }
            setPage(1);
          }}
          onOpenItem={openRecordGallery}
          onRefresh={() => void loadFiles(true)}
          recordTitleMap={tree?.recordTitleMap || {}}
          moduleTitleMap={moduleTitleMap}
          selectionItems={tree?.allItems || []}
          page={page}
          pageSize={pageSize}
          totalItems={tree?.totalItems || 0}
          onPageChange={(nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
          }}
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
