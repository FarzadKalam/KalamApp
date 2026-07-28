import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { InvoiceCard } from './invoice-card';

describe('InvoiceCard', () => {
  it('keeps every long item row in the print markup', () => {
    const invoiceItems = Array.from({ length: 8 }, (_value, index) => ({
      product_name: `قلم چندخطی شماره ${index + 1} با توضیح کامل برای بررسی شکست خط`,
      quantity: 1,
      unit_price: 1000,
      total_price: 1000,
    }));
    const html = renderToStaticMarkup(
      <InvoiceCard
        data={{
          name: 'فاکتور آزمایشی',
          invoiceItems,
          total_invoice_amount: 8000,
          company_settings: { currency_label: 'ریال' },
        }}
        formatPersianPrice={(value) => String(value)}
        toPersianNumber={(value) => value}
        safeJalaliFormat={(value) => String(value)}
      />
    );

    expect(html).toContain('min-height:210mm');
    expect(html).not.toContain('overflow:hidden');
    invoiceItems.forEach((item) => expect(html).toContain(item.product_name));
  });

  it.each(['invoice_sales_official', 'invoice_sales_simple'] as const)(
    'shows multiline invoice description in the %s template',
    (templateId) => {
      const description = 'توضیح خط اول فاکتور\nتوضیح خط دوم فاکتور';
      const html = renderToStaticMarkup(
        <InvoiceCard
          data={{
            name: 'فاکتور آزمایشی',
            description,
            invoiceItems: [],
            total_invoice_amount: 0,
          }}
          formatPersianPrice={(value) => String(value)}
          toPersianNumber={(value) => value}
          safeJalaliFormat={(value) => String(value)}
          templateId={templateId}
        />
      );

      expect(html).toContain('توضیحات فاکتور');
      expect(html).toContain(description);
      expect(html).toContain('white-space:pre-wrap');
    }
  );

  it.each(['invoice_sales_official', 'invoice_sales_simple'] as const)(
    'uses the company full name and logo in %s',
    (templateId) => {
      const html = renderToStaticMarkup(
        <InvoiceCard
          data={{ name: 'فاکتور آزمایشی', invoiceItems: [], total_invoice_amount: 0 }}
          seller={{
            company_full_name: 'شرکت نمونهٔ فروش',
            logo_url: 'https://cdn.example.com/company-logo.png',
          }}
          formatPersianPrice={(value) => String(value)}
          toPersianNumber={(value) => value}
          safeJalaliFormat={(value) => String(value)}
          templateId={templateId}
        />
      );

      expect(html).toContain('شرکت نمونهٔ فروش');
      expect(html).toContain('https://cdn.example.com/company-logo.png');
      expect(html).toContain('alt="لوگوی فروشنده"');
    }
  );
});
