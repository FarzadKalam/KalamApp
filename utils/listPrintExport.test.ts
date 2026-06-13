import { describe, expect, it } from 'vitest';
import { FieldLocation, FieldType } from '../types';
import { buildListCatalogHtml, buildListPrintableFields, formatListCellValue } from './listPrintExport';

describe('formatListCellValue assignee display', () => {
  it('renders relation fields as labels instead of UUIDs', () => {
    const customerId = '11111111-1111-1111-1111-111111111111';

    const value = formatListCellValue(
      { key: 'customer_id', label: 'مشتری', type: FieldType.RELATION },
      { customer_id: customerId },
      {
        customer_id: [
          { label: 'شرکت نمونه', value: customerId },
        ],
      }
    );

    expect(value).toBe('شرکت نمونه');
  });

  it('renders role assignee_id as a label instead of a UUID', () => {
    const roleId = '22222222-2222-2222-2222-222222222222';

    const value = formatListCellValue(
      { key: 'assignee_id', label: 'مسئول', type: FieldType.USER },
      {
        assignee_id: null,
        assignee_role_id: roleId,
        assignee_type: 'role',
      },
      {
        __workflow_assignee: [
          { label: 'تیم فروش', value: `role_${roleId}` },
        ],
      }
    );

    expect(value).toBe('تیم فروش');
  });

  it('renders workflow role combo values as labels instead of role-prefixed IDs', () => {
    const roleId = '43147e04-6a09-4e7c-a7f7-3eaf21aa3dfa';

    const value = formatListCellValue(
      { key: '__workflow_assignee', label: 'مسئول', type: FieldType.SELECT },
      { __workflow_assignee: `role_${roleId}` },
      {
        __workflow_assignee: [
          { label: 'نقش فروش', value: `role_${roleId}` },
        ],
      }
    );

    expect(value).toBe('نقش فروش');
  });

  it('includes non-list block fields in list printable fields and keeps visible columns as defaults', () => {
    const fields = buildListPrintableFields(
      {
        id: 'billboards',
        fields: [
          { key: 'name', labels: { fa: 'عنوان' }, type: FieldType.TEXT, location: FieldLocation.HEADER, isTableColumn: true },
          { key: 'width', labels: { fa: 'طول' }, type: FieldType.NUMBER, location: FieldLocation.BLOCK, blockId: 'baseInfo', isTableColumn: false },
          { key: 'address', labels: { fa: 'آدرس کامل' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'baseInfo', isTableColumn: false },
        ],
        blocks: [
          { id: 'baseInfo', titles: { fa: 'اطلاعات پایه' } },
        ],
      },
      undefined,
      ['name'],
      {}
    );

    expect(fields.find((field) => field.key === 'address')?.group).toBe('بخش: اطلاعات پایه');
    expect(fields.find((field) => field.key === 'address')?.defaultSelected).toBe(false);
    expect(fields.find((field) => field.key === 'name')?.defaultSelected).toBe(true);
    expect(fields.map((field) => field.key)).toEqual(expect.arrayContaining(['name', 'width', 'address']));
  });

  it('uses raw storage images for catalog list cards by default', () => {
    const html = buildListCatalogHtml(
      [
        { key: 'image_url', label: 'تصویر', type: FieldType.IMAGE },
        { key: 'name', label: 'نام', type: FieldType.TEXT },
      ],
      [
        {
          image_url: 'https://example.com/storage/v1/object/public/images/products/1/photo.jpg',
          name: 'محصول نمونه',
        },
      ],
    );

    expect(html).toContain('products/1/photo.jpg');
  });

  it('applies selected image display mode to catalog cards', () => {
    const fitHtml = buildListCatalogHtml(
      [
        { key: 'image_url', label: 'تصویر', type: FieldType.IMAGE },
        { key: 'name', label: 'نام', type: FieldType.TEXT },
      ],
      [
        {
          image_url: 'https://example.com/storage/v1/object/public/images/products/1/photo.jpg',
          name: 'محصول نمونه',
        },
      ],
      {},
      '',
      'fit',
    );
    const actualHtml = buildListCatalogHtml(
      [
        { key: 'image_url', label: 'تصویر', type: FieldType.IMAGE },
        { key: 'name', label: 'نام', type: FieldType.TEXT },
      ],
      [
        {
          image_url: 'https://example.com/storage/v1/object/public/images/products/1/photo.jpg',
          name: 'محصول نمونه',
        },
      ],
      {},
      '',
      'actual',
    );

    expect(fitHtml).toContain('object-fit:contain');
    expect(actualHtml).toContain('object-fit:none');
  });
});
