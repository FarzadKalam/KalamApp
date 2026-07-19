import { describe, expect, it } from 'vitest';
import { buildOnlineCatalogPath, isOnlineCatalogModule } from './onlineCatalog';
import { buildOnlineCatalogSnapshot } from './onlineCatalogs';

describe('online catalog helpers', () => {
  it('accepts only supported tenant modules', () => {
    expect(isOnlineCatalogModule('billboards')).toBe(true);
    expect(isOnlineCatalogModule('invoices')).toBe(false);
  });

  it('builds a token path without exposing source ids', () => {
    expect(buildOnlineCatalogPath('abc123')).toBe('/c/abc123');
    const snapshot = buildOnlineCatalogSnapshot([{ id: 'private-id', name: 'کالا', price: 10 }], ['name']);
    expect(snapshot[0]).toEqual(expect.objectContaining({ title: 'کالا', fields: { name: 'کالا' } }));
    expect(snapshot[0]).not.toHaveProperty('id');
    expect(snapshot[0].fields).not.toHaveProperty('price');
  });
});
