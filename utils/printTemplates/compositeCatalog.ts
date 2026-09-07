import { FieldType } from '../../types';
import type { ListFieldDefinition } from '../listPrintExport';
import { getSafePrintText } from './safePrintValue';

export const COMPOSITE_CATALOG_MODULE_IDS = new Set(['price_lists', 'product_bundles']);

export const isCompositeCatalogModule = (moduleId: string): boolean =>
  COMPOSITE_CATALOG_MODULE_IDS.has(String(moduleId || '').trim());

export const getCompositeCatalogSourceRows = (moduleId: string, record: any): any[] => {
  const rows = moduleId === 'price_lists'
    ? record?.items
    : moduleId === 'product_bundles'
      ? record?.products
      : [];
  return Array.isArray(rows) ? rows : [];
};

export const getCompositeCatalogReferenceIds = (moduleId: string, record: any): string[] => {
  const seen = new Set<string>();
  const ids: string[] = [];
  getCompositeCatalogSourceRows(moduleId, record).forEach((row) => {
    const id = String(row?.product_id || row?.selected_product_id || '').trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  });
  return ids;
};

export const buildCompositeCatalogRows = ({
  moduleId,
  record,
  referencesById,
}: {
  moduleId: string;
  record: any;
  referencesById: Record<string, any>;
}): Array<Record<string, any>> =>
  getCompositeCatalogSourceRows(moduleId, record).map((row, sourceIndex) => {
    const referenceId = String(row?.product_id || row?.selected_product_id || '').trim();
    const reference = referencesById[referenceId] || {};
    const name = getSafePrintText(
      reference?.address ||
      reference?.name ||
      row?.product_name ||
      row?.selected_product_name ||
      row?.name,
      'بدون عنوان',
    );

    return {
      ...reference,
      ...row,
      name,
      image_url: row?.image_url || reference?.image_url || '',
      main_unit: row?.main_unit || row?.unit_name || reference?.main_unit || '',
      catalog_link: row?.catalog_link || reference?.catalog_link || '',
      __print_source_index: sourceIndex,
    };
  });

export const buildCompositeCatalogFields = (moduleId: string): ListFieldDefinition[] => {
  const common: ListFieldDefinition[] = [
    { key: 'image_url', label: 'تصویر', type: FieldType.IMAGE },
    { key: 'name', label: 'کالا / خدمت', type: FieldType.TEXT },
  ];

  if (moduleId === 'price_lists') {
    return [
      ...common,
      { key: 'price', label: 'مبلغ نهایی', type: FieldType.PRICE },
      { key: 'currency_label', label: 'واحد پول', type: FieldType.TEXT },
      { key: 'unit_name', label: 'واحد', type: FieldType.TEXT },
      { key: 'description', label: 'توضیحات', type: FieldType.LONG_TEXT },
    ];
  }

  return [
    ...common,
    { key: 'quantity', label: 'تعداد / مقدار', type: FieldType.NUMBER },
    { key: 'main_unit', label: 'واحد', type: FieldType.TEXT },
    { key: 'unit_price', label: 'قیمت واحد', type: FieldType.PRICE },
    { key: 'discount', label: 'تخفیف پکیج', type: FieldType.PERCENTAGE_OR_AMOUNT },
    { key: 'total_price', label: 'مبلغ نهایی', type: FieldType.PRICE },
    { key: 'description', label: 'توضیحات', type: FieldType.LONG_TEXT },
  ];
};
