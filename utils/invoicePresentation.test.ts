import { describe, expect, it } from 'vitest';
import { buildBillboardInvoiceItemTitle, buildInvoiceItemDescriptionForTaxpayer } from './invoicePresentation';

describe('invoice presentation', () => {
  it('builds a billboard invoice title from its full address', () => {
    expect(buildBillboardInvoiceItemTitle({ category: 'بیلبورد', address: 'تهران، بزرگراه همت، روبه‌روی پارک' })).toBe(
      'اجاره تابلوی تبلیغاتی بیلبورد تهران، بزرگراه همت، روبه‌روی پارک'
    );
  });

  it('falls back to city and short address for a billboard title', () => {
    expect(buildBillboardInvoiceItemTitle({ category: 'عرشه پل', city_name: 'کرج', name: 'میدان آزادگان' })).toBe(
      'اجاره تابلوی تبلیغاتی عرشه پل کرج میدان آزادگان'
    );
  });

  it('keeps optional taxpayer item details separate from the product title', () => {
    expect(buildInvoiceItemDescriptionForTaxpayer({ description: 'چاپ و نصب', delivery_time: 'سه روز کاری' })).toBe(
      'توضیحات: چاپ و نصب | زمان تحویل: سه روز کاری'
    );
  });
});
