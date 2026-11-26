import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockType, FieldLocation, FieldNature, FieldType } from '../types';
import {
  applyModuleSettingsStoreToRegistry,
  clearModuleSettingsCache,
  getModuleSettingsVersion,
  loadModuleSettingsStore,
  mergeModuleSchemaWithBase,
  primeModuleSettingsCache,
} from './moduleSettingsRuntime';
import { MODULES } from '../moduleRegistry';
import { clearOrganizationContext, selectOrganizationContext } from './organizationContext';
import { fetchSessionBootstrap } from './sessionCache';

vi.mock('./sessionCache', () => ({ fetchSessionBootstrap: vi.fn() }));

const setupSettingsClient = () => {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  };
  const client = { from: vi.fn().mockReturnValue(query) };
  return { client, query };
};

const setSessionScope = (orgId: string, userId = 'member-a') => {
  selectOrganizationContext(orgId);
  vi.mocked(fetchSessionBootstrap).mockResolvedValue({
    user: { id: userId },
    orgId,
    profile: null,
    roleId: null,
    permissions: null,
    loadedAt: 1,
  });
};

describe('loadModuleSettingsStore', () => {
  afterEach(() => {
    clearModuleSettingsCache();
    clearOrganizationContext();
    vi.resetAllMocks();
  });

  it('shares the in-flight request and caches an empty result for one user and organization', async () => {
    setSessionScope('org-a');
    const { client, query } = setupSettingsClient();
    query.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(Promise.all([loadModuleSettingsStore(client), loadModuleSettingsStore(client)]))
      .resolves.toEqual([null, null]);
    await expect(loadModuleSettingsStore(client)).resolves.toBeNull();
    expect(query.maybeSingle).toHaveBeenCalledTimes(1);
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-a');

    setSessionScope('org-a', 'member-b');
    await loadModuleSettingsStore(client);
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });

  it('discards the pending result when the organization changes and settings are invalidated', async () => {
    setSessionScope('org-a');
    const { client, query } = setupSettingsClient();
    let resolveOld!: (value: unknown) => void;
    query.maybeSingle.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const old = loadModuleSettingsStore(client);
    await Promise.resolve();
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-a');

    clearModuleSettingsCache();
    setSessionScope('org-b');
    const currentStore = { modules: { products: {} } };
    query.maybeSingle.mockResolvedValue({ data: { settings: currentStore }, error: null });
    await expect(loadModuleSettingsStore(client)).resolves.toEqual(currentStore);
    resolveOld({ data: { settings: { modules: { invoices: {} } } }, error: null });
    await expect(old).resolves.toBeNull();
    expect(query.eq).toHaveBeenCalledWith('org_id', 'org-b');
    expect(query.maybeSingle).toHaveBeenCalledTimes(2);
  });
});

