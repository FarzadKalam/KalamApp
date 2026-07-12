import { describe, expect, it } from 'vitest';
import {
  buildPrintLetterheadVariants,
  normalizePrintLetterheads,
  type PrintLetterheadConfig,
} from './letterheads';
import { getPrintLetterheadEffectiveBodyItem } from './letterheadRender';
import type { StoredPrintTemplate } from './store';

describe('print letterheads', () => {
  it('normalizes to four fixed slots and preserves required items', () => {
    const items = normalizePrintLetterheads([
      {
        id: 'portrait_1',
        slotId: 'portrait_1',
        title: 'سربرگ فروش',
        imageUrl: 'https://example.com/p1.png',
        isActive: true,
        layout: {
          orientation: 'portrait',
          items: [{ id: 'custom_title', type: 'title', x: 10, y: 10, width: 20, height: 4, visible: true, zIndex: 4 }],
        },
      },
    ]);

    expect(items).toHaveLength(4);
    expect(items[0].slotId).toBe('portrait_1');
    expect(items[0].layout.items.some((item) => item.type === 'body')).toBe(true);
    expect(items[0].layout.items.some((item) => item.type === 'signatures')).toBe(true);
    expect(items[0].layout.items.find((item) => item.type === 'title')?.id).toBe('custom_title');
    expect(items[1].slotId).toBe('portrait_2');
    expect(items[2].slotId).toBe('landscape_1');
    expect(items[3].slotId).toBe('landscape_2');
  });

  it('creates variants only for eligible system templates with matching orientation', () => {
    const templates: StoredPrintTemplate[] = [
      {
        id: 'default_invoices_a4_portrait',
        title: 'فاکتور',
        moduleId: 'invoices',
        scope: 'record',
        contentHtml: '<div>body</div>',
        footerHtml: '<div>footer</div>',
        headerHtml: '<div>header</div>',
        isActive: true,
        isSystem: true,
        orientation: 'portrait',
        paperSize: 'A4',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
      {
        id: 'default_products_catalog_fullpage_landscape',
        title: 'کاتالوگ تمام صفحه',
        moduleId: 'products',
        scope: 'record',
        contentHtml: '<div>full</div>',
        isActive: true,
        isSystem: true,
        orientation: 'landscape',
        paperSize: 'A4',
        createdAt: '2026-06-11T00:00:00.000Z',
        updatedAt: '2026-06-11T00:00:00.000Z',
      },
    ];
    const letterheads: PrintLetterheadConfig[] = normalizePrintLetterheads([
      {
        id: 'portrait_1',
        slotId: 'portrait_1',
        orientation: 'portrait',
        title: 'سربرگ عمودی ویژه',
        imageUrl: 'https://example.com/p1.png',
        isActive: true,
        layout: { orientation: 'portrait', version: 1, items: [] },
        sortOrder: 1,
      },
      {
        id: 'landscape_1',
        slotId: 'landscape_1',
        orientation: 'landscape',
        title: 'سربرگ افقی',
        imageUrl: 'https://example.com/l1.png',
        isActive: false,
        layout: { orientation: 'landscape', version: 1, items: [] },
        sortOrder: 3,
      },
    ]);

    const next = buildPrintLetterheadVariants(templates, letterheads);
    const portraitVariant = next.find((item) => item.renderMode === 'org_letterhead');

    expect(next).toHaveLength(3);
    expect(portraitVariant?.title).toContain('سربرگ عمودی ویژه');
    expect(portraitVariant?.sourceTemplateId).toBe('default_invoices_a4_portrait');
    expect(next.some((item) => item.id.includes('catalog_fullpage'))).toBe(true);
    expect(next.filter((item) => item.renderMode === 'org_letterhead')).toHaveLength(1);
  });

  it('returns the unused signature slot to the body', () => {
    const letterhead: PrintLetterheadConfig = {
      id: 'portrait_1',
      slotId: 'portrait_1',
      orientation: 'portrait',
      title: 'سربرگ آزمایشی',
      imageUrl: 'https://example.com/p1.png',
      isActive: true,
      sortOrder: 1,
      layout: {
        orientation: 'portrait',
        version: 1,
        items: [
          { id: 'body', type: 'body', x: 7, y: 30, width: 86, height: 50, visible: true, zIndex: 3 },
          { id: 'signatures', type: 'signatures', x: 7, y: 82, width: 86, height: 12, visible: true, zIndex: 2 },
        ],
      },
    };

    expect(getPrintLetterheadEffectiveBodyItem(letterhead, false)?.height).toBe(64);
    expect(getPrintLetterheadEffectiveBodyItem(letterhead, true)?.height).toBe(50);
  });
});
