import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlockType, FieldLocation, FieldNature, FieldType } from '../types';
import { clearModuleSettingsCache, loadModuleSettingsStore, mergeModuleSchemaWithBase } from './moduleSettingsRuntime';
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
});
