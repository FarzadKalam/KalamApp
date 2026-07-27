import { describe, expect, it } from 'vitest';
import { normalizeRichTextHtml } from '../richText';
import { buildDefaultTemplatesForModule, mergeTemplatesWithDefaults } from './store';
import { renderPrintTemplateHtml } from './templateRenderer';

describe('system invoice template rendering', () => {
  it.each(['default_invoice_official', 'default_invoice_unofficial'])(
    'keeps a populated invoice description in %s',
    (templateId) => {
      const template = buildDefaultTemplatesForModule('invoices').find((item) => item.id === templateId);
      const rendered = renderPrintTemplateHtml({
        templateHtml: template?.contentHtml,
        resolveVariableValue: (path) => (
          path === 'record.description'
            ? normalizeRichTextHtml('شرط اول فاکتور\nشرط دوم فاکتور')
            : ''
        ),
      });

      expect(rendered).toContain('شرط اول فاکتور');
      expect(rendered).toContain('شرط دوم فاکتور');
      expect(rendered).toContain('<br>');
      expect(rendered).toContain('data-print-optional-field="record.description"');
    }
  );

  it('keeps safe rich-text formatting in an invoice description', () => {
    const rendered = renderPrintTemplateHtml({
      templateHtml: '<div>{{record.description}}</div>',
      resolveVariableValue: () => normalizeRichTextHtml('<p><strong>توضیحات مهم</strong><br>سطر دوم</p>'),
    });

    expect(rendered).toContain('<strong>توضیحات مهم</strong>');
    expect(rendered).toContain('<br>سطر دوم');
  });

  it('keeps generated record-image markup untouched', () => {
    const imageUrl = 'https://cdn.example.test/11111111-1111-4111-8111-111111111111.png';
    const rendered = renderPrintTemplateHtml({
      templateHtml: '<div>{{system.record_image}}</div>',
      resolveVariableValue: () => `<img src="${imageUrl}" alt="تصویر">`,
    });

    expect(rendered).toContain(imageUrl);
  });

  it('replaces stale stored system markup with the current official invoice template', () => {
    const merged = mergeTemplatesWithDefaults('invoices', [{
      id: 'default_invoice_official',
      title: 'فاکتور فروش رسمی',
      moduleId: 'invoices',
      contentHtml: '<table><tr><td>{{record.description}}</td></tr></table>',
      isActive: true,
      isSystem: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }]);
    const official = merged.find((item) => item.id === 'default_invoice_official');

    expect(official?.contentHtml).toContain('data-print-optional-field="record.description"');
  });
});
