import { ModuleDefinition, ModuleNature, ViewMode, FieldType, FieldLocation, BlockType } from '../types';

export const customerModule: ModuleDefinition = {
  id: 'customers',
  titles: { fa: 'Ù…Ø¯ÛŒØ±ÛŒØª Ù…Ø´ØªØ±ÛŒØ§Ù†', en: 'Customers' },
  nature: ModuleNature.CRM,
  supportedViewModes: [ViewMode.LIST, ViewMode.KANBAN],
  defaultViewMode: ViewMode.LIST,
  fields: [
    { key: 'image_url', labels: { fa: 'ØªØµÙˆÛŒØ±', en: 'Image' }, type: FieldType.IMAGE, location: FieldLocation.HEADER, order: 1 },
    { key: 'first_name', labels: { fa: 'Ù†Ø§Ù…', en: 'First Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 2, validation: { required: true }, isTableColumn: true },
    { key: 'last_name', labels: { fa: 'Ù†Ø§Ù… Ø®Ø§Ù†ÙˆØ§Ø¯Ú¯ÛŒ', en: 'Last Name' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 3, validation: { required: true }, isTableColumn: true, isKey: true },
    { key: 'system_code', labels: { fa: 'Ú©Ø¯ Ø§Ø´ØªØ±Ø§Ú©', en: 'Code' }, type: FieldType.TEXT, location: FieldLocation.HEADER, order: 4, isTableColumn: true },
    {
      key: 'rank', labels: { fa: 'Ø³Ø·Ø­ Ù…Ø´ØªØ±ÛŒ', en: 'Rank' }, type: FieldType.STATUS, location: FieldLocation.HEADER, order: 5,
      options: [
        { label: 'Ø¹Ø§Ø¯ÛŒ', value: 'normal', color: 'blue' },
        { label: 'Ù†Ù‚Ø±Ù‡â€ŒØ§ÛŒ', value: 'silver', color: 'gray' },
        { label: 'Ø·Ù„Ø§ÛŒÛŒ', value: 'gold', color: 'gold' },
        { label: 'VIP', value: 'vip', color: 'purple' }
      ], defaultValue: 'normal', isTableColumn: true
    },
    { key: 'mobile_1', labels: { fa: 'Ù…ÙˆØ¨Ø§ÛŒÙ„ Ø§ØµÙ„ÛŒ', en: 'Mobile' }, type: FieldType.PHONE, location: FieldLocation.HEADER, order: 6, isTableColumn: true },

    { key: 'prefix', labels: { fa: 'Ù¾ÛŒØ´ÙˆÙ†Ø¯', en: 'Prefix' }, type: FieldType.SELECT, blockId: 'basic_info', options: [{ label: 'Ø¢Ù‚Ø§ÛŒ', value: 'Ø¢Ù‚Ø§ÛŒ' }, { label: 'Ø®Ø§Ù†Ù…', value: 'Ø®Ø§Ù†Ù…' }, { label: 'Ø¯Ú©ØªØ±', value: 'Ø¯Ú©ØªØ±' }, { label: 'Ù…Ù‡Ù†Ø¯Ø³', value: 'Ù…Ù‡Ù†Ø¯Ø³' }] },
    { key: 'business_name', labels: { fa: 'Ù†Ø§Ù… Ú©Ø³Ø¨ Ùˆ Ú©Ø§Ø±', en: 'Business' }, type: FieldType.TEXT, blockId: 'basic_info' },
    { key: 'birth_date', labels: { fa: 'ØªØ§Ø±ÛŒØ® ØªÙˆÙ„Ø¯', en: 'Birthday' }, type: FieldType.DATE, blockId: 'basic_info' },
    {
      key: 'lead_source', labels: { fa: 'Ù†Ø­ÙˆÙ‡ Ø¢Ø´Ù†Ø§ÛŒÛŒ', en: 'Source' }, type: FieldType.SELECT, blockId: 'basic_info',
      options: [
        { label: 'ÙØ±ÙˆØ´Ú¯Ø§Ù‡ Ø­Ø¶ÙˆØ±ÛŒ', value: 'store' },
        { label: 'ÙˆØ¨â€ŒØ³Ø§ÛŒØª', value: 'website' },
        { label: 'Ø§ÛŒÙ†Ø³ØªØ§Ú¯Ø±Ø§Ù…', value: 'instagram' },
        { label: 'Ø¨Ø§Ø²Ø§Ø±ÛŒØ§Ø¨ÛŒ ØªÙ„ÙÙ†ÛŒ', value: 'marketing' },
        { label: 'Ù…Ø¹Ø±ÙÛŒ Ù…Ø´ØªØ±ÛŒØ§Ù†', value: 'referral' },
        { label: 'Ø§Ø³Ú©Ù† Ø¨Ø§Ø±Ú©Ø¯', value: 'scan'}
      ]
    },

    { key: 'mobile_2', labels: { fa: 'Ù…ÙˆØ¨Ø§ÛŒÙ„ Ø¯ÙˆÙ…', en: 'Mobile 2' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'phone', labels: { fa: 'ØªÙ„ÙÙ† Ø«Ø§Ø¨Øª', en: 'Phone' }, type: FieldType.PHONE, blockId: 'contact_info' },
    { key: 'province', labels: { fa: 'Ø§Ø³ØªØ§Ù†', en: 'Province' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'provinces' },
    { key: 'city', labels: { fa: 'Ø´Ù‡Ø±', en: 'City' }, type: FieldType.SELECT, blockId: 'contact_info', dynamicOptionsCategory: 'cities' },
    { key: 'address', labels: { fa: 'Ø¢Ø¯Ø±Ø³ Ù¾Ø³ØªÛŒ', en: 'Address' }, type: FieldType.LONG_TEXT, blockId: 'contact_info' },
    { key: 'notes', labels: { fa: 'ØªÙˆØ¶ÛŒØ­Ø§Øª', en: 'Notes' }, type: FieldType.LONG_TEXT, blockId: 'contact_info', isTableColumn: true },
    { key: 'location', labels: { fa: 'Ù„ÙˆÚ©ÛŒØ´Ù†', en: 'Location' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'instagram_id', labels: { fa: 'Ø¢ÛŒØ¯ÛŒ Ø§ÛŒÙ†Ø³ØªØ§Ú¯Ø±Ø§Ù…', en: 'Instagram' }, type: FieldType.TEXT, blockId: 'contact_info' },
    { key: 'telegram_id', labels: { fa: 'Ø¢ÛŒØ¯ÛŒ ØªÙ„Ú¯Ø±Ø§Ù…', en: 'Telegram' }, type: FieldType.TEXT, blockId: 'contact_info' },

    { key: 'first_purchase_date', labels: { fa: 'ØªØ§Ø±ÛŒØ® Ø§ÙˆÙ„ÛŒÙ† Ø®Ø±ÛŒØ¯', en: 'First Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'last_purchase_date', labels: { fa: 'ØªØ§Ø±ÛŒØ® Ø¢Ø®Ø±ÛŒÙ† Ø®Ø±ÛŒØ¯', en: 'Last Purchase' }, type: FieldType.DATE, blockId: 'financial_stats', readonly: true },
    { key: 'purchase_count', labels: { fa: 'ØªØ¹Ø¯Ø§Ø¯ Ø¯ÙØ¹Ø§Øª Ø®Ø±ÛŒØ¯', en: 'Count' }, type: FieldType.NUMBER, blockId: 'financial_stats', readonly: true },
    { key: 'total_spend', labels: { fa: 'جمع کل خرید (تومان)', en: 'Total Spend' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
    { key: 'total_paid_amount', labels: { fa: 'جمع کل پرداختی (تومان)', en: 'Total Paid Amount' }, type: FieldType.PRICE, blockId: 'financial_stats', readonly: true },
  ],
  blocks: [
    {
      id: 'basic_info', titles: { fa: 'Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ù¾Ø§ÛŒÙ‡', en: 'Basic Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'contact_info', titles: { fa: 'Ø§Ø·Ù„Ø§Ø¹Ø§Øª ØªÙ…Ø§Ø³', en: 'Contact Info' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
    {
      id: 'financial_stats', titles: { fa: 'Ø¢Ù…Ø§Ø± Ù…Ø§Ù„ÛŒ Ùˆ Ø³ÙˆØ§Ø¨Ù‚', en: 'Financial Stats' }, type: BlockType.FIELD_GROUP,
      order: 0
    },
  ],
  relatedTabs: [
    {
      id: 'customer_invoices',
      title: 'ÙØ§Ú©ØªÙˆØ±Ù‡Ø§ÛŒ Ù…Ø´ØªØ±ÛŒ',
      icon: 'FileTextOutlined',
      relationType: 'fk',
      targetModule: 'invoices',
      foreignKey: 'customer_id'
    },
    {
      id: 'customer_payments',
      title: 'Ù¾Ø±Ø¯Ø§Ø®ØªÛŒâ€ŒÙ‡Ø§ÛŒ Ù…Ø´ØªØ±ÛŒ',
      icon: 'CreditCardOutlined',
      relationType: 'customer_payments'
    },
    {
      id: 'customer_products',
      title: 'Ù…Ø­ØµÙˆÙ„Ø§Øª Ø®Ø±ÛŒØ¯Ø§Ø±ÛŒ Ø´Ø¯Ù‡',
      icon: 'ShoppingOutlined',
      relationType: 'customer_products',
      targetModule: 'products'
    }
  ],
  table: 'customers'
};


