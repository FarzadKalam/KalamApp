import { describe, expect, it, vi } from 'vitest';
import {
  buildGlobalSearchModules,
  buildPhoneSearchVariants,
  digitsToEnglish,
  isGlobalSearchQueryReady,
  mergeGlobalSearchGroups,
  normalizeGlobalSearchQuery,
  normalizePersianSearchText,
  searchGlobalRecords,
  splitGlobalSearchModulesByPriority,
} from './globalSearch';
import { FieldType } from '../types';

describe('globalSearch normalization', () => {
  it('normalizes Persian and Arabic character variants', () => {
    expect(normalizePersianSearchText('علي')).toBe(normalizePersianSearchText('علی'));
    expect(normalizePersianSearchText('كالا')).toBe(normalizePersianSearchText('کالا'));
    expect(normalizePersianSearchText('نام‌   مشتری')).toBe('نام مشتری');
  });

  it('normalizes Persian and Arabic digits to English digits', () => {
    expect(digitsToEnglish('۰۹۱۲٣٤٥٦٧٨٩')).toBe('09123456789');
    expect(normalizeGlobalSearchQuery('کد ۱۲۳')).toBe('کد 123');
  });

  it('builds equivalent Iranian phone search variants', () => {
    expect(buildPhoneSearchVariants('۰۹۱۲۳۴۵۶۷۸۹')).toEqual(
      expect.arrayContaining(['09123456789', '+989123456789', '989123456789', '9123456789'])
    );
    expect(buildPhoneSearchVariants('+989123456789')).toEqual(
      expect.arrayContaining(['989123456789', '+989123456789', '09123456789', '9123456789'])
    );
  });

  it('does not execute broad one-character global searches', () => {
    expect(isGlobalSearchQueryReady('ا')).toBe(false);
    expect(isGlobalSearchQueryReady('اب')).toBe(true);
    expect(isGlobalSearchQueryReady('۱۲')).toBe(true);
  });

  it('excludes fields hidden by role permissions from searchable data', () => {
    const modules = {
      customers: {
        id: 'customers',
        titles: { fa: 'مشتریان' },
        fields: [
          { key: 'full_name', labels: { fa: 'نام' }, type: FieldType.TEXT },
          { key: 'mobile_1', labels: { fa: 'موبایل' }, type: FieldType.PHONE },
        ],
      },
    } as any;

    const result = buildGlobalSearchModules(modules, {
      customers: { view: true, fields: { full_name: true, mobile_1: false } },
    });

    expect(result[0].keys).toContain('full_name');
    expect(result[0].keys).not.toContain('mobile_1');
    expect(result[0].displayKeys).not.toContain('mobile_1');
  });

  it('does not build ilike search filters for non-text values', () => {
    const modules = {
      products: {
        id: 'products',
        titles: { fa: 'محصولات' },
        fields: [
          { key: 'name', labels: { fa: 'نام' }, type: FieldType.TEXT },
          { key: 'auto_name_enabled', labels: { fa: 'نام‌گذاری خودکار' }, type: FieldType.CHECKBOX },
        ],
      },
    } as any;

    const result = buildGlobalSearchModules(modules);

    expect(result[0].keys).toContain('name');
    expect(result[0].keys).not.toContain('auto_name_enabled');
  });

  it('includes code and phone-like fields in global search modules', () => {
    const modules = {
      sms_delivery_reports: {
        id: 'sms_delivery_reports',
        titles: { fa: 'گزارش پیامک' },
        fields: [
          { key: 'system_code', labels: { fa: 'کد' }, type: FieldType.TEXT },
          { key: 'recipient', labels: { fa: 'گیرنده' }, type: FieldType.PHONE },
          { key: 'sender', labels: { fa: 'فرستنده' }, type: FieldType.PHONE },
          { key: 'delivered', labels: { fa: 'تحویل شده' }, type: FieldType.CHECKBOX },
        ],
      },
    } as any;

    const result = buildGlobalSearchModules(modules);

    expect(result[0].keys).toEqual(expect.arrayContaining(['system_code', 'recipient', 'sender']));
    expect(result[0].phoneKeys).toEqual(expect.arrayContaining(['recipient', 'sender']));
    expect(result[0].keys).not.toContain('delivered');
  });

  it('splits common modules into the fast global search batch first', () => {
    const modules = [
      { id: 'custom_forms', keys: ['name'] },
      { id: 'products', keys: ['name'] },
      { id: 'customers', keys: ['full_name'] },
    ] as any;

    const result = splitGlobalSearchModulesByPriority(modules);

    expect(result.fastModules.map((module) => module.id)).toEqual(['customers', 'products']);
    expect(result.remainingModules.map((module) => module.id)).toEqual(['custom_forms']);
  });

  it('keeps modules with disabled view out of global search requests', () => {
    const modules = {
      tasks: {
        id: 'tasks',
        titles: { fa: 'کارها' },
        fields: [{ key: 'title', labels: { fa: 'عنوان' }, type: FieldType.TEXT }],
      },
    } as any;

    expect(buildGlobalSearchModules(modules, { tasks: { view: false, record_scope: 'own' } })).toEqual([]);
  });

  it('merges duplicate groups without dropping stronger matches', () => {
    const groups = mergeGlobalSearchGroups([
      {
        moduleId: 'customers',
        moduleTitle: 'مشتریان',
        hasMore: false,
        items: [
          { moduleId: 'customers', moduleTitle: 'مشتریان', recordId: '1', title: 'الف', subtitle: '', matchedFields: [], payload: {}, score: 10 },
        ],
      },
      {
        moduleId: 'customers',
        moduleTitle: 'مشتریان',
        hasMore: true,
        items: [
          { moduleId: 'customers', moduleTitle: 'مشتریان', recordId: '1', title: 'الف', subtitle: '', matchedFields: [], payload: {}, score: 40 },
          { moduleId: 'customers', moduleTitle: 'مشتریان', recordId: '2', title: 'ب', subtitle: '', matchedFields: [], payload: {}, score: 20 },
        ],
      },
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].hasMore).toBe(true);
    expect(groups[0].items.map((item) => [item.recordId, item.score])).toEqual([
      ['1', 40],
      ['2', 20],
    ]);
  });

  it('uses the RPC for every active module', async () => {
    const moduleConfigs = {
      custom_forms: {
        id: 'custom_forms',
        titles: { fa: 'فرم‌ها' },
        fields: [{ key: 'name', labels: { fa: 'نام' }, type: FieldType.TEXT }],
      },
    } as any;
    const modules = buildGlobalSearchModules(moduleConfigs);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{
          module_id: 'custom_forms',
          record_id: 'cf-1',
          payload: { id: 'cf-1', name: 'فرم قرارداد', created_at: '2026-06-28T10:00:00Z' },
          matched_fields: ['name'],
          score: 50,
          created_at: '2026-06-28T10:00:00Z',
        }],
        error: null,
      }),
      from: vi.fn(),
    } as any;

    const results = await searchGlobalRecords(supabase, moduleConfigs, modules, {
      query: 'قرارداد',
      cacheNamespace: 'u1',
    });

    expect(supabase.rpc).toHaveBeenCalledWith('global_search_records', expect.objectContaining({
      p_modules: ['custom_forms'],
    }));
    expect(supabase.from).not.toHaveBeenCalled();
    expect(results[0]?.items[0]?.title).toBe('فرم قرارداد');
  });

  it('searches all active modules in one RPC request', async () => {
    const moduleConfigs = {
      customers: {
        id: 'customers',
        titles: { fa: 'مشتریان' },
        fields: [{ key: 'full_name', labels: { fa: 'نام' }, type: FieldType.TEXT }],
      },
      custom_forms: {
        id: 'custom_forms',
        titles: { fa: 'فرم‌ها' },
        fields: [{ key: 'name', labels: { fa: 'نام' }, type: FieldType.TEXT }],
      },
    } as any;
    const modules = buildGlobalSearchModules(moduleConfigs);
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [{
          module_id: 'customers',
          record_id: 'c-1',
          payload: { id: 'c-1', full_name: 'علی جعفری', created_at: '2026-06-28T09:00:00Z' },
          matched_fields: ['full_name'],
          score: 50,
          created_at: '2026-06-28T09:00:00Z',
        }, {
          module_id: 'custom_forms',
          record_id: 'cf-1',
          payload: { id: 'cf-1', name: 'فرم قرارداد', created_at: '2026-06-28T10:00:00Z' },
          matched_fields: ['name'],
          score: 40,
          created_at: '2026-06-28T10:00:00Z',
        }],
        error: null,
      }),
      from: vi.fn(),
    } as any;

    const results = await searchGlobalRecords(supabase, moduleConfigs, modules, {
      query: 'جعفری',
      cacheNamespace: 'u1',
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith('global_search_records', expect.objectContaining({
      p_modules: expect.arrayContaining(['customers', 'custom_forms']),
    }));
    expect(supabase.from).not.toHaveBeenCalled();
    expect(results.flatMap((group) => group.items).map((item) => item.recordId)).toEqual(expect.arrayContaining(['c-1', 'cf-1']));
  });

  it('does not fan out client fallback requests for a broken RPC function', async () => {
    const moduleConfigs = {
      products: {
        id: 'products',
        titles: { fa: 'محصولات' },
        fields: [{ key: 'name', labels: { fa: 'نام' }, type: FieldType.TEXT }],
      },
    } as any;
    const modules = buildGlobalSearchModules(moduleConfigs);
    const from = vi.fn();
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { code: '42601', message: 'syntax error at or near "from"' },
      }),
      from,
    } as any;

    await expect(searchGlobalRecords(supabase, moduleConfigs, modules, { query: 'جعفری' }))
      .rejects.toMatchObject({ code: '42601' });
    expect(from).not.toHaveBeenCalled();
  });

  it('does not select virtual bot group fields from stale recent-list metadata', () => {
    const [customers] = buildGlobalSearchModules({
      customers: {
        id: 'customers',
        table: 'customers',
        titles: { fa: 'مشتریان' },
        dashboard: {
          recentListFields: ['full_name', 'telegram_group_title', 'bale_group_title', 'rubika_group_title'],
        },
        fields: [
          { key: 'full_name', type: FieldType.TEXT, labels: { fa: 'نام' } },
          { key: 'mobile_1', type: FieldType.PHONE, labels: { fa: 'موبایل' } },
          { key: 'telegram_group_title', type: FieldType.TEXT, labels: { fa: 'عنوان گروه تلگرام' } },
          { key: 'bale_group_title', type: FieldType.TEXT, labels: { fa: 'عنوان گروه بله' } },
          { key: 'rubika_group_title', type: FieldType.TEXT, labels: { fa: 'عنوان گروه روبیکا' } },
        ],
      } as any,
    });

    expect(customers.displayKeys).toContain('full_name');
    expect(customers.displayKeys).not.toEqual(expect.arrayContaining([
      'telegram_group_title',
      'bale_group_title',
      'rubika_group_title',
    ]));
  });
});
