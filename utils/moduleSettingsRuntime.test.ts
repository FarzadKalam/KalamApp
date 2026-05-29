import { describe, expect, it } from 'vitest';
import { BlockType, FieldLocation, FieldNature, FieldType } from '../types';
import { mergeModuleSchemaWithBase } from './moduleSettingsRuntime';

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
