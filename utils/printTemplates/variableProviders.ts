import type { PrintTemplateVariableOption } from './store';

type PrintVariableProvider = () => PrintTemplateVariableOption[];

const recordField = (label: string, value: string): PrintTemplateVariableOption => ({
  label,
  value,
  kind: 'field',
  group: 'فیلدهای رکورد',
});

const counterpartyField = (label: string, value: string): PrintTemplateVariableOption => ({
  label,
  value,
  kind: 'field',
  group: 'طرف حساب',
});

const buildInvoiceComputedVariables = (
  relationKey: 'customer' | 'supplier',
  relationTitle: 'مشتری' | 'تامین‌کننده',
  paidLabel: string,
  balanceLabel: string,
): PrintTemplateVariableOption[] => [
  recordField('تاریخ فاکتور', 'record.invoice_date'),
  recordField('وضعیت فاکتور', 'record.status'),
  recordField('جمع کل فاکتور', 'record.total_invoice_amount'),
  ...(relationKey === 'customer'
    ? [recordField('جمع کل به حروف', 'record.total_invoice_amount_words')]
    : []),
  recordField(paidLabel, 'record.total_received_amount'),
  recordField(balanceLabel, 'record.remaining_balance'),
  counterpartyField(`نام ${relationTitle}`, `${relationKey}.full_name`),
  counterpartyField(`پیشوند ${relationTitle}`, `${relationKey}.prefix`),
  counterpartyField(
    relationKey === 'customer' ? 'نام کوچک مشتری' : 'نام رابط تامین‌کننده',
    `${relationKey}.first_name`,
  ),
  counterpartyField(
    relationKey === 'customer' ? 'نام خانوادگی مشتری' : 'نام خانوادگی رابط تامین‌کننده',
    `${relationKey}.last_name`,
  ),
  counterpartyField(`نام کسب و کار ${relationTitle}`, `${relationKey}.business_name`),
  ...(relationKey === 'customer'
    ? [counterpartyField('نوع شخص مشتری', 'customer.person_type')]
    : []),
  counterpartyField(`کد ملی ${relationTitle}`, `${relationKey}.national_code`),
  counterpartyField(`شناسه ملی ${relationTitle}`, `${relationKey}.national_id`),
  counterpartyField(`شناسه ملی / کد ملی ${relationTitle}`, `${relationKey}.national_identifier`),
  counterpartyField(`شماره ثبت ${relationTitle}`, `${relationKey}.registration_number`),
  counterpartyField(`کد اقتصادی ${relationTitle}`, `${relationKey}.economic_code`),
  counterpartyField(`کد پستی ${relationTitle}`, `${relationKey}.postal_code`),
  counterpartyField(`استان ${relationTitle}`, `${relationKey}.province`),
  counterpartyField(`شهر ${relationTitle}`, `${relationKey}.city`),
  counterpartyField(`تلفن ${relationTitle}`, `${relationKey}.mobile_1`),
  counterpartyField(`آدرس ${relationTitle}`, `${relationKey}.address`),
];

const PROVIDERS: Record<string, PrintVariableProvider> = {
  invoices: () => buildInvoiceComputedVariables(
    'customer',
    'مشتری',
    'جمع دریافت‌شده',
    'مانده فاکتور',
  ),
  purchase_invoices: () => buildInvoiceComputedVariables(
    'supplier',
    'تامین‌کننده',
    'جمع پرداخت‌شده',
    'مانده بدهی',
  ),
  product_bundles: () => [
    recordField('جمع قبل از تخفیف پکیج', 'record.package_gross_total'),
    recordField('جمع تخفیف پکیج', 'record.package_discount_total'),
    recordField('مبلغ نهایی پکیج', 'record.package_final_total'),
    {
      label: 'جدول خلاصه پکیج',
      value: 'system.package_summary_table',
      kind: 'field',
      group: 'سیستم',
    },
  ],
};

export const getPrintVariableProviderOptions = (moduleId: string): PrintTemplateVariableOption[] => (
  PROVIDERS[String(moduleId || '').trim()]?.() || []
);
