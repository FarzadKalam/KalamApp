import { describe, expect, it } from 'vitest';
import { buildAiAgentModuleCatalog, getAiAgentModuleCatalogEntry } from './aiAgentRegistry';

describe('ai agent module registry', () => {
  it('exposes price-list items and their pricing relations from the module registry', () => {
    const priceLists = getAiAgentModuleCatalogEntry('price_lists');
    expect(priceLists?.table).toBe('price_lists');
    expect(priceLists?.internalTables.some((table) => table.id === 'items')).toBe(true);
    expect(priceLists?.internalTables.find((table) => table.id === 'items')?.columns.some((column) => column.key === 'price')).toBe(true);
  });

  it('keeps relation metadata discoverable for every catalog entry', () => {
    const modules = buildAiAgentModuleCatalog();
    const invoices = modules.find((module) => module.id === 'invoices');
    expect(modules.length).toBeGreaterThan(20);
    expect(invoices?.internalTables.length).toBeGreaterThan(0);
    expect(invoices?.relatedModules).toContain('products');
  });
});
