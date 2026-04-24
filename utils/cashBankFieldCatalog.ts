export const CASH_BANK_PAYMENT_TYPE_OPTIONS = [
  { label: 'نقد', value: 'cash' },
  { label: 'بانک', value: 'bank' },
  { label: 'کارت به کارت', value: 'card' },
  { label: 'کارتخوان', value: 'pos' },
  { label: 'انتقال شبا', value: 'transfer' },
  { label: 'چک', value: 'cheque' },
  { label: 'آنلاین', value: 'online' },
  { label: 'تهاتر', value: 'barter' },
  { label: 'اعتباری', value: 'credit' },
] as const;

export const CASH_BANK_OPERATION_STATUS_OPTIONS = [
  { label: 'در انتظار', value: 'pending', color: 'orange' },
  { label: 'انجام شده', value: 'received', color: 'green' },
  { label: 'برگشت', value: 'returned', color: 'red' },
  { label: 'لغو شده', value: 'canceled', color: 'default' },
] as const;

export const CASH_BANK_RESPONSIBLE_LABEL_FA = 'مسئول دریافت/پرداخت';
