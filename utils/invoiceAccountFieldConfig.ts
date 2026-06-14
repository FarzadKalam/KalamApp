export const INVOICE_FINANCIAL_ACCOUNT_SOURCE_MODULES = [
  { targetModule: 'bank_accounts', targetField: 'bank_name', filter: { is_active: true }, tagLabel: 'بانک', tagColor: 'cyan' },
  { targetModule: 'cash_boxes', targetField: 'name', filter: { is_active: true }, tagLabel: 'صندوق', tagColor: 'gold' },
  { targetModule: 'petty_funds', targetField: 'name', filter: { is_active: true }, tagLabel: 'تنخواه', tagColor: 'magenta' },
];

export const INVOICE_PAYMENT_ACCOUNT_RELATION_CONFIG = {
  targetModule: 'bank_accounts',
  targetField: 'bank_name',
  filter: { is_active: true },
  sourceModules: INVOICE_FINANCIAL_ACCOUNT_SOURCE_MODULES,
};

export const INVOICE_SETTLEMENT_BANK_RELATION_CONFIG = {
  targetModule: 'bank_accounts',
  targetField: 'bank_name',
  filter: { is_active: true },
};
