import React, { useEffect, useMemo, useRef, useState } from 'react';
import { App, Badge, Button, Empty, Input, Select, Spin } from 'antd';
import {
  AppstoreOutlined,
  ArrowLeftOutlined,
  CheckSquareOutlined,
  FileTextOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MODULES } from '../moduleRegistry';
import { supabase } from '../supabaseClient';
import {
  buildGlobalSearchModules,
  isGlobalSearchQueryReady,
  searchGlobalRecords,
  type GlobalSearchGroup,
  type GlobalSearchModule,
} from '../utils/globalSearch';
import { fetchCurrentUserRoleContext, type PermissionMap } from '../utils/permissions';

const PAGE_LIMIT_PER_MODULE = 10;

const getModuleIcon = (moduleId: string) => {
  if (moduleId === 'customers' || moduleId === 'suppliers' || moduleId === 'employees') return <TeamOutlined />;
  if (moduleId === 'tasks' || moduleId === 'attendance_logs') return <CheckSquareOutlined />;
  if (moduleId === 'invoices' || moduleId === 'purchase_invoices' || moduleId === 'secretariat_documents') return <FileTextOutlined />;
  return <AppstoreOutlined />;
};

const GlobalSearchPage: React.FC = () => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = String(searchParams.get('q') || '').trim();
  const selectedModuleId = String(searchParams.get('module') || 'all').trim() || 'all';

  const [inputValue, setInputValue] = useState(query);
  const [permissions, setPermissions] = useState<PermissionMap>({});
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [searchCacheNamespace, setSearchCacheNamespace] = useState('');
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMoreModuleId, setLoadingMoreModuleId] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setInputValue(query);
  }, [query]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('erp:breadcrumb', {
      detail: { moduleTitle: 'جستجو', moduleId: 'search', recordName: query || 'نتایج جستجو' },
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('erp:breadcrumb', { detail: null }));
    };
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const loadPermissions = async () => {
      const context = await fetchCurrentUserRoleContext(supabase);
      if (cancelled) return;
      const rolePermissions = (context.permissions || {}) as PermissionMap;
      setPermissions(rolePermissions);
      setSearchCacheNamespace(`${String(context.userId || '')}:${JSON.stringify(rolePermissions)}`);
      setPermissionsReady(true);
    };
    void loadPermissions();
    return () => {
      cancelled = true;
    };
  }, []);

  const searchableModules = useMemo(
    () => buildGlobalSearchModules(MODULES, permissions),
    [permissions]
  );

  const activeModules = useMemo(() => {
    if (selectedModuleId === 'all') return searchableModules;
    return searchableModules.filter((module) => module.id === selectedModuleId);
  }, [searchableModules, selectedModuleId]);

  const moduleOptions = useMemo(() => [
    { label: 'همه ماژول‌ها', value: 'all' },
    ...searchableModules.map((module) => ({ label: module.title, value: module.id })),
  ], [searchableModules]);

  const runSearch = async (nextQuery = query, modules: GlobalSearchModule[] = activeModules) => {
    const term = String(nextQuery || '').trim();
    if (!term || !permissionsReady || !isGlobalSearchQueryReady(term)) {
      searchAbortRef.current?.abort();
      searchAbortRef.current = null;
      setGroups([]);
      setLoading(false);
      return;
    }
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    const controller = new AbortController();
    searchAbortRef.current?.abort();
    searchAbortRef.current = controller;
    setLoading(true);
    try {
      const results = await searchGlobalRecords(supabase, MODULES, modules, {
        query: term,
        limitPerModule: PAGE_LIMIT_PER_MODULE,
        cacheNamespace: searchCacheNamespace,
        signal: controller.signal,
      });
      if (searchRequestRef.current !== requestId) return;
      setGroups(results);
    } catch (error) {
      if (String((error as any)?.name || '') === 'AbortError') return;
      console.warn('Global search page failed', error);
      if (searchRequestRef.current === requestId) {
        setGroups([]);
        message.error('جستجو با خطا روبرو شد.');
      }
    } finally {
      if (searchRequestRef.current === requestId) setLoading(false);
    }
  };

  useEffect(() => {
    if (!permissionsReady) return;
    void runSearch(query, activeModules);
  }, [query, permissionsReady, searchCacheNamespace, selectedModuleId, searchableModules.length]);

  useEffect(() => () => {
    searchAbortRef.current?.abort();
  }, []);

  const updateSearchParams = (nextQuery: string, nextModuleId = selectedModuleId) => {
    const params = new URLSearchParams();
    const normalizedQuery = String(nextQuery || '').trim();
    if (normalizedQuery) params.set('q', normalizedQuery);
    if (nextModuleId && nextModuleId !== 'all') params.set('module', nextModuleId);
    setSearchParams(params, { replace: false });
  };

  const handleLoadMore = async (group: GlobalSearchGroup) => {
    const module = searchableModules.find((item) => item.id === group.moduleId);
    if (!module || !query) return;
    setLoadingMoreModuleId(group.moduleId);
    try {
      const nextGroups = await searchGlobalRecords(supabase, MODULES, [module], {
        query,
        limitPerModule: PAGE_LIMIT_PER_MODULE,
        offset: group.items.length,
        forceRefresh: true,
        cacheNamespace: searchCacheNamespace,
      });
      const nextGroup = nextGroups[0];
      if (!nextGroup) {
        setGroups((current) => current.map((item) => item.moduleId === group.moduleId ? { ...item, hasMore: false } : item));
        return;
      }
      setGroups((current) => current.map((item) => (
        item.moduleId === group.moduleId
          ? { ...item, items: [...item.items, ...nextGroup.items], hasMore: nextGroup.hasMore }
          : item
      )));
    } catch (error) {
      console.warn('Global search load more failed', error);
      message.error('بارگذاری نتایج بیشتر انجام نشد.');
    } finally {
      setLoadingMoreModuleId(null);
    }
  };

  const totalVisibleResults = groups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="mx-auto max-w-[1500px] px-4 py-5 md:px-6">
      <div className="mb-5 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-leather-50 text-leather-600 dark:bg-leather-500/10 dark:text-leather-300">
              <SearchOutlined />
            </span>
            <div className="min-w-0">
              <h1 className="m-0 truncate text-xl font-black text-gray-800 dark:text-white">نتایج جستجو</h1>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {query ? (
                  <>
                    جستجو برای <span className="font-bold text-gray-700 dark:text-gray-200">{query}</span>
                  </>
                ) : 'عبارت مورد نظر را وارد کنید'}
              </div>
            </div>
          </div>
          <Badge
            count={totalVisibleResults}
            overflowCount={9999}
            style={{ backgroundColor: '#f3f4f6', color: '#4b5563', boxShadow: 'none' }}
          />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-border dark:bg-dark-surface">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input.Search
              allowClear
              className="max-w-2xl"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onSearch={(value) => updateSearchParams(value)}
              placeholder="جستجو در رکوردهای ماژول‌ها..."
              enterButton="جستجو"
            />
            <Select
              className="w-full md:w-[240px]"
              value={selectedModuleId}
              options={moduleOptions}
              onChange={(value) => updateSearchParams(inputValue || query, String(value))}
            />
          </div>
        </div>
      </div>

      {!query ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 dark:border-dark-border dark:bg-dark-surface">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="برای شروع، یک عبارت جستجو وارد کنید." />
        </div>
      ) : !isGlobalSearchQueryReady(query) ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 dark:border-dark-border dark:bg-dark-surface">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="برای جستجو حداقل دو نویسه وارد کنید." />
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center dark:border-dark-border dark:bg-dark-surface">
          <Spin />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 dark:border-dark-border dark:bg-dark-surface">
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="نتیجه‌ای برای این جستجو پیدا نشد." />
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <section key={group.moduleId} className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-border dark:bg-dark-surface md:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-leather-50 text-leather-600 dark:bg-leather-500/10 dark:text-leather-300">
                    {getModuleIcon(group.moduleId)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="m-0 truncate text-sm font-black text-gray-800 dark:text-gray-100">{group.moduleTitle}</h2>
                    <div className="text-[11px] text-gray-400">
                      {group.items.length.toLocaleString('fa-IR')} نتیجه نمایش داده شده
                    </div>
                  </div>
                </div>
                {selectedModuleId === 'all' ? (
                  <Button size="small" onClick={() => updateSearchParams(query, group.moduleId)}>
                    فقط این ماژول
                  </Button>
                ) : null}
              </div>

              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 dark:divide-white/10 dark:border-white/10">
                {group.items.map((item) => (
                  <button
                    key={`${item.moduleId}:${item.recordId}`}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 bg-white px-3 py-3 text-right transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none dark:bg-transparent dark:hover:bg-white/5 dark:focus:bg-white/5"
                    onClick={() => navigate(`/${item.moduleId}/${item.recordId}`)}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-gray-800 dark:text-gray-100">{item.title}</span>
                      <span className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                        {item.subtitle ? (
                          <span className="persian-number max-w-[220px] truncate rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-white/10 dark:text-gray-300">
                            {item.subtitle}
                          </span>
                        ) : null}
                        {item.matchedFields.map((field) => (
                          <span key={field.key} className="rounded-full bg-leather-50 px-2 py-0.5 text-[11px] font-semibold text-leather-600 dark:bg-leather-500/10 dark:text-leather-300">
                            {field.label}
                          </span>
                        ))}
                      </span>
                    </span>
                    <ArrowLeftOutlined className="shrink-0 text-gray-300" />
                  </button>
                ))}
              </div>

              {group.hasMore ? (
                <div className="mt-3 text-center">
                  <Button
                    onClick={() => void handleLoadMore(group)}
                    loading={loadingMoreModuleId === group.moduleId}
                    className="rounded-xl"
                  >
                    نمایش نتایج بیشتر
                  </Button>
                </div>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default GlobalSearchPage;
