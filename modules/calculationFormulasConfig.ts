import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType, FieldNature } from '../types';

export const calculationFormulasModule: ModuleDefinition = {
  id: 'calculation_formulas',
  titles: { fa: 'فرمول‌های محاسباتی', en: 'Calculation Formulas' },
  nature: ModuleNature.STANDARD,
  table: 'calculation_formulas',
  supportedViewModes: [ViewMode.LIST],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'name', labels: { fa: 'نام فرمول', en: 'Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, isKey: true, validation: { required: true }, nature: FieldNature.STANDARD, isTableColumn: true },
    { key: 'formula', labels: { fa: 'فرمول', en: 'Formula' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'base', order: 2, validation: { required: true }, nature: FieldNature.STANDARD },
    { key: 'description', labels: { fa: 'توضیحات', en: 'Description' }, type: FieldType.LONG_TEXT, location: FieldLocation.BLOCK, blockId: 'base', order: 3, nature: FieldNature.STANDARD },
  ],
  blocks: [
    { id: 'base', titles: { fa: 'اطلاعات فرمول', en: 'Formula Info' }, type: BlockType.FIELD_GROUP, order: 1 },
  ],
  relatedTabs: [],
};