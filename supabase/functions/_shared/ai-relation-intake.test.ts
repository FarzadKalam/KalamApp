// @vitest-environment node
import { describe,it,expect,vi } from 'vitest';
import { createRelationIntakeRuntime } from './ai-relation-intake';
const setup = (extra = {}) => {
  const prepare = vi.fn(async input => ({ prepared: true,moduleId: input.moduleId }));
  const lookup = vi.fn(async () => ({ records: [],hasMore: false }));
  const runtime = createRelationIntakeRuntime({ sourceModuleId: 'invoices',sourceSchema: { fields: [
    { key: 'customer',type: 'relation',relationTargetModule: 'customers' },{ key: 'assignee',type: 'user',relationTargetModule: 'profiles' },
  ],tables: [{ key: 'invoiceItems',columns: [{ key: 'product_id',type: 'relation',relationTargetModule: 'products' }] }] },
    canCreate: () => true,loadSchema: async () => ({ moduleLabel: 'رکورد',fields: [{ key: 'name' }],tables: [] }),lookup,prepare,...extra });
  return { runtime,lookup,prepare };
};
describe('related record intake approval',() => {
  it('derives the destination from a real nested relation and prepares without a write',async () => {
    const { runtime,lookup,prepare } = setup();
    expect(await runtime.execute({ mode: 'describe',field: 'invoiceItems.product_id' })).toMatchObject({ moduleId: 'products' });
    expect(lookup).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
    expect(await runtime.execute({ mode: 'prepare',field: 'invoiceItems.product_id',query: 'بنر',fields: { name: 'بنر' } })).toMatchObject({ prepared: true });
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ moduleId: 'products',origin: { source_module_id: 'invoices',field: 'invoiceItems.product_id',query: 'بنر' } }));
  });
  it('rechecks absence and refuses duplicate or partially searched names',async () => {
    for (const result of [{ records: [{ id: 'existing' }],hasMore: false },{ records: [],hasMore: true }]) {
      const { runtime,prepare } = setup({ lookup: vi.fn(async () => result) });
      expect(await runtime.execute({ mode: 'prepare',field: 'customer',query: 'نام' })).toMatchObject({ prepared: false });
      expect(prepare).not.toHaveBeenCalled();
    }
  });
  it('blocks invented fields, user creation and denied target permissions before preparation',async () => {
    for (const [field,extra] of [['unknown',{}],['assignee',{}],['customer',{ canCreate: () => false }]] as const) {
      const { runtime,prepare } = setup(extra);
      await expect(runtime.execute({ mode: 'prepare',field,query: 'نام' })).rejects.toThrow();
      expect(prepare).not.toHaveBeenCalled();
    }
  });
});

