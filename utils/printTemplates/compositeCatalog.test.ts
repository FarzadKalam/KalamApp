import { describe, expect, it } from 'vitest';
import { buildCompositeCatalogRows } from './compositeCatalog';

describe('composite record catalogs', () => {
  it('keeps price-list row order while hydrating product artwork', () => {
    const rows = buildCompositeCatalogRows({
      moduleId: 'price_lists',
      record: {
        items: [
          { product_id: 'p2', price: 220 },
          { product_id: 'p1', price: 110 },
        ],
      },
      referencesById: {
        p1: { name: 'محصول اول', image_url: '/one.jpg' },
        p2: { name: 'محصول دوم', image_url: '/two.jpg' },
      },
    });

    expect(rows.map((row) => row.name)).toEqual(['محصول دوم', 'محصول اول']);
    expect(rows.map((row) => row.price)).toEqual([220, 110]);
    expect(rows.map((row) => row.__print_source_index)).toEqual([0, 1]);
  });
});
