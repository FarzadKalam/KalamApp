import {
  ModuleDefinition,
  ModuleNature,
  ViewMode,
  FieldType,
  FieldLocation,
  BlockType,
  FieldNature,
  RowCalculationType,
  SummaryCalculationType,
} from '../types';
import { HARD_CODED_UNIT_OPTIONS } from '../utils/unitConversions';

const BLOCKS = {
  baseInfo: {
    id: 'baseInfo',
    titles: { fa: 'اطلاعات فاکتور', en: 'Invoice Info' },
    icon: 'FileTextOutlined',
    order: 1,
    type: BlockType.FIELD_GROUP,
  },

  invoiceItems: {
    id: 'invoiceItems',
    titles: { fa: 'اقلام فاکتور', en: 'Invoice Items' },
    icon: 'ShoppingOutlined',
    order: 2,
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.INVOICE_ROW,
    tableColumns: [
      {
        key: 'product_id',
        title: 'نام محصول',
        type: FieldType.RELATION,
        width: 250,
        relationConfig: { targetModule: 'products', targetField: 'name' },
      },
      {
        key: 'source_shelf_id',
        title: 'قفسه برداشت',
        type: FieldType.RELATION,
        width: 180,
        relationConfig: { targetModule: 'shelves', targetField: 'name' },
      },
      { key: 'quantity', title: 'تعداد', type: FieldType.NUMBER, width: 100 },
      {
        key: 'main_unit',
        title: 'واحد اصلی',
        type: FieldType.SELECT,
        width: 110,
        options: HARD_CODED_UNIT_OPTIONS as any,
        readonly: true,
      },
      {
        key: 'sub_unit',
        title: 'واحد فرعی',
        type: FieldType.SELECT,
        width: 110,
        options: HARD_CODED_UNIT_OPTIONS as any,
        readonly: true,
      },
      {
        key: 'sub_quantity',
        title: 'مقدار واحد فرعی',
        type: FieldType.NUMBER,
        width: 130,
        readonly: true,
      },
      { key: 'unit_price', title: 'قیمت واحد (تومان)', type: FieldType.PRICE, width: 150 },
      { key: 'discount', title: 'تخفیف (تومان/٪)', type: FieldType.PERCENTAGE_OR_AMOUNT, width: 130, showTotal: true },
      { key: 'vat', title: 'ارزش افزوده (تومان/٪)', type: FieldType.PERCENTAGE_OR_AMOUNT, width: 130, showTotal: true },
      { key: 'total_price', title: 'جمع کل (تومان)', type: FieldType.PRICE, width: 160, showTotal: true },
    ],
  },

  payments: {
    id: 'payments',
    titles: { fa: 'جدول دریافت‌ها', en: 'Payments' },
    icon: 'CreditCardOutlined',
    order: 3,
    type: BlockType.TABLE,
    rowCalculationType: RowCalculationType.SIMPLE_MULTIPLY,
    tableColumns: [
      {
        key: 'payment_type',
        title: 'نوع دریافت',
        type: FieldType.SELECT,
        width: 140,
        options: [
          { label: 'نقد', value: 'cash' },
          { label: 'کارت به کارت', value: 'card' },
          { label: 'انتقال حساب', value: 'transfer' },
          { label: 'چک', value: 'cheque' },
          { label: 'آنلاین', value: 'online' },
        ],
      },
      {
        key: 'status',
        title: 'وضعیت',
        type: FieldType.SELECT,
        width: 120,
        options: [
          { label: 'در انتظار', value: 'pending', color: 'orange' },
          { label: 'دریافت شده', value: 'received', color: 'green' },
          { label: 'عودت', value: 'returned', color: 'red' },
        ],
      },
      { key: 'target_account', title: 'حساب مقصد', type: FieldType.SELECT, width: 140, dynamicOptionsCategory: 'target_account' },
      {
        key: 'responsible_id',
        title: 'مسئول دریافت',
        type: FieldType.RELATION,
        width: 150,
        relationConfig: { targetModule: 'profiles', targetField: 'full_name' },
      },
      { key: 'date', title: 'تاریخ', type: FieldType.DATE, width: 120 },
      { key: 'amount', title: 'مبلغ', type: FieldType.PRICE, width: 150, showTotal: true },
    ],
  },

  summary: {
    id: 'summary',
    titles: { fa: 'خلاصه وضعیت مالی', en: 'Financial Summary' },
    icon: 'CalculatorOutlined',
    order: 4,
    type: BlockType.FIELD_GROUP,
    summaryConfig: {
      calculationType: SummaryCalculationType.INVOICE_FINANCIALS,
      fieldMapping: {
        total: 'total_invoice_amount',
        received: 'total_received_amount',
        remaining: 'remaining_balance',
      },
    },
  },
};