describe('mergeModuleSchemaWithBase', () => {
  it('keeps original sales invoice labels when saved settings contain return invoice labels', () => {
    const result = mergeModuleSchemaWithBase(
      {
        fields: [
          {
            key: 'name',
            labels: { fa: 'عنوان فاکتور', en: 'Title' },
            type: FieldType.TEXT,
            location: FieldLocation.HEADER,
            order: 1,
            nature: FieldNature.PREDEFINED,
          },
          {
            key: 'total_invoice_amount',
            labels: { fa: 'مبلغ کل فاکتور', en: 'Total Amount' },
            type: FieldType.PRICE,
            location: FieldLocation.BLOCK,
            blockId: 'summary',
            order: 2,
            nature: FieldNature.SYSTEM,
          },
        ],
        blocks: [
          {
            id: 'baseInfo',
            titles: { fa: 'اطلاعات فاکتور', en: 'Invoice Info' },
            type: BlockType.FIELD_GROUP,
            order: 1,
          },
        ],
      },
      {
        fields: [
          {
            key: 'name',
            labels: { fa: 'عنوان فاکتور برگشت', en: 'Title' },
            type: FieldType.TEXT,
            location: FieldLocation.HEADER,
            order: 1,
            nature: FieldNature.PREDEFINED,
          },
          {
            key: 'total_invoice_amount',
            labels: { fa: 'مبلغ کل برگشت', en: 'Total Return Amount' },
            type: FieldType.PRICE,
            location: FieldLocation.BLOCK,
            blockId: 'summary',
            order: 2,
            nature: FieldNature.SYSTEM,
          },
        ],
        blocks: [
          {
            id: 'baseInfo',
            titles: { fa: 'اطلاعات فاکتور برگشت', en: 'Return Invoice Info' },
            type: BlockType.FIELD_GROUP,
            order: 1,
          },
        ],
      },
      'invoices',
    );

    expect(result.fields.find((field) => field.key === 'name')?.labels?.fa).toBe('عنوان فاکتور');
    expect(result.fields.find((field) => field.key === 'total_invoice_amount')?.labels?.fa).toBe('مبلغ کل فاکتور');
    expect(result.blocks.find((block) => block.id === 'baseInfo')?.titles?.fa).toBe('اطلاعات فاکتور');
  });

  it('allows return invoice modules to keep return labels', () => {
    const result = mergeModuleSchemaWithBase(
      {
        fields: [
          {
            key: 'name',
            labels: { fa: 'عنوان فاکتور برگشت', en: 'Title' },
            type: FieldType.TEXT,
            location: FieldLocation.HEADER,
            order: 1,
            nature: FieldNature.PREDEFINED,
          },
        ],
        blocks: [],
      },
      null,
      'sales_return_invoices',
    );

    expect(result.fields.find((field) => field.key === 'name')?.labels?.fa).toBe('عنوان فاکتور برگشت');
  });

  it('respects cleared properties, customized options, and customized table columns without resurrecting base items', () => {
    const result = mergeModuleSchemaWithBase(
      {
        fields: [
          {
            key: 'status',
            labels: { fa: 'وضعیت' },
            type: FieldType.SELECT,
            location: FieldLocation.BLOCK,
            blockId: 'main_block',
            defaultValue: 'draft',
            options: [
              { label: 'پیش‌نویس', value: 'draft' },
              { label: 'تاییدشده', value: 'approved' },
            ],
            order: 1,
          },
        ],
        blocks: [
          {
            id: 'main_block',
            titles: { fa: 'اصلی' },
            type: BlockType.FIELD_GROUP,
            order: 1,
          },
          {
            id: 'items',
            titles: { fa: 'اقلام' },
            type: BlockType.TABLE,
            order: 2,
            tableColumns: [
              { key: 'title', title: 'شرح', type: FieldType.TEXT },
              { key: 'legacy_col', title: 'ستون قدیمی', type: FieldType.TEXT },
            ],
          },
        ],
      },
      {
        fields: [
          {
            key: 'status',
            labels: { fa: 'وضعیت جدید' },
            type: FieldType.SELECT,
            location: 'header',
            _clearedKeys: ['blockId', 'defaultValue'],
            _optionsCustomized: true,
            options: [{ label: 'تاییدشده', value: 'approved' }],
            order: 1,
          },
        ],
        blocks: [
          {
            id: 'main_block',
            titles: { fa: 'اصلی' },
            type: BlockType.FIELD_GROUP,
            order: 1,
          },
          {
            id: 'items',
            titles: { fa: 'اقلام' },
            type: BlockType.TABLE,
            order: 2,
            _tableColumnsCustomized: true,
            tableColumns: [
              { key: 'title', title: 'شرح جدید', type: FieldType.TEXT, printable: false },
            ],
          },
        ],
      },
      'tasks',
    );

    const statusField = result.fields.find((f) => f.key === 'status');
    expect(statusField?.blockId).toBeUndefined();
    expect(statusField?.defaultValue).toBeUndefined();
    expect(statusField?.options).toEqual([{ label: 'تاییدشده', value: 'approved' }]);

    const itemsBlock = result.blocks.find((b) => b.id === 'items');
    expect(itemsBlock?.tableColumns).toHaveLength(1);
    expect(itemsBlock?.tableColumns?.[0]?.title).toBe('شرح جدید');
    expect(itemsBlock?.tableColumns?.[0]?.printable).toBe(false);
  });
});

describe('applyModuleSettingsStoreToRegistry & cache priming', () => {
  afterEach(() => {
    applyModuleSettingsStoreToRegistry(null);
    clearModuleSettingsCache();
    clearOrganizationContext();
    vi.resetAllMocks();
  });

  it('immediately removes deactivated fields and tableColumns, bumps version, and avoids extra fetch via primed cache', async () => {
    setSessionScope('org-live');
    const { client, query } = setupSettingsClient();
    const versionBefore = getModuleSettingsVersion();
    const baseProducts = MODULES.products;
    const sampleBlock = (baseProducts.blocks || []).find((b) => Array.isArray(b.tableColumns) && b.tableColumns.length > 0);
    const deactivatedFieldKey = baseProducts.fields.find((f) => !f.isKey && f.key !== 'tags')?.key;
    expect(deactivatedFieldKey).toBeTruthy();

    const store = {
      modules: {
        products: {
          schema: {
            fields: baseProducts.fields.map((f) =>
              f.key === deactivatedFieldKey ? { ...f, isActive: false } : f
            ),
            blocks: (baseProducts.blocks || []).map((b) =>
              sampleBlock && b.id === sampleBlock.id
                ? {
                    ...b,
                    _tableColumnsCustomized: true,
                    tableColumns: (b.tableColumns || []).map((c, idx) =>
                      idx === 0 ? { ...c, isActive: false } : c
                    ),
                  }
                : b
            ),
          },
        },
      },
    } as any;

    primeModuleSettingsCache(store, 'org-live');
    applyModuleSettingsStoreToRegistry(store);

    expect(getModuleSettingsVersion()).toBeGreaterThan(versionBefore);
    expect(MODULES.products.fields.some((f) => f.key === deactivatedFieldKey)).toBe(false);
    if (sampleBlock) {
      const firstColKey = sampleBlock.tableColumns?.[0]?.key;
      const updatedBlock = MODULES.products.blocks.find((b) => b.id === sampleBlock.id);
      expect(updatedBlock?.tableColumns?.some((c) => c.key === firstColKey)).toBe(false);
    }

    const loaded = await loadModuleSettingsStore(client);
    expect(loaded).toEqual(store);
    expect(query.maybeSingle).not.toHaveBeenCalled();
  });
});
