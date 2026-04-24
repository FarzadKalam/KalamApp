const normalizeText = (value: any) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_\-\\/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const PAYMENT_TYPE_ALIASES: Record<string, string> = {
  cash: 'cash',
  'نقد': 'cash',
  bank: 'bank',
  'بانک': 'bank',
  card: 'card',
  'کارت به کارت': 'card',
  'کارت_به_کارت': 'card',
  'cart': 'card',
  pos: 'pos',
  'پوز': 'pos',
  'کارتخوان': 'pos',
  'کارت خوان': 'pos',
  'card reader': 'pos',
  'cardreader': 'pos',
  'card machine': 'pos',
  'cardmachine': 'pos',
  transfer: 'transfer',
  'انتقال': 'transfer',
  'انتقال شبا': 'transfer',
  'shaba': 'transfer',
  cheque: 'cheque',
  check: 'cheque',
  'چک': 'cheque',
  online: 'online',
  'آنلاین': 'online',
  barter: 'barter',
  'تهاتر': 'barter',
  credit: 'credit',
  'اعتباری': 'credit',
  'اعتباري': 'credit',
};

export const normalizeCashBankPaymentType = (value: any): string | null => {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (PAYMENT_TYPE_ALIASES[normalized]) return PAYMENT_TYPE_ALIASES[normalized];
  if (normalized.includes('pos') || normalized.includes('پوز') || (normalized.includes('کارت') && normalized.includes('خوان'))) return 'pos';
  if (normalized.includes('cheq') || normalized.includes('check') || normalized.includes('چک')) return 'cheque';
  if (normalized.includes('transfer') || normalized.includes('انتقال') || normalized.includes('شبا')) return 'transfer';
  if (normalized.includes('barter') || normalized.includes('تهاتر')) return 'barter';
  if (normalized.includes('online') || normalized.includes('آنلاین')) return 'online';
  if (normalized.includes('credit') || normalized.includes('اعتباری') || normalized.includes('اعتباري') || normalized.includes('نسیه') || normalized.includes('نسيه')) return 'credit';
  if (normalized.includes('card') || normalized.includes('کارت')) return 'card';
  if (normalized.includes('bank') || normalized.includes('بانک')) return 'bank';
  if (normalized.includes('cash') || normalized.includes('نقد')) return 'cash';
  return null;
};

export const resolveOperationalCashBankPaymentType = (row: any): string | null => {
  const rawTypeCandidate =
    row?.payment_type
    ?? row?.payment_method
    ?? row?.method
    ?? row?.receipt_type
    ?? row?.transaction_type
    ?? row?.type;
  const normalized = normalizeCashBankPaymentType(rawTypeCandidate);
  if (normalized) return normalized;
  if (row?.cheque_id || row?.spent_cheque_id || row?.cheque_status || row?.cheque_serial_no || row?.use_existing_received_cheque) {
    return 'cheque';
  }
  if (row?.barter_id || row?._barter_allocation_key) {
    return 'barter';
  }
  return null;
};
