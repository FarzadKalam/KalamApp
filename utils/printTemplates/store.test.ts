import { describe, expect, it } from 'vitest';
import {
  buildDefaultTemplatesForModule,
  buildSystemTemplateFieldOptionsForModule,
  getPersistedPrintTemplatesByModule,
  getPrintTemplateVariables,
  getSystemTemplateFieldOptions,
  isPrintTemplateAvailableForModule,
  materializeSystemTemplateForCopy,
  normalizeDynamicBlockTablesHtml,
} from './store';
import { BlockType, FieldLocation, FieldType } from '../../types';

describe('print template store grouping', () => {
  it('groups billboard record fields by general and module sections', () => {
    const variableOptions = getPrintTemplateVariables('billboards');
    const systemFieldOptions = getSystemTemplateFieldOptions('billboards');

    expect(variableOptions.find((item) => item.value === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(variableOptions.find((item) => item.value === 'record.width')?.group).toBe('بخش: اطلاعات پایه');
    expect(variableOptions.find((item) => item.value === 'record.address')?.group).toBe('بخش: اطلاعات پایه');
    expect(variableOptions.find((item) => item.value === 'record.created_by')?.label).toBe('ایجادکننده');
    expect(variableOptions.find((item) => item.value === 'record.updated_by')?.label).toBe('آخرین ویرایشگر');

    expect(systemFieldOptions.find((item) => item.key === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(systemFieldOptions.find((item) => item.key === 'record.width')?.group).toBe('بخش: اطلاعات پایه');
    expect(systemFieldOptions.find((item) => item.key === 'record.related_customer')?.group).toBe('بخش: جزئیات اکران');
  });

  it('builds system print fields from a runtime module config', () => {
    const runtimeModule = {
      id: 'runtime_test',
      fields: [
        { key: 'name', labels: { fa: 'عنوان' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1 },
        { key: 'full_address', labels: { fa: 'آدرس کامل' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'baseInfo', order: 2 },
      ],
      blocks: [
        { id: 'baseInfo', titles: { fa: 'اطلاعات پایه' }, type: BlockType.FIELD_GROUP, order: 1 },
      ],
    };

    const runtimeFields = buildSystemTemplateFieldOptionsForModule(runtimeModule);

    expect(runtimeFields.find((item) => item.key === 'record.name')?.group).toBe('فیلدهای عمومی');
    expect(runtimeFields.find((item) => item.key === 'record.full_address')?.group).toBe('بخش: اطلاعات پایه');
  });

  it('excludes fields and blocks disabled for printing from every system field option', () => {
    const runtimeModule = {
      id: 'runtime_printable_test',
      fields: [
        { key: 'name', labels: { fa: 'عنوان' }, type: FieldType.TEXT, location: FieldLocation.HEADER },
        { key: 'internal_note', labels: { fa: 'یادداشت داخلی' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'details', printable: false },
        { key: 'hidden_by_block', labels: { fa: 'فیلد بلاک مخفی' }, type: FieldType.TEXT, location: FieldLocation.BLOCK, blockId: 'private' },
      ],
      blocks: [
        { id: 'details', titles: { fa: 'جزئیات' }, type: BlockType.FIELD_GROUP },
        { id: 'private', titles: { fa: 'خصوصی' }, type: BlockType.FIELD_GROUP, printable: false },
      ],
    };

    expect(buildSystemTemplateFieldOptionsForModule(runtimeModule).map((item) => item.key)).toEqual(['record.name']);
  });

  it('exposes list and operational summary variables for operational financial overview templates', () => {
    const variableOptions = getPrintTemplateVariables('operational_financial_overview_customer');

    expect(variableOptions.find((item) => item.value === 'system.list_summary_table')?.scopes).toContain('list');
    expect(variableOptions.find((item) => item.value === 'summary.totalDebit')?.group).toBe('جمع‌بندی وضعیت مالی');
    expect(variableOptions.find((item) => item.value === 'summary.finalBalanceSide')?.scopes).toContain('list');
  });

  it('exposes both counterparty identity fields and the combined invoice identity variable', () => {
    const variableOptions = getPrintTemplateVariables('invoices');

    expect(variableOptions.find((item) => item.value === 'customer.national_code')?.label).toBe('کد ملی مشتری');
    expect(variableOptions.find((item) => item.value === 'customer.national_id')?.label).toBe('شناسه ملی مشتری');
    expect(variableOptions.find((item) => item.value === 'customer.national_identifier')?.label)
      .toBe('شناسه ملی / کد ملی مشتری');
  });

  it('keeps full-page catalog defaults only for products and billboards', () => {
    const productDefaults = buildDefaultTemplatesForModule('products');
    const billboardDefaults = buildDefaultTemplatesForModule('billboards');
    const customerDefaults = buildDefaultTemplatesForModule('customers');

    expect(productDefaults.some((item) => item.id === 'default_products_catalog_fullpage_landscape')).toBe(true);
    expect(productDefaults.some((item) => item.id === 'default_products_catalog_fullpage_list_landscape')).toBe(true);
    expect(billboardDefaults.some((item) => item.id === 'default_billboards_catalog_fullpage_landscape')).toBe(true);
    expect(customerDefaults.some((item) => item.id.includes('_catalog_fullpage_'))).toBe(false);
    expect(
      isPrintTemplateAvailableForModule('customers', {
        id: 'default_customers_catalog_fullpage_list_landscape',
        contentHtml: '{{system.list_catalog_fullpage}}',
      })
    ).toBe(false);
  });

  it('marks the optional invoice-wide discount row for value-aware rendering', () => {
    const invoiceTemplate = buildDefaultTemplatesForModule('invoices')
      .find((template) => template.id === 'default_invoice_official');

    expect(invoiceTemplate?.contentHtml).toContain('data-print-optional-field="record.global_discount_amount"');
  });

  it('marks invoice description and payment panels as optional in official and unofficial defaults', () => {
    const templates = buildDefaultTemplatesForModule('invoices');
    const official = templates.find((template) => template.id === 'default_invoice_official');
    const unofficial = templates.find((template) => template.id === 'default_invoice_unofficial');

    [official, unofficial].forEach((template) => {
      expect(template?.contentHtml).toContain('{{record.description}}');
      expect(template?.contentHtml).toContain('data-print-optional-field="record.description"');
      expect(template?.contentHtml).toContain('data-print-optional-field="block.payments"');
    });
  });

  it.each(['default_invoice_official', 'default_invoice_unofficial'])(
    'does not replace the description-and-payments parent table in %s',
    (templateId) => {
      const template = buildDefaultTemplatesForModule('invoices')
        .find((item) => item.id === templateId);
      const normalized = normalizeDynamicBlockTablesHtml('invoices', template?.contentHtml);

      expect(normalized).toContain('data-print-optional-field="record.description"');
      expect(normalized).toContain('{{record.description}}');
      expect(normalized).toContain('data-print-block="payments"');
    }
  );

  it('starts a copied system template without inheriting its source field selection', () => {
    const source = buildDefaultTemplatesForModule('invoices')
      .find((item) => item.id === 'default_invoice_unofficial');
    const copied = materializeSystemTemplateForCopy('invoices', {
      ...source!,
      selectedFieldKeys: ['block.invoiceItems', 'block.payments'],
    });

    expect(copied.selectedFieldKeys).toBeUndefined();
    expect(copied.contentHtml).toContain('data-print-block="invoiceItems"');
    expect(copied.contentHtml).toContain('data-print-block="payments"');
  });

  it('uses related employee identity fields in the formal payroll slip template', () => {
    const template = buildDefaultTemplatesForModule('payroll_slips')
      .find((item) => item.id === 'default_payroll_slip_formal_a4');
    const variables = getPrintTemplateVariables('payroll_slips');

    expect(template?.contentHtml).toContain('{{record.employee_national_code}}');
    expect(template?.contentHtml).toContain('{{record.employee_father_name}}');
    expect(template?.contentHtml).toContain('{{record.employee_marital_status}}');
    expect(template?.contentHtml).toContain('{{record.employee_military_service_status}}');
    expect(template?.contentHtml).toContain('{{record.employee_children_count}}');
    expect(template?.contentHtml).toContain('{{record.employee_insurance_number}}');
    expect(variables.find((item) => item.value === 'employee.insurance_number')?.group).toBe('اطلاعات کارمند');
  });

  it('persists only custom templates because system templates are generated at runtime', () => {
    const stored = getPersistedPrintTemplatesByModule({
      products: [
        {
          id: 'default_products_compact_a4',
          title: 'پیش‌فرض',
          moduleId: 'products',
          contentHtml: '<p>پیش‌فرض</p>',
          isActive: true,
          isSystem: true,
          createdAt: '2026-07-22T00:00:00.000Z',
          updatedAt: '2026-07-22T00:00:00.000Z',
        },
        {
          id: 'custom-products-template',
          title: 'قالب فروش',
          moduleId: 'products',
          contentHtml: '<p>فروش</p>',
          isActive: true,
          isSystem: false,
          createdAt: '2026-07-22T00:00:00.000Z',
          updatedAt: '2026-07-22T00:00:00.000Z',
        },
      ],
    });

    expect(stored).toEqual({
      products: [expect.objectContaining({ id: 'custom-products-template' })],
    });
  });
});