export const invoicesConfig: ModuleDefinition = {
  id: 'invoices',
  titles: { fa: 'فاکتورهای فروش', en: 'Sales Invoices' },
  nature: ModuleNature.INVOICE,
  table: 'invoices',
  supportedViewModes: [ViewMode.LIST, ViewMode.GRID],
  defaultViewMode: ViewMode.LIST,

  fields: [
    { key: 'name', labels: { fa: 'عنوان فاکتور', en: 'Title' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 1, validation: { required: true }, nature: FieldNature.PREDEFINED, isTableColumn: true },
    { key: 'invoice_date', labels: { fa: 'تاریخ', en: 'Date' }, type: FieldType.DATE, location: FieldLocation.HEADER, order: 2, validation: { required: true }, nature: FieldNature.PREDEFINED },
    { key: 'system_code', labels: { fa: 'کد سیستمی', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    {
      key: 'status',
      labels: { fa: 'وضعیت', en: 'Status' },
      type: FieldType.STATUS,
      location: FieldLocation.HEADER,
      order: 4,
      options: [
        { label: 'ایجاد شده', value: 'created', color: 'blue' },
        { label: 'پیش فاکتور', value: 'proforma', color: 'orange' },
        { label: 'فاکتور نهایی', value: 'final', color: 'green' },
        { label: 'تسویه شده', value: 'settled', color: 'purple' },
        { label: 'تکمیل شده', value: 'completed', color: 'gray' },
      ],
    },

    {
      key: 'customer_id',
      labels: { fa: 'نام مشتری', en: 'Customer' },
      type: FieldType.RELATION,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 1,
      relationConfig: { targetModule: 'customers', targetField: 'last_name' },
      validation: { required: true },
      nature: FieldNature.STANDARD,
    },
    {
      key: 'sale_source',
      labels: { fa: 'منبع فروش', en: 'Source' },
      type: FieldType.SELECT,
      location: FieldLocation.BLOCK,
      blockId: 'baseInfo',
      order: 2,
      options: [
        { label: 'حضوری', value: 'in_person' },
        { label: 'تلفنی', value: 'phone' },
        { label: 'سایت', value: 'website' },
        { label: 'سوشال', value: 'social' },
      ],
      nature: FieldNature.STANDARD,
    },

    { key: 'total_invoice_amount', labels: { fa: 'مبلغ کل فاکتور', en: 'Total Amount' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'summary', order: 1, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'total_received_amount', labels: { fa: 'مبلغ دریافت شده', en: 'Received Amount' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'summary', order: 2, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
    { key: 'remaining_balance', labels: { fa: 'مانده حساب', en: 'Remaining Balance' }, type: FieldType.PRICE, location: FieldLocation.BLOCK, blockId: 'summary', order: 3, readonly: true, nature: FieldNature.SYSTEM, isTableColumn: true },
  ],

  blocks: [
    BLOCKS.baseInfo,
    BLOCKS.invoiceItems,
    BLOCKS.payments,
    BLOCKS.summary,
  ],
  relatedTabs: [],
};
